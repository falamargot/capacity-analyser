import { describe, expect, it } from 'vitest';
import { lyngSatAdapter, type LyngSatLikeInput } from '../lyngSatAdapter';

describe('lyngSatAdapter', () => {
  it('parses LyngSat-like rows into normalized public transponders without inferring uplink', () => {
    const input: LyngSatLikeInput = {
      source: 'LYNGSAT',
      satelliteName: 'EUTELSAT Example',
      orbitalPosition: '10E',
      retrievedAt: '2026-04-30T00:00:00.000Z',
      rows: [{
        frequency: '11,727 MHz',
        polarization: 'Vertical',
        transponderNumber: 'C1',
        transponderName: 'TP C1',
        beamName: 'Widebeam',
        eirp: '50 dBW',
        system: 'DVB-S2',
        sr: '30000',
        fec: '3/4',
      }],
    };

    const parsed = lyngSatAdapter.parse(input);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].downlink).toMatchObject({
      frequencyMHz: 11727,
      polarization: 'V',
      beamName: 'Widebeam',
      source: 'LYNGSAT',
      confidence: 'HIGH',
    });
    expect(parsed[0].uplink).toMatchObject({
      inferenceMethod: 'UNKNOWN',
      source: 'UNKNOWN',
      confidence: 'UNKNOWN',
    });
    expect(parsed[0].transponder).toMatchObject({
      publicName: 'TP C1',
      publicNumber: 'C1',
      eirpDbw: 50,
      symbolRate: 30000,
      fec: '3/4',
    });
  });

  it('drops rows with missing downlink frequency and marks incomplete rows as medium confidence', () => {
    const parsed = lyngSatAdapter.parse({
      source: 'LYNGSAT',
      satelliteName: 'EUTELSAT Example',
      retrievedAt: '2026-04-30T00:00:00.000Z',
      rows: [
        { transponderNumber: 'missing-frequency', beamName: 'Europe' },
        { frequencyMHz: 12500, transponderNumber: 'no-pol-or-beam' },
      ],
    });

    expect(parsed).toHaveLength(1);
    expect(parsed[0].downlink.confidence).toBe('MEDIUM');
    expect(parsed[0].downlink.polarization).toBe('UNKNOWN');
  });
});

