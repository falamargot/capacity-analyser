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
import { constellationFor } from '../analysis/runScenario';
import {
    enumerateLadder, ladderPayloadCounts, reconcileSelection, selectedSatelliteIds,
    validateSelection,
} from '../domain/subConstellation';
import { validateWalkerSpec } from '../domain/walker';
import {
    DEFAULT_PROFILE, referenceModeFor, referenceProfileFor, type ReferenceMode,
} from '../domain/referenceProfiles';
import {
    reconcileToMeasuredBest, sameSelection, selectionStatus, type SelectionSource,
} from '../domain/selectionReconcile';
import { useOneWebCalibration } from '../hooks/useOneWebCalibration';
import { useAreaAnalysis } from '../hooks/useAreaAnalysis';
import {
    MAX_AREA_VERTICES, recommendedAreaGridSpacing, validateArea, type AreaTarget,
} from '../domain/areaTarget';
import {
    MAX_SECONDARY_TARGETS, REFERENCE_POINT_ID,
    type RevisitAnalysisContext, type RevisitComparisonPoint,
} from '../domain/analysisTargets';
import {
    accessIntervalsCsv, areaAnalysisCsv, csvFilename, payloadSweepCsv,
} from '../analysis/csvExport';
import { downloadCsv } from './downloadCsv';
import { AreaDistributionPanel, AreaResultSummary } from './AreaResultsPanels';
import {
    TARGET_PRESETS, defaultScenario, fovPresets, type FovPresetName,
} from '../domain/presets';
import { executiveEnvelopePoints } from '../analysis/executiveEnvelope';
import type { PointTarget, RevisitScenario, WalkerSpec } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import { RevisitHeader } from './RevisitHeader';
import { RevisitKpiPanel } from './RevisitKpiPanel';
import { TargetComparisonTable } from './TargetComparisonTable';
import { ScenarioWorkspace } from './ScenarioWorkspace';
import { ScenarioWorkspaceDrawer } from './ScenarioWorkspaceDrawer';
import { CoverageRibbon } from './CoverageRibbon';
import { MobileResultStrip } from './MobileResultStrip';
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
import type { SavedRevisitScenario } from '../state/revisitSavedScenarios';
import { useTargetComparison } from '../hooks/useTargetComparison';
import { buildAreaResultSheet, buildRevisitResultSheet } from '../analysis/resultSheet';
import { downloadRevisitResultSheet } from './downloadResultSheet';

/** The customer requirement the verdict badge and the value curve compare against. */
const DEFAULT_REQUIREMENT_MS = 2 * 3600_000;

/** Requirements a customer actually states, in hours. */
const REQUIREMENT_CHOICES_H = [0.5, 1, 2, 3, 6, 12, 24];

/** Scene layers plus the camera behaviour the user can switch. */
interface DisplayOptions extends RevisitSceneOptions, RevisitDisplayOptions {}

type MobileAnalysisPanel = 'summary' | 'curve' | 'details';

/**
 * The analysis column is a sheet on compact viewports.
 *
 * `closed` is the default: the strip above the ribbon still carries the verdict
 * and the worst-case gap, so closing the sheet costs no answer — it buys back
 * the globe, which was otherwise reduced to a 73 px band no one could rotate
 * (mobile UX plan §2).
 */
type MobileSheetState = 'closed' | 'half' | 'full';

const TOGGLES: Array<{ key: keyof DisplayOptions; label: string; hint?: string }> = [
    { key: 'showOrbits', label: 'Orbits' },
    { key: 'showSwaths', label: 'Sensor swath' },
    { key: 'showHostFleet', label: 'Host fleet' },
    {
        key: 'showLabels',
        label: 'Satellite labels',
        hint: 'Payload satellite names only · capped at 96 for readability and performance',
    },
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
        showLabels: false,
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
    const [resetRevision, setResetRevision] = useState(0);
    const [mobileAnalysisPanel, setMobileAnalysisPanel] = useState<MobileAnalysisPanel>('summary');
    const [mobileSheet, setMobileSheet] = useState<MobileSheetState>('closed');
    /** Compact viewports collapse the stage toolbar behind one button. */
    const [stageMenuOpen, setStageMenuOpen] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [customArea, setCustomArea] = useState<AreaTarget | null>(
        () => restoredSession?.customArea ?? null
    );
    const [isDrawingArea, setIsDrawingArea] = useState(false);
    const [analysisContext, setAnalysisContext] = useState<RevisitAnalysisContext>(
        () => restoredSession?.analysisContext ?? 'POINTS'
    );
    const [comparisonPoints, setComparisonPoints] = useState<RevisitComparisonPoint[]>(
        () => restoredSession?.comparisonPoints ?? []
    );
    const [pendingComparisonPointIds, setPendingComparisonPointIds] = useState<string[]>([]);
    const [selectedPointId, setSelectedPointId] = useState<typeof REFERENCE_POINT_ID | string>(REFERENCE_POINT_ID);
    const [scenarioWorkspaceOpen, setScenarioWorkspaceOpen] = useState(false);
    const analysisColumnRef = useRef<HTMLElement | null>(null);

    const [requirementMs, setRequirementMs] = useState(restoredSession?.requirementMs ?? DEFAULT_REQUIREMENT_MS);
    /**
     * Where the current selection came from. The preset counts as `auto`, so the
     * opening scenario reconciles to the measured best as soon as the sweep
     * lands — which is what stops the KPI and the value curve describing
     * different constellations.
     */
    const [selectionSource, setSelectionSource] = useState<SelectionSource>(restoredSession?.selectionSource ?? 'auto');

    const sessionRef = useRef({
        scenario, options, requirementMs, selectionSource, customArea,
        analysisContext, comparisonPoints,
    });
    sessionRef.current = {
        scenario, options, requirementMs, selectionSource, customArea,
        analysisContext, comparisonPoints,
    };
    useEffect(() => () => {
        writeRevisitSessionSnapshot({
            schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
            ...sessionRef.current,
        });
    }, []);

    const { analysis, isComputing, error, isMainThreadFallback } = useRevisitAnalysis(scenario);
    // Its own worker, and keyed so the payload slider never re-triggers it.
    const { sweep, isComputing: isSweeping, error: sweepError } = useRevisitSweep(scenario);
    const comparisonTargets = useMemo(
        () => [scenario.target, ...comparisonPoints.map((point) => point.target)],
        [scenario.target, comparisonPoints]
    );
    const targetComparison = useTargetComparison(
        scenario, comparisonTargets,
        analysisContext === 'POINTS' && comparisonPoints.length > 0,
    );
    const pointTimelineLanes = useMemo(() => [{
        id: REFERENCE_POINT_ID,
        label: `Reference · ${scenario.target.name}`,
        name: scenario.target.name,
        intervals: analysis?.intervals ?? [],
        statistics: analysis?.statistics ?? null,
        selected: selectedPointId === REFERENCE_POINT_ID,
    }, ...comparisonPoints.map((point, index) => {
        const row = targetComparison.rows?.[index + 1];
        return {
            id: point.id,
            label: `Compare ${index + 1} · ${point.target.name}`,
            name: point.target.name,
            intervals: row?.intervals ?? [],
            statistics: row?.statistics ?? null,
            selected: selectedPointId === point.id,
        };
    })], [scenario.target.name, analysis, comparisonPoints, targetComparison.rows, selectedPointId]);

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

    /**
     * Which model the user chose. Component state, not scenario state — see
     * `ReferenceMode`. Derived once from the opening scenario, then owned by the
     * selector and re-derived only when a whole scenario is swapped in.
     */
    const [referenceMode, setReferenceMode] = useState<ReferenceMode>(
        () => referenceModeFor(scenario.reference)
    );

    /**
     * m4. True while the current CUSTOM specification came from a restored
     * scenario rather than from someone editing the fields.
     *
     * A restored snapshot always reads back as CUSTOM: the fit is not persisted,
     * so a measured shell cannot re-assert its provenance without re-measuring.
     * The numbers are exact, but calling them "hand-entered" would be a second,
     * different falsehood — so the evidence line distinguishes the two.
     */
    const [referenceRestored, setReferenceRestored] = useState(
        () => referenceModeFor(scenario.reference) === 'CUSTOM'
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
            // Once the reference itself is touched, the values are hand-entered
            // whatever they were restored from (m4).
            if (current.reference !== next.reference) setReferenceRestored(false);
            return next;
        });
    }, []);

    const handleTargetChange = useCallback((name: string) => {
        const target = TARGET_PRESETS.find((t) => t.name === name);
        if (target) {
            setScenario((current) => ({ ...current, target }));
            setAnalysisContext('POINTS');
            setSelectedPointId(REFERENCE_POINT_ID);
        }
    }, []);

    /**
     * Place the target where the user clicked the globe.
     *
     * Named rather than left as bare coordinates so it reads in the header, in
     * the value curve's sentence and in the CSV filename like any other target.
     */
    const handlePickTarget = useCallback((latDeg: number, lonDeg: number, name?: string) => {
        setScenario((current) => ({
            ...current,
            target: {
                kind: 'POINT',
                name: name?.trim() || formatCoordinate(latDeg, lonDeg),
                latDeg,
                lonDeg,
            },
        }));
        setAnalysisContext('POINTS');
        setSelectedPointId(REFERENCE_POINT_ID);
    }, []);

    /** Shared by every "set this comparison point's target" path: insert or
     * update the row by id, drop it from the pending (location-not-yet-set)
     * list, select it, and switch to Points context. The updater itself only
     * reads `current` and returns the next array — id generation and the
     * `setSelectedPointId` notification happen outside it, so it stays pure
     * even when React double-invokes it (StrictMode dev). */
    const upsertComparisonPoint = useCallback((id: string, target: PointTarget) => {
        setComparisonPoints((current) => {
            const exists = current.some((point) => point.id === id);
            if (exists) return current.map((point) => point.id === id ? { ...point, target } : point);
            return current.length < MAX_SECONDARY_TARGETS ? [...current, { id, target }] : current;
        });
        setPendingComparisonPointIds((current) => current.filter((candidate) => candidate !== id));
        setSelectedPointId(id);
        setAnalysisContext('POINTS');
    }, []);

    const handleAddComparisonPoint = useCallback((latDeg: number, lonDeg: number) => {
        if (comparisonPoints.length + pendingComparisonPointIds.length >= MAX_SECONDARY_TARGETS) return;
        const id = pendingComparisonPointIds[0] ?? crypto.randomUUID();
        upsertComparisonPoint(id, {
            kind: 'POINT',
            name: formatCoordinate(latDeg, lonDeg),
            latDeg,
            lonDeg,
        });
    }, [comparisonPoints.length, pendingComparisonPointIds, upsertComparisonPoint]);

    /** The explicit control creates an editable row immediately without
     * inventing a location or launching comparison work before it is set. */
    const handleCreateComparisonPoint = useCallback(() => {
        if (comparisonPoints.length + pendingComparisonPointIds.length >= MAX_SECONDARY_TARGETS) return;
        const id = crypto.randomUUID();
        setPendingComparisonPointIds((current) => [...current, id]);
        setSelectedPointId(id);
        setAnalysisContext('POINTS');
    }, [comparisonPoints.length, pendingComparisonPointIds.length]);

    const handleSecondaryPointTargetChange = useCallback((id: string, name: string) => {
        const target = TARGET_PRESETS.find((candidate) => candidate.name === name);
        if (!target) return;
        upsertComparisonPoint(id, { ...target });
    }, [upsertComparisonPoint]);

    const handleSecondaryPointChange = useCallback((
        id: string, latDeg: number, lonDeg: number, name?: string
    ) => {
        upsertComparisonPoint(id, {
            kind: 'POINT',
            name: name?.trim() || formatCoordinate(latDeg, lonDeg),
            latDeg,
            lonDeg,
        });
    }, [upsertComparisonPoint]);

    const handleRemoveSecondaryPoint = useCallback((id: string) => {
        setComparisonPoints((current) => current.filter((point) => point.id !== id));
        setPendingComparisonPointIds((current) => current.filter((candidate) => candidate !== id));
        setSelectedPointId((current) => current === id ? REFERENCE_POINT_ID : current);
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
    // Same condition `reconcileToMeasuredBest` uses internally to decide
    // whether a reconciliation is pending — derived from the already-memoized
    // `status` rather than re-running `selectionStatus` a second time.
    const isConfigurationSettling = isSweeping || (
        selectionSource !== 'manual' && Boolean(sweep) && !status.isBest && status.bestSelection !== null
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
        const currentTopology = `${scenario.reference.planes / scenario.selection.planeStride} planes × `
            + `${scenario.reference.satsPerPlane / scenario.selection.satStride} per plane`;
        if (!sweep) {
            return isSweeping
                ? `${currentTopology} · comparing exact-count splits…`
                : currentTopology;
        }
        if (status.configurationCount < 2 || !status.bestSplit) return currentTopology;

        if (status.isBest) {
            return `${status.bestSplit.planes} planes × ${status.bestSplit.perPlane} per plane`
                + ` — measured best of ${status.configurationCount} splits at this count`;
        }
        const gain = status.improvementAvailable !== null
            ? ` (${Math.round(status.improvementAvailable * 100)}% better)`
            : '';
        return `manual split — ${status.bestSplit.planes} planes × ${status.bestSplit.perPlane}`
            + ` measured better${gain}`;
    }, [sweep, isSweeping, status, scenario.reference, scenario.selection]);

    const executiveEnvelope = useMemo(
        () => sweep ? executiveEnvelopePoints(sweep) : [],
        [sweep]
    );
    const businessComparison = useMemo(() => {
        /*
         * The 1-payload point is the business baseline, and it can legitimately
         * have no max gap: depending on the epoch and the target, one satellite
         * may never see the target across the whole window. That is not a missing
         * measurement — it is the strongest argument for buying payloads — so the
         * reason is carried to the panel rather than collapsed into a null (m2).
         */
        const baselinePoint = sweep?.points.find((point) => point.payloadCount === 1);
        const baselineMaxGapMs = baselinePoint?.maxGapMs ?? null;
        const baselineNeverInView =
            baselinePoint?.best.statistics.coverage === 'NEVER_IN_VIEW';
        const targetPayloadCount = executiveEnvelope
            .find((point) => point.maxGapMs !== null && point.maxGapMs <= requirementMs)
            ?.payloadCount ?? null;
        return { baselineMaxGapMs, baselineNeverInView, currentPayloadCount, targetPayloadCount };
    }, [sweep, executiveEnvelope, requirementMs, currentPayloadCount]);

    const calibration = useOneWebCalibration();
    const areaRun = useAreaAnalysis(scenario);
    const runAreaAnalysis = areaRun.run;
    const lastAutoAreaRunKeyRef = useRef<string | null>(null);
    const autoAreaRunKey = useMemo(() => customArea ? JSON.stringify([
        customArea,
        scenario.reference,
        scenario.selection,
        scenario.payload,
        scenario.window,
    ]) : null, [customArea, scenario.reference, scenario.selection, scenario.payload, scenario.window]);

    /**
     * Area analysis follows a valid, stable definition automatically. The
     * debounce is deliberate: drawing vertices and editing numeric fields must
     * cancel obsolete work, not enqueue a full grid run for every intermediate
     * value. Scenario settling is also awaited so the worker receives the
     * measured topology that will actually remain on screen.
     */
    useEffect(() => {
        if (
            analysisContext !== 'AREA'
            || isDrawingArea
            || isConfigurationSettling
            || !customArea
            || !autoAreaRunKey
            || lastAutoAreaRunKeyRef.current === autoAreaRunKey
            || !validateArea(customArea, scenario.reference, scenario.payload).ok
        ) return;

        const timeout = window.setTimeout(() => {
            lastAutoAreaRunKeyRef.current = autoAreaRunKey;
            runAreaAnalysis(customArea);
        }, 450);
        return () => window.clearTimeout(timeout);
    }, [
        analysisContext, isDrawingArea, isConfigurationSettling, customArea,
        autoAreaRunKey, scenario.reference, scenario.payload, runAreaAnalysis,
    ]);
    const warnings = useMemo(() => analysisContext === 'AREA' ? [] : [...new Set([
        ...(analysis?.warnings ?? []), ...(sweep?.warnings ?? []),
    ])], [analysisContext, analysis, sweep]);
    useEffect(() => {
        if (analysisColumnRef.current) analysisColumnRef.current.scrollTop = 0;
    }, [analysisContext, areaRun.isRunning, areaRun.analysis]);

    const handleStartAreaDrawing = useCallback(() => {
        areaRun.clear();
        setCustomArea((current) => ({
            kind: 'AREA',
            // A fresh drawing session is a new area even if it reuses the
            // previous name — `id` is what render code uses to tell a
            // not-yet-run draft apart from a stale completed analysis.
            id: crypto.randomUUID(),
            name: current?.name || 'Custom area',
            boundary: [],
            gridSpacingDeg: current?.gridSpacingDeg
                ?? recommendedAreaGridSpacing(scenario.reference, scenario.payload),
        }));
        setIsDrawingArea(true);
        setAnalysisContext('AREA');
        setScenarioWorkspaceOpen(false);
    }, [areaRun, scenario.reference, scenario.payload]);

    const handleDrawAreaVertex = useCallback((latDeg: number, lonDeg: number) => {
        setCustomArea((current) => {
            if (!current || current.boundary.length >= MAX_AREA_VERTICES) return current;
            return {
                ...current,
                boundary: [...current.boundary, { latDeg, lonDeg }],
            };
        });
    }, []);

    const handleUndoAreaVertex = useCallback(() => {
        setCustomArea((current) => current ? {
            ...current,
            boundary: current.boundary.slice(0, -1),
        } : current);
    }, []);

    const handleCustomAreaChange = useCallback((area: AreaTarget | null) => {
        // Geometry/name/grid edits invalidate the rendered heat map and KPI.
        // Keeping the previous run here would make a stale result look current.
        areaRun.clear();
        setCustomArea(area);
        if (!area) {
            setIsDrawingArea(false);
            lastAutoAreaRunKeyRef.current = null;
        }
        if (area) {
            setAnalysisContext('AREA');
        }
    }, [areaRun]);

    const handleInstrumentPresetChange = useCallback((name: FovPresetName) => {
        setScenario((current) => ({
            ...current,
            payload: fovPresets(current.reference.altitudeKm)[name],
        }));
    }, []);

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
     * Swap the reference constellation. The selection must be repaired in the
     * same step: a different plane count means the current strides may no longer
     * divide P and S.
     */
    const applyReference = useCallback((next: WalkerSpec) => {
        setScenario((current) => ({
            ...current,
            reference: next,
            selection: reconcileSelection(next, current.selection),
        }));
    }, []);

    /**
     * The one entry point for choosing a model.
     *
     * HLD is the only faithful way back to the reference profile: re-typing
     * 12 / 48 / 87.9 / 1200 does NOT restore it, because `referenceWithPatch`
     * drops the per-plane altitude ladder, the RAAN seam and the spares as soon
     * as planes or altitude change, and no field can put them back.
     *
     * MEASURED reaches the network when no fit is cached yet (D1). On failure the
     * mode is left untouched, so the panel never claims a model it does not have;
     * `calibration.error` carries the reason.
     *
     * CUSTOM only unlocks the fields — it deliberately does not touch the spec,
     * so the current numbers become the starting point for editing.
     */
    const handleReferenceModeChange = useCallback(async (next: ReferenceMode) => {
        setReferenceRestored(false);
        if (next === 'CUSTOM') {
            setReferenceMode('CUSTOM');
            return;
        }
        if (next === 'HLD') {
            applyReference(DEFAULT_PROFILE.spec);
            setReferenceMode('HLD');
            return;
        }
        const fit = calibration.fit ?? await calibration.calibrate();
        if (!fit) return;
        applyReference(fit.spec);
        setReferenceMode('MEASURED');
    }, [applyReference, calibration]);


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

    const handleResetScenario = useCallback(() => {
        const resetScenario = defaultScenario(epochRef.current);
        setScenario(resetScenario);
        setReferenceMode(referenceModeFor(resetScenario.reference));
        setReferenceRestored(false);
        setOptions(defaultDisplayOptions());
        setRequirementMs(DEFAULT_REQUIREMENT_MS);
        setSelectionSource('auto');
        setMobileAnalysisPanel('summary');
        setPresenterMode(true);
        setExportError(null);
        setCustomArea(null);
        setIsDrawingArea(false);
        setAnalysisContext('POINTS');
        setComparisonPoints([]);
        setPendingComparisonPointIds([]);
        setSelectedPointId(REFERENCE_POINT_ID);
        setScenarioWorkspaceOpen(false);
        setResetRevision((revision) => revision + 1);
        lastAutoAreaRunKeyRef.current = null;
        areaRun.clear();
        clock.setDateTime(resetScenario.window.startMs);
    }, [areaRun, clock]);

    const currentSnapshot = useMemo(() => ({
        schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
        scenario,
        options,
        requirementMs,
        selectionSource,
        customArea,
        analysisContext,
        comparisonPoints,
    }), [scenario, options, requirementMs, selectionSource, customArea, analysisContext, comparisonPoints]);

    const handleLoadSavedScenario = useCallback((saved: SavedRevisitScenario) => {
        const snapshot = saved.snapshot;
        setScenario(snapshot.scenario);
        setReferenceMode(referenceModeFor(snapshot.scenario.reference));
        setReferenceRestored(referenceModeFor(snapshot.scenario.reference) === 'CUSTOM');
        setOptions({ ...snapshot.options, showLabels: snapshot.options.showLabels ?? false });
        setRequirementMs(snapshot.requirementMs);
        setSelectionSource(snapshot.selectionSource);
        setMobileAnalysisPanel('summary');
        setExportError(null);
        setCustomArea(snapshot.customArea ?? null);
        setIsDrawingArea(false);
        setAnalysisContext(snapshot.analysisContext ?? 'POINTS');
        setComparisonPoints(snapshot.comparisonPoints ?? []);
        setPendingComparisonPointIds([]);
        setSelectedPointId(REFERENCE_POINT_ID);
        setScenarioWorkspaceOpen(false);
        lastAutoAreaRunKeyRef.current = null;
        areaRun.clear();
        clock.setDateTime(snapshot.scenario.window.startMs);
    }, [areaRun, clock]);

    const handleExportResultSheet = useCallback(() => {
        setExportError(null);
        const model = analysisContext === 'AREA'
            ? areaRun.analysis
                ? buildAreaResultSheet(scenario, areaRun.analysis, requirementMs)
                : null
            : analysis
                ? buildRevisitResultSheet(
                    scenario, analysis, requirementMs, targetComparison.rows ?? []
                )
                : null;
        if (!model) return;
        void downloadRevisitResultSheet(model).catch((cause) => {
            setExportError(cause instanceof Error ? cause.message : String(cause));
        });
    }, [analysisContext, areaRun.analysis, analysis, scenario, requirementMs, targetComparison.rows]);

    const toggle = useCallback((key: keyof DisplayOptions) => {
        setOptions((current) => ({ ...current, [key]: !current[key] }));
    }, []);

    return (
        <div className="revisit-shell relative isolate flex h-dvh w-screen flex-col overflow-hidden bg-[#05070D] text-slate-100 transition-colors light:bg-slate-100 light:text-slate-950">
            <GlobalAppHeader className="revisit-global-header">
                <div className="revisit-context-rail px-2 py-2 sm:px-3 lg:px-4">
                    <RevisitHeader
                        scenario={scenario}
                        payloadCounts={payloadCounts}
                        currentPayloadCount={currentPayloadCount}
                        onPayloadCountChange={handlePayloadCountChange}
                        targetNames={targetOptions}
                        onTargetChange={handleTargetChange}
                        onTargetCoordinatesChange={handlePickTarget}
                        onInstrumentPresetChange={handleInstrumentPresetChange}
                        spreadNote={spreadNote}
                        analysisContext={analysisContext}
                        onAnalysisContextChange={(context) => {
                            setAnalysisContext(context);
                            setMobileAnalysisPanel('summary');
                            if (context === 'AREA') setSelectedPointId(REFERENCE_POINT_ID);
                        }}
                        comparisonPoints={comparisonPoints}
                        pendingComparisonPointIds={pendingComparisonPointIds}
                        selectedPointId={selectedPointId}
                        onSelectedPointChange={setSelectedPointId}
                        onSecondaryPointChange={handleSecondaryPointChange}
                        onSecondaryPointTargetChange={handleSecondaryPointTargetChange}
                        onRemoveSecondaryPoint={handleRemoveSecondaryPoint}
                        onAddComparisonPoint={handleCreateComparisonPoint}
                        customArea={customArea ?? areaRun.analysis?.area ?? null}
                        customAreaCellCount={areaRun.analysis?.cells.length ?? null}
                        areaAnalysis={areaRun.analysis}
                        areaIsRunning={areaRun.isRunning}
                        areaError={areaRun.error}
                        areaProgress={areaRun.progress}
                        areaRequirementMs={requirementMs}
                        onClearArea={areaRun.clear}
                        onCancelArea={areaRun.clear}
                        onExportAreaCsv={handleExportAreaCsv}
                        isDrawingArea={isDrawingArea}
                        onCustomAreaChange={handleCustomAreaChange}
                        onStartAreaDrawing={handleStartAreaDrawing}
                        onFinishAreaDrawing={() => setIsDrawingArea(false)}
                        onUndoAreaVertex={handleUndoAreaVertex}
                        isAreaScenarioSettling={isConfigurationSettling}
                        onAdvancedScenarioChange={handleAdvancedChange}
                        model={{
                            profile: referenceProfile,
                            mode: referenceMode,
                            isRestored: referenceRestored,
                            onModeChange: handleReferenceModeChange,
                            fit: calibration.fit,
                            isRunning: calibration.isRunning,
                            error: calibration.error,
                        }}
                    />
                </div>
            </GlobalAppHeader>

            <div className="revisit-stage pointer-events-none relative z-10 min-h-0 flex-1 overflow-hidden">
              {/* Fixed to the shell viewport while remaining a descendant of the
                  stage for picking and test contracts. The canvas therefore
                  paints behind the header as well as the side/footer glass. */}
              <div className="pointer-events-auto fixed inset-0 z-0">
                <RevisitGlobe
                    scenario={scenario}
                    fleet={fleet}
                    selectedIds={selectedIds}
                    options={options}
                    getTimeMs={getTimeMs}
                    areaAnalysis={areaRun.analysis}
                    areaDraft={customArea}
                    isDrawingArea={isDrawingArea}
                    analysisContext={analysisContext}
                    comparisonPoints={comparisonPoints}
                    selectedPointId={selectedPointId}
                    requirementMs={requirementMs}
                    autoRotate={options.autoRotate && !isDrawingArea}
                    onPickTarget={handlePickTarget}
                    onDrawAreaVertex={handleDrawAreaVertex}
                    onAddComparisonPoint={handleAddComparisonPoint}
                />
              </div>

            {/* One flex column owns the whole overlay. Absolute offsets between
                panels were fragile: the header grows when a spread note appears
                and silently overlapped the KPI panel. Flow layout cannot. */}
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-2 sm:p-3">
                {/* `flex-1 min-h-0` is load-bearing: it gives this row the leftover
                    height and lets the analysis column scroll inside it. Without
                    min-h-0 a tall column grows the row instead, pushing the ribbon
                    off-screen — and the ribbon is the most valuable thing here
                    after the headline number. */}
                <div className="relative flex min-h-0 flex-1 items-stretch justify-between gap-2">
                  {/* `items-start` so each panel sizes to its own content rather
                      than stretching to the width of the widest sibling. */}
                  <div className="pointer-events-none absolute left-0 top-0 z-40 flex flex-col items-start justify-between md:static md:z-20">
                    {/* Display toggles — the slot ENG uses for REG / 5G / CONN / LOAD */}
                    {/* On a phone this toolbar is a five-button band lying across
                        the top of the globe. Collapsed behind one button it
                        stops competing with the scene; `md:` keeps the band. */}
                    <button
                        type="button"
                        onClick={() => setStageMenuOpen((open) => !open)}
                        aria-expanded={stageMenuOpen}
                        aria-controls="revisit-stage-controls"
                        aria-label="Globe and scenario controls"
                        className={`pointer-events-auto ${REVISIT_PANEL} flex h-11 w-11 items-center justify-center text-base text-amber-200 md:hidden`}
                    >
                        <span aria-hidden="true">{stageMenuOpen ? '×' : '☰'}</span>
                    </button>
                    <div
                        id="revisit-stage-controls"
                        data-revisit-stage-controls
                        className={`pointer-events-auto ${REVISIT_PANEL} ${stageMenuOpen ? 'mt-1 flex' : 'hidden'} max-w-[calc(100vw-1rem)] flex-col gap-1 p-1.5 md:mt-0 md:flex md:max-w-none`}
                    >
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
                            onClick={() => setScenarioWorkspaceOpen((open) => !open)}
                            aria-expanded={scenarioWorkspaceOpen}
                            aria-controls="revisit-scenario-workspace-drawer"
                            className={`min-h-11 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition-colors md:min-h-0 ${scenarioWorkspaceOpen ? 'bg-sky-500/15 text-sky-200' : 'text-slate-400 hover:text-sky-200'}`}
                        >
                            <span className="sm:hidden">Scenarios</span>
                            <span className="hidden sm:inline">Scenario workspace</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleResetScenario}
                            className="min-h-11 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400 transition-colors hover:text-amber-200 md:min-h-0"
                        >
                            <span className="sm:hidden">Reset</span>
                            <span className="hidden sm:inline">Reset scenario</span>
                        </button>
                        {!presenterMode && TOGGLES.map(({ key, label, hint }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => toggle(key)}
                                aria-pressed={options[key]}
                                title={hint}
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

                  </div>

                    {(!renderValidation.ok || error || sweepError || isMainThreadFallback) && (
                        <div className={`pointer-events-auto absolute left-12 right-0 top-0 z-30 ${REVISIT_PANEL} self-start border-red-400/40 md:left-0 px-3 py-1.5 text-[11px] text-red-200 md:static`}>
                            {renderValidation.errors.join('; ') || error || sweepError
                                || 'Running on the main thread — Worker unavailable'}
                        </div>
                    )}

                    {warnings.length > 0 && (
                        <div className={`pointer-events-none absolute left-12 right-0 top-14 z-30 max-w-sm md:pointer-events-auto ${REVISIT_PANEL} self-start border-amber-400/40 md:left-0 md:top-28 px-3 py-1.5 text-[10px] leading-4 text-amber-200 md:static`}>
                            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                    )}

                    {/* The analysis column: headline, then the business case.
                        Scrolls independently so it can never push the ribbon out. */}
                    <section
                        ref={analysisColumnRef}
                        id="revisit-analysis-sheet"
                        data-revisit-sheet-state={mobileSheet}
                        className={`pointer-events-auto absolute inset-x-0 bottom-0 z-10 w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-t-2xl md:static md:flex md:max-h-none md:w-[400px] md:rounded-none [&>*]:shrink-0 ${mobileSheet === 'closed'
                            ? 'hidden'
                            : mobileSheet === 'full'
                                ? 'flex max-h-[min(82dvh,100%)]'
                                : 'flex max-h-[min(48dvh,100%)]'}`}
                        data-revisit-analysis-panel
                        aria-label="REVISIT analysis"
                    >
                        {/* Sheet chrome: size and dismiss. Mobile only. */}
                        <div className={`${REVISIT_PANEL} sticky top-0 z-20 flex items-center px-1 md:hidden`}>
                            <button
                                type="button"
                                onClick={() => setMobileSheet(mobileSheet === 'full' ? 'half' : 'full')}
                                aria-label={mobileSheet === 'full' ? 'Shrink analysis sheet' : 'Expand analysis sheet'}
                                className="flex h-8 flex-1 items-center justify-center"
                            >
                                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-slate-600" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setMobileSheet('closed')}
                                aria-label="Close analysis sheet and show the globe"
                                className="h-8 w-9 text-base font-black text-slate-400"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        <nav className={`${REVISIT_PANEL} sticky top-8 z-20 grid gap-1 p-1 md:hidden ${analysisContext === 'AREA' ? 'grid-cols-2' : 'grid-cols-3'}`} aria-label="REVISIT analysis sections">
                            {((analysisContext === 'AREA' ? [
                                ['summary', 'Result'], ['curve', 'Cells'],
                            ] : [
                                ['summary', 'Summary'], ['curve', 'Curve'], ['details', 'Details'],
                            ]) as Array<[MobileAnalysisPanel, string]>).map(([panel, label]) => (
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

                        <div
                            aria-label="Active result context"
                            className={`${REVISIT_PANEL} sticky top-[5.25rem] z-[19] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-4 px-3 py-2 md:top-0 ${analysisContext === 'AREA'
                                ? 'border-l-sky-400'
                                : 'border-l-amber-400'}`}
                        >
                            <div className="min-w-0">
                                <div className={`text-[9px] font-black uppercase tracking-[0.12em] ${analysisContext === 'AREA' ? 'text-sky-700 dark:text-sky-300' : 'text-amber-300'}`}>
                                    {analysisContext === 'AREA' ? 'Area analysis' : comparisonPoints.length > 0 ? 'Multi-point analysis' : 'Point analysis'}
                                </div>
                                <p className="mt-0.5 truncate text-[9px] leading-3 text-slate-400">
                                    {analysisContext === 'AREA'
                                        ? `${areaRun.analysis?.area.name ?? customArea?.name ?? 'No area selected'} · worst-cell contractual view`
                                        : `${scenario.target.name} is the reference${comparisonPoints.length ? ` · ${comparisonPoints.length} comparison point${comparisonPoints.length > 1 ? 's' : ''}` : ''}${pendingComparisonPointIds.length ? ` · ${pendingComparisonPointIds.length} awaiting location` : ''}.`}
                                </p>
                            </div>
                            <label className="flex shrink-0 flex-col gap-0.5">
                                <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">
                                    Revisit requirement
                                </span>
                                <select
                                    aria-label="Revisit requirement"
                                    value={requirementMs}
                                    onChange={(event) => setRequirementMs(Number(event.target.value))}
                                    className="min-h-7 rounded border border-amber-400/35 bg-slate-950/85 px-2 text-[11px] font-black text-amber-200 outline-none"
                                    title="Maximum acceptable gap between two observations"
                                >
                                    {REQUIREMENT_CHOICES_H.map((hours) => (
                                        <option key={hours} value={hours * 3600_000}>
                                            {formatGap(hours * 3600_000)} max gap
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className={`${mobileAnalysisPanel === 'summary' ? 'block' : 'hidden'} md:contents`} aria-live="polite">
                            {analysisContext === 'AREA' ? (
                                <AreaResultSummary
                                    analysis={areaRun.analysis}
                                    isRunning={areaRun.isRunning}
                                    progress={areaRun.progress}
                                    error={areaRun.error}
                                    requirementMs={requirementMs}
                                    onExportCsv={handleExportAreaCsv}
                                />
                            ) : (
                                <RevisitKpiPanel
                                    statistics={analysis?.statistics ?? null}
                                    windowHours={scenario.window.durationHours}
                                    requirementMs={requirementMs}
                                    isComputing={isComputing}
                                    comparison={businessComparison}
                                />
                            )}
                        </div>
                        <div className={`${mobileAnalysisPanel === 'curve' ? 'block' : 'hidden'} md:contents`}>
                            {analysisContext === 'AREA' ? (
                                <AreaDistributionPanel analysis={areaRun.analysis} requirementMs={requirementMs} onExportCsv={handleExportAreaCsv} />
                            ) : (
                                <ValueCurve
                                    key={resetRevision}
                                    sweep={sweep}
                                    isComputing={isSweeping}
                                    requirementMs={requirementMs}
                                    currentPayloadCount={currentPayloadCount}
                                    currentMaxGapMs={analysis?.statistics.maxGapMs ?? null}
                                    currentIsMeasuredBest={status.isBest}
                                    targetName={scenario.target.name}
                                    onSelectPayloadCount={handlePayloadCountChange}
                                />
                            )}
                        </div>
                        <div className={`${mobileAnalysisPanel === 'details' ? 'space-y-2' : 'hidden'} md:contents`}>
                            {analysisContext === 'POINTS' && (
                                <>
                                    <WhyThisRevisit explanation={explanation} />
                                    <div className="lg:hidden">
                                        <TargetComparisonTable
                                            rows={targetComparison.rows}
                                            requirementMs={requirementMs}
                                            enabled={comparisonPoints.length > 0}
                                            isComputing={targetComparison.isComputing}
                                            error={targetComparison.error}
                                            targets={comparisonTargets}
                                            pendingCount={pendingComparisonPointIds.length}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className={`${analysisContext === 'AREA'
                            ? mobileAnalysisPanel === 'curve' ? 'space-y-2' : 'hidden'
                            : mobileAnalysisPanel === 'details' ? 'space-y-2' : 'hidden'} md:contents`}>
                          <div className={`${REVISIT_PANEL} flex items-center gap-2 px-3 py-2`}>
                            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                                Export
                            </span>
                            {analysisContext === 'AREA' ? (
                                <button type="button" onClick={handleExportAreaCsv} disabled={!areaRun.analysis}
                                    className="rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-40">
                                    Area grid
                                </button>
                            ) : <>
                                <button type="button" onClick={handleExportAccessCsv} disabled={!analysis}
                                    className="rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-40">
                                    Accesses
                                </button>
                                <button type="button" onClick={handleExportSweepCsv} disabled={!sweep}
                                    className="rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-40">
                                    Sweep
                                </button>
                            </>}
                          </div>
                        </div>
                    </section>
                </div>

                <div className="pointer-events-auto md:hidden">
                    <MobileResultStrip
                        analysisContext={analysisContext}
                        statistics={analysis?.statistics ?? null}
                        areaAnalysis={areaRun.analysis}
                        requirementMs={requirementMs}
                        isComputing={analysisContext === 'AREA' ? areaRun.isRunning : isComputing}
                        expanded={mobileSheet !== 'closed'}
                        onToggle={() => setMobileSheet((state) => state === 'closed' ? 'half' : 'closed')}
                    />
                </div>

                <div className="pointer-events-auto">
                    <ClockedCoverageRibbon
                        intervals={analysis?.intervals ?? []}
                        statistics={analysis?.statistics ?? null}
                        windowStartMs={scenario.window.startMs}
                        windowHours={scenario.window.durationHours}
                        getTimeMs={getTimeMs}
                        onSeek={handleSeek}
                        analysisContext={analysisContext}
                        referenceTargetName={scenario.target.name}
                        areaName={areaRun.analysis?.area.name ?? customArea?.name ?? null}
                        pointLanes={pointTimelineLanes}
                        areaAnalysis={areaRun.analysis}
                        requirementMs={requirementMs}
                        comparisonIsComputing={targetComparison.isComputing}
                        comparisonError={targetComparison.error}
                        onSelectPoint={setSelectedPointId}
                    />
                </div>
              </div>
            </div>
            {scenarioWorkspaceOpen && (
                <ScenarioWorkspaceDrawer onClose={() => setScenarioWorkspaceOpen(false)}>
                    <ScenarioWorkspace
                        snapshot={currentSnapshot}
                        onLoad={handleLoadSavedScenario}
                        onExportResult={handleExportResultSheet}
                        canExportResult={analysisContext === 'AREA'
                            ? Boolean(areaRun.analysis) && !areaRun.isRunning
                            : Boolean(analysis) && !isComputing}
                        analysisContext={analysisContext}
                    />
                    {exportError && (
                        <p role="alert" className="mt-2 rounded border border-red-400/30 bg-red-950/80 px-2 py-1 text-[10px] text-red-200">
                            {exportError}
                        </p>
                    )}
                </ScenarioWorkspaceDrawer>
            )}
        </div>
    );
};

export default RevisitApp;
