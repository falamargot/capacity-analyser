/**
 * VesselLayer - Renders all vessel entities with optimized callbacks
 */
import React, { useMemo, useCallback } from 'react';
import { Entity } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty,
    CallbackPositionProperty,
    Math as CesiumMath,
    JulianDate,
    Viewer as CesiumViewerType
} from 'cesium';
import type { Vessel } from '../../modules/maritimeTraffic/maritimeTrafficService';
import { VesselType, VESSEL_TYPE_CONFIG } from '../../modules/maritimeTraffic/maritimeTrafficService';
import { DPR_FACTOR, calculateDynamicScale } from './utils';

// Simple boat icon - single rectangle oriented with vessel direction
const BOAT_ICON = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Crect x='4' y='10' width='16' height='4'/%3E%3C/svg%3E";

interface VesselLayerProps {
    vessels: Vessel[];
    selectedVessel?: Vessel | null;
    onVesselClick?: (vessel: Vessel | null) => void;
    onVesselHover?: (vessel: Vessel | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    vesselSizeScale?: number;
}

/**
 * Calculate dead reckoning position for vessel
 */
const calculateVesselDeadReckoning = (vessel: Vessel, time: JulianDate): Cartesian3 => {
    try {
        const lat = Number(vessel.latitude);
        const lng = Number(vessel.longitude);
        const speed = Number(vessel.speed) || 0; // knots
        const heading = Number(vessel.heading) || Number(vessel.course) || 0;
        const lastUpdate = vessel.lastUpdate;

        if (!isFinite(lat) || !isFinite(lng)) {
            return Cartesian3.fromDegrees(0, 0, 0);
        }

        const now = JulianDate.toDate(time).getTime();
        const deltaT = (now - lastUpdate) / 1000; // seconds

        // Speed in knots to m/s: 1 knot = 0.514444 m/s
        const speedMs = speed * 0.514444;

        if (!isFinite(deltaT) || deltaT <= 0 || deltaT > 600 || speedMs === 0) {
            // Sea level with small offset for visibility
            return Cartesian3.fromDegrees(lng, lat, 50);
        }

        const R = 6371000; // Earth radius in meters
        const latRad = CesiumMath.toRadians(lat);
        const lngRad = CesiumMath.toRadians(lng);
        const headingRad = CesiumMath.toRadians(heading);
        const dOverR = (speedMs * deltaT) / R;

        const sinLat = Math.sin(latRad) * Math.cos(dOverR) +
            Math.cos(latRad) * Math.sin(dOverR) * Math.cos(headingRad);

        const clampedSinLat = Math.max(-1, Math.min(1, sinLat));
        const newLatRad = Math.asin(clampedSinLat);

        const y = Math.sin(headingRad) * Math.sin(dOverR) * Math.cos(latRad);
        const x = Math.cos(dOverR) - Math.sin(latRad) * Math.sin(newLatRad);
        const newLngRad = lngRad + Math.atan2(y, x);

        return Cartesian3.fromDegrees(
            CesiumMath.toDegrees(newLngRad),
            CesiumMath.toDegrees(newLatRad),
            50 // Sea level with small offset
        );
    } catch {
        const lng = Number(vessel.longitude) || 0;
        const lat = Number(vessel.latitude) || 0;
        return Cartesian3.fromDegrees(lng, lat, 50);
    }
};

/**
 * Get Cesium Color from vessel type
 */
const getVesselColor = (vesselType: VesselType, isSelected: boolean): Color => {
    if (isSelected) {
        return Color.RED;
    }

    const config = VESSEL_TYPE_CONFIG[vesselType];
    const hex = config.color;

    // Parse hex color
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    return new Color(r, g, b, 1.0);
};

const VesselEntity = React.memo<{
    vessel: Vessel;
    isSelected: boolean;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    onVesselClick?: (vessel: Vessel | null) => void;
    onVesselHover?: (vessel: Vessel | null) => void;
    vesselSizeScale?: number;
}>(({
    vessel,
    isSelected,
    viewerRef,
    onVesselClick,
    onVesselHover,
    vesselSizeScale = 1
}) => {
    // Create stable position callback with dead reckoning
    const positionCallback = useMemo(() => {
        return new CallbackProperty((time) => {
            return calculateVesselDeadReckoning(vessel, time as JulianDate);
        }, false) as CallbackPositionProperty;
    }, [vessel.mmsi, vessel.latitude, vessel.longitude, vessel.speed, vessel.heading, vessel.lastUpdate]);

    // Create stable scale callback
    const scaleCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 0.3;

            const vesselPosition = positionCallback.getValue(viewerRef.current.clock.currentTime);
            if (!vesselPosition) return 0.3;

            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, vesselPosition);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            // Vessels are larger than aircraft to be visible at sea level
            const baseScale = dynamicScale * 1500000 / Math.max(distance, 1000000); // Reduced from 3000000
            return baseScale * vesselSizeScale;
        }, false);
    }, [vessel.mmsi, isSelected, positionCallback, viewerRef, vesselSizeScale]);

    const handleClick = useCallback(() => onVesselClick?.(vessel), [vessel, onVesselClick]);
    const handleMouseEnter = useCallback(() => onVesselHover?.(vessel), [vessel, onVesselHover]);
    const handleMouseLeave = useCallback(() => onVesselHover?.(null), [onVesselHover]);

    const billboardColor = getVesselColor(vessel.vesselType, isSelected);
    const rotation = -CesiumMath.toRadians(vessel.heading || vessel.course || 0);

    const config = VESSEL_TYPE_CONFIG[vessel.vesselType];
    const description = `
        <div style="font-family: system-ui, sans-serif; padding: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 24px;">${config.emoji}</span>
                <div>
                    <div style="font-weight: bold; font-size: 14px;">${vessel.name}</div>
                    <div style="color: #666; font-size: 12px;">${config.label}</div>
                </div>
            </div>
            <div style="font-size: 12px; color: #444;">
                <div>Speed: ${vessel.speed_kmh?.toFixed(1) || 'N/A'} km/h (${vessel.speed?.toFixed(1) || 'N/A'} kn)</div>
                <div>Heading: ${vessel.heading ? Math.round(vessel.heading) : 'N/A'}°</div>
                ${vessel.length ? `<div>Length: ${vessel.length}m</div>` : ''}
                ${vessel.destination ? `<div>Destination: ${vessel.destination}</div>` : ''}
                ${vessel.passengers ? `<div>Passengers: ${vessel.passengers.toLocaleString()}</div>` : ''}
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                    <div>B2B Priority: <strong style="color: #2563eb;">${vessel.b2bPriority}</strong></div>
                </div>
            </div>
        </div>
    `;

    return (
        <Entity
            position={positionCallback}
            billboard={{
                image: BOAT_ICON,
                scale: scaleCallback,
                color: billboardColor,
                rotation: rotation,
                alignedAxis: Cartesian3.UNIT_Z
            }}
            name={vessel.name}
            description={description}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        />
    );
});

VesselEntity.displayName = 'VesselEntity';

const VesselLayer: React.FC<VesselLayerProps> = ({
    vessels,
    selectedVessel,
    onVesselClick,
    onVesselHover,
    viewerRef,
    vesselSizeScale = 1
}) => {
    // Memoize vessel entities
    const vesselEntities = useMemo(() => {
        return vessels.map((vessel) => {
            const isSelected = selectedVessel?.mmsi === vessel.mmsi;

            return (
                <VesselEntity
                    key={vessel.mmsi}
                    vessel={vessel}
                    isSelected={isSelected}
                    viewerRef={viewerRef}
                    onVesselClick={onVesselClick}
                    onVesselHover={onVesselHover}
                    vesselSizeScale={vesselSizeScale}
                />
            );
        });
    }, [
        vessels,
        selectedVessel?.mmsi,
        viewerRef,
        onVesselClick,
        onVesselHover,
        vesselSizeScale
    ]);

    return <>{vesselEntities}</>;
};

export default React.memo(VesselLayer);
