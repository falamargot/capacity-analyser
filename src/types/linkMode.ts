/**
 * GEO link connectivity modes.
 *
 * STAR_FORWARD  — GEO gateway → Satellite → User  (forward link, user receives)
 * STAR_RETURN   — User → Satellite → GEO gateway  (return link, user transmits)
 * MESH          — Terminal A ↔ Satellite ↔ Terminal B  (both directions computed)
 * POINT_TO_POINT— Same RF as MESH, distinct semantic (site-to-site)
 */
export type LinkMode = 'STAR_FORWARD' | 'STAR_RETURN' | 'MESH' | 'POINT_TO_POINT';

export const LINK_MODE_LABELS: Record<LinkMode, string> = {
  STAR_FORWARD: 'Forward',
  STAR_RETURN: 'Return',
  MESH: 'Mesh',
  POINT_TO_POINT: 'Point-to-Point',
};

/**
 * These describe the abstract TOPOLOGY — the structural direction of signal
 * flow — not a resolved site. "GEO gateway" rather than "GEO teleport" since
 * 2026-09-03, aligning the last strings that still used the pre-refactor noun
 * (deferred item 4).
 *
 * Deliberately not derived from `ENGINEERING_TERMS.GEO.gateway` ("Traffic
 * Gateway"): that is the RF-path noun for a RESOLVED gateway on a live route,
 * and reading "GEO Traffic Gateway → User" as the name of a topology would
 * claim more than the topology knows.
 */
export const LINK_MODE_DESCRIPTIONS: Record<LinkMode, string> = {
  STAR_FORWARD: 'GEO gateway → User (Forward Link)',
  STAR_RETURN: 'User → GEO gateway (Return Link)',
  MESH: 'Terminal A ↔ Terminal B (Mesh Link)',
  POINT_TO_POINT: 'Terminal A ↔ Terminal B (Point-to-Point)',
};

/**
 * Modes that require a second geographic point (Point B) to be selected.
 */
export const LINK_MODE_REQUIRES_POINT_B = new Set<LinkMode>(['MESH', 'POINT_TO_POINT']);

