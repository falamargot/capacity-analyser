import React, { useMemo } from 'react';
import { useSecondTick } from '../../hooks/useSecondTick';
import {
    formatActiveScenarioUtcTime,
    type ActiveScenarioGeoContext,
    type ActiveScenarioLeoContext,
    type ActiveScenarioPathStatus,
} from '../../utils/activeScenarioContextModel';
import { useSimulationClock, useSimulationClockSnapshot } from '../../contexts/SimulationClockContext';

interface ActiveScenarioContextProps {
    geo: ActiveScenarioGeoContext | null;
    leo: ActiveScenarioLeoContext | null;
    isPhone?: boolean;
    isFullscreen?: boolean;
    onTimeToggle?: () => void;
    onSatelliteFocus?: (satelliteName: string) => void;
    onGeoCoverageFocus?: (direction: 'uplink' | 'downlink') => void;
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

const SatelliteFocusName = ({
    name,
    technology,
    onFocus,
}: {
    name: string;
    technology: 'GEO' | 'LEO';
    onFocus?: (satelliteName: string) => void;
}) => {
    if (!onFocus) {
        return <span title={name}>{name}</span>;
    }

    return (
        <button
            type="button"
            onClick={() => onFocus(name)}
            className="pointer-events-auto rounded-sm text-left transition-colors hover:text-cyan-200 hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            aria-label={`Focus ${technology} satellite ${name}`}
            title={`Center the globe on ${name}`}
        >
            {name}
        </button>
    );
};

const GeoCoverageFocusName = ({
    direction,
    name,
    onFocus,
}: {
    direction: 'uplink' | 'downlink';
    name: string;
    onFocus?: (direction: 'uplink' | 'downlink') => void;
}) => {
    const directionLabel = direction === 'uplink' ? 'Uplink' : 'Downlink';
    const content = (
        <>
            <strong className="font-semibold text-slate-400">
                {direction === 'uplink' ? 'UL' : 'DL'}
            </strong>{' '}
            {name}
        </>
    );

    if (!onFocus) {
        return <span className="min-w-0 truncate" title={`${directionLabel}: ${name}`}>{content}</span>;
    }

    return (
        <button
            type="button"
            onClick={() => onFocus(direction)}
            className="pointer-events-auto min-w-0 truncate rounded-sm text-left transition-colors hover:text-cyan-200 hover:underline hover:underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            aria-label={`Focus GEO ${direction} coverage ${name}`}
            title={`Center the globe on ${direction} coverage ${name}`}
        >
            {content}
        </button>
    );
};

const ActiveScenarioContext: React.FC<ActiveScenarioContextProps> = ({
    geo,
    leo,
    isPhone = false,
    isFullscreen = false,
    onTimeToggle,
    onSatelliteFocus,
    onGeoCoverageFocus,
}) => {
    const simulationClock = useSimulationClock();
    const simulationClockSnapshot = useSimulationClockSnapshot();
    const tick = useSecondTick();
    // Sampled on the one-second tick, never during render — see MoonDetails.
    const scenarioTimeMs = useMemo(
        () => simulationClock.getTimeMs(),
        // Cadence keys, not values read by the callback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [simulationClock, simulationClockSnapshot.revision, tick],
    );
    const scenarioDate = useMemo(
        () => new Date(scenarioTimeMs),
        [scenarioTimeMs],
    );
    const utcTime = useMemo(() => formatActiveScenarioUtcTime(scenarioDate), [scenarioDate]);

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
            <button
                type="button"
                onClick={onTimeToggle}
                className="pointer-events-auto block rounded-sm text-left text-slate-300 transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                aria-label="Toggle scenario time controls"
                title="Open or close scenario time controls"
            >
                <time
                    className="block whitespace-nowrap text-[9px] font-medium tabular-nums tracking-[0.08em] text-inherit"
                    dateTime={scenarioDate.toISOString()}
                >
                    {utcTime}
                </time>
            </button>

            {(geo || leo) && (
                <div className="mt-1.5 space-y-1.5 border-t border-white/10 pt-1.5">
                    {geo && (
                        <section aria-label="GEO active scenario" className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                                <StatusDot status={geo.status} />
                                <TechnologyLabel technology="GEO" />
                                {geo.status === 'resolved' && geo.satelliteName ? (
                                    <span className="truncate text-[10px] font-semibold text-slate-100">
                                        <SatelliteFocusName
                                            name={geo.satelliteName}
                                            technology="GEO"
                                            onFocus={onSatelliteFocus}
                                        />
                                    </span>
                                ) : geo.status !== 'resolved' ? (
                                    <Placeholder status={geo.status} />
                                ) : null}
                            </div>
                            {geo.status === 'resolved' && (geo.uplinkCoverage || geo.downlinkCoverage) && (
                                <div className="mt-1 flex min-w-0 flex-wrap gap-x-2.5 gap-y-0.5 pl-[2.65rem] text-[9px] leading-3 text-slate-300">
                                    {geo.uplinkCoverage && (
                                        <GeoCoverageFocusName
                                            direction="uplink"
                                            name={geo.uplinkCoverage}
                                            onFocus={onGeoCoverageFocus}
                                        />
                                    )}
                                    {geo.downlinkCoverage && (
                                        <GeoCoverageFocusName
                                            direction="downlink"
                                            name={geo.downlinkCoverage}
                                            onFocus={onGeoCoverageFocus}
                                        />
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
                                        className="flex min-w-0 items-center gap-1 truncate text-[10px] font-semibold text-slate-100"
                                        title={leo.satelliteNames?.join(' · ')}
                                    >
                                        {leo.satelliteNames?.map((satelliteName, index) => (
                                            <React.Fragment key={satelliteName}>
                                                {index > 0 && <span aria-hidden="true"> · </span>}
                                                <SatelliteFocusName
                                                    name={satelliteName}
                                                    technology="LEO"
                                                    onFocus={onSatelliteFocus}
                                                />
                                            </React.Fragment>
                                        ))}
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
