/**
 * SatelliteIndicator - Shows satellite status indicator at top of globe
 */
import React, { useMemo } from 'react';
import { Viewer as CesiumViewerType } from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { useGSOAvoidance } from '../../hooks/useGSOAvoidance';

interface SatelliteIndicatorProps {
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    isPhone?: boolean;
}

const SatelliteIndicator: React.FC<SatelliteIndicatorProps> = ({
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    isPhone = false
}) => {
    // Determine which satellite to track for GSO Protection
    const trackedSatellite = selectedSatellite || autoSelectedLEOSatellite;

    // Single shared hook — replaces duplicated setInterval (§2.4)
    const gsoData = useGSOAvoidance(
        trackedSatellite?.type === 'ONEWEB' ? trackedSatellite : null
    );
    const gsoAvoidanceActive = gsoData?.isGSOAvoidance ?? false;

    const indicator = useMemo(() => {
        if (selectedSatellite) {
            const isGsoActive = selectedSatellite.type === 'ONEWEB' && gsoAvoidanceActive;
            const bgClass = isGsoActive ? "bg-orange-100/90 border-orange-300" : "bg-green-100/90 border-green-300";
            const textClass = isGsoActive ? "text-orange-800" : "text-green-800";
            return (
                <div className={`${isPhone ? 'px-2 py-1' : 'px-3 py-1'} backdrop-blur-sm rounded-md shadow-sm border ${bgClass}`}>
                    <span className={`${isPhone ? 'text-xs' : ''} font-medium ${textClass}`}>
                        {selectedSatellite.name}
                        {selectedSatellite.type === 'ONEWEB' && !isPhone && (
                            <> {gsoAvoidanceActive ? "(GSO Protection)" : ""}</>
                        )}
                    </span>
                </div>
            );
        }
        if (autoSelectedLEOSatellite && autoSelectedGEOSatellite) {
            return (
                <div className={`${isPhone ? 'px-2 py-1' : 'px-3 py-1'} bg-yellow-100/90 backdrop-blur-sm rounded-md shadow-sm border border-yellow-300`}>
                    <span className={`${isPhone ? 'text-xs' : ''} text-yellow-800 font-medium`}>
                        {isPhone
                            ? `${autoSelectedLEOSatellite.name.split(' ')[0]} + ${autoSelectedGEOSatellite.name.split(' ')[0]}`
                            : `${autoSelectedLEOSatellite.name} + ${autoSelectedGEOSatellite.name}`}
                    </span>
                </div>
            );
        }
        if (autoSelectedLEOSatellite) {
            const isGsoActive = autoSelectedLEOSatellite.type === 'ONEWEB' && gsoAvoidanceActive;
            const bgClass = isGsoActive ? "bg-orange-100/90 border-orange-300" : "bg-green-100/90 border-green-300";
            const textClass = isGsoActive ? "text-orange-800" : "text-green-800";
            return (
                <div className={`${isPhone ? 'px-2 py-1' : 'px-3 py-1'} backdrop-blur-sm rounded-md shadow-sm border ${bgClass}`}>
                    <span className={`${isPhone ? 'text-xs' : ''} font-medium ${textClass}`}>
                        {autoSelectedLEOSatellite.name}
                        {autoSelectedLEOSatellite.type === 'ONEWEB' && !isPhone && (
                            <> {gsoAvoidanceActive ? "(GSO Protection)" : ""}</>
                        )}
                    </span>
                </div>
            );
        }
        if (autoSelectedGEOSatellite) {
            return (
                <div className={`${isPhone ? 'px-2 py-1' : 'px-3 py-1'} bg-yellow-100/90 backdrop-blur-sm rounded-md shadow-sm border border-yellow-300`}>
                    <span className={`${isPhone ? 'text-xs' : ''} text-yellow-800 font-medium`}>{autoSelectedGEOSatellite.name}</span>
                </div>
            );
        }
        return null;
    }, [selectedSatellite, autoSelectedLEOSatellite, autoSelectedGEOSatellite, gsoAvoidanceActive, isPhone]);

    if (!indicator) return null;

    return (
        <div className={`absolute ${isPhone ? 'top-10' : 'top-12'} left-2 z-10`}>
            {indicator}
        </div>
    );
};

export default React.memo(SatelliteIndicator);
