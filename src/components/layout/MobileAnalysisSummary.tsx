import React, { useMemo } from 'react';
import type { SatelliteData } from '../../types/satellites';
import { SPEED_OF_LIGHT_RADIO_KM_S, compute3DDistanceKm, calculateRealTimeCapacity } from '../../utils/capacityCalculator';

interface MobileAnalysisSummaryProps {
    satellites: SatelliteData[];
    selectedPoint: { lat: number; lng: number; altitude?: number } | null;
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite: SatelliteData | null;
    autoSelectedGEOSatellite: SatelliteData | null;
}

function formatRttMs(v: number | null): string {
    if (v == null || !isFinite(v)) return '--';
    return `${Math.max(1, Math.round(v))} ms`;
}

function formatMbpsFromGbps(gbps: number | null | undefined): string {
    if (gbps == null || !isFinite(gbps)) return '--';
    return `${Math.round(gbps * 1000)} Mbps`;
}

const MobileAnalysisSummary: React.FC<MobileAnalysisSummaryProps> = ({
    satellites,
    selectedPoint,
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
}) => {
    const point = selectedPoint;

    const satelliteLabel = useMemo(() => {
        if (selectedSatellite) return selectedSatellite.name;
        if (autoSelectedLEOSatellite) return autoSelectedLEOSatellite.name;
        if (autoSelectedGEOSatellite) return autoSelectedGEOSatellite.name;
        return 'Capacity Analysis';
    }, [selectedSatellite, autoSelectedLEOSatellite, autoSelectedGEOSatellite]);

    const rtt = useMemo(() => {
        if (!point) return { leo: null as number | null, geo: null as number | null };

        const user = { lat: point.lat, lng: point.lng, alt: point.altitude ?? 0 };

        const leoSat = autoSelectedLEOSatellite;
        const geoSat = autoSelectedGEOSatellite;

        const leo = leoSat
            ? (2 * compute3DDistanceKm(user, { lat: leoSat.position.lat, lng: leoSat.position.lng, alt: leoSat.position.alt }) / SPEED_OF_LIGHT_RADIO_KM_S) * 1000
            : null;

        const geo = geoSat
            ? (2 * compute3DDistanceKm(user, { lat: geoSat.position.lat, lng: geoSat.position.lng, alt: geoSat.position.alt }) / SPEED_OF_LIGHT_RADIO_KM_S) * 1000
            : null;

        return { leo, geo };
    }, [point?.lat, point?.lng, point?.altitude, autoSelectedLEOSatellite, autoSelectedGEOSatellite]);

    const throughput = useMemo(() => {
        const p = point ? { lat: point.lat, lng: point.lng } : null;
        const rt = calculateRealTimeCapacity(satellites, p, selectedSatellite);
        return {
            totalGbps: rt.totalCapacity,
            coveredCount: rt.coveredSatellites.length,
        };
    }, [satellites, point?.lat, point?.lng, selectedSatellite]);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900 truncate pr-3">{satelliteLabel}</div>
                <div className="text-xs text-gray-500 whitespace-nowrap">RTT</div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">
                    <span className="font-semibold" style={{ color: '#db2777' }}>LEO</span>
                    <span className="ml-2">{formatRttMs(rtt.leo)}</span>
                </div>
                <div className="text-xs text-gray-600">
                    <span className="font-semibold" style={{ color: '#2563eb' }}>GEO</span>
                    <span className="ml-2">{formatRttMs(rtt.geo)}</span>
                </div>
            </div>

            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">Throughput</div>
                <div className="text-xs text-gray-700 font-semibold whitespace-nowrap">{formatMbpsFromGbps(throughput.totalGbps)}</div>
            </div>
            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">Covered sats</div>
                <div className="text-xs text-gray-700 font-semibold whitespace-nowrap">{throughput.coveredCount}</div>
            </div>
        </div>
    );
};

export default React.memo(MobileAnalysisSummary);
