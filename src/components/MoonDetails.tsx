import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, CircleDashed, MapPin, Orbit } from 'lucide-react';
import { JulianDate } from 'cesium';
import { formatCoordinates } from '../utils/formatters';
import { getMoonSnapshot, MOON_MEAN_RADIUS_KM } from '../utils/moonInfo';

interface MoonDetailsProps {
  compactDesktop?: boolean;
  externalHeader?: boolean;
}

const formatNumber = (value: number, maximumFractionDigits = 0) => (
  value.toLocaleString(undefined, { maximumFractionDigits })
);

const MoonDetails: React.FC<MoonDetailsProps> = ({
  compactDesktop = false,
  externalHeader = false,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const snapshot = useMemo(() => getMoonSnapshot(JulianDate.fromDate(new Date(nowMs))), [nowMs]);
  const illuminatedPercent = Math.round(snapshot.illuminatedFraction * 100);
  const containerClassName = externalHeader
    ? 'space-y-4'
    : 'h-full rounded-lg border border-gray-100 bg-white p-4 shadow-lg transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900';

  return (
    <div className={containerClassName}>
      {!externalHeader && (
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Natural Satellite
          </div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-slate-50">Moon</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time lunar ephemeris and illumination relative to Earth.
          </p>
        </div>
      )}

      <div className={`grid gap-3 ${compactDesktop ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <InfoCard
          icon={<Orbit className="h-4 w-4 text-blue-500" />}
          label="Earth Distance"
          value={`${formatNumber(snapshot.distanceFromEarthCenterKm)} km`}
          hint={`${formatNumber(snapshot.distanceFromEarthSurfaceKm)} km surface-to-surface`}
        />
        <InfoCard
          icon={<CircleDashed className="h-4 w-4 text-amber-500" />}
          label="Sunlit Fraction"
          value={`${illuminatedPercent}%`}
          hint={illuminatedPercent >= 98 ? 'Near full phase' : illuminatedPercent <= 2 ? 'Near new phase' : 'Partial phase'}
        />
        <InfoCard
          icon={<MapPin className="h-4 w-4 text-slate-500" />}
          label="Sub-Earth Point"
          value={snapshot.subEarthLatitudeDeg != null && snapshot.subEarthLongitudeDeg != null
            ? formatCoordinates({ lat: snapshot.subEarthLatitudeDeg, lng: snapshot.subEarthLongitudeDeg })
            : 'Unavailable'}
          hint="Longitude/latitude in Earth-fixed frame"
        />
        <InfoCard
          icon={<Calendar className="h-4 w-4 text-fuchsia-500" />}
          label="Physical Radius"
          value={`${formatNumber(MOON_MEAN_RADIUS_KM, 1)} km`}
          hint={JulianDate.toDate(snapshot.time).toUTCString()}
        />
      </div>
    </div>
  );
};

function InfoCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/82 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
        {hint}
      </div>
    </div>
  );
}

export default React.memo(MoonDetails);
