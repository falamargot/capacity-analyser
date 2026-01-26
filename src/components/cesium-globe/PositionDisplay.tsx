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
}

const PositionDisplay: React.FC<PositionDisplayProps> = ({
    selectedPosition,
    selectedAircraft
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
        () => format(currentTime, "yyyy-MM-dd HH:mm:ss 'UTC'"),
        [currentTime]
    );

    const positionInfo = useMemo(() => {
        if (!selectedPosition && !selectedAircraft) return null;

        const lat = selectedAircraft?.latitude || selectedPosition?.lat || 0;
        const lng = selectedAircraft?.longitude || selectedPosition?.lng || 0;

        return {
            coords: formatCoordinates({ lat, lng }),
            altitude: selectedAircraft?.altitude_km || selectedPosition?.altitude
        };
    }, [
        selectedAircraft?.latitude,
        selectedAircraft?.longitude,
        selectedAircraft?.altitude_km,
        selectedPosition?.lat,
        selectedPosition?.lng,
        selectedPosition?.altitude
    ]);

    return (
        <div className="absolute top-2 left-2 z-10 bg-white/80 px-3 py-1 rounded-md shadow-sm">
            <div className="flex items-center gap-4">
                <span className="text-gray-700 font-medium">
                    {formattedTime}
                </span>
                {positionInfo && (
                    <span className="text-gray-600 text-sm">
                        Position: {positionInfo.coords}
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
