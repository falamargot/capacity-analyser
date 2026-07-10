import {
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

/** Returns the primary control role label (SCC/TTC/Monitoring) for UI badge use. */
export const getPrimaryControlRoleLabel = (roles: GroundInfraRole[]): 'Monitoring' | 'Backup SCC' | 'Nominal SCC' => {
  if (roles.some((r) => r === 'MONITORING_CSC' || r === 'TTC_STATION')) return 'Monitoring';
  if (roles.includes('SCC_BACKUP')) return 'Backup SCC';
  return 'Nominal SCC';
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

export const GLOBE_CONFIG = {
  EARTH_TEXTURE: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  TOPOLOGY_TEXTURE: '//unpkg.com/three-globe/example/img/earth-topology.png',
  BACKGROUND_TEXTURE: '//unpkg.com/three-globe/example/img/night-sky.png',
  UPDATE_INTERVAL: 1000,
  INITIAL_VIEW: {
    lat: 48.8566,
    lng: 2.3522,
    altitude: 2.5
  },
  ATMOSPHERE: {
    color: '#ffffff',
    altitude: 0.25
  },
  SATELLITE_COLORS: {
    GEO: '#2563eb', // Blue for GEO (EUTELSAT)
    LEO: '#ef4444'  // Red for LEO (ONEWEB)
  }
};
