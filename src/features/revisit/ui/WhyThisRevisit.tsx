/**
 * WhyThisRevisit — the `WHY THIS REVISIT` checklist (UX §4.5).
 *
 * Transposes ENG's `WHY THIS RESULT` exactly: same row grammar, same expand
 * chevrons, same decisive-factor emphasis. The row marked *limiting* answers
 * "what is holding me back" in a vocabulary the audience already reads
 * elsewhere in the product.
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
    OK: 'bg-lime-400/70',
    WARN: 'bg-amber-400',
    BLOCKING: 'bg-red-400',
    UNKNOWN: 'bg-slate-600',
};

export const WhyThisRevisit: React.FC<WhyThisRevisitProps> = ({ explanation }) => {
    const [expanded, setExpanded] = useState<string | null>(null);

    return (
        <div className={`${REVISIT_PANEL} px-3 py-2.5`}>
            <span className={REVISIT_LABEL}>Why this revisit</span>

            <ul className="mt-1.5 divide-y divide-slate-700/40">
                {explanation.factors.map((factor) => {
                    const isOpen = expanded === factor.id;
                    return (
                        <li key={factor.id}>
                            <button
                                type="button"
                                onClick={() => setExpanded(isOpen ? null : factor.id)}
                                aria-expanded={isOpen}
                                className="flex w-full items-center gap-2 py-1.5 text-left"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[factor.status]}`}
                                />
                                <span className={[
                                    'flex-1 text-[10px] font-black uppercase tracking-[0.12em]',
                                    factor.isLimiting ? 'text-amber-300' : 'text-slate-400',
                                ].join(' ')}>
                                    {factor.label}
                                </span>
                                <span className={[
                                    'text-[11px] font-bold tabular-nums',
                                    factor.isLimiting ? 'text-amber-300' : 'text-slate-200',
                                ].join(' ')}>
                                    {factor.value}
                                </span>
                                {factor.isLimiting && (
                                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-200">
                                        limiting
                                    </span>
                                )}
                                <span aria-hidden="true"
                                    className={`text-[9px] text-slate-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                                    ›
                                </span>
                            </button>
                            {isOpen && (
                                <p className="pb-2 pl-3.5 pr-1 text-[10px] leading-4 text-slate-400">
                                    {factor.detail}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>

            {explanation.notDeterminedReason && (
                <p className="mt-1.5 border-t border-slate-700/40 pt-1.5 text-[10px] leading-4 text-slate-500">
                    <span className="font-bold text-slate-400">No single limiting factor. </span>
                    {explanation.notDeterminedReason}
                </p>
            )}
        </div>
    );
};
