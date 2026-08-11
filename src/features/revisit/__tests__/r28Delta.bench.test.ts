/**
 * R28 delta + benchmark harness.
 *
 * Not an assertion suite. It prints the user-facing reference results and the
 * engine timings to `/tmp/r28_report.txt`, so the SAME file can be run on `main`
 * and on this branch and the two outputs diffed. That is the only honest way to
 * report "what numbers moved": recomputing them from the new code alone would
 * describe the new state, not the change.
 *
 * Skipped by default so it never runs in CI; enable with R28_REPORT=1.
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWalkerConstellation } from '../domain/walker';
import { REFERENCE_PROFILES } from '../domain/referenceProfiles';
import { selectSubConstellation } from '../domain/subConstellation';
import {
    DEFAULT_REFERENCE, DEFAULT_SELECTION, DEFAULT_TARGET, FOV_PRESETS, TARGET_PRESETS,
    swathKmForFov,
} from '../domain/presets';
import { computeAccessIntervals } from '../analysis/accessIntervals';
import { computeGapStatistics } from '../analysis/gapStatistics';
import { halfSwathKm, horizonOffNadirDeg, computeFootprint } from '../fov/footprint';
import { prepareFov } from '../fov/containment';
import {
    meanMotionRadPerSec, nodalRegressionRadPerSec, orbitalPeriodSec,
    preparePropagator, propagateState,
} from '../propagation/keplerJ2';
import { explainRevisit } from '../analysis/explainRevisit';
import type { AnalysisWindow, EciState, WalkerSpec } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);
const RUN = process.env.R28_REPORT === '1';

const hhmm = (ms: number | null) =>
    ms === null ? 'n/a' : `${Math.floor(ms / 3600000)}h ${Math.round((ms % 3600000) / 60000)}m`;

describe.skipIf(!RUN)('R28 reference report', () => {
    it('writes the user-facing results and timings', () => {
        const L: string[] = [];
        const spec: WalkerSpec = DEFAULT_REFERENCE;
        const fleet = generateWalkerConstellation(spec);
        const window: AnalysisWindow = { startMs: EPOCH, durationHours: 72, stepSeconds: 10 };

        L.push('=== ORBIT ===');
        L.push(`semiMajorAxisKm(1200 km)   ${fleet[0].semiMajorAxisKm.toFixed(4)}`);
        L.push(`orbital period (min)       ${(orbitalPeriodSec(fleet[0].semiMajorAxisKm) / 60).toFixed(4)}`);
        L.push(`mean motion (rad/s)        ${meanMotionRadPerSec(fleet[0].semiMajorAxisKm).toExponential(8)}`);
        L.push(`SSO drift 600 km 97.8 deg  ${(nodalRegressionRadPerSec(6378.137 + 600, 97.8) * 86400 * 180 / Math.PI).toFixed(6)} deg/day`);

        L.push('');
        L.push('=== INSTRUMENT ===');
        for (const [name, fov] of Object.entries(FOV_PRESETS)) {
            L.push(`${name.padEnd(9)} half-angle ${fov.halfAngle1Deg.toFixed(6)} deg  swath ${swathKmForFov(1200, fov).toFixed(3)} km`);
        }
        for (const h of [500, 600, 700, 1200]) {
            L.push(`horizon off-nadir @${String(h).padStart(4)} km  ${horizonOffNadirDeg(h).toFixed(5)} deg   halfSwath@30deg ${halfSwathKm(h, 30).toFixed(3)} km`);
        }

        L.push('');
        L.push('=== HEADLINE KPI (default scenario, 72 h) ===');
        const selected = selectSubConstellation(spec, DEFAULT_SELECTION, fleet);
        for (const target of TARGET_PRESETS) {
            const access = computeAccessIntervals(selected, target, FOV_PRESETS.STANDARD, window);
            const st = computeGapStatistics(access.intervals, window, access.warnings);
            L.push(
                `${target.name.padEnd(13)} maxGap ${hhmm(st.maxGapMs).padEnd(9)} meanGap ${hhmm(st.meanGapMs).padEnd(9)}`
                + ` passes/day ${(st.accessCount / 3).toFixed(2).padStart(6)}  inView ${(st.fractionInView * 100).toFixed(3)}%`
            );
        }

        L.push('');
        L.push(`=== FLEET === displayed ${fleet.length}  active ${fleet.filter((s) => !s.isSpare).length}  spares ${fleet.filter((s) => s.isSpare).length}`);
        L.push('');
        L.push('=== HEADLINE KPI (demo 12x8 shell, for continuity) ===');
        const demoFleet = generateWalkerConstellation(REFERENCE_PROFILES.DEMO_12X8.spec);
        const demoSel = selectSubConstellation(
            REFERENCE_PROFILES.DEMO_12X8.spec, { planeStride: 3, satStride: 4, planeShift: 0 }, demoFleet,
        );
        for (const target of TARGET_PRESETS) {
            const access = computeAccessIntervals(demoSel, target, FOV_PRESETS.STANDARD, window);
            const st = computeGapStatistics(access.intervals, window, access.warnings);
            L.push(
                `${target.name.padEnd(13)} maxGap ${hhmm(st.maxGapMs).padEnd(9)} meanGap ${hhmm(st.meanGapMs).padEnd(9)}`
                + ` passes/day ${(st.accessCount / 3).toFixed(2).padStart(6)}  inView ${(st.fractionInView * 100).toFixed(3)}%`
            );
        }

        L.push('');
        L.push('=== WHY THIS REVISIT ===');
        const ex = explainRevisit(
            { reference: spec, selection: DEFAULT_SELECTION, payload: FOV_PRESETS.STANDARD, target: DEFAULT_TARGET, window },
            null, null
        );
        for (const f of ex.factors) L.push(`${f.label.padEnd(16)} ${f.value}`);

        L.push('');
        L.push('=== FOOTPRINT (default, t=0) ===');
        const prop = preparePropagator(fleet[0]);
        const s0: EciState = propagateState(prop, 0);
        const fp = computeFootprint(s0, prepareFov(FOV_PRESETS.STANDARD), EPOCH, 0)!;
        L.push(`center            ${fp.center.lat.toFixed(6)}, ${fp.center.lng.toFixed(6)}`);
        L.push(`subSatellite      ${fp.subSatellitePoint.lat.toFixed(6)}, ${fp.subSatellitePoint.lng.toFixed(6)}`);
        L.push(`vertex[0]         ${fp.boundary[0].lat.toFixed(6)}, ${fp.boundary[0].lng.toFixed(6)}`);
        L.push(`vertex[12]        ${fp.boundary[12].lat.toFixed(6)}, ${fp.boundary[12].lng.toFixed(6)}`);

        L.push('');
        L.push('=== BENCHMARK ===');
        const bench = (label: string, fn: () => void, reps = 3) => {
            fn();
            const ts: number[] = [];
            for (let i = 0; i < reps; i++) {
                const t0 = performance.now();
                fn();
                ts.push(performance.now() - t0);
            }
            L.push(`${label.padEnd(46)} ${(ts.reduce((a, b) => a + b) / reps).toFixed(1)} ms  (min ${Math.min(...ts).toFixed(1)})`);
        };

        bench('engine: default selection, 1 target, 72 h', () => {
            const a = computeAccessIntervals(selected, DEFAULT_TARGET, FOV_PRESETS.STANDARD, window);
            computeGapStatistics(a.intervals, window, a.warnings);
        });
        bench('engine: full 96-satellite fleet, 72 h', () => {
            const a = computeAccessIntervals(fleet, DEFAULT_TARGET, FOV_PRESETS.STANDARD, window);
            computeGapStatistics(a.intervals, window, a.warnings);
        });

        // 256 remains the historical reference point; 634 is the HLD profile's
        // displayed fleet and is now the case that matters. Built from the DEMO
        // spec, which carries no per-plane arrays — spreading a 12-entry ladder
        // over 16 planes is rejected by validation, correctly.
        const big = generateWalkerConstellation({
            ...REFERENCE_PROFILES.DEMO_12X8.spec, planes: 16, satsPerPlane: 16,
        });
        const bigProps = big.map(preparePropagator);
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        bench('render hot path: 256 sats x 1 propagate', () => {
            for (const p of bigProps) propagateState(p, 1234, scratch);
        }, 20);
        bench('render: 256 sats x footprint (ray/ellipsoid)', () => {
            for (const p of bigProps) {
                propagateState(p, 1234, scratch);
                computeFootprint(scratch, prepareFov(FOV_PRESETS.STANDARD), EPOCH, 1234, 48);
            }
        });
        // The limb clamp is the only 40-iteration path; measure it on geometry
        // that actually triggers it (a FOV wider than the horizon).
        const limbFov = prepareFov({
            biasDeg: { alongTrack: 0, crossTrack: 0 },
            shape: 'ELLIPSE', halfAngle1Deg: 80, halfAngle2Deg: 80, clockingDeg: 0,
        });
        bench('render: 1 sat x footprint ALL-limb (worst case)', () => {
            for (let i = 0; i < 256; i++) computeFootprint(s0, limbFov, EPOCH, 0, 48);
        });

        // The HLD acceptance case: the full 634-satellite displayed fleet.
        const hldProps = fleet.map(preparePropagator);
        bench(`render hot path: ${fleet.length} sats x 1 propagate`, () => {
            for (const p of hldProps) propagateState(p, 1234, scratch);
        }, 20);

        writeFileSync('/tmp/r28_report.txt', L.join('\n') + '\n');
    }, 600_000);
});
