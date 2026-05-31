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
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { useSimulation } from '../../contexts/SimulationContext';
import { FOOTPRINT_LAYER_HEIGHT_M, GROUND_POINT_ALTITUDE_KM, LABEL_EYE_OFFSET } from './layerHeights';

const SNP_MARKER_PIXEL_MULTIPLIER = 12;

interface SnpLayerProps {
    satelliteScope: SatelliteScope;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    sizeScale?: number;
    autoSelectedSnpName?: string | null;
    inspectedSnpName?: string | null;
    /** When non-null, only SNPs whose name is in this set are rendered.
     *  Null (default) renders all SNPs — engineering mode. */
    allowedSnpNames?: Set<string> | null;
}

const SnpEntity = React.memo<{
    snp: SNPData;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    sizeScale: number;
    isAutoSelected: boolean;
    isFailed: boolean;
    isInspected: boolean;
}>(({ 
    snp,
    viewerRef,
    cameraMetricsRef,
    onSnpClick,
    onSnpHover,
    sizeScale,
    isAutoSelected,
    isFailed,
    isInspected
}) => {
    const position = useMemo(
        () => getPosition(snp.lat, snp.lng, GROUND_POINT_ALTITUDE_KM),
        [snp.lat, snp.lng]
    );

    // Create stable pixel size callback
    const pixelSizeCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 6;

            const snpPosition = getPosition(snp.lat, snp.lng, GROUND_POINT_ALTITUDE_KM);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, snpPosition);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * SNP_MARKER_PIXEL_MULTIPLIER * sizeScale;
        }, false);
    }, [snp.lat, snp.lng, cameraMetricsRef, sizeScale, viewerRef]);

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
    const labelText = isFailed ? `SNP ${snp.name} ✕` : `SNP ${snp.name}`;

    return (
        <>
            {isInspected && (
                <Entity
                    id={`snp-backhaul-${snp.name}`}
                    position={position}
                    name={`${snp.name} backhaul`}
                >
                    <EllipseGraphics
                        semiMajorAxis={BACKHAUL_RADIUS_KM * 1000}
                        semiMinorAxis={BACKHAUL_RADIUS_KM * 1000}
                        material={Color.ORANGE.withAlpha(0.18)}
                        outline={true}
                        outlineColor={Color.ORANGE.withAlpha(0.9)}
                        outlineWidth={3}
                        height={FOOTPRINT_LAYER_HEIGHT_M}
                        fill={true}
                    />
                </Entity>
            )}
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
                name={`SNP ${snp.name}`}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                {showLabel && (
                    <LabelGraphics
                        text={labelText}
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
                        eyeOffset={LABEL_EYE_OFFSET}
                        disableDepthTestDistance={Number.POSITIVE_INFINITY}
                    />
                )}
            </Entity>
        </>
    );
});

SnpEntity.displayName = 'SnpEntity';

const SnpLayer: React.FC<SnpLayerProps> = ({
    satelliteScope,
    onSnpClick,
    onSnpHover,
    viewerRef,
    cameraMetricsRef,
    sizeScale = 1,
    autoSelectedSnpName = null,
    inspectedSnpName = null,
    allowedSnpNames = null,
}) => {
    const { failedSnps } = useSimulation();

    // Memoize SNP entities (hooks must run unconditionally)
    const snpEntities = useMemo(() => {
        const snpsToRender = allowedSnpNames != null
            ? SNPS_DATA.filter((snp) => allowedSnpNames.has(snp.name))
            : SNPS_DATA;
        return snpsToRender.map((snp) => (
            <SnpEntity
                key={snp.name}
                snp={snp}
                viewerRef={viewerRef}
                cameraMetricsRef={cameraMetricsRef}
                onSnpClick={onSnpClick}
                onSnpHover={onSnpHover}
                sizeScale={sizeScale}
                isAutoSelected={!!autoSelectedSnpName && snp.name === autoSelectedSnpName}
                isFailed={failedSnps.has(snp.name)}
                isInspected={!!inspectedSnpName && snp.name === inspectedSnpName}
            />
        ));
    }, [viewerRef, cameraMetricsRef, onSnpClick, onSnpHover, sizeScale, autoSelectedSnpName, inspectedSnpName, failedSnps, allowedSnpNames]);

    // Don't render SNPs for GEO-only scope
    if (satelliteScope === 'GEO') {
        return null;
    }

    return <>{snpEntities}</>;
};

export default React.memo(SnpLayer);
