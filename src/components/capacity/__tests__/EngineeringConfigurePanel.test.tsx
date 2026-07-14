import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
    expect(markup).toContain('Consequence preview');
    expect(markup).toContain('No pending changes.');
    expect(markup).toContain('Apply and recalculate');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*(?:<[^>]+>)*Apply and recalculate/);
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
});
