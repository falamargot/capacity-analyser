/**
 * ValueCurve — `PAYLOADS VS REVISIT`, and the actual deliverable.
 *
 * Beyond the 3D scene, this one 2D chart carries the business case:
 *
 *   X — number of hosted payloads (the pre-validated ladder)
 *   Y — worst-case revisit at the target (log scale; the curve is roughly 1/N)
 *   A dashed line at the customer requirement, and a marker where the curve
 *   crosses it.
 *
 * > "You need 6 payloads to meet a 2-hour requirement over London."
 *
 * That sentence is the point of the feature, and this component is where the
 * tool produces it rather than a human doing so by hand.
 *
 * Hand-rolled SVG, ~150 lines. No charting dependency: adding one to an
 * application already shipping ~193 MB of static assets to draw a single curve
 * is a poor trade (ADR-001, proposal §3.5).
 *
 * The executive view plots the Pareto frontier: the best revisit demonstrated
 * with up to a payload budget. It never invents or smooths a result; it only
 * omits dominated exact-count topologies. The raw, non-monotonic measurements
 * remain available in the same component for engineering inspection.
 */

import React, { useMemo, useState } from 'react';
import { formatGap } from '../analysis/gapStatistics';
import { payloadsRequiredFor, type PayloadSweepResult } from '../analysis/payloadSweep';
import { executiveEnvelopePoints } from '../analysis/executiveEnvelope';
import type { RevisitAreaTargetRole } from '../domain/analysisTargets';
import { REVISIT_COLORS, REVISIT_LABEL, REVISIT_OUTCOME, REVISIT_PANEL } from './revisitTheme';

interface ValueCurveProps {
    /** Target identity drives the evidence curve: Reference amber, Comparison blue. */
    targetRole?: RevisitAreaTargetRole;
    sweep: PayloadSweepResult | null;
    isComputing: boolean;
    requirementMs: number;
    currentPayloadCount: number;
    /** Gap produced by the exact selection shown in the KPI, not the sweep optimum. */
    currentMaxGapMs: number | null;
    /** Whether the exact current selection is the sweep winner at this payload count. */
    currentIsMeasuredBest: boolean;
    /** Wording for a valid topology that is not this target's measured winner. */
    alternativeTopologyLabel?: string;
    targetName: string;
    onSelectPayloadCount: (count: number) => void;
    /** Removes the outer panel when nested in Recommended configuration. */
    embedded?: boolean;
}

const W = 320;
const H = 150;
const PAD = { left: 40, right: 12, top: 12, bottom: 26 };

export const ValueCurve: React.FC<ValueCurveProps> = ({
    targetRole = 'REFERENCE', sweep, isComputing, requirementMs, currentPayloadCount,
    currentMaxGapMs, currentIsMeasuredBest, alternativeTopologyLabel = 'Current manual split',
    targetName, onSelectPayloadCount, embedded = false,
}) => {
    const [showExactTopologies, setShowExactTopologies] = useState(false);
    const targetColor = targetRole === 'COMPARISON'
        ? REVISIT_COLORS.comparison
        : REVISIT_COLORS.target;
    const model = useMemo(() => {
        if (!sweep) return null;
        // Points with no measurable gap (target never in view) cannot be placed
        // on a log axis; they are excluded from the line but reported below it.
        const points = (showExactTopologies ? sweep.points : executiveEnvelopePoints(sweep))
            .filter((p) => p.maxGapMs !== null && p.maxGapMs > 0);
        if (points.length < 2) return null;

        const counts = points.map((p) => p.payloadCount);
        const gaps = points.map((p) => p.maxGapMs!);

        const xMin = Math.log(Math.min(...counts));
        const xMax = Math.log(Math.max(...counts));
        const yValues = [
            ...gaps,
            requirementMs,
            ...(currentMaxGapMs !== null && currentMaxGapMs > 0 ? [currentMaxGapMs] : []),
        ];
        const yMin = Math.log(Math.min(...yValues) * 0.8);
        const yMax = Math.log(Math.max(...yValues) * 1.25);

        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;
        const sx = (count: number) =>
            PAD.left + (xMax === xMin ? 0.5 : (Math.log(count) - xMin) / (xMax - xMin)) * plotW;
        const sy = (ms: number) =>
            PAD.top + (1 - (Math.log(ms) - yMin) / (yMax - yMin)) * plotH;

        return { points, sx, sy, plotH };
    }, [sweep, requirementMs, currentMaxGapMs, showExactTopologies]);

    const answer = sweep ? payloadsRequiredFor(sweep, requirementMs) : null;
    const currentSweepPoint = sweep?.points
        .find((point) => point.payloadCount === currentPayloadCount) ?? null;
    const currentIsOnDisplayedCurve = Boolean(
        model?.points.some((point) => point.payloadCount === currentPayloadCount)
    );

    return (
        <div className={embedded ? '' : `${REVISIT_PANEL} px-3 py-2.5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className={REVISIT_LABEL}>{embedded ? 'Sizing evidence' : 'Payloads vs revisit'}</span>
                <span className="text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {!sweep
                        ? (isComputing ? 'computing…' : 'no valid sweep')
                        : showExactTopologies
                            ? 'exact topology points · lower is better'
                            : 'best achieved with up to X payloads'}
                </span>
            </div>

            {/* Standalone use carries its own summary. Embedded use lives under
                the canonical Current / Recommended blocks, so repeating those
                numbers here would make the hierarchy harder to scan. */}
            {!embedded && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-4 text-slate-400">
                {!sweep ? (
                    <span className="text-slate-500">
                        {isComputing
                            ? 'Sweeping the configuration ladder…'
                            : 'No valid sweep is available for these inputs.'}
                    </span>
                ) : answer ? (
                    <span>
                        <strong className="text-slate-300">Minimum tested balanced configuration:</strong>{' '}
                        <span className="font-black text-white">{answer.payloadCount} payloads</span>
                        {' · '}requirement {formatGap(requirementMs)}
                    </span>
                ) : (
                    <span className={REVISIT_OUTCOME.misses.text}>
                        No tested configuration meets {formatGap(requirementMs)}.
                    </span>
                )}

                {/* `aria-live`: selecting a rung by keyboard changes the answer
                    tab. Announce this compact current state as feedback. */}
                {sweep && currentMaxGapMs !== null && (
                    <span className="font-semibold tabular-nums" aria-live="polite" aria-atomic="true">
                        {currentIsMeasuredBest ? 'Current configuration' : alternativeTopologyLabel}:{' '}
                        <span className="text-slate-200">
                            {currentPayloadCount} payload{currentPayloadCount === 1 ? '' : 's'}
                        </span>
                        {' · '}maximum gap <span className="text-slate-200">{formatGap(currentMaxGapMs)}</span>
                    </span>
                )}
            </div>}

            {embedded && model && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500" aria-label="Sizing evidence legend">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full border border-slate-500 bg-white" /> Current
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full border-2 border-lime-400" /> Recommended
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="w-4 border-t border-dashed border-lime-400" /> Requirement
                    </span>
                </div>
            )}

            {model && (
                <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" role="group"
                    aria-label={`Worst-case revisit against payload count for ${targetName}`}>
                    {/* Requirement threshold */}
                    <line
                        x1={PAD.left} x2={W - PAD.right}
                        y1={model.sy(requirementMs)} y2={model.sy(requirementMs)}
                        stroke={REVISIT_COLORS.pass} strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
                    />
                    <text x={W - PAD.right} y={model.sy(requirementMs) - 4} textAnchor="end"
                        fontSize={8} fill={REVISIT_COLORS.pass}>
                        {embedded ? 'requirement' : `requirement ${formatGap(requirementMs)}`}
                    </text>

                    {/* The curve */}
                    <polyline
                        fill="none"
                        stroke={targetColor}
                        strokeWidth={1.8}
                        data-revisit-sizing-curve={targetRole.toLowerCase()}
                        points={model.points
                            .map((p) => `${model.sx(p.payloadCount)},${model.sy(p.maxGapMs!)}`)
                            .join(' ')}
                    />

                    {/* Every rung is a real control, reachable by keyboard.
                        `<g role="button" tabIndex>` rather than a bare click
                        handler: the payload count is the mode's single most
                        important input, and it was previously mouse-only. Arrow
                        keys walk the ladder, matching how the header slider
                        already behaves. */}
                    {model.points.map((p, index) => {
                        const isCurrentBest = currentIsMeasuredBest
                            && p.payloadCount === currentPayloadCount;
                        const meets = p.maxGapMs! <= requirementMs;
                        // Read aloud, so it is written to be spoken: pluralised,
                        // and "by" rather than the "×" a screen reader would
                        // announce as "times" or skip entirely.
                        const plural = (n: number, word: string) =>
                            `${n} ${word}${n === 1 ? '' : 's'}`;
                        const label = `${plural(p.payloadCount, 'payload')}, worst case `
                            + `${formatGap(p.maxGapMs)}, `
                            + `${plural(p.best.selectedPlanes, 'plane')} by `
                            + `${plural(p.best.payloadsPerPlane, 'payload')} each`;
                        return (
                            <g
                                key={p.payloadCount}
                                className="cursor-pointer focus:outline-none [&:focus-visible>.focus-ring]:opacity-100"
                                role="button"
                                tabIndex={0}
                                aria-label={label}
                                aria-current={isCurrentBest ? 'true' : undefined}
                                onClick={() => onSelectPayloadCount(p.payloadCount)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        onSelectPayloadCount(p.payloadCount);
                                        return;
                                    }
                                    const step = event.key === 'ArrowRight' || event.key === 'ArrowUp'
                                        ? 1
                                        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                                            ? -1
                                            : 0;
                                    if (step === 0) return;
                                    event.preventDefault();
                                    const next = model.points[index + step];
                                    if (!next) return;
                                    onSelectPayloadCount(next.payloadCount);
                                    // Move focus with the selection so repeated
                                    // presses walk the ladder.
                                    const siblings = event.currentTarget.parentElement?.children;
                                    const target = siblings?.[
                                        Array.prototype.indexOf.call(siblings, event.currentTarget) + step
                                    ];
                                    (target as SVGGElement | undefined)?.focus?.();
                                }}
                            >
                                {/* Generous invisible hit area — the dots are tiny. */}
                                <circle cx={model.sx(p.payloadCount)} cy={model.sy(p.maxGapMs!)}
                                    r={9} fill="transparent" />
                                {/* Focus ring, revealed by :focus-visible above. */}
                                <circle
                                    className="focus-ring pointer-events-none opacity-0 transition-opacity"
                                    cx={model.sx(p.payloadCount)} cy={model.sy(p.maxGapMs!)}
                                    r={9} fill="none" stroke="#7DD3FC" strokeWidth={1.5}
                                />
                                {isCurrentBest && (
                                    <circle
                                        cx={model.sx(p.payloadCount)} cy={model.sy(p.maxGapMs!)}
                                        r={7} fill="none" stroke="#ffffff" strokeWidth={1.25}
                                    />
                                )}
                                <circle
                                    cx={model.sx(p.payloadCount)} cy={model.sy(p.maxGapMs!)}
                                    r={isCurrentBest ? 4 : 2.6}
                                    fill={meets ? REVISIT_COLORS.pass : REVISIT_COLORS.miss}
                                />
                                <title>
                                    {p.payloadCount} payloads · {formatGap(p.maxGapMs)} · {' '}
                                    {p.best.selectedPlanes} planes × {p.best.payloadsPerPlane}
                                </title>
                            </g>
                        );
                    })}

                    {/* A manual split can share the payload count but not the
                        sweep winner's gap. Plot its exact KPI result separately
                        so "current" never points at a different constellation. */}
                    {(!currentIsMeasuredBest || !currentIsOnDisplayedCurve)
                        && currentSweepPoint
                        && currentMaxGapMs !== null
                        && currentMaxGapMs > 0 && (
                        <g aria-label={`${currentIsMeasuredBest ? 'Current exact topology' : 'Current manual split'}: ${formatGap(currentMaxGapMs)}`}>
                            <circle
                                cx={model.sx(currentPayloadCount)}
                                cy={model.sy(currentMaxGapMs)}
                                r={7}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth={1.25}
                                strokeDasharray="2 2"
                            />
                            <circle
                                cx={model.sx(currentPayloadCount)}
                                cy={model.sy(currentMaxGapMs)}
                                r={3.5}
                                fill={REVISIT_COLORS.payload}
                            />
                            <title>
                                {currentIsMeasuredBest ? 'Current exact topology' : 'Current manual split'}
                                {' · '}{currentPayloadCount} payloads ·{' '}
                                {formatGap(currentMaxGapMs)}
                            </title>
                        </g>
                    )}

                    {/* Where the curve first meets the requirement. */}
                    {answer && answer.maxGapMs !== null && (
                        <>
                            <line
                                x1={model.sx(answer.payloadCount)} x2={model.sx(answer.payloadCount)}
                                y1={PAD.top} y2={H - PAD.bottom}
                                stroke={REVISIT_COLORS.pass} strokeWidth={1} opacity={0.45}
                            />
                            <circle
                                cx={model.sx(answer.payloadCount)} cy={model.sy(answer.maxGapMs)}
                                r={6} fill="none" stroke={REVISIT_COLORS.pass} strokeWidth={1.25}
                            />
                        </>
                    )}

                    {/* Axes */}
                    <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
                        stroke="#334155" strokeWidth={1} />
                    {model.points.map((p, i) =>
                        // Label sparsely; the ladder is dense at the top end.
                        i % Math.ceil(model.points.length / 6) === 0 || i === model.points.length - 1 ? (
                            <text key={p.payloadCount} x={model.sx(p.payloadCount)} y={H - PAD.bottom + 11}
                                textAnchor="middle" fontSize={8} fill="#64748b">
                                {p.payloadCount}
                            </text>
                        ) : null
                    )}
                    <text x={PAD.left} y={H - 3} fontSize={8} fill="#475569">payloads</text>
                    <text x={4} y={PAD.top + 6} fontSize={8} fill="#475569">worst</text>
                    <text x={4} y={PAD.top + 15} fontSize={8} fill="#475569">case</text>
                </svg>
            )}

            {sweep && (
                /*
                 * "Executive envelope" named the audience, not the curve, and
                 * left the reader to guess what it filtered. Both labels now
                 * say what will be drawn: the best gap reachable within each
                 * budget, or every measured count as it actually came out.
                 */
                <button
                    type="button"
                    className="mt-1 rounded text-[11px] font-bold uppercase tracking-[0.08em] text-sky-300 hover:text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                    aria-pressed={showExactTopologies}
                    title={showExactTopologies
                        ? 'Keep only the counts that improve on every smaller budget, so the curve reads "best achievable with up to X payloads". Every point is still a measured sweep result — dominated counts are filtered, never smoothed.'
                        : 'Plot every payload count the sweep measured, in order. The curve can rise: at 87.9° a concentrated split can beat a larger, more spread one.'}
                    onClick={() => setShowExactTopologies((shown) => !shown)}
                >
                    {showExactTopologies ? 'Show best per budget' : 'Show every measured count'}
                </button>
            )}

            {/*
              * The comparison worth making out loud (design note §3.2) — about
              * TOPOLOGY, at a fixed payload count.
              *
              * It used to read "12 payloads over 6 planes beats 1 plane by 75%
              * on revisit", four hundred pixels below `Vs 1 payload: 76%
              * shorter worst-case` in the same column. That one compares 12
              * payloads against ONE payload; this one compares two ways of
              * splitting the SAME twelve. Two unrelated arguments, worded
              * almost identically, a percentage point apart — a customer who
              * spots the difference asks which is right, and both are (P3,
              * 2026-08-31).
              *
              * So it now names both splits in full and drops "beats": the
              * sentence states what was measured against what, and the reader
              * can see that the payload count does not change across it.
              */}
            {sweep && (() => {
                const here = sweep.points.find((p) => p.payloadCount === currentPayloadCount);
                if (!here?.spreadAdvantage || here.alternatives.length === 0) return null;
                const worst = here.alternatives[here.alternatives.length - 1];
                return (
                    <p className="mt-1 text-[12px] leading-4 text-amber-200/80">
                        At {currentPayloadCount} payloads,{' '}
                        {here.best.selectedPlanes} × {here.best.payloadsPerPlane} measures{' '}
                        {(here.spreadAdvantage * 100).toFixed(0)}% better than{' '}
                        {worst.selectedPlanes} × {worst.payloadsPerPlane}.
                    </p>
                );
            })()}
        </div>
    );
};
