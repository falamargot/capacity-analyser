/**
 * FlightCoverageRibbon
 *
 * COMM-mode globe layer — renders the selected aircraft's projected 2-hour
 * flight path as a colour-coded coverage ribbon based on real-time LEO
 * elevation angles computed against the live OneWeb constellation.
 *
 * Quality tiers (best elevation across all visible LEO satellites):
 *   ≥ 40°  → Excellent  — emerald glow
 *   25–40° → Good       — sky-blue glow
 *   15–25° → Marginal   — amber glow
 *   < 15°  → Gap        — slate dashed
 *
 * Performance notes:
 *   24 projection steps × N_LEO satellites elevation checks per memo cycle.
 *   The memo is keyed on aircraft position/heading and the satellites array
 *   reference (which changes every 2 s on the satellite update timer).
 *   ~15 k float ops per refresh — negligible on the main thread.
 */

import { memo, useMemo } from 'react';
import { Entity } from 'resium';
import {
  Cartesian3,
  Color,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
} from 'cesium';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { SatelliteData } from '../../types/satellites';
import { calculateElevationAngle } from '../../utils/capacityCalculator';

// ── Coverage quality tiers ────────────────────────────────────────────────────

type CoverageQuality = 'excellent' | 'good' | 'marginal' | 'gap';

function elevationToQuality(elevDeg: number): CoverageQuality {
  if (elevDeg >= 40) return 'excellent';
  if (elevDeg >= 25) return 'good';
  if (elevDeg >= 15) return 'marginal';
  return 'gap';
}

// ── Cesium materials (module-level singletons) ────────────────────────────────

const QUALITY_MATERIAL: Record<CoverageQuality, PolylineGlowMaterialProperty | PolylineDashMaterialProperty> = {
  excellent: new PolylineGlowMaterialProperty({
    color:      Color.fromCssColorString('#34d399'), // emerald-400
    glowPower:  0.22,
    taperPower: 0.55,
  }),
  good: new PolylineGlowMaterialProperty({
    color:      Color.fromCssColorString('#38bdf8'), // sky-400
    glowPower:  0.16,
    taperPower: 0.55,
  }),
  marginal: new PolylineGlowMaterialProperty({
    color:      Color.fromCssColorString('#fbbf24'), // amber-400
    glowPower:  0.10,
    taperPower: 0.55,
  }),
  gap: new PolylineDashMaterialProperty({
    color:       Color.fromCssColorString('#64748b').withAlpha(0.28),
    dashPattern: 255,
    dashLength:  20,
  }),
};

const QUALITY_WIDTH: Record<CoverageQuality, number> = {
  excellent: 5,
  good:      4,
  marginal:  3.5,
  gap:       2,
};

// ── Great-circle projection ───────────────────────────────────────────────────

function projectPosition(
  lat0Deg: number,
  lng0Deg: number,
  headingDeg: number,
  speedKmh: number,
  deltaMin: number,
): { lat: number; lng: number } {
  const R    = 6371; // km
  const d    = (speedKmh * deltaMin) / 60;
  const lat1 = (lat0Deg * Math.PI) / 180;
  const lng1 = (lng0Deg * Math.PI) / 180;
  const brng = (headingDeg * Math.PI) / 180;
  const dR   = d / R;

  const sinLat2 =
    Math.sin(lat1) * Math.cos(dR) +
    Math.cos(lat1) * Math.sin(dR) * Math.cos(brng);
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));

  const y    = Math.sin(brng) * Math.sin(dR) * Math.cos(lat1);
  const x    = Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2);
  const lng2 = lng1 + Math.atan2(y, x);

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: ((lng2 * 180) / Math.PI + 540) % 360 - 180, // normalise to −180…180
  };
}

// ── Segment grouping ──────────────────────────────────────────────────────────

interface CoverageSegment {
  id: string;
  quality: CoverageQuality;
  positions: Cartesian3[];
}

function buildSegments(aircraft: Aircraft, leoSats: SatelliteData[]): CoverageSegment[] {
  const lat0 = Number(aircraft.latitude);
  const lng0 = Number(aircraft.longitude);
  if (!isFinite(lat0) || !isFinite(lng0)) return [];

  const heading  = aircraft.heading   ?? 0;
  const speedKmh = aircraft.speed_kmh ?? 850;
  const altKm    = aircraft.altitude_km ?? 10.668;
  const altM     = altKm * 1000;

  const STEP_MIN     = 5;
  const STEPS_BEHIND = 4;  // 20 min of trail behind
  const STEPS_AHEAD  = 24; // 2 h lookahead

  type Sample = { lat: number; lng: number; quality: CoverageQuality };
  const samples: Sample[] = [];

  for (let i = -STEPS_BEHIND; i <= STEPS_AHEAD; i++) {
    const { lat, lng } = projectPosition(lat0, lng0, heading, speedKmh, i * STEP_MIN);

    let bestElev = -90;
    for (const sat of leoSats) {
      const elev = calculateElevationAngle({ lat, lng, altitude: altKm }, sat);
      if (elev > bestElev) bestElev = elev;
    }
    samples.push({ lat, lng, quality: elevationToQuality(bestElev) });
  }

  const segments: CoverageSegment[] = [];
  let segIdx    = 0;
  let curQ      = samples[0].quality;
  let curPts    = [Cartesian3.fromDegrees(samples[0].lng, samples[0].lat, altM)];

  for (let i = 1; i < samples.length; i++) {
    const s  = samples[i];
    const pt = Cartesian3.fromDegrees(s.lng, s.lat, altM);

    if (s.quality === curQ) {
      curPts.push(pt);
    } else {
      // Share the boundary point so segments touch without a gap.
      curPts.push(pt);
      if (curPts.length >= 2) {
        segments.push({ id: `${curQ}-${segIdx++}`, quality: curQ, positions: curPts });
      }
      curQ   = s.quality;
      curPts = [pt];
    }
  }

  if (curPts.length >= 2) {
    segments.push({ id: `${curQ}-${segIdx}`, quality: curQ, positions: curPts });
  }

  return segments;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface FlightCoverageRibbonProps {
  aircraft: Aircraft | null;
  satellites: SatelliteData[];
  show: boolean;
}

const FlightCoverageRibbon = memo(function FlightCoverageRibbon({
  aircraft,
  satellites,
  show,
}: FlightCoverageRibbonProps) {
  const segments = useMemo((): CoverageSegment[] => {
    if (!show || !aircraft || aircraft.latitude == null || aircraft.longitude == null) return [];

    const leoSats = satellites.filter(
      sat => sat.orbitType === 'LEO' && sat.position.isPositionValid !== false,
    );
    if (leoSats.length === 0) return [];

    return buildSegments(aircraft, leoSats);
  }, [
    show,
    aircraft?.icao24,
    aircraft?.latitude,
    aircraft?.longitude,
    aircraft?.heading,
    aircraft?.speed_kmh,
    aircraft?.altitude_km,
    satellites,
  ]);

  if (!show || segments.length === 0) return null;

  const icao = aircraft?.icao24 ?? 'unknown';

  return (
    <>
      {segments.map(seg => {
        if (seg.positions.length < 2) return null;
        return (
          <Entity
            key={`fc-${icao}-${seg.id}`}
            id={`flight-coverage-${icao}-${seg.id}`}
            name={`IFC coverage — ${seg.quality}`}
            polyline={{
              positions: seg.positions,
              width:     QUALITY_WIDTH[seg.quality],
              material:  QUALITY_MATERIAL[seg.quality],
              clampToGround: false,
            }}
          />
        );
      })}
    </>
  );
});

export default FlightCoverageRibbon;
