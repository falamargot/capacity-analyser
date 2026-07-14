import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../types/satellites';
import SatelliteScreenLabels from './SatelliteScreenLabels';

const makeSatellite = (name: string, orbitType: 'GEO' | 'LEO'): SatelliteData => ({
  id: name,
  name,
  noradId: name,
  coverageFileId: null,
  type: orbitType === 'GEO' ? 'EUTELSAT' : 'ONEWEB',
  orbitType,
  opsStatus: 'operational',
  satrec: {},
  position: { lat: 10, lng: 20, alt: orbitType === 'GEO' ? 35_786 : 1_200 },
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 100, ka: 100 },
    availability: 0.99,
  },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
});

describe('SatelliteScreenLabels mobile engineering identity', () => {
  it.each([
    ['ONEWEB-0549', 'LEO' as const],
    ['EUTELSAT 21B', 'GEO' as const],
  ])('shows the resolved %s identifier instead of a generic technology label', (name, orbitType) => {
    const markup = renderToStaticMarkup(
      <SatelliteScreenLabels
        viewerRef={createRef()}
        containerRef={createRef()}
        highlightedSatellites={[{
          satellite: makeSatellite(name, orbitType),
          isManuallySelected: false,
          isRouteParticipant: true,
        }]}
        isMobileViewport
      />,
    );

    expect(markup).toContain(`title="${name}"`);
    expect(markup).toContain(`>${name}</div>`);
    expect(markup).toContain('truncate whitespace-nowrap');
  });
});
