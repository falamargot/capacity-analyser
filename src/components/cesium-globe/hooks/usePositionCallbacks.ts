/**
 * Hook to manage cached CallbackPositionProperty instances for satellites and aircraft
 * This prevents creating new callback instances on every render, which is critical for performance
 */
import React, { useRef, useEffect, useMemo } from 'react';
import { Cartesian3, CallbackPositionProperty, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import type { Aircraft } from '../../../modules/airTraffic/airTrafficService';
import type { AircraftInterpolation } from '../../../modules/airTraffic/useAirTraffic';
import { getPosition, calculateDeadReckoning } from '../utils';

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
    aircraft: Aircraft[],
    interpolatedAircraftMapRef?: React.RefObject<Map<string, AircraftInterpolation>>
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
                satLiveCellsRef.current.delete(id);
            }
        }

        // Remove stale aircraft entries
        for (const id of cache.aircraft.keys()) {
            if (!currentAircraftIds.has(id)) {
                cache.aircraft.delete(id);
            }
        }
    }, [currentSatelliteIds, currentAircraftIds]);

    // Cleanup all on unmount — capture the current refs to avoid ref-change warnings
    useEffect(() => {
        const cache = cacheRef.current;
        const satCells = satLiveCellsRef.current;
        return () => {
            cache.satellites.clear();
            cache.aircraft.clear();
            satCells.clear();
        };
    }, []);

    /**
     * Get or create a cached CallbackPositionProperty for a satellite.
     *
     * Reads position from a live cell that is refreshed on every React render
     * (i.e., whenever the parent propagates new satellite positions) — no SGP4
     * runs inside the Cesium frame callback. This eliminates ~36 000 SGP4
     * calls/sec (600 sats × 60 fps) without changing visual fidelity: at LEO
     * orbital speed (~7 km/s) the position delta between parent update cycles
     * is imperceptible at any normal globe zoom level.
     */
    const getSatellitePositionCallback = useMemo(() => {
        return (sat: SatelliteData): CallbackPositionProperty => {
            const cache = cacheRef.current.satellites;

            // Always refresh the live cell so the callback reads the latest position.
            const existing = satLiveCellsRef.current.get(sat.id);
            if (existing) {
                existing.value = sat;
            } else {
                satLiveCellsRef.current.set(sat.id, { value: sat });
            }

            if (!cache.has(sat.id)) {
                const liveCell = satLiveCellsRef.current.get(sat.id)!;

                const callback = new CallbackPositionProperty(() => {
                    const { lat, lng, alt } = liveCell.value.position;
                    return Cartesian3.fromDegrees(lng, lat, alt * 1000);
                }, false);

                cache.set(sat.id, callback);
            }

            return cache.get(sat.id)!;
        };
    }, []);

    // Per-satellite live cell: holds the most recent SatelliteData from the React update cycle.
    // Callbacks close over the cell so they always read sat.position without re-running SGP4.
    // Position accuracy matches the parent's update interval — imperceptible at orbital speeds.
    const satLiveCellsRef = useRef<Map<string, { value: SatelliteData }>>(new Map());

    // Per-aircraft live cell: holds the most recent Aircraft from the fetch cycle.
    // Callbacks close over the cell so they always read the latest
    // velocity / heading / last_contact without needing a new CallbackPositionProperty.
    const acLiveCellsRef = useRef<Map<string, { value: Aircraft }>>(new Map());

    /**
     * Get or create a cached CallbackPositionProperty for aircraft.
     *
     * Dead reckoning (velocity × Δt from last_contact) provides continuous smooth
     * motion between API refreshes — Cesium drives it at 60fps, zero React state.
     * The live cell ensures the callback always uses the freshest fetch data so the
     * extrapolation origin is reset on every 10-second API update.
     */
    const getAircraftPositionCallback = useMemo(() => {
        return (ac: Aircraft): CallbackPositionProperty => {
            const cache = cacheRef.current.aircraft;

            // Refresh the live cell so the callback uses the latest fetch data
            const existing = acLiveCellsRef.current.get(ac.icao24);
            if (existing) {
                existing.value = ac;
            } else {
                acLiveCellsRef.current.set(ac.icao24, { value: ac });
            }

            if (!cache.has(ac.icao24)) {
                const icao24 = ac.icao24;
                const liveCell = acLiveCellsRef.current.get(icao24)!;

                const callback = new CallbackPositionProperty((time?: JulianDate) => {
                    const live = liveCell.value;
                    if (!time) {
                        return getPosition(live.latitude ?? 0, live.longitude ?? 0, live.altitude_km ?? 10);
                    }
                    return calculateDeadReckoning(live, time);
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
