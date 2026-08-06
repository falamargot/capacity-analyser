import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CalendarClock, ChevronDown, RotateCcw, Settings, SlidersHorizontal } from 'lucide-react';
import { useSimulation } from '../../contexts/SimulationContext';
import { useSimulationClock, useSimulationClockSnapshot } from '../../contexts/SimulationClockContext';
import { SatelliteScope } from '../SatelliteScopeFilter';
import {
  coverageModeToPolicy,
  getCoverageModeDescription,
  getCoverageModeFromPolicy,
  getCoverageModeLabel,
  type CoverageMode,
} from '../../utils/coverageMode';
import {
  formatSimulationSpeed,
  simulationSpeedToSliderPosition,
  sliderPositionToSimulationSpeed,
  SPEED_SLIDER_MAX,
  SPEED_SLIDER_MIN,
} from '../../time/simulationSpeedScale';
import {
  formatSimulationTimeInput,
  formatSimulationTimeReadout,
  parseSimulationTimeInput,
  type SimulationTimeInputValue,
} from '../../time/simulationTimeInput';

interface SimulationSettingsProps {
  satelliteScope: SatelliteScope;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const COVERAGE_MODES: CoverageMode[] = ['MAX_COVERAGE', 'BALANCED', 'HIGH_QUALITY'];

const SimulationSettings: React.FC<SimulationSettingsProps> = ({
  satelliteScope,
  open: controlledOpen,
  onOpenChange,
}) => {
  const simulationClock = useSimulationClock();
  const simulationClockSnapshot = useSimulationClockSnapshot();
  const panelId = useId();
  const timelineHeadingId = `${panelId}-timeline-heading`;
  const {
    coveragePolicy,
    setCoveragePolicy,
    showInactiveSatellites,
    setShowInactiveSatellites,
  } = useSimulation();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [displayedTimeMs, setDisplayedTimeMs] = useState(() => simulationClock.getTimeMs());
  const [timeDraft, setTimeDraft] = useState<SimulationTimeInputValue>(() => (
    formatSimulationTimeInput(simulationClock.getTimeMs())
  ));
  const [timeInputError, setTimeInputError] = useState<string | null>(null);
  const [speedSliderPosition, setSpeedSliderPosition] = useState(() => (
    simulationSpeedToSliderPosition(simulationClockSnapshot.speed)
  ));
  /**
   * Slider position selected but not yet handed to the clock, or null when the
   * thumb agrees with the authoritative speed.
   *
   * A ref rather than state so `commitSpeedSlider` never depends on a React
   * flush having happened between the last `input` event and `pointerup`.
   */
  const pendingSpeedPositionRef = useRef<number | null>(null);
  const [hasPendingSpeed, setHasPendingSpeed] = useState(false);

  const selectedMode = getCoverageModeFromPolicy(coveragePolicy);
  const currentThreshold = coveragePolicy.type === 'DB_THRESHOLD' ? coveragePolicy.thresholdDb : -10;
  const showCoverageSettings = satelliteScope !== 'GEO';
  const isLive = simulationClockSnapshot.mode === 'live';
  const speedLabel = formatSimulationSpeed(simulationClockSnapshot.speed);
  const selectedSliderSpeed = sliderPositionToSimulationSpeed(speedSliderPosition);

  useEffect(() => {
    const updateDisplayedTime = () => setDisplayedTimeMs(simulationClock.getTimeMs());
    updateDisplayedTime();
    if (!isOpen) return;

    const interval = window.setInterval(updateDisplayedTime, 1_000);
    return () => window.clearInterval(interval);
  }, [isOpen, simulationClock, simulationClockSnapshot.revision]);

  useEffect(() => {
    if (pendingSpeedPositionRef.current === null) {
      setSpeedSliderPosition(simulationSpeedToSliderPosition(simulationClockSnapshot.speed));
    }
  }, [simulationClockSnapshot.speed]);

  /**
   * Moves the thumb only. The clock is NOT touched here.
   *
   * A range input emits one event per step, so a single drag across this slider
   * produces up to 200 of them. Each clock command bumps the timeline revision,
   * and every revision recycles the SGP4 worker and re-uploads the whole satrec
   * cache (~240 KB) — pushing per event turned one drag into hundreds of worker
   * restarts. The rate is handed over once, on release.
   */
  const handleSpeedSliderChange = (position: number) => {
    // Snap the central area to one of the three meaningful detents so the
    // thumb, label and committed rate can never disagree.
    const snapped = simulationSpeedToSliderPosition(sliderPositionToSimulationSpeed(position));
    pendingSpeedPositionRef.current = snapped;
    setSpeedSliderPosition(snapped);
    setHasPendingSpeed(true);
  };

  /** Hands the selected rate to the clock — exactly one command per interaction. */
  const commitSpeedSlider = useCallback(() => {
    const pendingPosition = pendingSpeedPositionRef.current;
    if (pendingPosition === null) return;
    pendingSpeedPositionRef.current = null;
    setHasPendingSpeed(false);

    // setSpeed is a no-op when the rate is unchanged, so releasing without
    // having moved the thumb costs no revision.
    simulationClock.setSpeed(sliderPositionToSimulationSpeed(pendingPosition));
    setSpeedSliderPosition(simulationSpeedToSliderPosition(simulationClock.getSnapshot().speed));
    setDisplayedTimeMs(simulationClock.getTimeMs());
  }, [simulationClock]);

  const handleToggleOpen = () => {
    if (!isOpen) {
      const currentTimeMs = simulationClock.getTimeMs();
      setDisplayedTimeMs(currentTimeMs);
      setTimeDraft(formatSimulationTimeInput(currentTimeMs));
      setTimeInputError(null);
    }
    const nextOpen = !isOpen;
    if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const handleApplyDateTime = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const timestampMs = parseSimulationTimeInput(timeDraft.date, timeDraft.time);
    if (timestampMs === null) {
      setTimeInputError('Enter a valid UTC date and time.');
      return;
    }

    simulationClock.setDateTime(timestampMs);
    pendingSpeedPositionRef.current = null;
    setHasPendingSpeed(false);
    setSpeedSliderPosition(simulationSpeedToSliderPosition(1));
    setDisplayedTimeMs(timestampMs);
    setTimeInputError(null);
  };

  const handleResetToLive = () => {
    simulationClock.resetToLive();
    pendingSpeedPositionRef.current = null;
    setHasPendingSpeed(false);
    setSpeedSliderPosition(simulationSpeedToSliderPosition(1));
    const currentTimeMs = simulationClock.getTimeMs();
    setDisplayedTimeMs(currentTimeMs);
    setTimeDraft(formatSimulationTimeInput(currentTimeMs));
    setTimeInputError(null);
  };

  const handleCoverageModeChange = (mode: CoverageMode) => {
    setCoveragePolicy(coverageModeToPolicy(mode));
  };

  const handleAdvancedThresholdChange = (value: string) => {
    setCoveragePolicy({ type: 'DB_THRESHOLD', thresholdDb: Number(value) });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggleOpen}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
          isLive
            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700'
            : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-950/70 dark:text-blue-200 dark:hover:bg-blue-900/70'
        }`}
        title="Simulation settings"
        aria-label={`Open simulation settings. ${isLive ? 'Live time' : `Simulation ${speedLabel}`}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <Settings className="h-4 w-4" />
        <span className="text-[10px] font-bold tabular-nums tracking-wide">
          {isLive ? 'LIVE' : speedLabel}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="ui-global-popover absolute top-full right-0 mt-1 w-[24rem] max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="p-4">
            <section aria-labelledby={timelineHeadingId} className="mb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={timelineHeadingId} className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    Scenario time
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Satellite positions and connectivity use this UTC timeline.
                  </p>
                </div>
                <span role="status" className={`rounded-full px-2 py-1 text-[10px] font-bold tracking-[0.12em] ${
                  isLive
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300'
                }`}>
                  {isLive ? 'LIVE' : 'SIMULATION'}
                </span>
              </div>

              <output
                aria-label="Displayed scenario time"
                className="mt-3 block rounded-md border border-gray-200 bg-slate-950 px-3 py-2 font-mono text-sm font-semibold tabular-nums text-cyan-300 dark:border-slate-700"
              >
                {formatSimulationTimeReadout(displayedTimeMs)}
              </output>

              <form onSubmit={handleApplyDateTime} className="mt-3">
                <div className="grid grid-cols-[1fr_0.85fr_auto] items-end gap-2">
                  <label className="min-w-0 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                    UTC date
                    <input
                      type="date"
                      value={timeDraft.date}
                      onChange={(event) => setTimeDraft((value) => ({ ...value, date: event.target.value }))}
                      className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                    />
                  </label>
                  <label className="min-w-0 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                    UTC time
                    <input
                      type="time"
                      step="1"
                      value={timeDraft.time}
                      onChange={(event) => setTimeDraft((value) => ({ ...value, time: event.target.value }))}
                      className="mt-1 h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                    />
                  </label>
                  <button
                    type="submit"
                    className="h-9 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  >
                    Apply
                  </button>
                </div>
                {timeInputError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                    {timeInputError}
                  </p>
                )}
              </form>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                    Playback speed
                  </span>
                  <output
                    className={`min-w-14 text-right font-mono text-xs font-bold tabular-nums ${
                      hasPendingSpeed
                        ? 'text-amber-600 dark:text-amber-300'
                        : 'text-blue-600 dark:text-blue-300'
                    }`}
                    title={hasPendingSpeed ? 'Release to apply this playback rate' : undefined}
                  >
                    {formatSimulationSpeed(selectedSliderSpeed)}
                    {hasPendingSpeed && <span aria-hidden="true"> …</span>}
                  </output>
                </div>
                <div className="relative mt-1.5">
                  <input
                    type="range"
                    min={SPEED_SLIDER_MIN}
                    max={SPEED_SLIDER_MAX}
                    step="1"
                    value={speedSliderPosition}
                    aria-label="Exponential playback speed"
                    aria-valuetext={formatSimulationSpeed(selectedSliderSpeed)}
                    onChange={(event) => handleSpeedSliderChange(Number(event.target.value))}
                    onPointerUp={commitSpeedSlider}
                    onPointerCancel={commitSpeedSlider}
                    onBlur={commitSpeedSlider}
                    onKeyUp={(event) => {
                      if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                        commitSpeedSlider();
                      }
                    }}
                    className="relative z-10 h-2 w-full cursor-ew-resize accent-blue-600"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-slate-600 dark:bg-slate-300"
                  />
                </div>
                <div aria-hidden="true" className="relative mt-1 h-4 text-[9px] font-bold tabular-nums text-gray-500 dark:text-gray-400">
                  <span className="absolute left-0">−100×</span>
                  <span className="absolute left-[40%] -translate-x-1/2">−1×</span>
                  <span className="absolute left-1/2 -translate-x-1/2 rounded bg-gray-200 px-1 py-0.5 text-[8px] uppercase tracking-wide text-gray-700 dark:bg-slate-700 dark:text-gray-200">
                    Pause
                  </span>
                  <span className="absolute left-[60%] -translate-x-1/2">1×</span>
                  <span className="absolute right-0">100×</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetToLive}
                disabled={isLive}
                className={`mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                  isLive
                    ? 'cursor-not-allowed border-gray-300 bg-gray-100 text-gray-400 opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-500'
                    : 'border-emerald-600 bg-emerald-600 text-white shadow-sm hover:border-emerald-700 hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Return to current time
              </button>
            </section>

            <div className="mb-4 border-t border-gray-200 dark:border-slate-700" />

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
                    LEO Coverage Mode
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    Beam geometry is fixed. Controls eligibility strictness.
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
