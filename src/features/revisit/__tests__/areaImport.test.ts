import { describe, expect, it } from 'vitest';
import {
    areaCoordinateList, parseAreaCoordinateList, parseAreaGeoJson,
} from '../domain/areaImport';

describe('P2b-A area import', () => {
    it('parses latitude/longitude lines with dot or decimal comma', () => {
        expect(parseAreaCoordinateList('51.0, -2.0\n51.0, 2.0\n55.0, 2.0')).toEqual([
            { latDeg: 51, lonDeg: -2 },
            { latDeg: 51, lonDeg: 2 },
            { latDeg: 55, lonDeg: 2 },
        ]);
        expect(parseAreaCoordinateList('48,85; 2,35\n49,00; 3,00\n48,50; 3,10'))
            .toHaveLength(3);
    });

    it('imports a named GeoJSON Polygon and removes the closing duplicate', () => {
        const imported = parseAreaGeoJson(JSON.stringify({
            type: 'Feature',
            properties: { name: 'North demo' },
            geometry: {
                type: 'Polygon',
                coordinates: [[[-2, 51], [2, 51], [2, 55], [-2, 51]]],
            },
        }));
        expect(imported.name).toBe('North demo');
        expect(imported.boundary).toEqual([
            { latDeg: 51, lonDeg: -2 },
            { latDeg: 51, lonDeg: 2 },
            { latDeg: 55, lonDeg: 2 },
        ]);
        expect(areaCoordinateList(imported.boundary)).toContain('51, -2');
    });

    it('rejects holes, non-polygons and out-of-range coordinates', () => {
        expect(() => parseAreaGeoJson(JSON.stringify({
            type: 'Polygon',
            coordinates: [
                [[0, 0], [2, 0], [2, 2], [0, 0]],
                [[0.5, 0.5], [1, 0.5], [0.5, 0.5]],
            ],
        }))).toThrow(/holes/i);
        expect(() => parseAreaGeoJson('{"type":"Point","coordinates":[0,0]}'))
            .toThrow(/Polygon/i);
        expect(() => parseAreaCoordinateList('91, 0\n0, 0\n1, 1')).toThrow(/latitude/i);
    });
});
