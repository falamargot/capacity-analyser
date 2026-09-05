import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../../../modules/airTraffic/airTrafficService';
import IFCNarrativePanel from '../IFCNarrativePanel';
import type { CommercialScenarioViewModel } from '../commercialViewModel';

const aircraft: Aircraft = {
  icao24: 'abc123',
  callsign: 'AF1234',
  latitude: 48,
  longitude: 2,
  baro_altitude: 10_000,
  velocity: 240,
  heading: 90,
  on_ground: false,
  last_contact: 1,
  altitude_km: 10,
  speed_kmh: 850,
};

const viewModel = {
  serviceStatus: 'active',
  commercialDisplayTechnology: 'LEO',
  downloadMbps: 80,
  uploadMbps: 12,
  rttMs: 321,
  recommendation: {
    technology: 'insufficient_data',
    reasonCategory: 'INSUFFICIENT_DATA',
    label: 'Insufficient Data',
    chipLabel: 'Insufficient data',
    reason: 'The dominant mobility compatibility criterion cannot be compared across the surviving technologies',
    message: 'Explicit terminal mobility evidence is required.',
    expectedExperience: 'Waiting for comparable route evidence.',
  },
  comparison: { options: [], recommendation: {} },
  display: {
    linkQualityA: 'available',
    satelliteNameA: 'ONEWEB-0012',
    elevationA: '42 deg',
  },
} as unknown as CommercialScenarioViewModel;

describe('IFCNarrativePanel evidence honesty', () => {
  it('uses calculated latency and does not infer aircraft type, passengers, revenue, or continuous service', () => {
    const html = renderToStaticMarkup(<IFCNarrativePanel aircraft={aircraft} viewModel={viewModel} isOpen />);

    expect(html).toContain('321 ms');
    expect(html).toContain('Tracked aircraft');
    expect(html).toContain('does not establish continuous in-flight service');
    expect(html).toContain('not estimated from the callsign');
    expect(html).not.toContain('IFC Revenue');
    expect(html).not.toContain('passengers');
    expect(html).not.toContain('~600 ms');
    expect(html).not.toContain('ground-network speeds throughout the flight');
  });
  it('keeps GEO artwork and continuity claims consistent with its selected route', () => {
    const geo = { ...viewModel, commercialDisplayTechnology: 'GEO' } as CommercialScenarioViewModel;
    const html = renderToStaticMarkup(<IFCNarrativePanel aircraft={aircraft} viewModel={geo} isOpen />);
    expect(html).toContain('>GEO</text>');
    expect(html).not.toContain('>LEO</text>');
    expect(html).not.toContain('FL350');
    expect(html).toContain('does not establish continuous in-flight service');
    expect(html).toContain('Planning estimate');
  });

});
