/**
 * syntheticTle.ts — writing a Walker element set out as a TLE, for validation.
 *
 * Extracted from `revisitSgp4CrossCheck.test.ts` on 2026-09-03 so a second
 * cross-check (`revisitFitTrajectory.test.ts`) can use it without IMPORTING a
 * test file — importing one re-runs its suites inside the importer, which
 * silently doubled the SGP4 run.
 *
 * Everything below is unchanged; the reasoning that matters is on
 * `tleFromElements` itself.
 */

import type { OrbitalElements } from '../../../features/revisit/domain/types';
import { J2, J2_REFERENCE_RADIUS_KM, meanMotionRadPerSec } from '../../../features/revisit/propagation/keplerJ2';

/** TLE line checksum: digits sum, minus signs count 1, mod 10. */
function tleChecksum(line: string): number {
    let sum = 0;
    for (const ch of line) {
        if (ch >= '0' && ch <= '9') sum += Number(ch);
        else if (ch === '-') sum += 1;
    }
    return sum % 10;
}

/**
 * Write a Walker element set out as a TLE.
 *
 * ADR-001 §1 rejected synthesising TLEs for PRODUCTION — drag makes multi-day
 * statistics irreproducible. For validation it is precisely the right tool, and
 * `BSTAR = 0` removes the drag that was the objection.
 *
 * Circular orbits are given eccentricity 1e-7 rather than 0: SGP4 divides by
 * eccentricity terms and a hard zero is numerically awkward.
 *
 * **The mean motion field is Kozai, not Brouwer.** This is the subtle part. The
 * engine's semi-major axis is a Brouwer mean element, so √(μ/a³) is a Brouwer
 * mean motion — but SGP4 reads the TLE's mean motion as *Kozai* and runs its
 * `initl` un-Kozai step to recover Brouwer. Writing √(μ/a³) into the field
 * unconverted therefore hands SGP4 a different orbit from the one intended,
 * larger by δ in mean motion, and the two propagators are then compared at
 * mismatched semi-major axes. Converting forward here — the exact inverse of
 * SGP4's `no_unkozai = no/(1 + δ₀)` — is what makes the comparison fair.
 *
 * Getting this wrong is not academic: uncorrected, it shows up as a constant
 * 5 km radial offset and ~1000 km of spurious along-track drift over 72 h,
 * which is the same order as a real error in the secular rates and would mask
 * one. See R4 in `docs/REVIEW_REPORT.md`.
 */
export function tleFromElements(
    el: OrbitalElements, epochMs: number, catalogNumber: number
): [string, string] {
    const brouwerMeanMotion = meanMotionRadPerSec(el.semiMajorAxisKm);
    const cosI = Math.cos((el.inclinationDeg * Math.PI) / 180);
    const gamma = J2 * (J2_REFERENCE_RADIUS_KM / el.semiMajorAxisKm) ** 2;
    const kozaiMeanMotion = brouwerMeanMotion * (1 + 0.75 * gamma * (3 * cosI * cosI - 1));
    const revsPerDay = (kozaiMeanMotion * 86400) / (2 * Math.PI);
    const date = new Date(epochMs);
    const year = date.getUTCFullYear() % 100;
    const dayOfYear =
        (epochMs - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
    const id = String(catalogNumber).padStart(5, '0');

    const line1 =
        `1 ${id}U 26001A   ${String(year).padStart(2, '0')}`
        + `${dayOfYear.toFixed(8).padStart(12, '0')}  .00000000  00000-0  00000-0 0  999`;
    const line2 =
        `2 ${id} ${el.inclinationDeg.toFixed(4).padStart(8)}`
        + ` ${el.raanDeg.toFixed(4).padStart(8)} 0000001 ${(0).toFixed(4).padStart(8)}`
        + ` ${el.argLatDeg.toFixed(4).padStart(8)} ${revsPerDay.toFixed(8).padStart(11)}    1`;

    return [line1 + tleChecksum(line1), line2 + tleChecksum(line2)];
}
