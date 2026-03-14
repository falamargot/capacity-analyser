import { memo } from 'react';
import { formatCoordinates } from '../../utils/formatters';

interface AnalysisHeaderProps {
  activePoint: { lat: number; lng: number; altitude?: number } | null;
  selectedSNP: { name: string; region: string; lat: number; lng: number } | null;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  nearestLocation: { city: string; country: string } | null;
}

const AnalysisHeader = memo<AnalysisHeaderProps>(({
  activePoint,
  selectedSNP,
  analysisSource,
  aircraftCallsign,
  nearestLocation,
}) => (
  <div className="flex-none">
    <div className="flex items-center justify-between mb-2">
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          Capacity Analysis
          {activePoint && (
            <span className="ml-2 text-lg font-semibold text-gray-500 dark:text-gray-400">
              {selectedSNP
                ? `at ${selectedSNP.name}`
                : `at (${formatCoordinates({ lat: activePoint.lat, lng: activePoint.lng })})`}
            </span>
          )}
        </h2>
        {selectedSNP ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
            SNP Ground Station - {selectedSNP.region}
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Position: ({formatCoordinates({ lat: selectedSNP.lat, lng: selectedSNP.lng })})
            </div>
          </div>
        ) : analysisSource === 'aircraft' && aircraftCallsign ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
            <span>Aircraft: {aircraftCallsign}</span>
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
              Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Unknown'}
            </span>
          </div>
        ) : nearestLocation ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
            {nearestLocation.country}
            {nearestLocation.city && ` (Near ${nearestLocation.city})`}
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Ground level'}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1">
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Ground level'}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
));

AnalysisHeader.displayName = 'AnalysisHeader';
export default AnalysisHeader;
