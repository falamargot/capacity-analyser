import { calculatePosition } from '../services/satelliteService';
import { SatelliteData } from '../types/satellites';
import { isPointInCoverage } from './coverageCalculator';
import { NOMINAL_TERMINAL_PEAK_MBPS } from '../config/oneweb';
import { estimateGeoSatelliteCapacity, estimateGeoSatelliteCapacityGbps, type GeoCapacityEstimate } from './geoCapacityModel';

// Per-point capacity for LEO (terminal peak, not satellite aggregate).
// 200 Mbps = NOMINAL_TERMINAL_PEAK_MBPS converted to Gbps for the shared interface.
const LEO_TERMINAL_PEAK_GBPS = NOMINAL_TERMINAL_PEAK_MBPS / 1000; // 0.2 Gbps

// Earth radius constant
// Canonical constant lives in earthGeometry.ts (zero-dep leaf); re-exported here
// for the many existing import sites.
import { EARTH_RADIUS_KM } from './earthGeometry';
export { EARTH_RADIUS_KM } from './earthGeometry';

// Free-space propagation speed for electromagnetic waves (km/s).
// The 0.97 velocity factor applies to guided media (coaxial, fiber) — NOT to free-space radio.
export const SPEED_OF_LIGHT_RADIO_KM_S = 299792.458;

// Calculate one-way latency in milliseconds from distance in kilometers
export function computeOneWayLatencyMs(distanceKm: number): number {
  return Math.round((distanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000);
}

// 2D distance calculation (surface distance)
export const computeDistanceKm = (point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number => {
  const R = EARTH_RADIUS_KM;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 3D distance calculation accounting for Earth's curvature
export const compute3DDistanceKm = (
  point1: { lat: number; lng: number; alt?: number },
  point2: { lat: number; lng: number; alt?: number }
): number => {
  // WGS‑84 constants (km)
  const A = 6378.137;
  const F = 1 / 298.257223563;
  const E2 = 2 * F - F * F;
  const DEG_TO_RAD = Math.PI / 180;

  function toECEF(p: { lat: number; lng: number; alt?: number }): [number, number, number] {
    const lat = p.lat * DEG_TO_RAD;
    const lon = p.lng * DEG_TO_RAD;
    const alt = p.alt ?? 0;

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);

    const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);

    const x = (N + alt) * cosLat * Math.cos(lon);
    const y = (N + alt) * cosLat * Math.sin(lon);
    const z = (N * (1 - E2) + alt) * sinLat;

    return [x, y, z];
  }

  const [x1, y1, z1] = toECEF(point1);
  const [x2, y2, z2] = toECEF(point2);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export interface TimeCapacityData {
  time: string;
  /** Capacity in Gbps. For LEO: terminal peak (0.2 Gbps max), not satellite aggregate. */
  capacity: number;
  /** True when a LEO satellite is providing coverage at this time slot. */
  hasLeoCoverage: boolean;
}

export interface RealTimeCapacityData {
  /**
   * Gbps visible from this point.
   * For LEO: terminal peak throughput (≤ 0.2 Gbps), not satellite aggregate (7.2 Gbps).
   * For GEO: feasibility-level payload class capacity, not a transponder loading plan.
   * Do NOT display this as "network capacity" — it is a per-terminal estimate for LEO.
   */
  totalCapacity: number;
  coveredSatellites: SatelliteData[];
  geoCapacityEstimates?: GeoCapacityEstimate[];
  elevationAngle?: number;
  /**
   * True when the LEO contribution to totalCapacity is a terminal peak estimate
   * (not the satellite aggregate). Always true for OneWeb when a point is selected.
   */
  leoCapacityIsTerminalPeak: boolean;
  /** True when at least one OneWeb satellite currently covers this point. */
  hasLeoCoverage: boolean;
}

// Calculate elevation angle between ground point and satellite
export const calculateElevationAngle = (
  point: { lat: number; lng: number; altitude?: number },
  satellite: SatelliteData
): number => {
  // WGS-84 constants (km)
  const A = 6378.137;
  const F = 1 / 298.257223563;
  const E2 = 2 * F - F * F;

  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;

  const userAltKm = point.altitude ?? 0;

  const lat = point.lat * degToRad;
  const lon = point.lng * degToRad;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);

  const xg = (N + userAltKm) * cosLat * cosLon;
  const yg = (N + userAltKm) * cosLat * sinLon;
  const zg = (N * (1 - E2) + userAltKm) * sinLat;

  // Satellite position
  const satLat = satellite.position.lat * degToRad;
  const satLon = satellite.position.lng * degToRad;
  const satAlt = satellite.position.alt; // km

  const sinSatLat = Math.sin(satLat);
  const cosSatLat = Math.cos(satLat);
  const sinSatLon = Math.sin(satLon);
  const cosSatLon = Math.cos(satLon);

  const Ns = A / Math.sqrt(1 - E2 * sinSatLat * sinSatLat);

  const xs = (Ns + satAlt) * cosSatLat * cosSatLon;
  const ys = (Ns + satAlt) * cosSatLat * sinSatLon;
  const zs = (Ns * (1 - E2) + satAlt) * sinSatLat;

  // Line-of-sight vector (ECEF)
  const dx = xs - xg;
  const dy = ys - yg;
  const dz = zs - zg;

  // ECEF -> ENU
  const east  = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up    =  cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  // Elevation angle
  const elevationRad = Math.atan2(up, Math.sqrt(east * east + north * north));

  return elevationRad * radToDeg;
};

export const calculateRealTimeCapacity = (
  satellites: SatelliteData[],
  selectedPoint: { lat: number; lng: number } | null,
  selectedSatellite: SatelliteData | null,
): RealTimeCapacityData => {
  if (selectedSatellite) {
    // Satellite with an invalid propagated position must not contribute coverage.
    if (selectedSatellite.position.isPositionValid === false) {
      return {
        totalCapacity: 0,
        coveredSatellites: [],
        leoCapacityIsTerminalPeak: false,
        hasLeoCoverage: false,
      };
    }

    if (selectedPoint) {
      const coverageClasses = isPointInCoverage(selectedPoint, selectedSatellite, null);
      const elevationAngle = calculateElevationAngle(selectedPoint, selectedSatellite);
      const inCoverage = coverageClasses.includes('user');
      const isLeo = selectedSatellite.orbitType === 'LEO';

      // For LEO: terminal peak (0.2 Gbps), not satellite aggregate (7.2 Gbps).
      // For GEO: public payload-class feasibility estimate, not operational capacity planning.
      const capacity = inCoverage
        ? (isLeo ? LEO_TERMINAL_PEAK_GBPS : estimateGeoSatelliteCapacityGbps(selectedSatellite))
        : 0;
      return {
        totalCapacity: capacity,
        coveredSatellites: inCoverage ? [selectedSatellite] : [],
        elevationAngle,
        leoCapacityIsTerminalPeak: isLeo,
        hasLeoCoverage: isLeo && inCoverage,
        geoCapacityEstimates: !isLeo && inCoverage
          ? [estimateGeoSatelliteCapacity(selectedSatellite)]
          : undefined,
      };
    } else {
      // No point selected — show satellite aggregate for context (clearly not terminal throughput).
      return {
        totalCapacity: selectedSatellite.capacity.maxThroughput,
        coveredSatellites: [selectedSatellite],
        leoCapacityIsTerminalPeak: false,
        hasLeoCoverage: selectedSatellite.orbitType === 'LEO',
      };
    }
  }

  if (!selectedPoint || !satellites) {
    return {
      totalCapacity: 0,
      coveredSatellites: [],
      leoCapacityIsTerminalPeak: false,
      hasLeoCoverage: false,
    };
  }

  // Exclude satellites whose SGP4 propagation failed.
  const validSatellites = satellites.filter(
    (s) => s.position.isPositionValid !== false
  );

  const coveredSatellites = validSatellites.filter((satellite) =>
    isPointInCoverage(selectedPoint, satellite, null).includes('user')
  );

  // OneWeb (bent-pipe, no ISL): a terminal is served by exactly one satellite at a time.
  // Multiple visible OneWeb satellites provide handover redundancy, not additive capacity.
  // GEO satellites: each operates on independent spectrum/beams — capacities are additive.
  const onewebCovered = coveredSatellites.filter((s) => s.type === 'ONEWEB');
  const geoCovered = coveredSatellites.filter((s) => s.type !== 'ONEWEB');

  // LEO capacity: terminal peak only — satellite aggregate (7.2 Gbps) would be misleading here.
  const onewebCapacity = onewebCovered.length > 0 ? LEO_TERMINAL_PEAK_GBPS : 0;
  const geoCapacityEstimates = geoCovered
    .filter((satellite) => isPointInCoverage(selectedPoint, satellite, null).includes('user'))
    .map((satellite) => estimateGeoSatelliteCapacity(satellite));
  const geoCapacity = geoCapacityEstimates.reduce((sum, estimate) => {
    return sum + estimate.nominalGbps;
  }, 0);

  return {
    totalCapacity: onewebCapacity + geoCapacity,
    coveredSatellites,
    leoCapacityIsTerminalPeak: true,
    hasLeoCoverage: onewebCovered.length > 0,
    geoCapacityEstimates,
  };
};

export const calculateCapacityOverTime = (
  satellites: SatelliteData[],
  selectedPoint: { lat: number; lng: number } | null
): TimeCapacityData[] => {
  if (!selectedPoint || !satellites || satellites.length === 0) {
    return [];
  }

  const now = new Date();
  const data: TimeCapacityData[] = [];

  // Calculate capacity for each 15-minute slot.
  for (let min = 0; min < 1440; min += 15) {
    const timestamp = new Date(now);
    timestamp.setHours(Math.floor(min / 60), min % 60, 0, 0);

    // OneWeb (bent-pipe): one satellite serves at a time.
    // Capacity contribution = terminal peak (0.2 Gbps), NOT satellite aggregate (7.2 Gbps).
    const validOneweb = satellites.filter(
      (s) => s.type === 'ONEWEB' && s.position.isPositionValid !== false
    );
    const onewebVisible = validOneweb.some((s) => {
      const pos = calculatePosition(s, timestamp);
      if (pos.isPositionValid === false) return false;
      return isPointInCoverage(selectedPoint, s, pos).includes('user');
    });

    // GEO: independent beams/spectrum, each counted separately.
    const geoCapacity = satellites
      .filter((s) => s.type !== 'ONEWEB' && s.position.isPositionValid !== false)
      .reduce((sum, satellite) => {
        const pos = calculatePosition(satellite, timestamp);
        if (pos.isPositionValid === false) return sum;
        const coverageClasses = isPointInCoverage(selectedPoint, satellite, pos);
        return coverageClasses.includes('user') ? sum + estimateGeoSatelliteCapacityGbps(satellite) : sum;
      }, 0);

    const totalCapacity = (onewebVisible ? LEO_TERMINAL_PEAK_GBPS : 0) + geoCapacity;

    data.push({
      time: `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`,
      capacity: totalCapacity,
      hasLeoCoverage: onewebVisible,
    });
  }

  return data;
};
