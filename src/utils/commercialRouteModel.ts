/**
 * Commercial Route Model builder.
 *
 * Transforms a CommercialScenarioViewModel (business narrative data) and a
 * CommercialRouteGeometryInputs (geographic data not stored in the viewModel)
 * into a CommercialRouteModel — the canonical single source of truth for
 * Globe rendering, Journey Strip focus dispatch, and Inspector tab identity.
 *
 * This module is intentionally:
 *   - Pure: no React, no hooks, no Cesium types, no side effects.
 *   - Non-throwing: missing data produces fewer nodes/edges rather than errors.
 *   - Non-duplicating: business logic is reused from the viewModel, not re-derived.
 *
 * Phase C3B — builder only. The model is built in App.tsx but not yet consumed
 * by any rendering component (Globe / Strip / Inspector).
 */

import type {
  CommercialRouteModel,
  CommercialRouteNode,
  CommercialRouteEdge,
  CommercialRouteFocusTarget,
  CommercialRouteNodeType,
  CommercialRouteEdgeType,
  CommercialRouteStatus,
  CommercialRouteTechnology,
  CommercialRouteSegmentId,
  RouteCoordinate,
  CommercialRouteNodeMeta,
  CommercialRouteEdgeMeta,
} from '../types/commercialRouteModel';
import type {
  CommercialScenarioViewModel,
  CommercialRouteSegment,
  CommercialRouteSegmentStatus,
} from '../components/commercial/commercialTypes';
import type { ActiveLeoRouteEvidence } from './activeLeoRouteEvidence';
import type { GeoRouteAnalysisViewModel } from './geoRouteAnalysisViewModel';
import type { ResolvedGeoGateway } from './geoConnectivityModel';
import type { SatelliteData } from '../types/satellites';
import { SNPS_DATA } from '../components/globe/GlobeConfig';
import { getTrafficTeleportCapabilityForLegacyGateway } from './geoGroundInfrastructure';

// ─── Geometry inputs ──────────────────────────────────────────────────────────

/**
 * The geographic data required to build a CommercialRouteModel that the
 * CommercialScenarioViewModel does not carry (it stores names, not coordinates).
 *
 * All fields are optional / nullable. The builder degrades gracefully when any
 * field is absent — nodes with missing positions receive `position: null` rather
 * than being omitted from the model.
 */
export interface CommercialRouteGeometryInputs {
  /** Origin site coordinates (App.tsx: activeAnalysisPoint). */
  activeAnalysisPoint: { lat: number; lng: number } | null;
  /** Destination site coordinates (App.tsx: siteB). Point-to-point only. */
  siteB: { lat: number; lng: number } | null;
  /**
   * Resolved GEO gateway for the auto-selected GEO satellite.
   * Lifted to App.tsx in COMM-6C3A.
   */
  resolvedAutoGeoGateway: ResolvedGeoGateway | null;
  /**
   * Resolved GEO gateway for the manually selected EUTELSAT satellite.
   * Takes priority over resolvedAutoGeoGateway when present.
   */
  resolvedSelectedGeoGateway: ResolvedGeoGateway | null;
  /**
   * Full LEO route evidence — provides serving satellites, selected SNPs,
   * PoP, and topology mode.
   */
  activeLeoRouteEvidence: ActiveLeoRouteEvidence | null;
  /**
   * GEO route analysis — provides the selected GEO satellite and coverage.
   * Used as the primary source for the GEO SKY_BRIDGE satellite identity;
   * falls back to activeGeoSatellite when absent.
   */
  geoRouteAnalysis: GeoRouteAnalysisViewModel | null;
  /** The auto-selected GEO satellite — fallback when geoRouteAnalysis is null. */
  activeGeoSatellite: SatelliteData | null;
}

// ─── Internal topology enum ───────────────────────────────────────────────────

/**
 * Internal four-way topology classification used to branch node/edge/focus
 * construction. Derived from the viewModel and geometry inputs; never
 * exposed in the output model (which is topology-agnostic by design).
 */
type RouteTopology =
  | 'GEO_STAR'   // GEO internet access — single site, SNP as destination
  | 'GEO_P2P'    // GEO point-to-point — two customer sites via satellite
  | 'LEO_SINGLE' // LEO internet access — single site, SNP as destination
  | 'LEO_S2S';   // LEO site-to-site — two customer sites, two satellites

// ─── Status mapping helpers ───────────────────────────────────────────────────

/**
 * Map CommercialRouteSegmentStatus (from existing viewModel types) to the
 * canonical CommercialRouteStatus used in the route model.
 *
 * healthy  → active   (service running normally)
 * warning  → limited  (service running with constraint)
 * blocked  → blocked  (no service)
 * unknown  → pending  (analysis in progress)
 */
function segToRouteStatus(status: CommercialRouteSegmentStatus): CommercialRouteStatus {
  if (status === 'healthy') return 'active';
  if (status === 'warning') return 'limited';
  if (status === 'blocked') return 'blocked';
  return 'pending';
}

/**
 * Map the viewModel's aggregate CommercialStatus to CommercialRouteStatus.
 * The viewModel uses 'degraded' instead of 'warning' at the top level.
 */
function vmToRouteStatus(status: CommercialScenarioViewModel['serviceStatus']): CommercialRouteStatus {
  if (status === 'active')   return 'active';
  if (status === 'degraded') return 'limited';
  if (status === 'blocked')  return 'blocked';
  return 'pending';
}

// ─── Segment lookup helper ────────────────────────────────────────────────────

/** Find a route segment by its CommercialRouteSegmentType. */
function seg(
  segments: CommercialRouteSegment[],
  type: CommercialRouteSegment['type'],
): CommercialRouteSegment | undefined {
  return segments.find(s => s.type === type);
}

/** Extract status from a segment, defaulting to 'pending' when absent. */
function segStatus(segment: CommercialRouteSegment | undefined): CommercialRouteStatus {
  return segment ? segToRouteStatus(segment.status) : 'pending';
}

// ─── Segment-ID translation ───────────────────────────────────────────────────

/**
 * Translate the internal segment id string to the canonical CommercialRouteSegmentId.
 * The viewModel uses 'siteB' for the destination segment; the canonical model
 * uses 'destination'.
 */
function toSegmentId(raw: string | undefined | null): CommercialRouteSegmentId | null {
  if (!raw) return null;
  const mapped = raw === 'siteB' ? 'destination' : raw;
  const valid: CommercialRouteSegmentId[] = ['access', 'satellite', 'backhaul', 'destination', 'summary'];
  return valid.includes(mapped as CommercialRouteSegmentId)
    ? (mapped as CommercialRouteSegmentId)
    : null;
}

// ─── SNP coordinate lookup ────────────────────────────────────────────────────

/**
 * Look up a NETWORK_PORTAL position by SNP name using SNPS_DATA as the
 * authoritative source.
 *
 * Matching is case-insensitive and trims surrounding whitespace to be robust
 * against minor label inconsistencies. Returns null when no SNP matches so
 * that route model construction continues without error.
 *
 * Used by buildGeoStarGraph to populate the GEO STAR NETWORK_PORTAL position,
 * resolving the known limitation documented in the C3B report (§9 — L1).
 */
function findPortalCoordinatesByName(name: string): RouteCoordinate | null {
  const normalised = name.trim().toLowerCase();
  const match = SNPS_DATA.find(snp => snp.name.trim().toLowerCase() === normalised);
  return match ? { lat: match.lat, lng: match.lng } : null;
}

// ─── Node / edge construction helpers ────────────────────────────────────────

/** Build a CommercialRouteNode from its constituent parts. */
function makeNode(
  id: string,
  nodeType: CommercialRouteNodeType,
  segmentId: CommercialRouteSegmentId,
  label: string,
  status: CommercialRouteStatus,
  position: RouteCoordinate | null,
  meta?: CommercialRouteNodeMeta,
): CommercialRouteNode {
  return { id, nodeType, segmentId, label, status, position, meta };
}

/** Build a CommercialRouteEdge from its constituent parts. */
function makeEdge(
  edgeType: CommercialRouteEdgeType,
  fromNodeId: string,
  toNodeId: string,
  status: CommercialRouteStatus,
  meta?: CommercialRouteEdgeMeta,
): CommercialRouteEdge {
  return {
    id: `${edgeType}_${fromNodeId}_${toNodeId}`,
    edgeType,
    fromNodeId,
    toNodeId,
    status,
    meta,
  };
}

/** Safely convert a lat/lng pair to a RouteCoordinate. Returns null if falsy. */
function coord(
  point: { lat: number; lng: number } | null | undefined,
): RouteCoordinate | null {
  if (!point) return null;
  return { lat: point.lat, lng: point.lng };
}

function satelliteMeta(
  satellite: SatelliteData | null | undefined,
): Pick<CommercialRouteNodeMeta, 'satelliteId' | 'satelliteNoradId' | 'orbitalPosition'> {
  if (!satellite) return {};
  if (satellite.position.isPositionValid === false) {
    return { satelliteId: satellite.id, satelliteNoradId: satellite.noradId };
  }

  const { lat, lng, alt } = satellite.position;
  if (!isFinite(lat) || !isFinite(lng) || !isFinite(alt)) {
    return {
      satelliteId: satellite.id,
      satelliteNoradId: satellite.noradId,
    };
  }

  return {
    satelliteId: satellite.id,
    satelliteNoradId: satellite.noradId,
    orbitalPosition: { lat, lng, altitudeKm: alt },
  };
}

/**
 * Convert ResolvedGeoGateway to a RouteCoordinate.
 * ResolvedGeoGateway uses `latitude`/`longitude` rather than `lat`/`lng`.
 */
function gatewayCoord(gw: ResolvedGeoGateway | null | undefined): RouteCoordinate | null {
  if (!gw) return null;
  return { lat: gw.latitude, lng: gw.longitude };
}

function commercialGatewayLabel(gateway: ResolvedGeoGateway): string {
  // On the traffic path a 'backup' role only arises from outage re-routing
  // (beam FAILOVER or the reference-allocation backup teleport) — surface it,
  // otherwise the hub silently relocates during a simulated outage.
  // NOTE: this `controlAssignmentRole === 'backup'` check is a separately-named
  // boolean from GEOConnectivitySection.tsx's `isFailoverGateway`
  // (`beamRoute?.routingMode === 'FAILOVER'`) for the same underlying concept —
  // see the comment there. Cross-Surface Consistency Audit 2026-07-21, M4.
  if (gateway.controlAssignmentRole === 'backup') {
    return `${gateway.gatewayName} (failover)`;
  }
  const capability = getTrafficTeleportCapabilityForLegacyGateway(gateway.gateway);
  if (capability?.confidence === 'PUBLICLY_LIKELY') {
    return `${gateway.gatewayName} (reference / unconfirmed)`;
  }
  return gateway.gatewayName;
}

// ─── Topology classification ──────────────────────────────────────────────────

/**
 * Classify the active route into one of the four canonical topologies.
 *
 * The decision tree:
 *   1. technology (LEO / GEO) — sourced from commercialDisplayTechnology.
 *   2. destinationIsPortal — true when the "destination" is an SNP/network
 *      portal rather than a physical customer site.
 *   3. For LEO: leoTopology from activeLeoRouteEvidence distinguishes
 *      SINGLE_SITE from SITE_TO_SITE.
 */
function classifyTopology(
  technology: CommercialRouteTechnology,
  destinationIsPortal: boolean,
  geometry: CommercialRouteGeometryInputs,
): RouteTopology {
  if (technology === 'GEO') {
    return destinationIsPortal ? 'GEO_STAR' : 'GEO_P2P';
  }
  // LEO
  const leoTopology = geometry.activeLeoRouteEvidence?.topology ?? 'SINGLE_SITE';
  if (!destinationIsPortal && (leoTopology === 'SITE_TO_SITE' || geometry.siteB)) return 'LEO_S2S';
  return 'LEO_SINGLE';
}

// ─── Focus target builders ────────────────────────────────────────────────────

/**
 * Build the five canonical focus targets.
 *
 * Each target encodes:
 *   - which camera behaviour to use when a Journey Strip segment is selected
 *   - which node id to centre on (primaryNodeId)
 *   - which node id to use as the far-end anchor for FRAME_ARC (secondaryNodeId)
 *   - which node/edge types to highlight at full intensity
 *
 * The targets are topology-aware: backhaul focus has no primary node for
 * GEO_P2P (no backbone visible), and LEO_S2S uses two SKY_BRIDGE ids for
 * FRAME_ARC.
 */
function buildFocusTargets(
  topology: RouteTopology,
  ids: {
    origin: string;
    skyBridgeA: string;
    skyBridgeB: string | null;  // null for single-satellite topologies
    hubA: string | null;
    hubB: string | null;
    destinationOrPortal: string;
    outcome: string;
  },
): CommercialRouteFocusTarget[] {
  const hasBackbone = topology === 'GEO_STAR' || topology === 'LEO_SINGLE' || topology === 'LEO_S2S';
  const hasTwoSatellites = topology === 'LEO_S2S';

  return [
    // ── access ────────────────────────────────────────────────────────────────
    // Fly to tightly frame the origin node; illuminate the access space link.
    {
      segmentId: 'access',
      behaviour: 'FRAME_NODE',
      primaryNodeId: ids.origin,
      secondaryNodeId: null,
      highlightNodeTypes: ['ORIGIN'],
      highlightEdgeTypes: ['SPACE_LINK', 'TERRESTRIAL_TAIL'],
    },

    // ── satellite ─────────────────────────────────────────────────────────────
    // Back out to show the service relay arc. GEO keeps the selected coverage
    // visible as context, but the camera composition is led by the satellite path.
    {
      segmentId: 'satellite',
      behaviour: 'FRAME_ARC',
      primaryNodeId: ids.skyBridgeA,
      secondaryNodeId: hasTwoSatellites ? (ids.skyBridgeB ?? null) : null,
      highlightNodeTypes: hasTwoSatellites
        ? ['SKY_BRIDGE', 'ORIGIN', 'DESTINATION']
        : ['SKY_BRIDGE', 'ORIGIN', topology === 'GEO_P2P' ? 'DESTINATION' : 'NETWORK_PORTAL'],
      highlightEdgeTypes: ['SPACE_LINK'],
    },

    // ── backhaul ──────────────────────────────────────────────────────────────
    // For topologies with visible backbone: fly to backbone midpoint.
    // For GEO P2P (no backbone): fall back to full-route overview.
    {
      segmentId: 'backhaul',
      behaviour: hasBackbone ? 'FRAME_BACKBONE' : 'FRAME_ROUTE',
      primaryNodeId: hasBackbone ? (ids.hubA ?? null) : null,
      secondaryNodeId: hasBackbone ? (ids.hubB ?? null) : null,
      highlightNodeTypes: hasBackbone ? ['HUB'] : [],
      highlightEdgeTypes: hasBackbone ? ['BACKBONE_LINK', 'TERRESTRIAL_TAIL'] : [],
    },

    // ── destination ───────────────────────────────────────────────────────────
    // Fly to tightly frame the destination node or network portal.
    {
      segmentId: 'destination',
      behaviour: 'FRAME_NODE',
      primaryNodeId: ids.destinationOrPortal,
      secondaryNodeId: null,
      highlightNodeTypes: topology === 'GEO_P2P' || topology === 'LEO_S2S'
        ? ['DESTINATION']
        : ['NETWORK_PORTAL'],
      highlightEdgeTypes: ['SPACE_LINK'],
    },

    // ── summary ───────────────────────────────────────────────────────────────
    // Pull back to frame the full route; illuminate all Level-1 elements.
    {
      segmentId: 'summary',
      behaviour: 'FRAME_ROUTE',
      primaryNodeId: null,
      secondaryNodeId: null,
      highlightNodeTypes: ['ORIGIN', 'DESTINATION', 'NETWORK_PORTAL', 'SKY_BRIDGE', 'OUTCOME'],
      highlightEdgeTypes: ['SPACE_LINK', 'BACKBONE_LINK'],
    },
  ];
}

// ─── Per-topology node + edge builders ───────────────────────────────────────

/**
 * Build the node list and edge list for a GEO P2P route.
 *
 * Topology: ORIGIN → SKY_BRIDGE (GEO) → DESTINATION → OUTCOME
 *
 * The GEO satellite is the single relay node. There is no ground backbone
 * visible in the commercial model for this topology (terminal-to-terminal
 * through the satellite). The backhaul segment focus falls back to a full-
 * route overview.
 */
function buildGeoP2pGraph(
  vm: CommercialScenarioViewModel,
  geometry: CommercialRouteGeometryInputs,
  accessSeg: CommercialRouteSegment | undefined,
  satelliteSeg: CommercialRouteSegment | undefined,
  backhaulSeg: CommercialRouteSegment | undefined,
  destSeg: CommercialRouteSegment | undefined,
  summarySeg: CommercialRouteSegment | undefined,
): { nodes: CommercialRouteNode[]; edges: CommercialRouteEdge[] } {
  const geoSatellite = geometry.geoRouteAnalysis?.selectedSatellite ?? geometry.activeGeoSatellite;
  const satLabel = vm.display.satelliteName && vm.display.satelliteName !== '--'
    ? vm.display.satelliteName
    : (geoSatellite?.name ?? 'GEO Satellite');

  // Node IDs
  const originId       = 'ORIGIN_access';
  const skyBridgeId    = 'SKY_BRIDGE_satellite';
  const destinationId  = 'DESTINATION_destination';
  const outcomeId      = 'OUTCOME_summary';

  const nodes: CommercialRouteNode[] = [
    makeNode(originId, 'ORIGIN', 'access',
      vm.siteA?.name ?? 'Origin',
      segStatus(accessSeg),
      coord(geometry.activeAnalysisPoint),
      { isPrimaryIssue: accessSeg?.isPrimaryIssue }
    ),
    makeNode(skyBridgeId, 'SKY_BRIDGE', 'satellite',
      satLabel,
      segStatus(satelliteSeg),
      null, // SKY_BRIDGE is positioned on the arc, not at real orbital coords
      { technology: 'GEO', isPrimaryIssue: satelliteSeg?.isPrimaryIssue }
    ),
    makeNode(destinationId, 'DESTINATION', 'destination',
      vm.siteB?.name ?? 'Destination',
      segStatus(destSeg),
      coord(geometry.siteB),
      { isPrimaryIssue: destSeg?.isPrimaryIssue }
    ),
    makeNode(outcomeId, 'OUTCOME', 'summary',
      'Service Outcome',
      segStatus(summarySeg),
      null, // OUTCOME overlays its parent destination node
      { isInteractive: false }
    ),
  ];

  const accessStatus     = segStatus(accessSeg);
  const satelliteStatus  = segStatus(satelliteSeg);
  const destStatus       = segStatus(destSeg);

  const edges: CommercialRouteEdge[] = [
    // Origin → GEO Satellite (access arc)
    makeEdge('SPACE_LINK', originId, skyBridgeId, accessStatus,
      { owningSegmentId: 'access' }),
    // GEO Satellite → Destination (destination arc)
    makeEdge('SPACE_LINK', skyBridgeId, destinationId,
      destStatus === 'pending' ? satelliteStatus : destStatus,
      { owningSegmentId: 'destination' }),
  ];

  // Backhaul segment has no visible edge in this topology (no backbone),
  // but backhaulSeg exists in the viewModel — its status is carried by the
  // route status and the Journey Strip button. No graph edge is generated.
  void backhaulSeg;

  return { nodes, edges };
}

/**
 * Build the node list and edge list for a GEO STAR route (internet access).
 *
 * Topology: ORIGIN → SKY_BRIDGE (GEO) → HUB (gateway) → NETWORK_PORTAL → OUTCOME
 *
 * The GEO gateway is the feeder hub. The network portal is the SNP where
 * traffic exits to the internet. Its position is resolved via SNPS_DATA
 * using the portal label as a key (case-insensitive). If no match is found
 * the node is still generated but with position: null (graceful fallback).
 */
function buildGeoStarGraph(
  vm: CommercialScenarioViewModel,
  geometry: CommercialRouteGeometryInputs,
  accessSeg: CommercialRouteSegment | undefined,
  satelliteSeg: CommercialRouteSegment | undefined,
  backhaulSeg: CommercialRouteSegment | undefined,
  destSeg: CommercialRouteSegment | undefined,
  summarySeg: CommercialRouteSegment | undefined,
): { nodes: CommercialRouteNode[]; edges: CommercialRouteEdge[] } {
  const resolvedGateway = geometry.resolvedSelectedGeoGateway ?? geometry.resolvedAutoGeoGateway;
  const trafficCapability = resolvedGateway
    ? getTrafficTeleportCapabilityForLegacyGateway(resolvedGateway.gateway)
    : null;
  const activeGateway = trafficCapability ? resolvedGateway : null;
  const geoSatellite  = geometry.geoRouteAnalysis?.selectedSatellite ?? geometry.activeGeoSatellite;
  const satLabel = vm.display.satelliteName && vm.display.satelliteName !== '--'
    ? vm.display.satelliteName
    : (geoSatellite?.name ?? 'GEO Satellite');

  // Portal label: the viewModel exposes the SNP name via display.snpA for LEO,
  // but for GEO STAR the destination is identified by display.destinationType
  // and siteB.name (which holds the SNP name when destinationIsSnp=true).
  const portalLabel = vm.siteB?.name ?? vm.display.snpA ?? 'Network Portal';
  const hubLabel    = activeGateway ? commercialGatewayLabel(activeGateway) : 'No commercial gateway resolved';

  // Node IDs
  const originId    = 'ORIGIN_access';
  const skyBridgeId = 'SKY_BRIDGE_satellite';
  const hubId       = 'HUB_backhaul';
  const portalId    = 'NETWORK_PORTAL_destination';
  const outcomeId   = 'OUTCOME_summary';

  const nodes: CommercialRouteNode[] = [
    makeNode(originId, 'ORIGIN', 'access',
      vm.siteA?.name ?? 'Origin',
      segStatus(accessSeg),
      coord(geometry.activeAnalysisPoint),
      { isPrimaryIssue: accessSeg?.isPrimaryIssue }
    ),
    makeNode(skyBridgeId, 'SKY_BRIDGE', 'satellite',
      satLabel,
      segStatus(satelliteSeg),
      null,
      { technology: 'GEO', isPrimaryIssue: satelliteSeg?.isPrimaryIssue }
    ),
    ...(activeGateway && trafficCapability ? [
      makeNode(hubId, 'HUB', 'backhaul',
        hubLabel,
        segStatus(backhaulSeg),
        // Gateway has explicit lat/longitude (different field names from lat/lng)
        gatewayCoord(activeGateway),
        {
          isPrimaryIssue: backhaulSeg?.isPrimaryIssue,
          groundCapabilityKind: 'TRAFFIC_TELEPORT',
          capabilityId: trafficCapability.capabilityId,
          capabilityConfidence: trafficCapability.confidence,
          trafficEligibility: trafficCapability.trafficEligibility,
          isUnconfirmedReference: trafficCapability.confidence === 'PUBLICLY_LIKELY',
        }
      ),
    ] : []),
    makeNode(portalId, 'NETWORK_PORTAL', 'destination',
      portalLabel,
      segStatus(destSeg),
      // Resolve portal position from SNPS_DATA using the portal label.
      // findPortalCoordinatesByName returns null when no match is found, which
      // is the correct fallback — the node is still generated, just unpositioned.
      findPortalCoordinatesByName(portalLabel),
      { isPrimaryIssue: destSeg?.isPrimaryIssue }
    ),
    makeNode(outcomeId, 'OUTCOME', 'summary',
      'Service Outcome',
      segStatus(summarySeg),
      null,
      { isInteractive: false }
    ),
  ];

  const accessStatus   = segStatus(accessSeg);
  const satStatus      = segStatus(satelliteSeg);
  const backhaulStatus = segStatus(backhaulSeg);
  const destStatus     = segStatus(destSeg);

  const edges: CommercialRouteEdge[] = [
    // Origin → GEO Satellite (uplink / access arc)
    makeEdge('SPACE_LINK', originId, skyBridgeId, accessStatus,
      { owningSegmentId: 'access' }),
    ...(activeGateway ? [
      // GEO Satellite → Gateway (feeder downlink / satellite arc)
      makeEdge('SPACE_LINK', skyBridgeId, hubId, satStatus,
        { owningSegmentId: 'satellite' }),
      // Gateway → Network Portal (backbone)
      makeEdge('BACKBONE_LINK', hubId, portalId, backhaulStatus,
        { owningSegmentId: 'backhaul' }),
    ] : []),
    // Optional terrestrial tail: Origin → Gateway (last mile, shown on backhaul focus)
    ...(activeGateway ? [
      makeEdge('TERRESTRIAL_TAIL', originId, hubId, accessStatus,
        { owningSegmentId: 'access' }),
    ] : []),
    // Destination space link direction: SNP → Satellite → Origin (reverse path, same arc)
    // Not added separately — the portal is the terminal node; no outbound arc needed.
    void destStatus, // explicitly consumed to avoid unused-variable lint warning
  ].filter((e): e is CommercialRouteEdge => typeof e === 'object');

  return { nodes, edges };
}

/**
 * Build the node list and edge list for a LEO single-site route (internet access).
 *
 * Topology: ORIGIN → SKY_BRIDGE (LEO) → NETWORK_PORTAL (SNP) → OUTCOME
 *
 * For LEO single-site, the SNP is both the ground hub and the network portal.
 * The commercial model collapses these into a single NETWORK_PORTAL node to
 * avoid showing two nodes at (potentially) identical coordinates.
 */
function buildLeoSingleGraph(
  vm: CommercialScenarioViewModel,
  geometry: CommercialRouteGeometryInputs,
  accessSeg: CommercialRouteSegment | undefined,
  satelliteSeg: CommercialRouteSegment | undefined,
  backhaulSeg: CommercialRouteSegment | undefined,
  destSeg: CommercialRouteSegment | undefined,
  summarySeg: CommercialRouteSegment | undefined,
): { nodes: CommercialRouteNode[]; edges: CommercialRouteEdge[] } {
  const snpA     = geometry.activeLeoRouteEvidence?.selectedSnpA ?? null;
  const satA     = geometry.activeLeoRouteEvidence?.servingSatelliteA ?? null;
  const satLabel = satA?.name ?? 'LEO Satellite';

  // The portal label in LEO single-site: the viewModel's display.snpA holds
  // the SNP name (e.g. "SNP Paris").
  const portalLabel = vm.siteB?.name ?? vm.display.snpA ?? snpA?.name ?? 'Network Portal';

  // Node IDs
  const originId  = 'ORIGIN_access';
  const skyBridgeId = 'SKY_BRIDGE_satellite';
  const portalId  = 'NETWORK_PORTAL_destination';
  const outcomeId = 'OUTCOME_summary';

  const nodes: CommercialRouteNode[] = [
    makeNode(originId, 'ORIGIN', 'access',
      vm.siteA?.name ?? 'Origin',
      segStatus(accessSeg),
      coord(geometry.activeAnalysisPoint),
      { isPrimaryIssue: accessSeg?.isPrimaryIssue }
    ),
    makeNode(skyBridgeId, 'SKY_BRIDGE', 'satellite',
      satLabel,
      segStatus(satelliteSeg),
      null,
      { technology: 'LEO', isPrimaryIssue: satelliteSeg?.isPrimaryIssue, ...satelliteMeta(satA) }
    ),
    makeNode(portalId, 'NETWORK_PORTAL', 'destination',
      portalLabel,
      // Status of the portal blends backhaul (SNP reachable) and destination
      // (route confirmed to the portal). Use the worse of the two.
      worstOf(segStatus(backhaulSeg), segStatus(destSeg)),
      coord(snpA),
      { isPrimaryIssue: backhaulSeg?.isPrimaryIssue || destSeg?.isPrimaryIssue }
    ),
    makeNode(outcomeId, 'OUTCOME', 'summary',
      'Service Outcome',
      segStatus(summarySeg),
      null,
      { isInteractive: false }
    ),
  ];

  const accessStatus = segStatus(accessSeg);
  const satStatus    = segStatus(satelliteSeg);
  const portalStatus = worstOf(segStatus(backhaulSeg), segStatus(destSeg));

  const edges: CommercialRouteEdge[] = [
    // Origin → LEO Satellite (access arc)
    makeEdge('SPACE_LINK', originId, skyBridgeId, accessStatus,
      { owningSegmentId: 'access' }),
    // LEO Satellite → Network Portal (feeder + backbone collapsed into one arc)
    makeEdge('SPACE_LINK', skyBridgeId, portalId, worstOf(satStatus, portalStatus),
      { owningSegmentId: 'satellite' }),
  ];

  return { nodes, edges };
}

/**
 * Build the node list and edge list for a LEO site-to-site route.
 *
 * Topology:
 *   ORIGIN → SKY_BRIDGE_A → HUB_A → HUB_B → SKY_BRIDGE_B → DESTINATION → OUTCOME
 *
 * Two LEO satellites serve the two customer sites. Two SNPs form the ground-
 * level backbone between the two LEO footprints. The backbone edge connects
 * the two SNPs and is the primary visual of the backhaul segment.
 */
function buildLeoS2sGraph(
  vm: CommercialScenarioViewModel,
  geometry: CommercialRouteGeometryInputs,
  accessSeg: CommercialRouteSegment | undefined,
  satelliteSeg: CommercialRouteSegment | undefined,
  backhaulSeg: CommercialRouteSegment | undefined,
  destSeg: CommercialRouteSegment | undefined,
  summarySeg: CommercialRouteSegment | undefined,
): { nodes: CommercialRouteNode[]; edges: CommercialRouteEdge[] } {
  const evidence = geometry.activeLeoRouteEvidence;
  const snpA  = evidence?.selectedSnpA ?? null;
  const snpB  = evidence?.selectedSnpB ?? null;
  const satA  = evidence?.servingSatelliteA ?? null;
  const satB  = evidence?.servingSatelliteB ?? null;

  // Satellite labels: prefer real names, fall back to "LEO Satellite A/B"
  const satALabel = satA?.name ?? 'LEO Satellite';
  const satBLabel = satB?.name ?? (satA ? 'LEO Satellite (B)' : 'LEO Satellite');

  // SNP labels from the viewModel's display fields
  const snpALabel = vm.display.snpA && vm.display.snpA !== '--'
    ? vm.display.snpA
    : (snpA?.name ?? 'Network Hub');
  const snpBLabel = vm.display.snpB && vm.display.snpB !== '--'
    ? vm.display.snpB
    : (snpB?.name ?? 'Network Hub');

  // Node IDs
  const originId     = 'ORIGIN_access';
  const skyBridgeAId = 'SKY_BRIDGE_A_satellite';
  const hubAId       = 'HUB_A_backhaul';
  const hubBId       = 'HUB_B_backhaul';
  const skyBridgeBId = 'SKY_BRIDGE_B_satellite';
  const destId       = 'DESTINATION_destination';
  const outcomeId    = 'OUTCOME_summary';

  const nodes: CommercialRouteNode[] = [
    makeNode(originId, 'ORIGIN', 'access',
      vm.siteA?.name ?? 'Origin',
      segStatus(accessSeg),
      coord(geometry.activeAnalysisPoint),
      { isPrimaryIssue: accessSeg?.isPrimaryIssue }
    ),
    makeNode(skyBridgeAId, 'SKY_BRIDGE', 'satellite',
      satALabel,
      segStatus(satelliteSeg),
      null,
      { technology: 'LEO', isSecondary: false, isPrimaryIssue: satelliteSeg?.isPrimaryIssue, ...satelliteMeta(satA) }
    ),
    makeNode(hubAId, 'HUB', 'backhaul',
      snpALabel,
      segStatus(backhaulSeg),
      coord(snpA),
      { isPrimaryIssue: backhaulSeg?.isPrimaryIssue }
    ),
    makeNode(hubBId, 'HUB', 'backhaul',
      snpBLabel,
      segStatus(backhaulSeg),
      coord(snpB),
      { isPrimaryIssue: backhaulSeg?.isPrimaryIssue }
    ),
    makeNode(skyBridgeBId, 'SKY_BRIDGE', 'satellite',
      satBLabel,
      segStatus(satelliteSeg),
      null,
      // isSecondary marks the far-end satellite for the globe renderer
      { technology: 'LEO', isSecondary: true, isPrimaryIssue: satelliteSeg?.isPrimaryIssue, ...satelliteMeta(satB) }
    ),
    makeNode(destId, 'DESTINATION', 'destination',
      vm.siteB?.name ?? 'Destination',
      segStatus(destSeg),
      coord(geometry.siteB),
      { isPrimaryIssue: destSeg?.isPrimaryIssue }
    ),
    makeNode(outcomeId, 'OUTCOME', 'summary',
      'Service Outcome',
      segStatus(summarySeg),
      null,
      { isInteractive: false }
    ),
  ];

  const accessStatus   = segStatus(accessSeg);
  const satStatus      = segStatus(satelliteSeg);
  const backhaulStatus = segStatus(backhaulSeg);
  const destStatus     = segStatus(destSeg);

  const edges: CommercialRouteEdge[] = [
    // Origin → LEO Sat A (access arc)
    makeEdge('SPACE_LINK', originId, skyBridgeAId, accessStatus,
      { owningSegmentId: 'access' }),
    // LEO Sat A → SNP A (feeder arc, part of satellite segment)
    makeEdge('SPACE_LINK', skyBridgeAId, hubAId, satStatus,
      { owningSegmentId: 'satellite' }),
    // SNP A → SNP B (backbone — the key backhaul visual)
    makeEdge('BACKBONE_LINK', hubAId, hubBId, backhaulStatus,
      { owningSegmentId: 'backhaul' }),
    // SNP B → LEO Sat B (feeder arc, part of satellite segment on far end)
    makeEdge('SPACE_LINK', hubBId, skyBridgeBId, satStatus,
      { owningSegmentId: 'satellite' }),
    // LEO Sat B → Destination (destination arc)
    makeEdge('SPACE_LINK', skyBridgeBId, destId, destStatus,
      { owningSegmentId: 'destination' }),
    // Terrestrial tails (last-mile, visible on backhaul focus)
    ...(snpA ? [makeEdge('TERRESTRIAL_TAIL', originId, hubAId, accessStatus,
      { owningSegmentId: 'access' })] : []),
    ...(snpB && geometry.siteB ? [makeEdge('TERRESTRIAL_TAIL', destId, hubBId, destStatus,
      { owningSegmentId: 'destination' })] : []),
  ];

  return { nodes, edges };
}

// ─── Utility: worst-of-two status ────────────────────────────────────────────

/**
 * Return the worse of two CommercialRouteStatus values.
 * Priority order: blocked > limited > pending > active.
 */
function worstOf(a: CommercialRouteStatus, b: CommercialRouteStatus): CommercialRouteStatus {
  const rank: Record<CommercialRouteStatus, number> = {
    blocked: 3,
    limited: 2,
    pending: 1,
    active:  0,
  };
  return rank[a] >= rank[b] ? a : b;
}

// ─── Focus target node-id extraction ─────────────────────────────────────────

/**
 * Extract the node IDs needed for focus target construction from the graph's
 * node list. Nodes are looked up by their ID prefix conventions.
 */
function extractFocusIds(nodes: CommercialRouteNode[]): Parameters<typeof buildFocusTargets>[1] {
  const origin      = nodes.find(n => n.nodeType === 'ORIGIN');
  const skyBridges  = nodes.filter(n => n.nodeType === 'SKY_BRIDGE');
  const hubs        = nodes.filter(n => n.nodeType === 'HUB');
  const dest        = nodes.find(n => n.nodeType === 'DESTINATION' || n.nodeType === 'NETWORK_PORTAL');

  const primarySkyBridge   = skyBridges.find(n => !n.meta?.isSecondary) ?? skyBridges[0];
  const secondarySkyBridge = skyBridges.find(n => n.meta?.isSecondary === true) ?? null;

  return {
    origin:              origin?.id ?? 'ORIGIN_access',
    skyBridgeA:          primarySkyBridge?.id ?? 'SKY_BRIDGE_satellite',
    skyBridgeB:          secondarySkyBridge?.id ?? null,
    hubA:                hubs[0]?.id ?? null,
    hubB:                hubs[1]?.id ?? null,
    destinationOrPortal: dest?.id ?? 'DESTINATION_destination',
    outcome:             nodes.find(n => n.nodeType === 'OUTCOME')?.id ?? 'OUTCOME_summary',
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

/**
 * Build a CommercialRouteModel from a CommercialScenarioViewModel and
 * CommercialRouteGeometryInputs.
 *
 * This function is the single entry point for constructing the canonical route
 * model. It is pure, non-throwing, and free of React / Cesium dependencies.
 *
 * @param vm       The already-built CommercialScenarioViewModel. All business
 *                 logic (status derivation, segment stories, metrics) is reused
 *                 from here rather than re-derived.
 * @param geometry Geographic data not stored in the viewModel: site coordinates,
 *                 resolved GEO gateway, LEO route evidence, GEO satellite.
 */
export function buildCommercialRouteModel(
  vm: CommercialScenarioViewModel,
  geometry: CommercialRouteGeometryInputs,
): CommercialRouteModel {
  // ── Classify topology ────────────────────────────────────────────────────
  const technology: CommercialRouteTechnology = vm.commercialDisplayTechnology;
  // destinationIsPortal: true when the "destination" is a network exit (SNP)
  // rather than a physical customer site. Derived from display.destinationType
  // (equivalent to the internal destinationIsSnp flag, which is not exported).
  const destinationIsPortal = vm.display.destinationType === 'SNP';
  const topology = classifyTopology(technology, destinationIsPortal, geometry);

  // ── Segment lookup ───────────────────────────────────────────────────────
  // Reuse all status, story, and summary data directly from the viewModel.
  // Never re-derive business logic here.
  const segments      = vm.routeSegments;
  const accessSeg     = seg(segments, 'access');
  const satelliteSeg  = seg(segments, 'satellite');
  const backhaulSeg   = seg(segments, 'backhaul');
  const destSeg       = seg(segments, 'destination');
  const summarySeg    = seg(segments, 'summary');

  // ── Build topology-specific graph ────────────────────────────────────────
  let graph: { nodes: CommercialRouteNode[]; edges: CommercialRouteEdge[] };

  switch (topology) {
    case 'GEO_P2P':
      graph = buildGeoP2pGraph(vm, geometry, accessSeg, satelliteSeg, backhaulSeg, destSeg, summarySeg);
      break;
    case 'GEO_STAR':
      graph = buildGeoStarGraph(vm, geometry, accessSeg, satelliteSeg, backhaulSeg, destSeg, summarySeg);
      break;
    case 'LEO_SINGLE':
      graph = buildLeoSingleGraph(vm, geometry, accessSeg, satelliteSeg, backhaulSeg, destSeg, summarySeg);
      break;
    case 'LEO_S2S':
      graph = buildLeoS2sGraph(vm, geometry, accessSeg, satelliteSeg, backhaulSeg, destSeg, summarySeg);
      break;
  }

  // ── Build focus targets ──────────────────────────────────────────────────
  const focusIds     = extractFocusIds(graph.nodes);
  const focusTargets = buildFocusTargets(topology, focusIds);

  // ── Aggregate route status ───────────────────────────────────────────────
  // Reuse the viewModel's pre-computed serviceStatus rather than recomputing
  // worst-case across nodes (which would produce the same result but duplicate
  // the viewModel's logic).
  const routeStatus = vmToRouteStatus(vm.serviceStatus);

  // ── Translate focused / failing segment IDs ──────────────────────────────
  // The viewModel uses 'siteB' as the internal id for the destination segment.
  // Translate to the canonical 'destination' id used in this model.
  const focusedSegmentId      = toSegmentId(vm.selectedSegmentId);
  const primaryFailingSegmentId = toSegmentId(vm.primaryFailingSegmentId ?? null);

  return {
    technology,
    destinationIsPortal,
    nodes: graph.nodes,
    edges: graph.edges,
    focusTargets,
    routeStatus,
    focusedSegmentId,
    primaryFailingSegmentId,
  };
}
