import { describe, expect, it } from 'vitest';
import type { ActiveLeoRouteEvidence } from '../../../utils/activeLeoRouteEvidence';
import type { NetworkLayerResult } from '../../../utils/geoNetworkLayer';
import {
  buildCommercialResilienceAssessment,
  buildGeoContentionEvidence,
  buildLeoContentionEvidence,
  buildOperationalEvidence,
  buildTerminalMobilityEvidence,
  buildUnassessedOperationalEvidence,
} from '../commercialOperationalEvidence';

function network(contentionRatio: number): NetworkLayerResult {
  return {
    peakRfMbps: 100,
    protocolEfficiency: 1,
    protocolAdjustedMbps: 100,
    contentionRatio,
    effectiveThroughputMbps: 100 / contentionRatio,
    finalThroughputMbps: 100 / contentionRatio,
    limitingFactor: contentionRatio > 1 ? 'contention' : 'none',
  };
}

describe('commercial operational evidence — mobility', () => {
  it('uses the selected terminal family rather than orbit as the mobility gate', () => {
    expect(buildTerminalMobilityEvidence({
      technology: 'leo',
      terminalType: 'fixed',
      terminalLabel: 'OW70L',
    }).value).toBe(false);
    expect(buildTerminalMobilityEvidence({
      technology: 'geo',
      terminalType: 'maritime',
      terminalLabel: 'Maritime VSAT',
    }).value).toBe(true);
  });

  it('keeps a missing terminal profile unknown', () => {
    const evidence = buildTerminalMobilityEvidence({ technology: 'leo', terminalType: null });
    expect(evidence.value).toBeNull();
    expect(evidence.note).toMatch(/not assessed/i);
  });

  it('requires an aviation-class terminal when the platform is an aircraft', () => {
    expect(buildTerminalMobilityEvidence({
      technology: 'leo',
      terminalType: 'maritime',
      requiredClass: 'aviation',
    }).value).toBe(false);
    const aviation = buildTerminalMobilityEvidence({
      technology: 'geo',
      terminalType: 'aviation',
      requiredClass: 'aviation',
    });
    expect(aviation.value).toBe(true);
    expect(aviation.note).toMatch(/aircraft/i);
  });
});

describe('commercial operational evidence — load semantics', () => {
  it('publishes the conservative LEO simulated-session count without calling it operator contention', () => {
    const route = {
      debugEvidence: {
        siteA: {
          downlink: { network: { activeUsers: 7 } },
          uplink: { network: { activeUsers: 4 } },
        },
        siteB: {
          downlink: { network: { activeUsers: 12 } },
          uplink: { network: { activeUsers: 6 } },
        },
      },
    } as unknown as ActiveLeoRouteEvidence;
    const evidence = buildLeoContentionEvidence(route);
    expect(evidence.value).toBe(12);
    expect(evidence.nature).toBe('estimated');
    expect(evidence.note).toMatch(/not operator telemetry/i);
  });

  it('publishes GEO topology sharing as a model assumption, not measured load', () => {
    const evidence = buildGeoContentionEvidence({
      forward: network(1),
      reverse: network(3),
    });
    expect(evidence.value).toBe(3);
    expect(evidence.nature).toBe('modeled');
    expect(evidence.note).toMatch(/planning assumption/i);
    expect(evidence.note).toMatch(/not scored against LEO/i);
  });

  it('keeps duty cycle and per-technology diversity explicitly unassessed', () => {
    const evidence = buildUnassessedOperationalEvidence('leo');
    expect(evidence.dutyCycle?.value).toBeNull();
    expect(evidence.dutyCycle?.note).toMatch(/handover factors are not relabelled/i);
    expect(evidence.serviceDiversity?.value).toBeNull();
    expect(evidence.serviceDiversity?.note).toMatch(/does not prove/i);
  });

  it('builds one compact evidence bundle without a second calculation path', () => {
    const bundle = buildOperationalEvidence({
      mobility: { technology: 'geo', terminalType: 'aviation' },
      contention: buildGeoContentionEvidence({ forward: network(1) }),
    });
    expect(bundle.mobilityFit?.value).toBe(true);
    expect(bundle.contention?.value).toBe(1);
    expect(bundle.dutyCycle?.value).toBeNull();
  });
});

describe('commercial operational evidence — pairwise resilience', () => {
  it('separates verified independence, shared RF exposure and unknown common-risk domains', () => {
    const assessment = buildCommercialResilienceAssessment({
      geoRouteAvailable: true,
      leoRouteAvailable: true,
      geoGroundNode: 'Paris Gateway',
      leoGroundNodes: ['Mornac SNP'],
      geoBand: 'Ku',
      leoBand: 'Ku',
    });
    expect(assessment.independentDomains).toEqual(expect.arrayContaining([
      expect.stringMatching(/orbital/i),
      expect.stringMatching(/ground entry/i),
    ]));
    expect(assessment.sharedRiskDomains).toContain('Shared Ku-band propagation and interference exposure');
    expect(assessment.unknownDomains).toEqual(expect.arrayContaining([
      expect.stringMatching(/control-plane/i),
      expect.stringMatching(/backhaul/i),
    ]));
    expect(assessment.assessedDomainCount).toBe(3);
    expect(assessment.totalDomainCount).toBe(5);
  });

  it('never claims ground or band independence when route evidence is missing', () => {
    const assessment = buildCommercialResilienceAssessment({
      geoRouteAvailable: true,
      leoRouteAvailable: true,
    });
    expect(assessment.independentDomains).toEqual(['Distinct orbital service architectures (GEO and LEO)']);
    expect(assessment.unknownDomains).toEqual(expect.arrayContaining([
      expect.stringMatching(/ground-entry/i),
      expect.stringMatching(/RF-band/i),
    ]));
    expect(assessment.assessedDomainCount).toBe(1);
  });

  it('deduplicates repeated LEO ground-entry names before presenting resilience evidence', () => {
    const assessment = buildCommercialResilienceAssessment({
      geoRouteAvailable: true,
      leoRouteAvailable: true,
      geoGroundNode: 'Cagliari',
      leoGroundNodes: ['Mornac', ' mornac ', 'MORNAC'],
    });

    expect(assessment.independentDomains).toContain('Distinct named ground entry points (Cagliari / Mornac)');
    expect(assessment.independentDomains.join(' ')).not.toContain('Mornac / Mornac');
  });

  it('reports shared and distinct ground domains separately when both are demonstrated', () => {
    const assessment = buildCommercialResilienceAssessment({
      geoRouteAvailable: true,
      leoRouteAvailable: true,
      geoGroundNode: 'Mornac',
      leoGroundNodes: ['Mornac', 'Manassas', 'manassas'],
    });

    expect(assessment.sharedRiskDomains).toContain('Shared named ground entry point (Mornac)');
    expect(assessment.independentDomains).toContain('Distinct named ground entry points (Mornac / Manassas)');
  });
});
