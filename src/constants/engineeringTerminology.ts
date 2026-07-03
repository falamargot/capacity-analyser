/**
 * Single source of truth for architecture-specific ground-segment nouns that
 * the Engineering Analysis UI must keep disambiguated: GEO routes traffic
 * through a resolved traffic gateway, LEO (OneWeb Gen-1 bent-pipe) routes
 * through an SNP. Centralized here so the two terms can't drift independently
 * across the GEO and LEO connectivity sections.
 *
 * GEO.gateway is deliberately the traffic-path noun "Traffic Gateway", not
 * the physical site noun "Ground Site". Call sites that display physical
 * infrastructure or operational capabilities should derive those labels from
 * GroundSite / GroundCapability instead of using this RF-path noun.
 */
export const ENGINEERING_TERMS = {
  GEO: {
    gateway: 'Traffic Gateway',
  },
  LEO: {
    gateway: 'SNP',
  },
} as const;
