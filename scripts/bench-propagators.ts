/**
 * bench-propagators.ts — SGP4 against the REVISIT Kepler+J2 propagator.
 *
 * WHY THIS EXISTS. The decision not to precompute ephemerides for a possible
 * observational REVISIT mode rests on one number: how much more a real-ephemeris
 * propagator costs per evaluation. That number was first ASSERTED ("one to three
 * orders of magnitude") and was wrong — it is ~9×. A figure that shapes an
 * architecture decision has to be reproducible, so it lives in a script rather
 * than in a document.
 *
 * Run:  npm run bench:propagators
 *
 * Must run from the repository root — it resolves `satellite.js` from
 * node_modules and the propagator from src/.
 *
 * The comparison is deliberately unfair in SGP4's favour on one axis and
 * against it on another, and neither is corrected: SGP4 is sampled over a
 * subset of the fleet (every satrec costs the same, so the mean is the mean),
 * while the Kepler path runs the full fleet. What is being measured is cost per
 * evaluation, not a wall-clock budget for a feature that does not exist.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as satellite from 'satellite.js';
import {
    preparePropagators, propagateState,
} from '../src/features/revisit/propagation/keplerJ2';
import type { EciState, OrbitalElements } from '../src/features/revisit/domain/types';
import { WGS84_A_KM } from '../src/utils/wgs84Geometry';

/** The analysis window REVISIT actually defaults to (accessIntervals.ts). */
const WINDOW_HOURS = 72;
const STEP_SECONDS = 10;
/** SGP4 is sampled over this many satellites; Kepler runs the whole fleet. */
const SGP4_SAMPLE_SATELLITES = 20;
/** The shell REVISIT propagates OneWeb at, for the Kepler comparison. */
const SHELL_ALTITUDE_KM = 1200;

const TLE_FILE = path.resolve(process.cwd(), 'public/celestrak.txt');

function readOneWebSatrecs(): satellite.SatRec[] {
    const lines = fs.readFileSync(TLE_FILE, 'utf8').split(/\r?\n/);
    const records: satellite.SatRec[] = [];
    for (let i = 0; i + 2 < lines.length; i += 1) {
        if (!lines[i + 1]?.startsWith('1 ') || !lines[i + 2]?.startsWith('2 ')) continue;
        if (!/ONEWEB/i.test(lines[i])) continue;
        const record = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
        if (!record.error) records.push(record);
        i += 2;
    }
    return records;
}

function main(): void {
    const satrecs = readOneWebSatrecs();
    if (satrecs.length === 0) {
        throw new Error(`No OneWeb TLEs in ${TLE_FILE} — run \`npm run update-celestrak\` first.`);
    }
    const steps = Math.ceil((WINDOW_HOURS * 3600) / STEP_SECONDS);
    const fleetEvaluations = satrecs.length * steps;

    console.log(`OneWeb satrecs: ${satrecs.length}`);
    console.log(`window ${WINDOW_HOURS} h @ ${STEP_SECONDS} s → ${steps} steps/sat`);
    console.log(`full-fleet evaluations: ${fleetEvaluations.toLocaleString()}`);

    // `sink` defeats dead-code elimination: without consuming a result, a JIT is
    // entitled to delete the loop body and the benchmark measures nothing.
    let sink = 0;

    // ── SGP4 ───────────────────────────────────────────────────────────────
    const sample = satrecs.slice(0, Math.min(SGP4_SAMPLE_SATELLITES, satrecs.length));
    let sgp4Evaluations = 0;
    const sgp4Start = performance.now();
    for (const record of sample) {
        for (let step = 0; step < steps; step += 1) {
            const state = satellite.sgp4(record, (step * STEP_SECONDS) / 60);
            if (state && typeof state !== 'boolean' && state.position) {
                sink += (state.position as { x: number }).x;
            }
            sgp4Evaluations += 1;
        }
    }
    const sgp4PerEvalUs = ((performance.now() - sgp4Start) * 1000) / sgp4Evaluations;

    // ── Kepler + J2 ────────────────────────────────────────────────────────
    const elements: OrbitalElements[] = satrecs.map((record, index) => ({
        id: `s${index}`,
        planeIndex: 0,
        satIndexInPlane: index,
        isSpare: false,
        inclinationDeg: (record.inclo * 180) / Math.PI,
        raanDeg: (record.nodeo * 180) / Math.PI,
        argLatDeg: (((record.argpo + record.mo) * 180) / Math.PI) % 360,
        semiMajorAxisKm: WGS84_A_KM + SHELL_ALTITUDE_KM,
        eccentricity: 0,
    }));
    const propagators = preparePropagators(elements);
    const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    let keplerEvaluations = 0;
    const keplerStart = performance.now();
    for (const propagator of propagators) {
        for (let step = 0; step < steps; step += 1) {
            propagateState(propagator, step * STEP_SECONDS, scratch);
            sink += scratch.x;
            keplerEvaluations += 1;
        }
    }
    const keplerPerEvalUs = ((performance.now() - keplerStart) * 1000) / keplerEvaluations;

    const seconds = (perEvalUs: number) => (fleetEvaluations * perEvalUs) / 1e6;
    console.log('');
    console.log(`SGP4       ${sgp4PerEvalUs.toFixed(3)} us/eval `
        + `(${sgp4Evaluations.toLocaleString()} sampled) → full fleet ${seconds(sgp4PerEvalUs).toFixed(1)} s`);
    console.log(`Kepler+J2  ${keplerPerEvalUs.toFixed(3)} us/eval `
        + `(${keplerEvaluations.toLocaleString()}) → full fleet ${seconds(keplerPerEvalUs).toFixed(2)} s`);
    console.log(`ratio      ${(sgp4PerEvalUs / keplerPerEvalUs).toFixed(1)}x`);
    if (!Number.isFinite(sink)) throw new Error('unreachable');
}

main();
