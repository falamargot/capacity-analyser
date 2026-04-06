import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, ExternalLink, Orbit, Rocket } from 'lucide-react';
import type { ArtemisMissionPhase, ArtemisTrackerSnapshot } from '../../services/artemisService';

interface ArtemisTrackerCardProps {
  visible: boolean;
  missionPhase: ArtemisMissionPhase;
  launchTimeUtc: string;
  estimatedMissionDurationMs: number;
  officialTrackerUrl: string;
  telemetryEndpoint: string | null;
  telemetryAvailable: boolean;
  snapshot: ArtemisTrackerSnapshot | null;
  isLoading: boolean;
  error: string | null;
  onFocusArtemis?: () => void;
  isPhone?: boolean;
  isFullscreen?: boolean;
  hasSatelliteIndicator?: boolean;
}

const formatDistance = (value: number | null) => (
  value == null ? 'Unavailable' : `${Math.round(value).toLocaleString('en-US')} km`
);

const formatVelocity = (value: number | null) => (
  value == null ? 'Unavailable' : `${value.toFixed(2)} km/s`
);

const formatMissionElapsed = (seconds: number | null, phase: ArtemisMissionPhase, nowMs: number, launchMs: number) => {
  const effectiveSeconds = seconds ?? (phase === 'live' ? Math.max(0, Math.floor((nowMs - launchMs) / 1000)) : null);
  if (effectiveSeconds == null) return phase === 'prelaunch' ? 'Pending launch' : 'Unavailable';

  const days = Math.floor(effectiveSeconds / 86400);
  const hours = Math.floor((effectiveSeconds % 86400) / 3600);
  const minutes = Math.floor((effectiveSeconds % 3600) / 60);
  const secs = effectiveSeconds % 60;

  const prefix = days > 0 ? `${days}d ` : '';
  return `${prefix}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const missionPhaseCopy: Record<ArtemisMissionPhase, { badge: string; title: string; body: string }> = {
  prelaunch: {
    badge: 'Prelaunch',
    title: 'Orion is not yet in flight',
    body: 'This panel will switch to live mission tracking once Artemis II has launched.',
  },
  live: {
    badge: 'Live',
    title: 'Tracking Artemis II around the Moon',
    body: 'Follow Orion in real time through NASA’s official Artemis Real-time Orbit Website.',
  },
  complete: {
    badge: 'Completed',
    title: 'Artemis II mission window has ended',
    body: 'The live mission window is over, but the official NASA tracker remains the reference source.',
  },
};

const ArtemisTrackerCard: React.FC<ArtemisTrackerCardProps> = ({
  visible,
  missionPhase,
  launchTimeUtc,
  estimatedMissionDurationMs,
  officialTrackerUrl,
  telemetryEndpoint,
  telemetryAvailable,
  snapshot,
  isLoading,
  error,
  onFocusArtemis,
  isPhone = false,
  isFullscreen = false,
  hasSatelliteIndicator = false,
}) => {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (!visible) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [visible]);

  const launchMs = Date.parse(launchTimeUtc);
  const missionWindowEnd = launchMs + estimatedMissionDurationMs;
  const copy = missionPhaseCopy[missionPhase];
  const positionClassName = hasSatelliteIndicator
    ? (isPhone
        ? (isFullscreen
            ? 'left-2 top-[calc(env(safe-area-inset-top)+7.2rem)]'
            : 'left-2 top-[calc(env(safe-area-inset-top)+12.1rem)]')
        : 'left-2 top-36')
    : isPhone
      ? (isFullscreen
          ? 'left-2 top-[calc(env(safe-area-inset-top)+4.8rem)]'
          : 'left-2 top-[calc(env(safe-area-inset-top)+9.75rem)]')
      : 'left-2 top-24';

  const metaRows = useMemo(() => ([
    {
      label: 'Mission elapsed',
      value: formatMissionElapsed(snapshot?.missionElapsedSeconds ?? null, missionPhase, nowMs, launchMs),
      icon: <Clock3 className="h-3.5 w-3.5" />,
    },
    {
      label: 'Distance to Earth',
      value: formatDistance(snapshot?.distanceFromEarthKm ?? null),
      icon: <Orbit className="h-3.5 w-3.5" />,
    },
    {
      label: 'Distance to Moon',
      value: formatDistance(snapshot?.distanceToMoonKm ?? null),
      icon: <Orbit className="h-3.5 w-3.5" />,
    },
    {
      label: 'Velocity',
      value: formatVelocity(snapshot?.velocityKmS ?? null),
      icon: <Rocket className="h-3.5 w-3.5" />,
    },
  ]), [launchMs, missionPhase, nowMs, snapshot?.distanceFromEarthKm, snapshot?.distanceToMoonKm, snapshot?.missionElapsedSeconds, snapshot?.velocityKmS]);

  if (!visible || (isPhone && isFullscreen)) {
    return null;
  }

  return (
    <div className={`pointer-events-none absolute z-[1200] max-w-[calc(100vw-1rem)] ${positionClassName}`}>
      <div className={`pointer-events-auto ${isPhone ? 'w-[min(22rem,calc(100vw-1rem))]' : 'w-[22rem]'} overflow-hidden rounded-[20px] border border-orange-300/40 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(17,24,39,0.8))] shadow-[0_24px_60px_-34px_rgba(15,23,42,0.86)] ring-1 ring-orange-400/18 backdrop-blur-xl`}>
        <div className="border-b border-white/8 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-400/14 text-orange-200">
                  <Rocket className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">Artemis II</div>
                  <div className="text-[11px] text-slate-300">Official NASA live mission tracker</div>
                </div>
              </div>
            </div>
            <span className="rounded-full border border-orange-300/30 bg-orange-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-100">
              {copy.badge}
            </span>
          </div>
          <div className="mt-3 text-sm font-semibold text-orange-50">{copy.title}</div>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            {metaRows.map((row) => (
              <div key={row.label} className="rounded-2xl border border-white/7 bg-white/5 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  {row.icon}
                  {row.label}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{row.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/7 bg-white/5 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Phase 1 status</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">
                  {telemetryAvailable ? 'Native marker active in globe' : 'Using official NASA tracker fallback'}
                </div>
              </div>
              {isLoading && (
                <span className="rounded-full bg-sky-400/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                  Refreshing
                </span>
              )}
            </div>

            <div className="mt-2 text-xs leading-5 text-slate-300">
              {snapshot?.statusText
                ?? (telemetryEndpoint
                  ? 'An optional telemetry endpoint is configured for native rendering when data is available.'
                  : 'No native telemetry endpoint is configured yet, so this Phase 1 panel points to NASA’s official live tracker.' )}
            </div>

            {error && (
              <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-xs text-amber-100">
                Native telemetry refresh failed. The official NASA tracker remains available. Error: {error}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={officialTrackerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-orange-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open NASA AROW
            </a>
            {telemetryAvailable && onFocusArtemis && (
              <button
                type="button"
                onClick={onFocusArtemis}
                className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-400/16"
              >
                <Orbit className="h-3.5 w-3.5" />
                Focus Orion
              </button>
            )}
          </div>

          <div className="text-[11px] leading-5 text-slate-400">
            Launch: {new Date(launchMs).toUTCString()}
            <br />
            Mission window end: {new Date(missionWindowEnd).toUTCString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ArtemisTrackerCard);
