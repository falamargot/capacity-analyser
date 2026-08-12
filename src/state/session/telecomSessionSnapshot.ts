import type { SatelliteScope } from '../../components/SatelliteScopeFilter';
import type { Selection } from '../../types/analysis';
import type { ConnectivityScenario } from '../../types/connectivityScenario';
import type { EngineeringScenarioState } from '../scenario/useScenarioState';

export const TELECOM_SESSION_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = 'capacity-analyzer:telecom-session:v1';

export interface SerializableCartesian3 {
  x: number;
  y: number;
  z: number;
}

export interface TelecomCameraSnapshot {
  position: SerializableCartesian3;
  direction: SerializableCartesian3;
  up: SerializableCartesian3;
  viewportHeight: number;
}

export interface TelecomSessionSnapshotV1 {
  schemaVersion: typeof TELECOM_SESSION_SCHEMA_VERSION;
  engineeringScenario: EngineeringScenarioState;
  connectivityScenario: ConnectivityScenario;
  selection: Selection;
  siteB: { lat: number; lng: number; altitude?: number } | null;
  navigation: {
    satelliteScope: SatelliteScope;
    activeConnectivityTab: 'LEO' | 'GEO';
    commercialSelectedSegment: string;
  };
  geoCoverageSelection: {
    selectedUplinkKey: string | null;
    selectedDownlinkKey: string | null;
    selectedUplinkKeyB: string | null;
    selectedDownlinkKeyB: string | null;
    manualVisibility: { satelliteId: string | null; keys: string[] };
  };
  labels: {
    siteA: { city: string; country: string } | null;
    siteB: { city: string; country: string } | null;
  };
  camera: TelecomCameraSnapshot | null;
}

let memorySnapshot: TelecomSessionSnapshotV1 | null = null;

function isFiniteCartesian(value: unknown): value is SerializableCartesian3 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SerializableCartesian3>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z);
}

function isFiniteSiteB(value: unknown): value is TelecomSessionSnapshotV1['siteB'] {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<{ lat: number; lng: number; altitude?: number }>;
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return false;
  if (candidate.altitude !== undefined && !Number.isFinite(candidate.altitude)) return false;
  return true;
}

function isSnapshot(value: unknown): value is TelecomSessionSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TelecomSessionSnapshotV1>;
  if (candidate.schemaVersion !== TELECOM_SESSION_SCHEMA_VERSION) return false;
  if (!candidate.engineeringScenario || !candidate.connectivityScenario || !candidate.navigation) return false;
  if (!candidate.geoCoverageSelection || !candidate.labels || !candidate.selection) return false;
  if (!isFiniteSiteB(candidate.siteB)) return false;
  if (candidate.camera && (
    !isFiniteCartesian(candidate.camera.position)
    || !isFiniteCartesian(candidate.camera.direction)
    || !isFiniteCartesian(candidate.camera.up)
    || !Number.isFinite(candidate.camera.viewportHeight)
  )) return false;
  return true;
}

function cloneSnapshot(snapshot: TelecomSessionSnapshotV1): TelecomSessionSnapshotV1 {
  return JSON.parse(JSON.stringify(snapshot)) as TelecomSessionSnapshotV1;
}

export function writeTelecomSessionSnapshot(snapshot: TelecomSessionSnapshotV1): void {
  const copy = cloneSnapshot(snapshot);
  memorySnapshot = copy;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch {
    // Module memory still preserves the in-app round trip when storage is denied.
  }
}

export function readTelecomSessionSnapshot(): TelecomSessionSnapshotV1 | null {
  if (memorySnapshot) return cloneSnapshot(memorySnapshot);
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return null;
    memorySnapshot = parsed;
    return cloneSnapshot(parsed);
  } catch {
    return null;
  }
}

export function clearTelecomSessionSnapshot(): void {
  memorySnapshot = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}
