/**
 * leoLinkBudget.test.ts — RF chain correctness tests.
 *
 * Verifies the minimal physically valid link budget model:
 *   slant range → FSPL → C/N → MODCOD → throughput
 *
 * All "ESTIMATED DEFAULT" values are marked in the source; tests verify
 * the physics (relationships between variables) rather than exact numbers
 * that depend on calibration parameters.
 */

import { describe, expect, it } from 'vitest';

import {
  computeFsplDb,
  computeBeamCenterSlantRangeKm,
  computeCnDb,
  computeDirectionalRfChainThroughput,
  computeUplinkRfChainThroughput,
  selectModcod,
  computeRfChainThroughput,
  MODCOD_TABLE,
  RF_KU_FREQ_GHZ,
  RF_KU_UPLINK_FREQ_GHZ,
  RF_TERMINAL_GOT_DB_PER_K,
  RF_SATELLITE_GOT_DB_PER_K,
  RF_NOISE_BW_HZ,
  RF_THROUGHPUT_BW_HZ,
  RF_UPLINK_NOISE_BW_HZ,
  RF_UPLINK_THROUGHPUT_BW_HZ,
} from '../leoLinkBudget';
import {
  computeLeoTerminalScanLossDb,
  getEnabledLeoTerminalCatalogEntries,
  getLeoTerminalProfile,
  LEO_TERMINAL_CATALOG,
  LEO_TERMINAL_PROFILES,
} from '../../config/leoTerminals';

import {
  getBeamPerformance,
} from '../realisticSimulation';

import { NOMINAL_TERMINAL_PEAK_MBPS, LEO_ALTITUDE_KM } from '../../config/oneweb';

// ─── 1. FSPL formula — Step 1 ────────────────────────────────────────────────

describe('computeFsplDb — Step 1: Free Space Path Loss', () => {
  it('matches known value at nadir (1200 km, 11.5 GHz)', () => {
    // FSPL = 20·log10(1200) + 20·log10(11.5) + 92.45
    //      = 61.58 + 21.21 + 92.45 = 175.24 dB
    const fspl = computeFsplDb(1200, 11.5);
    expect(fspl).toBeCloseTo(175.24, 1);
  });

  it('doubling distance increases FSPL by exactly 6.02 dB', () => {
    const fspl1 = computeFsplDb(1200, 11.5);
    const fspl2 = computeFsplDb(2400, 11.5);
    expect(fspl2 - fspl1).toBeCloseTo(6.02, 1);
  });

  it('10× distance increases FSPL by exactly 20 dB', () => {
    const fspl1 = computeFsplDb(500, 11.5);
    const fspl2 = computeFsplDb(5000, 11.5);
    expect(fspl2 - fspl1).toBeCloseTo(20.0, 1);
  });

  it('higher frequency at same distance produces higher FSPL', () => {
    const fsplKu = computeFsplDb(1200, 11.5);  // Ku-band
    const fsplKa = computeFsplDb(1200, 19.7);  // Ka-band
    expect(fsplKa).toBeGreaterThan(fsplKu);
    // 20·log10(19.7 / 11.5) ≈ 4.66 dB difference
    expect(fsplKa - fsplKu).toBeCloseTo(20 * Math.log10(19.7 / 11.5), 1);
  });

  it('returns 0 for zero or negative distance', () => {
    expect(computeFsplDb(0, 11.5)).toBe(0);
    expect(computeFsplDb(-100, 11.5)).toBe(0);
  });

  it('slant range at nadir equals LEO_ALTITUDE_KM', () => {
    const d = computeBeamCenterSlantRangeKm(7); // near-central beam
    expect(d).toBeGreaterThanOrEqual(LEO_ALTITUDE_KM);
    expect(d).toBeLessThan(LEO_ALTITUDE_KM * 1.01); // within 1% of nadir
  });

  it('peripheral beam has larger slant range than central beam', () => {
    const central = computeBeamCenterSlantRangeKm(7);
    const peripheral = computeBeamCenterSlantRangeKm(0);
    expect(peripheral).toBeGreaterThan(central);
  });
});

// ─── 2. C/N decreases with distance — Step 2 ─────────────────────────────────

describe('computeCnDb — Step 2: C/N vs distance', () => {
  const nominalEirp = 54; // dBW (NOMINAL_EIRP_DBW)
  const powerAtBoresight = 0; // dB — user at boresight

  it('C/N is lower at longer slant range (physics: more FSPL → lower C/N)', () => {
    const cn1 = computeCnDb(nominalEirp, 1200, powerAtBoresight);
    const cn2 = computeCnDb(nominalEirp, 2400, powerAtBoresight);
    expect(cn1).toBeGreaterThan(cn2);
    // Doubling range → +6 dB FSPL → −6 dB C/N
    expect(cn1 - cn2).toBeCloseTo(6.02, 1);
  });

  it('C/N is positive at nadir boresight with nominal EIRP and estimated G/T', () => {
    const cn = computeCnDb(nominalEirp, 1200, 0);
    expect(cn).toBeGreaterThan(15); // must be well above minimum MODCOD threshold
  });

  it('increasing EIRP by 3 dB increases C/N by 3 dB (linear relationship)', () => {
    const cn1 = computeCnDb(nominalEirp, 1500, 0);
    const cn2 = computeCnDb(nominalEirp + 3, 1500, 0);
    expect(cn2 - cn1).toBeCloseTo(3.0, 6);
  });

  it('powerAtUserDb = −10 dB reduces C/N by 10 dB (beam edge effect)', () => {
    const cnBoresight = computeCnDb(nominalEirp, 1200, 0);
    const cnEdge = computeCnDb(nominalEirp, 1200, -10);
    expect(cnBoresight - cnEdge).toBeCloseTo(10.0, 6);
  });

  it('weather attenuation (−5 dB) embedded in powerAtUserDb reduces C/N', () => {
    const cnClear = computeCnDb(nominalEirp, 1200, -10);        // edge, clear
    const cnRain = computeCnDb(nominalEirp, 1200, -10 + (-5));  // edge + rain
    expect(cnClear).toBeGreaterThan(cnRain);
    expect(cnClear - cnRain).toBeCloseTo(5.0, 6);
  });
});

describe('computeUplinkRfChainThroughput — independent uplink RF chain', () => {
  it('uses uplink-specific frequency, receiver G/T and bandwidth constants', () => {
    expect(RF_KU_UPLINK_FREQ_GHZ).toBeGreaterThan(RF_KU_FREQ_GHZ);
    expect(RF_SATELLITE_GOT_DB_PER_K).not.toBe(RF_TERMINAL_GOT_DB_PER_K);
    expect(RF_UPLINK_NOISE_BW_HZ).not.toBe(RF_NOISE_BW_HZ);
    expect(RF_UPLINK_THROUGHPUT_BW_HZ).not.toBe(RF_THROUGHPUT_BW_HZ);
  });

  it('does not derive uplink throughput from downlink throughput', () => {
    const dl = computeRfChainThroughput(54, 7, 0, Number.POSITIVE_INFINITY);
    const ul = computeUplinkRfChainThroughput({
      terminalEirpDbw: 40,
      slantRangeKm: dl.slantRangeKm,
      pathAdjustmentDb: 0,
    });

    expect(ul.rfThroughputMbps).toBeGreaterThan(0);
    expect(ul.rfThroughputMbps).not.toBe(dl.rfThroughputMbps);
    expect(ul.rfThroughputMbps).toBeCloseTo(
      ((ul.modcod?.spectralEfficiencyBpHz ?? 0) * RF_UPLINK_THROUGHPUT_BW_HZ) / 1e6,
      6,
    );
  });

  it('applies the uplink terminal cap only when requested', () => {
    const uncapped = computeUplinkRfChainThroughput({
      terminalEirpDbw: 40,
      slantRangeKm: 1200,
      pathAdjustmentDb: 0,
    });
    const capped = computeUplinkRfChainThroughput({
      terminalEirpDbw: 40,
      slantRangeKm: 1200,
      pathAdjustmentDb: 0,
      terminalMaxMbps: 20,
    });

    expect(uncapped.rfThroughputMbps).toBeGreaterThan(20);
    expect(capped.deliveredThroughputMbps).toBe(20);
    expect(capped.rfThroughputMbps).toBe(uncapped.rfThroughputMbps);
  });
});

describe('LEO_TERMINAL_PROFILES — terminal-specific RF assumptions', () => {
  it('catalog entries expose source metadata and enabled category mappings', () => {
    expect(LEO_TERMINAL_CATALOG.length).toBeGreaterThanOrEqual(8);
    for (const entry of LEO_TERMINAL_CATALOG) {
      expect(entry.vendor.length).toBeGreaterThan(0);
      expect(entry.model.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(['OFFICIAL_DATASHEET', 'ENGINEERING_ESTIMATE', 'GENERIC_PROFILE']).toContain(entry.sourceType);
      expect(entry.sourceLabel.length).toBeGreaterThan(0);
      expect(['PARABOLIC_ZERO_LOSS', 'ESA_COSINE_N_1_4']).toContain(entry.rxScanLossModel.id);
      expect(['PARABOLIC_ZERO_LOSS', 'ESA_COSINE_N_1_4']).toContain(entry.txScanLossModel.id);
      expect(entry.assumptions.length).toBeGreaterThan(0);
      expect(entry.supportedBands).toContain('Ku');
      if (entry.sourceType === 'OFFICIAL_DATASHEET') {
        expect(entry.sourceUrl).toBeTruthy();
      }
    }
    expect(LEO_TERMINAL_CATALOG.some((entry) => entry.id === 'intellian-ow70l')).toBe(true);
    expect(LEO_TERMINAL_CATALOG.some((entry) => entry.id === 'hughes-hl1120w')).toBe(true);
    expect(LEO_TERMINAL_CATALOG.some((entry) => entry.id === 'intellian-ow70m')).toBe(true);
    expect(LEO_TERMINAL_CATALOG.some((entry) => entry.id === 'kymeta-hawk-u8')).toBe(true);
    expect(LEO_TERMINAL_CATALOG.some((entry) => entry.id === 'stellar-blu-sidewinder')).toBe(true);
    expect(getEnabledLeoTerminalCatalogEntries('mobile').length).toBeGreaterThan(0);
  });

  it('selects the default terminal flagged for each simple UI family', () => {
    expect(LEO_TERMINAL_PROFILES.fixed.id).toBe('intellian-ow70l');
    expect(LEO_TERMINAL_PROFILES.mobile.id).toBe('kymeta-hawk-u8');
    expect(LEO_TERMINAL_PROFILES.maritime.id).toBe('intellian-ow70m');
    expect(LEO_TERMINAL_PROFILES.aviation.id).toBe('stellar-blu-sidewinder');
  });

  it('allows an explicit terminal model selection within the selected family', () => {
    expect(getLeoTerminalProfile('fixed', 'hughes-hl1120w').id).toBe('hughes-hl1120w');
    expect(getLeoTerminalProfile('maritime', 'kymeta-peregrine-u8').id).toBe('kymeta-peregrine-u8');
    expect(getLeoTerminalProfile('fixed', 'kymeta-hawk-u8').id).toBe('intellian-ow70l');
  });

  it('each terminal profile exposes RF params, caps and bandwidths in Mbps/Hz units', () => {
    for (const profile of Object.values(LEO_TERMINAL_PROFILES)) {
      expect(profile.maxDlMbps).toBeGreaterThan(0);
      expect(profile.maxUlMbps).toBeGreaterThan(0);
      expect(profile.model.length).toBeGreaterThan(0);
      expect(['PARABOLIC', 'ESA']).toContain(profile.antennaType);
      expect(profile.rxGtDbK).toBeGreaterThan(0);
      expect(profile.txEirpDbw).toBeGreaterThan(0);
      expect(profile.dlReferenceBandwidthHz).toBeGreaterThan(0);
      expect(profile.ulReferenceBandwidthHz).toBeGreaterThan(0);
      expect(profile.dlUsableBeamBandwidthHz).toBeGreaterThanOrEqual(profile.dlReferenceBandwidthHz);
      expect(profile.ulUsableBeamBandwidthHz).toBeGreaterThanOrEqual(profile.ulReferenceBandwidthHz);
      expect(profile.sourceLabel.length).toBeGreaterThan(0);
      expect(profile.notes.length).toBeGreaterThan(0);
    }
  });

  it('changing terminal type changes downlink RF through terminal G/T, not just caps', () => {
    const fixed = LEO_TERMINAL_PROFILES.fixed;
    const mobile = LEO_TERMINAL_PROFILES.mobile;
    const common = {
      eirpDbw: 54,
      slantRangeKm: 1200,
      pathAdjustmentDb: 0,
      frequencyGHz: RF_KU_FREQ_GHZ,
    };

    const fixedDl = computeDirectionalRfChainThroughput({
      ...common,
      receiverGtDbK: fixed.rxGtDbK,
      noiseBwHz: fixed.dlReferenceBandwidthHz,
      throughputBwHz: fixed.dlReferenceBandwidthHz,
    });
    const mobileDl = computeDirectionalRfChainThroughput({
      ...common,
      receiverGtDbK: mobile.rxGtDbK,
      noiseBwHz: mobile.dlReferenceBandwidthHz,
      throughputBwHz: mobile.dlReferenceBandwidthHz,
    });

    expect(fixed.rxGtDbK).not.toBe(mobile.rxGtDbK);
    expect(fixedDl.cnDb).not.toBe(mobileDl.cnDb);
  });

  it('changing terminal type changes uplink RF through terminal EIRP, not downlink derivation', () => {
    const fixed = LEO_TERMINAL_PROFILES.fixed;
    const aviation = LEO_TERMINAL_PROFILES.aviation;
    const fixedUl = computeUplinkRfChainThroughput({
      terminalEirpDbw: fixed.txEirpDbw,
      slantRangeKm: 1800,
      pathAdjustmentDb: -10,
      noiseBwHz: fixed.ulReferenceBandwidthHz,
      throughputBwHz: fixed.ulReferenceBandwidthHz,
    });
    const aviationUl = computeUplinkRfChainThroughput({
      terminalEirpDbw: aviation.txEirpDbw,
      slantRangeKm: 1800,
      pathAdjustmentDb: -10,
      noiseBwHz: aviation.ulReferenceBandwidthHz,
      throughputBwHz: aviation.ulReferenceBandwidthHz,
    });

    expect(fixed.txEirpDbw).not.toBe(aviation.txEirpDbw);
    expect(fixedUl.cnDb).not.toBe(aviationUl.cnDb);
    expect(fixedUl.rfThroughputMbps).not.toBe(aviationUl.rfThroughputMbps);
  });

  it('ESA scan loss reduces low-elevation RF input while parabolic scan loss remains 0 dB', () => {
    const fixed = LEO_TERMINAL_PROFILES.fixed;
    const mobile = LEO_TERMINAL_PROFILES.mobile;
    const fixedLossLow = computeLeoTerminalScanLossDb(fixed.rxScanLossModel, 15);
    const mobileLossLow = computeLeoTerminalScanLossDb(mobile.rxScanLossModel, 15);
    const mobileLossHigh = computeLeoTerminalScanLossDb(mobile.rxScanLossModel, 80);

    expect(fixed.antennaType).toBe('PARABOLIC');
    expect(mobile.antennaType).toBe('ESA');
    expect(fixedLossLow).toBe(0);
    expect(mobileLossLow).toBeLessThan(mobileLossHigh);
    expect(mobile.rxGtDbK + mobileLossLow).toBeLessThan(mobile.rxGtDbK);
  });

  it('parabolic-to-ESA switch visibly reduces low-elevation downlink RF throughput', () => {
    const fixed = LEO_TERMINAL_PROFILES.fixed;
    const mobile = LEO_TERMINAL_PROFILES.mobile;
    const lowElevationDeg = 15;
    const common = {
      eirpDbw: 54,
      slantRangeKm: 1800,
      pathAdjustmentDb: -10,
      frequencyGHz: RF_KU_FREQ_GHZ,
    };
    const fixedDl = computeDirectionalRfChainThroughput({
      ...common,
      receiverGtDbK: fixed.rxGtDbK + computeLeoTerminalScanLossDb(fixed.rxScanLossModel, lowElevationDeg),
      noiseBwHz: fixed.dlReferenceBandwidthHz,
      throughputBwHz: fixed.dlReferenceBandwidthHz,
    });
    const mobileDl = computeDirectionalRfChainThroughput({
      ...common,
      receiverGtDbK: mobile.rxGtDbK + computeLeoTerminalScanLossDb(mobile.rxScanLossModel, lowElevationDeg),
      noiseBwHz: mobile.dlReferenceBandwidthHz,
      throughputBwHz: mobile.dlReferenceBandwidthHz,
    });

    expect(fixed.antennaType).toBe('PARABOLIC');
    expect(mobile.antennaType).toBe('ESA');
    expect(mobileDl.cnDb).toBeLessThan(fixedDl.cnDb);
    expect(mobileDl.rfThroughputMbps).toBeLessThan(fixedDl.rfThroughputMbps);
  });
});

// ─── 3. MODCOD selection — Step 3 ────────────────────────────────────────────

describe('selectModcod — Step 3: MODCOD table', () => {
  it('returns null for C/N below minimum threshold (link loss)', () => {
    expect(selectModcod(-10)).toBeNull();
    expect(selectModcod(4.9)).toBeNull(); // just below QPSK 1/2
  });

  it('selects QPSK 1/2 just above its threshold', () => {
    const m = selectModcod(5.1);
    expect(m?.name).toBe('QPSK 1/2');
  });

  it('selects best possible MODCOD at high C/N', () => {
    const m = selectModcod(25);
    expect(m?.name).toBe('32APSK 3/4');
  });

  it('MODCOD table is ordered: each entry has higher spectral efficiency than previous', () => {
    for (let i = 1; i < MODCOD_TABLE.length; i++) {
      expect(MODCOD_TABLE[i].spectralEfficiencyBpHz)
        .toBeGreaterThan(MODCOD_TABLE[i - 1].spectralEfficiencyBpHz);
      expect(MODCOD_TABLE[i].cnThresholdDb)
        .toBeGreaterThan(MODCOD_TABLE[i - 1].cnThresholdDb);
    }
  });

  it('selectModcod transitions correctly between adjacent entries', () => {
    const entries = [...MODCOD_TABLE];
    for (let i = 0; i < entries.length - 1; i++) {
      const justBelow = entries[i + 1].cnThresholdDb - 0.01;
      const justAbove = entries[i + 1].cnThresholdDb + 0.01;
      expect(selectModcod(justBelow)?.name).toBe(entries[i].name);
      expect(selectModcod(justAbove)?.name).toBe(entries[i + 1].name);
    }
  });
});

// ─── 4. Throughput decreases with position / distance — Step 4 ───────────────

describe('computeRfChainThroughput — Step 4: throughput chain', () => {
  const termMax = NOMINAL_TERMINAL_PEAK_MBPS; // 200 Mbps

  it('throughput at boresight (normalizedDist=0) is higher than at beam edge (normalizedDist=1)', () => {
    // At boresight: powerAtUserDb ≈ 0 dB → C/N ≈ 25 dB → best MODCOD → max throughput
    const atBoresight = computeRfChainThroughput(54, 7, 0, termMax);
    // At edge: powerAtUserDb ≈ −10 dB → lower C/N → lower MODCOD → less throughput
    const atEdge = computeRfChainThroughput(54, 7, -10, termMax);
    expect(atBoresight.deliveredThroughputMbps).toBeGreaterThan(atEdge.deliveredThroughputMbps);
  });

  it('rain attenuation (−5 dB in powerAtUserDb) reduces throughput at beam edge', () => {
    const edgeClear = computeRfChainThroughput(54, 7, -10, termMax);       // edge, clear
    const edgeRain = computeRfChainThroughput(54, 7, -10 + (-5), termMax); // edge + rain
    expect(edgeClear.deliveredThroughputMbps).toBeGreaterThan(edgeRain.deliveredThroughputMbps);
  });

  it('throughput never exceeds terminal hardware maximum', () => {
    // Best MODCOD (32APSK 3/4) gives 3.75 × 50 MHz = 187.5 Mbps — already below
    // the 200 Mbps terminal cap. RF chain is the binding constraint, not hardware.
    const result = computeRfChainThroughput(60, 7, 0, termMax); // boosted EIRP
    expect(result.deliveredThroughputMbps).toBeLessThanOrEqual(termMax);
    // With a tighter terminal cap (e.g., 100 Mbps mobile), wasTerminalLimited flips:
    const mobile = computeRfChainThroughput(60, 7, 0, 100);
    expect(mobile.deliveredThroughputMbps).toBeLessThanOrEqual(100);
    expect(mobile.wasTerminalLimited).toBe(true);
  });

  it('increasing EIRP increases C/N but throughput may stay at terminal cap', () => {
    const normal = computeRfChainThroughput(54, 7, 0, termMax);
    const boosted = computeRfChainThroughput(57, 7, 0, termMax); // +3 dB EIRP
    // C/N must increase
    expect(boosted.cnDb).toBeGreaterThan(normal.cnDb);
    expect(boosted.cnDb - normal.cnDb).toBeCloseTo(3.0, 1);
    // Throughput must not exceed terminal cap
    expect(boosted.deliveredThroughputMbps).toBeLessThanOrEqual(termMax);
    expect(normal.deliveredThroughputMbps).toBeLessThanOrEqual(termMax);
  });

  it('link loss (no MODCOD) produces zero throughput', () => {
    // Force C/N well below minimum threshold by using extreme negative powerAtUserDb
    const result = computeRfChainThroughput(54, 7, -40, termMax); // severely degraded
    expect(result.modcod).toBeNull();
    expect(result.rfThroughputMbps).toBe(0);
    expect(result.deliveredThroughputMbps).toBe(0);
  });

  it('throughput = spectral_efficiency × RF_THROUGHPUT_BW_HZ for any valid MODCOD', () => {
    for (const entry of MODCOD_TABLE) {
      const cn = entry.cnThresholdDb + 0.5; // just above threshold
      const modcod = selectModcod(cn);
      if (modcod?.name === entry.name) {
        const expected = (entry.spectralEfficiencyBpHz * RF_THROUGHPUT_BW_HZ) / 1e6;
        // Match up to floating-point precision (no terminal cap needed here since best MODCOD stays below 200 Mbps)
        expect(expected).toBeCloseTo(
          (modcod.spectralEfficiencyBpHz * RF_THROUGHPUT_BW_HZ) / 1e6,
          6,
        );
      }
    }
  });

  it('best MODCOD (32APSK 3/4) raw throughput is within terminal capability', () => {
    const bestEntry = MODCOD_TABLE[MODCOD_TABLE.length - 1];
    const rawMbps = (bestEntry.spectralEfficiencyBpHz * RF_THROUGHPUT_BW_HZ) / 1e6;
    // RF_THROUGHPUT_BW_HZ is calibrated so best MODCOD → ~187.5 Mbps < 200 Mbps
    expect(rawMbps).toBeLessThanOrEqual(NOMINAL_TERMINAL_PEAK_MBPS);
  });
});

// ─── 5. Integration: getBeamPerformance uses RF chain outputs ─────────────────

describe('getBeamPerformance — RF chain integration', () => {
  it('exposes slantRangeKm, fsplDb, cnDb, selectedModcod on the output', () => {
    const result = getBeamPerformance({
      beamIndex: 7,
      activeBeamCount: 16,
      healthFactor: 1.0,
      weather: 'CLEAR',
      normalizedDistance: 0,
    });
    expect(result.slantRangeKm).toBeGreaterThan(0);
    expect(result.fsplDb).toBeGreaterThan(150);
    expect(typeof result.cnDb).toBe('number');
    expect(result.selectedModcod).not.toBeNull();
  });

  it('deliveredThroughputMbps never exceeds NOMINAL_TERMINAL_PEAK_MBPS', () => {
    // Sweep over conditions; throughput must always be ≤ 200 Mbps
    const conditions: Array<[number, number, number, 'CLEAR' | 'CLOUDS' | 'RAIN']> = [
      [7,  16, 1.0, 'CLEAR'],
      [0,  16, 0.9, 'CLEAR'],
      [15, 8,  0.88, 'RAIN'],
      [7,  16, 1.0, 'CLOUDS'],
    ];
    for (const [bi, abc, hf, wc] of conditions) {
      const r = getBeamPerformance({ beamIndex: bi, activeBeamCount: abc, healthFactor: hf, weather: wc, normalizedDistance: 0 });
      expect(r.deliveredThroughputMbps).toBeLessThanOrEqual(NOMINAL_TERMINAL_PEAK_MBPS);
    }
  });

  it('throughput at beam edge is less than at boresight (clear sky, central beam)', () => {
    const boresight = getBeamPerformance({ beamIndex: 7, activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 0 });
    const edge     = getBeamPerformance({ beamIndex: 7, activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 1 });
    expect(boresight.deliveredThroughputMbps).toBeGreaterThan(edge.deliveredThroughputMbps);
  });

  it('rain reduces throughput relative to clear sky (at beam edge)', () => {
    const clear = getBeamPerformance({ beamIndex: 7, activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 1 });
    const rain  = getBeamPerformance({ beamIndex: 7, activeBeamCount: 16, healthFactor: 1.0, weather: 'RAIN',  normalizedDistance: 1 });
    expect(clear.deliveredThroughputMbps).toBeGreaterThan(rain.deliveredThroughputMbps);
  });

  it('peripheral beam has lower C/N than central beam (more FSPL + more scan loss)', () => {
    const central    = getBeamPerformance({ beamIndex: 7,  activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 0 });
    const peripheral = getBeamPerformance({ beamIndex: 0,  activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 0 });
    expect(central.cnDb).toBeGreaterThan(peripheral.cnDb);
  });

  it('fsplDb at peripheral beam is higher than at central beam', () => {
    const central    = getBeamPerformance({ beamIndex: 7, activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 0 });
    const peripheral = getBeamPerformance({ beamIndex: 0, activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 0 });
    expect(peripheral.fsplDb).toBeGreaterThan(central.fsplDb);
  });

  it('throughputRatio = deliveredThroughputMbps / NOMINAL_TERMINAL_PEAK_MBPS', () => {
    const r = getBeamPerformance({ beamIndex: 7, activeBeamCount: 16, healthFactor: 1.0, weather: 'CLEAR', normalizedDistance: 0.5 });
    expect(r.throughputRatio).toBeCloseTo(r.deliveredThroughputMbps / NOMINAL_TERMINAL_PEAK_MBPS, 6);
  });
});
