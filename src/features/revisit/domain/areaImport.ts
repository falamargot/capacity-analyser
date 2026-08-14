import {
    isValidLatLonDeg, MAX_AREA_VERTICES, type AreaTarget, type LatLonDeg,
} from './areaTarget';

export const MAX_AREA_IMPORT_BYTES = 1_000_000;

function normalizeBoundary(points: LatLonDeg[]): LatLonDeg[] {
    const normalized: LatLonDeg[] = [];
    for (const point of points) {
        if (!isValidLatLonDeg(point)) {
            throw new Error('Coordinates must use latitude −90…90 and longitude −180…180.');
        }
        const previous = normalized.at(-1);
        if (!previous || previous.latDeg !== point.latDeg || previous.lonDeg !== point.lonDeg) {
            normalized.push(point);
        }
    }
    const first = normalized[0];
    const last = normalized.at(-1);
    if (normalized.length > 1 && first.latDeg === last?.latDeg && first.lonDeg === last.lonDeg) {
        normalized.pop();
    }
    if (normalized.length > MAX_AREA_VERTICES) {
        throw new Error(`Areas are limited to ${MAX_AREA_VERTICES} boundary points.`);
    }
    return normalized;
}

/** Parse one `latitude, longitude` pair per line. A semicolon separator also
 * accepts decimal commas, e.g. `48,85; 2,35`. */
export function parseAreaCoordinateList(raw: string): LatLonDeg[] {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) throw new Error('Paste at least three coordinate lines.');
    const points = lines.map((line, index) => {
        const separator = line.includes(';') ? ';' : ',';
        const values = line.split(separator).map((part) => part.trim());
        if (values.length !== 2) {
            throw new Error(`Line ${index + 1}: expected latitude${separator} longitude.`);
        }
        const decimal = (value: string) => Number(separator === ';' ? value.replace(',', '.') : value);
        return { latDeg: decimal(values[0]), lonDeg: decimal(values[1]) };
    });
    return normalizeBoundary(points);
}

export function areaCoordinateList(boundary: LatLonDeg[]): string {
    return boundary.map((point) => `${point.latDeg}, ${point.lonDeg}`).join('\n');
}

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
    return value && typeof value === 'object' ? value as JsonObject : null;
}

function polygonGeometry(value: unknown): { coordinates: unknown; name?: string } | null {
    const candidate = object(value);
    if (!candidate) return null;
    if (candidate.type === 'Polygon') return { coordinates: candidate.coordinates };
    if (candidate.type === 'Feature') {
        const geometry = polygonGeometry(candidate.geometry);
        const properties = object(candidate.properties);
        const name = typeof properties?.name === 'string' ? properties.name : undefined;
        return geometry ? { ...geometry, name } : null;
    }
    if (candidate.type === 'FeatureCollection' && Array.isArray(candidate.features)) {
        for (const feature of candidate.features) {
            const geometry = polygonGeometry(feature);
            if (geometry) return geometry;
        }
    }
    return null;
}

export function parseAreaGeoJson(raw: string): { name: string | null; boundary: LatLonDeg[] } {
    if (new Blob([raw]).size > MAX_AREA_IMPORT_BYTES) {
        throw new Error('GeoJSON is limited to 1 MB.');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('GeoJSON is not valid JSON.');
    }
    const geometry = polygonGeometry(parsed);
    if (!geometry || !Array.isArray(geometry.coordinates)) {
        throw new Error('Import a GeoJSON Polygon or a Feature containing one.');
    }
    if (geometry.coordinates.length !== 1) {
        throw new Error('Polygon holes are not supported; import a single outer ring.');
    }
    const ring = geometry.coordinates[0];
    if (!Array.isArray(ring)) throw new Error('GeoJSON polygon ring is invalid.');
    const boundary = normalizeBoundary(ring.map((coordinate, index) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) {
            throw new Error(`GeoJSON position ${index + 1} is invalid.`);
        }
        return { lonDeg: Number(coordinate[0]), latDeg: Number(coordinate[1]) };
    }));
    return {
        name: geometry.name?.trim().slice(0, 80) || null,
        boundary,
    };
}

export function createCustomArea(
    name: string,
    boundary: LatLonDeg[],
    gridSpacingDeg: number,
    id: string = crypto.randomUUID(),
): AreaTarget {
    return {
        kind: 'AREA',
        id,
        name: name.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Custom area',
        boundary: normalizeBoundary(boundary),
        gridSpacingDeg,
    };
}
