import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import CommercialRouteStrip from '../CommercialRouteStrip';
import type { CommercialRouteSegment } from '../commercialViewModel';

const segment = (
  id: CommercialRouteSegment['id'],
  type: CommercialRouteSegment['type'],
): CommercialRouteSegment => ({
  id,
  type,
  title: id,
  status: 'healthy',
  customerStatus: 'available',
  role: id,
  isRouteParticipant: true,
});

describe('CommercialRouteStrip journey order', () => {
  it('places Destination Site between Origin Site and Space Coverage', () => {
    const markup = renderToStaticMarkup(
      <CommercialRouteStrip
        segments={[
          segment('access', 'access'),
          segment('satellite', 'satellite'),
          segment('backhaul', 'backhaul'),
          segment('siteB', 'destination'),
          segment('summary', 'summary'),
        ]}
        selectedSegmentId="access"
        onSelectedSegmentChange={vi.fn()}
      />,
    );

    const originIndex = markup.indexOf('Origin Site');
    const destinationIndex = markup.indexOf('Destination Site');
    const coverageIndex = markup.indexOf('Space Coverage');

    expect(originIndex).toBeGreaterThanOrEqual(0);
    expect(destinationIndex).toBeGreaterThan(originIndex);
    expect(coverageIndex).toBeGreaterThan(destinationIndex);
  });
});
