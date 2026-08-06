/**
 * payloadSweep.ts — the value curve, and the deliverable sentence.
 *
 * Run the engine across the whole configuration ladder and return worst-case
 * revisit against payload count. That curve is what produces:
 *
 *     "You need 6 payloads to see London every 2 hours."
 *
 * WHERE TWO CONFIGURATIONS SHARE A PAYLOAD COUNT, KEEP THE BETTER AND RECORD
 * BOTH. Eight payloads spread over eight planes beat eight in two planes, often
 * by a wide margin, and being able to say so is one of the most persuasive
 * outputs this tool has. Collapsing the tie silently throws that away.
 */

import type {
    AnalysisWindow, FovSpec, GapStatistics, OrbitalElements, SubConstellationSpec, Target, WalkerSpec,
} from '../domain/types';
import { enumerateLadder, selectSubConstellation, type LadderEntry } from '../domain/subConstellation';
import { generateWalkerConstellation } from '../domain/walker';
import { computeAccessIntervals } from './accessIntervals';
import { computeGapStatistics } from './gapStatistics';

/** One configuration evaluated. */
export interface SweepConfiguration {
    selection: SubConstellationSpec;
    /** P/x — how many planes carry payloads. */
    selectedPlanes: number;
    /** S/y — payloads per selected plane. */
    payloadsPerPlane: number;
    maxGapMs: number | null;
    statistics: GapStatistics;
}

/** One point on the value curve — one payload count, best configuration first. */
export interface SweepPoint {
    payloadCount: number;
    /** Worst-case revisit of the best configuration at this count. */
    maxGapMs: number | null;
    best: SweepConfiguration;
    /**
     * The other configurations at the same payload count, best first. Empty when
     * the count admits only one split.
     */
    alternatives: SweepConfiguration[];
    /**
     * How much better the best split is than the worst at this count, as a
     * fraction (0.4 → "40% better on revisit"). null when there is no
     * comparison, or when a configuration never sees the target.
     */
    spreadAdvantage: number | null;
}

export interface PayloadSweepResult {
    points: SweepPoint[];
    warnings: string[];
}

export interface PayloadSweepOptions {
    /**
     * z — the in-plane shift held fixed across the sweep. The ladder varies how
     * many payloads there are and how they split across planes; z redistributes
     * a fixed number, so it is not a ladder axis. Defaults to 0.
     */
    planeShift?: number;
    /** Restrict the sweep, e.g. to the counts a slider actually offers. */
    payloadCounts?: number[];
}

/**
 * Rank two results. A configuration that never sees the target sorts last,
 * whatever its other statistics say.
 */
function isBetter(a: SweepConfiguration, b: SweepConfiguration): boolean {
    if (a.maxGapMs === null && b.maxGapMs === null) return false;
    if (a.maxGapMs === null) return false;
    if (b.maxGapMs === null) return true;
    return a.maxGapMs < b.maxGapMs;
}

function evaluateConfiguration(
    reference: WalkerSpec,
    constellation: OrbitalElements[],
    entry: LadderEntry,
    planeShift: number,
    target: Target,
    fov: FovSpec,
    window: AnalysisWindow
): SweepConfiguration {
    const selection: SubConstellationSpec = {
        planeStride: entry.planeStride,
        satStride: entry.satStride,
        planeShift,
    };
    const selected = selectSubConstellation(reference, selection, constellation);
    const access = computeAccessIntervals(selected, target, fov, window);
    const statistics = computeGapStatistics(access.intervals, window, access.warnings);

    return {
        selection,
        selectedPlanes: entry.selectedPlanes,
        payloadsPerPlane: entry.payloadsPerPlane,
        maxGapMs: statistics.maxGapMs,
        statistics,
    };
}

/**
 * Sweep the ladder.
 *
 * Cost is one full access computation per ladder entry — for `P=12, S=8` that is
 * 24 runs. Deterministic, so it is safely cacheable on the scenario inputs.
 */
export function runPayloadSweep(
    reference: WalkerSpec,
    target: Target,
    fov: FovSpec,
    window: AnalysisWindow,
    options: PayloadSweepOptions = {}
): PayloadSweepResult {
    const planeShift = options.planeShift ?? 0;
    const constellation = generateWalkerConstellation(reference);

    let ladder = enumerateLadder(reference.planes, reference.satsPerPlane);
    if (options.payloadCounts) {
        const wanted = new Set(options.payloadCounts);
        ladder = ladder.filter((e) => wanted.has(e.payloadCount));
    }

    const byCount = new Map<number, SweepConfiguration[]>();
    for (const entry of ladder) {
        const evaluated = evaluateConfiguration(
            reference, constellation, entry, planeShift, target, fov, window
        );
        const bucket = byCount.get(entry.payloadCount);
        if (bucket) bucket.push(evaluated);
        else byCount.set(entry.payloadCount, [evaluated]);
    }

    const points: SweepPoint[] = [];
    for (const [payloadCount, configs] of byCount) {
        const ranked = [...configs].sort((a, b) => (isBetter(a, b) ? -1 : isBetter(b, a) ? 1 : 0));
        const best = ranked[0];
        const worst = ranked[ranked.length - 1];

        const spreadAdvantage =
            ranked.length > 1 &&
            best.maxGapMs !== null && worst.maxGapMs !== null && worst.maxGapMs > 0
                ? (worst.maxGapMs - best.maxGapMs) / worst.maxGapMs
                : null;

        points.push({
            payloadCount,
            maxGapMs: best.maxGapMs,
            best,
            alternatives: ranked.slice(1),
            spreadAdvantage,
        });
    }
    points.sort((a, b) => a.payloadCount - b.payloadCount);

    // The window caveats are identical across configurations — carry one copy.
    const warnings = [...new Set(points.flatMap((p) => p.best.statistics.warnings))];

    return { points, warnings };
}

/**
 * The smallest payload count meeting a worst-case revisit requirement.
 *
 * Returns null when no rung on the ladder meets it — which is itself a result
 * worth stating rather than rounding away.
 */
export function payloadsRequiredFor(
    sweep: PayloadSweepResult,
    requiredMaxGapMs: number
): SweepPoint | null {
    for (const point of sweep.points) {
        if (point.maxGapMs !== null && point.maxGapMs <= requiredMaxGapMs) return point;
    }
    return null;
}
