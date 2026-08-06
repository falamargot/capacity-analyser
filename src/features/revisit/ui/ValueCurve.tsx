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
 * ── THE CURVE IS NOT MONOTONIC, AND THAT IS A FEATURE ───────────────────────
 * Ladder rungs are not nested: the next rung up can concentrate payloads into
 * FEWER planes, and plane spread matters more than raw count. The engine's own
 * sweep shows this (8 over 2 planes losing to 6 over 3). The chart therefore
 * plots what the engine returns and does not smooth it, and "payloads required"
 * comes from `payloadsRequiredFor`, which returns the smallest count that
 * actually meets the requirement — the honest answer when the curve wobbles.
 */

import React, { useMemo } from 'react';
import { formatGap } from '../analysis/gapStatistics';
import { payloadsRequiredFor, type PayloadSweepResult } from '../analysis/payloadSweep';
import { REVISIT_COLORS, REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface ValueCurveProps {
    sweep: PayloadSweepResult | null;
    isComputing: boolean;
    requirementMs: number;
    currentPayloadCount: number;
    targetName: string;
    onSelectPayloadCount: (count: number) => void;
}

const W = 320;
const H = 150;
const PAD = { left: 40, right: 12, top: 12, bottom: 26 };

export const ValueCurve: React.FC<ValueCurveProps> = ({
    sweep, isComputing, requirementMs, currentPayloadCount, targetName, onSelectPayloadCount,
}) => {
    const model = useMemo(() => {
        if (!sweep) return null;
        // Points with no measurable gap (target never in view) cannot be placed
        // on a log axis; they are excluded from the line but reported below it.
        const points = sweep.points.filter((p) => p.maxGapMs !== null && p.maxGapMs > 0);
        if (points.length < 2) return null;

        const counts = points.map((p) => p.payloadCount);
        const gaps = points.map((p) => p.maxGapMs!);

        const xMin = Math.log(Math.min(...counts));
        const xMax = Math.log(Math.max(...counts));
        const yValues = [...gaps, requirementMs];
        const yMin = Math.log(Math.min(...yValues) * 0.8);
        const yMax = Math.log(Math.max(...yValues) * 1.25);

        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;
        const sx = (count: number) =>
            PAD.left + (xMax === xMin ? 0.5 : (Math.log(count) - xMin) / (xMax - xMin)) * plotW;
        const sy = (ms: number) =>
            PAD.top + (1 - (Math.log(ms) - yMin) / (yMax - yMin)) * plotH;

        return { points, sx, sy, plotH };
    }, [sweep, requirementMs]);

    const answer = sweep ? payloadsRequiredFor(sweep, requirementMs) : null;

    return (
        <div className={`${REVISIT_PANEL} px-3 py-2.5`}>
            <div className="flex items-baseline justify-between">
                <span className={REVISIT_LABEL}>Payloads vs revisit</span>
                {isComputing && <span className="text-[9px] text-slate-500">computing…</span>}
            </div>

            {/* The deliverable sentence, produced by the tool. */}
            <p className="mt-1.5 text-[11px] leading-4 text-slate-300">
                {!sweep ? (
                    <span className="text-slate-500">Sweeping the configuration ladder…</span>
                ) : answer ? (
                    <>
                        You need{' '}
                        <span className="font-black text-amber-300">{answer.payloadCount} payloads</span>{' '}
                        to see {targetName} every {formatGap(requirementMs)}.
                    </>
                ) : (
                    <span className="text-red-300">
                        No configuration on this ladder meets {formatGap(requirementMs)} over {targetName}.
                    </span>
                )}
            </p>

            {model && (
                <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 w-full" role="img"
                    aria-label={`Worst-case revisit against payload count for ${targetName}`}>
                    {/* Requirement threshold */}
                    <line
                        x1={PAD.left} x2={W - PAD.right}
                        y1={model.sy(requirementMs)} y2={model.sy(requirementMs)}
                        stroke={REVISIT_COLORS.pass} strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
                    />
                    <text x={W - PAD.right} y={model.sy(requirementMs) - 4} textAnchor="end"
                        fontSize={8} fill={REVISIT_COLORS.pass}>
                        requirement {formatGap(requirementMs)}
                    </text>

                    {/* The curve */}
                    <polyline
                        fill="none"
                        stroke={REVISIT_COLORS.accent}
                        strokeWidth={1.8}
                        points={model.points
                            .map((p) => `${model.sx(p.payloadCount)},${model.sy(p.maxGapMs!)}`)
                            .join(' ')}
                    />

                    {/* Every rung is clickable — the chart doubles as a control. */}
                    {model.points.map((p) => {
                        const isCurrent = p.payloadCount === currentPayloadCount;
                        const meets = p.maxGapMs! <= requirementMs;
                        return (
                            <g key={p.payloadCount}
                                className="cursor-pointer"
                                onClick={() => onSelectPayloadCount(p.payloadCount)}>
                                {/* Generous invisible hit area — the dots are tiny. */}
                                <circle cx={model.sx(p.payloadCount)} cy={model.sy(p.maxGapMs!)}
                                    r={9} fill="transparent" />
                                <circle
                                    cx={model.sx(p.payloadCount)} cy={model.sy(p.maxGapMs!)}
                                    r={isCurrent ? 4.5 : 2.6}
                                    fill={meets ? REVISIT_COLORS.pass : REVISIT_COLORS.accent}
                                    stroke={isCurrent ? '#ffffff' : 'none'}
                                    strokeWidth={isCurrent ? 1.5 : 0}
                                />
                                <title>
                                    {p.payloadCount} payloads · {formatGap(p.maxGapMs)} · {' '}
                                    {p.best.selectedPlanes} planes × {p.best.payloadsPerPlane}
                                </title>
                            </g>
                        );
                    })}

                    {/* Where the curve first meets the requirement. */}
                    {answer && answer.maxGapMs !== null && (
                        <line
                            x1={model.sx(answer.payloadCount)} x2={model.sx(answer.payloadCount)}
                            y1={PAD.top} y2={H - PAD.bottom}
                            stroke={REVISIT_COLORS.pass} strokeWidth={1} opacity={0.35}
                        />
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

            {/* The comparison worth making out loud (design note §3.2). */}
            {sweep && (() => {
                const here = sweep.points.find((p) => p.payloadCount === currentPayloadCount);
                if (!here?.spreadAdvantage || here.alternatives.length === 0) return null;
                const worst = here.alternatives[here.alternatives.length - 1];
                return (
                    <p className="mt-1 text-[10px] leading-4 text-amber-200/80">
                        {currentPayloadCount} payloads over {here.best.selectedPlanes} planes beats{' '}
                        {worst.selectedPlanes} {worst.selectedPlanes === 1 ? 'plane' : 'planes'} by{' '}
                        {(here.spreadAdvantage * 100).toFixed(0)}% on revisit.
                    </p>
                );
            })()}
        </div>
    );
};
