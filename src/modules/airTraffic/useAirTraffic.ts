/**
 * React Hook for Air Traffic Management
 * Handles real-time aircraft data fetching, filtering, and interpolation
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Aircraft, getAircraftData, filterAircraftByView } from './airTrafficService';
import { log } from '../../utils/logger';

export interface AirTrafficState {
  aircraft: Aircraft[];
  isLoading: boolean;
  error: string | null;
  lastUpdate: number;
}

export interface AirTrafficConfig {
  enabled: boolean;
  updateInterval: number; // milliseconds
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
  maxAircraft: 6000,
};

/**
 * Custom hook for managing air traffic data
 */
export function useAirTraffic(
  config: Partial<AirTrafficConfig> = {},
  cameraBounds: CameraBounds | null = null,
  focusPoint: FocusPoint | null = null
) {
  const finalConfig = useMemo(() => (
    {
      ...DEFAULT_CONFIG,
      ...config
    }
  ), [
    config.enabled,
    config.updateInterval,
    config.maxAircraft
  ]);
  
  const [state, setState] = useState<AirTrafficState>({
    aircraft: [],
    isLoading: false,
    error: null,
    lastUpdate: 0,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update aircraft data
  const updateAircraft = useCallback(async () => {
    if (!finalConfig.enabled) return;
    
    log('🛩️ Air traffic: Fetching aircraft data...');

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const allAircraft = await getAircraftData();

      // Filter aircraft based on view constraints
      const filteredAircraft = filterAircraftByView(
        allAircraft,
        cameraBounds,
        focusPoint,
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
  }, [finalConfig.enabled, finalConfig.updateInterval, updateAircraft]);


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
  const previousAircraftRef = useRef<Aircraft[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Smooth interpolation between previous and new positions
  useEffect(() => {
    if (!enabled) {
      setInterpolatedAircraft(aircraft);
      return;
    }

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const previousAircraft = previousAircraftRef.current;
    previousAircraftRef.current = [...aircraft];

    // If no previous data, set immediately
    if (previousAircraft.length === 0) {
      setInterpolatedAircraft(aircraft);
      return;
    }

    let startTime: number | null = null;
    const duration = 2000; // 2 seconds for smooth transition

    const interpolate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);

      // Use easing function for smoother motion
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

      const updatedAircraft = aircraft.map(newAc => {
        const prevAc = previousAircraft.find(p => p.icao24 === newAc.icao24);
        
        if (!prevAc) {
          // New aircraft, fade in
          return { ...newAc };
        }

        // Interpolate position
        const lat = (prevAc.latitude || 0) + ((newAc.latitude || 0) - (prevAc.latitude || 0)) * easeProgress;
        const lng = (prevAc.longitude || 0) + ((newAc.longitude || 0) - (prevAc.longitude || 0)) * easeProgress;
        const alt = (prevAc.altitude_km || 0) + ((newAc.altitude_km || 0) - (prevAc.altitude_km || 0)) * easeProgress;
        const speed = (prevAc.speed_kmh || 0) + ((newAc.speed_kmh || 0) - (prevAc.speed_kmh || 0)) * easeProgress;
        const heading = (prevAc.heading || 0) + ((newAc.heading || 0) - (prevAc.heading || 0)) * easeProgress;

        return {
          ...newAc,
          latitude: lat,
          longitude: lng,
          altitude_km: alt,
          speed_kmh: speed,
          heading: heading
        };
      });

      setInterpolatedAircraft(updatedAircraft);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(interpolate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(interpolate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [aircraft, enabled]);

  return interpolatedAircraft;
}
