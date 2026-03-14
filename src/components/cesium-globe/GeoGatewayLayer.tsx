/**
 * GeoGatewayLayer - Renders Eutelsat Teleport Gateways for GEO scope
 */
import React, { useMemo, useCallback } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
    Cartesian2,
    Cartesian3,
    Color,
    CallbackProperty,
    HorizontalOrigin,
    VerticalOrigin,
    Viewer as CesiumViewerType
} from 'cesium';
import { GEO_GATEWAYS, GeoGatewayData } from '../globe/GlobeConfig';
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import type { SatelliteScope } from '../SatelliteScopeFilter';

const LABEL_BACKGROUND_PADDING = new Cartesian2(7, 4);
const LABEL_PIXEL_OFFSET = new Cartesian2(0, -20);

interface GeoGatewayLayerProps {
    satelliteScope: SatelliteScope;
    onGatewayClick: (gatewayName: string | null) => void;
    onGatewayHover: (gatewayName: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    selectedGatewayName?: string | null;
    sizeScale?: number;
}

const GeoGatewayEntity = React.memo<{
    gateway: GeoGatewayData;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    onGatewayClick: (gatewayName: string | null) => void;
    onGatewayHover: (gatewayName: string | null) => void;
    isSelected: boolean;
    sizeScale: number;
}>(({ 
    gateway,
    viewerRef,
    cameraMetricsRef,
    onGatewayClick,
    onGatewayHover,
    isSelected,
    sizeScale
}) => {
    const position = useMemo(
        () => getPosition(gateway.lat, gateway.lng, 0.01),
        [gateway.lat, gateway.lng]
    );

    // Create stable pixel size callback
    const pixelSizeCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 6;

            const gatewayPosition = getPosition(gateway.lat, gateway.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, gatewayPosition);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            const selectedBoost = isSelected ? 1.4 : 1.0;
            return baseScale * 20 * selectedBoost * (sizeScale || 1);
        }, false);
    }, [gateway.lat, gateway.lng, cameraMetricsRef, isSelected, sizeScale]);

    const handleClick = useCallback(() => onGatewayClick(gateway.name), [gateway.name, onGatewayClick]);
    const handleMouseEnter = useCallback(() => onGatewayHover(gateway.name), [gateway.name, onGatewayHover]);
    const handleMouseLeave = useCallback(() => onGatewayHover(null), [onGatewayHover]);

    return (
        <Entity
            position={position}
            point={{
                pixelSize: pixelSizeCallback,
                color: Color.CYAN,
                disableDepthTestDistance: 0
            }}
            name={`${gateway.name} (Teleport)`}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {isSelected && (
                <LabelGraphics
                    text={gateway.name}
                    font="600 13px Inter, sans-serif"
                    fillColor={Color.WHITE}
                    outlineWidth={3}
                    style={2}
                    showBackground={true}
                    backgroundColor={Color.CYAN.withAlpha(0.7)}
                    backgroundPadding={LABEL_BACKGROUND_PADDING}
                    pixelOffset={LABEL_PIXEL_OFFSET}
                    verticalOrigin={VerticalOrigin.BOTTOM}
                    horizontalOrigin={HorizontalOrigin.CENTER}
                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                />
            )}
        </Entity>
    );
});

GeoGatewayEntity.displayName = 'GeoGatewayEntity';

const GeoGatewayLayer: React.FC<GeoGatewayLayerProps> = ({
    satelliteScope,
    onGatewayClick,
    onGatewayHover,
    viewerRef,
    cameraMetricsRef,
    selectedGatewayName = null,
    sizeScale = 1
}) => {
    // Memoize Gateway entities (hooks must run unconditionally)
    const gatewayEntities = useMemo(() => {
        return GEO_GATEWAYS.map((gateway) => (
            <GeoGatewayEntity
                key={gateway.name}
                gateway={gateway}
                viewerRef={viewerRef}
                cameraMetricsRef={cameraMetricsRef}
                onGatewayClick={onGatewayClick}
                onGatewayHover={onGatewayHover}
                isSelected={selectedGatewayName === gateway.name}
                sizeScale={sizeScale}
            />
        ));
    }, [viewerRef, cameraMetricsRef, onGatewayClick, onGatewayHover, selectedGatewayName, sizeScale]);

    // Only render Gateways for GEO scope or ALL scope
    if (satelliteScope !== 'GEO' && satelliteScope !== 'ALL') {
        return null;
    }

    return <>{gatewayEntities}</>;
};

export default React.memo(GeoGatewayLayer);
