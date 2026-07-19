import { Cartesian3 } from 'cesium';
import { describe, expect, it } from 'vitest';
import {
  engineeringHeroCameraTargetIsEquivalent,
  resolveEngineeringHeroCameraTarget,
  type EngineeringHeroCameraInput,
} from '../engineeringHeroCamera';

const origin = Cartesian3.fromDegrees(2.35, 48.86, 80);
const geoSatellite = Cartesian3.fromDegrees(7, 0, 35_786_000);
const gateway = Cartesian3.fromDegrees(6.1, 46.2, 80);
const siteB = Cartesian3.fromDegrees(-3.7, 40.4, 80);
const leoSatelliteA = Cartesian3.fromDegrees(4, 47, 1_200_000);
const leoSatelliteB = Cartesian3.fromDegrees(-2, 42, 1_200_000);

const input = (overrides: Partial<EngineeringHeroCameraInput> = {}): EngineeringHeroCameraInput => ({
  technology: 'GEO',
  topology: 'STAR_FORWARD',
  groundNodes: [origin, gateway],
  servingSatellites: [geoSatellite],
  viewport: { width: 1320, height: 900, inspectorWidth: 640 },
  ...overrides,
});

const expectSameVector = (left: Cartesian3, right: Cartesian3) => {
  expect(Cartesian3.equals(left, right)).toBe(true);
};

describe('resolveEngineeringHeroCameraTarget', () => {
  it('returns one exact Hero Frame throughout any Cause Chain navigation order', () => {
    const stages = ['scenario', 'path', 'rf', 'service', 'delivery'];
    const targets = stages.map(() => resolveEngineeringHeroCameraTarget(input())!);

    for (const target of targets.slice(1)) {
      expect(target.signature).toBe(targets[0].signature);
      expectSameVector(target.destination, targets[0].destination);
      expectSameVector(target.direction, targets[0].direction);
      expectSameVector(target.up, targets[0].up);
    }
  });

  it('frames both GEO route endpoints and the serving spacecraft together', () => {
    const target = resolveEngineeringHeroCameraTarget(input())!;

    expect(target.intent).toBe('engineering-scenario-hero');
    expect(target.framedPositions).toHaveLength(3);
    expect(target.framedPositions.some((position) => Cartesian3.equals(position, origin))).toBe(true);
    expect(target.framedPositions.some((position) => Cartesian3.equals(position, gateway))).toBe(true);
    expect(target.framedPositions.some((position) => Cartesian3.equals(position, geoSatellite))).toBe(true);
  });

  it('supports a multi-spacecraft LEO story without a stage-specific crop', () => {
    const target = resolveEngineeringHeroCameraTarget(input({
      technology: 'LEO',
      topology: 'SITE_TO_SITE',
      groundNodes: [origin, siteB],
      servingSatellites: [leoSatelliteA, leoSatelliteB],
    }))!;

    expect(target.framedPositions).toHaveLength(4);
    expect(target.framedPositions.some((position) => Cartesian3.equals(position, siteB))).toBe(true);
    expect(target.framedPositions.some((position) => Cartesian3.equals(position, leoSatelliteA))).toBe(true);
    expect(target.framedPositions.some((position) => Cartesian3.equals(position, leoSatelliteB))).toBe(true);
  });

  it('accounts for Inspector width without changing the absolute camera position', () => {
    const unobscured = resolveEngineeringHeroCameraTarget(input({
      viewport: { width: 1320, height: 900, inspectorWidth: 0 },
    }))!;
    const overlaid = resolveEngineeringHeroCameraTarget(input())!;

    expectSameVector(unobscured.destination, overlaid.destination);
    expect(Cartesian3.equals(unobscured.direction, overlaid.direction)).toBe(false);
    expect(overlaid.signature).not.toBe(unobscured.signature);
  });

  it('changes the Hero Frame only when scenario geometry or viewport changes', () => {
    const star = resolveEngineeringHeroCameraTarget(input())!;
    const mesh = resolveEngineeringHeroCameraTarget(input({
      topology: 'MESH',
      groundNodes: [origin, siteB],
    }))!;

    expect(mesh.signature).not.toBe(star.signature);
    expect(Cartesian3.equals(mesh.destination, star.destination)).toBe(false);
  });

  it('recognizes a reopened scenario target as materially equivalent', () => {
    const first = resolveEngineeringHeroCameraTarget(input())!;
    const reopened = resolveEngineeringHeroCameraTarget(input())!;

    expect(engineeringHeroCameraTargetIsEquivalent(first, reopened)).toBe(true);
  });
});
