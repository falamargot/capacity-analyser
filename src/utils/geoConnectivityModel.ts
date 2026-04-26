import type { SatelliteData } from '../types/satellites';
import type { GeoGatewayData } from '../components/globe/GlobeConfig';

const DEG_TO_RAD = Math.PI / 180;

const WGS84_A_KM = 6378.137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

export const GEO_EARTH_RADIUS_KM = WGS84_A_KM;
export const GEO_ALTITUDE_KM = 35786;
export const SPEED_OF_LIGHT_M_S = 299792458;

export const DEFAULT_GEO_OVERHEAD_MS = {
  gatewayProcessingDelayMs: 15,
  modemProcessingDelayMs: 20,
  routingDelayMs: 30,
};

const DEFAULT_RANGES = {
  minUserStableElevationDeg: 5,
  minGatewayElevationDeg: 5,
  userSatLatencyToleranceMs: 1.0,
  expectedRttMinMs: 500,
  expectedRttMaxMs: 700,
  suspiciousLowRttMs: 450,
};

const SCC_FAILOVER_MAX_LATENCY_MS = 500;

const APAC_MONITORING_CODES = new Set(['PER', 'SIN', 'IBA'] as const);
const CSC_VERIFICATION_CODES = ['TUR', 'RAM'] as const;

interface PointLLA {
  lat: number;
  lng: number;
  altKm: number;
}

interface EcefPoint {
  x: number;
  y: number;
  z: number;
}

export interface GeoGatewaySelection {
  gateway: GeoGatewayData;
  gatewayElevationDeg: number;
  satToGatewayDistanceKm: number;
}

export type GatewayAssignmentRole = 'primary' | 'backup';

export type GroundSegmentTeleportCode =
  | 'RAM'
  | 'TUR'
  | 'CAG'
  | 'MEX'
  | 'HER'
  | 'DUB'
  | 'PER'
  | 'SIN'
  | 'IBA'
  | 'MAR';

export interface GatewaySatelliteAssignment {
  satelliteName: string;
  satelliteId: string;
  nominalSccCode: GroundSegmentTeleportCode;
  backupSccCode: GroundSegmentTeleportCode | null;
  monitoringCodes: GroundSegmentTeleportCode[];
}

export interface GroundSegmentRouting {
  satelliteId: string;
  satelliteName: string;
  nominalScc: GeoGatewayData | null;
  backupScc: GeoGatewayData | null;
  nominalMonitoring: GeoGatewayData | null;
  monitoring: GeoGatewayData[];
}

interface GroundSegmentSelectionOptions {
  criticalFailureRegions?: string[];
  maxLatencyMs?: number;
  minVisibilityDeg?: number;
}

export interface GeoConnectivityResult {
  satelliteSlotDeg: number;
  userToSatellite: {
    elevationDeg: number;
    slantRangeKm: number;
    latencyMs: number;
  };
  satelliteToGateway: {
    gateway: GeoGatewayData | null;
    gatewayElevationDeg: number | null;
    slantRangeKm: number | null;
    latencyMs: number | null;
  };
  oneWayRadioMs: number | null;
  propagationBreakdownMs: {
    userToSatellite: number | null;
    satelliteToGateway: number | null;
    gatewayToSatellite: number | null;
    satelliteToUser: number | null;
  };
  rttPropagationMs: number | null;
  overheadMs: {
    gatewayProcessing: number;
    modemProcessing: number;
    routing: number;
    total: number;
  };
  rttTotalMs: number | null;
  warnings: string[];
  isUserLinkUnstable: boolean;
}

interface AnalyzeGeoConnectivityArgs {
  userPoint: { lat: number; lng: number; altitude?: number };
  satellite: SatelliteData;
  gateways: GeoGatewayData[];
  overheadMs?: Partial<typeof DEFAULT_GEO_OVERHEAD_MS>;
}

function toRadians(deg: number): number {
  return deg * DEG_TO_RAD;
}

function toEcef(point: PointLLA): EcefPoint {
  const lat = toRadians(point.lat);
  const lng = toRadians(point.lng);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  return {
    x: (n + point.altKm) * cosLat * Math.cos(lng),
    y: (n + point.altKm) * cosLat * Math.sin(lng),
    z: (n * (1 - WGS84_E2) + point.altKm) * sinLat,
  };
}

function distanceKm(a: PointLLA, b: PointLLA): number {
  const ea = toEcef(a);
  const eb = toEcef(b);
  const dx = eb.x - ea.x;
  const dy = eb.y - ea.y;
  const dz = eb.z - ea.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function elevationDeg(observer: PointLLA, target: PointLLA): number {
  const eo = toEcef(observer);
  const et = toEcef(target);
  const dx = et.x - eo.x;
  const dy = et.y - eo.y;
  const dz = et.z - eo.z;

  const lat = toRadians(observer.lat);
  const lng = toRadians(observer.lng);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLng = Math.sin(lng);
  const cosLng = Math.cos(lng);

  const east = -sinLng * dx + cosLng * dy;
  const north = -sinLat * cosLng * dx - sinLat * sinLng * dy + cosLat * dz;
  const up = cosLat * cosLng * dx + cosLat * sinLng * dy + sinLat * dz;

  const horizontal = Math.sqrt(east * east + north * north);
  return Math.atan2(up, horizontal) * (180 / Math.PI);
}

function latencyMsFromDistanceKm(distance: number): number {
  const distanceMeters = distance * 1000;
  return (distanceMeters / SPEED_OF_LIGHT_M_S) * 1000;
}

function slantRangeKmForElevation(
  earthRadiusKm: number,
  satelliteAltitudeKm: number,
  elevationDegValue: number
): number {
  const orbitalRadiusKm = earthRadiusKm + satelliteAltitudeKm;
  const elevationRad = toRadians(elevationDegValue);
  const cosElevation = Math.cos(elevationRad);
  const sinElevation = Math.sin(elevationRad);

  return Math.sqrt(
    Math.max(orbitalRadiusKm * orbitalRadiusKm - earthRadiusKm * earthRadiusKm * cosElevation * cosElevation, 0)
  ) - earthRadiusKm * sinElevation;
}

function getGeoUserLatencyBoundsMs(
  satelliteAltitudeKm: number,
  minStableElevationDeg: number
): {
  minMs: number;
  maxStableMs: number;
  maxVisibleMs: number;
} {
  return {
    minMs: latencyMsFromDistanceKm(satelliteAltitudeKm),
    maxStableMs: latencyMsFromDistanceKm(
      slantRangeKmForElevation(GEO_EARTH_RADIUS_KM, satelliteAltitudeKm, minStableElevationDeg)
    ),
    maxVisibleMs: latencyMsFromDistanceKm(
      slantRangeKmForElevation(GEO_EARTH_RADIUS_KM, satelliteAltitudeKm, 0)
    ),
  };
}

function getGatewayLatLng(gateway: GeoGatewayData): { lat: number; lng: number } {
  if (Number.isFinite(gateway.latitude) && Number.isFinite(gateway.longitude)) {
    return { lat: gateway.latitude, lng: gateway.longitude };
  }
  return { lat: gateway.lat, lng: gateway.lng };
}

function gatewaySupportsSatellite(gateway: GeoGatewayData, satellite: SatelliteData): boolean {
  const supported = gateway.supported_satellites;
  if (!supported || supported.length === 0) return true;

  const satName = satellite.name.toUpperCase();
  const satId = satellite.id.toUpperCase();
  const satNorad = satellite.noradId.toUpperCase();
  const satType = satellite.type.toUpperCase();

  return supported.some((entry) => {
    const key = entry.toUpperCase();
    return key === '*' || key === satName || key === satId || key === satNorad || key === satType;
  });
}

function getGeoSatellitePoint(satellite: SatelliteData): PointLLA {
  const satLat = Number.isFinite(satellite.position.lat) ? satellite.position.lat : 0;
  const satLng = Number.isFinite(satellite.position.lng) ? satellite.position.lng : 0;
  const satAlt = Number.isFinite(satellite.position.alt) && satellite.position.alt > 1000
    ? satellite.position.alt
    : GEO_ALTITUDE_KM;

  return {
    lat: satLat,
    lng: satLng,
    altKm: satAlt,
  };
}

const GEO_GATEWAY_ASSIGNMENTS: GatewaySatelliteAssignment[] = [
  { satelliteId: '139WA', satelliteName: 'EUTELSAT 139 WEST A', nominalSccCode: 'MEX', backupSccCode: 'HER', monitoringCodes: ['MEX', 'MAR', 'PER'] },
  { satelliteId: '174A', satelliteName: 'EUTELSAT 174A', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['IBA', 'SIN', 'PER'] },
  { satelliteId: '33F', satelliteName: 'EUTELSAT 33F', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: '13C', satelliteName: 'EUTELSAT HOTBIRD 13C', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: '36B', satelliteName: 'EUTELSAT 36B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'DUB'] },
  { satelliteId: 'KA-SAT_9A', satelliteName: 'EUTELSAT KA-SAT 9A', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['TUR', 'RAM'] },
  { satelliteId: '7WA', satelliteName: 'EUTELSAT 7 WEST A', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['DUB', 'RAM'] },
  { satelliteId: '16A', satelliteName: 'EUTELSAT 16A', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: '21B', satelliteName: 'EUTELSAT 21B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['DUB', 'RAM'] },
  { satelliteId: '70B', satelliteName: 'EUTELSAT 70B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['PER', 'DUB'] },
  { satelliteId: '117WA', satelliteName: 'EUTELSAT 117 WEST A', nominalSccCode: 'MEX', backupSccCode: 'HER', monitoringCodes: ['MEX', 'MAR'] },
  { satelliteId: '7B', satelliteName: 'EUTELSAT 7B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'DUB'] },
  { satelliteId: '3B', satelliteName: 'EUTELSAT 3B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['DUB', 'RAM'] },
  { satelliteId: '53A', satelliteName: 'EUTELSAT 53A', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['DUB', 'RAM'] },
  { satelliteId: '115WB', satelliteName: 'EUTELSAT 115 WEST B', nominalSccCode: 'MEX', backupSccCode: 'HER', monitoringCodes: ['MEX', 'MAR'] },
  { satelliteId: '8WB', satelliteName: 'EUTELSAT 8 WEST B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['DUB', 'RAM'] },
  { satelliteId: '9B', satelliteName: 'EUTELSAT 9B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: '65WA', satelliteName: 'EUTELSAT 65 WEST A', nominalSccCode: 'MEX', backupSccCode: 'HER', monitoringCodes: ['MAR', 'MEX'] },
  { satelliteId: '117WB', satelliteName: 'EUTELSAT 117 WEST B', nominalSccCode: 'MEX', backupSccCode: 'HER', monitoringCodes: ['MEX', 'MAR'] },
  { satelliteId: '172B', satelliteName: 'EUTELSAT 172B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['PER', 'SIN', 'IBA'] },
  { satelliteId: '7C', satelliteName: 'EUTELSAT 7C', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'DUB'] },
  { satelliteId: '5WB', satelliteName: 'EUTELSAT 5 WEST B', nominalSccCode: 'RAM', backupSccCode: 'CAG', monitoringCodes: ['RAM', 'CAG'] },
  { satelliteId: 'KONNECT', satelliteName: 'EUTELSAT KONNECT', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['TUR', 'RAM'] },
  { satelliteId: 'QUANTUM', satelliteName: 'EUTELSAT QUANTUM', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: 'KONNECT_VHTS', satelliteName: 'EUTELSAT KONNECT VHTS', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['TUR', 'RAM'] },
  { satelliteId: '13F', satelliteName: 'EUTELSAT HOTBIRD 13F', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: '13G', satelliteName: 'EUTELSAT HOTBIRD 13G', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'TUR'] },
  { satelliteId: '10B', satelliteName: 'EUTELSAT 10B', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'MAR', 'DUB'] },
  { satelliteId: '36D', satelliteName: 'EUTELSAT 36D', nominalSccCode: 'RAM', backupSccCode: 'TUR', monitoringCodes: ['RAM', 'DUB'] },
];

const GATEWAY_ASSIGNMENT_BY_SATELLITE = new Map(
  GEO_GATEWAY_ASSIGNMENTS.map((assignment) => [assignment.satelliteName.toUpperCase(), assignment])
);

function getGatewayByCode(
  gateways: GeoGatewayData[],
  teleportCode: GroundSegmentTeleportCode | null
): GeoGatewayData | null {
  if (!teleportCode) return null;
  return gateways.find((gateway) => gateway.teleportCode === teleportCode) ?? null;
}

function getGatewaySelectionForCandidate(
  satellite: SatelliteData,
  gateway: GeoGatewayData | null,
  minGatewayElevationDeg = DEFAULT_RANGES.minGatewayElevationDeg
): GeoGatewaySelection | null {
  if (!gateway || !gatewaySupportsSatellite(gateway, satellite)) return null;

  const satPoint = getGeoSatellitePoint(satellite);
  const coords = getGatewayLatLng(gateway);
  const gatewayPoint: PointLLA = { lat: coords.lat, lng: coords.lng, altKm: 0 };
  const gatewayElevationDeg = elevationDeg(gatewayPoint, satPoint);
  if (gatewayElevationDeg < minGatewayElevationDeg) return null;

  return {
    gateway,
    gatewayElevationDeg,
    satToGatewayDistanceKm: distanceKm(satPoint, gatewayPoint),
  };
}

function isAsiaPacificSatellite(satellite: SatelliteData): boolean {
  return satellite.position.lng >= 70 && satellite.position.lng <= 180;
}

function isAmericasAutonomySatellite(assignment: GatewaySatelliteAssignment): boolean {
  return assignment.satelliteId === '115WB' || assignment.satelliteId === '117WA' || assignment.satelliteId === '117WB';
}

function isKaMonitoringConstrainedSatellite(satellite: SatelliteData): boolean {
  const normalized = satellite.name.toUpperCase();
  return normalized === 'EUTELSAT KONNECT' || normalized === 'EUTELSAT KONNECT VHTS';
}

function getMonitoringCodesForAssignment(
  assignment: GatewaySatelliteAssignment,
  satellite: SatelliteData
): GroundSegmentTeleportCode[] {
  let monitoringCodes = [...assignment.monitoringCodes];

  if (isAsiaPacificSatellite(satellite) && !monitoringCodes.some((code) => APAC_MONITORING_CODES.has(code))) {
    monitoringCodes = ['PER', ...monitoringCodes];
  }

  if (isKaMonitoringConstrainedSatellite(satellite)) {
    monitoringCodes = monitoringCodes.filter((code) => CSC_VERIFICATION_CODES.includes(code as typeof CSC_VERIFICATION_CODES[number]));
  }

  return monitoringCodes;
}

function getGatewayLatencyMs(selection: GeoGatewaySelection | null): number | null {
  if (!selection) return null;
  return latencyMsFromDistanceKm(selection.satToGatewayDistanceKm);
}

function selectConfiguredGateway(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  primaryCode: GroundSegmentTeleportCode | null,
  backupCode: GroundSegmentTeleportCode | null,
  {
    maxLatencyMs = SCC_FAILOVER_MAX_LATENCY_MS,
    minVisibilityDeg = DEFAULT_RANGES.minGatewayElevationDeg,
  }: GroundSegmentSelectionOptions = {}
): GeoGatewaySelection | null {
  const primarySelection = getGatewaySelectionForCandidate(
    satellite,
    getGatewayByCode(gateways, primaryCode),
    minVisibilityDeg
  );
  const backupSelection = getGatewaySelectionForCandidate(
    satellite,
    getGatewayByCode(gateways, backupCode),
    minVisibilityDeg
  );

  const primaryLatencyMs = getGatewayLatencyMs(primarySelection);
  if (primarySelection && primaryLatencyMs != null && primaryLatencyMs <= maxLatencyMs) {
    return primarySelection;
  }

  const backupLatencyMs = getGatewayLatencyMs(backupSelection);
  if (backupSelection && backupLatencyMs != null && backupLatencyMs <= maxLatencyMs) {
    return backupSelection;
  }

  return primarySelection ?? backupSelection;
}

function isGatewayEligibleForSatellite(
  gateway: GeoGatewayData | null,
  satellite: SatelliteData,
  minGatewayElevationDeg = DEFAULT_RANGES.minGatewayElevationDeg
): gateway is GeoGatewayData {
  if (!gateway || !gatewaySupportsSatellite(gateway, satellite)) return false;

  const satPoint = getGeoSatellitePoint(satellite);
  const coords = getGatewayLatLng(gateway);
  const gatewayPoint: PointLLA = { lat: coords.lat, lng: coords.lng, altKm: 0 };
  return elevationDeg(gatewayPoint, satPoint) >= minGatewayElevationDeg;
}

export function getGatewayAssignmentsForSatellite(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  options: GroundSegmentSelectionOptions = {}
): { primary: GeoGatewayData | null; backup: GeoGatewayData | null } {
  if (satellite.orbitType !== 'GEO' || satellite.type !== 'EUTELSAT' || satellite.opsStatus !== 'operational') {
    return { primary: null, backup: null };
  }

  const assignment = GATEWAY_ASSIGNMENT_BY_SATELLITE.get(satellite.name.toUpperCase());
  if (assignment) {
    const criticalFailureRegions = new Set(options.criticalFailureRegions ?? []);
    const enforceAmericasAutonomy = isAmericasAutonomySatellite(assignment) && !criticalFailureRegions.has('AMERICAS');
    const nominalScc = getGatewayByCode(gateways, assignment.nominalSccCode);
    const backupScc = getGatewayByCode(gateways, assignment.backupSccCode);
    const eligiblePrimary = isGatewayEligibleForSatellite(nominalScc, satellite) ? nominalScc : null;
    const eligibleBackup = isGatewayEligibleForSatellite(backupScc, satellite) ? backupScc : null;

    if (enforceAmericasAutonomy) {
      return {
        primary: eligiblePrimary ?? eligibleBackup,
        backup: eligiblePrimary && eligibleBackup ? eligibleBackup : null,
      };
    }

    if (nominalScc || backupScc) {
      return {
        primary: nominalScc,
        backup: backupScc,
      };
    }
  }

  const fallback = selectBestGeoGateway(satellite, gateways);
  return {
    primary: fallback?.gateway ?? null,
    backup: null,
  };
}

export function getAssignedGeoSatellitesForGateway(
  gateway: GeoGatewayData,
  satellites: SatelliteData[],
  gateways: GeoGatewayData[]
): { primary: SatelliteData[]; backup: SatelliteData[] } {
  const geoSatellites = satellites.filter((satellite) => satellite.orbitType === 'GEO' && satellite.type === 'EUTELSAT');
  const primary: SatelliteData[] = [];
  const backup: SatelliteData[] = [];

  for (const satellite of geoSatellites) {
    const assignments = getGatewayAssignmentsForSatellite(satellite, gateways);
    if (assignments.primary?.name === gateway.name) {
      primary.push(satellite);
    }
    if (assignments.backup?.name === gateway.name) {
      backup.push(satellite);
    }
  }

  primary.sort((a, b) => a.name.localeCompare(b.name));
  backup.sort((a, b) => a.name.localeCompare(b.name));

  return { primary, backup };
}

export function getGroundSegmentRoutingForSatellite(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  options: GroundSegmentSelectionOptions = {}
): GroundSegmentRouting | null {
  if (satellite.orbitType !== 'GEO' || satellite.type !== 'EUTELSAT' || satellite.opsStatus !== 'operational') {
    return null;
  }

  const assignment = GATEWAY_ASSIGNMENT_BY_SATELLITE.get(satellite.name.toUpperCase());
  if (!assignment) {
    const fallbackGateway = selectBestGeoGateway(satellite, gateways, options.minVisibilityDeg)?.gateway ?? null;
    return {
      satelliteId: satellite.id,
      satelliteName: satellite.name,
      nominalScc: fallbackGateway,
      backupScc: null,
      nominalMonitoring: fallbackGateway,
      monitoring: fallbackGateway ? [fallbackGateway] : [],
    };
  }

  const nominalScc = getGatewayByCode(gateways, assignment.nominalSccCode);
  const backupScc = getGatewayByCode(gateways, assignment.backupSccCode);
  const monitoringCodes = getMonitoringCodesForAssignment(assignment, satellite);
  const monitoring = monitoringCodes
    .map((code) => getGatewayByCode(gateways, code))
    .filter((gateway): gateway is GeoGatewayData => gateway != null);

  return {
    satelliteId: assignment.satelliteId,
    satelliteName: satellite.name,
    nominalScc,
    backupScc,
    nominalMonitoring: monitoring[0] ?? null,
    monitoring,
  };
}

export function getGroundSegmentConfirmationStatuses(
  gateways: GeoGatewayData[]
): Array<{ satelliteId: string; nominalScc: string | null; nominalMonitoring: string | null }> {
  return GEO_GATEWAY_ASSIGNMENTS.map((assignment) => {
    const nominalScc = getGatewayByCode(gateways, assignment.nominalSccCode);
    const nominalMonitoring = getGatewayByCode(
      gateways,
      getMonitoringCodesForAssignment(
        {
          ...assignment,
          monitoringCodes: [...assignment.monitoringCodes],
        },
        {
          id: assignment.satelliteId,
          name: assignment.satelliteName,
          noradId: assignment.satelliteId,
          coverageFileId: null,
          type: 'EUTELSAT',
          orbitType: 'GEO',
          opsStatus: 'operational',
          satrec: null,
          position: { lat: 0, lng: 0, alt: GEO_ALTITUDE_KM },
          referenced_coverages: { type: 'FeatureCollection', features: [] },
          coverages: [],
          capacity: {
            maxThroughput: 0,
            bandwidth: { ku: 0, ka: 0, c: 0 },
            availability: 1,
          },
        }
      )[0] ?? null
    );

    return {
      satelliteId: assignment.satelliteId,
      nominalScc: nominalScc?.name ?? null,
      nominalMonitoring: nominalMonitoring?.name ?? null,
    };
  });
}

export function selectOperationalGeoGateway(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  options: GroundSegmentSelectionOptions = {}
): GeoGatewaySelection | null {
  const assignment = GATEWAY_ASSIGNMENT_BY_SATELLITE.get(satellite.name.toUpperCase());
  if (!assignment) {
    return selectBestGeoGateway(satellite, gateways, options.minVisibilityDeg);
  }

  const criticalFailureRegions = new Set(options.criticalFailureRegions ?? []);
  if (isAmericasAutonomySatellite(assignment) && criticalFailureRegions.has('AMERICAS')) {
    return selectBestGeoGateway(satellite, gateways, options.minVisibilityDeg);
  }

  const monitoringCodes = getMonitoringCodesForAssignment(assignment, satellite);
  for (const code of monitoringCodes) {
    const selection = getGatewaySelectionForCandidate(
      satellite,
      getGatewayByCode(gateways, code),
      options.minVisibilityDeg
    );
    const latencyMs = getGatewayLatencyMs(selection);
    if (selection && latencyMs != null && latencyMs <= (options.maxLatencyMs ?? SCC_FAILOVER_MAX_LATENCY_MS)) {
      return selection;
    }
  }

  return selectConfiguredGateway(
    satellite,
    gateways,
    assignment.nominalSccCode,
    assignment.backupSccCode,
    options
  );
}

export function selectTrafficGeoGateway(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  options: GroundSegmentSelectionOptions = {}
): GeoGatewaySelection | null {
  const assignment = GATEWAY_ASSIGNMENT_BY_SATELLITE.get(satellite.name.toUpperCase());
  if (!assignment) {
    return selectBestGeoGateway(satellite, gateways, options.minVisibilityDeg);
  }

  const criticalFailureRegions = new Set(options.criticalFailureRegions ?? []);
  if (isAmericasAutonomySatellite(assignment) && criticalFailureRegions.has('AMERICAS')) {
    return selectBestGeoGateway(satellite, gateways, options.minVisibilityDeg);
  }

  return selectConfiguredGateway(
    satellite,
    gateways,
    assignment.nominalSccCode,
    assignment.backupSccCode,
    options
  ) ?? selectBestGeoGateway(satellite, gateways, options.minVisibilityDeg);
}

export function selectBestGeoGateway(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  minGatewayElevationDeg = DEFAULT_RANGES.minGatewayElevationDeg
): GeoGatewaySelection | null {
  let best: GeoGatewaySelection | null = null;

  for (const gateway of gateways) {
    const candidate = getGatewaySelectionForCandidate(satellite, gateway, minGatewayElevationDeg);
    if (!candidate) continue;
    if (!best || candidate.satToGatewayDistanceKm < best.satToGatewayDistanceKm) {
      best = candidate;
    }
  }

  return best;
}

export function getMonitoredGeoSatellitesForGateway(
  gateway: GeoGatewayData,
  satellites: SatelliteData[],
  gateways: GeoGatewayData[]
): SatelliteData[] {
  const operationalGeo = satellites.filter(
    (s) => s.orbitType === 'GEO' && s.type === 'EUTELSAT' && s.opsStatus === 'operational'
  );
  return operationalGeo.filter((satellite) => {
    const routing = getGroundSegmentRoutingForSatellite(satellite, gateways);
    return routing?.monitoring.some((gw) => gw.name === gateway.name) ?? false;
  });
}

export function analyzeGeoConnectivity({
  userPoint,
  satellite,
  gateways,
  overheadMs,
}: AnalyzeGeoConnectivityArgs): GeoConnectivityResult {
  const satPoint = getGeoSatellitePoint(satellite);
  const userLla: PointLLA = {
    lat: userPoint.lat,
    lng: userPoint.lng,
    altKm: userPoint.altitude ?? 0,
  };

  const userSatDistanceKm = distanceKm(userLla, satPoint);
  const userElevationDeg = elevationDeg(userLla, satPoint);
  const userSatLatencyMs = latencyMsFromDistanceKm(userSatDistanceKm);
  const selectedGateway = selectTrafficGeoGateway(satellite, gateways);

  const delays = {
    ...DEFAULT_GEO_OVERHEAD_MS,
    ...overheadMs,
  };
  const networkOverheadTotalMs =
    delays.gatewayProcessingDelayMs + delays.modemProcessingDelayMs + delays.routingDelayMs;

  let gatewayElevationDeg: number | null = null;
  let satGatewayDistanceKm: number | null = null;
  let satGatewayLatencyMs: number | null = null;
  let oneWayRadioMs: number | null = null;
  let rttPropagationMs: number | null = null;
  let rttTotalMs: number | null = null;

  if (selectedGateway) {
    gatewayElevationDeg = selectedGateway.gatewayElevationDeg;
    satGatewayDistanceKm = selectedGateway.satToGatewayDistanceKm;
    satGatewayLatencyMs = latencyMsFromDistanceKm(satGatewayDistanceKm);
    oneWayRadioMs = userSatLatencyMs + satGatewayLatencyMs;
    rttPropagationMs = 2 * oneWayRadioMs;
    rttTotalMs = rttPropagationMs + networkOverheadTotalMs;
  }

  const warnings: string[] = [];
  const isUserLinkUnstable = userElevationDeg < DEFAULT_RANGES.minUserStableElevationDeg;
  const geoUserLatencyBoundsMs = getGeoUserLatencyBoundsMs(
    satPoint.altKm,
    DEFAULT_RANGES.minUserStableElevationDeg
  );

  if (isUserLinkUnstable) {
    warnings.push(`User-satellite elevation below ${DEFAULT_RANGES.minUserStableElevationDeg} deg: unstable link.`);
  }
  if (!selectedGateway) {
    warnings.push(
      `No eligible monitoring gateway found (visibility >= ${DEFAULT_RANGES.minGatewayElevationDeg} deg).`
    );
  }
  if (userSatLatencyMs < geoUserLatencyBoundsMs.minMs - DEFAULT_RANGES.userSatLatencyToleranceMs) {
    warnings.push(
      `User-satellite one-way latency below GEO nadir floor (${geoUserLatencyBoundsMs.minMs.toFixed(1)} ms reference).`
    );
  } else if (
    !isUserLinkUnstable &&
    userSatLatencyMs > geoUserLatencyBoundsMs.maxStableMs + DEFAULT_RANGES.userSatLatencyToleranceMs
  ) {
    warnings.push(
      `User-satellite one-way latency above expected GEO stable-link envelope (${geoUserLatencyBoundsMs.maxStableMs.toFixed(1)} ms max at ${DEFAULT_RANGES.minUserStableElevationDeg} deg elevation).`
    );
  } else if (
    isUserLinkUnstable &&
    userSatLatencyMs > geoUserLatencyBoundsMs.maxVisibleMs + DEFAULT_RANGES.userSatLatencyToleranceMs
  ) {
    warnings.push(
      `User-satellite one-way latency above GEO visibility envelope (${geoUserLatencyBoundsMs.maxVisibleMs.toFixed(1)} ms horizon reference).`
    );
  }
  if (rttTotalMs != null) {
    if (rttTotalMs < DEFAULT_RANGES.suspiciousLowRttMs) {
      warnings.push(`End-to-end GEO RTT is unusually low (< ${DEFAULT_RANGES.suspiciousLowRttMs} ms).`);
    }
    if (rttTotalMs < DEFAULT_RANGES.expectedRttMinMs || rttTotalMs > DEFAULT_RANGES.expectedRttMaxMs) {
      warnings.push(
        `End-to-end GEO RTT outside expected ${DEFAULT_RANGES.expectedRttMinMs}-${DEFAULT_RANGES.expectedRttMaxMs} ms range.`
      );
    }
  }

  return {
    satelliteSlotDeg: satellite.position.lng,
    userToSatellite: {
      elevationDeg: userElevationDeg,
      slantRangeKm: userSatDistanceKm,
      latencyMs: userSatLatencyMs,
    },
    satelliteToGateway: {
      gateway: selectedGateway?.gateway ?? null,
      gatewayElevationDeg,
      slantRangeKm: satGatewayDistanceKm,
      latencyMs: satGatewayLatencyMs,
    },
    oneWayRadioMs,
    propagationBreakdownMs: {
      userToSatellite: userSatLatencyMs,
      satelliteToGateway: satGatewayLatencyMs,
      gatewayToSatellite: satGatewayLatencyMs,
      satelliteToUser: userSatLatencyMs,
    },
    rttPropagationMs,
    overheadMs: {
      gatewayProcessing: delays.gatewayProcessingDelayMs,
      modemProcessing: delays.modemProcessingDelayMs,
      routing: delays.routingDelayMs,
      total: networkOverheadTotalMs,
    },
    rttTotalMs,
    warnings,
    isUserLinkUnstable,
  };
}
