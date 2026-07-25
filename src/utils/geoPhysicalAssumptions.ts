import type { WeatherType } from '../components/capacity/terminalAssumptions';
import type { LinkMode } from '../types/linkMode';
import type { GeoBand } from './geoLinkBudget';
import { combineCarrierRatiosDb, combineEndToEndCNDb } from './geoLinkBudget';

export type GeoPlanningScenarioId = 'nominal' | 'conservative';

/** Bump whenever an assumption changes so cached/headless results cannot be reused silently. */
export const GEO_PHYSICAL_MODEL_VERSION = '2026-07-25.1';

export interface GeoPayloadLossProfile {
  id: GeoPlanningScenarioId;
  inputBackoffDb: number;
  outputBackoffDb: number;
  carrierToInterferenceDb: number;
  carrierToImdDb: number;
  crossPolarDiscriminationDb: number;
  implementationMarginDb: number;
  source: string;
}

/**
 * Transparent-payload planning assumptions. They are deliberately visible and
 * scenario-bound: no value is presented as operator configuration or telemetry.
 */
export const GEO_PAYLOAD_LOSS_PROFILES: Readonly<Record<GeoPlanningScenarioId, GeoPayloadLossProfile>> = {
  nominal: {
    id: 'nominal',
    inputBackoffDb: 1.0,
    outputBackoffDb: 2.0,
    carrierToInterferenceDb: 24,
    carrierToImdDb: 26,
    crossPolarDiscriminationDb: 28,
    implementationMarginDb: 0.8,
    source: 'Capacity Analyzer transparent-payload planning assumptions',
  },
  conservative: {
    id: 'conservative',
    inputBackoffDb: 2.0,
    outputBackoffDb: 3.5,
    carrierToInterferenceDb: 20,
    carrierToImdDb: 22,
    crossPolarDiscriminationDb: 24,
    implementationMarginDb: 1.5,
    source: 'Capacity Analyzer conservative transparent-payload planning assumptions',
  },
};

export interface PayloadAdjustedCarrierRatio {
  uplinkAfterBackoffDb: number;
  downlinkAfterBackoffDb: number;
  combinedBeforeImplementationDb: number;
  effectiveCnDb: number;
  totalEquivalentPenaltyDb: number;
}

export function applyGeoPayloadLosses(
  uplinkCnDb: number,
  downlinkCnDb: number,
  profile: GeoPayloadLossProfile,
): PayloadAdjustedCarrierRatio {
  const uplinkAfterBackoffDb = uplinkCnDb - profile.inputBackoffDb;
  const downlinkAfterBackoffDb = downlinkCnDb - profile.outputBackoffDb;
  const combinedBeforeImplementationDb = combineCarrierRatiosDb([
    uplinkAfterBackoffDb,
    downlinkAfterBackoffDb,
    profile.carrierToInterferenceDb,
    profile.carrierToImdDb,
    profile.crossPolarDiscriminationDb,
  ]);
  const effectiveCnDb = combinedBeforeImplementationDb - profile.implementationMarginDb;
  const idealCnDb = combineEndToEndCNDb(uplinkCnDb, downlinkCnDb);
  return {
    uplinkAfterBackoffDb,
    downlinkAfterBackoffDb,
    combinedBeforeImplementationDb,
    effectiveCnDb,
    totalEquivalentPenaltyDb: Math.max(0, idealCnDb - effectiveCnDb),
  };
}

export interface P618PlanningInput {
  band: GeoBand;
  direction: 'uplink' | 'downlink';
  latitudeDeg: number;
  elevationDeg: number;
  weatherType: WeatherType;
  /** Percentage of time the attenuation may be exceeded. Default 0.01%. */
  exceedancePct?: number;
}

export interface P618PlanningAttenuation {
  excessLossDb: number;
  rainLossDb: number;
  cloudLossDb: number;
  scintillationLossDb: number;
  rainRateMmH: number;
  effectiveRainPathKm: number;
  frequencyGhz: number;
  model: 'ITU-R P.618-14 planning approximation';
}

const WEATHER_RAIN_RATE_MM_H: Record<WeatherType, number> = {
  clear: 0,
  light_rain: 2.5,
  heavy_rain: 25,
  storm: 50,
};

const FREQUENCY_GHZ: Record<GeoBand, { uplink: number; downlink: number }> = {
  C: { uplink: 5.9, downlink: 3.8 },
  Ku: { uplink: 14.0, downlink: 11.7 },
  Ka: { uplink: 29.5, downlink: 19.7 },
};

/**
 * P.838-style circular-polarization coefficients at the model's nominal band
 * frequencies. These feed the P.618 slant-path/reduction workflow.
 */
const RAIN_COEFFICIENTS: Record<GeoBand, { uplink: { k: number; alpha: number }; downlink: { k: number; alpha: number } }> = {
  C: {
    uplink: { k: 0.0007, alpha: 1.20 },
    downlink: { k: 0.0002, alpha: 1.15 },
  },
  Ku: {
    uplink: { k: 0.040, alpha: 1.10 },
    downlink: { k: 0.018, alpha: 1.12 },
  },
  Ka: {
    uplink: { k: 0.24, alpha: 1.02 },
    downlink: { k: 0.10, alpha: 1.06 },
  },
};

const round = (value: number, digits = 3): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

/**
 * Location/elevation/frequency-aware P.618 planning approximation.
 *
 * This implements the P.618 structure (local R0.01 proxy, rain height, slant
 * path and horizontal reduction) but not the full ITU digital-map interpolation.
 * The result is therefore an explicitly modeled planning loss, not an SLA.
 */
export function estimateP618PlanningAttenuation(input: P618PlanningInput): P618PlanningAttenuation {
  const frequencyGhz = FREQUENCY_GHZ[input.band][input.direction];
  if (input.weatherType === 'clear') {
    return {
      excessLossDb: 0,
      rainLossDb: 0,
      cloudLossDb: 0,
      scintillationLossDb: 0,
      rainRateMmH: 0,
      effectiveRainPathKm: 0,
      frequencyGhz,
      model: 'ITU-R P.618-14 planning approximation',
    };
  }

  const absLat = Math.min(90, Math.abs(input.latitudeDeg));
  const tropicalFactor = 1 + Math.max(0, 35 - absLat) / 70;
  const rainRateMmH = WEATHER_RAIN_RATE_MM_H[input.weatherType] * tropicalFactor;
  const rainHeightKm = Math.max(2.5, 5.0 - (0.035 * absLat));
  const elevationRad = Math.max(5, Math.min(90, input.elevationDeg)) * Math.PI / 180;
  const slantRainPathKm = rainHeightKm / Math.sin(elevationRad);
  const { k, alpha } = RAIN_COEFFICIENTS[input.band][input.direction];
  const specificAttenuationDbKm = k * Math.pow(rainRateMmH, alpha);
  const horizontalProjectionKm = slantRainPathKm * Math.cos(elevationRad);
  const reductionFactor = 1 / (
    1
    + (0.78 * Math.sqrt(Math.max(0, horizontalProjectionKm * specificAttenuationDbKm / frequencyGhz)))
    - (0.38 * (1 - Math.exp(-2 * horizontalProjectionKm)))
  );
  const exceedancePct = Math.max(0.001, input.exceedancePct ?? 0.01);
  const percentileScale = Math.pow(0.01 / exceedancePct, 0.12);
  const effectiveRainPathKm = slantRainPathKm * Math.max(0.1, Math.min(1, reductionFactor));
  const rainLossDb = specificAttenuationDbKm * effectiveRainPathKm * percentileScale;
  const weatherSeverity = input.weatherType === 'storm' ? 1 : input.weatherType === 'heavy_rain' ? 0.65 : 0.25;
  const cloudLossDb = (input.band === 'Ka' ? 1.2 : input.band === 'Ku' ? 0.35 : 0.08)
    * weatherSeverity / Math.sin(elevationRad);
  const scintillationLossDb = (input.band === 'Ka' ? 0.8 : input.band === 'Ku' ? 0.35 : 0.12)
    * weatherSeverity * Math.pow(Math.sin(elevationRad), -0.7);

  return {
    excessLossDb: round(rainLossDb + cloudLossDb + scintillationLossDb),
    rainLossDb: round(rainLossDb),
    cloudLossDb: round(cloudLossDb),
    scintillationLossDb: round(scintillationLossDb),
    rainRateMmH: round(rainRateMmH),
    effectiveRainPathKm: round(effectiveRainPathKm),
    frequencyGhz,
    model: 'ITU-R P.618-14 planning approximation',
  };
}

export type GeoServicePlanId = 'unconfigured' | 'dedicated' | 'business_shared' | 'best_effort';

export interface GeoServicePlan {
  id: GeoServicePlanId;
  label: string;
  contentionRatio: number;
  allocatedCapacityFraction: number;
  peakRateMbps: number | null;
  committedRateMbps: number | null;
  source: 'explicit-model-assumption';
}

export const GEO_SERVICE_PLANS: Readonly<Record<GeoServicePlanId, GeoServicePlan>> = {
  unconfigured: {
    id: 'unconfigured',
    label: 'Unconfigured planning ceiling',
    contentionRatio: 1,
    allocatedCapacityFraction: 1,
    peakRateMbps: null,
    committedRateMbps: null,
    source: 'explicit-model-assumption',
  },
  dedicated: {
    id: 'dedicated',
    label: 'Dedicated carrier',
    contentionRatio: 1,
    allocatedCapacityFraction: 1,
    peakRateMbps: null,
    committedRateMbps: null,
    source: 'explicit-model-assumption',
  },
  business_shared: {
    id: 'business_shared',
    label: 'Business shared 5:1',
    contentionRatio: 5,
    allocatedCapacityFraction: 1,
    peakRateMbps: null,
    committedRateMbps: null,
    source: 'explicit-model-assumption',
  },
  best_effort: {
    id: 'best_effort',
    label: 'Best effort 20:1',
    contentionRatio: 20,
    allocatedCapacityFraction: 1,
    peakRateMbps: null,
    committedRateMbps: null,
    source: 'explicit-model-assumption',
  },
};

export function defaultGeoServicePlanForTopology(linkMode: LinkMode): GeoServicePlan {
  return linkMode === 'POINT_TO_POINT'
    ? GEO_SERVICE_PLANS.dedicated
    : GEO_SERVICE_PLANS.unconfigured;
}
