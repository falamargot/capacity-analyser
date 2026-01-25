import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Aircraft } from '../modules/airTraffic/airTrafficService';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AircraftDetailsProps {
  aircraft: Aircraft[];
  selectedAircraft?: Aircraft | null;
  onAircraftSelect?: (aircraft: Aircraft) => void;
  enabled: boolean;
}

type SortColumn = 'callsign' | 'altitude' | 'speed' | 'heading';
type SortDirection = 'asc' | 'desc';

const AircraftDetails: React.FC<AircraftDetailsProps> = ({
  aircraft,
  selectedAircraft,
  onAircraftSelect,
  enabled
}) => {
  const [sortColumn, setSortColumn] = useState<SortColumn>('callsign');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const selectedAircraftRef = useRef<HTMLDivElement>(null);

  // Scroll selected aircraft into view
  useEffect(() => {
    if (selectedAircraft && selectedAircraftRef.current) {
      selectedAircraftRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedAircraft]);

  // Filter and sort aircraft
  const sortedAircraft = useMemo(() => {
    let filtered = aircraft.filter(ac => 
      ac.callsign.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ac.icao24.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'callsign':
          aVal = a.callsign;
          bVal = b.callsign;
          break;
        case 'altitude':
          aVal = a.altitude_km || 0;
          bVal = b.altitude_km || 0;
          break;
        case 'speed':
          aVal = a.speed_kmh || 0;
          bVal = b.speed_kmh || 0;
          break;
        case 'heading':
          aVal = a.heading || 0;
          bVal = b.heading || 0;
          break;
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return filtered;
  }, [aircraft, searchQuery, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <div className="w-4 h-4" />;
    return sortDirection === 'asc' 
      ? <ChevronUp size={16} className="text-blue-600" />
      : <ChevronDown size={16} className="text-blue-600" />;
  };

  if (!enabled) {
    return (
      <div className="h-full bg-white rounded-lg shadow-lg overflow-hidden flex flex-col items-center justify-center p-4">
        <p className="text-gray-400">Commercial Flights disabled</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-gray-800">
            Commercial Flights
          </h2>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
            {sortedAircraft.length} flights
          </span>
        </div>
        
        <input
          type="text"
          placeholder="Search by callsign or ICAO..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 sticky top-0">
        <button
          onClick={() => handleSort('callsign')}
          className="col-span-3 flex items-center gap-1 hover:text-gray-900 text-left"
        >
          Callsign <SortIcon column="callsign" />
        </button>
        <button
          onClick={() => handleSort('altitude')}
          className="col-span-2 flex items-center gap-1 hover:text-gray-900 text-right"
        >
          <SortIcon column="altitude" /> Altitude
        </button>
        <button
          onClick={() => handleSort('speed')}
          className="col-span-2 flex items-center gap-1 hover:text-gray-900 text-right"
        >
          <SortIcon column="speed" /> Speed
        </button>
        <button
          onClick={() => handleSort('heading')}
          className="col-span-2 flex items-center gap-1 hover:text-gray-900 text-right"
        >
          <SortIcon column="heading" /> Heading
        </button>
        <div className="col-span-3 text-right">ICAO</div>
      </div>

      {/* Aircraft List */}
      <div className="flex-1 overflow-y-auto">
        {sortedAircraft.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>No commercial flights detected</p>
          </div>
        ) : (
          sortedAircraft.map((ac) => (
            <div
              key={ac.icao24}
              ref={selectedAircraft?.icao24 === ac.icao24 ? selectedAircraftRef : null}
              onClick={() => onAircraftSelect?.(ac)}
              className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors ${
                selectedAircraft?.icao24 === ac.icao24 ? 'bg-blue-100' : ''
              }`}
            >
              <div className="col-span-3">
                <p className="font-semibold text-gray-900">{ac.callsign}</p>
                <p className="text-xs text-gray-500">
                  {ac.latitude?.toFixed(2)}°, {ac.longitude?.toFixed(2)}°
                </p>
              </div>
              <div className="col-span-2 text-right">
                <p className="font-medium text-gray-900">
                  {ac.altitude_km?.toFixed(1) || 'N/A'} km
                </p>
                <p className="text-xs text-gray-500">
                  {(ac.baro_altitude || 0).toLocaleString()} m
                </p>
              </div>
              <div className="col-span-2 text-right">
                <p className="font-medium text-gray-900">
                  {ac.speed_kmh?.toFixed(0) || 'N/A'} km/h
                </p>
                <p className="text-xs text-gray-500">
                  {ac.velocity?.toFixed(1) || 'N/A'} m/s
                </p>
              </div>
              <div className="col-span-2 text-right">
                <p className="font-medium text-gray-900">
                  {ac.heading?.toFixed(0) || 'N/A'}°
                </p>
                <p className="text-xs text-gray-500">
                  {ac.on_ground ? 'On ground' : 'In flight'}
                </p>
              </div>
              <div className="col-span-3 text-right">
                <p className="font-mono text-sm text-gray-600">{ac.icao24}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Aircraft Details */}
      {selectedAircraft && (
        <div className="border-t border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Selected Aircraft Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Callsign</p>
              <p className="font-semibold text-gray-900">{selectedAircraft.callsign}</p>
            </div>
            <div>
              <p className="text-gray-500">ICAO 24-bit</p>
              <p className="font-semibold text-gray-900">{selectedAircraft.icao24}</p>
            </div>
            <div>
              <p className="text-gray-500">Altitude</p>
              <p className="font-semibold text-gray-900">
                {selectedAircraft.altitude_km?.toFixed(2) || 'N/A'} km
              </p>
            </div>
            <div>
              <p className="text-gray-500">Speed</p>
              <p className="font-semibold text-gray-900">
                {selectedAircraft.speed_kmh?.toFixed(0) || 'N/A'} km/h
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Coordinates</p>
              <p className="font-semibold text-gray-900">
                {selectedAircraft.latitude?.toFixed(4)}°, {selectedAircraft.longitude?.toFixed(4)}°
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AircraftDetails;
