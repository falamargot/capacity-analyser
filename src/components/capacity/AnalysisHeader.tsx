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
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 break-words">
          Capacity Analysis
          {activePoint && (
            <span className="mt-1 block text-base font-semibold text-gray-500 dark:text-gray-400 sm:ml-2 sm:mt-0 sm:inline sm:text-lg">
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
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1 flex flex-col gap-0.5 sm:flex-row sm:items-center">
            <span className="break-words">Aircraft: {aircraftCallsign}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500 sm:ml-2">
              Altitude: {activePoint?.altitude ? `${activePoint.altitude.toFixed(1)} km` : 'Unknown'}
            </span>
          </div>
        ) : nearestLocation ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.1 break-words">
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
