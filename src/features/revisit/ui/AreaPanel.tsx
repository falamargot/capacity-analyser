/**
 * AreaPanel — EDIT an area target and expose automatic analysis status.
 *
 * Every cell is a full engine run, so intermediate drawing states never start
 * work. A valid, stable polygon is analysed automatically by RevisitApp after
 * drawing, import or coordinate-list application.
 *
 * ── WHY THE ORDER IS WHAT IT IS ─────────────────────────────────────────────
 * This panel used to be the ENTRY point: `+ Add target › Polygon` opened it,
 * and the first two things a user met were a pre-filled name and a grid spacing
 * derived from the swath — parameters — with `Draw on globe` as one button
 * among three below them. The polygon menu now goes straight to the globe, so
 * what remains here is the editor: the boundary first, because that is what
 * someone opening it came to change, and the metadata after it.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import {
    recommendedAreaGridSpacing, recommendedAreaGridSpacingForBoundary, validateArea, type AreaTarget,
} from '../domain/areaTarget';
import {
    areaCoordinateList, createCustomArea, MAX_AREA_IMPORT_BYTES,
    parseAreaCoordinateList, parseAreaGeoJson,
} from '../domain/areaImport';
import type { RevisitScenario } from '../domain/types';
import { heatLegendStops } from '../render/heatMapColors';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface AreaPanelProps {
    scenario: RevisitScenario;
    analysis: AreaAnalysis | null;
    isRunning: boolean;
    error: string | null;
    /** 0–1 while running, null when idle. */
    progress: number | null;
    requirementMs: number;
    onClear: () => void;
    onCancel: () => void;
    customArea: AreaTarget | null;
    isDrawing: boolean;
    onCustomAreaChange: (area: AreaTarget | null) => void;
    onStartDrawing: () => void;
    onFinishDrawing: () => void;
    onUndoVertex: () => void;
    showAnalysisSummary?: boolean;
    /** Prevent a run against an automatic topology that is about to be replaced. */
    isScenarioSettling?: boolean;
    /** Header popovers provide their own floating surface. */
    variant?: 'panel' | 'menu';
    /**
     * Open the coordinate editor on mount. Set when the panel was reached by
     * "Import or paste a boundary instead" from the drawing toolbar: that
     * request already said what the user came to do, and making them open the
     * disclosure as well would be the ceremony the drawing path was relieved
     * of. Everywhere else it stays collapsed — it is then a way to REPLACE a
     * boundary already on screen, and should not shout.
     */
    initialPasteExpanded?: boolean;
}

export const AreaPanel: React.FC<AreaPanelProps> = ({
    scenario, analysis, isRunning, error, progress, requirementMs,
    onClear, onCancel, customArea, isDrawing,
    onCustomAreaChange, onStartDrawing, onFinishDrawing, onUndoVertex,
    showAnalysisSummary = true,
    isScenarioSettling = false,
    variant = 'panel',
    initialPasteExpanded = false,
}) => {
    const unbounded = analysis !== null && analysis.neverInViewCount > 0;
    const fileRef = useRef<HTMLInputElement>(null);
    const defaultSpacing = useMemo(
        () => recommendedAreaGridSpacing(scenario.reference, scenario.payload),
        [scenario.reference, scenario.payload]
    );
    const [coordinateText, setCoordinateText] = useState(
        () => areaCoordinateList(customArea?.boundary ?? [])
    );
    const [editorMessage, setEditorMessage] = useState<string | null>(null);
    useEffect(() => {
        setCoordinateText(areaCoordinateList(customArea?.boundary ?? []));
    }, [customArea?.boundary]);
    /* Uncontrolled after mount: applying a list must not collapse the box the
       user is working in, and the summary keeps toggling normally. */
    const [pasteOpen, setPasteOpen] = useState(initialPasteExpanded);
    /** An area nobody has started yet: no boundary, and nothing to report on. */
    const hasNoBoundary = (customArea?.boundary.length ?? 0) === 0;
    const customValidation = useMemo(
        () => customArea
            ? validateArea(customArea, scenario.reference, scenario.payload)
            : null,
        [customArea, scenario.reference, scenario.payload]
    );

    const updateCustomArea = (patch: Partial<AreaTarget>) => {
        onCustomAreaChange({
            kind: 'AREA',
            id: customArea?.id ?? crypto.randomUUID(),
            name: customArea?.name ?? 'Custom area',
            boundary: customArea?.boundary ?? [],
            gridSpacingDeg: customArea?.gridSpacingDeg ?? defaultSpacing,
            ...patch,
        });
    };

    const applyCoordinateList = () => {
        try {
            const boundary = parseAreaCoordinateList(coordinateText);
            updateCustomArea({
                boundary,
                gridSpacingDeg: customArea?.gridSpacingDeg
                    ?? recommendedAreaGridSpacingForBoundary(scenario.reference, scenario.payload, boundary),
            });
            setEditorMessage(`${boundary.length} boundary points loaded. Analysis starts automatically.`);
        } catch (cause) {
            setEditorMessage(cause instanceof Error ? cause.message : String(cause));
        }
    };

    const importGeoJson = async (file: File | undefined) => {
        if (!file) return;
        try {
            if (file.size > MAX_AREA_IMPORT_BYTES) throw new Error('GeoJSON is limited to 1 MB.');
            const imported = parseAreaGeoJson(await file.text());
            onCustomAreaChange(createCustomArea(
                imported.name ?? (file.name.replace(/\.(geo)?json$/i, '') || 'Imported area'),
                imported.boundary,
                customArea?.gridSpacingDeg
                    ?? recommendedAreaGridSpacingForBoundary(
                        scenario.reference, scenario.payload, imported.boundary
                    ),
            ));
            setEditorMessage(`${imported.boundary.length} GeoJSON boundary points imported. Analysis starts automatically.`);
        } catch (cause) {
            setEditorMessage(cause instanceof Error ? cause.message : String(cause));
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    /* One editor, two presentations: open inline while no boundary exists,
       behind a disclosure once one does. */
    const coordinateEditor = (
        <>
            <textarea
                aria-label="Custom area coordinate list"
                rows={5}
                value={coordinateText}
                onChange={(event) => setCoordinateText(event.target.value)}
                placeholder={'latitude, longitude\n51.0, -2.0\n51.0, 2.0\n55.0, 2.0'}
                className="mt-1 w-full resize-y rounded border border-slate-700 bg-slate-950/70 p-1.5 font-mono text-[11px] leading-4 text-slate-200 outline-none focus:border-sky-400/60"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600">One latitude, longitude pair per line</span>
                <button type="button" onClick={applyCoordinateList} className="min-h-11 md:min-h-8 rounded border border-slate-600 px-2 text-[11px] font-black uppercase text-slate-300">Apply list</button>
            </div>
        </>
    );

    return (
        <section className={`${variant === 'panel' ? REVISIT_PANEL : ''} px-3 py-2.5`} aria-label="Area coverage">
            <div className="flex items-center justify-between gap-2">
                <span className={REVISIT_LABEL}>Area coverage</span>
                <div className="flex items-center gap-1.5">
                    {isRunning && (
                        <span className="text-[11px] tabular-nums text-slate-500">
                            {progress === null ? 'running cells…' : `${Math.round(progress * 100)}%`}
                        </span>
                    )}
                    {!isRunning && isScenarioSettling && (
                        <span className="text-[11px] text-sky-300">finalising topology…</span>
                    )}
                    {isRunning ? (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded border border-red-400/50 px-2 py-0.5 text-[11px] font-bold text-red-200 hover:bg-red-500/10"
                        >Cancel</button>
                    ) : null}
                </div>
            </div>

            {isRunning && progress !== null && (
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-slate-700/60">
                    <div
                        className="h-full bg-amber-400 transition-[width] duration-150"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>
            )}

            <div className="mt-2 border-t border-slate-700/50 pt-2">
                <div className="text-[11px] font-black uppercase tracking-[0.1em] text-sky-300">
                    Area boundary
                </div>
                <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1">
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={onStartDrawing}
                            className="min-h-11 md:min-h-8 rounded border border-sky-400/50 bg-sky-400/10 px-2 text-[11px] font-black uppercase tracking-wide text-sky-200 disabled:opacity-40"
                        >
                            {customArea?.boundary.length ? 'Redraw on globe' : 'Draw on globe'}
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            className="sr-only"
                            accept="application/geo+json,application/json,.geojson,.json"
                            aria-label="Import area GeoJSON"
                            onChange={(event) => void importGeoJson(event.target.files?.[0])}
                        />
                        <button
                            type="button"
                            disabled={isRunning || isDrawing}
                            onClick={() => fileRef.current?.click()}
                            className="min-h-11 md:min-h-8 rounded border border-slate-700 px-2 text-[11px] font-black uppercase tracking-wide text-slate-300 disabled:opacity-40"
                        >Import GeoJSON</button>
                        {customArea && (
                            <button
                                type="button"
                                disabled={isRunning}
                                onClick={() => {
                                    onCustomAreaChange(null);
                                    onClear();
                                    setEditorMessage('Custom area removed.');
                                }}
                                className="min-h-11 md:min-h-8 rounded px-2 text-[11px] font-black uppercase tracking-wide text-rose-300 disabled:opacity-40"
                            >Remove</button>
                        )}
                    </div>

                    {isDrawing && (
                        <div className="rounded border border-sky-400/40 bg-sky-400/10 p-2" role="status">
                            <p className="text-[12px] font-bold text-sky-100">
                                Click the globe to add vertices · {customArea?.boundary.length ?? 0} points
                            </p>
                            <p className="mt-0.5 text-[11px] text-sky-200/70">Camera rotation is paused while drawing.</p>
                            <div className="mt-1.5 flex gap-1">
                                <button type="button" disabled={!customArea?.boundary.length} onClick={onUndoVertex} className="min-h-11 md:min-h-8 rounded border border-slate-600 px-2 text-[11px] font-bold text-slate-200 disabled:opacity-30">Undo</button>
                                <button type="button" disabled={!customValidation?.ok} onClick={onFinishDrawing} className="min-h-11 md:min-h-8 rounded bg-sky-400/20 px-2 text-[11px] font-black text-sky-100 disabled:opacity-30">Finish polygon</button>
                            </div>
                        </div>
                    )}

                    {!isDrawing && (
                        <details open={pasteOpen} onToggle={(event) => setPasteOpen(event.currentTarget.open)}>
                            <summary className="cursor-pointer text-[11px] font-bold text-slate-400 hover:text-slate-300">Paste coordinate list</summary>
                            {coordinateEditor}
                        </details>
                    )}

                    {/*
                      * No error before the first gesture. An area with no
                      * boundary is not invalid input — it is an area nobody has
                      * started yet, and "needs at least 3 boundary points, got
                      * 0" was the app reporting a fault in a state it had
                      * created itself, in red, one second after the user asked
                      * for a polygon. Say what to do instead; validation starts
                      * at the first vertex.
                      */}
                    {hasNoBoundary ? (
                        <p aria-label="Custom area validation" aria-live="polite" className="text-[11px] leading-4 text-slate-400">
                            {isDrawing
                                ? 'Click the globe to place the first corner.'
                                : 'Draw the boundary on the globe, or import a GeoJSON or a coordinate list.'}
                        </p>
                    ) : customValidation && (
                        <div aria-label="Custom area validation" aria-live="polite" className="space-y-0.5">
                            {customValidation.ok && (
                                <p className="text-[11px] font-bold text-emerald-300">
                                    Ready · {customArea?.boundary.length} vertices · {customValidation.estimatedCells} cells
                                </p>
                            )}
                            {customValidation.errors.map((message) => <p key={message} className="text-[11px] leading-3 text-rose-300">{message}</p>)}
                            {customValidation.warnings.map((message) => <p key={message} className="text-[11px] leading-3 text-amber-200/80">{message}</p>)}
                        </div>
                    )}
                    {editorMessage && <p role="status" className="text-[11px] leading-3 text-slate-400">{editorMessage}</p>}

                    {/*
                      * Metadata, after the thing it names. Both fields arrive
                      * filled — the name from the role, the spacing derived from
                      * the swath by `recommendedAreaGridSpacing` — so neither is
                      * a step on the way to an area; they are adjustments to one
                      * that exists.
                      */}
                    <div className="border-t border-slate-800 pt-2">
                        <div className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Area settings
                        </div>
                        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_6.5rem] gap-1.5">
                            <label className="min-w-0">
                                <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Area name</span>
                                <input
                                    aria-label="Custom area name"
                                    maxLength={80}
                                    value={customArea?.name ?? 'Custom area'}
                                    onChange={(event) => updateCustomArea({ name: event.target.value })}
                                    className="w-full rounded border border-slate-700 bg-slate-950/70 px-1.5 py-1 text-[12px] text-slate-200 outline-none focus:border-sky-400/60"
                                />
                            </label>
                            <label>
                                <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Grid spacing °</span>
                                <input
                                    aria-label="Custom area grid spacing"
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    value={customArea?.gridSpacingDeg ?? defaultSpacing}
                                    onChange={(event) => updateCustomArea({ gridSpacingDeg: Number(event.target.value) })}
                                    className="w-full rounded border border-slate-700 bg-slate-950/70 px-1.5 py-1 text-[12px] tabular-nums text-slate-200 outline-none focus:border-sky-400/60"
                                />
                            </label>
                        </div>
                    </div>

                    <p className="text-[11px] leading-3 text-slate-500">
                        {isDrawing
                            ? 'Analysis will start after Finish polygon.'
                            : isScenarioSettling
                                ? 'Analysis is waiting for the final topology.'
                                : 'Valid area changes are analysed automatically · maximum 400 cells'}
                    </p>
                </div>
            </div>

            {error && <p className="mt-1.5 text-[12px] leading-4 text-red-300">{error}</p>}

            {analysis && showAnalysisSummary && (
                <>
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-2">
                        <div>
                            <span className={REVISIT_LABEL}>Least-covered cell</span>
                            <div className={`text-sm font-black tabular-nums ${unbounded ? 'text-violet-300' : 'text-white'}`}>
                                {unbounded ? 'never seen' : formatGap(analysis.worstCell?.maxGapMs ?? null)}
                            </div>
                        </div>
                        <div>
                            <span className={REVISIT_LABEL}>Mean cell</span>
                            <div className="text-sm font-bold tabular-nums text-slate-200">
                                {formatGap(analysis.meanCellMaxGapMs)}
                            </div>
                        </div>
                        <div>
                            <span className={REVISIT_LABEL}>Best cell</span>
                            <div className="text-sm font-bold tabular-nums text-slate-200">
                                {formatGap(analysis.bestCell?.maxGapMs ?? null)}
                            </div>
                        </div>
                    </div>

                    <p className="mt-1 text-[11px] leading-3 text-slate-500">
                        {analysis.area.name} · {analysis.cells.length} cells at {analysis.area.gridSpacingDeg}° ·
                        mean is over cells, not area
                    </p>

                    {/* Legend. The scale is anchored to the requirement, not to
                        this area's own range — see heatMapColors. */}
                    <div className="mt-1.5 flex items-center gap-2">
                        {heatLegendStops(requirementMs).map((stop) => (
                            <span key={stop.label} className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm" style={{ background: stop.css }} />
                                <span className="text-[11px] text-slate-500">{stop.label}</span>
                            </span>
                        ))}
                    </div>

                    {analysis.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-[11px] leading-3 text-amber-200/80">
                            {warning}
                        </p>
                    ))}

                </>
            )}
        </section>
    );
};
