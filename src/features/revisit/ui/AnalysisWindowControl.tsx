/**
 * AnalysisWindowControl — the analysis window, beside the thing it is the axis of.
 *
 * ── WHY IT LEFT THE CONSTELLATION PANEL ─────────────────────────────────────
 * `Duration h` and `Step s` sat under `Constellation settings`, whose own
 * subtitle had to end with "and analysis window" — the admission that they did
 * not belong. They describe the CALCULATION, not the constellation, and the
 * duration is quite literally the axis of the coverage ribbon below: the
 * timeline runs 00:00 → 72:00 because this field says 72.
 *
 * ── WHY THE TWO STAY TOGETHER ───────────────────────────────────────────────
 * They are not the same kind of parameter. The duration is a property of what
 * is observed; the step is a numerical-accuracy knob, and putting it beside a
 * timeline risks reading as "how the chart is drawn" rather than "how the
 * result is computed". Splitting them would be worse: `validateWindow` judges
 * them together, and the rule that matters — the step must be far below the
 * shortest pass — depends on the duration and the instrument. So they share one
 * surface, and the wording carries the distinction the layout cannot.
 *
 * Collapsed, this is a summary the reader can check without opening anything:
 * `Window · 72 h · 10 s`.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    MAX_STEP_SECONDS, MAX_WINDOW_HOURS, MIN_RELIABLE_WINDOW_HOURS, validateWindow,
} from '../analysis/accessIntervals';
import type { AnalysisWindow } from '../domain/types';

export interface AnalysisWindowControlProps {
    window: AnalysisWindow;
    onChange: (window: AnalysisWindow) => void;
}

const fieldClass =
    'w-full rounded border border-slate-600 bg-slate-900/70 px-1.5 py-1 text-[12px] '
    + 'font-bold text-slate-100 outline-none focus:border-amber-400/70';

/** Clamp a typed value, keeping the previous one for unparseable input. */
function bounded(raw: string, min: number, max: number, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

/** Gutter between the panel and the viewport edges, px. */
const GUTTER = 12;
const PANEL_WIDTH = 352;

export const AnalysisWindowControl: React.FC<AnalysisWindowControlProps> = ({
    window: analysisWindow, onChange,
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<React.CSSProperties | null>(null);

    /*
     * Portalled and fixed, not absolutely positioned inside the ribbon.
     *
     * The ribbon section is `overflow: hidden` — it has to be, the timeline
     * draws to its edges — so an in-flow popup is clipped away entirely. It was:
     * the panel measured as visible in the DOM and appeared nowhere on screen.
     * It also opens UPWARD, because this control lives at the bottom of the
     * viewport and a downward panel falls off it.
     */
    const reposition = useCallback(() => {
        const anchor = containerRef.current;
        if (!anchor || typeof globalThis.window === 'undefined') return;
        const rect = anchor.getBoundingClientRect();
        const width = Math.min(PANEL_WIDTH, globalThis.window.innerWidth - GUTTER * 2);
        const left = Math.min(
            Math.max(rect.right - width, GUTTER),
            Math.max(GUTTER, globalThis.window.innerWidth - width - GUTTER),
        );
        setPosition({
            position: 'fixed',
            left,
            bottom: Math.max(GUTTER, globalThis.window.innerHeight - rect.top + 6),
            width,
        });
    }, []);

    useLayoutEffect(() => {
        if (!open) return;
        reposition();
        globalThis.window.addEventListener('resize', reposition);
        return () => globalThis.window.removeEventListener('resize', reposition);
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const patch = (next: Partial<AnalysisWindow>) => onChange({ ...analysisWindow, ...next });
    // The engine's own judgement, not a second opinion written here: the same
    // function the worker validates against supplies the warnings.
    const { warnings } = validateWindow(analysisWindow);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                aria-expanded={open}
                aria-label="Analysis window settings"
                onClick={() => setOpen((current) => !current)}
                className="min-h-8 rounded border border-slate-700 px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-400 transition-colors hover:border-sky-400/50 hover:text-sky-200"
            >
                Window · {analysisWindow.durationHours} h · {analysisWindow.stepSeconds} s
                {warnings.length > 0 && <span className="ml-1 text-amber-300">!</span>}
            </button>

            {open && position && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-label="Analysis window"
                    style={position}
                    className="revisit-shell z-[95] rounded-lg border border-sky-400/30 bg-slate-950/95 p-3 shadow-2xl"
                >
                    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Analysis window
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                                Duration h
                            </span>
                            <input
                                aria-label="Duration h"
                                type="number" min={1} max={MAX_WINDOW_HOURS} step={1}
                                className={fieldClass}
                                value={analysisWindow.durationHours}
                                onChange={(event) => patch({
                                    durationHours: bounded(
                                        event.target.value, 1, MAX_WINDOW_HOURS,
                                        analysisWindow.durationHours,
                                    ),
                                })}
                            />
                            <span className="text-[11px] leading-4 text-slate-600">
                                what the timeline spans · below {MIN_RELIABLE_WINDOW_HOURS} h is unreliable
                            </span>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
                                Step s
                            </span>
                            <input
                                aria-label="Step s"
                                type="number" min={1} max={MAX_STEP_SECONDS} step={1}
                                className={fieldClass}
                                value={analysisWindow.stepSeconds}
                                onChange={(event) => patch({
                                    stepSeconds: bounded(
                                        event.target.value, 1, MAX_STEP_SECONDS,
                                        analysisWindow.stepSeconds,
                                    ),
                                })}
                            />
                            {/*
                              * Says what it is, because the neighbouring field is
                              * about the view and this one is not: it changes the
                              * computation, and a pass shorter than the step is
                              * not drawn coarsely — it is not found at all.
                              */}
                            <span className="text-[11px] leading-4 text-slate-600">
                                sampling accuracy, not display · must be ≪ shortest pass
                            </span>
                        </label>
                    </div>
                    {warnings.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            {warnings.map((warning) => (
                                <li key={warning} className="text-[11px] leading-4 text-amber-200/80">
                                    {warning}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
};
