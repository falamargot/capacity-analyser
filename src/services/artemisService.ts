import { Cartesian3, JulianDate, Simon1994PlanetaryPositions } from 'cesium';

export const OFFICIAL_ARTEMIS_TRACKER_URL = 'https://www.nasa.gov/missions/artemis-ii/arow/';
export const DEFAULT_ARTEMIS_TELEMETRY_ENDPOINT = '/api/artemis/telemetry';
export const ARTEMIS_II_LAUNCH_TIME_UTC = '2026-04-01T22:35:00Z';
export const ARTEMIS_II_ESTIMATED_DURATION_MS = 10 * 24 * 60 * 60 * 1000;
export const DEFAULT_ARTEMIS_TRACKER_POLL_INTERVAL_MS = 5 * 60 * 1000;

export type ArtemisMissionPhase = 'prelaunch' | 'live' | 'complete';
export type ArtemisTrackerPositionFrame = 'geodetic' | 'earth-fixed-cartesian' | 'earth-centered-inertial';

export interface ArtemisTrackerPosition {
  frame: ArtemisTrackerPositionFrame;
  lat?: number;
  lng?: number;
  altKm?: number;
  xKm?: number;
  yKm?: number;
  zKm?: number;
}

export interface ArtemisTrackerSnapshot {
  sourceName: string;
  trackerUrl: string;
  embedUrl: string;
  retrievedAt: string;
  telemetryTimestamp: string | null;
  missionElapsedSeconds: number | null;
  distanceFromEarthKm: number | null;
  distanceToMoonKm: number | null;
  velocityKmS: number | null;
  statusText: string | null;
  position: ArtemisTrackerPosition | null;
  trajectory: ArtemisTrackerPosition[];
}

export interface ArtemisEphemerisSample {
  timestamp: string;
  xKm: number;
  yKm: number;
  zKm: number;
  vxKmS: number;
  vyKmS: number;
  vzKmS: number;
}

export interface ArtemisTelemetryApiResponse {
  sourceName: string;
  officialTrackerUrl: string;
  ephemerisSourceUrl: string | null;
  fetchedAt: string;
  generatedAt: string;
  lastUpdated: string | null;
  objectName: string | null;
  refFrame: string;
  centerName: string;
  startTime: string | null;
  stopTime: string | null;
  samples: ArtemisEphemerisSample[];
}

type UnknownRecord = Record<string, unknown>;

const MAX_TRAJECTORY_POINTS = 720;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null
);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toStringValue = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

const clampNumber = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
);

const getPositionMagnitudeKm = (sample: Pick<ArtemisEphemerisSample, 'xKm' | 'yKm' | 'zKm'>) => (
  Math.sqrt(sample.xKm ** 2 + sample.yKm ** 2 + sample.zKm ** 2)
);

const getVelocityMagnitudeKmS = (sample: Pick<ArtemisEphemerisSample, 'vxKmS' | 'vyKmS' | 'vzKmS'>) => (
  Math.sqrt(sample.vxKmS ** 2 + sample.vyKmS ** 2 + sample.vzKmS ** 2)
);

const normalizeEphemerisSample = (value: unknown): ArtemisEphemerisSample | null => {
  if (!isRecord(value)) return null;

  const timestamp = toStringValue(value.timestamp) ?? toStringValue(value.time);
  const xKm = toFiniteNumber(value.xKm) ?? toFiniteNumber(value.x);
  const yKm = toFiniteNumber(value.yKm) ?? toFiniteNumber(value.y);
  const zKm = toFiniteNumber(value.zKm) ?? toFiniteNumber(value.z);
  const vxKmS = toFiniteNumber(value.vxKmS) ?? toFiniteNumber(value.vx);
  const vyKmS = toFiniteNumber(value.vyKmS) ?? toFiniteNumber(value.vy);
  const vzKmS = toFiniteNumber(value.vzKmS) ?? toFiniteNumber(value.vz);

  if (!timestamp || xKm == null || yKm == null || zKm == null || vxKmS == null || vyKmS == null || vzKmS == null) {
    return null;
  }

  return { timestamp, xKm, yKm, zKm, vxKmS, vyKmS, vzKmS };
};

const normalizeEphemerisResponse = (value: unknown): ArtemisTelemetryApiResponse | null => {
  if (!isRecord(value) || !Array.isArray(value.samples)) return null;

  const samples = value.samples
    .map((sample) => normalizeEphemerisSample(sample))
    .filter((sample): sample is ArtemisEphemerisSample => sample !== null);

  if (samples.length === 0) return null;

  return {
    sourceName: toStringValue(value.sourceName) ?? 'NASA Artemis II ephemeris',
    officialTrackerUrl: toStringValue(value.officialTrackerUrl) ?? OFFICIAL_ARTEMIS_TRACKER_URL,
    ephemerisSourceUrl: toStringValue(value.ephemerisSourceUrl),
    fetchedAt: toStringValue(value.fetchedAt) ?? new Date().toISOString(),
    generatedAt: toStringValue(value.generatedAt) ?? new Date().toISOString(),
    lastUpdated: toStringValue(value.lastUpdated),
    objectName: toStringValue(value.objectName),
    refFrame: toStringValue(value.refFrame) ?? 'EME2000',
    centerName: toStringValue(value.centerName) ?? 'EARTH',
    startTime: toStringValue(value.startTime),
    stopTime: toStringValue(value.stopTime),
    samples,
  };
};

export const getArtemisTelemetryEndpoint = (): string => {
  const configured = import.meta.env.VITE_ARTEMIS_TRACKER_TELEMETRY_URL ?? import.meta.env.VITE_ARTEMIS_TRACKER_ENDPOINT;
  return typeof configured === 'string' && configured.trim().length > 0
    ? configured.trim()
    : DEFAULT_ARTEMIS_TELEMETRY_ENDPOINT;
};

export const getArtemisMissionPhase = (now = Date.now()): ArtemisMissionPhase => {
  const launchTime = Date.parse(ARTEMIS_II_LAUNCH_TIME_UTC);
  if (now < launchTime) return 'prelaunch';
  if (now <= launchTime + ARTEMIS_II_ESTIMATED_DURATION_MS) return 'live';
  return 'complete';
};

const getSampleTimestampMs = (sample: ArtemisEphemerisSample) => Date.parse(sample.timestamp);

const findSampleWindow = (samples: ArtemisEphemerisSample[], targetMs: number) => {
  let left = 0;
  let right = samples.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midTime = getSampleTimestampMs(samples[mid]);

    if (midTime === targetMs) {
      return { start: samples[mid], end: samples[mid], ratio: 0 };
    }

    if (midTime < targetMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const startIndex = clampNumber(Math.max(0, left - 1), 0, samples.length - 1);
  const endIndex = clampNumber(Math.min(samples.length - 1, left), 0, samples.length - 1);
  const start = samples[startIndex];
  const end = samples[endIndex];

  const startMs = getSampleTimestampMs(start);
  const endMs = getSampleTimestampMs(end);
  const ratio = startMs === endMs ? 0 : clampNumber((targetMs - startMs) / (endMs - startMs), 0, 1);

  return { start, end, ratio };
};

const interpolateSample = (start: ArtemisEphemerisSample, end: ArtemisEphemerisSample, ratio: number, timestampMs: number): ArtemisEphemerisSample => ({
  timestamp: new Date(timestampMs).toISOString(),
  xKm: start.xKm + (end.xKm - start.xKm) * ratio,
  yKm: start.yKm + (end.yKm - start.yKm) * ratio,
  zKm: start.zKm + (end.zKm - start.zKm) * ratio,
  vxKmS: start.vxKmS + (end.vxKmS - start.vxKmS) * ratio,
  vyKmS: start.vyKmS + (end.vyKmS - start.vyKmS) * ratio,
  vzKmS: start.vzKmS + (end.vzKmS - start.vzKmS) * ratio,
});

const buildTrajectory = (samples: ArtemisEphemerisSample[]): ArtemisTrackerPosition[] => {
  const step = Math.max(1, Math.ceil(samples.length / MAX_TRAJECTORY_POINTS));
  const positions = samples
    .filter((_, index) => index % step === 0 || index === samples.length - 1)
    .map((sample) => ({
      frame: 'earth-centered-inertial' as const,
      xKm: sample.xKm,
      yKm: sample.yKm,
      zKm: sample.zKm,
    }));

  return positions;
};

export const buildSnapshotFromEphemeris = (
  response: ArtemisTelemetryApiResponse,
  nowMs = Date.now()
): ArtemisTrackerSnapshot | null => {
  if (response.samples.length === 0) return null;

  const startMs = response.startTime ? Date.parse(response.startTime) : getSampleTimestampMs(response.samples[0]);
  const stopMs = response.stopTime
    ? Date.parse(response.stopTime)
    : getSampleTimestampMs(response.samples[response.samples.length - 1]);
  const effectiveMs = clampNumber(nowMs, startMs, stopMs);
  const { start, end, ratio } = findSampleWindow(response.samples, effectiveMs);
  const currentSample = interpolateSample(start, end, ratio, effectiveMs);

  const julianDate = JulianDate.fromIso8601(currentSample.timestamp);
  const currentPositionMeters = new Cartesian3(
    currentSample.xKm * 1000,
    currentSample.yKm * 1000,
    currentSample.zKm * 1000
  );
  const moonPositionMeters = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
    julianDate,
    new Cartesian3()
  );

  return {
    sourceName: response.sourceName,
    trackerUrl: response.officialTrackerUrl,
    embedUrl: response.officialTrackerUrl,
    retrievedAt: response.generatedAt,
    telemetryTimestamp: currentSample.timestamp,
    missionElapsedSeconds: Math.max(0, Math.floor((effectiveMs - Date.parse(ARTEMIS_II_LAUNCH_TIME_UTC)) / 1000)),
    distanceFromEarthKm: getPositionMagnitudeKm(currentSample),
    distanceToMoonKm: Cartesian3.distance(currentPositionMeters, moonPositionMeters) / 1000,
    velocityKmS: getVelocityMagnitudeKmS(currentSample),
    statusText: response.lastUpdated
      ? `NASA ephemeris active. Last published update: ${response.lastUpdated}.`
      : 'NASA ephemeris active.',
    position: {
      frame: 'earth-centered-inertial',
      xKm: currentSample.xKm,
      yKm: currentSample.yKm,
      zKm: currentSample.zKm,
    },
    trajectory: buildTrajectory(response.samples),
  };
};

export async function fetchArtemisTelemetryData(
  signal?: AbortSignal
): Promise<ArtemisTelemetryApiResponse | null> {
  const endpoint = getArtemisTelemetryEndpoint();
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Artemis telemetry request failed (${response.status})`);
  }

  const json = await response.json();
  return normalizeEphemerisResponse(json);
}
