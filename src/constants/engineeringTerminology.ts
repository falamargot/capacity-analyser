/**
 * Single source of truth for architecture-specific ground-segment nouns that
 * the Engineering Analysis UI must keep disambiguated: GEO routes traffic
 * through a resolved ground gateway site, LEO (OneWeb Gen-1 bent-pipe) routes
 * through an SNP. Centralized here so the two terms can't drift independently
 * across the GEO and LEO connectivity sections.
 *
 * GEO.gateway is deliberately the neutral noun "GEO gateway", not "GEO
 * teleport": not every resolved site has a confirmed/likely commercial
 * traffic (teleport) role — see GeoGatewayData.roles / .trafficStatus in
 * components/globe/GlobeConfig.ts. Call sites that display a specific
 * resolved site's actual role should derive it from that site's roles[]
 * (e.g. via getPrimaryControlRoleLabel) instead of using this generic noun.
 */
export const ENGINEERING_TERMS = {
  GEO: {
    gateway: 'GEO gateway',
  },
  LEO: {
    gateway: 'SNP',
  },
} as const;
