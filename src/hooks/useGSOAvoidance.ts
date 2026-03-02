/**
 * useGSOAvoidance - Shared hook to compute GSO Protection / Avoidance data for a OneWeb satellite.
 *
 * Replaces the duplicated setInterval logic that existed in both SatelliteDetails and
 * SatelliteIndicator. A single interval now drives both consumers.
 */
import { useState, useEffect } from 'react';
import { JulianDate, Math as CesiumMath } from 'cesium';
import * as satellite from 'satellite.js';
import { calculateGSOAvoidanceAngle, getActiveBeamCount } from '../utils/oneWebComb';
import type { SatelliteData } from '../types/satellites';

export interface GSOAvoidanceData {
  pitchAngleDeg: number;
  isGSOAvoidance: boolean;
  latitude: number;
  isBlankingZone: boolean;
  activeBeamCount: number;
  isMovingNorth: boolean;
}

/**
 * Returns live GSO avoidance data for a OneWeb satellite, updated every second.
 * Returns null for non-OneWeb satellites or when satrec is unavailable.
 */
export function useGSOAvoidance(sat: SatelliteData | null): GSOAvoidanceData | null {
  const [data, setData] = useState<GSOAvoidanceData | null>(null);

  useEffect(() => {
    if (!sat || sat.type !== 'ONEWEB' || !sat.satrec) {
      setData(null);
      return;
    }

    const satrec = sat.satrec;

    const compute = () => {
      try {
        const now = new Date();
        const julianDate = JulianDate.fromDate(now);

        const positionAndVelocity = satellite.propagate(satrec, now);
        if (
          !positionAndVelocity ||
          !positionAndVelocity.position ||
          typeof positionAndVelocity.position === 'boolean'
        ) {
          return;
        }

        const gmst = satellite.gstime(now);
        const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
        const latitude = satellite.degreesLat(positionGd.latitude);

        const { pitchAngleRad, isGSOAvoidance, isBlankingZone, isMovingNorth } =
          calculateGSOAvoidanceAngle(satrec, julianDate);

        const activeBeamCount = getActiveBeamCount(satrec, julianDate);

        setData({
          pitchAngleDeg: CesiumMath.toDegrees(pitchAngleRad),
          isGSOAvoidance,
          latitude,
          isBlankingZone,
          activeBeamCount,
          isMovingNorth,
        });
      } catch {
        // Propagation error — keep previous value
      }
    };

    compute();
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [sat?.id, sat?.satrec]); // eslint-disable-line react-hooks/exhaustive-deps

  return data;
}
