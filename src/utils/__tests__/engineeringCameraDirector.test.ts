import { Cartesian3 } from 'cesium';
import { describe, expect, it } from 'vitest';
import {
  engineeringCameraFrameIsEquivalent,
  resolveEngineeringCameraIntent,
  resolveEngineeringScenarioFamily,
  type EngineeringCameraSceneInput,
  type EngineeringCameraSceneNodes,
} from '../engineeringCameraDirector';

const origin = Cartesian3.fromDegrees(2.35, 48.86, 80);
const geoSatellite = Cartesian3.fromDegrees(7, 0, 35_786_000);
const gateway = Cartesian3.fromDegrees(6.1, 46.2, 80);
const siteB = Cartesian3.fromDegrees(-3.7, 40.4, 80);
const leoSatelliteA = Cartesian3.fromDegrees(4, 47, 1_200_000);
const leoSatelliteB = Cartesian3.fromDegrees(-2, 42, 1_200_000);
const snpA = Cartesian3.fromDegrees(5, 46, 80);
const snpB = Cartesian3.fromDegrees(-4, 41, 80);

const geoStarNodes: EngineeringCameraSceneNodes = {
  origin,
  destination: null,
  satelliteOrigin: geoSatellite,
  satelliteDestination: geoSatellite,
  gatewayOrigin: gateway,
  gatewayDestination: null,
};

const geoMeshNodes: EngineeringCameraSceneNodes = {
  origin,
  destination: siteB,
  satelliteOrigin: geoSatellite,
  satelliteDestination: geoSatellite,
  gatewayOrigin: null,
  gatewayDestination: null,
};

const leoSingleNodes: EngineeringCameraSceneNodes = {
  origin,
  destination: null,
  satelliteOrigin: leoSatelliteA,
  satelliteDestination: leoSatelliteA,
  gatewayOrigin: snpA,
  gatewayDestination: null,
};

const leoS2SNodes: EngineeringCameraSceneNodes = {
  origin,
  destination: siteB,
  satelliteOrigin: leoSatelliteA,
  satelliteDestination: leoSatelliteB,
  gatewayOrigin: snpA,
  gatewayDestination: snpB,
};

const viewport = { width: 1320, height: 900, inspectorWidth: 640 };

const input = (overrides: Partial<EngineeringCameraSceneInput> = {}): EngineeringCameraSceneInput => ({
  technology: 'GEO',
  topology: 'STAR_FORWARD',
  direction: 'A_TO_B',
  stageId: 'scenario',
  limitingSide: null,
  nodes: geoStarNodes,
  viewport,
  ...overrides,
});

const STAGES: EngineeringCameraSceneInput['stageId'][] = ['scenario', 'path', 'rf', 'service', 'delivery'];

const expectSameVector = (left: Cartesian3, right: Cartesian3) => {
  expect(Cartesian3.equals(left, right)).toBe(true);
};

const containsPosition = (positions: Cartesian3[], position: Cartesian3) =>
  positions.some((candidate) => Cartesian3.equals(candidate, position));

describe('resolveEngineeringScenarioFamily', () => {
  it('maps every supported technology and topology to its composition family', () => {
    expect(resolveEngineeringScenarioFamily('GEO', 'MESH')).toBe('GEO_MESH');
    expect(resolveEngineeringScenarioFamily('GEO', 'POINT_TO_POINT')).toBe('GEO_MESH');
    expect(resolveEngineeringScenarioFamily('GEO', 'STAR_FORWARD')).toBe('GEO_STAR');
    expect(resolveEngineeringScenarioFamily('GEO', 'STAR_RETURN')).toBe('GEO_STAR');
    expect(resolveEngineeringScenarioFamily('LEO', 'SINGLE_SITE')).toBe('LEO_SINGLE');
    expect(resolveEngineeringScenarioFamily('LEO', 'SITE_TO_SITE')).toBe('LEO_SITE_TO_SITE');
  });
});

describe('resolveEngineeringCameraIntent', () => {
  it('is deterministic: the same scenario and stage always resolve to the same frame, regardless of navigation order', () => {
    const rfInput = input({ stageId: 'rf', limitingSide: 'uplink' });
    const first = resolveEngineeringCameraIntent(rfInput)!;
    // Visit every other stage first, then come back to 'rf'.
    STAGES.filter((stage) => stage !== 'rf').forEach((stage) => (
      resolveEngineeringCameraIntent(input({ stageId: stage, limitingSide: 'uplink' }))
    ));
    const revisited = resolveEngineeringCameraIntent(rfInput)!;

    expect(revisited.signature).toBe(first.signature);
    expectSameVector(revisited.frame.destination, first.frame.destination);
    expectSameVector(revisited.frame.direction, first.frame.direction);
    expectSameVector(revisited.frame.up, first.frame.up);
  });

  it.each([
    ['GEO STAR', input({ limitingSide: 'uplink' })],
    ['GEO MESH', input({ topology: 'MESH', nodes: geoMeshNodes, limitingSide: 'downlink' })],
    ['LEO single-site', input({ technology: 'LEO', topology: 'SINGLE_SITE', nodes: leoSingleNodes })],
    ['LEO site-to-site', input({ technology: 'LEO', topology: 'SITE_TO_SITE', nodes: leoS2SNodes, limitingSide: 'A' })],
  ] as const)('gives every Cause Chain stage a distinct signature, subject framing and destination for %s', (_label, base) => {
    const intents = STAGES.map((stageId) => resolveEngineeringCameraIntent({ ...base, stageId })!);

    const signatures = intents.map((intent) => intent.signature);
    expect(new Set(signatures).size).toBe(signatures.length);

    for (let i = 1; i < intents.length; i += 1) {
      expect(Cartesian3.equals(intents[i].frame.destination, intents[0].frame.destination)).toBe(false);
    }
  });

  it('answers one explicit engineering question per stage', () => {
    STAGES.forEach((stageId) => {
      const intent = resolveEngineeringCameraIntent(input({ stageId, limitingSide: 'uplink' }))!;
      expect(intent.engineeringQuestion.length).toBeGreaterThan(0);
    });
  });

  describe('Link Budget consumes the authoritative limiting side', () => {
    it('GEO STAR FORWARD uplink-limited → the gateway uplink is the subject', () => {
      const intent = resolveEngineeringCameraIntent(input({ stageId: 'rf', limitingSide: 'uplink' }))!;
      expect(intent.stageSubject).toBe('LIMITING_UPLINK');
      expect(containsPosition(intent.primary, gateway)).toBe(true);
      expect(containsPosition(intent.primary, geoSatellite)).toBe(true);
      expect(containsPosition(intent.primary, origin)).toBe(false);
      expect(containsPosition(intent.secondary, origin)).toBe(true);
    });

    it('GEO STAR FORWARD downlink-limited → the user downlink is the subject', () => {
      const intent = resolveEngineeringCameraIntent(input({ stageId: 'rf', limitingSide: 'downlink' }))!;
      expect(intent.stageSubject).toBe('LIMITING_DOWNLINK');
      expect(containsPosition(intent.primary, origin)).toBe(true);
      expect(containsPosition(intent.primary, gateway)).toBe(false);
    });

    it('GEO STAR RETURN uplink-limited → the user uplink is the subject', () => {
      const intent = resolveEngineeringCameraIntent(input({ topology: 'STAR_RETURN', stageId: 'rf', limitingSide: 'uplink' }))!;
      expect(intent.stageSubject).toBe('LIMITING_UPLINK');
      expect(containsPosition(intent.primary, origin)).toBe(true);
      expect(containsPosition(intent.primary, gateway)).toBe(false);
    });

    it('GEO MESH reverse direction maps the uplink to site B', () => {
      const intent = resolveEngineeringCameraIntent(input({
        topology: 'MESH',
        nodes: geoMeshNodes,
        direction: 'B_TO_A',
        stageId: 'rf',
        limitingSide: 'uplink',
      }))!;
      expect(intent.stageSubject).toBe('LIMITING_UPLINK');
      expect(containsPosition(intent.primary, siteB)).toBe(true);
      expect(containsPosition(intent.primary, origin)).toBe(false);
    });

    it('LEO site-to-site limiting side A / B selects that site and its serving spacecraft only', () => {
      const sideA = resolveEngineeringCameraIntent(input({
        technology: 'LEO', topology: 'SITE_TO_SITE', nodes: leoS2SNodes, stageId: 'rf', limitingSide: 'A',
      }))!;
      expect(sideA.stageSubject).toBe('LIMITING_SITE_A_ACCESS');
      expect(containsPosition(sideA.primary, origin)).toBe(true);
      expect(containsPosition(sideA.primary, leoSatelliteA)).toBe(true);
      expect(containsPosition(sideA.primary, siteB)).toBe(false);
      expect(containsPosition(sideA.primary, leoSatelliteB)).toBe(false);

      const sideB = resolveEngineeringCameraIntent(input({
        technology: 'LEO', topology: 'SITE_TO_SITE', nodes: leoS2SNodes, stageId: 'rf', limitingSide: 'B',
      }))!;
      expect(sideB.stageSubject).toBe('LIMITING_SITE_B_ACCESS');
      expect(containsPosition(sideB.primary, siteB)).toBe(true);
      expect(containsPosition(sideB.primary, leoSatelliteB)).toBe(true);
      expect(containsPosition(sideB.primary, origin)).toBe(false);
    });

    it('falls back to an undecided RF composition when no limiting side is published', () => {
      const intent = resolveEngineeringCameraIntent(input({ stageId: 'rf', limitingSide: null }))!;
      expect(intent.stageSubject).toBe('RF_LEGS_UNDECIDED');
      expect(containsPosition(intent.primary, origin)).toBe(true);
      expect(containsPosition(intent.primary, gateway)).toBe(true);
    });
  });

  describe('Service Gates', () => {
    it('GEO STAR → gateway-centric composition', () => {
      const intent = resolveEngineeringCameraIntent(input({ stageId: 'service' }))!;
      expect(intent.stageSubject).toBe('SERVICE_GATE_GATEWAY');
      expect(containsPosition(intent.primary, gateway)).toBe(true);
      expect(containsPosition(intent.primary, origin)).toBe(false);
    });

    it('GEO MESH (no shared gate) → deliberate calm contextual composition, not a stale Link Budget focus', () => {
      const intent = resolveEngineeringCameraIntent(input({ topology: 'MESH', nodes: geoMeshNodes, stageId: 'service' }))!;
      expect(intent.stageSubject).toBe('SERVICE_GATE_CONTEXT');
      expect(containsPosition(intent.primary, origin)).toBe(true);
      expect(containsPosition(intent.primary, siteB)).toBe(true);
      expect(containsPosition(intent.primary, geoSatellite)).toBe(false);
    });

    it('LEO site-to-site → backbone-centric composition on both SNPs', () => {
      const intent = resolveEngineeringCameraIntent(input({
        technology: 'LEO', topology: 'SITE_TO_SITE', nodes: leoS2SNodes, stageId: 'service',
      }))!;
      expect(intent.stageSubject).toBe('SERVICE_GATE_BACKBONE');
      expect(containsPosition(intent.primary, snpA)).toBe(true);
      expect(containsPosition(intent.primary, snpB)).toBe(true);
      expect(containsPosition(intent.primary, origin)).toBe(false);
    });
  });

  it('Delivery frames the complete delivered relationship, distinct from Path', () => {
    const path = resolveEngineeringCameraIntent(input({ stageId: 'path' }))!;
    const delivery = resolveEngineeringCameraIntent(input({ stageId: 'delivery' }))!;

    expect(path.stageSubject).toBe('END_TO_END_ROUTE');
    expect(delivery.stageSubject).toBe('DELIVERED_SERVICE');
    [origin, gateway, geoSatellite].forEach((position) => {
      expect(containsPosition(path.primary, position)).toBe(true);
      expect(containsPosition(delivery.primary, position)).toBe(true);
    });
    expect(delivery.signature).not.toBe(path.signature);
    expect(Cartesian3.equals(delivery.frame.destination, path.frame.destination)).toBe(false);
  });

  it('keeps every fitted subject inside the visible (non-Inspector) frame', () => {
    STAGES.forEach((stageId) => {
      const intent = resolveEngineeringCameraIntent(input({
        technology: 'LEO', topology: 'SITE_TO_SITE', nodes: leoS2SNodes, stageId, limitingSide: 'A',
      }))!;
      const { destination, direction, up } = intent.frame;
      const right = Cartesian3.cross(direction, up, new Cartesian3());
      // Cesium's 60° fov is horizontal on a landscape canvas.
      const tanHorizontal = Math.tan(Math.PI / 6);
      const tanVertical = tanHorizontal * (viewport.height / viewport.width);
      const inspectorFraction = viewport.inspectorWidth / viewport.width;
      const tanWindowRight = (1 - 2 * inspectorFraction) * tanHorizontal;

      // Ground subjects must always fit; satellites participate per the spec.
      intent.primary
        .filter((point) => Cartesian3.magnitude(point) < 6_500_000)
        .forEach((point) => {
          const relative = Cartesian3.subtract(point, destination, new Cartesian3());
          const forward = Cartesian3.dot(relative, direction);
          expect(forward).toBeGreaterThan(0);
          const tanX = Cartesian3.dot(relative, right) / forward;
          const tanY = Cartesian3.dot(relative, up) / forward;
          expect(tanX).toBeGreaterThanOrEqual(-tanHorizontal);
          expect(tanX).toBeLessThanOrEqual(tanWindowRight);
          expect(Math.abs(tanY)).toBeLessThanOrEqual(tanVertical);
        });
    });
  });

  it('resolves a different composition when the Inspector geometry changes', () => {
    const unobscured = resolveEngineeringCameraIntent(input({
      viewport: { width: 1320, height: 900, inspectorWidth: 0 },
    }))!;
    const overlaid = resolveEngineeringCameraIntent(input())!;

    expect(overlaid.signature).not.toBe(unobscured.signature);
    expect(Cartesian3.equals(unobscured.frame.direction, overlaid.frame.direction)).toBe(false);
  });

  it('returns null when there are no ground nodes to frame', () => {
    const intent = resolveEngineeringCameraIntent(input({
      nodes: { origin: null, destination: null, satelliteOrigin: null, satelliteDestination: null, gatewayOrigin: null, gatewayDestination: null },
    }));

    expect(intent).toBeNull();
  });

  it('recognizes a re-resolved frame as materially equivalent', () => {
    const first = resolveEngineeringCameraIntent(input())!;
    const second = resolveEngineeringCameraIntent(input())!;

    expect(engineeringCameraFrameIsEquivalent(first.frame, second.frame)).toBe(true);
  });
});
