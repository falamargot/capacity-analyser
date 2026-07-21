import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { Vessel } from '../../modules/maritimeTraffic/maritimeTrafficService';
import type { GeoGatewayData, SNPData } from '../globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import type { MobileAnalysisMetrics, MobileLinkMetrics } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import { LINK_MODE_LABELS } from '../../types/linkMode';
import { WEATHER_PROFILES, toWeatherCondition, type WeatherType } from '../capacity';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import { formatLeoSiteToSiteFailureReason } from '../../utils/leoSiteToSiteModel';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { formatCoordinates } from '../../utils/formatters';
import { useSimulation } from '../../contexts/SimulationContext';
import { WEATHER_ATTENUATION_DB } from '../../utils/realisticSimulation';
import {
    deriveSelectedPointStatusPresentation,
    type GeoPointStatus,
    type SelectedPointScope,
    type SelectedPointStatusTone,
} from '../../utils/selectedPointStatus';
import { BACKHAUL_RADIUS_KM } from '../../utils/leoFootprint';
import { GEO_GATEWAYS, getPrimaryControlRoleLabel } from '../globe/GlobeConfig';
import { getAssignedGeoSatellitesForGateway } from '../../utils/geoConnectivityModel';
import type { SNPConnectedSatellite } from '../../services/coverageService';
import { getMoonSnapshot, MOON_MEAN_RADIUS_KM } from '../../utils/moonInfo';
import { JulianDate } from 'cesium';
import { selectActiveEngineeringTruth, type EngineeringTruthSet } from '../../utils/engineeringAnalysisViewModel';

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
    linkMode?: LinkMode;
    onLinkModeChange?: (mode: LinkMode) => void;
    pointB?: { lat: number; lng: number } | null;
    pointBLeo?: { lat: number; lng: number } | null;
    nearestLocation?: { city: string; country: string } | null;
    nearestLocationB?: { city: string; country: string } | null;
    weatherType?: WeatherType;
    weatherTypeB?: WeatherType;
    autoWeatherEnabled?: boolean;
    autoWeatherEnabledB?: boolean;
    activeConnectivityTab?: 'LEO' | 'GEO';
    activeMeshTab?: 'forward' | 'reverse';
    onActiveMeshTabChange?: (tab: 'forward' | 'reverse') => void;
    leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
    leoSiteToSiteResult?: LeoSiteToSiteResult | null;
    engineeringTruths?: EngineeringTruthSet;
}

type SummaryTone = SelectedPointStatusTone | 'danger' | 'warning' | 'success' | 'neutral';

interface SummaryHeader {
    eyebrow: string;
    title: string;
    subtitle: string | null;
    status: string | null;
    statusTone: SummaryTone;
}

const MOBILE_LINK_MODE_OPTIONS: Array<{ mode: LinkMode; label: string }> = [
    { mode: 'STAR_FORWARD', label: 'Forward' },
    { mode: 'STAR_RETURN', label: 'Return' },
    { mode: 'MESH', label: 'Mesh' },
    { mode: 'POINT_TO_POINT', label: 'P2P' },
];

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

const weatherGlyph: Record<WeatherType, string> = {
    clear: '☀️',
    light_rain: '☁️',
    heavy_rain: '🌧️',
    storm: '⛈️',
};

function formatNearestLocation(location: { city: string; country: string } | null | undefined) {
    return [location?.city, location?.country].filter(Boolean).join(', ') || 'Ground position';
}

function formatWeatherSummary(weatherType: WeatherType, autoWeatherEnabled: boolean) {
    const profile = WEATHER_PROFILES[weatherType];
    const attenuation = WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1);
    return `${weatherGlyph[weatherType]} ${profile.label} · ${attenuation} dB · ${autoWeatherEnabled ? 'Real' : 'Manual'}`;
}

function MobileSiteRouteSummary({
    siteA,
    siteB,
    accent,
    servingSatelliteName,
    servingSatelliteNameB,
    relation,
    detailDirection,
    onToggleDirection,
}: {
    siteA: {
        coordinates: string;
        location: string;
        weather: string;
    };
    siteB: {
        coordinates: string;
        location: string;
        weather: string;
    };
    accent: 'LEO' | 'GEO';
    servingSatelliteName?: string | null;
    /**
     * Site B's own serving satellite — only meaningfully different from
     * servingSatelliteName in LEO Site-to-Site, where each site can be served
     * by a different satellite. GEO passes null here (one satellite genuinely
     * serves both sites). Cross-Surface Consistency Audit 2026-07-21, F3:
     * previously Site B's satellite was never shown at all, even when it
     * differed from Site A's.
     */
    servingSatelliteNameB?: string | null;
    relation: 'forward' | 'reverse' | 'bidirectional';
    detailDirection: 'forward' | 'reverse';
    onToggleDirection?: () => void;
}) {
    const isLeo = accent === 'LEO';
    const Icon = relation === 'forward'
        ? ArrowRight
        : relation === 'reverse'
            ? ArrowLeft
            : detailDirection === 'reverse'
                ? ArrowLeft
                : ArrowRight;
    const indicatorLabel = relation === 'forward'
        ? 'Site A to Site B'
        : relation === 'reverse'
            ? 'Site B to Site A'
            : detailDirection === 'reverse'
                ? 'Site A and Site B bidirectional. Current detail direction is Site B to Site A.'
                : 'Site A and Site B bidirectional. Current detail direction is Site A to Site B.';
    const indicatorClassName = isLeo
        ? 'border-fuchsia-300/60 bg-fuchsia-500 text-white shadow-[0_10px_24px_-16px_rgba(192,38,211,0.85)]'
        : 'border-blue-300/70 bg-blue-600 text-white shadow-[0_10px_24px_-16px_rgba(37,99,235,0.85)]';
    const indicatorBaseClassName = `absolute left-1/2 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border ${indicatorClassName}`;

    const renderSite = (label: 'SITE A' | 'SITE B', site: typeof siteA) => {
        const siteServingSatelliteName = label === 'SITE A' ? servingSatelliteName : servingSatelliteNameB;

        return (
            <div className="min-w-0 rounded-[18px] border border-slate-200/80 bg-white/82 px-2.5 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900/72">
                <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    {label}
                </div>
                <div
                    className="mt-1 truncate whitespace-nowrap font-mono text-[13px] font-semibold leading-4 text-slate-950 dark:text-slate-50"
                    title={siteServingSatelliteName ? `Serving satellite ${siteServingSatelliteName} · ${site.coordinates}` : site.coordinates}
                >
                    {siteServingSatelliteName ? (
                        <>
                            <span className={isLeo ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-blue-700 dark:text-blue-200'}>{siteServingSatelliteName}</span>
                            <span> · {site.coordinates}</span>
                        </>
                    ) : site.coordinates}
                </div>
                <div className="mt-0.5 truncate text-[10px] leading-3 text-slate-500 dark:text-slate-400" title={site.location}>
                    {site.location}
                </div>
                <div className="mt-1.5 truncate rounded-[10px] bg-slate-100/75 px-2 py-1 text-[10px] font-medium leading-3 text-slate-600 dark:bg-slate-800/70 dark:text-slate-300" title={site.weather}>
                    {site.weather}
                </div>
            </div>
        );
    };

    return (
        <div className="relative grid grid-cols-2 gap-2">
            {renderSite('SITE A', siteA)}
            {onToggleDirection ? (
                <button
                    type="button"
                    onClick={onToggleDirection}
                    className={`${indicatorBaseClassName} transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-white/75`}
                    aria-label={`${indicatorLabel} Click to switch detail direction.`}
                    title={`${indicatorLabel} Click to switch detail direction.`}
                >
                    <Icon className="h-3.5 w-3.5" />
                </button>
            ) : (
                <div
                    className={`pointer-events-none ${indicatorBaseClassName}`}
                    role="img"
                    aria-label={indicatorLabel}
                    title={indicatorLabel}
                >
                    <Icon className="h-3.5 w-3.5" />
                </div>
            )}
            {renderSite('SITE B', siteB)}
        </div>
    );
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
    topologyLabel,
    latencyLabel = 'RTT',
    downlinkLabel = 'Downlink',
    uplinkLabel = 'Uplink',
    extraMetrics,
    linkModeControls,
    compact = false,
}: {
    label: string;
    metrics: MobileLinkMetrics | null | undefined;
    accentClassName: string;
    borderClassName: string;
    topologyLabel?: string;
    latencyLabel?: string;
    downlinkLabel?: string;
    uplinkLabel?: string;
    extraMetrics?: Array<{ key: string; label: string; value: string }>;
    linkModeControls?: {
        activeMode: LinkMode;
        onChange: (mode: LinkMode) => void;
    };
    compact?: boolean;
}) {
    const metricTiles = [
        metrics?.downlinkGbps != null ? { key: 'downlink', label: downlinkLabel, value: formatMbpsFromGbps(metrics.downlinkGbps) } : null,
        metrics?.uplinkGbps != null ? { key: 'uplink', label: uplinkLabel, value: formatMbpsFromGbps(metrics.uplinkGbps) } : null,
        ...(extraMetrics ?? []),
    ].filter(Boolean) as Array<{ key: string; label: string; value: string }>;
    const metricGridClass = metricTiles.length === 1 ? 'grid-cols-1' : metricTiles.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

    if (compact) {
        return (
            <div className={`border bg-white/82 shadow-sm dark:bg-slate-900/72 rounded-[20px] px-3 py-2.5 ${borderClassName}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3">
                    <div className="min-w-0">
                        <div className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${accentClassName}`}>
                            {label}
                        </div>
                        {topologyLabel ? (
                            <div className="mt-1 text-[10px] font-semibold leading-3 text-slate-500 dark:text-slate-400">
                                {topologyLabel}
                            </div>
                        ) : null}
                    </div>
                    <div className="flex items-baseline justify-end gap-2 text-right whitespace-nowrap">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                            {latencyLabel}
                        </div>
                        <div className="text-[12px] font-semibold leading-4 text-slate-900 dark:text-slate-100">
                            {formatRtt(metrics?.rtt)}
                        </div>
                    </div>
                    {metricTiles.length > 0 ? (
                        <div className={`col-span-2 grid ${metricGridClass} gap-2`}>
                            {metricTiles.map((tile) => (
                                <div key={tile.key} className="rounded-[14px] bg-slate-100/70 px-2.5 py-2 dark:bg-slate-800/55">
                                    <div className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                        {tile.label}
                                    </div>
                                    <div className="mt-1 text-[12px] font-semibold leading-4 text-slate-900 dark:text-slate-100">
                                        {tile.value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {linkModeControls ? (
                        <div className="col-span-2 grid grid-cols-4 gap-1 rounded-[14px] bg-slate-950/5 p-1 dark:bg-white/[0.08]">
                            {MOBILE_LINK_MODE_OPTIONS.map((option) => {
                                const isActive = linkModeControls.activeMode === option.mode;
                                return (
                                    <button
                                        key={option.mode}
                                        type="button"
                                        onClick={() => linkModeControls.onChange(option.mode)}
                                        className={`min-h-8 rounded-[10px] px-1.5 text-[10px] font-semibold leading-3 transition-colors ${isActive
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/70'
                                            }`}
                                        aria-pressed={isActive}
                                        aria-label={`Select GEO topology ${LINK_MODE_LABELS[option.mode]}`}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className={`border bg-white/82 shadow-sm dark:bg-slate-900/72 rounded-2xl px-3 py-3 ${borderClassName}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accentClassName}`}>
                        {label}
                    </div>
                    {topologyLabel ? (
                        <div className="mt-1 text-[11px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                            {topologyLabel}
                        </div>
                    ) : null}
                </div>
                <div className="flex items-baseline justify-end gap-2 text-right whitespace-nowrap">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                        {latencyLabel}
                    </div>
                    <div className="text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                        {formatRtt(metrics?.rtt)}
                    </div>
                </div>
            </div>
            {metricTiles.length > 0 ? (
                <div className={`mt-3 grid ${metricGridClass} gap-3`}>
                    {metricTiles.map((tile) => (
                        <div key={tile.key}>
                            <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                                {tile.label}
                            </div>
                            <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 dark:text-slate-100">
                                {tile.value}
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
            {linkModeControls ? (
                <div className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-slate-950/5 p-1 dark:bg-white/[0.08]">
                    {MOBILE_LINK_MODE_OPTIONS.map((option) => {
                        const isActive = linkModeControls.activeMode === option.mode;
                        return (
                            <button
                                key={option.mode}
                                type="button"
                                onClick={() => linkModeControls.onChange(option.mode)}
                                className={`min-h-8 rounded-lg px-1.5 text-[10px] font-semibold leading-3 transition-colors ${isActive
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/70'
                                    }`}
                                aria-pressed={isActive}
                                aria-label={`Select GEO topology ${LINK_MODE_LABELS[option.mode]}`}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
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
    linkMode = 'STAR_FORWARD',
    onLinkModeChange,
    pointB = null,
    pointBLeo = null,
    nearestLocation = null,
    nearestLocationB = null,
    weatherType = 'clear',
    weatherTypeB = 'clear',
    autoWeatherEnabled = false,
    autoWeatherEnabledB = false,
    activeConnectivityTab = 'LEO',
    activeMeshTab = 'forward',
    onActiveMeshTabChange,
    leoTopologyMode = 'SINGLE_SITE',
    leoSiteToSiteResult = null,
    engineeringTruths = {},
}) => {
    const { failedSnps } = useSimulation();
    const activeEngineeringTruth = selectActiveEngineeringTruth(engineeringTruths, satelliteScope, activeConnectivityTab);
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

    const summary = useMemo<SummaryHeader>(() => {
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
                eyebrow: 'Ground Site',
                title: selectedGateway.name,
                subtitle: `${selectedGateway.region} · ${getPrimaryControlRoleLabel(selectedGateway.roles)}`,
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
            const siteBPoint = pointB ?? pointBLeo;
            const isTwoPointGroundAnalysis = selectedPoint.source !== 'aircraft' && Boolean(siteBPoint);
            const siteToSiteServiceReady = leoTopologyMode === 'SITE_TO_SITE' && pointBLeo;
            const routeAccent: 'LEO' | 'GEO' = satelliteScope === 'GEO' || satelliteScope === 'LEO'
                ? satelliteScope
                : activeConnectivityTab;
            const routeTitle = routeAccent === 'GEO' && linkMode === 'STAR_FORWARD'
                ? 'Site A → Site B'
                : routeAccent === 'GEO' && linkMode === 'STAR_RETURN'
                    ? 'Site B → Site A'
                    : 'Site A ⇄ Site B';
            return {
                eyebrow: selectedPoint.source === 'aircraft'
                    ? 'Air Corridor'
                    : isTwoPointGroundAnalysis
                        ? 'Site-to-Site'
                        : 'Ground Point',
                title: isTwoPointGroundAnalysis
                    ? routeTitle
                    : formatCoordinates({ lat: selectedPoint.lat, lng: selectedPoint.lng }),
                subtitle: isTwoPointGroundAnalysis
                    ? `A ${formatCoordinates({ lat: selectedPoint.lat, lng: selectedPoint.lng })} · B ${formatCoordinates(siteBPoint!)}`
                    : selectedPoint.altitude
                    ? `Altitude ${selectedPoint.altitude.toFixed(1)} km`
                    : null,
                status: activeEngineeringTruth?.headline ?? (siteToSiteServiceReady
                    ? (!leoSiteToSiteResult
                        ? 'Resolving end-to-end path'
                        : leoSiteToSiteResult.serviceStatus === 'ALLOWED'
                        ? 'End-to-end available'
                        : leoSiteToSiteResult.serviceStatus === 'DEGRADED'
                            ? `End-to-end degraded · ${formatLeoSiteToSiteFailureReason(leoSiteToSiteResult.failureReason)}`
                            : `End-to-end unavailable · ${formatLeoSiteToSiteFailureReason(leoSiteToSiteResult.failureReason)}`)
                    : selectedPointStatus.lines.map((line) => line.text).join(' · ')),
                statusTone: activeEngineeringTruth
                    ? activeEngineeringTruth.tone === 'good' ? 'success' as const
                        : activeEngineeringTruth.tone === 'warn' ? 'warning' as const
                            : activeEngineeringTruth.tone === 'danger' ? 'danger' as const
                                : 'neutral' as const
                    : siteToSiteServiceReady
                    ? (!leoSiteToSiteResult
                        ? 'neutral' as const
                        : leoSiteToSiteResult.serviceStatus === 'ALLOWED'
                        ? 'success' as const
                        : leoSiteToSiteResult.serviceStatus === 'DEGRADED'
                            ? 'warning' as const
                            : 'danger' as const)
                    : selectedPointStatus.tone,
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
        activeConnectivityTab,
        activeEngineeringTruth,
        autoSelectedGEOSatellite?.name,
        autoSelectedLEOSatellite?.name,
        inspectedSNP,
        leoServiceViewModel?.finalServiceStatus,
        leoServiceViewModel?.primaryReasonLabel,
        leoSiteToSiteResult,
        leoTopologyMode,
        linkMode,
        pointB,
        pointBLeo,
        satelliteScope,
        selectedMoon,
        selectedAircraft,
        selectedGateway,
        selectedPoint,
        selectedPointStatus.lines,
        selectedPointStatus.tone,
        selectedSatellite,
        selectedVessel,
    ]);
    const authoritativeSummary = useMemo<SummaryHeader>(() => ({
        ...summary,
        status: activeEngineeringTruth?.headline ?? 'Engineering result pending',
        statusTone: activeEngineeringTruth
            ? activeEngineeringTruth.tone === 'good'
                ? 'success'
                : activeEngineeringTruth.tone === 'warn'
                    ? 'warning'
                    : activeEngineeringTruth.tone === 'danger'
                        ? 'danger'
                        : 'neutral'
            : 'neutral',
    }), [activeEngineeringTruth, summary]);

    const metricCards = useMemo(() => {
        const cards: Array<{
            key: 'leo' | 'geo';
            label: 'LEO' | 'GEO';
            metrics: MobileLinkMetrics | null | undefined;
            accentClassName: string;
            borderClassName: string;
            topologyLabel?: string;
            latencyLabel?: string;
            downlinkLabel?: string;
            uplinkLabel?: string;
            extraMetrics?: Array<{ key: string; label: string; value: string }>;
            linkModeControls?: {
                activeMode: LinkMode;
                onChange: (mode: LinkMode) => void;
            };
        }> = [];

        const s2sLeoMetrics: MobileLinkMetrics | null = leoTopologyMode === 'SITE_TO_SITE' && leoSiteToSiteResult
            ? {
                // One-way, not rttMs (both legs summed — a genuine round trip,
                // exactly 2x too high here). Matches the desktop drawer's
                // s2sPrimaryLatency and activeRouteViewModel's identical fix.
                rtt: activeMeshTab === 'reverse'
                    ? leoSiteToSiteResult.oneWayLatencyBtoAMs
                    : leoSiteToSiteResult.oneWayLatencyAtoBMs,
                downlinkGbps: activeMeshTab === 'reverse'
                    ? (leoSiteToSiteResult.finalThroughputBtoAMbps != null
                        ? leoSiteToSiteResult.finalThroughputBtoAMbps / 1000
                        : null)
                    : (leoSiteToSiteResult.finalThroughputAtoBMbps != null
                        ? leoSiteToSiteResult.finalThroughputAtoBMbps / 1000
                        : null),
                uplinkGbps: null,
            }
            : null;
        const displayedLeoMetrics = leoTopologyMode === 'SITE_TO_SITE' ? s2sLeoMetrics : metrics?.leo;
        const selectedRouteLabel = activeMeshTab === 'reverse' ? 'B→A' : 'A→B';
        const leoDeliveryAvailable = leoTopologyMode === 'SITE_TO_SITE'
            ? leoSiteToSiteResult?.serviceStatus === 'ALLOWED' || leoSiteToSiteResult?.serviceStatus === 'DEGRADED'
            : leoServiceViewModel?.isThroughputApplicable ?? true;

        if (displayedLeoMetrics && leoDeliveryAvailable) {
            cards.push({
                key: 'leo',
                label: 'LEO',
                metrics: displayedLeoMetrics,
                accentClassName: 'text-fuchsia-600 dark:text-fuchsia-300',
                borderClassName: 'border-fuchsia-200/80 dark:border-fuchsia-400/20',
                latencyLabel: leoTopologyMode === 'SITE_TO_SITE' ? `${selectedRouteLabel} latency` : 'LEO latency',
                downlinkLabel: leoTopologyMode === 'SITE_TO_SITE' ? selectedRouteLabel : 'DL throughput',
                uplinkLabel: 'UL throughput',
                extraMetrics: leoTopologyMode === 'SITE_TO_SITE' && leoSiteToSiteResult
                    ? [{ key: 'stability', label: 'Stability', value: leoSiteToSiteResult.pathStability }]
                    : undefined,
            });
        }

        const canShowGeoTopologyControls = Boolean(onLinkModeChange)
            && satelliteScope !== 'LEO'
            && (Boolean(selectedPoint) || Boolean(selectedAircraft) || Boolean(metrics?.geo));
        const geoDeliveryAvailable = geoPointStatus == null || geoPointStatus === 'available' || geoPointStatus === 'unstable';

        if ((metrics?.geo && geoDeliveryAvailable) || canShowGeoTopologyControls) {
            const isMeshMode = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
            const isStarForward = linkMode === 'STAR_FORWARD';
            const isStarReturn = linkMode === 'STAR_RETURN';
            const meshDisplayMetrics: MobileLinkMetrics | null = isMeshMode && pointB && metrics?.mesh
                ? {
                    rtt: activeMeshTab === 'reverse'
                        ? metrics.mesh.reverseLatencyMs
                        : metrics.mesh.forwardLatencyMs,
                    downlinkGbps: activeMeshTab === 'reverse'
                        ? (metrics.mesh.reverseMbps != null ? metrics.mesh.reverseMbps / 1000 : null)
                        : (metrics.mesh.forwardMbps != null ? metrics.mesh.forwardMbps / 1000 : null),
                    uplinkGbps: null,
                }
                : null;
            cards.push({
                key: 'geo',
                label: 'GEO',
                metrics: geoDeliveryAvailable ? (meshDisplayMetrics ?? metrics?.geo) : null,
                accentClassName: 'text-blue-600 dark:text-blue-300',
                borderClassName: 'border-blue-200/80 dark:border-blue-400/20',
                topologyLabel: onLinkModeChange ? undefined : `Topology · ${LINK_MODE_LABELS[linkMode]}`,
                latencyLabel: isMeshMode ? `${selectedRouteLabel} latency` : 'Latency',
                downlinkLabel: isMeshMode ? selectedRouteLabel : isStarForward ? 'Forward link' : 'Downlink',
                uplinkLabel: isMeshMode ? 'Return' : isStarReturn ? 'Return link' : 'Uplink',
                linkModeControls: onLinkModeChange ? {
                    activeMode: linkMode,
                    onChange: onLinkModeChange,
                } : undefined,
            });
        }

        return cards;
    }, [activeMeshTab, geoPointStatus, leoServiceViewModel?.isThroughputApplicable, leoSiteToSiteResult, leoTopologyMode, linkMode, metrics?.geo, metrics?.leo, metrics?.mesh, onLinkModeChange, pointB, satelliteScope, selectedAircraft, selectedPoint]);

    const hasMetrics = metricCards.length > 0;
    const shouldShowCanonicalMetrics = !!activeEngineeringTruth && activeEngineeringTruth.primaryMetrics.length > 0;
    const shouldShowMetrics = !compact && !activeEngineeringTruth && hasMetrics;
    const shouldShowEmptyState = !compact || (!selectedPoint && !selectedAircraft);
    const activeLeoServingSatellite = leoTopologyMode === 'SITE_TO_SITE'
        ? leoSiteToSiteResult?.servingSatelliteA ?? autoSelectedLEOSatellite
        : autoSelectedLEOSatellite;
    // Site B's own serving satellite — only ever non-null in LEO Site-to-Site
    // (Cross-Surface Consistency Audit 2026-07-21, F3: previously never
    // computed at all, so Site B's satellite could not be shown even when it
    // genuinely differed from Site A's).
    const activeLeoServingSatelliteB = leoTopologyMode === 'SITE_TO_SITE'
        ? leoSiteToSiteResult?.servingSatelliteB ?? null
        : null;
    const activeServingSatellite = satelliteScope === 'GEO'
        ? autoSelectedGEOSatellite
        : satelliteScope === 'LEO'
            ? activeLeoServingSatellite
            : activeConnectivityTab === 'GEO'
                ? autoSelectedGEOSatellite
                : activeLeoServingSatellite;
    const shouldShowServingSatellite = Boolean(selectedPoint || selectedAircraft) && !selectedSatellite;
    const servingSatelliteName = shouldShowServingSatellite ? activeServingSatellite?.name ?? null : null;
    const servingSatelliteNameB = shouldShowServingSatellite
        ? (satelliteScope === 'GEO' ? null : satelliteScope === 'LEO' || activeConnectivityTab === 'LEO' ? activeLeoServingSatelliteB?.name ?? null : null)
        : null;
    const mobileRouteSummary = useMemo(() => {
        const siteBPoint = pointB ?? pointBLeo;
        if (
            !compact
            || !selectedPoint
            || selectedPoint.source === 'aircraft'
            || !siteBPoint
            || selectedMoon
            || selectedGateway
            || inspectedSNP
            || selectedVessel
            || selectedAircraft
            || selectedSatellite
        ) {
            return null;
        }

        const accent: 'LEO' | 'GEO' = satelliteScope === 'GEO' || satelliteScope === 'LEO'
            ? satelliteScope
            : activeConnectivityTab;
        const relation = accent === 'GEO'
            ? linkMode === 'STAR_RETURN'
                ? 'reverse' as const
                : linkMode === 'STAR_FORWARD'
                    ? 'forward' as const
                    : 'bidirectional' as const
            : 'bidirectional' as const;

        return {
            siteA: {
                coordinates: formatCoordinates({ lat: selectedPoint.lat, lng: selectedPoint.lng }),
                location: formatNearestLocation(nearestLocation),
                weather: formatWeatherSummary(weatherType, autoWeatherEnabled),
            },
            siteB: {
                coordinates: formatCoordinates({ lat: siteBPoint.lat, lng: siteBPoint.lng }),
                location: formatNearestLocation(nearestLocationB),
                weather: formatWeatherSummary(weatherTypeB, autoWeatherEnabledB),
            },
            accent,
            servingSatelliteName,
            servingSatelliteNameB,
            relation,
            detailDirection: activeMeshTab,
            onToggleDirection: relation === 'bidirectional' && onActiveMeshTabChange
                ? () => onActiveMeshTabChange(activeMeshTab === 'forward' ? 'reverse' : 'forward')
                : undefined,
        };
    }, [
        activeConnectivityTab,
        activeMeshTab,
        autoWeatherEnabled,
        autoWeatherEnabledB,
        compact,
        inspectedSNP,
        linkMode,
        nearestLocation,
        nearestLocationB,
        onActiveMeshTabChange,
        pointB,
        pointBLeo,
        satelliteScope,
        servingSatelliteName,
        servingSatelliteNameB,
        selectedAircraft,
        selectedGateway,
        selectedMoon,
        selectedPoint,
        selectedSatellite,
        selectedVessel,
        weatherType,
        weatherTypeB,
    ]);
    const isCompactCoordinateSummary = compact && !!selectedPoint;
    const isCompactSatelliteSummary = compact && !!selectedSatellite;
    const compactSatellitePosition = useMemo(() => {
        if (compact || !selectedSatellite) return null;
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
                    label: 'Ground Site',
                    value: selectedGateway.region,
                    hint: selectedGateway.gateway_id,
                    accentClassName: 'text-cyan-600 dark:text-cyan-300',
                },
                {
                    key: 'gw-primary',
                    label: 'Nominal SCC',
                    value: `${selectedGatewayAssignments.primary.length} satellites`,
                    hint: `Backup ${selectedGatewayAssignments.backup.length}`,
                },
                {
                    key: 'gw-total',
                    label: 'Control GEO',
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

    const statusClassName = statusToneClass(authoritativeSummary.statusTone);
    const hasStatusBadge = Boolean(authoritativeSummary.status) && !compactSatellitePosition;
    const compactHeaderHasAside = compact && (hasStatusBadge || !!compactSatellitePosition);
    const compactHeaderTextSpanClass = compactSatellitePosition
        ? 'col-start-1'
        : compactHeaderHasAside
            ? 'col-span-2'
            : 'col-span-1';
    const shouldHideCompactRouteHeader = false;
    const servingSatelliteAccentClass = activeServingSatellite?.orbitType === 'LEO'
        ? 'text-fuchsia-700 dark:text-fuchsia-200'
        : 'text-blue-700 dark:text-blue-200';

    return (
        <div className={compact ? 'rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-3 py-2.5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(15,23,42,0.84))]' : 'rounded-3xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'}>
            {!shouldHideCompactRouteHeader ? (
                <div className={compact ? (compactHeaderHasAside ? 'grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5' : 'grid grid-cols-1 gap-y-1') : 'flex items-start justify-between gap-3'}>
                    <div className={`min-w-0 ${compact ? 'contents' : 'flex-1'}`}>
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 ${compact ? 'col-start-1 row-start-1' : ''}`}>
                            {compact ? `Summary · ${authoritativeSummary.eyebrow}` : authoritativeSummary.eyebrow}
                        </div>
                        <div
                            className={`${compact ? `${compactHeaderTextSpanClass} row-start-2 mt-0 ${isCompactSatelliteSummary ? 'text-[16px] leading-[1.05]' : 'text-[18px] leading-[1.05]'}` : 'mt-1 truncate text-[22px] leading-7'} font-semibold text-slate-950 dark:text-slate-50`}
                            title={compact && servingSatelliteName ? `Serving satellite ${servingSatelliteName} · ${authoritativeSummary.title}` : undefined}
                        >
                            <span className={isCompactCoordinateSummary || isCompactSatelliteSummary ? 'block truncate whitespace-nowrap' : compact ? 'block' : undefined}>
                                {compact && servingSatelliteName ? (
                                    <>
                                        <span className={`font-mono ${servingSatelliteAccentClass}`}>{servingSatelliteName}</span>
                                        <span> · {authoritativeSummary.title}</span>
                                    </>
                                ) : authoritativeSummary.title}
                            </span>
                        </div>
                        {authoritativeSummary.subtitle ? (
                            <div className={`${compact ? `${compactHeaderTextSpanClass} row-start-3 mt-0 truncate whitespace-nowrap text-[13px] leading-[1.3]` : 'mt-1 text-sm leading-5'} text-slate-500 dark:text-slate-400`} title={authoritativeSummary.subtitle}>
                                {authoritativeSummary.subtitle}
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
                        <div className={`max-w-full shrink-0 rounded-full border ${compact ? 'col-span-2 row-start-4 mt-0.5 w-full px-2.5 py-1 text-left text-[10px] leading-4 min-[480px]:col-span-1 min-[480px]:col-start-2 min-[480px]:row-start-1 min-[480px]:mt-0 min-[480px]:w-fit min-[480px]:justify-self-end' : 'w-fit px-2.5 py-1 text-[11px]'} font-semibold ${statusClassName}`}>
                            {authoritativeSummary.status}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* mobileRouteSummary itself requires `compact` truthy (see its
                useMemo's early-return above), so this must match rather than
                negate — the old `!compact` here made this branch impossible
                to reach given the app's one call site always passes `compact`
                (App.tsx), silently disabling the whole Site Route Summary
                card. Cross-Surface Consistency Audit 2026-07-21, F3. */}
            {compact && mobileRouteSummary ? (
                <div className={shouldHideCompactRouteHeader ? 'mt-0' : 'mt-2'}>
                    <MobileSiteRouteSummary
                        siteA={mobileRouteSummary.siteA}
                        siteB={mobileRouteSummary.siteB}
                        accent={mobileRouteSummary.accent}
                        servingSatelliteName={mobileRouteSummary.servingSatelliteName}
                        servingSatelliteNameB={mobileRouteSummary.servingSatelliteNameB}
                        relation={mobileRouteSummary.relation}
                        detailDirection={mobileRouteSummary.detailDirection}
                        onToggleDirection={mobileRouteSummary.onToggleDirection}
                    />
                </div>
            ) : null}

            {!compact && hasEntitySummary ? (
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
            ) : shouldShowCanonicalMetrics ? (
                <div className={compact ? 'mt-2' : 'mt-3'}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 px-0.5">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-300">Delivered service</span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500">Final outputs</span>
                    </div>
                    <div className={`grid gap-2 ${activeEngineeringTruth.primaryMetrics.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {activeEngineeringTruth.primaryMetrics.map((metric) => (
                            <SummaryStatCard
                                key={metric.label}
                                label={metric.label}
                                value={metric.display}
                                accentClassName={activeEngineeringTruth.technology === 'LEO' ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-blue-700 dark:text-blue-200'}
                                compact={compact}
                            />
                        ))}
                    </div>
                </div>
            ) : activeEngineeringTruth ? (
                <div className={`${compact ? 'mt-2 rounded-[18px] px-3 py-2 text-[12px] leading-[1.4]' : 'mt-3 rounded-2xl px-3 py-2.5 text-sm'} border border-slate-200/80 bg-white/82 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-300`}>
                    {activeEngineeringTruth.summary}
                </div>
            ) : compact ? (
                <div className="mt-2 rounded-[18px] border border-slate-200/80 bg-white/82 px-3 py-2 text-[12px] leading-[1.4] text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-300">
                    Engineering Truth has not been published for this scenario yet.
                </div>
            ) : shouldShowMetrics ? (
                <div className={compact ? 'mt-2' : 'mt-3'}>
                    <div className={`grid gap-2 ${metricCards.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {metricCards.map((card) => (
                            <MetricCard
                                key={card.key}
                                label={card.label}
                                metrics={card.metrics}
                                accentClassName={card.accentClassName}
                                borderClassName={card.borderClassName}
                                topologyLabel={card.topologyLabel}
                                latencyLabel={card.latencyLabel}
                                downlinkLabel={card.downlinkLabel}
                                uplinkLabel={card.uplinkLabel}
                                extraMetrics={card.extraMetrics}
                                linkModeControls={card.linkModeControls}
                                compact={compact}
                            />
                        ))}
                    </div>
                </div>
            ) : shouldShowEmptyState ? (
                <div className={`${compact ? 'mt-2 rounded-[20px] px-3 py-2 text-[13px] leading-[1.4]' : 'mt-3 rounded-2xl px-3 py-2.5 text-sm'} border border-slate-200/80 bg-white/82 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/72 dark:text-slate-300`}>
                    {emptyStateMessage}
                </div>
            ) : null}
        </div>
    );
};

export default React.memo(MobileAnalysisSummary);
