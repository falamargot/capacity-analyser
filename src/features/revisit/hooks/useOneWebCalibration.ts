/**
 * useOneWebCalibration — fit the parametric shell to the real fleet, on demand.
 *
 * The application already loads real OneWeb TLEs from CelesTrak with a
 * 30-minute cache and a prebuilt fallback, so this costs nothing new: it reuses
 * `fetchSatellites` and reads mean elements out of what is already there.
 *
 * ── THE ADR BOUNDARY ────────────────────────────────────────────────────────
 * This hook lives under `src/features/revisit/`, so it must never touch a
 * `satrec` (ADR-001 §1). It does not: `observedElementsFromSatellites` — which
 * lives in `src/utils/` — converts records to plain numbers, and only those
 * numbers cross into `fitWalker`. Nothing here propagates, and `satellite.js` is
 * not imported.
 *
 * Fetching is user-triggered rather than automatic. It reaches the network, and
 * the mode must open instantly on a preset (UX §6) rather than waiting on a
 * fleet download it may never need.
 */

import { useCallback, useRef, useState } from 'react';
import { fetchSatellites, getTleProvenance, type TleProvenance } from '../../../services/satelliteService';
import { observedElementsFromSatellites } from '../../../utils/observedOrbitalElements';
import { fitWalker, type WalkerFit } from '../calibration/fitWalker';

/**
 * What the fit was measured FROM — the half of the result that makes two
 * successive measurements comparable.
 *
 * A fit with no provenance is a number without a subject: the ladder in
 * `fetchTLE` may serve live data, a stale cache or the file shipped with the
 * build, and the catalogue changes underneath. Two runs minutes apart can
 * legitimately report a different satellite count, and only these fields
 * explain why.
 */
export interface CalibrationProvenance extends TleProvenance {
    /** Satellites the catalogue held for this operator, before any fit gating. */
    catalogueSatellites: number;
    /** Oldest and newest TLE epoch in the set, ms. */
    epochRangeMs: { earliestMs: number; latestMs: number } | null;
}

export interface CalibrationResult {
    fit: WalkerFit;
    provenance: CalibrationProvenance;
}

export interface UseOneWebCalibrationResult {
    fit: WalkerFit | null;
    /** Provenance of the TLE set the current `fit` was measured from. */
    provenance: CalibrationProvenance | null;
    isRunning: boolean;
    error: string | null;
    /**
     * Fetch the real fleet and fit the shell. Safe to call repeatedly.
     * Resolves with the fit so a caller can adopt it in the same tick; `null`
     * means the attempt failed and `error` carries why.
     */
    calibrate: () => Promise<WalkerFit | null>;
    reset: () => void;
}

export function useOneWebCalibration(): UseOneWebCalibrationResult {
    const [fit, setFit] = useState<WalkerFit | null>(null);
    const [provenance, setProvenance] = useState<CalibrationProvenance | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef(false);

    const calibrate = useCallback(async (): Promise<WalkerFit | null> => {
        if (inFlightRef.current) return null;
        inFlightRef.current = true;
        setIsRunning(true);
        setError(null);

        try {
            const satellites = await fetchSatellites();
            const oneWeb = satellites.filter((s) => s.type === 'ONEWEB');
            if (oneWeb.length === 0) {
                throw new Error('No OneWeb satellites in the loaded catalogue');
            }

            const observed = observedElementsFromSatellites(oneWeb);
            if (observed.length === 0) {
                throw new Error(
                    `${oneWeb.length} OneWeb satellites loaded, but none carried readable mean elements`
                );
            }

            const nextFit = fitWalker(observed);
            const epochs = observed.map((element) => element.epochMs);
            setFit(nextFit);
            setProvenance({
                // A fetch that resolved from cache still went through the
                // ladder, so the rung is always known by the time we are here.
                ...(getTleProvenance('ONEWEB') ?? { source: 'bundled', retrievedAtMs: Date.now() }),
                catalogueSatellites: oneWeb.length,
                epochRangeMs: epochs.length > 0
                    ? { earliestMs: Math.min(...epochs), latestMs: Math.max(...epochs) }
                    : null,
            });
            return nextFit;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return null;
        } finally {
            inFlightRef.current = false;
            setIsRunning(false);
        }
    }, []);

    const reset = useCallback(() => {
        setFit(null);
        setProvenance(null);
        setError(null);
    }, []);

    return { fit, provenance, isRunning, error, calibrate, reset };
}
