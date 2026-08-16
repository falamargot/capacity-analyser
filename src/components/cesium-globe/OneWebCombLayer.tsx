/* eslint-disable react-hooks/exhaustive-deps */
/**
 * OneWebCombLayer - Renders dynamic OneWeb satellite coverage beams
 * with realistic radial power gradient (concentric rings) and
 * frequency-reuse color coding.
 */
import React, { useEffect, useMemo, useRef } from 'react';
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
import { getBeamColor, TOTAL_BEAMS, getGsoMutedBeamSet } from '../../utils/oneWebComb';
import { footprintRadiusKm, MIN_SNP_GATEWAY_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from '../../utils/leoFootprint';
import { getCoverageColor, hasSNPInCoverage } from '../../services/coverageService';
import { useSimulation } from '../../contexts/SimulationContext';
import { useCombGeometry } from './hooks';
import { getPosition, DUMMY_POLYGON, calculateDeadReckoning, sanitizeCartesianRing } from './utils';
import {
    GRADIENT_RENDERING,
    getBeamBaseColor,
} from '../../config/beamVisualization';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { requestGlobeRender } from '../../utils/globeRenderRequest';
import { isPointInPolygon } from '../../utils/geoUtils';
import {
    FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M,
    FOOTPRINT_LAYER_HEIGHT_M,
    FOOTPRINT_OUTLINE_LAYER_HEIGHT_M,
} from './layerHeights';


// ─── Geometry helper ────────────────────────────────────────────────
/**
 * Scale a polygon toward its centroid by `factor` (0–1).
 * factor=1 → original polygon, factor=0 → single point at centroid.
 *
 * Writes into the provided scratch buffer (grown lazily, mutated in place).
 * The scratch Cartesian3 instances are reused across geometry updates; Cesium
 * re-reads the polygon hierarchy every frame, so in-place mutation is safe.
 */
function scalePolygonInto(vertices: Cartesian3[], factor: number, out: Cartesian3[]): Cartesian3[] {
    const len = vertices.length;
    while (out.length < len) out.push(new Cartesian3());
    out.length = len;

    if (factor >= 1.0) {
        for (let i = 0; i < len; i++) Cartesian3.clone(vertices[i], out[i]);
        return out;
    }

    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < len; i++) {
        cx += vertices[i].x;
        cy += vertices[i].y;
        cz += vertices[i].z;
    }
    cx /= len; cy /= len; cz /= len;

    for (let i = 0; i < len; i++) {
        const v = vertices[i];
        const o = out[i];
        o.x = cx + (v.x - cx) * factor;
        o.y = cy + (v.y - cy) * factor;
        o.z = cz + (v.z - cz) * factor;
    }
    return out;
}

interface OneWebCombLayerProps {
    targetSat: SatelliteData | null;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    servingPoints?: Array<{
        id: string;
        position: { lat: number; lng: number };
        label?: string;
    }>;
    commercialProjectionOrigin?: { lat: number; lng: number; altitudeKm?: number } | null;
    highlightServingFootprint?: boolean;
    regulatoryOverlayActive?: boolean;
    leoServiceViewModel?: LeoConnectivityViewModel | null;
    commercialTone?: 'primary' | 'secondary';
    commercialEnvelopeOnly?: boolean;
    commercialOpacityScale?: number;
    showCommercialProjectionPanels?: boolean;
}

const BLOCKED_BEAM_TINT = Color.fromCssColorString('#ef4444');
const BLOCKED_BEAM_BASE = Color.fromCssColorString('#cbd5e1');
const HIGH_LOAD_TINT = Color.fromCssColorString('#fb7185');
const SATURATED_LOAD_TINT = Color.fromCssColorString('#ef4444');
const SOFT_LOAD_TINT = Color.fromCssColorString('#fdf2f8');

// ─── Pre-allocated scratch instances ─────────────────────────────────────────
// Reused in Cesium frame callbacks so the GC never sees per-frame Color allocations.
// JavaScript is single-threaded — no concurrent mutation risk.
const _scratchColor     = new Color(); // lerp target in getDiagnosticBeamColor / getServingBeamColor
const _scratchBeamColor = new Color(); // direct writes in BeamRing colorCallback

// Constant colors computed once at module load — returned from highlight callbacks
// instead of calling Color.PALEVIOLETRED.withAlpha() on every frame.
const _HIGHLIGHT_FILL_COLOR    = Color.PALEVIOLETRED.withAlpha(0.4);
const _HIGHLIGHT_OUTLINE_COLOR = Color.PALEVIOLETRED.withAlpha(0.95);

// Outline color for beam polygon graphics — never changes.
const _BEAM_OUTLINE_COLOR = Color.WHITE.withAlpha(0.15);
const _COMMERCIAL_LEO_ENVELOPE_FILL = Color.fromCssColorString('#ec4899').withAlpha(0.24);
const _COMMERCIAL_LEO_ENVELOPE_FILL_SECONDARY = Color.fromCssColorString('#ec4899').withAlpha(0.10);
const _COMMERCIAL_LEO_ENVELOPE_OUTLINE = Color.fromCssColorString('#f9a8d4').withAlpha(0.92);
const _COMMERCIAL_LEO_ENVELOPE_OUTLINE_SECONDARY = Color.fromCssColorString('#f9a8d4').withAlpha(0.36);
const COMMERCIAL_LEO_ENVELOPE_PROJECTION_PANEL_COUNT = 4;

// Dummy PolygonHierarchy returned from hierarchy callbacks when geometry is not
// yet available — allocated once instead of new PolygonHierarchy() every frame.
const _dummyHierarchy = new PolygonHierarchy(DUMMY_POLYGON);

function getDiagnosticBeamColor(baseColor: Color, ringOpacity: number): Color {
    Color.lerp(baseColor, BLOCKED_BEAM_BASE, 0.72, _scratchColor);
    Color.lerp(_scratchColor, BLOCKED_BEAM_TINT, 0.22, _scratchColor);
    _scratchColor.alpha = ringOpacity * 0.42;
    return _scratchColor;
}

function getServingBeamColor(
    baseColor: Color,
    beamVisualState: LeoConnectivityViewModel['renderingHints']['beamVisualState'],
    alpha: number
): Color {
    if (beamVisualState === 'BLOCKED') {
        return getDiagnosticBeamColor(baseColor, alpha);
    }

    if (beamVisualState === 'LOW') {
        Color.lerp(baseColor, SOFT_LOAD_TINT, 0.38, _scratchColor);
        _scratchColor.alpha = alpha * 0.8;
        return _scratchColor;
    }
    if (beamVisualState === 'MEDIUM') {
        Color.lerp(baseColor, Color.WHITE, 0.12, _scratchColor);
        _scratchColor.alpha = alpha;
        return _scratchColor;
    }
    if (beamVisualState === 'HIGH') {
        Color.lerp(baseColor, HIGH_LOAD_TINT, 0.34, _scratchColor);
        _scratchColor.alpha = Math.min(1, alpha * 1.08);
        return _scratchColor;
    }

    Color.lerp(baseColor, SATURATED_LOAD_TINT, 0.58, _scratchColor);
    _scratchColor.alpha = Math.min(1, alpha * 1.16);
    return _scratchColor;
}

function getRenderablePolygon(
    geometries: Cartesian3[][] | null,
    beamIndex: number
): Cartesian3[] {
    return sanitizeCartesianRing(geometries?.[beamIndex] ?? null);
}

function isBeamActiveAtTime(targetSat: SatelliteData, beamIndex: number, time: JulianDate): boolean {
    if (!targetSat.satrec) return false;
    // Geometry-derived GSO keep-out (Lot 3 Item 4), cached per (satrec, instant).
    return !getGsoMutedBeamSet(targetSat.satrec, time).has(beamIndex);
}

function cartesianToLngLat(point: Cartesian3): { lng: number; lat: number } {
    const cartographic = Cartographic.fromCartesian(point);
    return {
        lng: CesiumMath.toDegrees(cartographic.longitude),
        lat: CesiumMath.toDegrees(cartographic.latitude),
    };
}

function normalizeLngNear(lng: number, referenceLng: number): number {
    let value = lng;
    while (value - referenceLng > 180) value -= 360;
    while (value - referenceLng < -180) value += 360;
    return value;
}

function denormalizeLng(lng: number): number {
    let value = lng;
    while (value > 180) value -= 360;
    while (value < -180) value += 360;
    return value;
}

function buildEnvelopePositions(polygons: Cartesian3[][]): Cartesian3[] {
    const lngLatPoints = polygons
        .flatMap((polygon) => polygon.map(cartesianToLngLat))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (lngLatPoints.length < 3) return DUMMY_POLYGON;

    const referenceLng = lngLatPoints[0].lng;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const point of lngLatPoints) {
        const normalizedLng = normalizeLngNear(point.lng, referenceLng);
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLng = Math.min(minLng, normalizedLng);
        maxLng = Math.max(maxLng, normalizedLng);
    }

    if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite) || minLat === maxLat || minLng === maxLng) {
        return DUMMY_POLYGON;
    }

    const latPadding = Math.max((maxLat - minLat) * 0.04, 0.02);
    const lngPadding = Math.max((maxLng - minLng) * 0.04, 0.02);
    minLat = Math.max(-89.8, minLat - latPadding);
    maxLat = Math.min(89.8, maxLat + latPadding);
    minLng -= lngPadding;
    maxLng += lngPadding;

    return Cartesian3.fromDegreesArrayHeights([
        denormalizeLng(minLng), minLat, FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M,
        denormalizeLng(maxLng), minLat, FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M,
        denormalizeLng(maxLng), maxLat, FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M,
        denormalizeLng(minLng), maxLat, FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M,
    ]);
}

const CommercialServingBeamEnvelope = React.memo<{
    targetSat: SatelliteData;
    getCombGeometriesRef: React.MutableRefObject<(sat: SatelliteData, time: JulianDate) => Cartesian3[][] | null>;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    servingPoints?: Array<{
        id: string;
        position: { lat: number; lng: number };
        label?: string;
    }>;
    commercialTone: 'primary' | 'secondary';
    commercialOpacityScale: number;
    commercialProjectionOrigin?: { lat: number; lng: number; altitudeKm?: number } | null;
    showProjectionPanels: boolean;
}>(({
    targetSat,
    getCombGeometriesRef,
    viewerRef,
    selectedPosition,
    selectedAircraft,
    servingPoints,
    commercialTone,
    commercialOpacityScale,
    commercialProjectionOrigin,
    showProjectionPanels,
}) => {
    const cacheRef = useRef<{
        sourceGeometries: Cartesian3[][] | null;
        targetSignature: string;
        footprintPositions: Cartesian3[];
        positions: Cartesian3[];
        hierarchy: PolygonHierarchy;
        show: boolean;
    }>({
        sourceGeometries: null,
        targetSignature: '',
        footprintPositions: DUMMY_POLYGON,
        positions: DUMMY_POLYGON,
        hierarchy: _dummyHierarchy,
        show: false,
    });

    const getEnvelope = useMemo(() => {
        const resolveTargetPoints = (time: JulianDate): Array<{ lat: number; lng: number }> => {
            if (servingPoints?.length) {
                return servingPoints.map((point) => point.position);
            }
            if (selectedAircraft) {
                const p = calculateDeadReckoning(selectedAircraft, time);
                const c = Cartographic.fromCartesian(p);
                return [{ lat: CesiumMath.toDegrees(c.latitude), lng: CesiumMath.toDegrees(c.longitude) }];
            }
            if (selectedPosition) {
                return [{ lat: selectedPosition.lat, lng: selectedPosition.lng }];
            }
            return [];
        };

        return (time?: JulianDate) => {
            if (!time || !viewerRef.current) return cacheRef.current;
            const geometries = getCombGeometriesRef.current(targetSat, time);
            const targets = resolveTargetPoints(time);
            const targetSignature = targets
                .map((target) => `${target.lat.toFixed(5)}:${target.lng.toFixed(5)}`)
                .join('|');
            if (
                geometries === cacheRef.current.sourceGeometries
                && targetSignature === cacheRef.current.targetSignature
            ) {
                return cacheRef.current;
            }

            const activePolygons: Cartesian3[][] = [];
            let coversAnyTarget = false;

            for (let beamIndex = 0; beamIndex < TOTAL_BEAMS; beamIndex += 1) {
                if (!isBeamActiveAtTime(targetSat, beamIndex, time)) continue;
                const polygon = getRenderablePolygon(geometries, beamIndex);
                if (polygon.length < 3) continue;

                activePolygons.push(polygon);

                if (!coversAnyTarget) {
                    const ring: Array<[number, number]> = polygon.map((point) => {
                        const { lng, lat } = cartesianToLngLat(point);
                        return [lng, lat];
                    });
                    coversAnyTarget = targets.some((target) => isPointInPolygon(target, ring));
                }
            }

            const positions = coversAnyTarget && activePolygons.length > 0
                ? buildEnvelopePositions(activePolygons)
                : DUMMY_POLYGON;
            const sanitized = sanitizeCartesianRing(positions);
            cacheRef.current = {
                sourceGeometries: geometries,
                targetSignature,
                footprintPositions: sanitized.length >= 3 ? sanitized : DUMMY_POLYGON,
                positions: sanitized.length >= 3 ? [...sanitized, sanitized[0]] : DUMMY_POLYGON,
                hierarchy: sanitized.length >= 3 ? new PolygonHierarchy(sanitized) : _dummyHierarchy,
                show: sanitized.length >= 3,
            };
            return cacheRef.current;
        };
    }, [
        getCombGeometriesRef,
        selectedAircraft,
        selectedPosition?.lat,
        selectedPosition?.lng,
        servingPoints,
        targetSat,
        viewerRef,
    ]);

    const fillMaterial = useMemo(() => (
        new ColorMaterialProperty((commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_FILL : _COMMERCIAL_LEO_ENVELOPE_FILL_SECONDARY).withAlpha(
            (commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_FILL : _COMMERCIAL_LEO_ENVELOPE_FILL_SECONDARY).alpha * commercialOpacityScale
        ))
    ), [commercialOpacityScale, commercialTone]);
    const contourMaterial = useMemo(() => (
        new ColorMaterialProperty((commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_OUTLINE : _COMMERCIAL_LEO_ENVELOPE_OUTLINE_SECONDARY).withAlpha(
            (commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_OUTLINE : _COMMERCIAL_LEO_ENVELOPE_OUTLINE_SECONDARY).alpha * commercialOpacityScale
        ))
    ), [commercialOpacityScale, commercialTone]);
    const projectionPanelMaterial = useMemo(() => (
        new ColorMaterialProperty((commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_FILL : _COMMERCIAL_LEO_ENVELOPE_FILL_SECONDARY).withAlpha(
            (commercialTone === 'primary' ? 0.18 : 0.065) * commercialOpacityScale
        ))
    ), [commercialOpacityScale, commercialTone]);
    const outlineColor = useMemo(() => (
        (commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_OUTLINE : _COMMERCIAL_LEO_ENVELOPE_OUTLINE_SECONDARY).withAlpha(
            (commercialTone === 'primary' ? _COMMERCIAL_LEO_ENVELOPE_OUTLINE : _COMMERCIAL_LEO_ENVELOPE_OUTLINE_SECONDARY).alpha * commercialOpacityScale
        )
    ), [commercialOpacityScale, commercialTone]);

    const show = useMemo(() => new CallbackProperty((time?: JulianDate) => getEnvelope(time).show, false), [getEnvelope]);
    const hierarchy = useMemo(() => new CallbackProperty((time?: JulianDate) => getEnvelope(time).hierarchy, false), [getEnvelope]);
    const contourPositions = useMemo(() => new CallbackProperty((time?: JulianDate) => getEnvelope(time).positions, false), [getEnvelope]);
    const projectionPanelHierarchies = useMemo(() => (
        Array.from({ length: COMMERCIAL_LEO_ENVELOPE_PROJECTION_PANEL_COUNT }, (_, index) => (
            new CallbackProperty((time?: JulianDate) => {
                const envelope = getEnvelope(time);
                const footprintPositions = envelope.footprintPositions;
                if (!envelope.show || footprintPositions.length < 3 || index >= footprintPositions.length) {
                    return _dummyHierarchy;
                }

                const next = footprintPositions[(index + 1) % footprintPositions.length];
                const projectionOrigin = commercialProjectionOrigin ?? {
                    lat: targetSat.position.lat,
                    lng: targetSat.position.lng,
                    altitudeKm: targetSat.position.alt || 1_200,
                };
                const satellitePosition = getPosition(
                    projectionOrigin.lat,
                    projectionOrigin.lng,
                    projectionOrigin.altitudeKm ?? (targetSat.position.alt || 1_200)
                );
                return new PolygonHierarchy([
                    satellitePosition,
                    footprintPositions[index],
                    next,
                ]);
            }, false)
        ))
    ), [commercialProjectionOrigin, getEnvelope, targetSat.position.alt, targetSat.position.lat, targetSat.position.lng]);

    return (
        <>
            {showProjectionPanels && projectionPanelHierarchies.map((panelHierarchy, index) => (
                <Entity key={`commercial-leo-serving-beam-projection-${targetSat.id}-${index}`} name="Commercial LEO serving beam projection">
                    <PolygonGraphics
                        show={show}
                        hierarchy={panelHierarchy}
                        material={projectionPanelMaterial}
                        outline={false}
                        perPositionHeight={true}
                    />
                </Entity>
            ))}
            <Entity name="Commercial LEO serving beam envelope">
                <PolygonGraphics
                    show={show}
                    hierarchy={hierarchy}
                    material={fillMaterial}
                    outline={true}
                    outlineColor={outlineColor}
                    outlineWidth={commercialTone === 'primary' ? 4 : 2}
                    height={FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M}
                />
            </Entity>
            <Entity
                name="Commercial LEO serving beam envelope contour"
                polyline={{
                    show,
                    positions: contourPositions,
                    width: commercialTone === 'primary' ? 3 : 1.5,
                    material: contourMaterial,
                    clampToGround: false,
                }}
            />
        </>
    );
});
CommercialServingBeamEnvelope.displayName = 'CommercialServingBeamEnvelope';

// ─── Single ring of a gradient beam ────────────────────────────────
const BeamRing = React.memo<{
    beamIndex: number;
    ringIndex: number;
    scaleFactor: number;
    ringOpacity: number;
    targetSat: SatelliteData;
    getCombGeometriesRef: React.MutableRefObject<(sat: SatelliteData, time: JulianDate) => Cartesian3[][] | null>;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    hsBeamsRef: React.MutableRefObject<ReadonlySet<number>>;
    regulatoryBlockedRef: React.MutableRefObject<boolean>;
    commercialTone: 'primary' | 'secondary';
    opacityScale: number;
}>(({ beamIndex, ringIndex, scaleFactor, ringOpacity, targetSat, getCombGeometriesRef, viewerRef, hsBeamsRef, regulatoryBlockedRef, commercialTone, opacityScale }) => {
    const opacityMultiplier = (commercialTone === 'secondary' ? 0.28 : 1) * opacityScale;
    const effectiveRingOpacity = ringOpacity * opacityMultiplier;

    // Cached PolygonHierarchy — recomputed only when the worker posts new geometry
    // (i.e. when getCombGeometries returns a new array reference). Between worker
    // updates the same reference is returned on every frame, so both callbacks
    // hit the identity guard and return the cached values with zero allocation.
    // Whichever callback (show or hierarchy) runs first in a given update frame
    // writes the cache; the second one reads it for free.
    const cachedRef = useRef<{
        sourceGeometries: Cartesian3[][] | null;
        hierarchy: PolygonHierarchy;
        show: boolean;
    }>({ sourceGeometries: null, hierarchy: _dummyHierarchy, show: false });
    // Scratch Cartesian3[] reused across geometry updates so scalePolygon never
    // allocates per-vertex. Cesium re-reads positions every frame; in-place mutation
    // between updates is safe.
    const scratchVerticesRef = useRef<Cartesian3[]>([]);

    const showCallback = useMemo(() => {
        return new CallbackProperty((time?: JulianDate) => {
            if (!time || !viewerRef.current) return false;
            const geometries = getCombGeometriesRef.current(targetSat, time);
            if (geometries !== cachedRef.current.sourceGeometries) {
                const polygon = getRenderablePolygon(geometries, beamIndex);
                if (polygon.length >= 3) {
                    try {
                        const scaled = sanitizeCartesianRing(scalePolygonInto(polygon, scaleFactor, scratchVerticesRef.current));
                        cachedRef.current = {
                            sourceGeometries: geometries,
                            hierarchy: scaled.length >= 3 ? new PolygonHierarchy(scaled) : _dummyHierarchy,
                            show: scaled.length >= 3,
                        };
                    } catch (e) {
                        cachedRef.current = { sourceGeometries: geometries, hierarchy: _dummyHierarchy, show: false };
                    }
                } else {
                    cachedRef.current = { sourceGeometries: geometries, hierarchy: _dummyHierarchy, show: false };
                }
            }
            return cachedRef.current.show;
        }, false);
    }, [beamIndex, scaleFactor, targetSat.id, viewerRef]);

    const hierarchyCallback = useMemo(() => {
        return new CallbackProperty((time?: JulianDate) => {
            if (!time || !viewerRef.current) return _dummyHierarchy;
            const geometries = getCombGeometriesRef.current(targetSat, time);
            if (geometries !== cachedRef.current.sourceGeometries) {
                const polygon = getRenderablePolygon(geometries, beamIndex);
                if (polygon.length >= 3) {
                    try {
                        const scaled = sanitizeCartesianRing(scalePolygonInto(polygon, scaleFactor, scratchVerticesRef.current));
                        cachedRef.current = {
                            sourceGeometries: geometries,
                            hierarchy: scaled.length >= 3 ? new PolygonHierarchy(scaled) : _dummyHierarchy,
                            show: scaled.length >= 3,
                        };
                    } catch (e) {
                        console.error('Error pre-scaling beam polygon', e);
                        cachedRef.current = { sourceGeometries: geometries, hierarchy: _dummyHierarchy, show: false };
                    }
                } else {
                    cachedRef.current = { sourceGeometries: geometries, hierarchy: _dummyHierarchy, show: false };
                }
            }
            return cachedRef.current.hierarchy;
        }, false);
    }, [beamIndex, scaleFactor, targetSat.id, viewerRef]);

    const colorCallback = useMemo(() => {
        return new ColorMaterialProperty(new CallbackProperty((time?: JulianDate) => {
            // HS beam → solid red (out of service)
            if (hsBeamsRef.current.has(beamIndex)) {
                Color.clone(Color.RED, _scratchBeamColor);
                _scratchBeamColor.alpha = effectiveRingOpacity * 0.85;
                return _scratchBeamColor;
            }

            if (!time || !targetSat.satrec) {
                Color.clone(getBeamColor(beamIndex), _scratchBeamColor);
                _scratchBeamColor.alpha *= opacityMultiplier;
                return _scratchBeamColor;
            }

            // Geometry-derived GSO keep-out (Lot 3 Item 4) — muted beams render
            // gray. Cached per (satrec, instant), so this is a lookup per frame.
            if (getGsoMutedBeamSet(targetSat.satrec, time).has(beamIndex)) {
                Color.clone(Color.GRAY, _scratchBeamColor);
                _scratchBeamColor.alpha = 0.15 * (effectiveRingOpacity / 0.75);
                return _scratchBeamColor;
            }

            // Active beam → frequency-reuse color with gradient opacity
            const baseColor = getBeamBaseColor(beamIndex);
            if (regulatoryBlockedRef.current) {
                return getDiagnosticBeamColor(baseColor, effectiveRingOpacity);
            }
            Color.clone(baseColor, _scratchBeamColor);
            _scratchBeamColor.alpha = effectiveRingOpacity;
            return _scratchBeamColor;
        }, false));
    }, [beamIndex, effectiveRingOpacity, opacityMultiplier, targetSat.id, targetSat.satrec, hsBeamsRef, regulatoryBlockedRef]);

    return (
        <Entity name={`Beam ${beamIndex} ring ${ringIndex}`}>
            <PolygonGraphics
                show={showCallback}
                hierarchy={hierarchyCallback}
                material={colorCallback}
                outline={ringIndex === 0} // outline only on outermost ring
                outlineColor={commercialTone === 'secondary' ? Color.WHITE.withAlpha(0.05) : _BEAM_OUTLINE_COLOR}
                outlineWidth={1}
                height={FOOTPRINT_LAYER_HEIGHT_M}
            />
        </Entity>
    );
});
BeamRing.displayName = 'BeamRing';

// ─── Gradient beam (multiple rings) ────────────────────────────────
const GradientBeamPolygon = React.memo<{
    beamIndex: number;
    targetSat: SatelliteData;
    getCombGeometriesRef: React.MutableRefObject<(sat: SatelliteData, time: JulianDate) => Cartesian3[][] | null>;
    viewerRef: React.RefObject<CesiumViewerType | null>;
    hasBackhaul: boolean;
    hsBeamsRef: React.MutableRefObject<ReadonlySet<number>>;
    regulatoryBlockedRef: React.MutableRefObject<boolean>;
    commercialTone: 'primary' | 'secondary';
    opacityScale: number;
}>(({ beamIndex, targetSat, getCombGeometriesRef, viewerRef, hsBeamsRef, regulatoryBlockedRef, commercialTone, opacityScale }) => {

    if (!GRADIENT_RENDERING.ENABLE_GRADIENT) {
        // Fallback: single flat polygon (original behaviour)
        return (
            <BeamRing
                beamIndex={beamIndex}
                ringIndex={0}
                scaleFactor={1.0}
                ringOpacity={0.4}
                targetSat={targetSat}
                getCombGeometriesRef={getCombGeometriesRef}
                viewerRef={viewerRef}
                hsBeamsRef={hsBeamsRef}
                regulatoryBlockedRef={regulatoryBlockedRef}
                commercialTone={commercialTone}
                opacityScale={opacityScale}
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
                    getCombGeometriesRef={getCombGeometriesRef}
                    viewerRef={viewerRef}
                    hsBeamsRef={hsBeamsRef}
                    regulatoryBlockedRef={regulatoryBlockedRef}
                    commercialTone={commercialTone}
                    opacityScale={opacityScale}
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
    servingPoints,
    commercialProjectionOrigin,
    highlightServingFootprint = false,
    regulatoryOverlayActive = false,
    leoServiceViewModel = null,
    commercialTone = 'primary',
    commercialEnvelopeOnly = false,
    commercialOpacityScale = 1,
    showCommercialProjectionPanels = true,
}) => {

    // requestRenderMode wiring, step 2b.2 (Group B: data-cadence followers).
    // BEHAVIOUR-NEUTRAL: requestRender() is a no-op while scene.requestRenderMode
    // is false, which is the current configuration. Comb geometry follows the ~1 Hz satellite tick.
    useEffect(() => {
        requestGlobeRender(viewerRef.current);
    }, [targetSat, servingPoints, selectedPosition, commercialProjectionOrigin]);

    const { getCombGeometries } = useCombGeometry();
    // Stable ref so BeamRing/highlight callbacks always call the latest getCombGeometries
    // without being recreated when sim state (beam health, weather, SNP) changes.
    const getCombGeometriesRef = useRef(getCombGeometries);
    getCombGeometriesRef.current = getCombGeometries;
    const { coveragePolicy, failedSnps, hsBeamsSet } = useSimulation();

    // Stable ref so CallbackProperty callbacks always read the latest HS set
    // without needing to recreate the callbacks when it changes.
    const hsBeamsRef = useRef<ReadonlySet<number>>(hsBeamsSet);
    hsBeamsRef.current = hsBeamsSet;
    const regulatoryBlockedRef = useRef<boolean>(
        regulatoryOverlayActive
        && leoServiceViewModel?.serviceStatus === 'BLOCKED'
        && leoServiceViewModel?.decisionDriver === 'REGULATORY'
    );
    regulatoryBlockedRef.current =
        regulatoryOverlayActive
        && leoServiceViewModel?.serviceStatus === 'BLOCKED'
        && leoServiceViewModel?.decisionDriver === 'REGULATORY';
    const beamVisualStateRef = useRef<LeoConnectivityViewModel['renderingHints']['beamVisualState']>(
        leoServiceViewModel?.renderingHints.beamVisualState ?? 'LOW'
    );
    beamVisualStateRef.current = leoServiceViewModel?.renderingHints.beamVisualState ?? 'LOW';
    const commercialOpacityMultiplier = (commercialTone === 'secondary' ? 0.28 : 1) * commercialOpacityScale;

    // Generate beam indices array once - MUST be before any early return
    const beamIndices = useMemo(() => Array.from({ length: TOTAL_BEAMS }, (_, i) => i), []);

    // Live ref so positionCallback always reads the latest satellite position
    // without running SGP4. Coverage circles are ~1000 km radius — the sub-km
    // position delta between React update cycles is visually imperceptible.
    const targetSatLiveRef = useRef(targetSat);
    targetSatLiveRef.current = targetSat;

    // Create stable position callback for coverage circles - MUST be before any early return
    const positionCallback = useMemo(() => {
        if (!targetSat) return null;

        return new CallbackPositionProperty(() => {
            const sat = targetSatLiveRef.current;
            return getPosition(sat?.position.lat ?? 0, sat?.position.lng ?? 0, 0);
        }, false);
    }, [targetSat?.id]);

    const highlights = useMemo(() => {
        if (!highlightServingFootprint) {
            return [];
        }

        const explicitServingPoints = servingPoints?.length ? servingPoints : null;
        const highlightTargets = explicitServingPoints ?? [{ id: 'selected-site', position: null, label: 'Serving' }];

        const resolveServingBeam = (
            time?: JulianDate,
            explicitPoint?: { lat: number; lng: number } | null
        ) => {
            if (!time || !viewerRef.current || !targetSat) return null;
            if (!explicitPoint && !selectedPosition && !selectedAircraft) return null;

            const geometries = getCombGeometriesRef.current(targetSat, time);
            if (!geometries) return null;

            let point: { lat: number; lng: number } | null = null;
            if (explicitPoint) {
                point = explicitPoint;
            } else if (selectedAircraft) {
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

        return highlightTargets.map((target) => {
            const targetPosition = target.position;
            const show = new CallbackProperty((time?: JulianDate) => {
                return resolveServingBeam(time, targetPosition) !== null;
            }, false);

            const hierarchy = new CallbackProperty((time?: JulianDate) => {
                const servingBeam = resolveServingBeam(time, targetPosition);
                if (!servingBeam) return _dummyHierarchy;
                const polygon = sanitizeCartesianRing(servingBeam.polygon);
                if (polygon.length < 3) return _dummyHierarchy;
                return new PolygonHierarchy(polygon);
            }, false);

            const contourPositions = new CallbackProperty((time?: JulianDate) => {
                const servingBeam = resolveServingBeam(time, targetPosition);
                if (!servingBeam) return DUMMY_POLYGON;

                const polygon = servingBeam.polygon;
                const sanitized = sanitizeCartesianRing(polygon);
                if (sanitized.length < 3) return DUMMY_POLYGON;

                const degreesWithHeights: number[] = [];
                const closed = [...sanitized, sanitized[0]];
                for (const point of closed) {
                    const cartographic = Cartographic.fromCartesian(point);
                    degreesWithHeights.push(
                        CesiumMath.toDegrees(cartographic.longitude),
                        CesiumMath.toDegrees(cartographic.latitude),
                        FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M
                    );
                }

                return Cartesian3.fromDegreesArrayHeights(degreesWithHeights);
            }, false);

            const material = new ColorMaterialProperty(new CallbackProperty((time?: JulianDate) => {
                const servingBeam = resolveServingBeam(time, targetPosition);
                if (!servingBeam) return _HIGHLIGHT_FILL_COLOR.withAlpha(_HIGHLIGHT_FILL_COLOR.alpha * commercialOpacityScale);
                return getServingBeamColor(
                    getBeamBaseColor(servingBeam.beamIndex),
                    beamVisualStateRef.current,
                    0.28 * commercialOpacityScale
                );
            }, false));

            const outlineColor = new CallbackProperty((time?: JulianDate) => {
                const servingBeam = resolveServingBeam(time, targetPosition);
                if (!servingBeam) return _HIGHLIGHT_OUTLINE_COLOR.withAlpha(_HIGHLIGHT_OUTLINE_COLOR.alpha * commercialOpacityScale);
                return getServingBeamColor(
                    getBeamBaseColor(servingBeam.beamIndex),
                    beamVisualStateRef.current,
                    0.95 * commercialOpacityScale
                );
            }, false);

            const contourMaterial = new ColorMaterialProperty(outlineColor);

            return { id: target.id, label: target.label, show, hierarchy, contourPositions, material, outlineColor, contourMaterial };
        });
    }, [commercialOpacityScale, highlightServingFootprint, viewerRef, targetSat?.id, selectedPosition?.lat, selectedPosition?.lng, selectedAircraft?.icao24, servingPoints]);

    // These useMemo hooks MUST be before the early return to satisfy the Rules of Hooks.
    // They guard against null targetSat internally and produce no-op values in that case.
    const horizonRadius = useMemo(
        () => targetSat ? footprintRadiusKm(targetSat.position.alt || 1200, MIN_SNP_GATEWAY_ELEVATION_DEG) * 1000 : 0,
        [targetSat?.position.alt]
    );

    const serviceZoneRadius = useMemo(
        () => targetSat ? footprintRadiusKm(targetSat.position.alt || 1200, STANDARD_SERVICE_ELEVATION_DEG) * 1000 : 0,
        [targetSat?.position.alt]
    );

    const backhaulColor = useMemo(
        () => targetSat
            ? (
                regulatoryBlockedRef.current
                    ? Color.fromCssColorString('#ef4444').withAlpha(0.18 * commercialOpacityMultiplier)
                    : Color.fromCssColorString(getCoverageColor('ONEWEB_BACKHAUL', 0.2, targetSat, failedSnps))
            )
            : Color.TRANSPARENT,
        [targetSat?.id, failedSnps, regulatoryOverlayActive, leoServiceViewModel?.serviceStatus, leoServiceViewModel?.decisionDriver, commercialOpacityMultiplier]
    );

    const standardColorFill = useMemo(
        () => targetSat
            ? (
                regulatoryBlockedRef.current
                    ? Color.fromCssColorString('#fca5a5').withAlpha(0.16 * commercialOpacityMultiplier)
                    : Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.2 * commercialOpacityMultiplier, targetSat, failedSnps))
            )
            : Color.TRANSPARENT,
        [targetSat?.id, failedSnps, regulatoryOverlayActive, leoServiceViewModel?.serviceStatus, leoServiceViewModel?.decisionDriver, commercialOpacityMultiplier]
    );

    const standardColorOutline = useMemo(
        () => targetSat
            ? (
                regulatoryBlockedRef.current
                    ? Color.fromCssColorString('#f87171').withAlpha(0.88 * commercialOpacityMultiplier)
                    : Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.95 * commercialOpacityMultiplier, targetSat, failedSnps))
            )
            : Color.TRANSPARENT,
        [targetSat?.id, failedSnps, regulatoryOverlayActive, leoServiceViewModel?.serviceStatus, leoServiceViewModel?.decisionDriver, commercialOpacityMultiplier]
    );

    // hasSNPInCoverage performs polygon-point intersection tests across all SNPs;
    // memoized so it only re-runs when the satellite position or SNP state changes.
    const hasBackhaul = useMemo(
        () => targetSat ? hasSNPInCoverage(targetSat, failedSnps) : false,
        [targetSat?.id, targetSat?.position.lat, targetSat?.position.lng, failedSnps]
    );

    // Early return AFTER all hooks have been called
    if (!targetSat || !targetSat.satrec) {
        return null;
    }

    if (commercialEnvelopeOnly) {
        return (
            <CommercialServingBeamEnvelope
                targetSat={targetSat}
                getCombGeometriesRef={getCombGeometriesRef}
                viewerRef={viewerRef}
                selectedPosition={selectedPosition}
                selectedAircraft={selectedAircraft}
                servingPoints={servingPoints}
                commercialTone={commercialTone}
                commercialOpacityScale={commercialOpacityScale}
                commercialProjectionOrigin={commercialProjectionOrigin}
                showProjectionPanels={showCommercialProjectionPanels}
            />
        );
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
                    outlineColor={backhaulColor.withAlpha((commercialTone === 'secondary' ? 0.28 : 1) * commercialOpacityScale)}
                    outlineWidth={commercialTone === 'secondary' ? 1 : 2}
                    height={FOOTPRINT_OUTLINE_LAYER_HEIGHT_M}
                />
            </Entity>

            {coveragePolicy.type === 'SERVICE_ZONE' && (
                <Entity position={positionCallback!} name="Guaranteed service zone">
                    <EllipseGraphics
                        semiMajorAxis={serviceZoneRadius}
                        semiMinorAxis={serviceZoneRadius}
                        material={standardColorFill}
                        outline={true}
                        outlineColor={standardColorOutline.withAlpha((commercialTone === 'secondary' ? 0.28 : 1) * commercialOpacityScale)}
                        outlineWidth={commercialTone === 'secondary' ? 1 : 3}
                        height={FOOTPRINT_LAYER_HEIGHT_M}
                    />
                </Entity>
            )}

            {/* Beam polygons with gradient */}
            {beamIndices.map((i: number) => (
                <GradientBeamPolygon
                    key={`comb-beam-${i}`}
                    beamIndex={i}
                    targetSat={targetSat}
                    getCombGeometriesRef={getCombGeometriesRef}
                    viewerRef={viewerRef}
                    hasBackhaul={hasBackhaul}
                    hsBeamsRef={hsBeamsRef}
                    regulatoryBlockedRef={regulatoryBlockedRef}
                    commercialTone={commercialTone}
                    opacityScale={commercialOpacityScale}
                />
            ))}


            {highlights.map((highlight) => (
                <React.Fragment key={`serving-highlight-${targetSat.id}-${highlight.id}`}>
                    <Entity name={`Serving Footprint Highlight${highlight.label ? ` (${highlight.label})` : ''}`}>
                        <PolygonGraphics
                            show={highlight.show}
                            hierarchy={highlight.hierarchy}
                            material={highlight.material}
                            outline={true}
                            outlineColor={highlight.outlineColor}
                            outlineWidth={3}
                            height={FOOTPRINT_HIGHLIGHT_LAYER_HEIGHT_M}
                        />
                    </Entity>
                    <Entity
                        name={`Serving Footprint Contour${highlight.label ? ` (${highlight.label})` : ''}`}
                        polyline={{
                            show: highlight.show,
                            positions: highlight.contourPositions,
                            width: 2,
                            material: highlight.contourMaterial,
                            clampToGround: false,
                        }}
                    />
                </React.Fragment>
            ))}
        </>
    );
};

export default React.memo(OneWebCombLayer);
