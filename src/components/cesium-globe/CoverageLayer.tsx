import { useEffect, useMemo, useRef } from 'react';
import {
  ArcType,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  PolygonHierarchy,
} from 'cesium';
import { useCesium } from 'resium';
import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { CandidateCoverage, Selection } from '../../types/analysis';
import type { Coverage, SatelliteData } from '../../types/satellites';
import { densifyRingForGlobe } from '../../utils/coverageGeometry';
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
const SELECTED_GEO_CONTOUR_BASE_COLOR = Color.fromCssColorString('#2563eb');
const SELECTED_GEO_FILL_OUTER_COLOR = Color.fromCssColorString('#93c5fd');
const SELECTED_GEO_FILL_INNER_COLOR = Color.fromCssColorString('#3b82f6');
const DIMMED_CONTOUR_COLOR = Color.fromCssColorString('#94a3b8').withAlpha(0.34);

interface CoverageLayerProps {
  satellites: SatelliteData[];
  selection: Selection;
  selectedCoverage?: CandidateCoverage | null;
}

interface SanitizedPolygonGeometry {
  outerRing: number[][];
  holes: number[][][];
}

interface RenderContour {
  satelliteName: string;
  coverageKey: string;
  contourKey: string;
  geometryPartKey: string;
  geometry: SanitizedPolygonGeometry;
  normalizedLevel: number;
  mode: 'overview' | 'full' | 'dimmed';
}

const _sanitizedGeometryCache = new WeakMap<object, SanitizedPolygonGeometry | null>();

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
  };

  _sanitizedGeometryCache.set(feature, result);
  return result;
};

const approximateRingArea = (ring: number[][]): number => Math.abs(getSignedRingArea(ring));

const buildPolygonHierarchy = (geometry: SanitizedPolygonGeometry): PolygonHierarchy | null => {
  try {
    return new PolygonHierarchy(
      Cartesian3.fromDegreesArray(densifyRingForGlobe(geometry.outerRing).flat() as number[]),
      geometry.holes.map((ring) => (
        new PolygonHierarchy(
          Cartesian3.fromDegreesArray(densifyRingForGlobe(ring).flat() as number[])
        )
      ))
    );
  } catch {
    return null;
  }
};

const buildContourPositions = (ring: number[][], height: number): Cartesian3[] | null => {
  try {
    const closed = buildClosedRing(densifyRingForGlobe(ring));
    const degrees: number[] = [];
    for (const [lng, lat] of closed) {
      degrees.push(lng, lat, height);
    }
    return Cartesian3.fromDegreesArrayHeights(degrees);
  } catch {
    return null;
  }
};

const getCoverageBandStyle = (
  normalizedBand: number,
  mode: RenderContour['mode']
): { fillColor: Color; contourColor: Color; contourWidth: number } => {
  if (mode === 'overview') {
    return {
      fillColor: OVERVIEW_FILL_COLOR,
      contourColor: OVERVIEW_CONTOUR_COLOR,
      contourWidth: 1.2,
    };
  }

  if (mode === 'dimmed') {
    return {
      fillColor: Color.fromCssColorString('#cbd5e1').withAlpha(0.02 + (normalizedBand * 0.04)),
      contourColor: DIMMED_CONTOUR_COLOR,
      contourWidth: 1,
    };
  }

  const fillColor = Color.lerp(
    SELECTED_GEO_FILL_OUTER_COLOR,
    SELECTED_GEO_FILL_INNER_COLOR,
    0.14 + (normalizedBand * 0.86),
    new Color()
  );
  fillColor.alpha = 0.085 + (normalizedBand * 0.17);

  return {
    fillColor,
    contourColor: SELECTED_GEO_CONTOUR_BASE_COLOR.withAlpha(0.6 + (normalizedBand * 0.32)),
    contourWidth: 1.6,
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

const getGeometryPartKey = (feature: Feature<Geometry, GeoJsonProperties>, fallbackIndex: number): string => {
  const key = feature.properties?.coverageGeometryKey;
  return typeof key === 'string' ? key : `part-${fallbackIndex}`;
};

const toRenderContour = (
  satellite: SatelliteData,
  coverage: Coverage,
  normalizedLevel: number,
  mode: RenderContour['mode'],
  index: number
): RenderContour | null => {
  const geometry = getSanitizedPolygonGeometry(coverage.feature as Feature<Geometry, GeoJsonProperties>);
  if (!geometry) return null;

  return {
    satelliteName: satellite.name,
    coverageKey: getCoverageGroupId(coverage),
    contourKey: getCoverageBeamId(coverage),
    geometryPartKey: getGeometryPartKey(coverage.feature as Feature<Geometry, GeoJsonProperties>, index),
    geometry,
    normalizedLevel,
    mode,
  };
};

const buildSatelliteOverviewContours = (satellite: SatelliteData): RenderContour[] => {
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

    const renderContour = toRenderContour(satellite, selectedCoverage, 1, 'overview', 0);
    if (renderContour) {
      contours.push({ ...renderContour, coverageKey });
    }
  }

  return contours;
};

const buildCoverageContours = (
  satellite: SatelliteData,
  coverageKey: string,
  selectedContourKey: string | null
): RenderContour[] => {
  const coverages = getCoverageParts(satellite, coverageKey);
  const normalizedLevels = getCoverageLevelNormalizer(coverages);

  return coverages
    .map((coverage, index) => {
      const contourKey = getCoverageBeamId(coverage);
      const mode = selectedContourKey === null || selectedContourKey === contourKey
        ? 'full'
        : 'dimmed';

      return toRenderContour(
        satellite,
        coverage,
        normalizedLevels.get(contourKey) ?? 1,
        mode,
        index
      );
    })
    .filter((contour): contour is RenderContour => contour !== null);
};

const resolveRenderContours = (
  satellites: SatelliteData[],
  selection: Selection,
  selectedCoverage: CandidateCoverage | null
): RenderContour[] => {
  if (selection.type === 'none') {
    return [];
  }

  if (selection.type === 'satellite') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildSatelliteOverviewContours(satellite) : [];
  }

  if (selection.type === 'coverage') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildCoverageContours(satellite, selection.coverageId, null) : [];
  }

  if (selection.type === 'contour') {
    const satellite = getSatelliteById(satellites, selection.satelliteId);
    return satellite ? buildCoverageContours(satellite, selection.coverageId, selection.contourId) : [];
  }

  if (selection.type === 'target' && selectedCoverage) {
    const satellite = getSatelliteById(satellites, selectedCoverage.satelliteId);
    return satellite ? buildCoverageContours(satellite, selectedCoverage.coverageKey, null) : [];
  }

  return [];
};

const CoverageLayer: React.FC<CoverageLayerProps> = ({
  satellites,
  selection,
  selectedCoverage = null,
}) => {
  const { viewer } = useCesium();
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const isAddedRef = useRef(false);
  const previousRenderSignatureRef = useRef<string | null>(null);
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
  const renderContours = useMemo(
    () => resolveRenderContours(
      relevantSatellite ? [relevantSatellite] : [],
      selection,
      selectedCoverage
    ),
    [relevantSatellite, selection, selectedCoverage]
  );
  const renderContentSignature = useMemo(() => (
    renderContours
      .map((contour) => [
        contour.coverageKey,
        contour.contourKey,
        contour.geometryPartKey,
        contour.mode,
        contour.normalizedLevel.toFixed(4),
      ].join('::'))
      .join('|')
  ), [renderContours]);
  const renderSignature = useMemo(
    () => `${selectionRenderSignature}::${renderContentSignature}`,
    [renderContentSignature, selectionRenderSignature]
  );

  useEffect(() => {
    if (!viewer) return;

    const dataSource = new CustomDataSource('geo-analysis-layer');
    dataSourceRef.current = dataSource;
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

    void attach();

    return () => {
      cancelled = true;
      if (!viewer.isDestroyed() && isAddedRef.current && viewer.dataSources.contains(dataSource)) {
        viewer.dataSources.remove(dataSource, false);
      }
      isAddedRef.current = false;
      dataSourceRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    const dataSource = dataSourceRef.current;
    if (!dataSource) return;

    if (previousRenderSignatureRef.current === renderSignature) {
      return;
    }
    previousRenderSignatureRef.current = renderSignature;

    dataSource.entities.removeAll();

    console.debug('[CoverageLayer] render', {
      renderSignature,
      selectionType: selection.type,
      contourCount: renderContours.length,
      selectedCoverageId: selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : 'none',
    });

    renderContours.forEach((contour) => {
      const hierarchy = buildPolygonHierarchy(contour.geometry);
      const polylinePositions = buildContourPositions(
        contour.geometry.outerRing,
        GEO_FOOTPRINT_OUTLINE_LAYER_HEIGHT_M
      );
      if (!hierarchy || !polylinePositions) return;

      const coverageEntityId = `${GEO_COVERAGE_ENTITY_PREFIX}${contour.satelliteName}::${contour.coverageKey}`;
      const style = getCoverageBandStyle(contour.normalizedLevel, contour.mode);

      dataSource.entities.add({
        id: `${coverageEntityId}::fill::${contour.contourKey}::${contour.geometryPartKey}`,
        name: contour.coverageKey,
        polygon: {
          hierarchy,
          material: new ColorMaterialProperty(style.fillColor),
          arcType: ArcType.RHUMB,
          outline: false,
          height: GEO_FOOTPRINT_LAYER_HEIGHT_M,
        },
      });

      dataSource.entities.add({
        id: `${coverageEntityId}::outline::${contour.contourKey}::${contour.geometryPartKey}`,
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
  }, [renderContours, renderSignature, selectedCoverage, selection, viewer]);

  return null;
};

export default CoverageLayer;
