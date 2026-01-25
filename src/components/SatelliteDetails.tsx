import { SatelliteData } from '../types/satellites';
import { formatCoordinates } from '../utils/formatters';
import { getNearestSNPInBackhaul } from '../services/coverageService';

interface SatelliteDetailsProps {
  satellites: SatelliteData[];
  selectedSatellite: SatelliteData;
}

const getSelectedSatellitePosition = (satellites: SatelliteData[], selectedSatellite: SatelliteData) => {
  const position = satellites.find(sat => sat.id === selectedSatellite.id)?.position;
  return (!position) ? { lat: 0, lng: 0 } : { lat: position.lat, lng: position.lng };
};

const SatelliteDetails: React.FC<SatelliteDetailsProps> = ({ satellites, selectedSatellite }) => {
  // Get current satellite position from the satellites array (real-time)
  const currentSatellite = satellites.find(sat => sat.id === selectedSatellite.id);
  
  // Calculate nearest SNP for LEO satellites using current position (real-time)
  const nearestSNP = currentSatellite?.type === 'ONEWEB' ? getNearestSNPInBackhaul(currentSatellite) : null;

  return (
    <div className="h-full bg-white rounded-lg shadow-lg overflow-hidden flex flex-col">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              Satellite Details
            </h2>
            <div className="text-sm text-gray-500">
              {selectedSatellite.name}
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            selectedSatellite.type === 'EUTELSAT' 
              ? 'bg-blue-100 text-blue-800' 
              : 'bg-pink-100 text-pink-800'
          }`}>
            {selectedSatellite.type}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
        <div className="sm:col-span-6 bg-gray-50 backdrop-blur-sm rounded-lg shadow-sm py-2 px-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Position</h3>
            <p className="text-lg font-semibold text-gray-900">
              {formatCoordinates(getSelectedSatellitePosition(satellites, selectedSatellite))}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Altitude: {(currentSatellite?.position.alt || selectedSatellite.position.alt).toFixed(0)} km
            </p>
          </div>

          <div className="sm:col-span-6 bg-gray-50 backdrop-blur-sm rounded-lg shadow-sm py-2 px-4">
            <h3 className="text-sm font-medium text-gray-500 mb-1">Capacity</h3>
            <p className="text-lg font-semibold text-gray-900">
              {selectedSatellite.capacity.maxThroughput.toLocaleString()} Gbps
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Availability: {(selectedSatellite.capacity.availability * 100).toFixed(2)}%
            </p>
          </div>
        </div>

        {/* Separate SNP Information Section */}
        {selectedSatellite.type === 'ONEWEB' && (
          <div className="mb-4">
            <div className="bg-gray-50 rounded-lg p-4">
              {nearestSNP ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">
                      Nearest SNP: <span className="font-medium text-gray-800">{nearestSNP.name} ({nearestSNP.distance.toFixed(0)} km, {nearestSNP.latency.toFixed(1)} ms latency)</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  Nearest SNP: <span className="font-medium text-gray-500">None</span>
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Frequency Bands</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="space-y-3">
              {Object.entries(selectedSatellite.capacity.bandwidth).map(([band, bandwidth]) => (
              <div key={band} className="flex items-center justify-between">
                <span className="text-gray-600 capitalize">{band.toUpperCase()}-band</span>
                  <span className="font-medium text-gray-900">{bandwidth} MHz</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-2">Coverage Areas</h3>
          <div className="bg-gray-50 rounded-lg p-4">
          {selectedSatellite.coverages && selectedSatellite.coverages.length > 0 ? (
            <ul className="space-y-1">
              {selectedSatellite.coverages.map((coverage, index) => (
                <li 
                  key={index}
                  className="text-sm text-gray-700 flex items-center"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                  {coverage.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 italic">No coverage areas defined</p>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SatelliteDetails;