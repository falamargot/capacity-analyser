import React, { useEffect, useMemo, useRef } from 'react';
import {
    BoundingSphere, Cartesian3, Color, ColorGeometryInstanceAttribute, ComponentDatatype,
    Geometry, GeometryAttribute, GeometryInstance, JulianDate, Matrix4, PerInstanceColorAppearance,
    Primitive, PrimitiveType, Transforms
} from 'cesium';
import type { Feature, Geometry as GeoJsonGeometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import { getCoverageColor } from '../../services/coverageService';
import { useCombGeometry } from './hooks';

interface Props {
    selectedSatellite: SatelliteData | null;
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

const AggregatedCoverageVolumeLayer: React.FC<Props> = ({ selectedSatellite, satellites, coverageFeatures, viewerRef }) => {
    const { getCombGeometries } = useCombGeometry();
    const selectedSatelliteRef = useRef<SatelliteData | null>(null);
    const satellitesRef = useRef<SatelliteData[]>([]);
    const coverageFeaturesRef = useRef<Feature<GeoJsonGeometry, GeoJsonProperties>[]>([]);
    const getCombGeometriesRef = useRef(getCombGeometries);
    const baseColor = useMemo(() => {
        if (!selectedSatellite) return null;
        const colorHex = getCoverageColor(selectedSatellite.type, 0.1, selectedSatellite);
        return Color.fromCssColorString(colorHex);
    }, [selectedSatellite?.id, selectedSatellite?.type]);
    const baseColorRef = useRef<Color | null>(null);
    useEffect(() => { selectedSatelliteRef.current = selectedSatellite; }, [selectedSatellite]);
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
            const sat = selected?.id ? satellitesRef.current.find(s => s.id === selected.id) ?? selected : null;
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
                const footprintPoints = pickFootprintPoints(sat!, now, getCombGeometriesRef.current, coverageFeaturesRef.current);
                const hull = computeLocalHull(footprintPoints);
                if (hull.length >= 3) {
                    const apex = Cartesian3.fromDegrees(sat!.position.lng, sat!.position.lat, (sat!.position.alt ?? 0) * 1000);
                    const geometry = buildSideOnlyConeGeometry(apex, hull);
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
