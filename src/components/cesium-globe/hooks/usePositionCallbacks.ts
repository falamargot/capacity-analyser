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

type SatellitePosition = Pick<SatelliteData['position'], 'lat' | 'lng' | 'alt'>;

interface SatelliteLiveCell {
    value: SatelliteData;
    previousPosition: SatellitePosition;
    currentPosition: SatellitePosition;
    transitionStartMs: number;
    transitionDurationMs: number;
}

const SATELLITE_INTERPOLATION_MIN_MS = 250;
const SATELLITE_INTERPOLATION_MAX_MS = 2500;

const cloneSatellitePosition = (position: SatelliteData['position']): SatellitePosition => ({
    lat: position.lat,
    lng: position.lng,
    alt: position.alt,
});

const positionsMatch = (a: SatellitePosition, b: SatellitePosition): boolean => (
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.alt === b.alt
);

const lerp = (start: number, end: number, t: number): number => (
    start + ((end - start) * t)
);

const interpolateLongitudeDegrees = (start: number, end: number, t: number): number => {
    let delta = end - start;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const value = start + (delta * t);
    if (value > 180) return value - 360;
    if (value < -180) return value + 360;
    return value;
};

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

    // Per-satellite live cell: stores the latest worker snapshot plus the previous one
    // so Cesium can blend smoothly between 2-second propagation ticks.
    const satLiveCellsRef = useRef<Map<string, SatelliteLiveCell>>(new Map());

    // Per-aircraft live cell: holds the most recent Aircraft from the fetch cycle.
    // Callbacks close over the cell so they always read the latest
    // velocity / heading / last_contact without needing a new CallbackPositionProperty.
    const acLiveCellsRef = useRef<Map<string, { value: Aircraft }>>(new Map());

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
     * Reads position from a live cell refreshed on every React render and linearly
     * blends between the previous and current worker snapshots. This keeps the
     * markers visually continuous between the 2-second SGP4 worker ticks without
     * re-running SGP4 on the main thread for every frame and every satellite.
     */
    const getSatellitePositionCallback = useMemo(() => {
        return (sat: SatelliteData): CallbackPositionProperty => {
            const cache = cacheRef.current.satellites;
            const now = Date.now();
            const nextPosition = cloneSatellitePosition(sat.position);

            const existing = satLiveCellsRef.current.get(sat.id);
            if (existing) {
                existing.value = sat;
                if (!positionsMatch(existing.currentPosition, nextPosition)) {
                    const elapsed = now - existing.transitionStartMs;
                    existing.previousPosition = existing.currentPosition;
                    existing.currentPosition = nextPosition;
                    existing.transitionStartMs = now;
                    existing.transitionDurationMs = Math.min(
                        Math.max(elapsed, SATELLITE_INTERPOLATION_MIN_MS),
                        SATELLITE_INTERPOLATION_MAX_MS
                    );
                }
            } else {
                satLiveCellsRef.current.set(sat.id, {
                    value: sat,
                    previousPosition: nextPosition,
                    currentPosition: nextPosition,
                    transitionStartMs: now,
                    transitionDurationMs: 1,
                });
            }

            if (!cache.has(sat.id)) {
                const liveCell = satLiveCellsRef.current.get(sat.id)!;

                const callback = new CallbackPositionProperty(() => {
                    const elapsed = Date.now() - liveCell.transitionStartMs;
                    const progress = liveCell.transitionDurationMs > 0
                        ? Math.min(elapsed / liveCell.transitionDurationMs, 1)
                        : 1;
                    const { previousPosition, currentPosition } = liveCell;
                    const lat = lerp(previousPosition.lat, currentPosition.lat, progress);
                    const lng = interpolateLongitudeDegrees(previousPosition.lng, currentPosition.lng, progress);
                    const alt = lerp(previousPosition.alt, currentPosition.alt, progress);
                    return Cartesian3.fromDegrees(lng, lat, alt * 1000);
                }, false);

                cache.set(sat.id, callback);
            }

            return cache.get(sat.id)!;
        };
    }, []);

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
