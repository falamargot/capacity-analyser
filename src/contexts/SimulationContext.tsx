/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';
import { type CoveragePolicy } from '../utils/leoFootprint';
import {
  type WeatherCondition,
  type BeamHealthData,
  DEFAULT_BEAM_HEALTH,
  WEATHER_LABELS,
  WEATHER_ATTENUATION_DB,
} from '../utils/realisticSimulation';

// Re-export so consumers import from a single place
export type { WeatherCondition };

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
  getBeamHealthFactor: (beamIndex: number) => number;
}

const SimulationContext = createContext<SimulationContextType>({
  coveragePolicy:       { type: 'DB_THRESHOLD', thresholdDb: -10 },
  setCoveragePolicy:    () => {},
  weatherCondition:     'CLEAR',
  setWeatherCondition:  () => {},
  weatherLabel:         'Clear Sky',
  weatherAttenuationDb: 0,
  beamHealthFactors:    DEFAULT_BEAM_HEALTH,
  setBeamHealthFactor:  () => {},
  resetBeamHealth:      () => {},
  getBeamHealthFactor:  () => 1.0,
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

  const [coveragePolicy, setCoveragePolicy] = useState<CoveragePolicy>(getInitialPolicy);
  const [weatherCondition, setWeatherCondition] = useState<WeatherCondition>('CLEAR');
  const [beamHealthFactors, setBeamHealthFactors] = useState<BeamHealthData[]>(
    () => DEFAULT_BEAM_HEALTH.map(b => ({ ...b }))
  );

  const weatherLabel         = WEATHER_LABELS[weatherCondition];
  const weatherAttenuationDb = WEATHER_ATTENUATION_DB[weatherCondition];

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
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};
