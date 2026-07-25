import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GeoModemSelect from '../GeoModemSelect';

describe('GeoModemSelect', () => {
  it('offers a "No modem" choice and every catalogue modem', () => {
    const html = renderToStaticMarkup(
      <GeoModemSelect label="Site A modem" value={null} onChange={() => {}} />,
    );
    expect(html).toContain('No modem');
    expect(html).toContain('iDirect MDM5010');
    expect(html).toContain('iDirect iQ 200');
    expect(html).toContain('Comtech CDM-780');
  });

  it('shows the estimated-ceiling hint when no modem is selected', () => {
    const html = renderToStaticMarkup(
      <GeoModemSelect label="Site A modem" value={null} onChange={() => {}} />,
    );
    expect(html).toContain('Estimated ceiling until a modem is set');
  });

  it('summarises directional caps for a selected modem', () => {
    const html = renderToStaticMarkup(
      <GeoModemSelect label="Site A modem" value="idirect_mdm5010" onChange={() => {}} />,
    );
    expect(html).toContain('300 TX / 800 RX Mbps');
  });

  it('flags unpublished MESH support as unverified rather than inventing incompatibility', () => {
    const html = renderToStaticMarkup(
      <GeoModemSelect label="Site A modem" value="idirect_mdm5010" onChange={() => {}} meshMode />,
    );
    expect(html).toContain('MESH unverified');
  });

  it('does not flag a mesh-capable modem', () => {
    const html = renderToStaticMarkup(
      <GeoModemSelect label="Site A modem" value="idirect_iq200" onChange={() => {}} meshMode />,
    );
    expect(html).not.toContain('not MESH-capable');
  });
});
