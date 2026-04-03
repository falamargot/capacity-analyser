import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARTEMIS_II_ESTIMATED_DURATION_MS,
  ARTEMIS_II_LAUNCH_TIME_UTC,
  DEFAULT_ARTEMIS_TRACKER_POLL_INTERVAL_MS,
  buildSnapshotFromEphemeris,
  fetchArtemisTelemetryData,
  getArtemisMissionPhase,
  getArtemisTelemetryEndpoint,
  OFFICIAL_ARTEMIS_TRACKER_URL,
  type ArtemisMissionPhase,
  type ArtemisTelemetryApiResponse,
} from '../services/artemisService';

interface ArtemisTrackerState {
  ephemeris: ArtemisTelemetryApiResponse | null;
  isLoading: boolean;
  error: string | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
}

export function useArtemisTracker(enabled: boolean) {
  const telemetryEndpoint = useMemo(() => getArtemisTelemetryEndpoint(), []);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [state, setState] = useState<ArtemisTrackerState>({
    ephemeris: null,
    isLoading: false,
    error: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
  });

  const refresh = useCallback(async () => {
    if (!enabled || !telemetryEndpoint) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    setState((current) => ({
      ...current,
      isLoading: true,
      error: null,
      lastAttemptAt: Date.now(),
    }));

    try {
      const ephemeris = await fetchArtemisTelemetryData(controller.signal);
      setState((current) => ({
        ...current,
        ephemeris,
        isLoading: false,
        error: ephemeris ? null : 'No Artemis ephemeris data returned',
        lastSuccessAt: ephemeris ? Date.now() : current.lastSuccessAt,
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh Artemis tracking',
      }));
    } finally {
      window.clearTimeout(timeout);
    }
  }, [enabled, telemetryEndpoint]);

  useEffect(() => {
    if (!enabled) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    refresh();
    refreshIntervalRef.current = setInterval(refresh, DEFAULT_ARTEMIS_TRACKER_POLL_INTERVAL_MS);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const missionPhase: ArtemisMissionPhase = getArtemisMissionPhase(nowMs);
  const snapshot = useMemo(
    () => (state.ephemeris ? buildSnapshotFromEphemeris(state.ephemeris, nowMs) : null),
    [nowMs, state.ephemeris]
  );

  return {
    ephemeris: state.ephemeris,
    snapshot,
    isLoading: state.isLoading,
    error: state.error,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    telemetryEndpoint,
    missionPhase,
    launchTimeUtc: ARTEMIS_II_LAUNCH_TIME_UTC,
    estimatedMissionDurationMs: ARTEMIS_II_ESTIMATED_DURATION_MS,
    officialTrackerUrl: state.ephemeris?.officialTrackerUrl ?? OFFICIAL_ARTEMIS_TRACKER_URL,
    embedUrl: state.ephemeris?.officialTrackerUrl ?? OFFICIAL_ARTEMIS_TRACKER_URL,
    telemetryAvailable: !!snapshot?.position,
    refresh,
  };
}
