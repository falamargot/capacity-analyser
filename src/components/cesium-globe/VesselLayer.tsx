/**
 * VesselLayer - Renders all vessel entities with optimized callbacks
 */
import React, { useMemo, useCallback, useRef } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
    Cartesian2,
    Cartesian3,
    Color,
    CallbackProperty,
    CallbackPositionProperty,
    Math as CesiumMath,
    JulianDate,
    VerticalOrigin,
    HorizontalOrigin,
    Viewer as CesiumViewerType
} from 'cesium';
import type { Vessel } from '../../modules/maritimeTraffic/maritimeTrafficService';
import { VesselType, VESSEL_TYPE_CONFIG } from '../../modules/maritimeTraffic/maritimeTrafficService';
import type { VesselInterpolation } from '../../modules/maritimeTraffic/useMaritimeTraffic';
import { DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import { GROUND_POINT_LAYER_HEIGHT_M, LABEL_EYE_OFFSET } from './layerHeights';

// Simple boat icon - single rectangle oriented with vessel direction
const BOAT_ICON = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Crect x='4' y='10' width='16' height='4'/%3E%3C/svg%3E";

interface VesselLayerProps {
    vessels: Vessel[];
    selectedVessel?: Vessel | null;
    onVesselClick?: (vessel: Vessel | null) => void;
    onVesselHover?: (vessel: Vessel | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    vesselSizeScale?: number;
    interpolatedVesselMapRef?: React.RefObject<Map<string, VesselInterpolation>>;
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
            // Lift billboards slightly above ground overlays for a stable visual stack.
            return Cartesian3.fromDegrees(lng, lat, GROUND_POINT_LAYER_HEIGHT_M);
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
            GROUND_POINT_LAYER_HEIGHT_M
        );
    } catch {
        const lng = Number(vessel.longitude) || 0;
        const lat = Number(vessel.latitude) || 0;
        return Cartesian3.fromDegrees(lng, lat, GROUND_POINT_LAYER_HEIGHT_M);
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
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    onVesselClick?: (vessel: Vessel | null) => void;
    onVesselHover?: (vessel: Vessel | null) => void;
    vesselSizeScale?: number;
    interpolatedVesselMapRef?: React.RefObject<Map<string, VesselInterpolation>>;
}>(({
    vessel,
    isSelected,
    viewerRef,
    cameraMetricsRef,
    onVesselClick,
    onVesselHover,
    vesselSizeScale = 1,
    interpolatedVesselMapRef,
}) => {
    // Keep a ref to the latest vessel data so the position callback — created once
    // per vessel lifetime — always reads the freshest raw position as its fallback.
    const vesselRef = useRef(vessel);
    vesselRef.current = vessel;

    // Mutable DR proxy: allocated once per entity, mutated in the callback at 60fps
    // to avoid heap allocation on the hot path.
    const drProxyRef = useRef<Vessel>({ ...vessel });

    // Phase-2: positionCallback is stable (keyed on mmsi, not the full vessel object).
    // Dead reckoning from the DR proxy gives continuous motion. During the 3-second
    // interpolation window the proxy's lat/lng is overridden with the smoothly blended
    // position from the RAF map; after the window it falls back to the raw vessel position.
    const positionCallback = useMemo(() => {
        const mmsi = vessel.mmsi;
        return new CallbackProperty((time) => {
            const pos = interpolatedVesselMapRef?.current?.get(mmsi);
            const v = vesselRef.current;
            // Always sync the dynamic fields from the live vessel ref
            const dr = drProxyRef.current;
            dr.speed     = v.speed;
            dr.speed_kmh = v.speed_kmh;
            dr.lastUpdate = v.lastUpdate;
            if (pos) {
                // Blend: use interpolated lat/lng/heading as DR origin
                dr.latitude  = pos.latitude;
                dr.longitude = pos.longitude;
                dr.heading   = pos.heading;
                dr.course    = pos.heading;
            } else {
                dr.latitude  = Number(v.latitude);
                dr.longitude = Number(v.longitude);
                dr.heading   = Number(v.heading) || Number(v.course) || 0;
                dr.course    = dr.heading;
            }
            return calculateVesselDeadReckoning(dr, time as JulianDate);
        }, false) as CallbackPositionProperty;
    }, [vessel.mmsi, interpolatedVesselMapRef]);

    // Create stable scale callback
    const scaleCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 0.3;

            const vesselPosition = positionCallback.getValue(viewerRef.current.clock.currentTime);
            if (!vesselPosition) return 0.3;

            const distance = Cartesian3.distance(cameraMetricsRef.current.position, vesselPosition);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            // Keep vessels visible at global zoom levels (they sit at sea level).
            const baseScale = dynamicScale * 4000000 / Math.max(distance, 6000000);
            return Math.max(baseScale * vesselSizeScale, 0.12 * vesselSizeScale);
        }, false);
    }, [positionCallback, viewerRef, cameraMetricsRef, vesselSizeScale]);

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
            id={`vessel-${vessel.mmsi}`}
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
        >
            {isSelected && (
                <LabelGraphics
                    text={vessel.mmsi}
                    font="600 13px Inter, sans-serif"
                    fillColor={Color.WHITE}
                    outlineWidth={3}
                    style={2}
                    showBackground={true}
                    backgroundColor={Color.RED.withAlpha(0.7)}
                    backgroundPadding={new Cartesian2(7, 4)}
                    pixelOffset={new Cartesian2(0, -20)}
                    verticalOrigin={VerticalOrigin.BOTTOM}
                    horizontalOrigin={HorizontalOrigin.CENTER}
                    eyeOffset={LABEL_EYE_OFFSET}
                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                />
            )}
        </Entity>
    );
});

VesselEntity.displayName = 'VesselEntity';

const VesselLayer: React.FC<VesselLayerProps> = ({
    vessels,
    selectedVessel,
    onVesselClick,
    onVesselHover,
    viewerRef,
    cameraMetricsRef,
    vesselSizeScale = 1,
    interpolatedVesselMapRef,
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
                    cameraMetricsRef={cameraMetricsRef}
                    onVesselClick={onVesselClick}
                    onVesselHover={onVesselHover}
                    vesselSizeScale={vesselSizeScale}
                    interpolatedVesselMapRef={interpolatedVesselMapRef}
                />
            );
        });
    }, [
        vessels,
        selectedVessel?.mmsi,
        viewerRef,
        cameraMetricsRef,
        onVesselClick,
        onVesselHover,
        vesselSizeScale,
        interpolatedVesselMapRef,
    ]);

    return <>{vesselEntities}</>;
};

export default React.memo(VesselLayer);
