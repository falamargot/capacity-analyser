/**
 * RevisitHeader — the triad (UX §4.1).
 *
 * The charter's second principle is "Site A ↔ Site B is the story". REVISIT has
 * no route, so its triad is:
 *
 *     CONSTELLATION  →  HOSTED PAYLOADS  →  TARGET
 *
 * Same visual syntax as the Site A / Site B blocks — separated panels, tiny
 * uppercase label above a larger value — with the middle panel amber-bordered
 * because it is the one the user actually manipulates.
 *
 * THE PAYLOAD SLIDER LIVES HERE, NOT IN THE SIDEBAR. It is scenario
 * configuration, and the charter is explicit about who owns that. Keeping it in
 * the header also stops it growing into a settings panel that competes with the
 * globe.
 *
 * The slider walks a pre-validated ladder of (x, y) configurations — never raw
 * x/y/z entry. Where two configurations give the same payload count the better
 * one is chosen automatically, which is why the slider index addresses payload
 * *counts* rather than ladder rows.
 */

import React, {
    useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { RevisitScenario } from '../domain/types';
import {
    FOV_PRESET_SWATH_KM, fovPresetNameFor, fovPresets, swathKmForFov, type FovPresetName,
} from '../domain/presets';
import { useLocationSearch, type LocationResult } from '../../../hooks/useLocationSearch';
import InlineLocationSearchInput from '../../../components/commercial/InlineLocationSearchInput';
import InlineSearchResultsPopover from '../../../components/commercial/InlineSearchResultsPopover';
import {
    modelBadge, REVISIT_LABEL, REVISIT_MENU_SURFACE, REVISIT_PANEL,
    displayAltitudeKm, displayInclinationDeg,
} from './revisitTheme';
import { isValidLatDeg, isValidLonDeg, type AreaTarget } from '../domain/areaTarget';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { AreaPanel } from './AreaPanel';
import { AdvancedDrawer, type ConstellationModelProps } from './AdvancedDrawer';
import { formatGap } from '../analysis/gapStatistics';

import {
    AREA_TARGET_ID, MAX_SECONDARY_TARGETS, REFERENCE_POINT_ID,
    type RevisitAnalysisContext, type RevisitAreaTargetRole, type RevisitComparisonPoint,
} from '../domain/analysisTargets';

/** Shared by every dismissable popover in this header: close when a pointer
 * goes down outside `ref`'s subtree, while `enabled`. */
function useClickOutside(
    ref: React.RefObject<HTMLElement | null>,
    onOutside: () => void,
    enabled: boolean,
    /**
     * Controls that must not dismiss this panel although they sit outside it.
     *
     * The constellation panel uses it for the payload slider: dragging the
     * slider is an edit of the very configuration the panel is displaying, and
     * closing the panel mid-drag threw away the reader's place in it — the
     * counts it shows (`12 payloads — 2 planes × 6`) are exactly what the drag
     * is changing.
     */
    keepOpenSelector?: string,
): void {
    useEffect(() => {
        if (!enabled) return;
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (ref.current?.contains(target)) return;
            if (!(target instanceof Element)) {
                onOutside();
                return;
            }
            /*
             * A panel may own a flyout that is portalled out of its subtree —
             * the constellation panel's TLE characterisation is one. It is
             * visually part of the panel and must not dismiss it, so it opts
             * out by marking its own root.
             */
            if (target.closest('[data-revisit-panel-flyout]')) return;
            if (keepOpenSelector && target.closest(keepOpenSelector)) return;
            onOutside();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [ref, onOutside, enabled, keepOpenSelector]);
}

interface RevisitHeaderProps {
    scenario: RevisitScenario;
    /** Distinct payload counts, ascending — the slider's stops. */
    payloadCounts: number[];
    currentPayloadCount: number;
    onPayloadCountChange: (count: number) => void;
    targetNames: string[];
    onTargetChange: (name: string) => void;
    onTargetCoordinatesChange?: (latDeg: number, lonDeg: number, name?: string) => void;
    onInstrumentPresetChange?: (name: FovPresetName) => void;
    requirementMs?: number;
    requirementChoicesHours?: readonly number[];
    onRequirementChange?: (requirementMs: number) => void;
    analysisContext?: RevisitAnalysisContext;
    onAnalysisContextChange?: (context: RevisitAnalysisContext) => void;
    comparisonPoints?: RevisitComparisonPoint[];
    pendingComparisonPointIds?: string[];
    secondaryTargetOrder?: string[];
    selectedPointId?: typeof REFERENCE_POINT_ID | string;
    onSelectedPointChange?: (id: typeof REFERENCE_POINT_ID | string) => void;
    onSecondaryPointChange?: (id: string, latDeg: number, lonDeg: number, name?: string) => void;
    onSecondaryPointTargetChange?: (id: string, name: string) => void;
    onRemoveSecondaryPoint?: (id: string) => void;
    hasReferenceTarget?: boolean;
    onAddReferencePoint?: () => void;
    onRemoveReferenceTarget?: () => void;
    onAddComparisonPoint?: () => void;
    areaTargetRole?: RevisitAreaTargetRole;
    referenceArea?: AreaTarget | null;
    comparisonArea?: AreaTarget | null;
    onAreaTargetRoleChange?: (role: RevisitAreaTargetRole) => void;
    onRemoveAreaTarget?: (role: RevisitAreaTargetRole) => void;
    canSwapTargetRoles?: boolean;
    onSwapTargetRoles?: () => void;
    onAddAreaTarget?: (role?: RevisitAreaTargetRole) => void;
    /**
     * Create the polygon slot and go straight to the globe. The menu's
     * `Polygon` entry uses this: manual drawing is the default path, and the
     * editor is where you go to CHANGE an area, not to start one.
     */
    onAddAreaTargetAndDraw?: (role?: RevisitAreaTargetRole) => void;
    /**
     * The area editor's open state, controlled when supplied. The drawing
     * toolbar lives outside this header and has to be able to open the editor
     * ("Import or paste a boundary instead"), so its owner is RevisitApp.
     * Left uncontrolled — internal state — when the prop is absent.
     */
    areaEditorOpen?: boolean;
    onAreaEditorOpenChange?: (open: boolean) => void;
    /** Open the editor's coordinate box on mount — see AreaPanel. */
    areaEditorPasteExpanded?: boolean;
    customArea?: AreaTarget | null;
    referenceAreaCellCount?: number | null;
    comparisonAreaCellCount?: number | null;
    areaAnalysis?: AreaAnalysis | null;
    areaIsRunning?: boolean;
    areaError?: string | null;
    areaProgress?: number | null;
    areaRequirementMs?: number;
    onClearArea?: () => void;
    onCancelArea?: () => void;
    isDrawingArea?: boolean;
    onCustomAreaChange?: (area: AreaTarget | null) => void;
    onStartAreaDrawing?: () => void;
    onFinishAreaDrawing?: () => void;
    onUndoAreaVertex?: () => void;
    isAreaScenarioSettling?: boolean;
    onAdvancedScenarioChange?: (scenario: RevisitScenario) => void;
    model?: ConstellationModelProps;
    /** Set when the chosen count has a better plane split than another at the same count. */
    spreadNote: string | null;
    /**
     * Whether the compact setup triad is the open panel. Owned by `RevisitApp`,
     * not by this component: it is one of five mutually exclusive panels, and
     * exclusivity cannot be enforced from inside one of them (Programme 7B).
     * Ignored above `md`, where the triad is always laid out in normal flow.
     */
    setupOpen?: boolean;
    onToggleSetup?: () => void;
}

const Panel: React.FC<{
    label: string; step?: number; children: React.ReactNode; className?: string;
}> = ({ label, step, children, className = '' }) => (
    <div
        data-revisit-context-panel={label.toLowerCase().replace(/\s+/g, '-')}
        className={[
            REVISIT_PANEL,
            'revisit-context-panel px-3 py-2 md:px-4',
            className,
        ].join(' ')}
    >
        <span className={REVISIT_LABEL}>
            {step !== undefined && (
                <span aria-hidden="true" className="mr-1 text-slate-600">{step} ·</span>
            )}
            {label}
        </span>
        <div className="mt-1">{children}</div>
    </div>
);

const Arrow = () => (
    <span aria-hidden="true" className="hidden select-none items-center text-lg text-slate-500/70 md:flex">→</span>
);

/** Coordinate picks use the coordinates as their stable value. Avoid printing
 * them twice when the detail line immediately below already carries the exact
 * latitude/longitude. */
function targetOptionLabel(name: string): string {
    return /^\d+(?:\.\d+)?°[NS]\s+\d+(?:\.\d+)?°[EW]$/.test(name)
        ? 'Custom point'
        : name;
}

/** Keep selection unmistakable without changing row geometry: an inset ring
 * reads as a thicker frame while preserving the swap control's seam. */
function targetSelectionFrame(
    selected: boolean,
    role: RevisitAreaTargetRole,
): string {
    if (selected) {
        return role === 'REFERENCE'
            ? 'border-amber-400/80 bg-amber-400/15 ring-2 ring-inset ring-amber-300/70'
            : 'border-sky-400/80 bg-sky-400/15 ring-2 ring-inset ring-sky-300/70';
    }
    return 'border-slate-800 opacity-70 transition-opacity hover:opacity-90 focus-within:opacity-100';
}

function coordinateDraft(value?: number): string {
    if (value === undefined) return '';
    return String(Number(value.toFixed(5)));
}

function parseCoordinate(value: string): number | null {
    const normalized = value.trim().replace(',', '.');
    if (normalized === '') return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

interface TargetEditorProps {
    latitude?: number;
    longitude?: number;
    onApply: (latDeg: number, lonDeg: number, name?: string) => void;
    summaryLabel?: string;
    roleLabel?: string;
    coordinateLabel?: string;
    onOpen?: () => void;
}

const TargetEditor: React.FC<TargetEditorProps> = ({
    latitude, longitude, onApply, summaryLabel = 'Set point location', roleLabel = 'Target',
    coordinateLabel = 'Target', onOpen,
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [latitudeDraft, setLatitudeDraft] = useState(coordinateDraft(latitude));
    const [longitudeDraft, setLongitudeDraft] = useState(coordinateDraft(longitude));
    const { results, isLoading, error, clear } = useLocationSearch(query.trim());

    useEffect(() => {
        setLatitudeDraft(coordinateDraft(latitude));
        setLongitudeDraft(coordinateDraft(longitude));
    }, [latitude, longitude]);

    useEffect(() => {
        setActiveIndex((index) => Math.min(index, Math.max(results.length - 1, 0)));
    }, [results.length]);

    const parsedLatitude = parseCoordinate(latitudeDraft);
    const parsedLongitude = parseCoordinate(longitudeDraft);
    const latitudeValid = parsedLatitude !== null && isValidLatDeg(parsedLatitude);
    const longitudeValid = parsedLongitude !== null && isValidLonDeg(parsedLongitude);
    const coordinatesValid = latitudeValid && longitudeValid;
    const hasCoordinateDraft = latitudeDraft.trim() !== '' || longitudeDraft.trim() !== '';
    const isUnplaced = latitude === undefined || longitude === undefined;

    const close = useCallback(() => {
        setIsOpen(false);
        setQuery('');
        setActiveIndex(0);
        clear();
    }, [clear]);

    useClickOutside(menuRef, close, isOpen);

    const applyLocation = useCallback((result: LocationResult) => {
        onApply(result.lat, result.lng, result.name);
        close();
    }, [close, onApply]);

    const applyCoordinates = useCallback(() => {
        if (parsedLatitude === null || parsedLongitude === null || !coordinatesValid) return;
        onApply(parsedLatitude, parsedLongitude);
        close();
    }, [close, coordinatesValid, onApply, parsedLatitude, parsedLongitude]);

    const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => results.length ? (index + 1) % results.length : 0);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0);
        } else if (event.key === 'Enter' && results[activeIndex]) {
            event.preventDefault();
            applyLocation(results[activeIndex]);
        }
    }, [activeIndex, applyLocation, close, results]);

    const handleCoordinateKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && coordinatesValid) {
            event.preventDefault();
            applyCoordinates();
        }
    }, [applyCoordinates, coordinatesValid]);

    return (
        <div ref={menuRef} className="relative shrink-0 text-[11px] text-slate-400">
            <button
                type="button"
                aria-label={summaryLabel}
                title={summaryLabel}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                onClick={() => {
                    // Notify the parent from the event handler, not from inside
                    // the state updater: React may evaluate updater functions
                    // while rendering this component.
                    if (!isOpen) onOpen?.();
                    setIsOpen(!isOpen);
                }}
                className="flex h-11 w-11 cursor-pointer list-none select-none items-center justify-center rounded border border-slate-700 text-sm font-black leading-none hover:border-sky-400/50 hover:text-sky-300 md:h-7 md:w-7 [&::-webkit-details-marker]:hidden"
            >
                <span aria-hidden="true">…</span>
            </button>
            {isOpen && <div role="dialog" aria-label={summaryLabel} className={`absolute right-0 top-[calc(100%+0.25rem)] z-50 w-[min(18rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-slate-700 ${REVISIT_MENU_SURFACE} p-2.5 shadow-2xl`}>
                <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-300">{summaryLabel}</div>
                <div className="relative z-20">
                    <InlineLocationSearchInput
                        roleLabel={roleLabel}
                        value={query}
                        placeholder="City, landmark or site"
                        onChange={(value) => {
                            setQuery(value);
                            setActiveIndex(0);
                        }}
                        onKeyDown={handleSearchKeyDown}
                    />
                    {query.length > 0 && (
                        <InlineSearchResultsPopover
                            activeIndex={activeIndex}
                            error={error}
                            isLoading={isLoading}
                            query={query}
                            results={results}
                            onActiveIndexChange={setActiveIndex}
                            onSelect={applyLocation}
                        />
                    )}
                </div>

                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">
                    <span className="h-px flex-1 bg-slate-800" />
                    Or coordinates
                    <span className="h-px flex-1 bg-slate-800" />
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                    <label className="min-w-0">
                        <span className="mb-0.5 block font-bold text-slate-400">Latitude</span>
                        <input
                            aria-label={`${coordinateLabel} latitude`}
                            aria-invalid={latitudeDraft.trim() !== '' && !latitudeValid}
                            inputMode="decimal"
                            value={latitudeDraft}
                            onChange={(event) => setLatitudeDraft(event.target.value)}
                            onKeyDown={handleCoordinateKeyDown}
                            className="w-full rounded border border-slate-700 bg-slate-950/80 px-1.5 py-1 text-[12px] tabular-nums text-slate-200 outline-none focus:border-amber-400/60 aria-[invalid=true]:border-rose-500/70"
                        />
                    </label>
                    <label className="min-w-0">
                        <span className="mb-0.5 block font-bold text-slate-400">Longitude</span>
                        <input
                            aria-label={`${coordinateLabel} longitude`}
                            aria-invalid={longitudeDraft.trim() !== '' && !longitudeValid}
                            inputMode="decimal"
                            value={longitudeDraft}
                            onChange={(event) => setLongitudeDraft(event.target.value)}
                            onKeyDown={handleCoordinateKeyDown}
                            className="w-full rounded border border-slate-700 bg-slate-950/80 px-1.5 py-1 text-[12px] tabular-nums text-slate-200 outline-none focus:border-amber-400/60 aria-[invalid=true]:border-rose-500/70"
                        />
                    </label>
                </div>
                <p className={coordinatesValid || !hasCoordinateDraft ? 'text-slate-500' : 'font-semibold text-rose-300'} aria-live="polite">
                    {!hasCoordinateDraft
                        ? 'Search for a place or enter latitude and longitude.'
                        : coordinatesValid
                        ? 'Latitude −90 to 90 · Longitude −180 to 180'
                        : 'Check latitude (−90 to 90) and longitude (−180 to 180).'}
                </p>
                <button
                    type="button"
                    disabled={!coordinatesValid}
                    onClick={applyCoordinates}
                    className="w-full rounded border border-amber-400/40 bg-amber-400/10 px-1 py-1.5 font-black uppercase tracking-[0.08em] text-amber-100 hover:bg-amber-400/15 disabled:border-slate-700 disabled:bg-transparent disabled:text-slate-600"
                >
                    Apply coordinates
                </button>
                <p className="leading-3">
                    {isUnplaced
                        ? 'Point placement: click the globe once to set this target.'
                        : coordinateLabel === 'Target'
                        ? 'Point mode: click the globe to move the primary target.'
                        : 'Point mode: Shift-click the globe to place or move the secondary target.'}
                </p>
            </div>}
        </div>
    );
};

/**
 * Reference shell figures are display-only here. A named preset carries round
 * numbers, but an adopted live-TLE fit carries raw floats (1198.8741581239983
 * km, 87.90049999999997°), which read as a bug on a demo screen. Rounding to
 * the same precision the provenance card already uses keeps the two consistent
 * and leaves preset values untouched.
 */

export const RevisitHeader: React.FC<RevisitHeaderProps> = ({
    scenario, payloadCounts, currentPayloadCount, onPayloadCountChange,
    targetNames, onTargetChange, onTargetCoordinatesChange,
    onInstrumentPresetChange, requirementMs, requirementChoicesHours = [],
    onRequirementChange = () => undefined,
    spreadNote, analysisContext = 'POINTS',
    onAnalysisContextChange = () => undefined, comparisonPoints = [],
    pendingComparisonPointIds = [], secondaryTargetOrder,
    selectedPointId = REFERENCE_POINT_ID, onSelectedPointChange = () => undefined,
    onSecondaryPointChange = () => undefined,
    onSecondaryPointTargetChange = () => undefined,
    onRemoveSecondaryPoint = () => undefined,
    hasReferenceTarget = true,
    onAddReferencePoint = () => undefined,
    onRemoveReferenceTarget = () => undefined,
    onAddComparisonPoint = () => undefined,
    onAddAreaTarget = () => undefined,
    onAddAreaTargetAndDraw,
    areaEditorOpen,
    onAreaEditorOpenChange,
    areaEditorPasteExpanded = false,
    customArea = null, referenceAreaCellCount = null, comparisonAreaCellCount = null,
    areaTargetRole = 'COMPARISON',
    referenceArea = areaTargetRole === 'REFERENCE' ? customArea : null,
    comparisonArea = areaTargetRole === 'COMPARISON' ? customArea : null,
    onAreaTargetRoleChange = () => undefined,
    onRemoveAreaTarget = () => undefined,
    canSwapTargetRoles = false, onSwapTargetRoles = () => undefined,
    areaAnalysis = null, areaIsRunning = false, areaError = null, areaProgress = null,
    areaRequirementMs = 2 * 3600_000,
    onClearArea = () => undefined, onCancelArea = () => undefined,
    isDrawingArea = false,
    onCustomAreaChange = () => undefined, onStartAreaDrawing = () => undefined,
    onFinishAreaDrawing = () => undefined, onUndoAreaVertex = () => undefined,
    isAreaScenarioSettling = false,
    onAdvancedScenarioChange = () => undefined,
    model,
    setupOpen = false, onToggleSetup = () => undefined,
}) => {
    const areaMenuRef = useRef<HTMLDivElement>(null);
    const addReferenceMenuRef = useRef<HTMLDivElement>(null);
    const addTargetMenuRef = useRef<HTMLDivElement>(null);
    const constellationMenuRef = useRef<HTMLDivElement>(null);
    const constellationLauncherRef = useRef<HTMLButtonElement>(null);
    const [uncontrolledAreaMenuOpen, setUncontrolledAreaMenuOpen] = useState(false);
    const areaMenuOpen = areaEditorOpen ?? uncontrolledAreaMenuOpen;
    const areaMenuOpenRef = useRef(areaMenuOpen);
    areaMenuOpenRef.current = areaMenuOpen;
    const setAreaMenuOpen = useCallback((
        next: boolean | ((open: boolean) => boolean),
    ) => {
        const value = typeof next === 'function' ? next(areaMenuOpenRef.current) : next;
        if (onAreaEditorOpenChange) onAreaEditorOpenChange(value);
        else setUncontrolledAreaMenuOpen(value);
    }, [onAreaEditorOpenChange]);
    const [addReferenceMenuOpen, setAddReferenceMenuOpen] = useState(false);
    const [addTargetMenuOpen, setAddTargetMenuOpen] = useState(false);
    const [constellationMenuOpen, setConstellationMenuOpen] = useState(false);
    /**
     * Where the constellation panel sits on a phone, or `null` for the desktop
     * layout that hangs it off its launcher.
     *
     * ── WHY THIS IS MEASURED, AND PORTALLED ─────────────────────────────────
     * `left-0` anchors the panel to its launcher, which on a phone sits ~70 px
     * in from the left inside the two-column setup grid: a 359 px panel then
     * ran 57 px past the right edge of a 375 px viewport. `position: fixed`
     * does not fix it either — the header carries `backdrop-blur`, which makes
     * it the containing block for fixed descendants, so `inset-x-2` resolved
     * against the launcher's card and produced a 132 px sliver. Both measured.
     *
     * Portalling to the body escapes that containing block, and the coordinates
     * are read from the launcher. It costs one thing, paid for in
     * `useClickOutside`: the panel is no longer inside the ref's subtree, so it
     * marks itself and is treated as inside.
     */
    const [constellationMenuPosition, setConstellationMenuPosition] =
        useState<React.CSSProperties | null>(null);
    const { reference, target, payload } = scenario;
    const presetName = useMemo(
        () => fovPresetNameFor(reference.altitudeKm, payload),
        [reference.altitudeKm, payload]
    );
    /**
     * The three presets rebuilt at the CURRENT altitude, so each option can
     * state the swath it actually produces rather than the constant it is
     * named after.
     */
    const altitudePresets = useMemo(
        () => fovPresets(reference.altitudeKm),
        [reference.altitudeKm]
    );
    const swathKm = useMemo(
        () => Math.round(swathKmForFov(reference.altitudeKm, payload)),
        [reference.altitudeKm, payload]
    );
    // The chip reads the stored choice, not a re-derivation of the spec, so it
    // cannot disagree with the selector inside the panel.
    const headerModelBadge = modelBadge(model?.mode);
    // The tooltip names what is loaded. Repeating the badge label the button
    // already shows would say nothing, so each mode contributes the fact the
    // label omits: the profile version, or simply that the numbers are the
    // user's own.
    const modelSummary = model?.mode === 'CUSTOM'
        ? 'hand-entered parameters'
        : model?.profile
            ? `${model.profile.label} v${model.profile.version}`
            : headerModelBadge.label;
    const sliderIndex = Math.max(0, payloadCounts.indexOf(currentPayloadCount));
    const activeSatelliteCount = reference.planes * reference.satsPerPlane;
    const spareSatelliteCount = (reference.sparesPerPlane ?? [])
        .reduce((sum, count) => sum + count, 0);
    const totalSatelliteCount = activeSatelliteCount + spareSatelliteCount;
    const orderedSecondaryTargetIds = (secondaryTargetOrder ?? [
        ...comparisonPoints.map((point) => point.id),
        ...pendingComparisonPointIds,
        ...(comparisonArea ? [AREA_TARGET_ID] : []),
    ]).slice(0, MAX_SECONDARY_TARGETS);
    useEffect(() => {
        if (analysisContext !== 'AREA') setAreaMenuOpen(false);
    }, [analysisContext, setAreaMenuOpen]);
    const closeAreaMenu = useCallback(() => setAreaMenuOpen(false), [setAreaMenuOpen]);
    // The globe is the drawing surface. Clicking it must not dismiss the
    // editor that contains Undo and Finish polygon.
    useClickOutside(areaMenuRef, closeAreaMenu, areaMenuOpen && !isDrawingArea);
    const closeAddTargetMenu = useCallback(() => setAddTargetMenuOpen(false), []);
    useClickOutside(addTargetMenuRef, closeAddTargetMenu, addTargetMenuOpen);
    const closeAddReferenceMenu = useCallback(() => setAddReferenceMenuOpen(false), []);
    useClickOutside(addReferenceMenuRef, closeAddReferenceMenu, addReferenceMenuOpen);
    const closeConstellationMenus = useCallback(() => {
        setConstellationMenuOpen(false);
    }, []);
    const positionConstellationMenu = useCallback(() => {
        const launcher = constellationLauncherRef.current;
        if (!launcher || typeof window === 'undefined') return;
        /*
         * Only the phone layout needs rescuing; `sm` and up anchor correctly.
         * A missing `matchMedia` counts as desktop rather than as phone: jsdom
         * has none, and defaulting the other way would portal the panel out of
         * its container in every test that renders this header.
         */
        if (typeof window.matchMedia !== 'function'
            // A zero-width viewport is a hidden pane, not a phone. Observed
            // while verifying: it produced a 2 px panel.
            || window.innerWidth === 0
            || window.matchMedia('(min-width: 640px)').matches) {
            setConstellationMenuPosition(null);
            return;
        }
        const rect = launcher.getBoundingClientRect();
        const top = rect.bottom + 6;
        setConstellationMenuPosition({
            position: 'fixed',
            left: 8,
            width: Math.max(0, window.innerWidth - 16),
            top,
            maxHeight: Math.max(160, window.innerHeight - top - 8),
        });
    }, []);
    useLayoutEffect(() => {
        if (!constellationMenuOpen) return;
        positionConstellationMenu();
        window.addEventListener('resize', positionConstellationMenu);
        return () => window.removeEventListener('resize', positionConstellationMenu);
    }, [constellationMenuOpen, positionConstellationMenu]);

    useClickOutside(
        constellationMenuRef, closeConstellationMenus, constellationMenuOpen,
        /* Every control that edits what this panel displays: the payload count
           and the instrument preset. Not the whole header — the globe, the
           timeline and the target controls must still dismiss it. */
        '.revisit-payload-slider, [data-revisit-payload-step], [data-revisit-payload-swath],'
        + ' [data-revisit-constellation-panel]',
    );
    const stepPayload = (delta: number) => {
        const next = payloadCounts[Math.min(Math.max(sliderIndex + delta, 0), payloadCounts.length - 1)];
        if (next !== undefined && next !== currentPayloadCount) onPayloadCountChange(next);
    };
    return (
        <div className="relative md:contents">
        {/*
          * Compact viewports get a one-line stand-in for the triad. Expanded,
          * the triad is 330 px tall on a 812 px phone — 41% of the viewport for
          * configuration the user reads once, which left the globe a 73 px slit
          * (mobile UX plan §2). Collapsed it is ~44 px, and the one control that
          * is genuinely manipulated all the time — the payload count — stays on
          * the bar as a stepper so collapsing costs no interaction.
          */}
        <div className="md:hidden" data-revisit-compact-bar>
            <div className={`${REVISIT_PANEL} flex items-center gap-2 px-2 py-1.5`}>
                <button
                    type="button"
                    onClick={onToggleSetup}
                    aria-expanded={setupOpen}
                    aria-controls="revisit-mobile-setup"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-slate-100">
                            {reference.planes} × {reference.satsPerPlane} {reference.pattern}
                            <span className="text-slate-500"> · </span>
                            {analysisContext === 'AREA'
                                ? customArea?.name ?? 'No area'
                                : target.name}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                            {displayAltitudeKm(reference.altitudeKm)} km · {displayInclinationDeg(reference.inclinationDeg)}° · {swathKm} km swath
                            {comparisonPoints.length > 0 && ` · +${comparisonPoints.length} compared`}
                        </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-sm text-slate-300">
                        {setupOpen ? '⌃' : '⌄'}
                    </span>
                </button>
                {/* Stepping the payload count is an edit of what the
                    constellation panel is displaying, so it must not dismiss
                    it — same reasoning as the slider. */}
                <div
                    data-revisit-payload-step
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-600/70 bg-slate-400/5 px-1"
                >
                    <button
                        type="button"
                        aria-label="One payload fewer"
                        disabled={sliderIndex <= 0}
                        onClick={() => stepPayload(-1)}
                        className="min-h-11 w-9 text-lg font-black leading-none text-slate-200 disabled:opacity-30"
                    >−</button>
                    <span className="min-w-[2.25rem] text-center text-base font-black tabular-nums leading-none text-white">
                        {currentPayloadCount}
                    </span>
                    <button
                        type="button"
                        aria-label="One payload more"
                        disabled={sliderIndex >= payloadCounts.length - 1}
                        onClick={() => stepPayload(1)}
                        className="min-h-11 w-9 text-lg font-black leading-none text-slate-200 disabled:opacity-30"
                    >+</button>
                </div>
            </div>
        </div>
        <div
            id="revisit-mobile-setup"
            data-revisit-context-bar
            className={`revisit-context-bar ${setupOpen ? 'grid' : 'hidden'} absolute inset-x-0 top-[calc(100%+0.5rem)] max-h-[calc(100dvh-5.25rem)] grid-cols-2 items-stretch gap-2 overflow-y-auto rounded-b-xl pb-2 md:static md:max-h-none md:overflow-visible md:rounded-none md:pb-0 md:flex`}
        >
            <Panel label="Constellation" step={1} className="relative z-50 min-w-0 md:min-w-[190px]">
                <div ref={constellationMenuRef} className="relative">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="text-sm font-bold text-slate-100 md:text-base">
                                {reference.planes} × {reference.satsPerPlane}
                                <span className="ml-2 text-xs font-semibold text-slate-400">
                                    {reference.pattern}
                                </span>
                            </div>
                        </div>
                        <div className="revisit-context-detail text-[12px] text-slate-400">
                            {displayInclinationDeg(reference.inclinationDeg)}° · {displayAltitudeKm(reference.altitudeKm)} km ·{' '}
                            {spareSatelliteCount > 0
                                ? `${activeSatelliteCount} active + ${spareSatelliteCount} spare · ${totalSatelliteCount} total`
                                : `${activeSatelliteCount} active`}
                        </div>
                        {/*
                          * One way in, and it names the model it opens. A separate
                          * status chip beside a generic "Constellation settings"
                          * button gave the cartouche two controls for one panel and
                          * left the button saying nothing about what is loaded.
                          */}
                        <button
                            type="button"
                            ref={constellationLauncherRef}
                            aria-label="Constellation model and settings"
                            title={model
                                ? `Constellation model, characteristics and evidence. Currently: ${modelSummary}.`
                                : 'Walker model, hosted-payload topology and instrument geometry'}
                            aria-haspopup="dialog"
                            aria-expanded={constellationMenuOpen}
                            onClick={() => setConstellationMenuOpen((open) => !open)}
                            /* At 11 px the tracked uppercase label no longer
                               fits one 390 px line and truncated to
                               "VALIDATED M… ". Dropping the tracking and
                               allowing two lines keeps the whole verdict
                               readable, which is the point of the badge
                               (Programme 7D). */
                            className={`mt-2 flex min-h-11 md:min-h-7 w-full items-center justify-between gap-2 rounded border px-2 py-1 text-[11px] font-black uppercase tracking-normal transition-colors md:tracking-[0.08em] ${model
                                ? `${headerModelBadge.chip} hover:brightness-125`
                                : 'border-slate-700 text-amber-200 hover:border-amber-400/50 hover:bg-amber-400/5'}`}
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                {model && (
                                    <span
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${headerModelBadge.dot}`}
                                        aria-hidden="true"
                                    />
                                )}
                                <span className="text-left leading-tight md:truncate">
                                    {model ? headerModelBadge.label : 'Constellation settings'}
                                </span>
                            </span>
                            <span aria-hidden="true" className="shrink-0 text-sm leading-none">…</span>
                        </button>
                    </div>
                    {constellationMenuOpen && (
                        (() => {
                            const body = (
                                <div
                                    role="dialog"
                                    aria-label="Advanced constellation settings"
                                    data-revisit-constellation-panel
                                    style={constellationMenuPosition ?? undefined}
                                    className={constellationMenuPosition
                                        ? `revisit-shell z-[80] overflow-y-auto rounded-lg border border-amber-400/35 ${REVISIT_MENU_SURFACE} shadow-2xl`
                                        : `absolute left-0 top-[calc(100%+0.35rem)] z-[80] max-h-[min(70vh,calc(100vh-6rem))] w-[min(36rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-amber-400/35 md:max-h-[min(80vh,calc(100vh-5rem))] xl:max-h-[min(88vh,calc(100vh-4rem))] ${REVISIT_MENU_SURFACE} shadow-2xl`}
                                >
                                    <AdvancedDrawer
                                        scenario={scenario}
                                        onChange={onAdvancedScenarioChange}
                                        model={model}
                                        variant="menu"
                                    />
                                </div>
                            );
                            // Portalled only when the phone layout is in force:
                            // on the desktop the launcher anchoring is correct,
                            // and staying in flow keeps focus order natural.
                            return constellationMenuPosition && typeof document !== 'undefined'
                                ? createPortal(body, document.body)
                                : body;
                        })()
                    )}
                </div>
            </Panel>

            <Arrow />

            <Panel label="Hosted payloads" step={2} className="order-3 col-span-2 min-w-0 md:order-none md:flex-1 md:min-w-[280px]">
                <div className="flex flex-col gap-2 md:flex-row md:items-end">
                    <div className="flex items-baseline gap-2">
                        <span data-revisit-payload-count className="revisit-payload-count text-2xl font-black leading-none tabular-nums md:text-3xl">
                            {currentPayloadCount}
                        </span>
                        {/* `12 of 576` read as "only 12 of the 576 satellites
                            work". Naming what the 12 ARE, and what the 576 are,
                            removes that reading (Programme 7D). */}
                        <span className="text-[12px] font-semibold leading-4 text-slate-300">
                            payload-equipped
                            <span className="block text-[11px] text-slate-400">
                                of {reference.planes * reference.satsPerPlane} active satellites
                            </span>
                        </span>
                    </div>
                    <div className="grid w-full min-w-0 grid-cols-2 items-end gap-2 md:ml-auto md:w-[58%]">
                    {onInstrumentPresetChange && (
                        <label className="flex min-w-0 flex-col gap-0.5">
                            <span
                                className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400"
                                title="Thermal-infrared imager. It images day and night, which is why no solar-illumination gating is applied to the access windows."
                            >
                                Assumed sensor swath
                            </span>
                            <select
                                data-revisit-payload-swath
                                aria-label="Instrument preset"
                                className="min-h-11 md:min-h-8 rounded border border-slate-600/70 bg-transparent px-2 py-1 text-sm font-black text-slate-100 outline-none focus:border-slate-300 md:text-base"
                                value={presetName ?? 'CUSTOM'}
                                onChange={(event) => {
                                    if (event.target.value !== 'CUSTOM') {
                                        onInstrumentPresetChange(event.target.value as FovPresetName);
                                    }
                                }}
                            >
                                {!presetName && <option value="CUSTOM">Custom · {swathKm} km</option>}
                                {/*
                                  * The swath each preset ACTUALLY produces at the
                                  * current altitude, not its nominal constant. The
                                  * two diverge as soon as the altitude leaves the
                                  * one the presets were built at — a measured
                                  * shell at 1198.87 km turns the 700 km Standard
                                  * into 699 km — and the customer question states
                                  * the computed figure. Printing the constant here
                                  * put two numbers for one quantity on one screen.
                                  */}
                                {(Object.keys(FOV_PRESET_SWATH_KM) as FovPresetName[]).map((name) => (
                                    <option key={name} value={name}>
                                        {name[0]}{name.slice(1).toLowerCase()} ·{' '}
                                        {Math.round(swathKmForFov(reference.altitudeKm, altitudePresets[name]))} km
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {requirementMs !== undefined && (
                        <label className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                                Requirement
                                {/* The scope is stated only once a second target
                                  * exists, which is the only moment the reader can
                                  * wonder which target this select is about. */}
                                {orderedSecondaryTargetIds.length > 0 && (
                                    <span className="font-semibold normal-case tracking-normal text-slate-500">
                                        {' '}· all targets
                                    </span>
                                )}
                            </span>
                            <select
                                data-revisit-requirement
                                /* One requirement for the whole analysis, so the
                                 * name never changes with the selection — and the
                                 * control is no longer painted in the selected
                                 * target's colour, which is what made a shared
                                 * setting read as a per-target one. */
                                aria-label="Requirement for all targets"
                                value={requirementMs}
                                onChange={(event) => onRequirementChange(Number(event.target.value))}
                                className="min-h-11 rounded border border-slate-500/70 bg-transparent px-2 py-1 text-sm font-black text-slate-100 outline-none focus:border-slate-200 md:min-h-8 md:text-base"
                                title="Maximum acceptable gap between two observations. One requirement is applied to every target in the analysis."
                            >
                                {requirementChoicesHours.map((hours) => (
                                    <option key={hours} value={hours * 3600_000}>
                                        {formatGap(hours * 3600_000)} max gap
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    </div>
                </div>
                <input
                    type="range"
                    className="revisit-payload-slider mt-2 w-full"
                    min={0}
                    max={Math.max(payloadCounts.length - 1, 0)}
                    step={1}
                    value={sliderIndex}
                    style={{
                        '--revisit-slider-progress': `${payloadCounts.length > 1
                            ? (sliderIndex / (payloadCounts.length - 1)) * 100
                            : 0}%`,
                    } as React.CSSProperties}
                    onChange={(e) => onPayloadCountChange(payloadCounts[Number(e.target.value)])}
                    aria-label="Number of hosted payloads"
                    aria-valuetext={`${currentPayloadCount} payloads`}
                />
                <div className="revisit-spread-note min-h-[14px] text-[12px] leading-[14px] text-slate-300">
                    {spreadNote}
                </div>
                {/* The swath figure and the assumption that shrank it belong on
                    the same line. An elevation mask makes the instrument
                    non-preset by construction, so this line is always the one
                    on screen when a mask is set — and it is where the reader
                    who wonders why the swath shrank is already looking. */}
                <div className="text-[11px] leading-3 text-slate-400">
                    {!presetName && `Custom FOV · approx. ${swathKm} km swath${
                        payload.minElevationDeg === undefined
                            ? ''
                            : ` · ${payload.minElevationDeg}° elevation mask`}`}
                </div>
            </Panel>

            <Arrow />

            <Panel
                label="Analysis target"
                step={3}
                className="relative z-40 min-w-0 md:w-[min(400px,32vw)] md:min-w-[260px] md:max-w-[400px] md:flex-none"
            >
                    {/* `space-y-0`: the swap pill sits ON the seam between
                        Primary and Secondary and supplies the only separation
                        those two blocks need, so a gap as well as the pill
                        spent header height on nothing. */}
                    <div className="space-y-0" role="group" aria-label="Analysis targets">
                        {!hasReferenceTarget ? (
                            <div ref={addReferenceMenuRef} className="relative">
                                <p className="mb-2 text-[11px] leading-4 text-slate-400">
                                    Add a Primary point or polygon to start the analysis.
                                </p>
                                <button
                                    type="button"
                                    aria-label="Add primary target"
                                    aria-haspopup="menu"
                                    aria-expanded={addReferenceMenuOpen}
                                    onClick={() => setAddReferenceMenuOpen((open) => !open)}
                                    className="flex min-h-11 md:min-h-7 w-full items-center justify-center gap-1 rounded border border-amber-400/40 px-2 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 hover:border-amber-300"
                                >
                                    <span aria-hidden="true">+</span>
                                    Add primary target
                                </button>
                                {addReferenceMenuOpen && (
                                    <div role="menu" aria-label="Choose primary target type"
                                        className={`absolute right-0 top-[calc(100%+0.25rem)] z-[75] grid w-full min-w-48 grid-cols-2 gap-1 rounded-lg border border-amber-400/35 p-1.5 ${REVISIT_MENU_SURFACE} shadow-2xl`}>
                                        <button type="button" role="menuitem" aria-label="Add Primary point target"
                                            onClick={() => { onAddReferencePoint(); setAddReferenceMenuOpen(false); }}
                                            className="min-h-11 md:min-h-9 rounded border border-slate-700 px-2 text-[11px] font-black uppercase tracking-wide text-amber-200 hover:border-amber-400/60 hover:bg-amber-400/10">
                                            Point
                                        </button>
                                        <button type="button" role="menuitem" aria-label="Add Primary polygon target"
                                            onClick={() => {
                                                // Straight to the globe: the editor
                                                // is for changing an area, not for
                                                // starting one.
                                                (onAddAreaTargetAndDraw ?? onAddAreaTarget)('REFERENCE');
                                                setAddReferenceMenuOpen(false);
                                                if (!onAddAreaTargetAndDraw) setAreaMenuOpen(true);
                                            }}
                                            className="min-h-11 md:min-h-9 rounded border border-slate-700 px-2 text-[11px] font-black uppercase tracking-wide text-amber-200 hover:border-amber-400/60 hover:bg-amber-400/10">
                                            Polygon
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : <>
                        {referenceArea ? (
                        <div ref={areaMenuRef} className="relative">
                            <div
                                data-revisit-target-row
                                data-revisit-target-selected={analysisContext === 'AREA' && areaTargetRole === 'REFERENCE'}
                                className={`flex items-center gap-1 rounded border px-2 py-1.5 ${targetSelectionFrame(analysisContext === 'AREA' && areaTargetRole === 'REFERENCE', 'REFERENCE')}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => { onAreaTargetRoleChange('REFERENCE'); onAnalysisContextChange('AREA'); }}
                                    aria-pressed={analysisContext === 'AREA' && areaTargetRole === 'REFERENCE'}
                                    aria-label="Select primary target polygon"
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <div className="whitespace-nowrap text-[11px] font-black uppercase leading-4 tracking-wide text-amber-300">Primary target</div>
                                    <div className="truncate text-[12px] font-bold leading-4 text-amber-100">Polygon · {referenceArea.name}</div>
                                    <div className="mt-0.5 truncate text-[11px] leading-4 text-slate-400">
                                        {referenceArea.boundary.length} vertices · {referenceAreaCellCount === null ? 'not analysed' : `${referenceAreaCellCount} cells`} · grid {referenceArea.gridSpacingDeg}°
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    aria-label="Edit Primary polygon"
                                    aria-haspopup="dialog"
                                    aria-expanded={areaMenuOpen}
                                    onClick={() => { onAreaTargetRoleChange('REFERENCE'); onAnalysisContextChange('AREA'); setAreaMenuOpen((open) => !open); }}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-slate-700 text-sm font-black text-amber-200 hover:border-amber-400/50 md:h-7 md:w-7"
                                >…</button>
                                <button type="button" onClick={onRemoveReferenceTarget}
                                    aria-label="Remove primary target"
                                    className="h-11 w-11 shrink-0 rounded text-slate-500 hover:bg-rose-400/10 hover:text-rose-300 md:h-7 md:w-7">×</button>
                            </div>
                            {/* One editor at a time. Both dialogs hung off the
                                same open flag, so a scenario carrying a Primary
                                AND a Secondary polygon opened both at once,
                                stacked. The role already governs which area the
                                panel edits; it governs which panel shows. */}
                            {areaMenuOpen && areaTargetRole === 'REFERENCE' && (
                                <div role="dialog" aria-label="Define Primary polygon"
                                    className={`absolute right-0 top-[calc(100%+0.25rem)] z-[70] max-h-[min(70vh,38rem)] w-[min(27rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-amber-400/35 ${REVISIT_MENU_SURFACE} shadow-2xl`}>
                                    <AreaPanel
                                        scenario={scenario} analysis={areaAnalysis} isRunning={areaIsRunning}
                                        error={areaError} progress={areaProgress} requirementMs={areaRequirementMs}
                                        onClear={onClearArea} onCancel={onCancelArea} customArea={referenceArea}
                                        isDrawing={isDrawingArea} onCustomAreaChange={onCustomAreaChange}
                                        onStartDrawing={() => { onAreaTargetRoleChange('REFERENCE'); setAreaMenuOpen(false); onStartAreaDrawing(); }}
                                        onFinishDrawing={onFinishAreaDrawing} onUndoVertex={onUndoAreaVertex}
                                        showAnalysisSummary={false} isScenarioSettling={isAreaScenarioSettling} variant="menu"
                                        initialPasteExpanded={areaEditorPasteExpanded}
                                    />
                                </div>
                            )}
                        </div>
                        ) : (
                        <div
                            data-revisit-target-row
                            data-revisit-target-selected={analysisContext === 'POINTS' && selectedPointId === REFERENCE_POINT_ID}
                            className={`rounded border px-1.5 py-1.5 ${targetSelectionFrame(analysisContext === 'POINTS' && selectedPointId === REFERENCE_POINT_ID, 'REFERENCE')}`}
                        >
                            <div className="flex min-w-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => onSelectedPointChange(REFERENCE_POINT_ID)}
                                    aria-pressed={analysisContext === 'POINTS' && selectedPointId === REFERENCE_POINT_ID}
                                    className="w-[104px] shrink-0 text-left"
                                >
                                    <span className="block whitespace-nowrap text-[11px] font-black uppercase leading-4 tracking-wide text-amber-300">Primary target</span>
                                    <span className="block text-[11px] leading-4 tabular-nums text-slate-400">
                                        {target.latDeg.toFixed(2)}° · {target.lonDeg.toFixed(2)}°
                                    </span>
                                </button>
                                <div className="relative min-w-0 flex-1">
                                    <select
                                        className="min-h-11 w-full appearance-none truncate bg-transparent py-0.5 pl-0 pr-5 text-[12px] font-bold text-slate-300 outline-none md:min-h-0"
                                        value={target.name}
                                        onChange={(event) => onTargetChange(event.target.value)}
                                        aria-label="Target"
                                    >
                                        {targetNames.map((name) => (
                                            <option key={name} value={name} className="bg-slate-900">{targetOptionLabel(name)}</option>
                                        ))}
                                    </select>
                                    <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-500">⌄</span>
                                </div>
                                {onTargetCoordinatesChange && (
                                    <TargetEditor
                                        key="REFERENCE"
                                        latitude={target.latDeg}
                                        longitude={target.lonDeg}
                                        summaryLabel="Set primary target location"
                                        roleLabel="Primary target"
                                        coordinateLabel="Target"
                                        onOpen={() => onSelectedPointChange(REFERENCE_POINT_ID)}
                                        onApply={(latDeg, lonDeg, name) => onTargetCoordinatesChange(latDeg, lonDeg, name)}
                                    />
                                )}
                                <button type="button" onClick={onRemoveReferenceTarget}
                                    aria-label="Remove primary target"
                                    className="h-11 w-11 shrink-0 rounded text-slate-500 hover:bg-rose-400/10 hover:text-rose-300 md:h-7 md:w-7">×</button>
                            </div>
                        </div>
                        )}

                        {/*
                          * Straddling the two blocks, the way the engineering
                          * header swaps Site A and Site B. As a full-width bar
                          * under the list it named an action without showing
                          * what it acted on; sitting on the seam between
                          * Primary and Secondary, the two things it exchanges
                          * are above and below it. The negative margin is what
                          * puts it ON the seam rather than in a row of its own.
                          */}
                        {orderedSecondaryTargetIds.length > 0 && (
                            <div className="relative z-10 -my-3 flex justify-center">
                                <button
                                    type="button"
                                    aria-label="Swap Primary and Secondary targets"
                                    title={canSwapTargetRoles
                                        ? 'Make the Secondary target Primary and the Primary target Secondary'
                                        : 'Define both targets before swapping their roles'}
                                    disabled={!canSwapTargetRoles}
                                    onClick={onSwapTargetRoles}
                                    style={{ borderColor: '#6b7c99' }}
                                    className="flex h-7 w-7 items-center justify-center rounded-full border bg-slate-800 text-[13px] font-black leading-none text-slate-200 shadow transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {/* Vertical, because the two blocks it
                                        exchanges are stacked: a sideways arrow
                                        described a swap that does not happen on
                                        this axis. */}
                                    <span aria-hidden="true">⇅</span>
                                </button>
                            </div>
                        )}

                        {orderedSecondaryTargetIds.map((secondaryId) => {
                            if (secondaryId === AREA_TARGET_ID) return (
                                <div ref={areaMenuRef} key={AREA_TARGET_ID} className="relative">
                                    <div
                                        data-revisit-target-row
                                        data-revisit-target-selected={analysisContext === 'AREA' && areaTargetRole === 'COMPARISON'}
                                        className={`flex items-center gap-1 rounded border px-2 py-1.5 ${targetSelectionFrame(analysisContext === 'AREA' && areaTargetRole === 'COMPARISON', 'COMPARISON')}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => { onAreaTargetRoleChange('COMPARISON'); onAnalysisContextChange('AREA'); }}
                                            aria-pressed={analysisContext === 'AREA' && areaTargetRole === 'COMPARISON'}
                                            aria-label="Select secondary target polygon"
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <div className="whitespace-nowrap text-[11px] font-black uppercase leading-4 tracking-wide text-sky-700 dark:text-sky-300">Secondary target</div>
                                            <div className="truncate text-[12px] font-bold leading-4 text-sky-900 dark:text-sky-100">
                                                Polygon · {comparisonArea?.name ?? 'Secondary area'}
                                            </div>
                                            <div className="mt-0.5 truncate text-[11px] leading-4 text-slate-400">
                                                {comparisonArea
                                                    ? `${comparisonArea.boundary.length} vertices · ${comparisonAreaCellCount === null ? 'not analysed' : `${comparisonAreaCellCount} cells`} · grid ${comparisonArea.gridSpacingDeg}°`
                                                    : 'Draw or import a polygon'}
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Define area target"
                                            title="Define area target"
                                            aria-haspopup="dialog"
                                            aria-expanded={areaMenuOpen}
                                            onClick={() => {
                                                onAreaTargetRoleChange('COMPARISON');
                                                onAnalysisContextChange('AREA');
                                                setAreaMenuOpen((open) => !open);
                                            }}
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-slate-700 text-sm font-black leading-none text-sky-700 hover:border-sky-400/50 md:h-7 md:w-7 dark:text-sky-300"
                                        ><span aria-hidden="true">…</span></button>
                                        <button type="button" onClick={() => onRemoveAreaTarget('COMPARISON')}
                                            aria-label="Remove secondary target"
                                            className="h-11 w-11 shrink-0 rounded text-slate-500 hover:bg-rose-400/10 hover:text-rose-300 md:h-7 md:w-7">×</button>
                                    </div>
                                    {areaMenuOpen && areaTargetRole === 'COMPARISON' && (
                                        <div role="dialog" aria-label="Define area target"
                                            className={`absolute right-0 top-[calc(100%+0.25rem)] z-[70] max-h-[min(70vh,38rem)] w-[min(27rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-sky-400/35 ${REVISIT_MENU_SURFACE} shadow-2xl`}>
                                            <AreaPanel
                                                scenario={scenario}
                                                analysis={areaAnalysis}
                                                isRunning={areaIsRunning}
                                                error={areaError}
                                                progress={areaProgress}
                                                requirementMs={areaRequirementMs}
                                                onClear={onClearArea}
                                                onCancel={onCancelArea}
                                                customArea={comparisonArea}
                                                isDrawing={isDrawingArea}
                                                onCustomAreaChange={onCustomAreaChange}
                                            onStartDrawing={() => {
                                                onAreaTargetRoleChange('COMPARISON');
                                                setAreaMenuOpen(false);
                                                onStartAreaDrawing();
                                            }}
                                                onFinishDrawing={onFinishAreaDrawing}
                                                onUndoVertex={onUndoAreaVertex}
                                                showAnalysisSummary={false}
                                                isScenarioSettling={isAreaScenarioSettling}
                                                variant="menu"
                                                initialPasteExpanded={areaEditorPasteExpanded}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                            const configuredPoint = comparisonPoints.find((point) => point.id === secondaryId);
                            const point = {
                                id: secondaryId,
                                target: configuredPoint?.target ?? null,
                            };
                            const pointTargetNames = point.target && !targetNames.includes(point.target.name)
                                ? [...targetNames, point.target.name]
                                : targetNames;
                            const targetName = point.target?.name ?? '';
                            return (
                            <div
                                key={point.id}
                                data-revisit-target-row
                                data-revisit-target-selected={analysisContext === 'POINTS' && selectedPointId === point.id}
                                className={`flex min-w-0 items-center gap-1 rounded border px-1.5 py-1.5 ${targetSelectionFrame(analysisContext === 'POINTS' && selectedPointId === point.id, 'COMPARISON')}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => onSelectedPointChange(point.id)}
                                    aria-pressed={analysisContext === 'POINTS' && selectedPointId === point.id}
                                    className="w-[104px] shrink-0 text-left"
                                >
                                    <span className="block whitespace-nowrap text-[11px] font-black uppercase leading-4 tracking-wide text-sky-700 dark:text-sky-300">Secondary target</span>
                                    <span className="block text-[11px] leading-4 tabular-nums text-slate-400">
                                        {point.target
                                            ? `${point.target.latDeg.toFixed(2)}° · ${point.target.lonDeg.toFixed(2)}°`
                                            : 'Not set'}
                                    </span>
                                </button>
                                <div className="relative min-w-0 flex-1">
                                    <select
                                        className="min-h-11 w-full appearance-none truncate bg-transparent py-0.5 pl-0 pr-5 text-[12px] font-bold text-slate-300 outline-none md:min-h-0"
                                        value={targetName}
                                        onChange={(event) => onSecondaryPointTargetChange(point.id, event.target.value)}
                                        aria-label="Secondary target"
                                    >
                                        {!point.target && <option value="" disabled className="bg-slate-900">Choose site…</option>}
                                        {pointTargetNames.map((name) => (
                                            <option key={name} value={name} className="bg-slate-900">
                                                {targetOptionLabel(name)}
                                            </option>
                                        ))}
                                    </select>
                                    <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-500">⌄</span>
                                </div>
                                <TargetEditor
                                    key={point.id}
                                    latitude={point.target?.latDeg}
                                    longitude={point.target?.lonDeg}
                                    summaryLabel="Set secondary target location"
                                    roleLabel="Secondary target"
                                    coordinateLabel="Secondary target"
                                    onOpen={() => onSelectedPointChange(point.id)}
                                    onApply={(latDeg, lonDeg, name) => onSecondaryPointChange(point.id, latDeg, lonDeg, name)}
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemoveSecondaryPoint(point.id)}
                                    aria-label="Remove secondary target"
                                    className="h-11 w-11 shrink-0 rounded text-slate-500 hover:bg-rose-400/10 hover:text-rose-300 md:h-7 md:w-7"
                                >×</button>
                            </div>
                        )})}
                        {orderedSecondaryTargetIds.length < MAX_SECONDARY_TARGETS && (
                            <div ref={addTargetMenuRef} className="relative">
                                <button
                                    type="button"
                                    aria-label="Add secondary target"
                                    aria-haspopup="menu"
                                    aria-expanded={addTargetMenuOpen}
                                    onClick={() => setAddTargetMenuOpen((open) => !open)}
                                    className="flex min-h-11 md:min-h-7 w-full items-center justify-center gap-1 rounded border border-slate-700 px-2 text-[11px] font-black uppercase tracking-[0.08em] text-sky-700 hover:border-sky-400/50 dark:text-sky-300"
                                >
                                    <span aria-hidden="true">+</span>
                                    Add secondary target
                                </button>
                                {addTargetMenuOpen && (
                                    <div role="menu" aria-label="Choose secondary target type"
                                        className={`absolute right-0 top-[calc(100%+0.25rem)] z-[75] grid w-full min-w-48 grid-cols-2 gap-1 rounded-lg border border-sky-400/35 p-1.5 ${REVISIT_MENU_SURFACE} shadow-2xl`}>
                                        <button type="button" role="menuitem" aria-label="Add Secondary point target"
                                            onClick={() => { onAddComparisonPoint(); setAddTargetMenuOpen(false); }}
                                            className="min-h-11 md:min-h-9 rounded border border-slate-700 px-2 text-[11px] font-black uppercase tracking-wide text-sky-200 hover:border-sky-400/60 hover:bg-sky-400/10">
                                            Point
                                        </button>
                                        <button type="button" role="menuitem" aria-label="Add Secondary polygon target"
                                            disabled={Boolean(comparisonArea)}
                                            onClick={() => {
                                                (onAddAreaTargetAndDraw ?? onAddAreaTarget)('COMPARISON');
                                                setAddTargetMenuOpen(false);
                                                if (!onAddAreaTargetAndDraw) setAreaMenuOpen(true);
                                            }}
                                            className="min-h-11 md:min-h-9 rounded border border-slate-700 px-2 text-[11px] font-black uppercase tracking-wide text-sky-200 hover:border-sky-400/60 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-35">
                                            Polygon
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        </>}
                    </div>
            </Panel>
        </div>
        </div>
    );
};
