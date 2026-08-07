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
import { useRevisitSweep } from '../hooks/useRevisitSweep';
import { explainRevisit } from '../analysis/explainRevisit';
import { ValueCurve } from './ValueCurve';
import { WhyThisRevisit } from './WhyThisRevisit';
import { AdvancedDrawer } from './AdvancedDrawer';
import { constellationFor } from '../analysis/runScenario';
import {
    enumerateLadder, ladderPayloadCounts, reconcileSelection, selectedSatelliteIds,
} from '../domain/subConstellation';
import { useOneWebCalibration } from '../hooks/useOneWebCalibration';
import { ModelProvenance } from './ModelProvenance';
import { defaultScenario, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario, WalkerSpec } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import { RevisitHeader } from './RevisitHeader';
import { RevisitKpiPanel } from './RevisitKpiPanel';
import { CoverageRibbon } from './CoverageRibbon';
import { REVISIT_PANEL } from './revisitTheme';

/** The customer requirement the verdict badge and the value curve compare against. */
const DEFAULT_REQUIREMENT_MS = 2 * 3600_000;

/** Requirements a customer actually states, in hours. */
const REQUIREMENT_CHOICES_H = [0.5, 1, 2, 3, 6, 12, 24];

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

    const [requirementMs, setRequirementMs] = useState(DEFAULT_REQUIREMENT_MS);

    const { analysis, isComputing, error, isMainThreadFallback } = useRevisitAnalysis(scenario);
    // Its own worker, and keyed so the payload slider never re-triggers it.
    const { sweep, isComputing: isSweeping } = useRevisitSweep(scenario);

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
     * Move the slider: take the configuration the sweep MEASURED as best at the
     * requested payload count.
     *
     * Not the ladder's default ordering. `enumerateLadder` breaks ties by
     * descending plane count, which is a deterministic default and NOT a claim
     * that spread always wins — measurement says otherwise. At i = 87.9° with
     * London well below the turning latitude, 4 planes beat 1 by ~69%; at
     * i = 55°, with London just under the turning latitude of 55°, one plane
     * with dense in-plane spacing beat two planes by the same order.
     *
     * Using the heuristic here while the value curve plots the measured best
     * would let the chart promise a number the headline does not deliver — the
     * kind of disagreement that ends a demo. Falls back to the ladder only while
     * the sweep is still in flight.
     */
    const sweepRef = useRef(sweep);
    sweepRef.current = sweep;

    const handlePayloadCountChange = useCallback((count: number) => {
        setScenario((current) => {
            const measured = sweepRef.current?.points.find((p) => p.payloadCount === count);
            if (measured) {
                return {
                    ...current,
                    selection: {
                        ...measured.best.selection,
                        planeShift: current.selection.planeShift,
                    },
                };
            }
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

    const calibration = useOneWebCalibration();

    /**
     * Adopt the fitted shell. The selection must be repaired in the same step:
     * the real fleet's plane count rarely matches the preset's, so the current
     * strides may no longer divide P and S.
     */
    const handleAdoptFit = useCallback((fitted: WalkerSpec) => {
        setScenario((current) => ({
            ...current,
            reference: fitted,
            selection: reconcileSelection(fitted, current.selection),
        }));
    }, []);

    const explanation = useMemo(
        () => explainRevisit(scenario, analysis?.statistics ?? null, sweep),
        [scenario, analysis, sweep]
    );

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

                {/* `flex-1 min-h-0` is load-bearing: it gives this row the leftover
                    height and lets the analysis column scroll inside it. Without
                    min-h-0 a tall column grows the row instead, pushing the ribbon
                    off-screen — and the ribbon is the most valuable thing here
                    after the headline number. */}
                <div className="flex min-h-0 flex-1 items-stretch justify-between gap-2">
                  {/* `items-start` so each panel sizes to its own content rather
                      than stretching to the width of the widest sibling. */}
                  <div className="flex flex-col items-start justify-between">
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

                    <div className="pointer-events-auto mt-2 max-w-[300px]">
                        <ModelProvenance
                            reference={scenario.reference}
                            fit={calibration.fit}
                            isRunning={calibration.isRunning}
                            error={calibration.error}
                            onCalibrate={calibration.calibrate}
                            onAdoptFit={handleAdoptFit}
                        />
                    </div>
                  </div>

                    {(error || isMainThreadFallback) && (
                        <div className={`pointer-events-auto ${REVISIT_PANEL} self-start border-red-400/40 px-3 py-1.5 text-[11px] text-red-200`}>
                            {error ?? 'Running on the main thread — Worker unavailable'}
                        </div>
                    )}

                    {/* The analysis column: headline, then the business case.
                        Scrolls independently so it can never push the ribbon out. */}
                    <div className="pointer-events-auto flex w-[400px] shrink-0 flex-col gap-2 overflow-y-auto">
                        <RevisitKpiPanel
                            statistics={analysis?.statistics ?? null}
                            windowHours={scenario.window.durationHours}
                            requirementMs={requirementMs}
                            isComputing={isComputing}
                            requirementChoicesHours={REQUIREMENT_CHOICES_H}
                            onRequirementChange={setRequirementMs}
                        />
                        <ValueCurve
                            sweep={sweep}
                            isComputing={isSweeping}
                            requirementMs={requirementMs}
                            currentPayloadCount={currentPayloadCount}
                            targetName={scenario.target.name}
                            onSelectPayloadCount={handlePayloadCountChange}
                        />
                        <WhyThisRevisit explanation={explanation} />
                        <AdvancedDrawer scenario={scenario} onChange={setScenario} />
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
