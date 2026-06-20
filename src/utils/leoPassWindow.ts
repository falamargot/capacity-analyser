import { calculatePosition } from '../services/satelliteService';
import type { SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';
import { MIN_USER_TERMINAL_ELEVATION_DEG } from './leoFootprint';

export interface LeoPassWindowEvidence {
  isCurrentlyVisible: boolean;
  currentPassRemainingMin: number | null;
  nextPassInMin: number | null;
  nextPassDurationMin: number | null;
  passApexElevationDeg: number | null;
  sampledWindowMin: number;
  thresholdElevationDeg: number;
  label: string;
}

export interface BuildLeoPassWindowInput {
  satellite: SatelliteData | null;
  point: { lat: number; lng: number } | null;
  now?: Date;
  horizonMin?: number;
  stepSec?: number;
  thresholdElevationDeg?: number;
}

interface PassSample {
  offsetMin: number;
  elevationDeg: number | null;
  visible: boolean;
}

function formatMin(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '--';
  if (value < 1) return '<1 min';
  return `${Math.round(value)} min`;
}

export function buildLeoPassWindowEvidence(input: BuildLeoPassWindowInput): LeoPassWindowEvidence {
  const horizonMin = input.horizonMin ?? 30;
  const stepSec = input.stepSec ?? 30;
  const thresholdElevationDeg = input.thresholdElevationDeg ?? MIN_USER_TERMINAL_ELEVATION_DEG;

  if (!input.satellite || !input.point || !input.satellite.position || input.satellite.position.isPositionValid === false) {
    return {
      isCurrentlyVisible: false,
      currentPassRemainingMin: null,
      nextPassInMin: null,
      nextPassDurationMin: null,
      passApexElevationDeg: null,
      sampledWindowMin: horizonMin,
      thresholdElevationDeg,
      label: 'No pass evidence available',
    };
  }

  const now = input.now ?? new Date();
  const samples: PassSample[] = [];
  const sampleCount = Math.max(1, Math.floor((horizonMin * 60) / stepSec));

  for (let index = 0; index <= sampleCount; index += 1) {
    const offsetSec = index * stepSec;
    const sampleTime = new Date(now.getTime() + offsetSec * 1000);
    const position = index === 0
      ? input.satellite.position
      : calculatePosition(input.satellite, sampleTime);
    if (position.isPositionValid === false) {
      samples.push({ offsetMin: offsetSec / 60, elevationDeg: null, visible: false });
      continue;
    }
    const sampleSatellite: SatelliteData = {
      ...input.satellite,
      position: {
        ...input.satellite.position,
        ...position,
      },
    };
    const elevationDeg = calculateElevationAngle(input.point, sampleSatellite);
    samples.push({
      offsetMin: offsetSec / 60,
      elevationDeg,
      visible: elevationDeg >= thresholdElevationDeg,
    });
  }

  const visibleSamples = samples.filter((sample) => sample.visible);
  const apex = visibleSamples.reduce<PassSample | null>((best, sample) => {
    if (!best) return sample;
    return (sample.elevationDeg ?? -Infinity) > (best.elevationDeg ?? -Infinity) ? sample : best;
  }, null);

  const currentlyVisible = samples[0]?.visible === true;
  if (currentlyVisible) {
    const firstInvisible = samples.find((sample) => !sample.visible && sample.offsetMin > 0);
    const currentPassRemainingMin = firstInvisible
      ? Math.max(0, firstInvisible.offsetMin - stepSec / 60)
      : horizonMin;
    return {
      isCurrentlyVisible: true,
      currentPassRemainingMin,
      nextPassInMin: null,
      nextPassDurationMin: currentPassRemainingMin,
      passApexElevationDeg: apex?.elevationDeg ?? samples[0]?.elevationDeg ?? null,
      sampledWindowMin: horizonMin,
      thresholdElevationDeg,
      label: `Current pass remaining ~${formatMin(currentPassRemainingMin)}`,
    };
  }

  const firstVisibleIndex = samples.findIndex((sample) => sample.visible);
  if (firstVisibleIndex === -1) {
    return {
      isCurrentlyVisible: false,
      currentPassRemainingMin: null,
      nextPassInMin: null,
      nextPassDurationMin: null,
      passApexElevationDeg: null,
      sampledWindowMin: horizonMin,
      thresholdElevationDeg,
      label: `No pass in next ${horizonMin} min`,
    };
  }

  const firstVisible = samples[firstVisibleIndex];
  const firstInvisibleAfter = samples.slice(firstVisibleIndex).find((sample) => !sample.visible);
  const nextPassEndMin = firstInvisibleAfter
    ? Math.max(firstVisible.offsetMin, firstInvisibleAfter.offsetMin - stepSec / 60)
    : horizonMin;
  const nextPassDurationMin = Math.max(0, nextPassEndMin - firstVisible.offsetMin);

  return {
    isCurrentlyVisible: false,
    currentPassRemainingMin: null,
    nextPassInMin: firstVisible.offsetMin,
    nextPassDurationMin,
    passApexElevationDeg: apex?.elevationDeg ?? null,
    sampledWindowMin: horizonMin,
    thresholdElevationDeg,
    label: `Next pass in ~${formatMin(firstVisible.offsetMin)} for ~${formatMin(nextPassDurationMin)}`,
  };
}

export function expectedHandoversFromPassWindow(passWindow: LeoPassWindowEvidence | null): number {
  const remaining = passWindow?.currentPassRemainingMin ?? passWindow?.nextPassDurationMin ?? null;
  if (remaining == null) return 1;
  if (remaining >= 12) return 0;
  if (remaining >= 6) return 1;
  return 2;
}

export function stabilityFromPassWindows(
  passA: LeoPassWindowEvidence | null,
  passB: LeoPassWindowEvidence | null,
  fallbackElevationA: number | null,
  fallbackElevationB: number | null,
): 'High' | 'Medium' | 'Low' {
  const minRemaining = Math.min(
    passA?.currentPassRemainingMin ?? passA?.nextPassDurationMin ?? 0,
    passB?.currentPassRemainingMin ?? passB?.nextPassDurationMin ?? 0,
  );
  const minApex = Math.min(
    passA?.passApexElevationDeg ?? fallbackElevationA ?? 0,
    passB?.passApexElevationDeg ?? fallbackElevationB ?? 0,
  );

  if (minRemaining >= 10 && minApex >= 40) return 'High';
  if (minRemaining >= 5 && minApex >= 20) return 'Medium';
  return 'Low';
}
