import { Feature, FeatureCollection } from 'geojson';
import type { CoverageData } from '../services/coverageService';

export interface SatelliteData {
  id: string;
  name: string;
  noradId: string;
  type: 'EUTELSAT' | 'ONEWEB';
  orbitType: 'GEO' | 'LEO'; // Mandatory orbit type
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
