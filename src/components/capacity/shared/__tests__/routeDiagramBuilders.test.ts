import { describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../../../types/satellites';
import { buildGeoRouteDiagram, buildLeoRouteDiagram } from '../routeDiagramBuilders';

const satA = { id: 'sat-a', name: 'ONEWEB-0184' } as SatelliteData;
const satB = { id: 'sat-b', name: 'ONEWEB-0653' } as SatelliteData;
const geoSat = { id: 'geo-sat', name: 'EUTELSAT TEST' } as SatelliteData;

// Every RouteDiagram consumer must produce connectors.length === nodes.length - 1;
// a mismatch here would either drop a hop's distance/latency silently or crash
// the diagram's zip-by-index rendering — this is exactly the class of bug the
// Cross-Surface Consistency Audit's F2/M1 findings were about, so it's guarded
// directly rather than only through the section-component integration tests.
const expectValidChain = (result: { nodes: unknown[]; connectors: unknown[] }) => {
  expect(result.connectors.length).toBe(result.nodes.length - 1);
};

describe('buildLeoRouteDiagram', () => {
  it('builds a 3-node single-site chain', () => {
    const result = buildLeoRouteDiagram({
      isS2S: false,
      isAtoB: true,
      single: {
        siteLabel: 'Site A',
        satellite: satA,
        beamIndex: 7,
        snpName: 'Mornac',
        userToSatKm: 1100,
        userToSatMs: 3.7,
        satToSnpKm: 1300,
        satToSnpMs: 4.3,
      },
    });

    expectValidChain(result);
    expect(result.nodes.map((n) => n.label)).toEqual(['Site A', 'ONEWEB-0184', 'Mornac']);
  });

  it('builds a 7-node S2S chain with distinct satellites and SNPs (the reported bug scenario)', () => {
    const result = buildLeoRouteDiagram({
      isS2S: true,
      isAtoB: true,
      s2s: {
        satA, satB,
        snpAName: 'Mornac', snpBName: 'Manassas', popName: 'London', sameSNP: false,
        userLinkAKm: 1100, userLinkAMs: 3.7,
        feederAKm: 1300, feederAMs: 4.3,
        backboneKm: 7904, backboneMs: 39.5,
        feederBKm: 1400, feederBMs: 4.7,
        userLinkBKm: 1200, userLinkBMs: 4.0,
      },
    });

    expectValidChain(result);
    expect(result.nodes).toHaveLength(7);
    expect(result.nodes.map((n) => n.label)).toEqual([
      'Site A', 'ONEWEB-0184', 'Mornac', 'London', 'Manassas', 'ONEWEB-0653', 'Site B',
    ]);
  });

  it('reverses node order for B_TO_A without losing either satellite', () => {
    const result = buildLeoRouteDiagram({
      isS2S: true,
      isAtoB: false,
      s2s: {
        satA, satB,
        snpAName: 'Mornac', snpBName: 'Manassas', popName: 'London', sameSNP: false,
        userLinkAKm: 1100, userLinkAMs: 3.7,
        feederAKm: 1300, feederAMs: 4.3,
        backboneKm: 7904, backboneMs: 39.5,
        feederBKm: 1400, feederBMs: 4.7,
        userLinkBKm: 1200, userLinkBMs: 4.0,
      },
    });

    expectValidChain(result);
    expect(result.nodes[0].label).toBe('Site B');
    expect(result.nodes[result.nodes.length - 1].label).toBe('Site A');
    expect(result.nodes.map((n) => n.label)).toContain('ONEWEB-0184');
    expect(result.nodes.map((n) => n.label)).toContain('ONEWEB-0653');
  });

  it('builds a 5-node chain (no PoP node) when both sites share one SNP', () => {
    const result = buildLeoRouteDiagram({
      isS2S: true,
      isAtoB: true,
      s2s: {
        satA, satB,
        snpAName: 'Mornac', snpBName: 'Mornac', popName: 'London', sameSNP: true,
        userLinkAKm: 1100, userLinkAMs: 3.7,
        feederAKm: 1300, feederAMs: 4.3,
        backboneKm: 0, backboneMs: 0,
        feederBKm: 1250, feederBMs: 4.1,
        userLinkBKm: 1200, userLinkBMs: 4.0,
      },
    });

    expectValidChain(result);
    expect(result.nodes).toHaveLength(5);
    expect(result.nodes.filter((n) => n.kind === 'pop')).toHaveLength(0);
    expect(result.nodes.filter((n) => n.kind === 'snp')).toHaveLength(1);
  });

  it('satellite nodes are clickable when onSatelliteClick is provided', () => {
    const clicked: (SatelliteData | null)[] = [];
    const result = buildLeoRouteDiagram({
      isS2S: false,
      isAtoB: true,
      onSatelliteClick: (s) => clicked.push(s),
      single: {
        siteLabel: 'Site A', satellite: satA, beamIndex: null, snpName: 'Mornac',
        userToSatKm: 1100, userToSatMs: 3.7, satToSnpKm: 1300, satToSnpMs: 4.3,
      },
    });

    const satelliteNode = result.nodes.find((n) => n.kind === 'satellite');
    satelliteNode?.onClick?.();
    expect(clicked).toEqual([satA]);
  });
});

describe('buildGeoRouteDiagram', () => {
  it('builds a 3-node STAR Forward chain (Gateway -> Satellite -> User)', () => {
    const result = buildGeoRouteDiagram({
      isMeshOrP2P: false,
      isStarReturn: false,
      isForwardMeshDirection: true,
      satellite: geoSat,
      star: {
        userLabel: 'User',
        gatewayDisplayName: 'Cagliari',
        userToSatKm: 38000, userToSatMs: 126.7,
        satToGatewayKm: 37800, satToGatewayMs: 126.1,
      },
    });

    expectValidChain(result);
    expect(result.nodes.map((n) => n.label)).toEqual(['Cagliari', 'EUTELSAT TEST', 'User']);
  });

  it('builds a 3-node STAR Return chain (User -> Satellite -> Gateway)', () => {
    const result = buildGeoRouteDiagram({
      isMeshOrP2P: false,
      isStarReturn: true,
      isForwardMeshDirection: true,
      satellite: geoSat,
      star: {
        userLabel: 'User',
        gatewayDisplayName: 'Cagliari (failover)',
        userToSatKm: 38000, userToSatMs: 126.7,
        satToGatewayKm: 37800, satToGatewayMs: 126.1,
      },
    });

    expectValidChain(result);
    expect(result.nodes.map((n) => n.label)).toEqual(['User', 'EUTELSAT TEST', 'Cagliari (failover)']);
  });

  it('builds a 3-node Mesh chain with one shared satellite for both sites', () => {
    const result = buildGeoRouteDiagram({
      isMeshOrP2P: true,
      isStarReturn: false,
      isForwardMeshDirection: true,
      satellite: geoSat,
      mesh: {
        pointALabel: 'Site A', pointBLabel: 'Site B',
        aToSatKm: 38100, aToSatMs: 127, satToBKm: 37900, satToBMs: 126.3,
        bToSatKm: 38200, bToSatMs: 127.4, satToAKm: 37800, satToAMs: 126,
      },
    });

    expectValidChain(result);
    expect(result.nodes.map((n) => n.label)).toEqual(['Site A', 'EUTELSAT TEST', 'Site B']);
    // GEO Mesh genuinely uses one satellite for both sites — not a bug, confirmed by prior audit.
    expect(result.nodes.filter((n) => n.kind === 'satellite')).toHaveLength(1);
  });
});
