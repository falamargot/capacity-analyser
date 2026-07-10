/**
 * leoGroundSegment.ts — LEO ground-segment domain model (LEO audit L-O1, Lot 3).
 *
 * Single owner of the OneWeb-like ground segment entities:
 *   - SnpSite            — Satellite Network Portal (gateway) site
 *   - LogicalPoP         — internet exchange / backbone interconnect node
 *   - LeoFeederLink      — an SNP↔satellite Ka feeder relationship at an instant
 *   - LeoServingAssignment — the (satellite, beam, feeder) tuple the resolver
 *     selected for an analysis point, carried through the evidence pipeline so
 *     every surface names the same objects by construction
 *
 * Before this module the SNP catalog lived in the globe UI config
 * (components/globe/GlobeConfig.ts) and the PoP catalog inside the S2S model —
 * the network domain imported its ground segment from the UI. GlobeConfig and
 * leoSiteToSiteModel now RE-EXPORT from here; existing import sites are
 * unaffected and behavior is identical (no overrides are set).
 *
 * No Cesium or React imports — pure data + geometry helpers.
 *
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — site positions are public-map-level
 * approximations of the OneWeb SNP network; PoPs are representative internet
 * exchange cities, not OneWeb's proprietary backbone topology.
 */

import { haversineDistanceKm } from '../utils/earthGeometry';

// ─── SNP (gateway) sites ─────────────────────────────────────────────────────

export interface SnpSite {
  /** Stable kebab-case identifier (never display this; use `name`). */
  id: string;
  /** Display name — identical to the pre-Lot-3 SNPData.name values. */
  name: string;
  lat: number;
  lng: number;
  region: string;
  status: 'active';
  /**
   * Curated one-way SNP→PoP fiber latency override (ms). When absent, the
   * PoP-distance model (snpPopFiberOneWayMs) applies. No overrides are set
   * today — the field exists so measured values can be curated per site
   * without touching the model.
   */
  popFiberOneWayMsOverride?: number;
}

const site = (id: string, name: string, lat: number, lng: number, region: string): SnpSite =>
  ({ id, name, lat, lng, region, status: 'active' });

export const SNP_SITES: SnpSite[] = [
  // AMERICAS (11 sites)
  site('anchorage', 'Anchorage', 61.21, -149.89, 'Americas'),
  site('fairbanks', 'Fairbanks', 64.84, -147.72, 'Americas'),
  site('calgary', 'Calgary', 51.04, -114.07, 'Americas'),
  site('st-johns', "St. John's", 47.56, -52.71, 'Americas'),
  site('woodbine', 'Woodbine', 39.36, -77.06, 'Americas'),
  site('florida', 'Florida', 28.53, -81.37, 'Americas'),
  site('mexico-city', 'Mexico City', 19.43, -99.13, 'Americas'),
  site('marica', 'Maricá', -22.91, -42.81, 'Americas'),
  site('punta-arenas', 'Punta Arenas', -53.16, -70.91, 'Americas'),
  site('bogota', 'Bogota', 4.71, -74.07, 'Americas'),
  site('lima', 'Lima', -12.04, -77.04, 'Americas'),
  // EUROPE & ARCTIC (8 sites)
  site('svalbard', 'Svalbard', 78.22, 15.65, 'Europe & Arctic'),
  site('tromso', 'Tromsø', 69.64, 18.95, 'Europe & Arctic'),
  site('mornac', 'Mornac', 45.68, 0.27, 'Europe & Arctic'),
  site('santander', 'Santander', 43.46, -3.80, 'Europe & Arctic'),
  site('fucino', 'Fucino', 41.97, 13.60, 'Europe & Arctic'),
  site('athens', 'Athens', 37.98, 23.72, 'Europe & Arctic'),
  site('makarios', 'Makarios', 35.12, 33.32, 'Europe & Arctic'),
  site('nuuk', 'Nuuk', 64.18, -51.72, 'Europe & Arctic'),
  // AFRICA (7 sites)
  site('dakar', 'Dakar', 14.71, -17.46, 'Africa'),
  site('accra', 'Accra', 5.60, -0.18, 'Africa'),
  site('luanda', 'Luanda', -8.83, 13.23, 'Africa'),
  site('hartebeesthoek', 'Hartebeesthoek', -25.88, 27.70, 'Africa'),
  site('dar-es-salaam', 'Dar es Salaam', -6.44, 38.90, 'Africa'),
  site('mauritius', 'Mauritius', -20.16, 57.50, 'Africa'),
  site('djibouti', 'Djibouti', 11.58, 43.14, 'Africa'),
  // MIDDLE EAST & ASIA (10 sites)
  site('dubai', 'Dubai', 25.20, 55.27, 'Middle East & Asia'),
  site('riyadh', 'Riyadh', 24.71, 46.67, 'Middle East & Asia'),
  site('nur-sultan', 'Nur-Sultan', 51.16, 71.44, 'Middle East & Asia'),
  site('tashkent', 'Tashkent', 41.29, 69.24, 'Middle East & Asia'),
  site('ibaraki', 'Ibaraki', 36.34, 140.44, 'Middle East & Asia'),
  site('singapore', 'Singapore', 1.35, 103.81, 'Middle East & Asia'),
  site('depok', 'Depok', -6.40, 106.81, 'Middle East & Asia'),
  site('manila', 'Manila', 14.59, 120.98, 'Middle East & Asia'),
  site('seoul', 'Seoul', 37.56, 126.97, 'Middle East & Asia'),
  site('colombo', 'Colombo', 6.92, 79.86, 'Middle East & Asia'),
  // PACIFIC & AUSTRALIA (6 sites)
  site('perth', 'Perth', -31.95, 115.86, 'Pacific & Australia'),
  site('merredin', 'Merredin', -31.48, 118.27, 'Pacific & Australia'),
  site('darwin', 'Darwin', -12.46, 130.84, 'Pacific & Australia'),
  site('majuro', 'Majuro', 7.11, 171.18, 'Pacific & Australia'),
  site('guam', 'Guam', 13.44, 144.74, 'Pacific & Australia'),
  site('south-tarawa', 'South Tarawa', 1.32, 172.97, 'Pacific & Australia'),
];

// ─── Logical Points of Presence (PoP) ────────────────────────────────────────
// Represents major internet exchange / backbone interconnect nodes.
// OneWeb's actual backbone topology is proprietary; these nodes are used only
// for latency estimation and path visualization.

export interface LogicalPoP {
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export const LOGICAL_POPS: LogicalPoP[] = [
  { name: 'Ashburn', lat: 39.04, lng: -77.49, region: 'Americas' },
  { name: 'São Paulo', lat: -23.55, lng: -46.63, region: 'Americas' },
  { name: 'London', lat: 51.51, lng: -0.13, region: 'Europe' },
  { name: 'Frankfurt', lat: 50.11, lng: 8.68, region: 'Europe' },
  { name: 'Dubai', lat: 25.20, lng: 55.27, region: 'Middle East' },
  { name: 'Singapore', lat: 1.35, lng: 103.82, region: 'Asia Pacific' },
  { name: 'Tokyo', lat: 35.69, lng: 139.69, region: 'Asia Pacific' },
  { name: 'Sydney', lat: -33.87, lng: 151.21, region: 'Asia Pacific' },
  // Additional PoPs to refine global accuracy
  { name: 'Mumbai', lat: 19.07, lng: 72.88, region: 'Asia Pacific' },
  { name: 'Johannesburg', lat: -26.20, lng: 28.05, region: 'Africa' },
  { name: 'Auckland', lat: -36.85, lng: 174.76, region: 'Asia Pacific' },
  { name: 'Almaty', lat: 43.22, lng: 76.85, region: 'Middle East' }, // often classed CIS/ME
  { name: 'Santiago', lat: -33.45, lng: -70.66, region: 'Americas' },
];

// ─── Backbone latency model ──────────────────────────────────────────────────

/** Route inflation applied to geodesic distance to estimate actual fiber route length. */
export const DEFAULT_BACKBONE_ROUTE_FACTOR = 1.20;

/** Fiber light propagation speed used to derive one-way latency from distance. */
export const FIBER_SPEED_KM_PER_MS = 200;

/**
 * Floor for the SNP→PoP fiber estimate (ms one-way): last-mile + peering cost
 * even when an SNP is co-located with a PoP city. APNIC-observed range is
 * 5–55 ms one-way.
 */
export const MIN_SNP_TO_POP_FIBER_ONE_WAY_MS = 5;

/**
 * Select the logical PoP closest to the midpoint between two ground points.
 * (Pass the same point twice to get the PoP nearest that point.)
 */
export function selectLogicalPop(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): LogicalPoP {
  const midpoint = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };

  let nearest = LOGICAL_POPS[0];
  let nearestDist = haversineDistanceKm(midpoint, nearest);

  for (const pop of LOGICAL_POPS.slice(1)) {
    const dist = haversineDistanceKm(midpoint, pop);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = pop;
    }
  }

  return nearest;
}

/**
 * Distance-derived one-way fiber latency from an SNP to its nearest logical
 * PoP — the same PoP catalog and route factor the S2S backbone model uses
 * (LEO audit L-Mo3, Lot 2).
 */
export function estimateSnpToPopFiberOneWayMs(snp: { lat: number; lng: number }): number {
  const pop = selectLogicalPop(snp, snp);
  const routeKm = haversineDistanceKm(snp, pop) * DEFAULT_BACKBONE_ROUTE_FACTOR;
  return Math.max(MIN_SNP_TO_POP_FIBER_ONE_WAY_MS, routeKm / FIBER_SPEED_KM_PER_MS);
}

/**
 * Override-aware per-site fiber latency: a curated `popFiberOneWayMsOverride`
 * wins; otherwise the PoP-distance model applies. Accepts a bare lat/lng so
 * legacy call sites without a full SnpSite keep working.
 */
export function snpPopFiberOneWayMs(site: SnpSite | { lat: number; lng: number }): number {
  const override = (site as SnpSite).popFiberOneWayMsOverride;
  if (override != null && Number.isFinite(override)) return override;
  return estimateSnpToPopFiberOneWayMs(site);
}

// ─── Feeder link & serving assignment ────────────────────────────────────────

/**
 * An SNP↔satellite Ka feeder relationship at an instant. Produced by the
 * canonical SNP selector (connectivityRules.selectSnpForSatellite) and the
 * satellite resolver; the natural input for the Ka feeder link budget (L-O2).
 */
export interface LeoFeederLink {
  snp: SnpSite;
  satelliteId: string;
  /** Feeder elevation of the satellite as seen from the SNP (degrees). */
  elevationDeg: number;
  /** 3-D line-of-sight distance SNP ↔ satellite (km). */
  slantRangeKm: number;
  /** One-way feeder propagation latency (ms). */
  oneWayLatencyMs: number;
  band: 'Ka';
}

/**
 * The (satellite, beam, feeder) tuple selected by resolveAutoSelectedSatellites
 * for one analysis point. `feeder: null` marks the RF-only diagnostic states
 * (satellite visible but no reachable SNP → service is BLOCKED downstream).
 * `score: null` marks diagnostic fallback selections that bypassed scoring.
 */
export interface LeoServingAssignment {
  satelliteId: string;
  /** Connected beam index (0–15), or null when no active beam covers the point. */
  beamIndex: number | null;
  feeder: LeoFeederLink | null;
  score: {
    total: number;
    throughput: number;
    rvt: number;
    hysteresis: number;
    gatewayMargin: number;
  } | null;
}

/** Narrowing guard: assignment has a reachable feeder (serviceable state). */
export function isServedAssignment(
  assignment: LeoServingAssignment | null,
): assignment is LeoServingAssignment & { feeder: LeoFeederLink } {
  return assignment?.feeder != null;
}
