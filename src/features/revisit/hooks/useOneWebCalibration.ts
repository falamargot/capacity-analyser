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
import { fetchSatellites } from '../../../services/satelliteService';
import { observedElementsFromSatellites } from '../../../utils/observedOrbitalElements';
import { fitWalker, type WalkerFit } from '../calibration/fitWalker';

export interface UseOneWebCalibrationResult {
    fit: WalkerFit | null;
    isRunning: boolean;
    error: string | null;
    /** Fetch the real fleet and fit the shell. Safe to call repeatedly. */
    calibrate: () => Promise<void>;
    reset: () => void;
}

export function useOneWebCalibration(): UseOneWebCalibrationResult {
    const [fit, setFit] = useState<WalkerFit | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef(false);

    const calibrate = useCallback(async () => {
        if (inFlightRef.current) return;
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

            setFit(fitWalker(observed));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            inFlightRef.current = false;
            setIsRunning(false);
        }
    }, []);

    const reset = useCallback(() => {
        setFit(null);
        setError(null);
    }, []);

    return { fit, isRunning, error, calibrate, reset };
}
