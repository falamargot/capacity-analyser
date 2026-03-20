import { readFile, writeFile } from 'node:fs/promises';

const SOURCE_PATH = new URL('../public/oneweb_regulatory_map.geojson', import.meta.url);
const TARGET_PATH = new URL('../public/oneweb_regulatory_overlay.geojson', import.meta.url);

const MIN_RING_AREA = 1e-4;
const MAX_RING_POINTS = 160;

const isFiniteCoordinate = (value) => typeof value === 'number' && Number.isFinite(value);
const arePointsEqual = (a, b) => a[0] === b[0] && a[1] === b[1];

const triangleAreaTwice = (a, b, c) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const removeCollinearPoints = (ring) => {
  if (ring.length <= 4) return ring;

  const closed = arePointsEqual(ring[0], ring[ring.length - 1]) ? ring : [...ring, ring[0]];
  const core = closed.slice(0, -1);
  const simplified = core.filter((point, index, arr) => {
    const prev = arr[(index - 1 + arr.length) % arr.length];
    const next = arr[(index + 1) % arr.length];
    return Math.abs(triangleAreaTwice(prev, point, next)) > 1e-10;
  });

  if (simplified.length < 3) return ring;
  return [...simplified, simplified[0]];
};

const downsampleRing = (ring) => {
  if (ring.length <= MAX_RING_POINTS) return ring;

  const closed = arePointsEqual(ring[0], ring[ring.length - 1]) ? ring : [...ring, ring[0]];
  const core = closed.slice(0, -1);
  const step = Math.ceil(core.length / (MAX_RING_POINTS - 1));
  const sampled = core.filter((_, index) => index % step === 0);

  if (!sampled.length || !arePointsEqual(sampled[0], core[core.length - 1])) {
    sampled.push(core[core.length - 1]);
  }

  return [...sampled, sampled[0]];
};

const normalizeRing = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return null;

  const normalized = [];
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const [lng, lat] = point;
    if (!isFiniteCoordinate(lng) || !isFiniteCoordinate(lat)) return null;
    normalized.push([lng, lat]);
  }

  const deduped = normalized.filter((point, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return prev[0] !== point[0] || prev[1] !== point[1];
  });

  if (deduped.length < 4) return null;

  const [firstLng, firstLat] = deduped[0];
  const [lastLng, lastLat] = deduped[deduped.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    deduped.push([firstLng, firstLat]);
  }

  const simplified = downsampleRing(removeCollinearPoints(deduped));
  if (simplified.length < 4) return null;

  const uniqueVertices = new Set(
    simplified
      .slice(0, -1)
      .map(([lng, lat]) => `${lng.toFixed(6)}:${lat.toFixed(6)}`),
  );

  if (uniqueVertices.size < 3) return null;

  let signedArea = 0;
  for (let i = 0; i < simplified.length - 1; i += 1) {
    const [x1, y1] = simplified[i];
    const [x2, y2] = simplified[i + 1];
    signedArea += (x1 * y2) - (x2 * y1);
  }

  if (Math.abs(signedArea) * 0.5 < MIN_RING_AREA) return null;
  return simplified;
};

const sanitizePolygonCoordinates = (polygon) => {
  if (!Array.isArray(polygon) || polygon.length === 0) return null;

  const [outerRing] = polygon;
  const normalizedOuter = normalizeRing(outerRing);
  if (!normalizedOuter) return null;
  return [normalizedOuter];
};

const simplifyFeatureGeometry = (geometry) => {
  if (!geometry) return null;

  if (geometry.type === 'Polygon') {
    const coordinates = sanitizePolygonCoordinates(geometry.coordinates);
    return coordinates ? { type: 'Polygon', coordinates } : null;
  }

  if (geometry.type === 'MultiPolygon') {
    const coordinates = geometry.coordinates
      .map(sanitizePolygonCoordinates)
      .filter((polygon) => polygon !== null);

    return coordinates.length ? { type: 'MultiPolygon', coordinates } : null;
  }

  return null;
};

const buildOverlayAsset = async () => {
  const raw = await readFile(SOURCE_PATH, 'utf8');
  const source = JSON.parse(raw);

  if (source?.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('Unexpected source GeoJSON structure.');
  }

  const features = source.features.flatMap((feature) => {
    const geometry = simplifyFeatureGeometry(feature?.geometry);
    if (!geometry) return [];

    return [{
      type: 'Feature',
      properties: {
        name: feature?.properties?.name ?? null,
        regulatory_status: feature?.properties?.regulatory_status ?? 'UNKNOWN',
      },
      geometry,
    }];
  });

  const overlayGeoJson = {
    type: 'FeatureCollection',
    features,
  };

  await writeFile(TARGET_PATH, JSON.stringify(overlayGeoJson));

  const sizeBytes = Buffer.byteLength(JSON.stringify(overlayGeoJson));
  console.log(
    `Regulatory overlay written to ${TARGET_PATH.pathname} with ${features.length} features (${(sizeBytes / 1024 / 1024).toFixed(2)} MB).`,
  );
};

buildOverlayAsset().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
