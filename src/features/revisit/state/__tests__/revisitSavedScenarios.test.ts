// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { defaultScenario } from '../../domain/presets';
import { REVISIT_SESSION_SCHEMA_VERSION, type RevisitSessionSnapshotV1 } from '../revisitSessionSnapshot';
import {
    deleteSavedRevisitScenario, importSavedRevisitScenario, listSavedRevisitScenarios,
    MAX_SAVED_REVISIT_SCENARIOS, parseSavedRevisitScenario, saveRevisitScenario,
    serializeSavedRevisitScenario,
} from '../revisitSavedScenarios';

const snapshot = (): RevisitSessionSnapshotV1 => ({
    schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
    scenario: defaultScenario(Date.UTC(2026, 7, 13)),
    options: { showOrbits: true, showSwaths: true, showHostFleet: true, showLabels: false, autoRotate: false },
    requirementMs: 2 * 3600_000,
    selectionSource: 'auto',
});

describe('saved REVISIT scenarios', () => {
    beforeEach(() => localStorage.clear());

    it('saves cloned, named scenarios and deletes them', () => {
        const source = snapshot();
        const saved = saveRevisitScenario('  London   board demo  ', source, 'demo-1');
        source.scenario.target.name = 'Mutated';
        expect(listSavedRevisitScenarios()[0].name).toBe('London board demo');
        expect(listSavedRevisitScenarios()[0].snapshot.scenario.target.name).toBe('London');
        deleteSavedRevisitScenario(saved.id);
        expect(listSavedRevisitScenarios()).toEqual([]);
    });

    it('round-trips the versioned sharing contract and rejects arbitrary JSON', () => {
        const saved = saveRevisitScenario('Shared', snapshot(), 'shared-1');
        const json = serializeSavedRevisitScenario(saved);
        expect(parseSavedRevisitScenario(json)).toEqual(saved);
        expect(importSavedRevisitScenario(json).id).toBe('shared-1');
        expect(() => parseSavedRevisitScenario('{"scenario":{}}')).toThrow(/invalid|unsupported/i);
    });

    it('shares the complete Points and Area workspace model', () => {
        const complete = snapshot();
        complete.analysisContext = 'AREA';
        complete.comparisonPoints = [
            { id: 'compare-1', target: { kind: 'POINT', name: 'Riyadh', latDeg: 24.71, lonDeg: 46.68 } },
        ];
        complete.customArea = {
            kind: 'AREA', name: 'Customer AOI', gridSpacingDeg: 1,
            boundary: [
                { latDeg: 20, lonDeg: 40 }, { latDeg: 20, lonDeg: 45 },
                { latDeg: 25, lonDeg: 45 },
            ],
        };
        complete.requirementMs = 6 * 3600_000;
        complete.options.showSwaths = false;

        const restored = parseSavedRevisitScenario(serializeSavedRevisitScenario(
            saveRevisitScenario('Complete model', complete, 'complete-model')
        )).snapshot;
        expect(restored.analysisContext).toBe('AREA');
        expect(restored.comparisonPoints).toEqual(complete.comparisonPoints);
        expect(restored.customArea).toEqual(complete.customArea);
        expect(restored.requirementMs).toBe(complete.requirementMs);
        expect(restored.options.showSwaths).toBe(false);
        expect(restored.scenario.selection).toEqual(complete.scenario.selection);
        expect(restored.scenario.payload).toEqual(complete.scenario.payload);
    });

    it('bounds browser storage to the most recent scenarios', () => {
        for (let index = 0; index < MAX_SAVED_REVISIT_SCENARIOS + 3; index += 1) {
            saveRevisitScenario(`Scenario ${index}`, snapshot(), `id-${index}`);
        }
        const saved = listSavedRevisitScenarios();
        expect(saved).toHaveLength(MAX_SAVED_REVISIT_SCENARIOS);
        expect(saved[0].name).toBe(`Scenario ${MAX_SAVED_REVISIT_SCENARIOS + 2}`);
    });
});
