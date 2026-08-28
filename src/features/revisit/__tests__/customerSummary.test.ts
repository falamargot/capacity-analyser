/**
 * Programme 7E — what the exported document says.
 *
 * The summary is the one artefact that leaves the room, so its contract is
 * mostly about what it must NOT contain: no payload count for an area, no
 * engineering verdict vocabulary, and no claim the screen would not make.
 */

import { describe, expect, it } from 'vitest';
import {
    buildAreaResultSheet, buildRevisitResultSheet, customerVerdict,
} from '../analysis/resultSheet';
import { runRevisitScenario } from '../analysis/runScenario';
import { analyseArea } from '../analysis/areaAnalysis';
import { defaultScenario } from '../domain/presets';
import type { AreaTarget } from '../domain/areaTarget';
import { fleetSubject } from '../domain/referenceProfiles';

const EPOCH = Date.UTC(2026, 7, 25);
const scenario = { ...defaultScenario(EPOCH), window: { startMs: EPOCH, durationHours: 24, stepSeconds: 60 } };
const analysis = runRevisitScenario(scenario);
const HOUR = 3600_000;

describe('customerVerdict', () => {
    it('uses the same four phrases as the customer result card', () => {
        expect(customerVerdict(true, 'NONE')).toBe('REQUIREMENT COVERED');
        expect(customerVerdict(false, 'ADDITIONAL_PAYLOADS')).toBe('ADDITIONAL PAYLOADS REQUIRED');
        expect(customerVerdict(false, 'SAME_BUDGET_RESPLIT')).toBe('RECONFIGURATION REQUIRED');
        expect(customerVerdict(false, 'NONE')).toBe('FURTHER ENGINEERING ASSESSMENT REQUIRED');
    });

    /* A covered requirement never depends on whether a recommendation exists. */
    it('reports coverage regardless of the recommendation', () => {
        expect(customerVerdict(true, 'ADDITIONAL_PAYLOADS')).toBe('REQUIREMENT COVERED');
        expect(customerVerdict(true, 'SAME_BUDGET_RESPLIT')).toBe('REQUIREMENT COVERED');
    });
});

describe('buildRevisitResultSheet — the commercial narrative', () => {
    it('leads with the opportunity and the customer question', () => {
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 2 * HOUR, [], new Date(EPOCH),
            { opportunity: '  Eutelsat / ACME EO  ', assumedSwathKm: 700, referenceMode: 'HLD' },
        );

        expect(sheet.opportunity).toBe('Eutelsat / ACME EO');
        expect(sheet.question).toContain('Can the Eutelsat LEO fleet observe');
        expect(sheet.question).toContain(scenario.target.name);
        expect(sheet.question).toContain('at least every 2 h');
        // The swath is an assumption in the document exactly as on screen.
        expect(sheet.question).toContain('with an assumed 700 km IR swath');
    });

    /*
     * The claim-bearing half of the sentence. A document that leaves the room
     * may name Eutelsat's fleet only when the model IS one; hand-edited Walker
     * parameters are nobody's fleet in particular.
     */
    it('names the fleet only when the model is one', () => {
        const ask = (mode: Parameters<typeof fleetSubject>[0]) => buildRevisitResultSheet(
            scenario, analysis, 2 * HOUR, [], new Date(EPOCH), { referenceMode: mode },
        ).question;

        expect(ask('HLD')).toContain('Can the Eutelsat LEO fleet observe');
        expect(ask('MEASURED')).toContain('as currently measured');
        expect(ask('MEASURED')).toContain('Eutelsat');
        expect(ask('CUSTOM')).toContain('Can this custom constellation observe');
        expect(ask('CUSTOM')).not.toContain('Eutelsat');
    });

    /* Forgetting to pass the mode must not invent a claim. */
    it('defaults to claiming nothing', () => {
        const sheet = buildRevisitResultSheet(scenario, analysis, 2 * HOUR, [], new Date(EPOCH));
        expect(sheet.question).not.toContain('Eutelsat');
        expect(sheet.question).toContain('this custom constellation');
    });

    it('omits the opportunity line rather than inventing one', () => {
        const sheet = buildRevisitResultSheet(scenario, analysis, 2 * HOUR, [], new Date(EPOCH));
        expect(sheet.opportunity).toBe('');
        // And the question still stands without a swath to state.
        expect(sheet.question).not.toContain('assumed');
    });

    it('states the measured recommendation, with the delta', () => {
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 1 * HOUR, [], new Date(EPOCH),
            { recommendedPayloadCount: analysis.payloadCount + 24 },
        );

        expect(sheet.verdict).toBe('ADDITIONAL PAYLOADS REQUIRED');
        expect(sheet.recommendation).toContain(`${analysis.payloadCount + 24} payload-equipped satellites`);
        expect(sheet.recommendation).toContain('+24');
        expect(sheet.meets).toBe(false);
    });

    /*
     * `COMPUTING` has no meaning in a document — a summary is exported from a
     * settled state — so an absent recommendation is a measured absence.
     */
    it('says nothing was found rather than leaving a blank', () => {
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 1 * HOUR, [], new Date(EPOCH),
            { recommendedPayloadCount: null },
        );

        expect(sheet.verdict).toBe('FURTHER ENGINEERING ASSESSMENT REQUIRED');
        expect(sheet.recommendation).toContain('No configuration on the tested payload range');
    });

    /*
     * The document's strongest claim, and the one it used to make wrongly. A
     * recommendation that costs no payloads has `recommended === payloadCount`,
     * which the old `additional > 0` test read as "no recommendation" — so a
     * requirement the sweep had just measured as met was exported as one that
     * nothing on the tested range can meet (2026-08-28).
     */
    it('never claims nothing meets a requirement the sweep measured as met', () => {
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 1 * HOUR, [], new Date(EPOCH),
            {
                recommendedPayloadCount: analysis.payloadCount,
                recommendedSplit: { planes: 6, perPlane: 2 },
                recommendedMaxGapMs: 55 * 60_000,
            },
        );

        expect(sheet.meets).toBe(false);
        expect(sheet.verdict).toBe('RECONFIGURATION REQUIRED');
        expect(sheet.recommendation).not.toContain('No configuration on the tested payload range');
        expect(sheet.recommendation).toContain(`${analysis.payloadCount} payload-equipped satellites`);
        expect(sheet.recommendation).toContain('6 planes × 2 per plane');
        expect(sheet.recommendation).toContain('measured at 55 min');
        expect(sheet.recommendation).toContain('No additional payloads required');
    });

    /*
     * The split is what makes it a recommendation. Without one the count alone
     * is indistinguishable from the configuration already flown, and the
     * document must go back to claiming nothing rather than proposing itself.
     */
    it('proposes nothing when the recommended count is the current one and no split is given', () => {
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 1 * HOUR, [], new Date(EPOCH),
            { recommendedPayloadCount: analysis.payloadCount },
        );

        expect(sheet.verdict).toBe('FURTHER ENGINEERING ASSESSMENT REQUIRED');
        expect(sheet.recommendation).toContain('No configuration on the tested payload range');
    });

    it('reports a covered requirement without proposing anything', () => {
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 30 * 24 * HOUR, [], new Date(EPOCH),
            { recommendedPayloadCount: analysis.payloadCount },
        );

        expect(sheet.meets).toBe(true);
        expect(sheet.verdict).toBe('REQUIREMENT COVERED');
        expect(sheet.recommendation).toContain('no additional payloads required');
    });

    /* The badge colour reads this, not the verdict string. */
    it('carries a boolean for the badge instead of a string to sniff', () => {
        expect(typeof buildRevisitResultSheet(scenario, analysis, 2 * HOUR).meets).toBe('boolean');
    });
});

describe('buildAreaResultSheet — the guardrail travels with the document', () => {
    const area: AreaTarget = {
        kind: 'AREA',
        id: 'aoi',
        name: 'Customer AOI',
        boundary: [
            { latDeg: 15, lonDeg: 35 }, { latDeg: 15, lonDeg: 40 },
            { latDeg: 20, lonDeg: 40 }, { latDeg: 20, lonDeg: 35 },
        ],
        gridSpacingDeg: 2.5,
    };
    const { target: _dropped, ...areaScenario } = scenario;
    const areaAnalysis = analyseArea(areaScenario, area);

    it('asks the area question over every analysed cell', () => {
        const sheet = buildAreaResultSheet(
            scenario, areaAnalysis, 2 * HOUR, new Date(EPOCH),
            { opportunity: 'ACME EO', assumedSwathKm: 700 },
        );

        expect(sheet.question).toContain('Can every analysed cell in Customer AOI');
        expect(sheet.opportunity).toBe('ACME EO');
    });

    it('never proposes a payload count for an area', () => {
        const sheet = buildAreaResultSheet(scenario, areaAnalysis, 2 * HOUR, new Date(EPOCH));

        expect(sheet.recommendation).toContain('Area sizing has not been calculated');
        expect(sheet.recommendation).not.toMatch(/\+\d/);
        expect(sheet.recommendation).not.toMatch(/\d+ payload-equipped/);
    });
});
