import React, { useMemo } from 'react';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { Vessel } from '../../modules/maritimeTraffic/maritimeTrafficService';
import type { GeoGatewayData, SNPData } from '../globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import type { MobileAnalysisMetrics, MobileLinkMetrics } from '../../types/analysis';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { formatCoordinates } from '../../utils/formatters';
import { useSimulation } from '../../contexts/SimulationContext';
import {
    deriveSelectedPointStatusPresentation,
    type GeoPointStatus,
    type SelectedPointScope,
    type SelectedPointStatusTone,
} from '../../utils/selectedPointStatus';
import { BACKHAUL_RADIUS_KM } from '../../utils/leoFootprint';
import { GEO_GATEWAYS } from '../globe/GlobeConfig';
import { getAssignedGeoSatellitesForGateway } from '../../utils/geoConnectivityModel';
import type { SNPConnectedSatellite } from '../../services/coverageService';

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
    satelliteScope?: SelectedPointScope;
    geoPointStatus?: GeoPointStatus | null;
    satellites?: SatelliteData[];
    snpConnectedSatellites?: SNPConnectedSatellite[];
}

function formatMbpsFromGbps(gbps: number | null | undefined): string {
    if (gbps == null || !isFinite(gbps)) return '--';
    return `${Math.round(gbps * 1000)} Mbps`;
}

function formatRtt(rtt: number | null | undefined): string {
    if (rtt == null || !isFinite(rtt)) return '--';
    return `${Math.round(rtt)} ms`;
}

function statusToneClass(tone: SelectedPointStatusTone | 'danger' | 'warning' | 'success' | 'neutral') {
    if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200';
    if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200';
    if (tone === 'danger') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200';
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

function MetricCard({
    label,
    metrics,
    accentClassName,
    borderClassName,
}: {
    label: string;
    metrics: MobileLinkMetrics | null | undefined;
    accentClassName: string;
    borderClassName: string;
}) {
    return (
        <div className={`rounded-2xl border bg-white/82 px-3 py-3 shadow-sm dark:bg-slate-900/72 ${borderClassName}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accentClassName}`}>
                        {label}
                    </div>
                    <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        Estimated performance
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        RTT
                    </div>
                    <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                        {formatRtt(metrics?.rtt)}
                    </div>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        Downlink
                    </div>
                    <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                        {formatMbpsFromGbps(metrics?.downlinkGbps)}
                    </div>
                </div>
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                        Uplink
                    </div>
                    <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                        {formatMbpsFromGbps(metrics?.uplinkGbps)}
                    </div>
                </div>
            </div>
        </div>
    );
}

function SummaryStatCard({
    label,
    value,
    hint,
    accentClassName = 'text-slate-500 dark:text-slate-400',
}: {
    label: string;
    value: string;
    hint?: string;
    accentClassName?: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
            <div className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accentClassName}`}>
                {label}
            </div>
            <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                {value}
            </div>
            {hint ? (
                <div className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    {hint}
                </div>
            ) : null}
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
    satelliteScope = 'ALL',
    geoPointStatus = null,
    satellites = [],
    snpConnectedSatellites = [],
}) => {
    const { failedSnps } = useSimulation();
    const selectedPointStatus = useMemo(
        () => deriveSelectedPointStatusPresentation({
            scope: satelliteScope,
            leoServiceViewModel,
            geoStatus: geoPointStatus,
        }),
        [geoPointStatus, leoServiceViewModel, satelliteScope]
    );

    const selectedGatewayAssignments = useMemo(() => {
        if (!selectedGateway) return null;
        return getAssignedGeoSatellitesForGateway(selectedGateway, satellites, GEO_GATEWAYS);
    }, [selectedGateway, satellites]);

    const summary = useMemo(() => {
        if (selectedGateway) {
            return {
                eyebrow: 'Gateway',
                title: selectedGateway.name,
                subtitle: `${selectedGateway.region} teleport`,
                status: 'GEO routing view',
                statusTone: 'neutral' as const,
            };
        }

        if (inspectedSNP) {
            return {
                eyebrow: 'SNP',
                title: inspectedSNP.name,
                subtitle: `${inspectedSNP.region} service node`,
                status: 'LEO backhaul focus',
                statusTone: 'neutral' as const,
            };
        }

        if (selectedVessel) {
            return {
                eyebrow: 'Vessel',
                title: selectedVessel.name || selectedVessel.mmsi,
                subtitle: selectedVessel.vesselType.replaceAll('_', ' '),
                status: 'Maritime target',
                statusTone: 'neutral' as const,
            };
        }

        if (selectedAircraft) {
            return {
                eyebrow: 'Aircraft',
                title: selectedAircraft.callsign || selectedAircraft.icao24,
                subtitle: 'Airborne analysis target',
                status: selectedPointStatus.lines.map((line) => line.text).join(' · '),
                statusTone: selectedPointStatus.tone,
            };
        }

        if (selectedSatellite) {
            return {
                eyebrow: selectedSatellite.orbitType,
                title: selectedSatellite.name,
                subtitle: `${selectedSatellite.type} inspection`,
                status: leoServiceViewModel?.primaryReasonLabel ?? 'Selected satellite',
                statusTone: leoServiceViewModel?.finalServiceStatus === 'ALLOWED'
                    ? 'success'
                    : leoServiceViewModel?.finalServiceStatus === 'DEGRADED'
                        ? 'warning'
                        : leoServiceViewModel?.finalServiceStatus === 'BLOCKED'
                            ? 'danger'
                            : 'neutral',
            };
        }

        if (selectedPoint) {
            return {
                eyebrow: selectedPoint.source === 'aircraft' ? 'Air Corridor' : 'Ground Point',
                title: formatCoordinates({ lat: selectedPoint.lat, lng: selectedPoint.lng }),
                subtitle: selectedPoint.altitude
                    ? `Altitude ${selectedPoint.altitude.toFixed(1)} km`
                    : 'Capacity analysis target',
                status: selectedPointStatus.lines.map((line) => line.text).join(' · '),
                statusTone: selectedPointStatus.tone,
            };
        }

        return {
            eyebrow: 'Overview',
            title: autoSelectedLEOSatellite?.name ?? autoSelectedGEOSatellite?.name ?? 'Capacity Analysis',
            subtitle: 'Choose a target on the map to inspect details.',
            status: 'Ready',
            statusTone: 'neutral' as const,
        };
    }, [
        autoSelectedGEOSatellite?.name,
        autoSelectedLEOSatellite?.name,
        geoPointStatus,
        inspectedSNP,
        leoServiceViewModel?.finalServiceStatus,
        leoServiceViewModel?.primaryReasonLabel,
        satelliteScope,
        selectedAircraft,
        selectedGateway,
        selectedPoint,
        selectedPointStatus.lines,
        selectedPointStatus.tone,
        selectedSatellite,
        selectedVessel,
    ]);

    const metricCards = useMemo(() => {
        const cards: Array<{
            key: 'leo' | 'geo';
            label: 'LEO' | 'GEO';
            metrics: MobileLinkMetrics | null | undefined;
            accentClassName: string;
            borderClassName: string;
        }> = [];

        if (metrics?.leo) {
            cards.push({
                key: 'leo',
                label: 'LEO',
                metrics: metrics.leo,
                accentClassName: 'text-fuchsia-600 dark:text-fuchsia-300',
                borderClassName: 'border-fuchsia-200/80 dark:border-fuchsia-400/20',
            });
        }

        if (metrics?.geo) {
            cards.push({
                key: 'geo',
                label: 'GEO',
                metrics: metrics.geo,
                accentClassName: 'text-blue-600 dark:text-blue-300',
                borderClassName: 'border-blue-200/80 dark:border-blue-400/20',
            });
        }

        return cards;
    }, [metrics?.geo, metrics?.leo]);

    const hasMetrics = metricCards.length > 0;
    const entitySummaryCards = useMemo(() => {
        if (selectedSatellite) {
            return [
                {
                    key: 'sat-status',
                    label: 'Status',
                    value: selectedSatellite.opsStatus === 'operational' ? 'Operational' : 'Inactive',
                    hint: `${selectedSatellite.type} · ${selectedSatellite.orbitType}`,
                    accentClassName: selectedSatellite.type === 'EUTELSAT'
                        ? 'text-blue-600 dark:text-blue-300'
                        : 'text-fuchsia-600 dark:text-fuchsia-300',
                },
                {
                    key: 'sat-position',
                    label: 'Live Position',
                    value: formatCoordinates({
                        lat: selectedSatellite.position.lat,
                        lng: selectedSatellite.position.lng,
                    }),
                    hint: `Altitude ${selectedSatellite.position.alt.toFixed(0)} km`,
                },
                {
                    key: 'sat-capacity',
                    label: 'Capacity',
                    value: `${selectedSatellite.capacity.maxThroughput.toLocaleString()} Gbps`,
                    hint: selectedSatellite.type === 'ONEWEB'
                        ? `Beam est. ${selectedSatellite.capacity.simulatedEffectiveBeamCapacityMbps ?? '--'} Mbps`
                        : `Availability ${(selectedSatellite.capacity.availability * 100).toFixed(2)}%`,
                },
            ];
        }

        if (inspectedSNP) {
            const avgElevation = snpConnectedSatellites.length > 0
                ? snpConnectedSatellites.reduce((sum, entry) => sum + entry.elevation, 0) / snpConnectedSatellites.length
                : null;
            const latencyRange = snpConnectedSatellites.length > 0
                ? `${Math.round(Math.min(...snpConnectedSatellites.map((entry) => entry.latencyMs)))}-${Math.round(Math.max(...snpConnectedSatellites.map((entry) => entry.latencyMs)))} ms`
                : 'None';

            return [
                {
                    key: 'snp-status',
                    label: 'Status',
                    value: failedSnps.has(inspectedSNP.name) ? 'Failed' : 'Operational',
                    hint: `${inspectedSNP.region} ground node`,
                    accentClassName: failedSnps.has(inspectedSNP.name)
                        ? 'text-rose-600 dark:text-rose-300'
                        : 'text-amber-600 dark:text-amber-300',
                },
                {
                    key: 'snp-links',
                    label: 'Connected LEO',
                    value: `${snpConnectedSatellites.length} satellites`,
                    hint: avgElevation != null ? `Avg elevation ${avgElevation.toFixed(1)}°` : 'No active visibility',
                },
                {
                    key: 'snp-backhaul',
                    label: 'Backhaul',
                    value: `${BACKHAUL_RADIUS_KM.toLocaleString()} km`,
                    hint: `Latency range ${latencyRange}`,
                },
            ];
        }

        if (selectedGateway && selectedGatewayAssignments) {
            const totalAssigned = selectedGatewayAssignments.primary.length + selectedGatewayAssignments.backup.length;
            return [
                {
                    key: 'gw-region',
                    label: 'Gateway',
                    value: selectedGateway.region,
                    hint: selectedGateway.gateway_id,
                    accentClassName: 'text-cyan-600 dark:text-cyan-300',
                },
                {
                    key: 'gw-primary',
                    label: 'Primary GEO',
                    value: `${selectedGatewayAssignments.primary.length} satellites`,
                    hint: `Backup ${selectedGatewayAssignments.backup.length}`,
                },
                {
                    key: 'gw-total',
                    label: 'Assigned GEO',
                    value: `${totalAssigned} satellites`,
                    hint: formatCoordinates({ lat: selectedGateway.lat, lng: selectedGateway.lng }),
                },
            ];
        }

        return [];
    }, [
        failedSnps,
        inspectedSNP,
        selectedGateway,
        selectedGatewayAssignments,
        selectedSatellite,
        snpConnectedSatellites,
    ]);
    const hasEntitySummary = entitySummaryCards.length > 0;
    const emptyStateMessage = useMemo(() => {
        if (selectedPoint || selectedAircraft) {
            if (satelliteScope === 'LEO') {
                return 'No LEO estimated performance is available for this target.';
            }
            if (satelliteScope === 'GEO') {
                return 'No GEO estimated performance is available for this target.';
            }
            return 'No LEO or GEO estimated performance is available for this target.';
        }

        return 'Selection details will appear here when they are available.';
    }, [satelliteScope, selectedAircraft, selectedPoint]);

    const statusClassName = statusToneClass(summary.statusTone);

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

            {hasEntitySummary ? (
                <div className="mt-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        Selection Summary
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {entitySummaryCards.map((card) => (
                            <SummaryStatCard
                                key={card.key}
                                label={card.label}
                                value={card.value}
                                hint={card.hint}
                                accentClassName={card.accentClassName}
                            />
                        ))}
                    </div>
                </div>
            ) : hasMetrics ? (
                <div className="mt-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        Estimated Performance
                    </div>
                    <div className={`grid gap-2 ${metricCards.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {metricCards.map((card) => (
                            <MetricCard
                                key={card.key}
                                label={card.label}
                                metrics={card.metrics}
                                accentClassName={card.accentClassName}
                                borderClassName={card.borderClassName}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-2.5 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-300">
                    {emptyStateMessage}
                </div>
            )}
        </div>
    );
};

export default React.memo(MobileAnalysisSummary);
