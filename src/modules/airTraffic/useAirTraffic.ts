/**
 * React Hook for Air Traffic Management
 * Handles real-time aircraft data fetching, filtering, and interpolation
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Aircraft, getAircraftData, filterAircraftByView } from './airTrafficService';

export interface AirTrafficState {
  aircraft: Aircraft[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: number;
}

export interface AirTrafficConfig {
  enabled: boolean;
  updateInterval: number; // milliseconds
  maxDistanceKm: number;
  maxAircraft: number;
}

export interface CameraBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface FocusPoint {
  lat: number;
  lng: number;
}

const DEFAULT_CONFIG: AirTrafficConfig = {
  enabled: false,
  updateInterval: 10000, // 10 seconds
  maxDistanceKm: 3000,
  maxAircraft: 3000,
};

/**
 * Custom hook for managing air traffic data
 */
export function useAirTraffic(
  config: Partial<AirTrafficConfig> = {},
  cameraBounds: CameraBounds | null = null,
  focusPoint: FocusPoint | null = null
) {
  const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  const [state, setState] = useState<AirTrafficState>({
    aircraft: [],
    isLoading: false,
    error: null,
    lastUpdate: 0,
  });

  const intervalRef = useRef<number | null>(null);

  // Update aircraft data
  const updateAircraft = useCallback(async () => {
    if (!finalConfig.enabled) return;
    
    console.log('🛩️ Air traffic: Fetching aircraft data...');

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const allAircraft = await getAircraftData();

      // Filter aircraft based on view constraints
      const filteredAircraft = filterAircraftByView(
        allAircraft,
        cameraBounds,
        focusPoint,
        finalConfig.maxDistanceKm,
        finalConfig.maxAircraft
      );

      setState({
        aircraft: filteredAircraft,
        isLoading: false,
        error: null,
        lastUpdate: Date.now(),
      });
    } catch (error) {
      console.error('🛩️ Air traffic: Error fetching data:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [finalConfig, cameraBounds, focusPoint]);

  // Start/stop polling based on enabled state
  useEffect(() => {
    if (!finalConfig.enabled) {
      // Clear existing interval and reset state
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setState({
        aircraft: [],
        isLoading: false,
        error: null,
        lastUpdate: 0,
      });
      return;
    }

    // Initial fetch
    updateAircraft();

    // Set up polling interval
    intervalRef.current = setInterval(updateAircraft, finalConfig.updateInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [finalConfig.enabled, finalConfig.updateInterval]);


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    ...state,
    config: finalConfig,
    refresh: updateAircraft,
  };
}

/**
 * Hook for interpolating aircraft positions between updates
 * Uses requestAnimationFrame for smooth motion
 */
export function useAirTrafficInterpolation(
  aircraft: Aircraft[],
  enabled: boolean = true
) {
  const [interpolatedAircraft, setInterpolatedAircraft] = useState<Aircraft[]>(aircraft);

  // Update state immediately when aircraft data changes
  useEffect(() => {
    setInterpolatedAircraft(aircraft);
  }, [aircraft, enabled]);

  return interpolatedAircraft;
}
