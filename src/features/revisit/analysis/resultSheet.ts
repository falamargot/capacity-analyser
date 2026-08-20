import type { RevisitAnalysis } from './runScenario';
import { formatGap } from './gapStatistics';
import type { RevisitScenario } from '../domain/types';
import type { RevisitTargetComparisonRow } from '../workers/revisitProtocol';
import type { AreaAnalysis } from './areaAnalysis';

export interface RevisitResultSheetModel {
    title: string;
    generatedAtIso: string;
    target: string;
    requirement: string;
    verdict: string;
    metrics: Array<{ label: string; value: string }>;
    assumptions: Array<{ label: string; value: string }>;
    comparisons: Array<{ target: string; worstCase: string; mean: string; verdict: string }>;
    caveats: string[];
}

export function buildRevisitResultSheet(
    scenario: RevisitScenario,
    analysis: RevisitAnalysis,
    requirementMs: number,
    comparisonRows: RevisitTargetComparisonRow[] = [],
    generatedAt: Date = new Date(),
): RevisitResultSheetModel {
    const maxGap = analysis.statistics.maxGapMs;
    const meets = maxGap !== null && maxGap <= requirementMs;
    const payloadCount = analysis.payloadCount;
    const planes = scenario.reference.planes / scenario.selection.planeStride;
    const perPlane = scenario.reference.satsPerPlane / scenario.selection.satStride;
    const swathQualifier = 'Illustrative thermal-IR geometry — not an instrument datasheet';
    return {
        title: 'REVISIT mission result sheet',
        generatedAtIso: generatedAt.toISOString(),
        target: `${scenario.target.name} (${scenario.target.latDeg.toFixed(4)}, ${scenario.target.lonDeg.toFixed(4)})`,
        requirement: formatGap(requirementMs),
        verdict: meets ? 'MEETS TARGET' : 'MISSES TARGET',
        metrics: [
            { label: 'Worst-case revisit', value: formatGap(maxGap) },
            { label: 'Mean revisit', value: formatGap(analysis.statistics.meanGapMs) },
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
        comparisons: comparisonRows.map((row) => ({
            target: row.target.name,
            worstCase: formatGap(row.statistics.maxGapMs),
            mean: formatGap(row.statistics.meanGapMs),
            verdict: row.statistics.maxGapMs !== null && row.statistics.maxGapMs <= requirementMs
                ? 'Meets' : 'Misses',
        })),
        caveats: [
            'Parametric mission-analysis model; not an operational scheduling or tasking tool.',
            'Worst case is the longest interior gap; gaps truncated by analysis-window boundaries are discarded.',
            swathQualifier,
            'Kepler/J2 propagation and WGS84 rendering; results depend on the stated constellation and FOV assumptions.',
        ],
    };
}

export function buildAreaResultSheet(
    scenario: RevisitScenario,
    analysis: AreaAnalysis,
    requirementMs: number,
    generatedAt: Date = new Date(),
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
    return {
        title: 'REVISIT area result sheet',
        generatedAtIso: generatedAt.toISOString(),
        target: `${analysis.area.name} (${analysis.area.boundary.length} vertices · ${analysis.cells.length} cells)`,
        requirement: formatGap(requirementMs),
        verdict: meets ? 'AREA MEETS TARGET' : 'AREA MISSES TARGET',
        metrics: [
            { label: 'Worst cell', value: worst },
            { label: 'Mean cell', value: formatGap(analysis.meanCellMaxGapMs) },
            { label: 'Best cell', value: formatGap(analysis.bestCell?.maxGapMs ?? null) },
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
            `${analysis.neverInViewCount} never-observed and ${analysis.unmeasuredCount} unmeasured cells in the analysis window.`,
            'Regular latitude/longitude grid; the mean is over cells and is not area-weighted.',
            'Parametric mission-analysis model; not an operational scheduling or tasking tool.',
            'Illustrative thermal-IR geometry — not an instrument datasheet.',
        ],
    };
}
