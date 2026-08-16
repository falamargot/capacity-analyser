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

import React, { useEffect, useMemo, useState } from 'react';
import CollapsibleSection from '../../../components/layout/CollapsibleSection';
import {
    divisorsOf, payloadCount, reconcileSelection, validateSelection,
} from '../domain/subConstellation';
import type { FovSpec, RevisitScenario, WalkerPattern } from '../domain/types';
import { validateFovSpec } from '../domain/inputValidation';
import { swathKmForFov } from '../domain/presets';
import { MAX_STEP_SECONDS, MAX_WINDOW_HOURS } from '../analysis/accessIntervals';
import { referenceWithPatch } from '../domain/referenceEditing';
import { DEFAULT_PROFILE_ID, referenceProfileFor } from '../domain/referenceProfiles';

interface AdvancedDrawerProps {
    scenario: RevisitScenario;
    onChange: (next: RevisitScenario) => void;
    /**
     * Put the reference constellation back to the HLD profile.
     *
     * Offered here as well as on the Model & validation card because this drawer
     * is where the reference gets changed, so it is where the way back is looked
     * for. Editing planes or altitude makes `referenceWithPatch` drop the
     * per-plane altitude ladder, the RAAN seam and the spares — deliberately,
     * since they are meaningless against a different plane count — and no field
     * here can put them back. Re-typing 12 / 48 / 87.9 / 1200 therefore yields a
     * look-alike that propagates differently from the real profile.
     */
    onRestoreReference?: () => void;
    /** Header popovers provide their own container and are open on demand. */
    variant?: 'panel' | 'menu';
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

const PayloadGeometryEditor: React.FC<AdvancedDrawerProps> = ({ scenario, onChange }) => {
    const [draft, setDraft] = useState<FovSpec>(scenario.payload);
    useEffect(() => setDraft(scenario.payload), [scenario.payload]);

    const validation = useMemo(
        () => validateFovSpec(draft, scenario.reference.altitudeKm),
        [draft, scenario.reference.altitudeKm]
    );
    const dirty = JSON.stringify(draft) !== JSON.stringify(scenario.payload);
    const setBias = (axis: 'alongTrack' | 'crossTrack', value: number) => {
        setDraft((current) => ({
            ...current,
            biasDeg: { ...current.biasDeg, [axis]: value },
        }));
    };

    return (
        <div className="border-t border-slate-700/60 pt-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Instrument geometry
                </p>
                <span className="text-[9px] text-slate-500 tabular-nums">
                    ≈ {Math.round(swathKmForFov(scenario.reference.altitudeKm, draft))} km swath
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Field label="FOV shape">
                    <select
                        aria-label="FOV shape"
                        className={fieldClass}
                        value={draft.shape}
                        onChange={(event) => setDraft((current) => ({
                            ...current, shape: event.target.value as FovSpec['shape'],
                        }))}
                    >
                        <option value="ELLIPSE">Ellipse</option>
                        <option value="RECTANGLE">Rectangle</option>
                    </select>
                </Field>
                <Field label="Half-angle 1 °" hint="semi-axis / half-width">
                    <input
                        aria-label="FOV half-angle 1"
                        type="number" min={0.01} max={89.9} step={0.1} className={fieldClass}
                        value={draft.halfAngle1Deg}
                        onChange={(event) => setDraft((current) => ({
                            ...current,
                            halfAngle1Deg: bounded(event.target.value, 0.01, 89.9, current.halfAngle1Deg),
                        }))}
                    />
                </Field>
                <Field label="Half-angle 2 °" hint="semi-axis / half-height">
                    <input
                        aria-label="FOV half-angle 2"
                        type="number" min={0.01} max={89.9} step={0.1} className={fieldClass}
                        value={draft.halfAngle2Deg}
                        onChange={(event) => setDraft((current) => ({
                            ...current,
                            halfAngle2Deg: bounded(event.target.value, 0.01, 89.9, current.halfAngle2Deg),
                        }))}
                    />
                </Field>
                <Field label="Along-track bias °">
                    <input
                        aria-label="Along-track bias"
                        type="number" min={-90} max={90} step={0.1} className={fieldClass}
                        value={draft.biasDeg.alongTrack}
                        onChange={(event) => setBias('alongTrack', bounded(
                            event.target.value, -90, 90, draft.biasDeg.alongTrack
                        ))}
                    />
                </Field>
                <Field label="Cross-track bias °">
                    <input
                        aria-label="Cross-track bias"
                        type="number" min={-90} max={90} step={0.1} className={fieldClass}
                        value={draft.biasDeg.crossTrack}
                        onChange={(event) => setBias('crossTrack', bounded(
                            event.target.value, -90, 90, draft.biasDeg.crossTrack
                        ))}
                    />
                </Field>
                <Field label="Clocking °" hint="rotation about boresight">
                    <input
                        aria-label="FOV clocking"
                        type="number" step={1} className={fieldClass}
                        value={draft.clockingDeg}
                        onChange={(event) => setDraft((current) => ({
                            ...current,
                            clockingDeg: bounded(event.target.value, -360, 360, current.clockingDeg),
                        }))}
                    />
                </Field>
                <Field label="Elevation mask °" hint="optional ground mask">
                    <div className="flex items-center gap-1.5">
                        <input
                            aria-label="Enable elevation mask"
                            type="checkbox"
                            checked={draft.minElevationDeg !== undefined}
                            onChange={(event) => setDraft((current) => ({
                                ...current,
                                minElevationDeg: event.target.checked ? 0 : undefined,
                            }))}
                        />
                        <input
                            aria-label="Minimum elevation"
                            type="number" min={0} max={89.9} step={0.1}
                            disabled={draft.minElevationDeg === undefined}
                            className={fieldClass}
                            value={draft.minElevationDeg ?? 0}
                            onChange={(event) => setDraft((current) => ({
                                ...current,
                                minElevationDeg: bounded(event.target.value, 0, 89.9, current.minElevationDeg ?? 0),
                            }))}
                        />
                    </div>
                </Field>
            </div>

            <p className="mt-1.5 text-[9px] leading-3 text-slate-500">
                Changes are staged locally to avoid recomputing the analysis and full payload sweep on every keystroke.
            </p>
            {!validation.ok && (
                <p className="mt-1.5 rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-[10px] leading-4 text-red-200">
                    {validation.errors.join('; ')}
                </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
                <button
                    type="button"
                    disabled={!dirty}
                    onClick={() => setDraft(scenario.payload)}
                    className="rounded px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400 disabled:opacity-40"
                >
                    Revert
                </button>
                <button
                    type="button"
                    disabled={!dirty || !validation.ok}
                    onClick={() => onChange({ ...scenario, payload: draft })}
                    className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-amber-200 disabled:opacity-40"
                >
                    Apply geometry
                </button>
            </div>
        </div>
    );
};

export const AdvancedDrawer: React.FC<AdvancedDrawerProps> = ({
    scenario, onChange, onRestoreReference, variant = 'panel',
}) => {
    const { reference, selection, window: analysisWindow } = scenario;
    const canRestoreReference = Boolean(onRestoreReference)
        && referenceProfileFor(reference)?.id !== DEFAULT_PROFILE_ID;

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

    const content = (
        <div className="space-y-3">
                <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                            Reference constellation
                        </p>
                        {canRestoreReference && (
                            <button
                                type="button"
                                onClick={onRestoreReference}
                                className="rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 transition-colors hover:border-lime-400/50 hover:text-lime-200"
                            >
                                Restore HLD reference
                            </button>
                        )}
                    </div>
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

                <PayloadGeometryEditor scenario={scenario} onChange={onChange} />

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
    );

    if (variant === 'menu') {
        return (
            <section className="px-3 py-3" aria-label="Constellation settings">
                <div className="mb-3 border-b border-slate-700/60 pb-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-300">
                        Constellation settings
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-500">
                        Walker model, hosted-payload topology, instrument geometry and analysis window
                    </p>
                </div>
                {content}
            </section>
        );
    }

    return (
        <CollapsibleSection
            storageKey="revisit-advanced"
            title="Advanced"
            subtitle="Walker parameters and sub-constellation selection"
            defaultOpen={false}
        >
            {content}
        </CollapsibleSection>
    );
};
