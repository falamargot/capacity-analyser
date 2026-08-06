/**
 * RevisitHeader — the triad (UX §4.1).
 *
 * The charter's second principle is "Site A ↔ Site B is the story". REVISIT has
 * no route, so its triad is:
 *
 *     CONSTELLATION  →  HOSTED PAYLOADS  →  TARGET
 *
 * Same visual syntax as the Site A / Site B blocks — separated panels, tiny
 * uppercase label above a larger value — with the middle panel amber-bordered
 * because it is the one the user actually manipulates.
 *
 * THE PAYLOAD SLIDER LIVES HERE, NOT IN THE SIDEBAR. It is scenario
 * configuration, and the charter is explicit about who owns that. Keeping it in
 * the header also stops it growing into a settings panel that competes with the
 * globe.
 *
 * The slider walks a pre-validated ladder of (x, y) configurations — never raw
 * x/y/z entry. Where two configurations give the same payload count the better
 * one is chosen automatically, which is why the slider index addresses payload
 * *counts* rather than ladder rows.
 */

import React from 'react';
import type { RevisitScenario } from '../domain/types';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface RevisitHeaderProps {
    scenario: RevisitScenario;
    /** Distinct payload counts, ascending — the slider's stops. */
    payloadCounts: number[];
    currentPayloadCount: number;
    onPayloadCountChange: (count: number) => void;
    targetNames: string[];
    onTargetChange: (name: string) => void;
    /** Set when the chosen count has a better plane split than another at the same count. */
    spreadNote: string | null;
}

const Panel: React.FC<{
    label: string; children: React.ReactNode; emphasised?: boolean; className?: string;
}> = ({ label, children, emphasised, className = '' }) => (
    <div
        className={[
            REVISIT_PANEL,
            'px-4 py-3',
            emphasised ? 'border-amber-400/60 bg-amber-500/10' : '',
            className,
        ].join(' ')}
    >
        <span className={REVISIT_LABEL}>{label}</span>
        <div className="mt-1">{children}</div>
    </div>
);

const Arrow = () => (
    <span aria-hidden="true" className="select-none text-lg text-amber-500/50">→</span>
);

export const RevisitHeader: React.FC<RevisitHeaderProps> = ({
    scenario, payloadCounts, currentPayloadCount, onPayloadCountChange,
    targetNames, onTargetChange, spreadNote,
}) => {
    const { reference, target } = scenario;
    const sliderIndex = Math.max(0, payloadCounts.indexOf(currentPayloadCount));

    return (
        <div className="flex items-stretch gap-2">
            <Panel label="Constellation" className="min-w-[190px]">
                <div className="text-base font-bold text-slate-100">
                    {reference.planes} × {reference.satsPerPlane}
                    <span className="ml-2 text-xs font-semibold text-slate-400">
                        {reference.pattern}
                    </span>
                </div>
                <div className="text-[11px] text-slate-400">
                    {reference.inclinationDeg}° · {reference.altitudeKm} km ·{' '}
                    {reference.planes * reference.satsPerPlane} sats
                </div>
            </Panel>

            <div className="flex items-center"><Arrow /></div>

            <Panel label="Hosted payloads" emphasised className="flex-1 min-w-[280px]">
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black leading-none text-amber-300 tabular-nums">
                        {currentPayloadCount}
                    </span>
                    <span className="text-[11px] font-semibold text-amber-200/70">
                        of {reference.planes * reference.satsPerPlane}
                    </span>
                </div>
                <input
                    type="range"
                    className="mt-2 w-full accent-amber-400"
                    min={0}
                    max={Math.max(payloadCounts.length - 1, 0)}
                    step={1}
                    value={sliderIndex}
                    onChange={(e) => onPayloadCountChange(payloadCounts[Number(e.target.value)])}
                    aria-label="Number of hosted payloads"
                    aria-valuetext={`${currentPayloadCount} payloads`}
                />
                <div className="min-h-[14px] text-[10px] leading-[14px] text-amber-200/80">
                    {spreadNote}
                </div>
            </Panel>

            <div className="flex items-center"><Arrow /></div>

            <Panel label="Target" className="min-w-[180px]">
                <select
                    className="w-full bg-transparent text-base font-bold text-slate-100 outline-none"
                    value={target.name}
                    onChange={(e) => onTargetChange(e.target.value)}
                    aria-label="Target"
                >
                    {targetNames.map((name) => (
                        <option key={name} value={name} className="bg-slate-900">{name}</option>
                    ))}
                </select>
                <div className="text-[11px] tabular-nums text-slate-400">
                    {target.latDeg.toFixed(2)}° · {target.lonDeg.toFixed(2)}°
                </div>
            </Panel>
        </div>
    );
};
