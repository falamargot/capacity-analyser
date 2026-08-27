/**
 * WhyThisRevisit — a business-readable explanation with expert backup.
 *
 * The primary level answers what drives the displayed result. Engineering
 * qualifiers remain available under Technical details without competing with
 * the presenter narrative.
 *
 * All judgement lives in `explainRevisit`; this file only renders it. When the
 * engine reaches no verdict it says so rather than emphasising a row anyway —
 * a confidently wrong decisive factor is worse than an honest blank.
 */

import React, { useState } from 'react';
import type { FactorStatus, RevisitExplanation } from '../analysis/explainRevisit';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface WhyThisRevisitProps {
    explanation: RevisitExplanation;
}

const STATUS_DOT: Record<FactorStatus, string> = {
    // Blue is informational. Green looked like "meets the 2 h requirement",
    // which is not what an OK factor means.
    OK: 'bg-sky-400/70',
    WARN: 'bg-amber-400',
    BLOCKING: 'bg-red-400',
    UNKNOWN: 'bg-slate-600',
};

export const WhyThisRevisit: React.FC<WhyThisRevisitProps> = ({ explanation }) => {
    const [expanded, setExpanded] = useState<string | null>(null);
    const summaryFactors = explanation.factors.filter((factor) => factor.showInSummary);
    const technicalFactors = explanation.factors.filter((factor) => !factor.showInSummary);

    const factorRow = (factor: RevisitExplanation['factors'][number], summary: boolean) => {
        const isOpen = expanded === factor.id;
        return (
            <li key={factor.id}>
                <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : factor.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 py-1.5 text-left"
                >
                    <span aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[factor.status]}`}
                    />
                    <span className="min-w-0 flex-1">
                        <span className={[
                            'block text-[12px] font-black uppercase tracking-[0.12em]',
                            factor.isLimiting ? 'text-amber-300' : 'text-slate-400',
                        ].join(' ')}>
                            {summary ? factor.summaryLabel : factor.label}
                        </span>
                        {summary && (
                            <span className="mt-0.5 block text-[12px] leading-4 text-slate-200">
                                {factor.summaryValue}
                            </span>
                        )}
                    </span>
                    {!summary && (
                        <span className={[
                            'text-[12px] font-bold tabular-nums',
                            factor.isLimiting ? 'text-amber-300' : 'text-slate-200',
                        ].join(' ')}>
                            {factor.value}
                        </span>
                    )}
                    {factor.isLimiting && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em] text-amber-200">
                            limiting
                        </span>
                    )}
                    <span aria-hidden="true"
                        className={`text-[11px] text-slate-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                        ›
                    </span>
                </button>
                {isOpen && (
                    <p className="pb-2 pl-3.5 pr-1 text-[12px] leading-4 text-slate-400">
                        {factor.detail}
                    </p>
                )}
            </li>
        );
    };

    return (
        <details className={`${REVISIT_PANEL} group px-3 py-2.5`}>
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-left">
                <span className={REVISIT_LABEL}>Result drivers</span>
                <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-90">›</span>
            </summary>
            <span className={REVISIT_LABEL}>What drives this result</span>

            <ul className="mt-1.5 divide-y divide-slate-700/40">
                {summaryFactors.map((factor) => factorRow(factor, true))}
            </ul>

            <div className="mt-1.5 border-t border-slate-700/40 pt-2">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-300">
                    {explanation.conclusion.label}
                </span>
                <p className="mt-0.5 text-[12px] leading-4 text-slate-300">
                    {explanation.conclusion.text}
                </p>
            </div>

            {technicalFactors.length > 0 && (
                <details className="mt-2 border-t border-slate-700/40 pt-1.5">
                    <summary className="cursor-pointer list-none text-[11px] font-black uppercase tracking-[0.1em] text-slate-500 hover:text-slate-300">
                        Technical details <span aria-hidden="true">›</span>
                    </summary>
                    <ul className="mt-1 divide-y divide-slate-700/40">
                        {technicalFactors.map((factor) => factorRow(factor, false))}
                    </ul>
                </details>
            )}
        </details>
    );
};
