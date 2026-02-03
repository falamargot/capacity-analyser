/**
 * OneWebCombLayer - Renders dynamic OneWeb satellite coverage beams
 */
import React, { useMemo } from 'react';
import { Entity, PolygonGraphics, EllipseGraphics } from 'resium';
import {
    Cartographic,
    Color,
    CallbackProperty,
    CallbackPositionProperty,
    ColorMaterialProperty,
    Math as CesiumMath,
    PolygonHierarchy,
    JulianDate,
    Viewer as CesiumViewerType
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import { getBeamColor, TOTAL_BEAMS, calculateGSOAvoidanceAngle } from '../../utils/oneWebComb';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG, STANDARD_RADIUS_KM } from '../../utils/leoFootprint';
import { getCoverageColor, hasSNPInCoverage } from '../../services/coverageService';
import { useCombGeometry } from './hooks';
import { getPosition, DUMMY_POLYGON, propagateSatellite, calculateDeadReckoning } from './utils';

interface OneWebCombLayerProps {
    targetSat: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    highlightServingFootprint?: boolean;
}

const isPointInPolygon = (point: { lat: number; lng: number }, ring: Array<[number, number]>): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const intersect = ((yi > point.lat) !== (yj > point.lat))
            && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

const BeamPolygon = React.memo<{
    beamIndex: number;
    targetSat: SatelliteData;
    getCombGeometries: (sat: SatelliteData, time: JulianDate) => any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    hasBackhaul: boolean;
}>(({ beamIndex, targetSat, getCombGeometries, viewerRef, hasBackhaul }) => {
    // Create stable show callback
    const showCallback = useMemo(() => {
        return new CallbackProperty((time?: JulianDate) => {
            if (!time || !viewerRef.current) return false;

            const geometries = getCombGeometries(targetSat, time);
            return !!(geometries && geometries[beamIndex] && geometries[beamIndex].length >= 3);
        }, false);
    }, [beamIndex, targetSat.id, getCombGeometries, viewerRef]);

    // Create stable hierarchy callback
    const hierarchyCallback = useMemo(() => {
        return new CallbackProperty((time?: JulianDate) => {
            const dummyHierarchy = new PolygonHierarchy(DUMMY_POLYGON);
            try {
                if (!time || !viewerRef.current) return dummyHierarchy;

                const geometries = getCombGeometries(targetSat, time);
                if (geometries && geometries[beamIndex] && geometries[beamIndex].length >= 3) {
                    return new PolygonHierarchy(geometries[beamIndex]);
                }
            } catch (e) {
                console.error('Error in hierarchy callback', e);
            }
            return dummyHierarchy;
        }, false);
    }, [beamIndex, targetSat.id, getCombGeometries, viewerRef]);

    // Create stable color callback
    const colorCallback = useMemo(() => {
        return new ColorMaterialProperty(new CallbackProperty((time?: JulianDate) => {
            if (!time || !targetSat.satrec) {
                return getBeamColor(beamIndex, null, false);
            }

            // Check if satellite is in blanking zone or GSO Avoidance
            const { isBlankingZone, isGSOAvoidance, isMovingNorth, satLatDeg } = calculateGSOAvoidanceAngle(targetSat.satrec, time);

            return getBeamColor(
                beamIndex,
                null,
                isBlankingZone,
                hasBackhaul,
                isGSOAvoidance,
                satLatDeg,
                isMovingNorth
            );
        }, false));
    }, [beamIndex, targetSat.id, targetSat.satrec, hasBackhaul]);

    return (
        <Entity name="Combined Beam">
            <PolygonGraphics
                show={showCallback}
                hierarchy={hierarchyCallback}
                material={colorCallback}
                outline={true}
                outlineColor={Color.WHITE.withAlpha(0.2)}
                outlineWidth={1}
            />
        </Entity>
    );
});

BeamPolygon.displayName = 'BeamPolygon';

const OneWebCombLayer: React.FC<OneWebCombLayerProps> = ({
    targetSat,
    viewerRef,
    selectedPosition,
    selectedAircraft,
    highlightServingFootprint = false
}) => {
    const { getCombGeometries } = useCombGeometry();

    // Generate beam indices array once - MUST be before any early return
    const beamIndices = useMemo(() => Array.from({ length: TOTAL_BEAMS }, (_, i) => i), []);

    // Create stable position callback for coverage circles - MUST be before any early return
    const positionCallback = useMemo(() => {
        if (!targetSat) return null;

        return new CallbackPositionProperty((time?: JulianDate) => {
            if (!time || !targetSat) {
                return getPosition(targetSat?.position.lat || 0, targetSat?.position.lng || 0, 0);
            }
            // Coverage circles follow the ground projection of the satellite in real-time
            const satCartesian = propagateSatellite(targetSat, time);
            const cartographic = Cartographic.fromCartesian(satCartesian);
            const lat = CesiumMath.toDegrees(cartographic.latitude);
            const lng = CesiumMath.toDegrees(cartographic.longitude);
            return getPosition(lat, lng, 0);
        }, false);
    }, [targetSat?.id, targetSat?.satrec]);

    const highlight = useMemo(() => {
        if (!highlightServingFootprint) {
            return {
                show: new CallbackProperty(() => false, false),
                hierarchy: new CallbackProperty(() => new PolygonHierarchy(DUMMY_POLYGON), false)
            };
        }

        const show = new CallbackProperty((time?: JulianDate) => {
            if (!time || !viewerRef.current || !targetSat) return false;
            if (!selectedPosition && !selectedAircraft) return false;

            const geometries = getCombGeometries(targetSat, time);
            if (!geometries) return false;

            let point: { lat: number; lng: number } | null = null;
            if (selectedAircraft) {
                const p = calculateDeadReckoning(selectedAircraft, time);
                const c = Cartographic.fromCartesian(p);
                point = { lat: CesiumMath.toDegrees(c.latitude), lng: CesiumMath.toDegrees(c.longitude) };
            } else if (selectedPosition) {
                point = { lat: selectedPosition.lat, lng: selectedPosition.lng };
            }
            if (!point) return false;

            for (let i = 0; i < geometries.length; i++) {
                const poly = geometries[i];
                if (!poly || poly.length < 3) continue;

                const ring: Array<[number, number]> = poly.map((p: any) => {
                    const c = Cartographic.fromCartesian(p);
                    return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
                });

                if (isPointInPolygon(point, ring)) return true;
            }

            return false;
        }, false);

        const hierarchy = new CallbackProperty((time?: JulianDate) => {
            const dummyHierarchy = new PolygonHierarchy(DUMMY_POLYGON);
            if (!time || !viewerRef.current || !targetSat) return dummyHierarchy;
            if (!selectedPosition && !selectedAircraft) return dummyHierarchy;

            const geometries = getCombGeometries(targetSat, time);
            if (!geometries) return dummyHierarchy;

            let point: { lat: number; lng: number } | null = null;
            if (selectedAircraft) {
                const p = calculateDeadReckoning(selectedAircraft, time);
                const c = Cartographic.fromCartesian(p);
                point = { lat: CesiumMath.toDegrees(c.latitude), lng: CesiumMath.toDegrees(c.longitude) };
            } else if (selectedPosition) {
                point = { lat: selectedPosition.lat, lng: selectedPosition.lng };
            }
            if (!point) return dummyHierarchy;

            for (let i = 0; i < geometries.length; i++) {
                const poly = geometries[i];
                if (!poly || poly.length < 3) continue;

                const ring: Array<[number, number]> = poly.map((p: any) => {
                    const c = Cartographic.fromCartesian(p);
                    return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
                });

                if (isPointInPolygon(point, ring)) {
                    return new PolygonHierarchy(poly);
                }
            }

            return dummyHierarchy;
        }, false);

        return { show, hierarchy };
    }, [highlightServingFootprint, viewerRef, targetSat?.id, selectedPosition?.lat, selectedPosition?.lng, selectedAircraft?.icao24, getCombGeometries]);

    // Early return AFTER all hooks have been called
    if (!targetSat || !targetSat.satrec) {
        return null;
    }

    // Computed values (no hooks, just calculations)
    const horizonRadius = footprintRadiusKm(targetSat.position.alt || 1200, BACKHAUL_ELEVATION_DEG) * 1000;
    const backhaulColorStr = getCoverageColor('ONEWEB_BACKHAUL', 0.2, targetSat);
    const backhaulColor = Color.fromCssColorString(backhaulColorStr);
    const standardColorFill = Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.1, targetSat));
    const standardColorOutline = Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.6, targetSat));

    // Calculate Backhaul Status (this frame, using latest static position)
    // Note: Live updates depending on position change require time-based checks within Callback, 
    // but calculating coverage polygon intersections every frame is expensive. 
    // We rely on the periodic update of targetSat.position from parent components.
    const hasBackhaul = hasSNPInCoverage(targetSat);

    return (
        <>
            {/* Backhaul Horizon Circle */}
            <Entity position={positionCallback!} name="Backhaul Coverage (Gateway Visibility)">
                <EllipseGraphics
                    semiMajorAxis={horizonRadius}
                    semiMinorAxis={horizonRadius}
                    material={backhaulColor.withAlpha(0)}
                    outline={true}
                    outlineColor={backhaulColor.withAlpha(1)}
                    outlineWidth={2}
                    height={2000}
                />
            </Entity>

            {/* Standard Service Zone Circle */}
            <Entity position={positionCallback!} name="Standard Service Zone">
                <EllipseGraphics
                    semiMajorAxis={STANDARD_RADIUS_KM * 1000}
                    semiMinorAxis={STANDARD_RADIUS_KM * 1000}
                    material={standardColorFill}
                    outline={false}
                    outlineColor={standardColorOutline.withAlpha(1)}
                    outlineWidth={2}
                    height={1000}
                />
            </Entity>

            {/* Beam polygons */}
            {beamIndices.map((i) => (
                <BeamPolygon
                    key={`comb-beam-${i}`}
                    beamIndex={i}
                    targetSat={targetSat}
                    getCombGeometries={getCombGeometries}
                    viewerRef={viewerRef}
                    hasBackhaul={hasBackhaul}
                />
            ))}

            <Entity name="Serving Footprint Highlight">
                <PolygonGraphics
                    show={highlight.show}
                    hierarchy={highlight.hierarchy}
                    material={Color.PALEVIOLETRED.withAlpha(0.4)}
                    outline={true}
                    outlineColor={Color.WHITE.withAlpha(0.9)}
                    outlineWidth={3}
                />
            </Entity>
        </>
    );
};

export default React.memo(OneWebCombLayer);
