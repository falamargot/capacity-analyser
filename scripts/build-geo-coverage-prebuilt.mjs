import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { Cartesian2, PolygonPipeline } from 'cesium';

const SOURCE_DIR = new URL('../public/coverage/', import.meta.url);
const TARGET_DIR = new URL('../public/coverage-prebuilt/', import.meta.url);
const MANIFEST_PATH = new URL('../public/coverage-prebuilt/manifest.json', import.meta.url);
const PREBUILT_FORMAT = 'geo-coverage-prebuilt-v2';
const MAX_SEGMENT_DEGREES = 2.5;

const VERTEX_FORMAT = 'lnglat';

const isFiniteCoordinate = (value) => typeof value === 'number' && Number.isFinite(value);

const normalizeLongitude = (lng) => {
  if (!Number.isFinite(lng)) return lng;

  let normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  if (normalized === -180 && lng > 0) {
    normalized = 180;
  }

  return normalized;
};

const normalizeLongitudeDelta = (deltaLng) => {
  if (!Number.isFinite(deltaLng)) return deltaLng;
  if (deltaLng > 180) return deltaLng - 360;
  if (deltaLng < -180) return deltaLng + 360;
  return deltaLng;
};

const sanitizeRing = (ring) => {
  if (!Array.isArray(ring)) return null;

  const sanitized = ring
    .filter((point) => (
      Array.isArray(point) &&
      point.length >= 2 &&
      isFiniteCoordinate(point[0]) &&
      isFiniteCoordinate(point[1])
    ))
    .map(([lng, lat]) => [lng, lat]);

  if (sanitized.length >= 2) {
    const [firstLng, firstLat] = sanitized[0];
    const [lastLng, lastLat] = sanitized[sanitized.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) {
      sanitized.pop();
    }
  }

  if (sanitized.length < 3) return null;

  const uniqueVertices = new Set(
    sanitized.map(([lng, lat]) => `${lng.toFixed(6)}:${lat.toFixed(6)}`),
  );

  return uniqueVertices.size >= 3 ? sanitized : null;
};

const getSignedRingArea = (ring) => {
  if (ring.length < 3) return 0;

  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[previous];
    const [x2, y2] = ring[index];
    area += (x1 * y2) - (x2 * y1);
  }

  return area * 0.5;
};

const normalizeRingOrientation = (ring, wantPositiveArea) => {
  const signedArea = getSignedRingArea(ring);
  if (signedArea === 0) return ring;
  const hasPositiveArea = signedArea > 0;
  return hasPositiveArea === wantPositiveArea ? ring : [...ring].reverse();
};

const densifyRingForGlobe = (ring, maxSegmentDegrees = MAX_SEGMENT_DEGREES) => {
  if (ring.length < 2 || !Number.isFinite(maxSegmentDegrees) || maxSegmentDegrees <= 0) {
    return ring;
  }

  const densified = [];

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const [currentLng, currentLat] = current;
    const [nextLng, nextLat] = next;

    densified.push([currentLng, currentLat]);

    const deltaLng = normalizeLongitudeDelta(nextLng - currentLng);
    const deltaLat = nextLat - currentLat;
    const segmentSpan = Math.max(Math.abs(deltaLng), Math.abs(deltaLat));
    const segments = Math.ceil(segmentSpan / maxSegmentDegrees);

    for (let step = 1; step < segments; step += 1) {
      const ratio = step / segments;
      densified.push([
        normalizeLongitude(currentLng + (deltaLng * ratio)),
        currentLat + (deltaLat * ratio),
      ]);
    }
  }

  return densified;
};

const computeBBox = (ring) => {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return { minLng, maxLng, minLat, maxLat };
};

const buildTriangulatedMesh = (outerRing, holes) => {
  const vertices = [];
  const positions = [];
  const holeIndices = [];

  const appendRing = (ring) => {
    for (const [lng, lat] of ring) {
      vertices.push(lng, lat);
      positions.push(new Cartesian2(lng, lat));
    }
  };

  appendRing(outerRing);

  for (const ring of holes) {
    holeIndices.push(vertices.length / 2);
    appendRing(ring);
  }

  try {
    const indices = PolygonPipeline.triangulate(
      positions,
      holeIndices.length > 0 ? holeIndices : undefined,
    );

    return {
      vertexFormat: VERTEX_FORMAT,
      vertexCount: vertices.length / 2,
      triangleCount: indices.length / 3,
      vertices,
      indices,
    };
  } catch {
    return null;
  }
};

const buildPrebuiltPolygonFeature = ({
  satelliteId,
  coverage,
  coverageIndex,
  polygonIndex,
  polygonCoordinates,
  sourceCoverageId,
  sourceFootprintId,
}) => {
  const [outerRing, ...holeRings] = polygonCoordinates ?? [];
  const sanitizedOuterRing = sanitizeRing(outerRing);
  if (!sanitizedOuterRing) return null;

  const normalizedOuterRing = normalizeRingOrientation(sanitizedOuterRing, true);
  const normalizedHoles = holeRings
    .map((ring) => sanitizeRing(ring))
    .map((ring) => (ring ? normalizeRingOrientation(ring, false) : null))
    .filter((ring) => ring !== null);

  const densifiedOuterRing = densifyRingForGlobe(normalizedOuterRing);
  const densifiedHoles = normalizedHoles.map((ring) => densifyRingForGlobe(ring));
  const mesh = buildTriangulatedMesh(densifiedOuterRing, densifiedHoles);

  const sourcePointCount = normalizedOuterRing.length + normalizedHoles.reduce((sum, ring) => sum + ring.length, 0);
  const renderPointCount = densifiedOuterRing.length + densifiedHoles.reduce((sum, ring) => sum + ring.length, 0);

  return {
    type: 'Feature',
    properties: {
      satelliteId,
      name: coverage.name,
      mission: coverage.name,
      commercialName: coverage.commercialName ?? null,
      isUplink: coverage.up,
      type: 'EUTELSAT',
      level: coverage.level,
      contour: coverage.level,
      coverageGeometryKey: `${coverageIndex}:${polygonIndex}`,
      coveragePartIndex: polygonIndex,
      coverageSourceFeatureIndex: coverageIndex,
      sourceCoverageId,
      sourceFootprintId,
      sourcePointCount,
      renderPointCount,
      bbox: computeBBox(densifiedOuterRing),
    },
    geometry: {
      type: 'Polygon',
      coordinates: [densifiedOuterRing, ...densifiedHoles],
    },
    mesh,
  };
};

const buildPrebuiltFile = (sourceFileName, data) => {
  const satelliteId = sourceFileName.replace(/\.json$/i, '');
  const features = [];
  let sourcePointCount = 0;
  let renderPointCount = 0;
  let triangleCount = 0;

  data.coverages.forEach((coverage, coverageIndex) => {
    coverage.footprints.forEach((footprint) => {
      const geometry = footprint.geometry;
      const polygons = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates;

      polygons.forEach((polygonCoordinates, polygonIndex) => {
        const feature = buildPrebuiltPolygonFeature({
          satelliteId,
          coverage: {
            ...coverage,
            level: footprint.level,
          },
          coverageIndex,
          polygonIndex,
          polygonCoordinates,
          sourceCoverageId: coverage.id,
          sourceFootprintId: footprint.id,
        });

        if (!feature) return;

        sourcePointCount += feature.properties.sourcePointCount;
        renderPointCount += feature.properties.renderPointCount;
        triangleCount += feature.mesh?.triangleCount ?? 0;
        features.push(feature);
      });
    });
  });

  return {
    format: PREBUILT_FORMAT,
    generatedAt: new Date().toISOString(),
    sourceFile: sourceFileName,
    satelliteId,
    stats: {
      coverageCount: data.coverages.length,
      polygonCount: features.length,
      sourcePointCount,
      renderPointCount,
      triangleCount,
      densificationRatio: sourcePointCount === 0
        ? 1
        : Number((renderPointCount / sourcePointCount).toFixed(4)),
    },
    type: 'FeatureCollection',
    features,
  };
};

const buildManifestEntry = (fileName, artifact) => ({
  fileName,
  satelliteId: artifact.satelliteId,
  coverageCount: artifact.stats.coverageCount,
  polygonCount: artifact.stats.polygonCount,
  sourcePointCount: artifact.stats.sourcePointCount,
  renderPointCount: artifact.stats.renderPointCount,
  triangleCount: artifact.stats.triangleCount,
  densificationRatio: artifact.stats.densificationRatio,
});

const main = async () => {
  await mkdir(TARGET_DIR, { recursive: true });
  await rm(TARGET_DIR, { recursive: true, force: true });
  await mkdir(TARGET_DIR, { recursive: true });

  const sourceFileNames = (await readdir(SOURCE_DIR))
    .filter((fileName) => fileName.endsWith('.json') && fileName !== 'coverageManifest.json')
    .sort();

  const manifest = [];

  for (const fileName of sourceFileNames) {
    const sourcePath = new URL(fileName, SOURCE_DIR);
    const raw = await readFile(sourcePath, 'utf8');
    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object' || !Array.isArray(data.coverages)) {
      continue;
    }

    const artifact = buildPrebuiltFile(fileName, data);
    const targetPath = new URL(fileName, TARGET_DIR);
    await writeFile(targetPath, JSON.stringify(artifact));
    manifest.push(buildManifestEntry(fileName, artifact));
  }

  await writeFile(MANIFEST_PATH, JSON.stringify({
    format: PREBUILT_FORMAT,
    generatedAt: new Date().toISOString(),
    fileCount: manifest.length,
    entries: manifest,
  }));

  const totals = manifest.reduce((acc, entry) => ({
    coverageCount: acc.coverageCount + entry.coverageCount,
    polygonCount: acc.polygonCount + entry.polygonCount,
    sourcePointCount: acc.sourcePointCount + entry.sourcePointCount,
    renderPointCount: acc.renderPointCount + entry.renderPointCount,
    triangleCount: acc.triangleCount + entry.triangleCount,
  }), {
    coverageCount: 0,
    polygonCount: 0,
    sourcePointCount: 0,
    renderPointCount: 0,
    triangleCount: 0,
  });

  console.log(
    `Prebuilt GEO coverage written to ${TARGET_DIR.pathname} (${manifest.length} files, `
    + `${totals.coverageCount} coverages, ${totals.polygonCount} polygons, `
    + `${totals.renderPointCount} render points, ${totals.triangleCount} triangles).`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
