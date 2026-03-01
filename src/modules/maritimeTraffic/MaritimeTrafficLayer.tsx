/* eslint-disable react-refresh/only-export-components */
/**
 * Maritime Traffic Layer Component
 * Renders vessels as objects on the globe with tooltips and orientation
 * Note: This component provides utility functions for vessel rendering.
 * The actual Cesium rendering is handled by VesselLayer in cesium-globe.
 */

import React, { useMemo } from 'react';
import { Vessel, VesselType, VESSEL_TYPE_CONFIG } from './maritimeTrafficService';

export interface MaritimeTrafficLayerProps {
  vessels: Vessel[];
  enabled: boolean;
  onVesselClick?: (vessel: Vessel) => void;
  onVesselHover?: (vessel: Vessel | null) => void;
}

/**
 * Generate vessel object data for Globe rendering
 */
export function generateVesselObjects(vessels: Vessel[]): any[] {
  return vessels.map(vessel => {
    const config = VESSEL_TYPE_CONFIG[vessel.vesselType];

    return {
      type: 'vessel',
      id: vessel.mmsi,
      lat: vessel.latitude,
      lng: vessel.longitude,
      alt: 0.0001, // Sea level with slight offset for visibility
      heading: vessel.heading || vessel.course || 0,
      name: vessel.name,
      vesselType: vessel.vesselType,
      speed: vessel.speed,
      speed_kmh: vessel.speed_kmh,
      length: vessel.length,
      destination: vessel.destination,
      passengers: vessel.passengers,
      b2bPriority: vessel.b2bPriority,
      color: config.color,
      emoji: config.emoji,
      label: config.label,
    };
  });
}

/**
 * Generate tooltip content for a vessel
 */
export function generateVesselTooltip(vesselType: VesselType, vesselObj: any): string {
  const config = VESSEL_TYPE_CONFIG[vesselType];

  return `
    <div class="bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg text-sm min-w-[200px]">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xl">${config.emoji}</span>
        <div>
          <div class="font-bold text-gray-900">${vesselObj.name}</div>
          <div class="text-xs text-gray-500">${config.label}</div>
        </div>
      </div>
      <div class="text-xs text-gray-600 space-y-1">
        <div class="flex justify-between">
          <span>Speed:</span>
          <span class="font-medium">${vesselObj.speed_kmh ? vesselObj.speed_kmh.toFixed(1) : 'N/A'} km/h</span>
        </div>
        <div class="flex justify-between">
          <span>Heading:</span>
          <span class="font-medium">${vesselObj.heading ? Math.round(vesselObj.heading) : 'N/A'}°</span>
        </div>
        ${vesselObj.length ? `
        <div class="flex justify-between">
          <span>Length:</span>
          <span class="font-medium">${vesselObj.length}m</span>
        </div>
        ` : ''}
        ${vesselObj.destination ? `
        <div class="flex justify-between">
          <span>Destination:</span>
          <span class="font-medium">${vesselObj.destination}</span>
        </div>
        ` : ''}
        ${vesselObj.passengers ? `
        <div class="flex justify-between">
          <span>Passengers:</span>
          <span class="font-medium">${vesselObj.passengers.toLocaleString()}</span>
        </div>
        ` : ''}
        <div class="flex justify-between border-t border-gray-200 pt-1 mt-1">
          <span>B2B Priority:</span>
          <span class="font-medium text-blue-600">${vesselObj.b2bPriority}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Maritime Traffic Layer Component
 */
export const MaritimeTrafficLayer: React.FC<MaritimeTrafficLayerProps> = ({
  vessels,
  enabled,
}) => {
  // Generate vessel objects for globe rendering
  const vesselObjects = useMemo(() => {
    if (!enabled) return [];
    return generateVesselObjects(vessels);
  }, [vessels, enabled]);

  if (!enabled || vesselObjects.length === 0) {
    return null;
  }

  return (
    <div className="maritime-traffic-layer">
      {/* This component provides utility functions */}
      {/* The actual rendering is handled by VesselLayer in cesium-globe */}
    </div>
  );
};

export default MaritimeTrafficLayer;
