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

import React, { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { RevisitScenario } from '../domain/types';
import {
    FOV_PRESET_SWATH_KM, fovPresetNameFor, swathKmForFov, type FovPresetName,
} from '../domain/presets';
import { useLocationSearch, type LocationResult } from '../../../hooks/useLocationSearch';
import InlineLocationSearchInput from '../../../components/commercial/InlineLocationSearchInput';
import InlineSearchResultsPopover from '../../../components/commercial/InlineSearchResultsPopover';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';
import { isValidLatDeg, isValidLonDeg, type AreaTarget } from '../domain/areaTarget';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { AreaPanel } from './AreaPanel';
import { AdvancedDrawer } from './AdvancedDrawer';
import { ModelProvenance, type ModelProvenanceProps } from './ModelProvenance';
import {
    REFERENCE_POINT_ID, type RevisitAnalysisContext, type RevisitComparisonPoint,
} from '../domain/analysisTargets';

/** Shared by every dismissable popover in this header: close when a pointer
 * goes down outside `ref`'s subtree, while `enabled`. */
function useClickOutside(
    ref: React.RefObject<HTMLElement | null>,
    onOutside: () => void,
    enabled: boolean,
): void {
    useEffect(() => {
        if (!enabled) return;
        const handlePointerDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) onOutside();
        };
        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [ref, onOutside, enabled]);
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
    analysisContext?: RevisitAnalysisContext;
    onAnalysisContextChange?: (context: RevisitAnalysisContext) => void;
    comparisonPoints?: RevisitComparisonPoint[];
    pendingComparisonPointIds?: string[];
    selectedPointId?: typeof REFERENCE_POINT_ID | string;
    onSelectedPointChange?: (id: typeof REFERENCE_POINT_ID | string) => void;
    onSecondaryPointChange?: (id: string, latDeg: number, lonDeg: number, name?: string) => void;
    onSecondaryPointTargetChange?: (id: string, name: string) => void;
    onRemoveSecondaryPoint?: (id: string) => void;
    onAddComparisonPoint?: () => void;
    customArea?: AreaTarget | null;
    customAreaCellCount?: number | null;
    areaAnalysis?: AreaAnalysis | null;
    areaIsRunning?: boolean;
    areaError?: string | null;
    areaProgress?: number | null;
    areaRequirementMs?: number;
    onClearArea?: () => void;
    onCancelArea?: () => void;
    onExportAreaCsv?: () => void;
    isDrawingArea?: boolean;
    onCustomAreaChange?: (area: AreaTarget | null) => void;
    onStartAreaDrawing?: () => void;
    onFinishAreaDrawing?: () => void;
    onUndoAreaVertex?: () => void;
    isAreaScenarioSettling?: boolean;
    onAdvancedScenarioChange?: (scenario: RevisitScenario) => void;
    modelValidation?: Omit<ModelProvenanceProps, 'reference' | 'variant'>;
    /** Set when the chosen count has a better plane split than another at the same count. */
    spreadNote: string | null;
}

const Panel: React.FC<{
    label: string; children: React.ReactNode; emphasised?: boolean; className?: string;
}> = ({ label, children, emphasised, className = '' }) => (
    <div
        data-revisit-context-panel={label.toLowerCase().replace(/\s+/g, '-')}
        className={[
            REVISIT_PANEL,
            'revisit-context-panel px-3 py-2 md:px-4 md:py-3',
            emphasised ? 'border-amber-400/60 bg-amber-500/10' : '',
            className,
        ].join(' ')}
    >
        <span className={REVISIT_LABEL}>{label}</span>
        <div className="mt-1">{children}</div>
    </div>
);

const Arrow = () => (
    <span aria-hidden="true" className="hidden select-none items-center text-lg text-amber-500/50 md:flex">→</span>
);

/** Coordinate picks use the coordinates as their stable value. Avoid printing
 * them twice when the detail line immediately below already carries the exact
 * latitude/longitude. */
function targetOptionLabel(name: string): string {
    return /^\d+(?:\.\d+)?°[NS]\s+\d+(?:\.\d+)?°[EW]$/.test(name)
        ? 'Custom point'
        : name;
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
        <div ref={menuRef} className="relative shrink-0 text-[9px] text-slate-400">
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
                className="flex h-7 w-7 cursor-pointer list-none select-none items-center justify-center rounded border border-slate-700 text-sm font-black leading-none hover:border-sky-400/50 hover:text-sky-300 [&::-webkit-details-marker]:hidden"
            >
                <span aria-hidden="true">…</span>
            </button>
            {isOpen && <div role="dialog" aria-label={summaryLabel} className="absolute right-0 top-[calc(100%+0.25rem)] z-50 w-[min(18rem,calc(100vw-2rem))] space-y-2 rounded-lg border border-slate-700 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur-md">
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-300">{summaryLabel}</div>
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

                <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.1em] text-slate-600">
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
                            className="w-full rounded border border-slate-700 bg-slate-950/80 px-1.5 py-1 text-[10px] tabular-nums text-slate-200 outline-none focus:border-amber-400/60 aria-[invalid=true]:border-rose-500/70"
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
                            className="w-full rounded border border-slate-700 bg-slate-950/80 px-1.5 py-1 text-[10px] tabular-nums text-slate-200 outline-none focus:border-amber-400/60 aria-[invalid=true]:border-rose-500/70"
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
                    {coordinateLabel === 'Target'
                        ? 'You can also click the globe to move the reference.'
                        : 'You can also Shift-click the globe to add a comparison point.'}
                </p>
            </div>}
        </div>
    );
};

export const RevisitHeader: React.FC<RevisitHeaderProps> = ({
    scenario, payloadCounts, currentPayloadCount, onPayloadCountChange,
    targetNames, onTargetChange, onTargetCoordinatesChange,
    onInstrumentPresetChange, spreadNote, analysisContext = 'POINTS',
    onAnalysisContextChange = () => undefined, comparisonPoints = [],
    pendingComparisonPointIds = [],
    selectedPointId = REFERENCE_POINT_ID, onSelectedPointChange = () => undefined,
    onSecondaryPointChange = () => undefined,
    onSecondaryPointTargetChange = () => undefined,
    onRemoveSecondaryPoint = () => undefined,
    onAddComparisonPoint = () => undefined,
    customArea = null, customAreaCellCount = null,
    areaAnalysis = null, areaIsRunning = false, areaError = null, areaProgress = null,
    areaRequirementMs = 2 * 3600_000,
    onClearArea = () => undefined, onCancelArea = () => undefined,
    onExportAreaCsv = () => undefined, isDrawingArea = false,
    onCustomAreaChange = () => undefined, onStartAreaDrawing = () => undefined,
    onFinishAreaDrawing = () => undefined, onUndoAreaVertex = () => undefined,
    isAreaScenarioSettling = false,
    onAdvancedScenarioChange = () => undefined,
    modelValidation,
}) => {
    const areaMenuRef = useRef<HTMLDivElement>(null);
    const constellationMenuRef = useRef<HTMLDivElement>(null);
    const [areaMenuOpen, setAreaMenuOpen] = useState(false);
    const [constellationMenuOpen, setConstellationMenuOpen] = useState(false);
    const [modelValidationMenuOpen, setModelValidationMenuOpen] = useState(false);
    const { reference, target, payload } = scenario;
    const presetName = useMemo(
        () => fovPresetNameFor(reference.altitudeKm, payload),
        [reference.altitudeKm, payload]
    );
    const swathKm = useMemo(
        () => Math.round(swathKmForFov(reference.altitudeKm, payload)),
        [reference.altitudeKm, payload]
    );
    const sliderIndex = Math.max(0, payloadCounts.indexOf(currentPayloadCount));
    const activeSatelliteCount = reference.planes * reference.satsPerPlane;
    const spareSatelliteCount = (reference.sparesPerPlane ?? [])
        .reduce((sum, count) => sum + count, 0);
    const totalSatelliteCount = activeSatelliteCount + spareSatelliteCount;
    useEffect(() => {
        if (analysisContext !== 'AREA') setAreaMenuOpen(false);
    }, [analysisContext]);
    const closeAreaMenu = useCallback(() => setAreaMenuOpen(false), []);
    // The globe is the drawing surface. Clicking it must not dismiss the
    // editor that contains Undo and Finish polygon.
    useClickOutside(areaMenuRef, closeAreaMenu, areaMenuOpen && !isDrawingArea);
    const closeConstellationMenus = useCallback(() => {
        setConstellationMenuOpen(false);
        setModelValidationMenuOpen(false);
    }, []);
    useClickOutside(
        constellationMenuRef, closeConstellationMenus,
        constellationMenuOpen || modelValidationMenuOpen,
    );
    return (
        <div
            data-revisit-context-bar
            className="revisit-context-bar grid grid-cols-2 items-stretch gap-2 md:flex"
        >
            <Panel label="Constellation" className="relative z-50 min-w-0 md:min-w-[190px]">
                <div ref={constellationMenuRef} className="relative">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="text-sm font-bold text-slate-100 md:text-base">
                                {reference.planes} × {reference.satsPerPlane}
                                <span className="ml-2 text-xs font-semibold text-slate-400">
                                    {reference.pattern}
                                </span>
                            </div>
                            {modelValidation && (
                                <button
                                    type="button"
                                    aria-label="Open model and validation"
                                    title="Open model and validation"
                                    aria-haspopup="dialog"
                                    aria-expanded={modelValidationMenuOpen}
                                    onClick={() => {
                                        setConstellationMenuOpen(false);
                                        setModelValidationMenuOpen((open) => !open);
                                    }}
                                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${modelValidation.profile?.isAuthoritative
                                    ? 'border-lime-400/35 bg-lime-400/10 text-lime-200'
                                    : 'border-amber-400/35 bg-amber-400/10 text-amber-200'}`}
                                >
                                    <span className={`h-1.5 w-1.5 rounded-full ${modelValidation.profile?.isAuthoritative ? 'bg-lime-400' : 'bg-amber-400'}`} aria-hidden="true" />
                                    {modelValidation.profile?.isAuthoritative
                                        ? 'Validated model'
                                        : modelValidation.profile
                                            ? 'Illustrative model'
                                            : 'Custom constellation'}
                                </button>
                            )}
                        </div>
                        <div className="revisit-context-detail text-[11px] text-slate-400">
                            {reference.inclinationDeg}° · {reference.altitudeKm} km ·{' '}
                            {spareSatelliteCount > 0
                                ? `${activeSatelliteCount} active + ${spareSatelliteCount} spare · ${totalSatelliteCount} total`
                                : `${activeSatelliteCount} active`}
                        </div>
                        <button
                            type="button"
                            aria-label="Advanced constellation settings"
                            title="Advanced constellation settings"
                            aria-haspopup="dialog"
                            aria-expanded={constellationMenuOpen}
                            onClick={() => {
                                setModelValidationMenuOpen(false);
                                setConstellationMenuOpen((open) => !open);
                            }}
                            className="mt-2 flex min-h-7 w-full items-center justify-between rounded border border-slate-700 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-amber-200 hover:border-amber-400/50 hover:bg-amber-400/5"
                        >
                            <span>Constellation settings</span>
                            <span aria-hidden="true" className="text-sm leading-none">…</span>
                        </button>
                    </div>
                    {constellationMenuOpen && (
                        <div
                            role="dialog"
                            aria-label="Advanced constellation settings"
                            className="absolute left-0 top-[calc(100%+0.35rem)] z-[80] max-h-[min(74vh,42rem)] w-[min(36rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-amber-400/35 bg-slate-950/95 shadow-2xl backdrop-blur-md"
                        >
                            <AdvancedDrawer
                                scenario={scenario}
                                onChange={onAdvancedScenarioChange}
                                variant="menu"
                            />
                        </div>
                    )}
                    {modelValidationMenuOpen && modelValidation && (
                        <div
                            role="dialog"
                            aria-label="Model & validation"
                            className="absolute left-0 top-[calc(100%+0.35rem)] z-[80] max-h-[min(74vh,42rem)] w-[min(30rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-lime-400/35 bg-slate-950/95 shadow-2xl backdrop-blur-md"
                        >
                            <section className="px-3 py-3" aria-label="Model validation evidence">
                                <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-700/60 pb-2">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-lime-200">
                                            Model &amp; validation
                                        </p>
                                        <p className="mt-0.5 text-[9px] text-slate-500">
                                            Evidence, assumptions and calibration
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label="Close model and validation"
                                        onClick={() => setModelValidationMenuOpen(false)}
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                                    >×</button>
                                </div>
                                <ModelProvenance
                                    reference={scenario.reference}
                                    {...modelValidation}
                                    variant="dialog"
                                />
                            </section>
                        </div>
                    )}
                </div>
            </Panel>

            <Arrow />

            <Panel label="Hosted payloads" emphasised className="order-3 col-span-2 min-w-0 md:order-none md:flex-1 md:min-w-[280px]">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black leading-none text-amber-300 tabular-nums md:text-3xl">
                            {currentPayloadCount}
                        </span>
                        <span className="text-[11px] font-semibold text-amber-200/70">
                            of {reference.planes * reference.satsPerPlane}
                        </span>
                    </div>
                    {onInstrumentPresetChange && (
                        <label className="flex min-w-[160px] flex-col gap-0.5 md:min-w-[190px]">
                            <span className="text-[8px] font-black uppercase tracking-[0.12em] text-amber-200/70">
                                EO/IR swath
                            </span>
                            <select
                                aria-label="Instrument preset"
                                className="min-h-8 rounded border border-amber-400/40 bg-transparent px-2 py-1 text-sm font-black text-amber-200 outline-none md:text-base"
                                value={presetName ?? 'CUSTOM'}
                                onChange={(event) => {
                                    if (event.target.value !== 'CUSTOM') {
                                        onInstrumentPresetChange(event.target.value as FovPresetName);
                                    }
                                }}
                            >
                                {!presetName && <option value="CUSTOM">Custom · {swathKm} km</option>}
                                {(Object.keys(FOV_PRESET_SWATH_KM) as FovPresetName[]).map((name) => (
                                    <option key={name} value={name}>
                                        {name[0]}{name.slice(1).toLowerCase()} · {FOV_PRESET_SWATH_KM[name]} km
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
                <input
                    type="range"
                    className="mt-2 w-full accent-amber-400"
                    min={0}
                    max={Math.max(payloadCounts.length - 1, 0)}
                    step={1}
                    value={sliderIndex}
                    onChange={(e) => onPayloadCountChange(payloadCounts[Number(e.target.value)])}
                    aria-label="Number of hosted payloads"
                    aria-valuetext={`${currentPayloadCount} payloads`}
                />
                <div className="revisit-spread-note min-h-[14px] text-[10px] leading-[14px] text-amber-200/80">
                    {spreadNote}
                </div>
                <div className="text-[8px] leading-3 text-amber-200/70">
                    {presetName ? 'Illustrative EO/IR preset · not an instrument datasheet' : `Custom FOV · approx. ${swathKm} km swath`}
                </div>
            </Panel>

            <Arrow />

            <Panel label="Analysis target" className="relative z-40 min-w-0 md:min-w-[260px] md:max-w-[320px]">
                <div className="grid min-w-0 grid-cols-2 rounded border border-slate-700/70 bg-slate-950/45 p-0.5" role="tablist" aria-label="Analysis target context">
                        {(['POINTS', 'AREA'] as const).map((context) => (
                            <button
                                key={context}
                                type="button"
                                role="tab"
                                aria-selected={analysisContext === context}
                                onClick={() => onAnalysisContextChange(context)}
                                className={`rounded px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${analysisContext === context
                                    ? context === 'AREA'
                                        ? 'bg-sky-200 text-sky-950 dark:bg-sky-300/60 dark:text-slate-950'
                                        : 'bg-amber-200 text-amber-950 dark:bg-amber-300/60 dark:text-slate-950'
                                    : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {context === 'POINTS' ? `Points ${comparisonPoints.length + pendingComparisonPointIds.length + 1}` : 'Area'}
                            </button>
                        ))}
                </div>

                {analysisContext === 'POINTS' ? (
                    <div className="mt-1.5 space-y-1">
                        <div className={`rounded border px-1.5 py-1 ${selectedPointId === REFERENCE_POINT_ID ? 'border-amber-400/50 bg-amber-400/8' : 'border-slate-800'}`}>
                            <div className="flex min-w-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => onSelectedPointChange(REFERENCE_POINT_ID)}
                                    aria-pressed={selectedPointId === REFERENCE_POINT_ID}
                                    className="w-[88px] shrink-0 text-left"
                                >
                                    <span className="block text-[8px] font-black uppercase tracking-wide text-amber-300">Reference</span>
                                    <span className="block text-[8px] tabular-nums text-slate-400">
                                        {target.latDeg.toFixed(2)}° · {target.lonDeg.toFixed(2)}°
                                    </span>
                                </button>
                                <div className="relative min-w-0 flex-1">
                                    <select
                                        className="w-full appearance-none truncate bg-transparent py-0.5 pl-0 pr-5 text-[10px] font-bold text-slate-300 outline-none"
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
                                        summaryLabel="Set reference location"
                                        roleLabel="Reference"
                                        coordinateLabel="Target"
                                        onOpen={() => onSelectedPointChange(REFERENCE_POINT_ID)}
                                        onApply={(latDeg, lonDeg, name) => onTargetCoordinatesChange(latDeg, lonDeg, name)}
                                    />
                                )}
                            </div>
                        </div>

                        {[
                            ...comparisonPoints.map((point) => ({ id: point.id, target: point.target })),
                            ...pendingComparisonPointIds.map((id) => ({ id, target: null })),
                        ].map((point, index) => {
                            const pointTargetNames = point.target && !targetNames.includes(point.target.name)
                                ? [...targetNames, point.target.name]
                                : targetNames;
                            const targetName = point.target?.name ?? '';
                            return (
                            <div key={point.id} className={`flex min-w-0 items-center gap-1 rounded border px-1.5 py-1 ${selectedPointId === point.id ? 'border-sky-400/50 bg-sky-400/8' : 'border-slate-800'}`}>
                                <button
                                    type="button"
                                    onClick={() => onSelectedPointChange(point.id)}
                                    aria-pressed={selectedPointId === point.id}
                                    className="w-[88px] shrink-0 text-left"
                                >
                                    <span className="block text-[8px] font-black uppercase tracking-wide text-sky-700 dark:text-sky-300">Comparison {index + 1}</span>
                                    <span className="block text-[8px] tabular-nums text-slate-400">
                                        {point.target
                                            ? `${point.target.latDeg.toFixed(2)}° · ${point.target.lonDeg.toFixed(2)}°`
                                            : 'Not set'}
                                    </span>
                                </button>
                                <div className="relative min-w-0 flex-1">
                                    <select
                                        className="w-full appearance-none truncate bg-transparent py-0.5 pl-0 pr-5 text-[10px] font-bold text-slate-300 outline-none"
                                        value={targetName}
                                        onChange={(event) => onSecondaryPointTargetChange(point.id, event.target.value)}
                                        aria-label={`Comparison ${index + 1} target`}
                                    >
                                        {!point.target && <option value="" disabled className="bg-slate-900">Choose site…</option>}
                                        {pointTargetNames.map((name) => (
                                            <option key={name} value={name} className="bg-slate-900">
                                                {targetOptionLabel(name) === 'Custom point' ? 'Select site…' : targetOptionLabel(name)}
                                            </option>
                                        ))}
                                    </select>
                                    <span aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-slate-500">⌄</span>
                                </div>
                                <TargetEditor
                                    key={point.id}
                                    latitude={point.target?.latDeg}
                                    longitude={point.target?.lonDeg}
                                    summaryLabel={`Set comparison ${index + 1} location`}
                                    roleLabel="Comparison"
                                    coordinateLabel={`Comparison ${index + 1}`}
                                    onOpen={() => onSelectedPointChange(point.id)}
                                    onApply={(latDeg, lonDeg, name) => onSecondaryPointChange(point.id, latDeg, lonDeg, name)}
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemoveSecondaryPoint(point.id)}
                                    aria-label={`Remove comparison point ${index + 1}`}
                                    className="h-7 w-7 shrink-0 rounded text-slate-500 hover:bg-rose-400/10 hover:text-rose-300"
                                >×</button>
                            </div>
                        )})}
                        {comparisonPoints.length + pendingComparisonPointIds.length < 2 && (
                            <button
                                type="button"
                                aria-label="Add comparison point"
                                onClick={onAddComparisonPoint}
                                className="flex min-h-7 w-full items-center justify-center gap-1 rounded border border-slate-700 px-2 text-[8px] font-black uppercase tracking-[0.08em] text-sky-700 hover:border-sky-400/50 dark:text-sky-300"
                            >
                                <span aria-hidden="true">+</span>
                                Add comparison point
                            </button>
                        )}
                    </div>
                ) : (
                    <div ref={areaMenuRef} className="relative mt-1.5">
                        <div className="flex items-center gap-1 rounded border border-sky-400/30 bg-sky-400/8 px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                                <div className={`truncate text-[11px] font-bold ${customArea ? 'text-sky-900 dark:text-sky-100' : 'text-slate-300'}`}>
                                    {customArea?.name ?? 'No area configured'}
                                </div>
                                <div className="mt-0.5 truncate text-[9px] text-slate-400">
                                    {customArea
                                        ? `${customArea.boundary.length} vertices · ${customAreaCellCount === null ? 'not analysed' : `${customAreaCellCount} cells`} · grid ${customArea.gridSpacingDeg}°`
                                        : 'Draw, import or select an area'}
                                </div>
                            </div>
                            <button
                                type="button"
                                aria-label="Define area target"
                                title="Define area target"
                                aria-haspopup="dialog"
                                aria-expanded={areaMenuOpen}
                                onClick={() => setAreaMenuOpen((open) => !open)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-700 text-sm font-black leading-none text-sky-700 hover:border-sky-400/50 dark:text-sky-300"
                            ><span aria-hidden="true">…</span></button>
                        </div>
                        {areaMenuOpen && (
                            <div role="dialog" aria-label="Define area target"
                                className="absolute right-0 top-[calc(100%+0.25rem)] z-[70] max-h-[min(70vh,38rem)] w-[min(27rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-sky-400/35 bg-slate-950/95 shadow-2xl backdrop-blur-md">
                                <AreaPanel
                                    scenario={scenario}
                                    analysis={areaAnalysis}
                                    isRunning={areaIsRunning}
                                    error={areaError}
                                    progress={areaProgress}
                                    requirementMs={areaRequirementMs}
                                    onClear={onClearArea}
                                    onCancel={onCancelArea}
                                    onExportCsv={onExportAreaCsv}
                                    customArea={customArea}
                                    isDrawing={isDrawingArea}
                                    onCustomAreaChange={onCustomAreaChange}
                                    onStartDrawing={onStartAreaDrawing}
                                    onFinishDrawing={onFinishAreaDrawing}
                                    onUndoVertex={onUndoAreaVertex}
                                    showAnalysisSummary={false}
                                    isScenarioSettling={isAreaScenarioSettling}
                                    variant="menu"
                                />
                            </div>
                        )}
                    </div>
                )}
            </Panel>
        </div>
    );
};
