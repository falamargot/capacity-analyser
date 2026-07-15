import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../../types/analysis';
import type { EngineeringConfigureDraft } from '../../../types/engineeringConfigure';
import type { EngineeringTruth } from '../../../utils/engineeringAnalysisViewModel';
import EngineeringConfigurePanel from '../EngineeringConfigurePanel';

const site = {
  location: { label: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  geoTerminalType: 'fixed' as const,
  geoRFClassId: 'ku_standard_vsat' as const,
  geoRFCustomParams: null,
  leoTerminalType: 'fixed' as const,
  leoTerminalModelId: 'ow70l',
  weatherType: 'clear' as const,
  autoWeatherEnabled: true,
};

const baseline: EngineeringConfigureDraft = {
  technology: 'GEO',
  geoLinkMode: 'STAR_FORWARD',
  leoTopologyMode: 'SINGLE_SITE',
  direction: 'forward',
  selectionPolicy: 'auto',
  geoUplinkKeyA: null,
  geoDownlinkKeyA: null,
  geoUplinkKeyB: null,
  geoDownlinkKeyB: null,
  siteA: site,
  siteB: { ...site, location: null },
};

const truth: EngineeringTruth = {
  technology: 'GEO',
  topology: 'Star Forward',
  state: 'available',
  tone: 'good',
  headline: 'Service available',
  summary: 'The selected path closes.',
  primaryMetrics: [{
    label: 'Delivered downlink',
    value: 42,
    display: '42 Mbps',
    provenance: 'delivered',
  }],
  diagnosticMetrics: [],
  causeChain: [],
};

const manualDownlink = {
  satelliteName: 'EUTELSAT 10B',
  satelliteId: 'sat-10b',
  coverageKey: 'coverage-68',
  coverageName: 'E10B Euro-MENA FSS Receive',
  beamName: '68',
  beamId: '68',
  isUplink: false,
  isSynthesized: false,
} as CandidateCoverage;

describe('EngineeringConfigurePanel', () => {
  it('renders the shared transactional editor around the published Engineering Truth', () => {
    const markup = renderToStaticMarkup(
      <EngineeringConfigurePanel
        baseline={baseline}
        truths={{ GEO: truth }}
        candidates={{ siteA: [], siteB: [] }}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(markup).toContain('Configure engineering scenario');
    expect(markup).toContain('Published baseline · Engineering Truth');
    expect(markup).toContain('Service available · 42 Mbps');
    expect(markup).toContain('Terminal &amp; weather assumptions');
    expect(markup).toContain('Path selection');
    expect(markup).toContain('Pending scenario changes');
    expect(markup).toContain('No pending changes.');
    expect(markup).toContain('Apply and recalculate');
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('role="radio"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*(?:<[^>]+>)*Apply and recalculate/);
  });

  it('makes the manual GEO override and return-to-Automatic behavior explicit', () => {
    const markup = renderToStaticMarkup(
      <EngineeringConfigurePanel
        baseline={{ ...baseline, selectionPolicy: 'manual' }}
        truths={{ GEO: truth }}
        candidates={{ siteA: [manualDownlink], siteB: [] }}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(markup).toContain('Return to Automatic selection');
    expect(markup).toContain('clears the staged satellite and beam overrides');
    expect(markup).toContain('The existing route engine selects the path after Apply.');
    expect(markup).toContain('E10B Euro-MENA FSS Receive');
    expect(markup).not.toContain('EUTELSAT 10B · 68');
  });

  it('keeps the same full editor anatomy for the LEO mobile/desktop sibling surface', () => {
    const leoTruth: EngineeringTruth = { ...truth, technology: 'LEO', topology: 'Single Site' };
    const markup = renderToStaticMarkup(
      <EngineeringConfigurePanel
        baseline={{ ...baseline, technology: 'LEO' }}
        truths={{ LEO: leoTruth }}
        candidates={{ siteA: [], siteB: [] }}
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(markup).toContain('LEO topology');
    expect(markup).toContain('Terminal &amp; weather assumptions');
    expect(markup).not.toContain('Path selection');
  });

  it('keeps the mobile Configure surface input-focused and returns to Summary', () => {
    const markup = renderToStaticMarkup(
      <EngineeringConfigurePanel
        baseline={baseline}
        truths={{ GEO: truth }}
        candidates={{ siteA: [], siteB: [] }}
        showPublishedResultSummary={false}
        returnLabel="Summary"
        onCancel={() => undefined}
        onApply={() => undefined}
      />,
    );

    expect(markup).toContain('Engineering scenario');
    expect(markup).toContain('Technology &amp; path');
    expect(markup).toContain('Endpoints');
    expect(markup).toContain('Terminal &amp; weather assumptions');
    expect(markup).toContain('Pending scenario changes');
    expect(markup).toContain('Summary');
    expect(markup).not.toContain('Published baseline · Engineering Truth');
    expect(markup).not.toContain('Service available · 42 Mbps');
  });
});
