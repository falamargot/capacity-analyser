/**
 * Canonical Commercial Route Model types.
 *
 * These types describe the unified route model that will be consumed by:
 *   - CommercialRouteStrip  — segment selection and focus dispatch
 *   - CommercialInspectorPanel — per-segment detail and tab identity
 *   - CesiumGlobe (commercial mode) — node rendering, edge rendering,
 *     camera focus, and status-driven colour
 *
 * The model is intentionally topology-agnostic: the same interfaces cover
 * GEO Internet Access, GEO Point-to-Point, LEO Internet Access, and LEO
 * Site-to-Site without topology-specific subclasses.
 *
 * This file contains TYPE DEFINITIONS ONLY.
 * No builder, no computation, no React, no Cesium.
 *
 * Builder implementation is deferred to Phase C3 (commercialRouteModel.ts
 * in src/utils/).
 */

// ─── Primitive types ──────────────────────────────────────────────────────────

/**
 * The five canonical segment identifiers of a Commercial Route.
 *
 * Maps to CommercialRouteSegmentType in commercialTypes.ts.
 * Note: the existing internal implementation uses 'siteB' as the id for the
 * destination segment; the canonical model normalises this to 'destination'.
 * The C3 builder is responsible for this translation.
 *
 * Order matches the Journey Strip left-to-right display order.
 */
export type CommercialRouteSegmentId =
  | 'access'       // Customer Site — first-mile to the space segment
  | 'satellite'    // Satellite Service — the space relay layer
  | 'backhaul'     // Indicative backbone/ground infrastructure between space nodes
  | 'destination'  // Destination — far-end customer site or network portal
  | 'summary';     // Service Outcome — aggregate service result

/**
 * The active satellite technology serving this route.
 * Derived exclusively from CommercialScenarioViewModel.commercialDisplayTechnology
 * — never from the user's active tab selector.
 */
export type CommercialRouteTechnology = 'GEO' | 'LEO';

/**
 * The four business states a route node or edge can be in.
 * Maps to CommercialRouteSegmentStatus ('healthy'→'active', 'warning'→'limited').
 *
 * active   — service running normally
 * limited  — service running with a detected constraint
 * blocked  — segment is not available; service cannot pass through
 * pending  — analysis is in progress; status not yet determined
 */
export type CommercialRouteStatus = 'active' | 'limited' | 'blocked' | 'pending';

// ─── Node taxonomy ────────────────────────────────────────────────────────────

/**
 * The six canonical node types in a Commercial Route.
 *
 * ORIGIN          Physical customer premises — the route starting point.
 *                 Always present. Carries a real geographic coordinate.
 *
 * DESTINATION     Physical customer premises at the far end.
 *                 Present only in point-to-point topologies
 *                 (CommercialScenarioViewModel.siteB != null &&
 *                  display.destinationType !== 'SNP').
 *
 * NETWORK_PORTAL  Internet exit point / SNP that serves as the destination
 *                 in internet-access topologies (destinationIsSnp = true).
 *                 Carries a real geographic coordinate (the SNP position).
 *
 * SKY_BRIDGE      The active satellite abstracted as a service relay node.
 *                 Positioned at a narrative altitude on the route arc —
 *                 NOT at the satellite's real orbital position.
 *                 In LEO Site-to-Site routes there may be two SKY_BRIDGE
 *                 nodes (one per endpoint); the `isSecondary` metadata flag
 *                 identifies the far-end node.
 *
 * HUB             A ground infrastructure junction: gateway, SNP, or PoP.
 *                 Carries a real geographic coordinate.
 *                 Rendered as a secondary (Level 3) node unless the
 *                 backhaul segment is focused.
 *
 * OUTCOME         A virtual overlay node on the DESTINATION / NETWORK_PORTAL
 *                 node that communicates the aggregate service result.
 *                 Has no independent geographic coordinate — it shares the
 *                 position of the destination node.
 *                 Only rendered when routeStatus transitions to a confirmed
 *                 state (active / limited / blocked).
 */
export type CommercialRouteNodeType =
  | 'ORIGIN'
  | 'DESTINATION'
  | 'NETWORK_PORTAL'
  | 'SKY_BRIDGE'
  | 'HUB'
  | 'OUTCOME';

// ─── Edge taxonomy ────────────────────────────────────────────────────────────

/**
 * The three canonical edge types connecting route nodes.
 *
 * SPACE_LINK       The arc from a ground node (ORIGIN, DESTINATION, or
 *                  NETWORK_PORTAL) up to a SKY_BRIDGE node.
 *                  Visual: glowing polyline rising from the surface.
 *                  Technology-coloured: GEO blue or LEO pink.
 *
 * BACKBONE_LINK    The ground-level connection between two HUB nodes, or
 *                  between a HUB and a NETWORK_PORTAL.
 *                  Visual: thin dashed line near the globe surface.
 *                  Colour: violet.
 *
 * TERRESTRIAL_TAIL The short last-mile segment from an ORIGIN or DESTINATION
 *                  to its nearest HUB. Optional — omitted when the HUB is
 *                  co-located or the distance is negligible.
 *                  Visual: very thin dotted line, clamped to ground.
 *                  Revealed only when the backhaul segment is focused.
 */
export type CommercialRouteEdgeType =
  | 'SPACE_LINK'
  | 'BACKBONE_LINK'
  | 'TERRESTRIAL_TAIL';

// ─── Camera focus behaviour ───────────────────────────────────────────────────

/**
 * Camera behaviour to apply when a Journey Strip segment is selected.
 *
 * FRAME_NODE      Fly to tightly frame a single node (e.g., ORIGIN or
 *                 DESTINATION when the access/destination segment is focused).
 *
 * FRAME_ARC       Back out to show the full SPACE_LINK arc including the
 *                 SKY_BRIDGE node at its apex (satellite segment focus).
 *
 * FRAME_GEO_COVERAGE
 *                 GEO satellite segment focus. Frame the selected coverage
 *                 footprint and customer site instead of the synthetic
 *                 SKY_BRIDGE node.
 *
 * FRAME_BACKBONE  Re-orient the camera to the geographic midpoint of the
 *                 BACKBONE_LINK, revealing HUB nodes and their labels.
 *
 * FRAME_ROUTE     Overview camera framing both ORIGIN and DESTINATION with
 *                 comfortable padding (summary / outcome segment focus).
 */
export type CommercialRouteFocusBehaviour =
  | 'FRAME_NODE'
  | 'FRAME_ARC'
  | 'FRAME_GEO_COVERAGE'
  | 'FRAME_BACKBONE'
  | 'FRAME_ROUTE';

// ─── Coordinate ───────────────────────────────────────────────────────────────

/**
 * A geographic coordinate pair used for globe node placement.
 * Altitude is optional; when omitted, the node is rendered at ground level.
 */
export interface RouteCoordinate {
  lat: number;
  lng: number;
  /** Altitude in kilometres above the WGS84 ellipsoid. Defaults to ground (0.01 km). */
  altitudeKm?: number;
}

// ─── Node metadata ────────────────────────────────────────────────────────────

/**
 * Optional per-node metadata that refines rendering and interaction behaviour.
 * All fields are optional — consumers must handle their absence.
 */
export interface CommercialRouteNodeMeta {
  /**
   * Technology family for SKY_BRIDGE nodes.
   * Drives colour selection: GEO → blue-400, LEO → pink-400.
   * Inherited from CommercialRouteTechnology at the route level when absent.
   */
  technology?: CommercialRouteTechnology;

  /**
   * For LEO Site-to-Site routes with two SKY_BRIDGE nodes:
   * true on the far-end satellite (serving DESTINATION), false on the
   * near-end satellite (serving ORIGIN).
   */
  isSecondary?: boolean;

  /**
   * Serving satellite identity and orbital coordinate when this SKY_BRIDGE
   * corresponds to a concrete computed satellite.
   */
  satelliteId?: string;
  satelliteNoradId?: string;
  orbitalPosition?: RouteCoordinate;

  /**
   * Whether this node can receive click events that dispatch segment focus.
   * Defaults to true for all node types except OUTCOME.
   */
  isInteractive?: boolean;

  /**
   * Whether this node corresponds to the primary failing segment.
   * When true, the node renders in blocked (red) colour regardless of
   * other focus state.
   */
  isPrimaryIssue?: boolean;
}

// ─── Edge metadata ────────────────────────────────────────────────────────────

/**
 * Optional per-edge metadata.
 */
export interface CommercialRouteEdgeMeta {
  /**
   * The segment that "owns" this edge for focus-highlight purposes.
   * When the owning segment is focused in the Journey Strip, this edge
   * renders at full intensity; all others dim.
   */
  owningSegmentId?: CommercialRouteSegmentId;
}

// ─── Core model objects ───────────────────────────────────────────────────────

/**
 * A single business node in the Commercial Route.
 *
 * Nodes correspond to physical or conceptual entities in the service path:
 * customer premises, satellites, ground hubs, and the aggregate outcome.
 *
 * Future consumers:
 *   Globe     — renders each node with type-specific shape, colour, label
 *   Inspector — maps node type to inspector tab identity
 *   Strip     — not a direct consumer; strip maps to segments, not nodes
 */
export interface CommercialRouteNode {
  /** Unique within the route. Conventionally: `'{nodeType}_{segmentId}'`. */
  id: string;
  /** Canonical node type — drives visual shape and colour family. */
  nodeType: CommercialRouteNodeType;
  /** The Journey Strip segment this node belongs to. */
  segmentId: CommercialRouteSegmentId;
  /** Display label shown on the globe (city name, SNP name, "GEO Satellite", etc.). */
  label: string;
  /** Business status driving colour. */
  status: CommercialRouteStatus;
  /**
   * Geographic coordinate for globe placement.
   * null for SKY_BRIDGE (positioned on arc at narrative altitude, not real orbit)
   * and OUTCOME (co-located with its parent destination node).
   */
  position: RouteCoordinate | null;
  /** Optional refinements. */
  meta?: CommercialRouteNodeMeta;
}

/**
 * A directed connection between two route nodes.
 *
 * Edges represent the physical or logical links that carry traffic:
 * the space arcs, the ground backbone, and last-mile terrestrial tails.
 *
 * Future consumers:
 *   Globe — renders each edge with type-specific style, glow, and status colour
 */
export interface CommercialRouteEdge {
  /** Unique within the route. Conventionally: `'{edgeType}_{fromId}_{toId}'`. */
  id: string;
  edgeType: CommercialRouteEdgeType;
  /** `CommercialRouteNode.id` of the edge's origin. */
  fromNodeId: string;
  /** `CommercialRouteNode.id` of the edge's terminus. */
  toNodeId: string;
  /** Status drives colour and glow intensity. */
  status: CommercialRouteStatus;
  /** Optional refinements. */
  meta?: CommercialRouteEdgeMeta;
}

/**
 * Globe camera and highlight behaviour to apply when a specific Journey Strip
 * segment is focused.
 *
 * One focus target exists per CommercialRouteSegmentId.
 *
 * Future consumers:
 *   Globe — reads focusTargets to execute camera transitions and opacity rules
 *   Strip — triggers the matching focus target on segment button click
 */
export interface CommercialRouteFocusTarget {
  segmentId: CommercialRouteSegmentId;
  /** Camera movement to execute when this segment becomes focused. */
  behaviour: CommercialRouteFocusBehaviour;
  /**
   * Node id to centre the camera on.
   * null for FRAME_ROUTE (camera frames the full route bounds, not a single node)
   * and FRAME_BACKBONE (camera frames the backbone midpoint, computed at render time).
   */
  primaryNodeId: string | null;
  /**
   * Secondary node id for FRAME_ARC (frames the arc between two nodes).
   * null for all other behaviours.
   */
  secondaryNodeId: string | null;
  /**
   * Node types that should render at full intensity when this segment is focused.
   * All other node types are dimmed to their reduced-opacity state.
   */
  highlightNodeTypes: CommercialRouteNodeType[];
  /**
   * Edge types that should render at full intensity when this segment is focused.
   * All other edge types are dimmed.
   */
  highlightEdgeTypes: CommercialRouteEdgeType[];
}

// ─── Top-level route model ────────────────────────────────────────────────────

/**
 * The Canonical Commercial Route Model.
 *
 * A single instance of this model fully describes the service path for one
 * active commercial scenario — including all nodes, their connections, and
 * the globe camera behaviour for each Journey Strip segment.
 *
 * This model is the single source of truth consumed by:
 *   - CommercialRouteStrip  (segment selection → focusTarget dispatch)
 *   - CommercialInspectorPanel (tab identity, node-type header chip)
 *   - CesiumGlobe commercial rendering (node shapes, edge arcs, camera focus)
 *
 * It is intentionally separate from CommercialScenarioViewModel, which
 * carries the business narrative data (labels, stories, metrics).
 * CommercialRouteModel carries the geometric and structural data.
 *
 * Builder: src/utils/commercialRouteModel.ts (Phase C3 — not yet implemented).
 * Called in App.tsx immediately after buildCommercialScenarioViewModel().
 */
export interface CommercialRouteModel {
  /**
   * The satellite technology driving this route's visual presentation.
   * Sourced exclusively from CommercialScenarioViewModel.commercialDisplayTechnology.
   */
  technology: CommercialRouteTechnology;

  /**
   * Whether this is an internet-access topology (single customer site, SNP as
   * destination) or a point-to-point topology (two customer sites).
   * Corresponds to CommercialScenarioViewModel.display.destinationType === 'SNP'.
   */
  destinationIsPortal: boolean;

  /**
   * Ordered list of route nodes in traversal order:
   * ORIGIN → [HUB] → SKY_BRIDGE → [HUB] → DESTINATION/NETWORK_PORTAL → OUTCOME
   *
   * The exact node set varies by topology:
   *   GEO P2P:   ORIGIN, SKY_BRIDGE, DESTINATION, OUTCOME
   *   GEO STAR:  ORIGIN, SKY_BRIDGE, HUB, NETWORK_PORTAL, OUTCOME
   *   LEO SINGLE:ORIGIN, SKY_BRIDGE, HUB, NETWORK_PORTAL, OUTCOME
   *   LEO S2S:   ORIGIN, SKY_BRIDGE(A), HUB(A), HUB(B), SKY_BRIDGE(B), DESTINATION, OUTCOME
   */
  nodes: CommercialRouteNode[];

  /**
   * Directed edges connecting the route nodes.
   * Includes SPACE_LINKs (arcs), BACKBONE_LINKs (ground), and optionally
   * TERRESTRIAL_TAILs (last-mile).
   */
  edges: CommercialRouteEdge[];

  /**
   * One focus target per CommercialRouteSegmentId.
   * Always exactly five entries, in segment order.
   */
  focusTargets: CommercialRouteFocusTarget[];

  /**
   * Aggregate status of the entire route.
   * Equals the worst-case status across all nodes.
   */
  routeStatus: CommercialRouteStatus;

  /**
   * The id of the currently focused Journey Strip segment.
   * Null means no segment is focused (overview / summary state).
   * Sourced from CommercialScenarioViewModel.selectedSegmentId.
   */
  focusedSegmentId: CommercialRouteSegmentId | null;

  /**
   * The id of the segment that is the primary cause of any route failure.
   * Null when the route is active or pending.
   * Sourced from CommercialScenarioViewModel.primaryFailingSegmentId.
   */
  primaryFailingSegmentId: CommercialRouteSegmentId | null;
}
