/**
 * Shared OneWeb-like orbit fixture for LEO tests: a synthetic TLE at 1200 km /
 * 87.9° propagated with satellite.js to a chosen sub-point latitude band.
 */

import * as satellite from 'satellite.js';
import type { SatelliteData } from '../../../types/satellites';

const TLE1 = '1 44057U 19010A   24001.00000000  .00000000  00000-0  00000-0 0  9990';
const TLE2 = '2 44057  87.9000   0.0000 0001000   0.0000   0.0000 13.15000000    10';

export interface OrbitFixture {
  satrec: satellite.SatRec;
  time: Date;
  subLatDeg: number;
  subLngDeg: number;
  altKm: number;
}

/** Propagate forward from epoch until the sub-point latitude enters [minAbsLat, maxAbsLat]. */
export function buildOrbitFixture(minAbsLatDeg = 50, maxAbsLatDeg = 65): OrbitFixture {
  const satrec = satellite.twoline2satrec(TLE1, TLE2);
  const epoch = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
  for (let offsetSec = 0; offsetSec <= 120 * 60; offsetSec += 30) {
    const time = new Date(epoch.getTime() + offsetSec * 1000);
    const pv = satellite.propagate(satrec, time);
    if (!pv?.position || typeof pv.position === 'boolean') continue;
    const gmst = satellite.gstime(time);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const latDeg = satellite.degreesLat(geo.latitude);
    if (Math.abs(latDeg) >= minAbsLatDeg && Math.abs(latDeg) <= maxAbsLatDeg) {
      return {
        satrec,
        time,
        subLatDeg: latDeg,
        subLngDeg: satellite.degreesLong(geo.longitude),
        altKm: geo.height,
      };
    }
  }
  throw new Error(`No epoch offset produced |lat| in [${minAbsLatDeg}, ${maxAbsLatDeg}] — TLE fixture broken`);
}

export function makeOneWebSatellite(orbit: OrbitFixture, id = 'LEO-FIXTURE'): SatelliteData {
  return {
    id,
    name: id,
    noradId: '44057',
    coverageFileId: null,
    type: 'ONEWEB',
    orbitType: 'LEO',
    opsStatus: 'operational',
    satrec: orbit.satrec,
    position: { lat: orbit.subLatDeg, lng: orbit.subLngDeg, alt: orbit.altKm, isPositionValid: true },
    capacity: {
      maxThroughput: 7.2,
      bandwidth: { ku: 250, ka: 100 },
      availability: 0.99,
    },
    referenced_coverages: { type: 'FeatureCollection', features: [] },
    coverages: [],
  } as SatelliteData;
}

/** Offset a point east of the fixture sub-point by a ground distance (km). */
export function pointEastOfSubpoint(orbit: OrbitFixture, groundKm: number): { lat: number; lng: number } {
  const degPerKm = 1 / (111.32 * Math.cos((orbit.subLatDeg * Math.PI) / 180));
  return { lat: orbit.subLatDeg, lng: orbit.subLngDeg + groundKm * degPerKm };
}
