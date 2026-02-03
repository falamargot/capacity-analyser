/**
 * SnpLayer - Renders SNP (Satellite Network Portal) ground stations
 */
import React, { useMemo, useCallback } from 'react';
import { Entity } from 'resium';
import {
    Cartesian3,
    Color,
    CallbackProperty,
    Viewer as CesiumViewerType
} from 'cesium';
import { SNPS_DATA, SNPData } from '../globe/GlobeConfig';
import { getPosition, DPR_FACTOR, calculateDynamicScale } from './utils';
import type { SatelliteScope } from '../SatelliteScopeFilter';

interface SnpLayerProps {
    satelliteScope: SatelliteScope;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    sizeScale?: number;
}

const SnpEntity = React.memo<{
    snp: SNPData;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    sizeScale: number;
}>(({
    snp,
    viewerRef,
    onSnpClick,
    onSnpHover,
    sizeScale
}) => {
    const position = useMemo(
        () => getPosition(snp.lat, snp.lng, 0.01),
        [snp.lat, snp.lng]
    );

    // Create stable pixel size callback
    const pixelSizeCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 8;

            const snpPosition = getPosition(snp.lat, snp.lng, 0.01);
            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, snpPosition);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 2000000);
            return baseScale * 20 * sizeScale;
        }, false);
    }, [snp.lat, snp.lng, viewerRef, sizeScale]);

    const handleClick = useCallback(() => onSnpClick(snp.name), [snp.name, onSnpClick]);
    const handleMouseEnter = useCallback(() => onSnpHover(snp.name), [snp.name, onSnpHover]);
    const handleMouseLeave = useCallback(() => onSnpHover(null), [onSnpHover]);

    return (
        <Entity
            position={position}
            point={{
                pixelSize: pixelSizeCallback,
                color: Color.ORANGE,
                disableDepthTestDistance: 0
            }}
            name={snp.name}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        />
    );
});

SnpEntity.displayName = 'SnpEntity';

const SnpLayer: React.FC<SnpLayerProps> = ({
    satelliteScope,
    onSnpClick,
    onSnpHover,
    viewerRef,
    sizeScale = 1
}) => {
    // Don't render SNPs for GEO-only scope
    if (satelliteScope === 'GEO') {
        return null;
    }

    // Memoize SNP entities
    const snpEntities = useMemo(() => {
        return SNPS_DATA.map((snp) => (
            <SnpEntity
                key={snp.name}
                snp={snp}
                viewerRef={viewerRef}
                onSnpClick={onSnpClick}
                onSnpHover={onSnpHover}
                sizeScale={sizeScale}
            />
        ));
    }, [viewerRef, onSnpClick, onSnpHover, sizeScale]);

    return <>{snpEntities}</>;
};

export default React.memo(SnpLayer);
