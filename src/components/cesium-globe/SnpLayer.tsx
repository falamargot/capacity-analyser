/**
 * SnpLayer - Renders SNP (Satellite Network Portal) ground stations
 */
import React, { useMemo, useCallback } from 'react';
import { Entity, LabelGraphics, EllipseGraphics } from 'resium';
import {
    Cartesian3,
    Cartesian2,
    Color,
    CallbackProperty,
    VerticalOrigin,
    HorizontalOrigin,
    Viewer as CesiumViewerType
} from 'cesium';
import { BACKHAUL_RADIUS_KM } from '../../utils/leoFootprint';
import { SNPS_DATA, SNPData } from '../globe/GlobeConfig';
import { getPosition, DPR_FACTOR, calculateDynamicScale } from './utils';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { useSimulation } from '../../contexts/SimulationContext';

interface SnpLayerProps {
    satelliteScope: SatelliteScope;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    sizeScale?: number;
    autoSelectedSnpName?: string | null;
    inspectedSnpName?: string | null;
}

const SnpEntity = React.memo<{
    snp: SNPData;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    sizeScale: number;
    isAutoSelected: boolean;
    isFailed: boolean;
    isInspected: boolean;
}>(({
    snp,
    viewerRef,
    onSnpClick,
    onSnpHover,
    sizeScale,
    isAutoSelected,
    isFailed,
    isInspected
}) => {
    const position = useMemo(
        () => getPosition(snp.lat, snp.lng, 0.01),
        [snp.lat, snp.lng]
    );

    // Create stable pixel size callback
    const pixelSizeCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 6;

            const snpPosition = getPosition(snp.lat, snp.lng, 0.01);
            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, snpPosition);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 20 * sizeScale;
        }, false);
    }, [snp.lat, snp.lng, viewerRef, sizeScale]);

    const handleClick = useCallback(() => onSnpClick(snp.name), [snp.name, onSnpClick]);
    const handleMouseEnter = useCallback(() => onSnpHover(snp.name), [snp.name, onSnpHover]);
    const handleMouseLeave = useCallback(() => onSnpHover(null), [onSnpHover]);

    const pointColor = isFailed ? Color.RED : isInspected ? Color.WHITE : Color.ORANGE;
    const labelBgColor = isFailed
        ? Color.RED.withAlpha(0.8)
        : isInspected
            ? Color.ORANGE.withAlpha(0.9)
            : Color.ORANGE.withAlpha(0.7);
    const showLabel = isAutoSelected || isFailed || isInspected;

    return (
        <Entity
            id={`snp-${snp.name}`}
            position={position}
            point={{
                pixelSize: pixelSizeCallback,
                color: pointColor,
                outlineColor: isInspected ? Color.ORANGE : (isFailed ? Color.WHITE : undefined),
                outlineWidth: isInspected || isFailed ? 2 : 0,
                disableDepthTestDistance: 0
            }}
            name={snp.name}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {showLabel && (
                <LabelGraphics
                    text={isFailed ? `${snp.name} ✕` : snp.name}
                    font={isFailed ? "700 13px Inter, sans-serif" : isInspected ? "700 13px Inter, sans-serif" : "600 13px Inter, sans-serif"}
                    fillColor={Color.WHITE}
                    outlineWidth={3}
                    style={2}
                    showBackground={true}
                    backgroundColor={labelBgColor}
                    backgroundPadding={new Cartesian2(7, 4)}
                    pixelOffset={new Cartesian2(0, -20)}
                    verticalOrigin={VerticalOrigin.BOTTOM}
                    horizontalOrigin={HorizontalOrigin.CENTER}
                    disableDepthTestDistance={Number.POSITIVE_INFINITY}
                />
            )}
            {isInspected && (
                <EllipseGraphics
                    semiMajorAxis={BACKHAUL_RADIUS_KM * 1000}
                    semiMinorAxis={BACKHAUL_RADIUS_KM * 1000}
                    material={Color.ORANGE.withAlpha(0.18)}
                    outline={true}
                    outlineColor={Color.ORANGE.withAlpha(0.9)}
                    outlineWidth={3}
                    height={5000}
                    fill={true}
                />
            )}
        </Entity>
    );
});

SnpEntity.displayName = 'SnpEntity';

const SnpLayer: React.FC<SnpLayerProps> = ({
    satelliteScope,
    onSnpClick,
    onSnpHover,
    viewerRef,
    sizeScale = 1,
    autoSelectedSnpName = null,
    inspectedSnpName = null
}) => {
    const { failedSnps } = useSimulation();

    // Memoize SNP entities (hooks must run unconditionally)
    const snpEntities = useMemo(() => {
        return SNPS_DATA.map((snp) => (
            <SnpEntity
                key={snp.name}
                snp={snp}
                viewerRef={viewerRef}
                onSnpClick={onSnpClick}
                onSnpHover={onSnpHover}
                sizeScale={sizeScale}
                isAutoSelected={!!autoSelectedSnpName && snp.name === autoSelectedSnpName}
                isFailed={failedSnps.has(snp.name)}
                isInspected={!!inspectedSnpName && snp.name === inspectedSnpName}
            />
        ));
    }, [viewerRef, onSnpClick, onSnpHover, sizeScale, autoSelectedSnpName, inspectedSnpName, failedSnps]);

    // Don't render SNPs for GEO-only scope
    if (satelliteScope === 'GEO') {
        return null;
    }

    return <>{snpEntities}</>;
};

export default React.memo(SnpLayer);
