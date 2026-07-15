import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../../types/analysis';
import type { EngineeringConfigureDraft } from '../../../types/engineeringConfigure';
import EngineeringContextConfigureShell from '../shared/EngineeringContextConfigureShell';

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

const downlink = {
  satelliteId: 'sat-1',
  satelliteName: 'EUTELSAT TEST',
  coverageKey: 'sat-1::downlink',
  coverageName: 'Europe downlink',
  beamId: 'beam-1',
  beamName: 'Europe',
  isUplink: false,
} as CandidateCoverage;

describe('EngineeringContextConfigureShell', () => {
  it('publishes shared GEO context and explicit automatic Path Selection', () => {
    const markup = renderToStaticMarkup(
      <EngineeringContextConfigureShell
        technology="GEO"
        baseline={baseline}
        candidates={{
          siteA: [downlink],
          siteB: [],
          resolved: {
            siteA: { uplink: null, downlink },
            siteB: { uplink: null, downlink: null },
          },
        }}
        onConfigure={() => undefined}
      />,
    );

    expect(markup).toContain('Context &amp; Configure');
    expect(markup).toContain('Forward');
    expect(markup).toContain('Path Selection');
    expect(markup).toContain('Automatic');
    expect(markup).toContain('Europe downlink');
    expect(markup).not.toContain('EUTELSAT TEST · Europe');
    expect(markup).toContain('Configure GEO engineering scenario');
  });

  it('uses the same shell hierarchy for LEO without inventing GEO path controls', () => {
    const markup = renderToStaticMarkup(
      <EngineeringContextConfigureShell
        technology="LEO"
        baseline={{ ...baseline, technology: 'LEO', leoTopologyMode: 'SITE_TO_SITE', siteB: { ...site, location: { label: 'Dakar, Senegal', lat: 14.7167, lng: -17.4677 } } }}
        candidates={{ siteA: [], siteB: [] }}
        onConfigure={() => undefined}
      />,
    );

    expect(markup).toContain('LEO engineering scenario');
    expect(markup).toContain('Site-to-Site');
    expect(markup).toContain('Site A → Site B');
    expect(markup).not.toContain('Path Selection');
  });
});
