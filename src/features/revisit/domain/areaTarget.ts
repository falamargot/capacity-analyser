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
 * Above this the per-cell sweep stops being interactive: each cell is a full
 * engine run, so 400 cells over a 72 h window is already tens of seconds.
 */
export const MAX_GRID_CELLS = 400;

/** Ratio of swath width to grid spacing below which aliasing is likely. */
const MIN_SAMPLES_PER_SWATH = 2;

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
