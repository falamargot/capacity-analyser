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
  minGatewayElevationDeg: 10,
  expectedUserSatLatencyMinMs: 120,
  expectedUserSatLatencyMaxMs: 140,
  expectedRttMinMs: 500,
  expectedRttMaxMs: 700,
  suspiciousLowRttMs: 450,
};

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

export function selectBestGeoGateway(
  satellite: SatelliteData,
  gateways: GeoGatewayData[],
  minGatewayElevationDeg = DEFAULT_RANGES.minGatewayElevationDeg
): GeoGatewaySelection | null {
  const satPoint = getGeoSatellitePoint(satellite);
  let best: GeoGatewaySelection | null = null;

  for (const gateway of gateways) {
    if (!gatewaySupportsSatellite(gateway, satellite)) continue;

    const coords = getGatewayLatLng(gateway);
    const gatewayPoint: PointLLA = { lat: coords.lat, lng: coords.lng, altKm: 0 };
    const gwElevation = elevationDeg(gatewayPoint, satPoint);
    if (gwElevation < minGatewayElevationDeg) continue;

    const satToGw = distanceKm(satPoint, gatewayPoint);
    if (!best || satToGw < best.satToGatewayDistanceKm) {
      best = {
        gateway,
        gatewayElevationDeg: gwElevation,
        satToGatewayDistanceKm: satToGw,
      };
    }
  }

  return best;
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
  const selectedGateway = selectBestGeoGateway(satellite, gateways);

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

  if (isUserLinkUnstable) {
    warnings.push(`User-satellite elevation below ${DEFAULT_RANGES.minUserStableElevationDeg} deg: unstable link.`);
  }
  if (!selectedGateway) {
    warnings.push(
      `No eligible gateway found (supporting satellite + gateway elevation >= ${DEFAULT_RANGES.minGatewayElevationDeg} deg).`
    );
  }
  if (
    userSatLatencyMs < DEFAULT_RANGES.expectedUserSatLatencyMinMs ||
    userSatLatencyMs > DEFAULT_RANGES.expectedUserSatLatencyMaxMs
  ) {
    warnings.push(
      `User-satellite one-way latency outside expected ${DEFAULT_RANGES.expectedUserSatLatencyMinMs}-${DEFAULT_RANGES.expectedUserSatLatencyMaxMs} ms range.`
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
