import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GatewayDetails from '../GatewayDetails';
import { GEO_GATEWAYS } from '../globe/GlobeConfig';

const gatewayByCode = (teleportCode: string) => {
  const gateway = GEO_GATEWAYS.find((entry) => entry.teleportCode === teleportCode);
  if (!gateway) throw new Error(`Missing GEO ground site fixture: ${teleportCode}`);
  return gateway;
};

describe('GatewayDetails operational capability display', () => {
  it('shows the physical site separately from its operational capabilities', () => {
    const html = renderToStaticMarkup(
      <GatewayDetails gateway={gatewayByCode('RAM')} satellites={[]} />
    );

    expect(html).toContain('Physical Ground Site');
    expect(html).toContain('Operational Capabilities');
    expect(html).toContain('Site ID');
    expect(html).toContain('Public code');
    expect(html).toContain('Satellite Control');
    expect(html).toContain('Traffic Teleport');
  });

  it('labels traffic teleport confidence and RF endpoint eligibility distinctly', () => {
    const html = renderToStaticMarkup(
      <GatewayDetails gateway={gatewayByCode('RAM')} satellites={[]} />
    );

    expect(html).toContain('TRAFFIC_TELEPORT');
    expect(html).toContain('PUBLICLY_LIKELY');
    expect(html).toContain('ELIGIBLE_PUBLICLY_LIKELY');
    expect(html).toContain('STAR RF endpoint');
  });

  it('shows monitoring-only sites as operational monitoring, not traffic gateways', () => {
    const html = renderToStaticMarkup(
      <GatewayDetails gateway={gatewayByCode('DUB')} satellites={[]} />
    );

    expect(html).toContain('Monitoring');
    expect(html).toContain('MONITORING');
    expect(html).toContain('Not a traffic RF endpoint');
    expect(html).not.toContain('Traffic Teleport');
    expect(html).not.toContain('Traffic gateway');
  });

  it('shows TT&amp;C-only sites as operational TT&amp;C, not traffic gateways', () => {
    const html = renderToStaticMarkup(
      <GatewayDetails gateway={gatewayByCode('PER')} satellites={[]} />
    );

    expect(html).toContain('TT&amp;C');
    expect(html).toContain('TTC');
    expect(html).toContain('Not a traffic RF endpoint');
    expect(html).not.toContain('Traffic Teleport');
    expect(html).not.toContain('Traffic gateway');
  });
});
