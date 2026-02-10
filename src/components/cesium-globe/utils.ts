/**
 * Shared utilities for Cesium globe components
 */
import { Cartesian3, JulianDate, Math as CesiumMath } from 'cesium';
import * as satellite from 'satellite.js';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';

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
            const alt = geoPosition.height * 1000; // to meters

            if (isFinite(lat) && isFinite(lng) && isFinite(alt)) {
                return Cartesian3.fromDegrees(lng, lat, alt);
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
 * Optimized for FullHD displays while maintaining visibility on Retina
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

    // Use a reduced DPR factor for FullHD optimization
    // FullHD (DPR=1): use 0.8, Retina (DPR=2): use 1.0, higher DPR: cap at 1.2
    const adjustedDprFactor = dprFactor <= 1 ? 0.8 : Math.min(dprFactor * 0.5, 1.2);
    
    const scaleFactor = adjustedDprFactor * distanceFactor;

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
