/**
 * Pure math for the orbital-alignment diagnostic.
 *
 * Kept framework-free and side-effect-free so the numbers the diagnostic
 * reports can be pinned by deterministic fixed-UTC tests, with no worker, no
 * Cesium and no clock involved.
 *
 * Vocabulary used throughout:
 *   displayed  — the interpolated position the globe actually draws
 *   reference  — an independent SGP4 evaluation at the SAME UTC instant
 *   skew       — the displayed position expressed as a TIME offset: how far
 *                ahead (+) or behind (−) the reference the globe is showing
 */

/** IUGG mean Earth radius, metres. Ground-track error is reported on this sphere. */
export const MEAN_EARTH_RADIUS_M = 6371008.8;

export interface GeoPoint {
  lat: number;
  lng: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two sub-satellite points, in metres.
 *
 * Haversine on the mean sphere: at the scale we care about (metres to a few km)
 * the difference from a WGS84 geodesic is far below the measurement's own
 * noise, and it has no iteration to diverge.
 */
export function geodesicDistanceM(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * MEAN_EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface SkewInput {
  displayed: GeoPoint;
  /** Reference sub-satellite point at the sample instant. */
  reference: GeoPoint;
  /** Reference sub-satellite point at `aheadDeltaMs` later — gives the ground track direction and speed. */
  referenceAhead: GeoPoint;
  aheadDeltaMs: number;
}

export interface SkewResult {
  /** Ground-track error, metres, always ≥ 0. */
  geodesicErrorM: number;
  /** Sub-satellite ground speed, metres per millisecond. */
  groundSpeedMPerMs: number;
  /**
   * Effective temporal skew in ms: positive when the globe is drawing the
   * satellite where it WILL be (leading real time), negative when it lags.
   */
  skewMs: number;
}

/**
 * Converts a positional error into the time offset that would produce it.
 *
 * Direction comes from a second reference point one `aheadDeltaMs` later: if
 * the displayed point is closer to that future point than the reference is,
 * the globe is running ahead of UTC.
 */
export function computeSkew(input: SkewInput): SkewResult {
  const { displayed, reference, referenceAhead, aheadDeltaMs } = input;
  const geodesicErrorM = geodesicDistanceM(displayed, reference);
  const trackM = geodesicDistanceM(reference, referenceAhead);
  const groundSpeedMPerMs = aheadDeltaMs > 0 ? trackM / aheadDeltaMs : 0;
  if (groundSpeedMPerMs <= 0) {
    return { geodesicErrorM, groundSpeedMPerMs: 0, skewMs: 0 };
  }
  const leading = geodesicDistanceM(displayed, referenceAhead) < trackM;
  return {
    geodesicErrorM,
    groundSpeedMPerMs,
    skewMs: (leading ? 1 : -1) * (geodesicErrorM / groundSpeedMPerMs),
  };
}

// ─── Bounded aggregation ──────────────────────────────────────────────────────

/** Upper edges (metres) of the ground-track error histogram. Last bucket is the overflow. */
const ERROR_BUCKET_EDGES_M = [
  10, 25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, Infinity,
];

export const WORST_SAMPLE_LIMIT = 10;

/**
 * Which part of a run a sample belongs to. The Safari soak of 2026-07-29 showed
 * why this cannot be one pooled number: samples taken while the tab was hidden
 * describe positions that were never drawn (Safari renders no frames and stalls
 * the propagation chain), and pooling them with visible samples produced a
 * 657 km "mean error" for a pipeline whose post-resume batch measured 58.7 m.
 *
 * The 2026-07-29 authoritative soak then showed that "visible" itself needs
 * splitting: a run that has never been hidden exercises the propagation loop's
 * own liveness, while a run after a resume has just been kicked by the
 * visibilitychange handler. Conflating them hides exactly the bug that was
 * found — a loop that only ever restarts when the tab is reopened.
 *
 *   initial-visible visible, before the tab has ever been hidden. This is the
 *                   phase that proves the app recovers on its own.
 *   hidden          document.visibilityState === 'hidden' at capture time
 *   resume          the first batches after the tab became visible again
 *   settled-visible visible, far enough past a resume that propagation has
 *                   caught up — thresholds apply to this and to initial-visible
 */
export type AlignmentPhase = 'initial-visible' | 'hidden' | 'resume' | 'settled-visible';

/** Cell-refresh age buckets, in ms. A cell is refreshed by a React render. */
export const CELL_AGE_FRESH_MS = 2000;
export const CELL_AGE_STALE_MS = 10000;

export type CellAgeBucket = 'fresh' | 'stale' | 'frozen';

export function bucketCellAge(cellRefreshAgeMs: number): CellAgeBucket {
  if (cellRefreshAgeMs <= CELL_AGE_FRESH_MS) return 'fresh';
  if (cellRefreshAgeMs <= CELL_AGE_STALE_MS) return 'stale';
  return 'frozen';
}

export interface AlignmentSample {
  satelliteId: string;
  /** Which usePositionCallbacks instance owned the cell this came from. */
  ownerLabel: string;
  phase: AlignmentPhase;
  /** now − the last React render that refreshed the cell. */
  cellRefreshAgeMs: number;
  /** UTC instant the comparison was made at. */
  atMs: number;
  geodesicErrorM: number;
  altitudeErrorM: number;
  skewMs: number;
  /** now − latest worker sample timestamp. Negative means the sample is a lookahead into the future. */
  workerSampleAgeMs: number;
  /** Cesium clock − system clock, ms. */
  clockDeltaMs: number;
}

export interface AlignmentPhaseStats {
  samples: number;
  satellitesSampled: number;
  geodesicErrorM: {
    mean: number;
    /** Reported p95: the bucket edge clamped to the observed max, so it can never print above it. */
    p95: number;
    /** Raw histogram bucket upper edge, retained for comparison across runs. */
    p95BucketM: number;
    max: number;
  };
  altitudeErrorM: { mean: number; max: number };
  skewMs: { mean: number; min: number; max: number };
  workerSampleAgeMs: { mean: number; min: number; max: number };
  clockDeltaMs: { mean: number; max: number };
  /** now − last cell refresh, ms. Large values mean the owner stopped rendering. */
  cellRefreshAgeMs: { mean: number; max: number };
  /** How many samples fell in each cell-age bucket. */
  cellAge: Record<CellAgeBucket, number>;
  /** The 10 largest ground-track errors seen, worst first. */
  worst: AlignmentSample[];
}

/** One run, reported per phase — never pooled. */
export interface AlignmentStats {
  ownerLabel: string;
  /** Visible, before any hide. Thresholds apply. */
  initialVisible: AlignmentPhaseStats;
  hidden: AlignmentPhaseStats;
  resume: AlignmentPhaseStats;
  /** Visible and settled after a resume. Thresholds apply. */
  settledVisible: AlignmentPhaseStats;
}

/**
 * Fixed-footprint accumulator: running sums, a 15-bucket histogram for the p95,
 * and at most 10 retained samples. Memory does not grow with sample count, and
 * nothing it holds references a Cesium object or a satellite record.
 */
export class AlignmentAccumulator {
  private n = 0;
  private ids = new Set<string>();
  private geoSum = 0;
  private geoMax = 0;
  private altSum = 0;
  private altMax = 0;
  private skewSum = 0;
  private skewMin = Number.POSITIVE_INFINITY;
  private skewMax = Number.NEGATIVE_INFINITY;
  private ageSum = 0;
  private ageMin = Number.POSITIVE_INFINITY;
  private ageMax = Number.NEGATIVE_INFINITY;
  private clockSum = 0;
  private clockMax = 0;
  private buckets = new Array(ERROR_BUCKET_EDGES_M.length).fill(0) as number[];
  private worst: AlignmentSample[] = [];
  private refreshSum = 0;
  private refreshMax = 0;
  private cellAge: Record<CellAgeBucket, number> = { fresh: 0, stale: 0, frozen: 0 };

  add(sample: AlignmentSample): void {
    this.n++;
    this.ids.add(sample.satelliteId);
    this.geoSum += sample.geodesicErrorM;
    this.geoMax = Math.max(this.geoMax, sample.geodesicErrorM);
    const absAlt = Math.abs(sample.altitudeErrorM);
    this.altSum += absAlt;
    this.altMax = Math.max(this.altMax, absAlt);
    this.skewSum += sample.skewMs;
    this.skewMin = Math.min(this.skewMin, sample.skewMs);
    this.skewMax = Math.max(this.skewMax, sample.skewMs);
    this.ageSum += sample.workerSampleAgeMs;
    this.ageMin = Math.min(this.ageMin, sample.workerSampleAgeMs);
    this.ageMax = Math.max(this.ageMax, sample.workerSampleAgeMs);
    this.clockSum += sample.clockDeltaMs;
    this.clockMax = Math.max(this.clockMax, Math.abs(sample.clockDeltaMs));

    for (let i = 0; i < ERROR_BUCKET_EDGES_M.length; i++) {
      if (sample.geodesicErrorM <= ERROR_BUCKET_EDGES_M[i]) {
        this.buckets[i]++;
        break;
      }
    }

    this.refreshSum += sample.cellRefreshAgeMs;
    this.refreshMax = Math.max(this.refreshMax, sample.cellRefreshAgeMs);
    this.cellAge[bucketCellAge(sample.cellRefreshAgeMs)]++;

    // Insertion into a 10-slot list — no sort of the full sample stream.
    if (this.worst.length < WORST_SAMPLE_LIMIT) {
      this.worst.push(sample);
      this.worst.sort((a, b) => b.geodesicErrorM - a.geodesicErrorM);
    } else if (sample.geodesicErrorM > this.worst[WORST_SAMPLE_LIMIT - 1].geodesicErrorM) {
      this.worst[WORST_SAMPLE_LIMIT - 1] = sample;
      this.worst.sort((a, b) => b.geodesicErrorM - a.geodesicErrorM);
    }
  }

  /** Upper edge of the bucket containing the 95th percentile — a conservative estimate. */
  private p95(): number {
    if (this.n === 0) return 0;
    const target = this.n * 0.95;
    let cumulative = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.buckets[i];
      if (cumulative >= target) {
        return Number.isFinite(ERROR_BUCKET_EDGES_M[i]) ? ERROR_BUCKET_EDGES_M[i] : this.geoMax;
      }
    }
    return this.geoMax;
  }

  snapshot(): AlignmentPhaseStats {
    const n = this.n || 1;
    return {
      samples: this.n,
      satellitesSampled: this.ids.size,
      geodesicErrorM: {
        mean: this.geoSum / n,
        // A bucket edge alone printed "p95 ≤10.0 m  max 5.0 m", which reads as a
        // contradiction. Clamping keeps it conservative AND coherent.
        p95: Math.min(this.p95(), this.geoMax),
        p95BucketM: this.p95(),
        max: this.geoMax,
      },
      altitudeErrorM: { mean: this.altSum / n, max: this.altMax },
      skewMs: {
        mean: this.skewSum / n,
        min: this.n ? this.skewMin : 0,
        max: this.n ? this.skewMax : 0,
      },
      workerSampleAgeMs: {
        mean: this.ageSum / n,
        min: this.n ? this.ageMin : 0,
        max: this.n ? this.ageMax : 0,
      },
      clockDeltaMs: { mean: this.clockSum / n, max: this.clockMax },
      cellRefreshAgeMs: { mean: this.refreshSum / n, max: this.refreshMax },
      cellAge: { ...this.cellAge },
      worst: [...this.worst],
    };
  }

  reset(): void {
    this.n = 0;
    this.ids = new Set();
    this.geoSum = this.geoMax = this.altSum = this.altMax = 0;
    this.skewSum = 0;
    this.skewMin = Number.POSITIVE_INFINITY;
    this.skewMax = Number.NEGATIVE_INFINITY;
    this.ageSum = 0;
    this.ageMin = Number.POSITIVE_INFINITY;
    this.ageMax = Number.NEGATIVE_INFINITY;
    this.clockSum = this.clockMax = 0;
    this.buckets.fill(0);
    this.worst = [];
    this.refreshSum = this.refreshMax = 0;
    this.cellAge = { fresh: 0, stale: 0, frozen: 0 };
  }
}

/**
 * Three independent accumulators, one per phase. Fixed footprint: a run of any
 * length costs the same memory as a run of three samples.
 */
export class PhasedAlignmentAccumulator {
  private readonly byPhase: Record<AlignmentPhase, AlignmentAccumulator> = {
    'initial-visible': new AlignmentAccumulator(),
    hidden: new AlignmentAccumulator(),
    resume: new AlignmentAccumulator(),
    'settled-visible': new AlignmentAccumulator(),
  };

  add(sample: AlignmentSample): void {
    this.byPhase[sample.phase].add(sample);
  }

  snapshot(ownerLabel: string): AlignmentStats {
    return {
      ownerLabel,
      initialVisible: this.byPhase['initial-visible'].snapshot(),
      hidden: this.byPhase.hidden.snapshot(),
      resume: this.byPhase.resume.snapshot(),
      settledVisible: this.byPhase['settled-visible'].snapshot(),
    };
  }

  reset(): void {
    for (const acc of Object.values(this.byPhase)) acc.reset();
  }
}

// ─── Soak rotation ────────────────────────────────────────────────────────────

export const SOAK_BATCH_SIZE = 32;
export const SOAK_DURATION_MS = 60_000;

/**
 * Indices for the next soak batch, wrapping around the constellation.
 *
 * A plain rotating cursor rather than random sampling: it guarantees every
 * satellite is reached within ceil(total / size) batches, which is what makes
 * "every satellite is eventually sampled" checkable instead of probabilistic.
 */
export function nextSoakBatch(cursor: number, total: number, size = SOAK_BATCH_SIZE): {
  indices: number[];
  nextCursor: number;
} {
  if (total <= 0) return { indices: [], nextCursor: 0 };
  const take = Math.min(size, total);
  const indices: number[] = [];
  for (let i = 0; i < take; i++) indices.push((cursor + i) % total);
  return { indices, nextCursor: (cursor + take) % total };
}
