import React from 'react';
import { Plane, Power } from 'lucide-react';
import { Aircraft } from '../modules/airTraffic/airTrafficService';

interface AircraftSelectorProps {
  aircraft: Aircraft[];
  selectedAircraft?: Aircraft | null;
  onSelect: (aircraft: Aircraft | null) => void;
  liveModeEnabled: boolean;
  onToggleLiveMode: () => void;
}

const AircraftSelector: React.FC<AircraftSelectorProps> = ({
  aircraft,
  selectedAircraft,
  onSelect,
  liveModeEnabled,
  onToggleLiveMode
}) => {
  // Sort aircraft by callsign
  const sortedAircraft = [...aircraft].sort((a, b) => a.callsign.localeCompare(b.callsign));

  // Helper function to extract aircraft type from callsign
  const getAircraftType = (callsign: string): string => {
    // Extract airline code from callsign (first 2-3 characters)
    const airlineCode = callsign.substring(0, callsign.match(/^[A-Z]{2}\d+/) ? 2 : 3);

    // Map common airline codes to aircraft types
    const airlineTypes: Record<string, string> = {
      'AF': 'A320',      // Air France
      'LH': 'A320',      // Lufthansa  
      'BA': 'B777',      // British Airways
      'DL': 'B737',      // Delta
      'AA': 'B737',      // American Airlines
      'UA': 'B737',      // United Airlines
      'EK': 'A380',      // Emirates
      'QR': 'B777',      // Qatar Airways
      'EY': 'B787',      // Etihad
      'SQ': 'A350',      // Singapore Airlines
      'CX': 'B777',      // Cathay Pacific
      'JL': 'B777',      // Japan Airlines
      'NH': 'B787',      // ANA
      'CA': 'B737',      // Air China
      'MU': 'A320',      // China Eastern
      'CZ': 'B737',      // China Southern
      'TK': 'A330',      // Turkish Airlines
      'RY': 'B737',      // Ryanair
      'EZ': 'A320',      // easyJet
      'W6': 'A320',      // Wizz Air
      'FR': 'B737',      // Ryanair alternative
      'U2': 'A320',      // easyJet alternative
    };

    return airlineTypes[airlineCode] || '';
  };

  // Format aircraft display label
  const formatAircraftLabel = (callsign: string): string => {
    const aircraftType = getAircraftType(callsign);
    return aircraftType ? `${callsign} · ${aircraftType}` : callsign;
  };

  const handleAircraftSelect = (aircraftId: string) => {
    if (aircraftId === '') {
      onSelect(null);
      return;
    }
    const selected = aircraft.find(ac => ac.icao24 === aircraftId);
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
      <div className="relative min-w-0 flex-1">
        <Plane className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <select
          value={selectedAircraft?.icao24 || ''}
          onChange={(e) => handleAircraftSelect(e.target.value)}
          disabled={!liveModeEnabled}
          className="w-full min-w-0 pl-10 pr-8 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed transition-colors"
        >
          <option value="">
            {liveModeEnabled ? 'Select aircraft...' : 'Enable live mode'}
          </option>
          {sortedAircraft.map(ac => (
            <option key={ac.icao24} value={ac.icao24}>
              {formatAircraftLabel(ac.callsign)}
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

      <button
        onClick={onToggleLiveMode}
        className={`shrink-0 flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          liveModeEnabled
            ? 'bg-green-600 text-white hover:bg-green-700'
            : 'text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
        }`}
        title={liveModeEnabled ? 'Disable live aircraft data' : 'Enable live aircraft data'}
      >
        <Power className="h-4 w-4" />
      </button>
    </div>
  );
};

export default AircraftSelector;
