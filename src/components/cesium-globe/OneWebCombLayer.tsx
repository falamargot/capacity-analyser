/* eslint-disable react-hooks/exhaustive-deps */
/**
 * OneWebCombLayer - Renders dynamic OneWeb satellite coverage beams
 * with realistic radial power gradient (concentric rings) and
 * frequency-reuse color coding.
 */
import React, { useMemo, useRef } from 'react';
import { Entity, PolygonGraphics, EllipseGraphics } from 'resium';
import {
    Cartesian3,
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
import { useSimulation } from '../../contexts/SimulationContext';
import { useCombGeometry } from './hooks';
import { getPosition, DUMMY_POLYGON, propagateSatellite, calculateDeadReckoning, sanitizeCartesianRing } from './utils';
import {
    GRADIENT_RENDERING,
    getBeamBaseColor,
} from '../../config/beamVisualization';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';


// ─── Geometry helper ────────────────────────────────────────────────
/**
 * Scale a polygon toward its centroid by `factor` (0–1).
 * factor=1 → original polygon, factor=0 → single point at centroid.
 */
function scalePolygon(vertices: Cartesian3[], factor: number): Cartesian3[] {
    if (factor >= 1.0) return vertices;

    // Compute centroid
    const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
    const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
    const cz = vertices.reduce((s, v) => s + v.z, 0) / vertices.length;

    return vertices.map(v => new Cartesian3(
        cx + (v.x - cx) * factor,
        cy + (v.y - cy) * factor,
        cz + (v.z - cz) * factor,
    ));
}

interface OneWebCombLayerProps {
    targetSat: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    highlightServingFootprint?: boolean;
    leoServiceViewModel?: LeoConnectivityViewModel | null;
}

const BLOCKED_BEAM_TINT = Color.fromCssColorString('#ef4444');
const BLOCKED_BEAM_BASE = Color.fromCssColorString('#cbd5e1');

function getDiagnosticBeamColor(baseColor: Color, ringOpacity: number): Color {
    const mixed = new Color();
    Color.lerp(baseColor, BLOCKED_BEAM_BASE, 0.72, mixed);
    Color.lerp(mixed, BLOCKED_BEAM_TINT, 0.22, mixed);
    mixed.alpha = ringOpacity * 0.42;
    return mixed;
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

function getRenderablePolygon(
    geometries: Cartesian3[][] | null,
    beamIndex: number
): Cartesian3[] {
    return sanitizeCartesianRing(geometries?.[beamIndex] ?? null);
}

// ─── Single ring of a gradient beam ────────────────────────────────
const BeamRing = React.memo<{
    beamIndex: number;
    ringIndex: number;
    scaleFactor: number;
    ringOpacity: number;
    targetSat: SatelliteData;
    getCombGeometries: (sat: SatelliteData, time: JulianDate) => any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    hsBeamsRef: React.MutableRefObject<ReadonlySet<number>>;
    regulatoryBlockedRef: React.MutableRefObject<boolean>;
}>(({ beamIndex, ringIndex, scaleFactor, ringOpacity, targetSat, getCombGeometries, viewerRef, hsBeamsRef, regulatoryBlockedRef }) => {

    const showCallback = useMemo(() => {
        return new CallbackProperty((time?: JulianDate) => {
            if (!time || !viewerRef.current) return false;
            const geometries = getCombGeometries(targetSat, time);
            return getRenderablePolygon(geometries, beamIndex).length >= 3;
        }, false);
    }, [beamIndex, targetSat.id, getCombGeometries, viewerRef]);

    const hierarchyCallback = useMemo(() => {
        return new CallbackProperty((time?: JulianDate) => {
            const dummyHierarchy = new PolygonHierarchy(DUMMY_POLYGON);
            try {
                if (!time || !viewerRef.current) return dummyHierarchy;
                const geometries = getCombGeometries(targetSat, time);
                const polygon = getRenderablePolygon(geometries, beamIndex);
                if (polygon.length >= 3) {
                    const scaled = sanitizeCartesianRing(scalePolygon(polygon, scaleFactor));
                    if (scaled.length < 3) return dummyHierarchy;
                    return new PolygonHierarchy(scaled);
                }
            } catch (e) {
                console.error('Error in gradient hierarchy callback', e);
            }
            return dummyHierarchy;
        }, false);
    }, [beamIndex, scaleFactor, targetSat.id, getCombGeometries, viewerRef]);

    const colorCallback = useMemo(() => {
        return new ColorMaterialProperty(new CallbackProperty((time?: JulianDate) => {
            // HS beam → solid red (out of service)
            if (hsBeamsRef.current.has(beamIndex)) {
                return Color.RED.withAlpha(ringOpacity * 0.85);
            }

            if (!time || !targetSat.satrec) {
                return getBeamColor(beamIndex, false);
            }

            const { isBlankingZone, isGSOAvoidance, satLatDeg } =
                calculateGSOAvoidanceAngle(targetSat.satrec, time);

            // Inactive beam → gray, no gradient
            if (isBlankingZone) return Color.GRAY.withAlpha(0.3 * (ringOpacity / 0.75));

            if (isGSOAvoidance) {
                // Beam IDs fixed: 0 = northernmost, 15 = southernmost.
                // Activate the half pointing away from the equatorial GEO arc.
                const shouldActivateNorthernBeams = satLatDeg > 0;
                const isActiveBeam = shouldActivateNorthernBeams
                    ? beamIndex >= 0 && beamIndex <= 7
                    : beamIndex >= 8 && beamIndex <= 15;
                if (!isActiveBeam) return Color.GRAY.withAlpha(0.15 * (ringOpacity / 0.75));
            }

            // Active beam → frequency-reuse color with gradient opacity
            const baseColor = getBeamBaseColor(beamIndex);
            if (regulatoryBlockedRef.current) {
                return getDiagnosticBeamColor(baseColor, ringOpacity);
            }
            return baseColor.withAlpha(ringOpacity);
        }, false));
    }, [beamIndex, ringOpacity, targetSat.id, targetSat.satrec, hsBeamsRef, regulatoryBlockedRef]);

    return (
        <Entity name={`Beam ${beamIndex} ring ${ringIndex}`}>
            <PolygonGraphics
                show={showCallback}
                hierarchy={hierarchyCallback}
                material={colorCallback}
                outline={ringIndex === 0} // outline only on outermost ring
                outlineColor={Color.WHITE.withAlpha(0.15)}
                outlineWidth={1}
            />
        </Entity>
    );
});
BeamRing.displayName = 'BeamRing';

// ─── Gradient beam (multiple rings) ────────────────────────────────
const GradientBeamPolygon = React.memo<{
    beamIndex: number;
    targetSat: SatelliteData;
    getCombGeometries: (sat: SatelliteData, time: JulianDate) => any;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    hasBackhaul: boolean;
    hsBeamsRef: React.MutableRefObject<ReadonlySet<number>>;
    regulatoryBlockedRef: React.MutableRefObject<boolean>;
}>(({ beamIndex, targetSat, getCombGeometries, viewerRef, hsBeamsRef, regulatoryBlockedRef }) => {

    if (!GRADIENT_RENDERING.ENABLE_GRADIENT) {
        // Fallback: single flat polygon (original behaviour)
        return (
            <BeamRing
                beamIndex={beamIndex}
                ringIndex={0}
                scaleFactor={1.0}
                ringOpacity={0.4}
                targetSat={targetSat}
                getCombGeometries={getCombGeometries}
                viewerRef={viewerRef}
                hsBeamsRef={hsBeamsRef}
                regulatoryBlockedRef={regulatoryBlockedRef}
            />
        );
    }

    return (
        <>
            {GRADIENT_RENDERING.RINGS.map((ring, idx) => (
                <BeamRing
                    key={`beam-${beamIndex}-ring-${idx}`}
                    beamIndex={beamIndex}
                    ringIndex={idx}
                    scaleFactor={ring.scaleFactor}
                    ringOpacity={ring.opacity}
                    targetSat={targetSat}
                    getCombGeometries={getCombGeometries}
                    viewerRef={viewerRef}
                    hsBeamsRef={hsBeamsRef}
                    regulatoryBlockedRef={regulatoryBlockedRef}
                />
            ))}
        </>
    );
});
GradientBeamPolygon.displayName = 'GradientBeamPolygon';


const OneWebCombLayer: React.FC<OneWebCombLayerProps> = ({
    targetSat,
    viewerRef,
    selectedPosition,
    selectedAircraft,
    highlightServingFootprint = false,
    leoServiceViewModel = null,
}) => {
    const { getCombGeometries } = useCombGeometry();
    const { failedSnps, hsBeamsSet } = useSimulation();

    // Stable ref so CallbackProperty callbacks always read the latest HS set
    // without needing to recreate the callbacks when it changes.
    const hsBeamsRef = useRef<ReadonlySet<number>>(hsBeamsSet);
    hsBeamsRef.current = hsBeamsSet;
    const regulatoryBlockedRef = useRef<boolean>(leoServiceViewModel?.globeVisualMode === 'regulatory_blocked');
    regulatoryBlockedRef.current = leoServiceViewModel?.globeVisualMode === 'regulatory_blocked';

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
                hierarchy: new CallbackProperty(() => new PolygonHierarchy(DUMMY_POLYGON), false),
                contourPositions: new CallbackProperty(() => DUMMY_POLYGON, false),
                material: new ColorMaterialProperty(new CallbackProperty(() => Color.PALEVIOLETRED.withAlpha(0.4), false)),
                outlineColor: new CallbackProperty(() => Color.PALEVIOLETRED.withAlpha(0.95), false),
                contourMaterial: new ColorMaterialProperty(new CallbackProperty(() => Color.PALEVIOLETRED.withAlpha(0.95), false)),
            };
        }

        const resolveServingBeam = (time?: JulianDate) => {
            if (!time || !viewerRef.current || !targetSat) return null;
            if (!selectedPosition && !selectedAircraft) return null;

            const geometries = getCombGeometries(targetSat, time);
            if (!geometries) return null;

            let point: { lat: number; lng: number } | null = null;
            if (selectedAircraft) {
                const p = calculateDeadReckoning(selectedAircraft, time);
                const c = Cartographic.fromCartesian(p);
                point = { lat: CesiumMath.toDegrees(c.latitude), lng: CesiumMath.toDegrees(c.longitude) };
            } else if (selectedPosition) {
                point = { lat: selectedPosition.lat, lng: selectedPosition.lng };
            }
            if (!point) return null;

            for (let i = 0; i < geometries.length; i++) {
                const poly = getRenderablePolygon(geometries, i);
                if (!poly || poly.length < 3) continue;

                const ring: Array<[number, number]> = poly.map((p: any) => {
                    const c = Cartographic.fromCartesian(p);
                    return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
                });

                if (isPointInPolygon(point, ring)) {
                    return { beamIndex: i, polygon: poly };
                }
            }

            return null;
        };

        const show = new CallbackProperty((time?: JulianDate) => {
            return resolveServingBeam(time) !== null;
        }, false);

        const hierarchy = new CallbackProperty((time?: JulianDate) => {
            const dummyHierarchy = new PolygonHierarchy(DUMMY_POLYGON);
            const servingBeam = resolveServingBeam(time);
            if (!servingBeam) return dummyHierarchy;
            const polygon = sanitizeCartesianRing(servingBeam.polygon);
            if (polygon.length < 3) return dummyHierarchy;
            return new PolygonHierarchy(polygon);
        }, false);

        const contourPositions = new CallbackProperty((time?: JulianDate) => {
            const servingBeam = resolveServingBeam(time);
            if (!servingBeam) return DUMMY_POLYGON;

            const polygon = servingBeam.polygon;
            const sanitized = sanitizeCartesianRing(polygon);
            if (sanitized.length < 3) return DUMMY_POLYGON;

            const [first] = sanitized;
            return first ? [...sanitized, first] : DUMMY_POLYGON;
        }, false);

        const material = new ColorMaterialProperty(new CallbackProperty((time?: JulianDate) => {
            const servingBeam = resolveServingBeam(time);
            if (!servingBeam) return Color.PALEVIOLETRED.withAlpha(0.4);
            if (regulatoryBlockedRef.current) {
                return Color.fromCssColorString('#ef4444').withAlpha(0.2);
            }
            return getBeamBaseColor(servingBeam.beamIndex).withAlpha(0.22);
        }, false));

        const outlineColor = new CallbackProperty((time?: JulianDate) => {
            const servingBeam = resolveServingBeam(time);
            if (!servingBeam) return Color.PALEVIOLETRED.withAlpha(0.95);
            if (regulatoryBlockedRef.current) {
                return Color.fromCssColorString('#ef4444').withAlpha(0.95);
            }
            return getBeamBaseColor(servingBeam.beamIndex).withAlpha(0.95);
        }, false);

        const contourMaterial = new ColorMaterialProperty(outlineColor);

        return { show, hierarchy, contourPositions, material, outlineColor, contourMaterial };
    }, [highlightServingFootprint, viewerRef, targetSat?.id, selectedPosition?.lat, selectedPosition?.lng, selectedAircraft?.icao24, getCombGeometries]);

    // These useMemo hooks MUST be before the early return to satisfy the Rules of Hooks.
    // They guard against null targetSat internally and produce no-op values in that case.
    const horizonRadius = useMemo(
        () => targetSat ? footprintRadiusKm(targetSat.position.alt || 1200, BACKHAUL_ELEVATION_DEG) * 1000 : 0,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targetSat?.position.alt]
    );

    const backhaulColor = useMemo(
        () => targetSat
            ? (
                leoServiceViewModel?.globeVisualMode === 'regulatory_blocked'
                    ? Color.fromCssColorString('#ef4444').withAlpha(0.18)
                    : Color.fromCssColorString(getCoverageColor('ONEWEB_BACKHAUL', 0.2, targetSat, failedSnps))
            )
            : Color.TRANSPARENT,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targetSat?.id, failedSnps, leoServiceViewModel?.globeVisualMode]
    );

    const standardColorFill = useMemo(
        () => targetSat
            ? (
                leoServiceViewModel?.globeVisualMode === 'regulatory_blocked'
                    ? Color.fromCssColorString('#fca5a5').withAlpha(0.08)
                    : Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.1, targetSat, failedSnps))
            )
            : Color.TRANSPARENT,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targetSat?.id, failedSnps, leoServiceViewModel?.globeVisualMode]
    );

    const standardColorOutline = useMemo(
        () => targetSat
            ? (
                leoServiceViewModel?.globeVisualMode === 'regulatory_blocked'
                    ? Color.fromCssColorString('#f87171').withAlpha(0.5)
                    : Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.6, targetSat, failedSnps))
            )
            : Color.TRANSPARENT,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targetSat?.id, failedSnps, leoServiceViewModel?.globeVisualMode]
    );

    // hasSNPInCoverage performs polygon-point intersection tests across all SNPs;
    // memoized so it only re-runs when the satellite position or SNP state changes.
    const hasBackhaul = useMemo(
        () => targetSat ? hasSNPInCoverage(targetSat, failedSnps) : false,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [targetSat?.id, targetSat?.position.lat, targetSat?.position.lng, failedSnps]
    );

    // Early return AFTER all hooks have been called
    if (!targetSat || !targetSat.satrec) {
        return null;
    }

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

            {/* Beam polygons with gradient */}
            {beamIndices.map((i: number) => (
                <GradientBeamPolygon
                    key={`comb-beam-${i}`}
                    beamIndex={i}
                    targetSat={targetSat}
                    getCombGeometries={getCombGeometries}
                    viewerRef={viewerRef}
                    hasBackhaul={hasBackhaul}
                    hsBeamsRef={hsBeamsRef}
                    regulatoryBlockedRef={regulatoryBlockedRef}
                />
            ))}


            <Entity name="Serving Footprint Highlight">
                <PolygonGraphics
                    show={highlight.show}
                    hierarchy={highlight.hierarchy}
                    material={highlight.material}
                    outline={true}
                    outlineColor={highlight.outlineColor}
                    outlineWidth={3}
                />
            </Entity>
            <Entity
                name="Serving Footprint Contour"
                polyline={{
                    show: highlight.show,
                    positions: highlight.contourPositions,
                    width: 2,
                    material: highlight.contourMaterial,
                    clampToGround: false,
                }}
            />
        </>
    );
};

export default React.memo(OneWebCombLayer);
