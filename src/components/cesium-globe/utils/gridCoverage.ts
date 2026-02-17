import { SatelliteData } from '../../../types/satellites';
import { SatelliteScope } from '../../SatelliteScopeFilter';
import { isSatelliteConnectedToGateway } from '../../../utils/connectivityRules';
import { isLEOSatelliteActive, calculateCombGeometry, calculateGSOAvoidanceAngle, TOTAL_BEAMS } from '../../../utils/oneWebComb';
import { isRfCoverageSatisfied, footprintRadiusKm, STANDARD_ELEVATION_DEG, type CoveragePolicy } from '../../../utils/leoFootprint';

import { JulianDate, Rectangle, Math as CesiumMath, Cartographic } from 'cesium';

// Grid configuration
const GRID_RES_DEG = 0.5; // 0.5 degree resolution for smoother edges
// const GRID_RES_DEG = 1.0; // 1 degree resolution (~110km) - Higher precision, more CPU

/**
 * Determines if a beam is active based on GSO Protection state
 */
function isBeamActive(
    beamIndex: number,
    isBlankingZone: boolean,
    isGSOAvoidance: boolean,
    satLatDeg: number,
    isMovingNorth: boolean
): boolean {
    if (isBlankingZone) return false;
    
    if (isGSOAvoidance) {
        const shouldActivateNorthernBeams = (satLatDeg > 0) === isMovingNorth;
        return shouldActivateNorthernBeams
            ? beamIndex >= 0 && beamIndex <= 7
            : beamIndex >= 8 && beamIndex <= 15;
    }
    
    return true;
}

/**
 * Point-in-polygon test using ray-casting algorithm
 */
function isPointInBeamPolygon(
    point: { lat: number; lng: number },
    polygon: { lat: number; lng: number }[]
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng;
        const yi = polygon[i].lat;
        const xj = polygon[j].lng;
        const yj = polygon[j].lat;
        
        const intersect = ((yi > point.lat) !== (yj > point.lat))
            && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
        
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Generates a set of non-overlapping Rectangles representing the binary coverage mask.
 * 
 * @param satellites List of all satellites
 * @param scope "LEO", "GEO" or "ALL"
 * @param policy Coverage policy (DB_THRESHOLD or ONEWEB_SERVICE_ZONE)
 * @returns Array of Cesium Rectangle objects
 */
export function generateCoverageGrid(
    satellites: SatelliteData[],
    scope: SatelliteScope,
    policy: CoveragePolicy
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
        // LEO Logic: Different approaches based on coverage policy
        if (sat.orbitType === 'LEO') {
            if (!sat.satrec) return;
            
            if (policy.type === "SERVICE_ZONE") {
                // SERVICE_ZONE Mode: Simple circular footprint based on 37° elevation (Service Zone)
                // More efficient than beam-by-beam calculations
                
                const radius = footprintRadiusKm(sat.position.alt, STANDARD_ELEVATION_DEG);
                const centerLat = sat.position.lat;
                const centerLng = sat.position.lng;
                
                // Convert radius to degrees (approximation for bounding box)
                const radiusDeg = radius / 111; // 111 km ≈ 1° at equator
                
                // Safety check: if radius is unreasonably large, skip this satellite
                if (radiusDeg > 50 || !Number.isFinite(radiusDeg)) {
                    console.warn(`Satellite ${sat.id}: abnormal footprint radius ${radiusDeg}°, skipping`);
                    return;
                }
                
                // Calculate bounding box for latitude (straightforward)
                const minLat = Math.max(-90, centerLat - radiusDeg);
                const maxLat = Math.min(90, centerLat + radiusDeg);
                
                // Calculate bounding box for longitude (handle polar regions specially)
                let startLonIdxRaw: number;
                let endLonIdxRaw: number;
                let cellsToTest: number;
                
                // Near poles (within 10° of ±90°), the footprint might wrap significantly
                if (Math.abs(centerLat) > 80) {
                    // Very close to pole - test all longitudes for affected latitudes
                    startLonIdxRaw = 0;
                    endLonIdxRaw = lonSteps;
                    cellsToTest = lonSteps;
                } else {
                    // Normal case: calculate longitude range accounting for latitude
                    // Use more conservative estimate at high latitudes
                    const latCorrectionFactor = Math.max(0.1, Math.cos(centerLat * Math.PI / 180));
                    const lngRadiusDeg = Math.min(
                        180, // Never exceed 180° (half the globe)
                        radiusDeg / latCorrectionFactor
                    );
                    
                    const minLon = centerLng - lngRadiusDeg;
                    const maxLon = centerLng + lngRadiusDeg;
                    
                    startLonIdxRaw = Math.floor((minLon + 180) / GRID_RES_DEG);
                    endLonIdxRaw = Math.ceil((maxLon + 180) / GRID_RES_DEG);
                    cellsToTest = endLonIdxRaw - startLonIdxRaw;
                }
                
                // Safety limit: if we're about to test more than 10000 cells, something is wrong
                const latCells = Math.ceil((maxLat - minLat) / GRID_RES_DEG);
                const totalCells = latCells * cellsToTest;
                if (totalCells > 10000) {
                    console.warn(`Satellite ${sat.id}: bounding box too large (${totalCells} cells), skipping`);
                    return;
                }
                
                // Calculate grid indices for latitude
                const startLatIdx = Math.floor((minLat + 90) / GRID_RES_DEG);
                const endLatIdx = Math.ceil((maxLat + 90) / GRID_RES_DEG);
                
                // Test each cell in the bounding box
                for (let latIdx = startLatIdx; latIdx < endLatIdx; latIdx++) {
                    if (latIdx < 0 || latIdx >= latSteps) continue;
                    const cellCenterLat = -90 + (latIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);
                    
                    for (let lonIdxRaw = startLonIdxRaw; lonIdxRaw < endLonIdxRaw; lonIdxRaw++) {
                        // Handle longitude wrapping
                        let lonIdx = lonIdxRaw % lonSteps;
                        if (lonIdx < 0) lonIdx += lonSteps;
                        
                        const cellId = getCellId(latIdx, lonIdx);
                        if (activeCells.has(cellId)) continue;
                        
                        const cellCenterLon = -180 + (lonIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);
                        
                        // Check if cell center is within circular coverage
                        if (isRfCoverageSatisfied(
                            { lat: cellCenterLat, lng: cellCenterLon },
                            { lat: centerLat, lng: centerLng },
                            sat.position.alt,
                            policy
                        )) {
                            activeCells.add(cellId);
                        }
                    }
                }
            } else if (policy.type === "DB_THRESHOLD") {
                // DB_THRESHOLD Mode: Use actual beam geometries
                
                // 1. Calculate the 16 beam geometries with the specified threshold
                const beamGeometries = calculateCombGeometry(sat.satrec, time, policy.thresholdDb);
                if (!beamGeometries || beamGeometries.length === 0) return;
                
                // 2. Determine GSO Protection status
                const { isGSOAvoidance, isBlankingZone, satLatDeg, isMovingNorth } = 
                    calculateGSOAvoidanceAngle(sat.satrec, time);
                
                // 3. Iterate over the 16 beams
                for (let beamIndex = 0; beamIndex < TOTAL_BEAMS; beamIndex++) {
                    const beamGeometry = beamGeometries[beamIndex];
                    
                    // Check if this beam is active
                    if (!isBeamActive(beamIndex, isBlankingZone, isGSOAvoidance, satLatDeg, isMovingNorth)) {
                        continue; // Skip inactive beams
                    }
                    
                    // 4. Convert Cartesian3[] to lat/lng[]
                    const beamPoints: { lat: number; lng: number }[] = [];
                    for (const cartesian of beamGeometry) {
                        const cartographic = Cartographic.fromCartesian(cartesian);
                        beamPoints.push({
                            lat: CesiumMath.toDegrees(cartographic.latitude),
                            lng: CesiumMath.toDegrees(cartographic.longitude)
                        });
                    }
                    
                    // 5. Calculate bounding box of the beam
                    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
                    for (const point of beamPoints) {
                        minLat = Math.min(minLat, point.lat);
                        maxLat = Math.max(maxLat, point.lat);
                        minLon = Math.min(minLon, point.lng);
                        maxLon = Math.max(maxLon, point.lng);
                    }
                    
                    // Add buffer to avoid edge cases
                    const buffer = GRID_RES_DEG * 2;
                    minLat = Math.max(-90, minLat - buffer);
                    maxLat = Math.min(90, maxLat + buffer);
                    minLon = Math.max(-180, minLon - buffer);
                    maxLon = Math.min(180, maxLon + buffer);
                    
                    // 6. Calculate grid indices
                    const startLatIdx = Math.floor((minLat + 90) / GRID_RES_DEG);
                    const endLatIdx = Math.ceil((maxLat + 90) / GRID_RES_DEG);
                    const startLonIdxRaw = Math.floor((minLon + 180) / GRID_RES_DEG);
                    const endLonIdxRaw = Math.ceil((maxLon + 180) / GRID_RES_DEG);
                    
                    // 7. Test each cell in the bounding box
                    for (let latIdx = startLatIdx; latIdx < endLatIdx; latIdx++) {
                        if (latIdx < 0 || latIdx >= latSteps) continue;
                        const cellCenterLat = -90 + (latIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);
                        
                        for (let lonIdxRaw = startLonIdxRaw; lonIdxRaw < endLonIdxRaw; lonIdxRaw++) {
                            let lonIdx = lonIdxRaw % lonSteps;
                            if (lonIdx < 0) lonIdx += lonSteps;
                            
                            const cellId = getCellId(latIdx, lonIdx);
                            if (activeCells.has(cellId)) continue; // Already marked
                            
                            const cellCenterLon = -180 + (lonIdx * GRID_RES_DEG) + (GRID_RES_DEG / 2);
                            
                            // Test point-in-polygon with the actual beam
                            if (isPointInBeamPolygon(
                                { lat: cellCenterLat, lng: cellCenterLon },
                                beamPoints
                            )) {
                                activeCells.add(cellId);
                            }
                        }
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
