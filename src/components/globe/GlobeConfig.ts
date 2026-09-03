import {
  CONTROL_GROUND_ROLES,
  projectGroundSitesToLegacyGeoGateways,
  type GatewayTrafficStatus,
  type GeoGatewayData,
  type GroundInfraRole,
} from '../../utils/geoGroundInfrastructure';

export {
  GEO_GROUND_SITES,
  GEO_BEAM_GATEWAY_ASSIGNMENTS,
  GEO_EARTH_STATION_REDUNDANCIES,
  GEO_GATEWAY_REDUNDANCY_POLICIES,
  GEO_HUB_DATA_CENTER_CAPABILITIES,
  GEO_LOGICAL_GATEWAY_ASSIGNMENTS,
  GEO_LOGICAL_GATEWAYS,
  capabilitySupportsSatellite,
  getGroundSiteById,
  getGroundSiteByPublicCode,
  getLegacyGroundRolesForSite,
  getTrafficEligibilityForConfidence,
  getTrafficTeleportCapabilityForLegacyGateway,
  getTrafficTeleportCapabilities,
  getTrafficTeleportCapabilitiesForSatellite,
  isTrafficTeleportEligible,
  projectGroundSiteToLegacyGeoGateway,
  projectGroundSitesToLegacyGeoGateways,
  resolveBeamGatewayRoute,
  resolveRoutableLogicalGatewayAssignment,
} from '../../utils/geoGroundInfrastructure';

export type {
  BaseGroundCapability,
  BeamGatewayAssignment,
  BeamGatewayResolutionFailureReason,
  BeamGatewayResolutionResult,
  BeamGatewayRoutingMode,
  CapabilityConfidence,
  EarthStationRedundancy,
  EarthStationRedundancyType,
  EvidenceSource,
  EvidenceSourceKind,
  GatewayTrafficStatus,
  GatewayDeploymentStatus,
  GatewayRedundancyMode,
  GatewayRedundancyPolicy,
  GeoGatewayData,
  GeoTrafficServiceClass,
  GroundCapability,
  GroundCapabilityKind,
  GroundInfraRole,
  GroundSite,
  HubDataCenterCapability,
  HubDataCenterRole,
  LogicalGateway,
  LogicalGatewayAssignment,
  LogicalGatewayRole,
  MonitoringCapability,
  NetworkBackhaulCapability,
  RfCapability,
  ResolvedBeamGatewayRoute,
  ResolvedRoutableLogicalGatewayAssignment,
  SatelliteControlCapability,
  TemporalValidity,
  TrafficEligibility,
  TrafficTeleportCapability,
  TtcCapability,
} from '../../utils/geoGroundInfrastructure';

// ─── LEO ground segment — owned by the network domain (L-O1) ─────────────────
// The SNP catalog moved to src/data/leoGroundSegment.ts; the globe config
// re-exports it so existing import sites keep working. SNPData is now an alias
// of the domain SnpSite (superset: adds id/status/fiber-override fields).
import { SNP_SITES, type SnpSite } from '../../data/leoGroundSegment';

export type SNPData = SnpSite;

export const SNPS_DATA: SNPData[] = SNP_SITES;

// ─── Display helpers ──────────────────────────────────────────────────────────

const GROUND_INFRA_ROLE_LABELS: Record<GroundInfraRole, string> = {
  SCC_NOMINAL:      'SCC Nominal',
  SCC_BACKUP:       'SCC Backup',
  TTC_STATION:      'TT&C Station',
  MONITORING_CSC:   'CSC Monitoring',
  TELEPORT_GATEWAY: 'Teleport / Gateway',
};

export const formatGroundRoles = (roles: GroundInfraRole[]): string =>
  roles.map((r) => GROUND_INFRA_ROLE_LABELS[r]).join(' · ');

export type ControlRoleLabel = 'Monitoring' | 'Backup SCC' | 'Nominal SCC';

/**
 * The primary control role label (SCC / TT&C / Monitoring), or `null` for a site
 * that has no control role.
 *
 * ── WHY THIS RETURNS NULL ───────────────────────────────────────────────────
 * It used to fall through to `'Nominal SCC'` for ANY role set, which made it
 * assert a satellite-control role the site does not have. That was reachable and
 * live: seven of the ground sites carry no control role — Makarios, Palermo,
 * Nemea, Sintra, Madeira, Sarajevo (teleport only) and Arganda (no role at all)
 * — and every one of them is drawn on the globe and selectable, so selecting one
 * badged it `Nominal SCC`. On a tool that spends a whole vocabulary on
 * CONFIRMED / PUBLICLY_LIKELY / UNVERIFIED, a fabricated control role is the
 * worst kind of label.
 *
 * Callers must decide what a site with no control role shows;
 * `getGroundSiteRoleLabel` is the ready-made answer for the common case.
 */
export const getPrimaryControlRoleLabel = (roles: GroundInfraRole[]): ControlRoleLabel | null => {
  if (roles.some((r) => r === 'MONITORING_CSC' || r === 'TTC_STATION')) return 'Monitoring';
  if (roles.includes('SCC_BACKUP')) return 'Backup SCC';
  if (roles.includes('SCC_NOMINAL')) return 'Nominal SCC';
  return null;
};

/**
 * One truthful label for any site: its control role when it has one, otherwise
 * what it actually is.
 *
 * The secondary roles are NOT folded in here — a badge has one line — but they
 * are no longer lost either: `secondaryGroundRoleLabel` returns them for the
 * surfaces that have room, which is what deferred item 1 asked for.
 */
export const getGroundSiteRoleLabel = (roles: GroundInfraRole[]): string =>
  getPrimaryControlRoleLabel(roles) ?? (roles.length > 0 ? formatGroundRoles(roles) : 'Ground site');

/**
 * The roles a single control badge cannot show, formatted — `null` when there
 * are none. This is the other half of deferred item 1: a site that cumulates
 * roles (Rambouillet is `SCC_NOMINAL + TELEPORT_GATEWAY`) used to have every
 * role but the first silently dropped.
 */
export const secondaryGroundRoleLabel = (roles: GroundInfraRole[]): string | null => {
  if (getPrimaryControlRoleLabel(roles) === null) return null;
  const rest = roles.filter((role) => !CONTROL_GROUND_ROLES.has(role));
  return rest.length > 0 ? formatGroundRoles(rest) : null;
};

/**
 * Sober, non-alarming note explaining the confidence level behind a site's
 * traffic gateway role — for display next to a resolved gateway, NOT a red
 * warning. Returns null for CONFIRMED (no note needed).
 *
 * Exhaustive over GatewayTrafficStatus by design — extend this switch (not a
 * default case) when the status union changes, so a missing branch fails
 * loudly at compile time rather than silently showing no note.
 */
export const getGatewayTrafficStatusNote = (trafficStatus: GatewayTrafficStatus): string | null => {
  switch (trafficStatus) {
    case 'CONFIRMED':
      return null;
    case 'PUBLICLY_LIKELY':
      return 'Traffic gateway role at this site is publicly documented but not internally confirmed.';
    case 'UNVERIFIED':
    case 'NOT_APPLICABLE':
      return 'No internally or publicly confirmed traffic gateway role for this site — geometry reflects the satellite control assignment only.';
    default: {
      // Compile-time guard: fails tsc if GatewayTrafficStatus gains a member
      // not handled above, even without noImplicitReturns enabled.
      const exhaustiveCheck: never = trafficStatus;
      return exhaustiveCheck;
    }
  }
};

// ─── GEO ground segment data ──────────────────────────────────────────────────
//
// GEO_GROUND_SITES is the canonical capability-driven source of truth during
// the migration. GEO_GATEWAYS remains as the legacy projection consumed by the
// current app surface until downstream RF/COMM/ENG paths move to capabilities.

export const GEO_GATEWAYS: GeoGatewayData[] = projectGroundSitesToLegacyGeoGateways();

