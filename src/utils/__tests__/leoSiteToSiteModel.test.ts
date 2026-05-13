import { describe, expect, it } from 'vitest';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { SNPData } from '../../components/globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import { computeLeoSiteToSiteResult } from '../leoSiteToSiteModel';

const satA = { id: 'sat-a', name: 'Sat A' } as SatelliteData;
const satB = { id: 'sat-b', name: 'Sat B' } as SatelliteData;
const snpA = { name: 'SNP A', lat: 0, lng: 0 } as SNPData;
const snpB = { name: 'SNP B', lat: 1, lng: 1 } as SNPData;

const regulatory = (status: RegulatoryResult['status']): RegulatoryResult => ({
  isoA2: 'FR',
  isoA3: 'FRA',
  countryName: 'France',
  status,
  reason: 'Test regulatory status',
  confidence: 1,
  emitAllowed: status !== 'BLOCKED',
  serviceAllowed: status !== 'BLOCKED',
  styleFill: '#000',
  styleOpacity: 1,
  isOcean: false,
});

const baseArgs = {
  endpointA: { lat: 0, lng: 0 },
  endpointB: { lat: 1, lng: 1 },
  servingSatelliteA: satA,
  servingSatelliteB: satB,
  rfAvailableA: true,
  rfAvailableB: true,
  selectedSnpA: snpA,
  selectedSnpB: snpB,
  regulatoryResultA: regulatory('ALLOWED_CONFIRMED'),
  regulatoryResultB: regulatory('ALLOWED_CONFIRMED'),
  userToSatDistanceAKm: null,
  satToSnpDistanceAKm: null,
  userToSatDistanceBKm: null,
  satToSnpDistanceBKm: null,
  elevationADeg: null,
  elevationBDeg: null,
  dlThroughputAMbps: null,
  ulThroughputAMbps: null,
  dlThroughputBMbps: null,
  ulThroughputBMbps: null,
};

describe('computeLeoSiteToSiteResult failure reasons', () => {
  it('reports no satellite at B only when B has no selected satellite', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      servingSatelliteB: null,
      rfAvailableB: false,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('NO_SATELLITE_B');
  });

  it('reports RF unavailable at B when a B satellite is selected but RF fails', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      rfAvailableB: false,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('RF_UNAVAILABLE_B');
  });

  it('reports no gateway at B when satellite and RF are available but no SNP exists', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('NO_SNP_B');
    expect(result.serviceStatus).toBe('BLOCKED');
    expect(result.serviceAvailable).toBe(false);
  });

  it('prioritizes regulatory B before RF and SNP failures', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      rfAvailableB: false,
      selectedSnpB: null,
      regulatoryResultB: regulatory('RESTRICTED'),
    });

    expect(result.failureReason).toBe('REGULATORY_RESTRICTED_B');
  });
});
