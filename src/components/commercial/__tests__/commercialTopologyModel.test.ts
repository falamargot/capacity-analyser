import { describe, expect, it } from 'vitest';
import { buildCommercialTopology } from '../commercialTopologyModel';
import type { CommercialScenarioViewModel } from '../commercialViewModel';

/** Minimal view model stub — only the fields the topology builder reads. */
function viewModel(overrides: {
  technology: 'GEO' | 'LEO';
  siteA?: string;
  siteB?: string;
  routeAvailable?: boolean;
  display?: Partial<CommercialScenarioViewModel['display']>;
}): CommercialScenarioViewModel {
  return {
    commercialDisplayTechnology: overrides.technology,
    siteA: overrides.siteA ? { name: overrides.siteA } : undefined,
    siteB: overrides.siteB ? { name: overrides.siteB } : undefined,
    activeRouteAvailable: overrides.routeAvailable ?? true,
    display: {
      serviceStatusLabel: 'Active',
      ...overrides.display,
    },
  } as CommercialScenarioViewModel;
}

describe('buildCommercialTopology — GEO', () => {
  it('uses the real Site B name for a customer destination', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'GEO',
      siteA: 'Paris',
      siteB: 'Dakar',
      display: { satelliteName: 'EUTELSAT 21B', destinationEndpointKind: 'customer' },
    }));
    expect(topology.originLabel).toBe('Paris');
    expect(topology.satelliteLabels).toEqual(['EUTELSAT 21B']);
    expect(topology.destinationKind).toBe('site');
    expect(topology.destinationLabel).toBe('Dakar');
  });

  it('shows a gateway destination as a gateway, not a phantom Site B', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'GEO',
      siteA: 'Paris',
      display: {
        satelliteName: 'EUTELSAT 21B',
        destinationEndpointKind: 'geo_gateway',
        destinationReceivingSide: 'Rambouillet GW',
      },
    }));
    expect(topology.destinationKind).toBe('gateway');
    expect(topology.destinationLabel).toBe('Rambouillet GW');
  });

  it('reports no destination for a GEO single-point route (no Site B, no gateway)', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'GEO',
      siteA: 'Paris',
      display: { satelliteName: 'EUTELSAT 21B', destinationEndpointKind: 'customer' },
    }));
    expect(topology.destinationKind).toBe('none');
    expect(topology.destinationLabel).toBe('No destination');
  });

  it('falls back to a generic satellite label when none is resolved', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'GEO',
      display: { satelliteName: '--' },
    }));
    expect(topology.originLabel).toBe('Site A');
    expect(topology.satelliteLabels).toEqual(['GEO satellite']);
  });
});

describe('buildCommercialTopology — LEO', () => {
  it('renders a two-satellite backbone chain when both satellites resolve', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'LEO',
      siteA: 'Paris',
      siteB: 'New York',
      display: { satelliteNameA: 'ONEWEB-0184', satelliteNameB: 'ONEWEB-0653', snpA: 'Mornac' },
    }));
    expect(topology.isSiteToSite).toBe(true);
    expect(topology.hasBackbone).toBe(true);
    expect(topology.satelliteLabels).toEqual(['ONEWEB-0184', 'ONEWEB-0653']);
    expect(topology.destinationKind).toBe('site');
    expect(topology.destinationLabel).toBe('New York');
  });

  it('renders a single satellite to an SNP portal for single-site LEO', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'LEO',
      siteA: 'Paris',
      siteB: 'Mornac', // per fix A, siteB carries the SNP name in single-site
      display: { satelliteNameA: 'ONEWEB-0184', satelliteNameB: '--', snpA: 'Mornac' },
    }));
    expect(topology.isSiteToSite).toBe(false);
    expect(topology.hasBackbone).toBe(false);
    expect(topology.satelliteLabels).toEqual(['ONEWEB-0184']);
    expect(topology.destinationKind).toBe('portal');
    expect(topology.destinationLabel).toBe('Mornac');
  });

  it('reports no destination when a single-site LEO route has no portal resolved', () => {
    const topology = buildCommercialTopology(viewModel({
      technology: 'LEO',
      siteA: 'Paris',
      routeAvailable: false,
      display: { satelliteNameA: 'ONEWEB-0184', satelliteNameB: '--', snpA: '--' },
    }));
    expect(topology.destinationKind).toBe('none');
    expect(topology.destinationLabel).toBe('Network');
    expect(topology.routeAvailable).toBe(false);
  });
});
