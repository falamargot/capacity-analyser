import { describe, expect, it } from 'vitest';
import {
  computeDownlinkBudget,
  getTerminalDownlinkGT,
  lookupModcod,
  TERMINAL_GEO_RF_PARAMS_BY_BAND,
  DVB_S2X_ROLL_OFF,
} from '../geoLinkBudget';

describe('geoLinkBudget', () => {
  it('returns below-threshold when C/N does not close the link', () => {
    expect(lookupModcod(-3)).toEqual({
      name: 'Below threshold',
      efficiency: 0,
      requiredCnDb: -2.1,
    });
  });

  it('maps a central Ku downlink contour to a viable APSK MODCOD and higher throughput than a weaker contour', () => {
    const slantRangeKm = 38_000;
    const strongContour = computeDownlinkBudget(48, 17, slantRangeKm, 11.7, 36, 1.5);
    const weakContour = computeDownlinkBudget(44, 17, slantRangeKm, 11.7, 36, 1.5);

    expect(strongContour.cnDb).toBeGreaterThan(10);
    expect(strongContour.cnDb).toBeLessThan(14);
    expect(strongContour.modcod).toMatch(/APSK/);
    expect(strongContour.achievableThroughputMbps).toBeGreaterThan(80);
    expect(strongContour.linkMarginDb).toBeGreaterThan(0);

    expect(weakContour.cnDb).toBeLessThan(strongContour.cnDb);
    expect(weakContour.achievableThroughputMbps).toBeLessThan(strongContour.achievableThroughputMbps);
    expect(weakContour.modcod).not.toBe(strongContour.modcod);
    expect(weakContour.linkMarginDb).toBeGreaterThan(0);
  });
});

// ─── Band-specific terminal G/T ───────────────────────────────────────────────

describe('band-specific terminal downlink G/T', () => {
  it('getTerminalDownlinkGT returns different values for C, Ku, Ka (fixed terminal)', () => {
    const cGT  = getTerminalDownlinkGT('C');
    const kuGT = getTerminalDownlinkGT('Ku');
    const kaGT = getTerminalDownlinkGT('Ka');

    expect(cGT).not.toBe(kuGT);
    expect(kaGT).not.toBe(kuGT);
    expect(cGT).not.toBe(kaGT);
  });

  it('C-band fixed G/T is approximately 5 dB/K', () => {
    expect(getTerminalDownlinkGT('C', 'fixed')).toBeCloseTo(5.0, 1);
  });

  it('Ku-band fixed G/T is 17 dB/K (unchanged)', () => {
    expect(getTerminalDownlinkGT('Ku', 'fixed')).toBe(17.0);
  });

  it('Ka-band fixed G/T is approximately 13 dB/K', () => {
    expect(getTerminalDownlinkGT('Ka', 'fixed')).toBeCloseTo(13.0, 1);
  });

  it('C-band G/T is lower than Ku-band G/T for the same terminal type', () => {
    for (const type of ['fixed', 'mobile', 'aviation', 'maritime']) {
      expect(getTerminalDownlinkGT('C', type)).toBeLessThan(getTerminalDownlinkGT('Ku', type));
    }
  });

  it('C-band downlink C/N is lower than Ku-band C/N for the same satellite EIRP and geometry', () => {
    const slantRangeKm = 38_000;
    const satEirpDbw = 48;

    const cBudget  = computeDownlinkBudget(satEirpDbw, getTerminalDownlinkGT('C'),  slantRangeKm, 3.8,  36, 0.3);
    const kuBudget = computeDownlinkBudget(satEirpDbw, getTerminalDownlinkGT('Ku'), slantRangeKm, 11.7, 36, 0.5);

    // Lower G/T on C-band means lower C/N despite lower FSPL at 3.8 GHz.
    expect(cBudget.cnDb).toBeLessThan(kuBudget.cnDb);
  });

  it('TERMINAL_GEO_RF_PARAMS_BY_BAND Ku values match legacy TERMINAL_GEO_RF_PARAMS', () => {
    const kuFixed = TERMINAL_GEO_RF_PARAMS_BY_BAND.Ku.fixed;
    expect(kuFixed.gtTerminalDbk).toBe(17.0);
    expect(kuFixed.eirpTerminalDbw).toBe(44.0);
    expect(kuFixed.antennaDiameterM).toBe(1.2);
  });

  it('getTerminalDownlinkGT falls back to fixed when terminal type is unknown', () => {
    expect(getTerminalDownlinkGT('Ku', 'nonexistent')).toBe(getTerminalDownlinkGT('Ku', 'fixed'));
  });
});

// ─── DVB-S2X high-order MODCOD entries ───────────────────────────────────────

describe('DVB-S2X high-order MODCODs (64APSK / 128APSK / 256APSK)', () => {
  // ── Selection at switching boundaries ──────────────────────────────────────

  it('below 16.3 dB Es/N0 the highest MODCOD is 32APSK 8/9', () => {
    const result = lookupModcod(16.2);
    expect(result.name).toBe('32APSK 8/9');
    expect(result.efficiency).toBe(4.30);
  });

  it('at 16.3 dB Es/N0 selects the CDM-780 64APSK 4/5 threshold', () => {
    const result = lookupModcod(16.3);
    expect(result.name).toBe('64APSK 4/5');
    expect(result.efficiency).toBe(4.63);
  });

  it('in [16.9, 18.8) dB Es/N0 selects 64APSK 5/6', () => {
    for (const cn of [16.9, 17.5, 18.79]) {
      const result = lookupModcod(cn);
      expect(result.name).toBe('64APSK 5/6');
      expect(result.efficiency).toBe(4.82);
    }
  });

  it('at 18.8 dB Es/N0 selects 128APSK 3/4', () => {
    const result = lookupModcod(18.8);
    expect(result.name).toBe('128APSK 3/4');
    expect(result.efficiency).toBe(5.05);
  });

  it('in [18.8, 20.0) dB Es/N0 selects 128APSK 3/4', () => {
    for (const cn of [18.8, 19.0, 19.99]) {
      const result = lookupModcod(cn);
      expect(result.name).toBe('128APSK 3/4');
    }
  });

  it('at 20 dB Es/N0 selects 256APSK 32/45', () => {
    const result = lookupModcod(20);
    expect(result.name).toBe('256APSK 32/45');
    expect(result.efficiency).toBe(5.47);
  });

  it('256APSK 32/45 remains the ceiling at arbitrarily high C/N', () => {
    expect(lookupModcod(30)).toMatchObject({ name: '256APSK 32/45', efficiency: 5.47 });
  });

  // ── Efficiency staircase — no reversals ────────────────────────────────────

  it('efficiency is non-decreasing as C/N sweeps from 15 to 25 dB in 0.5 dB steps', () => {
    let prevEfficiency = -Infinity;
    for (let cn = 15; cn <= 25; cn += 0.5) {
      const { efficiency } = lookupModcod(cn);
      expect(efficiency).toBeGreaterThanOrEqual(prevEfficiency);
      prevEfficiency = efficiency;
    }
  });

  it('never selects a MODCOD above the selected modem constellation limit', () => {
    const result = lookupModcod(30, { maxModulationOrder: 16 });
    expect(result.name).toBe('16APSK 8/9');
  });

  // ── Ka-band throughput impact ─────────────────────────────────────────────
  //
  // Reference scenario: Ka-band HTS forward link, nadir geometry.
  //   Downlink: 19.7 GHz, 250 MHz transponder, α = 0.15
  //   Terminal: fixed, G/T = 13 dB/K
  //   Slant range: 35 786 km (GEO sub-satellite point)
  //
  // Derived offset: C/N = EIRP − 53.187 dB (computed from FSPL + noise BW).
  // Symbol rate = 250 / 1.15 ≈ 217.4 Msps.
  //
  // EIRP values targeting each MODCOD window (C/N = EIRP − 53.187):
  //   EIRP = 70.0 dBW → C/N ≈ 16.81 dB → 32APSK 8/9  (legacy ceiling)
  //   EIRP = 70.2 dBW → C/N ≈ 17.01 dB → 64APSK 4/5  (window [16.99, 17.73))
  //   EIRP = 71.0 dBW → C/N ≈ 17.81 dB → 64APSK 5/6  (window [17.73, 19.57))
  //   EIRP = 73.0 dBW → C/N ≈ 19.81 dB → 128APSK 3/4 (window [19.57, 22.68))
  //   EIRP = 76.0 dBW → C/N ≈ 22.81 dB → 256APSK 32/45 (≥ 22.68)

  it('Ka-band 250 MHz spot: 64APSK 4/5 exceeds old 32APSK 8/9 ceiling', () => {
    const kaGT = getTerminalDownlinkGT('Ka');
    const legacy = computeDownlinkBudget(69.4, kaGT, 35_786, 19.7, 250, 2.0);
    const new64  = computeDownlinkBudget(69.5, kaGT, 35_786, 19.7, 250, 2.0);

    expect(legacy.modcod).toBe('32APSK 8/9');
    expect(new64.modcod).toBe('64APSK 4/5');
    expect(new64.achievableThroughputMbps).toBeGreaterThan(legacy.achievableThroughputMbps);
  });

  it('Ka-band throughput increases logically across all new MODCOD tiers', () => {
    const kaGT = getTerminalDownlinkGT('Ka');
    const tier32apsk  = computeDownlinkBudget(69.4, kaGT, 35_786, 19.7, 250, 2.0);
    const tier64a45   = computeDownlinkBudget(69.5, kaGT, 35_786, 19.7, 250, 2.0);
    const tier64a56   = computeDownlinkBudget(70.3, kaGT, 35_786, 19.7, 250, 2.0);
    const tier128apsk = computeDownlinkBudget(72.1, kaGT, 35_786, 19.7, 250, 2.0);
    const tier256apsk = computeDownlinkBudget(73.3, kaGT, 35_786, 19.7, 250, 2.0);

    expect(tier64a45.modcod).toBe('64APSK 4/5');
    expect(tier64a56.modcod).toBe('64APSK 5/6');
    expect(tier128apsk.modcod).toBe('128APSK 3/4');
    expect(tier256apsk.modcod).toBe('256APSK 32/45');

    expect(tier64a45.achievableThroughputMbps).toBeGreaterThan(tier32apsk.achievableThroughputMbps);
    expect(tier64a56.achievableThroughputMbps).toBeGreaterThan(tier64a45.achievableThroughputMbps);
    expect(tier128apsk.achievableThroughputMbps).toBeGreaterThan(tier64a56.achievableThroughputMbps);
    expect(tier256apsk.achievableThroughputMbps).toBeGreaterThan(tier128apsk.achievableThroughputMbps);
  });

  it('Ka-band 250 MHz symbol rate is consistent with roll-off constant', () => {
    // At 256APSK 32/45 (5.47 b/s/Hz): symbol_rate * efficiency.
    const kaGT = getTerminalDownlinkGT('Ka');
    const result = computeDownlinkBudget(76.0, kaGT, 35_786, 19.7, 250, 2.0);
    const expectedSymbolRateMsps = 250 / (1 + DVB_S2X_ROLL_OFF);
    const expectedThroughputMbps = expectedSymbolRateMsps * 5.47;

    expect(result.modcod).toBe('256APSK 32/45');
    expect(result.achievableThroughputMbps).toBeCloseTo(expectedThroughputMbps, 0);
  });
});
