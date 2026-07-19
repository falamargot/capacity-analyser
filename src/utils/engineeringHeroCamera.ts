import { Cartesian3 } from 'cesium';

export interface EngineeringHeroCameraViewport {
  width: number;
  height: number;
  inspectorWidth: number;
}

export interface EngineeringHeroCameraInput {
  technology: 'GEO' | 'LEO';
  topology: string;
  groundNodes: Array<Cartesian3 | null>;
  servingSatellites: Array<Cartesian3 | null>;
  viewport: EngineeringHeroCameraViewport;
}

export interface EngineeringHeroCameraTarget {
  intent: 'engineering-scenario-hero';
  destination: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  framedPositions: Cartesian3[];
  signature: string;
}

interface HeroComposition {
  satelliteBlend: number;
  minimumEarthRadii: number;
  routeDistanceFactor: number;
  verticalLiftEarthRadii: number;
}

const HERO_COMPOSITION: Record<EngineeringHeroCameraInput['technology'], HeroComposition> = {
  GEO: {
    satelliteBlend: 0.05,
    minimumEarthRadii: 4.55,
    routeDistanceFactor: 0.78,
    verticalLiftEarthRadii: 0.2,
  },
  LEO: {
    satelliteBlend: 0.08,
    minimumEarthRadii: 1.22,
    routeDistanceFactor: 2.15,
    verticalLiftEarthRadii: 0.12,
  },
};

const CAMERA_VERTICAL_FOV_RADIANS = Math.PI / 3;
const INSPECTOR_HORIZONTAL_BIAS_FACTOR = 0.46;
const MIN_VECTOR_MAGNITUDE_SQUARED = 1;
const EARTH_RADIUS_METRES = 6_378_137;

const uniquePositions = (positions: Array<Cartesian3 | null>): Cartesian3[] => {
  const result: Cartesian3[] = [];
  positions.forEach((position) => {
    if (!position) return;
    if (result.some((candidate) => Cartesian3.distanceSquared(candidate, position) < 1)) return;
    result.push(position);
  });
  return result;
};

const canonicalizeAxis = (axis: Cartesian3): Cartesian3 => {
  const components = [axis.z, axis.y, axis.x];
  const decisiveComponent = components.find((component) => Math.abs(component) > 1e-8) ?? 1;
  if (decisiveComponent < 0) Cartesian3.negate(axis, axis);
  return axis;
};

const tangentAxisFor = (radial: Cartesian3): Cartesian3 => {
  let tangent = Cartesian3.cross(Cartesian3.UNIT_Z, radial, new Cartesian3());
  if (Cartesian3.magnitudeSquared(tangent) < MIN_VECTOR_MAGNITUDE_SQUARED) {
    tangent = Cartesian3.cross(Cartesian3.UNIT_Y, radial, tangent);
  }
  Cartesian3.normalize(tangent, tangent);
  return canonicalizeAxis(tangent);
};

const earthSurfaceAnchor = (groundNodes: Cartesian3[], earthRadius: number): Cartesian3 => {
  const averageDirection = groundNodes.reduce((sum, position) => (
    Cartesian3.add(sum, Cartesian3.normalize(position, new Cartesian3()), sum)
  ), new Cartesian3());

  if (Cartesian3.magnitudeSquared(averageDirection) < 1e-8) {
    return Cartesian3.clone(groundNodes[0]);
  }
  Cartesian3.normalize(averageDirection, averageDirection);
  return Cartesian3.multiplyByScalar(averageDirection, earthRadius, averageDirection);
};

const averagePosition = (positions: Cartesian3[]): Cartesian3 => {
  const average = positions.reduce((sum, position) => Cartesian3.add(sum, position, sum), new Cartesian3());
  return Cartesian3.divideByScalar(average, positions.length, average);
};

const resolveDeterministicLateral = (
  groundNodes: Cartesian3[],
  satelliteAnchor: Cartesian3 | null,
  earthAnchor: Cartesian3,
): Cartesian3 => {
  let lateral = new Cartesian3();

  if (satelliteAnchor && groundNodes.length >= 2) {
    const firstLeg = Cartesian3.subtract(satelliteAnchor, groundNodes[0], new Cartesian3());
    const lastLeg = Cartesian3.subtract(groundNodes[groundNodes.length - 1], satelliteAnchor, new Cartesian3());
    lateral = Cartesian3.cross(firstLeg, lastLeg, lateral);
  }
  if (Cartesian3.magnitudeSquared(lateral) < MIN_VECTOR_MAGNITUDE_SQUARED && satelliteAnchor) {
    lateral = Cartesian3.cross(satelliteAnchor, earthAnchor, lateral);
  }
  if (Cartesian3.magnitudeSquared(lateral) < MIN_VECTOR_MAGNITUDE_SQUARED) {
    return tangentAxisFor(earthAnchor);
  }

  Cartesian3.normalize(lateral, lateral);
  return canonicalizeAxis(lateral);
};

const projectedUp = (preferredUp: Cartesian3, direction: Cartesian3, fallbackAxis: Cartesian3): Cartesian3 => {
  const projection = Cartesian3.multiplyByScalar(direction, Cartesian3.dot(preferredUp, direction), new Cartesian3());
  const up = Cartesian3.subtract(preferredUp, projection, new Cartesian3());
  if (Cartesian3.magnitudeSquared(up) < 0.01) Cartesian3.cross(fallbackAxis, direction, up);
  return Cartesian3.normalize(up, up);
};

const roundedVectorSignature = (position: Cartesian3, precisionMetres: number): string => (
  [position.x, position.y, position.z]
    .map((value) => Math.round(value / precisionMetres))
    .join(',')
);

/**
 * Resolves the single visual anchor for an Engineering investigation.
 *
 * Cause Chain stage identity is deliberately absent from the input. The full
 * scenario geometry owns the frame; stages only change the analytical layers
 * rendered inside it.
 */
export function resolveEngineeringHeroCameraTarget(
  input: EngineeringHeroCameraInput,
): EngineeringHeroCameraTarget | null {
  const groundNodes = uniquePositions(input.groundNodes);
  const servingSatellites = uniquePositions(input.servingSatellites);
  const framedPositions = uniquePositions([...groundNodes, ...servingSatellites]);
  if (groundNodes.length === 0 || framedPositions.length === 0) return null;

  const composition = HERO_COMPOSITION[input.technology];
  const earthRadius = groundNodes.reduce(
    (sum, position) => sum + Cartesian3.magnitude(position),
    0,
  ) / groundNodes.length || EARTH_RADIUS_METRES;
  const earthAnchor = earthSurfaceAnchor(groundNodes, earthRadius);
  const satelliteAnchor = servingSatellites.length > 0 ? averagePosition(servingSatellites) : null;
  const target = satelliteAnchor
    ? Cartesian3.lerp(earthAnchor, satelliteAnchor, composition.satelliteBlend, new Cartesian3())
    : Cartesian3.clone(earthAnchor);
  const earthwardUp = Cartesian3.normalize(earthAnchor, new Cartesian3());
  const routeAxis = satelliteAnchor
    ? Cartesian3.normalize(Cartesian3.subtract(satelliteAnchor, earthAnchor, new Cartesian3()), new Cartesian3())
    : earthwardUp;
  const lateral = resolveDeterministicLateral(groundNodes, satelliteAnchor, earthAnchor);
  const longestTargetDistance = framedPositions.reduce(
    (longest, position) => Math.max(longest, Cartesian3.distance(target, position)),
    earthRadius,
  );
  const lateralDistance = Math.max(
    earthRadius * composition.minimumEarthRadii,
    longestTargetDistance * composition.routeDistanceFactor,
  );
  const destination = Cartesian3.add(
    target,
    Cartesian3.multiplyByScalar(lateral, lateralDistance, new Cartesian3()),
    new Cartesian3(),
  );
  Cartesian3.add(
    destination,
    Cartesian3.multiplyByScalar(earthwardUp, earthRadius * composition.verticalLiftEarthRadii, new Cartesian3()),
    destination,
  );

  const initialDirection = Cartesian3.normalize(
    Cartesian3.subtract(target, destination, new Cartesian3()),
    new Cartesian3(),
  );
  const initialUp = projectedUp(routeAxis, initialDirection, lateral);
  const screenRight = Cartesian3.normalize(
    Cartesian3.cross(initialDirection, initialUp, new Cartesian3()),
    new Cartesian3(),
  );
  const viewportWidth = Math.max(input.viewport.width, 1);
  const viewportHeight = Math.max(input.viewport.height, 1);
  const inspectorWidth = Math.min(Math.max(input.viewport.inspectorWidth, 0), viewportWidth * 0.72);
  const horizontalHalfSpan = lateralDistance
    * Math.tan(CAMERA_VERTICAL_FOV_RADIANS / 2)
    * (viewportWidth / viewportHeight);
  const overlayBias = horizontalHalfSpan
    * (inspectorWidth / viewportWidth)
    * INSPECTOR_HORIZONTAL_BIAS_FACTOR;
  const biasedTarget = Cartesian3.add(
    target,
    Cartesian3.multiplyByScalar(screenRight, overlayBias, new Cartesian3()),
    new Cartesian3(),
  );
  const direction = Cartesian3.normalize(
    Cartesian3.subtract(biasedTarget, destination, new Cartesian3()),
    new Cartesian3(),
  );
  const up = projectedUp(routeAxis, direction, lateral);
  const signature = [
    input.technology,
    input.topology,
    Math.round(viewportWidth),
    Math.round(viewportHeight),
    Math.round(inspectorWidth),
    ...groundNodes.map((position) => `g:${roundedVectorSignature(position, 10_000)}`),
    ...servingSatellites.map((position) => `s:${roundedVectorSignature(position, 10_000)}`),
  ].join('|');

  return {
    intent: 'engineering-scenario-hero',
    destination,
    direction,
    up,
    framedPositions: framedPositions.map((position) => Cartesian3.clone(position)),
    signature,
  };
}

export function engineeringHeroCameraTargetIsEquivalent(
  current: Pick<EngineeringHeroCameraTarget, 'destination' | 'direction' | 'up'>,
  target: Pick<EngineeringHeroCameraTarget, 'destination' | 'direction' | 'up'>,
): boolean {
  const positionTolerance = Math.max(2_500, Cartesian3.magnitude(target.destination) * 0.00008);
  return Cartesian3.distance(current.destination, target.destination) <= positionTolerance
    && Cartesian3.dot(current.direction, target.direction) >= 0.99998
    && Cartesian3.dot(current.up, target.up) >= 0.9999;
}
