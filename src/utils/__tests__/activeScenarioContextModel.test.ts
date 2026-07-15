import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import type { LeoConnectivityViewModel } from '../leoServiceViewModel';
import type { LeoSiteToSiteResult } from '../leoSiteToSiteModel';
import {
  deriveGeoActiveScenarioContext,
  deriveLeoActiveScenarioContext,
  formatActiveScenarioUtcTime,
} from '../activeScenarioContextModel';

const satellite = (id: string, name: string) => ({ id, name } as SatelliteData);
const coverage = (name: string, isUplink: boolean, isSynthesized = false) => ({
  coverageName: name,
  isUplink,
  isSynthesized,
} as CandidateCoverage);

const leoViewModel = (overrides: Partial<LeoConnectivityViewModel> = {}) => ({
  physicalState: { rfAvailable: true },
  finalServiceStatus: 'ALLOWED',
  decisionDriver: 'ALL_OK',
  ...overrides,
} as LeoConnectivityViewModel);

describe('activeScenarioContextModel', () => {
  it('formats real UTC rather than local time', () => {
    expect(formatActiveScenarioUtcTime(new Date('2026-07-15T12:34:56.789Z')))
      .toBe('2026-07-15 12:34:56 UTC');
  });

  it('excludes GEO when it is outside the scenario and resolves selected GEO assets otherwise', () => {
    const input = {
      included: true,
      hasScenario: true,
      status: 'available' as const,
      satellite: satellite('geo-1', 'EUTELSAT 10B'),
      uplinkCoverage: coverage('UL Europe', true, true),
      downlinkCoverage: coverage('DL Europe', false),
    };

    expect(deriveGeoActiveScenarioContext({ ...input, included: false })).toBeNull();
    expect(deriveGeoActiveScenarioContext({ ...input, hasScenario: false })).toBeNull();
    expect(deriveGeoActiveScenarioContext(input)).toEqual({
      status: 'resolved',
      satelliteName: 'EUTELSAT 10B',
      uplinkCoverage: 'UL Europe (estimated)',
      downlinkCoverage: 'DL Europe',
    });
  });

  it('uses compact GEO RF and service placeholders instead of stale assets', () => {
    const base = {
      included: true,
      hasScenario: true,
      satellite: satellite('geo-1', 'EUTELSAT 10B'),
      uplinkCoverage: coverage('UL Europe', true),
      downlinkCoverage: coverage('DL Europe', false),
    };

    expect(deriveGeoActiveScenarioContext({ ...base, status: 'out_of_coverage' }))
      .toEqual({ status: 'no-rf-path' });
    expect(deriveGeoActiveScenarioContext({ ...base, status: 'gateway_unavailable' }))
      .toEqual({ status: 'no-service-path' });
  });

  it('resolves the actual single-site LEO satellite and separates RF from service failures', () => {
    const base = {
      included: true,
      hasScenario: true,
      siteToSite: false,
      result: null,
      satelliteA: satellite('leo-1', 'ONEWEB-0499'),
    };

    expect(deriveLeoActiveScenarioContext({ ...base, viewModel: leoViewModel() })).toEqual({
      status: 'resolved',
      satelliteNames: ['ONEWEB-0499'],
    });
    expect(deriveLeoActiveScenarioContext({
      ...base,
      viewModel: leoViewModel({ physicalState: { rfAvailable: false } as LeoConnectivityViewModel['physicalState'] }),
    })).toEqual({ status: 'no-rf-path' });
    expect(deriveLeoActiveScenarioContext({
      ...base,
      viewModel: leoViewModel({ finalServiceStatus: 'BLOCKED', decisionDriver: 'NETWORK' }),
    })).toEqual({ status: 'no-service-path' });
  });

  it('shows both serving satellites for resolved LEO site-to-site connectivity', () => {
    const result = {
      servingSatelliteA: satellite('leo-a', 'ONEWEB-A'),
      servingSatelliteB: satellite('leo-b', 'ONEWEB-B'),
      rfAvailableA: true,
      rfAvailableB: true,
      failureReason: null,
      serviceAvailable: true,
    } as LeoSiteToSiteResult;

    expect(deriveLeoActiveScenarioContext({
      included: true,
      hasScenario: true,
      siteToSite: true,
      result,
      viewModel: null,
      satelliteA: null,
    })).toEqual({ status: 'resolved', satelliteNames: ['ONEWEB-A', 'ONEWEB-B'] });

    expect(deriveLeoActiveScenarioContext({
      included: true,
      hasScenario: true,
      siteToSite: true,
      result: { ...result, failureReason: 'NO_SNP_A', serviceAvailable: false },
      viewModel: null,
      satelliteA: null,
    })).toEqual({ status: 'no-service-path' });
  });
});
