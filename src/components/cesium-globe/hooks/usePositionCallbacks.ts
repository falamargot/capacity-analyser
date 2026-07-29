/**
 * Hook to manage cached CallbackPositionProperty instances for satellites and aircraft
 * This prevents creating new callback instances on every render, which is critical for performance
 */
import React, { useId, useRef, useEffect, useMemo, useCallback } from 'react';
import { Cartesian3, CallbackPositionProperty, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import type { Aircraft } from '../../../modules/airTraffic/airTrafficService';
import type { AircraftInterpolation } from '../../../modules/airTraffic/useAirTraffic';
import { getPosition, calculateDeadReckoning } from '../utils';
import {
    positionsMatch,
    resolveDisplayedSatellitePosition,
    SATELLITE_INTERPOLATION_FALLBACK_MS,
    type SatellitePosition,
    type SatelliteSampleWindow,
} from './satelliteInterpolation';
import {
    registerOrbitalAlignmentProbe,
    type DisplayedSatelliteSample,
} from '../../../diagnostics/orbitalAlignmentProbe';

/**
 * Cells refreshed within this window of the newest refresh are treated as
 * belonging to the same render pass. One React render walks its satellite list
 * in well under a frame, so the grouping is unambiguous.
 */
const RENDER_PASS_TOLERANCE_MS = 250;

interface PositionCallbackCache {
    satellites: Map<string, CallbackPositionProperty>;
    aircraft: Map<string, CallbackPositionProperty>;
}

interface SatelliteLiveCell extends SatelliteSampleWindow {
    value: SatelliteData;
    /**
     * When a React render last handed this cell fresh worker output. Cells are
     * refreshed inside getSatellitePositionCallback, so an instance that stops
     * rendering stops refreshing its cells even though the Cesium callback keeps
     * reading them. The dev-only alignment probe reports this so the two ways a
     * marker goes stale can be told apart.
     */
    lastRefreshedAtMs: number;
}

const cloneSatellitePosition = (position: SatelliteData['position']): SatellitePosition => ({
    lat: position.lat,
    lng: position.lng,
    alt: position.alt,
});

/**
 * Hook that provides stable CallbackPositionProperty instances for entities
 * The callbacks are cached and reused across renders
 */
export function usePositionCallbacks(
    satellites: SatelliteData[],
    aircraft: Aircraft[],
    interpolatedAircraftMapRef?: React.RefObject<Map<string, AircraftInterpolation>>,
    /** Names this instance in the dev-only alignment report. Three instances exist. */
    ownerLabel: string = 'unlabelled'
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

    // Dev-only probe for the orbital-alignment diagnostic. Reads the same live
    // cells the position callbacks read and flattens them to plain numbers; it
    // never propagates anything and never touches Cesium. `import.meta.env.DEV`
    // is statically false in a production build, so this effect and the import
    // it uses are eliminated there.
    const ownerId = useId();
    const satellitesRef = useRef(satellites);
    satellitesRef.current = satellites;
    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const cells = satLiveCellsRef.current;
        // Ids requested in the newest render pass share a refresh timestamp, so
        // "currently rendered" is read off the cells themselves rather than
        // tracked separately — no bookkeeping to leak or get out of sync.
        const renderedIds = (): string[] => {
            let newest = 0;
            for (const cell of cells.values()) newest = Math.max(newest, cell.lastRefreshedAtMs);
            if (newest === 0) return [];
            const out: string[] = [];
            for (const [id, cell] of cells) {
                if (newest - cell.lastRefreshedAtMs <= RENDER_PASS_TOLERANCE_MS) out.push(id);
            }
            return out;
        };
        return registerOrbitalAlignmentProbe({
            ownerId,
            ownerLabel,
            getSatelliteIds: () => satellitesRef.current
                .filter((sat) => sat.type === 'ONEWEB')
                .map((sat) => sat.id),
            getSatrecs: () => satellitesRef.current
                .filter((sat) => sat.type === 'ONEWEB' && sat.satrec)
                .map((sat) => ({ id: sat.id, satrec: sat.satrec })),
            getCellIds: () => [...cells.keys()],
            getRenderedSatelliteIds: renderedIds,
            sampleDisplayed: (ids, atMs) => {
                const out: DisplayedSatelliteSample[] = [];
                for (const id of ids) {
                    const cell = cells.get(id);
                    if (!cell) continue;
                    const position = resolveDisplayedSatellitePosition(cell, atMs);
                    out.push({
                        id,
                        lat: position.lat,
                        lng: position.lng,
                        alt: position.alt,
                        workerSampleAgeMs: atMs - cell.currentSampleTimeMs,
                        cellRefreshAgeMs: atMs - cell.lastRefreshedAtMs,
                    });
                }
                return out;
            },
        });
    }, [ownerId, ownerLabel]);

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
                existing.lastRefreshedAtMs = now;
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
                    lastRefreshedAtMs: now,
                    previousPosition: nextPosition,
                    currentPosition: nextPosition,
                    previousSampleTimeMs: nextSampleTimeMs - SATELLITE_INTERPOLATION_FALLBACK_MS,
                    currentSampleTimeMs: nextSampleTimeMs,
                });
            }

            if (!cache.has(sat.id)) {
                const liveCell = satLiveCellsRef.current.get(sat.id)!;

                const callback = new CallbackPositionProperty(() => {
                    const position = resolveDisplayedSatellitePosition(liveCell, Date.now());
                    return Cartesian3.fromDegrees(position.lng, position.lat, position.alt * 1000);
                }, false);

                cache.set(sat.id, callback);
            }

            return cache.get(sat.id)!;
        };
    }, []);

    /**
     * Stable accessor for event handlers and scale callbacks in memoized
     * SatelliteEntity children. The live cell is refreshed by the parent on
     * every worker publication, so children do not need to re-render merely to
     * observe a new position or return the latest satellite on click.
     */
    const getLatestSatellite = useCallback((satelliteId: string): SatelliteData | undefined => (
        satLiveCellsRef.current.get(satelliteId)?.value
    ), []);

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
        getLatestSatellite,
        getAircraftPositionCallback
    };
}
