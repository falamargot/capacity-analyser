/**
 * React Hook for Air Traffic Management
 * Handles real-time aircraft data fetching, filtering, and interpolation
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Aircraft, getAircraftData, filterAircraftByView, clearAircraftCache } from './airTrafficService';
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
  // Keep the 500 most relevant aircraft (closest to the analysis point, or
  // highest altitude when no point is selected). This matches the maritime cap
  // and cuts the 60fps interpolation loop from ~6000 to ~500 entries — a 12×
  // reduction in per-frame work. The service still fetches and caches the full
  // global dataset; only the display list is capped.
  maxAircraft: 500,
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

  // focusPoint changes on every earth click (selectedPosition). Using a ref
  // prevents updateAircraft from being recreated on each click, which previously
  // caused the polling interval to be torn down and a spurious fetch to fire.
  const focusPointRef = useRef(focusPoint);
  focusPointRef.current = focusPoint;

  const cameraBoundsRef = useRef(cameraBounds);
  cameraBoundsRef.current = cameraBounds;

  // Update aircraft data
  const updateAircraft = useCallback(async () => {
    if (!finalConfig.enabled) return;

    log('🛩️ Air traffic: Fetching aircraft data...');

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const allAircraft = await getAircraftData(focusPointRef.current);

      // Read from refs — no dep needed, always current when callback fires.
      const filteredAircraft = filterAircraftByView(
        allAircraft,
        cameraBoundsRef.current,
        focusPointRef.current,
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
  }, [finalConfig]); // cameraBounds/focusPoint read via refs

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
      // Release the service-level cache so the full OpenSky dataset is not
      // retained in memory while the feature is inactive.
      clearAircraftCache();
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
 * Interpolated position fields written into the per-aircraft map entry.
 * Using a dedicated type avoids spreading full Aircraft objects at 60fps.
 */
export interface AircraftInterpolation {
  latitude: number;
  longitude: number;
  altitude_km: number;
  heading: number;
}

/**
 * Hook for interpolating aircraft positions between updates.
 *
 * Phase-2 change: returns a stable MutableRefObject<Map> instead of React state.
 * The RAF loop writes directly into the map at 60fps — zero setState calls —
 * so App.tsx and the React tree are never re-rendered by the interpolation.
 * The Cesium CallbackPositionProperty reads from the map on each Cesium frame.
 */
export function useAirTrafficInterpolation(
  aircraft: Aircraft[],
  enabled: boolean = true
): React.MutableRefObject<Map<string, AircraftInterpolation>> {
  const interpolatedMapRef = useRef<Map<string, AircraftInterpolation>>(new Map());
  const previousAircraftRef = useRef<Aircraft[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Seed the map with raw positions so the first frame is correct
    if (!enabled) {
      const map = interpolatedMapRef.current;
      map.clear();
      for (const ac of aircraft) {
        map.set(ac.icao24, {
          latitude: ac.latitude || 0,
          longitude: ac.longitude || 0,
          altitude_km: ac.altitude_km || 10,
          heading: ac.heading || 0,
        });
      }
      previousAircraftRef.current = aircraft;
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const previousAircraft = previousAircraftRef.current;
    previousAircraftRef.current = aircraft;

    if (previousAircraft.length === 0) {
      const map = interpolatedMapRef.current;
      map.clear();
      for (const ac of aircraft) {
        map.set(ac.icao24, {
          latitude: ac.latitude || 0,
          longitude: ac.longitude || 0,
          altitude_km: ac.altitude_km || 10,
          heading: ac.heading || 0,
        });
      }
      return;
    }

    const previousIndex = new Map(
      previousAircraft.map((prev) => [prev.icao24, prev] as const)
    );

    let startTime: number | null = null;
    const duration = 2000; // 2 seconds for smooth transition

    const interpolate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

      const map = interpolatedMapRef.current;
      // Remove entries for aircraft that left the view
      for (const id of map.keys()) {
        if (!previousIndex.has(id)) map.delete(id);
      }

      for (const newAc of aircraft) {
        const prevAc = previousIndex.get(newAc.icao24);
        if (!prevAc) {
          map.set(newAc.icao24, {
            latitude: newAc.latitude || 0,
            longitude: newAc.longitude || 0,
            altitude_km: newAc.altitude_km || 10,
            heading: newAc.heading || 0,
          });
          continue;
        }
        map.set(newAc.icao24, {
          latitude: (prevAc.latitude || 0) + ((newAc.latitude || 0) - (prevAc.latitude || 0)) * easeProgress,
          longitude: (prevAc.longitude || 0) + ((newAc.longitude || 0) - (prevAc.longitude || 0)) * easeProgress,
          altitude_km: (prevAc.altitude_km || 0) + ((newAc.altitude_km || 0) - (prevAc.altitude_km || 0)) * easeProgress,
          heading: (prevAc.heading || 0) + ((newAc.heading || 0) - (prevAc.heading || 0)) * easeProgress,
        });
      }

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

  return interpolatedMapRef;
}
