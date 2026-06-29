/**
 * AircraftLayer - Renders all aircraft entities with optimized callbacks
 */
import React, { useMemo, useCallback, useRef } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
    Cartesian2,
    Cartesian3,
    Color,
    CallbackProperty,
    Math as CesiumMath,
    VerticalOrigin,
    HorizontalOrigin,
    Viewer as CesiumViewerType
} from 'cesium';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { AircraftInterpolation } from '../../modules/airTraffic/useAirTraffic';
import { PLANE_ICON, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import { usePositionCallbacks } from './hooks';
import { LABEL_EYE_OFFSET } from './layerHeights';

interface AircraftLayerProps {
    aircraft: Aircraft[];
    selectedAircraft?: Aircraft | null;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (aircraft: Aircraft | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    aircraftSizeScale?: number;
    interpolatedAircraftMapRef?: React.RefObject<Map<string, AircraftInterpolation>>;
}

const AircraftEntity = React.memo<{
    ac: Aircraft;
    isSelected: boolean;
    positionCallback: any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (aircraft: Aircraft | null) => void;
    aircraftSizeScale?: number;
    interpolatedAircraftMapRef?: React.RefObject<Map<string, AircraftInterpolation>>;
}>(({
    ac,
    isSelected,
    positionCallback,
    viewerRef,
    cameraMetricsRef,
    onAircraftClick,
    onAircraftHover,
    aircraftSizeScale = 1,
    interpolatedAircraftMapRef,
}) => {
    // Per-frame allocation hot path: previously called positionCallback.getValue()
    // which runs full dead-reckoning + allocates a fresh Cartesian3 every frame
    // (~600 aircraft × 60fps = real GC pressure). Now we build the aircraft
    // position into a closure-local scratch from the live ac fields — extrapolation
    // is irrelevant at camera-distance scale.
    // The callback reads `ac` via a ref so the CallbackProperty identity stays
    // stable across aircraft refreshes (no Cesium re-bind per fetch).
    const acRef = useRef(ac);
    acRef.current = ac;
    const scaleCallback = useMemo(() => {
        const scratchPos = new Cartesian3();
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 0.3;
            const liveAc = acRef.current;
            const lat = Number(liveAc.latitude);
            const lng = Number(liveAc.longitude);
            if (!isFinite(lat) || !isFinite(lng)) return 0.3;
            const altM = (Number(liveAc.altitude_km) || 10) * 1000;
            Cartesian3.fromDegrees(lng, lat, altM, undefined, scratchPos);

            const distance = Cartesian3.distance(cameraMetricsRef.current.position, scratchPos);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            const baseScale = dynamicScale * 2000000 / Math.max(distance, 10000000);
            return baseScale * aircraftSizeScale * (isSelected ? 1.25 : 1);
        }, false);
    }, [viewerRef, cameraMetricsRef, aircraftSizeScale, isSelected]);

    const handleClick = useCallback(() => onAircraftClick?.(ac), [ac, onAircraftClick]);
    const handleMouseEnter = useCallback(() => onAircraftHover?.(ac), [ac, onAircraftHover]);
    const handleMouseLeave = useCallback(() => onAircraftHover?.(null), [onAircraftHover]);

    const billboardColor = isSelected ? Color.RED : Color.LIGHTGOLDENRODYELLOW;

    const rotationCallback = useMemo(() => new CallbackProperty(() => {
        const heading = interpolatedAircraftMapRef?.current?.get(acRef.current.icao24)?.heading
            ?? acRef.current.heading
            ?? 0;
        return -CesiumMath.toRadians(heading);
    }, false), [interpolatedAircraftMapRef]);

    return (
        <>
            <Entity
                id={`aircraft-${ac.icao24}`}
                position={positionCallback}
                billboard={{
                    image: PLANE_ICON,
                    scale: scaleCallback,
                    color: billboardColor,
                    rotation: rotationCallback,
                    alignedAxis: Cartesian3.UNIT_Z
                }}
                name={ac.callsign || ac.icao24}
                description={`Heading: ${ac.heading || 'N/A'}°, Alt: ${ac.altitude_km?.toFixed(1) || 'N/A'}km, Speed: ${ac.speed_kmh?.toFixed(0) || 'N/A'}km/h`}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {isSelected && (
                    <LabelGraphics
                        text={ac.callsign}
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
        </>
    );
});

AircraftEntity.displayName = 'AircraftEntity';

const AircraftLayer: React.FC<AircraftLayerProps> = ({
    aircraft,
    selectedAircraft,
    onAircraftClick,
    onAircraftHover,
    viewerRef,
    cameraMetricsRef,
    aircraftSizeScale = 1,
    interpolatedAircraftMapRef,
}) => {
    const { getAircraftPositionCallback } = usePositionCallbacks([], aircraft, interpolatedAircraftMapRef);

    // Memoize aircraft entities
    const aircraftEntities = useMemo(() => {
        return aircraft.map((ac) => {
            const isSelected = selectedAircraft?.icao24 === ac.icao24;
            const positionCallback = getAircraftPositionCallback(ac);

            return (
                <AircraftEntity
                    key={ac.icao24}
                    ac={ac}
                    isSelected={isSelected}
                    positionCallback={positionCallback}
                    viewerRef={viewerRef}
                    cameraMetricsRef={cameraMetricsRef}
                    onAircraftClick={onAircraftClick}
                    onAircraftHover={onAircraftHover}
                    aircraftSizeScale={aircraftSizeScale}
                    interpolatedAircraftMapRef={interpolatedAircraftMapRef}
                />
            );
        });
    }, [
        aircraft,
        selectedAircraft?.icao24,
        getAircraftPositionCallback,
        viewerRef,
        cameraMetricsRef,
        onAircraftClick,
        onAircraftHover,
        aircraftSizeScale,
        interpolatedAircraftMapRef,
    ]);

    return <>{aircraftEntities}</>;
};

export default React.memo(AircraftLayer);
