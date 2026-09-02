/**
 * HowThisWorks — the module's own instructions, opened from the header rail.
 *
 * REVISIT is read by people who did not build it and who have nobody beside
 * them to ask. Everything they need was already on screen and none of it was
 * named: the numbered header panels are a sequence but never say so, the globe
 * takes a plain click for the Primary target and a Shift-click for the
 * Secondary (the second is stated only inside a popover you must already have
 * opened), the timeline is seekable by clicking it, and four KPI figures are
 * printed with no definition of what a "gap" or "in view" is.
 *
 * The trigger is a `?` sharing the header rail's left column with the
 * back-to-ENG/COMM control, above it. That column is the module's chrome — the
 * two things that are ABOUT the tool rather than about the analysis — and it is
 * the first place a lost reader looks. It briefly lived on the stage rail
 * beside the display toggles, where it read as a third globe control.
 *
 * The panel itself is portalled and anchored under the button rather than
 * expanded in place: the rail is a 44 px column of a header whose height the
 * analysis owns, and a disclosure opening inside it would push the whole stage
 * down.
 *
 * Desktop and tablet only. Below `md` the header collapses to one compact row
 * and the stage is 390 px wide; help there belongs in the bottom sheet the
 * mobile UX plan already describes. It also withdraws below 640 px of height —
 * the wide-but-short window — where the rail has no room for a second control.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REVISIT_LABEL, REVISIT_MENU_SURFACE } from './revisitTheme';

const HEADING = 'text-[11px] font-black uppercase tracking-[0.14em] text-slate-400';

/** Panel width at `md` and above, px. */
const PANEL_WIDTH = 352;
/** Breathing room between the panel and the viewport edges, px. */
const GUTTER = 12;

/**
 * Where the panel sits relative to its trigger.
 *
 * Read from the live rect, never from a constant: this header grows with a
 * spread note, with the target list and with the expanded setup block, so any
 * hard-coded top drifts out from under the button.
 */
function anchoredPosition(anchor: HTMLElement | null): React.CSSProperties | null {
    if (!anchor || typeof window === 'undefined') return null;
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GUTTER * 2);
    const left = Math.min(
        Math.max(rect.left, GUTTER),
        Math.max(GUTTER, window.innerWidth - width - GUTTER),
    );
    const top = rect.bottom + 8;
    return { top, left, width, maxHeight: Math.max(160, window.innerHeight - top - GUTTER) };
}

export function HowThisWorks({ stretch = false }: {
    /**
     * Take the whole rail height rather than the 32 px strip above the
     * ENG/COMM return control.
     *
     * True under `?standalone=1`, where that control is not rendered and this
     * is the only thing in the chrome column: a 32 px button floating at the
     * top of a 106 px rail reads as a fragment of something that failed to
     * load, which is exactly what the return control's own comment records
     * about its pre-2026-08 shape.
     */
    stretch?: boolean;
} = {}) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<React.CSSProperties | null>(null);

    const reposition = useCallback(
        () => setPosition(anchoredPosition(triggerRef.current)),
        [],
    );
    // Layout effect: the panel must never paint at the top-left corner for a
    // frame before its measured position lands.
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
        window.addEventListener('resize', reposition);
        return () => window.removeEventListener('resize', reposition);
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setOpen(false);
            triggerRef.current?.focus();
        };
        /* Dismiss on a press anywhere outside. Not a modal: this is a reference
           card, and reading it while pointing at the thing it describes is the
           whole point — so it never blocks the stage underneath. */
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (panelRef.current?.contains(target)) return;
            if (triggerRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('pointerdown', handlePointerDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                data-revisit-how-this-works-trigger
                onClick={() => setOpen((current) => !current)}
                aria-expanded={open}
                aria-controls="revisit-how-this-works"
                aria-label="How this works"
                title="What this module answers and how to drive it"
                /* Not `REVISIT_PANEL`: the return control beside it explains
                   why — `.capacity-header [class*='border-slate-']` flattens any
                   such border in this header with `!important`, which beats an
                   inline colour. Same chrome as that control, deliberately: the
                   two are one column. */
                style={{ borderColor: '#6b7c99' }}
                className={`hidden w-11 shrink-0 items-center justify-center rounded-xl border text-[15px] font-black leading-none shadow-lg backdrop-blur-sm transition-colors md:flex [@media(max-height:640px)]:!hidden ${stretch ? 'h-auto flex-1 self-stretch' : 'h-8'} ${open
                    ? 'bg-sky-500/25 text-sky-100'
                    : 'bg-slate-700/70 text-slate-100 hover:bg-slate-600/80 hover:text-white'}`}
            >
                <span aria-hidden="true">?</span>
            </button>

            {open && typeof document !== 'undefined' && createPortal(
                /* `revisit-shell` is the theming scope and this panel is
                   portalled to `document.body`, outside the shell element.
                   Without the class the light-theme overrides in `index.css`
                   never reach it and it renders dark-stage ink on a light
                   surface — the defect the scenario workspace already hit. */
                <div className="revisit-shell pointer-events-none fixed inset-0 z-[100]">
                    <div
                        ref={panelRef}
                        id="revisit-how-this-works"
                        role="dialog"
                        aria-label="How this works"
                        style={position ?? { top: GUTTER, left: GUTTER, width: PANEL_WIDTH }}
                        className={`pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl border border-slate-500/60 shadow-[0_28px_70px_rgba(0,0,0,0.55)] ${REVISIT_MENU_SURFACE}`}
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-slate-700/60 px-3 py-2">
                            <span className={REVISIT_LABEL}>How this works</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    triggerRef.current?.focus();
                                }}
                                aria-label="Close how this works"
                                className="flex h-6 w-6 items-center justify-center rounded text-[15px] text-slate-400 hover:bg-slate-700/60 hover:text-slate-100"
                            >
                                ×
                            </button>
                        </div>

                        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3 text-[12px] leading-4 text-slate-300">
                            <p>
                                How often the hosted-payload fleet can observe a place on Earth, and
                                how many payloads it takes to meet a maximum-gap requirement.
                            </p>

                            <div className="flex flex-col gap-1">
                                <span className={HEADING}>The five panels, in order</span>
                                <p><b className="text-slate-100">1 Constellation</b> — the host fleet the payloads fly on.</p>
                                <p><b className="text-slate-100">2 Hosted payloads</b> — how many of those satellites carry the sensor, the swath it sees, and the requirement every target is judged against.</p>
                                <p><b className="text-slate-100">3 Analysis target</b> — the place observed. One Primary, plus one Secondary to compare against it.</p>
                                <p><b className="text-slate-100">4 Current configuration</b> — the answer for what is flown today.</p>
                                <p><b className="text-slate-100">5 Recommended configuration</b> — what to change, and what that change would measure.</p>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className={HEADING}>On the globe</span>
                                <p>Click to place or move the Primary target. Shift-click to place or move the Secondary. Drag to rotate, scroll to zoom.</p>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className={HEADING}>On the timeline</span>
                                <p>Each mark is one access. The outlined span is the longest wait between two accesses — green within the requirement, red beyond it. Click a lane to move the simulation to that instant.</p>
                            </div>

                            <div className="flex flex-col gap-1">
                                <span className={HEADING}>The four figures</span>
                                <p><b className="text-slate-100">Maximum gap</b> — the longest wait between two observations, and the figure the requirement is compared against. A gap cut short by the end of the analysis window is discarded rather than counted short.</p>
                                <p><b className="text-slate-100">Average revisit</b> — the mean wait between observations.</p>
                                <p><b className="text-slate-100">Passes / day</b> — observations per 24 hours.</p>
                                <p><b className="text-slate-100">In view</b> — the share of the analysis window with at least one payload able to see the target.</p>
                            </div>

                            <p className="text-slate-400">
                                A parametric mission-analysis model, not an operational tasking tool.
                            </p>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
