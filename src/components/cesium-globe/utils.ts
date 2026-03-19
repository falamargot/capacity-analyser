/**
 * Shared utilities for Cesium globe components
 */
import { Cartesian3, JulianDate, Math as CesiumMath } from 'cesium';
import * as satellite from 'satellite.js';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';

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

    const uniquePoints: Cartesian3[] = [];
    for (const point of sanitized) {
        if (!uniquePoints.some((candidate) => Cartesian3.equalsEpsilon(candidate, point, 0, epsilon))) {
            uniquePoints.push(point);
        }
    }

    return uniquePoints.length >= 3 ? sanitized : [];
};

/**
 * Propagate satellite position using SGP4
 */
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
 * DPR factor - computed once at module load
 * Now returns the actual DPR for proper scaling on high-DPI displays
 */
export const DPR_FACTOR = Math.max(window.devicePixelRatio || 1, 1.0);

/**
 * Satellite glyph SVG as data URI
 */
export const SATELLITE_GLYPH = `data:image/svg+xml;utf8,
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="0" y="12" width="10" height="10" rx="1" fill="white"/>
  <rect x="22" y="12" width="10" height="10" rx="1" fill="white"/>
  <rect x="12" y="13" width="8" height="8" rx="1" fill="white"/>
</svg>`;

/**
 * LEO smoked glyph SVG as data URI - smoky/estompé appearance
 */
export const LEO_SMOKED_GLYPH = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+CiAgPGRlZnM+CiAgICA8cmFkaWFsR3JhZGllbnQgaWQ9InNtb2tlZCI+CiAgICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9InJnYmEoMjU1LDI1NSwyNTUsMC45KSIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjUwJSIgc3RvcC1jb2xvcj0icmdiYSgyNTUsMjU1LDI1NSwwLjYpIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+CiAgICA8L3JhZGlhbEdyYWRpZW50PgogICAgPGZpbHRlciBpZD0iYmx1ciI+CiAgICAgIDxmZUdhdXNzaWFuQmx1ciBpbj0iU291cmNlR3JhcGhpYyIgc3RkRGV2aWF0aW9uPSIwLjUiLz4KICAgIDwvZmlsdGVyPgogIDwvZGVmcz4KICA8Y2lyY2xlIGN4PSIxNiIgY3k9IjE2IiByPSI2IiBmaWxsPSJ1cmwoI3Ntb2tlZCkiIGZpbHRlcj0idXJsKCNibHVyKSIgb3BhY2l0eT0iMC44Ii8+CiAgPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMyIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjQpIi8+Cjwvc3ZnPgo=";

/**
 * Plane icon SVG as data URI
 */
export const PLANE_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMSAxNnYtMmwtOC01VjMuNWMwLS44My0uNjctMS41LTEuNS0xLjVTMTAgMi42NyAxMCAzLjVWOWwtOCA1djJsOC0yLjVWMTlsLTIgMS41VjIybDMuNS0xIDMuNSAxdi0xLjVMMTMgMTl2LTUuNWw4IDIuNXoiLz48L3N2Zz4=";

/**
 * Dummy polygon for fallback hierarchy
 */
export const DUMMY_POLYGON = [
    Cartesian3.fromDegrees(0, 0),
    Cartesian3.fromDegrees(0, 0.0001),
    Cartesian3.fromDegrees(0.0001, 0)
];
