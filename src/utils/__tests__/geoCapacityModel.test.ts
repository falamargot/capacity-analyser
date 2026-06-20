import { describe, expect, it } from 'vitest';

import type { SatelliteData } from '../../types/satellites';
import {
  estimateGeoSatelliteCapacity,
  estimateGeoSatelliteCapacityGbps,
  GEO_CAPACITY_CLASSES,
} from '../geoCapacityModel';

const makeGeoSatellite = (
  name: string,
  options: Partial<SatelliteData> = {},
): SatelliteData => ({
  id: options.id ?? name,
  name,
  noradId: options.noradId ?? name,
  coverageFileId: options.coverageFileId ?? null,
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as any,
  position: { lat: 0, lng: 0, alt: 35786, isPositionValid: true },
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 100, ka: 0, c: 0 },
    availability: 0.99,
    ...options.capacity,
  },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
  ...options,
});

describe('estimateGeoSatelliteCapacity', () => {
  it('classifies KONNECT VHTS as a public VHTS payload class', () => {
    const estimate = estimateGeoSatelliteCapacity(makeGeoSatellite('EUTELSAT KONNECT VHTS'));

    expect(estimate.id).toBe('VHTS_GEO');
    expect(estimate.nominalGbps).toBe(500);
    expect(estimate.rangeGbps).toEqual([400, 500]);
    expect(estimate.provenance).toContain('500 Gbps-class');
  });

  it('classifies HTS and Ka/spot-beam payload names above regional Ku fallback', () => {
    const estimate = estimateGeoSatelliteCapacity(makeGeoSatellite('EUTELSAT KONNECT'));

    expect(estimate.id).toBe('HTS_GEO');
    expect(estimate.nominalGbps).toBe(GEO_CAPACITY_CLASSES.HTS_GEO.nominalGbps);
    expect(estimate.nominalGbps).toBeGreaterThan(GEO_CAPACITY_CLASSES.REGIONAL_KU_GEO.nominalGbps);
  });

  it('uses regional Ku-band class for ordinary Eutelsat GEO payloads', () => {
    const estimate = estimateGeoSatelliteCapacity(makeGeoSatellite('EUTELSAT 8 WEST B'));

    expect(estimate.id).toBe('REGIONAL_KU_GEO');
    expect(estimate.nominalGbps).toBe(12);
    expect(estimate.classificationReason).toContain('regional Ku-band');
  });

  it('uses legacy widebeam class when C-band/widebeam metadata is present', () => {
    const estimate = estimateGeoSatelliteCapacity(makeGeoSatellite('Legacy widebeam C-band satellite', {
      capacity: {
        maxThroughput: 100,
        bandwidth: { ku: 0, ka: 0, c: 36 },
        availability: 0.99,
      },
    }));

    expect(estimate.id).toBe('LEGACY_WIDEBEAM_GEO');
    expect(estimate.nominalGbps).toBe(4);
  });

  it('returns a nominal Gbps value through the compact helper', () => {
    const satellite = makeGeoSatellite('EUTELSAT KONNECT VHTS');

    expect(estimateGeoSatelliteCapacityGbps(satellite)).toBe(500);
  });
});
