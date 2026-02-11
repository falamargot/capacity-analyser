import { SatelliteData } from '../../../types/satellites';
import { SatelliteScope } from '../../SatelliteScopeFilter';
import { isSatelliteConnectedToGateway } from '../../../utils/connectivityRules';
import { isLEOSatelliteActive } from '../../../utils/oneWebComb';
import { STANDARD_RADIUS_KM, isPointInFootprint } from '../../../utils/leoFootprint';
import { JulianDate, Rectangle, Math as CesiumMath } from 'cesium';

// Grid configuration
const GRID_RES_DEG = 0.5; // 0.5 degree resolution for smoother edges
// const GRID_RES_DEG = 1.0; // 1 degree resolution (~110km) - Higher precision, more CPU

/**
 * Generates a set of non-overlapping Rectangles representing the binary coverage mask.
 * 
 * @param satellites List of all satellites
 * @param scope "LEO", "GEO" or "ALL"
 * @returns Array of Cesium Rectangle objects
 */
export function generateCoverageGrid(
    satellites: SatelliteData[],
    scope: SatelliteScope
): Rectangle[] {
    const activeCells = new Set<string>(); // "latIdx,lonIdx"
    const now = new Date();
    const time = JulianDate.fromDate(now);

    // 1. Filter relevant satellites
    const relevantSatellites = satellites.filter(sat => {
        if (scope === 'LEO' && sat.orbitType !== 'LEO') return false;
        if (scope === 'GEO' && sat.orbitType !== 'GEO') return false;

        // Strict connectivity check
        if (sat.type === 'ONEWEB') {
            // GSO Exclusion check
            if (sat.satrec && !isLEOSatelliteActive(sat.satrec, time)) {
                return false;
            }
            // Gateway Connectivity check
            if (!isSatelliteConnectedToGateway(sat, 15)) {
                return false;
            }
        }

        return true;
    });

    if (relevantSatellites.length === 0) return [];

    // Helper to get cell ID
    const getCellId = (latIdx: number, lonIdx: number) => `${latIdx},${lonIdx}`;

    // 2. Iterate over filtered satellites and mark grid cells
    // Optimization: Instead of checking every cell against every satellite (O(Grid * Sat)),
    // we iterate satellites and check only cells within their bounding box (O(Sat * LocalGrid)).

    // Grid bounds: Lat [-90, 90], Lon [-180, 180]
    // Indices: Lat [0, 180/RES], Lon [0, 360/RES]

    const latSteps = Math.ceil(180 / GRID_RES_DEG);
    const lonSteps = Math.ceil(360 / GRID_RES_DEG);

    relevantSatellites.forEach(sat => {
        // LEO Logic: Circular Footprint
        if (sat.orbitType === 'LEO') {
            // Determine bounding box of the footprint (Standard Radius)
            // Approx simple bounding box in degrees
            // 1 degree lat ~ 111km. 1 degree lon ~ 111km * cos(lat)
            const radiusDegLat = (STANDARD_RADIUS_KM / 111.0) + GRID_RES_DEG; // Add buffer

            const minLat = Math.max(-90, sat.position.lat - radiusDegLat);
            const maxLat = Math.min(90, sat.position.lat + radiusDegLat);

            // Longitude is trickier near poles, but for grid marking we can be generous
            // Max secant(lat) limited to ~85 deg
            const cosLat = Math.cos(CesiumMath.toRadians(Math.min(85, Math.abs(sat.position.lat))));
            const radiusDegLon = (STANDARD_RADIUS_KM / (111.0 * cosLat)) + GRID_RES_DEG;

            let minLon = sat.position.lng - radiusDegLon;
            let maxLon = sat.position.lng + radiusDegLon;

            // Handle anti-meridian wrapping loosely or strictly
            // Simple iteration loop

            const startLatIdx = Math.floor((minLat + 90) / GRID_RES_DEG);
            const endLatIdx = Math.ceil((maxLat + 90) / GRID_RES_DEG);

            // Wrap Longitude
            const startLonIdxRaw = Math.floor((minLon + 180) / GRID_RES_DEG);
            const endLonIdxRaw = Math.ceil((maxLon + 180) / GRID_RES_DEG);

            for (let latIdx = startLatIdx; latIdx < endLatIdx; latIdx++) {
                // Check valid lat index
                if (latIdx < 0 || latIdx >= latSteps) continue;

                // Calculate cell center Lat
                const cellCenterLat = -90 + (latIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);

                for (let lonIdxRaw = startLonIdxRaw; lonIdxRaw < endLonIdxRaw; lonIdxRaw++) {
                    // Wrap lon index
                    let lonIdx = lonIdxRaw % lonSteps;
                    if (lonIdx < 0) lonIdx += lonSteps;

                    const cellId = getCellId(latIdx, lonIdx);
                    if (activeCells.has(cellId)) continue; // Already marked

                    // Check if cell center is covered
                    const cellCenterLon = -180 + (lonIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);

                    if (isPointInFootprint(
                        { lat: cellCenterLat, lng: cellCenterLon },
                        { lat: sat.position.lat, lng: sat.position.lng },
                        STANDARD_RADIUS_KM
                    )) {
                        activeCells.add(cellId);
                    }
                }
            }
        }

        // GEO Logic: Global Coverage (Simplified)
        // For GEO, checking point-in-polygon for every grid cell is expensive.
        // Optimization: Use bounding box of polygon if available, or just verify 
        // "Is visible from GEO slot" (elevation > 0 or 10 deg) since usually GEO covers ~1/3 earth.
        // But we have actual polygons. Let's use simple bbox or distance check if polygons are complex.
        // Actually, user wants "Valid beam coverage".
        // Let's rely on simple visibility for now to be fast, or check polygon if critical.
        // Given complexity, let's assume if it sees the satellite > 10deg elevation, it's covered
        // (since usually "GEO" scope implies full earth coverage except poles/extreme edges).
        // OR better: iterate all cells and check `isPointInGEOCoverage` logic (from App.tsx).
        // Since we refactored, let's stick to "Elevation > 10deg" as a greedy approximation for GEO feasibility
        // unless polygons are strictly required. The request says "Valid beam coverage".
        // We will skip strict polygon check for every cell for performance (too slow in JS for 10k cells * 50 sats).
        // We will use Elevation > MIN_GEO_EL (10 deg). This is the standard "Visible" definition.


        // GEO Logic: Strict Polygon Coverage
        else if (sat.orbitType === 'GEO') {
            if (!sat.coverages || sat.coverages.length === 0) return;

            sat.coverages.forEach(coverage => {
                const geometry = coverage.feature.geometry;
                if (geometry.type !== 'Polygon') return; // Support MultiPolygon if needed later

                const coords = geometry.coordinates[0]; // Exterior ring
                if (!coords || coords.length < 3) return;

                // Calculate Bounding Box for this polygon
                let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
                coords.forEach(([lon, lat]) => {
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                    if (lon < minLon) minLon = lon;
                    if (lon > maxLon) maxLon = lon;
                });

                // Add buffer to bbox
                minLat = Math.max(-90, minLat - GRID_RES_DEG);
                maxLat = Math.min(90, maxLat + GRID_RES_DEG);
                minLon = Math.max(-180, minLon - GRID_RES_DEG);
                maxLon = Math.min(180, maxLon + GRID_RES_DEG);

                const startLatIdx = Math.floor((minLat + 90) / GRID_RES_DEG);
                const endLatIdx = Math.ceil((maxLat + 90) / GRID_RES_DEG);
                const startLonIdxRaw = Math.floor((minLon + 180) / GRID_RES_DEG);
                const endLonIdxRaw = Math.ceil((maxLon + 180) / GRID_RES_DEG);

                for (let latIdx = startLatIdx; latIdx < endLatIdx; latIdx++) {
                    if (latIdx < 0 || latIdx >= latSteps) continue;
                    const cellCenterLat = -90 + (latIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);

                    for (let lonIdxRaw = startLonIdxRaw; lonIdxRaw < endLonIdxRaw; lonIdxRaw++) {
                        let lonIdx = lonIdxRaw % lonSteps;
                        if (lonIdx < 0) lonIdx += lonSteps;

                        const cellId = getCellId(latIdx, lonIdx);
                        if (activeCells.has(cellId)) continue;

                        const cellCenterLon = -180 + (lonIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);

                        // Check if cell center is inside this polygon ring
                        if (isPointInPolygon({ lat: cellCenterLat, lng: cellCenterLon }, coords as number[][])) {
                            activeCells.add(cellId);
                        }
                    }
                }
            });
        }
    });

    // 3. Convert Active Cells to Rectangles (with Merging)
    const rectangles: Rectangle[] = [];

    for (let latIdx = 0; latIdx < latSteps; latIdx++) {
        let startLonIdx: number | null = null;

        for (let lonIdx = 0; lonIdx < lonSteps; lonIdx++) {
            const cellId = getCellId(latIdx, lonIdx);
            const isActive = activeCells.has(cellId);

            if (isActive) {
                if (startLonIdx === null) {
                    startLonIdx = lonIdx;
                }
            } else {
                if (startLonIdx !== null) {
                    // End of strip, push rectangle
                    const south = -90 + (latIdx * GRID_RES_DEG);
                    const north = south + GRID_RES_DEG;
                    const west = -180 + (startLonIdx * GRID_RES_DEG);
                    const east = -180 + (lonIdx * GRID_RES_DEG); // Current lonIdx is exclusive end

                    rectangles.push(Rectangle.fromDegrees(west, south, east, north));
                    startLonIdx = null;
                }
            }
        }

        // Handle end of row
        if (startLonIdx !== null) {
            const south = -90 + (latIdx * GRID_RES_DEG);
            const north = south + GRID_RES_DEG;
            const west = -180 + (startLonIdx * GRID_RES_DEG);
            const east = -180 + (lonSteps * GRID_RES_DEG); // End of row

            rectangles.push(Rectangle.fromDegrees(west, south, east, north));
        }
    }

    return rectangles;
}

// Helper: Ray-casting algorithm for Point-in-Polygon
function isPointInPolygon(point: { lat: number; lng: number }, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];

        const intersect = ((yi > point.lat) !== (yj > point.lat))
            && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }
    return inside;
}
