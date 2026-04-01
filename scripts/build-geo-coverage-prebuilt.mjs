import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import {
  ArcType,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  PolygonPipeline,
} from 'cesium';
import polygonClipping from 'polygon-clipping';

const SOURCE_DIR = new URL('../public/coverage/', import.meta.url);
const TARGET_DIR = new URL('../public/coverage-prebuilt/', import.meta.url);
const STAGING_DIR = new URL('../public/coverage-prebuilt.tmp/', import.meta.url);
const SUMMARY_MANIFEST_PATH = new URL('../public/coverage-prebuilt/manifest.json', import.meta.url);
const PREBUILT_FORMAT = 'geo-coverage-prebuilt-v5';
const MAX_SEGMENT_DEGREES = 2.5;
const RENDER_HEIGHT_METERS = 1100;
const RENDER_GRANULARITY_RADIANS = CesiumMath.toRadians(MAX_SEGMENT_DEGREES);
const POSITION_COMPONENTS = 3;
const POSITION_COMPONENT_TYPE = 'float64';
const INDEX_COMPONENT_TYPE = 'uint32';
const VERTEX_FORMAT = 'cartesian3';

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

const getFeatureMeshKey = (name, level, coverageGeometryKey) => `${name}::${level}::${coverageGeometryKey}`;

const toPolygonClippingPolygon = (geometry) => [
  geometry.outerRing,
  ...geometry.holes,
];

const toPolygonClippingMultiPolygon = (geometries) => geometries.map(toPolygonClippingPolygon);

const sanitizePolygonGeometry = (polygon) => {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return null;
  }

  const [outerRing, ...holeRings] = polygon;
  const sanitizedOuterRing = sanitizeRing(outerRing);
  if (!sanitizedOuterRing) {
    return null;
  }

  return {
    outerRing: normalizeRingOrientation(sanitizedOuterRing, true),
    holes: holeRings
      .map((ring) => sanitizeRing(ring))
      .map((ring) => (ring ? normalizeRingOrientation(ring, false) : null))
      .filter((ring) => ring !== null),
  };
};

const sanitizeMultiPolygonGeometry = (multiPolygon) => (
  Array.isArray(multiPolygon)
    ? multiPolygon
        .map((polygon) => sanitizePolygonGeometry(polygon))
        .filter((polygon) => polygon !== null)
    : []
);

const densifyPolygonGeometry = (polygon) => ({
  outerRing: densifyRingForGlobe(polygon.outerRing),
  holes: polygon.holes.map((hole) => densifyRingForGlobe(hole)),
});

const buildRenderMesh = (outerRing, holes) => {
  const ringToCartesian3 = (ring) => Cartesian3.fromDegreesArray(
    ring.flatMap(([lng, lat]) => [lng, lat]),
  );

  const polygonHierarchy = new PolygonHierarchy(
    ringToCartesian3(outerRing),
    holes.map((ring) => new PolygonHierarchy(ringToCartesian3(ring))),
  );

  const positions2d = [];

  try {
    const geometry = PolygonGeometry.createGeometry(
      new PolygonGeometry({
        polygonHierarchy,
        height: RENDER_HEIGHT_METERS,
        arcType: ArcType.RHUMB,
        granularity: RENDER_GRANULARITY_RADIANS,
        vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
      }),
    );
    if (!geometry?.attributes.position?.values || !geometry.indices || !geometry.boundingSphere) {
      return null;
    }

    return {
      vertexFormat: VERTEX_FORMAT,
      positionCount: geometry.attributes.position.values.length / POSITION_COMPONENTS,
      triangleCount: geometry.indices.length / 3,
      positions: Float64Array.from(geometry.attributes.position.values),
      indices: Uint32Array.from(geometry.indices),
      boundingSphere: {
        center: [
          geometry.boundingSphere.center.x,
          geometry.boundingSphere.center.y,
          geometry.boundingSphere.center.z,
        ],
        radius: geometry.boundingSphere.radius,
      },
    };
  } catch {
    // Fallback for rare cases where Cesium cannot build the final surface mesh.
    const vertices = [];
    const holeIndices = [];

    const appendRing = (ring) => {
      for (const [lng, lat] of ring) {
        vertices.push(lng, lat);
        positions2d.push(new Cartesian2(lng, lat));
      }
    };

    appendRing(outerRing);

    for (const ring of holes) {
      holeIndices.push(vertices.length / 2);
      appendRing(ring);
    }

    try {
      const indices = PolygonPipeline.triangulate(
        positions2d,
        holeIndices.length > 0 ? holeIndices : undefined,
      );

      const cartesianPositions = Cartesian3.fromDegreesArrayHeights(
        vertices.flatMap((value, index) => (
          index % 2 === 0
            ? [value, vertices[index + 1], RENDER_HEIGHT_METERS]
            : []
        )),
      );

      return {
        vertexFormat: VERTEX_FORMAT,
        positionCount: cartesianPositions.length,
        triangleCount: indices.length / 3,
        positions: Float64Array.from(cartesianPositions.flatMap((position) => [position.x, position.y, position.z])),
        indices: Uint32Array.from(indices),
        boundingSphere: null,
      };
    } catch {
      return null;
    }
  }
};

const mergeMeshes = (meshes) => {
  if (meshes.length === 0) {
    return null;
  }

  if (meshes.length === 1) {
    return meshes[0];
  }

  const totalPositionValues = meshes.reduce((sum, mesh) => sum + mesh.positions.length, 0);
  const totalIndices = meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0);
  const positions = new Float64Array(totalPositionValues);
  const indices = new Uint32Array(totalIndices);
  let positionValueOffset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  for (const mesh of meshes) {
    positions.set(mesh.positions, positionValueOffset);

    for (let index = 0; index < mesh.indices.length; index += 1) {
      indices[indexOffset + index] = mesh.indices[index] + vertexOffset;
    }

    positionValueOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
    vertexOffset += mesh.positionCount;
  }

  const boundingSphere = BoundingSphere.fromVertices(positions);

  return {
    vertexFormat: VERTEX_FORMAT,
    positionCount: positions.length / POSITION_COMPONENTS,
    triangleCount: indices.length / 3,
    positions,
    indices,
    boundingSphere: {
      center: [boundingSphere.center.x, boundingSphere.center.y, boundingSphere.center.z],
      radius: boundingSphere.radius,
    },
  };
};

const buildRenderMeshFromMultiPolygon = (multiPolygon, shouldDensify = false) => {
  const sanitizedPolygons = sanitizeMultiPolygonGeometry(multiPolygon)
    .map((polygon) => (shouldDensify ? densifyPolygonGeometry(polygon) : polygon));
  if (sanitizedPolygons.length === 0) {
    return null;
  }

  const meshes = sanitizedPolygons
    .map((polygon) => buildRenderMesh(polygon.outerRing, polygon.holes))
    .filter((mesh) => mesh !== null);

  return meshes.length > 0 ? mergeMeshes(meshes) : null;
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
  const coverageGeometryKey = `${coverageIndex}:${polygonIndex}`;

  const sourcePointCount = normalizedOuterRing.length + normalizedHoles.reduce((sum, ring) => sum + ring.length, 0);
  const renderPointCount = densifiedOuterRing.length + densifiedHoles.reduce((sum, ring) => sum + ring.length, 0);

  return {
    key: getFeatureMeshKey(coverage.name, coverage.level, coverageGeometryKey),
    satelliteId,
    name: coverage.name,
    mission: coverage.name,
    commercialName: coverage.commercialName ?? null,
    isUplink: coverage.up,
    type: 'EUTELSAT',
    level: coverage.level,
    contour: coverage.level,
    coverageGeometryKey,
    coveragePartIndex: polygonIndex,
    coverageSourceFeatureIndex: coverageIndex,
    sourceCoverageId,
    sourceFootprintId,
    sourcePointCount,
    renderPointCount,
    bbox: computeBBox(densifiedOuterRing),
    geometry: {
      outerRing: normalizedOuterRing,
      holes: normalizedHoles,
    },
    renderGeometry: {
      outerRing: densifiedOuterRing,
      holes: densifiedHoles,
    },
  };
};

const buildBandedCoverageFeatures = (coverageFeatures) => {
  if (coverageFeatures.length === 0) {
    return [];
  }

  const featuresByLevel = new Map();

  for (const feature of coverageFeatures) {
    const levelKey = String(feature.level);
    const levelFeatures = featuresByLevel.get(levelKey) ?? [];
    levelFeatures.push(feature);
    featuresByLevel.set(levelKey, levelFeatures);
  }

  const orderedLevels = Array.from(featuresByLevel.keys())
    .map((level) => Number(level))
    .sort((a, b) => a - b);

  const unionByLevel = new Map();

  for (const level of orderedLevels) {
    const levelFeatures = featuresByLevel.get(String(level)) ?? [];
    const geoms = levelFeatures.map((feature) => toPolygonClippingPolygon(feature.geometry));
    if (geoms.length === 0) {
      unionByLevel.set(level, []);
      continue;
    }

    unionByLevel.set(
      level,
      geoms.length === 1 ? [geoms[0]] : polygonClipping.union(...geoms),
    );
  }

  return coverageFeatures.map((feature) => {
    const currentLevelIndex = orderedLevels.indexOf(feature.level);
    const nextLevel = currentLevelIndex >= 0 ? orderedLevels[currentLevelIndex + 1] : undefined;
    const subject = [toPolygonClippingPolygon(feature.geometry)];
    let bandedMesh = null;

    if (nextLevel !== undefined) {
      try {
        const clipped = polygonClipping.difference(subject, unionByLevel.get(nextLevel) ?? []);
        bandedMesh = buildRenderMeshFromMultiPolygon(clipped, true);
      } catch {
        bandedMesh = null;
      }
    } else {
      bandedMesh = buildRenderMeshFromMultiPolygon(subject, true);
    }

    const mesh = bandedMesh ?? buildRenderMesh(feature.renderGeometry.outerRing, feature.renderGeometry.holes);

    return {
      ...feature,
      mesh,
      fillMode: bandedMesh ? 'banded' : 'simple',
    };
  });
};

const buildBinaryArtifact = (sourceFileName, data) => {
  const satelliteId = sourceFileName.replace(/\.json$/i, '');
  const features = [];
  let sourcePointCount = 0;
  let renderPointCount = 0;
  let triangleCount = 0;

  data.coverages.forEach((coverage, coverageIndex) => {
    const coverageFeatures = [];

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

        coverageFeatures.push(feature);
      });
    });

    const finalizedCoverageFeatures = buildBandedCoverageFeatures(coverageFeatures);

    for (const feature of finalizedCoverageFeatures) {
      sourcePointCount += feature.sourcePointCount;
      renderPointCount += feature.renderPointCount;
      triangleCount += feature.mesh?.triangleCount ?? 0;
      features.push(feature);
    }
  });

  const totalPositionValues = features.reduce((sum, feature) => sum + (feature.mesh?.positions.length ?? 0), 0);
  const totalIndices = features.reduce((sum, feature) => sum + (feature.mesh?.indices.length ?? 0), 0);
  const positions = new Float64Array(totalPositionValues);
  const indices = new Uint32Array(totalIndices);
  const manifestFeatures = [];
  let positionValueOffset = 0;
  let indexOffset = 0;

  for (const feature of features) {
    const mesh = feature.mesh;
    if (!mesh) continue;

    positions.set(mesh.positions, positionValueOffset);
    indices.set(mesh.indices, indexOffset);

    manifestFeatures.push({
      key: feature.key,
      satelliteId: feature.satelliteId,
      name: feature.name,
      mission: feature.mission,
      commercialName: feature.commercialName,
      isUplink: feature.isUplink,
      type: feature.type,
      level: feature.level,
      contour: feature.contour,
      coverageGeometryKey: feature.coverageGeometryKey,
      coveragePartIndex: feature.coveragePartIndex,
      coverageSourceFeatureIndex: feature.coverageSourceFeatureIndex,
      sourceCoverageId: feature.sourceCoverageId,
      sourceFootprintId: feature.sourceFootprintId,
      sourcePointCount: feature.sourcePointCount,
      renderPointCount: feature.renderPointCount,
      bbox: feature.bbox,
      fillMode: feature.fillMode,
      triangleCount: mesh.triangleCount,
      positionCount: mesh.positionCount,
      positionByteOffset: positionValueOffset * Float64Array.BYTES_PER_ELEMENT,
      indexCount: mesh.indices.length,
      indexByteOffset: (positions.byteLength + (indexOffset * Uint32Array.BYTES_PER_ELEMENT)),
      boundingSphere: mesh.boundingSphere,
    });

    positionValueOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
  }

  const meshBinary = new Uint8Array(positions.byteLength + indices.byteLength);
  meshBinary.set(new Uint8Array(positions.buffer), 0);
  meshBinary.set(new Uint8Array(indices.buffer), positions.byteLength);

  return {
    satelliteId,
    manifest: {
      format: PREBUILT_FORMAT,
      generatedAt: new Date().toISOString(),
      sourceFile: sourceFileName,
      satelliteId,
      meshFile: `${satelliteId}.mesh.bin`,
      meshEncoding: {
        vertexFormat: VERTEX_FORMAT,
        positionComponentType: POSITION_COMPONENT_TYPE,
        positionComponents: POSITION_COMPONENTS,
        indexComponentType: INDEX_COMPONENT_TYPE,
      },
      stats: {
        coverageCount: data.coverages.length,
        polygonCount: features.length,
        sourcePointCount,
        renderPointCount,
        triangleCount,
        densificationRatio: sourcePointCount === 0
          ? 1
          : Number((renderPointCount / sourcePointCount).toFixed(4)),
        meshBytes: meshBinary.byteLength,
      },
      features: manifestFeatures,
    },
    meshBinary,
  };
};

const buildSummaryManifestEntry = ({ satelliteId, manifest }) => ({
  satelliteId,
  manifestFileName: `${satelliteId}.manifest.json`,
  meshFileName: manifest.meshFile,
  coverageCount: manifest.stats.coverageCount,
  polygonCount: manifest.stats.polygonCount,
  sourcePointCount: manifest.stats.sourcePointCount,
  renderPointCount: manifest.stats.renderPointCount,
  triangleCount: manifest.stats.triangleCount,
  densificationRatio: manifest.stats.densificationRatio,
  meshBytes: manifest.stats.meshBytes,
});

const parseRequestedSatelliteIds = () => {
  const fromEnv = process.env.GEO_COVERAGE_FILTER
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];

  const flagIndex = process.argv.findIndex((arg) => arg === '--satellite');
  const fromArg = flagIndex >= 0
    ? (process.argv[flagIndex + 1] ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return new Set([...fromEnv, ...fromArg]);
};

const main = async () => {
  const requestedSatelliteIds = parseRequestedSatelliteIds();
  const isPartialBuild = requestedSatelliteIds.size > 0;

  if (isPartialBuild) {
    await mkdir(TARGET_DIR, { recursive: true });
  } else {
    await rm(STAGING_DIR, { recursive: true, force: true });
    await mkdir(STAGING_DIR, { recursive: true });
  }

  const sourceFileNames = (await readdir(SOURCE_DIR))
    .filter((fileName) => fileName.endsWith('.json') && fileName !== 'coverageManifest.json')
    .filter((fileName) => (
      requestedSatelliteIds.size === 0
        ? true
        : requestedSatelliteIds.has(fileName.replace(/\.json$/i, ''))
    ))
    .sort();

  const summaryEntries = [];
  const outputDir = isPartialBuild ? TARGET_DIR : STAGING_DIR;

  for (const fileName of sourceFileNames) {
    const sourcePath = new URL(fileName, SOURCE_DIR);
    const raw = await readFile(sourcePath, 'utf8');
    const data = JSON.parse(raw);

    if (!data || typeof data !== 'object' || !Array.isArray(data.coverages)) {
      continue;
    }

    const artifact = buildBinaryArtifact(fileName, data);
    await writeFile(new URL(`${artifact.satelliteId}.manifest.json`, outputDir), JSON.stringify(artifact.manifest));
    await writeFile(new URL(`${artifact.satelliteId}.mesh.bin`, outputDir), artifact.meshBinary);
    summaryEntries.push(buildSummaryManifestEntry(artifact));
  }

  let finalSummaryEntries = summaryEntries;

  if (isPartialBuild) {
    try {
      const existingRaw = await readFile(new URL('manifest.json', TARGET_DIR), 'utf8');
      const existingManifest = JSON.parse(existingRaw);
      if (existingManifest?.format === PREBUILT_FORMAT && Array.isArray(existingManifest.entries)) {
        const mergedEntries = new Map(existingManifest.entries.map((entry) => [entry.satelliteId, entry]));
        for (const entry of summaryEntries) {
          mergedEntries.set(entry.satelliteId, entry);
        }
        finalSummaryEntries = Array.from(mergedEntries.values()).sort((a, b) => a.satelliteId.localeCompare(b.satelliteId));
      }
    } catch {
    }
  }

  await writeFile(new URL('manifest.json', outputDir), JSON.stringify({
    format: PREBUILT_FORMAT,
    generatedAt: new Date().toISOString(),
    fileCount: finalSummaryEntries.length,
    entries: finalSummaryEntries,
  }));

  if (!isPartialBuild) {
    await rm(TARGET_DIR, { recursive: true, force: true });
    await rename(STAGING_DIR, TARGET_DIR);
  }

  const totals = finalSummaryEntries.reduce((acc, entry) => ({
    coverageCount: acc.coverageCount + entry.coverageCount,
    polygonCount: acc.polygonCount + entry.polygonCount,
    sourcePointCount: acc.sourcePointCount + entry.sourcePointCount,
    renderPointCount: acc.renderPointCount + entry.renderPointCount,
    triangleCount: acc.triangleCount + entry.triangleCount,
    meshBytes: acc.meshBytes + entry.meshBytes,
  }), {
    coverageCount: 0,
    polygonCount: 0,
    sourcePointCount: 0,
    renderPointCount: 0,
    triangleCount: 0,
    meshBytes: 0,
  });

  console.log(
    `Prebuilt GEO coverage written to ${TARGET_DIR.pathname} (${finalSummaryEntries.length} satellites, `
    + `${totals.coverageCount} coverages, ${totals.polygonCount} polygons, `
    + `${totals.renderPointCount} render points, ${totals.triangleCount} triangles, `
    + `${totals.meshBytes} mesh bytes).`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
