import type { RevisitAnalysis } from './runScenario';
import { formatGap } from './gapStatistics';
import type { RevisitScenario } from '../domain/types';
import type { RevisitTargetComparisonRow } from '../workers/revisitProtocol';
import type { AreaAnalysis } from './areaAnalysis';
import type { AreaSizingResult } from './areaSizing';
import { fleetSubject, type ReferenceMode } from '../domain/referenceProfiles';

/**
 * The customer summary (Programme 7E).
 *
 * The document follows the conversation, not the data model: who it is for,
 * what they asked, what the tested configuration delivers, what would meet the
 * requirement, and only then the assumptions the whole thing rests on.
 *
 * No map. Capturing the globe would need `preserveDrawingBuffer` on the Cesium
 * viewer, which is not set and costs performance on every frame of every
 * session to serve one export. A blank rectangle in a customer document is
 * worse than no rectangle, so the map is deliberately absent rather than
 * half-done.
 */
export interface RevisitResultSheetModel {
    title: string;
    generatedAtIso: string;
    /** Who this is for. Empty when the salesperson did not name an opportunity. */
    opportunity: string;
    /** The customer's question, in the words the tool asks it. */
    question: string;
    target: string;
    requirement: string;
    verdict: string;
    /** Drives the badge colour. Previously sniffed from the verdict string. */
    meets: boolean;
    /** What would meet the requirement, or why nothing is proposed. */
    recommendation: string;
    metrics: Array<{ label: string; value: string }>;
    assumptions: Array<{ label: string; value: string }>;
    /**
     * Every compared target, each with the requirement it was judged against.
     * Targets own their own threshold, so the column is not decoration: the
     * same `Misses` beside two different requirements is two different facts.
     */
    comparisons: Array<{
        target: string; requirement: string; worstCase: string; mean: string; verdict: string;
    }>;
    caveats: string[];
}

/**
 * What the sizing sweep has to propose, when the requirement is not already met.
 *
 * `SAME_BUDGET_RESPLIT` is the case a boolean could not express: the sweep
 * measured a compliant configuration at a payload count the fleet already
 * carries, so there IS a recommendation and it costs nothing. Collapsed into
 * `false`, it made the document print the strongest claim it can make — "no
 * configuration on the tested payload range meets this requirement" — about a
 * requirement the sweep had just measured as met (2026-08-28).
 */
export type SizingOutcome =
    | 'NONE'
    | 'ADDITIONAL_PAYLOADS'
    | 'SAME_BUDGET_RESPLIT'
    /** An area whose sizing search has not been run — no verdict exists yet. */
    | 'NOT_SIZED';

/**
 * Shared vocabulary with `CustomerResultCard`, so the screen and the PDF agree.
 *
 * Shortened on 2026-08-30 with the screen badges: `FURTHER ENGINEERING
 * ASSESSMENT REQUIRED` (38 characters) and `ADDITIONAL PAYLOADS REQUIRED` (28)
 * wrapped in a pill beside a heading and in the PDF's verdict box. The wording
 * had to stay in the same register — neither reads as a fault in the tool — and
 * both are said in full in the sentence underneath.
 *
 * The two sides must move together: a divergence here is a document and a
 * screen making different claims about the same result, which is the defect
 * this function exists to prevent.
 */
export function customerVerdict(meets: boolean, outcome: SizingOutcome): string {
    if (meets) return 'REQUIREMENT COVERED';
    if (outcome === 'ADDITIONAL_PAYLOADS') return 'MORE PAYLOADS REQUIRED';
    if (outcome === 'SAME_BUDGET_RESPLIT') return 'RECONFIGURATION REQUIRED';
    /*
     * "Not sized" is not "assessment required". The first says nobody has asked
     * the question yet and the tool can answer it; the second says no answer can
     * be proposed. Collapsing them printed an impasse over a case that has a
     * button.
     */
    if (outcome === 'NOT_SIZED') return 'NOT SIZED';
    return 'ASSESSMENT REQUIRED';
}

/**
 * Why there is no payload figure, when there is none.
 *
 * `recommendedPayloadCount: null` used to carry three different meanings at
 * once — the sweep measured no configuration that meets the requirement, the
 * sweep had not answered yet, and the sweep failed — and the document printed
 * the first of them as fact in all three cases. Exporting during the ~25 s
 * sweep therefore produced a customer document stating that nothing on the
 * tested range meets the requirement, seconds before the screen recommended a
 * configuration that does.
 */
export type SizingStatus = 'MEASURED' | 'PENDING' | 'FAILED';

export interface ResultSheetContext {
    /** Customer or opportunity name, as typed in the Scenario Workspace. */
    opportunity?: string;
    /**
     * Which constellation model produced this result. The document names
     * Eutelsat's fleet only when the model is one — a custom Walker
     * specification is nobody's fleet in particular, and this artefact leaves
     * the room.
     */
    referenceMode?: ReferenceMode;
    /** Payload count that would meet the requirement, when the sweep found one. */
    recommendedPayloadCount?: number | null;
    /**
     * The split the sweep MEASURED at that count, when it is not the one flown.
     *
     * Required to state a recommendation that costs no additional payloads: the
     * count alone is indistinguishable from the current configuration, so
     * without this the document has nothing to recommend and falls back to
     * claiming nothing meets the requirement.
     */
    recommendedSplit?: { planes: number; perPlane: number } | null;
    /** Worst-case revisit measured for `recommendedSplit`, ms. */
    recommendedMaxGapMs?: number | null;
    /**
     * Whether the sizing sweep had actually answered. Defaults to `MEASURED`
     * for callers that only ever export a settled result.
     */
    sizingStatus?: SizingStatus;
    /** Assumed swath, km — stated as an assumption, never as a datasheet. */
    assumedSwathKm?: number | null;
    /**
     * Each compared target's own requirement in ms, in `comparisonRows` order.
     *
     * Primary and Secondary targets carry separate thresholds, so verdicting
     * every row against the single `requirementMs` of whichever target happened
     * to be selected at export time printed `Meets` over a target the screen
     * reported as MISSES. Entries that are absent or non-finite fall back to
     * `requirementMs`, which is the legacy single-threshold behaviour.
     */
    comparisonRequirementsMs?: ReadonlyArray<number | null | undefined>;
    /**
     * The area sizing search's result, when one has been run.
     *
     * Without it the document could only say "not sized", which stopped being
     * true the moment the screen was able to say otherwise: a user who measured
     * a configuration, read "MORE PAYLOADS REQUIRED · 36" on screen and then
     * exported got a document denying the measurement had happened. The
     * vocabulary is shared for exactly this reason; the input has to be too.
     */
    areaSizing?: AreaSizingResult | null;
}

/**
 * The sizing sentence. States only what is known.
 *
 * A statement of impossibility is the strongest claim this document makes, so
 * it is reserved for the one case that supports it: the sweep ran, completed,
 * and found nothing. An unfinished or failed sweep says so instead.
 */
function sizingRecommendation(
    meets: boolean,
    outcome: SizingOutcome,
    status: SizingStatus,
    recommended: number | null,
    additional: number | null,
    /**
     * Payloads the recommendation FREES — positive only when it uses fewer than
     * the tested configuration, 0 for a re-split at the same count.
     */
    freed: number,
    split: { planes: number; perPlane: number } | null,
    splitMaxGapMs: number | null,
): string {
    if (meets) return 'Met by the tested configuration — no additional payloads required.';
    if (outcome === 'ADDITIONAL_PAYLOADS') {
        return `${recommended} payload-equipped satellites (+${additional}) meet the requirement `
            + 'over this target, measured on the tested payload range.';
    }
    if (outcome === 'SAME_BUDGET_RESPLIT' && split) {
        const measured = splitMaxGapMs === null ? '' : `, measured at ${formatGap(splitMaxGapMs)}`;
        /*
         * `SAME_BUDGET_RESPLIT` covers a re-split at the same count AND an
         * answer that uses FEWER payloads — the sweep's curve is not monotonic
         * in payload count, because worst-case revisit at a point is governed
         * by how many PLANES carry a payload. "Redistributed" and "no
         * additional payloads required" are true of the first and understate
         * the second badly: the case reported on 2026-08-31 proposed 6
         * payloads where 64 were flown, and the sentence read as "the tested
         * configuration is fine". The same correction is made on
         * `CustomerResultCard`; this document leaves the room, so the two must
         * not drift.
         */
        if (freed > 0) {
            return `${recommended} payload-equipped satellites as `
                + `${split.planes} planes × ${split.perPlane} per plane meet the requirement over `
                + `this target${measured} — ${freed} fewer payloads than the tested `
                + 'configuration.';
        }
        return `${recommended} payload-equipped satellites redistributed as `
            + `${split.planes} planes × ${split.perPlane} per plane meet the requirement over `
            + `this target${measured}. No additional payloads required.`;
    }
    if (status === 'PENDING') {
        return 'Fleet sizing was still being calculated when this summary was exported. '
            + 'No payload count is proposed here; re-export once it has completed.';
    }
    if (status === 'FAILED') {
        return 'Fleet sizing could not be calculated. No payload count is proposed here; '
            + 'the measured result above is unaffected.';
    }
    return 'No configuration on the tested payload range meets this requirement.';
}

export function buildRevisitResultSheet(
    scenario: RevisitScenario,
    analysis: RevisitAnalysis,
    requirementMs: number,
    comparisonRows: RevisitTargetComparisonRow[] = [],
    generatedAt: Date = new Date(),
    context: ResultSheetContext = {},
): RevisitResultSheetModel {
    const maxGap = analysis.statistics.maxGapMs;
    const meets = maxGap !== null && maxGap <= requirementMs;
    const payloadCount = analysis.payloadCount;
    const planes = scenario.reference.planes / scenario.selection.planeStride;
    const perPlane = scenario.reference.satsPerPlane / scenario.selection.satStride;
    const swathQualifier = 'Illustrative thermal-IR geometry — not an instrument datasheet';
    const sizingStatus = context.sizingStatus ?? 'MEASURED';
    const recommended = context.recommendedPayloadCount ?? null;
    const additional = recommended === null ? null : Math.max(0, recommended - payloadCount);
    const recommendedSplit = context.recommendedSplit ?? null;
    /*
     * A recommendation is "the sweep measured something the current
     * configuration is not", which is a payload delta OR a different split at
     * the same budget — never the delta alone. Judging it on `additional > 0`
     * is what silently discarded the whole no-cost half.
     */
    const outcome: SizingOutcome = additional !== null && additional > 0
        ? 'ADDITIONAL_PAYLOADS'
        : recommended !== null
            && recommendedSplit !== null
            && (recommendedSplit.planes !== planes || recommendedSplit.perPlane !== perPlane)
            ? 'SAME_BUDGET_RESPLIT'
            : 'NONE';
    const swathClause = context.assumedSwathKm
        ? `, with an assumed ${context.assumedSwathKm} km IR swath`
        : '';
    return {
        title: 'REVISIT customer summary',
        generatedAtIso: generatedAt.toISOString(),
        opportunity: context.opportunity?.trim() ?? '',
        question: `Can ${fleetSubject(context.referenceMode ?? 'CUSTOM')} `
            + `observe ${scenario.target.name} `
            + `at least every ${formatGap(requirementMs)}${swathClause}?`,
        target: `${scenario.target.name} (${scenario.target.latDeg.toFixed(4)}, ${scenario.target.lonDeg.toFixed(4)})`,
        requirement: formatGap(requirementMs),
        verdict: customerVerdict(meets, outcome),
        meets,
        recommendation: sizingRecommendation(
            meets, outcome, sizingStatus, recommended, additional,
            recommended === null ? 0 : Math.max(0, payloadCount - recommended),
            recommendedSplit, context.recommendedMaxGapMs ?? null,
        ),
        metrics: [
            { label: 'Maximum gap', value: formatGap(maxGap) },
            { label: 'Average revisit', value: formatGap(analysis.statistics.meanGapMs) },
            { label: 'Accesses', value: String(analysis.statistics.accessCount) },
            { label: 'Time in view', value: `${(analysis.statistics.fractionInView * 100).toFixed(1)}%` },
        ],
        assumptions: [
            { label: 'Hosted payloads', value: `${payloadCount} (${planes} planes × ${perPlane})` },
            { label: 'Host fleet', value: `${scenario.reference.planes} planes × ${scenario.reference.satsPerPlane} active satellites` },
            { label: 'Orbit', value: `${scenario.reference.altitudeKm} km · ${scenario.reference.inclinationDeg}° inclination` },
            { label: 'FOV', value: `${scenario.payload.shape.toLowerCase()} · ${scenario.payload.halfAngle1Deg}° × ${scenario.payload.halfAngle2Deg}° half-angles` },
            { label: 'Analysis window', value: `${scenario.window.durationHours} h · ${scenario.window.stepSeconds} s sampling` },
        ],
        comparisons: comparisonRows.map((row, index) => {
            const candidate = context.comparisonRequirementsMs?.[index];
            const rowRequirementMs = typeof candidate === 'number'
                && Number.isFinite(candidate) && candidate > 0
                ? candidate
                : requirementMs;
            return {
                target: row.target.name,
                requirement: formatGap(rowRequirementMs),
                worstCase: formatGap(row.statistics.maxGapMs),
                mean: formatGap(row.statistics.meanGapMs),
                verdict: row.statistics.maxGapMs !== null
                    && row.statistics.maxGapMs <= rowRequirementMs
                    ? 'Meets' : 'Misses',
            };
        }),
        caveats: [
            'Parametric mission-analysis model; not an operational scheduling or tasking tool.',
            'Worst case is the longest interior gap; gaps truncated by analysis-window boundaries are discarded.',
            swathQualifier,
            'Kepler/J2 propagation and WGS84 rendering; results depend on the stated constellation and FOV assumptions.',
        ],
    };
}

/**
 * The area's sizing sentence — the same claim the card makes, in full.
 *
 * "Verified, not proved minimal" travels with the number wherever it goes: the
 * probe ranks candidates on one cell, so a cheaper rung it ranked lower may
 * also pass. A reader who sees the count without that qualification will take
 * it for an optimum.
 */
function areaSizingRecommendation(
    meets: boolean,
    sized: Extract<AreaSizingResult, { kind: 'VERIFIED' }> | null,
    additionalPayloads: number,
    sizing: AreaSizingResult | null,
): string {
    if (meets) return 'Met by the tested configuration across every analysed cell.';
    if (sized) {
        const cost = additionalPayloads > 0
            ? ` (+${additionalPayloads})`
            : additionalPayloads < 0
                // Same correction as the point sheet: an answer that frees
                // payloads must say so rather than claim it costs nothing.
                ? ` (${-additionalPayloads} fewer)`
                : ' — no additional payloads, the same budget split differently';
        return `${sized.payloadCount} payload-equipped satellites${cost}, `
            + `${sized.selectedPlanes} planes × ${sized.payloadsPerPlane} per plane, meet the `
            + `requirement on every analysed cell — worst cell ${formatGap(sized.worstCellGapMs)}. `
            + 'Verified on every cell of this area; not proved minimal.';
    }
    if (sizing && sizing.kind === 'NONE') {
        if (sizing.probeRejected === sizing.ladderSize) {
            return 'No configuration on the tested ladder meets this requirement on the '
                + 'least-covered cell of this area, so none can meet it over the area.';
        }
        return sizing.stoppedAtCeiling
            ? 'The search reached its candidate limit without finding a configuration that '
                + 'meets the requirement on every cell; configurations remain untested.'
            : 'Every candidate verified over the grid failed on at least one cell.';
    }
    return 'No payload count has been measured for this area.';
}

export function buildAreaResultSheet(
    scenario: RevisitScenario,
    analysis: AreaAnalysis,
    requirementMs: number,
    generatedAt: Date = new Date(),
    context: ResultSheetContext = {},
): RevisitResultSheetModel {
    const measuredMeeting = analysis.cells.filter((cell) => (
        cell.maxGapMs !== null && cell.maxGapMs <= requirementMs
    )).length;
    const meets = measuredMeeting === analysis.cells.length
        && analysis.neverInViewCount === 0
        && analysis.unmeasuredCount === 0;
    const planes = scenario.reference.planes / scenario.selection.planeStride;
    const perPlane = scenario.reference.satsPerPlane / scenario.selection.satStride;
    const worst = analysis.neverInViewCount > 0
        ? 'Never observed' : formatGap(analysis.worstCell?.maxGapMs ?? null);
    const swathClause = context.assumedSwathKm
        ? `, with an assumed ${context.assumedSwathKm} km IR swath`
        : '';

    /*
     * The guardrail is unchanged and the sizing is what satisfies it: a payload
     * count may appear here only because it was MEASURED over every cell of
     * this grid. What the document may never do is invent one — or, having been
     * given one, deny that it exists.
     */
    const sizing = context.areaSizing ?? null;
    const sized = !meets && sizing?.kind === 'VERIFIED' ? sizing : null;
    const additionalPayloads = sized ? sized.payloadCount - planes * perPlane : 0;
    const areaOutcome: SizingOutcome = meets
        ? 'NONE'
        : sized
            ? (additionalPayloads > 0 ? 'ADDITIONAL_PAYLOADS' : 'SAME_BUDGET_RESPLIT')
            // A search that ran and found nothing is an impasse; one never run
            // is simply an unanswered question. The screen distinguishes them
            // and so must this.
            : sizing?.kind === 'NONE' ? 'NONE' : 'NOT_SIZED';

    return {
        title: 'REVISIT customer summary — area',
        generatedAtIso: generatedAt.toISOString(),
        opportunity: context.opportunity?.trim() ?? '',
        question: `Can every analysed cell in ${analysis.area.name} be observed `
            + `at least every ${formatGap(requirementMs)}${swathClause}?`,
        target: `${analysis.area.name} (${analysis.area.boundary.length} vertices · ${analysis.cells.length} cells)`,
        requirement: formatGap(requirementMs),
        verdict: customerVerdict(meets, areaOutcome),
        meets,
        recommendation: areaSizingRecommendation(meets, sized, additionalPayloads, sizing),
        metrics: [
            { label: 'Least-covered cell', value: worst },
            { label: 'Average cell', value: formatGap(analysis.meanCellMaxGapMs) },
            { label: 'Best-covered cell', value: formatGap(analysis.bestCell?.maxGapMs ?? null) },
            { label: 'Cells meeting target', value: `${measuredMeeting} / ${analysis.cells.length}` },
        ],
        assumptions: [
            { label: 'Hosted payloads', value: `${planes * perPlane} (${planes} planes × ${perPlane})` },
            { label: 'Host fleet', value: `${scenario.reference.planes} planes × ${scenario.reference.satsPerPlane} active satellites` },
            { label: 'Orbit', value: `${scenario.reference.altitudeKm} km · ${scenario.reference.inclinationDeg}° inclination` },
            { label: 'FOV', value: `${scenario.payload.shape.toLowerCase()} · ${scenario.payload.halfAngle1Deg}° × ${scenario.payload.halfAngle2Deg}° half-angles` },
            { label: 'Area grid', value: `${analysis.area.gridSpacingDeg.toFixed(2)}° · ${analysis.cells.length} cell centres` },
            { label: 'Analysis window', value: `${scenario.window.durationHours} h · ${scenario.window.stepSeconds} s sampling` },
        ],
        comparisons: [],
        caveats: [
            'The contractual area result is the worst cell, not an average timeline across the area.',
            ...(sized ? [
                `Sizing verified ${sized.candidatesTried} candidate`
                + `${sized.candidatesTried === 1 ? '' : 's'} over every cell of this grid; the `
                + 'ladder was ranked on the least-covered cell, so the result is not proved minimal.',
            ] : []),
            `${analysis.neverInViewCount} never-observed and ${analysis.unmeasuredCount} unmeasured cells in the analysis window.`,
            'Regular latitude/longitude grid; the mean is over cells and is not area-weighted.',
            'Parametric mission-analysis model; not an operational scheduling or tasking tool.',
            'Illustrative thermal-IR geometry — not an instrument datasheet.',
        ],
    };
}
