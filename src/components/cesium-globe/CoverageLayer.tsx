import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArcType,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ColorMaterialProperty,
  ComponentDatatype,
  CustomDataSource,
  Geometry as CesiumGeometry,
  GeometryAttribute,
  GeometryInstance,
  HorizontalOrigin,
  LabelStyle,
  NearFarScalar,
  PerInstanceColorAppearance,
  PolygonHierarchy,
  Primitive,
  PrimitiveCollection,
  PrimitiveType,
  VerticalOrigin,
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
  getCoverageBeamName,
  getCoverageDisplayName,
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
const COMMERCIAL_GEO_LABEL_COLOR = Color.fromCssColorString('#e0f2fe');
const COMMERCIAL_GEO_LABEL_BACKGROUND = Color.fromCssColorString('#0f172a').withAlpha(0.82);
// Downlink palette — blue (🔵)
const DOWNLINK_CONTOUR_COLOR = Color.fromCssColorString('#2563eb');
const DOWNLINK_FILL_OUTER_COLOR = Color.fromCssColorString('#f0f9ff');
const DOWNLINK_FILL_MID_COLOR = Color.fromCssColorString('#60a5fa');
const DOWNLINK_FILL_INNER_COLOR = Color.fromCssColorString('#1e40af');
// Uplink palette — emerald (🟢)
const UPLINK_CONTOUR_COLOR = Color.fromCssColorString('#059669');
const UPLINK_FILL_OUTER_COLOR = Color.fromCssColorString('#f0fdf4');
const UPLINK_FILL_MID_COLOR = Color.fromCssColorString('#6ee7b7');
const UPLINK_FILL_INNER_COLOR = Color.fromCssColorString('#047857');
// Legacy alias (no direction context → falls back to downlink/blue)
const SELECTED_GEO_CONTOUR_COLOR = DOWNLINK_CONTOUR_COLOR;
const SELECTED_GEO_FILL_OUTER_COLOR = DOWNLINK_FILL_OUTER_COLOR;
const SELECTED_GEO_FILL_MID_COLOR = DOWNLINK_FILL_MID_COLOR;
const SELECTED_GEO_FILL_INNER_COLOR = DOWNLINK_FILL_INNER_COLOR;
const DIMMED_CONTOUR_COLOR = Color.fromCssColorString('#94a3b8').withAlpha(0.34);
const MAX_PREBUILT_FILL_TRIANGLES_PER_PART = 500_000;
const GEO_FOOTPRINT_LABEL_LAYER_HEIGHT_M = GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M + 800;

interface CoverageLayerProps {
  satellites: SatelliteData[];
  selection: Selection;
  selectedCoverage?: CandidateCoverage | null;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  visibleCoverageKeys?: string[] | null;
  onLegendItemsChange?: (items: GeoCoverageLegendItem[]) => void;
  highlightedLegendItemKey?: string | null;
  presentation?: 'engineering' | 'commercial';
  commercialLabel?: string;
  commercialTone?: 'primary' | 'secondary';
  commercialHero?: boolean;
}

interface SanitizedPolygonGeometry {
  outerRing: number[][];
  holes: number[][][];
  isPrebuiltDensified: boolean;
}

interface RenderContour {
  satelliteName: string;
  coverageKey: string;
  coverageLabel: string;
  contourKey: string;
  contourLabel: string;
  levelValue: number | null;
  levelUnit: string;
  geometryPartKey: string;
  geometry: SanitizedPolygonGeometry;
  prebuiltMesh: PrebuiltCoverageMesh | null;
  normalizedLevel: number;
  mode: 'overview' | 'full' | 'dimmed';
  showFill: boolean;
  /** Direction tag for dual-coverage coloring: blue for uplink, green for downlink. */
  direction?: 'uplink' | 'downlink';
}

interface RenderContourLabel {
  id: string;
  text: string;
  position: Cartesian3;
  coverageKey: string;
  contourKey: string;
  coverageLabel: string;
  contourLabel: string;
  mode: RenderContour['mode'];
}

export interface GeoCoverageLegendItem {
  key: string;
  satelliteName: string;
  coverageKey: string;
  coverageLabel: string;
  contourKey: string;
  contourLabel: string;
  levelValue: number | null;
  levelUnit: string;
  mode: RenderContour['mode'];
  normalizedLevel: number;
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

  // O(n): replaces the previous O(n³)-memory/O(n²)-time reduce+slice.some() pattern.
  const uniqueCount = new Set(sanitized.map(([lng, lat]) => `${lng},${lat}`)).size;

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

const getRingCentroid = (ring: number[][]): { lng: number; lat: number } | null => {
  if (ring.length < 3) return null;

  let twiceArea = 0;
  let centroidLng = 0;
  let centroidLat = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centroidLng += (x1 + x2) * cross;
    centroidLat += (y1 + y2) * cross;
  }

  if (Math.abs(twiceArea) < 1e-8) {
    const [lngSum, latSum] = ring.reduce<[number, number]>(
      (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
      [0, 0],
    );
    return {
      lng: lngSum / ring.length,
      lat: latSum / ring.length,
    };
  }

  return {
    lng: centroidLng / (3 * twiceArea),
    lat: centroidLat / (3 * twiceArea),
  };
};

const getRingLabelAnchor = (ring: number[][]): { lng: number; lat: number } | null => {
  if (ring.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [, lat] of ring) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const epsilon = Math.max(0.08, (maxLat - minLat) * 0.035);
  const nearTopPoints = ring.filter(([, lat]) => maxLat - lat <= epsilon);

  if (nearTopPoints.length > 0) {
    const [lngSum, latSum] = nearTopPoints.reduce<[number, number]>(
      (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
      [0, 0],
    );
    return {
      lng: lngSum / nearTopPoints.length,
      lat: latSum / nearTopPoints.length,
    };
  }

  return getRingCentroid(ring);
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
  contour.mode !== 'overview' &&
  contour.prebuiltMesh !== null &&
  contour.prebuiltMesh.triangleCount <= MAX_PREBUILT_FILL_TRIANGLES_PER_PART
);

const smoothstep = (value: number): number => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - (2 * clamped));
};

const getCoverageLevelUnit = (coverage: Coverage): string => {
  const properties = (coverage.feature?.properties as Record<string, unknown> | undefined) ?? {};
  return properties.isUplink === true ? 'dB/K' : 'dBW';
};

const getCoverageBandStyle = (
  normalizedBand: number,
  mode: RenderContour['mode'],
  isHighlighted: boolean,
  direction?: RenderContour['direction'],
  commercialTone: CoverageLayerProps['commercialTone'] = 'primary',
  commercialHero = false,
): { fillColor: Color; contourColor: Color; contourWidth: number } => {
  const subdued = commercialTone === 'secondary';
  if (mode === 'overview') {
    const isUplink = direction === 'uplink';
    const fillBase = direction
      ? (isUplink ? UPLINK_FILL_MID_COLOR : DOWNLINK_FILL_MID_COLOR)
      : OVERVIEW_FILL_COLOR;
    const contourBase = direction
      ? (isUplink ? UPLINK_CONTOUR_COLOR : DOWNLINK_CONTOUR_COLOR)
      : OVERVIEW_CONTOUR_COLOR;

    return {
      fillColor: fillBase.withAlpha(
        subdued
          ? (isHighlighted ? 0.14 : 0.08)
          : commercialHero
            ? (isHighlighted ? 0.42 : 0.34)
            : (isHighlighted ? 0.28 : 0.20)
      ),
      contourColor: contourBase.withAlpha(
        subdued
          ? (isHighlighted ? 0.5 : 0.28)
          : commercialHero
            ? (isHighlighted ? 1.0 : 0.92)
            : (isHighlighted ? 0.95 : 0.68)
      ),
      contourWidth: subdued ? (isHighlighted ? 1.6 : 0.8) : commercialHero ? (isHighlighted ? 4.4 : 3.4) : (isHighlighted ? 2.4 : 1.2),
    };
  }

  const easedBand = smoothstep(normalizedBand);

  if (mode === 'dimmed') {
    return {
      fillColor: Color.fromCssColorString('#bfdbfe').withAlpha(subdued ? 0.018 + (easedBand * 0.025) : 0.038 + (easedBand * 0.06)),
      contourColor: DIMMED_CONTOUR_COLOR.withAlpha(subdued ? (isHighlighted ? 0.42 : 0.12 + (easedBand * 0.08)) : (isHighlighted ? 0.88 : 0.2 + (easedBand * 0.14))),
      contourWidth: subdued ? (isHighlighted ? 1.4 : 0.7) : (isHighlighted ? 2.2 : 0.95),
    };
  }

  // Pick the right palette: blue for downlink (or untagged), green for uplink
  const isUplink = direction === 'uplink';
  const outerFill   = isUplink ? UPLINK_FILL_OUTER_COLOR   : DOWNLINK_FILL_OUTER_COLOR;
  const midFill     = isUplink ? UPLINK_FILL_MID_COLOR     : DOWNLINK_FILL_MID_COLOR;
  const innerFill   = isUplink ? UPLINK_FILL_INNER_COLOR   : DOWNLINK_FILL_INNER_COLOR;
  const contourBase = isUplink ? UPLINK_CONTOUR_COLOR      : DOWNLINK_CONTOUR_COLOR;

  const fillColor = easedBand < 0.52
    ? Color.lerp(outerFill, midFill, easedBand / 0.52, new Color())
    : Color.lerp(midFill, innerFill, (easedBand - 0.52) / 0.48, new Color());
  fillColor.alpha = subdued
    ? 0.035 + (easedBand * easedBand * 0.12)
    : commercialHero
      ? 0.16 + (easedBand * easedBand * 0.46)
      : 0.09 + (easedBand * easedBand * 0.34);

  return {
    fillColor,
    contourColor: contourBase.withAlpha(
      subdued
        ? (isHighlighted ? 0.5 : 0.3)
        : commercialHero
          ? (isHighlighted ? 1.0 : 0.94)
          : (isHighlighted ? 0.98 : 0.72)
    ),
    contourWidth: subdued ? (isHighlighted ? 1.6 : 0.75) : commercialHero ? (isHighlighted ? 5.0 : 3.8) : (isHighlighted ? 2.8 : 1.2),
  };
};

const getCoverageLabelStyle = (
  mode: RenderContour['mode'],
  presentation: CoverageLayerProps['presentation'] = 'engineering',
): {
  fillColor: Color;
  outlineColor: Color;
  backgroundColor: Color;
  scale: number;
} => {
  if (presentation === 'commercial') {
    return {
      fillColor: COMMERCIAL_GEO_LABEL_COLOR,
      outlineColor: Color.fromCssColorString('#020617').withAlpha(0.95),
      backgroundColor: COMMERCIAL_GEO_LABEL_BACKGROUND,
      scale: 0.68,
    };
  }

  if (mode === 'overview') {
    return {
      fillColor: Color.fromCssColorString('#eff6ff'),
      outlineColor: Color.fromCssColorString('#0f172a').withAlpha(0.92),
      backgroundColor: Color.fromCssColorString('#1d4ed8').withAlpha(0.84),
      scale: 0.58,
    };
  }

  if (mode === 'dimmed') {
    return {
      fillColor: Color.fromCssColorString('#f8fafc').withAlpha(0.82),
      outlineColor: Color.fromCssColorString('#0f172a').withAlpha(0.85),
      backgroundColor: Color.fromCssColorString('#475569').withAlpha(0.68),
      scale: 0.54,
    };
  }

  return {
    fillColor: Color.WHITE,
    outlineColor: Color.fromCssColorString('#0f172a').withAlpha(0.96),
    backgroundColor: Color.fromCssColorString('#1e40af').withAlpha(0.9),
    scale: 0.64,
  };
};

const getSatelliteById = (satellites: SatelliteData[], satelliteId: string): SatelliteData | null => (
  satellites.find((satellite) => satellite.id === satelliteId && satellite.type === 'EUTELSAT') ?? null
);

const getSelectionRenderSignature = (
  selection: Selection,
  selectedCoverage: CandidateCoverage | null,
  selectedUplinkCoverage: CandidateCoverage | null,
  selectedDownlinkCoverage: CandidateCoverage | null,
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
    const ulKey = selectedUplinkCoverage ? getCandidateCoverageKey(selectedUplinkCoverage) : null;
    const dlKey = selectedDownlinkCoverage ? getCandidateCoverageKey(selectedDownlinkCoverage) : null;
    const legacyKey = selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : null;
    const parts = [ulKey, dlKey, legacyKey].filter(Boolean).join('+') || `none::${selection.targetType}`;
    return `target::${parts}`;
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

const hasRenderablePrebuiltFill = (
  feature: Feature<Geometry, GeoJsonProperties>,
  geometryPartKey: string,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null,
): boolean => {
  const prebuiltMesh = getFeaturePrebuiltMesh(feature, geometryPartKey, meshIndex);
  return prebuiltMesh !== null
    && prebuiltMesh.triangleCount <= MAX_PREBUILT_FILL_TRIANGLES_PER_PART;
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
    coverageLabel: getCoverageDisplayName(coverage),
    contourKey: getCoverageBeamId(coverage),
    contourLabel: getCoverageBeamName(coverage),
    levelValue: typeof feature.properties?.level === 'number' ? feature.properties.level : null,
    levelUnit: getCoverageLevelUnit(coverage),
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
  meshIndex: Map<string, PrebuiltCoverageMesh> | null,
  visibleCoverageKeys: Set<string> | null
): RenderContour[] => {
  const coverageGroups = new Map<string, Coverage[]>();
  const coverageDirectionByKey = new Map<string, 'uplink' | 'downlink'>();

  for (const coverage of satellite.coverages) {
    const coverageKey = getCoverageGroupId(coverage);
    if (visibleCoverageKeys && !visibleCoverageKeys.has(coverageKey)) {
      continue;
    }

    const properties = (coverage.feature?.properties as Record<string, unknown> | undefined) ?? {};
    coverageDirectionByKey.set(coverageKey, properties.isUplink === true ? 'uplink' : 'downlink');

    const group = coverageGroups.get(coverageKey) ?? [];
    group.push(coverage);
    coverageGroups.set(coverageKey, group);
  }

  if (visibleCoverageKeys && coverageGroups.size > 0) {
    const uplinkKeys = [...coverageGroups.keys()].filter((key) => coverageDirectionByKey.get(key) === 'uplink');
    const downlinkKeys = [...coverageGroups.keys()].filter((key) => coverageDirectionByKey.get(key) === 'downlink');
    const shouldRenderSelectedCoverageContours = uplinkKeys.length <= 1 && downlinkKeys.length <= 1;

    if (shouldRenderSelectedCoverageContours) {
      const contours: RenderContour[] = [];
      for (const [coverageKey, coverages] of coverageGroups.entries()) {
        const direction = coverageDirectionByKey.get(coverageKey);
        contours.push(
          ...buildCoverageContours(satellite, coverageKey, meshIndex, null)
            .map((contour) => ({ ...contour, direction }))
        );
      }
      return contours;
    }
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
      contours.push({ ...renderContour, coverageKey, direction: coverageDirectionByKey.get(coverageKey) });
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

  return coverages
    .map((coverage, index) => {
      const feature = coverage.feature as Feature<Geometry, GeoJsonProperties>;
      const contourKey = getCoverageBeamId(coverage);
      const geometryPartKey = getGeometryPartKey(feature, index);
      const hasLocalPrebuiltFill = hasRenderablePrebuiltFill(feature, geometryPartKey, meshIndex);
      const mode = selectedContourKey === null || selectedContourKey === contourKey
        ? 'full'
        : 'dimmed';
      // Mixed banded/simple datasets should only degrade locally. If a part has
      // a renderable prebuilt mesh, keep its fill instead of disabling fills for
      // the whole coverage because another part fell back to a simple mesh.
      const showFill = hasLocalPrebuiltFill || (primaryContourKey !== null && contourKey === primaryContourKey);

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
  selectedUplinkCoverage: CandidateCoverage | null,
  selectedDownlinkCoverage: CandidateCoverage | null,
  meshIndex: Map<string, PrebuiltCoverageMesh> | null,
  visibleCoverageKeys: Set<string> | null
): RenderContour[] => {
  if (selection.type === 'none') {
    return [];
  }

  if (selection.type === 'satellite') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildSatelliteOverviewContours(satellite, meshIndex, visibleCoverageKeys) : [];
  }

  if (selection.type === 'coverage') {
    if (visibleCoverageKeys && !visibleCoverageKeys.has(selection.coverageId)) return [];
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildCoverageContours(satellite, selection.coverageId, meshIndex, null) : [];
  }

  if (selection.type === 'contour') {
    if (visibleCoverageKeys && !visibleCoverageKeys.has(selection.coverageId)) return [];
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildCoverageContours(satellite, selection.coverageId, meshIndex, selection.contourId) : [];
  }

  if (selection.type === 'target') {
    // selectedDownlinkCoverage / selectedUplinkCoverage are already filtered by
    // App.tsx (link mode + isSynthesized). The legacy selectedCoverage fallback
    // is intentionally dropped here — it would bypass those filters and render
    // the wrong footprint (e.g. a downlink beam in RETURN mode).
    const candidatePairs: Array<[CandidateCoverage, RenderContour['direction']]> = [
      // Downlink first (blue, rendered below) — uplink on top (green, outline visible)
      ...(selectedDownlinkCoverage ? [[selectedDownlinkCoverage, 'downlink']] as const : []),
      ...(selectedUplinkCoverage   ? [[selectedUplinkCoverage,   'uplink'  ]] as const : []),
    ];

    if (candidatePairs.length === 0) return [];

    const satellite = getSatelliteById(satellites, candidatePairs[0][0].satelliteId);
    if (!satellite) return [];

    // Strip the `::synth-ul` / `::synth-dl` suffix to look up real contour geometry.
    const resolveSourceKey = (key: string) => key.replace(/::synth-(ul|dl)$/, '');

    // Deduplicate by direction + source key: the same beam can appear twice (once
    // as uplink, once as downlink) so both colored outlines are visible on the globe.
    const renderedSlots = new Set<string>();
    const result: RenderContour[] = [];
    for (const [c, dir] of candidatePairs) {
      const sourceKey = resolveSourceKey(c.coverageKey);
      const slot = `${dir ?? 'none'}::${sourceKey}`;
      if (!renderedSlots.has(slot)) {
        renderedSlots.add(slot);
        const contours = buildCoverageContours(satellite, sourceKey, meshIndex, null);
        result.push(...contours.map(ct => ({ ...ct, direction: dir })));
      }
    }
    return result;
  }

  return [];
};

const getRenderModeOrder = (mode: RenderContour['mode']): number => {
  if (mode === 'dimmed') return 0;
  if (mode === 'overview') return 1;
  return 2;
};

const getLegendModeOrder = (mode: RenderContour['mode']): number => {
  if (mode === 'full') return 0;
  if (mode === 'dimmed') return 1;
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

const buildRenderContourLabels = (
  contours: RenderContour[],
  presentation: CoverageLayerProps['presentation'] = 'engineering',
  commercialLabel = 'GEO service area',
): RenderContourLabel[] => {
  if (presentation === 'commercial') {
    let selectedContour: RenderContour | null = null;
    let largestArea = -Infinity;

    for (const contour of contours) {
      const area = approximateRingArea(contour.geometry.outerRing);
      if (area > largestArea) {
        largestArea = area;
        selectedContour = contour;
      }
    }

    if (!selectedContour) return [];

    const anchor = getRingLabelAnchor(selectedContour.geometry.outerRing);
    if (!anchor) return [];

    return [{
      id: `${GEO_COVERAGE_ENTITY_PREFIX}${selectedContour.satelliteName}::commercial-label::${selectedContour.coverageKey}`,
      text: commercialLabel,
      position: Cartesian3.fromDegrees(anchor.lng, anchor.lat, GEO_FOOTPRINT_LABEL_LAYER_HEIGHT_M),
      coverageKey: selectedContour.coverageKey,
      contourKey: selectedContour.contourKey,
      coverageLabel: selectedContour.coverageLabel,
      contourLabel: selectedContour.contourLabel,
      mode: selectedContour.mode,
    }];
  }

  const bestContourByLabelKey = new Map<string, { contour: RenderContour; area: number }>();

  for (const contour of contours) {
    const labelKey = contour.mode === 'overview'
      ? `overview::${contour.coverageKey}`
      : `contour::${contour.coverageKey}::${contour.contourKey}`;
    const area = approximateRingArea(contour.geometry.outerRing);
    const currentBest = bestContourByLabelKey.get(labelKey);

    if (!currentBest || area > currentBest.area) {
      bestContourByLabelKey.set(labelKey, { contour, area });
    }
  }

  return Array.from(bestContourByLabelKey.values())
    .map(({ contour }) => {
      const anchor = getRingLabelAnchor(contour.geometry.outerRing);
      if (!anchor) return null;

      const rawText = contour.mode === 'overview'
        ? contour.coverageLabel
        : contour.contourLabel;
      const text = rawText.trim();
      if (!text) return null;

      return {
        id: `${GEO_COVERAGE_ENTITY_PREFIX}${contour.satelliteName}::label::${contour.coverageKey}::${contour.contourKey}::${contour.mode}`,
        text,
        position: Cartesian3.fromDegrees(anchor.lng, anchor.lat, GEO_FOOTPRINT_LABEL_LAYER_HEIGHT_M),
        coverageKey: contour.coverageKey,
        contourKey: contour.contourKey,
        coverageLabel: contour.coverageLabel,
        contourLabel: contour.contourLabel,
        mode: contour.mode,
      } satisfies RenderContourLabel;
    })
    .filter((label): label is RenderContourLabel => label !== null);
};

const buildGeoCoverageLegendItems = (contours: RenderContour[]): GeoCoverageLegendItem[] => {
  const itemByKey = new Map<string, GeoCoverageLegendItem>();

  for (const contour of contours) {
    const key = `${contour.coverageKey}::${contour.contourKey}`;
    const existing = itemByKey.get(key);
    if (existing) {
      if (getLegendModeOrder(contour.mode) < getLegendModeOrder(existing.mode)) {
        itemByKey.set(key, {
          ...existing,
          mode: contour.mode,
          normalizedLevel: contour.normalizedLevel,
        });
      }
      continue;
    }

    itemByKey.set(key, {
      key,
      satelliteName: contour.satelliteName,
      coverageKey: contour.coverageKey,
      coverageLabel: contour.coverageLabel,
      contourKey: contour.contourKey,
      contourLabel: contour.contourLabel,
      levelValue: contour.levelValue,
      levelUnit: contour.levelUnit,
      mode: contour.mode,
      normalizedLevel: contour.normalizedLevel,
    });
  }

  return Array.from(itemByKey.values()).sort((left, right) => {
    const modeDelta = getLegendModeOrder(left.mode) - getLegendModeOrder(right.mode);
    if (modeDelta !== 0) return modeDelta;

    if (left.normalizedLevel !== right.normalizedLevel) {
      return right.normalizedLevel - left.normalizedLevel;
    }

    const coverageDelta = left.coverageLabel.localeCompare(right.coverageLabel);
    if (coverageDelta !== 0) return coverageDelta;

    return left.contourLabel.localeCompare(right.contourLabel);
  });
};

const CoverageLayer: React.FC<CoverageLayerProps> = ({
  satellites,
  selection,
  selectedCoverage = null,
  selectedUplinkCoverage = null,
  selectedDownlinkCoverage = null,
  visibleCoverageKeys = null,
  onLegendItemsChange,
  highlightedLegendItemKey = null,
  presentation = 'engineering',
  commercialLabel = 'GEO service area',
  commercialTone = 'primary',
  commercialHero = false,
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
    () => `${getSelectionRenderSignature(selection, selectedCoverage, selectedUplinkCoverage, selectedDownlinkCoverage)}::visible:${visibleCoverageKeys?.join('|') ?? 'all'}`,
    [selection, selectedCoverage, selectedUplinkCoverage, selectedDownlinkCoverage, visibleCoverageKeys]
  );
  const visibleCoverageKeySet = useMemo(
    () => (visibleCoverageKeys ? new Set(visibleCoverageKeys) : null),
    [visibleCoverageKeys]
  );
  const relevantSatelliteId = useMemo(() => {
    if (selection.type === 'satellite' || selection.type === 'coverage' || selection.type === 'contour') {
      return selection.satelliteId;
    }

    if (selection.type === 'target') {
      return selectedUplinkCoverage?.satelliteId ?? selectedDownlinkCoverage?.satelliteId ?? selectedCoverage?.satelliteId ?? null;
    }

    return null;
  }, [selection, selectedCoverage?.satelliteId, selectedUplinkCoverage?.satelliteId, selectedDownlinkCoverage?.satelliteId]);
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
      selectedUplinkCoverage,
      selectedDownlinkCoverage,
      activeMeshIndex,
      visibleCoverageKeySet
    )),
    [activeMeshIndex, relevantSatellite, selection, selectedCoverage, selectedUplinkCoverage, selectedDownlinkCoverage, visibleCoverageKeySet]
  );
  const renderLabels = useMemo(
    () => buildRenderContourLabels(renderContours, presentation, commercialLabel),
    [commercialLabel, presentation, renderContours]
  );
  const legendItems = useMemo(
    () => buildGeoCoverageLegendItems(renderContours),
    [renderContours]
  );
  const renderContentSignature = useMemo(() => (
    renderContours
      .map((contour) => [
        contour.coverageKey,
        contour.contourKey,
        contour.geometryPartKey,
        contour.prebuiltMesh ? `mesh:${contour.prebuiltMesh.fillMode}` : 'polygon',
        contour.mode,
        contour.direction ?? 'none',
        contour.showFill ? 'fill' : 'outline',
        contour.normalizedLevel.toFixed(4),
      ].join('::'))
      .join('|')
  ), [renderContours]);
  const renderSignature = useMemo(
    () => `${selectionRenderSignature}::${renderContentSignature}::${highlightedLegendItemKey ?? 'none'}::${presentation}::${commercialLabel}::${commercialTone}::${commercialHero ? 'hero' : 'standard'}`,
    [commercialHero, commercialLabel, commercialTone, highlightedLegendItemKey, presentation, renderContentSignature, selectionRenderSignature]
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
    onLegendItemsChange?.(legendItems);
  }, [legendItems, onLegendItemsChange]);

  useEffect(() => {
    return () => {
      onLegendItemsChange?.([]);
    };
  }, [onLegendItemsChange]);

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

      // Include direction in the entity ID so uplink and downlink renderings of
      // the same source beam (shared coverageKey) don't produce duplicate IDs.
      const dirTag = contour.direction ?? 'none';
      const coverageEntityId = `${GEO_COVERAGE_ENTITY_PREFIX}${contour.satelliteName}::${dirTag}::${contour.coverageKey}`;
      const contourLegendKey = `${contour.coverageKey}::${contour.contourKey}`;
      const style = getCoverageBandStyle(
        contour.normalizedLevel,
        contour.mode,
        highlightedLegendItemKey === contourLegendKey,
        contour.direction,
        commercialTone,
        commercialHero,
      );
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
            properties: {
              overlayType: 'geo-coverage',
              coverageKey: contour.coverageKey,
              coverageLabel: contour.coverageLabel,
              contourKey: contour.contourKey,
              contourLabel: contour.contourLabel,
              mode: contour.mode,
            },
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
        properties: {
          overlayType: 'geo-coverage',
          coverageKey: contour.coverageKey,
          coverageLabel: contour.coverageLabel,
          contourKey: contour.contourKey,
          contourLabel: contour.contourLabel,
          mode: contour.mode,
        },
        polyline: {
          positions: polylinePositions,
          width: style.contourWidth,
          material: style.contourColor,
          arcType: ArcType.RHUMB,
          clampToGround: false,
        },
      });
    });

    renderLabels.forEach((labelSpec) => {
      const labelStyle = getCoverageLabelStyle(labelSpec.mode, presentation);

      dataSource.entities.add({
        id: labelSpec.id,
        position: labelSpec.position,
        properties: {
          overlayType: 'geo-coverage',
          coverageKey: labelSpec.coverageKey,
          coverageLabel: labelSpec.coverageLabel,
          contourKey: labelSpec.contourKey,
          contourLabel: labelSpec.contourLabel,
          mode: labelSpec.mode,
        },
        label: {
          text: labelSpec.text,
          fillColor: labelStyle.fillColor,
          outlineColor: labelStyle.outlineColor,
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: labelStyle.backgroundColor,
          backgroundPadding: new Cartesian2(8, 5),
          horizontalOrigin: HorizontalOrigin.CENTER,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -10),
          scale: labelStyle.scale,
          scaleByDistance: new NearFarScalar(2.0e6, 1.0, 1.8e7, 0.45),
          translucencyByDistance: new NearFarScalar(2.0e6, 1.0, 2.1e7, 0.0),
        },
      });
    });

    viewer?.scene.requestRender();
  }, [commercialTone, geometryLod, highlightedLegendItemKey, presentation, renderContours, renderLabels, renderSignature, selectedCoverage, selectedUplinkCoverage, selectedDownlinkCoverage, selection, viewer]);

  return null;
};

export default CoverageLayer;
