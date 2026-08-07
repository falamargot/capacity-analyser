/**
 * fitWalker.ts — fit a parametric Walker shell to a real fleet.
 *
 * "Calibrate against OneWeb" (proposal §3.4). The application already loads the
 * real OneWeb TLEs from CelesTrak, and OneWeb is itself a Walker Star. Fitting
 * `P, S, i, h, f, fudge` to that fleet and reporting the residual converts this
 * module from *a nice simulation* into *a model checked against a real fleet in
 * orbit*. For an executive audience that is the difference between a demo and
 * evidence.
 *
 * ── WHAT THIS DOES AND DOES NOT CLAIM ───────────────────────────────────────
 * It fits MEAN ELEMENTS at one epoch. It does not propagate, does not use SGP4,
 * and says nothing about how well the model tracks the fleet over time. The
 * residual it reports is "how close is the real fleet to a perfect Walker shell
 * right now", which is exactly the question that makes the parametric model
 * credible — and nothing more.
 *
 * A real fleet is never a perfect Walker: satellites drift, spares sit off-slot,
 * planes are raised at different times. A non-zero residual is the expected
 * outcome and is the interesting number. A suspiciously small one means the
 * input was synthetic.
 *
 * No `satrec` and no `satellite.js` appear here — the input is plain numbers
 * produced by `utils/observedOrbitalElements` (ADR-001 §1).
 */

import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import { argLatAtEpochDeg, type ObservedElements } from '../../../utils/observedOrbitalElements';
import type { WalkerSpec } from '../domain/types';
import { normalizeDeg } from '../domain/walker';

/** Two RAANs closer than this are treated as the same orbital plane. */
export const DEFAULT_PLANE_TOLERANCE_DEG = 6;

/**
 * Satellites further than this from the fleet's median altitude are excluded.
 *
 * A live fleet always contains satellites raising to their operational shell or
 * being lowered for disposal. They matter here for a specific reason: J2 nodal
 * regression is altitude-dependent, so an off-shell satellite drifts in RAAN
 * away from its plane and lands wherever it happens to be. Clustering then sees
 * it as an extra, nearly-empty plane.
 *
 * Measured against the real OneWeb catalogue this is not hypothetical: without
 * the gate the fit reported 17 planes; with it, 12 — the true Gen1 figure.
 */
export const DEFAULT_SHELL_TOLERANCE_KM = 25;

/**
 * A cluster smaller than this fraction of the median cluster is treated as
 * strays rather than a plane. Guards the residual case where an off-shell
 * satellite is still within the altitude gate.
 */
export const DEFAULT_MIN_PLANE_FRACTION = 0.25;

export interface FitOptions {
    planeToleranceDeg?: number;
    shellToleranceKm?: number;
    minPlaneFraction?: number;
}

export interface WalkerFit {
    spec: WalkerSpec;
    /** How many observed satellites the fit actually used. */
    satellitesUsed: number;
    /** Supplied but excluded as off-shell or as stray clusters. */
    satellitesExcluded: number;
    /** Distinct orbital planes detected. */
    planesDetected: number;
    /** Satellites per detected plane, ascending — reveals partial planes and spares. */
    planePopulations: number[];
    /** RMS of each satellite's RAAN against its fitted plane, degrees. */
    raanRmsDeg: number;
    /** RMS against the fitted uniform in-plane phasing, degrees. */
    argLatRmsDeg: number;
    /** RMS altitude deviation from the fitted shell, km. */
    altitudeRmsKm: number;
    /** RMS inclination deviation, degrees. */
    inclinationRmsDeg: number;
    /**
     * The headline residual: `argLatRmsDeg` expressed as an along-track distance
     * at the fitted altitude. The unit an engineer can sanity-check.
     */
    alongTrackRmsKm: number;
    notes: string[];
}

const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const rms = (values: number[]): number =>
    values.length === 0 ? 0 : Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);

/** Signed angular difference a − b, wrapped into (−180, 180]. */
export function angleDeltaDeg(a: number, b: number): number {
    return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * Group satellites into orbital planes by RAAN.
 *
 * Sorts by RAAN and cuts wherever the gap exceeds the tolerance, then merges the
 * first and last groups if they are adjacent across 0°/360°. Chosen over k-means
 * because the plane count is what we are trying to discover, not an input.
 */
export function clusterPlanesByRaan(
    observed: ObservedElements[],
    toleranceDeg = DEFAULT_PLANE_TOLERANCE_DEG
): ObservedElements[][] {
    if (observed.length === 0) return [];
    const sorted = [...observed].sort((a, b) => a.raanDeg - b.raanDeg);

    const groups: ObservedElements[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1];
        if (sorted[i].raanDeg - previous.raanDeg <= toleranceDeg) {
            groups[groups.length - 1].push(sorted[i]);
        } else {
            groups.push([sorted[i]]);
        }
    }

    // The wrap: the lowest and highest RAANs may be the same plane seen either
    // side of 0°.
    if (groups.length > 1) {
        const first = groups[0];
        const last = groups[groups.length - 1];
        if (360 - last[last.length - 1].raanDeg + first[0].raanDeg <= toleranceDeg) {
            groups[0] = [...last, ...first];
            groups.pop();
        }
    }

    return groups;
}

/** Circular mean of angles in degrees — a plain mean is wrong across 0°/360°. */
export function circularMeanDeg(anglesDeg: number[]): number {
    if (anglesDeg.length === 0) return 0;
    let x = 0;
    let y = 0;
    for (const angle of anglesDeg) {
        const rad = (angle * Math.PI) / 180;
        x += Math.cos(rad);
        y += Math.sin(rad);
    }
    return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/**
 * Put plane RAANs into their true sequence and measure the arc they occupy.
 *
 * `max − min` is the wrong measure on a circle: a set of planes straddling 0°
 * looks like it spans nearly 360° when it may occupy a narrow arc. Instead find
 * the largest gap between adjacent planes and start the sequence immediately
 * after it, unwrapping past 360° as needed. What remains is the real span.
 *
 * Returns the unwrapped RAANs ascending (values may exceed 360) and the span.
 */
export function unwrapPlaneOrder(
    planeRaans: number[]
): { ordered: number[]; spanDeg: number } {
    if (planeRaans.length === 0) return { ordered: [], spanDeg: 0 };
    const sorted = [...planeRaans].sort((a, b) => a - b);
    if (sorted.length === 1) return { ordered: sorted, spanDeg: 0 };

    let gapIndex = 0;
    let largestGap = sorted[0] + 360 - sorted[sorted.length - 1]; // the wrap gap
    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i - 1];
        if (gap > largestGap) {
            largestGap = gap;
            gapIndex = i;
        }
    }

    const ordered: number[] = [];
    for (let k = 0; k < sorted.length; k++) {
        const value = sorted[(gapIndex + k) % sorted.length];
        // Unwrap: each entry must be ≥ the previous one.
        ordered.push(k > 0 && value < ordered[k - 1] ? value + 360 : value);
    }

    return { ordered, spanDeg: ordered[ordered.length - 1] - ordered[0] };
}

/**
 * Fit a Walker shell to observed mean elements.
 *
 * @throws if there is nothing to fit. A caller with an empty fleet has a data
 *         problem, not a modelling one, and should hear about it.
 */
export function fitWalker(
    allObserved: ObservedElements[],
    options: FitOptions | number = {}
): WalkerFit {
    if (allObserved.length === 0) {
        throw new Error('Cannot fit a Walker shell to an empty fleet');
    }
    // A bare number keeps the original signature working.
    const opts: FitOptions = typeof options === 'number'
        ? { planeToleranceDeg: options }
        : options;
    const toleranceDeg = opts.planeToleranceDeg ?? DEFAULT_PLANE_TOLERANCE_DEG;
    const shellToleranceKm = opts.shellToleranceKm ?? DEFAULT_SHELL_TOLERANCE_KM;
    const minPlaneFraction = opts.minPlaneFraction ?? DEFAULT_MIN_PLANE_FRACTION;

    const notes: string[] = [];

    // ── Gate to the operational shell ───────────────────────────────────────
    const shellSemiMajorKm = median(allObserved.map((o) => o.semiMajorAxisKm));
    const onShell = allObserved.filter(
        (o) => Math.abs(o.semiMajorAxisKm - shellSemiMajorKm) <= shellToleranceKm
    );
    const offShellCount = allObserved.length - onShell.length;
    if (offShellCount > 0) {
        notes.push(
            `${offShellCount} of ${allObserved.length} satellites are more than `
            + `${shellToleranceKm} km off the median shell — raising, deorbiting or in a `
            + `different shell — and were excluded. Their RAAN drifts at a different rate, `
            + `so leaving them in invents extra planes.`
        );
    }
    const shellFiltered = onShell.length > 0 ? onShell : allObserved;

    // ── Normalise every phase to one instant ────────────────────────────────
    // Mean anomaly is measured from each satellite's own TLE epoch, so raw
    // `argLatDeg` values are not comparable. Real catalogues make this decisive
    // rather than academic: OneWeb issues TLEs at each satellite's ascending-node
    // crossing, which puts argp + M at the same constant for all 651 of them and
    // hides the entire in-plane distribution. Their phase lives in the 15-hour
    // spread of epochs, and only appears once they are propagated to a common
    // instant.
    const commonEpochMs = median(shellFiltered.map((o) => o.epochMs));
    const epochSpreadHours = shellFiltered.length > 1
        ? (Math.max(...shellFiltered.map((o) => o.epochMs))
            - Math.min(...shellFiltered.map((o) => o.epochMs))) / 3_600_000
        : 0;
    const observed: ObservedElements[] = shellFiltered.map((o) => ({
        ...o,
        argLatDeg: argLatAtEpochDeg(o, commonEpochMs),
        epochMs: commonEpochMs,
    }));
    if (epochSpreadHours > 1) {
        notes.push(
            `TLE epochs span ${epochSpreadHours.toFixed(1)} h; in-plane phases were `
            + `propagated to a common epoch before fitting. Comparing them unpropagated `
            + `would be meaningless.`
        );
    }

    const inclinationDeg = median(observed.map((o) => o.inclinationDeg));
    const semiMajorAxisKm = median(observed.map((o) => o.semiMajorAxisKm));
    const altitudeKm = semiMajorAxisKm - EARTH_RADIUS_KM;

    // ── Cluster into planes, discarding stray clusters ──────────────────────
    const rawPlanes = clusterPlanesByRaan(observed, toleranceDeg);
    const medianPopulation = median(rawPlanes.map((p) => p.length));
    // A lone satellite between planes is a stray, not a plane — but only when the
    // fleet is populated enough for that to mean something. A constellation that
    // genuinely flies one satellite per plane (median 1) must keep them all,
    // otherwise the filter deletes the entire fleet.
    const populationFloor = medianPopulation >= 2
        ? Math.max(2, medianPopulation * minPlaneFraction)
        : 1;
    const planes = rawPlanes.length > 1
        ? rawPlanes.filter((p) => p.length >= populationFloor)
        : rawPlanes;
    const strayCount = rawPlanes.length - planes.length;
    const strayySatellites = rawPlanes
        .filter((p) => !planes.includes(p))
        .reduce((sum, p) => sum + p.length, 0);
    if (strayCount > 0) {
        notes.push(
            `${strayCount} cluster${strayCount === 1 ? '' : 's'} holding `
            + `${strayySatellites} satellite${strayySatellites === 1 ? '' : 's'} `
            + `fell below ${Math.round(populationFloor)} members and were treated as strays, `
            + `not planes.`
        );
    }

    const planeRaans = planes.map((plane) => circularMeanDeg(plane.map((s) => s.raanDeg)));
    const planesDetected = planes.length;
    const satellitesUsed = planes.reduce((sum, p) => sum + p.length, 0);

    // ── Pattern and RAAN step ───────────────────────────────────────────────
    // A Walker Star folds its planes into 180°, a Delta spreads over 360°.
    // Decided from the observed span rather than assumed — but the span must be
    // measured on the CIRCLE, not with max − min. The real OneWeb fleet is the
    // demonstration: its 12 planes sit at 7.5…53.1 and 245.6…352.3, so max − min
    // reads 344.8° and the constellation looks like a Delta. Rotated to start
    // after the largest gap, the same planes form one contiguous 167.5° run at a
    // uniform 15.24° step — a Star, which is what OneWeb actually is.
    const { ordered: unwrappedRaans, spanDeg } = unwrapPlaneOrder(planeRaans);
    const pattern: WalkerSpec['pattern'] = spanDeg <= 200 ? 'STAR' : 'DELTA';
    const span = pattern === 'STAR' ? 180 : 360;

    const steps: number[] = [];
    for (let i = 1; i < unwrappedRaans.length; i++) {
        steps.push(unwrappedRaans[i] - unwrappedRaans[i - 1]);
    }
    const medianStep = steps.length > 0 ? median(steps) : span / Math.max(planesDetected, 1);
    const idealStep = span / Math.max(planesDetected, 1);
    const fudge = idealStep > 0 ? medianStep / idealStep : 1;

    // ── Per-plane population ────────────────────────────────────────────────
    const planePopulations = planes.map((p) => p.length).sort((a, b) => a - b);
    const satsPerPlane = Math.max(1, Math.round(median(planes.map((p) => p.length))));
    if (planePopulations[0] !== planePopulations[planePopulations.length - 1]) {
        notes.push(
            `Plane populations are uneven (${planePopulations[0]}–`
            + `${planePopulations[planePopulations.length - 1]}). A real fleet carries spares `
            + `and gaps; S is the median.`
        );
    }

    // ── Phasing factor f ────────────────────────────────────────────────────
    // Within a plane, satellites should sit at multiples of 360/S. Between
    // consecutive planes the whole set is offset by f · 360/(P·S). Recover that
    // offset per plane and take the median slope.
    const inPlaneSpacing = 360 / satsPerPlane;
    const phaseOffsets = planes.map((plane) => {
        // Offset of this plane's satellites from the in-plane grid, circular-averaged
        // over the residual modulo one slot.
        const residuals = plane.map((s) => normalizeDeg(s.argLatDeg) % inPlaneSpacing);
        return circularMeanDeg(residuals.map((r) => (r / inPlaneSpacing) * 360))
            / 360 * inPlaneSpacing;
    });

    // Ordered by the unwrapped sequence, so "consecutive planes" means adjacent
    // in the real run rather than adjacent in raw 0–360 sort order.
    const orderedByRaan = unwrappedRaans.map((unwrapped) => {
        const index = planeRaans.findIndex((r) => normalizeDeg(r) === normalizeDeg(unwrapped));
        return { raan: unwrapped, offset: phaseOffsets[index] ?? 0 };
    });
    const offsetSteps: number[] = [];
    for (let i = 1; i < orderedByRaan.length; i++) {
        offsetSteps.push(angleDeltaDeg(orderedByRaan[i].offset, orderedByRaan[i - 1].offset));
    }
    const perPlanePhaseDeg = offsetSteps.length > 0 ? median(offsetSteps) : 0;
    const phaseUnit = 360 / (planesDetected * satsPerPlane);
    const phasingF = phaseUnit > 0
        ? Math.round(perPlanePhaseDeg / phaseUnit)
        : 0;

    const spec: WalkerSpec = {
        pattern,
        planes: planesDetected,
        satsPerPlane,
        inclinationDeg,
        altitudeKm,
        phasingF,
        fudge,
        // The first plane of the real run, not the numerically smallest RAAN.
        raan0Deg: normalizeDeg(unwrappedRaans[0] ?? 0),
    };

    // ── Residuals ───────────────────────────────────────────────────────────
    const raanResiduals: number[] = [];
    planes.forEach((plane, index) => {
        for (const satellite of plane) {
            raanResiduals.push(angleDeltaDeg(satellite.raanDeg, planeRaans[index]));
        }
    });

    // Each satellite against its nearest slot on the fitted in-plane grid.
    const argLatResiduals: number[] = [];
    planes.forEach((plane, index) => {
        const offset = phaseOffsets[index];
        for (const satellite of plane) {
            const fromGrid = angleDeltaDeg(satellite.argLatDeg, offset);
            const slot = Math.round(fromGrid / inPlaneSpacing) * inPlaneSpacing;
            argLatResiduals.push(angleDeltaDeg(fromGrid, slot));
        }
    });

    const argLatRmsDeg = rms(argLatResiduals);

    if (planesDetected === 1) {
        notes.push('Only one plane detected — P, f and fudge are not constrained by this fleet.');
    }
    // The phasing factor is the least-constrained parameter here. One slot is
    // 360/(P·S) wide — well under a degree for a large fleet — so ordinary
    // station-keeping scatter is comparable to the quantity being measured.
    if (planesDetected > 1 && phaseUnit > 0 && argLatRmsDeg > phaseUnit / 2) {
        notes.push(
            `Phasing factor f is weakly constrained: one f-step is ${phaseUnit.toFixed(2)}° but the `
            + `in-plane residual is ${argLatRmsDeg.toFixed(2)}°. Treat f = ${phasingF} as indicative.`
        );
    }
    if (satellitesUsed < planesDetected * 2) {
        notes.push('Fewer than two satellites per plane on average; the phasing fit is weak.');
    }

    const used = planes.flat();

    return {
        spec,
        satellitesUsed,
        satellitesExcluded: allObserved.length - satellitesUsed,
        planesDetected,
        planePopulations,
        raanRmsDeg: rms(raanResiduals),
        argLatRmsDeg,
        altitudeRmsKm: rms(used.map((o) => o.semiMajorAxisKm - semiMajorAxisKm)),
        inclinationRmsDeg: rms(used.map((o) => o.inclinationDeg - inclinationDeg)),
        alongTrackRmsKm: (argLatRmsDeg * Math.PI / 180) * semiMajorAxisKm,
        notes,
    };
}
