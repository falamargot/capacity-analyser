/**
 * AircraftLayer - Renders all aircraft entities with optimized callbacks
 */
import React, { useMemo, useCallback } from 'react';
import { Entity } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty,
    Math as CesiumMath,
    Viewer as CesiumViewerType
} from 'cesium';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import { PLANE_ICON, DPR_FACTOR, calculateDynamicScale } from './utils';
import { usePositionCallbacks } from './hooks';

interface AircraftLayerProps {
    aircraft: Aircraft[];
    selectedAircraft?: Aircraft | null;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (aircraft: Aircraft | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    aircraftSizeScale?: number;
}

const AircraftEntity = React.memo<{
    ac: Aircraft;
    isSelected: boolean;
    positionCallback: any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (aircraft: Aircraft | null) => void;
    aircraftSizeScale?: number;
}>(({
    ac,
    isSelected,
    positionCallback,
    viewerRef,
    onAircraftClick,
    onAircraftHover,
    aircraftSizeScale = 1
}) => {
    // Create stable scale callback
    const scaleCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 0.3;

            const aircraftPosition = positionCallback.getValue(viewerRef.current.clock.currentTime);
            if (!aircraftPosition) return 0.3;

            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, aircraftPosition);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            const baseScale = dynamicScale * 2000000 / Math.max(distance, 5000000);
            return baseScale * aircraftSizeScale;
        }, false);
    }, [positionCallback, viewerRef, aircraftSizeScale]);

    const handleClick = useCallback(() => onAircraftClick?.(ac), [ac, onAircraftClick]);
    const handleMouseEnter = useCallback(() => onAircraftHover?.(ac), [ac, onAircraftHover]);
    const handleMouseLeave = useCallback(() => onAircraftHover?.(null), [onAircraftHover]);

    const baseBillboardColor = isSelected ? Color.RED : Color.LIGHTGOLDENRODYELLOW;

    const billboardColor = useMemo(() => {
        return baseBillboardColor;
    }, [baseBillboardColor]);
    const rotation = -CesiumMath.toRadians(ac.heading || 0);

    return (
        <>
            <Entity
                position={positionCallback}
                billboard={{
                    image: PLANE_ICON,
                    scale: scaleCallback,
                    color: billboardColor,
                    rotation: rotation,
                    alignedAxis: Cartesian3.UNIT_Z
                }}
                name={ac.callsign || ac.icao24}
                description={`Heading: ${ac.heading || 'N/A'}°, Alt: ${ac.altitude_km?.toFixed(1) || 'N/A'}km, Speed: ${ac.speed_kmh?.toFixed(0) || 'N/A'}km/h`}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            />
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
    aircraftSizeScale = 1
}) => {
    const { getAircraftPositionCallback } = usePositionCallbacks([], aircraft);

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
                    onAircraftClick={onAircraftClick}
                    onAircraftHover={onAircraftHover}
                    aircraftSizeScale={aircraftSizeScale}
                />
            );
        });
    }, [
        aircraft,
        selectedAircraft?.icao24,
        getAircraftPositionCallback,
        viewerRef,
        onAircraftClick,
        onAircraftHover,
        aircraftSizeScale
    ]);

    return <>{aircraftEntities}</>;
};

export default React.memo(AircraftLayer);
