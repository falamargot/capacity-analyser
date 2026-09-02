/**
 * PresentationSafety — what the room sees when something is not ideal
 * (Programme 7B).
 *
 * REVISIT is shown to customers on someone else's laptop, over a projector, on
 * a network nobody controls. The failure that matters is not the defect — it is
 * the defect rendered as a red technical banner across the top of the globe
 * while a salesperson is mid-sentence. `Running on the main thread — Worker
 * unavailable` is an accurate thing to say to an engineer and an alarming thing
 * to put in front of a client.
 *
 * Two components:
 *
 * - `PresentationNotice` states the consequence in plain language and keeps the
 *   technical text one disclosure away, where the engineer who needs it can
 *   still reach it. Severity is honest: a degraded mode is not an error.
 * - `PresentationReadiness` turns the same signals into a check a presenter can
 *   run BEFORE the meeting, which is the only time any of it is actionable.
 *
 * Neither component computes anything. Every signal already existed; what was
 * missing was somewhere to read them together.
 */

import React from 'react';
import { REVISIT_PANEL } from './revisitTheme';

export type NoticeSeverity = 'BLOCKING' | 'DEGRADED';

export interface PresentationNoticeProps {
    severity: NoticeSeverity;
    /** Consequence in plain language. No jargon, no component names. */
    headline: string;
    /** What the presenter can do about it, if anything. */
    guidance?: string | null;
    /** The engineering text, one disclosure away. */
    technicalDetail?: string | null;
}

export const PresentationNotice: React.FC<PresentationNoticeProps> = ({
    severity, headline, guidance = null, technicalDetail = null,
}) => {
    const blocking = severity === 'BLOCKING';
    return (
        <div
            className={`revisit-presentation-notice ${REVISIT_PANEL} px-3 py-2 ${blocking
                ? 'border-red-400/40'
                : 'border-amber-400/40'}`}
            role={blocking ? 'alert' : 'status'}
            data-revisit-notice-severity={severity}
        >
            <p className={`text-[12px] font-bold leading-4 ${blocking ? 'text-red-200' : 'text-amber-200'}`}>
                {headline}
            </p>
            {guidance && (
                <p className="mt-0.5 text-[12px] leading-4 text-slate-300">{guidance}</p>
            )}
            {technicalDetail && (
                <details className="mt-1">
                    <summary className="cursor-pointer text-[12px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Technical detail
                    </summary>
                    <p className="mt-1 whitespace-pre-line break-words text-[12px] leading-4 text-slate-400">
                        {technicalDetail}
                    </p>
                </details>
            )}
        </div>
    );
};

/** One readiness signal. `PENDING` is a wait; `DEGRADED` still demonstrates. */
export type ReadinessState = 'READY' | 'PENDING' | 'DEGRADED' | 'BLOCKED';

export interface ReadinessSignal {
    label: string;
    state: ReadinessState;
    /** What this state means for the demonstration, in one short clause. */
    detail: string;
}

const STATE_STYLE: Record<ReadinessState, { dot: string; text: string }> = {
    READY: { dot: 'bg-lime-400', text: 'text-lime-200' },
    PENDING: { dot: 'bg-slate-400', text: 'text-slate-300' },
    DEGRADED: { dot: 'bg-amber-400', text: 'text-amber-200' },
    BLOCKED: { dot: 'bg-red-400', text: 'text-red-200' },
};

/**
 * Presenter notes (Programme 7E).
 *
 * Closed by default, and inside `Explore controls` — this is the presenter's
 * crib sheet, not part of the customer's screen. Deliberately NOT a `Demo
 * story` selector or a guided workflow: the plan rejects both, because a mode
 * that drives the tool takes the room away from the salesperson. These are five
 * lines of prose that describe the path the product already supports.
 */
const PRESENTER_STEPS = [
    'Confirm the customer requirement in the header.',
    'Read the question and the current configuration aloud.',
    'Apply the recommended configuration, then show the contrast again.',
    'Compare a second location, or switch to the customer area.',
    'Name the opportunity and export the customer summary.',
] as const;

export const PresenterNotes: React.FC = () => (
    <details className="revisit-presenter-notes">
        <summary className="flex min-h-11 cursor-pointer items-center px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 hover:text-amber-200 md:min-h-0">
            Presenter notes
        </summary>
        <ol className="mx-2.5 mb-1.5 mt-1 list-decimal space-y-1 pl-4 text-[11px] leading-4 text-slate-400">
            {PRESENTER_STEPS.map((step) => <li key={step}>{step}</li>)}
        </ol>
    </details>
);

export interface PresentationReadinessProps {
    signals: ReadinessSignal[];
}

/**
 * ── WHY THIS IS A STATUS CHIP AND NOT A MENU ENTRY ──────────────────────────
 * It used to sit in the stage toolbar, in a flat column of identically-styled
 * buttons, which made a STATUS read as a command — press me and something
 * happens. Nothing happens: it reports.
 *
 * It is also a PRE-MEETING check. Once it says everything is ready it has
 * nothing further to contribute for the rest of the session, so it says it
 * quietly — small, lower case, no button chrome — and only raises its voice
 * when a signal is pending, degraded or blocked.
 */
export const PresentationReadiness: React.FC<PresentationReadinessProps> = ({ signals }) => {
    const blocked = signals.some((signal) => signal.state === 'BLOCKED');
    const degraded = signals.some((signal) => signal.state === 'DEGRADED');
    const pending = signals.some((signal) => signal.state === 'PENDING');
    const summary = blocked
        ? { text: 'Not ready', className: 'text-red-200' }
        : degraded
            ? { text: 'Ready with limitations', className: 'text-amber-200' }
            : pending
                ? { text: 'Preparing', className: 'text-slate-300' }
                : { text: 'Ready to present', className: 'text-lime-200' };

    const settled = !blocked && !degraded && !pending;
    return (
        <details
            /*
             * Carries its own surface and `pointer-events-auto`: it is mounted
             * over the globe, whose overlay column is `pointer-events-none`, and
             * a status nobody can open is useless in the one case that matters —
             * when it says something is NOT ready and you need to know which.
             */
            className={`revisit-readiness-check group pointer-events-auto ${REVISIT_PANEL} w-9 rounded-full p-0 open:w-[min(15rem,calc(100vw-1rem))] open:rounded-xl open:px-1 open:py-0.5 md:w-auto md:rounded-xl md:px-1 md:py-0.5`}
            data-revisit-readiness={summary.text}
        >
            <summary
                aria-label={summary.text}
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center gap-1.5 p-0 text-[11px] group-open:w-full group-open:justify-start group-open:px-1.5 group-open:py-1 md:h-auto md:w-auto md:min-h-0 md:justify-start md:px-1.5 md:py-1"
                title="Everything the demonstration depends on, checked before the meeting."
            >
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full md:h-1.5 md:w-1.5 ${blocked
                    ? 'bg-red-400'
                    : degraded || pending ? 'bg-amber-400' : 'bg-lime-400'}`}
                />
                {/* Settled is the quiet case, and the common one. */}
                <span className={`${settled ? 'text-slate-500' : `font-bold ${summary.className}`} hidden group-open:inline md:inline`}>
                    {summary.text}
                </span>
            </summary>

            <ul className="mt-1 space-y-1 px-2.5 pb-1">
                {signals.map((signal) => {
                    const style = STATE_STYLE[signal.state];
                    return (
                        <li key={signal.label} className="flex items-start gap-2">
                            <span
                                aria-hidden="true"
                                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
                            />
                            <span className="min-w-0">
                                <span className={`block text-[12px] font-bold leading-4 ${style.text}`}>
                                    {signal.label}
                                </span>
                                <span className="block text-[12px] leading-4 text-slate-400">
                                    {signal.detail}
                                </span>
                            </span>
                        </li>
                    );
                })}
            </ul>

        </details>
    );
};
