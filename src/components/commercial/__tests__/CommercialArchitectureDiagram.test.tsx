import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommercialArchitectureDiagram } from '../CommercialNarrativePanel';
import type { CommercialTopologyModel } from '../commercialTopologyModel';

function topology(overrides: Partial<CommercialTopologyModel>): CommercialTopologyModel {
  return {
    technology: 'GEO',
    originLabel: 'Paris',
    satelliteLabels: ['EUTELSAT 21B'],
    isSiteToSite: false,
    hasBackbone: false,
    destinationKind: 'site',
    destinationLabel: 'Dakar',
    routeAvailable: true,
    ...overrides,
  };
}

describe('CommercialArchitectureDiagram', () => {
  it('renders the resolved origin, satellite and Site B labels for GEO', () => {
    const markup = renderToStaticMarkup(<CommercialArchitectureDiagram topology={topology({})} />);
    expect(markup).toContain('Paris');
    expect(markup).toContain('EUTELSAT 21B');
    expect(markup).toContain('Dakar');
    expect(markup).toContain('DIRECT SATELLITE RELAY');
  });

  it('shows a gateway destination as a gateway, not Site B', () => {
    const markup = renderToStaticMarkup(<CommercialArchitectureDiagram topology={topology({
      destinationKind: 'gateway',
      destinationLabel: 'Rambouillet GW',
    })} />);
    expect(markup).toContain('Rambouillet GW');
    expect(markup).toContain('Gateway');
    expect(markup).toContain('SATELLITE TO GATEWAY');
  });

  it('drops the destination node entirely when no destination is resolved (GEO single-point)', () => {
    const markup = renderToStaticMarkup(<CommercialArchitectureDiagram topology={topology({
      destinationKind: 'none',
      destinationLabel: 'No destination',
    })} />);
    // Origin -> satellite only: the caption explains it, and there is no
    // destination node, no placeholder text, and no "Downlink" leg caption.
    expect(markup).toContain('COVERAGE AT ORIGIN');
    expect(markup).toContain('Paris');
    expect(markup).toContain('EUTELSAT 21B');
    expect(markup).not.toContain('No dest.');
    expect(markup).not.toContain('No destination');
    expect(markup).not.toContain('Downlink');
  });

  it('renders the two-satellite backbone chain for LEO site-to-site', () => {
    const markup = renderToStaticMarkup(<CommercialArchitectureDiagram topology={topology({
      technology: 'LEO',
      satelliteLabels: ['ONEWEB-0184', 'ONEWEB-0653'],
      isSiteToSite: true,
      hasBackbone: true,
      destinationLabel: 'New York',
    })} />);
    expect(markup).toContain('BACKBONE');
    expect(markup).toContain('ONEWEB-0184');
    expect(markup).toContain('ONEWEB-0653');
    expect(markup).toContain('New York');
  });

  it('renders a single satellite to an SNP portal for single-site LEO', () => {
    const markup = renderToStaticMarkup(<CommercialArchitectureDiagram topology={topology({
      technology: 'LEO',
      satelliteLabels: ['ONEWEB-0184'],
      isSiteToSite: false,
      destinationKind: 'portal',
      destinationLabel: 'Mornac',
    })} />);
    expect(markup).not.toContain('BACKBONE');
    expect(markup).toContain('ONEWEB-0184');
    expect(markup).toContain('Mornac');
    expect(markup).toContain('SNP portal');
    expect(markup).toContain('SITE TO SNP PORTAL');
  });
});
