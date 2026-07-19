import React, { useEffect, useMemo, useRef } from 'react';
import {
    BoundingSphere, Cartesian3, Color, ColorGeometryInstanceAttribute, ComponentDatatype,
    Cartographic, Geometry, GeometryAttribute, GeometryInstance, JulianDate, Math as CesiumMath,
    Matrix4, PerInstanceColorAppearance, Primitive, PrimitiveType, Transforms,
    Viewer as CesiumViewerType,
} from 'cesium';
import type { Feature, Geometry as GeoJsonGeometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import { getCoverageColor } from '../../services/coverageService';
import { EARTH_RADIUS_KM } from '../../utils/capacityCalculator';
import { getOutermostCoverageFeatures } from '../../utils/coverageGeometry';
import { TERMINAL_RF_RADIUS_KM } from '../../utils/leoFootprint';
import { isOperationalSatellite } from '../../utils/satelliteStatus';
import { useCombGeometry } from './hooks';
import { useSimulation } from '../../contexts/SimulationContext';
import { calculateDeadReckoning, pickBeamFootprintPoints, propagateSatellite, sanitizeCartesianRing, isFiniteCartesian3 } from './utils';

interface Props {
    selectedSatellite: SatelliteData | null;
    selectedBeamFeature?: Feature<GeoJsonGeometry, GeoJsonProperties> | null;
    selectedCoverageFeatures?: Feature<GeoJsonGeometry, GeoJsonProperties>[];
    selectedCoverageGroups?: ProjectionCoverageGroup[];
    beamSatellite?: SatelliteData | null;
    autoSelectedSatellite?: SatelliteData | null;
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    selectedAircraft?: Aircraft | null;
    satellites: SatelliteData[];
    coverageFeatures: Feature<GeoJsonGeometry, GeoJsonProperties>[];
    viewerRef: React.RefObject<CesiumViewerType | null>;
}

const DEFAULT_PROJECTION_ALPHA = 0.1;
const GEO_PROJECTION_ALPHA = 0.04;
const UPLINK_PROJECTION_COLOR = Color.fromCssColorString('#059669');
const DOWNLINK_PROJECTION_COLOR = Color.fromCssColorString('#2563eb');

export interface ProjectionCoverageGroup {
    direction: 'uplink' | 'downlink';
    features: Feature<GeoJsonGeometry, GeoJsonProperties>[];
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
    return sanitizeCartesianRing(hull2d.map((p) => points[p.index]));
}

function buildSideOnlyConeGeometry(apex: Cartesian3, base: Cartesian3[]): Geometry | null {
    const sanitizedBase = sanitizeCartesianRing(base);
    if (!isFiniteCartesian3(apex) || sanitizedBase.length < 3) return null;

    const vertexCount = 1 + sanitizedBase.length;
    const positions = new Float64Array(vertexCount * 3);
    positions[0] = apex.x; positions[1] = apex.y; positions[2] = apex.z;
    for (let i = 0; i < sanitizedBase.length; i++) {
        const p = sanitizedBase[i];
        const o = (i + 1) * 3;
        positions[o] = p.x; positions[o + 1] = p.y; positions[o + 2] = p.z;
    }
    const boundingSphere = BoundingSphere.fromVertices(positions as any);
    const triangles = sanitizedBase.length;
    const indices = vertexCount > 65535 ? new Uint32Array(triangles * 3) : new Uint16Array(triangles * 3);
    for (let i = 0; i < sanitizedBase.length; i++) {
        const a = 0; const b = i + 1; const c = ((i + 1) % sanitizedBase.length) + 1;
        const t = i * 3;
        indices[t] = a; indices[t + 1] = b; indices[t + 2] = c;
    }
    const normals = new Float32Array(vertexCount * 3);
    const tmpA = new Cartesian3(); const tmpB = new Cartesian3(); const tmpC = new Cartesian3();
    const e1 = new Cartesian3(); const e2 = new Cartesian3(); const fn = new Cartesian3();
    for (let i = 0; i < sanitizedBase.length; i++) {
        const bIdx = i + 1; const cIdx = ((i + 1) % sanitizedBase.length) + 1;
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
        for (const poly of geometries) {
            const sanitizedPoly = sanitizeCartesianRing(poly);
            if (sanitizedPoly.length >= 3) {
                pts.push(...sanitizedPoly);
            }
        }
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
    if (Cartesian3.equalsEpsilon(a, b, 0, 1e-6)) return sanitizeCartesianRing(poly.slice(0, -1));
    return sanitizeCartesianRing(poly);
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
        const poly = sanitizeCartesianRing(geometries[i]);
        if (!poly || poly.length < 3) continue;
        const ring: Array<[number, number]> = poly.map((p) => {
            const c = Cartographic.fromCartesian(p);
            return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
        });
        if (isPointInPolygon(point, ring)) return stripDuplicateClosure(poly);
    }
    return [];
}

function buildTerminalRfFootprintRing(subSat: { lat: number; lng: number }, segments = 64): Cartesian3[] {
    const lat1 = CesiumMath.toRadians(subSat.lat);
    const lon1 = CesiumMath.toRadians(subSat.lng);
    const d = TERMINAL_RF_RADIUS_KM / EARTH_RADIUS_KM;

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
    return sanitizeCartesianRing(ring);
}

function pickCoverageFootprintRings(
    coverageFeatures: Feature<GeoJsonGeometry, GeoJsonProperties>[]
) : Cartesian3[][] {
    return getOutermostCoverageFeatures(coverageFeatures)
        .map((feature) => pickBeamFootprintPoints(feature))
        .filter((ring) => ring.length >= 3);
}

const getFeatureSignature = (feature: Feature<GeoJsonGeometry, GeoJsonProperties>): string => {
    const props = feature.properties ?? {};
    return [
        typeof props.name === 'string' ? props.name : 'coverage',
        typeof props.level === 'number' ? props.level.toFixed(3) : 'level',
        typeof props.coverageGeometryKey === 'string' ? props.coverageGeometryKey : 'part',
    ].join(':');
};

const getProjectionGeometrySignature = (
    groups: ProjectionCoverageGroup[],
    features: Feature<GeoJsonGeometry, GeoJsonProperties>[],
    beamFeature: Feature<GeoJsonGeometry, GeoJsonProperties> | null,
): string => {
    const grouped = groups
        .map((group) => `${group.direction}(${group.features.map(getFeatureSignature).join(',')})`)
        .join('|');
    const legacyFeatures = features.map(getFeatureSignature).join(',');
    const beam = beamFeature ? getFeatureSignature(beamFeature) : '';
    return `${grouped}::${legacyFeatures}::${beam}`;
};

function resolveRenderableCoverageSatellite(
    selectedSatellite: SatelliteData | null,
    beamSatellite: SatelliteData | null,
    selectedBeamFeature: Feature<GeoJsonGeometry, GeoJsonProperties> | null,
    hasBeamCoverageData: boolean,
    autoSelectedSatellite: SatelliteData | null,
    satellites: SatelliteData[]
): SatelliteData | null {
    if (selectedSatellite) {
        if (!isOperationalSatellite(selectedSatellite)) return null;
        const liveSatellite = satellites.find((sat) => sat.id === selectedSatellite.id) ?? selectedSatellite;
        return liveSatellite.orbitType === 'GEO' ? null : liveSatellite;
    }

    if (beamSatellite && (selectedBeamFeature || hasBeamCoverageData)) {
        return isOperationalSatellite(beamSatellite) && beamSatellite.orbitType !== 'GEO' ? beamSatellite : null;
    }

    return isOperationalSatellite(autoSelectedSatellite) && autoSelectedSatellite.orbitType !== 'GEO'
        ? autoSelectedSatellite
        : null;
}

function getProjectionAlpha(satellite: SatelliteData): number {
    return satellite.orbitType === 'GEO' ? GEO_PROJECTION_ALPHA : DEFAULT_PROJECTION_ALPHA;
}

const AggregatedCoverageVolumeLayer: React.FC<Props> = ({
    selectedSatellite,
    selectedBeamFeature = null,
    selectedCoverageFeatures = [],
    selectedCoverageGroups = [],
    beamSatellite = null,
    autoSelectedSatellite = null,
    selectedPosition = null,
    selectedAircraft = null,
    satellites,
    coverageFeatures,
    viewerRef
}) => {
    const { getCombGeometries } = useCombGeometry();
    const { coveragePolicy } = useSimulation();
    const selectedSatelliteRef = useRef<SatelliteData | null>(null);
    const selectedBeamFeatureRef = useRef<Feature<GeoJsonGeometry, GeoJsonProperties> | null>(null);
    const selectedCoverageFeaturesRef = useRef<Feature<GeoJsonGeometry, GeoJsonProperties>[]>([]);
    const selectedCoverageGroupsRef = useRef<ProjectionCoverageGroup[]>([]);
    const beamSatelliteRef = useRef<SatelliteData | null>(null);
    const autoSelectedSatelliteRef = useRef<SatelliteData | null>(null);
    const selectedPositionRef = useRef<{ lat: number; lng: number; altitude?: number } | null>(null);
    const selectedAircraftRef = useRef<Aircraft | null>(null);
    const satellitesRef = useRef<SatelliteData[]>([]);
    const coverageFeaturesRef = useRef<Feature<GeoJsonGeometry, GeoJsonProperties>[]>([]);
    const getCombGeometriesRef = useRef(getCombGeometries);
    const baseColor = useMemo(() => {
        const satForColor = resolveRenderableCoverageSatellite(
            selectedSatellite,
            beamSatellite,
            selectedBeamFeature,
            selectedCoverageFeatures.length > 0 || selectedCoverageGroups.some((group) => group.features.length > 0),
            autoSelectedSatellite,
            satellites
        );
        if (!satForColor) return null;
        const typeForColor = (selectedBeamFeature as any)?.properties?.type ?? satForColor.type;
        const colorHex = getCoverageColor(typeForColor, 1, satForColor);
        return Color.fromCssColorString(colorHex);
    }, [selectedSatellite, beamSatellite, autoSelectedSatellite, selectedBeamFeature, satellites, selectedCoverageFeatures.length, selectedCoverageGroups]);
    const baseColorRef = useRef<Color | null>(null);

    // Direct ref assignments — safe because these refs are read only inside the
    // preRender handler which fires after the render phase (§3.3).
    selectedSatelliteRef.current = selectedSatellite;
    selectedBeamFeatureRef.current = selectedBeamFeature;
    selectedCoverageFeaturesRef.current = selectedCoverageFeatures;
    selectedCoverageGroupsRef.current = selectedCoverageGroups;
    beamSatelliteRef.current = beamSatellite;
    autoSelectedSatelliteRef.current = autoSelectedSatellite;
    selectedPositionRef.current = selectedPosition;
    selectedAircraftRef.current = selectedAircraft;
    satellitesRef.current = satellites;
    coverageFeaturesRef.current = coverageFeatures;
    getCombGeometriesRef.current = getCombGeometries;
    baseColorRef.current = baseColor;
    const stateRef = useRef<{
        primitive: Primitive | null; instanceIds: string[]; alpha: number; targetAlpha: number;
        lastTickTime: JulianDate | null; lastGeometryUpdateTime: JulianDate | null; satId: string | null;
        instanceColors: Map<string, Color>;
        geometrySignature: string | null;
    }>({ primitive: null, instanceIds: [], alpha: 0, targetAlpha: 0, lastTickTime: null, lastGeometryUpdateTime: null, satId: null, instanceColors: new Map(), geometrySignature: null });
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
            const sat = resolveRenderableCoverageSatellite(
                selected,
                beamSat,
                beamFeature,
                selectedCoverageFeaturesRef.current.length > 0 || selectedCoverageGroupsRef.current.some((group) => group.features.length > 0),
                autoSat,
                satellitesRef.current
            );
            const currentBaseColor = baseColorRef.current;
            if (!sat || !currentBaseColor) { state.targetAlpha = 0; } else { state.targetAlpha = getProjectionAlpha(sat); }
            if (now) {
                const dt = state.lastTickTime ? Math.max(0, JulianDate.secondsDifference(now, state.lastTickTime)) : 0;
                state.lastTickTime = now.clone();
                const fadeDuration = 0.35;
                const maxAlpha = Math.max(DEFAULT_PROJECTION_ALPHA, GEO_PROJECTION_ALPHA);
                const maxStep = dt > 0 ? (dt / fadeDuration) * maxAlpha : maxAlpha;
                if (state.alpha < state.targetAlpha) { state.alpha = Math.min(state.targetAlpha, state.alpha + maxStep); }
                else if (state.alpha > state.targetAlpha) { state.alpha = Math.max(state.targetAlpha, state.alpha - maxStep); }
            }
            const shouldExist = state.alpha > 0.001 && !!sat && !!currentBaseColor;
            if (!shouldExist) {
                if (state.primitive) {
                    scene.primitives.remove(state.primitive);
                    state.primitive = null;
                    state.instanceIds = [];
                    state.instanceColors = new Map();
                    state.geometrySignature = null;
                }
                state.satId = sat?.id ?? null;
                return;
            }
            const geometrySignature = getProjectionGeometrySignature(
                selectedCoverageGroupsRef.current,
                selectedCoverageFeaturesRef.current,
                beamFeature,
            );
            const needsRebuild = !state.primitive
                || state.satId !== sat!.id
                || state.geometrySignature !== geometrySignature
                || !state.lastGeometryUpdateTime
                || (now && JulianDate.secondsDifference(now, state.lastGeometryUpdateTime) > 0.75);
            if (needsRebuild && now) {
                const useBeamMode = !selectedSatelliteRef.current
                    && !!beamSat
                    && (
                        !!beamFeature ||
                        selectedCoverageFeaturesRef.current.length > 0 ||
                        selectedCoverageGroupsRef.current.some((group) => group.features.length > 0)
                    );
                const useOneWebServingBeamMode = coveragePolicy.type === 'DB_THRESHOLD'
                    && !selectedSatelliteRef.current
                    && !useBeamMode
                    && sat!.type === 'ONEWEB'
                    && (!!selectedPositionRef.current || !!selectedAircraftRef.current);

                const beamModeGroups = useBeamMode
                    ? (
                        selectedCoverageGroupsRef.current.some((group) => group.features.length > 0)
                            ? selectedCoverageGroupsRef.current.flatMap((group) => {
                                const color = group.direction === 'uplink'
                                    ? UPLINK_PROJECTION_COLOR
                                    : DOWNLINK_PROJECTION_COLOR;
                                return pickCoverageFootprintRings(group.features).map((ring) => ({ ring, color }));
                            })
                            : (
                                selectedCoverageFeaturesRef.current.length > 0
                                    ? pickCoverageFootprintRings(selectedCoverageFeaturesRef.current)
                                    : [pickBeamFootprintPoints(beamFeature)].filter((ring) => ring.length >= 3)
                            ).map((ring) => ({ ring, color: currentBaseColor }))
                    )
                    : [];

                const footprintPoints = useBeamMode
                    ? []
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
                        : buildTerminalRfFootprintRing({ lat: sat!.position.lat, lng: sat!.position.lng }))
                    : [];

                const baseGroups = useBeamMode
                    ? beamModeGroups
                    : [(useOneWebServingBeamMode ? oneWebBaseRing : computeLocalHull(footprintPoints))]
                        .filter((ring) => ring.length >= 3)
                        .map((ring) => ({ ring, color: currentBaseColor }));

                if (baseGroups.length > 0) {
                    // Use propagated position for the apex to match the satellite entity
                    const apex = propagateSatellite(sat!, now);
                    const instanceColors = new Map<string, Color>();
                    const instances = baseGroups
                        .map(({ ring, color }, index) => {
                            const geometry = buildSideOnlyConeGeometry(apex, ring);
                            if (!geometry) return null;
                            const instanceId = `aggregated-coverage-volume-${index}`;
                            instanceColors.set(instanceId, color);
                            return new GeometryInstance({
                                id: instanceId,
                                geometry,
                                attributes: { color: ColorGeometryInstanceAttribute.fromColor(color.withAlpha(state.alpha)) }
                            });
                        })
                        .filter(Boolean) as GeometryInstance[];
                    if (instances.length > 0) {
                        if (state.primitive) {
                            scene.primitives.remove(state.primitive);
                            state.primitive = null;
                            state.instanceIds = [];
                            state.instanceColors = new Map();
                            state.geometrySignature = null;
                        }
                        const primitive = new Primitive({
                            geometryInstances: instances,
                            appearance: new PerInstanceColorAppearance({ translucent: true, flat: true, closed: false }),
                            allowPicking: false, asynchronous: false
                        });
                        scene.primitives.add(primitive);
                        state.primitive = primitive;
                        state.instanceIds = instances.map((instance) => String(instance.id));
                        state.instanceColors = instanceColors;
                        state.geometrySignature = geometrySignature;
                        state.lastGeometryUpdateTime = now.clone();
                        state.satId = sat!.id;
                    }
                } else if (state.primitive) {
                    scene.primitives.remove(state.primitive);
                    state.primitive = null;
                    state.instanceIds = [];
                    state.instanceColors = new Map();
                    state.geometrySignature = null;
                }
            }
            if (state.primitive) {
                for (const instanceId of state.instanceIds) {
                    try {
                        const attrs = (state.primitive as any).getGeometryInstanceAttributes(instanceId);
                        if (attrs?.color) {
                            const instanceColor = state.instanceColors.get(instanceId) ?? currentBaseColor!;
                            attrs.color = ColorGeometryInstanceAttribute.toValue(instanceColor.withAlpha(state.alpha));
                        }
                    } catch {
                        /* ignore */
                    }
                }
            }
        };
        scene.preRender.addEventListener(tick);
        return () => {
            scene.preRender.removeEventListener(tick);
            if (state.primitive) {
                scene.primitives.remove(state.primitive);
                state.primitive = null;
                state.instanceIds = [];
                state.instanceColors = new Map();
                state.geometrySignature = null;
            }
        };
    }, [coveragePolicy.type, viewerRef]);
    return null;
};

export default React.memo(AggregatedCoverageVolumeLayer);
