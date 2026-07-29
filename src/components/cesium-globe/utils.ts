/**
 * Shared utilities for Cesium globe components
 */
import { Cartesian3, JulianDate, Math as CesiumMath } from 'cesium';
import * as satellite from 'satellite.js';
import type { Feature, Geometry as GeoJsonGeometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import { getCesiumRenderPerformancePolicy } from './renderPerformancePolicy';

export interface CameraMetricsSnapshot {
    position: Cartesian3;
    height: number;
}

/**
 * Convert lat/lng/alt to Cesium Cartesian3
 */
export const getPosition = (lat: number, lng: number, altKm: number): Cartesian3 => {
    // Validate inputs to prevent NaN
    if (!isFinite(lat) || !isFinite(lng) || !isFinite(altKm)) {
        return Cartesian3.fromDegrees(0, 0, 0);
    }
    return Cartesian3.fromDegrees(lng, lat, altKm * 1000);
};

export const isFiniteCartesian3 = (value: Cartesian3 | null | undefined): value is Cartesian3 => (
    !!value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
);

export const sanitizeCartesianRing = (
    points: readonly Cartesian3[] | null | undefined,
    epsilon = 1e-3
): Cartesian3[] => {
    if (!points || points.length < 3) return [];

    const sanitized: Cartesian3[] = [];
    for (const point of points) {
        if (!isFiniteCartesian3(point)) continue;

        const previous = sanitized[sanitized.length - 1];
        if (previous && Cartesian3.equalsEpsilon(previous, point, 0, epsilon)) {
            continue;
        }

        sanitized.push(point);
    }

    if (sanitized.length >= 2) {
        const first = sanitized[0];
        const last = sanitized[sanitized.length - 1];
        if (Cartesian3.equalsEpsilon(first, last, 0, epsilon)) {
            sanitized.pop();
        }
    }

    if (sanitized.length < 3) return [];

    // O(n): bucket each point onto an epsilon-snapped grid.
    // Replaces the previous O(n²) Array.some() scan — semantically equivalent for
    // any reasonable polygon (non-consecutive exact duplicates cannot arise from
    // the comb-geometry worker output).
    const seen = new Set<string>();
    for (const point of sanitized) {
        const key = `${Math.round(point.x / epsilon)},${Math.round(point.y / epsilon)},${Math.round(point.z / epsilon)}`;
        seen.add(key);
    }

    return seen.size >= 3 ? sanitized : [];
};

/**
 * Propagate satellite position using SGP4
 */
export function pickBeamFootprintPoints(
    beamFeature: Feature<GeoJsonGeometry, GeoJsonProperties> | null
): Cartesian3[] {
    if (beamFeature?.geometry?.type !== 'Polygon') return [];
    const coords = (beamFeature.geometry.coordinates?.[0] ?? []) as unknown as number[][];
    const pts: Cartesian3[] = [];
    for (const coord of coords) {
        const lng = coord[0];
        const lat = coord[1];
        if (!isFinite(lat) || !isFinite(lng)) continue;
        pts.push(Cartesian3.fromDegrees(lng, lat, 0));
    }
    // Some polygons repeat the first coordinate as last - remove duplicate to avoid degenerate triangle
    if (pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (Cartesian3.equalsEpsilon(a, b, 0, 1e-6)) {
            pts.pop();
        }
    }
    return sanitizeCartesianRing(pts);
}

export const propagateSatellite = (
    sat: SatelliteData,
    time: JulianDate
): Cartesian3 => {
    if (!sat.satrec) {
        return getPosition(sat.position.lat, sat.position.lng, sat.position.alt);
    }

    try {
        const date = JulianDate.toDate(time);
        const positionAndVelocity = satellite.propagate(sat.satrec, date);
        const gmst = satellite.gstime(date);

        if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
            const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
            const lat = satellite.degreesLat(geoPosition.latitude);
            const lng = satellite.degreesLong(geoPosition.longitude);
            const altKm = geoPosition.height;

            if (isFinite(lat) && isFinite(lng) && isFinite(altKm)) {
                return getPosition(lat, lng, altKm);
            }
        }
    } catch {
        // Fall through to fallback
    }

    return getPosition(sat.position.lat, sat.position.lng, sat.position.alt);
};

/**
 * Calculate dead reckoning position for aircraft
 */
export const calculateDeadReckoning = (ac: Aircraft, time: JulianDate): Cartesian3 => {
    try {
        if (ac.latitude === null || ac.longitude === null) {
            return Cartesian3.fromDegrees(0, 0, 0);
        }

        const lat = Number(ac.latitude);
        const lng = Number(ac.longitude);
        const altKm = Number(ac.altitude_km) || 10;
        const velocity = Number(ac.velocity) || 0;
        const heading = Number(ac.heading) || 0;
        const lastContact = Number(ac.last_contact);

        if (!isFinite(lat) || !isFinite(lng)) {
            return Cartesian3.fromDegrees(0, 0, 0);
        }

        const now = JulianDate.toDate(time).getTime() / 1000;
        const deltaT = now - lastContact;

        if (!isFinite(deltaT) || deltaT <= 0 || deltaT > 300 || velocity === 0) {
            return Cartesian3.fromDegrees(lng, lat, altKm * 1000);
        }

        const R = 6371000;
        const latRad = CesiumMath.toRadians(lat);
        const lngRad = CesiumMath.toRadians(lng);
        const headingRad = CesiumMath.toRadians(heading);
        const dOverR = (velocity * deltaT) / R;

        const sinLat = Math.sin(latRad) * Math.cos(dOverR) +
            Math.cos(latRad) * Math.sin(dOverR) * Math.cos(headingRad);

        const clampedSinLat = Math.max(-1, Math.min(1, sinLat));
        const newLatRad = Math.asin(clampedSinLat);

        const y = Math.sin(headingRad) * Math.sin(dOverR) * Math.cos(latRad);
        const x = Math.cos(dOverR) - Math.sin(latRad) * Math.sin(newLatRad);
        const newLngRad = lngRad + Math.atan2(y, x);

        return Cartesian3.fromDegrees(
            CesiumMath.toDegrees(newLngRad),
            CesiumMath.toDegrees(newLatRad),
            altKm * 1000
        );
    } catch {
        const lng = Number(ac.longitude) || 0;
        const lat = Number(ac.latitude) || 0;
        return Cartesian3.fromDegrees(lng, lat, 10000);
    }
};

/**
 * Calculate dynamic scale factor based on camera distance
 */
export const calculateDynamicScale = (
    cameraHeight: number,
    dprFactor: number
): number => {
    const minAltitude = 100000;    // 100 km - very close
    const maxAltitude = 40000000;  // 40,000 km - very far
    const normalizedAltitude = (cameraHeight - minAltitude) / (maxAltitude - minAltitude);
    const clampedAltitude = Math.max(0, Math.min(normalizedAltitude, 1));

    // Inverse scaling: higher altitude = smaller icons
    const distanceFactor = 1.5 - (clampedAltitude * 1.2);

    // Use DPR factor directly (not inverse) for proper high-DPI scaling
    const scaleFactor = dprFactor * distanceFactor;

    // Ensure minimum visibility
    return Math.max(0.1, scaleFactor);
};

/**
 * Icon scaling follows the same effective DPR policy as the Cesium canvas.
 * Moving both values together preserves apparent icon size on HiDPI displays.
 */
export const DPR_FACTOR = getCesiumRenderPerformancePolicy(
    typeof window === 'undefined' ? 1 : window.devicePixelRatio,
).iconDprFactor;

// SVG data URIs have inconsistent behaviour on Windows (ANGLE/D3D WebGL path):
// images without explicit width/height can be rasterised at 0×0 and Cesium
// falls back to a black square. Rendering via Canvas 2D and exporting as PNG
// guarantees a correctly-sized, properly-alpha-composited texture on all platforms.

function drawSatelliteGlyph(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 12, 10, 10);
    ctx.fillRect(22, 12, 10, 10);
    ctx.fillRect(12, 13, 8, 8);
    return canvas.toDataURL('image/png');
}

function drawLeoSmokedGlyph(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 6);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(16, 16, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(16, 16, 3, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/png');
}

function drawPlaneIcon(): string {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    const path = new Path2D('M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z');
    ctx.fill(path);
    return canvas.toDataURL('image/png');
}

export const SATELLITE_GLYPH = drawSatelliteGlyph();
export const LEO_SMOKED_GLYPH = drawLeoSmokedGlyph();

/**
 * Plane icon as PNG data URI (canvas-drawn for cross-platform WebGL compatibility)
 */
export const PLANE_ICON = drawPlaneIcon();

/**
 * Dummy polygon for fallback hierarchy
 */
export const DUMMY_POLYGON = [
    Cartesian3.fromDegrees(0, 0),
    Cartesian3.fromDegrees(0, 0.0001),
    Cartesian3.fromDegrees(0.0001, 0)
];
