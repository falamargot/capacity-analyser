import { describe, expect, it } from 'vitest';
import type { LinkSegment } from '../../../utils/geoDualSegmentBudget';
import type { CandidateCoverage } from '../../../types/analysis';
import { buildGeoRfContext } from '../rfContextService';
import { matchPublicTransponders } from '../../frequencyPlan/publicTransponderMatcher';

const candidate = (overrides: Partial<CandidateCoverage>): CandidateCoverage => ({
  satelliteId: '40875',
  satelliteName: 'EUTELSAT 8 WEST B',
  missionName: 'EUTELSAT',
  coverageKey: 'cov',
  coverageName: 'E8WB C Band Europe',
  beamId: 'beam-1',
  beamName: 'Europe',
  elevation: 35,
  distanceFromBeamCenter: 0,
  throughputEstimate: 100,
  level: 40,
  isUplink: false,
  band: 'C',
  frequencyGhz: 3.8,
  bandwidthMhz: 36,
  atmosphericLossDb: 0.3,
  slantRangeKm: 38000,
  fsplDb: 195,
  cn0Dbhz: 70,
  cnDb: 10,
  linkMarginDb: 5,
  latencyMs: 120,
  status: 'available',
  scoreBreakdown: { elevation: 1, linkMargin: 1, throughput: 1, latency: 1, total: 1 },
  score: 1,
  ...overrides,
});

const segment = (coverage: CandidateCoverage): LinkSegment => ({
  source: { label: 'Terminal', eirpDbw: 55 },
  destination: { label: coverage.satelliteName, gtDbk: -2 },
  candidate: coverage,
  effectiveCNDb: 10,
  effectiveLinkMarginDb: 5,
  adjustmentDb: 0,
});

describe('geo RF context service', () => {
  it('creates RF context from link budget segment inputs', () => {
    const uplink = segment(candidate({
      isUplink: true,
      coverageName: 'E8WB C Band Receive',
      frequencyGhz: 5.9,
      gtDbk: -2,
      eirpDbw: undefined,
    }));
    const downlink = segment(candidate({
      isUplink: false,
      coverageName: 'E8WB C Band Europe',
      frequencyGhz: 3.8,
      eirpDbw: 40,
      gtDbk: undefined,
    }));

    const context = buildGeoRfContext({
      linkMode: 'STAR_RETURN',
      uplink,
      downlink,
      coverageLabels: {
        uplink: 'E8WB C Band Receive',
        downlink: 'GEO teleport side - reference allocation',
      },
    });

    expect(context.topology).toBe('RETURN');
    expect(context.band).toBe('C');
    expect(context.uplink.frequencyMHz).toBe(5900);
    expect(context.downlink.frequencyMHz).toBe(3800);
    expect(context.payload.selectedCoverageName).toBe('GEO teleport side - reference allocation');
  });

  it('adds inferred uplink warning from public match without changing RF values', () => {
    const uplink = segment(candidate({ isUplink: true, frequencyGhz: 5.9 }));
    const downlink = segment(candidate({ isUplink: false, frequencyGhz: 3.8 }));
    const context = buildGeoRfContext({ linkMode: 'STAR_RETURN', uplink, downlink });
    const publicMatch = matchPublicTransponders(context, [{
      id: 'tp',
      satelliteName: 'EUTELSAT 8 WEST B',
      downlink: {
        frequencyMHz: 3800,
        polarization: 'H',
        beamName: 'Europe',
        source: 'LYNGSAT',
        confidence: 'HIGH',
      },
      uplink: {
        frequencyMHz: 5900,
        inferenceMethod: 'NORMALIZED_BAND_POSITION',
        source: 'INFERRED',
        confidence: 'LOW',
      },
      transponder: {},
      provenance: { sources: [], notes: [] },
      warnings: [],
    }]);
    const enriched = buildGeoRfContext({ linkMode: 'STAR_RETURN', uplink, downlink, publicFrequencyMatch: publicMatch });

    expect(enriched.uplink.frequencyMHz).toBe(5900);
    expect(enriched.publicFrequencyMatch?.status).toBe('EXACT_MATCH');
    expect(enriched.uplink.warnings).toContain('Public uplink frequency is inferred from band rules.');
  });
});
