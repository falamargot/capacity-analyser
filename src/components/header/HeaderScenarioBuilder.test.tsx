import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { EngineeringConfigureDraft } from '../../types/engineeringConfigure';
import { getCandidateCoverageKey } from '../../utils/geoCoverageSelection';
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

describe('HeaderScenarioBuilder engineering Configure workflow', () => {
  it('preserves horizontal endpoint assumptions as an instant-apply editor', () => {
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
    // Instant apply — no staged-changes machinery or duplicate review remains in the header.
    expect(markup).not.toContain('Review ·');
    expect(markup).not.toContain('No pending changes');
    expect(markup).not.toContain('Discard');
    expect(markup).not.toContain('Apply engineering changes');
    expect(markup).toContain('<select');
  });

  it('reduces the collapsed engineering header to locations and weather only', () => {
    const markup = renderToStaticMarkup(
      <HeaderScenarioBuilder
        siteA={site('Origin', 'Paris')}
        siteB={site('Destination', 'Dakar')}
        onSwap={() => undefined}
        collapsed
        engineeringConfigure={{
          baseline: configureBaseline,
          truths: {},
          candidates: { siteA: [], siteB: [] },
          onApply: () => undefined,
        }}
      />,
    );

    expect(markup).toContain('Collapsed desktop engineering scenario configuration');
    expect(markup).toContain('Paris');
    expect(markup).toContain('Dakar');
    expect(markup.match(/Weather condition/g)).toHaveLength(2);
    expect(markup).not.toContain('Terminal type');
    expect(markup).not.toContain('GEO service');
    expect(markup).not.toContain('LEO service');
    expect(markup).not.toContain('GEO topology');
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
          baseline: {
            ...configureBaseline,
            geoLinkMode: 'STAR_FORWARD',
            selectionPolicy: 'manual',
            siteB: { ...configureBaseline.siteB, location: null },
          },
          truths: {},
          candidates: { siteA: [downlink], siteB: [] },
          onApply: () => undefined,
        }}
      />,
    );

    expect(markup).toContain('E21B Europe A West Transmit');
    expect(markup).not.toContain('EUTELSAT 21B · 4');
  });

  it('only offers site-to-site beams whose satellite is selectable on both active legs', () => {
    const candidate = (
      satelliteId: string,
      coverageKey: string,
      coverageName: string,
      isUplink: boolean,
    ) => ({
      satelliteId,
      satelliteName: satelliteId,
      coverageKey,
      coverageName,
      beamName: coverageName,
      beamId: coverageKey,
      isUplink,
      isSynthesized: false,
    }) as CandidateCoverage;
    const uplinkE16A = candidate('E16A', 'ul-e16a', 'E16A Africa East Receive', true);
    const uplinkE21B = candidate('E21B', 'ul-e21b', 'E21B Western Receive', true);
    const downlinkE16A = candidate('E16A', 'dl-e16a', 'E16A Europe A West Transmit', false);
    const downlinkE21B = candidate('E21B', 'dl-e21b', 'E21B Western Transmit', false);
    const downlinkE10B = candidate('E10B', 'dl-e10b', 'E10B Widebeam Transmit', false);

    const markup = renderToStaticMarkup(
      <HeaderScenarioBuilder
        siteA={site('Origin', 'Mauritania')}
        siteB={site('Destination', 'Golmayo')}
        onSwap={() => undefined}
        engineeringConfigure={{
          baseline: {
            ...configureBaseline,
            geoLinkMode: 'POINT_TO_POINT',
            selectionPolicy: 'manual',
            geoUplinkKeyA: getCandidateCoverageKey(uplinkE16A),
            geoDownlinkKeyB: getCandidateCoverageKey(downlinkE16A),
          },
          truths: {},
          candidates: {
            siteA: [uplinkE16A, uplinkE21B],
            siteB: [downlinkE16A, downlinkE21B, downlinkE10B],
          },
          onApply: () => undefined,
        }}
      />,
    );

    expect(markup).toContain('E16A Africa East Receive');
    expect(markup).toContain('E21B Western Receive');
    expect(markup).toContain('E16A Europe A West Transmit');
    expect(markup).toContain('E21B Western Transmit');
    expect(markup).not.toContain('E10B Widebeam Transmit');
  });
});

describe('HeaderScenarioBuilder single-site destination handling', () => {
  const renderConfigure = (baseline: EngineeringConfigureDraft) =>
    renderToStaticMarkup(
      <HeaderScenarioBuilder
        siteA={site('Origin', 'Paris')}
        siteB={site('Destination', 'Dakar')}
        onSwap={() => undefined}
        engineeringConfigure={{
          baseline,
          truths: {},
          candidates: { siteA: [], siteB: [] },
          onApply: () => undefined,
        }}
      />,
    );

  const SWAP_LABEL = 'Swap Site 1 and Site 2';

  it('keeps Site 2 visible and empty for a one-site GEO scenario', () => {
    const markup = renderConfigure({
      ...configureBaseline,
      technology: 'GEO',
      geoLinkMode: 'STAR_FORWARD',
      leoTopologyMode: 'SINGLE_SITE',
      siteB: { ...configureBaseline.siteB, location: null },
    });

    expect(markup).toContain('Site 2');
    expect(markup).toContain('Add a second site');
    expect(markup).not.toContain('Dakar');
    expect(markup).toContain(SWAP_LABEL);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Clear Origin location');
    expect(markup).toContain('Paris');
  });

  it('shows both service cards while LEO owns the active result focus', () => {
    const markup = renderConfigure({
      ...configureBaseline,
      technology: 'LEO',
      geoLinkMode: 'STAR_RETURN',
      leoTopologyMode: 'SINGLE_SITE',
      siteB: { ...configureBaseline.siteB, location: null },
    });

    expect(markup).toContain('GEO service');
    expect(markup).toContain('LEO service');
    expect(markup).toContain('LEO service');
    expect(markup).toContain('Active');
    expect(markup).toContain('Single Site');
    expect(markup).toContain('Return');
  });

  it('restricts two-site GEO and LEO topologies from the populated Site 2', () => {
    const markup = renderConfigure({ ...configureBaseline, technology: 'GEO', geoLinkMode: 'MESH' });

    expect(markup).toContain('Dakar');
    expect(markup).toContain(SWAP_LABEL);
    expect(markup).toContain('Mesh');
    expect(markup).toContain('Point-to-Point');
    expect(markup).toContain('Site-to-Site');
    expect(markup).not.toContain('Clear Origin location');
    expect(markup).toContain('Clear Destination location');
    expect(markup).toContain('Traffic direction for GEO and LEO');
  });
});
