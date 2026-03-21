import { calculatePosition } from '../services/satelliteService';
import { SatelliteData } from '../types/satellites';
import { isPointInCoverage } from './coverageCalculator';
import { STANDARD_CAPACITY_GBPS } from './leoFootprint';

// Earth radius constant
export const EARTH_RADIUS_KM = 6371;

// Speed of light constant for radio waves (effective propagation speed)
export const SPEED_OF_LIGHT_RADIO_KM_S = 299792 * 0.97; // Effective propagation speed for radio waves

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
  capacity: number;
} 

export interface RealTimeCapacityData {
  totalCapacity: number;
  coveredSatellites: SatelliteData[];
  elevationAngle?: number; // Elevation angle in degrees
}

// Calculate elevation angle between ground point and satellite
export const calculateElevationAngle = (
  point: { lat: number; lng: number },
  satellite: SatelliteData
): number => {
  // WGS-84 constants (km)
  const A = 6378.137;
  const F = 1 / 298.257223563;
  const E2 = 2 * F - F * F;

  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;

  // Ground point (altitude assumed 0 km)
  const lat = point.lat * degToRad;
  const lon = point.lng * degToRad;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);

  const xg = N * cosLat * cosLon;
  const yg = N * cosLat * sinLon;
  const zg = N * (1 - E2) * sinLat;

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
    // For selected satellite, use double-zone logic based on elevation angle
    if (selectedPoint) {
      const coverageClasses = isPointInCoverage(selectedPoint, selectedSatellite, null);
      const elevationAngle = calculateElevationAngle(selectedPoint, selectedSatellite);
      const capacity = coverageClasses.includes('user') ? STANDARD_CAPACITY_GBPS : 0;
      
      return {
        totalCapacity: capacity,
        coveredSatellites: [selectedSatellite],
        elevationAngle
      };
    } else {
      // No point selected, use satellite's max throughput
      return {
        totalCapacity: selectedSatellite.capacity.maxThroughput,
        coveredSatellites: [selectedSatellite]
      };
    }
  }

  if (!selectedPoint || !satellites) {
    return {
      totalCapacity: 0,
      coveredSatellites: []
    };
  }

  const coveredSatellites = satellites.filter((satellite) =>
    isPointInCoverage(selectedPoint, satellite, null).includes('user')
  );

  // OneWeb (bent-pipe, no ISL): a terminal is served by exactly one satellite at a time.
  // Multiple visible OneWeb satellites provide handover redundancy, not additive capacity.
  // GEO satellites: each operates on independent spectrum/beams — capacities are additive.
  const onewebCovered = coveredSatellites.filter((s) => s.type === 'ONEWEB');
  const geoCovered = coveredSatellites.filter((s) => s.type !== 'ONEWEB');

  const onewebCapacity = onewebCovered.length > 0 ? STANDARD_CAPACITY_GBPS : 0;
  const geoCapacity = geoCovered.reduce((sum, satellite) => {
    return isPointInCoverage(selectedPoint, satellite, null).includes('user')
      ? sum + STANDARD_CAPACITY_GBPS
      : sum;
  }, 0);

  return {
    totalCapacity: onewebCapacity + geoCapacity,
    coveredSatellites,
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

  // Calculate capacity for each hour
  for (let min = 0; min < 1440; min+=15) {
    const timestamp = new Date(now);
    timestamp.setHours(Math.floor(min / 60), min % 60, 0, 0);

    // OneWeb (bent-pipe): one satellite serves at a time — presence = STANDARD_CAPACITY_GBPS once.
    // GEO: independent beams/spectrum, each counted separately.
    const onewebVisible = satellites
      .filter((s) => s.type === 'ONEWEB')
      .some((s) => isPointInCoverage(selectedPoint, s, calculatePosition(s, timestamp)).includes('user'));

    const geoCapacity = satellites
      .filter((s) => s.type !== 'ONEWEB')
      .reduce((sum, satellite) => {
        const coverageClasses = isPointInCoverage(selectedPoint, satellite, calculatePosition(satellite, timestamp));
        return coverageClasses.includes('user') ? sum + STANDARD_CAPACITY_GBPS : sum;
      }, 0);

    const totalCapacity = (onewebVisible ? STANDARD_CAPACITY_GBPS : 0) + geoCapacity;

    data.push({
      time: `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`,
      capacity: totalCapacity
    });
  }

  return data;
};
