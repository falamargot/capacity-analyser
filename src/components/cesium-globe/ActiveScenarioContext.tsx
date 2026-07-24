import React, { useMemo } from 'react';
import { useSecondTick } from '../../hooks/useSecondTick';
import {
    formatActiveScenarioUtcTime,
    type ActiveScenarioGeoContext,
    type ActiveScenarioLeoContext,
    type ActiveScenarioPathStatus,
} from '../../utils/activeScenarioContextModel';

interface ActiveScenarioContextProps {
    geo: ActiveScenarioGeoContext | null;
    leo: ActiveScenarioLeoContext | null;
    isPhone?: boolean;
    isFullscreen?: boolean;
}

const placeholderLabel: Record<Exclude<ActiveScenarioPathStatus, 'resolved'>, string> = {
    'no-service-path': 'No service path',
    'no-rf-path': 'No RF path',
};

const StatusDot = ({ status }: { status: ActiveScenarioPathStatus }) => (
    <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            status === 'resolved'
                ? 'bg-emerald-400'
                : status === 'no-rf-path'
                    ? 'bg-rose-400'
                    : 'bg-amber-400'
        }`}
        aria-hidden="true"
    />
);

const TechnologyLabel = ({ technology }: { technology: 'GEO' | 'LEO' }) => (
    <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.16em] text-sky-200/90">
        {technology}
    </span>
);

const Placeholder = ({ status }: { status: Exclude<ActiveScenarioPathStatus, 'resolved'> }) => (
    <span className="truncate text-[10px] font-medium text-slate-300">
        {placeholderLabel[status]}
    </span>
);

const ActiveScenarioContext: React.FC<ActiveScenarioContextProps> = ({
    geo,
    leo,
    isPhone = false,
    isFullscreen = false,
}) => {
    const tick = useSecondTick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const utcTime = useMemo(() => formatActiveScenarioUtcTime(new Date()), [tick]);

    return (
        <aside
            className={`pointer-events-none absolute left-2 z-[36] max-w-[min(22rem,calc(100vw-1rem))] rounded-lg border border-white/10 bg-slate-950/45 text-white shadow-sm backdrop-blur-md ${
                isPhone
                    ? `${isFullscreen
                        ? 'top-[calc(env(safe-area-inset-top)+0.5rem)]'
                        : 'top-[calc(env(safe-area-inset-top)+4.25rem)]'} px-2.5 py-2`
                    : 'top-2 px-3 py-2.5'
            }`}
            aria-label="Active scenario context"
        >
            <time
                className="block whitespace-nowrap text-[9px] font-medium tabular-nums tracking-[0.08em] text-slate-300"
                dateTime={new Date().toISOString()}
            >
                {utcTime}
            </time>

            {(geo || leo) && (
                <div className="mt-1.5 space-y-1.5 border-t border-white/10 pt-1.5">
                    {geo && (
                        <section aria-label="GEO active scenario" className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <StatusDot status={geo.status} />
                                <TechnologyLabel technology="GEO" />
                                {geo.status === 'resolved' ? (
                                    <span className="truncate text-[10px] font-semibold text-slate-100" title={geo.satelliteName}>
                                        {geo.satelliteName}
                                    </span>
                                ) : (
                                    <Placeholder status={geo.status} />
                                )}
                            </div>
                            {geo.status === 'resolved' && (geo.uplinkCoverage || geo.downlinkCoverage) && (
                                <div className="mt-1 flex min-w-0 flex-wrap gap-x-2.5 gap-y-0.5 pl-[2.65rem] text-[9px] leading-3 text-slate-300">
                                    {geo.uplinkCoverage && (
                                        <span className="min-w-0 truncate" title={`Uplink: ${geo.uplinkCoverage}`}>
                                            <strong className="font-semibold text-slate-400">UL</strong> {geo.uplinkCoverage}
                                        </span>
                                    )}
                                    {geo.downlinkCoverage && (
                                        <span className="min-w-0 truncate" title={`Downlink: ${geo.downlinkCoverage}`}>
                                            <strong className="font-semibold text-slate-400">DL</strong> {geo.downlinkCoverage}
                                        </span>
                                    )}
                                </div>
                            )}
                        </section>
                    )}

                    {leo && (
                        <section aria-label="LEO active scenario" className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <StatusDot status={leo.status} />
                                <TechnologyLabel technology="LEO" />
                                {leo.status === 'resolved' ? (
                                    <span
                                        className="truncate text-[10px] font-semibold text-slate-100"
                                        title={leo.satelliteNames?.join(' · ')}
                                    >
                                        {leo.satelliteNames?.join(' · ')}
                                    </span>
                                ) : (
                                    <Placeholder status={leo.status} />
                                )}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </aside>
    );
};

export default React.memo(ActiveScenarioContext);
