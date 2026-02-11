/**
 * GeoGatewayLayer - Renders Eutelsat Teleport Gateways for GEO scope
 */
import React, { useMemo, useCallback } from 'react';
import { Entity } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty,
    Viewer as CesiumViewerType
} from 'cesium';
import { GEO_GATEWAYS, GeoGatewayData } from '../globe/GlobeConfig';
import { getPosition, DPR_FACTOR, calculateDynamicScale } from './utils';
import type { SatelliteScope } from '../SatelliteScopeFilter';

interface GeoGatewayLayerProps {
    satelliteScope: SatelliteScope;
    onGatewayClick: (gatewayName: string | null) => void;
    onGatewayHover: (gatewayName: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    sizeScale?: number;
}

const GeoGatewayEntity = React.memo<{
    gateway: GeoGatewayData;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    onGatewayClick: (gatewayName: string | null) => void;
    onGatewayHover: (gatewayName: string | null) => void;
    sizeScale: number;
}>(({
    gateway,
    viewerRef,
    onGatewayClick,
    onGatewayHover,
    sizeScale
}) => {
    const position = useMemo(
        () => getPosition(gateway.lat, gateway.lng, 0.01),
        [gateway.lat, gateway.lng]
    );

    // Create stable pixel size callback
    const pixelSizeCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 8;

            const gatewayPosition = getPosition(gateway.lat, gateway.lng, 0.01);
            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, gatewayPosition);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            /*
              Base scale calculation:
              - dynamicScale: adjusts for DPR
              - 3000000: base size factor
              - distance: scales down as camera moves away
              - sizeScale: global user setting
              - * 25: base pixel size multiplier (slightly larger than SNPs)
             */
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 2000000);
            return baseScale * 25 * (sizeScale || 1);
        }, false);
    }, [gateway.lat, gateway.lng, viewerRef, sizeScale]);

    const handleClick = useCallback(() => onGatewayClick(gateway.name), [gateway.name, onGatewayClick]);
    const handleMouseEnter = useCallback(() => onGatewayHover(gateway.name), [gateway.name, onGatewayHover]);
    const handleMouseLeave = useCallback(() => onGatewayHover(null), [onGatewayHover]);

    return (
        <Entity
            position={position}
            point={{
                pixelSize: pixelSizeCallback,
                color: Color.CYAN, // Distinct color for Eutelsat gateways
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                disableDepthTestDistance: 0
            }}
            name={`${gateway.name} (Teleport)`}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        />
    );
});

GeoGatewayEntity.displayName = 'GeoGatewayEntity';

const GeoGatewayLayer: React.FC<GeoGatewayLayerProps> = ({
    satelliteScope,
    onGatewayClick,
    onGatewayHover,
    viewerRef,
    sizeScale = 1
}) => {
    // Only render Gateways for GEO scope
    if (satelliteScope !== 'GEO') {
        return null;
    }

    // Memoize Gateway entities
    const gatewayEntities = useMemo(() => {
        return GEO_GATEWAYS.map((gateway) => (
            <GeoGatewayEntity
                key={gateway.name}
                gateway={gateway}
                viewerRef={viewerRef}
                onGatewayClick={onGatewayClick}
                onGatewayHover={onGatewayHover}
                sizeScale={sizeScale}
            />
        ));
    }, [viewerRef, onGatewayClick, onGatewayHover, sizeScale, satelliteScope]);

    return <>{gatewayEntities}</>;
};

export default React.memo(GeoGatewayLayer);
