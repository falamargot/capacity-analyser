import { describe, expect, it } from 'vitest';
import {
  GEO_MODEM_CATALOGUE,
  effectiveRxCapMbps,
  effectiveTxCapMbps,
  getGeoModemProfile,
  limitDirectionalThroughputMbps,
  directionalWaveformConstraint,
  verifyMeshTopology,
  verifyModemTopology,
  type GeoModemProfile,
} from '../geoModemCatalogue';

describe('GEO modem catalogue', () => {
  it('exposes the seeded profiles and encodes ONLY exactly-sourced ceilings', () => {
    expect(GEO_MODEM_CATALOGUE.map((m) => m.id)).toEqual([
      'idirect_mdm2510', 'idirect_iq200', 'idirect_mdm5010', 'comtech_cdm780',
    ]);

    // MDM5010 — the only directionally-sourced modem (300 return / 800 outbound).
    const mdm5010 = getGeoModemProfile('idirect_mdm5010')!;
    expect(mdm5010.maxTxMbps).toBe(300);
    expect(mdm5010.maxRxMbps).toBe(800);
    expect(mdm5010.ceilingNature).toBe('official_release_directional');

    // MDM2510 — aggregate "up to 150" MAX, no directional split.
    const mdm2510 = getGeoModemProfile('idirect_mdm2510')!;
    expect(mdm2510.maxTxMbps).toBeNull();
    expect(mdm2510.maxRxMbps).toBeNull();
    expect(mdm2510.aggregateCeilingMbps).toBe(150);
    expect(mdm2510.ceilingNature).toBe('datasheet_aggregate');

    // iQ 200 — "300+" is a FLOOR: no usable ceiling encoded.
    const iq200 = getGeoModemProfile('idirect_iq200')!;
    expect(iq200.maxTxMbps).toBeNull();
    expect(iq200.maxRxMbps).toBeNull();
    expect(iq200.aggregateCeilingMbps).toBeNull();
    expect(iq200.ceilingNature).toBe('unspecified');

    // CDM-780 — "several Gbps" is not exact: no ceiling encoded.
    const cdm780 = getGeoModemProfile('comtech_cdm780')!;
    expect(cdm780.maxTxMbps).toBeNull();
    expect(cdm780.aggregateCeilingMbps).toBeNull();
    expect(cdm780.ceilingNature).toBe('unspecified');
  });

  it('meshCapable is only asserted where the source states it (iQ 200)', () => {
    expect(getGeoModemProfile('idirect_iq200')!.meshCapable).toBe(true);
    expect(getGeoModemProfile('idirect_mdm2510')!.meshCapable).toBe(false);
    expect(getGeoModemProfile('idirect_mdm5010')!.meshCapable).toBe(false);
    expect(getGeoModemProfile('comtech_cdm780')!.meshCapable).toBe(false);
  });

  // No profile in the CURRENT catalogue asserts 'unsupported' — every source is
  // either explicit support or silence ('unknown'). The blocking path is therefore
  // gated by data, not dead: these two tests pin the behaviour so it still works
  // the day a datasheet says "STAR only", and prove that today's catalogue cannot
  // trip a hard block by accident.
  it('no catalogued profile currently asserts an unsupported topology', () => {
    for (const m of GEO_MODEM_CATALOGUE) {
      for (const support of Object.values(m.topologySupport)) {
        expect(support).not.toBe('unsupported');
      }
    }
  });

  it('blocks a topology a datasheet explicitly rules out', () => {
    const starOnly = {
      ...getGeoModemProfile('idirect_mdm2510')!,
      topologySupport: { STAR: 'supported', MESH: 'unsupported', POINT_TO_POINT: 'unsupported' },
    } as GeoModemProfile;

    const blocked = verifyModemTopology('MESH', starOnly, getGeoModemProfile('idirect_iq200'));
    expect(blocked.incompatibleModemIds).toEqual(['idirect_mdm2510']);
    expect(blocked.compatible).toBe(false);
    // A confirmed incompatibility is NOT the same as "not yet verified".
    expect(blocked.unverified).toBe(false);
    expect(blocked.reason).toMatch(/Unsupported MESH/);

    // The same modem stays fine on the topology its source does support.
    expect(verifyModemTopology('STAR', starOnly, null).incompatibleModemIds).toEqual([]);
  });

  it('carries manufacturer provenance fields on every profile', () => {
    for (const m of GEO_MODEM_CATALOGUE) {
      expect(m.mode.length).toBeGreaterThan(0);
      expect(m.sourceUrl.length).toBeGreaterThan(0);
      expect(m.datasheetRevision.length).toBeGreaterThan(0);
    }
  });

  it('getGeoModemProfile returns null for null/unknown ids', () => {
    expect(getGeoModemProfile(null)).toBeNull();
    expect(getGeoModemProfile(undefined)).toBeNull();
    // @ts-expect-error deliberately unknown id
    expect(getGeoModemProfile('nope')).toBeNull();
  });

  it('effective caps: directional where sourced, aggregate applied both ways, null when unspecified', () => {
    const mdm5010 = getGeoModemProfile('idirect_mdm5010')!;
    expect(effectiveTxCapMbps(mdm5010)).toBe(300);
    expect(effectiveRxCapMbps(mdm5010)).toBe(800);

    const mdm2510 = getGeoModemProfile('idirect_mdm2510')!;
    expect(effectiveTxCapMbps(mdm2510)).toBe(150);
    expect(effectiveRxCapMbps(mdm2510)).toBe(150);

    const iq200 = getGeoModemProfile('idirect_iq200')!;
    expect(effectiveTxCapMbps(iq200)).toBeNull();
    expect(effectiveRxCapMbps(iq200)).toBeNull();
  });

  it('derives a common directional waveform from source TX and destination RX', () => {
    const iq200 = getGeoModemProfile('idirect_iq200')!;
    const cdm780 = getGeoModemProfile('comtech_cdm780')!;
    const constraint = directionalWaveformConstraint(iq200, cdm780);

    expect(constraint.minSymbolRateMsps).toBe(10);
    expect(constraint.maxSymbolRateMsps).toBe(15);
    expect(constraint.maxModulationOrder).toBe(16);
    expect(constraint.rollOff).toBe(0.15);
  });
});

describe('limitDirectionalThroughputMbps', () => {
  const mdm5010 = getGeoModemProfile('idirect_mdm5010')!; // TX 300 / RX 800
  const mdm2510 = getGeoModemProfile('idirect_mdm2510')!; // aggregate 150
  const iq200 = getGeoModemProfile('idirect_iq200')!;     // no caps
  const cdm780 = getGeoModemProfile('comtech_cdm780')!;   // no caps

  it('passes RF through and flags an estimated ceiling when no modem is selected', () => {
    const r = limitDirectionalThroughputMbps(450, null, null);
    expect(r.limitedMbps).toBe(450);
    expect(r.limitedBy).toBe('rf');
    expect(r.isEstimatedCeiling).toBe(true);
  });

  it('stays an estimated ceiling with only ONE modem, even though its cap is applied', () => {
    // source MDM5010 (TX 300) known, destination missing → cap applies but not delivered.
    const r = limitDirectionalThroughputMbps(500, mdm5010, null);
    expect(r.limitedMbps).toBe(300);
    expect(r.limitedBy).toBe('source_tx');
    expect(r.isEstimatedCeiling).toBe(true);
  });

  it('is a delivered rate only when BOTH endpoint modems are known', () => {
    // forward A→B: source MDM5010 (TX 300), dest MDM2510 (RX 150 aggregate), RF 500.
    const r = limitDirectionalThroughputMbps(500, mdm5010, mdm2510);
    expect(r.limitedMbps).toBe(150);
    expect(r.limitedBy).toBe('dest_rx');
    expect(r.isEstimatedCeiling).toBe(false);
  });

  it('both modems present but directional caps unknown ⇒ STILL an estimated ceiling', () => {
    // iQ 200 (floor-only) source + CDM-780 (vague) dest: neither publishes a usable
    // ceiling, so the RF figure stands but must NOT be presented as delivered.
    const r = limitDirectionalThroughputMbps(500, iq200, cdm780);
    expect(r.limitedMbps).toBe(500);
    expect(r.limitedBy).toBe('rf');
    expect(r.isEstimatedCeiling).toBe(true);
    expect(r.sourceTxCapMbps).toBeNull();
    expect(r.destRxCapMbps).toBeNull();
  });

  it('one side known, other unknown ⇒ estimated (cap applied, not delivered)', () => {
    // source MDM5010 (TX 300 known) → dest iQ 200 (RX unknown): 300 applies, estimated.
    const r = limitDirectionalThroughputMbps(500, mdm5010, iq200);
    expect(r.limitedMbps).toBe(300);
    expect(r.limitedBy).toBe('source_tx');
    expect(r.isEstimatedCeiling).toBe(true);
  });

  it('is directional: MDM5010 return (TX 300) binds forward, its outbound (RX 800) binds reverse', () => {
    const forward = limitDirectionalThroughputMbps(900, mdm5010, cdm780); // source A TX 300
    const reverse = limitDirectionalThroughputMbps(900, cdm780, mdm5010); // dest A RX 800
    expect(forward.limitedMbps).toBe(300);
    expect(reverse.limitedMbps).toBe(800);
  });
});

describe('verifyMeshTopology', () => {
  const iq200 = getGeoModemProfile('idirect_iq200')!;     // mesh-capable
  const mdm5010 = getGeoModemProfile('idirect_mdm5010')!;  // MESH support unpublished

  it('is unverified (not compatible) when an endpoint has no modem', () => {
    const r = verifyMeshTopology(iq200, null);
    expect(r.compatible).toBe(false);
    expect(r.unverified).toBe(true);
    expect(r.incompatibleModemIds).toEqual([]);
  });

  it('is a confirmed incompatibility only when the selected modem is explicitly unsupported', () => {
    const unsupported = {
      ...mdm5010,
      topologySupport: { ...mdm5010.topologySupport, MESH: 'unsupported' as const },
    };
    const r = verifyMeshTopology(iq200, unsupported);
    expect(r.compatible).toBe(false);
    expect(r.unverified).toBe(false);
    expect(r.incompatibleModemIds).toEqual(['idirect_mdm5010']);
  });

  it('stays unverified when the vendor does not publish MESH capability', () => {
    const r = verifyMeshTopology(iq200, mdm5010);
    expect(r.compatible).toBe(false);
    expect(r.unverified).toBe(true);
    expect(r.incompatibleModemIds).toEqual([]);
  });

  it('is compatible when both selected modems are mesh-capable', () => {
    const r = verifyMeshTopology(iq200, iq200);
    expect(r.compatible).toBe(true);
    expect(r.unverified).toBe(false);
    expect(r.incompatibleModemIds).toEqual([]);
  });
});
