import { describe, expect, it } from 'vitest';
import type { AreaTarget } from '../domain/areaTarget';
import { AREA_TARGET_ID, REFERENCE_POINT_ID } from '../domain/analysisTargets';
import { canSwapTargetRoles, swapTargetRoles } from '../domain/targetRoleSwap';
import type { PointTarget } from '../domain/types';

const london: PointTarget = { kind: 'POINT', name: 'London', latDeg: 51.51, lonDeg: -0.13 };
const singapore: PointTarget = { kind: 'POINT', name: 'Singapore', latDeg: 1.35, lonDeg: 103.82 };
const area = (id: string, name: string): AreaTarget => ({
    kind: 'AREA', id, name, gridSpacingDeg: 1,
    boundary: [
        { latDeg: 10, lonDeg: 10 },
        { latDeg: 12, lonDeg: 10 },
        { latDeg: 11, lonDeg: 12 },
    ],
});

describe('target role swap', () => {
    it('exchanges two points and keeps the inspected physical target selected', () => {
        const swapped = swapTargetRoles({
            primaryPoint: london, primaryArea: null, secondaryArea: null,
            comparisonPoints: [{ id: 'secondary', target: singapore }],
            secondaryTargetOrder: ['secondary'], activeTargetRole: 'COMPARISON',
            demotedPointId: 'unused',
        });

        expect(swapped?.primaryPoint).toBe(singapore);
        expect(swapped?.comparisonPoints).toEqual([{ id: 'secondary', target: london }]);
        expect(swapped?.selectedPointId).toBe(REFERENCE_POINT_ID);
    });

    it('promotes a Secondary polygon and demotes the Primary point', () => {
        const secondaryArea = area('singapore-aoi', 'Singapore AOI');
        const swapped = swapTargetRoles({
            primaryPoint: london, primaryArea: null, secondaryArea,
            comparisonPoints: [], secondaryTargetOrder: [AREA_TARGET_ID],
            activeTargetRole: 'REFERENCE', demotedPointId: 'demoted-primary',
        });

        expect(swapped?.primaryArea).toBe(secondaryArea);
        expect(swapped?.comparisonPoints).toEqual([{ id: 'demoted-primary', target: london }]);
        expect(swapped?.selectedPointId).toBe('demoted-primary');
        expect(swapped?.analysisContext).toBe('POINTS');
    });

    it('promotes a Secondary point and demotes the Primary polygon', () => {
        const primaryArea = area('london-aoi', 'London AOI');
        const swapped = swapTargetRoles({
            primaryPoint: london, primaryArea, secondaryArea: null,
            comparisonPoints: [{ id: 'secondary', target: singapore }],
            secondaryTargetOrder: ['secondary'], activeTargetRole: 'REFERENCE',
            demotedPointId: 'unused',
        });

        expect(swapped?.primaryPoint).toBe(singapore);
        expect(swapped?.secondaryArea).toBe(primaryArea);
        expect(swapped?.secondaryTargetOrder).toEqual([AREA_TARGET_ID]);
        expect(swapped?.areaTargetRole).toBe('COMPARISON');
    });

    it('exchanges two polygons without changing either geometry', () => {
        const primaryArea = area('primary-aoi', 'Primary AOI');
        const secondaryArea = area('secondary-aoi', 'Secondary AOI');
        const swapped = swapTargetRoles({
            primaryPoint: london, primaryArea, secondaryArea,
            comparisonPoints: [], secondaryTargetOrder: [AREA_TARGET_ID],
            activeTargetRole: 'COMPARISON', demotedPointId: 'unused',
        });

        expect(swapped?.primaryArea).toBe(secondaryArea);
        expect(swapped?.secondaryArea).toBe(primaryArea);
        expect(swapped?.areaTargetRole).toBe('REFERENCE');
    });

    it('rejects pending points and incomplete polygons', () => {
        expect(canSwapTargetRoles({
            primaryPoint: london, primaryArea: null, secondaryArea: null,
            comparisonPoints: [], secondaryTargetOrder: ['pending'],
        })).toBe(false);
        expect(canSwapTargetRoles({
            primaryPoint: london, primaryArea: null,
            secondaryArea: { ...area('draft', 'Draft'), boundary: [] },
            comparisonPoints: [], secondaryTargetOrder: [AREA_TARGET_ID],
        })).toBe(false);
    });
});
