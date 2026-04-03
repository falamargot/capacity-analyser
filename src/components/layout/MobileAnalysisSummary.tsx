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
import { getMoonSnapshot, MOON_MEAN_RADIUS_KM } from '../../utils/moonInfo';
import { JulianDate } from 'cesium';

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
    selectedMoon?: boolean;
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

function CompactInfoPill({
    label,
    value,
    hint,
    accentClassName,
    surfaceClassName,
}: {
    label: string;
    value: string;
    hint?: string;
    accentClassName?: string;
    surfaceClassName?: string;
}) {
    return (
        <div className={`min-w-[8.5rem] max-w-[12rem] rounded-[18px] border px-3 py-2 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.9)] backdrop-blur-xl ${surfaceClassName ?? 'border-slate-200/80 bg-white/82 dark:border-slate-700 dark:bg-slate-900/72'}`}>
            <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                {label}
            </div>
            <div className={`mt-1 truncate whitespace-nowrap text-right text-[12px] font-semibold leading-[1.1] ${accentClassName ?? 'text-slate-900 dark:text-slate-100'}`}>
                {value}
            </div>
            {hint ? (
                <div className="mt-1 text-right text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

function MetricCard({
    label,
    metrics,
    accentClassName,
    borderClassName,
    compact = false,
}: {
    label: string;
    metrics: MobileLinkMetrics | null | undefined;
    accentClassName: string;
    borderClassName: string;
    compact?: boolean;
}) {
    if (compact) {
        return (
            <div className={`border bg-white/82 shadow-sm dark:bg-slate-900/72 rounded-[20px] px-3 py-2.5 ${borderClassName}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3">
                    <div className="min-w-0">
                        <div className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${accentClassName}`}>
                            {label}
                        </div>
                    </div>
                    <div className="flex items-baseline justify-end gap-2 text-right whitespace-nowrap">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            RTT
                        </div>
                        <div className="text-[12px] font-semibold leading-4 text-slate-900 dark:text-slate-100">
                            {formatRtt(metrics?.rtt)}
                        </div>
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-2">
                        <div className="rounded-[14px] bg-slate-100/70 px-2.5 py-2 dark:bg-slate-800/55">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                Downlink
                            </div>
                            <div className="mt-1 text-[12px] font-semibold leading-4 text-slate-900 dark:text-slate-100">
                                {formatMbpsFromGbps(metrics?.downlinkGbps)}
                            </div>
                        </div>
                        <div className="rounded-[14px] bg-slate-100/70 px-2.5 py-2 dark:bg-slate-800/55">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                Uplink
                            </div>
                            <div className="mt-1 text-[12px] font-semibold leading-4 text-slate-900 dark:text-slate-100">
                                {formatMbpsFromGbps(metrics?.uplinkGbps)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`border bg-white/82 shadow-sm dark:bg-slate-900/72 ${compact ? 'rounded-[20px] px-3 py-2.5' : 'rounded-2xl px-3 py-3'} ${borderClassName}`}>
            <div className={`items-start ${compact ? 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2' : 'flex justify-between gap-3'}`}>
                <div className="min-w-0">
                    <div className={`${compact ? 'text-[10px] tracking-[0.2em]' : 'text-[11px] tracking-[0.18em]'} font-semibold uppercase ${accentClassName}`}>
                        {label}
                    </div>
                </div>
                <div className="flex items-baseline justify-end gap-2 text-right whitespace-nowrap">
                    <div className={`${compact ? 'text-[9px] tracking-[0.2em]' : 'text-[10px] tracking-[0.18em]'} font-semibold uppercase text-slate-400 dark:text-slate-500`}>
                        RTT
                    </div>
                    <div className={`${compact ? 'text-[12px] leading-4' : 'text-[13px] leading-5'} font-semibold text-slate-900 dark:text-slate-100`}>
                        {formatRtt(metrics?.rtt)}
                    </div>
                </div>
            </div>
            <div className={`grid grid-cols-2 ${compact ? 'mt-2.5 gap-2' : 'mt-3 gap-3'}`}>
                <div>
                    <div className={`${compact ? 'text-[9px] tracking-[0.18em]' : 'text-[10px] tracking-[0.16em]'} font-semibold uppercase text-slate-400 dark:text-slate-500`}>
                        Downlink
                    </div>
                    <div className={`${compact ? 'mt-0.5 text-[12px] leading-4' : 'mt-1 text-[13px] leading-5'} font-semibold text-slate-900 dark:text-slate-100`}>
                        {formatMbpsFromGbps(metrics?.downlinkGbps)}
                    </div>
                </div>
                <div>
                    <div className={`${compact ? 'text-[9px] tracking-[0.18em]' : 'text-[10px] tracking-[0.16em]'} font-semibold uppercase text-slate-400 dark:text-slate-500`}>
                        Uplink
                    </div>
                    <div className={`${compact ? 'mt-0.5 text-[12px] leading-4' : 'mt-1 text-[13px] leading-5'} font-semibold text-slate-900 dark:text-slate-100`}>
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
    compact = false,
}: {
    label: string;
    value: string;
    hint?: string;
    accentClassName?: string;
    compact?: boolean;
}) {
    return (
        <div className={`border border-slate-200/80 bg-white/82 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 ${compact ? 'rounded-[20px] px-3 py-2.5' : 'rounded-2xl px-3 py-3'}`}>
            <div className={`${compact ? 'text-[9px] tracking-[0.18em]' : 'text-[10px] tracking-[0.16em]'} font-semibold uppercase ${accentClassName}`}>
                {label}
            </div>
            <div className={`${compact ? 'mt-0.5 text-[12px] leading-4' : 'mt-1 text-[13px] leading-5'} font-semibold text-slate-900 dark:text-slate-100`}>
                {value}
            </div>
            {hint ? (
                <div className={`${compact ? 'mt-0.5 text-[10px] leading-4' : 'mt-1 text-[11px] leading-4'} text-slate-500 dark:text-slate-400`}>
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

const MobileAnalysisSummary: React.FC<MobileAnalysisSummaryProps> = ({
    selectedSatellite,
    selectedMoon = false,
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
    const moonSnapshot = useMemo(
        () => (selectedMoon ? getMoonSnapshot(JulianDate.now()) : null),
        [selectedMoon]
    );

    const summary = useMemo(() => {
        if (selectedMoon) {
            return {
                eyebrow: 'Celestial Body',
                title: 'Moon',
                subtitle: 'Real-time lunar ephemeris',
                status: 'Selected object',
                statusTone: 'neutral' as const,
            };
        }

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
                subtitle: null,
                status: leoServiceViewModel?.primaryReasonLabel ?? null,
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
                    : null,
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
        inspectedSNP,
        leoServiceViewModel?.finalServiceStatus,
        leoServiceViewModel?.primaryReasonLabel,
        selectedMoon,
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
    const isCompactCoordinateSummary = compact && !!selectedPoint;
    const isCompactSatelliteSummary = compact && !!selectedSatellite;
    const compactSatellitePosition = useMemo(() => {
        if (!compact || !selectedSatellite) return null;
        return {
            label: 'Live Position',
            value: formatCoordinates({
                lat: selectedSatellite.position.lat,
                lng: selectedSatellite.position.lng,
            }),
            hint: `Altitude ${selectedSatellite.position.alt.toFixed(0)} km`,
            accentClassName: selectedSatellite.type === 'EUTELSAT'
                ? 'text-blue-700 dark:text-blue-200'
                : 'text-fuchsia-700 dark:text-fuchsia-200',
            surfaceClassName: selectedSatellite.type === 'EUTELSAT'
                ? 'border-blue-200/80 bg-[linear-gradient(135deg,rgba(59,130,246,0.14),rgba(255,255,255,0.82))] dark:border-blue-400/25 dark:bg-[linear-gradient(135deg,rgba(59,130,246,0.18),rgba(15,23,42,0.72))]'
                : 'border-fuchsia-200/80 bg-[linear-gradient(135deg,rgba(217,70,239,0.14),rgba(255,255,255,0.82))] dark:border-fuchsia-400/25 dark:bg-[linear-gradient(135deg,rgba(217,70,239,0.18),rgba(15,23,42,0.72))]',
        };
    }, [compact, selectedSatellite]);
    const entitySummaryCards = useMemo(() => {
        if (selectedSatellite) {
            const cards = [
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

            return compact ? cards.filter((card) => card.key !== 'sat-position') : cards;
        }

        if (selectedMoon && moonSnapshot) {
            return [
                {
                    key: 'moon-distance',
                    label: 'Earth Distance',
                    value: `${Math.round(moonSnapshot.distanceFromEarthCenterKm).toLocaleString()} km`,
                    hint: `${Math.round(moonSnapshot.distanceFromEarthSurfaceKm).toLocaleString()} km surface-to-surface`,
                    accentClassName: 'text-slate-700 dark:text-slate-200',
                },
                {
                    key: 'moon-sunlit',
                    label: 'Sunlit Fraction',
                    value: `${Math.round(moonSnapshot.illuminatedFraction * 100)}%`,
                    hint: 'Earth-view illumination',
                    accentClassName: 'text-amber-600 dark:text-amber-300',
                },
                {
                    key: 'moon-radius',
                    label: 'Radius',
                    value: `${MOON_MEAN_RADIUS_KM.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`,
                    hint: moonSnapshot.subEarthLatitudeDeg != null && moonSnapshot.subEarthLongitudeDeg != null
                        ? formatCoordinates({ lat: moonSnapshot.subEarthLatitudeDeg, lng: moonSnapshot.subEarthLongitudeDeg })
                        : 'Sub-Earth point unavailable',
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
        compact,
        failedSnps,
        inspectedSNP,
        moonSnapshot,
        selectedMoon,
        selectedGateway,
        selectedGatewayAssignments,
        selectedSatellite,
        snpConnectedSatellites,
    ]);
    const hasEntitySummary = entitySummaryCards.length > 0;
    const compactEntitySummaryGridClass = useMemo(() => {
        if (!compact) return 'grid-cols-1 sm:grid-cols-3';
        if ((selectedGateway || inspectedSNP) && entitySummaryCards.length === 3) return 'grid-cols-3';
        return 'grid-cols-2';
    }, [compact, entitySummaryCards.length, inspectedSNP, selectedGateway]);
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
    const hasStatusBadge = Boolean(summary.status) && !compactSatellitePosition;
    const compactHeaderHasAside = compact && (hasStatusBadge || !!compactSatellitePosition);
    const compactHeaderTextSpanClass = compactSatellitePosition
        ? 'col-start-1'
        : compactHeaderHasAside
            ? 'col-span-2'
            : 'col-span-1';

    return (
        <div className={compact ? 'rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-3 py-2.5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(15,23,42,0.84))]' : 'rounded-3xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'}>
            <div className={compact ? (compactHeaderHasAside ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5' : 'grid grid-cols-1 gap-y-1') : 'flex items-start justify-between gap-3'}>
                <div className={`min-w-0 ${compact ? 'contents' : 'flex-1'}`}>
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 ${compact ? 'col-start-1 row-start-1' : ''}`}>
                        {summary.eyebrow}
                    </div>
                    <div className={`${compact ? `${compactHeaderTextSpanClass} row-start-2 mt-0 ${isCompactSatelliteSummary ? 'text-[16px] leading-[1.05]' : 'text-[18px] leading-[1.05]'}` : 'mt-1 truncate text-[22px] leading-7'} font-semibold text-slate-950 dark:text-slate-50`}>
                        <span className={isCompactCoordinateSummary || isCompactSatelliteSummary ? 'block truncate whitespace-nowrap' : compact ? 'block' : undefined}>
                            {summary.title}
                        </span>
                    </div>
                    {summary.subtitle ? (
                        <div className={`${compact ? `${compactHeaderTextSpanClass} row-start-3 mt-0 text-[13px] leading-[1.3]` : 'mt-1 text-sm leading-5'} text-slate-500 dark:text-slate-400`}>
                            {summary.subtitle}
                        </div>
                    ) : null}
                </div>

                {compactSatellitePosition ? (
                    <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
                        <CompactInfoPill
                            label={compactSatellitePosition.label}
                            value={compactSatellitePosition.value}
                            hint={compactSatellitePosition.hint}
                            accentClassName={compactSatellitePosition.accentClassName}
                            surfaceClassName={compactSatellitePosition.surfaceClassName}
                        />
                    </div>
                ) : null}

                {hasStatusBadge ? (
                    <div className={`w-fit max-w-full shrink-0 rounded-full border ${compact ? 'col-start-2 row-start-1 self-start justify-self-end px-2.5 py-1 text-[10px] leading-4' : 'px-2.5 py-1 text-[11px]'} font-semibold ${statusClassName}`}>
                        {summary.status}
                    </div>
                ) : null}
            </div>

            {hasEntitySummary ? (
                <div className={compact ? 'mt-2' : 'mt-3'}>
                    <div className={`grid gap-2 ${compactEntitySummaryGridClass}`}>
                        {entitySummaryCards.map((card) => (
                            <SummaryStatCard
                                key={card.key}
                                label={card.label}
                                value={card.value}
                                hint={card.hint}
                                accentClassName={card.accentClassName}
                                compact={compact}
                            />
                        ))}
                    </div>
                </div>
            ) : hasMetrics ? (
                <div className={compact ? 'mt-2' : 'mt-3'}>
                    <div className={`grid gap-2 ${metricCards.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {metricCards.map((card) => (
                            <MetricCard
                                key={card.key}
                                label={card.label}
                                metrics={card.metrics}
                                accentClassName={card.accentClassName}
                                borderClassName={card.borderClassName}
                                compact={compact}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                <div className={`${compact ? 'mt-2 rounded-[20px] px-3 py-2 text-[13px] leading-[1.4]' : 'mt-3 rounded-2xl px-3 py-2.5 text-sm'} border border-slate-200/80 bg-white/82 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-300`}>
                    {emptyStateMessage}
                </div>
            )}
        </div>
    );
};

export default React.memo(MobileAnalysisSummary);
