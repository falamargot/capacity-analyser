/**
 * SatelliteLayer - Renders all satellite entities with optimized callbacks.
 *
 * Color policy (evaluated in priority order):
 *   1. Manually selected by the user  →  RED  (overrides everything)
 *   2. Operational  (+/P/B/S/X)       →  ROYALBLUE (EUTELSAT) / DEEPPINK (ONEWEB)
 *   3. Inactive     (- / no SATCAT)   →  GRAY
 *   Decayed satellites are never received here — they are filtered in satelliteService.
 */
import React, { useMemo, useCallback, useRef } from 'react';
import { Entity } from 'resium';
import {
    Cartesian3,
    Color,
    VerticalOrigin,
    CallbackProperty,
    Viewer as CesiumViewerType
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { SATELLITE_GLYPH, LEO_SMOKED_GLYPH, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import type { SatelliteStatusCategory } from '../../utils/satelliteStatus';
// ─── Status color palette ─────────────────────────────────────────────────────
// Pre-allocated Cesium Color instances so we never allocate on the hot render path.
const STATUS_COLORS: Record<SatelliteStatusCategory, { eutelsat: Color; oneweb: Color }> = {
  // Operational: retain the established brand colors per constellation
  operational: { eutelsat: Color.ROYALBLUE, oneweb: Color.DEEPPINK },
  // Inactive: neutral gray — visible but clearly distinct from operational
  inactive:    { eutelsat: Color.GRAY,      oneweb: Color.GRAY },
  // Decayed entries are filtered out before reaching this layer; never rendered.
  decayed:     { eutelsat: Color.TRANSPARENT, oneweb: Color.TRANSPARENT },
};

/**
 * Returns the billboard color for a satellite entity.
 * Manual selection (user click) always overrides the status color.
 */
function getBillboardColor(
  type: SatelliteData['type'],
  opsStatus: SatelliteStatusCategory,
  isManuallySelected: boolean
): Color {
  if (isManuallySelected) return Color.RED;
  return STATUS_COLORS[opsStatus][type === 'EUTELSAT' ? 'eutelsat' : 'oneweb'];
}
import { usePositionCallbacks } from './hooks';

// Hoisted: these are fixed colours, so allocating them per render (once per
// satellite per propagation tick) was pure garbage.
const COMMERCIAL_DIMMED_COLOR = Color.fromCssColorString('#64748b').withAlpha(0.2);
const COMMERCIAL_LEO_COLOR = Color.fromCssColorString('#f472b6').withAlpha(0.2);
const COMMERCIAL_GEO_COLOR = Color.fromCssColorString('#60a5fa').withAlpha(0.2);

interface SatelliteLayerProps {
    satellites: SatelliteData[];
    selectedSatellite: SatelliteData | null;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.RefObject<CameraMetricsSnapshot>;
    satelliteSizeScale?: number;
    commercialTechnologyFocus?: 'LEO' | 'GEO' | null;
}

const SatelliteEntity = React.memo<{
    sat: SatelliteData;
    isManuallySelected: boolean;
    positionCallback: any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    cameraMetricsRef: React.RefObject<CameraMetricsSnapshot>;
    satelliteSizeScale: number;
    commercialTechnologyFocus?: 'LEO' | 'GEO' | null;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
}>(({
    sat,
    isManuallySelected,
    positionCallback,
    viewerRef,
    cameraMetricsRef,
    satelliteSizeScale,
    commercialTechnologyFocus,
    onSatelliteClick,
    onSatelliteHover
}) => {
    // Refs let the stable CallbackProperty closure read the latest values
    // without being recreated when position or sizeScale changes.
    const satPositionRef = useRef(sat.position);
    satPositionRef.current = sat.position;

    const satelliteSizeScaleRef = useRef(satelliteSizeScale);
    satelliteSizeScaleRef.current = satelliteSizeScale;
    const commercialTechnologyFocusRef = useRef(commercialTechnologyFocus);
    commercialTechnologyFocusRef.current = commercialTechnologyFocus;

    // Pre-allocated scratch Cartesian3 — written in-place each frame, never GC'd.
    const scratchPositionRef = useRef(new Cartesian3());

    // scaleCallback only depends on sat.type (never changes for a given satellite),
    // viewerRef, and cameraMetricsRef — both stable refs. Position and sizeScale are
    // read via refs so the CallbackProperty is created ONCE per entity lifetime.
    // This eliminates the previous pattern of calling positionCallback.getValue()
    // (which ran full SGP4 propagation) on every Cesium frame for all 600 satellites.
    const scaleCallback = useMemo(() => {
        const isGEO = sat.type === 'EUTELSAT';
        return new CallbackProperty(() => {
            const { lat, lng, alt } = satPositionRef.current;
            Cartesian3.fromDegrees(lng, lat, alt * 1000, undefined, scratchPositionRef.current);

            const distance = Cartesian3.distance(
                cameraMetricsRef.current.position,
                scratchPositionRef.current
            );
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale =
                dynamicScale * (isGEO ? 10000000 : 3000000) / Math.max(distance, 5000000);

            const focus = commercialTechnologyFocusRef.current;
            const satelliteTech: 'LEO' | 'GEO' = isGEO ? 'GEO' : 'LEO';
            const commercialScale = focus === undefined
                ? 1
                : focus === null
                    ? 0.42
                    : focus === satelliteTech
                        ? 0.64
                        : 0.34;

            return baseScale * satelliteSizeScaleRef.current * commercialScale;
        }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sat.type, viewerRef, cameraMetricsRef]); // position & sizeScale read via refs

    const handleClick = useCallback(() => onSatelliteClick(sat), [sat, onSatelliteClick]);
    const handleMouseEnter = useCallback(() => onSatelliteHover(sat.id), [sat.id, onSatelliteHover]);
    const handleMouseLeave = useCallback(() => onSatelliteHover(null), [onSatelliteHover]);

    const satelliteTech: 'LEO' | 'GEO' = sat.type === 'EUTELSAT' ? 'GEO' : 'LEO';
    const isCommercial = commercialTechnologyFocus !== undefined;
    const isCommercialSecondary = isCommercial && (
        commercialTechnologyFocus === null || commercialTechnologyFocus !== satelliteTech
    );
    // Memoized: `Color.fromCssColorString(...).withAlpha(...)` allocated three new
    // Color objects on every render, and this component re-renders once per second
    // for every satellite that moves (the `sat` prop is a fresh object each
    // propagation tick, which defeats the shallow React.memo above).
    const billboardColor = useMemo(() => (
        isCommercial && !isManuallySelected
            ? isCommercialSecondary
                ? COMMERCIAL_DIMMED_COLOR
                : (sat.type === 'ONEWEB'
                    ? COMMERCIAL_LEO_COLOR
                    : COMMERCIAL_GEO_COLOR)
            : getBillboardColor(sat.type, sat.opsStatus, isManuallySelected)
    ), [isCommercial, isCommercialSecondary, isManuallySelected, sat.type, sat.opsStatus]);

    // MEM-3: this descriptor used to be an inline object literal, so Resium saw a
    // NEW `billboard` prop on every render and rebuilt the entity's
    // BillboardGraphics — together with a Property per field, a
    // `definitionChanged` Event per Property, and the listener Map/Set/array each
    // Event owns. A heap snapshot across ~90 s of interaction attributed 63,240
    // BillboardGraphics, 412,541 Events, 1,238,276 Maps and 1,871,849 arrays to
    // this churn (~320 MB, essentially the entire heap growth in that window).
    //
    // None of these four fields depends on satellite POSITION: `image` follows
    // type, `scale` is a stable CallbackProperty that reads position from a ref,
    // `color` is memoized above and `verticalOrigin` is constant. Holding the
    // object identity stable therefore lets the 1 Hz position tick update the
    // satellite without rebuilding its graphics — which is exactly the intent the
    // ref-based callbacks above were already written for.
    const billboard = useMemo(() => ({
        image: sat.type === 'ONEWEB' ? LEO_SMOKED_GLYPH : SATELLITE_GLYPH,
        scale: scaleCallback,
        color: billboardColor,
        verticalOrigin: VerticalOrigin.CENTER,
    }), [sat.type, scaleCallback, billboardColor]);

    return (
        <>
            <Entity
                id={`satellite-${sat.id}`}
                position={positionCallback}
                billboard={billboard}
                name={sat.name}
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            />
        </>
    );
});

SatelliteEntity.displayName = 'SatelliteEntity';

const SatelliteLayer: React.FC<SatelliteLayerProps> = ({
    satellites,
    selectedSatellite,
    onSatelliteClick,
    onSatelliteHover,
    viewerRef,
    cameraMetricsRef,
    satelliteSizeScale = 1,
    commercialTechnologyFocus,
}) => {
    const { getSatellitePositionCallback } = usePositionCallbacks(satellites, []);

    // Memoize satellite entities
    const satelliteEntities = useMemo(() => {
        return satellites.map((sat) => {
            const isManuallySelected = selectedSatellite?.id === sat.id;
            const positionCallback = getSatellitePositionCallback(sat);

            return (
                <SatelliteEntity
                    key={sat.id}
                    sat={sat}
                    isManuallySelected={isManuallySelected}
                    positionCallback={positionCallback}
                    viewerRef={viewerRef}
                    cameraMetricsRef={cameraMetricsRef}
                    satelliteSizeScale={satelliteSizeScale}
                    commercialTechnologyFocus={commercialTechnologyFocus}
                    onSatelliteClick={onSatelliteClick}
                    onSatelliteHover={onSatelliteHover}
                />
            );
        });
    }, [
        satellites,
        selectedSatellite?.id,
        getSatellitePositionCallback,
        viewerRef,
        cameraMetricsRef,
        satelliteSizeScale,
        commercialTechnologyFocus,
        onSatelliteClick,
        onSatelliteHover
    ]);

    return <>{satelliteEntities}</>;
};

export default React.memo(SatelliteLayer);
