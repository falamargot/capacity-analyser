/**
 * SatelliteLayer - Renders all satellite entities with optimized callbacks
 */
import React, { useMemo, useCallback } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
    Cartesian3,
    Color,
    VerticalOrigin,
    HorizontalOrigin,
    Cartesian2,
    CallbackProperty,
    Viewer as CesiumViewerType
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { SATELLITE_GLYPH, LEO_SMOKED_GLYPH, DPR_FACTOR, calculateDynamicScale, getPosition } from './utils';

// Module-level constants — allocated once, never reallocated during rendering.
const LABEL_BACKGROUND_PADDING = new Cartesian2(7, 4);
const LABEL_PIXEL_OFFSET = new Cartesian2(0, -24);
import { usePositionCallbacks } from './hooks';

interface SatelliteLayerProps {
    satellites: SatelliteData[];
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    satelliteSizeScale?: number;
}

const SatelliteEntity = React.memo<{
    sat: SatelliteData;
    isManuallySelected: boolean;
    isAutoSelected: boolean;
    positionCallback: any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    satelliteSizeScale: number;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
}>(({
    sat,
    isManuallySelected,
    isAutoSelected,
    positionCallback,
    viewerRef,
    satelliteSizeScale,
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

            // Apply satellite size scale (no extra size for selected satellites)
            const baseScale =
                dynamicScale * (sat.type === 'EUTELSAT' ? 10000000 : 3000000) / Math.max(distance, 5000000);

            return baseScale * satelliteSizeScale;
        }, false);
    }, [sat.type, sat.position.lat, sat.position.lng, sat.position.alt, satelliteSizeScale, positionCallback, viewerRef]);

    const handleClick = useCallback(() => onSatelliteClick(sat), [sat, onSatelliteClick]);
    const handleMouseEnter = useCallback(() => onSatelliteHover(sat.id), [sat.id, onSatelliteHover]);
    const handleMouseLeave = useCallback(() => onSatelliteHover(null), [onSatelliteHover]);

    const baseBillboardColor = isManuallySelected
        ? Color.RED
        : sat.type === 'EUTELSAT'
            ? Color.ROYALBLUE
            : Color.DEEPPINK;

    const billboardColor = baseBillboardColor;

    return (
        <>
            <Entity
                id={`satellite-${sat.id}`}
                position={positionCallback}
                billboard={{
                    image: sat.type === 'ONEWEB' ? LEO_SMOKED_GLYPH : SATELLITE_GLYPH,
                    scale: scaleCallback,
                    color: billboardColor,
                    verticalOrigin: VerticalOrigin.CENTER
                }}
                name={sat.name}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {isHighlighted && (
                    <LabelGraphics
                        text={sat.name}
                        font="600 13px Inter, sans-serif"
                        fillColor={Color.WHITE}
                        outlineWidth={3}
                        style={2}
                        showBackground={true}
                        backgroundColor={sat.type === 'ONEWEB' ? Color.DEEPPINK.withAlpha(0.7) : Color.ROYALBLUE.withAlpha(0.7)}
                        backgroundPadding={LABEL_BACKGROUND_PADDING}
                        pixelOffset={LABEL_PIXEL_OFFSET}
                        verticalOrigin={VerticalOrigin.BOTTOM}
                        horizontalOrigin={HorizontalOrigin.CENTER}
                        disableDepthTestDistance={Number.POSITIVE_INFINITY}
                    />
                )}
            </Entity>
        </>
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
    satelliteSizeScale = 1
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
                    satelliteSizeScale={satelliteSizeScale}
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
        satelliteSizeScale,
        onSatelliteClick,
        onSatelliteHover
    ]);

    return <>{satelliteEntities}</>;
};

export default React.memo(SatelliteLayer);
