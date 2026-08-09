/**
 * csvExport.ts — take the numbers away with their assumptions attached.
 *
 * ── WHY EVERY EXPORT CARRIES A PROVENANCE HEADER ────────────────────────────
 * A CSV outlives the screen it came from. Someone will open this file weeks
 * later, in a spreadsheet, with no memory of the window length, the Earth model,
 * or the fact that boundary-truncated gaps were discarded — all of which
 * materially change the numbers in the columns.
 *
 * So every export begins with commented provenance lines stating the scenario
 * and the conventions. It costs a few rows and removes the most likely way this
 * tool produces a wrong decision: a correct number read under wrong assumptions.
 *
 * Pure string building — no DOM, no download. The caller triggers the download,
 * which keeps this testable and worker-safe.
 */

import { formatGap } from './gapStatistics';
import type { AreaAnalysis } from './areaAnalysis';
import type { RevisitAnalysis } from './runScenario';
import type { PayloadSweepResult } from './payloadSweep';
import type { RevisitScenario } from '../domain/types';
import type { WalkerFit } from '../calibration/fitWalker';

/** RFC 4180: quote when the value contains a comma, quote or newline. */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (!/[",\r\n]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
}

const row = (...cells: CsvValue[]): string => cells.map(csvCell).join(',');

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * Durations are rounded to whole milliseconds for export.
 *
 * Bisection resolves AOS/LOS far finer than that, but writing
 * `351146.7844238281` into a spreadsheet column is false precision: nothing
 * downstream can use sub-millisecond timing, and the extra digits invite a
 * reader to believe the model is more exact than its assumptions allow.
 */
const msValue = (value: number | null | undefined): number | null =>
    value === null || value === undefined ? null : Math.round(value);

/**
 * The provenance block prefixed to every export.
 *
 * `#` comments are not part of RFC 4180, but every spreadsheet and every CSV
 * reader in common use either skips them or shows them as leading text rows —
 * and the alternative, shipping bare numbers with no assumptions, is worse.
 */
export function provenanceHeader(
    scenario: RevisitScenario,
    fit: WalkerFit | null = null
): string[] {
    const { reference, selection, payload, window: analysisWindow } = scenario;
    const lines = [
        '# Capacity Analyzer — hosted-payload revisit export',
        `# generated,${new Date().toISOString()}`,
        '#',
        '# MODEL',
        '# propagation,Kepler + J2 secular (no drag)',
        '# earth model,sphere R = 6371 km (J2 term uses R_eq = 6378.1363 km)',
        // Anyone who exports this file is about to put the numbers in front of
        // someone. The external cross-check belongs in the header for the same
        // reason the assumptions do: it is the bound on how far these numbers
        // can be trusted, and it should travel with them.
        '# propagation cross-check,NASA GMAT R2026a — 9 km over 72 h, non-divergent',
        '# altitude convention,a = 6371 km + altitude (mean radius, not equatorial)',
        '# solar illumination,not modelled — the payload is infrared',
        '# gap convention,max gap with boundary-truncated gaps discarded',
        '#',
        '# CONSTELLATION',
        `# pattern,${reference.pattern}`,
        `# planes,${reference.planes}`,
        `# satellites per plane,${reference.satsPerPlane}`,
        `# inclination deg,${reference.inclinationDeg}`,
        `# altitude km,${reference.altitudeKm}`,
        `# phasing f,${reference.phasingF}`,
        `# fudge,${reference.fudge}`,
        '#',
        '# SELECTION',
        `# plane stride x,${selection.planeStride}`,
        `# sat stride y,${selection.satStride}`,
        `# plane shift z,${selection.planeShift}`,
        `# payloads,${(reference.planes / selection.planeStride) * (reference.satsPerPlane / selection.satStride)}`,
        '#',
        '# INSTRUMENT',
        `# shape,${payload.shape}`,
        `# half angle 1 deg,${payload.halfAngle1Deg}`,
        `# half angle 2 deg,${payload.halfAngle2Deg}`,
        `# clocking deg,${payload.clockingDeg}`,
        `# bias along-track deg,${payload.biasDeg.alongTrack}`,
        `# bias cross-track deg,${payload.biasDeg.crossTrack}`,
        '#',
        '# WINDOW',
        `# start utc,${iso(analysisWindow.startMs)}`,
        `# duration h,${analysisWindow.durationHours}`,
        `# sampling step s,${analysisWindow.stepSeconds}`,
    ];

    if (fit) {
        lines.push(
            '#',
            '# CALIBRATION vs REAL ONEWEB TLE',
            `# satellites used,${fit.satellitesUsed}`,
            `# satellites excluded,${fit.satellitesExcluded}`,
            `# planes detected,${fit.planesDetected}`,
            `# raan rms deg,${fit.raanRmsDeg.toFixed(4)}`,
            `# in-plane rms deg,${fit.argLatRmsDeg.toFixed(4)}`,
            `# along-track rms km,${fit.alongTrackRmsKm.toFixed(1)}`,
            `# altitude rms km,${fit.altitudeRmsKm.toFixed(2)}`,
        );
    } else {
        lines.push('#', '# CALIBRATION,not calibrated against real TLEs');
    }

    return lines;
}

/** Access intervals and the summary statistics for a single point target. */
export function accessIntervalsCsv(
    analysis: RevisitAnalysis,
    fit: WalkerFit | null = null
): string {
    const { scenario, statistics, intervals } = analysis;
    const lines = [
        ...provenanceHeader(scenario, fit),
        '#',
        `# TARGET,${scenario.target.name},${scenario.target.latDeg},${scenario.target.lonDeg}`,
        '#',
        '# SUMMARY',
        row('metric', 'value_ms', 'value_human'),
        row('max_gap', msValue(statistics.maxGapMs), formatGap(statistics.maxGapMs)),
        row('mean_gap', msValue(statistics.meanGapMs), formatGap(statistics.meanGapMs)),
        row('p95_gap', msValue(statistics.p95GapMs), formatGap(statistics.p95GapMs)),
        row('mean_access_duration', msValue(statistics.meanAccessDurationMs),
            formatGap(statistics.meanAccessDurationMs)),
        row('total_in_view', msValue(statistics.totalInViewMs), formatGap(statistics.totalInViewMs)),
        row('access_count', statistics.accessCount, ''),
        row('fraction_in_view', statistics.fractionInView.toFixed(6), ''),
        row('interior_gaps', statistics.interiorGapCount, ''),
        row('boundary_gaps_discarded', statistics.boundaryGapsDiscarded, ''),
        row('coverage', statistics.coverage, ''),
        '#',
        '# ACCESS INTERVALS',
        row('index', 'start_utc', 'end_utc', 'duration_ms', 'satellites',
            'clipped_at_start', 'clipped_at_end'),
    ];

    intervals.forEach((interval, index) => {
        lines.push(row(
            index,
            iso(interval.startMs),
            iso(interval.endMs),
            Math.round(interval.endMs - interval.startMs),
            interval.satelliteIds.join(' '),
            interval.clippedAtStart,
            interval.clippedAtEnd,
        ));
    });

    for (const warning of statistics.warnings) lines.push(`# WARNING,${csvCell(warning)}`);

    return lines.join('\n');
}

/** The payload sweep — the value curve, as data. */
export function payloadSweepCsv(
    scenario: RevisitScenario,
    sweep: PayloadSweepResult,
    fit: WalkerFit | null = null
): string {
    const lines = [
        ...provenanceHeader(scenario, fit),
        '#',
        `# TARGET,${scenario.target.name},${scenario.target.latDeg},${scenario.target.lonDeg}`,
        '#',
        '# PAYLOAD SWEEP — every configuration measured, best first at each count',
        row('payload_count', 'rank_at_count', 'planes', 'per_plane',
            'plane_stride_x', 'sat_stride_y', 'max_gap_ms', 'max_gap_human',
            'mean_gap_ms', 'access_count', 'fraction_in_view', 'is_best_at_count'),
    ];

    for (const point of sweep.points) {
        const ranked = [point.best, ...point.alternatives];
        ranked.forEach((config, rank) => {
            lines.push(row(
                point.payloadCount,
                rank,
                config.selectedPlanes,
                config.payloadsPerPlane,
                config.selection.planeStride,
                config.selection.satStride,
                msValue(config.maxGapMs),
                formatGap(config.maxGapMs),
                msValue(config.statistics.meanGapMs),
                config.statistics.accessCount,
                config.statistics.fractionInView.toFixed(6),
                rank === 0,
            ));
        });
    }

    for (const warning of sweep.warnings) lines.push(`# WARNING,${csvCell(warning)}`);

    return lines.join('\n');
}

/** Per-cell results for an area target — the heat map, as data. */
export function areaAnalysisCsv(
    scenario: Omit<RevisitScenario, 'target'>,
    analysis: AreaAnalysis,
    fit: WalkerFit | null = null
): string {
    const asPoint = {
        ...scenario,
        target: {
            kind: 'POINT' as const,
            name: analysis.area.name,
            latDeg: analysis.cells[0]?.target.latDeg ?? 0,
            lonDeg: analysis.cells[0]?.target.lonDeg ?? 0,
        },
    };

    const lines = [
        ...provenanceHeader(asPoint, fit),
        '#',
        `# AREA,${csvCell(analysis.area.name)}`,
        `# grid spacing deg,${analysis.area.gridSpacingDeg}`,
        `# cells,${analysis.cells.length}`,
        '#',
        '# AGGREGATE — worst cell is the headline; the mean is over CELLS, not area',
        row('metric', 'value_ms', 'value_human'),
        row('worst_cell_max_gap', msValue(analysis.worstCell?.maxGapMs),
            analysis.worstCell?.statistics.coverage === 'NEVER_IN_VIEW'
                ? 'never in view'
                : formatGap(analysis.worstCell?.maxGapMs ?? null)),
        row('best_cell_max_gap', msValue(analysis.bestCell?.maxGapMs),
            formatGap(analysis.bestCell?.maxGapMs ?? null)),
        row('mean_cell_max_gap', msValue(analysis.meanCellMaxGapMs),
            formatGap(analysis.meanCellMaxGapMs)),
        row('cells_never_in_view', analysis.neverInViewCount, ''),
        row('cells_unmeasured', analysis.unmeasuredCount, ''),
        '#',
        '# CELLS',
        row('lat_deg', 'lon_deg', 'max_gap_ms', 'max_gap_human', 'mean_gap_ms',
            'access_count', 'fraction_in_view', 'coverage'),
    ];

    for (const cell of analysis.cells) {
        lines.push(row(
            cell.target.latDeg.toFixed(4),
            cell.target.lonDeg.toFixed(4),
            msValue(cell.maxGapMs),
            formatGap(cell.maxGapMs),
            msValue(cell.statistics.meanGapMs),
            cell.statistics.accessCount,
            cell.statistics.fractionInView.toFixed(6),
            cell.statistics.coverage,
        ));
    }

    for (const warning of analysis.warnings) lines.push(`# WARNING,${csvCell(warning)}`);

    return lines.join('\n');
}

/** A filename that identifies the scenario without needing the file opened. */
export function csvFilename(kind: string, scenario: RevisitScenario): string {
    const payloads = (scenario.reference.planes / scenario.selection.planeStride)
        * (scenario.reference.satsPerPlane / scenario.selection.satStride);
    const safeTarget = scenario.target.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const stamp = new Date(scenario.window.startMs).toISOString().slice(0, 10);
    return `revisit-${kind}-${safeTarget}-${payloads}pl-${stamp}.csv`;
}
