/**
 * Single source of truth for architecture-specific ground-segment nouns that
 * the Engineering Analysis UI must keep disambiguated: GEO routes traffic
 * through a teleport, LEO (OneWeb Gen-1 bent-pipe) routes through an SNP.
 * Centralized here so the two terms can't drift independently across the
 * GEO and LEO connectivity sections.
 */
export const ENGINEERING_TERMS = {
  GEO: {
    gateway: 'GEO teleport',
  },
  LEO: {
    gateway: 'SNP',
  },
} as const;
