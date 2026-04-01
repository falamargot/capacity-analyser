import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcType,
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ComponentDatatype,
  CustomDataSource,
  Geometry as CesiumGeometry,
  GeometryAttribute,
  GeometryInstance,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  Primitive,
  PrimitiveCollection,
  PrimitiveType,
} from 'cesium';
import { useCesium } from 'resium';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { CandidateCoverage, Selection } from '../../types/analysis';
import type { Coverage, SatelliteData } from '../../types/satellites';
import { loadSatelliteCoverageMeshIndex, type PrebuiltCoverageMesh } from '../../services/coverageService';
import {
  densifyRingForGlobe,
  getCoverageMaxSegmentDegreesForLod,
  type CoverageGeometryLod,
} from '../../utils/coverageGeometry';
import {
  getCandidateCoverageKey,
  getCoverageBeamId,
  getCoverageGroupId,
} from '../../utils/geoCoverageSelection';
import {
  GEO_FOOTPRINT_LAYER_HEIGHT_M,
  GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M,
} from './layerHeights';

export const GEO_COVERAGE_ENTITY_PREFIX = 'geo-coverage::';

const OVERVIEW_CONTOUR_COLOR = Color.fromCssColorString('#60a5fa').withAlpha(0.55);
const OVERVIEW_FILL_COLOR = Color.fromCssColorString('#93c5fd').withAlpha(0.04);
const SELECTED_GEO_CONTOUR_COLOR = Color.fromCssColorString('#2563eb');
const SELECTED_GEO_FILL_OUTER_COLOR = Color.fromCssColorString('#f0f9ff');
const SELECTED_GEO_FILL_MID_COLOR = Color.fromCssColorString('#60a5fa');
const SELECTED_GEO_FILL_INNER_COLOR = Color.fromCssColorString('#1e40af');
const DIMMED_CONTOUR_COLOR = Color.fromCssColorString('#94a3b8').withAlpha(0.34);
const MAX_PREBUILT_FILL_TRIANGLES_PER_PART = 500_000;

interface CoverageLayerProps {
  satellites: SatelliteData[];
  selection: Selection;
  selectedCoverage?: CandidateCoverage | null;
}

interface SanitizedPolygonGeometry {
  outerRing: number[][];
  holes: number[][][];
  isPrebuiltDensified: boolean;
}

interface RenderContour {
  satelliteName: string;
  coverageKey: string;
  contourKey: string;
  geometryPartKey: string;
  geometry: SanitizedPolygonGeometry;
  prebuiltMesh: PrebuiltCoverageMesh | null;
  normalizedLevel: number;
  mode: 'overview' | 'full' | 'dimmed';
  showFill: boolean;
}

const _sanitizedGeometryCache = new WeakMap<object, SanitizedPolygonGeometry | null>();
const _densifiedRingCache = new WeakMap<number[][], Map<CoverageGeometryLod, number[][]>>();
const _polygonHierarchyCache = new WeakMap<SanitizedPolygonGeometry, Map<CoverageGeometryLod, PolygonHierarchy | null>>();
const _contourPositionsCache = new WeakMap<number[][], Map<string, Cartesian3[] | null>>();
const _prebuiltMeshBuffersCache = new WeakMap<PrebuiltCoverageMesh, {
  positions: Float64Array;
  indices: Uint32Array;
  boundingSphere: BoundingSphere | undefined;
}>();

const isFiniteLngLat = (value: unknown): value is [number, number] => (
  Array.isArray(value) &&
  value.length >= 2 &&
  Number.isFinite(value[0]) &&
  Number.isFinite(value[1])
);

const sanitizeRing = (ring: unknown): number[][] | null => {
  if (!Array.isArray(ring)) return null;

  const sanitized = ring
    .filter(isFiniteLngLat)
    .map(([lng, lat]) => [lng, lat]);

  if (sanitized.length >= 2) {
    const [firstLng, firstLat] = sanitized[0];
    const [lastLng, lastLat] = sanitized[sanitized.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) {
      sanitized.pop();
    }
  }

  if (sanitized.length < 3) return null;

  const uniqueCount = sanitized.reduce((count, [lng, lat], index) => (
    sanitized.slice(0, index).some(([candidateLng, candidateLat]) => candidateLng === lng && candidateLat === lat)
      ? count
      : count + 1
  ), 0);

  return uniqueCount >= 3 ? sanitized : null;
};

const getSignedRingArea = (ring: number[][]): number => {
  if (ring.length < 3) return 0;

  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    area += (xj + xi) * (yj - yi);
  }

  return area * 0.5;
};

const normalizeRingAreaSign = (ring: number[][], wantPositiveArea: boolean): number[][] => {
  const signedArea = getSignedRingArea(ring);
  if (signedArea === 0) return ring;

  const hasPositiveArea = signedArea > 0;
  return hasPositiveArea === wantPositiveArea ? ring : [...ring].reverse();
};

const buildClosedRing = (ring: number[][]): number[][] => {
  if (ring.length < 2) return ring;
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return ring;
  return [...ring, ring[0]];
};

const getSanitizedPolygonGeometry = (
  feature: Feature<Geometry, GeoJsonProperties>
): SanitizedPolygonGeometry | null => {
  const cached = _sanitizedGeometryCache.get(feature);
  if (cached !== undefined) return cached;

  const geometry = feature.geometry;
  if (!geometry || geometry.type !== 'Polygon') {
    _sanitizedGeometryCache.set(feature, null);
    return null;
  }

  const [outerRing, ...holeRings] = geometry.coordinates ?? [];
  const sanitizedOuterRing = sanitizeRing(outerRing);
  if (!sanitizedOuterRing) {
    _sanitizedGeometryCache.set(feature, null);
    return null;
  }

  const result: SanitizedPolygonGeometry = {
    outerRing: normalizeRingAreaSign(sanitizedOuterRing, true),
    holes: holeRings
      .map((ring) => sanitizeRing(ring))
      .map((ring) => (ring ? normalizeRingAreaSign(ring, false) : null))
      .filter((ring): ring is number[][] => ring !== null),
    isPrebuiltDensified: feature.properties?.prebuiltDensified === true,
  };

  _sanitizedGeometryCache.set(feature, result);
  return result;
};

const approximateRingArea = (ring: number[][]): number => Math.abs(getSignedRingArea(ring));

const getDensifiedRingForLod = (
  ring: number[][],
  lod: CoverageGeometryLod,
  isPrebuiltDensified: boolean
): number[][] => {
  if (isPrebuiltDensified) {
    return ring;
  }

  const cachedByLod = _densifiedRingCache.get(ring);
  if (cachedByLod?.has(lod)) {
    return cachedByLod.get(lod)!;
  }

  const densified = densifyRingForGlobe(ring, getCoverageMaxSegmentDegreesForLod(lod));
  if (cachedByLod) {
    cachedByLod.set(lod, densified);
  } else {
    _densifiedRingCache.set(ring, new Map([[lod, densified]]));
  }
  return densified;
};

const buildPolygonHierarchy = (
  geometry: SanitizedPolygonGeometry,
  lod: CoverageGeometryLod
): PolygonHierarchy | null => {
  const cachedByLod = _polygonHierarchyCache.get(geometry);
  if (cachedByLod?.has(lod)) {
    return cachedByLod.get(lod)!;
  }

  let hierarchy: PolygonHierarchy | null = null;
  try {
    hierarchy = new PolygonHierarchy(
      Cartesian3.fromDegreesArray(getDensifiedRingForLod(geometry.outerRing, lod, geometry.isPrebuiltDensified).flat() as number[]),
      geometry.holes.map((ring) => (
        new PolygonHierarchy(
          Cartesian3.fromDegreesArray(getDensifiedRingForLod(ring, lod, geometry.isPrebuiltDensified).flat() as number[])
        )
      ))
    );
  } catch {
    hierarchy = null;
  }

  if (cachedByLod) {
    cachedByLod.set(lod, hierarchy);
  } else {
    _polygonHierarchyCache.set(geometry, new Map([[lod, hierarchy]]));
  }

  return hierarchy;
};

const buildContourPositions = (
  ring: number[][],
  height: number,
  lod: CoverageGeometryLod,
  isPrebuiltDensified: boolean
): Cartesian3[] | null => {
  const cacheKey = `${lod}:${height}:${isPrebuiltDensified ? 'prebuilt' : 'raw'}`;
  const cachedByLod = _contourPositionsCache.get(ring);
  if (cachedByLod?.has(cacheKey)) {
    return cachedByLod.get(cacheKey)!;
  }

  let positions: Cartesian3[] | null = null;
  try {
    const closed = buildClosedRing(getDensifiedRingForLod(ring, lod, isPrebuiltDensified));
    const degrees: number[] = [];
    for (const [lng, lat] of closed) {
      degrees.push(lng, lat, height);
    }
    positions = Cartesian3.fromDegreesArrayHeights(degrees);
  } catch {
    positions = null;
  }

  if (cachedByLod) {
    cachedByLod.set(cacheKey, positions);
  } else {
    _contourPositionsCache.set(ring, new Map([[cacheKey, positions]]));
  }

  return positions;
};

const getPrebuiltMeshBuffers = (mesh: PrebuiltCoverageMesh): {
  positions: Float64Array;
  indices: Uint32Array;
  boundingSphere: BoundingSphere | undefined;
} => {
  const cached = _prebuiltMeshBuffersCache.get(mesh);
  if (cached) {
    return cached;
  }

  const positions = mesh.positions;
  const indices = mesh.indices;
  const boundingSphere = mesh.boundingSphere
    ? new BoundingSphere(
        new Cartesian3(
          mesh.boundingSphere.center[0],
          mesh.boundingSphere.center[1],
          mesh.boundingSphere.center[2],
        ),
        mesh.boundingSphere.radius,
      )
    : BoundingSphere.fromVertices(positions);

  const buffers = { positions, indices, boundingSphere };
  _prebuiltMeshBuffersCache.set(mesh, buffers);
  return buffers;
};

const shouldUsePrebuiltFillForContour = (contour: RenderContour): boolean => (
  contour.prebuiltMesh !== null &&
  contour.prebuiltMesh.triangleCount <= MAX_PREBUILT_FILL_TRIANGLES_PER_PART
);

const smoothstep = (value: number): number => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - (2 * clamped));
};

const getCoverageBandStyle = (
  normalizedBand: number,
  mode: RenderContour['mode']
): { fillColor: Color; contourColor: Color; contourWidth: number } => {
  if (mode === 'overview') {
    return {
      fillColor: OVERVIEW_FILL_COLOR.withAlpha(0.05),
      contourColor: OVERVIEW_CONTOUR_COLOR.withAlpha(0.4),
      contourWidth: 1,
    };
  }

  const easedBand = smoothstep(normalizedBand);

  if (mode === 'dimmed') {
    return {
      fillColor: Color.fromCssColorString('#bfdbfe').withAlpha(0.038 + (easedBand * 0.06)),
      contourColor: DIMMED_CONTOUR_COLOR.withAlpha(0.2 + (easedBand * 0.14)),
      contourWidth: 0.95,
    };
  }

  const fillColor = easedBand < 0.52
    ? Color.lerp(
        SELECTED_GEO_FILL_OUTER_COLOR,
        SELECTED_GEO_FILL_MID_COLOR,
        easedBand / 0.52,
        new Color()
      )
    : Color.lerp(
        SELECTED_GEO_FILL_MID_COLOR,
        SELECTED_GEO_FILL_INNER_COLOR,
        (easedBand - 0.52) / 0.48,
        new Color()
      );
  fillColor.alpha = 0.055 + (easedBand * easedBand * 0.34);

  return {
    fillColor,
    contourColor: SELECTED_GEO_CONTOUR_COLOR.withAlpha(0.72),
    contourWidth: 1.2,
  };
};

const getSatelliteById = (satellites: SatelliteData[], satelliteId: string): SatelliteData | null => (
  satellites.find((satellite) => satellite.id === satelliteId && satellite.type === 'EUTELSAT') ?? null
);

const getSelectionRenderSignature = (
  selection: Selection,
  selectedCoverage: CandidateCoverage | null
): string => {
  if (selection.type === 'none') {
    return 'none';
  }

  if (selection.type === 'satellite') {
    return `satellite::${selection.satelliteId}`;
  }

  if (selection.type === 'coverage') {
    return `coverage::${selection.satelliteId}::${selection.coverageId}`;
  }

  if (selection.type === 'contour') {
    return `contour::${selection.satelliteId}::${selection.coverageId}::${selection.contourId}`;
  }

  if (selection.type === 'target') {
    return selectedCoverage
      ? `target::${getCandidateCoverageKey(selectedCoverage)}`
      : `target::none::${selection.targetType}`;
  }

  return 'unknown';
};

const getCoverageParts = (satellite: SatelliteData, coverageKey: string): Coverage[] => (
  satellite.coverages.filter((coverage) => getCoverageGroupId(coverage) === coverageKey)
);

const getCoverageLevelNormalizer = (coverages: Coverage[]): Map<string, number> => {
  const values = coverages
    .map((coverage) => {
      const properties = (coverage.feature?.properties as Record<string, unknown> | undefined) ?? {};
      return typeof properties.level === 'number' ? properties.level : null;
    })
    .filter((value): value is number => value !== null);

  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;

  return new Map(
    coverages.map((coverage) => {
      const properties = (coverage.feature?.properties as Record<string, unknown> | undefined) ?? {};
      const level = typeof properties.level === 'number' ? properties.level : null;
      const normalized = level === null || max <= min ? 1 : Math.max(0, Math.min(1, (level - min) / (max - min)));
      return [getCoverageBeamId(coverage), normalized];
    })
  );
};

const getPrimaryContourKey = (
  coverages: Coverage[]
): string | null => {
  const areaByContourKey = new Map<string, number>();

  for (const coverage of coverages) {
    const geometry = getSanitizedPolygonGeometry(coverage.feature as Feature<Geometry, GeoJsonProperties>);
    if (!geometry) continue;

    const contourKey = getCoverageBeamId(coverage);
    areaByContourKey.set(
      contourKey,
      (areaByContourKey.get(contourKey) ?? 0) + approximateRingArea(geometry.outerRing)
    );
  }

  let selectedContourKey: string | null = null;
  let largestArea = -Infinity;

  for (const [contourKey, area] of areaByContourKey.entries()) {
    if (area > largestArea) {
      largestArea = area;
      selectedContourKey = contourKey;
    }
  }

  return selectedContourKey;
};

const getGeometryPartKey = (feature: Feature<Geometry, GeoJsonProperties>, fallbackIndex: number): string => {
  const key = feature.properties?.coverageGeometryKey;
  return typeof key === 'string' ? key : `part-${fallbackIndex}`;
};

const getMeshLookupKey = (feature: Feature<Geometry, GeoJsonProperties>, geometryPartKey: string): string | null => {
  const name = feature.properties?.name;
  const level = feature.properties?.level;

  if (typeof name !== 'string' || typeof level !== 'number') {
    return null;
  }

  return `${name}::${level}::${geometryPartKey}`;
};

const getFeaturePrebuiltMesh = (
  feature: Feature<Geometry, GeoJsonProperties>,
  geometryPartKey: string,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null,
): PrebuiltCoverageMesh | null => {
  const meshLookupKey = getMeshLookupKey(feature, geometryPartKey);
  return meshLookupKey ? (meshIndex?.get(meshLookupKey) ?? null) : null;
};

const toRenderContour = (
  satellite: SatelliteData,
  coverage: Coverage,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null,
  normalizedLevel: number,
  mode: RenderContour['mode'],
  index: number,
  showFill: boolean
): RenderContour | null => {
  const geometry = getSanitizedPolygonGeometry(coverage.feature as Feature<Geometry, GeoJsonProperties>);
  if (!geometry) return null;
  const feature = coverage.feature as Feature<Geometry, GeoJsonProperties>;
  const geometryPartKey = getGeometryPartKey(feature, index);
  const prebuiltMesh = getFeaturePrebuiltMesh(feature, geometryPartKey, meshIndex);

  return {
    satelliteName: satellite.name,
    coverageKey: getCoverageGroupId(coverage),
    contourKey: getCoverageBeamId(coverage),
    geometryPartKey,
    geometry,
    prebuiltMesh,
    normalizedLevel,
    mode,
    showFill,
  };
};

const buildSatelliteOverviewContours = (
  satellite: SatelliteData,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null
): RenderContour[] => {
  const coverageGroups = new Map<string, Coverage[]>();

  for (const coverage of satellite.coverages) {
    const coverageKey = getCoverageGroupId(coverage);
    const group = coverageGroups.get(coverageKey) ?? [];
    group.push(coverage);
    coverageGroups.set(coverageKey, group);
  }

  const contours: RenderContour[] = [];

  for (const [coverageKey, coverages] of coverageGroups.entries()) {
    let selectedCoverage: Coverage | null = null;
    let largestArea = -Infinity;

    for (const coverage of coverages) {
      const geometry = getSanitizedPolygonGeometry(coverage.feature as Feature<Geometry, GeoJsonProperties>);
      if (!geometry) continue;
      const area = approximateRingArea(geometry.outerRing);
      if (area > largestArea) {
        largestArea = area;
        selectedCoverage = coverage;
      }
    }

    if (!selectedCoverage) continue;

    const renderContour = toRenderContour(satellite, selectedCoverage, meshIndex, 1, 'overview', 0, true);
    if (renderContour) {
      contours.push({ ...renderContour, coverageKey });
    }
  }

  return contours;
};

const buildCoverageContours = (
  satellite: SatelliteData,
  coverageKey: string,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null,
  selectedContourKey: string | null
): RenderContour[] => {
  const coverages = getCoverageParts(satellite, coverageKey);
  const normalizedLevels = getCoverageLevelNormalizer(coverages);
  const primaryContourKey = getPrimaryContourKey(coverages);
  const canUseBandedGradientFill = coverages.length > 0 && coverages.every((coverage, index) => {
    const feature = coverage.feature as Feature<Geometry, GeoJsonProperties>;
    const geometryPartKey = getGeometryPartKey(feature, index);
    const prebuiltMesh = getFeaturePrebuiltMesh(feature, geometryPartKey, meshIndex);

    return prebuiltMesh !== null
      && prebuiltMesh.fillMode === 'banded'
      && prebuiltMesh.triangleCount <= MAX_PREBUILT_FILL_TRIANGLES_PER_PART;
  });

  return coverages
    .map((coverage, index) => {
      const contourKey = getCoverageBeamId(coverage);
      const mode = selectedContourKey === null || selectedContourKey === contourKey
        ? 'full'
        : 'dimmed';
      const showFill = canUseBandedGradientFill || (primaryContourKey !== null && contourKey === primaryContourKey);

      return toRenderContour(
        satellite,
        coverage,
        meshIndex,
        normalizedLevels.get(contourKey) ?? 1,
        mode,
        index,
        showFill
      );
    })
    .filter((contour): contour is RenderContour => contour !== null);
};

const resolveRenderContours = (
  satellites: SatelliteData[],
  selection: Selection,
  selectedCoverage: CandidateCoverage | null,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null
): RenderContour[] => {
  if (selection.type === 'none') {
    return [];
  }

  if (selection.type === 'satellite') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildSatelliteOverviewContours(satellite, meshIndex) : [];
  }

  if (selection.type === 'coverage') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildCoverageContours(satellite, selection.coverageId, meshIndex, null) : [];
  }

  if (selection.type === 'contour') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildCoverageContours(satellite, selection.coverageId, meshIndex, selection.contourId) : [];
  }

  if (selection.type === 'target' && selectedCoverage) {
    const satellite = getSatelliteById(satellites, selectedCoverage.satelliteId);
    return satellite
      ? buildCoverageContours(satellite, selectedCoverage.coverageKey, meshIndex, null)
      : [];
  }

  return [];
};

const getRenderModeOrder = (mode: RenderContour['mode']): number => {
  if (mode === 'dimmed') return 0;
  if (mode === 'overview') return 1;
  return 2;
};

const sortRenderContoursForDisplay = (contours: RenderContour[]): RenderContour[] => (
  [...contours].sort((a, b) => {
    const modeDelta = getRenderModeOrder(a.mode) - getRenderModeOrder(b.mode);
    if (modeDelta !== 0) return modeDelta;

    if (a.normalizedLevel !== b.normalizedLevel) {
      return a.normalizedLevel - b.normalizedLevel;
    }

    const coverageDelta = a.coverageKey.localeCompare(b.coverageKey);
    if (coverageDelta !== 0) return coverageDelta;

    const contourDelta = a.contourKey.localeCompare(b.contourKey);
    if (contourDelta !== 0) return contourDelta;

    return a.geometryPartKey.localeCompare(b.geometryPartKey);
  })
);

const CoverageLayer: React.FC<CoverageLayerProps> = ({
  satellites,
  selection,
  selectedCoverage = null,
}) => {
  const { viewer } = useCesium();
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const fillPrimitivesRef = useRef<PrimitiveCollection | null>(null);
  const isAddedRef = useRef(false);
  const areFillPrimitivesAddedRef = useRef(false);
  const previousRenderSignatureRef = useRef<string | null>(null);
  const [activeMeshState, setActiveMeshState] = useState<{
    coverageFileId: string;
    meshIndex: Map<string, PrebuiltCoverageMesh>;
  } | null>(null);
  const geometryLod: CoverageGeometryLod = 'medium';
  const selectionRenderSignature = useMemo(
    () => getSelectionRenderSignature(selection, selectedCoverage),
    [selection, selectedCoverage]
  );
  const relevantSatelliteId = useMemo(() => {
    if (selection.type === 'satellite' || selection.type === 'coverage' || selection.type === 'contour') {
      return selection.satelliteId;
    }

    if (selection.type === 'target') {
      return selectedCoverage?.satelliteId ?? null;
    }

    return null;
  }, [selection, selectedCoverage?.satelliteId]);
  const relevantSatellite = useMemo(
    () => (relevantSatelliteId ? getSatelliteById(satellites, relevantSatelliteId) : null),
    [relevantSatelliteId, satellites]
  );
  const activeMeshIndex = useMemo(() => {
    if (!relevantSatellite?.coverageFileId) {
      return null;
    }

    return activeMeshState?.coverageFileId === relevantSatellite.coverageFileId
      ? activeMeshState.meshIndex
      : null;
  }, [activeMeshState, relevantSatellite?.coverageFileId]);
  const renderContours = useMemo(
    () => sortRenderContoursForDisplay(resolveRenderContours(
      relevantSatellite ? [relevantSatellite] : [],
      selection,
      selectedCoverage,
      activeMeshIndex
    )),
    [activeMeshIndex, relevantSatellite, selection, selectedCoverage]
  );
  const renderContentSignature = useMemo(() => (
    renderContours
      .map((contour) => [
        contour.coverageKey,
        contour.contourKey,
        contour.geometryPartKey,
        contour.prebuiltMesh ? `mesh:${contour.prebuiltMesh.fillMode}` : 'polygon',
        contour.mode,
        contour.showFill ? 'fill' : 'outline',
        contour.normalizedLevel.toFixed(4),
      ].join('::'))
      .join('|')
  ), [renderContours]);
  const renderSignature = useMemo(
    () => `${selectionRenderSignature}::${renderContentSignature}`,
    [renderContentSignature, selectionRenderSignature]
  );
  useEffect(() => {
    if (!relevantSatellite || relevantSatellite.type !== 'EUTELSAT' || !relevantSatellite.coverageFileId) {
      setActiveMeshState(null);
      return;
    }

    const { coverageFileId } = relevantSatellite;
    if (activeMeshState?.coverageFileId === coverageFileId) {
      return;
    }

    let cancelled = false;

    void loadSatelliteCoverageMeshIndex(coverageFileId).then((meshIndex) => {
      if (!cancelled) {
        setActiveMeshState({ coverageFileId, meshIndex });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeMeshState?.coverageFileId, relevantSatellite]);

  useEffect(() => {
    if (!viewer) return;

    const dataSource = new CustomDataSource('geo-analysis-layer');
    const fillPrimitives = new PrimitiveCollection({ destroyPrimitives: true });
    dataSourceRef.current = dataSource;
    fillPrimitivesRef.current = fillPrimitives;
    let cancelled = false;

    const attach = async () => {
      const added = await viewer.dataSources.add(dataSource);
      if (cancelled || viewer.isDestroyed()) {
        if (viewer.dataSources.contains(added)) {
          viewer.dataSources.remove(added, false);
        }
        return;
      }

      isAddedRef.current = true;
      viewer.dataSources.raiseToTop(added);
    };

    viewer.scene.primitives.add(fillPrimitives);
    areFillPrimitivesAddedRef.current = true;
    void attach();

    return () => {
      cancelled = true;
      if (!viewer.isDestroyed() && areFillPrimitivesAddedRef.current && viewer.scene.primitives.contains(fillPrimitives)) {
        viewer.scene.primitives.remove(fillPrimitives);
      }
      if (!viewer.isDestroyed() && isAddedRef.current && viewer.dataSources.contains(dataSource)) {
        viewer.dataSources.remove(dataSource, false);
      }
      areFillPrimitivesAddedRef.current = false;
      isAddedRef.current = false;
      fillPrimitivesRef.current = null;
      dataSourceRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const dataSource = dataSourceRef.current;
    const fillPrimitives = fillPrimitivesRef.current;
    if (!dataSource || !fillPrimitives) return;

    if (previousRenderSignatureRef.current === renderSignature) {
      return;
    }
    previousRenderSignatureRef.current = renderSignature;

    dataSource.entities.removeAll();
    fillPrimitives.removeAll();

    renderContours.forEach((contour) => {
      const polylinePositions = buildContourPositions(
        contour.geometry.outerRing,
        GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M,
        geometryLod,
        contour.geometry.isPrebuiltDensified
      );
      if (!polylinePositions) return;

      const coverageEntityId = `${GEO_COVERAGE_ENTITY_PREFIX}${contour.satelliteName}::${contour.coverageKey}`;
      const style = getCoverageBandStyle(contour.normalizedLevel, contour.mode);
      const fillId = `${coverageEntityId}::fill::${contour.contourKey}::${contour.geometryPartKey}`;
      const outlineId = `${coverageEntityId}::outline::${contour.contourKey}::${contour.geometryPartKey}`;

      if (contour.showFill) {
        if (shouldUsePrebuiltFillForContour(contour) && contour.prebuiltMesh) {
          const meshBuffers = getPrebuiltMeshBuffers(contour.prebuiltMesh);
          fillPrimitives.add(new Primitive({
            geometryInstances: new GeometryInstance({
              id: fillId,
              geometry: new CesiumGeometry({
                attributes: {
                  position: new GeometryAttribute({
                    componentDatatype: ComponentDatatype.DOUBLE,
                    componentsPerAttribute: 3,
                    values: meshBuffers.positions,
                  }),
                },
                indices: meshBuffers.indices,
                primitiveType: PrimitiveType.TRIANGLES,
                boundingSphere: meshBuffers.boundingSphere,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(style.fillColor),
              },
            }),
            appearance: new PerInstanceColorAppearance({
              flat: true,
              translucent: style.fillColor.alpha < 1,
              closed: false,
            }),
            asynchronous: false,
          }));
        } else {
          const hierarchy = buildPolygonHierarchy(contour.geometry, geometryLod);
          if (!hierarchy) return;

          dataSource.entities.add({
            id: fillId,
            name: contour.coverageKey,
            polygon: {
              hierarchy,
              material: new ColorMaterialProperty(style.fillColor),
              arcType: ArcType.RHUMB,
              outline: false,
              height: GEO_FOOTPRINT_LAYER_HEIGHT_M,
            },
          });
        }
      }

      dataSource.entities.add({
        id: outlineId,
        name: `${contour.coverageKey} contour`,
        polyline: {
          positions: polylinePositions,
          width: style.contourWidth,
          material: style.contourColor,
          arcType: ArcType.RHUMB,
          clampToGround: false,
          depthFailMaterial: style.contourColor,
        },
      });
    });

    viewer?.scene.requestRender();
  }, [geometryLod, renderContours, renderSignature, selectedCoverage, selection, viewer]);

  return null;
};

export default CoverageLayer;
