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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useSimulationClock, useSimulationClockSnapshot,
} from '../../../contexts/SimulationClockContext';
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
    validateSelection,
} from '../domain/subConstellation';
import { validateWalkerSpec } from '../domain/walker';
import { referenceProfileFor } from '../domain/referenceProfiles';
import {
    reconcileToMeasuredBest, sameSelection, selectionStatus, type SelectionSource,
} from '../domain/selectionReconcile';
import { useOneWebCalibration } from '../hooks/useOneWebCalibration';
import { useAreaAnalysis } from '../hooks/useAreaAnalysis';
import { AREA_PRESETS, areaForPreset } from '../domain/areaPresets';
import {
    accessIntervalsCsv, areaAnalysisCsv, csvFilename, payloadSweepCsv,
} from '../analysis/csvExport';
import { downloadCsv } from './downloadCsv';
import { ModelProvenance } from './ModelProvenance';
import { AreaPanel } from './AreaPanel';
import { defaultScenario, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario, WalkerSpec } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import { RevisitHeader } from './RevisitHeader';
import { RevisitKpiPanel } from './RevisitKpiPanel';
import { CoverageRibbon } from './CoverageRibbon';
import { REVISIT_PANEL } from './revisitTheme';
import { formatGap } from '../analysis/gapStatistics';
import type { AppMode } from '../../../hooks/useAppModeState';
import { GlobalAppHeader } from '../../../components/navigation/GlobalAppHeader';
import {
    readRevisitSessionSnapshot,
    REVISIT_SESSION_SCHEMA_VERSION,
    writeRevisitSessionSnapshot,
    type RevisitDisplayOptions,
} from '../state/revisitSessionSnapshot';

/** The customer requirement the verdict badge and the value curve compare against. */
const DEFAULT_REQUIREMENT_MS = 2 * 3600_000;

/** Requirements a customer actually states, in hours. */
const REQUIREMENT_CHOICES_H = [0.5, 1, 2, 3, 6, 12, 24];

/** Scene layers plus the camera behaviour the user can switch. */
interface DisplayOptions extends RevisitSceneOptions, RevisitDisplayOptions {}

type MobileAnalysisPanel = 'summary' | 'curve' | 'details' | 'advanced';

const TOGGLES: Array<{ key: keyof DisplayOptions; label: string }> = [
    { key: 'showOrbits', label: 'Orbits' },
    { key: 'showSwaths', label: 'Sensor swath' },
    { key: 'showHostFleet', label: 'Host fleet' },
    { key: 'autoRotate', label: 'Auto-rotate globe' },
];

type ClockedCoverageRibbonProps = Omit<
    React.ComponentProps<typeof CoverageRibbon>,
    'speed' | 'onSetSpeed'
>;

/**
 * Keep clock publications below the expensive globe/application boundary.
 * Pausing or changing speed must refresh the controls, but it must not make
 * the 576-satellite Cesium scene and every analysis panel reconcile again.
 */
const ClockedCoverageRibbon: React.FC<ClockedCoverageRibbonProps> = (props) => {
    const clock = useSimulationClock();
    const snapshot = useSimulationClockSnapshot();
    return (
        <CoverageRibbon
            {...props}
            speed={snapshot.speed}
            onSetSpeed={clock.setSpeed}
        />
    );
};

function defaultDisplayOptions(): DisplayOptions {
    return {
        showOrbits: true,
        showSwaths: true,
        showHostFleet: true,
        autoRotate: typeof window === 'undefined'
            ? true
            : !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
}

/**
 * A readable label for a picked coordinate: `51.51°N 0.13°W`.
 *
 * Used as the target's NAME, so a picked point flows through the header, the
 * value curve's sentence ("…to see 51.51°N 0.13°W every 2 h") and the CSV
 * filename exactly like a named city does.
 */
function formatCoordinate(latDeg: number, lonDeg: number): string {
    const lat = `${Math.abs(latDeg).toFixed(2)}°${latDeg >= 0 ? 'N' : 'S'}`;
    const lon = `${Math.abs(lonDeg).toFixed(2)}°${lonDeg >= 0 ? 'E' : 'W'}`;
    return `${lat} ${lon}`;
}

interface RevisitAppProps {
    /**
     * Return to the main application. REVISIT unmounts `<App/>` entirely, so the
     * three-peer switch that lives in App's header is not on screen here — this
     * view has to carry its own way back or the user is stranded.
     */
    onExit?: () => void;
    returnMode?: Exclude<AppMode, 'revisit'>;
}

export const RevisitApp: React.FC<RevisitAppProps> = ({
    onExit,
    returnMode = 'engineering',
}) => {
    const clock = useSimulationClock();
    // Lazy useState initializer, not useRef(readRevisitSessionSnapshot()): a
    // useRef's argument expression still runs on every render even though only
    // the first render's result is kept, so useRef here would re-run the
    // sessionStorage read + deep clone on every re-render of this component.
    const [restoredSession] = useState(() => readRevisitSessionSnapshot());
    // The analysis window is anchored ONCE, at mount. The playhead moves within
    // it; scrubbing never moves the window and therefore never changes the
    // statistics. See useRevisitAnalysis for the full argument.
    const epochRef = useRef<number>(restoredSession?.scenario.window.startMs ?? clock.getTimeMs());
    const [scenario, setScenario] = useState<RevisitScenario>(
        () => restoredSession?.scenario ?? defaultScenario(epochRef.current)
    );
    const [options, setOptions] = useState<DisplayOptions>(
        () => restoredSession?.options ?? defaultDisplayOptions()
    );
    const [presenterMode, setPresenterMode] = useState(true);
    const [demoResetRevision, setDemoResetRevision] = useState(0);
    const [mobileAnalysisPanel, setMobileAnalysisPanel] = useState<MobileAnalysisPanel>('summary');

    const [requirementMs, setRequirementMs] = useState(restoredSession?.requirementMs ?? DEFAULT_REQUIREMENT_MS);
    /**
     * Where the current selection came from. The preset counts as `auto`, so the
     * opening scenario reconciles to the measured best as soon as the sweep
     * lands — which is what stops the KPI and the value curve describing
     * different constellations.
     */
    const [selectionSource, setSelectionSource] = useState<SelectionSource>(restoredSession?.selectionSource ?? 'auto');

    const sessionRef = useRef({ scenario, options, requirementMs, selectionSource });
    sessionRef.current = { scenario, options, requirementMs, selectionSource };
    useEffect(() => () => {
        writeRevisitSessionSnapshot({
            schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
            ...sessionRef.current,
        });
    }, []);

    const { analysis, isComputing, error, isMainThreadFallback } = useRevisitAnalysis(scenario);
    // Its own worker, and keyed so the payload slider never re-triggers it.
    const { sweep, isComputing: isSweeping, error: sweepError } = useRevisitSweep(scenario);

    const renderValidation = useMemo(() => {
        const walker = validateWalkerSpec(scenario.reference);
        const selection = validateSelection(scenario.reference, scenario.selection);
        return {
            ok: walker.ok && selection.ok,
            errors: [...walker.errors, ...selection.errors],
        };
    }, [scenario.reference, scenario.selection]);
    const fleet = useMemo(
        () => renderValidation.ok ? constellationFor(scenario.reference) : [],
        [scenario.reference, renderValidation.ok]
    );
    const selectedIds = useMemo(
        () => renderValidation.ok
            ? selectedSatelliteIds(scenario.reference, scenario.selection)
            : new Set<string>(),
        [scenario.reference, scenario.selection, renderValidation.ok]
    );
    const referenceProfile = useMemo(
        () => referenceProfileFor(scenario.reference),
        [scenario.reference]
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
        setSelectionSource('auto');
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

    /**
     * Advanced-drawer edits. Changing the SELECTION here is a deliberate
     * engineering choice and switches provenance to `manual`, so the sweep stops
     * overriding it. Changing anything else (constellation, window) leaves
     * provenance alone — the user did not pick a split.
     */
    const handleAdvancedChange = useCallback((next: RevisitScenario) => {
        setScenario((current) => {
            if (!sameSelection(current.selection, next.selection)) setSelectionSource('manual');
            return next;
        });
    }, []);

    const handleTargetChange = useCallback((name: string) => {
        const target = TARGET_PRESETS.find((t) => t.name === name);
        if (target) setScenario((current) => ({ ...current, target }));
    }, []);

    /**
     * Place the target where the user clicked the globe.
     *
     * Named rather than left as bare coordinates so it reads in the header, in
     * the value curve's sentence and in the CSV filename like any other target.
     */
    const handlePickTarget = useCallback((latDeg: number, lonDeg: number) => {
        setScenario((current) => ({
            ...current,
            target: {
                kind: 'POINT',
                name: formatCoordinate(latDeg, lonDeg),
                latDeg,
                lonDeg,
            },
        }));
    }, []);

    const targetOptions = useMemo(() => {
        const names = TARGET_PRESETS.map((t) => t.name);
        // A picked point is not in the preset list; without this the select
        // would render blank and look broken.
        return names.includes(scenario.target.name)
            ? names
            : [...names, scenario.target.name];
    }, [scenario.target.name]);

    const status = useMemo(
        () => selectionStatus(scenario.selection, currentPayloadCount, sweep),
        [scenario.selection, currentPayloadCount, sweep]
    );

    /**
     * Reconcile the shown configuration with the measured best.
     *
     * The preset ships a split chosen from the ladder's ordering, which is not a
     * measurement. Once the sweep lands, an automatically-chosen selection moves
     * to whatever actually measured best — otherwise the KPI and the value curve
     * describe two different constellations while both look authoritative.
     *
     * A selection the user set in the Advanced drawer is left alone; the
     * comparison is reported instead.
     */
    useEffect(() => {
        const better = reconcileToMeasuredBest(
            scenario.selection, currentPayloadCount, sweep, selectionSource
        );
        if (better) setScenario((current) => ({ ...current, selection: better }));
    }, [sweep, scenario.selection, currentPayloadCount, selectionSource]);

    /**
     * The header's sub-label. Only ever states what the sweep measured — while it
     * is in flight this says nothing rather than repeating the ladder's guess.
     */
    const spreadNote = useMemo(() => {
        if (!sweep) {
            return isSweeping ? 'comparing splits at this payload count…' : null;
        }
        if (status.configurationCount < 2 || !status.bestSplit) return null;

        if (status.isBest) {
            return `${status.bestSplit.planes} planes × ${status.bestSplit.perPlane}`
                + ` — measured best of ${status.configurationCount} splits at this count`;
        }
        const gain = status.improvementAvailable !== null
            ? ` (${Math.round(status.improvementAvailable * 100)}% better)`
            : '';
        return `manual split — ${status.bestSplit.planes} planes × ${status.bestSplit.perPlane}`
            + ` measured better${gain}`;
    }, [sweep, isSweeping, status]);

    const calibration = useOneWebCalibration();
    const areaRun = useAreaAnalysis(scenario);
    const warnings = useMemo(() => [...new Set([
        ...(analysis?.warnings ?? []),
        ...(sweep?.warnings ?? []),
    ])], [analysis, sweep]);

    const handleRunArea = useCallback((presetName: string) => {
        const preset = AREA_PRESETS.find((p) => p.name === presetName);
        if (!preset) return;
        areaRun.run(areaForPreset(preset, scenario.reference, scenario.payload));
    }, [areaRun, scenario.reference, scenario.payload]);

    /** Exports carry the calibration when one has been run — see csvExport. */
    const handleExportAccessCsv = useCallback(() => {
        if (!analysis) return;
        downloadCsv(
            csvFilename('access', scenario),
            accessIntervalsCsv(analysis, calibration.fit)
        );
    }, [analysis, scenario, calibration.fit]);

    const handleExportSweepCsv = useCallback(() => {
        if (!sweep) return;
        downloadCsv(
            csvFilename('sweep', scenario),
            payloadSweepCsv(scenario, sweep, calibration.fit)
        );
    }, [sweep, scenario, calibration.fit]);

    const handleExportAreaCsv = useCallback(() => {
        if (!areaRun.analysis) return;
        const { target: _dropped, ...rest } = scenario;
        downloadCsv(
            csvFilename('area', scenario).replace('area-', `area-${areaRun.analysis.area.name.toLowerCase().replace(/\s+/g, '-')}-`),
            areaAnalysisCsv(rest, areaRun.analysis, calibration.fit)
        );
    }, [areaRun.analysis, scenario, calibration.fit]);

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
    const handleSeek = useCallback((ms: number) => {
        const previousSpeed = clock.getSnapshot().speed;
        clock.setDateTime(ms);
        if (previousSpeed !== 1) clock.setSpeed(previousSpeed);
    }, [clock]);

    const handleResetDemo = useCallback(() => {
        const resetScenario = defaultScenario(epochRef.current);
        setScenario(resetScenario);
        setOptions(defaultDisplayOptions());
        setRequirementMs(DEFAULT_REQUIREMENT_MS);
        setSelectionSource('auto');
        setMobileAnalysisPanel('summary');
        setPresenterMode(true);
        setDemoResetRevision((revision) => revision + 1);
        areaRun.clear();
        clock.setDateTime(resetScenario.window.startMs);
    }, [areaRun, clock]);

    const toggle = useCallback((key: keyof DisplayOptions) => {
        setOptions((current) => ({ ...current, [key]: !current[key] }));
    }, []);

    return (
        <div className="revisit-shell flex h-dvh w-screen flex-col overflow-hidden bg-[#05070D] text-slate-100 transition-colors light:bg-slate-100 light:text-slate-950">
            <GlobalAppHeader className="revisit-global-header">
                <div className="revisit-context-rail px-2 py-2 sm:px-3 lg:px-4">
                    <RevisitHeader
                        scenario={scenario}
                        payloadCounts={payloadCounts}
                        currentPayloadCount={currentPayloadCount}
                        onPayloadCountChange={handlePayloadCountChange}
                        targetNames={targetOptions}
                        onTargetChange={handleTargetChange}
                        spreadNote={spreadNote}
                    />
                </div>
            </GlobalAppHeader>

            <div className="revisit-stage relative min-h-0 flex-1 overflow-hidden">
              <div className="absolute inset-0">
                <RevisitGlobe
                    scenario={scenario}
                    fleet={fleet}
                    selectedIds={selectedIds}
                    options={options}
                    getTimeMs={getTimeMs}
                    areaAnalysis={areaRun.analysis}
                    requirementMs={requirementMs}
                    autoRotate={options.autoRotate}
                    onPickTarget={handlePickTarget}
                />
              </div>

            {/* One flex column owns the whole overlay. Absolute offsets between
                panels were fragile: the header grows when a spread note appears
                and silently overlapped the KPI panel. Flow layout cannot. */}
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-2 sm:p-3">
                <div className="pointer-events-auto flex items-center justify-end gap-3">
                    {presenterMode && (
                        <aside
                            className={`${REVISIT_PANEL} z-30 ml-auto max-w-[calc(100vw-1rem)] px-3 py-2 text-[11px] font-semibold text-slate-300 sm:max-w-xl`}
                            aria-label="Demo result summary"
                            aria-live="polite"
                        >
                            <span className="font-black text-amber-300">{currentPayloadCount} payloads</span>
                            {' → '}
                            <span className="text-slate-100">
                                {formatGap(analysis?.statistics.maxGapMs ?? null)} worst-case over {scenario.target.name}
                            </span>
                            {' · target '}{formatGap(requirementMs)}
                        </aside>
                    )}
                </div>

                {/* `flex-1 min-h-0` is load-bearing: it gives this row the leftover
                    height and lets the analysis column scroll inside it. Without
                    min-h-0 a tall column grows the row instead, pushing the ribbon
                    off-screen — and the ribbon is the most valuable thing here
                    after the headline number. */}
                <div className="relative flex min-h-0 flex-1 items-stretch justify-between gap-2">
                  {/* `items-start` so each panel sizes to its own content rather
                      than stretching to the width of the widest sibling. */}
                  <div className="pointer-events-none absolute left-0 top-0 z-20 flex flex-col items-start justify-between md:static">
                    {/* Display toggles — the slot ENG uses for REG / 5G / CONN / LOAD */}
                    <div className={`pointer-events-auto ${REVISIT_PANEL} flex max-w-[calc(100vw-1rem)] flex-row flex-wrap gap-1 p-1.5 md:max-w-none md:flex-col`}>
                        {onExit && (
                            <button
                                type="button"
                                onClick={onExit}
                                className="revisit-origin-return min-h-11 rounded-md border border-slate-700/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-slate-100 md:mb-0.5 md:min-h-0 md:border-x-0 md:border-t-0"
                            >
                                <span className="sm:hidden">‹ Back</span>
                                <span className="hidden sm:inline">
                                    ‹ Back to {returnMode === 'commercial' ? 'Commercial' : 'Engineering'}
                                </span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setPresenterMode((active) => !active)}
                            aria-pressed={presenterMode}
                            className="min-h-11 rounded-md border border-sky-400/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-sky-200 transition-colors hover:border-sky-300 md:min-h-0"
                        >
                            <span className="sm:hidden">{presenterMode ? 'Explore' : 'Present'}</span>
                            <span className="hidden sm:inline">
                                {presenterMode ? 'Explore controls' : 'Presenter view'}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={handleResetDemo}
                            className="min-h-11 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-amber-200 md:min-h-0"
                        >
                            <span className="sm:hidden">Reset</span>
                            <span className="hidden sm:inline">Reset demo</span>
                        </button>
                        {!presenterMode && TOGGLES.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggle(key)}
                                aria-pressed={options[key]}
                                className={[
                                    'min-h-11 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition-colors md:min-h-0',
                                    options[key]
                                        ? 'bg-amber-500/20 text-amber-200'
                                        : 'text-slate-500 hover:text-slate-300',
                                ].join(' ')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="revisit-model-provenance pointer-events-auto mt-2 hidden max-w-[300px] lg:block">
                        <ModelProvenance
                            reference={scenario.reference}
                            profile={referenceProfile}
                            fit={calibration.fit}
                            isRunning={calibration.isRunning}
                            error={calibration.error}
                            onCalibrate={calibration.calibrate}
                            onAdoptFit={handleAdoptFit}
                        />
                    </div>
                  </div>

                    {(!renderValidation.ok || error || sweepError || isMainThreadFallback) && (
                        <div className={`pointer-events-auto absolute left-0 top-14 z-30 ${REVISIT_PANEL} self-start border-red-400/40 px-3 py-1.5 text-[11px] text-red-200 md:static`}>
                            {renderValidation.errors.join('; ') || error || sweepError
                                || 'Running on the main thread — Worker unavailable'}
                        </div>
                    )}

                    {warnings.length > 0 && (
                        <div className={`pointer-events-auto absolute left-0 top-28 z-30 max-w-sm ${REVISIT_PANEL} self-start border-amber-400/40 px-3 py-1.5 text-[10px] leading-4 text-amber-200 md:static`}>
                            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                    )}

                    {/* The analysis column: headline, then the business case.
                        Scrolls independently so it can never push the ribbon out. */}
                    <section
                        className={`pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex max-h-[46vh] w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-t-2xl md:static md:max-h-none md:w-[400px] md:rounded-none [&>*]:shrink-0`}
                        aria-label="REVISIT analysis"
                    >
                        <nav className={`${REVISIT_PANEL} sticky top-0 z-20 grid grid-cols-4 gap-1 p-1 md:hidden`} aria-label="REVISIT analysis sections">
                            {([
                                ['summary', 'Summary'],
                                ['curve', 'Curve'],
                                ['details', 'Details'],
                                ['advanced', 'Advanced'],
                            ] as const).map(([panel, label]) => (
                                <button
                                    key={panel}
                                    type="button"
                                    onClick={() => setMobileAnalysisPanel(panel)}
                                    aria-pressed={mobileAnalysisPanel === panel}
                                    className={`min-h-11 rounded-lg px-1 text-[10px] font-black uppercase tracking-wide ${mobileAnalysisPanel === panel ? 'bg-amber-500/20 text-amber-200' : 'text-slate-400'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>

                        <div className={`${mobileAnalysisPanel === 'summary' ? 'block' : 'hidden'} md:contents`} aria-live="polite">
                            <RevisitKpiPanel
                                statistics={analysis?.statistics ?? null}
                                windowHours={scenario.window.durationHours}
                                requirementMs={requirementMs}
                                isComputing={isComputing}
                                requirementChoicesHours={REQUIREMENT_CHOICES_H}
                                onRequirementChange={setRequirementMs}
                            />
                        </div>
                        <div className={`${mobileAnalysisPanel === 'curve' ? 'block' : 'hidden'} md:contents`}>
                            <ValueCurve
                                key={demoResetRevision}
                                sweep={sweep}
                                isComputing={isSweeping}
                                requirementMs={requirementMs}
                                currentPayloadCount={currentPayloadCount}
                                currentMaxGapMs={analysis?.statistics.maxGapMs ?? null}
                                currentIsMeasuredBest={status.isBest}
                                targetName={scenario.target.name}
                                onSelectPayloadCount={handlePayloadCountChange}
                            />
                        </div>
                        <div className={`${mobileAnalysisPanel === 'details' ? 'space-y-2' : 'hidden'} md:contents`}>
                            <WhyThisRevisit explanation={explanation} />
                            <AreaPanel
                                scenario={scenario}
                                analysis={areaRun.analysis}
                                isRunning={areaRun.isRunning}
                                error={areaRun.error}
                                progress={areaRun.progress}
                                requirementMs={requirementMs}
                                onRun={handleRunArea}
                                onClear={areaRun.clear}
                                onCancel={areaRun.clear}
                                onExportCsv={handleExportAreaCsv}
                            />
                            <div className="md:hidden">
                                <ModelProvenance
                                    reference={scenario.reference}
                                    profile={referenceProfile}
                                    fit={calibration.fit}
                                    isRunning={calibration.isRunning}
                                    error={calibration.error}
                                    onCalibrate={calibration.calibrate}
                                    onAdoptFit={handleAdoptFit}
                                />
                            </div>
                        </div>
                        <div className={`${mobileAnalysisPanel === 'advanced' ? 'space-y-2' : 'hidden'} md:contents`}>
                          <div className={`${REVISIT_PANEL} flex items-center gap-2 px-3 py-2`}>
                            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                Export
                            </span>
                            <button
                                type="button"
                                onClick={handleExportAccessCsv}
                                disabled={!analysis}
                                className="rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-40"
                            >
                                Accesses
                            </button>
                            <button
                                type="button"
                                onClick={handleExportSweepCsv}
                                disabled={!sweep}
                                className="rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-40"
                            >
                                Sweep
                            </button>
                          </div>
                          <AdvancedDrawer scenario={scenario} onChange={handleAdvancedChange} />
                        </div>
                    </section>
                </div>

                <div className="pointer-events-auto">
                    <ClockedCoverageRibbon
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
        </div>
    );
};

export default RevisitApp;
