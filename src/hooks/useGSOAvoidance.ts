/**
 * useGSOAvoidance - Shared hook to compute GSO Protection / Avoidance data for a OneWeb satellite.
 *
 * Replaces the duplicated setInterval logic that existed in both SatelliteDetails and
 * SatelliteIndicator. A single interval now drives both consumers.
 */
import { useState, useEffect } from 'react';
import { JulianDate, Math as CesiumMath } from 'cesium';
import * as satellite from 'satellite.js';
import { calculateGSOAvoidanceAngle, getActiveBeamCount, getGsoMutedBeamSet } from '../utils/oneWebComb';
import type { SatelliteData } from '../types/satellites';
import { useSecondTick } from './useSecondTick';

export interface GSOAvoidanceData {
  pitchAngleDeg: number;
  isGSOAvoidance: boolean;
  latitude: number;
  isBlankingZone: boolean;
  activeBeamCount: number;
  /** Geometry-derived GSO keep-out set (Lot 3 Item 4). */
  gsoMutedBeams: ReadonlySet<number>;
  isMovingNorth: boolean;
}

/**
 * Returns live GSO avoidance data for a OneWeb satellite, updated every second.
 * Returns null for non-OneWeb satellites or when satrec is unavailable.
 */
export function useGSOAvoidance(sat: SatelliteData | null): GSOAvoidanceData | null {
  const [data, setData] = useState<GSOAvoidanceData | null>(null);
  const tick = useSecondTick();

  useEffect(() => {
    if (!sat || sat.type !== 'ONEWEB' || !sat.satrec) {
      setData(null);
      return;
    }

    const satrec = sat.satrec;

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
      const gsoMutedBeams = getGsoMutedBeamSet(satrec, julianDate);

      setData({
        pitchAngleDeg: CesiumMath.toDegrees(pitchAngleRad),
        isGSOAvoidance,
        latitude,
        isBlankingZone,
        activeBeamCount,
        gsoMutedBeams,
        isMovingNorth,
      });
    } catch {
      // Propagation error — keep previous value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sat?.id, sat?.satrec, tick]);

  return data;
}
