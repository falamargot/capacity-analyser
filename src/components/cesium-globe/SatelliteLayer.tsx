/**
 * SatelliteLayer - Renders all satellite entities with optimized callbacks
 */
import React, { useMemo, useCallback } from 'react';
import { Entity } from 'resium';
import {
    Cartesian3,
    Color,
    VerticalOrigin,
    CallbackProperty,
    Viewer as CesiumViewerType
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { SATELLITE_GLYPH, DPR_FACTOR, calculateDynamicScale, getPosition } from './utils';
import { usePositionCallbacks } from './hooks';

interface SatelliteLayerProps {
    satellites: SatelliteData[];
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    satelliteHighlight?: boolean;
}

const SatelliteEntity = React.memo<{
    sat: SatelliteData;
    isManuallySelected: boolean;
    isAutoSelected: boolean;
    positionCallback: any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    satelliteHighlight: boolean;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
}>(({
    sat,
    isManuallySelected,
    isAutoSelected,
    positionCallback,
    viewerRef,
    satelliteHighlight,
    onSatelliteClick,
    onSatelliteHover
}) => {
    const isHighlighted = isManuallySelected || isAutoSelected;

    // Create stable scale callback - only depends on stable references
    const scaleCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 0.6;

            let satellitePosition: Cartesian3;
            try {
                satellitePosition = positionCallback.getValue(
                    viewerRef.current.clock.currentTime
                ) as Cartesian3;
            } catch {
                satellitePosition = getPosition(
                    sat.position.lat,
                    sat.position.lng,
                    sat.position.alt
                );
            }

            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, satellitePosition);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            // Apply satellite highlight (4x size) and selection highlight
            const highlightMultiplier = satelliteHighlight ? 4 : 1;
            const baseScale =
                dynamicScale * (sat.type === 'EUTELSAT' ? 10000000 : 2000000) / Math.max(distance, 2000000 * highlightMultiplier);

            return isHighlighted ? baseScale * 1.6 * highlightMultiplier : baseScale * highlightMultiplier;
        }, false);
    }, [sat.id, sat.type, sat.position.lat, sat.position.lng, sat.position.alt, isHighlighted, satelliteHighlight, positionCallback, viewerRef]);

    const handleClick = useCallback(() => onSatelliteClick(sat), [sat, onSatelliteClick]);
    const handleMouseEnter = useCallback(() => onSatelliteHover(sat.id), [sat.id, onSatelliteHover]);
    const handleMouseLeave = useCallback(() => onSatelliteHover(null), [onSatelliteHover]);

    const billboardColor = isManuallySelected
        ? Color.RED
        : sat.type === 'EUTELSAT'
            ? Color.ROYALBLUE
            : Color.PALEVIOLETRED;

    return (
        <Entity
            position={positionCallback}
            billboard={{
                image: SATELLITE_GLYPH,
                scale: scaleCallback,
                color: billboardColor,
                verticalOrigin: VerticalOrigin.CENTER
            }}
            name={sat.name}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        />
    );
});

SatelliteEntity.displayName = 'SatelliteEntity';

const SatelliteLayer: React.FC<SatelliteLayerProps> = ({
    satellites,
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    onSatelliteClick,
    onSatelliteHover,
    viewerRef,
    satelliteHighlight = false
}) => {
    const { getSatellitePositionCallback } = usePositionCallbacks(satellites, []);

    // Memoize satellite entities
    const satelliteEntities = useMemo(() => {
        return satellites.map((sat) => {
            const isManuallySelected = selectedSatellite?.id === sat.id;
            const isAutoSelected = autoSelectedLEOSatellite?.id === sat.id || autoSelectedGEOSatellite?.id === sat.id;
            const positionCallback = getSatellitePositionCallback(sat);

            return (
                <SatelliteEntity
                    key={sat.id}
                    sat={sat}
                    isManuallySelected={isManuallySelected}
                    isAutoSelected={isAutoSelected}
                    positionCallback={positionCallback}
                    viewerRef={viewerRef}
                    satelliteHighlight={satelliteHighlight}
                    onSatelliteClick={onSatelliteClick}
                    onSatelliteHover={onSatelliteHover}
                />
            );
        });
    }, [
        satellites,
        selectedSatellite?.id,
        autoSelectedLEOSatellite?.id,
        autoSelectedGEOSatellite?.id,
        getSatellitePositionCallback,
        viewerRef,
        satelliteHighlight,
        onSatelliteClick,
        onSatelliteHover
    ]);

    return <>{satelliteEntities}</>;
};

export default React.memo(SatelliteLayer);
