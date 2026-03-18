/**
 * Hook to manage OneWeb comb geometry calculations with proper caching
 */
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import { calculateCombGeometry } from '../../../utils/oneWebComb';
import { useSimulation } from '../../../contexts/SimulationContext';
import { buildSimulationStateSnapshot } from '../../../types/simulation';

interface CombGeometryCache {
    time: JulianDate;
    satId: string;
    policyType: "DB_THRESHOLD" | "SERVICE_ZONE";
    thresholdDb?: number;
    healthString: string;
    hsBeamString: string;
    weather: string;
    geometries: Cartesian3[][] | null;
}

/**
 * Hook that provides cached comb geometry calculations
 * The cache is invalidated when time, satellite, or policy changes
 * Note: In SERVICE_ZONE mode, returns empty array (no beams)
 */
export function useCombGeometry() {
    const cacheRef = useRef<CombGeometryCache | null>(null);
    const { coveragePolicy, beamHealthFactors, weatherCondition, hsBeamsSet } = useSimulation();

    // Compute cache-comparison keys ONCE per state-change, not on every frame call.
    // These were previously computed inside getCombGeometries (a CallbackProperty hot path
    // called 48×/frame), allocating strings on every invocation even on a cache hit.
    const healthKey = useMemo(
        () => beamHealthFactors.map(f => f.healthFactor).join(','),
        [beamHealthFactors]
    );
    const hsKey = useMemo(
        () => Array.from(hsBeamsSet).sort((a, b) => a - b).join(','),
        [hsBeamsSet]
    );

    // Stable refs so the callback can read the latest keys without being recreated.
    const healthKeyRef = useRef(healthKey);
    healthKeyRef.current = healthKey;
    const hsKeyRef = useRef(hsKey);
    hsKeyRef.current = hsKey;

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cacheRef.current = null;
        };
    }, []);

    /**
     * Get cached comb geometries, recalculating only when needed.
     * In SERVICE_ZONE mode: returns empty array (no individual beams to display).
     * In DB_THRESHOLD mode: returns actual beam geometries.
     */
    const getCombGeometries = useCallback((
        sat: SatelliteData,
        time: JulianDate
    ): Cartesian3[][] | null => {
        if (!sat.satrec) return null;

        if (coveragePolicy.type === "SERVICE_ZONE") {
            return [];
        }

        const cache = cacheRef.current;
        const simulationState = buildSimulationStateSnapshot({
            coveragePolicy,
            weatherCondition,
            beamHealthFactors,
            hsBeams: hsBeamsSet,
        });

        // O(1) string comparisons against pre-computed refs — no allocation in hot path.
        if (cache &&
            cache.satId === sat.id &&
            cache.policyType === coveragePolicy.type &&
            cache.thresholdDb === simulationState.thresholdDb &&
            cache.healthString === healthKeyRef.current &&
            cache.hsBeamString === hsKeyRef.current &&
            cache.weather === weatherCondition &&
            JulianDate.equals(time, cache.time)) {
            return cache.geometries;
        }

        const geometries = calculateCombGeometry(sat.satrec, time, simulationState);

        cacheRef.current = {
            time: time.clone(),
            satId: sat.id,
            policyType: coveragePolicy.type,
            thresholdDb: simulationState.thresholdDb,
            healthString: healthKeyRef.current,
            hsBeamString: hsKeyRef.current,
            weather: weatherCondition,
            geometries
        };

        return geometries;
    }, [coveragePolicy, beamHealthFactors, weatherCondition, hsBeamsSet]);

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
