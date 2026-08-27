/**
 * areaTarget.ts — area targets, as a layer ON TOP of the point engine.
 *
 * Design note §4.4: *"For areas: grid the polygon, run the point algorithm per
 * cell, and report worst-cell / mean-cell max-gap plus a colour heat map."*
 *
 * Taken literally. The engine stays point-only — `containment.ts`,
 * `accessIntervals.ts` and `gapStatistics.ts` are untouched by this file — and
 * an area is reduced to a set of points before it ever reaches them. That keeps
 * the piece that must be exactly right (§6.6) exactly as it was validated.
 *
 * ── THE TRAP THIS FILE EXISTS TO GUARD ──────────────────────────────────────
 * *"Grid spacing must be finer than the swath width or the heat map aliases
 * badly."* A grid coarser than the swath samples the coverage pattern below its
 * Nyquist rate: cells land in the gaps between ground tracks and the map shows
 * stripes of "never covered" that are pure artefact. That is not a cosmetic
 * problem — it produces a confidently wrong picture of where coverage fails.
 *
 * So spacing is validated against the actual swath, not left to the caller, and
 * the cost of the grid is bounded before any engine run happens.
 */

import { orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toDeg, toRad } from '../../../utils/sphericalGeometry';
import { groundArcRad } from '../fov/footprint';
import type { FovSpec, PointTarget, WalkerSpec } from './types';

export interface LatLonDeg {
    latDeg: number;
    lonDeg: number;
}

export interface AreaTarget {
    kind: 'AREA';
    /**
     * Stable identity for the draft/run, distinct from the user-editable
     * `name`. Two areas can legitimately share a name (the default is always
     * "Custom area"); rendering code that needs to know whether a result
     * still belongs to the area on screen must compare `id`, never `name`.
     * Optional only so that older persisted sessions and hand-built test
     * fixtures keep parsing — every runtime constructor below always sets it.
     */
    id?: string;
    name: string;
    /**
     * Boundary ring, in order. May be open or closed — the last vertex is
     * joined to the first either way.
     */
    boundary: LatLonDeg[];
    /** Cell spacing in degrees. Must be finer than the swath — see the header. */
    gridSpacingDeg: number;
}

/**
 * Identity of the expensive gridded computation. The user-facing name is
 * deliberately absent: renaming an already analysed Area must not discard its
 * heat map or launch hundreds of point runs. `id` remains because a fresh draw
 * session is a different Area even when its coordinates happen to match.
 */
export function areaAnalysisKey(area: AreaTarget | null): string {
    return JSON.stringify(area ? [area.id ?? null, area.boundary, area.gridSpacingDeg] : null);
}

/** Valid WGS84 latitude, degrees. */
export function isValidLatDeg(value: number): boolean {
    return Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Valid longitude, degrees, in the −180…180 convention used throughout this feature. */
export function isValidLonDeg(value: number): boolean {
    return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidLatLonDeg(point: LatLonDeg): boolean {
    return isValidLatDeg(point.latDeg) && isValidLonDeg(point.lonDeg);
}

/** Keeps imported/drawn geometry cheap to validate, render and persist. */
export const MAX_AREA_VERTICES = 128;

/**
 * Above this the per-cell sweep stops being interactive: each cell is a full
 * engine run, so 400 cells over a 72 h window is already tens of seconds.
 */
export const MAX_GRID_CELLS = 400;

/** Ratio of swath width to grid spacing below which aliasing is likely. */
const MIN_SAMPLES_PER_SWATH = 2;

/** Three samples per swath gives the editor a safe, useful default before any
 * boundary exists yet (e.g. before the first vertex of a freehand draw). */
export function recommendedAreaGridSpacing(
    reference: WalkerSpec,
    payload: FovSpec
): number {
    return Number((swathWidthDeg(reference, payload) / 3).toFixed(3));
}

/**
 * Grid spacing recommendation once a boundary is already known, as it is for
 * an import (GeoJSON or a pasted coordinate list).
 *
 * Starts from the swath-based default and grows it — the same growth the
 * retired preset system used — until THIS polygon's cell count clears
 * `MAX_GRID_CELLS`. Without this, importing a large region (a country, an
 * ocean basin) at the flat swath/3 default can land directly on "N cells
 * exceeds the limit" with no spacing that has been checked to actually work.
 */
export function recommendedAreaGridSpacingForBoundary(
    reference: WalkerSpec,
    payload: FovSpec,
    boundary: LatLonDeg[]
): number {
    let spacing = swathWidthDeg(reference, payload) / 3;
    if (boundary.length < 3) return Number(spacing.toFixed(3));

    const probe = (value: number): AreaTarget => (
        { kind: 'AREA', name: '', boundary, gridSpacingDeg: value }
    );
    let iterations = 0;
    while (generateGrid(probe(spacing)).length > MAX_GRID_CELLS && iterations < 40) {
        spacing *= 1.25;
        iterations += 1;
    }
    return Number(spacing.toFixed(3));
}

/** Structural guard used by versioned session restore. Drafts may have fewer
 * than three vertices; numerical validity is reported by `validateArea`. */
export function isAreaTargetDraft(value: unknown): value is AreaTarget {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<AreaTarget>;
    return candidate.kind === 'AREA'
        && typeof candidate.name === 'string'
        && candidate.name.length <= 80
        && Number.isFinite(candidate.gridSpacingDeg)
        && Array.isArray(candidate.boundary)
        && candidate.boundary.length <= MAX_AREA_VERTICES
        && candidate.boundary.every((point) => (
            Boolean(point) && Number.isFinite(point.latDeg) && Number.isFinite(point.lonDeg)
        ));
}

/** Swath width in degrees of ground arc, for the aliasing check. */
export function swathWidthDeg(reference: WalkerSpec, payload: FovSpec): number {
    const a = orbitalRadiusKm(reference.altitudeKm);
    const widest = Math.max(payload.halfAngle1Deg, payload.halfAngle2Deg);
    const bias = Math.hypot(payload.biasDeg.alongTrack, payload.biasDeg.crossTrack);
    return 2 * toDeg(groundArcRad(a, toRad(Math.min(widest + bias, 89))).arcRad);
}

/**
 * Is the point inside the ring?
 *
 * Ray casting in lat/lon, with longitudes unwrapped relative to the ring's own
 * first vertex so a polygon straddling the antimeridian is handled. Valid for
 * areas that do not contain a pole and do not span more than 180° of longitude —
 * `validateArea` rejects the cases this cannot answer rather than guessing.
 */
export function isPointInRing(point: LatLonDeg, ring: LatLonDeg[]): boolean {
    if (ring.length < 3) return false;

    const reference = ring[0].lonDeg;
    const unwrap = (lon: number) => {
        let delta = lon - reference;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        return delta;
    };

    const x = unwrap(point.lonDeg);
    const y = point.latDeg;
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = unwrap(ring[i].lonDeg);
        const yi = ring[i].latDeg;
        const xj = unwrap(ring[j].lonDeg);
        const yj = ring[j].latDeg;

        const straddles = (yi > y) !== (yj > y);
        if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

export interface AreaValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
    /** Cells the grid will produce. Present even when validation fails, if computable. */
    estimatedCells: number;
}

/**
 * Validate an area against the instrument that will observe it.
 *
 * The spacing check is the substantive one: it needs the swath, which depends on
 * the constellation and payload, so an area cannot be validated in isolation.
 */
export function validateArea(
    area: AreaTarget,
    reference: WalkerSpec,
    payload: FovSpec
): AreaValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (area.boundary.length < 3) {
        errors.push(`An area needs at least 3 boundary points, got ${area.boundary.length}`);
    }
    if (area.boundary.length > MAX_AREA_VERTICES) {
        errors.push(`An area is limited to ${MAX_AREA_VERTICES} boundary points.`);
    }
    const invalidPoint = area.boundary.find((point) => !isValidLatLonDeg(point));
    if (invalidPoint) {
        errors.push('Every boundary point needs latitude −90…90 and longitude −180…180.');
    }
    if (area.boundary.length >= 3 && hasSelfIntersection(area.boundary)) {
        errors.push('The boundary crosses itself. Reorder or remove the intersecting points.');
    }
    if (!Number.isFinite(area.gridSpacingDeg) || area.gridSpacingDeg <= 0) {
        errors.push(`gridSpacingDeg must be positive, got ${area.gridSpacingDeg}`);
    }

    const lats = area.boundary.map((p) => p.latDeg);
    const lonSpan = longitudeSpanDeg(area.boundary);
    if (lonSpan > 180) {
        errors.push(
            `This area spans ${lonSpan.toFixed(0)}° of longitude. The point-in-polygon test `
            + `cannot resolve areas wider than 180° — split it, or use point targets.`
        );
    }
    if (Math.max(...lats.map(Math.abs)) > 89) {
        errors.push('Areas containing a pole are not supported — use point targets there.');
    }

    const swathDeg = swathWidthDeg(reference, payload);
    const samplesPerSwath = area.gridSpacingDeg > 0 ? swathDeg / area.gridSpacingDeg : 0;
    if (errors.length === 0 && samplesPerSwath < 1) {
        errors.push(
            `Grid spacing ${area.gridSpacingDeg}° is coarser than the ${swathDeg.toFixed(2)}° `
            + `swath. Cells would fall between ground tracks and the heat map would show `
            + `gaps that do not exist. Use ${(swathDeg / MIN_SAMPLES_PER_SWATH).toFixed(2)}° or finer.`
        );
    } else if (errors.length === 0 && samplesPerSwath < MIN_SAMPLES_PER_SWATH) {
        warnings.push(
            `Only ${samplesPerSwath.toFixed(1)} grid cells per swath width. The heat map may `
            + `alias; ${(swathDeg / MIN_SAMPLES_PER_SWATH).toFixed(2)}° or finer is safer.`
        );
    }

    const estimatedCells = errors.length === 0 ? generateGrid(area).length : 0;
    if (estimatedCells === 0 && errors.length === 0) {
        errors.push(
            'The grid is empty — no cell centre falls inside the boundary. Use a finer spacing.'
        );
    }
    if (estimatedCells > MAX_GRID_CELLS) {
        errors.push(
            `${estimatedCells} cells exceeds the ${MAX_GRID_CELLS}-cell limit. Every cell is a `
            + `full engine run; coarsen the grid or shrink the area.`
        );
    } else if (estimatedCells > MAX_GRID_CELLS / 2) {
        warnings.push(`${estimatedCells} cells — expect this to take a while.`);
    }

    return { ok: errors.length === 0, errors, warnings, estimatedCells };
}

/** Simple-ring check in the same unwrapped lon/lat plane as `isPointInRing`.
 * Adjacent segments share an endpoint and are deliberately ignored. */
export function hasSelfIntersection(ring: LatLonDeg[]): boolean {
    if (ring.length < 4) return false;
    const reference = ring[0].lonDeg;
    const points = ring.map((point) => {
        let x = point.lonDeg - reference;
        while (x > 180) x -= 360;
        while (x < -180) x += 360;
        return { x, y: point.latDeg };
    });
    const orientation = (
        a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }
    ) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const intersects = (
        a: { x: number; y: number }, b: { x: number; y: number },
        c: { x: number; y: number }, d: { x: number; y: number }
    ) => orientation(a, b, c) !== orientation(a, b, d)
        && orientation(c, d, a) !== orientation(c, d, b);

    for (let first = 0; first < points.length; first += 1) {
        const firstNext = (first + 1) % points.length;
        for (let second = first + 1; second < points.length; second += 1) {
            const secondNext = (second + 1) % points.length;
            if (first === second || firstNext === second || secondNext === first) continue;
            if (intersects(
                points[first], points[firstNext], points[second], points[secondNext]
            )) return true;
        }
    }
    return false;
}

/** Longitude span of a ring, measured the short way round. */
export function longitudeSpanDeg(ring: LatLonDeg[]): number {
    if (ring.length === 0) return 0;
    const reference = ring[0].lonDeg;
    const deltas = ring.map((p) => {
        let d = p.lonDeg - reference;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    });
    return Math.max(...deltas) - Math.min(...deltas);
}

/**
 * Grid the area into point targets at its cell centres.
 *
 * R28 note: the lattice is built in GEODETIC latitude and longitude and is
 * deliberately unchanged. Only the mapping from a cell's lat/lon to an ECEF
 * position moved to the ellipsoid, inside `targetEciAt`. The grid itself must
 * not shift merely because the satellite's coordinate conversion changed — a
 * cell at 52.0°N is the same place on the ground before and after, and shifting
 * the lattice would silently re-aim the heat map.
 *
 * Cells are laid out on a regular lat/lon lattice. Note this makes cells
 * narrower in ground distance as latitude rises — acceptable because the
 * statistics are reported per cell rather than area-weighted, and stated here so
 * nobody later reads the mean-cell figure as an area average.
 */
export function generateGrid(area: AreaTarget): PointTarget[] {
    if (area.boundary.length < 3 || !(area.gridSpacingDeg > 0)) return [];

    const lats = area.boundary.map((p) => p.latDeg);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const reference = area.boundary[0].lonDeg;
    const deltas = area.boundary.map((p) => {
        let d = p.lonDeg - reference;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    });
    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);

    const step = area.gridSpacingDeg;
    const cells: PointTarget[] = [];

    // Start half a cell in, so cell centres rather than corners are sampled.
    for (let lat = minLat + step / 2; lat <= maxLat; lat += step) {
        for (let delta = minDelta + step / 2; delta <= maxDelta; delta += step) {
            const lonDeg = ((reference + delta + 540) % 360) - 180;
            if (!isPointInRing({ latDeg: lat, lonDeg }, area.boundary)) continue;
            cells.push({
                kind: 'POINT',
                name: `${area.name} ${lat.toFixed(2)},${lonDeg.toFixed(2)}`,
                latDeg: lat,
                lonDeg,
            });
            if (cells.length > MAX_GRID_CELLS * 4) return cells; // hard stop, validated above
        }
    }

    return cells;
}

/** A convenience area for demos and tests: an axis-aligned box. */
export function boxArea(
    name: string,
    south: number, west: number, north: number, east: number,
    gridSpacingDeg: number
): AreaTarget {
    return {
        kind: 'AREA',
        name,
        boundary: [
            { latDeg: south, lonDeg: west },
            { latDeg: south, lonDeg: east },
            { latDeg: north, lonDeg: east },
            { latDeg: north, lonDeg: west },
        ],
        gridSpacingDeg,
    };
}
