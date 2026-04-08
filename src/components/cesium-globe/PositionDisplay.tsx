/**
 * PositionDisplay - Shows current time and selected position
 */
import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import { formatCoordinates } from '../../utils/formatters';

interface PositionDisplayProps {
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    isPhone?: boolean;
}

const PositionDisplay: React.FC<PositionDisplayProps> = ({
    selectedPosition,
    selectedAircraft,
    isPhone = false
}) => {
    // Update time every second
    const [currentTime, setCurrentTime] = useState(() => new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formattedTime = useMemo(
        () => isPhone ? format(currentTime, "HH:mm:ss") : format(currentTime, "yyyy-MM-dd HH:mm:ss 'UTC'"),
        [currentTime, isPhone]
    );

    const positionInfo = useMemo(() => {
        if (!selectedPosition && !selectedAircraft) return null;

        const lat = selectedAircraft?.latitude || selectedPosition?.lat || 0;
        const lng = selectedAircraft?.longitude || selectedPosition?.lng || 0;

        return {
            coords: formatCoordinates({ lat, lng }),
            altitude: selectedAircraft?.altitude_km || selectedPosition?.altitude
        };
    }, [selectedAircraft, selectedPosition]);

    if (isPhone) {
        return null;
    }

    return (
        <div className={`absolute top-2 left-0.5 z-10 ${isPhone ? 'bg-white/90 px-2 py-1 rounded-md shadow-sm' : 'bg-white/80 px-3 py-1 rounded-md shadow-sm'}`}>
            <div className={`flex items-center ${isPhone ? 'gap-2' : 'gap-4'}`}>
                <span className={`${isPhone ? 'text-gray-700 text-xs font-medium' : 'text-gray-700 font-medium'}`}>
                    {formattedTime}
                </span>
                {positionInfo && (
                    <span className={`${isPhone ? 'text-gray-600 text-xs' : 'text-gray-600 text-sm'}`}>
                        {isPhone ? '' : 'Position: '}{positionInfo.coords}
                        {positionInfo.altitude && (
                            <span className="ml-1">
                                ({positionInfo.altitude.toFixed(1)} km)
                            </span>
                        )}
                    </span>
                )}
            </div>
        </div>
    );
};

export default React.memo(PositionDisplay);
