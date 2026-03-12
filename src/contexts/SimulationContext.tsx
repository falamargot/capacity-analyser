/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { type CoveragePolicy } from '../utils/leoFootprint';
import {
  type WeatherCondition,
  type BeamHealthData,
  DEFAULT_BEAM_HEALTH,
  WEATHER_LABELS,
  WEATHER_ATTENUATION_DB,
  TOTAL_BEAMS,
} from '../utils/realisticSimulation';

// Re-export so consumers import from a single place
export type { WeatherCondition };

// ─────────────────────────────────────────────────────────────────
// Feature 2 – Polar Corridor DC Level utilities
// ─────────────────────────────────────────────────────────────────

/** Number of polar corridors (longitude strips of 20° each) */
export const CORRIDOR_COUNT = 18;
export const CORRIDOR_WIDTH_DEG = 20;

/** Default DC level for all corridors (16 = full demand) */
export const DEFAULT_DC_LEVEL = 16;

/** Returns the corridor index (0–17) for a given longitude (−180° to +180°). */
export function getCorridorIndex(lngDeg: number): number {
  const normalized = ((lngDeg + 180) % 360 + 360) % 360;
  return Math.min(Math.floor(normalized / CORRIDOR_WIDTH_DEG), CORRIDOR_COUNT - 1);
}

/** Returns the [west, east] longitude bounds for a corridor index. */
export function getCorridorRange(index: number): [number, number] {
  const west = -180 + index * CORRIDOR_WIDTH_DEG;
  return [west, west + CORRIDOR_WIDTH_DEG];
}

/** Linear throughput scale from a DC level (1–16). DC16 = 1.0, DC1 = 0.0625. */
export function getDcThroughputScale(dcLevel: number): number {
  return Math.max(0, Math.min(16, dcLevel)) / 16;
}

const DEFAULT_CORRIDOR_DC_LEVELS: number[] = Array(CORRIDOR_COUNT).fill(DEFAULT_DC_LEVEL);

interface SimulationContextType {
  // Coverage policy (legacy)
  coveragePolicy: CoveragePolicy;
  setCoveragePolicy: (value: CoveragePolicy) => void;

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

  // Feature 2: DC Level per Polar Corridor
  corridorDcLevels: readonly number[];
  setCorridorDcLevel: (corridorIndex: number, dcLevel: number) => void;
  resetCorridorDcLevels: () => void;

  // Feature 3: Beam HS (Hard Out of Service)
  beamHsStatus: readonly boolean[];
  toggleBeamHs: (beamIndex: number) => void;
  resetBeamHs: () => void;
  /** Derived Set<number> of HS beam indices for O(1) lookup. */
  hsBeamsSet: ReadonlySet<number>;
}

const SimulationContext = createContext<SimulationContextType>({
  coveragePolicy:         { type: 'DB_THRESHOLD', thresholdDb: -10 },
  setCoveragePolicy:      () => {},
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

  corridorDcLevels:       DEFAULT_CORRIDOR_DC_LEVELS,
  setCorridorDcLevel:     () => {},
  resetCorridorDcLevels:  () => {},

  beamHsStatus:           Array(TOTAL_BEAMS).fill(false),
  toggleBeamHs:           () => {},
  resetBeamHs:            () => {},
  hsBeamsSet:             new Set(),
});

export const useSimulation = () => useContext(SimulationContext);

export const SimulationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const getInitialPolicy = (): CoveragePolicy => {
    if (typeof window !== 'undefined') {
      const legacyThreshold = localStorage.getItem('beamThresholdDb');
      if (legacyThreshold) {
        const threshold = Number(legacyThreshold);
        if (!isNaN(threshold)) {
          localStorage.removeItem('beamThresholdDb');
          return { type: 'DB_THRESHOLD', thresholdDb: threshold };
        }
      }
    }
    return { type: 'DB_THRESHOLD', thresholdDb: -10 };
  };

  const [coveragePolicy, setCoveragePolicy]     = useState<CoveragePolicy>(getInitialPolicy);
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>('CLEAR');
  const [beamHealthFactors, setBeamHealthFactors] = useState<BeamHealthData[]>(
    () => DEFAULT_BEAM_HEALTH.map(b => ({ ...b }))
  );

  // Feature 1: SNP failures
  const [failedSnps, setFailedSnps] = useState<Set<string>>(() => new Set());

  // Feature 2: Corridor DC levels
  const [corridorDcLevels, setCorridorDcLevels] = useState<number[]>(
    () => [...DEFAULT_CORRIDOR_DC_LEVELS]
  );

  // Feature 3: Beam HS
  const [beamHsStatus, setBeamHsStatus] = useState<boolean[]>(
    () => Array(TOTAL_BEAMS).fill(false)
  );

  const weatherLabel         = WEATHER_LABELS[weatherCondition];
  const weatherAttenuationDb = WEATHER_ATTENUATION_DB[weatherCondition];

  // ── Beam health ───────────────────────────────────────────────
  const setBeamHealthFactor = (beamIndex: number, healthFactor: number) => {
    setBeamHealthFactors(prev =>
      prev.map(b =>
        b.beamIndex === beamIndex
          ? { ...b, healthFactor: Math.max(0, Math.min(1, healthFactor)) }
          : b
      )
    );
  };

  const resetBeamHealth = () => {
    setBeamHealthFactors(DEFAULT_BEAM_HEALTH.map(b => ({ ...b })));
  };

  const getBeamHealthFactor = useCallback(
    () => (beamIndex: number): number => {
      const entry = beamHealthFactors.find(b => b.beamIndex === beamIndex);
      return entry ? entry.healthFactor : 1.0;
    },
    [beamHealthFactors]
  );

  // ── SNP failures ──────────────────────────────────────────────
  const toggleSnpFailure = useCallback((snpName: string) => {
    setFailedSnps(prev => {
      const next = new Set(prev);
      if (next.has(snpName)) next.delete(snpName);
      else next.add(snpName);
      return next;
    });
  }, []);

  const resetFailedSnps = useCallback(() => {
    setFailedSnps(new Set());
  }, []);

  // ── Corridor DC ───────────────────────────────────────────────
  const setCorridorDcLevel = useCallback((corridorIndex: number, dcLevel: number) => {
    setCorridorDcLevels(prev => {
      const next = [...prev];
      next[corridorIndex] = Math.max(1, Math.min(16, Math.round(dcLevel)));
      return next;
    });
  }, []);

  const resetCorridorDcLevels = useCallback(() => {
    setCorridorDcLevels([...DEFAULT_CORRIDOR_DC_LEVELS]);
  }, []);

  // ── Beam HS ───────────────────────────────────────────────────
  const toggleBeamHs = useCallback((beamIndex: number) => {
    setBeamHsStatus(prev => {
      const next = [...prev];
      next[beamIndex] = !next[beamIndex];
      return next;
    });
  }, []);

  const resetBeamHs = useCallback(() => {
    setBeamHsStatus(Array(TOTAL_BEAMS).fill(false));
  }, []);

  // Derived: Set of HS beam indices
  const hsBeamsSet = useMemo(
    () => new Set(beamHsStatus.map((hs, i) => hs ? i : -1).filter(i => i >= 0)),
    [beamHsStatus]
  );

  return (
    <SimulationContext.Provider
      value={{
        coveragePolicy,
        setCoveragePolicy,
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

        corridorDcLevels,
        setCorridorDcLevel,
        resetCorridorDcLevels,

        beamHsStatus,
        toggleBeamHs,
        resetBeamHs,
        hsBeamsSet,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};
