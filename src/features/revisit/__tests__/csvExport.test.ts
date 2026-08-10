import { describe, expect, it } from 'vitest';
import {
    accessIntervalsCsv, areaAnalysisCsv, csvCell, csvFilename,
    payloadSweepCsv, provenanceHeader,
} from '../analysis/csvExport';
import { runRevisitScenario } from '../analysis/runScenario';
import { runPayloadSweep } from '../analysis/payloadSweep';
import { analyseArea } from '../analysis/areaAnalysis';
import { boxArea, swathWidthDeg } from '../domain/areaTarget';
import { FOV_PRESETS, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6);
const london = TARGET_PRESETS.find((t) => t.name === 'London')!;

const scenario: RevisitScenario = {
    reference: {
        pattern: 'STAR', planes: 6, satsPerPlane: 4,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    },
    selection: { planeStride: 2, satStride: 2, planeShift: 0 },
    payload: FOV_PRESETS.STANDARD,
    target: london,
    window: { startMs: EPOCH, durationHours: 24, stepSeconds: 30 },
};

/** Parse the data rows of a section, skipping comments and blanks. */
const dataRows = (csv: string) =>
    csv.split('\n').filter((line) => line.length > 0 && !line.startsWith('#'));

describe('csvCell — RFC 4180 quoting', () => {
    it('leaves ordinary values bare', () => {
        expect(csvCell('London')).toBe('London');
        expect(csvCell(42)).toBe('42');
    });

    it('quotes values containing a comma, quote or newline', () => {
        expect(csvCell('a,b')).toBe('"a,b"');
        expect(csvCell('say "hi"')).toBe('"say ""hi"""');
        expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    });

    it('renders null and undefined as empty', () => {
        expect(csvCell(null)).toBe('');
        expect(csvCell(undefined)).toBe('');
    });
});

// The reason this file exists: a CSV outlives the screen it came from.
describe('provenanceHeader', () => {
    const header = provenanceHeader(scenario).join('\n');

    it('states the model conventions that change the numbers', () => {
        expect(header).toMatch(/Kepler \+ J2 secular/);
        // R28: the export states the ELLIPSOID and, separately, the altitude
        // datum. Both are asserted because a reader who sees only "WGS84" will
        // reasonably assume altitude is measured from the mean radius, and that
        // assumption changes every altitude-derived figure in the file.
        expect(header).toMatch(/WGS84 ellipsoid/);
        expect(header).toMatch(/altitude datum,a = 6378\.137 km \+ altitude/);
        expect(header).toMatch(/j2 reference radius,6378\.1363 km/);
        // The honesty line: GMAT validated the propagator, not this datum.
        expect(header).toMatch(/altitude datum cross-check,NOT YET VALIDATED/);
        expect(header).toMatch(/boundary-truncated gaps discarded/);
        expect(header).toMatch(/infrared/);
    });

    it('states the full scenario, so the file can be reproduced', () => {
        expect(header).toMatch(/# planes,6/);
        expect(header).toMatch(/# satellites per plane,4/);
        expect(header).toMatch(/# inclination deg,87.9/);
        expect(header).toMatch(/# altitude km,1200/);
        expect(header).toMatch(/# plane stride x,2/);
        expect(header).toMatch(/# payloads,6/);
        expect(header).toMatch(/# duration h,24/);
    });

    it('says explicitly when the model has NOT been calibrated', () => {
        expect(header).toMatch(/CALIBRATION,not calibrated against real TLEs/);
    });

    it('reports the calibration residuals when it has', () => {
        const fit = {
            spec: scenario.reference, satellitesUsed: 645, satellitesExcluded: 6,
            planesDetected: 12, planePopulations: [50, 61],
            raanRmsDeg: 0.027, argLatRmsDeg: 1.877, altitudeRmsKm: 13.9,
            inclinationRmsDeg: 0.014, alongTrackRmsKm: 248.2, notes: [],
        };
        const withFit = provenanceHeader(scenario, fit).join('\n');
        expect(withFit).toMatch(/# satellites used,645/);
        expect(withFit).toMatch(/# along-track rms km,248.2/);
        expect(withFit).not.toMatch(/not calibrated/);
    });

    it('every provenance line is a comment, so it cannot be mistaken for data', () => {
        for (const line of provenanceHeader(scenario)) {
            expect(line.startsWith('#')).toBe(true);
        }
    });
});

describe('accessIntervalsCsv', () => {
    const analysis = runRevisitScenario(scenario);
    const csv = accessIntervalsCsv(analysis);

    it('carries the provenance header', () => {
        expect(csv.startsWith('# Capacity Analyzer')).toBe(true);
        expect(csv).toMatch(/WGS84 ellipsoid/);
    });

    it('writes one row per access interval plus the two header rows', () => {
        const rows = dataRows(csv);
        const intervalRows = rows.filter((r) => /^\d+,20\d\d-/.test(r));
        expect(intervalRows.length).toBe(analysis.intervals.length);
        expect(analysis.intervals.length).toBeGreaterThan(0);
    });

    it('reports the summary metrics in both machine and human form', () => {
        expect(csv).toMatch(/^max_gap,\d+,/m);
        expect(csv).toMatch(/^access_count,\d+,/m);
        expect(csv).toMatch(/^coverage,INTERMITTENT,/m);
    });

    it('uses ISO timestamps, which sort and parse unambiguously', () => {
        const first = dataRows(csv).find((r) => /^0,/.test(r))!;
        expect(first).toMatch(/,\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,/);
    });
});

describe('payloadSweepCsv', () => {
    const sweep = runPayloadSweep(
        scenario.reference, scenario.target, scenario.payload, scenario.window
    );
    const csv = payloadSweepCsv(scenario, sweep);

    it('writes every configuration, not only the winner at each count', () => {
        const rows = dataRows(csv).filter((r) => /^\d+,\d+,/.test(r));
        const expected = sweep.points.reduce(
            (sum, p) => sum + 1 + p.alternatives.length, 0
        );
        expect(rows.length).toBe(expected);
        // There is genuinely more than one configuration at some counts.
        expect(expected).toBeGreaterThan(sweep.points.length);
    });

    it('marks exactly one best configuration per payload count', () => {
        const rows = dataRows(csv).filter((r) => /^\d+,\d+,/.test(r));
        const bestByCount = new Map<string, number>();
        for (const r of rows) {
            const cells = r.split(',');
            if (cells[cells.length - 1] === 'true') {
                bestByCount.set(cells[0], (bestByCount.get(cells[0]) ?? 0) + 1);
            }
        }
        expect(bestByCount.size).toBe(sweep.points.length);
        for (const count of bestByCount.values()) expect(count).toBe(1);
    });

    it('records the plane split, which is the comparison worth exporting', () => {
        expect(csv).toMatch(/planes,per_plane/);
    });
});

describe('areaAnalysisCsv', () => {
    const { target: _unused, ...areaScenario } = scenario;
    const area = boxArea('North Sea', 54, 0, 58, 6,
        swathWidthDeg(scenario.reference, scenario.payload) / 3);
    const analysis = analyseArea(areaScenario, area);
    const csv = areaAnalysisCsv(areaScenario, analysis);

    it('writes one row per grid cell', () => {
        const rows = dataRows(csv).filter((r) => /^-?\d+\.\d{4},-?\d+\.\d{4},/.test(r));
        expect(rows.length).toBe(analysis.cells.length);
        expect(analysis.cells.length).toBeGreaterThan(3);
    });

    it('states that the mean is over cells, not over area', () => {
        expect(csv).toMatch(/mean is over CELLS, not area/);
    });

    it('records the grid spacing, without which the map cannot be judged', () => {
        expect(csv).toMatch(new RegExp(`# grid spacing deg,${area.gridSpacingDeg}`));
    });

    it('reports the aggregate block', () => {
        expect(csv).toMatch(/^worst_cell_max_gap,/m);
        expect(csv).toMatch(/^mean_cell_max_gap,/m);
        expect(csv).toMatch(/^cells_never_in_view,/m);
    });
});

describe('csvFilename', () => {
    it('identifies the scenario without opening the file', () => {
        expect(csvFilename('access', scenario)).toBe('revisit-access-london-6pl-2026-08-06.csv');
    });

    it('makes an awkward target name filesystem-safe', () => {
        const awkward = {
            ...scenario,
            target: { ...london, name: 'Cape Town / RSA' },
        };
        expect(csvFilename('sweep', awkward)).toMatch(/^revisit-sweep-cape-town-rsa-6pl-/);
    });
});
