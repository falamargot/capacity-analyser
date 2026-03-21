import React, { useMemo } from 'react';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { Vessel } from '../../modules/maritimeTraffic/maritimeTrafficService';
import type { GeoGatewayData, SNPData } from '../globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import type { MobileAnalysisMetrics, MobileLinkMetrics } from '../../types/analysis';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { formatCoordinates } from '../../utils/formatters';

interface MobileSelectedPoint {
    lat: number;
    lng: number;
    altitude?: number;
    source?: 'earth' | 'aircraft';
    aircraftCallsign?: string;
}

interface MobileAnalysisSummaryProps {
    autoSelectedLEOSatellite: SatelliteData | null;
    autoSelectedGEOSatellite: SatelliteData | null;
    selectedSatellite: SatelliteData | null;
    selectedPoint?: MobileSelectedPoint | null;
    selectedAircraft?: Aircraft | null;
    selectedGateway?: GeoGatewayData | null;
    inspectedSNP?: SNPData | null;
    selectedVessel?: Vessel | null;
    compact?: boolean;
    metrics?: MobileAnalysisMetrics;
    leoServiceViewModel?: LeoConnectivityViewModel | null;
}

function formatMbpsFromGbps(gbps: number | null | undefined): string {
    if (gbps == null || !isFinite(gbps)) return '--';
    return `${Math.round(gbps * 1000)} Mbps`;
}

function compactMetric(metrics: MobileLinkMetrics | null | undefined): string {
    if (!metrics) return 'DL -- / UL --';
    return `DL ${formatMbpsFromGbps(metrics.downlinkGbps)} / UL ${formatMbpsFromGbps(metrics.uplinkGbps)}`;
}

function statusToneClass(status?: LeoConnectivityViewModel['finalServiceStatus']) {
    if (status === 'ALLOWED') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200';
    if (status === 'DEGRADED') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200';
    if (status === 'BLOCKED') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200';
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function MetricCard({
    label,
    value,
    accentClassName,
}: {
    label: string;
    value: string;
    accentClassName: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
            <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accentClassName}`}>
                {label}
            </div>
            <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                {value}
            </div>
        </div>
    );
}

const MobileAnalysisSummary: React.FC<MobileAnalysisSummaryProps> = ({
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    selectedPoint = null,
    selectedAircraft = null,
    selectedGateway = null,
    inspectedSNP = null,
    selectedVessel = null,
    compact = false,
    metrics,
    leoServiceViewModel = null,
}) => {
    const summary = useMemo(() => {
        if (selectedGateway) {
            return {
                eyebrow: 'Gateway',
                title: selectedGateway.name,
                subtitle: `${selectedGateway.region} teleport`,
                status: 'GEO routing view',
            };
        }

        if (inspectedSNP) {
            return {
                eyebrow: 'SNP',
                title: inspectedSNP.name,
                subtitle: `${inspectedSNP.region} service node`,
                status: 'LEO backhaul focus',
            };
        }

        if (selectedVessel) {
            return {
                eyebrow: 'Vessel',
                title: selectedVessel.name || selectedVessel.mmsi,
                subtitle: selectedVessel.vesselType.replaceAll('_', ' '),
                status: 'Maritime target',
            };
        }

        if (selectedAircraft) {
            return {
                eyebrow: 'Aircraft',
                title: selectedAircraft.callsign || selectedAircraft.icao24,
                subtitle: 'Airborne analysis target',
                status: leoServiceViewModel?.primaryReasonLabel ?? 'Live traffic target',
            };
        }

        if (selectedSatellite) {
            return {
                eyebrow: selectedSatellite.orbitType,
                title: selectedSatellite.name,
                subtitle: `${selectedSatellite.type} inspection`,
                status: leoServiceViewModel?.primaryReasonLabel ?? 'Selected satellite',
            };
        }

        if (selectedPoint) {
            return {
                eyebrow: selectedPoint.source === 'aircraft' ? 'Air Corridor' : 'Ground Point',
                title: formatCoordinates({ lat: selectedPoint.lat, lng: selectedPoint.lng }),
                subtitle: selectedPoint.altitude
                    ? `Altitude ${selectedPoint.altitude.toFixed(1)} km`
                    : 'Capacity analysis target',
                status: leoServiceViewModel?.primaryReasonLabel ?? 'Selected target',
            };
        }

        return {
            eyebrow: 'Overview',
            title: autoSelectedLEOSatellite?.name ?? autoSelectedGEOSatellite?.name ?? 'Capacity Analysis',
            subtitle: 'Choose a target on the map to inspect details.',
            status: 'Ready',
        };
    }, [
        autoSelectedGEOSatellite?.name,
        autoSelectedLEOSatellite?.name,
        inspectedSNP,
        leoServiceViewModel?.primaryReasonLabel,
        selectedAircraft,
        selectedGateway,
        selectedPoint,
        selectedSatellite,
        selectedVessel,
    ]);

    const hasMetrics = !!(
        metrics
        && (
            metrics.leo
            || metrics.geo
            || metrics.totalGbps > 0
            || metrics.coveredCount > 0
        )
    );

    const statusClassName = statusToneClass(leoServiceViewModel?.finalServiceStatus);

    return (
        <div className={compact ? 'rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-3.5 py-3 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(15,23,42,0.84))]' : 'rounded-3xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {summary.eyebrow}
                    </div>
                    <div className="mt-1 truncate text-[22px] font-semibold leading-7 text-slate-950 dark:text-slate-50">
                        {summary.title}
                    </div>
                    <div className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                        {summary.subtitle}
                    </div>
                </div>

                <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName}`}>
                    {summary.status}
                </div>
            </div>

            {hasMetrics ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <MetricCard
                        label="LEO"
                        value={compactMetric(metrics?.leo)}
                        accentClassName="text-fuchsia-600 dark:text-fuchsia-300"
                    />
                    <MetricCard
                        label="GEO"
                        value={compactMetric(metrics?.geo)}
                        accentClassName="text-blue-600 dark:text-blue-300"
                    />
                    <div className="col-span-2 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                Total throughput
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {formatMbpsFromGbps(metrics?.totalGbps)}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                Covered sats
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {metrics?.coveredCount ?? '--'}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-2.5 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-300">
                    The detailed analysis stays below. The map stays clean until you need the deeper technical view.
                </div>
            )}
        </div>
    );
};

export default React.memo(MobileAnalysisSummary);
