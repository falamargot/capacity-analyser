import type { CoveragePolicy } from '../utils/leoFootprint';
import type { BeamHealthData, WeatherCondition } from '../utils/realisticSimulation';

export interface SimulationStateSnapshot {
  coveragePolicy: CoveragePolicy;
  thresholdDb?: number;
  weatherCondition: WeatherCondition;
  beamHealthByIndex: ReadonlyMap<number, number>;
  hsBeams: ReadonlySet<number>;
}

interface BuildSimulationStateSnapshotArgs {
  coveragePolicy: CoveragePolicy;
  weatherCondition: WeatherCondition;
  beamHealthFactors: readonly BeamHealthData[];
  hsBeams: ReadonlySet<number>;
}

export function buildSimulationStateSnapshot({
  coveragePolicy,
  weatherCondition,
  beamHealthFactors,
  hsBeams,
}: BuildSimulationStateSnapshotArgs): SimulationStateSnapshot {
  return {
    coveragePolicy,
    thresholdDb: coveragePolicy.type === 'DB_THRESHOLD' ? coveragePolicy.thresholdDb : undefined,
    weatherCondition,
    beamHealthByIndex: new Map(
      beamHealthFactors.map((beam) => [beam.beamIndex, beam.healthFactor] as const)
    ),
    hsBeams,
  };
}
