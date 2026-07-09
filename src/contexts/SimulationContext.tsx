/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useReducer, useMemo, useCallback, ReactNode } from 'react';
import { type CoveragePolicy } from '../utils/leoFootprint';
import {
  type WeatherCondition,
  type BeamHealthData,
  DEFAULT_BEAM_HEALTH,
  WEATHER_LABELS,
  WEATHER_ATTENUATION_DB,
  TOTAL_BEAMS,
} from '../utils/realisticSimulation';
import { coverageModeToPolicy, DEFAULT_COVERAGE_MODE } from '../utils/coverageMode';

// Re-export so consumers import from a single place
export type { WeatherCondition };

// ── State ──────────────────────────────────────────────────────────────────

interface SimulationState {
  coveragePolicy: CoveragePolicy;
  showInactiveSatellites: boolean;
  weatherCondition: WeatherCondition;
  beamHealthFactors: BeamHealthData[];
  failedSnps: Set<string>;
  beamHsStatus: boolean[];
  /** GroundSite.siteId values simulated as out of service (gateway outage / maintenance). */
  failedGeoGatewaySiteIds: Set<string>;
}

// ── Actions ────────────────────────────────────────────────────────────────

type SimulationAction =
  | { type: 'SET_COVERAGE_POLICY'; payload: CoveragePolicy }
  | { type: 'SET_SHOW_INACTIVE_SATELLITES'; payload: boolean }
  | { type: 'SET_WEATHER'; payload: WeatherCondition }
  | { type: 'SET_BEAM_HEALTH'; beamIndex: number; healthFactor: number }
  | { type: 'RESET_BEAM_HEALTH' }
  | { type: 'TOGGLE_SNP'; snpName: string }
  | { type: 'RESET_SNPS' }
  | { type: 'TOGGLE_GEO_GATEWAY'; siteId: string }
  | { type: 'RESET_GEO_GATEWAYS' }
  | { type: 'TOGGLE_BEAM_HS'; beamIndex: number }
  | { type: 'RESET_BEAM_HS' };

// ── Reducer ────────────────────────────────────────────────────────────────

function simulationReducer(state: SimulationState, action: SimulationAction): SimulationState {
  switch (action.type) {
    case 'SET_COVERAGE_POLICY':
      return { ...state, coveragePolicy: action.payload };

    case 'SET_SHOW_INACTIVE_SATELLITES':
      return { ...state, showInactiveSatellites: action.payload };

    case 'SET_WEATHER':
      return { ...state, weatherCondition: action.payload };

    case 'SET_BEAM_HEALTH': {
      const clamped = Math.max(0, Math.min(1, action.healthFactor));
      return {
        ...state,
        beamHealthFactors: state.beamHealthFactors.map((b) =>
          b.beamIndex === action.beamIndex ? { ...b, healthFactor: clamped } : b
        ),
      };
    }

    case 'RESET_BEAM_HEALTH':
      return { ...state, beamHealthFactors: DEFAULT_BEAM_HEALTH.map((b) => ({ ...b })) };

    case 'TOGGLE_SNP': {
      const next = new Set(state.failedSnps);
      if (next.has(action.snpName)) next.delete(action.snpName);
      else next.add(action.snpName);
      return { ...state, failedSnps: next };
    }

    case 'RESET_SNPS':
      return { ...state, failedSnps: new Set() };

    case 'TOGGLE_GEO_GATEWAY': {
      const next = new Set(state.failedGeoGatewaySiteIds);
      if (next.has(action.siteId)) next.delete(action.siteId);
      else next.add(action.siteId);
      return { ...state, failedGeoGatewaySiteIds: next };
    }

    case 'RESET_GEO_GATEWAYS':
      return { ...state, failedGeoGatewaySiteIds: new Set() };

    case 'TOGGLE_BEAM_HS': {
      const next = [...state.beamHsStatus];
      next[action.beamIndex] = !next[action.beamIndex];
      return { ...state, beamHsStatus: next };
    }

    case 'RESET_BEAM_HS':
      return { ...state, beamHsStatus: Array(TOTAL_BEAMS).fill(false) };

    default:
      return state;
  }
}

// ── Initial state ──────────────────────────────────────────────────────────

function getInitialState(): SimulationState {
  let coveragePolicy: CoveragePolicy = coverageModeToPolicy(DEFAULT_COVERAGE_MODE);

  if (typeof window !== 'undefined') {
    const legacyThreshold = localStorage.getItem('beamThresholdDb');
    if (legacyThreshold) {
      const threshold = Number(legacyThreshold);
      if (!isNaN(threshold)) {
        localStorage.removeItem('beamThresholdDb');
        coveragePolicy = { type: 'DB_THRESHOLD', thresholdDb: threshold };
      }
    }
  }

  return {
    coveragePolicy,
    showInactiveSatellites: false,
    weatherCondition: 'CLEAR',
    beamHealthFactors: DEFAULT_BEAM_HEALTH.map((b) => ({ ...b })),
    failedSnps: new Set(),
    beamHsStatus: Array(TOTAL_BEAMS).fill(false),
    failedGeoGatewaySiteIds: new Set(),
  };
}

// ── Context interface (unchanged — consumers are not affected) ─────────────

interface SimulationContextType {
  // Coverage policy (legacy)
  coveragePolicy: CoveragePolicy;
  setCoveragePolicy: (value: CoveragePolicy) => void;
  showInactiveSatellites: boolean;
  setShowInactiveSatellites: (value: boolean) => void;

  // Pillar 5: Weather
  weatherCondition: WeatherCondition;
  setWeatherCondition: (value: WeatherCondition) => void;
  weatherLabel: string;
  weatherAttenuationDb: number;

  // Pillar 3: Hardware Health
  beamHealthFactors: BeamHealthData[];
  setBeamHealthFactor: (beamIndex: number, healthFactor: number) => void;
  resetBeamHealth: () => void;
  getBeamHealthFactor: () => (beamIndex: number) => number;

  // Feature 1: SNP Cascade Failure
  failedSnps: ReadonlySet<string>;
  toggleSnpFailure: (snpName: string) => void;
  resetFailedSnps: () => void;

  // GEO gateway outage simulation — drives FAILOVER beam-gateway routing.
  failedGeoGatewaySiteIds: ReadonlySet<string>;
  toggleGeoGatewayFailure: (siteId: string) => void;
  resetFailedGeoGateways: () => void;

  // Feature 3: Beam HS (Hard Out of Service)
  beamHsStatus: readonly boolean[];
  toggleBeamHs: (beamIndex: number) => void;
  resetBeamHs: () => void;
  /** Derived Set<number> of HS beam indices for O(1) lookup. */
  hsBeamsSet: ReadonlySet<number>;
}

const SimulationContext = createContext<SimulationContextType>({
  coveragePolicy:         coverageModeToPolicy(DEFAULT_COVERAGE_MODE),
  setCoveragePolicy:      () => {},
  showInactiveSatellites: false,
  setShowInactiveSatellites: () => {},
  weatherCondition:       'CLEAR',
  setWeatherCondition:    () => {},
  weatherLabel:           'Clear Sky',
  weatherAttenuationDb:   0,
  beamHealthFactors:      DEFAULT_BEAM_HEALTH,
  setBeamHealthFactor:    () => {},
  resetBeamHealth:        () => {},
  getBeamHealthFactor:    () => () => 1.0,

  failedSnps:             new Set(),
  toggleSnpFailure:       () => {},
  resetFailedSnps:        () => {},

  failedGeoGatewaySiteIds: new Set(),
  toggleGeoGatewayFailure: () => {},
  resetFailedGeoGateways:  () => {},

  beamHsStatus:           Array(TOTAL_BEAMS).fill(false),
  toggleBeamHs:           () => {},
  resetBeamHs:            () => {},
  hsBeamsSet:             new Set(),
});

export const useSimulation = () => useContext(SimulationContext);

export const SimulationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(simulationReducer, undefined, getInitialState);

  const {
    coveragePolicy,
    showInactiveSatellites,
    weatherCondition,
    beamHealthFactors,
    failedSnps,
    beamHsStatus,
    failedGeoGatewaySiteIds,
  } = state;

  // ── Stable action dispatchers ──────────────────────────────────────────
  const setCoveragePolicy  = useCallback((value: CoveragePolicy) =>
    dispatch({ type: 'SET_COVERAGE_POLICY', payload: value }), []);

  const setShowInactiveSatellites = useCallback((value: boolean) =>
    dispatch({ type: 'SET_SHOW_INACTIVE_SATELLITES', payload: value }), []);

  const setWeatherCondition = useCallback((value: WeatherCondition) =>
    dispatch({ type: 'SET_WEATHER', payload: value }), []);

  const setBeamHealthFactor = useCallback((beamIndex: number, healthFactor: number) =>
    dispatch({ type: 'SET_BEAM_HEALTH', beamIndex, healthFactor }), []);

  const resetBeamHealth = useCallback(() =>
    dispatch({ type: 'RESET_BEAM_HEALTH' }), []);

  const getBeamHealthFactor = useCallback(
    () => (beamIndex: number): number => {
      const entry = beamHealthFactors.find((b) => b.beamIndex === beamIndex);
      return entry ? entry.healthFactor : 1.0;
    },
    [beamHealthFactors]
  );

  const toggleSnpFailure = useCallback((snpName: string) =>
    dispatch({ type: 'TOGGLE_SNP', snpName }), []);

  const resetFailedSnps = useCallback(() =>
    dispatch({ type: 'RESET_SNPS' }), []);

  const toggleGeoGatewayFailure = useCallback((siteId: string) =>
    dispatch({ type: 'TOGGLE_GEO_GATEWAY', siteId }), []);

  const resetFailedGeoGateways = useCallback(() =>
    dispatch({ type: 'RESET_GEO_GATEWAYS' }), []);

  const toggleBeamHs = useCallback((beamIndex: number) =>
    dispatch({ type: 'TOGGLE_BEAM_HS', beamIndex }), []);

  const resetBeamHs = useCallback(() =>
    dispatch({ type: 'RESET_BEAM_HS' }), []);

  // ── Derived values ─────────────────────────────────────────────────────
  const weatherLabel         = WEATHER_LABELS[weatherCondition];
  const weatherAttenuationDb = WEATHER_ATTENUATION_DB[weatherCondition];

  const hsBeamsSet = useMemo(
    () => new Set(beamHsStatus.map((hs, i) => (hs ? i : -1)).filter((i) => i >= 0)),
    [beamHsStatus]
  );

  // Memoize the context value so consumers only re-render when the specific
  // slice they use actually changes.
  const contextValue = useMemo(() => ({
    coveragePolicy,
    setCoveragePolicy,
    showInactiveSatellites,
    setShowInactiveSatellites,
    weatherCondition,
    setWeatherCondition,
    weatherLabel,
    weatherAttenuationDb,
    beamHealthFactors,
    setBeamHealthFactor,
    resetBeamHealth,
    getBeamHealthFactor,
    failedSnps,
    toggleSnpFailure,
    resetFailedSnps,
    failedGeoGatewaySiteIds,
    toggleGeoGatewayFailure,
    resetFailedGeoGateways,
    beamHsStatus,
    toggleBeamHs,
    resetBeamHs,
    hsBeamsSet,
  }), [
    coveragePolicy, setCoveragePolicy, showInactiveSatellites, setShowInactiveSatellites,
    weatherCondition, setWeatherCondition, weatherLabel, weatherAttenuationDb,
    beamHealthFactors, setBeamHealthFactor, resetBeamHealth, getBeamHealthFactor,
    failedSnps, toggleSnpFailure, resetFailedSnps,
    failedGeoGatewaySiteIds, toggleGeoGatewayFailure, resetFailedGeoGateways,
    beamHsStatus, toggleBeamHs, resetBeamHs, hsBeamsSet,
  ]);

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
};
