import React, { useMemo } from 'react';
import { Navigation, RefreshCw, Target, Telescope } from 'lucide-react';
import type { IssPosition, IssOrbitPath } from '../modules/iss/issService';
import type { IssFreshness } from '../modules/iss/useIssLiveTracking';

interface SelectedLocation {
  lat: number;
  lng: number;
}

interface IssDetailsProps {
  position: IssPosition | null;
  orbitPath: IssOrbitPath | null;
  freshness: IssFreshness;
  isFollowing: boolean;
  error: string | null;
  isLoading: boolean;
  selectedLocation?: SelectedLocation | null;
  onCenterOnIss: () => void;
  onToggleFollow: () => void;
  onRefresh: () => void;
  compactDesktop?: boolean;
  externalHeader?: boolean;
}

function formatCoord(value: number, pos: 'lat' | 'lng'): string {
  const abs = Math.abs(value);
  const dir = pos === 'lat' ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${abs.toFixed(4)}° ${dir}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeElevation(
  userLat: number,
  userLng: number,
  issLat: number,
  issLng: number,
  issAltKm: number,
): number {
  const groundDist = haversineKm(userLat, userLng, issLat, issLng);
  return Math.atan2(issAltKm, groundDist) * (180 / Math.PI);
}

const FreshnessIndicator: React.FC<{ freshness: IssFreshness }> = ({ freshness }) => {
  const styles: Record<IssFreshness, string> = {
    live: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    stale: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    offline: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  };
  const label: Record<IssFreshness, string> = {
    live: '● Live',
    stale: '◐ Stale',
    offline: '○ Offline',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[freshness]}`}>
      {label[freshness]}
    </span>
  );
};

const DataRow: React.FC<{ label: string; value: React.ReactNode; muted?: boolean }> = ({
  label,
  value,
  muted,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
    <span
      className={`text-right text-[13px] font-semibold tabular-nums ${
        muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {value}
    </span>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
    {children}
  </div>
);

const Divider: React.FC = () => (
  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
);

const IssDetails: React.FC<IssDetailsProps> = ({
  position,
  freshness,
  isFollowing,
  error,
  isLoading,
  selectedLocation,
  onCenterOnIss,
  onToggleFollow,
  onRefresh,
  compactDesktop = false,
}) => {
  const distanceKm = useMemo(() => {
    if (!selectedLocation || !position) return null;
    return haversineKm(selectedLocation.lat, selectedLocation.lng, position.lat, position.lng);
  }, [selectedLocation, position]);

  const elevationDeg = useMemo(() => {
    if (!selectedLocation || !position) return null;
    return computeElevation(
      selectedLocation.lat,
      selectedLocation.lng,
      position.lat,
      position.lng,
      position.altKm,
    );
  }, [selectedLocation, position]);

  const btnBase =
    'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-colors';
  const btnPrimary = `${btnBase} border-cyan-300/60 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/15`;
  const btnSecondary = `${btnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800`;
  const btnFollowActive = `${btnBase} border-cyan-400/70 bg-cyan-500 text-white hover:bg-cyan-600 dark:bg-cyan-600 dark:hover:bg-cyan-700`;

  if (error && !position) {
    return (
      <div className={compactDesktop ? 'px-1 py-2' : 'px-1.5 py-3'}>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/20 dark:bg-red-500/8">
          <p className="text-[13px] text-red-700 dark:text-red-300">
            <strong>ISS data unavailable.</strong> {error}
          </p>
          <button onClick={onRefresh} className="mt-2 text-[12px] font-semibold text-red-600 hover:underline dark:text-red-400">
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!position) {
    return (
      <div className={`${compactDesktop ? 'px-1 py-2' : 'px-1.5 py-3'} space-y-2`}>
        <div className="flex animate-pulse flex-col gap-2">
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          {isLoading ? 'Fetching ISS position…' : 'Position unavailable'}
        </p>
      </div>
    );
  }

  return (
    <div className={compactDesktop ? 'px-1 py-1' : 'px-1.5 py-1.5'}>
      {/* Actions */}
      <div className="flex gap-2 mb-3">
        <button onClick={onCenterOnIss} className={`flex-1 ${btnPrimary}`}>
          <Target className="h-4 w-4" />
          Center
        </button>
        <button onClick={onToggleFollow} className={`flex-1 ${isFollowing ? btnFollowActive : btnSecondary}`}>
          <Navigation className={`h-4 w-4 ${isFollowing ? 'animate-pulse' : ''}`} />
          {isFollowing ? 'Following' : 'Follow ISS'}
        </button>
        <button
          onClick={onRefresh}
          className={`${btnSecondary} aspect-square px-2.5`}
          title="Refresh TLE data"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Freshness + timestamp */}
      <div className="flex items-center justify-between mb-2">
        <FreshnessIndicator freshness={freshness} />
        <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
          {formatTimestamp(position.timestamp)}
        </span>
      </div>

      {error && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/8 dark:text-amber-300">
          {error}
        </div>
      )}

      <Divider />

      {/* Live telemetry */}
      <SectionTitle>Live Telemetry</SectionTitle>
      <DataRow label="Latitude" value={formatCoord(position.lat, 'lat')} />
      <DataRow label="Longitude" value={formatCoord(position.lng, 'lng')} />
      <DataRow label="Altitude" value={`${position.altKm.toFixed(1)} km`} />
      <DataRow label="Velocity" value={`${(position.velocityKmS * 3600).toFixed(0)} km/h`} />

      <Divider />

      {/* Orbital parameters */}
      <SectionTitle>Orbital Parameters</SectionTitle>
      <DataRow label="NORAD ID" value="25544" />
      <DataRow label="Orbit type" value="LEO" />
      <DataRow label="Inclination" value="~51.6°" />
      <DataRow label="Period" value="~92 min" />
      <DataRow label="Orbits / day" value="~15.5" />

      {/* From selected location */}
      {selectedLocation && (
        <>
          <Divider />
          <SectionTitle>
            <span className="flex items-center gap-1">
              <Telescope className="h-3 w-3" />
              From selected location
            </span>
          </SectionTitle>
          {distanceKm != null && (
            <DataRow
              label="Distance"
              value={
                distanceKm > 1000
                  ? `${(distanceKm / 1000).toFixed(2)} × 10³ km`
                  : `${distanceKm.toFixed(0)} km`
              }
            />
          )}
          {elevationDeg != null && (
            <DataRow
              label="Elevation"
              value={
                elevationDeg < 0
                  ? 'Below horizon'
                  : `${elevationDeg.toFixed(1)}°`
              }
              muted={elevationDeg < 0}
            />
          )}
          {elevationDeg != null && (
            <DataRow
              label="Visibility"
              value={
                elevationDeg > 10
                  ? 'Potentially visible'
                  : elevationDeg > 0
                    ? 'Low on horizon'
                    : 'Below horizon'
              }
              muted={elevationDeg <= 0}
            />
          )}
        </>
      )}
    </div>
  );
};

export default IssDetails;
