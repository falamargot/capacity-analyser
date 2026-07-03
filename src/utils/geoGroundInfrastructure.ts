import type { SatelliteData } from '../types/satellites';

export type GroundInfraRole =
  | 'SCC_NOMINAL'
  | 'SCC_BACKUP'
  | 'TTC_STATION'
  | 'MONITORING_CSC'
  | 'TELEPORT_GATEWAY';

export type GatewayTrafficStatus =
  | 'CONFIRMED'
  | 'PUBLICLY_LIKELY'
  | 'UNVERIFIED'
  | 'NOT_APPLICABLE';

export type CapabilityConfidence = GatewayTrafficStatus;

export type TrafficEligibility =
  | 'ELIGIBLE_CONFIRMED'
  | 'ELIGIBLE_PUBLICLY_LIKELY'
  | 'INELIGIBLE_UNVERIFIED'
  | 'INELIGIBLE_NOT_APPLICABLE';

export type GroundCapabilityKind =
  | 'SATELLITE_CONTROL'
  | 'TTC'
  | 'MONITORING'
  | 'TRAFFIC_TELEPORT'
  | 'NETWORK_BACKHAUL';

export type GeoTrafficServiceClass = 'STAR_FORWARD' | 'STAR_RETURN';

export interface GeoGatewayData {
  teleportCode: string;
  gateway_id: string;
  name: string;
  latitude: number;
  longitude: number;
  supported_satellites: string[];
  lat: number;
  lng: number;
  region: string;
  /** Functional roles this site serves. A site may cumulate multiple roles. */
  roles: GroundInfraRole[];
  /**
   * Confidence level that this site carries commercial user RF traffic.
   * PUBLICLY_LIKELY = documented in public Eutelsat/WTA comms, NOT internally confirmed.
   * Promotion to CONFIRMED requires explicit validation with Ops/Infra.
   */
  trafficStatus: GatewayTrafficStatus;
  /** Free-text reference for the trafficStatus assessment (press, doc, date, etc.). */
  trafficStatusSource?: string;
}

export interface GroundSite {
  siteId: string;
  publicCode: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  operator: 'EUTELSAT';
  capabilities: GroundCapability[];
}

export interface BaseGroundCapability {
  capabilityId: string;
  siteId: string;
  kind: GroundCapabilityKind;
  confidence: CapabilityConfidence;
  source?: string;
  supportedSatellites: string[];
}

export interface SatelliteControlCapability extends BaseGroundCapability {
  kind: 'SATELLITE_CONTROL';
  controlRole: 'SCC_NOMINAL' | 'SCC_BACKUP';
}

export interface TtcCapability extends BaseGroundCapability {
  kind: 'TTC';
  services: Array<'TRACKING' | 'TELEMETRY' | 'TELECOMMAND'>;
}

export interface MonitoringCapability extends BaseGroundCapability {
  kind: 'MONITORING';
  monitoringRole: 'CSC' | 'SPECTRUM' | 'QOS' | 'PAYLOAD_VERIFICATION';
}

export interface TrafficTeleportCapability extends BaseGroundCapability {
  kind: 'TRAFFIC_TELEPORT';
  trafficEligibility: TrafficEligibility;
  rfCapabilities: RfCapability[];
  eligibleServiceClasses: GeoTrafficServiceClass[];
}

export interface NetworkBackhaulCapability extends BaseGroundCapability {
  kind: 'NETWORK_BACKHAUL';
  backhaulType: 'INTERNET' | 'PRIVATE_CORE' | 'OPERATOR_BACKBONE';
}

export type GroundCapability =
  | SatelliteControlCapability
  | TtcCapability
  | MonitoringCapability
  | TrafficTeleportCapability
  | NetworkBackhaulCapability;

export interface RfCapability {
  rfCapabilityId: string;
  band: 'C' | 'Ku' | 'Ka';
  direction: 'UPLINK' | 'DOWNLINK' | 'BIDIRECTIONAL';
  eirpDbw?: number;
  gtDbk?: number;
  antennaClass?: string;
  supportedSatellites: string[];
  confidence: CapabilityConfidence;
}

export interface SatelliteGroundAssignment {
  satelliteId: string;
  satelliteName: string;
  control: {
    nominalCapabilityId: string;
    backupCapabilityId?: string;
  };
  ttcCapabilityIds: string[];
  monitoringCapabilityIds: string[];
  trafficPolicy?: {
    preferredTeleportCapabilityIds: string[];
    fallbackPolicy: 'NONE' | 'NEAREST_ELIGIBLE_VISIBLE';
    minimumConfidence: Extract<CapabilityConfidence, 'CONFIRMED' | 'PUBLICLY_LIKELY'>;
  };
}

type SatelliteLike = Pick<SatelliteData, 'id' | 'name' | 'noradId' | 'type' | 'coverageFileId'> | string;

const GEO_SUPPORTED_SATELLITES = ['EUTELSAT', '*'];
const TRAFFIC_SERVICE_CLASSES: GeoTrafficServiceClass[] = ['STAR_FORWARD', 'STAR_RETURN'];

export const getTrafficEligibilityForConfidence = (
  confidence: CapabilityConfidence
): TrafficEligibility => {
  switch (confidence) {
    case 'CONFIRMED':
      return 'ELIGIBLE_CONFIRMED';
    case 'PUBLICLY_LIKELY':
      return 'ELIGIBLE_PUBLICLY_LIKELY';
    case 'UNVERIFIED':
      return 'INELIGIBLE_UNVERIFIED';
    case 'NOT_APPLICABLE':
      return 'INELIGIBLE_NOT_APPLICABLE';
    default: {
      const exhaustiveCheck: never = confidence;
      return exhaustiveCheck;
    }
  }
};

const rfCapability = (
  siteId: string,
  band: RfCapability['band'],
  confidence: CapabilityConfidence
): RfCapability => ({
  rfCapabilityId: `${siteId}-traffic-rf-${band.toLowerCase()}`,
  band,
  direction: 'BIDIRECTIONAL',
  supportedSatellites: GEO_SUPPORTED_SATELLITES,
  confidence,
});

const trafficTeleportCapability = (
  siteId: string,
  confidence: CapabilityConfidence,
  source: string
): TrafficTeleportCapability => ({
  capabilityId: `${siteId}-traffic-teleport`,
  siteId,
  kind: 'TRAFFIC_TELEPORT',
  confidence,
  source,
  supportedSatellites: GEO_SUPPORTED_SATELLITES,
  trafficEligibility: getTrafficEligibilityForConfidence(confidence),
  rfCapabilities: [
    rfCapability(siteId, 'C', confidence),
    rfCapability(siteId, 'Ku', confidence),
    rfCapability(siteId, 'Ka', confidence),
  ],
  eligibleServiceClasses: TRAFFIC_SERVICE_CLASSES,
});

const satelliteControlCapability = (
  siteId: string,
  controlRole: SatelliteControlCapability['controlRole']
): SatelliteControlCapability => ({
  capabilityId: `${siteId}-${controlRole === 'SCC_NOMINAL' ? 'nominal' : 'backup'}-scc`,
  siteId,
  kind: 'SATELLITE_CONTROL',
  confidence: 'PUBLICLY_LIKELY',
  supportedSatellites: GEO_SUPPORTED_SATELLITES,
  controlRole,
});

const monitoringCapability = (
  siteId: string,
  monitoringRole: MonitoringCapability['monitoringRole'] = 'CSC'
): MonitoringCapability => ({
  capabilityId: `${siteId}-monitoring-${monitoringRole.toLowerCase()}`,
  siteId,
  kind: 'MONITORING',
  confidence: 'PUBLICLY_LIKELY',
  supportedSatellites: GEO_SUPPORTED_SATELLITES,
  monitoringRole,
});

const ttcCapability = (siteId: string): TtcCapability => ({
  capabilityId: `${siteId}-ttc`,
  siteId,
  kind: 'TTC',
  confidence: 'PUBLICLY_LIKELY',
  supportedSatellites: GEO_SUPPORTED_SATELLITES,
  services: ['TRACKING', 'TELEMETRY', 'TELECOMMAND'],
});

const groundSite = (
  siteId: string,
  publicCode: string,
  name: string,
  latitude: number,
  longitude: number,
  region: string,
  capabilities: GroundCapability[]
): GroundSite => ({
  siteId,
  publicCode,
  name,
  latitude,
  longitude,
  region,
  operator: 'EUTELSAT',
  capabilities,
});

export const GEO_GROUND_SITES: GroundSite[] = [
  groundSite(
    'geo-rambouillet',
    'RAM',
    'Rambouillet',
    48.5178,
    1.7617,
    'EMEA',
    [
      satelliteControlCapability('geo-rambouillet', 'SCC_NOMINAL'),
      trafficTeleportCapability(
        'geo-rambouillet',
        'PUBLICLY_LIKELY',
        'Eutelsat press/comms — 200+ antennes C/Ku/Ka, teleport documenté (Tooway/KA-SAT), SCC backup confirmé en plus — non vérifié en interne'
      ),
    ]
  ),
  groundSite(
    'geo-cagliari',
    'CAG',
    'Cagliari',
    39.2154,
    9.1093,
    'EMEA',
    [
      satelliteControlCapability('geo-cagliari', 'SCC_BACKUP'),
      trafficTeleportCapability(
        'geo-cagliari',
        'PUBLICLY_LIKELY',
        'Eutelsat/Skylogic Mediterraneo — teleport commercial documenté, 9 antennes — non vérifié en interne'
      ),
    ]
  ),
  groundSite(
    'geo-turin',
    'TUR',
    'Turin',
    45.0709,
    7.6843,
    'EMEA',
    [
      satelliteControlCapability('geo-turin', 'SCC_BACKUP'),
      trafficTeleportCapability(
        'geo-turin',
        'PUBLICLY_LIKELY',
        'Eutelsat SkyPark — teleport commercial documenté, large bande multi-régions — non vérifié en interne'
      ),
    ]
  ),
  groundSite(
    'geo-mexico-city',
    'MEX',
    'Mexico City',
    19.3574,
    -99.0671,
    'AMERICAS',
    [
      satelliteControlCapability('geo-mexico-city', 'SCC_NOMINAL'),
      trafficTeleportCapability(
        'geo-mexico-city',
        'PUBLICLY_LIKELY',
        'Eutelsat Amériques — centre de contrôle décrit comme gérant aussi le trafic transmis — à confirmer en interne'
      ),
    ]
  ),
  groundSite(
    'geo-hermosillo',
    'HER',
    'Hermosillo',
    29.0729,
    -110.9559,
    'AMERICAS',
    [
      satelliteControlCapability('geo-hermosillo', 'SCC_BACKUP'),
      trafficTeleportCapability(
        'geo-hermosillo',
        'PUBLICLY_LIKELY',
        "Désigné 'teleport' dans plusieurs communications Eutelsat/WTA — à confirmer en interne"
      ),
    ]
  ),
  groundSite(
    'geo-martinique',
    'MAR',
    'Martinique',
    14.6000,
    -61.0000,
    'AMERICAS',
    [monitoringCapability('geo-martinique')]
  ),
  groundSite(
    'geo-dubai',
    'DUB',
    'Dubai',
    25.2048,
    55.2708,
    'MIDDLE_EAST',
    [monitoringCapability('geo-dubai')]
  ),
  groundSite(
    'geo-singapore',
    'SIN',
    'Singapore',
    1.3521,
    103.8198,
    'APAC',
    [monitoringCapability('geo-singapore')]
  ),
  groundSite(
    'geo-ibaraki',
    'IBA',
    'Ibaraki',
    36.3418,
    140.4468,
    'APAC',
    [ttcCapability('geo-ibaraki')]
  ),
  groundSite(
    'geo-perth',
    'PER',
    'Perth',
    -31.9523,
    115.8613,
    'APAC',
    [ttcCapability('geo-perth')]
  ),
];

export const getGroundSiteById = (
  siteId: string,
  sites: GroundSite[] = GEO_GROUND_SITES
): GroundSite | null => sites.find((site) => site.siteId === siteId) ?? null;

export const getGroundSiteByPublicCode = (
  publicCode: string,
  sites: GroundSite[] = GEO_GROUND_SITES
): GroundSite | null => sites.find((site) => site.publicCode === publicCode) ?? null;

export const getCapabilitiesForSite = (
  siteId: string,
  sites: GroundSite[] = GEO_GROUND_SITES
): GroundCapability[] => getGroundSiteById(siteId, sites)?.capabilities ?? [];

const satelliteTokens = (satellite: SatelliteLike): Set<string> => {
  if (typeof satellite === 'string') return new Set([satellite.toUpperCase()]);
  return new Set(
    [
      satellite.id,
      satellite.name,
      satellite.noradId,
      satellite.type,
      satellite.coverageFileId ?? null,
    ]
      .filter((value): value is string => !!value)
      .map((value) => value.toUpperCase())
  );
};

export const capabilitySupportsSatellite = (
  capability: Pick<BaseGroundCapability, 'supportedSatellites'>,
  satellite: SatelliteLike
): boolean => {
  const supported = capability.supportedSatellites;
  if (supported.includes('*')) return true;
  const tokens = satelliteTokens(satellite);
  return supported.some((entry) => tokens.has(entry.toUpperCase()));
};

export const getTrafficTeleportCapabilities = (
  sites: GroundSite[] = GEO_GROUND_SITES
): TrafficTeleportCapability[] => sites.flatMap((site) => (
  site.capabilities.filter((capability): capability is TrafficTeleportCapability => (
    capability.kind === 'TRAFFIC_TELEPORT'
  ))
));

export const isTrafficTeleportEligible = (
  capability: TrafficTeleportCapability,
  minimumConfidence: Extract<CapabilityConfidence, 'CONFIRMED' | 'PUBLICLY_LIKELY'> = 'PUBLICLY_LIKELY'
): boolean => {
  if (capability.confidence === 'CONFIRMED') return true;
  return minimumConfidence === 'PUBLICLY_LIKELY' && capability.confidence === 'PUBLICLY_LIKELY';
};

export const getTrafficTeleportCapabilitiesForSatellite = (
  satellite: SatelliteLike,
  {
    sites = GEO_GROUND_SITES,
    minimumConfidence = 'PUBLICLY_LIKELY',
  }: {
    sites?: GroundSite[];
    minimumConfidence?: Extract<CapabilityConfidence, 'CONFIRMED' | 'PUBLICLY_LIKELY'>;
  } = {}
): TrafficTeleportCapability[] => getTrafficTeleportCapabilities(sites).filter((capability) => (
  capabilitySupportsSatellite(capability, satellite) &&
    isTrafficTeleportEligible(capability, minimumConfidence)
));

export const getTrafficTeleportCapabilityForLegacyGateway = (
  gateway: GeoGatewayData,
  satellite?: SatelliteLike,
  sites: GroundSite[] = GEO_GROUND_SITES
): TrafficTeleportCapability | null => {
  const site = sites.find((candidate) => (
    candidate.siteId === gateway.gateway_id ||
    candidate.publicCode === gateway.teleportCode
  ));
  const capability = site?.capabilities.find((entry): entry is TrafficTeleportCapability => (
    entry.kind === 'TRAFFIC_TELEPORT'
  ));
  if (!capability) return null;

  const confidence = gateway.trafficStatus ?? capability.confidence;
  if (confidence !== 'CONFIRMED' && confidence !== 'PUBLICLY_LIKELY') return null;

  const legacyAwareCapability: TrafficTeleportCapability = {
    ...capability,
    confidence,
    source: gateway.trafficStatusSource ?? capability.source,
    trafficEligibility: getTrafficEligibilityForConfidence(confidence),
    rfCapabilities: capability.rfCapabilities.map((rfCapabilityEntry) => ({
      ...rfCapabilityEntry,
      confidence,
    })),
  };

  if (satellite && !capabilitySupportsSatellite(legacyAwareCapability, satellite)) return null;
  return legacyAwareCapability;
};

export const getControlCapabilitiesForSatellite = (
  satellite: SatelliteLike,
  sites: GroundSite[] = GEO_GROUND_SITES
): SatelliteControlCapability[] => sites.flatMap((site) => (
  site.capabilities.filter((capability): capability is SatelliteControlCapability => (
    capability.kind === 'SATELLITE_CONTROL' &&
    capabilitySupportsSatellite(capability, satellite)
  ))
));

export const getMonitoringCapabilitiesForSatellite = (
  satellite: SatelliteLike,
  sites: GroundSite[] = GEO_GROUND_SITES
): MonitoringCapability[] => sites.flatMap((site) => (
  site.capabilities.filter((capability): capability is MonitoringCapability => (
    capability.kind === 'MONITORING' &&
    capabilitySupportsSatellite(capability, satellite)
  ))
));

export const resolveTrafficGatewayForRoute = (
  satellite: SatelliteLike,
  options?: Parameters<typeof getTrafficTeleportCapabilitiesForSatellite>[1]
): TrafficTeleportCapability | null => (
  getTrafficTeleportCapabilitiesForSatellite(satellite, options)[0] ?? null
);

export const resolveSatelliteControlSite = (
  satellite: SatelliteLike,
  {
    sites = GEO_GROUND_SITES,
    controlRole = 'SCC_NOMINAL',
  }: {
    sites?: GroundSite[];
    controlRole?: SatelliteControlCapability['controlRole'];
  } = {}
): { site: GroundSite; capability: SatelliteControlCapability } | null => {
  for (const site of sites) {
    const capability = site.capabilities.find((entry): entry is SatelliteControlCapability => (
      entry.kind === 'SATELLITE_CONTROL' &&
      entry.controlRole === controlRole &&
      capabilitySupportsSatellite(entry, satellite)
    ));
    if (capability) return { site, capability };
  }
  return null;
};

export const getLegacyGroundRolesForSite = (site: GroundSite): GroundInfraRole[] => {
  const roles: GroundInfraRole[] = [];
  for (const capability of site.capabilities) {
    if (capability.kind === 'SATELLITE_CONTROL') {
      roles.push(capability.controlRole);
    } else if (capability.kind === 'TTC') {
      roles.push('TTC_STATION');
    } else if (capability.kind === 'MONITORING') {
      roles.push('MONITORING_CSC');
    } else if (capability.kind === 'TRAFFIC_TELEPORT') {
      roles.push('TELEPORT_GATEWAY');
    }
  }
  return [...new Set(roles)];
};

export const projectGroundSiteToLegacyGeoGateway = (site: GroundSite): GeoGatewayData => {
  const trafficCapability = site.capabilities.find((capability): capability is TrafficTeleportCapability => (
    capability.kind === 'TRAFFIC_TELEPORT'
  ));

  return {
    teleportCode: site.publicCode,
    gateway_id: site.siteId,
    name: site.name,
    latitude: site.latitude,
    longitude: site.longitude,
    supported_satellites: [...GEO_SUPPORTED_SATELLITES],
    lat: site.latitude,
    lng: site.longitude,
    region: site.region,
    roles: getLegacyGroundRolesForSite(site),
    trafficStatus: trafficCapability?.confidence ?? 'UNVERIFIED',
    trafficStatusSource: trafficCapability?.source,
  };
};

export const projectGroundSitesToLegacyGeoGateways = (
  sites: GroundSite[] = GEO_GROUND_SITES
): GeoGatewayData[] => sites.map(projectGroundSiteToLegacyGeoGateway);
