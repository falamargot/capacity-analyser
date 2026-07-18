import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { EngineeringConfigureDraft } from '../../types/engineeringConfigure';
import HeaderScenarioBuilder, { HeaderRouteStatusPanel, type HeaderRouteStatusItem, type SiteConfig } from './HeaderScenarioBuilder';

const route: HeaderRouteStatusItem = {
  technology: 'GEO',
  statusLabel: 'Available',
  statusTone: 'ok',
  throughput: '120 Mbps',
  latency: '76 ms',
  upload: '18 Mbps',
  limiting: 'Beam sharing',
  selected: true,
};

describe('HeaderRouteStatusPanel', () => {
  it('keeps engineering comparison cards focused on selection and status', () => {
    const markup = renderToStaticMarkup(
      <HeaderRouteStatusPanel routeStatus={{ items: [route], comparisonOnly: true }} />,
    );

    expect(markup).toContain('GEO');
    expect(markup).toContain('Available');
    expect(markup).toContain('Selected');
    expect(markup).not.toContain('120 Mbps');
    expect(markup).not.toContain('76 ms');
    expect(markup).not.toContain('18 Mbps');
    expect(markup).not.toContain('Beam sharing');
  });

  it('preserves the full commercial comparison card by default', () => {
    const markup = renderToStaticMarkup(
      <HeaderRouteStatusPanel routeStatus={{ items: [route] }} />,
    );

    expect(markup).toContain('120 Mbps');
    expect(markup).toContain('76 ms');
    expect(markup).toContain('18 Mbps');
    expect(markup).toContain('Beam sharing');
  });
});

const site = (roleLabel: string, label: string): SiteConfig => ({
  endpoint: { label },
  roleLabel,
  fallback: label,
  onSelect: () => undefined,
  terminals: {
    geoRFClassId: 'ku_standard_vsat',
    geoTerminalType: 'fixed',
    onGeoTerminalTypeChange: () => undefined,
    onGeoRFClassChange: () => undefined,
    leoTerminalType: 'fixed',
    onLeoTerminalTypeChange: () => undefined,
    leoTerminalModelId: 'ow70l',
    onLeoTerminalModelIdChange: () => undefined,
  },
  weather: {
    weatherType: 'clear',
    onWeatherTypeChange: () => undefined,
  },
});

const configureBaseline: EngineeringConfigureDraft = {
  technology: 'GEO',
  geoLinkMode: 'MESH',
  leoTopologyMode: 'SITE_TO_SITE',
  direction: 'forward',
  selectionPolicy: 'auto',
  geoUplinkKeyA: null,
  geoDownlinkKeyA: null,
  geoUplinkKeyB: null,
  geoDownlinkKeyB: null,
  siteA: {
    location: { label: 'Paris', lat: 48.8566, lng: 2.3522 },
    geoTerminalType: 'fixed',
    geoRFClassId: 'ku_standard_vsat',
    geoRFCustomParams: null,
    leoTerminalType: 'fixed',
    leoTerminalModelId: 'ow70l',
    weatherType: 'clear',
    autoWeatherEnabled: true,
  },
  siteB: {
    location: { label: 'Dakar', lat: 14.7167, lng: -17.4677 },
    geoTerminalType: 'fixed',
    geoRFClassId: 'ku_standard_vsat',
    geoRFCustomParams: null,
    leoTerminalType: 'fixed',
    leoTerminalModelId: 'ow70l',
    weatherType: 'clear',
    autoWeatherEnabled: true,
  },
};

describe('HeaderScenarioBuilder transactional Configure workflow', () => {
  it('preserves horizontal endpoint assumptions and owns the Phase 2 transaction actions', () => {
    const markup = renderToStaticMarkup(
      <HeaderScenarioBuilder
        siteA={site('Origin', 'Paris')}
        siteB={site('Destination', 'Dakar')}
        onSwap={() => undefined}
        engineeringConfigure={{
          baseline: configureBaseline,
          truths: {},
          candidates: { siteA: [], siteB: [] },
          onApply: () => undefined,
        }}
      />,
    );

    expect(markup).toContain('Desktop engineering scenario configuration');
    expect(markup).toContain('Origin');
    expect(markup).toContain('Destination');
    expect(markup).toContain('Paris');
    expect(markup).toContain('Dakar');
    expect(markup).toContain('Weather condition');
    expect(markup).toContain('RF</span>');
    expect(markup).toContain('No pending changes');
    expect(markup).toContain('Discard');
    expect(markup).toContain('Apply engineering changes');
    expect(markup).toContain('<select');
  });

  it('uses canonical engineering coverage names for manual GEO options', () => {
    const downlink = {
      satelliteName: 'EUTELSAT 21B',
      satelliteId: 'sat-21b',
      coverageKey: 'coverage-4',
      coverageName: 'E21B Europe A West Transmit',
      beamName: '4',
      beamId: '4',
      isUplink: false,
      isSynthesized: false,
    } as CandidateCoverage;
    const markup = renderToStaticMarkup(
      <HeaderScenarioBuilder
        siteA={site('Origin', 'Paris')}
        siteB={site('Destination', 'Dakar')}
        onSwap={() => undefined}
        engineeringConfigure={{
          baseline: { ...configureBaseline, geoLinkMode: 'STAR_FORWARD', selectionPolicy: 'manual' },
          truths: {},
          candidates: { siteA: [downlink], siteB: [] },
          onApply: () => undefined,
        }}
      />,
    );

    expect(markup).toContain('E21B Europe A West Transmit');
    expect(markup).not.toContain('EUTELSAT 21B · 4');
  });
});
