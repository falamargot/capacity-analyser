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
import {
    useRevisitSweep,
} from '../hooks/useRevisitSweep';
import { explainRevisit } from '../analysis/explainRevisit';
import { ValueCurve } from './ValueCurve';
import { WhyThisRevisit } from './WhyThisRevisit';
import { constellationFor, type RevisitAnalysis } from '../analysis/runScenario';
import {
    ladderPayloadCounts, reconcileSelection, selectedSatelliteIds, validateSelection,
} from '../domain/subConstellation';
import { validateWalkerSpec } from '../domain/walker';
import {
    DEFAULT_PROFILE, fleetSubject, referenceModeFor, referenceProfileFor,
    type ReferenceMode,
} from '../domain/referenceProfiles';
import {
    reconcileToMeasuredBest, sameSelection, selectionForPayloadCount, selectionStatus,
    type SelectionSource,
} from '../domain/selectionReconcile';
import { useOneWebCalibration } from '../hooks/useOneWebCalibration';
import { useAreaAnalysis } from '../hooks/useAreaAnalysis';
import {
    areaAnalysisKey, MAX_AREA_VERTICES, recommendedAreaGridSpacing, validateArea, type AreaTarget,
} from '../domain/areaTarget';
import {
    AREA_TARGET_ID, MAX_SECONDARY_TARGETS, REFERENCE_AREA_TARGET_ID, REFERENCE_POINT_ID,
    type RevisitAnalysisContext, type RevisitAreaTargetRole, type RevisitComparisonPoint,
} from '../domain/analysisTargets';
import {
    accessIntervalsCsv, areaAnalysisCsv, csvFilename, payloadSweepCsv,
} from '../analysis/csvExport';
import { downloadCsv } from './downloadCsv';
import { AreaDistributionPanel, AreaResultSummary } from './AreaResultsPanels';
import {
    TARGET_PRESETS, defaultScenario, fovPresets, swathKmForFov, type FovPresetName,
} from '../domain/presets';
import { executiveEnvelopePoints } from '../analysis/executiveEnvelope';
import type { PointTarget, RevisitScenario, WalkerSpec } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import { RevisitHeader } from './RevisitHeader';
import { RevisitKpiPanel } from './RevisitKpiPanel';
import { CustomerResultCard } from './CustomerResultCard';
import { resolveCustomerSizing, type CustomerSizing } from '../analysis/customerSizing';
import { StageControls } from './StageControls';
import {
    PresentationNotice, PresentationReadiness,
    type NoticeSeverity, type ReadinessSignal,
} from './PresentationSafety';
import { ScenarioWorkspace } from './ScenarioWorkspace';
import { ScenarioWorkspaceDrawer } from './ScenarioWorkspaceDrawer';
import { CoverageRibbon, type CoverageRibbonTarget } from './CoverageRibbon';
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
import { recommendationContextKey } from '../state/recommendationUndo';
import {
    canSwapTargetRoles as canSwapTargets, swapTargetRoles,
} from '../domain/targetRoleSwap';

/** The customer requirement the verdict badge and the value curve compare against. */
const DEFAULT_REQUIREMENT_MS = 2 * 3600_000;

/** Requirements a customer actually states, in hours. */
const REQUIREMENT_CHOICES_H = [0.5, 1, 2, 3, 6, 12, 24] as const;

/** Scene layers plus the camera behaviour the user can switch. */
interface DisplayOptions extends RevisitSceneOptions, RevisitDisplayOptions {}

/**
 * The one panel that is open, if any (Programme 7B).
 *
 * ── WHY THIS IS ONE STATE AND NOT FOUR BOOLEANS ─────────────────────────────
 * It used to be four, and two of them lived in different components:
 * `mobileSetupOpen` inside `RevisitHeader`, `mobileSheet`, `stageMenuOpen` and
 * `scenarioWorkspaceOpen` here. Nothing could enforce exclusivity across that
 * boundary, so on a phone the setup triad, the analysis sheet, the stage menu
 * and the workspace drawer could all be open at once, stacked over a globe
 * reduced to nothing — mid-demonstration, in front of a customer, with no
 * single control that returned to the globe.
 *
 * One authority makes exclusivity structural rather than a rule to remember,
 * and `none` is always the way back to the globe.
 *
 * It is deliberately NOT branched on viewport. Above `md` the setup triad, the
 * stage toolbar and the analysis column are laid out in normal flow and forced
 * visible by CSS (`md:flex`, `md:static`), so the value is simply ignored
 * there; only the workspace drawer reads it at every size, and it is modal at
 * every size. Branching in JS would mean two behaviours to keep in step.
 */
type CompactPanel = 'none' | 'setup' | 'analysis' | 'workspace';

/**
 * How tall the analysis sheet is when it is the open panel. Orthogonal to
 * WHICH panel is open, which is why it is not folded into `CompactPanel`:
 * collapsing to `half` must not close the sheet.
 */
type AnalysisSheetSize = 'half' | 'full';

const TOGGLES: Array<{ key: keyof DisplayOptions; label: string; hint?: string }> = [
    { key: 'showOrbits', label: 'Orbits' },
    { key: 'showSwaths', label: 'Sensor swath' },
    {
        key: 'showProjectionCones',
        label: 'Projection cones',
        hint: 'Transparent link between each payload satellite and its sensor footprint',
    },
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
        showProjectionCones: true,
        showHostFleet: true,
        showLabels: true,
        autoRotate: false,
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

/**
 * What `Return to previous configuration` restores.
 *
 * The payload count is not stored: it is derived from the selection
 * (`selectedSatelliteIds(...).size`), so restoring the selection restores the
 * count by construction and the two can never disagree. Component state, not
 * scenario state — a restored session offers no undo, which is correct.
 */
interface PreviousConfiguration {
    selection: RevisitScenario['selection'];
    selectionSource: SelectionSource;
    /** Business question for which the recommendation was applied. */
    contextKey: string;
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
    const [resetRevision, setResetRevision] = useState(0);
    /*
     * `none` is the default: the strip above the ribbon still carries the
     * verdict and the worst-case gap, so opening no panel costs no answer — it
     * buys back the globe, which was otherwise reduced to a 73 px band no one
     * could rotate (mobile UX plan §2).
     */
    const [compactPanel, setCompactPanel] = useState<CompactPanel>('none');
    const [analysisSheetSize, setAnalysisSheetSize] = useState<AnalysisSheetSize>('half');
    /** Open one panel, which closes whichever other one was open. */
    const showPanel = useCallback((panel: CompactPanel) => setCompactPanel(panel), []);
    /** Toggle a panel, falling back to the globe. */
    const togglePanel = useCallback(
        (panel: CompactPanel) => setCompactPanel((current) => current === panel ? 'none' : panel),
        []
    );
    const [exportError, setExportError] = useState<string | null>(null);
    // A REVISIT entry starts as an explicit question-building state. The
    // engine still needs its fallback point inside `scenario`, but that point
    // is not presented as a selected customer target until the user adds or
    // places one. Saved scenarios can restore their targets explicitly through
    // the workspace after launch.
    /*
     * Restored, not reset. The flag was written into the session snapshot and
     * never read back, so a REVISIT → Engineering → REVISIT round trip silently
     * dropped the analysis: the scenario, comparison points and area all came
     * back, but the module reopened on "no target selected" as if nothing had
     * been chosen. Older snapshots have no flag and default to `false`, which
     * is the honest reading of a session that predates it.
     */
    const [hasReferenceTarget, setHasReferenceTarget] = useState(
        restoredSession?.hasReferenceTarget ?? false
    );
    const [areaTargetRole, setAreaTargetRole] = useState<RevisitAreaTargetRole>(
        'REFERENCE'
    );
    const [areaTargets, setAreaTargets] = useState<Record<RevisitAreaTargetRole, AreaTarget | null>>(
        { REFERENCE: null, COMPARISON: null }
    );
    const customArea = areaTargets[areaTargetRole];
    const referenceArea = areaTargets.REFERENCE;
    const comparisonArea = areaTargets.COMPARISON;
    const setCustomArea = useCallback<React.Dispatch<React.SetStateAction<AreaTarget | null>>>((next) => {
        setAreaTargets((current) => {
            const value = typeof next === 'function' ? next(current[areaTargetRole]) : next;
            return { ...current, [areaTargetRole]: value };
        });
    }, [areaTargetRole]);
    const [isDrawingArea, setIsDrawingArea] = useState(false);
    const areaBeforeDrawingRef = useRef<AreaTarget | null>(null);
    const [analysisContext, setAnalysisContext] = useState<RevisitAnalysisContext>(
        'POINTS'
    );
    const [comparisonPoints, setComparisonPoints] = useState<RevisitComparisonPoint[]>([]);
    const [pendingComparisonPointIds, setPendingComparisonPointIds] = useState<string[]>([]);
    const [secondaryTargetOrder, setSecondaryTargetOrder] = useState<string[]>([]);
    const [selectedPointId, setSelectedPointId] = useState<typeof REFERENCE_POINT_ID | string>(
        REFERENCE_POINT_ID
    );
    const analysisColumnRef = useRef<HTMLElement | null>(null);
    /** The stage-rail launcher the Scenario workspace popup hangs from. */
    const workspaceLauncherRef = useRef<HTMLButtonElement | null>(null);

    const activeTargetRole: RevisitAreaTargetRole | null = !hasReferenceTarget
        ? null
        : analysisContext === 'AREA'
            ? areaTargetRole
            : selectedPointId === REFERENCE_POINT_ID ? 'REFERENCE' : 'COMPARISON';
    const [targetRequirementsMs, setTargetRequirementsMs] = useState<
        Record<RevisitAreaTargetRole, number>
    >(() => {
        const primary = restoredSession?.requirementMs ?? DEFAULT_REQUIREMENT_MS;
        return {
            REFERENCE: primary,
            COMPARISON: restoredSession?.comparisonRequirementMs ?? primary,
        };
    });
    const requirementMs = targetRequirementsMs[activeTargetRole ?? 'REFERENCE'];
    const setRequirementMs = useCallback((value: number) => {
        if (!activeTargetRole || !Number.isFinite(value) || value <= 0) return;
        setTargetRequirementsMs((current) => current[activeTargetRole] === value
            ? current
            : { ...current, [activeTargetRole]: value });
    }, [activeTargetRole]);
    const persistedSelectedPointId = selectedPointId === REFERENCE_POINT_ID
        || (secondaryTargetOrder.includes(selectedPointId)
            && comparisonPoints.some((point) => point.id === selectedPointId))
        ? selectedPointId
        : REFERENCE_POINT_ID;
    /**
     * Where the current selection came from. The preset counts as `auto`, so the
     * opening scenario reconciles to the measured best as soon as the sweep
     * lands — which is what stops the KPI and the value curve describing
     * different constellations.
     */
    const [selectionSource, setSelectionSource] = useState<SelectionSource>(restoredSession?.selectionSource ?? 'auto');
    /**
     * Set by `Apply recommended configuration`, and dropped as soon as the
     * configuration moves by any other path — so undo can never resurrect a
     * configuration from several interactions back, which would be worse than
     * having no undo at all in front of a customer.
     */
    const [previousConfiguration, setPreviousConfiguration] = useState<PreviousConfiguration | null>(null);
    /**
     * P7E: who the scenario is for. Free text, persisted in the session
     * snapshot and printed on the customer summary, so a salesperson types it
     * once rather than renaming the PDF afterwards.
     */
    const [opportunity, setOpportunity] = useState(restoredSession?.opportunity ?? '');

    const sessionRef = useRef({
        scenario, options, requirementMs: targetRequirementsMs.REFERENCE,
        comparisonRequirementMs: targetRequirementsMs.COMPARISON,
        selectionSource, hasReferenceTarget,
        customArea, referenceArea, comparisonArea, areaTargetRole,
        analysisContext, comparisonPoints, secondaryTargetOrder,
        selectedPointId: persistedSelectedPointId, referenceRestored: false,
        opportunity,
    });
    sessionRef.current = {
        ...sessionRef.current,
        scenario, options, requirementMs: targetRequirementsMs.REFERENCE,
        comparisonRequirementMs: targetRequirementsMs.COMPARISON,
        selectionSource, hasReferenceTarget,
        customArea, referenceArea, comparisonArea, areaTargetRole,
        analysisContext, comparisonPoints, secondaryTargetOrder,
        selectedPointId: persistedSelectedPointId, opportunity,
    };
    useEffect(() => () => {
        writeRevisitSessionSnapshot({
            schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
            ...sessionRef.current,
        });
    }, []);

    const { analysis, isComputing, error, isMainThreadFallback } = useRevisitAnalysis(scenario);
    // Its own worker, and keyed so the payload slider never re-triggers it.
    const {
        sweep: referenceSweep,
        isComputing: isReferenceSweeping,
        error: referenceSweepError,
        isMainThreadFallback: isReferenceSweepFallback,
        retry: retryReferenceSweep,
    } = useRevisitSweep(scenario, hasReferenceTarget && !referenceArea, 'Primary target');
    const orderedComparisonPoints = useMemo(() => secondaryTargetOrder
        .filter((id) => id !== AREA_TARGET_ID)
        .map((id) => comparisonPoints.find((point) => point.id === id))
        .filter((point): point is RevisitComparisonPoint => Boolean(point)),
    [secondaryTargetOrder, comparisonPoints]);
    const secondaryTargetId = secondaryTargetOrder[0] ?? null;
    const canSwapTargetRoles = hasReferenceTarget && canSwapTargets({
        primaryPoint: scenario.target,
        primaryArea: referenceArea,
        secondaryArea: comparisonArea,
        comparisonPoints,
        secondaryTargetOrder,
    });
    const comparisonTargets = useMemo(
        () => hasReferenceTarget
            ? [scenario.target, ...orderedComparisonPoints.map((point) => point.target)]
            : [],
        [hasReferenceTarget, scenario.target, orderedComparisonPoints]
    );
    const targetComparison = useTargetComparison(
        scenario, comparisonTargets,
        orderedComparisonPoints.length > 0,
    );

    /**
     * Reference and inspected point are deliberately independent. The former
     * remains the comparison benchmark; the latter owns the sidebar, curve and
     * exports. A pending row has no target and therefore no publishable result.
     */
    const selectedComparisonPoint = selectedPointId === REFERENCE_POINT_ID
        ? null
        : orderedComparisonPoints.find((point) => point.id === selectedPointId) ?? null;
    const inspectedPoint = selectedPointId === REFERENCE_POINT_ID
        ? hasReferenceTarget && !referenceArea ? scenario.target : null
        : selectedComparisonPoint?.target ?? null;
    const inspectedPointRole = selectedPointId === REFERENCE_POINT_ID
        ? 'Primary target'
        : 'Secondary target';
    const inspectedScenario = useMemo<RevisitScenario>(
        () => inspectedPoint ? { ...scenario, target: inspectedPoint } : scenario,
        [scenario, inspectedPoint]
    );
    const selectedComparisonRow = selectedComparisonPoint
        ? targetComparison.rows?.[orderedComparisonPoints.findIndex((point) => point.id === selectedComparisonPoint.id) + 1] ?? null
        : null;
    const inspectedAnalysis = useMemo<RevisitAnalysis | null>(() => {
        if (selectedPointId === REFERENCE_POINT_ID) return inspectedPoint ? analysis : null;
        if (!selectedComparisonRow || !inspectedPoint) return null;
        return {
            scenario: inspectedScenario,
            payloadCount: selectedComparisonRow.payloadCount,
            // The topology is common to every compared target. Reuse this
            // bounded id list instead of cloning satellite state per point.
            selectedIds: analysis?.selectedIds ?? [],
            intervals: selectedComparisonRow.intervals,
            statistics: selectedComparisonRow.statistics,
            warnings: selectedComparisonRow.warnings,
        };
    }, [selectedPointId, analysis, selectedComparisonRow, inspectedPoint, inspectedScenario]);
    const inspectedIsComputing = selectedPointId === REFERENCE_POINT_ID
        ? Boolean(inspectedPoint) && isComputing
        : Boolean(inspectedPoint) && (targetComparison.isComputing || !selectedComparisonRow);
    const inspectedError = selectedPointId === REFERENCE_POINT_ID
        ? error
        : targetComparison.error;

    // Comparison curves are lazy: selecting the point subscribes to one sweep.
    // Both instances now read the same scheduler, so a secondary target at the
    // reference's coordinates is served from the curve already measured rather
    // than starting a second identical run. The reference sweep stays a separate
    // subscription because it owns automatic topology reconciliation.
    const secondarySweepState = useRevisitSweep(
        inspectedScenario,
        analysisContext === 'POINTS'
            && selectedPointId !== REFERENCE_POINT_ID
            && Boolean(inspectedPoint),
        'Secondary target',
    );
    const sweep = selectedPointId === REFERENCE_POINT_ID
        ? inspectedPoint ? referenceSweep : null
        : inspectedPoint ? secondarySweepState.sweep : null;
    const isSweeping = selectedPointId === REFERENCE_POINT_ID
        ? Boolean(inspectedPoint) && isReferenceSweeping
        : inspectedPoint ? secondarySweepState.isComputing : false;
    const sweepError = selectedPointId === REFERENCE_POINT_ID
        ? inspectedPoint ? referenceSweepError : null
        : inspectedPoint ? secondarySweepState.error : null;
    const retrySweep = selectedPointId === REFERENCE_POINT_ID
        ? retryReferenceSweep
        : secondarySweepState.retry;
    const pointMainThreadFallback = isMainThreadFallback
        || isReferenceSweepFallback
        || targetComparison.isMainThreadFallback
        || secondarySweepState.isMainThreadFallback;

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
     *
     * Initialised from the session snapshot's OWN `referenceRestored` flag, not
     * re-derived from `referenceModeFor(...) === 'CUSTOM'`: that snapshot is
     * also restored on every ordinary remount (switching app modes, reloading
     * the page), not only on a deliberate "Load saved scenario", and mode alone
     * cannot tell a restored CUSTOM spec from a hand-typed one — both read back
     * as CUSTOM. Falls back to `false` for snapshots predating this field.
     */
    const [referenceRestored, setReferenceRestored] = useState(
        () => restoredSession?.referenceRestored ?? false
    );
    sessionRef.current.referenceRestored = referenceRestored;

    const payloadCounts = useMemo(
        () => ladderPayloadCounts(scenario.reference.planes, scenario.reference.satsPerPlane),
        [scenario.reference.planes, scenario.reference.satsPerPlane]
    );
    const currentPayloadCount = selectedIds.size;

    /**
     * The sweep the slider and `Apply recommended configuration` read to adopt a
     * MEASURED topology rather than the ladder's default ordering — see
     * `selectionForPayloadCount`, which both go through. Held in a ref so a
     * landing sweep does not re-create either callback: they are passed into the
     * header and the value curve, which are expensive to reconcile.
     */
    const activeSweepRef = useRef(sweep);
    activeSweepRef.current = sweep;
    const selectedPointIdRef = useRef(selectedPointId);
    selectedPointIdRef.current = selectedPointId;

    const handlePayloadCountChange = useCallback((count: number) => {
        // Choosing a topology from a secondary target's curve is an explicit
        // optimisation choice. Mark it manual so the reference sweep does not
        // immediately reconcile it back to the primary target's winner.
        setSelectionSource(selectedPointIdRef.current === REFERENCE_POINT_ID ? 'auto' : 'manual');
        setPreviousConfiguration(null);
        setScenario((current) => {
            const selection = selectionForPayloadCount(
                current.selection, current.reference, count, activeSweepRef.current
            );
            return selection ? { ...current, selection } : current;
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
            if (!sameSelection(current.selection, next.selection)) {
                setSelectionSource('manual');
                setPreviousConfiguration(null);
            }
            // Once the reference itself is touched, the values are hand-entered
            // whatever they were restored from (m4).
            if (current.reference !== next.reference) setReferenceRestored(false);
            return next;
        });
    }, []);

    const handleTargetChange = useCallback((name: string) => {
        const target = TARGET_PRESETS.find((t) => t.name === name);
        if (target) {
            setHasReferenceTarget(true);
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
        setHasReferenceTarget(true);
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
            return secondaryTargetOrder.includes(id) || secondaryTargetOrder.length < MAX_SECONDARY_TARGETS
                ? [...current, { id, target }]
                : current;
        });
        setPendingComparisonPointIds((current) => current.filter((candidate) => candidate !== id));
        setSelectedPointId(id);
        setAnalysisContext('POINTS');
    }, [secondaryTargetOrder]);

    const handleAddComparisonPoint = useCallback((latDeg: number, lonDeg: number) => {
        if (!hasReferenceTarget) return;
        // Shift-click is both creation and repositioning. Once the comparison
        // point exists, subsequent Shift-clicks move that same target instead
        // of silently doing nothing at the one-comparison limit.
        const existingPointId = secondaryTargetOrder.find((id) => id !== AREA_TARGET_ID);
        if (existingPointId) {
            upsertComparisonPoint(existingPointId, {
                kind: 'POINT',
                name: formatCoordinate(latDeg, lonDeg),
                latDeg,
                lonDeg,
            });
            return;
        }
        if (secondaryTargetOrder.length >= MAX_SECONDARY_TARGETS && pendingComparisonPointIds.length === 0) return;
        const id = pendingComparisonPointIds[0] ?? crypto.randomUUID();
        setTargetRequirementsMs((current) => ({
            ...current,
            COMPARISON: current.REFERENCE,
        }));
        setSecondaryTargetOrder((current) => current.includes(id) || current.length >= MAX_SECONDARY_TARGETS
            ? current
            : [...current, id]);
        upsertComparisonPoint(id, {
            kind: 'POINT',
            name: formatCoordinate(latDeg, lonDeg),
            latDeg,
            lonDeg,
        });
    }, [hasReferenceTarget, secondaryTargetOrder, pendingComparisonPointIds, upsertComparisonPoint]);

    /** The explicit control creates an editable row immediately without
     * inventing a location or launching comparison work before it is set. */
    const handleCreateComparisonPoint = useCallback(() => {
        if (!hasReferenceTarget) return;
        if (secondaryTargetOrder.length >= MAX_SECONDARY_TARGETS) return;
        const id = crypto.randomUUID();
        setTargetRequirementsMs((current) => ({
            ...current,
            COMPARISON: current.REFERENCE,
        }));
        setPendingComparisonPointIds((current) => [...current, id]);
        setSecondaryTargetOrder((current) => [...current, id]);
        setSelectedPointId(id);
        setAnalysisContext('POINTS');
    }, [hasReferenceTarget, secondaryTargetOrder.length]);

    const handleCreateReferencePoint = useCallback(() => {
        setHasReferenceTarget(true);
        setAreaTargets((current) => ({ ...current, REFERENCE: null }));
        setAreaTargetRole('REFERENCE');
        setAnalysisContext('POINTS');
        setSelectedPointId(REFERENCE_POINT_ID);
    }, []);

    const handleRemoveReferenceTarget = useCallback(() => {
        setHasReferenceTarget(false);
        setAreaTargets({ REFERENCE: null, COMPARISON: null });
        setAreaTargetRole('REFERENCE');
        setIsDrawingArea(false);
        setComparisonPoints([]);
        setPendingComparisonPointIds([]);
        setSecondaryTargetOrder([]);
        setAnalysisContext('POINTS');
        setSelectedPointId(REFERENCE_POINT_ID);
        setPreviousConfiguration(null);
        setTargetRequirementsMs({
            REFERENCE: DEFAULT_REQUIREMENT_MS,
            COMPARISON: DEFAULT_REQUIREMENT_MS,
        });
    }, []);

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
        setSecondaryTargetOrder((current) => current.filter((candidate) => candidate !== id));
        setSelectedPointId((current) => current === id ? REFERENCE_POINT_ID : current);
        setTargetRequirementsMs((current) => ({
            ...current,
            COMPARISON: current.REFERENCE,
        }));
    }, []);

    const handleSelectedPointChange = useCallback((id: string) => {
        setSelectedPointId(id);
        setAnalysisContext('POINTS');
    }, []);

    const handleSelectedTargetChange = useCallback((id: string) => {
        if (id === REFERENCE_AREA_TARGET_ID || id === AREA_TARGET_ID) {
            setAreaTargetRole(id === REFERENCE_AREA_TARGET_ID ? 'REFERENCE' : 'COMPARISON');
            setAnalysisContext('AREA');
            return;
        }
        handleSelectedPointChange(id);
    }, [handleSelectedPointChange]);

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
    const referenceStatus = useMemo(
        () => selectionStatus(scenario.selection, currentPayloadCount, referenceSweep),
        [scenario.selection, currentPayloadCount, referenceSweep]
    );
    // Same condition `reconcileToMeasuredBest` uses internally to decide
    // whether a reconciliation is pending — derived from the already-memoized
    // `status` rather than re-running `selectionStatus` a second time.
    const isConfigurationSettling = isReferenceSweeping || (
        selectionSource !== 'manual'
        && Boolean(referenceSweep)
        && !referenceStatus.isBest
        && referenceStatus.bestSelection !== null
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
        if (!hasReferenceTarget || referenceArea) return;
        const better = reconcileToMeasuredBest(
            scenario.selection, currentPayloadCount, referenceSweep, selectionSource
        );
        if (better) setScenario((current) => ({ ...current, selection: better }));
    }, [hasReferenceTarget, referenceArea, referenceSweep, scenario.selection, currentPayloadCount, selectionSource]);

    /**
     * The header's sub-label. Only ever states what the sweep measured — while it
     * is in flight this says nothing rather than repeating the ladder's guess.
     */
    const spreadNote = useMemo(() => {
        const currentTopology = `${scenario.reference.planes / scenario.selection.planeStride} planes × `
            + `${scenario.reference.satsPerPlane / scenario.selection.satStride} per plane`;
        if (!referenceSweep) {
            return isReferenceSweeping
                ? `${currentTopology} · comparing exact-count splits…`
                : currentTopology;
        }
        if (referenceStatus.configurationCount < 2 || !referenceStatus.bestSplit) return currentTopology;

        if (referenceStatus.isBest) {
            return `${referenceStatus.bestSplit.planes} planes × ${referenceStatus.bestSplit.perPlane} per plane`
                + ` — measured best of ${referenceStatus.configurationCount} splits at this count`;
        }
        const gain = referenceStatus.improvementAvailable !== null
            ? ` (${Math.round(referenceStatus.improvementAvailable * 100)}% better)`
            : '';
        return `manual split — ${referenceStatus.bestSplit.planes} planes × ${referenceStatus.bestSplit.perPlane}`
            + ` measured better${gain}`;
    }, [referenceSweep, isReferenceSweeping, referenceStatus, scenario.reference, scenario.selection]);

    const executiveEnvelope = useMemo(
        () => sweep ? executiveEnvelopePoints(sweep) : [],
        [sweep]
    );
    const businessComparison = useMemo(() => {
        /*
         * The 1-payload point is the business baseline, and it can legitimately
         * have no max gap for two distinct reasons, both real answers rather than
         * a wait: the single satellite may never see the target across the whole
         * window (NEVER_IN_VIEW), or it may see the target but every resulting
         * gap touches a window boundary and gets discarded (INTERMITTENT with a
         * null maxGapMs) — undercounting neither collapses the reason into a null
         * (m2, and its follow-up: a boundary-truncated baseline was previously
         * indistinguishable from "the sweep hasn't finished yet").
         */
        const baselinePoint = sweep?.points.find((point) => point.payloadCount === 1);
        const baselineMaxGapMs = baselinePoint?.maxGapMs ?? null;
        const baselineCoverage = baselinePoint?.best.statistics.coverage ?? null;
        const baselineNeverInView = baselineCoverage === 'NEVER_IN_VIEW';
        const baselineInconclusive =
            baselinePoint !== undefined && baselineMaxGapMs === null && !baselineNeverInView;
        const targetPayloadCount = executiveEnvelope
            .find((point) => point.maxGapMs !== null && point.maxGapMs <= requirementMs)
            ?.payloadCount ?? null;
        return {
            baselineMaxGapMs, baselineNeverInView, baselineInconclusive,
            currentPayloadCount, targetPayloadCount,
        };
    }, [sweep, executiveEnvelope, requirementMs, currentPayloadCount]);

    const calibration = useOneWebCalibration();
    // Each role owns an independent worker and result slot. A single area run
    // keyed to `customArea` made role selection an accidental computation
    // switch: selecting Comparison discarded Reference (and vice versa).
    // Keeping both hooks mounted lets both defined polygons compute and remain
    // available just like the point-target comparison rows do.
    const referenceAreaRun = useAreaAnalysis(scenario, referenceArea);
    const comparisonAreaRun = useAreaAnalysis(scenario, comparisonArea);
    const areaRun = areaTargetRole === 'REFERENCE' ? referenceAreaRun : comparisonAreaRun;
    const displayedReferenceAreaAnalysis = useMemo(() => {
        if (
            !referenceAreaRun.analysis
            || !referenceArea
            || referenceAreaRun.analysis.area.name === referenceArea.name
        ) {
            return referenceAreaRun.analysis;
        }
        return {
            ...referenceAreaRun.analysis,
            area: { ...referenceAreaRun.analysis.area, name: referenceArea.name },
        };
    }, [referenceAreaRun.analysis, referenceArea]);
    const displayedComparisonAreaAnalysis = useMemo(() => {
        if (
            !comparisonAreaRun.analysis
            || !comparisonArea
            || comparisonAreaRun.analysis.area.name === comparisonArea.name
        ) {
            return comparisonAreaRun.analysis;
        }
        return {
            ...comparisonAreaRun.analysis,
            area: { ...comparisonAreaRun.analysis.area, name: comparisonArea.name },
        };
    }, [comparisonAreaRun.analysis, comparisonArea]);
    const displayedAreaAnalysis = areaTargetRole === 'REFERENCE'
        ? displayedReferenceAreaAnalysis
        : displayedComparisonAreaAnalysis;
    const activeMainThreadFallback = pointMainThreadFallback
        || referenceAreaRun.isMainThreadFallback
        || comparisonAreaRun.isMainThreadFallback;

    /*
     * ── THE COMMERCIAL ANSWER (Programme 7A) ────────────────────────────────
     * Everything below feeds `CustomerResultCard`. It derives from results that
     * already exist — no new computation, no new worker — and its only job is to
     * put the answer and the action ahead of the verdict.
     */

    const assumedSwathKm = useMemo(
        () => Math.round(swathKmForFov(scenario.reference.altitudeKm, scenario.payload)),
        [scenario.reference.altitudeKm, scenario.payload]
    );

    /** The question, phrased so it can be read out loud verbatim. */
    const customerQuestion = useMemo(() => {
        const every = `at least every ${formatGap(requirementMs)}`;
        const assumption = `with an assumed ${assumedSwathKm} km IR swath`;
        if (analysisContext === 'AREA') {
            return `Can every analysed cell in ${customArea?.name || 'the customer area'}`
                + ` be observed ${every}, ${assumption}?`;
        }
        const name = inspectedPoint?.name ?? scenario.target.name;
        // The subject follows the model selector. Naming Eutelsat's fleet while
        // the user is running hand-edited Walker parameters would be a false
        // claim in the one sentence a salesperson reads out loud.
        return `Can ${fleetSubject(referenceMode)} observe ${name} ${every}, ${assumption}?`;
    }, [
        analysisContext, customArea, inspectedPoint, scenario.target.name,
        requirementMs, assumedSwathKm, referenceMode,
    ]);

    /** States the basis out loud once more than one target is in the set. */
    const customerComparisonNote = useMemo(() => {
        // Empty editable rows are not customer targets yet. Count only located
        // points and a geometrically defined Area.
        const hasComparison = comparisonPoints.length > 0
            || Boolean(comparisonArea && comparisonArea.boundary.length >= 3);
        const targetCount = 1 + (hasComparison ? 1 : 0);
        return targetCount > 1
            ? `Comparing ${targetCount} customer targets against the same fleet configuration.`
            : null;
    }, [comparisonPoints.length, comparisonArea]);

    const customerMaxGapMs = analysisContext === 'AREA'
        ? displayedAreaAnalysis?.worstCell?.statistics.maxGapMs ?? null
        : inspectedAnalysis?.statistics.maxGapMs ?? null;
    const customerIsComputing = analysisContext === 'AREA'
        ? areaRun.isRunning
        : inspectedIsComputing;

    const customerUnavailableReason = useMemo(() => {
        if (customerMaxGapMs !== null) return null;
        if (analysisContext === 'AREA') {
            if (!customArea || customArea.boundary.length < 3) return 'Define an area to analyse.';
            if (!displayedAreaAnalysis) return 'This area has not been analysed yet.';
            return displayedAreaAnalysis.neverInViewCount > 0
                ? 'Part of this area is never in view over the analysis window.'
                : 'No interior gap was measured over this window.';
        }
        // `ALWAYS_IN_VIEW` needs no branch here: `gapStatistics` reports it as
        // a maximum gap of ZERO, not as a missing one ("the maximum gap is
        // zero, not unmeasured"), so it never reaches this function — and it
        // reads as `Requirement covered`, which is what it is.
        const coverage = inspectedAnalysis?.statistics.coverage ?? null;
        if (coverage === 'NEVER_IN_VIEW') return 'This target is never in view over the analysis window.';
        if (!inspectedAnalysis) return null;
        return 'Every gap in this window touches a boundary and is discarded.';
    }, [customerMaxGapMs, analysisContext, customArea, displayedAreaAnalysis, inspectedAnalysis]);

    const customerSizing = useMemo<CustomerSizing>(() => resolveCustomerSizing({
        currentMaxGapMs: customerMaxGapMs,
        requirementMs,
        isArea: analysisContext === 'AREA',
        hasAreaAnalysis: Boolean(displayedAreaAnalysis),
        hasInspectedPoint: Boolean(inspectedPoint),
        sweep,
        isSweeping,
        hasSweepError: Boolean(sweepError),
        recommendedPayloadCount: businessComparison.targetPayloadCount,
        currentPayloadCount,
        selection: scenario.selection,
        isConfigurationSettling,
    }), [
        customerMaxGapMs, requirementMs, analysisContext, displayedAreaAnalysis, inspectedPoint,
        businessComparison.targetPayloadCount, isSweeping, sweep, currentPayloadCount, sweepError,
        isConfigurationSettling, scenario.selection,
    ]);

    const undoContextKey = useMemo(() => recommendationContextKey(
        scenario, requirementMs, analysisContext, selectedPointId,
        comparisonPoints, secondaryTargetOrder, customArea,
    ), [
        scenario, requirementMs, analysisContext, selectedPointId,
        comparisonPoints, secondaryTargetOrder, customArea,
    ]);
    const canUndoRecommendation = previousConfiguration?.contextKey === undoContextKey;

    useEffect(() => {
        setPreviousConfiguration((current) => current && current.contextKey !== undoContextKey
            ? null
            : current);
    }, [undoContextKey]);

    /**
     * Apply the recommendation.
     *
     * Two things make this more than a slider move:
     *
     * 1. it adopts the topology the sweep MEASURED at that count, through the
     *    same helper the slider uses — never the count alone;
     * 2. it sets the provenance the way the existing reconciliation expects.
     *    From the sizing target, `auto` hands the topology back to
     *    `reconcileToMeasuredBest` for the rest of the session. From a secondary
     *    target, applying is a deliberate optimisation FOR that target, so it is
     *    `manual` — otherwise the reference sweep reconciles the choice away on
     *    its next landing and the button would appear to do nothing.
     */
    const handleApplyRecommendation = useCallback(() => {
        if (customerSizing.kind !== 'RECOMMENDED' && customerSizing.kind !== 'RETOPOLOGY') return;
        const count = customerSizing.payloadCount;
        setPreviousConfiguration({
            selection: scenario.selection,
            selectionSource,
            contextKey: undoContextKey,
        });
        setSelectionSource(selectedPointId === REFERENCE_POINT_ID ? 'auto' : 'manual');
        setScenario((current) => {
            const selection = selectionForPayloadCount(
                current.selection, current.reference, count, activeSweepRef.current
            );
            return selection ? { ...current, selection } : current;
        });
    }, [customerSizing, scenario.selection, selectionSource, selectedPointId, undoContextKey]);

    const handleUndoRecommendation = useCallback(() => {
        if (!previousConfiguration || previousConfiguration.contextKey !== undoContextKey) return;
        setScenario((current) => ({ ...current, selection: previousConfiguration.selection }));
        setSelectionSource(previousConfiguration.selectionSource);
        setPreviousConfiguration(null);
    }, [previousConfiguration, undoContextKey]);

    /*
     * ── PRESENTATION SAFETY (Programme 7B) ──────────────────────────────────
     * Every signal below already existed. What was missing was a place to read
     * them together, and a voice that does not alarm a room.
     */

    const activeResultError = analysisContext === 'AREA' ? areaRun.error : inspectedError;
    const activeResult = analysisContext === 'AREA' ? displayedAreaAnalysis : inspectedAnalysis;
    const activeResultIsComputing = analysisContext === 'AREA'
        ? areaRun.isRunning
        : inspectedIsComputing;
    const activeSizingError = analysisContext === 'POINTS' ? sweepError : null;
    /*
     * ── WHAT MAY STOP THE DEMONSTRATION, AND WHAT MAY NOT ───────────────────
     * Only the failure of the result currently on screen is blocking. This used
     * to read `activeResultError ?? activeSizingError ?? backgroundComparisonError`,
     * which meant a failed sweep on a SECONDARY target covered the whole screen
     * with a red alert while the analysis it interrupted was on screen, correct
     * and complete.
     *
     * The other two failures are reported where they happened and nowhere else:
     * the sizing failure inside `Recommended configuration`, which is the block
     * it would have filled, and the comparison failure inside the comparison
     * table, which already renders its own. Both remain visible in the
     * readiness check. Neither adds a banner.
     */
    const presentationFailure = activeResultError;

    /**
     * The single client-facing notice.
     *
     * Ordered by what stops the demonstration: an unanalysable scenario first,
     * a failed computation second, and the Worker fallback last — which is a
     * DEGRADED mode, not an error, and was previously shown in red as
     * "Running on the main thread — Worker unavailable".
     */
    const presentationNotice = useMemo<{
        severity: NoticeSeverity; headline: string;
        guidance: string | null; technicalDetail: string | null;
    } | null>(() => {
        if (!renderValidation.ok) {
            return {
                severity: 'BLOCKING',
                headline: 'This configuration cannot be analysed.',
                guidance: 'Adjust the constellation or the analysis target, or reset the scenario.',
                technicalDetail: renderValidation.errors.join('\n'),
            };
        }
        if (presentationFailure) {
            return {
                severity: 'BLOCKING',
                headline: 'The analysis could not be completed.',
                guidance: 'Change an input to run it again, or reset the scenario.',
                technicalDetail: presentationFailure,
            };
        }
        if (activeMainThreadFallback) {
            return {
                severity: 'DEGRADED',
                headline: 'Running in reduced performance mode.',
                guidance: 'Results are identical; the interface may pause while they are computed.',
                technicalDetail: 'This browser could not create a module Worker, so the analysis '
                    + 'engine runs on the main thread. The engine is the same pure function in '
                    + 'both paths, so no number changes — only responsiveness.',
            };
        }
        return null;
    }, [renderValidation, presentationFailure, activeMainThreadFallback]);

    /** The pre-meeting check. Reads the same signals the notice does. */
    const readinessSignals = useMemo<ReadinessSignal[]>(() => {
        return [
            {
                // Always READY: the analysed model is parametric in every mode,
                // so no demonstration depends on reaching CelesTrak (the TLE
                // fit is an optional diagnostic and blocks nothing).
                label: 'Orbital model',
                state: 'READY',
                detail: referenceMode === 'HLD'
                    ? 'HLD reference profile — no network needed.'
                    : 'Custom parameters — no network needed.',
            },
            {
                label: 'Scenario',
                state: renderValidation.ok ? 'READY' : 'BLOCKED',
                detail: renderValidation.ok
                    ? 'Valid and ready to analyse.'
                    : renderValidation.errors.join('; '),
            },
            {
                label: 'Background computation',
                state: activeMainThreadFallback ? 'DEGRADED' : 'READY',
                detail: activeMainThreadFallback
                    ? 'No Worker available — the interface pauses during analysis.'
                    : 'Workers available; the interface stays responsive.',
            },
            {
                label: 'Current result',
                state: activeResultError ? 'BLOCKED' : activeResult ? 'READY' : 'PENDING',
                detail: activeResultError
                    ? `The selected ${analysisContext === 'AREA' ? 'Area' : 'target'} analysis failed.`
                    : activeResult
                        ? 'Computed and on screen.'
                        : activeResultIsComputing ? 'Still computing.' : 'Not computed yet.',
            },
            {
                label: 'Fleet sizing',
                /*
                 * DEGRADED, not BLOCKED: a failed sweep leaves the result on
                 * screen usable, so the demonstration can still be given — with
                 * a limitation the presenter should know about before walking
                 * into the room, which is exactly what this check is for.
                 *
                 * `isConfigurationSettling` is part of PENDING because the sweep
                 * landing is not the end of the work: `reconcileToMeasuredBest`
                 * then moves the selection to the measured-best topology and the
                 * analysis recomputes. Without it this chip announced "Ready to
                 * present" while the headline gap was still the pre-reconcile
                 * figure — 5 h 49 min against a settled 3 h 26 min in the case
                 * that found this.
                 */
                state: analysisContext === 'AREA'
                    ? 'READY'
                    : sweepError
                        ? 'DEGRADED'
                        : sweep && !isSweeping && !isConfigurationSettling ? 'READY' : 'PENDING',
                detail: analysisContext === 'AREA'
                    ? 'Not applicable — Area results are evaluated cell by cell; no Area-wide payload sizing is claimed.'
                    : sweepError
                        ? 'The payload sweep failed — the result is still valid, but no payload count is proposed.'
                        : sweep && !isSweeping && !isConfigurationSettling
                            ? 'Measured — the recommendation is one click away.'
                            : 'Measuring; the recommendation is not ready yet.',
            },
        ];
    }, [
        // `calibration.fit` left this list when the Orbital model row stopped
        // depending on it: the analysed model is parametric in every mode, so
        // the fit no longer decides READY vs PENDING. A dependency the body
        // does not read is not free — it recomputes this list on every
        // measurement and, as here, fails `react-hooks/exhaustive-deps`.
        referenceMode, renderValidation, activeMainThreadFallback,
        activeResultError, activeResult, activeResultIsComputing, analysisContext,
        sweepError, sweep, isSweeping, isConfigurationSettling,
    ]);
    const runReferenceAreaAnalysis = referenceAreaRun.run;
    const runComparisonAreaAnalysis = comparisonAreaRun.run;
    const lastAutoReferenceAreaRunKeyRef = useRef<string | null>(null);
    const lastAutoComparisonAreaRunKeyRef = useRef<string | null>(null);
    const referenceAutoAreaRunKey = useMemo(() => referenceArea ? JSON.stringify([
        areaAnalysisKey(referenceArea),
        scenario.reference,
        scenario.selection,
        scenario.payload,
        scenario.window,
    ]) : null, [referenceArea, scenario.reference, scenario.selection, scenario.payload, scenario.window]);
    const comparisonAutoAreaRunKey = useMemo(() => comparisonArea ? JSON.stringify([
        areaAnalysisKey(comparisonArea),
        scenario.reference,
        scenario.selection,
        scenario.payload,
        scenario.window,
    ]) : null, [comparisonArea, scenario.reference, scenario.selection, scenario.payload, scenario.window]);

    /**
     * Each Area analysis follows its valid, stable definition automatically.
     * debounce is deliberate: drawing vertices and editing numeric fields must
     * cancel obsolete work, not enqueue a full grid run for every intermediate
     * value. Scenario settling is also awaited so the worker receives the
     * measured topology that will actually remain on screen.
     */
    useEffect(() => {
        if (
            (isDrawingArea && areaTargetRole === 'REFERENCE')
            || isConfigurationSettling
            || !referenceArea
            || !referenceAutoAreaRunKey
            || lastAutoReferenceAreaRunKeyRef.current === referenceAutoAreaRunKey
            || !validateArea(referenceArea, scenario.reference, scenario.payload).ok
        ) return;

        const timeout = window.setTimeout(() => {
            lastAutoReferenceAreaRunKeyRef.current = referenceAutoAreaRunKey;
            runReferenceAreaAnalysis(referenceArea);
        }, 450);
        return () => window.clearTimeout(timeout);
    }, [
        isDrawingArea, areaTargetRole, isConfigurationSettling, referenceArea,
        referenceAutoAreaRunKey, scenario.reference, scenario.payload,
        runReferenceAreaAnalysis,
    ]);
    useEffect(() => {
        if (
            (isDrawingArea && areaTargetRole === 'COMPARISON')
            || isConfigurationSettling
            || !comparisonArea
            || !comparisonAutoAreaRunKey
            || lastAutoComparisonAreaRunKeyRef.current === comparisonAutoAreaRunKey
            || !validateArea(comparisonArea, scenario.reference, scenario.payload).ok
        ) return;

        const timeout = window.setTimeout(() => {
            lastAutoComparisonAreaRunKeyRef.current = comparisonAutoAreaRunKey;
            runComparisonAreaAnalysis(comparisonArea);
        }, 450);
        return () => window.clearTimeout(timeout);
    }, [
        isDrawingArea, areaTargetRole, isConfigurationSettling, comparisonArea,
        comparisonAutoAreaRunKey, scenario.reference, scenario.payload,
        runComparisonAreaAnalysis,
    ]);
    const warnings = useMemo(() => analysisContext === 'AREA' ? [] : [...new Set([
        ...(inspectedAnalysis?.warnings ?? []), ...(sweep?.warnings ?? []),
    ])], [analysisContext, inspectedAnalysis, sweep]);
    const targetSetTimelineLanes = useMemo<CoverageRibbonTarget[]>(() => {
        if (!hasReferenceTarget) return [];
        const rows: CoverageRibbonTarget[] = referenceArea ? [{
            id: REFERENCE_AREA_TARGET_ID,
            kind: 'AREA',
            roleLabel: 'Primary',
            basisLabel: 'Least-covered cell',
            label: `Primary · ${referenceArea.name} · least-covered cell`,
            name: referenceArea.name,
            intervals: displayedReferenceAreaAnalysis?.worstCellIntervals ?? [],
            statistics: displayedReferenceAreaAnalysis?.worstCell?.statistics ?? null,
            statusLabel: referenceAreaRun.isRunning ? 'Computing…' : referenceArea.boundary.length < 3 ? 'Define polygon' : null,
            unbounded: Boolean(displayedReferenceAreaAnalysis?.neverInViewCount),
            requirementMs: targetRequirementsMs.REFERENCE,
            selected: analysisContext === 'AREA' && areaTargetRole === 'REFERENCE',
        }] : [{
            id: REFERENCE_POINT_ID,
            kind: 'POINT',
            roleLabel: 'Primary',
            basisLabel: 'Point',
            label: `Primary · ${scenario.target.name}`,
            name: scenario.target.name,
            intervals: analysis?.intervals ?? [],
            statistics: analysis?.statistics ?? null,
            statusLabel: isComputing && !analysis ? 'Computing…' : null,
            unbounded: analysis?.statistics.coverage === 'NEVER_IN_VIEW',
            requirementMs: targetRequirementsMs.REFERENCE,
            selected: analysisContext === 'POINTS' && selectedPointId === REFERENCE_POINT_ID,
        }];

        let pointResultIndex = 1;
        secondaryTargetOrder.forEach((id) => {
            const roleLabel = 'Secondary';
            if (id === AREA_TARGET_ID) {
                const area = displayedComparisonAreaAnalysis;
                rows.push({
                    id,
                    kind: 'AREA',
                    roleLabel,
                    basisLabel: 'Least-covered cell',
                    label: `${roleLabel} · ${comparisonArea?.name ?? 'Area'} · least-covered cell`,
                    name: comparisonArea?.name ?? 'Area',
                    intervals: area?.worstCellIntervals ?? [],
                    statistics: area?.worstCell?.statistics ?? null,
                    statusLabel: comparisonAreaRun.isRunning
                        ? 'Computing…'
                        : !comparisonArea || comparisonArea.boundary.length < 3
                            ? 'Define area'
                            : !area ? 'Preparing…' : null,
                    unbounded: Boolean(area?.neverInViewCount),
                    requirementMs: targetRequirementsMs.COMPARISON,
                    selected: analysisContext === 'AREA' && areaTargetRole === 'COMPARISON',
                });
                return;
            }

            const point = comparisonPoints.find((candidate) => candidate.id === id);
            const comparisonRow = point ? targetComparison.rows?.[pointResultIndex] ?? null : null;
            if (point) pointResultIndex += 1;
            rows.push({
                id,
                kind: 'POINT',
                roleLabel,
                basisLabel: 'Point',
                label: `${roleLabel} · ${point?.target.name ?? 'Location required'}`,
                name: point?.target.name ?? 'Location required',
                intervals: comparisonRow?.intervals ?? [],
                statistics: comparisonRow?.statistics ?? null,
                statusLabel: !point
                    ? 'Location required'
                    : targetComparison.isComputing && !comparisonRow
                        ? 'Computing…'
                        : !comparisonRow ? 'Select to analyse' : null,
                unbounded: comparisonRow?.statistics.coverage === 'NEVER_IN_VIEW',
                requirementMs: targetRequirementsMs.COMPARISON,
                selected: analysisContext === 'POINTS' && selectedPointId === id,
            });
        });
        return rows;
    }, [
        hasReferenceTarget, scenario.target.name, analysis, isComputing, analysisContext, selectedPointId,
        secondaryTargetOrder, referenceArea, comparisonArea, areaTargetRole,
        displayedReferenceAreaAnalysis, displayedComparisonAreaAnalysis,
        referenceAreaRun.isRunning, comparisonAreaRun.isRunning,
        comparisonPoints, targetComparison.rows, targetComparison.isComputing, targetRequirementsMs,
    ]);
    useEffect(() => {
        if (analysisColumnRef.current) analysisColumnRef.current.scrollTop = 0;
    }, [analysisContext, areaRun.isRunning, areaRun.analysis]);

    /** Reserve the single Area slot before opening its editor. The empty draft
     * is intentional: it gives the new row a stable identity without starting
     * any worker until a valid polygon has been defined. */
    const handleCreateAreaTarget = useCallback((role: RevisitAreaTargetRole = 'COMPARISON') => {
        if (role === 'COMPARISON' && !hasReferenceTarget) return;
        if (role === 'COMPARISON' && secondaryTargetOrder.length >= MAX_SECONDARY_TARGETS) return;
        if (role === 'REFERENCE') setHasReferenceTarget(true);
        if (role === 'COMPARISON') {
            setTargetRequirementsMs((current) => ({
                ...current,
                COMPARISON: current.REFERENCE,
            }));
        }
        (role === 'REFERENCE' ? referenceAreaRun : comparisonAreaRun).clear();
        setAreaTargetRole(role);
        setAreaTargets((current) => ({
            ...current,
            [role]: current[role] ?? {
                kind: 'AREA',
                id: crypto.randomUUID(),
                name: role === 'REFERENCE' ? 'Primary area' : 'Secondary area',
                boundary: [],
                gridSpacingDeg: recommendedAreaGridSpacing(scenario.reference, scenario.payload),
            },
        }));
        setSecondaryTargetOrder((current) => role === 'REFERENCE'
            ? current.filter((id) => id !== AREA_TARGET_ID)
            : current.includes(AREA_TARGET_ID) ? current : [...current, AREA_TARGET_ID]);
        setAnalysisContext('AREA');
    }, [
        referenceAreaRun, comparisonAreaRun, hasReferenceTarget,
        secondaryTargetOrder.length, scenario.reference, scenario.payload,
    ]);

    const handleStartAreaDrawing = useCallback(() => {
        areaBeforeDrawingRef.current = customArea;
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
        setSecondaryTargetOrder((current) => areaTargetRole === 'REFERENCE'
            ? current.filter((id) => id !== AREA_TARGET_ID)
            : current.includes(AREA_TARGET_ID)
                ? current
                : current.length < MAX_SECONDARY_TARGETS ? [...current, AREA_TARGET_ID] : current);
        setAnalysisContext('AREA');
        // Drawing happens on the globe: on a compact viewport nothing may stand
        // between the user and it.
        setCompactPanel('none');
    }, [areaRun, areaTargetRole, customArea, scenario.reference, scenario.payload, setCustomArea]);

    const handleDrawAreaVertex = useCallback((latDeg: number, lonDeg: number) => {
        setCustomArea((current) => {
            if (!current || current.boundary.length >= MAX_AREA_VERTICES) return current;
            return {
                ...current,
                boundary: [...current.boundary, { latDeg, lonDeg }],
            };
        });
    }, [setCustomArea]);

    const handleUndoAreaVertex = useCallback(() => {
        setCustomArea((current) => current ? {
            ...current,
            boundary: current.boundary.slice(0, -1),
        } : current);
    }, [setCustomArea]);

    const areaDrawingCanFinish = useMemo(
        () => Boolean(customArea && validateArea(customArea, scenario.reference, scenario.payload).ok),
        [customArea, scenario.reference, scenario.payload]
    );

    const handleFinishAreaDrawing = useCallback(() => {
        if (!areaDrawingCanFinish) return;
        areaBeforeDrawingRef.current = null;
        setIsDrawingArea(false);
    }, [areaDrawingCanFinish]);

    const handleCancelAreaDrawing = useCallback(() => {
        const previous = areaBeforeDrawingRef.current;
        areaBeforeDrawingRef.current = null;
        setCustomArea(previous);
        setIsDrawingArea(false);
        if (!previous) {
            if (areaTargetRole === 'COMPARISON') {
                setSecondaryTargetOrder((current) => current.filter((id) => id !== AREA_TARGET_ID));
            }
            setAnalysisContext('POINTS');
            setSelectedPointId(REFERENCE_POINT_ID);
        }
    }, [areaTargetRole, setCustomArea]);

    // The floating draw bar remains available after the configuration menu is
    // dismissed. Keyboard actions make longer polygons quick without requiring
    // repeated trips between the globe and header.
    useEffect(() => {
        if (!isDrawingArea) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                handleCancelAreaDrawing();
            } else if (event.key === 'Enter' && areaDrawingCanFinish) {
                event.preventDefault();
                handleFinishAreaDrawing();
            } else if (event.key === 'Backspace' || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z')) {
                event.preventDefault();
                handleUndoAreaVertex();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        isDrawingArea, areaDrawingCanFinish, handleCancelAreaDrawing,
        handleFinishAreaDrawing, handleUndoAreaVertex,
    ]);

    const handleCustomAreaChange = useCallback((area: AreaTarget | null) => {
        // Only physical inputs invalidate the heat map. The name is metadata:
        // clearing here would turn each keystroke into a full grid recompute.
        if (areaAnalysisKey(area) !== areaAnalysisKey(customArea)) areaRun.clear();
        setCustomArea(area);
        if (!area) {
            setIsDrawingArea(false);
            if (areaTargetRole === 'REFERENCE') {
                lastAutoReferenceAreaRunKeyRef.current = null;
            } else {
                lastAutoComparisonAreaRunKeyRef.current = null;
            }
            if (areaTargetRole === 'COMPARISON') {
                setSecondaryTargetOrder((current) => current.filter((id) => id !== AREA_TARGET_ID));
            }
            setAnalysisContext('POINTS');
            setSelectedPointId(REFERENCE_POINT_ID);
        }
        if (area) {
            setSecondaryTargetOrder((current) => areaTargetRole === 'REFERENCE'
                ? current.filter((id) => id !== AREA_TARGET_ID)
                : current.includes(AREA_TARGET_ID)
                    ? current
                    : current.length < MAX_SECONDARY_TARGETS ? [...current, AREA_TARGET_ID] : current);
            setAnalysisContext('AREA');
        }
    }, [areaRun, areaTargetRole, customArea, setCustomArea]);

    const handleAreaTargetRoleChange = useCallback((role: RevisitAreaTargetRole) => {
        setAreaTargetRole(role);
    }, []);

    const handleRemoveAreaTarget = useCallback((role: RevisitAreaTargetRole) => {
        (role === 'REFERENCE' ? referenceAreaRun : comparisonAreaRun).clear();
        if (role === 'REFERENCE') {
            lastAutoReferenceAreaRunKeyRef.current = null;
        } else {
            lastAutoComparisonAreaRunKeyRef.current = null;
        }
        setAreaTargets((current) => ({ ...current, [role]: null }));
        if (role === 'COMPARISON') {
            setSecondaryTargetOrder((current) => current.filter((id) => id !== AREA_TARGET_ID));
            setTargetRequirementsMs((current) => ({
                ...current,
                COMPARISON: current.REFERENCE,
            }));
        }
        setAnalysisContext('POINTS');
        setSelectedPointId(REFERENCE_POINT_ID);
    }, [referenceAreaRun, comparisonAreaRun]);

    const handleRemoveComparisonTarget = useCallback(() => {
        comparisonAreaRun.clear();
        lastAutoComparisonAreaRunKeyRef.current = null;
        setAreaTargets((current) => ({ ...current, COMPARISON: null }));
        setComparisonPoints([]);
        setPendingComparisonPointIds([]);
        setSecondaryTargetOrder([]);
        setAreaTargetRole('REFERENCE');
        setAnalysisContext(referenceArea ? 'AREA' : 'POINTS');
        setSelectedPointId(REFERENCE_POINT_ID);
        setPreviousConfiguration(null);
        setTargetRequirementsMs((current) => ({
            ...current,
            COMPARISON: current.REFERENCE,
        }));
    }, [comparisonAreaRun, referenceArea]);

    /**
     * Exchange the two complete target entities without touching the shared
     * constellation selection. React batches these writes into one commit, so
     * consumers never observe a transient empty Primary or duplicate target.
     * The requirements move with their physical targets.
     */
    const handleSwapTargetRoles = useCallback(() => {
        if (!canSwapTargetRoles || !secondaryTargetId) return;
        const swapped = swapTargetRoles({
            primaryPoint: scenario.target,
            primaryArea: referenceArea,
            secondaryArea: comparisonArea,
            comparisonPoints,
            secondaryTargetOrder,
            activeTargetRole,
            demotedPointId: crypto.randomUUID(),
        });
        if (!swapped) return;

        setPreviousConfiguration(null);
        /*
         * Each Area run is keyed to its ROLE, not to its polygon, so a swap that
         * left them in place kept the old Primary's completed grid attached to
         * the new Primary slot — and `displayedReferenceAreaAnalysis` renames a
         * mismatched analysis rather than discarding it, so the ribbon lane and
         * the globe heat map presented one polygon's coverage under the other
         * polygon's name until the debounced auto-run landed, with no
         * `Computing…` status covering the gap. Releasing both runs and their
         * auto-run keys is what every other target transition already does.
         */
        referenceAreaRun.clear();
        comparisonAreaRun.clear();
        lastAutoReferenceAreaRunKeyRef.current = null;
        lastAutoComparisonAreaRunKeyRef.current = null;
        // Swapping the sizing basis must not silently reconcile the shared
        // topology. The new Primary can still propose an explicit Apply action.
        setSelectionSource('manual');
        setTargetRequirementsMs((current) => ({
            REFERENCE: current.COMPARISON,
            COMPARISON: current.REFERENCE,
        }));
        setPendingComparisonPointIds([]);
        setScenario((current) => ({ ...current, target: swapped.primaryPoint }));
        setAreaTargets({
            REFERENCE: swapped.primaryArea,
            COMPARISON: swapped.secondaryArea,
        });
        setComparisonPoints(swapped.comparisonPoints);
        setSecondaryTargetOrder(swapped.secondaryTargetOrder);
        setAreaTargetRole(swapped.areaTargetRole);
        setAnalysisContext(swapped.analysisContext);
        setSelectedPointId(swapped.selectedPointId);
    }, [
        activeTargetRole, canSwapTargetRoles, comparisonArea, comparisonPoints,
        referenceArea, scenario.target, secondaryTargetId, secondaryTargetOrder,
        referenceAreaRun, comparisonAreaRun,
    ]);

    const handleInstrumentPresetChange = useCallback((name: FovPresetName) => {
        setScenario((current) => ({
            ...current,
            payload: fovPresets(current.reference.altitudeKm)[name],
        }));
    }, []);

    /** Exports carry the calibration when one has been run — see csvExport. */
    const handleExportAccessCsv = useCallback(() => {
        if (!inspectedAnalysis) return;
        downloadCsv(
            csvFilename('access', inspectedScenario),
            accessIntervalsCsv(inspectedAnalysis, calibration.fit)
        );
    }, [inspectedAnalysis, inspectedScenario, calibration.fit]);

    const handleExportSweepCsv = useCallback(() => {
        if (!sweep) return;
        downloadCsv(
            csvFilename('sweep', inspectedScenario),
            payloadSweepCsv(inspectedScenario, sweep, calibration.fit)
        );
    }, [sweep, inspectedScenario, calibration.fit]);

    const handleExportAreaCsv = useCallback(() => {
        if (!displayedAreaAnalysis) return;
        const { target: _dropped, ...rest } = scenario;
        downloadCsv(
            csvFilename('area', scenario).replace('area-', `area-${displayedAreaAnalysis.area.name.toLowerCase().replace(/\s+/g, '-')}-`),
            areaAnalysisCsv(rest, displayedAreaAnalysis, calibration.fit)
        );
    }, [displayedAreaAnalysis, scenario, calibration.fit]);

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
     * The Custom HLD constellation, remembered across visits to the reference.
     *
     * The two buttons are two constellations, not one constellation and a lock.
     * Without this, editing Custom to 17 × 37, glancing at the HLD and coming
     * back silently restored 12 × 48 — the edits were not stored anywhere, only
     * the scenario was, and switching to HLD overwrote it. Losing work to a
     * navigation is never acceptable, and least of all in front of an audience.
     *
     * A ref rather than state: nothing renders from it, and writing it during
     * the effect below must not schedule a second pass.
     */
    const customReferenceRef = useRef<WalkerSpec | null>(null);
    useEffect(() => {
        if (referenceMode === 'CUSTOM') customReferenceRef.current = scenario.reference;
    }, [referenceMode, scenario.reference]);

    /**
     * The one entry point for choosing a model.
     *
     * HLD is the only faithful way back to the reference profile: re-typing
     * 12 / 48 / 87.9 / 1200 does NOT restore it, because `referenceWithPatch`
     * drops the per-plane altitude ladder, the RAAN seam and the spares as soon
     * as planes or altitude change, and no field can put them back.
     *
     * CUSTOM restores what Custom last held, or — the first time — leaves the
     * current numbers in place, so it opens as a copy of whatever was on screen.
     * Overwriting Custom with the HLD values is a separate, deliberate action
     * (`handleCopyHldIntoCustom`), never a side effect of switching.
     */
    const handleReferenceModeChange = useCallback((next: ReferenceMode) => {
        setReferenceRestored(false);
        if (next === 'CUSTOM') {
            if (customReferenceRef.current) applyReference(customReferenceRef.current);
            setReferenceMode('CUSTOM');
            return;
        }
        applyReference(DEFAULT_PROFILE.spec);
        setReferenceMode('HLD');
    }, [applyReference]);

    /**
     * Copy the HLD reference into Custom HLD, on purpose.
     *
     * This is the only path that discards Custom's own values, and it carries
     * the complete profile — ladder, seam and spares included — so the copy is
     * the reference exactly, not a re-typed lookalike.
     */
    const handleCopyHldIntoCustom = useCallback(() => {
        applyReference(DEFAULT_PROFILE.spec);
        customReferenceRef.current = DEFAULT_PROFILE.spec;
        setReferenceMode('CUSTOM');
        setReferenceRestored(false);
    }, [applyReference]);

    /**
     * The live-TLE fit, as a diagnostic (D2, 2026-08-29).
     *
     * It deliberately does NOT call `applyReference`: the fitted shell answers
     * "has the real fleet drifted from this Walker geometry", which is a
     * measurement ABOUT the reference, not a rival reference. Adopting it used
     * to put a shell with no ladder, no seam and no spares on the same footing
     * as the HLD profile, and nothing on screen said the two were different
     * kinds of object.
     */
    const handleCompareToTleSet = useCallback(() => {
        void calibration.calibrate();
    }, [calibration]);


    const explanation = useMemo(
        () => explainRevisit(inspectedScenario, inspectedAnalysis?.statistics ?? null, sweep),
        [inspectedScenario, inspectedAnalysis, sweep]
    );

    /*
     * The window belongs to the scenario, so editing it from the ribbon is the
     * same state change it always was — only the surface moved.
     */
    const handleAnalysisWindowChange = useCallback((next: RevisitScenario['window']) => {
        setScenario((current) => ({ ...current, window: next }));
    }, []);

    const getTimeMs = useCallback(() => clock.getTimeMs(), [clock]);
    const handleSeek = useCallback((ms: number) => {
        const previousSpeed = clock.getSnapshot().speed;
        clock.setDateTime(ms);
        if (previousSpeed !== 1) clock.setSpeed(previousSpeed);
    }, [clock]);

    const handleResetScenario = useCallback(() => {
        // A reset is a fresh start, so Custom starts empty too.
        customReferenceRef.current = null;
        const resetScenario = defaultScenario(epochRef.current);
        setScenario(resetScenario);
        setReferenceMode(referenceModeFor(resetScenario.reference));
        setReferenceRestored(false);
        setOptions(defaultDisplayOptions());
        setTargetRequirementsMs({
            REFERENCE: DEFAULT_REQUIREMENT_MS,
            COMPARISON: DEFAULT_REQUIREMENT_MS,
        });
        setSelectionSource('auto');
        setPreviousConfiguration(null);
        setOpportunity('');
        setExportError(null);
        setHasReferenceTarget(false);
        setAreaTargets({ REFERENCE: null, COMPARISON: null });
        setAreaTargetRole('REFERENCE');
        setIsDrawingArea(false);
        setAnalysisContext('POINTS');
        setComparisonPoints([]);
        setPendingComparisonPointIds([]);
        setSecondaryTargetOrder([]);
        setSelectedPointId(REFERENCE_POINT_ID);
        setCompactPanel('none');
        setAnalysisSheetSize('half');
        setResetRevision((revision) => revision + 1);
        lastAutoReferenceAreaRunKeyRef.current = null;
        lastAutoComparisonAreaRunKeyRef.current = null;
        referenceAreaRun.clear();
        comparisonAreaRun.clear();
        clock.setDateTime(resetScenario.window.startMs);
    }, [referenceAreaRun, comparisonAreaRun, clock]);

    const currentSnapshot = useMemo(() => ({
        schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
        scenario,
        options,
        requirementMs: targetRequirementsMs.REFERENCE,
        comparisonRequirementMs: targetRequirementsMs.COMPARISON,
        selectionSource,
        hasReferenceTarget,
        customArea,
        referenceArea,
        comparisonArea,
        areaTargetRole,
        analysisContext,
        comparisonPoints,
        secondaryTargetOrder,
        selectedPointId: persistedSelectedPointId,
        opportunity,
    }), [
        scenario, options, targetRequirementsMs, selectionSource, hasReferenceTarget, customArea, referenceArea, comparisonArea, areaTargetRole,
        analysisContext, comparisonPoints, secondaryTargetOrder, persistedSelectedPointId,
        opportunity,
    ]);

    const handleLoadSavedScenario = useCallback((saved: SavedRevisitScenario) => {
        const snapshot = saved.snapshot;
        setScenario(snapshot.scenario);
        setReferenceMode(referenceModeFor(snapshot.scenario.reference));
        setReferenceRestored(referenceModeFor(snapshot.scenario.reference) === 'CUSTOM');
        setOptions({
            ...snapshot.options,
            showLabels: snapshot.options.showLabels ?? false,
            showProjectionCones: snapshot.options.showProjectionCones ?? true,
        });
        setTargetRequirementsMs({
            REFERENCE: snapshot.requirementMs,
            COMPARISON: snapshot.comparisonRequirementMs ?? snapshot.requirementMs,
        });
        setSelectionSource(snapshot.selectionSource);
        const loadedHasReferenceTarget = snapshot.hasReferenceTarget ?? true;
        setHasReferenceTarget(loadedHasReferenceTarget);
        setPreviousConfiguration(null);
        setOpportunity(snapshot.opportunity ?? '');
        setExportError(null);
        const loadedAreaRole = snapshot.areaTargetRole ?? 'COMPARISON';
        setAreaTargetRole(loadedAreaRole);
        setAreaTargets({
            REFERENCE: loadedHasReferenceTarget
                ? snapshot.referenceArea
                    ?? (loadedAreaRole === 'REFERENCE' ? snapshot.customArea ?? null : null)
                : null,
            COMPARISON: loadedHasReferenceTarget
                ? snapshot.comparisonArea
                    ?? (loadedAreaRole === 'COMPARISON' ? snapshot.customArea ?? null : null)
                : null,
        });
        setIsDrawingArea(false);
        setAnalysisContext(snapshot.analysisContext ?? 'POINTS');
        setComparisonPoints(loadedHasReferenceTarget ? snapshot.comparisonPoints ?? [] : []);
        setPendingComparisonPointIds([]);
        setSecondaryTargetOrder(loadedHasReferenceTarget ? snapshot.secondaryTargetOrder ?? [
            ...(snapshot.comparisonPoints ?? []).map((point) => point.id),
            ...((snapshot.comparisonArea
                ?? ((snapshot.areaTargetRole ?? 'COMPARISON') === 'COMPARISON' ? snapshot.customArea : null))
                ? [AREA_TARGET_ID]
                : []),
        ].slice(0, MAX_SECONDARY_TARGETS) : []);
        setSelectedPointId(snapshot.selectedPointId ?? REFERENCE_POINT_ID);
        // Loading a scenario from the workspace closes it: the point of loading
        // is to look at the globe, not at the drawer that loaded it.
        setCompactPanel('none');
        lastAutoReferenceAreaRunKeyRef.current = null;
        lastAutoComparisonAreaRunKeyRef.current = null;
        referenceAreaRun.clear();
        comparisonAreaRun.clear();
        clock.setDateTime(snapshot.scenario.window.startMs);
    }, [referenceAreaRun, comparisonAreaRun, clock]);

    /*
     * The requirement each comparison row is judged against, in row order.
     * `targetComparison.rows[0]` is the Primary target and every later row is a
     * Secondary one, so the two thresholds map straight onto the index. Without
     * this the exported sheet verdicted every row against whichever target
     * happened to be selected, and printed `Meets` over a Primary the ribbon
     * was reporting as MISSES.
     */
    const comparisonRowRequirementsMs = useMemo(
        () => (targetComparison.rows ?? []).map((_, index) => index === 0
            ? targetRequirementsMs.REFERENCE
            : targetRequirementsMs.COMPARISON),
        [targetComparison.rows, targetRequirementsMs],
    );

    const handleExportResultSheet = useCallback(() => {
        setExportError(null);
        const model = analysisContext === 'AREA'
            ? displayedAreaAnalysis
                ? buildAreaResultSheet(
                    scenario, displayedAreaAnalysis, requirementMs, new Date(),
                    { opportunity, assumedSwathKm, referenceMode },
                )
                : null
            : inspectedAnalysis
                ? buildRevisitResultSheet(
                    inspectedScenario, inspectedAnalysis,
                    requirementMs, targetComparison.rows ?? [], new Date(),
                    {
                        opportunity,
                        assumedSwathKm,
                        referenceMode,
                        // The same measured figure the card offers to apply, so
                        // the document and the screen cannot disagree.
                        recommendedPayloadCount: businessComparison.targetPayloadCount,
                        // And the same split. Without it the document cannot
                        // tell a recommendation that costs no payloads from no
                        // recommendation at all, and prints the impossibility
                        // sentence over a requirement the sweep measured as met.
                        recommendedSplit: customerSizing.kind === 'RETOPOLOGY'
                            ? customerSizing.split
                            : null,
                        recommendedMaxGapMs: customerSizing.kind === 'RETOPOLOGY'
                            ? customerSizing.maxGapMs
                            : null,
                        // And the same distinction the card makes between "no
                        // answer yet" and "no answer exists" — exporting mid
                        // sweep must not print an impossibility as fact.
                        sizingStatus: sweepError
                            ? 'FAILED'
                            : isSweeping || !sweep ? 'PENDING' : 'MEASURED',
                        comparisonRequirementsMs: comparisonRowRequirementsMs,
                    },
                )
                : null;
        if (!model) return;
        void downloadRevisitResultSheet(model).catch((cause) => {
            setExportError(cause instanceof Error ? cause.message : String(cause));
        });
    }, [
        analysisContext, displayedAreaAnalysis, inspectedAnalysis,
        inspectedScenario, scenario, requirementMs, targetComparison.rows,
        comparisonRowRequirementsMs,
        opportunity, assumedSwathKm, businessComparison.targetPayloadCount, referenceMode,
        sweepError, isSweeping, sweep, customerSizing,
    ]);

    const toggle = useCallback((key: keyof DisplayOptions) => {
        setOptions((current) => ({ ...current, [key]: !current[key] }));
    }, []);

    return (
        <div className="revisit-shell relative isolate flex h-dvh w-screen flex-col overflow-hidden bg-[#05070D] text-slate-100 transition-colors light:bg-slate-100 light:text-slate-950">
            <GlobalAppHeader className="revisit-global-header">
                <nav aria-label="REVISIT navigation and scenarios"
                    /* `items-stretch`, so the return control is as tall as the
                       rail beside it instead of a 44 px square floating at the
                       top of a header three times that height. */
                    className="revisit-context-rail flex min-w-0 items-stretch gap-2 px-2 py-2 sm:px-3 lg:px-4">
                    {/* A bare chevron named the direction but never the
                        destination, and the rail cannot spare the width for a
                        word beside it. The height it already occupies was free:
                        the origin's short name sits under the arrow inside the
                        same 44 px square. `ENG` / `COMM` are substrings of the
                        accessible name, so speech input can still act on what is
                        written (WCAG 2.5.3). */}
                    {onExit && (
                        <button type="button" onClick={onExit}
                            aria-label={`Back to ${returnMode === 'commercial' ? 'Commercial' : 'Engineering'}`}
                            title={`Back to ${returnMode === 'commercial' ? 'Commercial' : 'Engineering'}`}
                            /*
                             * Reads as a button, not as a chevron to hunt for.
                             * Same square, same place — only the chrome changes.
                             *
                             * It deliberately does NOT use `REVISIT_PANEL`: that
                             * constant carries `border-slate-700/70`, and
                             * `.capacity-header [class*='border-slate-']`
                             * flattens any such border in this header to 16 %
                             * slate with `!important` — which beats an inline
                             * colour. Without a `border-slate-*` class in the
                             * list the rule no longer matches and the inline
                             * colour stands. Measured: 0.16 alpha before,
                             * #6b7c99 after.
                             *
                             * It stretches to the rail, whatever the rail's
                             * height happens to be — the header grows with a
                             * spread note, with the target list, and with the
                             * expanded setup block on a phone. A cap was tried
                             * and removed: a control that stops short of the
                             * surface it belongs to reads as unrelated to it,
                             * which is how it came to be hard to find.
                             */
                            style={{ borderColor: '#6b7c99' }}
                            className="revisit-origin-return flex min-h-11 w-11 shrink-0 self-stretch flex-col items-center justify-center gap-0.5 rounded-xl border bg-slate-700/70 px-0.5 font-black uppercase text-slate-100 shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-600/80 hover:text-white">
                            <span aria-hidden="true" className="text-[13px] leading-none">‹</span>
                            <span aria-hidden="true" className="text-[9px] leading-none tracking-[0.02em]">
                                {returnMode === 'commercial' ? 'COMM' : 'ENG'}
                            </span>
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <RevisitHeader
                            scenario={scenario}
                            payloadCounts={payloadCounts}
                            currentPayloadCount={currentPayloadCount}
                            onPayloadCountChange={handlePayloadCountChange}
                            targetNames={targetOptions}
                            onTargetChange={handleTargetChange}
                            onTargetCoordinatesChange={handlePickTarget}
                            onInstrumentPresetChange={handleInstrumentPresetChange}
                            requirementMs={requirementMs}
                            requirementChoicesHours={REQUIREMENT_CHOICES_H}
                            onRequirementChange={setRequirementMs}
                            activeTargetRole={activeTargetRole}
                            spreadNote={spreadNote}
                            setupOpen={compactPanel === 'setup'}
                            onToggleSetup={() => togglePanel('setup')}
                            analysisContext={analysisContext}
                            hasReferenceTarget={hasReferenceTarget}
                            onAnalysisContextChange={(context) => {
                                setAnalysisContext(context);
                            }}
                            comparisonPoints={comparisonPoints}
                            pendingComparisonPointIds={pendingComparisonPointIds}
                            secondaryTargetOrder={secondaryTargetOrder}
                            selectedPointId={selectedPointId}
                            onSelectedPointChange={handleSelectedPointChange}
                            onSecondaryPointChange={handleSecondaryPointChange}
                            onSecondaryPointTargetChange={handleSecondaryPointTargetChange}
                            onRemoveSecondaryPoint={handleRemoveSecondaryPoint}
                            onAddComparisonPoint={handleCreateComparisonPoint}
                            onAddReferencePoint={handleCreateReferencePoint}
                            onRemoveReferenceTarget={handleRemoveReferenceTarget}
                            onAddAreaTarget={handleCreateAreaTarget}
                            areaTargetRole={areaTargetRole}
                            referenceArea={referenceArea}
                            comparisonArea={comparisonArea}
                            onAreaTargetRoleChange={handleAreaTargetRoleChange}
                            onRemoveAreaTarget={handleRemoveAreaTarget}
                            canSwapTargetRoles={canSwapTargetRoles}
                            onSwapTargetRoles={handleSwapTargetRoles}
                            customArea={customArea ?? displayedAreaAnalysis?.area ?? null}
                            referenceAreaCellCount={displayedReferenceAreaAnalysis?.cells.length ?? null}
                            comparisonAreaCellCount={displayedComparisonAreaAnalysis?.cells.length ?? null}
                            areaAnalysis={displayedAreaAnalysis}
                            areaIsRunning={areaRun.isRunning}
                            areaError={areaRun.error}
                            areaProgress={areaRun.progress}
                            areaRequirementMs={requirementMs}
                            onClearArea={areaRun.clear}
                            onCancelArea={areaRun.clear}
                            isDrawingArea={isDrawingArea}
                            onCustomAreaChange={handleCustomAreaChange}
                            onStartAreaDrawing={handleStartAreaDrawing}
                            onFinishAreaDrawing={handleFinishAreaDrawing}
                            onUndoAreaVertex={handleUndoAreaVertex}
                            isAreaScenarioSettling={isConfigurationSettling}
                            onAdvancedScenarioChange={handleAdvancedChange}
                            model={{
                                profile: referenceProfile,
                                mode: referenceMode,
                                isRestored: referenceRestored,
                                onModeChange: handleReferenceModeChange,
                                onCompareToTleSet: handleCompareToTleSet,
                                onCopyHldIntoCustom: handleCopyHldIntoCustom,
                                fit: calibration.fit,
                                provenance: calibration.provenance,
                                isRunning: calibration.isRunning,
                                error: calibration.error,
                            }}
                        />
                    </div>
                </nav>
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
                    referenceAreaAnalysis={displayedReferenceAreaAnalysis}
                    comparisonAreaAnalysis={displayedComparisonAreaAnalysis}
                    referenceArea={referenceArea}
                    comparisonArea={comparisonArea}
                    isDrawingArea={isDrawingArea}
                    analysisContext={analysisContext}
                    hasReferenceTarget={hasReferenceTarget}
                    areaTargetRole={areaTargetRole}
                    referenceIsArea={Boolean(referenceArea)}
                    comparisonPoints={orderedComparisonPoints}
                    secondaryTargetOrder={secondaryTargetOrder}
                    selectedPointId={selectedPointId}
                    areaRequirementsMs={targetRequirementsMs}
                    autoRotate={options.autoRotate && !isDrawingArea}
                    onPickTarget={handlePickTarget}
                    onDrawAreaVertex={handleDrawAreaVertex}
                    onAddComparisonPoint={handleAddComparisonPoint}
                    onClearTargets={handleRemoveReferenceTarget}
                    onRemoveComparisonTarget={handleRemoveComparisonTarget}
                />
              </div>

              {isDrawingArea && (
                <div
                    role="toolbar"
                    aria-label="Polygon drawing controls"
                    className={`pointer-events-auto absolute left-1/2 top-2 z-[85] flex w-[min(38rem,calc(100vw-1rem))] -translate-x-1/2 flex-wrap items-center gap-2 border-sky-400/50 bg-slate-950/95 px-3 py-2 shadow-2xl ${REVISIT_PANEL}`}
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-400/20 px-1.5 text-[11px] font-black text-sky-200">
                                {customArea?.boundary.length ?? 0}
                            </span>
                            <span className="text-[12px] font-black uppercase tracking-[0.08em] text-sky-100">
                                Draw {areaTargetRole === 'REFERENCE' ? 'Primary' : 'Secondary'} polygon
                            </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                            Click boundary corners in order · the last edge closes automatically
                            <span className="hidden sm:inline"> · Enter finish · Esc cancel</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleUndoAreaVertex}
                        disabled={!customArea?.boundary.length}
                        title="Undo last vertex (Backspace or ⌘Z)"
                        className="min-h-10 rounded border border-slate-700 px-3 text-[11px] font-bold text-slate-200 disabled:opacity-30"
                    >
                        Undo
                    </button>
                    <button
                        type="button"
                        onClick={handleCancelAreaDrawing}
                        className="min-h-10 rounded px-3 text-[11px] font-bold text-slate-400 hover:text-rose-200"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleFinishAreaDrawing}
                        disabled={!areaDrawingCanFinish}
                        title={areaDrawingCanFinish ? 'Finish polygon (Enter)' : 'Add at least three valid vertices'}
                        className="min-h-10 rounded bg-sky-400/20 px-3 text-[11px] font-black text-sky-100 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        Finish polygon
                    </button>
                </div>
              )}

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
                    {/* One group, so `justify-between` pushes only the
                        readiness status to the foot of the rail. */}
                    <div className="flex flex-row items-start gap-2 md:flex-col md:gap-0">
                        <StageControls
                            toggles={TOGGLES}
                            toggleState={options}
                            onToggle={toggle}
                        />
                        {/* Scenario management sits under the display controls, on
                            the stage, and opens as a popup anchored to this button
                            rather than as a header action detached from it. The
                            stage rail is where the presenter's hand already is. */}
                        <button
                            ref={workspaceLauncherRef}
                            type="button"
                            onClick={() => togglePanel('workspace')}
                            aria-expanded={compactPanel === 'workspace'}
                            aria-controls="revisit-scenario-workspace-drawer"
                            className={`${REVISIT_PANEL} pointer-events-auto flex min-h-11 w-auto max-w-[calc(100vw-1rem)] items-center gap-2 px-2.5 text-left text-[12px] font-black uppercase tracking-[0.12em] md:mt-2 md:min-h-9 md:w-[min(15rem,calc(100vw-1rem))] ${compactPanel === 'workspace'
                                ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                                : 'border-slate-700 text-slate-400 hover:border-sky-400/40 hover:text-sky-200'}`}
                        >
                            {/* The visible text IS the accessible name: a
                                separate `aria-label` would leave speech input
                                unable to act on the words on screen. */}
                            <span aria-hidden="true" className="hidden text-base leading-none md:inline">▤</span>
                            {/* Below `md` the launcher sits beside DISPLAY on one
                                rail row, so it carries a single short label and
                                drops the glyph. `hidden` (display:none) keeps the
                                unused variant out of the accessible name. */}
                            <span className="truncate md:hidden">Workspace</span>
                            <span className="hidden truncate md:inline">Scenario workspace</span>
                        </button>
                    </div>
                    {/* A status, beside the toolbar rather than inside it. */}
                    <PresentationReadiness signals={readinessSignals} />

                  </div>

                    {/* One neutral notice instead of a red technical banner
                        across the top of the globe (Programme 7B). */}
                    {presentationNotice && (
                        <div className="pointer-events-auto absolute left-12 right-0 top-0 z-30 self-start md:static md:left-0">
                            <PresentationNotice {...presentationNotice} />
                        </div>
                    )}

                    {warnings.length > 0 && (
                        <div className={`pointer-events-none absolute left-12 right-0 top-14 z-30 max-w-sm md:pointer-events-auto ${REVISIT_PANEL} self-start border-amber-400/40 md:left-0 md:top-28 px-3 py-1.5 text-[12px] leading-4 text-amber-200 md:static`}>
                            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                    )}

                    {/* The analysis column: headline, then the business case.
                        Scrolls independently so it can never push the ribbon out. */}
                    <section
                        ref={analysisColumnRef}
                        id="revisit-analysis-sheet"
                        data-revisit-sheet-state={compactPanel === 'analysis' ? analysisSheetSize : 'closed'}
                        className={`pointer-events-auto absolute inset-x-0 bottom-0 z-10 w-full shrink-0 flex-col gap-2 overflow-y-auto rounded-t-2xl md:static md:flex md:max-h-none md:w-[400px] md:rounded-none [&>*]:shrink-0 ${compactPanel !== 'analysis'
                            ? 'hidden'
                            : analysisSheetSize === 'full'
                                ? 'flex max-h-[min(82dvh,100%)]'
                                : 'flex max-h-[min(48dvh,100%)]'}`}
                        data-revisit-analysis-panel
                        aria-label="REVISIT analysis"
                    >
                        {/* Sheet chrome: size and dismiss. Mobile only. */}
                        <div className={`${REVISIT_PANEL} sticky top-0 z-20 flex items-center px-1 md:hidden`}>
                            <button
                                type="button"
                                onClick={() => setAnalysisSheetSize(
                                    (size) => size === 'full' ? 'half' : 'full'
                                )}
                                aria-label={analysisSheetSize === 'full' ? 'Shrink analysis sheet' : 'Expand analysis sheet'}
                                className="flex h-8 flex-1 items-center justify-center"
                            >
                                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-slate-600" />
                            </button>
                            <button
                                type="button"
                                onClick={() => showPanel('none')}
                                aria-label="Close analysis sheet and show the globe"
                                className="h-8 w-9 text-base font-black text-slate-400"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        <div
                            aria-label="Active result context"
                            data-revisit-target-role={activeTargetRole?.toLowerCase() ?? 'none'}
                            className={`${REVISIT_PANEL} ${activeTargetRole === 'REFERENCE'
                                ? 'revisit-target-reference'
                                : activeTargetRole === 'COMPARISON'
                                    ? 'revisit-target-comparison'
                                    : ''} sticky top-8 z-[19] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-l-4 px-3 py-2 md:top-0`}
                        >
                            <div className="min-w-0">
                                <div className={`truncate text-[11px] font-black uppercase tracking-[0.12em] ${activeTargetRole === 'REFERENCE'
                                    ? 'text-amber-300'
                                    : activeTargetRole === 'COMPARISON'
                                        ? 'text-sky-700 dark:text-sky-300'
                                        : 'text-slate-300'}`}>
                                    {!hasReferenceTarget
                                        ? 'No target selected'
                                        : analysisContext === 'AREA'
                                        ? `Area result · ${displayedAreaAnalysis?.area.name ?? customArea?.name ?? 'No area selected'}`
                                        : `Point result · ${inspectedPointRole} · ${inspectedPoint?.name ?? 'Location required'}`}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2" aria-live="polite">
                            {/* One answer card owns the headline and its
                                operational proof. The old standalone KPI/Area
                                cards repeated the same maximum gap and verdict. */}
                            {(analysisContext === 'AREA' || inspectedPoint) && (
                                <CustomerResultCard
                                    targetRole={activeTargetRole ?? 'REFERENCE'}
                                    question={customerQuestion}
                                    comparisonNote={customerComparisonNote}
                                    currentPayloadCount={currentPayloadCount}
                                    fleetSize={scenario.reference.planes * scenario.reference.satsPerPlane}
                                    currentMaxGapMs={customerMaxGapMs}
                                    currentIsComputing={customerIsComputing}
                                    currentUnavailableReason={customerUnavailableReason}
                                    currentMetricLabel={analysisContext === 'AREA'
                                        ? 'Maximum revisit gap · least-covered cell'
                                        : 'Maximum revisit gap'}
                                    requirementMs={requirementMs}
                                    sizing={customerSizing}
                                    applyNote={selectedPointId === REFERENCE_POINT_ID
                                        ? null
                                        : 'Optimises the shared topology for the secondary target, so the primary target stops driving it.'}
                                    onApply={handleApplyRecommendation}
                                    onUndo={canUndoRecommendation ? handleUndoRecommendation : undefined}
                                    onRetrySizing={activeSizingError ? retrySweep : undefined}
                                    supportingMetrics={analysisContext === 'AREA' ? (
                                        <AreaResultSummary
                                            analysis={displayedAreaAnalysis}
                                            draftArea={customArea}
                                            isRunning={areaRun.isRunning}
                                            progress={areaRun.progress}
                                            error={areaRun.error}
                                            requirementMs={requirementMs}
                                            embedded
                                        />
                                    ) : (
                                        <RevisitKpiPanel
                                            statistics={inspectedAnalysis?.statistics ?? null}
                                            windowHours={scenario.window.durationHours}
                                            requirementMs={requirementMs}
                                            isComputing={inspectedIsComputing}
                                            comparisonIsComputing={isSweeping}
                                            comparison={businessComparison}
                                            embedded
                                        />
                                    )}
                                    recommendedConfigurationDetail={analysisContext === 'POINTS' && inspectedPoint ? (
                                        <ValueCurve
                                            key={resetRevision}
                                            targetRole={activeTargetRole ?? 'REFERENCE'}
                                            sweep={sweep}
                                            isComputing={isSweeping}
                                            requirementMs={requirementMs}
                                            currentPayloadCount={currentPayloadCount}
                                            currentMaxGapMs={inspectedAnalysis?.statistics.maxGapMs ?? null}
                                            currentIsMeasuredBest={status.isBest}
                                            alternativeTopologyLabel={selectedPointId === REFERENCE_POINT_ID
                                                ? undefined
                                                : 'Current shared topology'}
                                            targetName={inspectedPoint.name}
                                            onSelectPayloadCount={handlePayloadCountChange}
                                            embedded
                                        />
                                    ) : null}
                                />
                            )}
                            {analysisContext === 'AREA' && (
                                <div className={`revisit-result-${(activeTargetRole ?? 'REFERENCE').toLowerCase()}`}>
                                    <AreaDistributionPanel analysis={displayedAreaAnalysis} requirementMs={requirementMs} />
                                </div>
                            )}
                            {analysisContext === 'POINTS' && inspectedPoint && (
                                <div className={`revisit-result-${(activeTargetRole ?? 'REFERENCE').toLowerCase()}`}>
                                    <WhyThisRevisit explanation={explanation} />
                                </div>
                            )}
                            {analysisContext === 'POINTS' && !inspectedPoint && (
                                <div className={`${REVISIT_PANEL} px-4 py-4`}>
                                    <div className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-300">
                                        {hasReferenceTarget ? 'Secondary target location required' : 'No analysis target'}
                                    </div>
                                    <p className="mt-1 text-[12px] leading-4 text-slate-400">
                                        {hasReferenceTarget
                                            ? 'Choose a site, enter coordinates, or place this point on the globe. No Primary-target result is substituted while this row is incomplete.'
                                            : 'Add a Primary point or polygon in the header, or click the globe to create a Primary point.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {compactPanel !== 'analysis' && <div className="pointer-events-auto md:hidden">
                    <MobileResultStrip
                        analysisContext={analysisContext}
                        statistics={inspectedAnalysis?.statistics ?? null}
                        areaAnalysis={displayedAreaAnalysis}
                        areaIsDefined={Boolean(customArea && customArea.boundary.length >= 3)}
                        requirementMs={requirementMs}
                        isComputing={analysisContext === 'AREA' ? areaRun.isRunning : inspectedIsComputing}
                        pointIsPending={hasReferenceTarget && analysisContext === 'POINTS' && !inspectedPoint}
                        noTarget={!hasReferenceTarget}
                        pointResultLabel={hasReferenceTarget && analysisContext === 'POINTS' ? inspectedPointRole : undefined}
                        expanded={false}
                        onToggle={() => togglePanel('analysis')}
                    />
                </div>}

                <div className="pointer-events-auto">
                    <ClockedCoverageRibbon
                        intervals={analysis?.intervals ?? []}
                        statistics={analysis?.statistics ?? null}
                        windowStartMs={scenario.window.startMs}
                        windowHours={scenario.window.durationHours}
                        analysisWindow={scenario.window}
                        onAnalysisWindowChange={handleAnalysisWindowChange}
                        getTimeMs={getTimeMs}
                        onSeek={handleSeek}
                        analysisContext={analysisContext}
                        referenceTargetName={scenario.target.name}
                        areaName={displayedAreaAnalysis?.area.name ?? customArea?.name ?? null}
                        targetLanes={targetSetTimelineLanes}
                        areaAnalysis={displayedAreaAnalysis}
                        requirementMs={requirementMs}
                        comparisonIsComputing={targetComparison.isComputing}
                        comparisonError={targetComparison.error}
                        onSelectPoint={handleSelectedPointChange}
                        onSelectTarget={handleSelectedTargetChange}
                    />
                </div>
              </div>
            </div>
            {compactPanel === 'workspace' && (
                <ScenarioWorkspaceDrawer
                    onClose={() => showPanel('none')}
                    anchorRef={workspaceLauncherRef}
                >
                    <ScenarioWorkspace
                        snapshot={currentSnapshot}
                        onLoad={handleLoadSavedScenario}
                        opportunity={opportunity}
                        onOpportunityChange={setOpportunity}
                        onResetScenario={handleResetScenario}
                        onExportResult={handleExportResultSheet}
                        canExportResult={analysisContext === 'AREA'
                            ? Boolean(displayedAreaAnalysis) && !areaRun.isRunning
                            : Boolean(inspectedAnalysis) && !inspectedIsComputing}
                        analysisContext={analysisContext}
                        onExportAccessCsv={handleExportAccessCsv}
                        canExportAccessCsv={Boolean(inspectedAnalysis)}
                        onExportSweepCsv={handleExportSweepCsv}
                        canExportSweepCsv={Boolean(sweep)}
                        onExportAreaCsv={handleExportAreaCsv}
                        canExportAreaCsv={Boolean(displayedAreaAnalysis)}
                    />
                    {exportError && (
                        <p role="alert" className="mt-2 rounded border border-red-400/30 bg-red-950/80 px-2 py-1 text-[12px] text-red-200">
                            {exportError}
                        </p>
                    )}
                </ScenarioWorkspaceDrawer>
            )}
        </div>
    );
};

export default RevisitApp;
