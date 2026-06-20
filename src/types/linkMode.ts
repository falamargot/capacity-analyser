/**
 * GEO link connectivity modes.
 *
 * STAR_FORWARD  — GEO teleport → Satellite → User  (forward link, user receives)
 * STAR_RETURN   — User → Satellite → GEO teleport  (return link, user transmits)
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

export const LINK_MODE_DESCRIPTIONS: Record<LinkMode, string> = {
  STAR_FORWARD: 'GEO teleport → User (Forward Link)',
  STAR_RETURN: 'User → GEO teleport (Return Link)',
  MESH: 'Terminal A ↔ Terminal B (Mesh Link)',
  POINT_TO_POINT: 'Terminal A ↔ Terminal B (Point-to-Point)',
};

/**
 * Modes that require a second geographic point (Point B) to be selected.
 */
export const LINK_MODE_REQUIRES_POINT_B = new Set<LinkMode>(['MESH', 'POINT_TO_POINT']);

/**
 * Whether the mode uses a ground gateway as one endpoint (auto-resolved).
 */
export const LINK_MODE_USES_GATEWAY = new Set<LinkMode>(['STAR_FORWARD', 'STAR_RETURN']);
