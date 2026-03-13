import React, { useMemo } from 'react';
import type { SatelliteData } from '../../types/satellites';
import type { MobileAnalysisMetrics, MobileLinkMetrics } from '../../types/analysis';

interface MobileAnalysisSummaryProps {
    autoSelectedLEOSatellite: SatelliteData | null;
    autoSelectedGEOSatellite: SatelliteData | null;
    selectedSatellite: SatelliteData | null;
    compact?: boolean;
    metrics?: MobileAnalysisMetrics;
}



function formatMbpsFromGbps(gbps: number | null | undefined): string {
    if (gbps == null || !isFinite(gbps)) return '--';
    return `${Math.round(gbps * 1000)} Mbps`;
}

function MetricPair({ metrics, color }: { metrics: MobileLinkMetrics | null | undefined; color: string }) {
    return (
        <div className="shrink-0 text-[11px] font-semibold text-right whitespace-nowrap" style={{ color }}>
            {`DL ${formatMbpsFromGbps(metrics?.downlinkGbps)} / UL ${formatMbpsFromGbps(metrics?.uplinkGbps)}`}
        </div>
    );
}

const MobileAnalysisSummary: React.FC<MobileAnalysisSummaryProps> = ({
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    compact = false,
    metrics
}) => {
    const satelliteLabel = useMemo(() => {
        if (selectedSatellite) return selectedSatellite.name;
        if (autoSelectedLEOSatellite) return autoSelectedLEOSatellite.name;
        if (autoSelectedGEOSatellite) return autoSelectedGEOSatellite.name;
        return 'Capacity Analysis';
    }, [selectedSatellite, autoSelectedLEOSatellite, autoSelectedGEOSatellite]);

    // Metrics are now passed strictly from CapacityDetails via props.
    // No local approximation to ensure consistency.

    return (
        compact ? (
            <div className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-xs font-semibold truncate" style={{ color: '#db2777' }}>
                        {autoSelectedLEOSatellite?.name ?? '--'}
                    </div>
                    <MetricPair metrics={metrics?.leo} color="#db2777" />
                </div>

                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-xs font-semibold truncate" style={{ color: '#2563eb' }}>
                        {autoSelectedGEOSatellite?.name ?? '--'}
                    </div>
                    <MetricPair metrics={metrics?.geo} color="#2563eb" />
                </div>
            </div>
        ) : (
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900 truncate pr-3">{satelliteLabel}</div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">DL / UL</div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                        <span className="font-semibold" style={{ color: '#db2777' }}>LEO</span>
                    </div>
                    <MetricPair metrics={metrics?.leo} color="#db2777" />
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                        <span className="font-semibold" style={{ color: '#2563eb' }}>GEO</span>
                    </div>
                    <MetricPair metrics={metrics?.geo} color="#2563eb" />
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-600">Throughput</div>
                    <div className="text-xs text-gray-700 font-semibold whitespace-nowrap">{metrics ? formatMbpsFromGbps(metrics.totalGbps) : '--'}</div>
                </div>
                <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-600">Covered sats</div>
                    <div className="text-xs text-gray-700 font-semibold whitespace-nowrap">{metrics ? metrics.coveredCount : '--'}</div>
                </div>
            </div>
        )
    );
};

export default React.memo(MobileAnalysisSummary);
