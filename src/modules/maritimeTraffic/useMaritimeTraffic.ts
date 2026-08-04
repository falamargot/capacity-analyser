/**
 * React Hook for Maritime Traffic Management
 * Handles real-time vessel data fetching, filtering, and interpolation
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { log } from '../../utils/logger';
import {
    Vessel,
    connectAISStream,
    disconnectAISStream,
    filterVesselsByView
} from './maritimeTrafficService';

export interface MaritimeTrafficState {
    vessels: Vessel[];
    isLoading: boolean;
    error: string | null;
    lastUpdate: number;
    totalCount: number;
    displayedCount: number;
}

export interface MaritimeTrafficConfig {
    enabled: boolean;
    updateInterval: number; // milliseconds
    minPriority: number;
    maxVessels: number;
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

const DEFAULT_CONFIG: MaritimeTrafficConfig = {
    enabled: false,
    updateInterval: 5000, // 5 seconds (was 20000)
    minPriority: 70,
    maxVessels: 500,
};

/**
 * Custom hook for managing maritime traffic data
 */
export function useMaritimeTraffic(
    config: Partial<MaritimeTrafficConfig> = {},
    cameraBounds: CameraBounds | null = null,
    _focusPoint: FocusPoint | null = null // Reserved for future distance-based filtering
) {
    const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

    const [state, setState] = useState<MaritimeTrafficState>({
        vessels: [],
        isLoading: false,
        error: null,
        lastUpdate: 0,
        totalCount: 0,
        displayedCount: 0,
    });

    const vesselMapRef = useRef<Map<string, Vessel>>(new Map());
    const cleanupRef = useRef<(() => void) | null>(null);
    const intervalRef = useRef<number | null>(null);

    // Handle vessel updates from WebSocket
    const handleVesselUpdate = useCallback((vessel: Vessel) => {
        vesselMapRef.current.set(vessel.mmsi, vessel);
    }, []);

    // Update displayed vessels based on filters
    const updateDisplayedVessels = useCallback(() => {
        if (!finalConfig.enabled) return;
        const allVessels = Array.from(vesselMapRef.current.values());
        const filteredVessels = filterVesselsByView(
            allVessels,
            cameraBounds,
            finalConfig.minPriority,
            finalConfig.maxVessels
        );

        if (allVessels.length > 0 || filteredVessels.length > 0) {
            log('🚢 Vessel update:', {
                totalVessels: allVessels.length,
                filteredVessels: filteredVessels.length,
                minPriority: finalConfig.minPriority,
                sampleVessel: filteredVessels[0] ? {
                    name: filteredVessels[0].name,
                    lat: filteredVessels[0].latitude,
                    lng: filteredVessels[0].longitude,
                    vesselType: filteredVessels[0].vesselType
                } : null
            });
        }

        setState(prev => ({
            ...prev,
            vessels: filteredVessels,
            isLoading: false,
            lastUpdate: Date.now(),
            totalCount: allVessels.length,
            displayedCount: filteredVessels.length,
        }));
    }, [cameraBounds, finalConfig.enabled, finalConfig.minPriority, finalConfig.maxVessels]);

    // Start/stop WebSocket based on enabled state
    useEffect(() => {
        if (!finalConfig.enabled) {
            // Cleanup and reset
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            disconnectAISStream();
            vesselMapRef.current.clear();
            setState({
                vessels: [],
                isLoading: false,
                error: null,
                lastUpdate: 0,
                totalCount: 0,
                displayedCount: 0,
            });
            return;
        }

        log('🚢 Maritime traffic: Connecting...');
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // Connect to maritime stream (server proxy -> AISStream).
            // connectAISStream handles fallback to mock when stream is unavailable.
            cleanupRef.current = connectAISStream(handleVesselUpdate, updateDisplayedVessels);

            intervalRef.current = window.setInterval(updateDisplayedVessels, finalConfig.updateInterval);
            setTimeout(updateDisplayedVessels, 100);
            setTimeout(updateDisplayedVessels, 800);

        } catch (error) {
            console.error('🚢 Maritime traffic: Connection error:', error);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Connection failed',
            }));
        }

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [finalConfig.enabled, finalConfig.updateInterval, handleVesselUpdate, updateDisplayedVessels]);

    // Update when camera bounds change
    useEffect(() => {
        if (finalConfig.enabled && vesselMapRef.current.size > 0) {
            updateDisplayedVessels();
        }
    }, [cameraBounds, finalConfig.enabled, updateDisplayedVessels]);

    // Manual refresh
    const refresh = useCallback(() => {
        updateDisplayedVessels();
    }, [updateDisplayedVessels]);

    return {
        ...state,
        config: finalConfig,
        refresh,
    };
}

/**
 * Interpolated position fields written into the per-vessel map entry.
 */
export interface VesselInterpolation {
    latitude: number;
    longitude: number;
    heading: number;
}

/**
 * Hook for interpolating vessel positions between updates.
 *
 * Phase-2 change: returns a stable MutableRefObject<Map> instead of React state.
 * The RAF loop mutates the map at 60fps without calling setState, eliminating
 * the 60fps App.tsx re-render chain caused by the previous implementation.
 */
export function useMaritimeTrafficInterpolation(
    vessels: Vessel[],
    enabled: boolean = true
): React.MutableRefObject<Map<string, VesselInterpolation>> {
    const interpolatedMapRef = useRef<Map<string, VesselInterpolation>>(new Map());
    const previousVesselsRef = useRef<Vessel[]>([]);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) {
            const map = interpolatedMapRef.current;
            map.clear();
            for (const v of vessels) {
                map.set(v.mmsi, {
                    latitude: v.latitude || 0,
                    longitude: v.longitude || 0,
                    heading: v.heading || v.course || 0,
                });
            }
            previousVesselsRef.current = vessels;
            return;
        }

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        const previousVessels = previousVesselsRef.current;
        previousVesselsRef.current = vessels;

        if (previousVessels.length === 0) {
            const map = interpolatedMapRef.current;
            map.clear();
            for (const v of vessels) {
                map.set(v.mmsi, {
                    latitude: v.latitude || 0,
                    longitude: v.longitude || 0,
                    heading: v.heading || v.course || 0,
                });
            }
            return;
        }

        const previousIndex = new Map(
            previousVessels.map((prev) => [prev.mmsi, prev] as const)
        );

        let startTime: number | null = null;
        const duration = 3000; // 3 seconds (vessels move slower)

        const interpolate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 3); // Cubic ease-out

            const map = interpolatedMapRef.current;
            for (const id of map.keys()) {
                if (!previousIndex.has(id)) map.delete(id);
            }

            for (const newV of vessels) {
                const prevV = previousIndex.get(newV.mmsi);
                if (!prevV) {
                    map.set(newV.mmsi, {
                        latitude: newV.latitude || 0,
                        longitude: newV.longitude || 0,
                        heading: newV.heading || newV.course || 0,
                    });
                    continue;
                }
                map.set(newV.mmsi, {
                    latitude: (prevV.latitude || 0) + ((newV.latitude || 0) - (prevV.latitude || 0)) * easeProgress,
                    longitude: (prevV.longitude || 0) + ((newV.longitude || 0) - (prevV.longitude || 0)) * easeProgress,
                    heading: interpolateHeading(prevV.heading || 0, newV.heading || 0, easeProgress),
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
    }, [vessels, enabled]);

    return interpolatedMapRef;
}

/**
 * Interpolate heading angles correctly (handle 0/360 wraparound)
 */
function interpolateHeading(from: number, to: number, progress: number): number {
    let diff = to - from;

    // Handle wraparound
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    let result = from + diff * progress;

    // Normalize to 0-360
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;

    return result;
}
