/**
 * AreaSizingEvidence — the proof behind an area's payload count.
 *
 * ── WHY THE SEARCH HAS TO SHOW ITS WORK ─────────────────────────────────────
 * The card states a number and calls it "verified on every cell, not proved
 * minimal". Both halves of that sentence are unfalsifiable on their own: a
 * reader has no way to tell a searched answer from a guess, and no way to see
 * why a cheaper configuration was not chosen. This block is the difference.
 *
 * It shows what the probe cell promised against what the grid delivered, per
 * candidate. That gap is the whole reason the verification step exists — on a
 * 96-cell grid, 12 × 3 held 1 h 28 on the probe cell and 2 h 27 over the area —
 * and a presenter asked "why not 36 payloads?" can point at the line rather
 * than explain the algorithm.
 *
 * The one-line summary above it carries the cost that was NOT paid: the probe
 * rules out most of the ladder without spending a grid pass, and saying how
 * many is what makes "we searched" a measurement rather than a claim.
 */

import React from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { AreaSizingResult } from '../analysis/areaSizing';
import { REVISIT_LABEL, REVISIT_OUTCOME } from './revisitTheme';

export const AreaSizingEvidence: React.FC<{ sizing: AreaSizingResult }> = ({ sizing }) => (
    <div className="mt-3 border-t border-slate-700/50 pt-2">
        <span className={REVISIT_LABEL}>Search evidence</span>

        <p className="mt-1 text-[12px] leading-4 text-slate-400">
            {sizing.ladderSize} configurations on the ladder ·{' '}
            {sizing.probeRejected} ruled out by the least-covered cell alone ·{' '}
            {sizing.attempts.length} verified over every cell
        </p>

        {sizing.attempts.length > 0 && (
            <ul className="mt-1.5 space-y-1">
                {sizing.attempts.map((attempt, index) => (
                    <li
                        key={`${attempt.payloadCount}-${attempt.selectedPlanes}-${index}`}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px] leading-4"
                    >
                        <span className="text-slate-300">
                            <span className="font-black tabular-nums">{attempt.payloadCount}</span>
                            {' '}payloads · {attempt.selectedPlanes} × {attempt.payloadsPerPlane}
                        </span>
                        <span className="tabular-nums text-slate-400">
                            {/* Probe first, area second, in that order: the point
                                is that the second is worse than the first. */}
                            probe {formatGap(attempt.probeGapMs)} · area{' '}
                            {attempt.areaWorstGapMs === null
                                ? 'never in view'
                                : formatGap(attempt.areaWorstGapMs)}
                            {' · '}
                            <span className={attempt.passed
                                ? REVISIT_OUTCOME.meets.text
                                : REVISIT_OUTCOME.misses.text}
                            >
                                {/*
                                  * A failure names the cell it stopped at. That
                                  * is not trivia: it says the verdict was
                                  * reached without measuring the rest of the
                                  * grid, which is why a search over 96 cells
                                  * costs what it does.
                                  */}
                                {attempt.passed
                                    ? 'verified'
                                    : `fails at cell ${attempt.cellsComputed}/${attempt.totalCells}`}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
        )}

        {sizing.kind === 'NONE' && (
            <p className="mt-1.5 text-[12px] leading-4 text-amber-200/80">
                {sizing.stoppedAtCeiling
                    ? 'The search stopped at its candidate ceiling — configurations remain untested, '
                        + 'so this is not a proof that none would meet the requirement.'
                    : sizing.probeRejected === sizing.ladderSize
                        ? 'No configuration on the ladder meets the requirement on the least-covered '
                            + 'cell, which is part of the area — so none can meet it over the area.'
                        : 'Every candidate the probe put forward failed somewhere on the grid.'}
            </p>
        )}
    </div>
);
