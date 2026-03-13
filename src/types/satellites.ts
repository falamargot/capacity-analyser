import { Feature, FeatureCollection } from 'geojson';
import type { CoverageData } from '../services/coverageService';
import type { SatelliteStatusCategory } from '../utils/satelliteStatus';

export interface SatelliteData {
  id: string;
  name: string;
  noradId: string;
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
      c: number;
    };
    availability: number;
  };
  referenced_coverages: CoverageData | FeatureCollection;
  coverages: Coverage[];
}


export interface Coverage {
  name: string;
  feature: Feature;
}
