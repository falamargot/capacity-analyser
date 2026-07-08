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

export interface SNPData {
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export const SNPS_DATA: SNPData[] = [
  // AMERICAS (11 sites)
  { name: 'Anchorage', lat: 61.21, lng: -149.89, region: 'Americas' },
  { name: 'Fairbanks', lat: 64.84, lng: -147.72, region: 'Americas' },
  { name: 'Calgary', lat: 51.04, lng: -114.07, region: 'Americas' },
  { name: "St. John's", lat: 47.56, lng: -52.71, region: 'Americas' },
  { name: 'Woodbine', lat: 39.36, lng: -77.06, region: 'Americas' },
  { name: 'Florida', lat: 28.53, lng: -81.37, region: 'Americas' },
  { name: 'Mexico City', lat: 19.43, lng: -99.13, region: 'Americas' },
  { name: 'Maricá', lat: -22.91, lng: -42.81, region: 'Americas' },
  { name: 'Punta Arenas', lat: -53.16, lng: -70.91, region: 'Americas' },
  { name: 'Bogota', lat: 4.71, lng: -74.07, region: 'Americas' },
  { name: 'Lima', lat: -12.04, lng: -77.04, region: 'Americas' },
  // EUROPE & ARCTIC (8 sites)
  { name: 'Svalbard', lat: 78.22, lng: 15.65, region: 'Europe & Arctic' },
  { name: 'Tromsø', lat: 69.64, lng: 18.95, region: 'Europe & Arctic' },
  { name: 'Mornac', lat: 45.68, lng: 0.27, region: 'Europe & Arctic' },
  { name: 'Santander', lat: 43.46, lng: -3.80, region: 'Europe & Arctic' },
  { name: 'Fucino', lat: 41.97, lng: 13.60, region: 'Europe & Arctic' },
  { name: 'Athens', lat: 37.98, lng: 23.72, region: 'Europe & Arctic' },
  { name: 'Makarios', lat: 35.12, lng: 33.32, region: 'Europe & Arctic' },
  { name: 'Nuuk', lat: 64.18, lng: -51.72, region: 'Europe & Arctic' },
  // AFRICA (7 sites)
  { name: 'Dakar', lat: 14.71, lng: -17.46, region: 'Africa' },
  { name: 'Accra', lat: 5.60, lng: -0.18, region: 'Africa' },
  { name: 'Luanda', lat: -8.83, lng: 13.23, region: 'Africa' },
  { name: 'Hartebeesthoek', lat: -25.88, lng: 27.70, region: 'Africa' },
  { name: 'Dar es Salaam', lat: -6.44, lng: 38.90, region: 'Africa' },
  { name: 'Mauritius', lat: -20.16, lng: 57.50, region: 'Africa' },
  { name: 'Djibouti', lat: 11.58, lng: 43.14, region: 'Africa' },
  // MIDDLE EAST & ASIA (10 sites)
  { name: 'Dubai', lat: 25.20, lng: 55.27, region: 'Middle East & Asia' },
  { name: 'Riyadh', lat: 24.71, lng: 46.67, region: 'Middle East & Asia' },
  { name: 'Nur-Sultan', lat: 51.16, lng: 71.44, region: 'Middle East & Asia' },
  { name: 'Tashkent', lat: 41.29, lng: 69.24, region: 'Middle East & Asia' },
  { name: 'Ibaraki', lat: 36.34, lng: 140.44, region: 'Middle East & Asia' },
  { name: 'Singapore', lat: 1.35, lng: 103.81, region: 'Middle East & Asia' },
  { name: 'Depok', lat: -6.40, lng: 106.81, region: 'Middle East & Asia' },
  { name: 'Manila', lat: 14.59, lng: 120.98, region: 'Middle East & Asia' },
  { name: 'Seoul', lat: 37.56, lng: 126.97, region: 'Middle East & Asia' },
  { name: 'Colombo', lat: 6.92, lng: 79.86, region: 'Middle East & Asia' },
  // PACIFIC & AUSTRALIA (6 sites)
  { name: 'Perth', lat: -31.95, lng: 115.86, region: 'Pacific & Australia' },
  { name: 'Merredin', lat: -31.48, lng: 118.27, region: 'Pacific & Australia' },
  { name: 'Darwin', lat: -12.46, lng: 130.84, region: 'Pacific & Australia' },
  { name: 'Majuro', lat: 7.11, lng: 171.18, region: 'Pacific & Australia' },
  { name: 'Guam', lat: 13.44, lng: 144.74, region: 'Pacific & Australia' },
  { name: 'South Tarawa', lat: 1.32, lng: 172.97, region: 'Pacific & Australia' },
];

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
