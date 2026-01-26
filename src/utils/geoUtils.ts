/**
 * Geographic utility functions for point-in-polygon and coverage calculations
 */
import type { SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';

/**
 * Simple point-in-polygon check using ray casting algorithm
 */
export const isPointInPolygon = (
    point: { lat: number; lng: number },
    ring: number[][]
): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];

        const intersect = ((yi > point.lat) !== (yj > point.lat))
            && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

/**
 * Check if a point is inside a GEO satellite's coverage area
 */
export const isPointInGEOCoverage = (
    point: { lat: number; lng: number },
    satellite: SatelliteData
): boolean => {
    // For GEO satellites, use the coverage polygons from satellite data
    if (!satellite.coverages || satellite.coverages.length === 0) {
        // Fallback: use elevation angle as rough estimate if no coverage data available
        const elevation = calculateElevationAngle(point, satellite);
        return elevation >= 10;
    }

    // Check if point is inside any of the satellite's coverage areas
    for (const coverage of satellite.coverages) {
        const geometry = coverage.feature?.geometry;
        if (geometry && geometry.type === 'Polygon') {
            const ring = geometry.coordinates[0] as unknown as number[][];
            if (isPointInPolygon(point, ring)) {
                return true;
            }
        }
    }
    return false;
};
