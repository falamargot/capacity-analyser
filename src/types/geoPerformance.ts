/**
 * The GEO performance estimate shape shared by the delivery chain, the baseline
 * estimator and the export/PDF builders.
 *
 * It lives in `types/` rather than in `engineeringExportPayload` so that core
 * engineering modules do not have to import from the export layer to name their
 * own return type.
 */
export interface GeoPerformanceEstimate {
  downlinkGbps: number;
  uplinkGbps: number;
  stability: string;
  /**
   * Modem utilization once a route is resolved (delivered rate ÷ binding modem
   * ceiling), or the legacy coverage/elevation ratio on the baseline path.
   * null when NO endpoint modem ceiling is known — never 0, which would read as
   * "0% of capacity" for a healthy link whose endpoints simply have no modem set.
   */
  performanceFactor: number | null;
  weatherFactor: number;
  weatherLabel: string;
  /**
   * True when the throughput is an RF-limited estimated ceiling (no known modem cap
   * bounding both ends of the direction), not a delivered rate.
   */
  throughputEstimated?: boolean;
  downloadEstimated?: boolean;
  uploadEstimated?: boolean;
}
