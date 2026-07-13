import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeaderRouteStatusPanel, type HeaderRouteStatusItem } from './HeaderScenarioBuilder';

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
