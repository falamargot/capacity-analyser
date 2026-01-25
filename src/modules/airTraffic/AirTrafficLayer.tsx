/**
 * Air Traffic Layer Component
 * Renders aircraft as 3D objects on the globe with tooltips and orientation
 */

import React, { useMemo } from 'react';
import { Aircraft } from './airTrafficService';

export interface AirTrafficLayerProps {
  aircraft: Aircraft[];
  enabled: boolean;
  onAircraftClick?: (aircraft: Aircraft) => void;
  onAircraftHover?: (aircraft: Aircraft | null) => void;
}

/**
 * Generate aircraft object data for Globe rendering
 */
function generateAircraftObjects(aircraft: Aircraft[]): any[] {
  return aircraft.map(ac => ({
    type: 'aircraft',
    id: ac.icao24,
    lat: ac.latitude,
    lng: ac.longitude,
    alt: ac.altitude_km ? ac.altitude_km * 0.001 : 0.008, // Convert to globe altitude units
    heading: ac.heading || 0,
    callsign: ac.callsign,
    altitude: ac.altitude_km,
    speed: ac.speed_kmh,
    velocity: ac.velocity,
    on_ground: ac.on_ground,
    last_contact: ac.last_contact,
  }));
}

/**
 * Air Traffic Layer Component
 */
export const AirTrafficLayer: React.FC<AirTrafficLayerProps> = ({
  aircraft,
  enabled,
  onAircraftClick,
  onAircraftHover,
}) => {
  // Generate aircraft objects for globe rendering
  const aircraftObjects = useMemo(() => {
    if (!enabled) return [];
    return generateAircraftObjects(aircraft);
  }, [aircraft, enabled]);

  // Handle aircraft click
  const handleAircraftClick = useCallback((aircraftObj: any, event: MouseEvent, coords: { lat: number; lng: number }) => {
    if (onAircraftClick) {
      // Find the original aircraft data
      const originalAircraft = aircraft.find(ac => ac.icao24 === aircraftObj.id);
      if (originalAircraft) {
        onAircraftClick(originalAircraft);
      }
    }
  }, [aircraft, onAircraftClick]);

  // Handle aircraft hover
  const handleAircraftHover = useCallback((aircraftObj: any | null) => {
    if (onAircraftHover) {
      if (aircraftObj) {
        // Find the original aircraft data
        const originalAircraft = aircraft.find(ac => ac.icao24 === aircraftObj.id);
        onAircraftHover(originalAircraft || null);
      } else {
        onAircraftHover(null);
      }
    }
  }, [aircraft, onAircraftHover]);

  // Generate tooltip content
  const generateTooltip = useCallback((aircraftObj: any) => {
    if (!aircraftObj) return null;
    
    return `
      <div class="bg-white/90 backdrop-blur-sm p-2 rounded-lg shadow-lg text-sm">
        <div class="font-bold text-gray-900">${aircraftObj.callsign || 'Unknown'}</div>
        <div class="text-xs text-gray-600 space-y-1">
          <div>Altitude: ${aircraftObj.altitude ? aircraftObj.altitude.toFixed(1) : 'N/A'} km</div>
          <div>Speed: ${aircraftObj.speed ? Math.round(aircraftObj.speed) : 'N/A'} km/h</div>
          <div>Heading: ${aircraftObj.heading ? Math.round(aircraftObj.heading) : 'N/A'}°</div>
        </div>
      </div>
    `;
  }, []);

  if (!enabled || aircraftObjects.length === 0) {
    return null;
  }

  return (
    <div className="air-traffic-layer">
      {/* This component will be integrated with the Globe component */}
      {/* The actual rendering will be handled by the Globe's object rendering system */}
    </div>
  );
};

export default AirTrafficLayer;
