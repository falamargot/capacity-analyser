/**
 * GeoGatewayLayer - Renders GEO ground segment sites on the globe.
 */
import React, { useEffect, useMemo, useCallback } from 'react';
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
import type { GeoGatewayData } from '../globe/GlobeConfig';
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import { GROUND_POINT_ALTITUDE_KM, LABEL_EYE_OFFSET } from './layerHeights';
import {
    buildGeoGatewayMarkerMetadata,
    getGeoGatewaysForRendering,
    type GeoGatewayRenderMode,
} from './geoGatewayMarkerModel';
import { useSimulation } from '../../contexts/SimulationContext';
import { requestGlobeRender } from '../../utils/globeRenderRequest';

const OUT_OF_SERVICE_MARKER_COLOR = '#ef4444';
const OUT_OF_SERVICE_OUTLINE_COLOR = '#991b1b';

const GATEWAY_MARKER_PIXEL_MULTIPLIER = 12;
const SELECTED_GATEWAY_SIZE_BOOST = 1.2;
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
    /** When non-null, only gateways whose name is in this set are rendered.
     *  Null (default) renders all gateways — engineering mode. */
    allowedGatewayNames?: Set<string> | null;
    commercialTone?: 'primary' | 'secondary';
    renderMode?: GeoGatewayRenderMode;
    showLabels?: boolean;
}

const GeoGatewayEntity = React.memo<{
    gateway: GeoGatewayData;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
    onGatewayClick: (gatewayName: string | null) => void;
    onGatewayHover: (gatewayName: string | null) => void;
    isSelected: boolean;
    sizeScale: number;
    commercialTone: 'primary' | 'secondary';
    renderMode: GeoGatewayRenderMode;
    showLabels: boolean;
    isOutOfService: boolean;
}>(({
    gateway,
    viewerRef,
    cameraMetricsRef,
    onGatewayClick,
    onGatewayHover,
    isSelected,
    sizeScale,
    commercialTone,
    renderMode,
    showLabels,
    isOutOfService,
}) => {
    const position = useMemo(
        () => getPosition(gateway.lat, gateway.lng, GROUND_POINT_ALTITUDE_KM),
        [gateway.lat, gateway.lng]
    );

    // Create stable pixel size callback
    const pixelSizeCallback = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current) return 6;

            const gatewayPosition = getPosition(gateway.lat, gateway.lng, GROUND_POINT_ALTITUDE_KM);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, gatewayPosition);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            const selectedBoost = isSelected ? SELECTED_GATEWAY_SIZE_BOOST : 1.0;
            const toneScale = commercialTone === 'secondary' ? 0.58 : 1;
            return baseScale * GATEWAY_MARKER_PIXEL_MULTIPLIER * selectedBoost * (sizeScale || 1) * toneScale;
        }, false);
    }, [gateway.lat, gateway.lng, cameraMetricsRef, commercialTone, isSelected, sizeScale, viewerRef]);

    const handleClick = useCallback(() => onGatewayClick(gateway.name), [gateway.name, onGatewayClick]);
    const handleMouseEnter = useCallback(() => onGatewayHover(gateway.name), [gateway.name, onGatewayHover]);
    const handleMouseLeave = useCallback(() => onGatewayHover(null), [onGatewayHover]);
    const markerMetadata = useMemo(() => buildGeoGatewayMarkerMetadata(gateway), [gateway]);
    // A site simulated as out of service overrides the capability palette in both
    // render modes — the globe must never present a failed site as nominal.
    const markerColor = useMemo(
        () => isOutOfService
            ? Color.fromCssColorString(OUT_OF_SERVICE_MARKER_COLOR)
            : renderMode === 'commercial'
            ? Color.fromCssColorString('#22d3ee')
            : Color.fromCssColorString(markerMetadata.markerColorCss),
        [isOutOfService, markerMetadata.markerColorCss, renderMode]
    );
    const outlineColor = useMemo(
        () => Color.fromCssColorString(
            isOutOfService
                ? OUT_OF_SERVICE_OUTLINE_COLOR
                : renderMode === 'commercial' ? '#0891b2' : markerMetadata.outlineColorCss
        ),
        [isOutOfService, markerMetadata.outlineColorCss, renderMode]
    );
    const entityCapabilityLabel = markerMetadata.capabilityLabels.length > 0
        ? markerMetadata.capabilityLabels.join(', ')
        : 'Ground Site';
    const entityStatusLabel = isOutOfService ? ' — OUT OF SERVICE' : '';

    return (
        <Entity
            id={`gateway-${gateway.name}`}
            position={position}
            point={{
                pixelSize: pixelSizeCallback,
                color: commercialTone === 'secondary' ? markerColor.withAlpha(0.6) : markerColor,
                outlineColor,
                outlineWidth: markerMetadata.outlineWidth,
                disableDepthTestDistance: 0
            }}
            name={`${gateway.name} (${entityCapabilityLabel})${entityStatusLabel}`}
            onClick={handleClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {(isSelected || isOutOfService) && showLabels && (
                <LabelGraphics
                    text={isOutOfService ? `${gateway.name} — out of service` : gateway.name}
                    font="600 13px Inter, sans-serif"
                    fillColor={Color.WHITE}
                    outlineWidth={3}
                    style={2}
                    showBackground={true}
                    backgroundColor={isOutOfService
                        ? Color.fromCssColorString(OUT_OF_SERVICE_OUTLINE_COLOR).withAlpha(0.8)
                        : commercialTone === 'secondary' ? Color.fromCssColorString('#475569').withAlpha(0.5) : Color.CYAN.withAlpha(0.7)}
                    backgroundPadding={LABEL_BACKGROUND_PADDING}
                    pixelOffset={LABEL_PIXEL_OFFSET}
                    verticalOrigin={VerticalOrigin.BOTTOM}
                    horizontalOrigin={HorizontalOrigin.CENTER}
                    eyeOffset={LABEL_EYE_OFFSET}
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
    sizeScale = 1,
    allowedGatewayNames = null,
    commercialTone = 'primary',
    renderMode = 'engineering',
    showLabels = true,
}) => {
    // requestRenderMode wiring, step 2b.2 (Group B: data-cadence followers).
    // BEHAVIOUR-NEUTRAL: requestRender() is a no-op while scene.requestRenderMode
    // is false, which is the current configuration. Gateway set/selection changes are user- or scope-driven, not per-frame.
    useEffect(() => {
        requestGlobeRender(viewerRef.current);
    }, [viewerRef, satelliteScope, selectedGatewayName, allowedGatewayNames, commercialTone, renderMode, showLabels]);

    // Gateway outage simulation state — failed sites must render as failed on the
    // globe in both modes, matching the panels driven by the same context.
    const { failedGeoGatewaySiteIds } = useSimulation();

    // Memoize Gateway entities (hooks must run unconditionally)
    const gatewayEntities = useMemo(() => {
        const gatewaysToRender = getGeoGatewaysForRendering(allowedGatewayNames, renderMode);
        return gatewaysToRender.map((gateway) => (
            <GeoGatewayEntity
                key={gateway.name}
                gateway={gateway}
                viewerRef={viewerRef}
                cameraMetricsRef={cameraMetricsRef}
                onGatewayClick={onGatewayClick}
                onGatewayHover={onGatewayHover}
                isSelected={selectedGatewayName === gateway.name}
                sizeScale={sizeScale}
                commercialTone={commercialTone}
                renderMode={renderMode}
                showLabels={showLabels}
                isOutOfService={failedGeoGatewaySiteIds.has(gateway.gateway_id)}
            />
        ));
    }, [viewerRef, cameraMetricsRef, onGatewayClick, onGatewayHover, selectedGatewayName, sizeScale, allowedGatewayNames, commercialTone, renderMode, showLabels, failedGeoGatewaySiteIds]);

    // Only render Gateways for GEO scope or ALL scope
    if (satelliteScope !== 'GEO' && satelliteScope !== 'ALL') {
        return null;
    }

    return <>{gatewayEntities}</>;
};

export default React.memo(GeoGatewayLayer);
