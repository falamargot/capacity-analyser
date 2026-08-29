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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import CollapsibleSection from '../../../components/layout/CollapsibleSection';
import {
    divisorsOf, payloadCount, reconcileSelection, validateSelection,
} from '../domain/subConstellation';
import type { FovSpec, RevisitScenario, WalkerPattern, WalkerSpec } from '../domain/types';
import { validateFovSpec } from '../domain/inputValidation';
import { swathKmForFov } from '../domain/presets';
import { fovForDisplay } from './fovDisplay';
import { referenceWithPatch } from '../domain/referenceEditing';
import {
    DEFAULT_PROFILE, walkerSpecsEqual,
    type ReferenceMode, type ReferenceProfile,
} from '../domain/referenceProfiles';
import { ModelProvenance } from './ModelProvenance';
import { TleComparisonDialog } from './TleComparisonDialog';
import { displayAltitudeKm, displayInclinationDeg } from './revisitTheme';
import type { WalkerFit } from '../calibration/fitWalker';
import type { CalibrationProvenance } from '../hooks/useOneWebCalibration';

interface AdvancedDrawerProps {
    scenario: RevisitScenario;
    onChange: (next: RevisitScenario) => void;
    /**
     * The constellation model: which one is selected, how to change it, and the
     * evidence behind it. Absent in contexts that only edit a raw specification.
     */
    model?: ConstellationModelProps;
    /** Header popovers provide their own container and are open on demand. */
    variant?: 'panel' | 'menu';
}

const fieldClass =
    'w-full rounded border border-slate-600 bg-slate-900/70 px-1.5 py-1 text-[12px] '
    + 'font-bold text-slate-100 outline-none focus:border-amber-400/70';

/** `fieldClass` without a weight, for fields that set their own. */
const fieldBaseClass =
    'w-full rounded border border-slate-600 bg-slate-900/70 px-1.5 py-1 text-[12px] '
    + 'outline-none focus:border-amber-400/70';

/**
 * Weight as the signal for "this is not the reference any more".
 *
 * Every Walker field used to be bold, which made the seven of them one block of
 * emphasis saying nothing. Bold now means exactly one thing — this value differs
 * from the HLD profile — so a Custom constellation shows at a glance which two
 * or three numbers were actually changed, and a Custom that has drifted back to
 * the reference shows none.
 */
const walkerFieldClass = (differs: boolean) =>
    `${fieldBaseClass} ${differs ? 'font-bold text-slate-100' : 'font-medium text-slate-400'}`;

export const MAX_ADVANCED_PLANES = 24;
export const MAX_ADVANCED_SATS_PER_PLANE = 64;

function bounded(raw: string, min: number, max: number, fallback: number): number {
    if (raw.trim() === '') return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

/** The model choice and its evidence, owned by RevisitApp. */
export interface ConstellationModelProps {
    mode: ReferenceMode;
    /**
     * True when a CUSTOM specification came from a restored scenario rather than
     * from someone editing the fields — the evidence line must not call those
     * numbers hand-entered (m4).
     */
    isRestored?: boolean;
    onModeChange: (mode: ReferenceMode) => void;
    /**
     * Run the live-TLE fit as a DIAGNOSTIC. It never becomes the analysed
     * reference — see `docs/REVISIT_MODEL_SEMANTICS_DECISION_2026-08-29.md` D2.
     */
    onCompareToTleSet: () => void;
    /**
     * Overwrite Custom HLD with the reference profile, deliberately. Switching
     * models never does this on its own — Custom keeps its own values.
     */
    onCopyHldIntoCustom: () => void;
    profile: ReferenceProfile | null;
    fit: WalkerFit | null;
    /** What the current `fit` was measured from — source, instant, epoch span. */
    provenance: CalibrationProvenance | null;
    isRunning: boolean;
    error: string | null;
}

const sectionLabel = 'text-[11px] font-black uppercase tracking-[0.12em] text-slate-500';

/**
 * Short labels, explanation on hover. The panel has to stay readable at a
 * glance in a live demonstration; the detail belongs to whoever asks for it.
 */
/**
 * Two options, because there are two THINGS here: a reference to analyse, and
 * an edit of it. The live-TLE fit used to sit alongside them as a third button,
 * which read as a third comparable constellation — it is neither a reference
 * nor an edit, it is a measurement ABOUT the reference, and it now lives in its
 * own action below (decision D2, 2026-08-29).
 */
const MODE_OPTIONS: Array<{ id: ReferenceMode; label: string; title: string }> = [
    {
        id: 'HLD',
        label: 'OneWeb Gen1 · HLD',
        title: 'OneWeb Gen1 HLD reference profile — the published design, carrying its '
            + 'plane-altitude ladder, RAAN seam and spare distribution. The spare '
            + 'distribution per plane is an assumption; the HLD gives only a fleet total.',
    },
    {
        id: 'CUSTOM',
        label: 'Custom HLD',
        title: 'Your own editable constellation, seeded from the HLD. It keeps its '
            + 'own values: switching to the HLD reference and back does not '
            + 'overwrite them. Nothing external vouches for the result.',
    },
];

const NO_PROFILE_DETAIL =
    'Only a named reference profile carries this. A fitted shell is estimated from mean '
    + 'elements at one epoch, and editing planes or altitude discards it because it cannot '
    + 'be re-derived for a different plane count.';

const DetailRow: React.FC<{ label: string; value: string; title: string }> = ({
    label, value, title,
}) => (
    <div className="flex items-baseline justify-between gap-2" title={title}>
        <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">
            {label}
        </span>
        <span className="text-[12px] font-bold text-slate-300">{value}</span>
    </div>
);

/** `1175–1219 km · 12 planes`, full ladder on hover. */
function altitudeLadderOf(values?: number[]) {
    if (!values?.length) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
        summary: min === max ? `${min} km` : `${min}–${max} km · ${values.length} planes`,
        full: values.map((v, i) => `plane ${i}: ${v} km`).join('\n'),
    };
}

/**
 * Ordinary inter-plane step plus the seam.
 *
 * The seam is NOT a member of `raanOffsetsDeg`: those offsets are a plain
 * cumulative sum of the ordinary spacing, and the seam is the WRAP gap that
 * closes the pattern — 180° for a Star, 360° for a Delta — between the last
 * plane and plane 0. Reading it as "the step that differs from the others" finds
 * only floating-point noise in `p * 15.225` and reports it as an engineering
 * feature, which is worse than not showing it at all.
 */
function raanSpacingOf(spec: WalkerSpec) {
    const offsets = spec.raanOffsetsDeg;
    if (!offsets || offsets.length < 2) return null;
    const round = (v: number) => Number(v.toFixed(3));
    const steps = offsets.slice(1).map((v, i) => round(v - offsets[i]));
    const uniform = steps.every((step) => step === steps[0]);
    const spanDeg = spec.pattern === 'STAR' ? 180 : 360;
    const seam = round(spanDeg - offsets[offsets.length - 1]);
    return {
        summary: uniform
            ? `${steps[0]}° · seam ${seam}°`
            : `${steps.length} uneven steps`,
        full: (uniform
            ? `${steps.length} ordinary gaps of ${steps[0]}°, wrap seam ${seam}° `
                + `(${steps.length} × ${steps[0]} + ${seam} = ${spanDeg})`
            : 'Non-uniform inter-plane spacing')
            + `\n${offsets.map((v, i) => `plane ${i}: ${round(v)}°`).join('\n')}`,
    };
}

/** `58 across 12 planes`, per-plane counts on hover. */
function sparesOf(perPlane?: number[]) {
    if (!perPlane?.length) return null;
    const total = perPlane.reduce((sum, n) => sum + n, 0);
    if (total === 0) return null;
    return {
        summary: `${total} across ${perPlane.length} planes`,
        full: perPlane.map((n, i) => `plane ${i}: ${n}`).join('\n'),
    };
}

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
    label, hint, children,
}) => (
    <label className="flex flex-col gap-1">
        <span className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-500">
            {label}
        </span>
        {children}
        {hint && <span className="text-[11px] leading-3 text-slate-600">{hint}</span>}
    </label>
);

const PayloadGeometryEditor: React.FC<AdvancedDrawerProps> = ({ scenario, onChange }) => {
    const seed = useMemo(() => fovForDisplay(scenario.payload), [scenario.payload]);
    const [draft, setDraft] = useState<FovSpec>(seed);
    useEffect(() => setDraft(seed), [seed]);

    const validation = useMemo(
        () => validateFovSpec(draft, scenario.reference.altitudeKm),
        [draft, scenario.reference.altitudeKm]
    );
    /*
     * Compared against the SEED, not against `scenario.payload`: comparing
     * against the raw value would light up `Apply geometry` the moment the
     * drawer opened, before anybody had edited anything.
     */
    const dirty = JSON.stringify(draft) !== JSON.stringify(seed);
    const setBias = (axis: 'alongTrack' | 'crossTrack', value: number) => {
        setDraft((current) => ({
            ...current,
            biasDeg: { ...current.biasDeg, [axis]: value },
        }));
    };

    return (
        /*
         * Enclosed, because this block owns two buttons and the Analysis window
         * follows it: with only a top rule, Discard/Apply read as the footer of
         * everything above rather than as the footer of these fields.
         */
        <div className="rounded border border-slate-700/60 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                    Instrument geometry
                </p>
                <span className="text-[11px] text-slate-500 tabular-nums">
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

            {/*
              * Name the scope, and say why this block alone is staged.
              *
              * The reason given here used to be the recompute cost, and that
              * was wrong: `useRevisitAnalysis` already debounces at 300 ms and
              * invalidates superseded requests, and the Walker fields trigger
              * the same work without being staged. The real reason is
              * validation shape — a FOV is a coupled specification checked as a
              * whole by `validateFovSpec`, so an emptied half-angle is invalid
              * in a way a Walker field cannot be, every one of those being
              * clamped per field by `bounded`.
              */}
            <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                Instrument geometry only — the Walker parameters above apply as you type.
                These fields are staged because a field of view is validated as a whole:
                a half-typed angle would otherwise be published as a real geometry.
            </p>
            {!validation.ok && (
                <p className="mt-1.5 rounded border border-red-400/40 bg-red-500/10 px-2 py-1 text-[12px] leading-4 text-red-200">
                    {validation.errors.join('; ')}
                </p>
            )}
            <div className="mt-2 flex justify-end gap-2">
                <button
                    type="button"
                    disabled={!dirty}
                    onClick={() => setDraft(seed)}
                    className="rounded px-2 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 disabled:opacity-40"
                >
                    Discard edits
                </button>
                <button
                    type="button"
                    disabled={!dirty || !validation.ok}
                    onClick={() => onChange({ ...scenario, payload: draft })}
                    className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-amber-200 disabled:opacity-40"
                >
                    Apply instrument geometry
                </button>
            </div>
        </div>
    );
};

export const AdvancedDrawer: React.FC<AdvancedDrawerProps> = ({
    scenario, onChange, model, variant = 'panel',
}) => {
    const { reference, selection } = scenario;
    // Only Custom may edit. HLD and Measured are records of something external,
    // so an editable field there would invite a value the label then denies.
    const fieldsLocked = model ? model.mode !== 'CUSTOM' : false;
    const matchesHldProfile = walkerSpecsEqual(reference, DEFAULT_PROFILE.spec);
    const altitudeLadder = altitudeLadderOf(reference.planeAltitudesKm);
    const raanSpacing = raanSpacingOf(reference);
    const spares = sparesOf(reference.sparesPerPlane);

    /**
     * The whole specification in one line (Programme 7E).
     *
     * A salesperson opening this panel needs `which fleet am I simulating, and
     * why should the customer believe it` — Model and Evidence. The seven
     * Walker fields, the three profile arrays, the stride selectors, the
     * instrument geometry and the analysis window are the engineer's, and they
     * now live behind `Expert settings`. This sentence is what replaces them at
     * the first level of reading: still the truth, just not a form.
     */
    const characteristicsSummary = [
        `${reference.planes} planes × ${reference.satsPerPlane} satellites`,
        `Walker ${reference.pattern}`,
        // Rounded through the same helpers the header uses: a measured fit
        // carries raw floats, and `87.90084999999999°` beside the header's
        // `87.9°` reads as two different numbers.
        `${displayInclinationDeg(reference.inclinationDeg)}° inclination`,
        `${displayAltitudeKm(reference.altitudeKm)} km`,
        altitudeLadder ? 'per-plane altitude ladder' : null,
        spares ? `${spares.summary} spare` : null,
    ].filter(Boolean).join(' · ');

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

    /*
     * Take the fitted shell as the analysed constellation — as a COPY, never as
     * a model. `referenceWithPatch` is bypassed deliberately: this is not a
     * patch of the current spec but a wholesale replacement, and the ladder,
     * seam and spares must not survive it. A fit has none of the three, so
     * carrying them over would attach HLD structure to non-HLD numbers.
     */
    const adoptFittedShell = () => {
        const fitted = model?.fit?.spec;
        if (!fitted) return;
        model?.onModeChange('CUSTOM');
        onChange({
            ...scenario,
            reference: fitted,
            selection: reconcileSelection(fitted, selection),
        });
    };

    /*
     * The measurement opens its own surface rather than growing this panel.
     * Closing it keeps the last fit in the hook, so re-opening is instant — the
     * dialog carries the instant it was measured at, which is what makes a kept
     * result readable rather than misleading.
     */
    const [tleDialogOpen, setTleDialogOpen] = useState(false);
    const compareButtonRef = useRef<HTMLButtonElement | null>(null);

    const validation = validateSelection(reference, selection);
    // z = 0 satisfies the degeneracy rule trivially and is the expected baseline,
    // so only warn when the user has actually set a shift that does nothing.
    const showDegeneracy = validation.shiftHasNoEffect && selection.planeShift !== 0;

    const content = (
        <div className="space-y-3">
                <div>
                    {model && (
                        <>
                            <p className={sectionLabel}>Model</p>
                            <div
                                role="radiogroup"
                                aria-label="Constellation model"
                                className="mb-2 flex gap-1"
                            >
                                {MODE_OPTIONS.map((option) => {
                                    const active = model.mode === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            title={option.title}
                                            onClick={() => model.onModeChange(option.id)}
                                            className={`flex-1 rounded border px-2 py-1 text-[12px] font-black uppercase tracking-[0.08em] transition-colors disabled:opacity-60 ${active
                                                ? 'border-amber-400/60 bg-amber-400/15 text-amber-100'
                                                : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {/*
                              * A diagnostic, deliberately NOT a fourth radio: it
                              * measures how far the real fleet has drifted from
                              * the shell being analysed, and changes nothing
                              * about what is analysed. The wording avoids
                              * "live" and "latest" — the TLE ladder may
                              * legitimately serve a stale cache or the bundled
                              * file, and on a filtered network it always does.
                              */}
                            <button
                                type="button"
                                ref={compareButtonRef}
                                aria-expanded={tleDialogOpen}
                                onClick={() => {
                                    // A toggle, not a re-run. Collapsing and
                                    // expanding a reading must not re-hit the
                                    // network; `Re-measure` inside the panel is
                                    // where a fresh measurement is asked for.
                                    if (tleDialogOpen) {
                                        setTleDialogOpen(false);
                                        return;
                                    }
                                    // Open first, measure second: the fetch can
                                    // take seconds on a filtered network, and a
                                    // button that does nothing visible for that
                                    // long gets clicked again.
                                    setTleDialogOpen(true);
                                    if (!model.fit) model.onCompareToTleSet();
                                }}
                                disabled={model.isRunning}
                                title="Fit a perfect Walker shell to the OneWeb TLE data currently available — live, cached, or the bundled file — and report the residual. Diagnostic only: the analysed constellation is not changed."
                                className="mb-2 w-full rounded border border-slate-600 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-slate-400 transition-colors hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-60"
                            >
                                {model.isRunning
                                    ? 'Comparing…'
                                    : tleDialogOpen
                                        ? 'Hide TLE comparison'
                                        : 'Compare with available TLE data'}
                            </button>
                            {model.error && (
                                <p className="mb-2 text-[11px] leading-3 text-red-300">{model.error}</p>
                            )}
                        </>
                    )}
                    {/* One line instead of a form: Model and Evidence are
                        what a commercial reading of this panel needs
                        (Programme 7E). */}
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                        <p className={sectionLabel}>
                            {model ? 'Characteristics' : 'Reference constellation'}
                        </p>
                        {matchesHldProfile && model?.mode === 'CUSTOM' && (
                            <span
                                title="These values are identical to the HLD reference profile, including its plane-altitude ladder, RAAN seam and spares."
                                className="shrink-0 rounded border border-lime-400/40 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-lime-200"
                            >
                                = HLD
                            </span>
                        )}
                    </div>
                    <p className="revisit-characteristics-summary mb-2 text-[12px] leading-5 text-slate-300">
                        {characteristicsSummary}
                    </p>
                    {model && (
                        <div className="mt-2 border-t border-slate-700/50 pt-2">
                            <ModelProvenance
                                profile={model.profile}
                                mode={model.mode}
                                isRestored={model.isRestored}
                            />
                        </div>
                    )}
                </div>

                {/*
                  * Open, always. This was a `<details>` behind a summary, on the
                  * reasoning that a demonstration audience should not meet a
                  * form. In practice everyone who opens this panel is here to
                  * read or change these fields, and a second click to reach
                  * them is a second click every time. The section keeps its
                  * heading and its rule, so the panel still reads as two
                  * blocks — what the model is, and what it is made of.
                  */}
                <section className="revisit-expert-settings border-t border-slate-700/60 pt-2">
                    <p className="flex min-h-11 items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400 md:min-h-0">
                        Expert settings
                    </p>
                    <div className="mt-2 space-y-3">
                    <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className={sectionLabel}>
                            {model ? 'Characteristics' : 'Reference constellation'}
                        </p>
                        {fieldsLocked && (
                            <span
                                title="The HLD reference and the measured shell are records of something external, so their values are shown as they are. Choose Custom to edit them."
                                className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500"
                            >
                                Custom to edit
                            </span>
                        )}
                        {/*
                          * Beside the fields it rewrites, not under the model
                          * selector: it acts on these Walker values, and read
                          * from the top of the panel it looked like a third way
                          * of choosing a model.
                          */}
                        {model?.mode === 'CUSTOM' && !matchesHldProfile && (
                            <button
                                type="button"
                                onClick={model.onCopyHldIntoCustom}
                                title="Replace these values with the HLD reference, plane-altitude ladder, RAAN seam and spares included. This discards the parameters you entered."
                                className="rounded border border-slate-600 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-400 transition-colors hover:border-amber-400/50 hover:text-amber-200"
                            >
                                Copy HLD values
                            </button>
                        )}
                        {matchesHldProfile && model?.mode === 'CUSTOM' && (
                            <span
                                title="These values are identical to the HLD reference profile, including its plane-altitude ladder, RAAN seam and spares."
                                className="rounded border border-lime-400/40 px-1.5 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-lime-200"
                            >
                                = HLD
                            </span>
                        )}
                    </div>
                    <fieldset
                        disabled={fieldsLocked}
                        className={`m-0 grid grid-cols-3 gap-2 border-0 p-0 ${fieldsLocked ? 'opacity-70' : ''}`}
                    >
                        <Field label="Pattern">
                            <select
                                className={walkerFieldClass(
                                    reference.pattern !== DEFAULT_PROFILE.spec.pattern
                                )}
                                value={reference.pattern}
                                onChange={(e) => setReference({ pattern: e.target.value as WalkerPattern })}
                            >
                                <option value="STAR">STAR</option>
                                <option value="DELTA">DELTA</option>
                            </select>
                        </Field>
                        <Field label="Planes P">
                            <input
                                type="number" min={1} max={MAX_ADVANCED_PLANES} step={1}
                                className={walkerFieldClass(
                                    reference.planes !== DEFAULT_PROFILE.spec.planes
                                )}
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
                                type="number" min={1} max={MAX_ADVANCED_SATS_PER_PLANE} step={1}
                                className={walkerFieldClass(
                                    reference.satsPerPlane !== DEFAULT_PROFILE.spec.satsPerPlane
                                )}
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
                                type="number" min={0} max={180} step={0.1}
                                className={walkerFieldClass(
                                    reference.inclinationDeg !== DEFAULT_PROFILE.spec.inclinationDeg
                                )}
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
                                type="number" min={200} max={2000} step={10}
                                className={walkerFieldClass(
                                    reference.altitudeKm !== DEFAULT_PROFILE.spec.altitudeKm
                                )}
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
                                type="number" step={1}
                                className={walkerFieldClass(
                                    reference.phasingF !== DEFAULT_PROFILE.spec.phasingF
                                )}
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
                                type="number" min={0.1} max={2} step={0.01}
                                className={walkerFieldClass(
                                    reference.fudge !== DEFAULT_PROFILE.spec.fudge
                                )}
                                value={reference.fudge}
                                onChange={(e) => setReference({
                                    fudge: bounded(e.target.value, 0.1, 2, reference.fudge),
                                })}
                            />
                        </Field>
                        <Field label="Total">
                            <div className="px-1.5 py-1 text-[12px] font-bold text-slate-400">
                                {reference.planes * reference.satsPerPlane} sats
                            </div>
                        </Field>
                    </fieldset>

                    {/*
                      * The three arrays a reference profile carries and a fitted
                      * shell does not. Shown nowhere before this panel, yet they
                      * are what makes the HLD profile a different object from a
                      * look-alike with the same seven scalars. Summarised, with
                      * the full values on hover rather than on screen.
                      */}
                    {model && (
                        <div className="mt-2 space-y-0.5 border-t border-slate-700/50 pt-2">
                            <DetailRow
                                label="Plane altitudes"
                                value={altitudeLadder?.summary ?? '—'}
                                title={altitudeLadder?.full ?? NO_PROFILE_DETAIL}
                            />
                            <DetailRow
                                label="RAAN spacing"
                                value={raanSpacing?.summary ?? '—'}
                                title={raanSpacing?.full ?? NO_PROFILE_DETAIL}
                            />
                            <DetailRow
                                label="Spares"
                                value={spares?.summary ?? '—'}
                                title={spares?.full ?? NO_PROFILE_DETAIL}
                            />
                        </div>
                    )}
                    </div>
                <div className="border-t border-slate-700/60 pt-2.5">
                    <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
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

                    <p className="mt-1.5 text-[12px] text-slate-400">
                        <span className="font-black text-amber-300">
                            {payloadCount(reference, selection)}
                        </span>{' '}
                        payloads — {reference.planes / selection.planeStride} planes ×{' '}
                        {reference.satsPerPlane / selection.satStride}
                    </p>

                    {showDegeneracy && (
                        <p className="mt-1.5 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[12px] leading-4 text-amber-200">
                            {validation.warnings[0]}
                        </p>
                    )}
                </div>

                <PayloadGeometryEditor scenario={scenario} onChange={onChange} />

                    </div>
                </section>

            {/* Portalled, so its place in this tree is irrelevant — it is here
                because this is where its launcher lives. */}
            {model && tleDialogOpen && (
                <TleComparisonDialog
                    fit={model.fit}
                    provenance={model.provenance}
                    analysedSpec={reference}
                    mode={model.mode}
                    isRunning={model.isRunning}
                    error={model.error}
                    onReMeasure={model.onCompareToTleSet}
                    onAdoptFittedShell={adoptFittedShell}
                    onClose={() => setTleDialogOpen(false)}
                    anchorRef={compareButtonRef}
                />
            )}
        </div>
    );

    if (variant === 'menu') {
        return (
            <section className="px-3 py-3" aria-label="Constellation settings">
                <div className="mb-3 border-b border-slate-700/60 pb-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-300">
                        Constellation settings
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                        Walker model, hosted-payload topology and instrument geometry
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
