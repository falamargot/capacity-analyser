import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_PATH = resolve(ROOT, 'public/data/fill-rate/oneweb-leo-fillrate-grid.json');

const SOURCE_DATE = '2026-06';
const GENERATED_AT = '2026-06-12';
const MODEL_STEP_DEG = 1.75;
const MODEL_CELL_SIZE_DEG = 1.85;
const CALIBRATION_STEP_DEG = 1.75;
const CALIBRATION_CELL_SIZE_DEG = 0.85;
const DATA_MODE = 'calibrated_network_load_model';

const ellipses = [
  { name: 'north-america-west', lat: 42, lng: -121, latRadius: 15, lngRadius: 8, load: 54, weight: 1.0 },
  { name: 'north-america-central', lat: 38, lng: -96, latRadius: 10, lngRadius: 22, load: 70, weight: 1.0 },
  { name: 'north-america-east', lat: 35, lng: -82, latRadius: 9, lngRadius: 10, load: 62, weight: 0.82 },
  { name: 'mexico-central-america', lat: 19, lng: -98, latRadius: 8, lngRadius: 12, load: 64, weight: 0.9 },
  { name: 'caribbean', lat: 18, lng: -71, latRadius: 4, lngRadius: 10, load: 72, weight: 0.95 },

  { name: 'andes-north', lat: -6, lng: -78, latRadius: 15, lngRadius: 7, load: 66, weight: 0.95 },
  { name: 'south-america-east', lat: -24, lng: -52, latRadius: 11, lngRadius: 13, load: 50, weight: 0.65 },

  { name: 'western-europe', lat: 50, lng: 4, latRadius: 11, lngRadius: 17, load: 72, weight: 1.15 },
  { name: 'nordics-baltic', lat: 59, lng: 15, latRadius: 8, lngRadius: 15, load: 42, weight: 0.62 },
  { name: 'iberia-maghreb', lat: 38, lng: -4, latRadius: 8, lngRadius: 11, load: 58, weight: 0.78 },
  { name: 'italy-balkans', lat: 42, lng: 16, latRadius: 8, lngRadius: 12, load: 60, weight: 0.86 },
  { name: 'east-med', lat: 34, lng: 31, latRadius: 5, lngRadius: 7, load: 68, weight: 0.65 },
  { name: 'gulf', lat: 25, lng: 53, latRadius: 5, lngRadius: 7, load: 88, weight: 0.95 },

  { name: 'west-africa-coast', lat: 9, lng: -7, latRadius: 10, lngRadius: 14, load: 53, weight: 0.7 },
  { name: 'east-africa', lat: -9, lng: 37, latRadius: 12, lngRadius: 11, load: 44, weight: 0.56 },
  { name: 'madagascar-south-africa', lat: -24, lng: 42, latRadius: 10, lngRadius: 12, load: 46, weight: 0.72 },

  { name: 'central-asia', lat: 44, lng: 76, latRadius: 11, lngRadius: 19, load: 39, weight: 0.66 },
  { name: 'india-bay', lat: 22, lng: 84, latRadius: 10, lngRadius: 12, load: 52, weight: 0.68 },
  { name: 'south-east-asia', lat: 10, lng: 103, latRadius: 10, lngRadius: 14, load: 60, weight: 0.82 },
  { name: 'indonesia', lat: -4, lng: 112, latRadius: 10, lngRadius: 18, load: 62, weight: 0.8 },
  { name: 'australia-east', lat: -31, lng: 148, latRadius: 9, lngRadius: 13, load: 48, weight: 0.64 },
  { name: 'australia-west', lat: -27, lng: 120, latRadius: 10, lngRadius: 10, load: 34, weight: 0.42 },
  { name: 'new-zealand', lat: -40, lng: 174, latRadius: 5, lngRadius: 7, load: 58, weight: 0.75 },
];

const corridors = [
  { name: 'pacific-americas', points: [[58, -136], [48, -124], [35, -116], [23, -103], [14, -88], [3, -78], [-12, -76], [-31, -58]], width: 2.8, load: 58, weight: 0.9 },
  { name: 'us-transit', points: [[44, -109], [42, -96], [39, -87], [33, -81]], width: 3.1, load: 74, weight: 1.0 },
  { name: 'caribbean-arc', points: [[22, -81], [19, -73], [18, -66], [13, -61]], width: 2.2, load: 70, weight: 0.86 },
  { name: 'europe-gulf', points: [[60, -5], [53, 6], [48, 12], [42, 19], [34, 32], [29, 48], [24, 56]], width: 2.2, load: 70, weight: 0.65 },
  { name: 'north-africa-med', points: [[36, -7], [37, 7], [35, 21], [31, 34]], width: 1.8, load: 48, weight: 0.4 },
  { name: 'west-africa-littoral', points: [[16, -18], [10, -14], [5, -5], [5, 4], [0, 10]], width: 2.6, load: 56, weight: 0.72 },
  { name: 'east-africa-madagascar', points: [[-2, 37], [-11, 40], [-19, 45], [-25, 47], [-30, 34]], width: 2.7, load: 44, weight: 0.72 },
  { name: 'central-asia-ribbon', points: [[53, 72], [47, 84], [40, 75], [34, 78], [26, 82]], width: 3.2, load: 42, weight: 0.68 },
  { name: 'se-asia-archipelago', points: [[22, 88], [15, 100], [7, 102], [1, 106], [-7, 112], [-13, 122]], width: 3.1, load: 61, weight: 0.9 },
  { name: 'australasia', points: [[-32, 116], [-27, 153], [-37, 145], [-41, 174]], width: 2.7, load: 48, weight: 0.68 },
];

const hotspots = [
  { lat: 50.5, lng: 9, radius: 5, delta: 12 },
  { lat: 25, lng: 54, radius: 5, delta: 10 },
  { lat: -23, lng: 46, radius: 5, delta: 4 },
  { lat: 18, lng: -66, radius: 4, delta: 9 },
  { lat: -12, lng: -76, radius: 5, delta: 10 },
  { lat: 40, lng: -91, radius: 7, delta: 8 },
  { lat: 31, lng: 45, radius: 5, delta: 8 },
];

const visualReferenceFields = [
  { name: 'alaska-pacific-nw-reference', lat: 55, lng: -131, latRadius: 6, lngRadius: 13, load: 28, weight: 0.75 },
  { name: 'canada-west-reference', lat: 50, lng: -111, latRadius: 10, lngRadius: 20, load: 34, weight: 0.75 },
  { name: 'us-west-reference', lat: 38, lng: -119, latRadius: 11, lngRadius: 12, load: 38, weight: 0.85 },
  { name: 'us-central-reference', lat: 36, lng: -96, latRadius: 10, lngRadius: 21, load: 58, weight: 1.0 },
  { name: 'us-east-reference', lat: 39, lng: -78, latRadius: 8, lngRadius: 14, load: 36, weight: 0.82 },
  { name: 'mexico-reference', lat: 21, lng: -101, latRadius: 9, lngRadius: 13, load: 40, weight: 0.84 },
  { name: 'central-america-reference', lat: 12, lng: -83, latRadius: 5, lngRadius: 15, load: 44, weight: 0.8 },
  { name: 'caribbean-reference', lat: 18, lng: -71, latRadius: 5, lngRadius: 12, load: 42, weight: 0.72 },

  { name: 'andes-reference', lat: -10, lng: -76, latRadius: 18, lngRadius: 7, load: 38, weight: 0.9 },
  { name: 'northern-south-america-reference', lat: 5, lng: -64, latRadius: 7, lngRadius: 17, load: 42, weight: 0.7 },
  { name: 'brazil-east-reference', lat: -18, lng: -49, latRadius: 15, lngRadius: 16, load: 31, weight: 0.78 },
  { name: 'brazil-south-reference', lat: -31, lng: -52, latRadius: 7, lngRadius: 12, load: 45, weight: 0.68 },

  { name: 'transatlantic-reference', lat: 43, lng: -39, latRadius: 5, lngRadius: 24, load: 39, weight: 0.28 },
  { name: 'north-atlantic-reference', lat: 57, lng: -31, latRadius: 6, lngRadius: 17, load: 28, weight: 0.28 },
  { name: 'uk-north-sea-reference', lat: 55, lng: 0, latRadius: 8, lngRadius: 17, load: 30, weight: 1.05 },
  { name: 'western-europe-reference', lat: 49, lng: 4, latRadius: 10, lngRadius: 18, load: 36, weight: 1.18 },
  { name: 'central-europe-reference', lat: 48, lng: 16, latRadius: 8, lngRadius: 15, load: 34, weight: 1.08 },
  { name: 'iberia-reference', lat: 40, lng: -4, latRadius: 7, lngRadius: 10, load: 37, weight: 0.74 },
  { name: 'italy-balkans-reference', lat: 42, lng: 18, latRadius: 7, lngRadius: 13, load: 41, weight: 0.82 },
  { name: 'north-africa-reference', lat: 30, lng: 14, latRadius: 5, lngRadius: 10, load: 26, weight: 0.32 },
  { name: 'sahel-chad-sudan-reference', lat: 14, lng: 25, latRadius: 4, lngRadius: 11, load: 22, weight: 0.24 },
  { name: 'turkey-east-med-reference', lat: 37, lng: 33, latRadius: 4, lngRadius: 8, load: 58, weight: 0.55 },
  { name: 'gulf-reference', lat: 24, lng: 53, latRadius: 4, lngRadius: 7, load: 78, weight: 0.85 },

  { name: 'west-africa-reference', lat: 8, lng: -9, latRadius: 9, lngRadius: 12, load: 38, weight: 0.48 },
  { name: 'gulf-guinea-reference', lat: 5, lng: 2, latRadius: 5, lngRadius: 12, load: 40, weight: 0.42 },
  { name: 'east-africa-reference', lat: -7, lng: 38, latRadius: 11, lngRadius: 7, load: 31, weight: 0.42 },
  { name: 'southern-africa-reference', lat: -24, lng: 27, latRadius: 11, lngRadius: 13, load: 38, weight: 0.58 },
  { name: 'madagascar-reference', lat: -21, lng: 46, latRadius: 8, lngRadius: 7, load: 38, weight: 0.62 },

  { name: 'central-asia-reference', lat: 46, lng: 72, latRadius: 9, lngRadius: 21, load: 31, weight: 0.86 },
  { name: 'india-reference', lat: 22, lng: 79, latRadius: 9, lngRadius: 12, load: 34, weight: 0.68 },
  { name: 'bay-bengal-reference', lat: 15, lng: 92, latRadius: 8, lngRadius: 12, load: 40, weight: 0.66 },
  { name: 'south-east-asia-reference', lat: 7, lng: 104, latRadius: 11, lngRadius: 16, load: 44, weight: 0.82 },
  { name: 'indonesia-reference', lat: -5, lng: 115, latRadius: 9, lngRadius: 17, load: 46, weight: 0.76 },
  { name: 'australia-reference', lat: -31, lng: 138, latRadius: 13, lngRadius: 29, load: 44, weight: 0.84 },
];

const visualReferenceCorridors = [
  { name: 'pacific-coast-reference', points: [[58, -137], [48, -126], [36, -121], [24, -109], [15, -91], [6, -80], [-12, -77], [-24, -70]], width: 2.4, load: 34, weight: 0.92 },
  { name: 'canada-us-band-reference', points: [[45, -128], [43, -112], [40, -98], [38, -84], [44, -68]], width: 3.2, load: 42, weight: 0.82 },
  { name: 'us-south-central-reference', points: [[31, -110], [33, -99], [34, -88], [32, -79]], width: 3.4, load: 62, weight: 0.72 },
  { name: 'central-america-caribbean-reference', points: [[22, -106], [18, -95], [12, -84], [9, -79], [7, -65]], width: 2.9, load: 43, weight: 0.78 },
  { name: 'northern-south-america-arc-reference', points: [[9, -80], [7, -72], [7, -61], [2, -52]], width: 2.8, load: 45, weight: 0.74 },
  { name: 'andes-reference', points: [[9, -78], [-5, -78], [-16, -72], [-26, -66], [-36, -60]], width: 2.8, load: 38, weight: 0.88 },
  { name: 'brazil-argentina-reference', points: [[-12, -48], [-20, -47], [-28, -54], [-35, -58]], width: 3.1, load: 36, weight: 0.72 },
  { name: 'transatlantic-reference', points: [[45, -70], [43, -56], [42, -42], [43, -28], [45, -14], [48, -5]], width: 2.55, load: 46, weight: 1.28 },
  { name: 'north-atlantic-reference', points: [[61, -51], [55, -35], [52, -20], [51, -6], [53, 8]], width: 2.15, load: 29, weight: 1.12 },
  { name: 'europe-reference', points: [[59, -4], [55, 4], [51, 10], [47, 16], [44, 24], [39, 31]], width: 3.5, load: 34, weight: 1.12 },
  { name: 'mediterranean-reference', points: [[36, -7], [38, 7], [37, 20], [37, 32], [33, 45]], width: 2.4, load: 52, weight: 0.66 },
  { name: 'gulf-reference', points: [[31, 36], [27, 45], [24, 54], [21, 63], [17, 72]], width: 2.2, load: 68, weight: 0.65 },
  { name: 'sahel-chad-sudan-reference', points: [[12, 5], [13, 16], [14, 28], [12, 39]], width: 1.6, load: 20, weight: 0.16 },
  { name: 'west-africa-reference', points: [[15, -18], [9, -14], [5, -5], [4, 5], [0, 13]], width: 2.7, load: 40, weight: 0.55 },
  { name: 'africa-east-south-reference', points: [[7, 32], [-5, 37], [-18, 31], [-29, 25], [-34, 18]], width: 2.55, load: 34, weight: 0.5 },
  { name: 'madagascar-mozambique-reference', points: [[-12, 40], [-20, 45], [-27, 47], [-34, 33]], width: 2.4, load: 34, weight: 0.46 },
  { name: 'central-asia-reference', points: [[54, 60], [50, 72], [45, 84], [40, 72], [35, 83]], width: 3.2, load: 33, weight: 0.84 },
  { name: 'india-sea-reference', points: [[23, 72], [18, 84], [13, 94], [7, 101], [1, 107], [-7, 115]], width: 3.0, load: 39, weight: 0.74 },
  { name: 'south-east-asia-reference', points: [[18, 99], [10, 104], [2, 109], [-5, 116], [-12, 125]], width: 3.2, load: 42, weight: 0.82 },
  { name: 'australia-nz-reference', points: [[-38, 116], [-33, 133], [-29, 153], [-38, 166], [-41, 174]], width: 3.6, load: 44, weight: 0.86 },
  { name: 'taiwan-south-africa-reference', points: [[22, 121], [10, 108], [2, 96], [-6, 76], [-15, 55], [-25, 35], [-34, 18]], width: 3.0, load: 66, weight: 1.15 },
];

const mobilityCorridors = [
  // Maritime corridors: broad, low-to-medium uplift for shipping demand.
  { name: 'maritime-north-atlantic', points: [[50, -74], [47, -52], [49, -30], [52, -8]], width: 5.2, load: 42, weight: 0.62 },
  { name: 'maritime-mediterranean', points: [[36, -6], [37, 5], [36, 15], [35, 25], [32, 33]], width: 4.2, load: 50, weight: 0.78 },
  { name: 'maritime-suez-red-sea-gulf-aden', points: [[31, 32], [27, 34], [21, 38], [15, 42], [12, 45], [13, 50]], width: 3.8, load: 58, weight: 0.86 },
  { name: 'maritime-arabian-gulf', points: [[25, 48], [26, 52], [25, 56]], width: 3.2, load: 70, weight: 0.72 },
  { name: 'maritime-indian-ocean-east-west', points: [[12, 45], [10, 60], [7, 74], [5, 90], [3, 103]], width: 5.4, load: 42, weight: 0.58 },
  { name: 'maritime-taiwan-south-africa', points: [[22, 121], [10, 108], [2, 96], [-6, 76], [-15, 55], [-25, 35], [-34, 18]], width: 4.6, load: 80, weight: 1.3 },
  { name: 'maritime-malacca', points: [[6, 95], [3, 101], [1, 104], [1, 109]], width: 3.2, load: 60, weight: 0.90 },
  { name: 'maritime-east-asia-coastal', points: [[20, 111], [25, 120], [31, 124], [35, 129], [38, 139]], width: 4.8, load: 52, weight: 0.90 },

  // Aviation corridors: wider and smoother than maritime paths to avoid line artifacts.
  { name: 'aviation-north-atlantic', points: [[40, -74], [47, -55], [52, -30], [53, -8]], width: 7.0, load: 44, weight: 0.50 },
  { name: 'aviation-europe-middle-east', points: [[51, 0], [46, 12], [40, 26], [32, 44], [25, 55]], width: 6.2, load: 52, weight: 0.56 },
  { name: 'aviation-middle-east-india', points: [[25, 55], [23, 64], [22, 73], [20, 78]], width: 5.4, load: 48, weight: 0.54 },
  { name: 'aviation-middle-east-southeast-asia', points: [[25, 55], [20, 68], [14, 82], [8, 96], [3, 104]], width: 5.8, load: 46, weight: 0.52 },
  { name: 'aviation-japan-korea-north-america', points: [[36, 140], [45, 165], [51, -165], [51, -140], [48, -122]], width: 7.8, load: 46, weight: 0.64 },
  { name: 'aviation-australia-southeast-asia', points: [[-34, 151], [-25, 138], [-15, 125], [-5, 116], [3, 104]], width: 6.0, load: 44, weight: 0.52 },
];

const visualReferenceHotspots = [
  { lat: 39, lng: -96, radius: 7, delta: 18 },
  { lat: 32, lng: -84, radius: 5, delta: 14 },
  { lat: 9, lng: -79, radius: 4, delta: 18 },
  { lat: -6, lng: -79, radius: 4, delta: 14 },
  { lat: -14, lng: -55, radius: 6, delta: 13 },
  { lat: 36, lng: 31, radius: 5, delta: 28 },
  { lat: 24, lng: 55, radius: 5, delta: 24 },
  { lat: 12, lng: -16, radius: 5, delta: 15 },
  { lat: -25, lng: 46, radius: 5, delta: 4 },
  { lat: -35, lng: 171, radius: 5, delta: 28 },
  { lat: -41, lng: 174, radius: 5, delta: 24 },
];

const visualReferenceAnchors = [
  { lat: -30, lng: 32.5, fillRatePct: 45, sampleCount: 210 },
  { lat: -21.25, lng: 57, fillRatePct: 39, sampleCount: 170 },
  { lat: -25, lng: 70.5, fillRatePct: 42, sampleCount: 180 },
  { lat: -32.5, lng: 88, fillRatePct: 57, sampleCount: 210 },
  { lat: -35, lng: 103, fillRatePct: 47, sampleCount: 190 },
  { lat: -37.5, lng: 115.5, fillRatePct: 49, sampleCount: 200 },
  { lat: -41.25, lng: 174.25, fillRatePct: 78, sampleCount: 260 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeLng(lng) {
  let normalized = lng;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function noise(lat, lng, salt = 0) {
  const s = Math.sin((lat + salt * 13.7) * 12.9898 + (lng - salt * 5.3) * 78.233) * 43758.5453;
  return ((s % 1) + 1) % 1;
}

function hashUnit(x, y, salt = 0) {
  const s = Math.sin((x + salt * 19.19) * 127.1 + (y - salt * 7.17) * 311.7) * 43758.5453123;
  return ((s % 1) + 1) % 1;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function smoothValueNoise(lat, lng, scaleDeg, salt = 0) {
  const x = normalizeLng(lng) / scaleDeg;
  const y = lat / scaleDeg;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = hashUnit(x0, y0, salt);
  const v10 = hashUnit(x0 + 1, y0, salt);
  const v01 = hashUnit(x0, y0 + 1, salt);
  const v11 = hashUnit(x0 + 1, y0 + 1, salt);
  const vx0 = v00 + (v10 - v00) * tx;
  const vx1 = v01 + (v11 - v01) * tx;
  return vx0 + (vx1 - vx0) * ty;
}

function correlatedPresence(lat, lng) {
  return (
    smoothValueNoise(lat, lng, 6.5, 41) * 0.58 +
    smoothValueNoise(lat, lng, 12.5, 43) * 0.32 +
    smoothValueNoise(lat, lng, 3.8, 47) * 0.10
  );
}

function ellipseInfluence(field, lat, lng) {
  const dx = (normalizeLng(lng - field.lng) * Math.cos((lat * Math.PI) / 180)) / field.lngRadius;
  const dy = (lat - field.lat) / field.latRadius;
  return Math.exp(-(dx * dx + dy * dy)) * field.weight;
}

function distancePointToSegment(p, a, b) {
  const midLat = ((a[0] + b[0]) / 2) * Math.PI / 180;
  const lngScale = Math.max(0.35, Math.cos(midLat));
  const px = normalizeLng(p[1] - a[1]) * lngScale;
  const py = p[0] - a[0];
  const bx = normalizeLng(b[1] - a[1]) * lngScale;
  const by = b[0] - a[0];
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);
  const t = clamp((px * bx + py * by) / lenSq, 0, 1);
  return Math.hypot(px - bx * t, py - by * t);
}

function corridorInfluence(corridor, lat, lng) {
  let bestDistance = Infinity;
  for (let i = 1; i < corridor.points.length; i += 1) {
    bestDistance = Math.min(
      bestDistance,
      distancePointToSegment([lat, lng], corridor.points[i - 1], corridor.points[i]),
    );
  }
  return Math.exp(-((bestDistance / corridor.width) ** 2)) * corridor.weight;
}

function hotspotDelta(lat, lng) {
  return hotspots.reduce((sum, spot) => {
    const dx = normalizeLng(lng - spot.lng) * Math.cos((lat * Math.PI) / 180);
    const dy = lat - spot.lat;
    const influence = Math.exp(-((dx * dx + dy * dy) / (spot.radius * spot.radius)));
    return sum + influence * spot.delta;
  }, 0);
}

function visualReferenceHotspotDelta(lat, lng) {
  return visualReferenceHotspots.reduce((sum, spot) => {
    const dx = normalizeLng(lng - spot.lng) * Math.cos((lat * Math.PI) / 180);
    const dy = lat - spot.lat;
    const influence = Math.exp(-((dx * dx + dy * dy) / (spot.radius * spot.radius)));
    return sum + influence * spot.delta;
  }, 0);
}

function cellKey(cell) {
  return `${cell.lat.toFixed(2)}:${cell.lng.toFixed(2)}`;
}

function distanceDeg(left, right) {
  const dLat = right.lat - left.lat;
  const dLng = normalizeLng(right.lng - left.lng) * Math.cos((left.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function isCentralAfrica(lat, lng) {
  return lat >= -10 && lat <= 16 && lng >= 8 && lng <= 32;
}

function isRemoteOpenOcean(lat, lng) {
  return (
    (lat >= -35 && lat <= 18 && lng >= -58 && lng <= -18) ||
    (lat >= -38 && lat <= 6 && lng >= 54 && lng <= 98) ||
    (lat >= -25 && lat <= 18 && lng >= -170 && lng <= -125)
  );
}

function evaluateCell(lat, lng) {
  const influences = [];

  for (const field of ellipses) {
    const influence = ellipseInfluence(field, lat, lng);
    if (influence > 0.035) influences.push({ influence, load: field.load });
  }

  for (const corridor of corridors) {
    const influence = corridorInfluence(corridor, lat, lng);
    if (influence > 0.035) influences.push({ influence, load: corridor.load });
  }

  const score = influences.reduce((sum, item) => sum + item.influence, 0);
  if (score < 0.22) return null;

  const presence = clamp(0.18 + score * 0.38, 0.22, 0.96);
  if (noise(lat, lng, 4) > presence) return null;

  const weightedLoad = influences.reduce((sum, item) => sum + item.influence * item.load, 0) / score;
  const localVariation = (noise(lat, lng, 8) - 0.5) * 18;
  const fineVariation = (noise(lat * 1.7, lng * 0.8, 11) - 0.5) * 8;
  const fillRatePct = Math.round(clamp(weightedLoad + hotspotDelta(lat, lng) + localVariation + fineVariation, 6, 98));
  const sampleCount = Math.round(clamp(70 + score * 95 + noise(lat, lng, 15) * 90, 45, 420));

  return {
    lat: round(lat),
    lng: round(normalizeLng(lng)),
    sizeDeg: MODEL_CELL_SIZE_DEG,
    fillRatePct,
    percentile: 'P95',
    statistic: 'P95_5MIN_AVG',
    windowMinutes: 5,
    sampleCount,
    source: 'calibratedDemo',
    dataMode: DATA_MODE,
    sourceDate: SOURCE_DATE,
  };
}

function evaluateVisualReferenceCell(lat, lng) {
  const fieldInfluences = [];
  const corridorInfluences = [];

  for (const field of visualReferenceFields) {
    const influence = ellipseInfluence(field, lat, lng);
    if (influence > 0.035) fieldInfluences.push({ influence, load: field.load });
  }

  for (const corridor of visualReferenceCorridors) {
    const influence = corridorInfluence(corridor, lat, lng);
    if (influence > 0.035) corridorInfluences.push({ influence, load: corridor.load });
  }

  const influences = [...fieldInfluences, ...corridorInfluences];
  const score = influences.reduce((sum, item) => sum + item.influence, 0);
  const corridorScore = corridorInfluences.reduce((sum, item) => sum + item.influence, 0);
  const fieldScore = fieldInfluences.reduce((sum, item) => sum + item.influence, 0);
  if (score < 0.24) return null;

  let presence = clamp(0.07 + fieldScore * 0.16 + corridorScore * 0.39, 0.08, 0.64);
  if (corridorScore > 0.55) presence = Math.max(presence, 0.5);
  if (isCentralAfrica(lat, lng)) presence *= 0.34;
  if (isRemoteOpenOcean(lat, lng) && corridorScore < 0.48) presence *= 0.28;
  const patchGate = correlatedPresence(lat, lng) * 0.88 + noise(lat, lng, 24) * 0.12;
  if (patchGate < 1 - presence) return null;

  const weightedLoad = influences.reduce((sum, item) => sum + item.influence * item.load, 0) / score;
  const localVariation = (smoothValueNoise(lat, lng, 5.6, 61) - 0.5) * 13;
  const fineVariation = (smoothValueNoise(lat, lng, 3.2, 67) - 0.5) * 5;
  const regionAdjustment = isCentralAfrica(lat, lng)
    ? -8
    : lat >= 35 && lat <= 62 && lng >= -12 && lng <= 35
      ? -5
      : 0;
  const fillRatePct = Math.round(clamp(
    weightedLoad + visualReferenceHotspotDelta(lat, lng) + localVariation + fineVariation + regionAdjustment,
    6,
    98,
  ));
  const sampleCount = Math.round(clamp(80 + score * 105 + noise(lat, lng, 35) * 110, 45, 520));

  return {
    lat: round(lat),
    lng: round(normalizeLng(lng)),
    sizeDeg: CALIBRATION_CELL_SIZE_DEG,
    fillRatePct,
    percentile: 'P95',
    statistic: 'P95_5MIN_AVG',
    windowMinutes: 5,
    sampleCount,
    source: 'calibratedDemo',
    dataMode: DATA_MODE,
    sourceDate: SOURCE_DATE,
    _score: score,
    _corridorScore: corridorScore,
    _patchGate: patchGate,
  };
}

function stripInternalCellFields(cell) {
  const { _score, _corridorScore, _patchGate, _anchor, _calibrationAnchor, ...publicCell } = cell;
  return publicCell;
}

function countNearbyCompanions(cell, cells, radiusDeg) {
  return cells.filter((other) => {
    if (other === cell) return false;
    const dLat = other.lat - cell.lat;
    const dLng = normalizeLng(other.lng - cell.lng) * Math.cos((cell.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLng) <= radiusDeg;
  }).length;
}

function referencePriorAt(lat, lng) {
  const influences = [];
  let corridorScore = 0;
  let fieldScore = 0;

  for (const field of visualReferenceFields) {
    const influence = ellipseInfluence(field, lat, lng);
    if (influence > 0.012) {
      fieldScore += influence;
      influences.push({ influence, load: field.load });
    }
  }

  for (const corridor of visualReferenceCorridors) {
    const influence = corridorInfluence(corridor, lat, lng);
    if (influence > 0.012) {
      corridorScore += influence;
      influences.push({ influence, load: corridor.load });
    }
  }

  const score = influences.reduce((sum, item) => sum + item.influence, 0);
  if (score <= 0) return null;

  const weightedLoad = influences.reduce((sum, item) => sum + item.influence * item.load, 0) / score;
  const regionAdjustment = isCentralAfrica(lat, lng)
    ? -8
    : lat >= 35 && lat <= 62 && lng >= -12 && lng <= 35
      ? -5
      : 0;
  const load = clamp(
    weightedLoad + visualReferenceHotspotDelta(lat, lng) + regionAdjustment,
    5,
    98,
  );

  return {
    load,
    support: clamp(0.18 + fieldScore * 0.24 + corridorScore * 0.62, 0, 0.88),
    corridorScore,
    fieldScore,
  };
}

function regionalPriorAt(lat, lng) {
  const influences = [];

  for (const field of ellipses) {
    const influence = ellipseInfluence(field, lat, lng);
    if (influence > 0.018) influences.push({ influence, load: field.load });
  }

  for (const corridor of corridors) {
    const influence = corridorInfluence(corridor, lat, lng);
    if (influence > 0.018) influences.push({ influence, load: corridor.load });
  }

  const score = influences.reduce((sum, item) => sum + item.influence, 0);
  if (score <= 0) return null;

  const weightedLoad = influences.reduce((sum, item) => sum + item.influence * item.load, 0) / score;
  return {
    load: clamp(weightedLoad + hotspotDelta(lat, lng), 5, 98),
    support: clamp(score * 0.24, 0, 0.44),
  };
}

function mobilityPriorAt(lat, lng) {
  const influences = [];

  for (const corridor of mobilityCorridors) {
    const influence = corridorInfluence(corridor, lat, lng);
    if (influence > 0.018) influences.push({ influence, load: corridor.load });
  }

  const score = influences.reduce((sum, item) => sum + item.influence, 0);
  if (score <= 0) return null;

  const weightedLoad = influences.reduce((sum, item) => sum + item.influence * item.load, 0) / score;
  return {
    load: clamp(weightedLoad, 5, 86),
    support: clamp(score * 0.28, 0, 0.62),
  };
}

function fallbackNetworkLoadPct(lat, lng) {
  const remoteOcean = isRemoteOpenOcean(lat, lng);
  const centralAfrica = isCentralAfrica(lat, lng);
  const polar = Math.abs(lat) > 68;
  const baseline = remoteOcean
    ? 7
    : centralAfrica
      ? 16
      : polar
        ? 14
        : 22;
  const variation = (smoothValueNoise(lat, lng, 18, 83) - 0.5) * 8;
  return clamp(baseline + variation, 3, 34);
}

function interpolateFromCalibration(lat, lng, calibrationCells, priorSupport) {
  let weightedLoad = 0;
  let weightSum = 0;
  let nearestDistance = Infinity;
  let nearestLoad = null;

  const continuityRadius = 9 + priorSupport * 16;
  const maxDistance = 18 + priorSupport * 24;

  for (const cell of calibrationCells) {
    const distance = distanceDeg({ lat, lng }, cell);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestLoad = cell.fillRatePct;
    }

    if (distance <= 0.65) {
      return {
        load: cell.fillRatePct,
        confidence: 1,
        nearestDistance: distance,
      };
    }

    if (distance > maxDistance) continue;

    const anchorStrength = 0.9 + (cell._corridorScore ?? 0) * 0.45 + (cell._score ?? 0) * 0.10;
    const weight = Math.exp(-((distance / continuityRadius) ** 2))
      * anchorStrength
      / (Math.max(0.85, distance) ** 1.18);

    weightedLoad += cell.fillRatePct * weight;
    weightSum += weight;
  }

  if (weightSum <= 0 || nearestLoad == null) {
    return {
      load: null,
      confidence: 0,
      nearestDistance,
    };
  }

  const confidence = clamp(weightSum * (2.4 + priorSupport * 1.8), 0, 0.96);
  return {
    load: weightedLoad / weightSum,
    confidence,
    nearestDistance,
  };
}

function estimateNetworkLoadAt(lat, lng, calibrationCells) {
  const referencePrior = referencePriorAt(lat, lng);
  const regionalPrior = regionalPriorAt(lat, lng);
  const mobilityPrior = mobilityPriorAt(lat, lng);
  const priorSupport = Math.max(
    referencePrior?.support ?? 0,
    regionalPrior?.support ?? 0,
    mobilityPrior?.support ?? 0,
  );
  const calibration = interpolateFromCalibration(lat, lng, calibrationCells, priorSupport);
  const fallback = fallbackNetworkLoadPct(lat, lng);

  const referenceBlend = referencePrior
    ? clamp(referencePrior.support, 0, 0.72)
    : 0;
  const regionalBlend = !referencePrior && regionalPrior
    ? clamp(regionalPrior.support, 0, 0.38)
    : 0;
  const mobilityBlend = mobilityPrior
    ? clamp(mobilityPrior.support, 0, referencePrior ? 0.3 : 0.62)
    : 0;

  let inferred = fallback;
  if (regionalPrior) {
    inferred = inferred * (1 - regionalBlend) + regionalPrior.load * regionalBlend;
  }
  if (mobilityPrior) {
    inferred = inferred * (1 - mobilityBlend) + mobilityPrior.load * mobilityBlend;
  }
  if (referencePrior) {
    inferred = inferred * (1 - referenceBlend) + referencePrior.load * referenceBlend;
  }

  const calibrationConfidence = calibration.confidence;
  const localVariation = (smoothValueNoise(lat, lng, 8.5, 89) - 0.5) * 7 * (1 - calibrationConfidence);
  const load = calibration.load == null
    ? inferred + localVariation
    : calibration.load * calibrationConfidence + inferred * (1 - calibrationConfidence) + localVariation;

  return {
    fillRatePct: Math.round(clamp(load, 3, 98)),
    confidence: calibrationConfidence,
    sampleCount: Math.round(clamp(70 + calibrationConfidence * 430 + priorSupport * 130, 50, 650)),
  };
}

function buildCalibrationCells() {
  const cellsByKey = new Map();

  function mergeCell(cell) {
    const key = cellKey(cell);
    const existingCell = cellsByKey.get(key);
    if (!existingCell || cell.fillRatePct > existingCell.fillRatePct) {
      cellsByKey.set(key, existingCell ? {
        ...existingCell,
        fillRatePct: cell.fillRatePct,
        sampleCount: Math.max(existingCell.sampleCount ?? 0, cell.sampleCount ?? 0),
        dataMode: DATA_MODE,
        sourceDate: SOURCE_DATE,
        _score: Math.max(existingCell._score ?? 0, cell._score ?? 0),
        _corridorScore: Math.max(existingCell._corridorScore ?? 0, cell._corridorScore ?? 0),
        _patchGate: Math.max(existingCell._patchGate ?? 0, cell._patchGate ?? 0),
        _anchor: existingCell._anchor || cell._anchor,
      } : cell);
    }
  }

  for (let lat = -53.6; lat <= 72; lat += CALIBRATION_STEP_DEG) {
    for (let lng = -179.2; lng <= 179.2; lng += CALIBRATION_STEP_DEG) {
      const referenceCell = evaluateVisualReferenceCell(lat, lng);
      if (!referenceCell) continue;
      mergeCell({
        ...referenceCell,
        _calibrationAnchor: true,
      });
    }
  }

  for (const anchor of visualReferenceAnchors) {
    mergeCell({
      lat: round(anchor.lat),
      lng: round(normalizeLng(anchor.lng)),
      sizeDeg: CALIBRATION_CELL_SIZE_DEG,
      fillRatePct: anchor.fillRatePct,
      percentile: 'P95',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sampleCount: anchor.sampleCount,
      source: 'calibratedDemo',
      dataMode: DATA_MODE,
      sourceDate: SOURCE_DATE,
      _score: 1,
      _corridorScore: 1,
      _patchGate: 1,
      _anchor: true,
      _calibrationAnchor: true,
    });
  }

  const cells = [...cellsByKey.values()];
  const pruned = cells.filter((cell) => {
    if (cell._anchor) return true;

    const immediateNeighbors = countNearbyCompanions(cell, cells, 2.65);
    const patchNeighbors = countNearbyCompanions(cell, cells, 4.35);
    const corridorSupported = (cell._corridorScore ?? 0) >= 0.44 && patchNeighbors >= 1;
    const strongPatch = (cell._patchGate ?? 0) >= 0.72 && patchNeighbors >= 2;

    return immediateNeighbors >= 1 || patchNeighbors >= 3 || corridorSupported || strongPatch;
  });

  return pruned.sort((a, b) => {
    if (a.lng !== b.lng) return a.lng - b.lng;
    return b.lat - a.lat;
  });
}

function generateCells() {
  const calibrationCells = buildCalibrationCells();
  const modelCells = [];

  for (let lat = -89.125; lat <= 89.125; lat += MODEL_STEP_DEG) {
    for (let lng = -179.125; lng <= 179.125; lng += MODEL_STEP_DEG) {
      const estimate = estimateNetworkLoadAt(lat, lng, calibrationCells);
      modelCells.push({
        lat: round(lat),
        lng: round(normalizeLng(lng)),
        sizeDeg: MODEL_CELL_SIZE_DEG,
        fillRatePct: estimate.fillRatePct,
        percentile: 'P95',
        statistic: 'P95_5MIN_AVG',
        windowMinutes: 5,
        sampleCount: estimate.sampleCount,
        source: 'calibratedDemo',
        dataMode: DATA_MODE,
        sourceDate: SOURCE_DATE,
      });
    }
  }

  return [
    ...modelCells,
    ...calibrationCells.map((cell) => ({
      ...stripInternalCellFields(cell),
      dataMode: DATA_MODE,
    })),
  ];
}

const dataset = {
  metadata: {
    id: 'oneweb-leo-network-load-calibrated-v6',
    label: 'OneWeb LEO network load grid',
    constellation: 'ONEWEB_LEO',
    statistic: 'P95_5MIN_AVG',
    windowMinutes: 5,
    source: 'calibratedDemo',
    dataMode: DATA_MODE,
    sourceDate: SOURCE_DATE,
    generatedAt: GENERATED_AT,
    description: 'Global Network Load model calibrated to converge toward the OneWeb fill-rate reference wherever calibration cells exist. Not operational telemetry.',
  },
  cells: generateCells(),
};

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(`[network-load] wrote ${dataset.cells.length} cells to ${OUT_PATH}`);
