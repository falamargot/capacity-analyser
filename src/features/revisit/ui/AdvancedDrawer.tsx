/**
 * AdvancedDrawer — progressive disclosure (UX §5).
 *
 * The engineering parameters exist, but behind a drawer that is CLOSED BY
 * DEFAULT. The executive interaction is one slider; `P, S, i, h, f, fudge,
 * x, y, z` live here for the engineer in the room.
 *
 * ── THE DRAWER ENFORCES VALIDITY RATHER THAN VALIDATING AFTER THE FACT ──────
 * `x` and `y` are dropdowns populated with the actual divisors of `P` and `S` —
 * never free-text entry, so an invalid stride cannot be expressed. `z` is a
 * bounded integer. Editing `P` or `S` repairs the strides through
 * `reconcileSelection` instead of throwing.
 *
 * And it surfaces the degeneracy: when `y > 1` and `z mod y === 0`, the shift
 * maps the selection onto itself and `z` does nothing. A control that visibly
 * does nothing mid-demo costs more than the feature is worth.
 */

import React from 'react';
import CollapsibleSection from '../../../components/layout/CollapsibleSection';
import {
    divisorsOf, payloadCount, reconcileSelection, validateSelection,
} from '../domain/subConstellation';
import type { RevisitScenario, WalkerPattern } from '../domain/types';
import { MAX_STEP_SECONDS, MAX_WINDOW_HOURS } from '../analysis/accessIntervals';
import { referenceWithPatch } from '../domain/referenceEditing';
import { REVISIT_COLORS } from './revisitTheme';

interface AdvancedDrawerProps {
    scenario: RevisitScenario;
    onChange: (next: RevisitScenario) => void;
}

const fieldClass =
    'w-full rounded border border-slate-600 bg-slate-900/70 px-1.5 py-1 text-[11px] '
    + 'font-bold text-slate-100 outline-none focus:border-amber-400/70';

export const MAX_ADVANCED_PLANES = 24;
export const MAX_ADVANCED_SATS_PER_PLANE = 64;

function bounded(raw: string, min: number, max: number, fallback: number): number {
    if (raw.trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
    label, hint, children,
}) => (
    <label className="flex flex-col gap-1">
        <span className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
            {label}
        </span>
        {children}
        {hint && <span className="text-[9px] leading-3 text-slate-600">{hint}</span>}
    </label>
);

export const AdvancedDrawer: React.FC<AdvancedDrawerProps> = ({ scenario, onChange }) => {
    const { reference, selection, window: analysisWindow } = scenario;

    /** Editing the constellation must leave the selection legal. */
    const setReference = (patch: Partial<typeof reference>) => {
        const nextReference = referenceWithPatch(reference, patch);
        onChange({
            ...scenario,
            reference: nextReference,
            selection: reconcileSelection(nextReference, selection),
        });
    };

    const setSelection = (patch: Partial<typeof selection>) =>
        onChange({ ...scenario, selection: { ...selection, ...patch } });

    const validation = validateSelection(reference, selection);
    // z = 0 satisfies the degeneracy rule trivially and is the expected baseline,
    // so only warn when the user has actually set a shift that does nothing.
    const showDegeneracy = validation.shiftHasNoEffect && selection.planeShift !== 0;

    return (
        <CollapsibleSection
            storageKey="revisit-advanced"
            title="Advanced"
            subtitle="Walker parameters and sub-constellation selection"
            accentColor={REVISIT_COLORS.accent}
            defaultOpen={false}
        >
            <div className="space-y-3">
                <div>
                    <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Reference constellation
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        <Field label="Pattern">
                            <select
                                className={fieldClass}
                                value={reference.pattern}
                                onChange={(e) => setReference({ pattern: e.target.value as WalkerPattern })}
                            >
                                <option value="STAR">STAR</option>
                                <option value="DELTA">DELTA</option>
                            </select>
                        </Field>
                        <Field label="Planes P">
                            <input
                                type="number" min={1} max={MAX_ADVANCED_PLANES} step={1} className={fieldClass}
                                value={reference.planes}
                                onChange={(e) => setReference({
                                    planes: Math.round(bounded(
                                        e.target.value, 1, MAX_ADVANCED_PLANES, reference.planes
                                    )),
                                })}
                            />
                        </Field>
                        <Field label="Sats / plane S">
                            <input
                                type="number" min={1} max={MAX_ADVANCED_SATS_PER_PLANE} step={1} className={fieldClass}
                                value={reference.satsPerPlane}
                                onChange={(e) => setReference({
                                    satsPerPlane: Math.round(bounded(
                                        e.target.value, 1, MAX_ADVANCED_SATS_PER_PLANE,
                                        reference.satsPerPlane
                                    )),
                                })}
                            />
                        </Field>
                        <Field label="Inclination °">
                            <input
                                type="number" min={0} max={180} step={0.1} className={fieldClass}
                                value={reference.inclinationDeg}
                                onChange={(e) => setReference({
                                    inclinationDeg: bounded(
                                        e.target.value, 0, 180, reference.inclinationDeg
                                    ),
                                })}
                            />
                        </Field>
                        <Field label="Altitude km">
                            <input
                                type="number" min={200} max={2000} step={10} className={fieldClass}
                                value={reference.altitudeKm}
                                onChange={(e) => setReference({
                                    altitudeKm: bounded(
                                        e.target.value, 200, 2000, reference.altitudeKm
                                    ),
                                })}
                            />
                        </Field>
                        <Field label="Phasing f" hint={
                            Number.isInteger(reference.phasingF) ? undefined : 'non-standard Walker'
                        }>
                            <input
                                type="number" step={1} className={fieldClass}
                                value={reference.phasingF}
                                onChange={(e) => {
                                    if (e.target.value.trim() === '') return;
                                    const value = Number(e.target.value);
                                    setReference({ phasingF: Number.isFinite(value) ? value : reference.phasingF });
                                }}
                            />
                        </Field>
                        <Field label="Fudge" hint="scales the RAAN step">
                            <input
                                type="number" min={0.1} max={2} step={0.01} className={fieldClass}
                                value={reference.fudge}
                                onChange={(e) => setReference({
                                    fudge: bounded(e.target.value, 0.1, 2, reference.fudge),
                                })}
                            />
                        </Field>
                        <Field label="Total">
                            <div className="px-1.5 py-1 text-[11px] font-bold text-slate-400">
                                {reference.planes * reference.satsPerPlane} sats
                            </div>
                        </Field>
                    </div>
                </div>

                <div className="border-t border-slate-700/60 pt-2.5">
                    <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Hosted-payload selection
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {/* Divisors only — an illegal stride cannot be expressed. */}
                        <Field label="Plane stride x" hint={`divisors of ${reference.planes}`}>
                            <select
                                className={fieldClass}
                                value={selection.planeStride}
                                onChange={(e) => setSelection({ planeStride: Number(e.target.value) })}
                            >
                                {divisorsOf(reference.planes).map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Sat stride y" hint={`divisors of ${reference.satsPerPlane}`}>
                            <select
                                className={fieldClass}
                                value={selection.satStride}
                                onChange={(e) => setSelection({ satStride: Number(e.target.value) })}
                            >
                                {divisorsOf(reference.satsPerPlane).map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Plane shift z" hint={`0 … ${reference.satsPerPlane - 1}`}>
                            <input
                                type="number" min={0} max={reference.satsPerPlane - 1} step={1}
                                className={fieldClass}
                                value={selection.planeShift}
                                onChange={(e) => setSelection({
                                    planeShift: Math.max(0, Math.min(
                                        reference.satsPerPlane - 1,
                                        Math.round(Number(e.target.value) || 0)
                                    )),
                                })}
                            />
                        </Field>
                    </div>

                    <p className="mt-1.5 text-[10px] text-slate-400">
                        <span className="font-black text-amber-300">
                            {payloadCount(reference, selection)}
                        </span>{' '}
                        payloads — {reference.planes / selection.planeStride} planes ×{' '}
                        {reference.satsPerPlane / selection.satStride}
                    </p>

                    {showDegeneracy && (
                        <p className="mt-1.5 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[10px] leading-4 text-amber-200">
                            {validation.warnings[0]}
                        </p>
                    )}
                </div>

                <div className="border-t border-slate-700/60 pt-2.5">
                    <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                        Analysis window
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Duration h" hint="below 24 h is unreliable">
                            <input
                                type="number" min={1} max={MAX_WINDOW_HOURS} step={1} className={fieldClass}
                                value={analysisWindow.durationHours}
                                onChange={(e) => onChange({
                                    ...scenario,
                                    window: {
                                        ...analysisWindow,
                                        durationHours: bounded(
                                            e.target.value, 1, MAX_WINDOW_HOURS,
                                            analysisWindow.durationHours
                                        ),
                                    },
                                })}
                            />
                        </Field>
                        <Field label="Step s" hint="must be ≪ shortest pass">
                            <input
                                type="number" min={1} max={MAX_STEP_SECONDS} step={1} className={fieldClass}
                                value={analysisWindow.stepSeconds}
                                onChange={(e) => onChange({
                                    ...scenario,
                                    window: {
                                        ...analysisWindow,
                                        stepSeconds: bounded(
                                            e.target.value, 1, MAX_STEP_SECONDS,
                                            analysisWindow.stepSeconds
                                        ),
                                    },
                                })}
                            />
                        </Field>
                    </div>
                </div>
            </div>
        </CollapsibleSection>
    );
};
