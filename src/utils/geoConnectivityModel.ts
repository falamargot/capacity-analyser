import type { SatelliteData } from '../types/satellites';
import type { CandidateCoverage } from '../types/analysis';
import type { GatewayTrafficStatus, GeoGatewayData } from '../components/globe/GlobeConfig';
import {
  canonicalStarTrafficTopologySatelliteId,
  getGroundSiteById,
  getGroundSiteByPublicCode,
  getTrafficTeleportCapabilityForLegacyGateway,
  projectGroundSiteToLegacyGeoGateway,
  resolveBeamGatewayRoute,
  type BeamGatewayResolutionFailureReason,
  type GeoTrafficServiceClass,
  type ResolvedBeamGatewayRoute,
  type TrafficTeleportCapability,
} from './geoGroundInfrastructure';
import { WGS84_A_KM, geodeticToEcef } from './wgs84Geometry';

const DEG_TO_RAD = Math.PI / 180;

/** Re-exported for existing GEO call sites; the ellipsoid lives in wgs84Geometry. */
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

const APAC_MONITORING_CODES = new Set<GroundSegmentTeleportCode>(['PER', 'SIN', 'IBA']);
const CSC_VERIFICATION_CODES = ['TUR', 'RAM'] as const;

export interface PointLLA {
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

/**
 * Return type of selectTrafficGeoGateway(). Extends GeoGatewaySelection (additive,
 * not breaking) with the trafficStatus of the chosen site so the UI can warn when
 * the link budget is computed against a PUBLICLY_LIKELY (not internally CONFIRMED)
 * teleport site.
 */
export interface TrafficGatewaySelection extends GeoGatewaySelection {
  trafficStatus: GatewayTrafficStatus;
  trafficCapability: TrafficTeleportCapability;
  resolvedGateway: ResolvedGeoGateway;
}

export type StarTrafficGatewayResolutionSource =
  | 'beam-gateway-assignment'
  | 'legacy-traffic-gateway'
  | 'gateway-outage';

export interface StarTrafficGatewayDiagnostic {
  source: StarTrafficGatewayResolutionSource;
  satelliteId: string;
  canonicalSatelliteId: string | null;
  beamToken: string | null;
  reason: BeamGatewayResolutionFailureReason | 'BEAM_TOKEN_NOT_FOUND' | 'GATEWAY_OUT_OF_SERVICE' | null;
  message: string;
}

export interface StarTrafficGatewaySelection {
  gateway: GeoGatewayData;
  trafficCapability: TrafficTeleportCapability;
  diagnostic: StarTrafficGatewayDiagnostic;
  beamRoute: ResolvedBeamGatewayRoute | null;
  legacySelection: TrafficGatewaySelection | null;
  /**
   * Display-ready projection of `gateway` (marker position, highlight identity,
   * elevation/slant geometry). Always present so display surfaces (globe HUB
   * marker, commercial route) can consume the beam-aware selection directly
   * instead of re-resolving through the legacy per-satellite path.
   */
  resolvedGateway: ResolvedGeoGateway;
}

/**
 * A beam whose curated gateway allocation cannot be honored because the nominal
 * site (and any failover site) is simulated out of service. The beam is
 * physically bound to those sites, so no substitute gateway exists — callers
 * must surface "unserved" instead of silently re-resolving through the legacy
 * per-satellite path (which would fabricate service through a site that has no
 * assignment for this beam).
 */
export interface StarTrafficGatewayOutage {
  gateway: null;
  trafficCapability: null;
  diagnostic: StarTrafficGatewayDiagnostic;
  beamRoute: null;
  legacySelection: TrafficGatewaySelection | null;
  resolvedGateway: null;
}

export type StarTrafficGatewayResolution = StarTrafficGatewaySelection | StarTrafficGatewayOutage;

export const isServedStarGatewaySelection = (
  selection: StarTrafficGatewayResolution | null | undefined
): selection is StarTrafficGatewaySelection => selection?.gateway != null;

export type GatewayAssignmentRole = 'primary' | 'backup';
export type ResolvedGatewayRole = 'nominal' | 'backup';
export type GatewayResolutionPolicy = 'STATIC_NOMINAL' | 'STATIC_BACKUP';
export type GatewayAssignmentSource = 'reference-gateway-allocation' | 'fallback-visible-gateway';

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

export interface ResolvedGeoGateway {
  gatewayId: string;
  gatewayName: string;
  latitude: number;
  longitude: number;
  controlAssignmentRole: ResolvedGatewayRole;
  reason: string;
  assignmentSource: GatewayAssignmentSource;
  teleportCode: GroundSegmentTeleportCode | string;
  region: string;
  gateway: GeoGatewayData;
  gatewayElevationDeg: number;
  satToGatewayDistanceKm: number;
}

/**
 * Single formatter for "gateway name + role" wherever a plain ResolvedGeoGateway
 * (not the richer StarTrafficGatewayResolution wrapper) is being displayed —
 * a nominal gateway is shown bare, a backup/failover gateway is annotated.
 * Consumers: engineeringExportPayload.ts's GEO PDF details.
 * commercialRouteModel.ts's commercialGatewayLabel intentionally stays separate
 * (it layers an additional COMM-only "reference / unconfirmed" capability-
 * confidence case this formatter doesn't need), but both use the identical
 * "(failover)" wording for the backup case.
 */
export function formatResolvedGatewayRoleLabel(gateway: ResolvedGeoGateway): string {
  return gateway.controlAssignmentRole === 'backup'
    ? `${gateway.gatewayName} (failover)`
    : gateway.gatewayName;
}

export interface ResolvedConnectivityPath {
  satellite: SatelliteData;
  userLocation: { lat: number; lng: number; altitude?: number } | null;
  resolvedGateway: ResolvedGeoGateway | null;
  pathType: 'GEO_STAR' | 'GEO_MESH' | 'GEO_INSPECTION';
  topology: string;
  frequencyContext: unknown | null;
  linkBudgetInputs: unknown | null;
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
  minVisibilityDeg?: number;
  gatewayPolicy?: GatewayResolutionPolicy;
  /**
   * GroundSite.siteId values simulated as out of service.
   * - Beam-aware path: when the nominal beam-gateway site is in this set,
   *   resolution retries in FAILOVER routing mode against the satellite's
   *   redundancy policy; if no failover site is available either, the beam is
   *   reported as unserved (StarTrafficGatewayOutage) — never re-routed through
   *   a site with no assignment for that beam.
   * - Legacy per-satellite path (selectTrafficGeoGateway): a failed nominal
   *   site fails over to the reference-allocation backup teleport when that
   *   backup is traffic-eligible and not itself failed; otherwise no traffic
   *   gateway is returned.
   */
  failedGatewaySiteIds?: ReadonlySet<string>;
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
    resolvedGateway: ResolvedGeoGateway | null;
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
  /**
   * Coverage whose beam token selects the traffic gateway for beam-routed
   * satellites. Without it (or for non-beam-routed satellites) the legacy
   * per-satellite selection applies, so geometry/latency and the RF chain
   * would be computed against different physical sites for beam-routed beams.
   */
  coverage?: Pick<CandidateCoverage, 'beamId' | 'beamName' | 'isUplink'> | null;
  /** See GroundSegmentSelectionOptions.failedGatewaySiteIds. */
  failedGatewaySiteIds?: ReadonlySet<string>;
}

function toRadians(deg: number): number {
  return deg * DEG_TO_RAD;
}

/** Adapter onto the shared ellipsoid model (Phase 3). `PointLLA` is this
 *  module's own shape; `wgs84Geometry` owns the mathematics. */
function toEcef(point: PointLLA): EcefPoint {
  return geodeticToEcef({ latDeg: point.lat, lonDeg: point.lng, altKm: point.altKm });
}

/** WGS84 ECEF straight-line distance between two LLA points (km). */
export function distanceKm(a: PointLLA, b: PointLLA): number {
  const ea = toEcef(a);
  const eb = toEcef(b);
  const dx = eb.x - ea.x;
  const dy = eb.y - ea.y;
  const dz = eb.z - ea.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** WGS84 ECEF elevation angle (degrees) from observer to target. */
export function elevationDeg(observer: PointLLA, target: PointLLA): number {
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

export function latencyMsFromDistanceKm(distance: number): number {
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

export function getGeoSatellitePoint(satellite: SatelliteData): PointLLA {
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

export const GEO_GATEWAY_ASSIGNMENTS: GatewaySatelliteAssignment[] = [
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

const normalizeSatelliteGatewayKey = (value: string | null | undefined): string => (
  (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
);

const getSatelliteAssignmentAliases = (assignment: GatewaySatelliteAssignment): string[] => {
  const aliases = new Set<string>([
    assignment.satelliteName,
    assignment.satelliteId,
  ]);

  if (/^\d/.test(assignment.satelliteId)) {
    aliases.add(`E${assignment.satelliteId}`);
  }

  if (assignment.satelliteName.startsWith('EUTELSAT ')) {
    aliases.add(assignment.satelliteName.replace(/^EUTELSAT\s+/, ''));
  }

  return [...aliases].map(normalizeSatelliteGatewayKey).filter(Boolean);
};

const GATEWAY_ASSIGNMENT_BY_SATELLITE = new Map<string, GatewaySatelliteAssignment>();
for (const assignment of GEO_GATEWAY_ASSIGNMENTS) {
  for (const alias of getSatelliteAssignmentAliases(assignment)) {
    GATEWAY_ASSIGNMENT_BY_SATELLITE.set(alias, assignment);
  }
}

// Delegates to the single canonical alias table in geoGroundInfrastructure — the
// two previously-separate token lists could disagree (the topology table knows
// NORAD IDs, the old local list here did not), silently downgrading a satellite
// matched by NORAD ID alone to the legacy gateway path.
const canonicalBeamGatewaySatelliteId = (
  satellite: Pick<SatelliteData, 'id' | 'name' | 'noradId' | 'type' | 'coverageFileId'>
): 'KVHTS' | 'E10B' | null => {
  const canonicalId = canonicalStarTrafficTopologySatelliteId(satellite);
  return canonicalId === 'KVHTS' || canonicalId === 'E10B' ? canonicalId : null;
};

const extractNumericBeamToken = (coverage: Pick<CandidateCoverage, 'beamId' | 'beamName'>): string | null => {
  const candidates = [coverage.beamId, coverage.beamName];

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (/^\d+$/.test(trimmed)) return trimmed;

    const lastSegment = trimmed.split('::').at(-1)?.trim() ?? '';
    if (/^\d+$/.test(lastSegment)) return lastSegment;

    const beamMatch = trimmed.match(/\bbeam[_\s-]*(\d+)\b/i);
    if (beamMatch?.[1]) return beamMatch[1];
  }

  return null;
};

export function getGatewayAssignmentForSatellite(
  satellite: Pick<SatelliteData, 'id' | 'name' | 'noradId' | 'coverageFileId'>
): GatewaySatelliteAssignment | null {
  const keys = [
    satellite.name,
    satellite.id,
    satellite.coverageFileId ?? null,
    satellite.noradId,
  ].map(normalizeSatelliteGatewayKey);

  for (const key of keys) {
    const assignment = GATEWAY_ASSIGNMENT_BY_SATELLITE.get(key);
    if (assignment) return assignment;
  }

  return null;
}

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

function toResolvedGeoGateway(
  satellite: SatelliteData,
  gateway: GeoGatewayData,
  role: ResolvedGatewayRole,
  assignmentSource: GatewayAssignmentSource,
  reason: string,
): ResolvedGeoGateway {
  const satPoint = getGeoSatellitePoint(satellite);
  const coords = getGatewayLatLng(gateway);
  const gatewayPoint: PointLLA = { lat: coords.lat, lng: coords.lng, altKm: 0 };

  return {
    gatewayId: gateway.gateway_id,
    gatewayName: gateway.name,
    latitude: coords.lat,
    longitude: coords.lng,
    controlAssignmentRole: role,
    reason,
    assignmentSource,
    teleportCode: gateway.teleportCode,
    region: gateway.region,
    gateway,
    gatewayElevationDeg: elevationDeg(gatewayPoint, satPoint),
    satToGatewayDistanceKm: distanceKm(satPoint, gatewayPoint),
  };
}

function toGatewaySelection(resolved: ResolvedGeoGateway | null): GeoGatewaySelection | null {
  if (!resolved) return null;
  return {
    gateway: resolved.gateway,
    gatewayElevationDeg: resolved.gatewayElevationDeg,
    satToGatewayDistanceKm: resolved.satToGatewayDistanceKm,
  };
}

function toTrafficGatewaySelection(
  satellite: SatelliteData,
  resolved: ResolvedGeoGateway | null
): TrafficGatewaySelection | null {
  const selection = toGatewaySelection(resolved);
  if (!selection || !resolved) return null;

  const trafficCapability = getTrafficTeleportCapabilityForLegacyGateway(resolved.gateway, satellite);
  if (!trafficCapability) return null;

  return {
    ...selection,
    trafficStatus: trafficCapability.confidence,
    trafficCapability,
    resolvedGateway: resolved,
  };
}

/**
 * Resolves the SCC nominal/backup site for a satellite.
 *
 * Two distinct paths, with different role-awareness:
 *   1. Reference allocation (GEO_GATEWAY_ASSIGNMENTS lookup) — as of this writing,
 *      every nominalSccCode/backupSccCode in that table resolves to a
 *      PUBLICLY_LIKELY or CONFIRMED traffic site (RAM/CAG/TUR/MEX/HER). Verified
 *      by direct inspection of the table, not inferred from tests passing.
 *   2. Fallback (selectBestGeoGateway, below) — used when the satellite has no
 *      entry in GEO_GATEWAY_ASSIGNMENTS. It picks the geometrically nearest
 *      *visible* site among ALL gateways passed in, with NO role or
 *      trafficStatus filter. This CAN resolve to an UNVERIFIED site
 *      (MAR/DUB/SIN/IBA/PER) for a satellite not yet entered in the static
 *      table. selectTrafficGeoGateway() still correctly returns null in that
 *      case (it filters on trafficStatus downstream of this function), but the
 *      fallback itself is role-blind. Known and accepted as of the GEO ground
 *      segment role refactor; not addressed by that refactor's scope.
 */
export function resolveGatewayForSatellite(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  {
    gatewayPolicy = 'STATIC_NOMINAL',
    minVisibilityDeg = DEFAULT_RANGES.minGatewayElevationDeg,
  }: GroundSegmentSelectionOptions = {}
): ResolvedGeoGateway | null {
  if (satellite.orbitType !== 'GEO' || satellite.type !== 'EUTELSAT' || satellite.opsStatus !== 'operational') {
    return null;
  }

  const assignment = getGatewayAssignmentForSatellite(satellite);
  if (assignment) {
    const role: ResolvedGatewayRole = gatewayPolicy === 'STATIC_BACKUP' ? 'backup' : 'nominal';
    const code = role === 'backup'
      ? (assignment.backupSccCode ?? assignment.nominalSccCode)
      : assignment.nominalSccCode;
    const gateway = getGatewayByCode(gateways, code);

    if (!gateway) return null;

    return toResolvedGeoGateway(
      satellite,
      gateway,
      role,
      'reference-gateway-allocation',
      `${gatewayPolicy}: ${role} GEO gateway ${code} from reference allocation registry.`,
    );
  }

  const fallback = selectBestGeoGateway(satellite, gateways, minVisibilityDeg);
  if (!fallback) return null;
  return toResolvedGeoGateway(
    satellite,
    fallback.gateway,
    'nominal',
    'fallback-visible-gateway',
    'No reference allocation entry matched; selected nearest visible fallback GEO gateway.',
  );
}

export function resolveConnectivityPathForSatellite({
  satellite,
  userLocation,
  gateways,
  pathType = 'GEO_STAR',
  topology = 'STAR',
  frequencyContext = null,
  linkBudgetInputs = null,
  gatewayPolicy,
}: {
  satellite: SatelliteData;
  userLocation?: { lat: number; lng: number; altitude?: number } | null;
  gateways: GeoGatewayData[];
  pathType?: ResolvedConnectivityPath['pathType'];
  topology?: string;
  frequencyContext?: unknown | null;
  linkBudgetInputs?: unknown | null;
  gatewayPolicy?: GatewayResolutionPolicy;
}): ResolvedConnectivityPath {
  return {
    satellite,
    userLocation: userLocation ?? null,
    resolvedGateway: pathType === 'GEO_MESH'
      ? null
      : resolveGatewayForSatellite(satellite, gateways, { gatewayPolicy }),
    pathType,
    topology,
    frequencyContext,
    linkBudgetInputs,
  };
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

  const assignment = getGatewayAssignmentForSatellite(satellite);
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

  const assignment = getGatewayAssignmentForSatellite(satellite);
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

/**
 * Resolves the gateway eligible to carry commercial user RF traffic (Forward/Return
 * link budget) for a satellite.
 *
 * Unlike resolveGatewayForSatellite (which resolves the SCC nominal/backup site
 * regardless of whether it actually hosts a commercial teleport), this function
 * gates on GeoGatewayData.trafficStatus:
 *   - CONFIRMED / PUBLICLY_LIKELY → returns the site, with its trafficStatus echoed
 *     back so callers can surface a "not internally confirmed" notice for
 *     PUBLICLY_LIKELY sites.
 *   - UNVERIFIED / NOT_APPLICABLE → returns null. Callers must not silently fall
 *     back to the SCC site in this case (see CandidateCoverageStatus handling).
 */
/**
 * True when the gateway's ground site is simulated out of service. Legacy
 * GeoGatewayData.gateway_id is the GroundSite.siteId (projection invariant),
 * with a publicCode lookup as a defensive fallback for hand-built fixtures.
 */
function isGatewaySiteFailed(
  gateway: GeoGatewayData,
  failedGatewaySiteIds: ReadonlySet<string> | undefined
): boolean {
  if (!failedGatewaySiteIds?.size) return false;
  if (failedGatewaySiteIds.has(gateway.gateway_id)) return true;
  const site = getGroundSiteById(gateway.gateway_id) ?? getGroundSiteByPublicCode(gateway.teleportCode);
  return site != null && failedGatewaySiteIds.has(site.siteId);
}

export function selectTrafficGeoGateway(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  options: GroundSegmentSelectionOptions = {}
): TrafficGatewaySelection | null {
  const failedGatewaySiteIds = options.failedGatewaySiteIds;
  const resolved = resolveGatewayForSatellite(satellite, gateways, options);
  const resolvedTrafficSelection = toTrafficGatewaySelection(satellite, resolved);
  if (resolvedTrafficSelection && !isGatewaySiteFailed(resolvedTrafficSelection.gateway, failedGatewaySiteIds)) {
    return resolvedTrafficSelection;
  }

  if (resolvedTrafficSelection && resolved) {
    // Nominal traffic site is simulated out of service. The only evidence-backed
    // site diversity at satellite level is the reference-allocation backup code —
    // use it when it names a different, traffic-eligible, non-failed site;
    // otherwise there is no honest traffic gateway for this satellite.
    const backupResolved = resolveGatewayForSatellite(satellite, gateways, {
      ...options,
      gatewayPolicy: 'STATIC_BACKUP',
    });
    const backupSelection = backupResolved && backupResolved.gatewayId !== resolved.gatewayId
      ? toTrafficGatewaySelection(satellite, {
          ...backupResolved,
          reason: `${resolved.gatewayName} is out of service; using reference-allocation backup ${backupResolved.gatewayName}.`,
        })
      : null;
    if (backupSelection && !isGatewaySiteFailed(backupSelection.gateway, failedGatewaySiteIds)) {
      return backupSelection;
    }
    return null;
  }

  if (!resolved || resolved.assignmentSource === 'reference-gateway-allocation') {
    return null;
  }

  let best: TrafficGatewaySelection | null = null;
  for (const gateway of gateways) {
    if (isGatewaySiteFailed(gateway, failedGatewaySiteIds)) continue;
    const trafficCapability = getTrafficTeleportCapabilityForLegacyGateway(gateway, satellite);
    if (!trafficCapability) continue;

    const candidate = getGatewaySelectionForCandidate(
      satellite,
      gateway,
      options.minVisibilityDeg ?? DEFAULT_RANGES.minGatewayElevationDeg
    );
    if (!candidate) continue;

    const trafficResolvedGateway = toResolvedGeoGateway(
      satellite,
      gateway,
      'nominal',
      'fallback-visible-gateway',
      'No reference allocation entry matched; selected nearest eligible visible traffic teleport capability.',
    );
    const trafficSelection: TrafficGatewaySelection = {
      ...candidate,
      trafficStatus: trafficCapability.confidence,
      trafficCapability,
      resolvedGateway: trafficResolvedGateway,
    };

    if (!best || trafficSelection.satToGatewayDistanceKm < best.satToGatewayDistanceKm) {
      best = trafficSelection;
    }
  }

  return best;
}

export function resolveStarTrafficGatewayForCoverage(
  satellite: SatelliteData,
  coverage: Pick<CandidateCoverage, 'beamId' | 'beamName' | 'isUplink'> | null | undefined,
  gateways: GeoGatewayData[],
  options: GroundSegmentSelectionOptions = {}
): StarTrafficGatewayResolution | null {
  const legacySelection = selectTrafficGeoGateway(satellite, gateways, options);
  const canonicalSatelliteId = canonicalStarTrafficTopologySatelliteId(satellite);
  const canonicalBeamSatelliteId = canonicalBeamGatewaySatelliteId(satellite);
  const beamToken = coverage ? extractNumericBeamToken(coverage) : null;
  // GEO-3: the reference coverage passed in here is already direction-resolved
  // by every caller (pickStarGatewayReferenceCoverage's contract — downlink for
  // STAR_FORWARD, uplink for STAR_RETURN), so coverage.isUplink reliably tells
  // us which traffic direction this resolution is for, without requiring every
  // call site to separately thread a service-class parameter through.
  const serviceClass: GeoTrafficServiceClass | undefined = coverage
    ? (coverage.isUplink ? 'STAR_RETURN' : 'STAR_FORWARD')
    : undefined;
  const fallback = (
    reason: StarTrafficGatewayDiagnostic['reason'],
    message: string
  ): StarTrafficGatewaySelection | null => {
    if (!legacySelection) return null;
    return {
      gateway: legacySelection.gateway,
      trafficCapability: legacySelection.trafficCapability,
      diagnostic: {
        source: 'legacy-traffic-gateway',
        satelliteId: satellite.id,
        canonicalSatelliteId,
        beamToken,
        reason,
        message,
      },
      beamRoute: null,
      legacySelection,
      resolvedGateway: legacySelection.resolvedGateway,
    };
  };

  if (!canonicalSatelliteId) {
    return null;
  }
  if (!canonicalBeamSatelliteId) {
    return fallback('UNSUPPORTED_SATELLITE', `Beam-to-gateway routing is not modeled for ${satellite.name}; legacy traffic gateway selection used.`);
  }
  if (!beamToken) {
    return fallback('BEAM_TOKEN_NOT_FOUND', `No numeric beam token found for ${satellite.name}.`);
  }

  const beamRouteResult = resolveBeamGatewayRoute(canonicalBeamSatelliteId, beamToken, { serviceClass });
  if (!beamRouteResult.route) {
    return fallback(
      beamRouteResult.reason,
      `${beamRouteResult.diagnostic} Legacy traffic gateway selection used.`
    );
  }

  let beamRoute = beamRouteResult.route;
  let diagnosticMessage = beamRouteResult.diagnostic;
  const failedSiteIds = options.failedGatewaySiteIds;
  if (failedSiteIds?.has(beamRoute.site.siteId)) {
    const nominalSiteName = beamRoute.site.name;
    const failoverResult = resolveBeamGatewayRoute(canonicalBeamSatelliteId, beamToken, {
      routingMode: 'FAILOVER',
      serviceClass,
    });
    if (!failoverResult.route || failedSiteIds.has(failoverResult.route.site.siteId)) {
      // A curated beam plan binds the beam to specific physical sites. With the
      // nominal and failover sites both unavailable, no other gateway can carry
      // this beam — report it unserved instead of fabricating continuity through
      // the legacy per-satellite site, which has no assignment for this beam.
      return {
        gateway: null,
        trafficCapability: null,
        beamRoute: null,
        legacySelection,
        resolvedGateway: null,
        diagnostic: {
          source: 'gateway-outage',
          satelliteId: satellite.id,
          canonicalSatelliteId,
          beamToken,
          reason: 'GATEWAY_OUT_OF_SERVICE',
          message: `${nominalSiteName} is out of service and no failover gateway is available for this beam `
            + `(${failoverResult.route ? 'failover site is also out of service' : failoverResult.diagnostic}). `
            + 'Beam unserved.',
        },
      };
    }
    beamRoute = failoverResult.route;
    diagnosticMessage = `Failover routing: nominal gateway ${nominalSiteName} is out of service. ${failoverResult.diagnostic}`;
  }

  const beamGateway = projectGroundSiteToLegacyGeoGateway(beamRoute.site);
  const isFailover = beamRoute.routingMode === 'FAILOVER';
  return {
    gateway: beamGateway,
    trafficCapability: beamRoute.trafficCapability,
    diagnostic: {
      source: 'beam-gateway-assignment',
      satelliteId: satellite.id,
      canonicalSatelliteId: canonicalBeamSatelliteId,
      beamToken,
      reason: null,
      message: diagnosticMessage,
    },
    beamRoute,
    legacySelection,
    // A curated beam plan is a reference allocation: the beam-serving site is the
    // nominal traffic gateway for this beam, not a visibility-based fallback. A
    // failover gateway takes the backup role so display surfaces can flag it.
    resolvedGateway: toResolvedGeoGateway(
      satellite,
      beamGateway,
      isFailover ? 'backup' : 'nominal',
      'reference-gateway-allocation',
      diagnosticMessage,
    ),
  };
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
  coverage = null,
  failedGatewaySiteIds,
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
  // Geometry/latency must use the same gateway family as the RF chain: beam-aware
  // when the satellite is beam-routed (falls back internally for unmapped beams),
  // legacy per-satellite selection for every other satellite. When the beam-aware
  // resolution applies, it is authoritative — including the outage-unserved case
  // (resolvedGateway null), which must NOT fall through to the per-satellite
  // selection: that would resurrect a site the beam cannot physically use.
  const starSelection = resolveStarTrafficGatewayForCoverage(satellite, coverage, gateways, { failedGatewaySiteIds });
  const resolvedGateway = starSelection
    ? starSelection.resolvedGateway
    : selectTrafficGeoGateway(satellite, gateways, { failedGatewaySiteIds })?.resolvedGateway ?? null;

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

  if (resolvedGateway) {
    gatewayElevationDeg = resolvedGateway.gatewayElevationDeg;
    satGatewayDistanceKm = resolvedGateway.satToGatewayDistanceKm;
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
  if (!resolvedGateway) {
    warnings.push(
      `No eligible traffic gateway found (visibility >= ${DEFAULT_RANGES.minGatewayElevationDeg} deg).`
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
      gateway: resolvedGateway?.gateway ?? null,
      resolvedGateway,
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
