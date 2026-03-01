import React, { useEffect, useMemo, useRef } from 'react';
import {
    BoundingSphere, Cartesian3, Color, ColorGeometryInstanceAttribute, ComponentDatatype,
    Cartographic, Geometry, GeometryAttribute, GeometryInstance, JulianDate, Math as CesiumMath,
    Matrix4, PerInstanceColorAppearance, Primitive, PrimitiveType, Transforms
} from 'cesium';
import type { Feature, Geometry as GeoJsonGeometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import { getCoverageColor } from '../../services/coverageService';
import { EARTH_RADIUS_KM } from '../../utils/capacityCalculator';
import { STANDARD_RADIUS_KM } from '../../utils/leoFootprint';
import { useCombGeometry } from './hooks';
import { calculateDeadReckoning, propagateSatellite } from './utils';

interface Props {
    selectedSatellite: SatelliteData | null;
    selectedBeamFeature?: Feature<GeoJsonGeometry, GeoJsonProperties> | null;
    beamSatellite?: SatelliteData | null;
    autoSelectedSatellite?: SatelliteData | null;
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    satellites: SatelliteData[];
    coverageFeatures: Feature<GeoJsonGeometry, GeoJsonProperties>[];
    viewerRef: React.RefObject<any>;
}

type Point2 = { x: number; y: number; index: number };
function cross(o: Point2, a: Point2, b: Point2) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }

function convexHull(points: Point2[]): Point2[] {
    if (points.length <= 1) return points;
    const sorted = [...points].sort((p, q) => (p.x === q.x ? p.y - q.y : p.x - q.x));
    const lower: Point2[] = [];
    for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    const upper: Point2[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop(); return lower.concat(upper);
}

function computeCenter(points: Cartesian3[]): Cartesian3 {
    const sum = new Cartesian3(0, 0, 0);
    for (const p of points) Cartesian3.add(sum, p, sum);
    if (Cartesian3.magnitudeSquared(sum) === 0) return points[0];
    const avg = Cartesian3.multiplyByScalar(sum, 1 / points.length, new Cartesian3());
    const dir = Cartesian3.normalize(avg, avg);
    const r = Cartesian3.magnitude(points[0]);
    return Cartesian3.multiplyByScalar(dir, r, dir);
}

function computeLocalHull(points: Cartesian3[]): Cartesian3[] {
    if (points.length < 3) return [];
    const center = computeCenter(points);
    const enu = Transforms.eastNorthUpToFixedFrame(center);
    const invEnu = Matrix4.inverseTransformation(enu, new Matrix4());
    const candidates: Point2[] = [];
    for (let i = 0; i < points.length; i++) {
        const local = Matrix4.multiplyByPoint(invEnu, points[i], new Cartesian3());
        if (!isFinite(local.x) || !isFinite(local.y)) continue;
        candidates.push({ x: local.x, y: local.y, index: i });
    }
    if (candidates.length < 3) return [];
    const hull2d = convexHull(candidates);
    if (hull2d.length < 3) return [];
    return hull2d.map((p) => points[p.index]);
}

function buildSideOnlyConeGeometry(apex: Cartesian3, base: Cartesian3[]): Geometry | null {
    if (base.length < 3) return null;
    const vertexCount = 1 + base.length;
    const positions = new Float64Array(vertexCount * 3);
    positions[0] = apex.x; positions[1] = apex.y; positions[2] = apex.z;
    for (let i = 0; i < base.length; i++) {
        const p = base[i];
        const o = (i + 1) * 3;
        positions[o] = p.x; positions[o + 1] = p.y; positions[o + 2] = p.z;
    }
    const boundingSphere = BoundingSphere.fromVertices(positions as any);
    const triangles = base.length;
    const indices = vertexCount > 65535 ? new Uint32Array(triangles * 3) : new Uint16Array(triangles * 3);
    for (let i = 0; i < base.length; i++) {
        const a = 0; const b = i + 1; const c = ((i + 1) % base.length) + 1;
        const t = i * 3;
        indices[t] = a; indices[t + 1] = b; indices[t + 2] = c;
    }
    const normals = new Float32Array(vertexCount * 3);
    const tmpA = new Cartesian3(); const tmpB = new Cartesian3(); const tmpC = new Cartesian3();
    const e1 = new Cartesian3(); const e2 = new Cartesian3(); const fn = new Cartesian3();
    for (let i = 0; i < base.length; i++) {
        const bIdx = i + 1; const cIdx = ((i + 1) % base.length) + 1;
        Cartesian3.fromArray(positions as any, 0, tmpA);
        Cartesian3.fromArray(positions as any, bIdx * 3, tmpB);
        Cartesian3.fromArray(positions as any, cIdx * 3, tmpC);
        Cartesian3.subtract(tmpB, tmpA, e1);
        Cartesian3.subtract(tmpC, tmpA, e2);
        Cartesian3.cross(e1, e2, fn);
        if (Cartesian3.magnitudeSquared(fn) > 0) Cartesian3.normalize(fn, fn);
        normals[0] += fn.x; normals[1] += fn.y; normals[2] += fn.z;
        normals[bIdx * 3] += fn.x; normals[bIdx * 3 + 1] += fn.y; normals[bIdx * 3 + 2] += fn.z;
        normals[cIdx * 3] += fn.x; normals[cIdx * 3 + 1] += fn.y; normals[cIdx * 3 + 2] += fn.z;
    }
    for (let i = 0; i < vertexCount; i++) {
        const o = i * 3;
        const n = new Cartesian3(normals[o], normals[o + 1], normals[o + 2]);
        if (Cartesian3.magnitudeSquared(n) > 0) { Cartesian3.normalize(n, n); normals[o] = n.x; normals[o + 1] = n.y; normals[o + 2] = n.z; }
    }
    const geometry = new Geometry({
        attributes: ({
            position: new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions }),
            normal: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: normals })
        } as any),
        indices, boundingSphere, primitiveType: PrimitiveType.TRIANGLES
    });
    return geometry;
}

function pickFootprintPoints(
    sat: SatelliteData,
    time: JulianDate | undefined,
    getCombGeometries: (sat: SatelliteData, time: JulianDate) => Cartesian3[][] | null,
    coverageFeatures: Feature<GeoJsonGeometry, GeoJsonProperties>[]
): Cartesian3[] {
    if (sat.type === 'ONEWEB' && time) {
        const geometries = getCombGeometries(sat, time);
        if (!geometries) return [];
        const pts: Cartesian3[] = [];
        for (const poly of geometries) if (poly && poly.length >= 3) pts.push(...poly);
        return pts;
    }
    const pts: Cartesian3[] = [];
    for (const feature of coverageFeatures) {
        if (feature.geometry?.type !== 'Polygon') continue;
        if (feature.properties?.satelliteId !== sat.name) continue;
        const coords = (feature.geometry.coordinates?.[0] ?? []) as unknown as number[][];
        for (const coord of coords) {
            const lng = coord[0]; const lat = coord[1];
            if (!isFinite(lat) || !isFinite(lng)) continue;
            pts.push(Cartesian3.fromDegrees(lng, lat, 0));
        }
    }
    return pts;
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

function stripDuplicateClosure(poly: Cartesian3[]): Cartesian3[] {
    if (poly.length < 2) return poly;
    const a = poly[0];
    const b = poly[poly.length - 1];
    if (Cartesian3.equalsEpsilon(a, b, 0, 1e-6)) return poly.slice(0, -1);
    return poly;
}

function pickServingOneWebBeamRing(
    sat: SatelliteData,
    time: JulianDate,
    getCombGeometries: (sat: SatelliteData, time: JulianDate) => Cartesian3[][] | null,
    selectedPosition: { lat: number; lng: number } | null,
    selectedAircraft: Aircraft | null
): Cartesian3[] {
    if (sat.type !== 'ONEWEB') return [];
    if (!selectedPosition && !selectedAircraft) return [];

    const geometries = getCombGeometries(sat, time);
    if (!geometries) return [];

    let point: { lat: number; lng: number } | null = null;
    if (selectedAircraft) {
        const p = calculateDeadReckoning(selectedAircraft, time);
        const c = Cartographic.fromCartesian(p);
        point = { lat: CesiumMath.toDegrees(c.latitude), lng: CesiumMath.toDegrees(c.longitude) };
    } else if (selectedPosition) {
        point = { lat: selectedPosition.lat, lng: selectedPosition.lng };
    }
    if (!point) return [];

    for (let i = 0; i < geometries.length; i++) {
        const poly = geometries[i];
        if (!poly || poly.length < 3) continue;
        const ring: Array<[number, number]> = poly.map((p) => {
            const c = Cartographic.fromCartesian(p);
            return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
        });
        if (isPointInPolygon(point, ring)) return stripDuplicateClosure(poly);
    }
    return [];
}

function buildStandardFootprintRing(subSat: { lat: number; lng: number }, segments = 64): Cartesian3[] {
    const lat1 = CesiumMath.toRadians(subSat.lat);
    const lon1 = CesiumMath.toRadians(subSat.lng);
    const d = STANDARD_RADIUS_KM / EARTH_RADIUS_KM;

    const ring: Cartesian3[] = [];
    for (let i = 0; i < segments; i++) {
        const brng = (i / segments) * (Math.PI * 2);
        const sinLat1 = Math.sin(lat1);
        const cosLat1 = Math.cos(lat1);

        const sinD = Math.sin(d);
        const cosD = Math.cos(d);
        const sinLat2 = sinLat1 * cosD + cosLat1 * sinD * Math.cos(brng);
        const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
        const y = Math.sin(brng) * sinD * cosLat1;
        const x = cosD - sinLat1 * Math.sin(lat2);
        const lon2 = lon1 + Math.atan2(y, x);

        ring.push(Cartesian3.fromDegrees(CesiumMath.toDegrees(lon2), CesiumMath.toDegrees(lat2), 0));
    }
    return ring;
}

function pickBeamFootprintPoints(
    beamFeature: Feature<GeoJsonGeometry, GeoJsonProperties>
): Cartesian3[] {
    if (beamFeature.geometry?.type !== 'Polygon') return [];
    const coords = (beamFeature.geometry.coordinates?.[0] ?? []) as unknown as number[][];
    const pts: Cartesian3[] = [];
    for (const coord of coords) {
        const lng = coord[0];
        const lat = coord[1];
        if (!isFinite(lat) || !isFinite(lng)) continue;
        pts.push(Cartesian3.fromDegrees(lng, lat, 0));
    }
    // Some polygons repeat the first coordinate as last - remove duplicate to avoid degenerate triangle
    if (pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (Cartesian3.equalsEpsilon(a, b, 0, 1e-6)) {
            pts.pop();
        }
    }
    return pts;
}

const AggregatedCoverageVolumeLayer: React.FC<Props> = ({
    selectedSatellite,
    selectedBeamFeature = null,
    beamSatellite = null,
    autoSelectedSatellite = null,
    selectedPosition = null,
    selectedAircraft = null,
    satellites,
    coverageFeatures,
    viewerRef
}) => {
    const { getCombGeometries } = useCombGeometry();
    const selectedSatelliteRef = useRef<SatelliteData | null>(null);
    const selectedBeamFeatureRef = useRef<Feature<GeoJsonGeometry, GeoJsonProperties> | null>(null);
    const beamSatelliteRef = useRef<SatelliteData | null>(null);
    const autoSelectedSatelliteRef = useRef<SatelliteData | null>(null);
    const selectedPositionRef = useRef<{ lat: number; lng: number; altitude?: number } | null>(null);
    const selectedAircraftRef = useRef<Aircraft | null>(null);
    const satellitesRef = useRef<SatelliteData[]>([]);
    const coverageFeaturesRef = useRef<Feature<GeoJsonGeometry, GeoJsonProperties>[]>([]);
    const getCombGeometriesRef = useRef(getCombGeometries);
    const baseColor = useMemo(() => {
        const satForColor = selectedSatellite ?? beamSatellite ?? autoSelectedSatellite;
        if (!satForColor) return null;
        const typeForColor = (selectedBeamFeature as any)?.properties?.type ?? satForColor.type;
        const colorHex = getCoverageColor(typeForColor, 0.1, satForColor);
        return Color.fromCssColorString(colorHex);
    }, [selectedSatellite, beamSatellite, autoSelectedSatellite, selectedBeamFeature]);
    const baseColorRef = useRef<Color | null>(null);
    useEffect(() => { selectedSatelliteRef.current = selectedSatellite; }, [selectedSatellite]);
    useEffect(() => { selectedBeamFeatureRef.current = selectedBeamFeature; }, [selectedBeamFeature]);
    useEffect(() => { beamSatelliteRef.current = beamSatellite; }, [beamSatellite]);
    useEffect(() => { autoSelectedSatelliteRef.current = autoSelectedSatellite; }, [autoSelectedSatellite]);
    useEffect(() => { selectedPositionRef.current = selectedPosition; }, [selectedPosition]);
    useEffect(() => { selectedAircraftRef.current = selectedAircraft; }, [selectedAircraft]);
    useEffect(() => { satellitesRef.current = satellites; }, [satellites]);
    useEffect(() => { coverageFeaturesRef.current = coverageFeatures; }, [coverageFeatures]);
    useEffect(() => { getCombGeometriesRef.current = getCombGeometries; }, [getCombGeometries]);
    useEffect(() => { baseColorRef.current = baseColor; }, [baseColor]);
    const stateRef = useRef<{
        primitive: Primitive | null; alpha: number; targetAlpha: number;
        lastTickTime: JulianDate | null; lastGeometryUpdateTime: JulianDate | null; satId: string | null;
    }>({ primitive: null, alpha: 0, targetAlpha: 0, lastTickTime: null, lastGeometryUpdateTime: null, satId: null });
    useEffect(() => {
        const viewer = viewerRef.current; if (!viewer) return;
        const scene = viewer.scene; const state = stateRef.current;
        const tick = () => {
            const now: JulianDate = viewer.clock?.currentTime;
            const selected = selectedSatelliteRef.current;
            const beamFeature = selectedBeamFeatureRef.current;
            const beamSat = beamSatelliteRef.current;
            const autoSat = autoSelectedSatelliteRef.current;

            // Mode selection priority:
            // 1) Manual selection (selectedSatellite)
            // 2) Auto beam mode (beamSatellite + selectedBeamFeature)
            // 3) Auto satellite mode (e.g. LEO auto-selected satellite)
            const sat = selected?.id
                ? satellitesRef.current.find(s => s.id === selected.id) ?? selected
                : (beamSat && beamFeature ? beamSat : (autoSat ?? null));
            const currentBaseColor = baseColorRef.current;
            if (!sat || !currentBaseColor) { state.targetAlpha = 0; } else { state.targetAlpha = 0.1; }
            if (now) {
                const dt = state.lastTickTime ? Math.max(0, JulianDate.secondsDifference(now, state.lastTickTime)) : 0;
                state.lastTickTime = now.clone();
                const fadeDuration = 0.35; const maxStep = dt > 0 ? (dt / fadeDuration) * 0.1 : 0.1;
                if (state.alpha < state.targetAlpha) { state.alpha = Math.min(state.targetAlpha, state.alpha + maxStep); }
                else if (state.alpha > state.targetAlpha) { state.alpha = Math.max(state.targetAlpha, state.alpha - maxStep); }
            }
            const shouldExist = state.alpha > 0.001 && !!sat && !!currentBaseColor;
            if (!shouldExist) { if (state.primitive) { scene.primitives.remove(state.primitive); state.primitive = null; } state.satId = sat?.id ?? null; return; }
            const needsRebuild = !state.primitive || state.satId !== sat!.id || !state.lastGeometryUpdateTime || (now && JulianDate.secondsDifference(now, state.lastGeometryUpdateTime) > 0.75);
            if (needsRebuild && now) {
                const useBeamMode = !selectedSatelliteRef.current && !!beamFeature && !!beamSat;
                const useOneWebServingBeamMode = !selectedSatelliteRef.current
                    && !useBeamMode
                    && sat!.type === 'ONEWEB'
                    && (!!selectedPositionRef.current || !!selectedAircraftRef.current);

                const footprintPoints = useBeamMode
                    ? pickBeamFootprintPoints(beamFeature!)
                    : pickFootprintPoints(sat!, now, getCombGeometriesRef.current, coverageFeaturesRef.current);

                const servingRing = useOneWebServingBeamMode
                    ? pickServingOneWebBeamRing(
                        sat!,
                        now,
                        getCombGeometriesRef.current,
                        selectedPositionRef.current ? { lat: selectedPositionRef.current.lat, lng: selectedPositionRef.current.lng } : null,
                        selectedAircraftRef.current
                    )
                    : [];

                const oneWebBaseRing = useOneWebServingBeamMode
                    ? (servingRing.length >= 3
                        ? servingRing
                        : buildStandardFootprintRing({ lat: sat!.position.lat, lng: sat!.position.lng }))
                    : [];

                const baseRing = useBeamMode
                    ? footprintPoints
                    : (useOneWebServingBeamMode ? oneWebBaseRing : computeLocalHull(footprintPoints));

                if (baseRing.length >= 3) {
                    // Use propagated position for the apex to match the satellite entity
                    const apex = propagateSatellite(sat!, now);
                    const geometry = buildSideOnlyConeGeometry(apex, baseRing);
                    if (geometry) {
                        if (state.primitive) { scene.primitives.remove(state.primitive); state.primitive = null; }
                        const instanceId = 'aggregated-coverage-volume';
                        const instance = new GeometryInstance({ id: instanceId, geometry, attributes: { color: ColorGeometryInstanceAttribute.fromColor(currentBaseColor.withAlpha(state.alpha)) } });
                        const primitive = new Primitive({
                            geometryInstances: instance,
                            appearance: new PerInstanceColorAppearance({ translucent: true, flat: true, closed: false }),
                            allowPicking: false, asynchronous: false
                        });
                        scene.primitives.add(primitive); state.primitive = primitive; state.lastGeometryUpdateTime = now.clone(); state.satId = sat!.id;
                    }
                } else if (state.primitive) { scene.primitives.remove(state.primitive); state.primitive = null; }
            }
            if (state.primitive) {
                try { const attrs = (state.primitive as any).getGeometryInstanceAttributes('aggregated-coverage-volume'); if (attrs?.color) { attrs.color = ColorGeometryInstanceAttribute.toValue(currentBaseColor!.withAlpha(state.alpha)); } } catch { /* ignore */ }
            }
        };
        scene.preRender.addEventListener(tick);
        return () => { scene.preRender.removeEventListener(tick); if (state.primitive) { scene.primitives.remove(state.primitive); state.primitive = null; } };
    }, [viewerRef]);
    return null;
};

export default React.memo(AggregatedCoverageVolumeLayer);
