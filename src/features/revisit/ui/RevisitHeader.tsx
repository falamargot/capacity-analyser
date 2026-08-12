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
        data-revisit-context-panel={label.toLowerCase().replace(/\s+/g, '-')}
        className={[
            REVISIT_PANEL,
            'revisit-context-panel px-3 py-2 md:px-4 md:py-3',
            emphasised ? 'border-amber-400/60 bg-amber-500/10' : '',
            className,
        ].join(' ')}
    >
        <span className={REVISIT_LABEL}>{label}</span>
        <div className="mt-1">{children}</div>
    </div>
);

const Arrow = () => (
    <span aria-hidden="true" className="hidden select-none items-center text-lg text-amber-500/50 md:flex">→</span>
);

export const RevisitHeader: React.FC<RevisitHeaderProps> = ({
    scenario, payloadCounts, currentPayloadCount, onPayloadCountChange,
    targetNames, onTargetChange, spreadNote,
}) => {
    const { reference, target } = scenario;
    const sliderIndex = Math.max(0, payloadCounts.indexOf(currentPayloadCount));

    return (
        <div
            data-revisit-context-bar
            className="revisit-context-bar grid grid-cols-2 items-stretch gap-2 md:flex"
        >
            <Panel label="Constellation" className="min-w-0 md:min-w-[190px]">
                <div className="text-sm font-bold text-slate-100 md:text-base">
                    {reference.planes} × {reference.satsPerPlane}
                    <span className="ml-2 text-xs font-semibold text-slate-400">
                        {reference.pattern}
                    </span>
                </div>
                <div className="revisit-context-detail text-[11px] text-slate-400">
                    {reference.inclinationDeg}° · {reference.altitudeKm} km ·{' '}
                    {reference.planes * reference.satsPerPlane} sats
                </div>
            </Panel>

            <Arrow />

            <Panel label="Hosted payloads" emphasised className="order-3 col-span-2 min-w-0 md:order-none md:flex-1 md:min-w-[280px]">
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black leading-none text-amber-300 tabular-nums md:text-3xl">
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
                <div className="revisit-spread-note min-h-[14px] text-[10px] leading-[14px] text-amber-200/80">
                    {spreadNote}
                </div>
            </Panel>

            <Arrow />

            <Panel label="Target" className="min-w-0 md:min-w-[180px]">
                <select
                    className="w-full bg-transparent text-sm font-bold text-slate-100 outline-none md:text-base"
                    value={target.name}
                    onChange={(e) => onTargetChange(e.target.value)}
                    aria-label="Target"
                >
                    {targetNames.map((name) => (
                        <option key={name} value={name} className="bg-slate-900">{name}</option>
                    ))}
                </select>
                <div className="revisit-context-detail text-[11px] tabular-nums text-slate-400">
                    {target.latDeg.toFixed(2)}° · {target.lonDeg.toFixed(2)}°
                </div>
            </Panel>
        </div>
    );
};
