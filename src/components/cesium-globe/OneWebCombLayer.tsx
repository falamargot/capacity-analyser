/**
 * OneWebCombLayer - Renders dynamic OneWeb satellite coverage beams
 */
import React, { useMemo } from 'react';
import { Entity, PolygonGraphics, EllipseGraphics } from 'resium';
import {
    Color,
    CallbackProperty,
    CallbackPositionProperty,
    ColorMaterialProperty,
    PolygonHierarchy,
    JulianDate,
    Viewer as CesiumViewerType
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';
import { getBeamColor, TOTAL_BEAMS } from '../../utils/oneWebComb';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG, STANDARD_RADIUS_KM } from '../../utils/leoFootprint';
import { getCoverageColor } from '../../services/coverageService';
import { useCombGeometry } from './hooks';
import { getPosition, DUMMY_POLYGON } from './utils';

interface OneWebCombLayerProps {
    targetSat: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
}

const BeamPolygon = React.memo<{
    beamIndex: number;
    targetSat: SatelliteData;
    getCombGeometries: (sat: SatelliteData, time: JulianDate) => any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
}>(({ beamIndex, targetSat, getCombGeometries, viewerRef }) => {
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
        return new ColorMaterialProperty(new CallbackProperty(() => {
            return getBeamColor(beamIndex, null);
        }, false));
    }, [beamIndex]);

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
    viewerRef
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
            // Coverage circles follow the static ground projection of the satellite
            return getPosition(
                targetSat.position.lat,
                targetSat.position.lng,
                0
            );
        }, false);
    }, [targetSat?.id, targetSat?.position.lat, targetSat?.position.lng]);

    // Early return AFTER all hooks have been called
    if (!targetSat || !targetSat.satrec) {
        return null;
    }

    // Computed values (no hooks, just calculations)
    const horizonRadius = footprintRadiusKm(targetSat.position.alt || 1200, BACKHAUL_ELEVATION_DEG) * 1000;
    const backhaulColorStr = getCoverageColor('ONEWEB_BACKHAUL', 0.2, targetSat);
    const backhaulColor = Color.fromCssColorString(backhaulColorStr);
    const standardColorFill = Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.15, targetSat));
    const standardColorOutline = Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.6, targetSat));


    return (
        <>
            {/* Backhaul Horizon Circle */}
            <Entity position={positionCallback!} name="Backhaul Coverage (Gateway Visibility)">
                <EllipseGraphics
                    semiMajorAxis={horizonRadius}
                    semiMinorAxis={horizonRadius}
                    material={Color.TRANSPARENT}
                    outline={true}
                    outlineColor={backhaulColor.withAlpha(1)}
                    outlineWidth={3}
                    height={0}
                />
            </Entity>

            {/* Standard Service Zone Circle */}
            <Entity position={positionCallback!} name="Standard Service Zone">
                <EllipseGraphics
                    semiMajorAxis={STANDARD_RADIUS_KM * 1000}
                    semiMinorAxis={STANDARD_RADIUS_KM * 1000}
                    material={standardColorFill}
                    outline={true}
                    outlineColor={standardColorOutline}
                    outlineWidth={2}
                    height={0}
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
                />
            ))}
        </>
    );
};

export default React.memo(OneWebCombLayer);
