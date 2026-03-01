/**
 * Hook to manage cached CallbackPositionProperty instances for satellites and aircraft
 * This prevents creating new callback instances on every render, which is critical for performance
 */
import { useRef, useEffect, useMemo } from 'react';
import { CallbackPositionProperty, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import type { Aircraft } from '../../../modules/airTraffic/airTrafficService';
import { getPosition, propagateSatellite, calculateDeadReckoning } from '../utils';

interface PositionCallbackCache {
    satellites: Map<string, CallbackPositionProperty>;
    aircraft: Map<string, CallbackPositionProperty>;
}

/**
 * Hook that provides stable CallbackPositionProperty instances for entities
 * The callbacks are cached and reused across renders
 */
export function usePositionCallbacks(
    satellites: SatelliteData[],
    aircraft: Aircraft[]
) {
    const cacheRef = useRef<PositionCallbackCache>({
        satellites: new Map(),
        aircraft: new Map()
    });

    // Track current entity IDs to clean up stale entries
    const currentSatelliteIds = useMemo(
        () => new Set(satellites.map(s => s.id)),
        [satellites]
    );

    const currentAircraftIds = useMemo(
        () => new Set(aircraft.map(a => a.icao24)),
        [aircraft]
    );

    // Cleanup stale entries and create new ones as needed
    useEffect(() => {
        const cache = cacheRef.current;

        // Remove stale satellite entries
        for (const id of cache.satellites.keys()) {
            if (!currentSatelliteIds.has(id)) {
                cache.satellites.delete(id);
            }
        }

        // Remove stale aircraft entries
        for (const id of cache.aircraft.keys()) {
            if (!currentAircraftIds.has(id)) {
                cache.aircraft.delete(id);
            }
        }
    }, [currentSatelliteIds, currentAircraftIds]);

    // Cleanup all on unmount — capture the current cache to avoid ref-change warnings
    useEffect(() => {
        const cache = cacheRef.current;
        return () => {
            cache.satellites.clear();
            cache.aircraft.clear();
        };
    }, []);

    /**
     * Get or create a cached CallbackPositionProperty for a satellite
     */
    const getSatellitePositionCallback = useMemo(() => {
        return (sat: SatelliteData): CallbackPositionProperty => {
            const cache = cacheRef.current.satellites;

            if (!cache.has(sat.id)) {
                // Create new callback - capture sat by reference in closure
                // The callback reads current satellite data on each invocation
                const callback = new CallbackPositionProperty((time?: JulianDate) => {
                    if (!time) {
                        return getPosition(sat.position.lat, sat.position.lng, sat.position.alt);
                    }
                    return propagateSatellite(sat, time);
                }, false);

                cache.set(sat.id, callback);
            }

            return cache.get(sat.id)!;
        };
    }, []);

    /**
     * Get or create a cached CallbackPositionProperty for aircraft
     */
    const getAircraftPositionCallback = useMemo(() => {
        return (ac: Aircraft): CallbackPositionProperty => {
            const cache = cacheRef.current.aircraft;

            if (!cache.has(ac.icao24)) {
                const callback = new CallbackPositionProperty((time?: JulianDate) => {
                    if (!time) {
                        return getPosition(ac.latitude || 0, ac.longitude || 0, ac.altitude_km || 10);
                    }
                    return calculateDeadReckoning(ac, time);
                }, false);

                cache.set(ac.icao24, callback);
            }

            return cache.get(ac.icao24)!;
        };
    }, []);

    return {
        getSatellitePositionCallback,
        getAircraftPositionCallback
    };
}
