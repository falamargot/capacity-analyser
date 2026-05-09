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
    previousSampleTimeMs: number;
    currentSampleTimeMs: number;
}

const SATELLITE_INTERPOLATION_FALLBACK_MS = 1000;
// Extrapolation beyond the latest sample. With the fixed timing model, the next tick
// arrives ~200 ms before the current sample's timestamp expires, so extrapolation is
// only needed when a tick is significantly late (tab backgrounded, GC storm).
// Keep this short to avoid linear drift compounding on orbital curves.
const SATELLITE_MAX_EXTRAPOLATION_MS = 1200;

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

const getInterpolatedSatellitePosition = (
    previousPosition: SatellitePosition,
    currentPosition: SatellitePosition,
    previousSampleTimeMs: number,
    currentSampleTimeMs: number,
    nowMs: number
): SatellitePosition => {
    const sampleDuration = Math.max(currentSampleTimeMs - previousSampleTimeMs, 1);
    const maxProgress = 1 + (SATELLITE_MAX_EXTRAPOLATION_MS / sampleDuration);
    const progress = Math.min(Math.max((nowMs - previousSampleTimeMs) / sampleDuration, 0), maxProgress);
    return {
        lat: lerp(previousPosition.lat, currentPosition.lat, progress),
        lng: interpolateLongitudeDegrees(previousPosition.lng, currentPosition.lng, progress),
        alt: lerp(previousPosition.alt, currentPosition.alt, progress),
    };
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
     * blends between the previous and current worker snapshots. If the next worker
     * sample is late, the same vector is extrapolated briefly so LEO markers do not
     * visually freeze between propagation ticks.
     */
    const getSatellitePositionCallback = useMemo(() => {
        return (sat: SatelliteData): CallbackPositionProperty => {
            const cache = cacheRef.current.satellites;
            const now = Date.now();
            const nextPosition = cloneSatellitePosition(sat.position);
            const nextSampleTimeMs = sat.position.sampleTimeMs ?? now;

            const existing = satLiveCellsRef.current.get(sat.id);
            if (existing) {
                existing.value = sat;
                if (!positionsMatch(existing.currentPosition, nextPosition)) {
                    // Advance the window: the previous "current" (future) position becomes
                    // the new "previous", keyed to its original future timestamp.
                    // This keeps sampleDuration = tick interval (~1 s) regardless of when
                    // the React render runs — GC pauses and render delays no longer distort
                    // the interpolation speed.
                    existing.previousPosition = existing.currentPosition;
                    existing.previousSampleTimeMs = existing.currentSampleTimeMs;
                    existing.currentPosition = nextPosition;
                    existing.currentSampleTimeMs = nextSampleTimeMs;
                }
            } else {
                satLiveCellsRef.current.set(sat.id, {
                    value: sat,
                    previousPosition: nextPosition,
                    currentPosition: nextPosition,
                    previousSampleTimeMs: nextSampleTimeMs - SATELLITE_INTERPOLATION_FALLBACK_MS,
                    currentSampleTimeMs: nextSampleTimeMs,
                });
            }

            if (!cache.has(sat.id)) {
                const liveCell = satLiveCellsRef.current.get(sat.id)!;

                const callback = new CallbackPositionProperty(() => {
                    const position = getInterpolatedSatellitePosition(
                        liveCell.previousPosition,
                        liveCell.currentPosition,
                        liveCell.previousSampleTimeMs,
                        liveCell.currentSampleTimeMs,
                        Date.now()
                    );
                    const {
                        previousPosition,
                        currentPosition,
                    } = liveCell;
                    if (positionsMatch(previousPosition, currentPosition)) {
                        return Cartesian3.fromDegrees(currentPosition.lng, currentPosition.lat, currentPosition.alt * 1000);
                    }
                    return Cartesian3.fromDegrees(position.lng, position.lat, position.alt * 1000);
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
