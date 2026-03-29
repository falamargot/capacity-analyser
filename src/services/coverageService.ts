import { Feature, Polygon } from 'geojson';
import { SNPS_DATA } from '../components/globe/GlobeConfig';
import { isPointInCoverage } from '../utils/coverageCalculator';
import { SatelliteData } from '../types/satellites';
import { haversineDistanceKm, BACKHAUL_RADIUS_KM } from '../utils/leoFootprint';
import { EARTH_RADIUS_KM, SPEED_OF_LIGHT_RADIO_KM_S, calculateElevationAngle } from '../utils/capacityCalculator';
import type { SNPData } from '../components/globe/GlobeConfig';
import { calculateGSOAvoidanceAngle } from '../utils/oneWebComb';
import { JulianDate } from 'cesium';
import { log } from '../utils/logger';

const POINTS_IN_CIRCLE = 16; // Increased number of points for smoother circles

export interface CoverageData {
  type: string;
  features: Feature[];
}

// ─── Coverage file format ──────────────────────────────────────────────────────

interface RawFootprint {
  id: number;
  level: number;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

interface RawCoverageEntry {
  id: number;
  name: string;
  commercialName?: string;
  up: boolean;
  footprints: RawFootprint[];
}

interface RawCoverageFile {
  coverages: RawCoverageEntry[];
}

const isCoverageFileFormat = (data: unknown): data is RawCoverageFile =>
  typeof data === 'object' &&
  data !== null &&
  'coverages' in data;

// ─── Shared geometry helpers ──────────────────────────────────────────────────

const attachCoverageGeometryMetadata = (
  feature: Feature,
  geometry: Polygon,
  featureIndex: number,
  polygonIndex: number
): Feature => ({
  ...feature,
  properties: {
    ...(feature.properties ?? {}),
    coverageGeometryKey: `${featureIndex}:${polygonIndex}`,
    coveragePartIndex: polygonIndex,
    coverageSourceFeatureIndex: featureIndex,
  },
  geometry,
});

// ─── Coverage parser ───────────────────────────────────────────────────────────

export const parseCoverageFile = (data: RawCoverageFile): CoverageData => {
  const features: Feature[] = [];

  data.coverages.forEach((coverage, coverageIndex) => {
    const baseProperties = {
      name: coverage.name,
      mission: coverage.name,
      commercialName: coverage.commercialName ?? null,
      isUplink: coverage.up,
      type: 'EUTELSAT',
    };

    coverage.footprints.forEach((footprint) => {
      const { geometry } = footprint;
      const props = { ...baseProperties, level: footprint.level, contour: footprint.level };

      if (geometry.type === 'Polygon') {
        const polygonGeometry = geometry as Polygon;
        features.push(
          attachCoverageGeometryMetadata(
            { type: 'Feature', properties: props, geometry: polygonGeometry },
            polygonGeometry,
            coverageIndex,
            0
          )
        );
      } else if (geometry.type === 'MultiPolygon') {
        const coords = geometry.coordinates as unknown[][];
        coords.forEach((coordinates, polygonIndex) => {
          const polygonGeometry: Polygon = { type: 'Polygon', coordinates: coordinates as number[][][] };
          features.push(
            attachCoverageGeometryMetadata(
              { type: 'Feature', properties: props, geometry: polygonGeometry },
              polygonGeometry,
              coverageIndex,
              polygonIndex
            )
          );
        });
      }
    });
  });

  return { type: 'FeatureCollection', features };
};

export const loadSatelliteCoverage = async (satelliteId: string, satelliteName: string, satelliteType: string, coverageRadius: number): Promise<CoverageData | null> => {
  try {
    // In Vite production builds, files under /src are bundled and not served as static runtime assets.
    // Coverage JSON files must live under /public so they can be fetched at runtime.
    const response = await fetch(`/coverage/${satelliteId}.json`);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    log(`Loading real coverage for satellite ${satelliteId}`);
    if (!isCoverageFileFormat(data)) {
      throw new Error(`Unsupported coverage format for satellite ${satelliteId}`);
    }
    return parseCoverageFile(data);
  } catch (error) {
    // Only synthesize a fallback footprint if coverage loading or parsing failed.
    const data: CoverageData = {
      type: 'FeatureCollection',
      features: []
    };
    const points: [number, number][] = [];

    // Convert radius from kilometers to radians
    const angularRadius = coverageRadius / EARTH_RADIUS_KM;
    const rad = 180 / Math.PI;
    for (let i = 0; i <= POINTS_IN_CIRCLE; i++) {
      const angle = (i / POINTS_IN_CIRCLE) * 2 * Math.PI;
      const latDeg = Math.asin(Math.sin(angularRadius) * Math.cos(angle)) * rad;
      const lngDeg = Math.atan2(Math.sin(angle) * Math.sin(angularRadius), Math.cos(angularRadius)) * rad;
      points.push([lngDeg, latDeg]);
    }
    const feature: Feature = {
      type: 'Feature',
      properties: {
        satelliteId: satelliteName,
        name: '',
        type: satelliteType
      },
      geometry: {
        type: 'Polygon',
        coordinates: [points]
      }
    }
    data.features.push(feature);
    return data;
  }
}

export const getCoverageColor = (
  type: string | null,
  opacity: number = 0.3,
  satellite?: SatelliteData,
  failedSnps?: ReadonlySet<string>
): string => {
  // Determine once whether this ONEWEB satellite covers at least one non-failed SNP
  const hasSNP = satellite ? hasSNPInCoverage(satellite, failedSnps) : false;

  // ONEWEB double-zone logic (STANDARD / BACKHAUL)
  // Rule:
  // - If at least one SNP is covered by ANY coverage of the satellite:
  //   -> all coverages are GREEN, with intensity depending on the zone
  // - If no SNP is covered:
  //   -> all coverages are GRAY (neutral color for no service)

  if (type === 'ONEWEB_STANDARD') {
    // Dark pink if SNP covered, gray otherwise
    const baseColor = hasSNP ? '219, 39, 119' : '107, 114, 128'; // Pink vs Gray
    return `rgba(${baseColor}, ${opacity})`;
  }

  if (type === 'ONEWEB_BACKHAUL') {
    // Light pink if SNP covered, light gray otherwise
    const baseColor = hasSNP ? '219, 39, 119' : '156, 163, 175'; // Pink vs Light Gray
    return `rgba(${baseColor}, ${opacity * 0.3})`;
  }

  if (type === 'SNP_VISIBILITY_AREA') {
    // SNP visibility area - dark orange
    return `rgba(255, 140, 0, ${opacity * 0.6})`;
  }

  // Default satellite coloring
  const baseColor =
    type === 'EUTELSAT'
      ? '37, 99, 235'
      : type === 'ONEWEB'
        ? '219, 39, 119'
        : '200, 200, 200';

  return `rgba(${baseColor}, ${opacity})`;
};

export const getCoverageAltitude = (type: string | null): number => {
  // Double-zone coverage altitudes - layered properly
  if (type === 'ONEWEB_BACKHAUL') return 0.004; // Lowest altitude for largest backhaul coverage
  if (type === 'ONEWEB_STANDARD') return 0.005; // Higher altitude for standard coverage (on top)

  // Legacy coverage types
  if (type === 'SNP_VISIBILITY_AREA') return 0.002; // Low altitude for SNP visibility area
  return type === 'EUTELSAT' ? 0.003 : type === 'ONEWEB' ? 0.005 : 0.004;
}

export const getSatelliteColor = (type: string | null): string => {
  return type === 'EUTELSAT' ? '#2563eb' : type === 'ONEWEB' ? '#db2777' : '#ccc';
}

// Calculate 3D line-of-sight distance between satellite and ground station
function calculate3DDistanceKm(satellitePosition: { lat: number; lng: number; alt: number }, groundPosition: { lat: number; lng: number }): number {

  // Convert satellite position to 3D Cartesian coordinates
  const satAltitudeKm = satellitePosition.alt; // Altitude is already in km
  const satRadius = EARTH_RADIUS_KM + satAltitudeKm;

  const satLatRad = (satellitePosition.lat * Math.PI) / 180;
  const satLngRad = (satellitePosition.lng * Math.PI) / 180;

  const satX = satRadius * Math.cos(satLatRad) * Math.cos(satLngRad);
  const satY = satRadius * Math.cos(satLatRad) * Math.sin(satLngRad);
  const satZ = satRadius * Math.sin(satLatRad);

  // Convert ground position to 3D Cartesian coordinates
  const groundLatRad = (groundPosition.lat * Math.PI) / 180;
  const groundLngRad = (groundPosition.lng * Math.PI) / 180;

  const groundX = EARTH_RADIUS_KM * Math.cos(groundLatRad) * Math.cos(groundLngRad);
  const groundY = EARTH_RADIUS_KM * Math.cos(groundLatRad) * Math.sin(groundLngRad);
  const groundZ = EARTH_RADIUS_KM * Math.sin(groundLatRad);

  // Calculate 3D Euclidean distance
  const dx = satX - groundX;
  const dy = satY - groundY;
  const dz = satZ - groundZ;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export const getNearestSNPInBackhaul = (
  satellite: SatelliteData,
  failedSnps: ReadonlySet<string> = new Set()
): { name: string; distance: number; latency: number } | null => {
  // Only check for LEO satellites (ONEWEB)
  if (satellite.type !== 'ONEWEB') {
    return null;
  }

  // Check if satellite is in GSO exclusion zone (blanking zone)
  // If in blanking zone, satellite cannot be used for transmission
  if (satellite.satrec) {
    try {
      const now = new Date();
      const time = JulianDate.fromDate(now);
      const { isBlankingZone } = calculateGSOAvoidanceAngle(satellite.satrec, time);

      if (isBlankingZone) {
        return null; // Satellite in exclusion zone, not available for connectivity
      }
    } catch (error) {
      console.warn('Error checking GSO exclusion zone:', error);
      // Continue with normal processing if error occurs
    }
  }

  const satellitePosition = { lat: satellite.position.lat, lng: satellite.position.lng, alt: satellite.position.alt };
  let nearestSNP: { name: string; distance: number; latency: number } | null = null;
  // Use a strictly enforced max distance if backhaul radius is the hard limits
  // ONEWEB Gen 1 Backhaul radius is roughly ~2600km depending on elevation mask (15 deg)
  const MAX_BACKHAUL_DISTANCE_KM = BACKHAUL_RADIUS_KM;
  let minDistance = Infinity;

  // Find the nearest SNP (skipping SNPs marked as failed)
  for (const snp of SNPS_DATA) {
    // Feature 1: SNP Cascade Failure — skip failed SNPs
    if (failedSnps.has(snp.name)) continue;

    const surfaceDistance = haversineDistanceKm(satellitePosition, { lat: snp.lat, lng: snp.lng });

    // First Constraint: Radio Horizon / Distance Limit
    if (surfaceDistance > MAX_BACKHAUL_DISTANCE_KM) {
      continue;
    }

    // Second Constraint: Coverage Rule (Must be in Backhaul Coverage)
    // We pass the SNP location to see if it's inside the computed coverage polygon/footprint
    const coverageClasses = isPointInCoverage(
      { lat: snp.lat, lng: snp.lng },
      satellite,
      satellitePosition
    );

    if (!coverageClasses.includes('backhaul')) {
      continue;
    }

    // Determine actual Distance for latency
    const actualDistance3D = calculate3DDistanceKm(satellitePosition, { lat: snp.lat, lng: snp.lng });

    if (surfaceDistance < minDistance) {
      minDistance = surfaceDistance;
      // Calculate RTT latency using actual 3D line-of-sight distance
      const latency = (actualDistance3D * 2) / SPEED_OF_LIGHT_RADIO_KM_S * 1000; // actual distance * 2 (round trip) / speed of light (km/s) * 1000 = milliseconds
      nearestSNP = {
        name: snp.name,
        distance: surfaceDistance, // Keep surface distance for display
        latency: latency
      };
    }
  }

  return nearestSNP;
};

export const hasSNPInCoverage = (satellite: SatelliteData, failedSnps: ReadonlySet<string> = new Set()): boolean => {
  // Only check for LEO satellites (ONEWEB)
  if (satellite.type !== 'ONEWEB') {
    return false;
  }

  // Check if satellite is in GSO exclusion zone (blanking zone)
  // If in blanking zone, satellite cannot provide any connectivity
  if (satellite.satrec) {
    try {
      const now = new Date();
      const time = JulianDate.fromDate(now);
      const { isBlankingZone } = calculateGSOAvoidanceAngle(satellite.satrec, time);

      if (isBlankingZone) {
        return false; // Satellite in exclusion zone, no connectivity available
      }
    } catch (error) {
      console.warn('Error checking GSO exclusion zone:', error);
      // Continue with normal processing if error occurs
    }
  }

  // Check if any non-failed SNP is in the satellite's coverage
  for (const snp of SNPS_DATA) {
    // Feature 1: skip SNPs marked as failed
    if (failedSnps.has(snp.name)) continue;

    const coverageClasses = isPointInCoverage(
      { lat: snp.lat, lng: snp.lng },
      satellite,
      null
    );

    if (coverageClasses.includes('backhaul')) {
      return true;
    }
  }

  return false;
}

export interface SNPConnectedSatellite {
  satellite: SatelliteData;
  elevation: number;   // degrees, satellite elevation seen from SNP
  distanceKm: number;  // surface distance km
  latencyMs: number;   // one-way latency ms
}

/**
 * Find all LEO satellites currently connected to a given SNP (elevation ≥ 15°).
 * Returns results sorted by descending elevation.
 */
export const getSatellitesConnectedToSNP = (
  snp: SNPData,
  satellites: SatelliteData[],
  failedSnps: ReadonlySet<string> = new Set()
): SNPConnectedSatellite[] => {
  if (failedSnps.has(snp.name)) return [];

  const result: SNPConnectedSatellite[] = [];

  for (const satellite of satellites) {
    if (satellite.type !== 'ONEWEB') continue;

    const elevation = calculateElevationAngle({ lat: snp.lat, lng: snp.lng }, satellite);
    if (elevation < 15) continue;

    const distanceKm = haversineDistanceKm(
      { lat: snp.lat, lng: snp.lng },
      { lat: satellite.position.lat, lng: satellite.position.lng }
    );

    const distance3D = calculate3DDistanceKm(
      { lat: satellite.position.lat, lng: satellite.position.lng, alt: satellite.position.alt },
      { lat: snp.lat, lng: snp.lng }
    );
    const latencyMs = (distance3D / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;

    result.push({ satellite, elevation, distanceKm, latencyMs });
  }

  return result.sort((a, b) => b.elevation - a.elevation);
};
