import { Feature } from 'geojson';
import type { CoverageData } from '../services/coverageService';
import type { SatelliteStatusCategory } from '../utils/satelliteStatus';

export interface SatelliteData {
  id: string;
  name: string;
  noradId: string;
  coverageFileId: string | null;
  type: 'EUTELSAT' | 'ONEWEB';
  orbitType: 'GEO' | 'LEO'; // Mandatory orbit type
  /**
   * Operational status derived from the CelesTrak SATCAT.
   * 'unknown' means the satellite had no SATCAT entry at fetch time.
   * Decayed satellites are never stored — they are filtered out during loading.
   */
  opsStatus: SatelliteStatusCategory;
  satrec: any;
  position: {
    lat: number;
    lng: number;
    alt: number;
    /** UTC timestamp (Date.now) used to propagate this position. */
    sampleTimeMs?: number;
    x?: number;
    y?: number;
    z?: number;
  };
  coverageReferencePosition?: {
    lat: number;
    lng: number;
    alt: number;
  };
  capacity: {
    maxThroughput: number;
    bandwidth: {
      ku: number;
      ka: number;
      /** C-band only applicable to GEO satellites (e.g. Eutelsat). Not used for OneWeb Gen 1. */
      c?: number;
    };
    availability: number;
    /**
     * Official aggregate satellite capacity (Gbps) based on public sources.
     * Labeled as engineering approximation when no single authoritative filing
     * provides an unambiguous value.
     * Only set for LEO constellations (OneWeb Gen 1).
     */
    officialAggregateCapacityGbps?: number;
    /**
     * Simulated effective beam capacity (Mbps) at boresight, clear sky, full
     * beam health — as modelled by the 5-pillar simulation engine.
     * This is NOT a marketed or filed value; it is a simulation output.
     * Only set for LEO constellations (OneWeb Gen 1).
     */
    simulatedEffectiveBeamCapacityMbps?: number;
  };
  referenced_coverages: CoverageData;
  coverages: Coverage[];
}


export interface Coverage {
  name: string;
  feature: Feature;
}
