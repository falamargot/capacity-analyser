import React, { useMemo } from 'react';
import type { SatelliteData } from '../../types/satellites';

interface MobileAnalysisSummaryProps {
    autoSelectedLEOSatellite: SatelliteData | null;
    autoSelectedGEOSatellite: SatelliteData | null;
    selectedSatellite: SatelliteData | null;
    compact?: boolean;
    metrics?: {
        leo: { rtt: number; downlinkGbps: number } | null;
        geo: { rtt: number; downlinkGbps: number } | null;
        totalGbps: number;
        coveredCount: number;
    };
}



function formatMbpsFromGbps(gbps: number | null | undefined): string {
    if (gbps == null || !isFinite(gbps)) return '--';
    return `${Math.round(gbps * 1000)} Mbps`;
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
                <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 text-xs font-semibold truncate" style={{ color: '#db2777' }}>
                        {autoSelectedLEOSatellite?.name ?? '--'}
                    </div>
                    <div className="text-xs font-semibold whitespace-nowrap" style={{ color: '#db2777' }}>
                        {metrics?.leo ? `${formatMbpsFromGbps(metrics.leo.downlinkGbps)} (${metrics.leo.rtt} ms)` : '--'}
                    </div>
                </div>

                <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 text-xs font-semibold truncate" style={{ color: '#2563eb' }}>
                        {autoSelectedGEOSatellite?.name ?? '--'}
                    </div>
                    <div className="text-xs font-semibold whitespace-nowrap" style={{ color: '#2563eb' }}>
                        {metrics?.geo ? `${formatMbpsFromGbps(metrics.geo.downlinkGbps)} (${metrics.geo.rtt} ms)` : '--'}
                    </div>
                </div>
            </div>
        ) : (
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900 truncate pr-3">{satelliteLabel}</div>
                    <div className="text-xs text-gray-500 whitespace-nowrap">Downlink (RTT)</div>
                </div>

                <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                        <span className="font-semibold" style={{ color: '#db2777' }}>LEO</span>
                        <span className="ml-2" style={{ color: '#db2777' }}>
                            {metrics?.leo ? `${formatMbpsFromGbps(metrics.leo.downlinkGbps)} (${metrics.leo.rtt} ms)` : '--'}
                        </span>
                    </div>
                    <div className="text-xs text-gray-600">
                        <span className="font-semibold" style={{ color: '#2563eb' }}>GEO</span>
                        <span className="ml-2" style={{ color: '#2563eb' }}>
                            {metrics?.geo ? `${formatMbpsFromGbps(metrics.geo.downlinkGbps)} (${metrics.geo.rtt} ms)` : '--'}
                        </span>
                    </div>
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
