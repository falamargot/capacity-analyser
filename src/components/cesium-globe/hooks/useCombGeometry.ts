/**
 * Hook to manage OneWeb comb geometry calculations with proper caching
 */
import { useRef, useEffect, useCallback } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import { calculateCombGeometry } from '../../../utils/oneWebComb';

interface CombGeometryCache {
    time: JulianDate;
    satId: string;
    geometries: Cartesian3[][] | null;
}

/**
 * Hook that provides cached comb geometry calculations
 * The cache is invalidated when time or satellite changes
 */
export function useCombGeometry() {
    const cacheRef = useRef<CombGeometryCache | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cacheRef.current = null;
        };
    }, []);

    /**
     * Get cached comb geometries, recalculating only when needed
     */
    const getCombGeometries = useCallback((
        sat: SatelliteData,
        time: JulianDate
    ): Cartesian3[][] | null => {
        if (!sat.satrec) return null;

        const cache = cacheRef.current;

        // Check if cache is valid
        if (cache &&
            cache.satId === sat.id &&
            JulianDate.equals(time, cache.time)) {
            return cache.geometries;
        }

        // Calculate new geometries
        const geometries = calculateCombGeometry(sat.satrec, time);

        // Update cache
        cacheRef.current = {
            time: time.clone(),
            satId: sat.id,
            geometries
        };

        return geometries;
    }, []);

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
