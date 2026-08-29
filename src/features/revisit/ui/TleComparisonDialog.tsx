/**
 * TleComparisonDialog — the live-TLE characterisation, on its own surface.
 *
 * ── WHY A SIDE PANEL AND NOT A MODAL ───────────────────────────────────────
 * This measurement writes nothing. It changes no Walker parameter, no scenario,
 * no reported revisit — it reads a catalogue and reports what shape it has. It
 * was first inline in `Constellation settings`, which was wrong twice: it filled
 * a third of a settings panel with something that is not a setting, and it could
 * be opened and never closed.
 *
 * The modal that replaced it was wrong differently: it dimmed and blurred the
 * very panel the reader needs beside it. `12 × 53` is meaningless unless
 * `12 × 48` is legible at the same moment, and a modal makes the comparison a
 * memory exercise. So this is a NON-MODAL flyout hanging off the right edge of
 * the constellation panel: no backdrop, no focus trap, the panel stays open,
 * readable and interactive, and the button toggles the flyout open and shut.
 *
 * Staying open costs one thing, paid in `RevisitHeader`: the panel dismisses
 * itself on any pointer-down outside its subtree, and this flyout is portalled
 * out of it. It marks itself `data-revisit-panel-flyout`, which that handler
 * treats as inside.
 *
 * ── WHY PROVENANCE IS PART OF THE RESULT, NOT A FOOTNOTE ────────────────────
 * The `fetchTLE` ladder degrades silently — live, fresh cache, stale cache,
 * bundled file — which is what keeps the application booting on a filtered
 * network. The consequence here is that two measurements taken minutes apart
 * can legitimately disagree (observed: `6 excluded` then `9 excluded` across a
 * cache refresh). Without the rung and the instant on screen, that reads as an
 * unreliable tool rather than as a changing catalogue.
 *
 * Below `md`, and wherever the panel leaves no room beside it, this falls back
 * to a full-screen sheet: a 420 px flyout on a 375 px phone is a sheet with
 * extra steps.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WalkerFit } from '../calibration/fitWalker';
import type { CalibrationProvenance } from '../hooks/useOneWebCalibration';
import { DEFAULT_PROFILE } from '../domain/referenceProfiles';
import { REVISIT_MENU_SURFACE } from './revisitTheme';

export interface TleComparisonDialogProps {
    fit: WalkerFit | null;
    provenance: CalibrationProvenance | null;
    isRunning: boolean;
    error: string | null;
    /** Run the measurement again against whatever the ladder serves now. */
    onReMeasure: () => void;
    onClose: () => void;
    /** The launcher — used to locate the panel this flyout hangs off. */
    anchorRef?: React.RefObject<HTMLElement | null>;
}

/** Flyout width beside the panel, px. */
const FLYOUT_WIDTH = 420;
const GUTTER = 12;
/** Space between the constellation panel and the flyout, px. */
const OFFSET = 8;
/** Below this much free height beside the panel, the sheet is honest instead. */
const MIN_FLYOUT_HEIGHT = 280;

/** How each ladder rung must be described. Never "live" unless it was. */
const SOURCE_LABEL: Record<CalibrationProvenance['source'], string> = {
    live: 'CelesTrak, live',
    'cache-fresh': 'local cache, under 30 min old',
    'cache-stale': 'local cache, over 30 min old',
    bundled: 'file bundled with this build',
};

const SOURCE_TITLE: Record<CalibrationProvenance['source'], string> = {
    live: 'Fetched from CelesTrak during this measurement.',
    'cache-fresh': 'Served from the browser cache, written less than 30 minutes ago.',
    'cache-stale': 'CelesTrak could not be reached; the cached set was used instead. It may be hours or days old.',
    bundled: 'Neither CelesTrak nor a cache was available, so public/celestrak.txt was used. It ships with the build and can be weeks old.',
};

const UTC = (ms: number): string => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);

/** Signed difference, written the way a reader compares two figures. */
const signed = (value: number, digits = 0): string =>
    `${value >= 0 ? '+' : '\u2212'}${Math.abs(value).toFixed(digits)}`;

/**
 * Where the flyout sits beside the constellation panel, or `null` for the sheet.
 *
 * The anchor is the PANEL, not the button: the flyout is an extension of that
 * surface and must align with its top edge, not with a control halfway down it.
 * The button is only the handle used to find the panel in the DOM, because the
 * panel is owned by `RevisitHeader` and passing a ref down two component
 * boundaries to position a child of a child buys nothing.
 *
 * Right by preference, left when the right edge would overflow, sheet when
 * neither side has room — a flyout squeezed into 120 px is worse than a sheet.
 */
function flyoutPosition(button: HTMLElement | null): React.CSSProperties | null {
    if (!button || typeof window === 'undefined') return null;
    if (typeof window.matchMedia !== 'function') return null;
    if (!window.matchMedia('(min-width: 768px)').matches) return null;

    const panel = button.closest<HTMLElement>('[data-revisit-constellation-panel]') ?? button;
    const rect = panel.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    const width = Math.min(FLYOUT_WIDTH, window.innerWidth - GUTTER * 2);
    const rightEdge = rect.right + OFFSET + width + GUTTER;
    const leftFits = rect.left - OFFSET - width >= GUTTER;
    const left = rightEdge <= window.innerWidth
        ? rect.right + OFFSET
        : leftFits
            ? rect.left - OFFSET - width
            : null;
    if (left === null) return null;

    const top = Math.max(GUTTER, Math.min(
        rect.top,
        window.innerHeight - GUTTER - MIN_FLYOUT_HEIGHT,
    ));
    const maxHeight = window.innerHeight - top - GUTTER;
    if (maxHeight < MIN_FLYOUT_HEIGHT) return null;
    return { top, left, width, maxHeight };
}

const Row: React.FC<{ label: string; children: React.ReactNode; title?: string }> = ({
    label, children, title,
}) => (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5" title={title}>
        <span className="w-[7.5rem] shrink-0 text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
            {label}
        </span>
        <span className="min-w-0 flex-1 text-[12px] leading-4 text-slate-300">{children}</span>
    </div>
);

export const TleComparisonDialog: React.FC<TleComparisonDialogProps> = ({
    fit, provenance, isRunning, error, onReMeasure, onClose, anchorRef,
}) => {
    const panelRef = useRef<HTMLElement | null>(null);
    const [position, setPosition] = useState<React.CSSProperties | null>(null);

    const reposition = useCallback(
        () => setPosition(flyoutPosition(anchorRef?.current ?? null)),
        [anchorRef],
    );
    useLayoutEffect(() => {
        reposition();
        window.addEventListener('resize', reposition);
        return () => window.removeEventListener('resize', reposition);
    }, [reposition]);

    /*
     * Escape closes, and that is the whole keyboard contract. No focus trap and
     * no autofocus: this panel is NOT modal — the constellation settings beside
     * it stay operable, and stealing focus out of a field the user was editing
     * to a panel they only asked to read would be a regression, not a courtesy.
     */
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (typeof document === 'undefined') return null;

    const hld = DEFAULT_PROFILE.spec;

    return createPortal(
        /*
         * `pointer-events-none` on the wrapper with `pointer-events-auto` on the
         * panel: the flyout is an overlay in the layer sense only. Everything it
         * does not cover — the constellation panel, the globe, the timeline —
         * keeps receiving clicks, which is what "non-modal" has to mean in
         * practice and not only in the ARIA attribute.
         */
        <div
            className={position
                ? 'revisit-shell pointer-events-none fixed inset-0 z-[85]'
                : 'revisit-shell fixed inset-0 z-[85]'}
            data-testid="tle-comparison-dialog"
            data-revisit-panel-flyout
        >
            {/* Only the sheet gets a scrim: at that size it does cover the panel,
                so there is nothing behind it left to read. */}
            {!position && (
                <button
                    type="button"
                    aria-label="Dismiss TLE comparison"
                    onClick={onClose}
                    className="absolute inset-0 h-full w-full cursor-default bg-slate-950/65 backdrop-blur-[2px]"
                />
            )}
            <aside
                ref={panelRef}
                role="region"
                aria-labelledby="revisit-tle-comparison-title"
                data-revisit-dialog-shape={position ? 'flyout' : 'sheet'}
                style={position ?? undefined}
                className={position
                    ? `pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border border-sky-400/30 text-slate-100 shadow-[0_28px_70px_rgba(0,0,0,0.55)] ${REVISIT_MENU_SURFACE}`
                    : `absolute inset-0 flex flex-col border-0 text-slate-100 ${REVISIT_MENU_SURFACE}`}
            >
                <header className="flex items-start justify-between gap-3 border-b border-slate-700/70 px-4 py-3">
                    <div className="min-w-0">
                        <h2
                            id="revisit-tle-comparison-title"
                            className="text-[13px] font-black uppercase tracking-[0.08em]"
                        >
                            TLE shell characterisation
                        </h2>
                        {/*
                          * Stated at the top, not in a footnote: the whole risk
                          * this dialog manages is a reader taking the fitted
                          * shell for the constellation being analysed.
                          */}
                        <p className="mt-1 text-[12px] leading-4 text-slate-400">
                            What shape the real catalogue has. Nothing here changes the
                            analysed constellation.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close TLE comparison"
                        className="min-h-10 min-w-10 shrink-0 rounded border border-slate-700 text-lg text-slate-300 hover:border-sky-400/50 hover:text-white"
                    >×</button>
                </header>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                    {isRunning && (
                        <p className="text-[12px] leading-4 text-sky-300">
                            Measuring… fetching the OneWeb catalogue and fitting a Walker shell
                            to it. This reaches the network and can take a few seconds.
                        </p>
                    )}

                    {error && !isRunning && (
                        <p className="text-[12px] leading-4 text-red-300">{error}</p>
                    )}

                    {fit && !isRunning && (
                        <>
                            <div className="space-y-1">
                                <p className="text-sky-300">
                                    Real fleet vs perfect shell · {fit.alongTrackRmsKm.toFixed(0)} km
                                    {' '}RMS along-track
                                </p>
                                <p className="text-[11px] leading-4 text-slate-500">
                                    single-epoch mean-element fit · not trajectory-validated
                                </p>
                            </div>

                            <div className="space-y-1 border-t border-slate-700/50 pt-2">
                                <Row label="Fitted shell">
                                    {fit.spec.planes} × {fit.spec.satsPerPlane} ·{' '}
                                    {fit.spec.altitudeKm.toFixed(1)} km ·{' '}
                                    {fit.spec.inclinationDeg.toFixed(2)}°
                                </Row>
                                <Row
                                    label="vs HLD"
                                    title={`The Walker shell fitted to the TLE set, against ${DEFAULT_PROFILE.label}. The fitted shell carries no plane-altitude ladder, no RAAN seam and no spares — a single-epoch fit cannot recover them.`}
                                >
                                    {hld.planes} × {hld.satsPerPlane} · {hld.altitudeKm} km ·{' '}
                                    {hld.inclinationDeg}° → {signed(fit.spec.planes - hld.planes)} planes,{' '}
                                    {signed(fit.spec.satsPerPlane - hld.satsPerPlane)} sats/plane
                                    {' '}({signed(
                                        fit.spec.planes * fit.spec.satsPerPlane
                                        - hld.planes * hld.satsPerPlane,
                                    )} total),{' '}
                                    {signed(fit.spec.altitudeKm - hld.altitudeKm, 1)} km,{' '}
                                    {signed(fit.spec.inclinationDeg - hld.inclinationDeg, 2)}°
                                </Row>
                                <Row label="Satellites">
                                    {fit.satellitesUsed} used · {fit.planesDetected} planes
                                    {fit.satellitesExcluded > 0 && ` · ${fit.satellitesExcluded} excluded`}
                                </Row>
                                <Row
                                    label="Residuals"
                                    title="Root-mean-square deviation of the real fleet from the fitted shell, per axis."
                                >
                                    RAAN {fit.raanRmsDeg.toFixed(2)}° · in-plane{' '}
                                    {fit.argLatRmsDeg.toFixed(2)}° · altitude{' '}
                                    {fit.altitudeRmsKm.toFixed(1)} km
                                </Row>
                            </div>

                            {provenance && (
                                <div className="space-y-1 border-t border-slate-700/50 pt-2">
                                    <p className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
                                        Measured from
                                    </p>
                                    <Row
                                        label="Source"
                                        title={SOURCE_TITLE[provenance.source]}
                                    >
                                        <span className={provenance.source === 'live'
                                            ? 'text-slate-300'
                                            : 'text-amber-200/80'}
                                        >
                                            {SOURCE_LABEL[provenance.source]}
                                        </span>
                                    </Row>
                                    <Row label="Measured at">
                                        {UTC(provenance.retrievedAtMs)} UTC
                                    </Row>
                                    <Row
                                        label="TLE epochs"
                                        title="The oldest and newest element set in the catalogue. A wide span is normal: OneWeb issues each TLE at that satellite's ascending-node crossing."
                                    >
                                        {provenance.epochRangeMs
                                            ? `${UTC(provenance.epochRangeMs.earliestMs)} → ${UTC(provenance.epochRangeMs.latestMs)} UTC`
                                            : 'not recorded'}
                                    </Row>
                                    <Row label="Catalogue">
                                        {provenance.catalogueSatellites} OneWeb objects before fit gating
                                    </Row>
                                    {/*
                                      * The sentence that makes a second, different
                                      * result legible instead of alarming.
                                      */}
                                    <p className="pt-0.5 text-[11px] leading-4 text-slate-500">
                                        Re-measuring can return different figures: the catalogue changes,
                                        and so can the source it is served from.
                                    </p>
                                </div>
                            )}

                            {fit.notes.length > 0 && (
                                <details className="border-t border-slate-700/50 pt-2">
                                    <summary className="cursor-pointer text-[11px] font-black uppercase tracking-[0.08em] text-slate-500 hover:text-slate-300">
                                        Caveats ({fit.notes.length})
                                    </summary>
                                    <ul className="mt-1 space-y-1">
                                        {fit.notes.map((note) => (
                                            <li key={note} className="text-[11px] leading-4 text-amber-200/70">
                                                {note}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </>
                    )}
                </div>

                <footer className="flex items-center justify-between gap-2 border-t border-slate-700/70 px-4 py-3">
                    <button
                        type="button"
                        onClick={onReMeasure}
                        disabled={isRunning}
                        className="min-h-10 rounded border border-slate-600 px-3 text-[11px] font-black uppercase tracking-[0.08em] text-slate-300 transition-colors hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-60"
                    >
                        {isRunning ? 'Measuring…' : 'Re-measure'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-10 rounded border border-slate-600 px-3 text-[11px] font-black uppercase tracking-[0.08em] text-slate-300 transition-colors hover:border-sky-400/50 hover:text-sky-200"
                    >
                        Close
                    </button>
                </footer>
            </aside>
        </div>,
        document.body,
    );
};
