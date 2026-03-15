import React from 'react';
import { Satellite } from 'lucide-react';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';

interface SatelliteSelectorProps {
  satellites: SatelliteData[];
  onSelect: (satellite: SatelliteData) => void;
  selectedSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
}

const SatelliteSelector: React.FC<SatelliteSelectorProps> = ({
  satellites,
  onSelect,
  selectedSatellite,
  satelliteScope
}) => {
  // Filter satellites based on scope
  const filteredSatellites = React.useMemo(() => {
    if (satelliteScope === 'ALL') {
      return satellites;
    }
    return satellites.filter(sat => sat.orbitType === satelliteScope);
  }, [satellites, satelliteScope]);

  // Sort satellites alphabetically by name
  const sortedSatellites = [...filteredSatellites].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="relative min-w-0 flex-1">
      <Satellite className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
      <select
        value={selectedSatellite?.id || ''}
        onChange={(e) => {
          const satellite = satellites.find(s => s.id === e.target.value);
          if (satellite) {
            onSelect(satellite);
          }
        }}
        className="w-full min-w-0 pl-10 pr-8 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
      >
        <option value="">Select a satellite</option>
        {sortedSatellites.map(sat => (
          <option key={sat.id} value={sat.id}>
            {sat.name}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </div>
  );
};

export default SatelliteSelector;
