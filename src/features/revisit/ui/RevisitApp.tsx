/**
 * RevisitApp — the shell.
 *
 * Mounted from `main.tsx` INSTEAD of `<App/>`, and deliberately OUTSIDE
 * `SimulationProvider` (audit §5): it needs no RF simulation state, and staying
 * outside makes the isolation structural rather than merely conventional.
 *
 * It consumes `SimulationClock` and introduces no second time authority. Time
 * progression emits no React render — the globe and the ribbon read
 * `getTimeMs()` inside their own frame callbacks.
 *
 * UX §6, the entry moment: this never opens an empty configuration form. It
 * opens on a preset, already computing, with a number on screen.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import { RevisitGlobe } from '../render/RevisitGlobe';
import { useRevisitAnalysis } from '../hooks/useRevisitAnalysis';
import { constellationFor } from '../analysis/runScenario';
import {
    enumerateLadder, ladderPayloadCounts, selectedSatelliteIds,
} from '../domain/subConstellation';
import { defaultScenario, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import { RevisitHeader } from './RevisitHeader';
import { RevisitKpiPanel } from './RevisitKpiPanel';
import { CoverageRibbon } from './CoverageRibbon';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

/** The requirement the verdict badge compares against. Lot 3 makes this editable. */
const DEFAULT_REQUIREMENT_MS = 2 * 3600_000;

const TOGGLES: Array<{ key: keyof RevisitSceneOptions; label: string }> = [
    { key: 'showOrbits', label: 'Orbits' },
    { key: 'showSwaths', label: 'Swath' },
    { key: 'showHostFleet', label: 'Fleet' },
];

interface RevisitAppProps {
    /**
     * Return to the main application. REVISIT unmounts `<App/>` entirely, so the
     * three-peer switch that lives in App's header is not on screen here — this
     * view has to carry its own way back or the user is stranded.
     */
    onExit?: () => void;
}

export const RevisitApp: React.FC<RevisitAppProps> = ({ onExit }) => {
    const clock = useSimulationClock();

    // The analysis window is anchored ONCE, at mount. The playhead moves within
    // it; scrubbing never moves the window and therefore never changes the
    // statistics. See useRevisitAnalysis for the full argument.
    const epochRef = useRef<number>(clock.getTimeMs());
    const [scenario, setScenario] = useState<RevisitScenario>(
        () => defaultScenario(epochRef.current)
    );
    const [options, setOptions] = useState<RevisitSceneOptions>({
        showOrbits: true, showSwaths: true, showHostFleet: true,
    });

    const { analysis, isComputing, error, isMainThreadFallback } = useRevisitAnalysis(scenario);

    const fleet = useMemo(
        () => constellationFor(scenario.reference),
        [scenario.reference]
    );
    const selectedIds = useMemo(
        () => selectedSatelliteIds(scenario.reference, scenario.selection),
        [scenario.reference, scenario.selection]
    );

    const payloadCounts = useMemo(
        () => ladderPayloadCounts(scenario.reference.planes, scenario.reference.satsPerPlane),
        [scenario.reference.planes, scenario.reference.satsPerPlane]
    );
    const currentPayloadCount = selectedIds.size;

    /**
     * Move the slider: pick the best-spread configuration at the requested
     * payload count. `enumerateLadder` already orders ties by descending plane
     * count, so the first match is the one to take — the engine's own sweep
     * confirms spread beats concentration at equal payload count.
     */
    const handlePayloadCountChange = useCallback((count: number) => {
        setScenario((current) => {
            const rung = enumerateLadder(current.reference.planes, current.reference.satsPerPlane)
                .find((e) => e.payloadCount === count);
            if (!rung) return current;
            return {
                ...current,
                selection: {
                    planeStride: rung.planeStride,
                    satStride: rung.satStride,
                    planeShift: current.selection.planeShift,
                },
            };
        });
    }, []);

    const handleTargetChange = useCallback((name: string) => {
        const target = TARGET_PRESETS.find((t) => t.name === name);
        if (target) setScenario((current) => ({ ...current, target }));
    }, []);

    const spreadNote = useMemo(() => {
        const ladder = enumerateLadder(scenario.reference.planes, scenario.reference.satsPerPlane)
            .filter((e) => e.payloadCount === currentPayloadCount);
        if (ladder.length < 2) return null;
        const best = ladder[0];
        return `${best.selectedPlanes} planes × ${best.payloadsPerPlane} — best of ${ladder.length} splits at this count`;
    }, [scenario.reference.planes, scenario.reference.satsPerPlane, currentPayloadCount]);

    const getTimeMs = useCallback(() => clock.getTimeMs(), [clock]);
    const handleSeek = useCallback((ms: number) => clock.setDateTime(ms), [clock]);

    const toggle = useCallback((key: keyof RevisitSceneOptions) => {
        setOptions((current) => ({ ...current, [key]: !current[key] }));
    }, []);

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-[#05070D] text-slate-100">
            <div className="absolute inset-0">
                <RevisitGlobe
                    scenario={scenario}
                    fleet={fleet}
                    selectedIds={selectedIds}
                    options={options}
                    getTimeMs={getTimeMs}
                />
            </div>

            {/* One flex column owns the whole overlay. Absolute offsets between
                panels were fragile: the header grows when a spread note appears
                and silently overlapped the KPI panel. Flow layout cannot. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-3">
                <div className="pointer-events-auto">
                    <RevisitHeader
                        scenario={scenario}
                        payloadCounts={payloadCounts}
                        currentPayloadCount={currentPayloadCount}
                        onPayloadCountChange={handlePayloadCountChange}
                        targetNames={TARGET_PRESETS.map((t) => t.name)}
                        onTargetChange={handleTargetChange}
                        spreadNote={spreadNote}
                    />
                </div>

                <div className="flex items-start justify-between gap-2">
                    {/* Display toggles — the slot ENG uses for REG / 5G / CONN / LOAD */}
                    <div className={`pointer-events-auto ${REVISIT_PANEL} flex flex-col gap-1 p-1.5`}>
                        {onExit && (
                            <button
                                type="button"
                                onClick={onExit}
                                className="mb-0.5 rounded-md border-b border-slate-700/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-slate-100"
                            >
                                ‹ Back
                            </button>
                        )}
                        {TOGGLES.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggle(key)}
                                aria-pressed={options[key]}
                                className={[
                                    'rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                                    options[key]
                                        ? 'bg-amber-500/20 text-amber-200'
                                        : 'text-slate-500 hover:text-slate-300',
                                ].join(' ')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {(error || isMainThreadFallback) && (
                        <div className={`pointer-events-auto ${REVISIT_PANEL} border-red-400/40 px-3 py-1.5 text-[11px] text-red-200`}>
                            {error ?? 'Running on the main thread — Worker unavailable'}
                        </div>
                    )}

                    <div className="pointer-events-auto w-[400px] shrink-0">
                        <RevisitKpiPanel
                            statistics={analysis?.statistics ?? null}
                            windowHours={scenario.window.durationHours}
                            requirementMs={DEFAULT_REQUIREMENT_MS}
                            isComputing={isComputing}
                        />
                    </div>
                </div>

                {/* Spacer — pushes provenance and the ribbon to the bottom. */}
                <div className="flex-1" />

                {/* Model provenance — the credibility slot (UX §4.5). REVISIT has
                    no TLE, so it carries the assumptions instead. */}
                <div className="flex">
                    <div className={`pointer-events-auto ${REVISIT_PANEL} px-3 py-2`}>
                        <span className={REVISIT_LABEL}>Model provenance</span>
                        <ul className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-400">
                            <li>Kepler + J2 secular · no drag</li>
                            <li>Spherical earth R = 6371 km</li>
                            <li className="text-slate-600">Fit vs OneWeb TLE — not yet calibrated</li>
                        </ul>
                    </div>
                </div>

                <div className="pointer-events-auto">
                    <CoverageRibbon
                        intervals={analysis?.intervals ?? []}
                        statistics={analysis?.statistics ?? null}
                        windowStartMs={scenario.window.startMs}
                        windowHours={scenario.window.durationHours}
                        getTimeMs={getTimeMs}
                        onSeek={handleSeek}
                    />
                </div>
            </div>
        </div>
    );
};

export default RevisitApp;
