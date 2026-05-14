import React, { useState } from 'react';
import { ChevronDown, Settings, SlidersHorizontal } from 'lucide-react';
import { useSimulation } from '../../contexts/SimulationContext';
import { SatelliteScope } from '../SatelliteScopeFilter';
import {
  coverageModeToPolicy,
  getCoverageModeDescription,
  getCoverageModeFromPolicy,
  getCoverageModeLabel,
  type CoverageMode,
} from '../../utils/coverageMode';

interface SimulationSettingsProps {
  satelliteScope: SatelliteScope;
}

const COVERAGE_MODES: CoverageMode[] = ['MAX_COVERAGE', 'BALANCED', 'HIGH_QUALITY'];

const SimulationSettings: React.FC<SimulationSettingsProps> = ({ satelliteScope }) => {
  const {
    coveragePolicy,
    setCoveragePolicy,
    showInactiveSatellites,
    setShowInactiveSatellites,
  } = useSimulation();
  const [isOpen, setIsOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const selectedMode = getCoverageModeFromPolicy(coveragePolicy);
  const currentThreshold = coveragePolicy.type === 'DB_THRESHOLD' ? coveragePolicy.thresholdDb : -10;
  const showCoverageSettings = satelliteScope !== 'GEO';

  const handleCoverageModeChange = (mode: CoverageMode) => {
    setCoveragePolicy(coverageModeToPolicy(mode));
  };

  const handleAdvancedThresholdChange = (value: string) => {
    setCoveragePolicy({ type: 'DB_THRESHOLD', thresholdDb: Number(value) });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
        title="Simulation settings"
        aria-label="Open simulation settings"
      >
        <Settings className="h-4 w-4" />
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-[22rem] max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-50">
          <div className="p-4">
            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={showInactiveSatellites}
                  onChange={(event) => setShowInactiveSatellites(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600 focus:ring-blue-500 dark:border-slate-600"
                />
                <span>
                  <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
                    Show inactive satellites
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Include non-operational satellites.
                  </span>
                </span>
              </label>
            </div>

            {showCoverageSettings && (
              <>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Coverage Mode
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    LEO beam geometry is fixed. Controls eligibility strictness.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {COVERAGE_MODES.map((mode) => {
                    const isSelected = selectedMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleCoverageModeChange(mode)}
                        className={`min-h-10 rounded-md border px-2 py-2 text-center text-[11px] font-semibold leading-4 transition-colors ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        {getCoverageModeLabel(mode)}
                        {mode === 'BALANCED' && (
                          <span className={`mt-0.5 block text-[9px] uppercase tracking-wide ${isSelected ? 'text-blue-100' : 'text-blue-600 dark:text-blue-300'}`}>
                            Recommended
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
                  <p className="leading-5">
                    {getCoverageModeDescription(selectedMode)}
                  </p>
                </div>

                <div className="mt-3 border-t border-gray-200 pt-3 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setIsAdvancedOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Advanced
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isAdvancedOpen && (
                    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          RF eligibility threshold
                        </label>
                        <span className="font-mono text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {currentThreshold} dB
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="-3"
                        step="1"
                        value={currentThreshold}
                        onChange={(event) => handleAdvancedThresholdChange(event.target.value)}
                        className="mt-3 w-full accent-blue-600"
                        aria-label="RF eligibility threshold"
                      />
                      <div className="mt-1 flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
                        <span>Weaker edge</span>
                        <span>Stricter cutoff</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-400">
                        This does not resize beams; it changes the service eligibility cutoff used by the simulation.
                      </p>
                    </div>
                  )}
                  </div>
                </>
              )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationSettings;
