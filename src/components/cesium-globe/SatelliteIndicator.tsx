/**
 * SatelliteIndicator - Shows satellite status indicator at top of globe
 */
import React, { useCallback, useMemo } from 'react';
import { Viewer as CesiumViewerType } from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { useGSOAvoidance } from '../../hooks/useGSOAvoidance';

interface SatelliteIndicatorProps {
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    isPhone?: boolean;
    isFullscreen?: boolean;
}

const getCompactSatelliteName = (satellite: SatelliteData) => {
    const parts = satellite.name.trim().split(/\s+/);

    if (satellite.type === 'EUTELSAT') {
        return parts.slice(0, 2).join(' ');
    }

    return parts[0] ?? satellite.name;
};

const typeChipClassName = (type: SatelliteData['type']) => (
    type === 'EUTELSAT'
        ? 'bg-blue-100/92 border-blue-300 text-blue-800'
        : 'bg-pink-100/92 border-pink-300 text-pink-800'
);

const SatelliteIndicator: React.FC<SatelliteIndicatorProps> = ({
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    isPhone = false,
    isFullscreen = false,
}) => {
    const indicatorContainerClassName = isPhone
        ? 'px-2.5 py-0.5 rounded-md'
        : 'px-3 py-1 rounded-md';
    const indicatorTextClassName = isPhone ? 'text-[12px] leading-5' : '';

    // Determine which satellite to track for GSO Protection
    const trackedSatellite = selectedSatellite || autoSelectedLEOSatellite;

    // Single shared hook — replaces duplicated setInterval (§2.4)
    const gsoData = useGSOAvoidance(
        trackedSatellite?.type === 'ONEWEB' ? trackedSatellite : null
    );
    const gsoAvoidanceActive = gsoData?.isGSOAvoidance ?? false;

    const renderChip = useCallback((satellite: SatelliteData, content?: React.ReactNode, maxWidthClassName = 'max-w-full') => (
        <div className={`${indicatorContainerClassName} min-w-0 ${maxWidthClassName} backdrop-blur-sm shadow-sm border ${typeChipClassName(satellite.type)}`}>
            <span className={`${indicatorTextClassName} block truncate font-medium`}>
                {content ?? (isPhone ? getCompactSatelliteName(satellite) : satellite.name)}
            </span>
        </div>
    ), [indicatorContainerClassName, indicatorTextClassName, isPhone]);

    const indicator = useMemo(() => {
        if (selectedSatellite) {
            return renderChip(
                selectedSatellite,
                selectedSatellite.type === 'ONEWEB' && !isPhone
                    ? <>{selectedSatellite.name} {gsoAvoidanceActive ? "(GSO Protection)" : ""}</>
                    : undefined
            );
        }
        if (autoSelectedLEOSatellite && autoSelectedGEOSatellite) {
            return (
                <div className="flex max-w-full items-start gap-1.5">
                    {renderChip(autoSelectedGEOSatellite, undefined, 'max-w-[calc((100vw-2.75rem)/2)]')}
                    {renderChip(autoSelectedLEOSatellite, undefined, 'max-w-[calc((100vw-2.75rem)/2)]')}
                </div>
            );
        }
        if (autoSelectedLEOSatellite) {
            return renderChip(
                autoSelectedLEOSatellite,
                autoSelectedLEOSatellite.type === 'ONEWEB' && !isPhone
                    ? <>{autoSelectedLEOSatellite.name} {gsoAvoidanceActive ? "(GSO Protection)" : ""}</>
                    : undefined
            );
        }
        if (autoSelectedGEOSatellite) {
            return renderChip(autoSelectedGEOSatellite);
        }
        return null;
    }, [
        selectedSatellite,
        autoSelectedLEOSatellite,
        autoSelectedGEOSatellite,
        gsoAvoidanceActive,
        isPhone,
        renderChip,
    ]);

    if (!indicator) return null;

    return (
        <div
            className={`absolute left-2 z-10 max-w-[calc(100vw-1rem)] ${
                isPhone
                    ? (isFullscreen
                        ? 'top-[calc(env(safe-area-inset-top)+0.5rem)]'
                        : 'top-[calc(env(safe-area-inset-top)+6rem)]')
                    : 'top-12'
            }`}
        >
            {indicator}
        </div>
    );
};

export default React.memo(SatelliteIndicator);
