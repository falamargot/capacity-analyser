/**
 * satelliteStatus.ts
 *
 * Single source of truth for satellite operational-status semantics.
 *
 * Status codes (from CelesTrak SATCAT OPS_STATUS_CODE):
 *   +   Operational
 *   P   Partially operational
 *   B   Backup / standby
 *   S   Spare
 *   X   Extended mission
 *   -   Non-operational
 *   D   Decayed (re-entered atmosphere)
 *
 * This module is intentionally free of Cesium imports so it can be used in
 * workers, tests, and non-Cesium contexts without pulling in the full library.
 * Cesium Color values are provided by the companion getCesiumStatusColor()
 * helper in SatelliteLayer which is the only render-aware consumer.
 */

// ─── Status category ──────────────────────────────────────────────────────────

/**
 * Coarse rendering category derived from the raw OPS_STATUS_CODE.
 *
 *   operational  → render in the satellite type's native color
 *   inactive     → render in gray (covers missing SATCAT entries too)
 *   decayed      → omit from the scene (filtered before rendering)
 */
export type SatelliteStatusCategory = 'operational' | 'inactive' | 'decayed';

/**
 * OPS_STATUS_CODEs that map to the "operational" rendering category.
 * Using a Set for O(1) membership tests on every satellite every frame.
 */
export const OPERATIONAL_STATUS_CODES = new Set(['+', 'P', 'B', 'S', 'X']);

/**
 * Derive a rendering category from a raw OPS_STATUS_CODE.
 *
 * @param code - The OPS_STATUS_CODE from SATCAT, or undefined if the satellite
 *               has no SATCAT entry.
 * @returns SatelliteStatusCategory
 */
export function getStatusCategory(code: string | undefined): SatelliteStatusCategory {
  if (code === undefined) return 'inactive'; // No SATCAT entry → treat as inactive
  if (code === 'D')       return 'decayed';
  if (OPERATIONAL_STATUS_CODES.has(code)) return 'operational';
  // Covers '-' and any unexpected future codes
  return 'inactive';
}

/**
 * Type guard for render paths that should only operate on active satellites.
 */
export function isOperationalSatellite<T extends { opsStatus: SatelliteStatusCategory }>(
  satellite: T | null | undefined
): satellite is T {
  return satellite?.opsStatus === 'operational';
}

