/**
 * SatelliteIndicator - Shows satellite status indicator at top of globe
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { JulianDate, Viewer as CesiumViewerType } from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { calculateGSOAvoidanceAngle } from '../../utils/oneWebComb';

interface SatelliteIndicatorProps {
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
}

const SatelliteIndicator: React.FC<SatelliteIndicatorProps> = ({
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    viewerRef
}) => {
    const [gsoAvoidanceActive, setGsoAvoidanceActive] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Determine which satellite to track for GSO avoidance
    const trackedSatellite = selectedSatellite || autoSelectedLEOSatellite;

    // Track satellite GSO Avoidance state
    useEffect(() => {
        // Clear previous interval
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (!trackedSatellite?.satrec || !viewerRef.current) {
            setGsoAvoidanceActive(false);
            return;
        }

        const checkGsoAvoidance = () => {
            if (!trackedSatellite.satrec) return;

            try {
                const now = new Date();
                const time = JulianDate.fromDate(now);
                const { isActive } = calculateGSOAvoidanceAngle(trackedSatellite.satrec, time);
                setGsoAvoidanceActive(isActive);
            } catch {
                setGsoAvoidanceActive(false);
            }
        };

        // Check immediately
        checkGsoAvoidance();

        // Then check every second
        intervalRef.current = setInterval(checkGsoAvoidance, 1000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [trackedSatellite?.id, trackedSatellite?.satrec, viewerRef]);

    // Memoize indicator content
    const indicator = useMemo(() => {
        if (selectedSatellite) {
            const isGsoActive = selectedSatellite.type === 'ONEWEB' && gsoAvoidanceActive;
            const bgClass = isGsoActive ? "bg-orange-100/90 border-orange-300" : "bg-green-100/90 border-green-300";
            const textClass = isGsoActive ? "text-orange-800" : "text-green-800";

            return (
                <div className={`backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border ${bgClass}`}>
                    <span className={`font-medium ${textClass}`}>
                        {selectedSatellite.name}
                        {selectedSatellite.type === 'ONEWEB' && (
                            <> ({gsoAvoidanceActive ? "GSO Avoidance Active" : "Normal Ops"})</>
                        )}
                    </span>
                </div>
            );
        }

        if (autoSelectedLEOSatellite && autoSelectedGEOSatellite) {
            return (
                <div className="bg-yellow-100/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-yellow-300">
                    <span className="text-yellow-800 font-medium">
                        {`${autoSelectedLEOSatellite.name} + ${autoSelectedGEOSatellite.name}`}
                    </span>
                </div>
            );
        }

        if (autoSelectedLEOSatellite) {
            const isGsoActive = autoSelectedLEOSatellite.type === 'ONEWEB' && gsoAvoidanceActive;
            const bgClass = isGsoActive ? "bg-orange-100/90 border-orange-300" : "bg-green-100/90 border-green-300";
            const textClass = isGsoActive ? "text-orange-800" : "text-green-800";

            return (
                <div className={`backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border ${bgClass}`}>
                    <span className={`font-medium ${textClass}`}>
                        {autoSelectedLEOSatellite.name}
                        {autoSelectedLEOSatellite.type === 'ONEWEB' && (
                            <> ({gsoAvoidanceActive ? "GSO Avoidance Active" : "Normal Ops"})</>
                        )}
                    </span>
                </div>
            );
        }

        if (autoSelectedGEOSatellite) {
            return (
                <div className="bg-yellow-100/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-yellow-300">
                    <span className="text-yellow-800 font-medium">{autoSelectedGEOSatellite.name}</span>
                </div>
            );
        }

        return null;
    }, [
        selectedSatellite,
        autoSelectedLEOSatellite,
        autoSelectedGEOSatellite,
        gsoAvoidanceActive
    ]);

    if (!indicator) {
        return null;
    }

    return (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-10">
            {indicator}
        </div>
    );
};

export default React.memo(SatelliteIndicator);
