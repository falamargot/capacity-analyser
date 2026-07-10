const LEO_ENTITY_PREFIX = 'commercial-route-leo';

function stableEntityToken(value: string): string {
  return encodeURIComponent(value);
}

export function leoServingSatelliteEntityIds(satelliteKey: string): {
  glow: string;
  glyph: string;
} {
  const satelliteToken = stableEntityToken(satelliteKey);
  return {
    glow: `${LEO_ENTITY_PREFIX}-serving-satellite-glow-${satelliteToken}`,
    glyph: `${LEO_ENTITY_PREFIX}-serving-satellite-${satelliteToken}`,
  };
}

export function leoSiteBeamEntityIds(endpointId: string, satelliteKey: string): {
  halo: string;
  beam: string;
} {
  const endpointToken = stableEntityToken(endpointId);
  const satelliteToken = stableEntityToken(satelliteKey);
  return {
    halo: `${LEO_ENTITY_PREFIX}-site-satellite-beam-halo-${endpointToken}-${satelliteToken}`,
    beam: `${LEO_ENTITY_PREFIX}-site-satellite-beam-${endpointToken}-${satelliteToken}`,
  };
}

