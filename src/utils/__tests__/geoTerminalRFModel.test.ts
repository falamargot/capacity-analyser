import { describe, expect, it } from 'vitest';
import {
  computeAntennaGainDbi,
  computeTerminalEirpDbw,
  computeTerminalGtDbk,
  computeTerminalRFProfile,
  computeMinimumRequiredEirpDbw,
  computeUplinkRequirement,
  resolveTerminalRFParams,
  getTerminalRFProfile,
  GEO_TERMINAL_RF_CATALOGUE,
  USE_CASE_DEFAULT_RF_CLASS,
} from '../geoTerminalRFModel';

// ─── Antenna gain ─────────────────────────────────────────────────────────────

describe('computeAntennaGainDbi', () => {
  it('1.2m dish at 14 GHz (η=0.60) is approximately 42.7 dBi', () => {
    const gain = computeAntennaGainDbi(1.2, 14, 0.60);
    expect(gain).toBeCloseTo(42.69, 1);
  });

  it('gain scales with dish area: doubling diameter adds ~6 dB', () => {
    const g12 = computeAntennaGainDbi(1.2, 14, 0.60);
    const g24 = computeAntennaGainDbi(2.4, 14, 0.60);
    expect(g24 - g12).toBeCloseTo(6.0, 1);
  });

  it('higher frequency gives higher gain for same dish size', () => {
    const gainKu = computeAntennaGainDbi(1.2, 14, 0.60);
    const gainC  = computeAntennaGainDbi(1.2, 6,  0.55);
    expect(gainKu).toBeGreaterThan(gainC);
  });
});

// ─── EIRP ─────────────────────────────────────────────────────────────────────

describe('computeTerminalEirpDbw', () => {
  it('Ku Standard VSAT: 4W BUC + 42.7 dBi − 1.5 dB ≈ 47.2 dBW', () => {
    const gain = computeAntennaGainDbi(1.2, 14, 0.60);
    const eirp = computeTerminalEirpDbw(gain, 4, 1.5);
    expect(eirp).toBeCloseTo(47.2, 0);
  });

  it('increasing BUC power from 4W to 8W adds 3 dB', () => {
    const gain = computeAntennaGainDbi(1.8, 14, 0.60);
    const e4 = computeTerminalEirpDbw(gain, 4, 1.5);
    const e8 = computeTerminalEirpDbw(gain, 8, 1.5);
    expect(e8 - e4).toBeCloseTo(3.01, 1);
  });
});

// ─── G/T ──────────────────────────────────────────────────────────────────────

describe('computeTerminalGtDbk', () => {
  it('Ku Standard VSAT downlink at 11.7 GHz, T=250K ≈ 17.1 dB/K', () => {
    const gain = computeAntennaGainDbi(1.2, 11.7, 0.60);
    const gt = computeTerminalGtDbk(gain, 250);
    expect(gt).toBeCloseTo(17.1, 0);
  });
});

// ─── Full RF profile ──────────────────────────────────────────────────────────

describe('computeTerminalRFProfile', () => {
  it('ku_standard_vsat Ku profile has EIRP ≈ 47 dBW and G/T ≈ 17 dB/K', () => {
    const spec = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === 'ku_standard_vsat')!;
    const profile = computeTerminalRFProfile(spec, 'Ku');
    expect(profile.eirpDbw).toBeCloseTo(47, 0);
    expect(profile.gtDbk).toBeCloseTo(17, 0);
    expect(profile.band).toBe('Ku');
    expect(profile.classId).toBe('ku_standard_vsat');
  });

  it('higher EIRP for enterprise than compact VSAT in Ku band', () => {
    const compact    = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === 'ku_compact_vsat')!;
    const enterprise = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === 'ku_enterprise_vsat')!;
    const p1 = computeTerminalRFProfile(compact, 'Ku');
    const p2 = computeTerminalRFProfile(enterprise, 'Ku');
    expect(p2.eirpDbw).toBeGreaterThan(p1.eirpDbw + 10);
  });
});

// ─── Minimum required EIRP ────────────────────────────────────────────────────

describe('computeMinimumRequiredEirpDbw', () => {
  it('E8WB scenario (satGT=6.5 dB/K, Ku 36MHz, 37500km) requires ≈ 45.9 dBW', () => {
    const minEirp = computeMinimumRequiredEirpDbw(
      6.5,    // satGtDbk
      37500,  // slantRangeKm
      14,     // frequencyGhz (Ku uplink)
      36,     // bandwidthMhz
      1.5,    // atmosphericLossDb
    );
    expect(minEirp).toBeCloseTo(45.9, 0);
  });

  it('lower satellite G/T raises the required EIRP', () => {
    const highGT = computeMinimumRequiredEirpDbw(12, 37500, 14, 36, 1.5);
    const lowGT  = computeMinimumRequiredEirpDbw(0,  37500, 14, 36, 1.5);
    expect(lowGT - highGT).toBeCloseTo(12.0, 1);
  });

  it('narrower bandwidth reduces required EIRP', () => {
    const wide   = computeMinimumRequiredEirpDbw(6.5, 37500, 14, 72, 1.5);
    const narrow = computeMinimumRequiredEirpDbw(6.5, 37500, 14, 36, 1.5);
    expect(narrow).toBeLessThan(wide);
    // Halving BW gives ~3 dB reduction
    expect(wide - narrow).toBeCloseTo(3.0, 1);
  });
});

// ─── resolveTerminalRFParams ──────────────────────────────────────────────────

describe('resolveTerminalRFParams', () => {
  it('resolves a direct RF class ID', () => {
    const profile = resolveTerminalRFParams('Ku', 'ku_standard_vsat');
    expect(profile.classId).toBe('ku_standard_vsat');
    expect(profile.band).toBe('Ku');
  });

  it('resolves a legacy use-case key to default class', () => {
    const profile = resolveTerminalRFParams('Ku', 'fixed');
    expect(profile.classId).toBe(USE_CASE_DEFAULT_RF_CLASS.fixed.Ku);
  });

  it('resolves aviation use-case to aviation_esim in Ku band', () => {
    const profile = resolveTerminalRFParams('Ku', 'aviation');
    expect(profile.classId).toBe('aviation_esim');
  });

  it('falls back to ku_standard_vsat for an unknown key', () => {
    const profile = resolveTerminalRFParams('Ku', 'nonexistent_key');
    expect(profile.classId).toBe('ku_standard_vsat');
  });

  it('matches getTerminalRFProfile for the same class + band', () => {
    const p1 = resolveTerminalRFParams('Ku', 'ku_highpower_vsat');
    const p2 = getTerminalRFProfile('ku_highpower_vsat', 'Ku');
    expect(p1.eirpDbw).toBeCloseTo(p2.eirpDbw, 5);
    expect(p1.gtDbk).toBeCloseTo(p2.gtDbk, 5);
  });
});

// ─── computeUplinkRequirement — E8WB scenario ────────────────────────────────

describe('computeUplinkRequirement (E8WB scenario, satGT=6.5 dB/K, Ku 36 MHz)', () => {
  const E8WB_PARAMS = {
    satGtDbk: 6.5,
    slantRangeKm: 37500,
    frequencyGhz: 14,
    bandwidthMhz: 36,
    atmosphericLossDb: 1.5,
    band: 'Ku' as const,
  };

  it('ku_compact_vsat (~38 dBW) is blocked — margin gap is negative', () => {
    const compactProfile = resolveTerminalRFParams('Ku', 'ku_compact_vsat');
    const req = computeUplinkRequirement(
      compactProfile.eirpDbw,
      E8WB_PARAMS.satGtDbk,
      E8WB_PARAMS.slantRangeKm,
      E8WB_PARAMS.frequencyGhz,
      E8WB_PARAMS.bandwidthMhz,
      E8WB_PARAMS.atmosphericLossDb,
      E8WB_PARAMS.band,
    );
    expect(req.isAdequate).toBe(false);
    expect(req.marginGapDb).toBeLessThan(0);
    expect(req.suggestedRFClassId).toBeDefined();
    expect(req.currentEirpDbw).toBeCloseTo(compactProfile.eirpDbw, 3);
  });

  it('ku_standard_vsat (~47 dBW) closes the link at E8WB scenario', () => {
    const standardProfile = resolveTerminalRFParams('Ku', 'ku_standard_vsat');
    const req = computeUplinkRequirement(
      standardProfile.eirpDbw,
      E8WB_PARAMS.satGtDbk,
      E8WB_PARAMS.slantRangeKm,
      E8WB_PARAMS.frequencyGhz,
      E8WB_PARAMS.bandwidthMhz,
      E8WB_PARAMS.atmosphericLossDb,
      E8WB_PARAMS.band,
    );
    expect(req.isAdequate).toBe(true);
    expect(req.marginGapDb).toBeGreaterThan(0);
  });

  it('recommended EIRP is 3 dB above minimum', () => {
    const req = computeUplinkRequirement(
      40,
      E8WB_PARAMS.satGtDbk,
      E8WB_PARAMS.slantRangeKm,
      E8WB_PARAMS.frequencyGhz,
      E8WB_PARAMS.bandwidthMhz,
      E8WB_PARAMS.atmosphericLossDb,
      E8WB_PARAMS.band,
    );
    expect(req.recommendedEirpDbw - req.minimumEirpDbw).toBeCloseTo(3.0, 5);
  });

  it('marginGapDb = currentEirpDbw − minimumEirpDbw', () => {
    const currentEirp = 50;
    const req = computeUplinkRequirement(
      currentEirp,
      E8WB_PARAMS.satGtDbk,
      E8WB_PARAMS.slantRangeKm,
      E8WB_PARAMS.frequencyGhz,
      E8WB_PARAMS.bandwidthMhz,
      E8WB_PARAMS.atmosphericLossDb,
      E8WB_PARAMS.band,
    );
    expect(req.marginGapDb).toBeCloseTo(currentEirp - req.minimumEirpDbw, 5);
  });
});
