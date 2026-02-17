/**
 * Hook to manage OneWeb comb geometry calculations with proper caching
 */
import { useRef, useEffect, useCallback } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import { calculateCombGeometry } from '../../../utils/oneWebComb';
import { useSimulation } from '../../../contexts/SimulationContext';

interface CombGeometryCache {
    time: JulianDate;
    satId: string;
    policyType: "DB_THRESHOLD" | "SERVICE_ZONE";
    thresholdDb?: number;
    geometries: Cartesian3[][] | null;
}

/**
 * Hook that provides cached comb geometry calculations
 * The cache is invalidated when time, satellite, or policy changes
 * Note: In SERVICE_ZONE mode, returns empty array (no beams)
 */
export function useCombGeometry() {
    const cacheRef = useRef<CombGeometryCache | null>(null);
    const { coveragePolicy } = useSimulation();

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cacheRef.current = null;
        };
    }, []);

    /**
     * Get cached comb geometries, recalculating only when needed
     * In SERVICE_ZONE mode: returns empty array (no individual beams to display)
     * In DB_THRESHOLD mode: returns actual beam geometries
     */
    const getCombGeometries = useCallback((
        sat: SatelliteData,
        time: JulianDate
    ): Cartesian3[][] | null => {
        if (!sat.satrec) return null;

        // In SERVICE_ZONE mode, we don't calculate individual beams
        // Return empty array instead of null to avoid breaking components
        // that check for null vs empty
        if (coveragePolicy.type === "SERVICE_ZONE") {
            return []; // Empty array = no beams to render
        }

        const thresholdDb = coveragePolicy.thresholdDb;
        const cache = cacheRef.current;

        // Check if cache is valid (includes policy check)
        if (cache &&
            cache.satId === sat.id &&
            cache.policyType === coveragePolicy.type &&
            cache.thresholdDb === thresholdDb &&
            JulianDate.equals(time, cache.time)) {
            return cache.geometries;
        }

        // Calculate new geometries with current threshold
        const geometries = calculateCombGeometry(sat.satrec, time, thresholdDb);

        // Update cache
        cacheRef.current = {
            time: time.clone(),
            satId: sat.id,
            policyType: coveragePolicy.type,
            thresholdDb,
            geometries
        };

        return geometries;
    }, [coveragePolicy]);

    /**
     * Clear the cache (call when satellite selection changes significantly)
     */
    const clearCache = useCallback(() => {
        cacheRef.current = null;
    }, []);

    return {
        getCombGeometries,
        clearCache
    };
}
