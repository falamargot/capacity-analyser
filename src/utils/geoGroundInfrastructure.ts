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
  | 'NETWORK_BACKHAUL'
  | 'NETWORK_HUB';

export type GeoTrafficServiceClass = 'STAR_FORWARD' | 'STAR_RETURN';

export type EvidenceSourceKind =
  | 'INTERNAL_TICKET'
  | 'GIPN'
  | 'OPS_VALIDATION'
  | 'PUBLIC_DOC'
  | 'ENGINEERING_NOTE';

export interface TemporalValidity {
  validFrom?: string;
  validTo?: string;
  assertedAt?: string;
  note?: string;
}

export interface EvidenceSource {
  sourceId: string;
  label: string;
  kind: EvidenceSourceKind;
  reference?: string;
  confidence: CapabilityConfidence;
  temporal?: TemporalValidity;
}

export type GatewayDeploymentStatus =
  | 'DEFINED'
  | 'PLANNED'
  | 'DEPLOYED'
  | 'OPERATIONAL'
  | 'BACKUP_READY'
  | 'ON_HOLD'
  | 'RETIRED'
  | 'UNKNOWN';

export type LogicalGatewayRole =
  | 'NOMINAL'
  | 'BACKUP'
  | 'HUB'
  | 'DEFINED_ONLY'
  | 'FUTURE';

export type GatewayRedundancyMode =
  | 'LOCAL_BACKUP'
  | 'ANY_NOMINAL_REPLACEMENT'
  | 'HUB_BACKUP'
  | 'CUSTOM';

export type EarthStationRedundancyType =
  | 'LOCAL_ANTENNA'
  | 'COLOCATED_EARTH_STATION'
  | 'REMOTE_GATEWAY';

export type HubDataCenterRole =
  | 'DATA_CENTER'
  | 'GIPN_HUB'
  | 'TRAFFIC_MANAGEMENT'
  | 'NOC_ACCESS';

export interface LogicalGateway {
  logicalGatewayId: string;
  satelliteId: string;
  displayName: string;
  gatewayCode: string;
  group?: string;
  platformId?: string;
  evidence?: EvidenceSource[];
  temporal?: TemporalValidity;
}

export interface LogicalGatewayAssignment {
  assignmentId: string;
  logicalGatewayId: string;
  satelliteId: string;
  siteId?: string;
  trafficTeleportCapabilityId?: string;
  rfCapabilityIds?: string[];
  role: LogicalGatewayRole;
  deploymentStatus: GatewayDeploymentStatus;
  temporal?: TemporalValidity;
  evidence?: EvidenceSource[];
}

export interface BeamGatewayAssignment {
  assignmentId: string;
  satelliteId: string;
  logicalGatewayId: string;
  beamIds: string[];
  direction?: 'FORWARD' | 'RETURN' | 'BIDIRECTIONAL';
  serviceClasses?: GeoTrafficServiceClass[];
  evidence?: EvidenceSource[];
  temporal?: TemporalValidity;
}

export interface GatewayRedundancyPolicy {
  policyId: string;
  satelliteId: string;
  mode: GatewayRedundancyMode;
  primaryLogicalGatewayIds: string[];
  backupLogicalGatewayIds: string[];
  description: string;
  evidence?: EvidenceSource[];
  temporal?: TemporalValidity;
}

export interface EarthStationRedundancy {
  redundancyId: string;
  siteId: string;
  logicalGatewayId?: string;
  satelliteId?: string;
  backupResourceName: string;
  redundancyType: EarthStationRedundancyType;
  status: GatewayDeploymentStatus;
  temporal?: TemporalValidity;
  evidence?: EvidenceSource[];
}

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
  evidence?: EvidenceSource[];
  temporal?: TemporalValidity;
}

export interface BaseGroundCapability {
  capabilityId: string;
  siteId: string;
  kind: GroundCapabilityKind;
  confidence: CapabilityConfidence;
  source?: string;
  evidence?: EvidenceSource[];
  temporal?: TemporalValidity;
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

export interface HubDataCenterCapability extends BaseGroundCapability {
  kind: 'NETWORK_HUB';
  hubRole: HubDataCenterRole;
  equipment?: string[];
  platformId?: string;
}

export type GroundCapability =
  | SatelliteControlCapability
  | TtcCapability
  | MonitoringCapability
  | TrafficTeleportCapability
  | NetworkBackhaulCapability
  | HubDataCenterCapability;

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

export interface ResolvedRoutableLogicalGatewayAssignment {
  assignment: LogicalGatewayAssignment;
  site: GroundSite;
  trafficCapability: TrafficTeleportCapability;
}

export type BeamGatewayRoutingMode = 'NOMINAL' | 'FAILOVER';

export type BeamGatewayResolutionFailureReason =
  | 'UNSUPPORTED_SATELLITE'
  | 'BEAM_ASSIGNMENT_NOT_FOUND'
  | 'LOGICAL_GATEWAY_ASSIGNMENT_NOT_FOUND'
  | 'DEPLOYMENT_STATUS_NOT_ROUTABLE'
  | 'FAILOVER_POLICY_NOT_FOUND'
  | 'FAILOVER_GATEWAY_NOT_FOUND'
  | 'ROUTABLE_GATEWAY_NOT_RESOLVED';

export interface ResolvedBeamGatewayRoute {
  satelliteId: string;
  beamId: string;
  routingMode: BeamGatewayRoutingMode;
  beamAssignment: BeamGatewayAssignment;
  nominalLogicalGatewayAssignment: LogicalGatewayAssignment;
  logicalGatewayAssignment: LogicalGatewayAssignment;
  site: GroundSite;
  trafficCapability: TrafficTeleportCapability;
  failoverPolicy?: GatewayRedundancyPolicy;
}

export interface BeamGatewayResolutionResult {
  route: ResolvedBeamGatewayRoute | null;
  reason: BeamGatewayResolutionFailureReason | null;
  diagnostic: string;
}

export type SatelliteLike = Pick<SatelliteData, 'id' | 'name' | 'noradId' | 'type' | 'coverageFileId'> | string;

const GEO_SUPPORTED_SATELLITES = ['EUTELSAT', '*'];
const TRAFFIC_SERVICE_CLASSES: GeoTrafficServiceClass[] = ['STAR_FORWARD', 'STAR_RETURN'];
const LEGACY_GEO_GATEWAY_PUBLIC_CODES = new Set(['RAM', 'CAG', 'TUR', 'MEX', 'HER', 'MAR', 'DUB', 'SIN', 'IBA', 'PER']);

const beamIds = (...tokens: Array<number | string>): string[] => tokens.flatMap((token) => {
  if (typeof token === 'number') return [String(token)];
  const [startText, endText] = token.split('-');
  const start = Number(startText);
  const end = Number(endText);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return [token];
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
});

const manualEngineeringEvidence = (
  sourceId: string,
  label: string,
  confidence: CapabilityConfidence = 'PUBLICLY_LIKELY',
  temporal?: TemporalValidity
): EvidenceSource => ({
  sourceId,
  label,
  kind: 'ENGINEERING_NOTE',
  confidence,
  temporal,
});

const kvhtsEngineeringEvidence = manualEngineeringEvidence(
  'manual-kvhts-ground-network',
  'Manual engineering knowledge supplied for KVHTS gateway topology'
);

const kvhtsScanzanoDeploymentEvidence = manualEngineeringEvidence(
  'manual-kvhts-scanzano-april-2024',
  'Manual engineering knowledge: Scanzano/Palermo deployed as the 8th KVHTS gateway in April 2024',
  'PUBLICLY_LIKELY',
  { validFrom: '2024-04' }
);

const e10bGipnEvidence: EvidenceSource = {
  sourceId: 'manual-e10b-gipn-coverage',
  label: 'Manual engineering knowledge from GIPN E10B coverage area',
  kind: 'GIPN',
  confidence: 'CONFIRMED',
};

const e10bOssrEvidence: EvidenceSource = {
  sourceId: 'manual-e10b-ossr-2186',
  label: 'Manual engineering knowledge from OSSR-2186 gateway definitions',
  kind: 'INTERNAL_TICKET',
  reference: 'OSSR-2186',
  confidence: 'CONFIRMED',
};

const e10bRedundancyEvidence = manualEngineeringEvidence(
  'manual-e10b-earth-station-redundancy',
  'Manual engineering knowledge for E10B local Earth Station redundancy',
  'CONFIRMED'
);

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

const publiclyLikelySimulationTeleportCapability = (
  siteId: string,
  source: string
): TrafficTeleportCapability => trafficTeleportCapability(siteId, 'PUBLICLY_LIKELY', source);

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
  groundSite(
    'geo-makarios',
    'MAK',
    'Makarios',
    35.12,
    33.32,
    'EMEA',
    [
      publiclyLikelySimulationTeleportCapability(
        'geo-makarios',
        'Manual engineering knowledge supplied for KVHTS/E10B logical gateway simulations — not publicly independently verified'
      ),
    ]
  ),
  groundSite(
    'geo-scanzano-palermo',
    'PAL',
    'Scanzano / Palermo',
    38.1157,
    13.3615,
    'EMEA',
    [
      publiclyLikelySimulationTeleportCapability(
        'geo-scanzano-palermo',
        'Manual engineering knowledge: KVHTS G4 Scanzano/Palermo deployed in April 2024 — not publicly independently verified'
      ),
    ]
  ),
  groundSite(
    'geo-nemea',
    'NEM',
    'Nemea',
    37.8200,
    22.6610,
    'EMEA',
    [
      publiclyLikelySimulationTeleportCapability(
        'geo-nemea',
        'Manual engineering knowledge supplied for KVHTS logical gateway simulations — not publicly independently verified'
      ),
    ]
  ),
  groundSite(
    'geo-sintra',
    'LIS',
    'Sintra',
    38.8029,
    -9.3817,
    'EMEA',
    [
      publiclyLikelySimulationTeleportCapability(
        'geo-sintra',
        'Manual engineering knowledge supplied for KVHTS logical gateway simulations — not publicly independently verified'
      ),
    ]
  ),
  groundSite(
    'geo-madeira',
    'MDR',
    'Madeira',
    32.7607,
    -16.9595,
    'EMEA',
    [
      publiclyLikelySimulationTeleportCapability(
        'geo-madeira',
        'Manual engineering knowledge supplied for KVHTS logical gateway simulations; KVHTS GW-MAD means Madeira, not Madrid'
      ),
    ]
  ),
  groundSite(
    'geo-sarajevo',
    'SAR',
    'Sarajevo',
    43.8563,
    18.4131,
    'EMEA',
    [
      publiclyLikelySimulationTeleportCapability(
        'geo-sarajevo',
        'Manual engineering knowledge supplied for KVHTS 7+1 backup gateway simulations — not publicly independently verified'
      ),
    ]
  ),
  groundSite(
    'geo-arganda',
    'ARG',
    'Arganda',
    40.3008,
    -3.4386,
    'EMEA',
    []
  ),
];

const KVHTS_SATELLITE_ID = 'KVHTS';
const KONNECT_SATELLITE_ID = 'KONNECT';
const E10B_SATELLITE_ID = 'E10B';
const E36D_SATELLITE_ID = 'E36D';
const E172B_SATELLITE_ID = 'E172B';
const QUANTUM_SATELLITE_ID = 'QUANTUM';

export type StarTrafficTopologySatelliteId =
  | typeof KVHTS_SATELLITE_ID
  | typeof E10B_SATELLITE_ID
  | typeof KONNECT_SATELLITE_ID
  | typeof E36D_SATELLITE_ID
  | typeof E172B_SATELLITE_ID
  | typeof QUANTUM_SATELLITE_ID;

const normalizeSatelliteTopologyKey = (value: string | null | undefined): string => (
  (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
);

const STAR_TRAFFIC_TOPOLOGY_SATELLITE_ALIASES: Record<StarTrafficTopologySatelliteId, string[]> = {
  [KVHTS_SATELLITE_ID]: [
    'KVHTS',
    'KONNECT VHTS',
    'KONNECT_VHTS',
    'EUTELSAT KONNECT VHTS',
    '53765',
  ],
  [E10B_SATELLITE_ID]: [
    'E10B',
    '10B',
    'EUTELSAT 10B',
    '54259',
  ],
  [KONNECT_SATELLITE_ID]: [
    'KONNECT',
    'EUTELSAT KONNECT',
    '45027',
  ],
  [E36D_SATELLITE_ID]: [
    'E36D',
    '36D',
    'EUTELSAT 36D',
    '59346',
  ],
  [E172B_SATELLITE_ID]: [
    'E172B',
    '172B',
    'EUTELSAT 172B',
    '42741',
  ],
  [QUANTUM_SATELLITE_ID]: [
    'QUANTUM',
    'EUTELSAT QUANTUM',
    '49056',
  ],
};

export const canonicalStarTrafficTopologySatelliteId = (
  satellite: SatelliteLike
): StarTrafficTopologySatelliteId | null => {
  const tokens = typeof satellite === 'string'
    ? [satellite]
    : [satellite.id, satellite.name, satellite.noradId, satellite.coverageFileId ?? null];
  const normalizedTokens = new Set(tokens.map(normalizeSatelliteTopologyKey).filter(Boolean));

  for (const [canonicalId, aliases] of Object.entries(STAR_TRAFFIC_TOPOLOGY_SATELLITE_ALIASES)) {
    if (aliases.map(normalizeSatelliteTopologyKey).some((alias) => normalizedTokens.has(alias))) {
      return canonicalId as StarTrafficTopologySatelliteId;
    }
  }

  return null;
};

export const supportsStarTrafficTopology = (satellite: SatelliteLike): boolean => (
  canonicalStarTrafficTopologySatelliteId(satellite) != null
);

const KVHTS_NOMINAL_LOGICAL_GATEWAY_IDS = [
  'kvhts-gw-mak',
  'kvhts-gw-pal',
  'kvhts-gw-nem',
  'kvhts-gw-ram',
  'kvhts-gw-cag',
  'kvhts-gw-lis',
  'kvhts-gw-mad',
] as const;

const BEAM_GATEWAY_ROUTING_SATELLITE_IDS = new Set([KVHTS_SATELLITE_ID, E10B_SATELLITE_ID]);

export const GEO_LOGICAL_GATEWAYS: LogicalGateway[] = [
  {
    logicalGatewayId: 'kvhts-gw-mak',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G1 Makarios',
    gatewayCode: 'GW-MAK',
    group: 'G1',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-eik',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G2 Eik',
    gatewayCode: 'GW-EIK',
    group: 'G2',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-dublin',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G3 Dublin',
    gatewayCode: 'GW-DUB',
    group: 'G3',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-pal',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G4 Scanzano/Palermo',
    gatewayCode: 'GW-PAL',
    group: 'G4',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence, kvhtsScanzanoDeploymentEvidence],
    temporal: { validFrom: '2024-04' },
  },
  {
    logicalGatewayId: 'kvhts-gw-maz',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G5 Mazowiecki',
    gatewayCode: 'GW-MAZ',
    group: 'G5',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-nem',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G6 Nemea',
    gatewayCode: 'GW-NEM',
    group: 'G6',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-arg',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G7 Arganda',
    gatewayCode: 'GW-ARG',
    group: 'G7',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-ram',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G8 Rambouillet',
    gatewayCode: 'GW-RAM',
    group: 'G8',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-cag',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G9 Cagliari',
    gatewayCode: 'GW-CAG',
    group: 'G9',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-sto',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G10 Stockholm',
    gatewayCode: 'GW-STO',
    group: 'G10',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-sar',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G11 Sarajevo',
    gatewayCode: 'GW-SAR',
    group: 'G11',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-lis',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G12 Sintra',
    gatewayCode: 'GW-LIS',
    group: 'G12',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-che',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G13 Cheia',
    gatewayCode: 'GW-CHE',
    group: 'G13',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-lar',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G14 Lario',
    gatewayCode: 'GW-LAR',
    group: 'G14',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-ber',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G15 Berlin',
    gatewayCode: 'GW-BER',
    group: 'G15',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-ank',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G16 Ankara',
    gatewayCode: 'GW-ANK',
    group: 'G16',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-alg',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G17 Algiers',
    gatewayCode: 'GW-ALG',
    group: 'G17',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'kvhts-gw-mad',
    satelliteId: KVHTS_SATELLITE_ID,
    displayName: 'KVHTS G18 Madeira',
    gatewayCode: 'GW-MAD',
    group: 'G18',
    platformId: 'hns-jupiter',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-cag',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW1 Gateway 1000 Cagliari',
    gatewayCode: 'GW-CAG',
    group: 'GW1',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-ram',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW2 Rambouillet Data Center / Hub',
    gatewayCode: 'GW-RAM',
    group: 'GW2',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-sar',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW3 Sarajevo Backup / GIPN hub',
    gatewayCode: 'GW-SAR',
    group: 'GW3',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-arg',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW4 Arganda',
    gatewayCode: 'GW-ARG',
    group: 'GW4',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-sof',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW5 Sofia',
    gatewayCode: 'GW-SOF',
    group: 'GW5',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-kas',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW6 Kashi',
    gatewayCode: 'GW-KAS',
    group: 'GW6',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    logicalGatewayId: 'e10b-gw-mak',
    satelliteId: E10B_SATELLITE_ID,
    displayName: 'E10B GW7 Gateway 7000 Makarios',
    gatewayCode: 'GW-MAK',
    group: 'GW7',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
];

export const GEO_LOGICAL_GATEWAY_ASSIGNMENTS: LogicalGatewayAssignment[] = [
  {
    assignmentId: 'kvhts-gw-mak-assignment',
    logicalGatewayId: 'kvhts-gw-mak',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-makarios',
    trafficTeleportCapabilityId: 'geo-makarios-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-eik-assignment',
    logicalGatewayId: 'kvhts-gw-eik',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-dublin-assignment',
    logicalGatewayId: 'kvhts-gw-dublin',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-pal-assignment',
    logicalGatewayId: 'kvhts-gw-pal',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-scanzano-palermo',
    trafficTeleportCapabilityId: 'geo-scanzano-palermo-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    temporal: { validFrom: '2024-04' },
    evidence: [kvhtsEngineeringEvidence, kvhtsScanzanoDeploymentEvidence],
  },
  {
    assignmentId: 'kvhts-gw-maz-assignment',
    logicalGatewayId: 'kvhts-gw-maz',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-nem-assignment',
    logicalGatewayId: 'kvhts-gw-nem',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-nemea',
    trafficTeleportCapabilityId: 'geo-nemea-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-arg-assignment',
    logicalGatewayId: 'kvhts-gw-arg',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-arganda',
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-ram-assignment',
    logicalGatewayId: 'kvhts-gw-ram',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-rambouillet',
    trafficTeleportCapabilityId: 'geo-rambouillet-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-cag-assignment',
    logicalGatewayId: 'kvhts-gw-cag',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-cagliari',
    trafficTeleportCapabilityId: 'geo-cagliari-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-sto-assignment',
    logicalGatewayId: 'kvhts-gw-sto',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-sar-assignment',
    logicalGatewayId: 'kvhts-gw-sar',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-sarajevo',
    trafficTeleportCapabilityId: 'geo-sarajevo-traffic-teleport',
    role: 'BACKUP',
    deploymentStatus: 'BACKUP_READY',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-lis-assignment',
    logicalGatewayId: 'kvhts-gw-lis',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-sintra',
    trafficTeleportCapabilityId: 'geo-sintra-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-che-assignment',
    logicalGatewayId: 'kvhts-gw-che',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-lar-assignment',
    logicalGatewayId: 'kvhts-gw-lar',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-ber-assignment',
    logicalGatewayId: 'kvhts-gw-ber',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-ank-assignment',
    logicalGatewayId: 'kvhts-gw-ank',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-alg-assignment',
    logicalGatewayId: 'kvhts-gw-alg',
    satelliteId: KVHTS_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-mad-assignment',
    logicalGatewayId: 'kvhts-gw-mad',
    satelliteId: KVHTS_SATELLITE_ID,
    siteId: 'geo-madeira',
    trafficTeleportCapabilityId: 'geo-madeira-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'e10b-gw-cag-assignment',
    logicalGatewayId: 'e10b-gw-cag',
    satelliteId: E10B_SATELLITE_ID,
    siteId: 'geo-cagliari',
    trafficTeleportCapabilityId: 'geo-cagliari-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-ram-assignment',
    logicalGatewayId: 'e10b-gw-ram',
    satelliteId: E10B_SATELLITE_ID,
    siteId: 'geo-rambouillet',
    role: 'HUB',
    deploymentStatus: 'OPERATIONAL',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-sar-assignment',
    logicalGatewayId: 'e10b-gw-sar',
    satelliteId: E10B_SATELLITE_ID,
    siteId: 'geo-sarajevo',
    role: 'BACKUP',
    deploymentStatus: 'BACKUP_READY',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-arg-assignment',
    logicalGatewayId: 'e10b-gw-arg',
    satelliteId: E10B_SATELLITE_ID,
    siteId: 'geo-arganda',
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-sof-assignment',
    logicalGatewayId: 'e10b-gw-sof',
    satelliteId: E10B_SATELLITE_ID,
    role: 'FUTURE',
    deploymentStatus: 'PLANNED',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-kas-assignment',
    logicalGatewayId: 'e10b-gw-kas',
    satelliteId: E10B_SATELLITE_ID,
    role: 'DEFINED_ONLY',
    deploymentStatus: 'DEFINED',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-mak-assignment',
    logicalGatewayId: 'e10b-gw-mak',
    satelliteId: E10B_SATELLITE_ID,
    siteId: 'geo-makarios',
    trafficTeleportCapabilityId: 'geo-makarios-traffic-teleport',
    role: 'NOMINAL',
    deploymentStatus: 'OPERATIONAL',
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
];

export const GEO_BEAM_GATEWAY_ASSIGNMENTS: BeamGatewayAssignment[] = [
  {
    assignmentId: 'kvhts-gw-mak-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-mak',
    beamIds: beamIds(1, 2, 3, 4, 5, 6, 10, 11, 12, 14, 20, 21, 22, 28, 47, 48, 49, 60, 61, 62, 74, 92, 93, 96, 110, 112, 114, 115, 130, 131, 135, 156, 158, 196, 218),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-pal-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-pal',
    beamIds: beamIds(8, 29, 30, 31, 39, 40, 43, 44, 45, 46, 58, 59, 120, 136, '138-143', 154, '162-166', '173-175', 186, 206, 211, 219, 220, 222, 224, '227-230'),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence, kvhtsScanzanoDeploymentEvidence],
    temporal: { validFrom: '2024-04' },
  },
  {
    assignmentId: 'kvhts-gw-nem-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-nem',
    beamIds: beamIds(27, 42, 57, '63-65', 67, 68, 87, 88, 95, '99-102', 105, 107, 108, '116-118', 124, 125, 170, 178, 183, 195, '197-201', 207, '214-216', 221, 223),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-ram-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-ram',
    beamIds: beamIds(7, 13, 73, 75, 76, 94, 111, 113, 121, 129, '132-134', '151-153', 155, 157, 171, 172, 176, 177, '188-191', '202-204'),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-cag-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-cag',
    beamIds: beamIds(16, 19, '32-38', 50, 52, 54, 55, 66, 69, 71, '77-83', 91, 97, 98, 109, 137, 225),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-lis-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-lis',
    beamIds: beamIds(9, '23-26', '84-86', 103, 104, 106, '122-123', '126-128', '145-149', 184, 185, 187, '192-194', 205, '208-210', 212, 213, 217),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'kvhts-gw-mad-beams',
    satelliteId: KVHTS_SATELLITE_ID,
    logicalGatewayId: 'kvhts-gw-mad',
    beamIds: beamIds(15, 17, 18, 41, 51, 53, 56, 70, 72, 89, 90, 119, 144, 150, '159-161', '167-169', '179-182', 226),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    assignmentId: 'e10b-gw-cag-beams',
    satelliteId: E10B_SATELLITE_ID,
    logicalGatewayId: 'e10b-gw-cag',
    beamIds: beamIds('25-40', '47-49', '61-76', 78, 79),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
  {
    assignmentId: 'e10b-gw-mak-beams',
    satelliteId: E10B_SATELLITE_ID,
    logicalGatewayId: 'e10b-gw-mak',
    beamIds: beamIds(1, 2, 3, '7-15', 41, 45, 46, 58, 59, 77, 103, '107-137'),
    direction: 'BIDIRECTIONAL',
    serviceClasses: TRAFFIC_SERVICE_CLASSES,
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
];

// Deliberately retained ahead of the failover capability: resolveBeamGatewayRoute's
// routingMode:'FAILOVER' branch consumes these policies but no runtime caller passes
// that mode yet — only tests exercise it. Wiring a fade/maintenance trigger to
// FAILOVER is the planned next capability; do not delete as dead data.
export const GEO_GATEWAY_REDUNDANCY_POLICIES: GatewayRedundancyPolicy[] = [
  {
    policyId: 'kvhts-sarajevo-any-nominal',
    satelliteId: KVHTS_SATELLITE_ID,
    mode: 'ANY_NOMINAL_REPLACEMENT',
    primaryLogicalGatewayIds: [...KVHTS_NOMINAL_LOGICAL_GATEWAY_IDS],
    backupLogicalGatewayIds: ['kvhts-gw-sar'],
    description: 'Sarajevo can replace any nominal KVHTS gateway in the supplied 7+1 configuration.',
    evidence: [kvhtsEngineeringEvidence],
  },
  {
    policyId: 'e10b-local-earth-station-backups',
    satelliteId: E10B_SATELLITE_ID,
    mode: 'LOCAL_BACKUP',
    primaryLogicalGatewayIds: ['e10b-gw-cag', 'e10b-gw-ram', 'e10b-gw-mak'],
    backupLogicalGatewayIds: [],
    description: 'Operational E10B service/hub gateways have local or co-located Earth Station backup resources.',
    evidence: [e10bRedundancyEvidence],
  },
];

export const GEO_EARTH_STATION_REDUNDANCIES: EarthStationRedundancy[] = [
  {
    redundancyId: 'e10b-ram-rmb-092',
    siteId: 'geo-rambouillet',
    logicalGatewayId: 'e10b-gw-ram',
    satelliteId: E10B_SATELLITE_ID,
    backupResourceName: 'RMB-092 retrofit antenna',
    redundancyType: 'LOCAL_ANTENNA',
    status: 'OPERATIONAL',
    temporal: { validFrom: '2025-01', note: 'Automated since 2025-07.' },
    evidence: [e10bRedundancyEvidence],
  },
  {
    redundancyId: 'e10b-mak-konnect-colocated-es',
    siteId: 'geo-makarios',
    logicalGatewayId: 'e10b-gw-mak',
    satelliteId: E10B_SATELLITE_ID,
    backupResourceName: 'Co-located KONNECT Earth Station',
    redundancyType: 'COLOCATED_EARTH_STATION',
    status: 'BACKUP_READY',
    temporal: { validFrom: '2024-04' },
    evidence: [e10bRedundancyEvidence],
  },
  {
    redundancyId: 'e10b-cag-konnect-colocated-es',
    siteId: 'geo-cagliari',
    logicalGatewayId: 'e10b-gw-cag',
    satelliteId: E10B_SATELLITE_ID,
    backupResourceName: 'Co-located KONNECT Earth Station',
    redundancyType: 'COLOCATED_EARTH_STATION',
    status: 'OPERATIONAL',
    temporal: { validFrom: '2024-06', note: 'Tested and used during maintenance in June 2024.' },
    evidence: [e10bRedundancyEvidence],
  },
];

export const GEO_HUB_DATA_CENTER_CAPABILITIES: HubDataCenterCapability[] = [
  {
    capabilityId: 'geo-rambouillet-e10b-network-hub',
    siteId: 'geo-rambouillet',
    kind: 'NETWORK_HUB',
    confidence: 'CONFIRMED',
    supportedSatellites: [E10B_SATELLITE_ID],
    hubRole: 'TRAFFIC_MANAGEMENT',
    equipment: ['Sandvine'],
    evidence: [e10bGipnEvidence, e10bOssrEvidence],
  },
];

export const getGroundSiteById = (
  siteId: string,
  sites: GroundSite[] = GEO_GROUND_SITES
): GroundSite | null => sites.find((site) => site.siteId === siteId) ?? null;

export const getGroundSiteByPublicCode = (
  publicCode: string,
  sites: GroundSite[] = GEO_GROUND_SITES
): GroundSite | null => sites.find((site) => site.publicCode === publicCode) ?? null;

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

export const resolveRoutableLogicalGatewayAssignment = (
  assignment: LogicalGatewayAssignment,
  {
    sites = GEO_GROUND_SITES,
    minimumConfidence = 'PUBLICLY_LIKELY',
  }: {
    sites?: GroundSite[];
    minimumConfidence?: Extract<CapabilityConfidence, 'CONFIRMED' | 'PUBLICLY_LIKELY'>;
  } = {}
): ResolvedRoutableLogicalGatewayAssignment | null => {
  if (!assignment.siteId || !assignment.trafficTeleportCapabilityId) return null;

  const site = getGroundSiteById(assignment.siteId, sites);
  if (!site) return null;

  const trafficCapability = site.capabilities.find((capability): capability is TrafficTeleportCapability => (
    capability.kind === 'TRAFFIC_TELEPORT' &&
    capability.capabilityId === assignment.trafficTeleportCapabilityId
  ));
  if (!trafficCapability) return null;
  if (!isTrafficTeleportEligible(trafficCapability, minimumConfidence)) return null;

  return { assignment, site, trafficCapability };
};

const beamIdToken = (beamId: string | number): string => String(beamId);

const isNominalRoutingDeployment = (assignment: LogicalGatewayAssignment): boolean => (
  assignment.role === 'NOMINAL' && assignment.deploymentStatus === 'OPERATIONAL'
);

const isFailoverRoutingDeployment = (assignment: LogicalGatewayAssignment): boolean => (
  assignment.role === 'BACKUP' && assignment.deploymentStatus === 'BACKUP_READY'
);

const findFailoverLogicalGatewayAssignment = (
  nominalAssignment: LogicalGatewayAssignment,
  assignments: LogicalGatewayAssignment[],
  policies: GatewayRedundancyPolicy[]
): { assignment: LogicalGatewayAssignment | null; policy: GatewayRedundancyPolicy | null } => {
  const policy = policies.find((entry) => (
    entry.satelliteId === nominalAssignment.satelliteId &&
    entry.mode === 'ANY_NOMINAL_REPLACEMENT' &&
    entry.primaryLogicalGatewayIds.includes(nominalAssignment.logicalGatewayId)
  )) ?? null;
  if (!policy) return { assignment: null, policy: null };

  const assignment = assignments.find((entry) => (
    entry.satelliteId === nominalAssignment.satelliteId &&
    policy.backupLogicalGatewayIds.includes(entry.logicalGatewayId) &&
    isFailoverRoutingDeployment(entry)
  )) ?? null;

  return { assignment, policy };
};

export const resolveBeamGatewayRoute = (
  satelliteId: string,
  beamId: string | number,
  {
    routingMode = 'NOMINAL',
    sites = GEO_GROUND_SITES,
    beamAssignments = GEO_BEAM_GATEWAY_ASSIGNMENTS,
    logicalGatewayAssignments = GEO_LOGICAL_GATEWAY_ASSIGNMENTS,
    redundancyPolicies = GEO_GATEWAY_REDUNDANCY_POLICIES,
    minimumConfidence = 'PUBLICLY_LIKELY',
  }: {
    routingMode?: BeamGatewayRoutingMode;
    sites?: GroundSite[];
    beamAssignments?: BeamGatewayAssignment[];
    logicalGatewayAssignments?: LogicalGatewayAssignment[];
    redundancyPolicies?: GatewayRedundancyPolicy[];
    minimumConfidence?: Extract<CapabilityConfidence, 'CONFIRMED' | 'PUBLICLY_LIKELY'>;
  } = {}
): BeamGatewayResolutionResult => {
  const normalizedSatelliteId = satelliteId.toUpperCase();
  const normalizedBeamId = beamIdToken(beamId);

  if (!BEAM_GATEWAY_ROUTING_SATELLITE_IDS.has(normalizedSatelliteId)) {
    return {
      route: null,
      reason: 'UNSUPPORTED_SATELLITE',
      diagnostic: `Beam-to-gateway routing is not enabled for satellite ${satelliteId}.`,
    };
  }

  const beamAssignment = beamAssignments.find((assignment) => (
    assignment.satelliteId === normalizedSatelliteId &&
    assignment.beamIds.includes(normalizedBeamId)
  ));
  if (!beamAssignment) {
    return {
      route: null,
      reason: 'BEAM_ASSIGNMENT_NOT_FOUND',
      diagnostic: `No beam gateway assignment found for ${normalizedSatelliteId} beam ${normalizedBeamId}.`,
    };
  }

  const nominalLogicalGatewayAssignment = logicalGatewayAssignments.find((assignment) => (
    assignment.satelliteId === normalizedSatelliteId &&
    assignment.logicalGatewayId === beamAssignment.logicalGatewayId
  ));
  if (!nominalLogicalGatewayAssignment) {
    return {
      route: null,
      reason: 'LOGICAL_GATEWAY_ASSIGNMENT_NOT_FOUND',
      diagnostic: `No logical gateway assignment found for ${beamAssignment.logicalGatewayId}.`,
    };
  }

  let logicalGatewayAssignment = nominalLogicalGatewayAssignment;
  let failoverPolicy: GatewayRedundancyPolicy | undefined;

  if (routingMode === 'FAILOVER') {
    const failover = findFailoverLogicalGatewayAssignment(
      nominalLogicalGatewayAssignment,
      logicalGatewayAssignments,
      redundancyPolicies
    );
    if (!failover.policy) {
      return {
        route: null,
        reason: 'FAILOVER_POLICY_NOT_FOUND',
        diagnostic: `No failover policy found for ${nominalLogicalGatewayAssignment.logicalGatewayId}.`,
      };
    }
    if (!failover.assignment) {
      return {
        route: null,
        reason: 'FAILOVER_GATEWAY_NOT_FOUND',
        diagnostic: `No BACKUP_READY failover gateway found for ${nominalLogicalGatewayAssignment.logicalGatewayId}.`,
      };
    }
    logicalGatewayAssignment = failover.assignment;
    failoverPolicy = failover.policy;
  } else if (!isNominalRoutingDeployment(logicalGatewayAssignment)) {
    return {
      route: null,
      reason: 'DEPLOYMENT_STATUS_NOT_ROUTABLE',
      diagnostic: `${logicalGatewayAssignment.logicalGatewayId} is ${logicalGatewayAssignment.role}/${logicalGatewayAssignment.deploymentStatus}, not NOMINAL/OPERATIONAL.`,
    };
  }

  if (routingMode === 'FAILOVER' && !isFailoverRoutingDeployment(logicalGatewayAssignment)) {
    return {
      route: null,
      reason: 'DEPLOYMENT_STATUS_NOT_ROUTABLE',
      diagnostic: `${logicalGatewayAssignment.logicalGatewayId} is ${logicalGatewayAssignment.role}/${logicalGatewayAssignment.deploymentStatus}, not BACKUP/BACKUP_READY.`,
    };
  }

  const routable = resolveRoutableLogicalGatewayAssignment(logicalGatewayAssignment, {
    sites,
    minimumConfidence,
  });
  if (!routable) {
    return {
      route: null,
      reason: 'ROUTABLE_GATEWAY_NOT_RESOLVED',
      diagnostic: `${logicalGatewayAssignment.logicalGatewayId} does not resolve to a GroundSite with an eligible TrafficTeleportCapability.`,
    };
  }

  return {
    route: {
      satelliteId: normalizedSatelliteId,
      beamId: normalizedBeamId,
      routingMode,
      beamAssignment,
      nominalLogicalGatewayAssignment,
      logicalGatewayAssignment,
      site: routable.site,
      trafficCapability: routable.trafficCapability,
      failoverPolicy,
    },
    reason: null,
    diagnostic: `Resolved ${normalizedSatelliteId} beam ${normalizedBeamId} to ${routable.site.name}.`,
  };
};

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
): GeoGatewayData[] => sites
  .filter((site) => LEGACY_GEO_GATEWAY_PUBLIC_CODES.has(site.publicCode))
  .map(projectGroundSiteToLegacyGeoGateway);
