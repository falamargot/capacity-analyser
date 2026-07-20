import { Cartesian3 } from 'cesium';
import type { EngineeringCauseStageId } from './engineeringAnalysisViewModel';
import type { EngineeringTrafficDirection } from './engineeringFocusModel';

/**
 * Deterministic stage-aware camera direction for the Engineering experience.
 *
 * The resolver turns:
 *   scenario family × topology × direction × authoritative limiting side
 *   × selected Cause Chain stage × visible viewport beside the Inspector
 * into ONE explicit engineering question and ONE deliberate globe composition.
 *
 * It is a presentation consumer only: every input is authoritative state
 * (route nodes, EngineeringTruth's limiting side); nothing is recomputed here,
 * and the resolved frame is absolute — independent of navigation history.
 */

export type EngineeringScenarioFamily =
  | 'GEO_MESH'
  | 'GEO_STAR'
  | 'LEO_SINGLE'
  | 'LEO_SITE_TO_SITE';

export type EngineeringStageSubject =
  | 'SCENARIO_CONTEXT'
  | 'END_TO_END_ROUTE'
  | 'LIMITING_UPLINK'
  | 'LIMITING_DOWNLINK'
  | 'LIMITING_SITE_A_ACCESS'
  | 'LIMITING_SITE_B_ACCESS'
  | 'ACCESS_LINK_GEOMETRY'
  | 'RF_LEGS_UNDECIDED'
  | 'SERVICE_GATE_GATEWAY'
  | 'SERVICE_GATE_BACKBONE'
  | 'SERVICE_GATE_CONTEXT'
  | 'DELIVERED_SERVICE';

export const ENGINEERING_STAGE_QUESTIONS: Record<EngineeringStageSubject, string> = {
  SCENARIO_CONTEXT: 'What exactly are we analysing?',
  END_TO_END_ROUTE: 'How does traffic actually travel through the system?',
  LIMITING_UPLINK: 'Why is the uplink the decisive RF segment?',
  LIMITING_DOWNLINK: 'Why is the downlink the decisive RF segment?',
  LIMITING_SITE_A_ACCESS: 'Why does the source-side access limit the link?',
  LIMITING_SITE_B_ACCESS: 'Why does the destination-side access limit the link?',
  ACCESS_LINK_GEOMETRY: 'Which access geometry is being investigated?',
  RF_LEGS_UNDECIDED: 'Which RF segments are under investigation?',
  SERVICE_GATE_GATEWAY: 'What gateway capability allows or blocks the service?',
  SERVICE_GATE_BACKBONE: 'What backbone capability allows or blocks the service?',
  SERVICE_GATE_CONTEXT: 'Does any shared service gate apply to this scenario?',
  DELIVERED_SERVICE: 'What end-to-end service is ultimately delivered?',
};

export interface EngineeringCameraSceneNodes {
  /** Near-end ground site — always present when a scenario is selected. */
  origin: Cartesian3 | null;
  /** Far-end ground site (MESH/POINT_TO_POINT/LEO site-to-site only). */
  destination: Cartesian3 | null;
  satelliteOrigin: Cartesian3 | null;
  /** Equals satelliteOrigin for GEO and LEO single-site. */
  satelliteDestination: Cartesian3 | null;
  /** GEO STAR teleport, or LEO SNP A. */
  gatewayOrigin: Cartesian3 | null;
  /** LEO SNP B (site-to-site only). */
  gatewayDestination: Cartesian3 | null;
}

export interface EngineeringCameraViewport {
  width: number;
  height: number;
  inspectorWidth: number;
}

export interface EngineeringCameraSceneInput {
  technology: 'GEO' | 'LEO';
  /** LinkMode for GEO, 'SINGLE_SITE' | 'SITE_TO_SITE' (or equivalent) for LEO. */
  topology: string;
  direction: EngineeringTrafficDirection;
  stageId: EngineeringCauseStageId;
  /** Authoritative limiting side from EngineeringTruth — never recomputed here. */
  limitingSide: 'uplink' | 'downlink' | 'A' | 'B' | null;
  nodes: EngineeringCameraSceneNodes;
  viewport: EngineeringCameraViewport;
}

export interface EngineeringCameraFrame {
  destination: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
}

export interface EngineeringCameraIntent {
  scenarioFamily: EngineeringScenarioFamily;
  stageSubject: EngineeringStageSubject;
  engineeringQuestion: string;
  /**
   * The stage's subject entities. Ground subjects are always kept inside the
   * visible (non-Inspector) frame; satellite subjects too unless the family's
   * spec deliberately excludes them from the fit (GEO overview stages, where
   * the rising RF legs communicate the 35 786 km satellite instead).
   */
  primary: Cartesian3[];
  /** Context entities that may sit outside the frame or near its edges. */
  secondary: Cartesian3[];
  frame: EngineeringCameraFrame;
  signature: string;
}

/**
 * One deliberate composition per scenario-family × stage.
 *
 * - `pitchDegrees`: camera elevation above the local horizon at the subject —
 *   high pitch reads as a geographic map, low pitch as a profile of the RF
 *   geometry (legs become visible diagonals instead of stacked verticals).
 * - `azimuthDegrees`: rotation of the viewpoint around the subject, measured
 *   from the route-lateral axis — 0 is a pure side profile of the route,
 *   opposite signs deliberately swing related stages to different sides.
 * - `fitSatellites`: whether satellites participate in the frame fit — GEO
 *   overview stages intentionally keep the 35 786 km satellite out of the fit
 *   so the Earth region stays readable (the rising RF legs communicate it).
 * - `minEarthRadii`/`maxEarthRadii`: hard bounds on subject distance.
 * - `groundScreenY`: vertical screen placement of the ground subject as a
 *   fraction of the half field of view — strongly negative pins the ground
 *   (and the Earth behind it) to the lower part of the frame so an RF leg
 *   reads as a diagonal rising over the planet, never a line in empty space.
 * - `marginDegrees`: keep-out margin from the visible-frame edges.
 */
interface CompositionSpec {
  pitchDegrees: number;
  azimuthDegrees: number;
  fitSatellites: boolean;
  minEarthRadii: number;
  maxEarthRadii: number;
  groundScreenY: number;
  marginDegrees: number;
}

type StageSpecTable = Record<EngineeringCauseStageId, CompositionSpec>;

const GEO_MESH_SPECS: StageSpecTable = {
  scenario: { pitchDegrees: 52, azimuthDegrees: 18, fitSatellites: false, minEarthRadii: 1.05, maxEarthRadii: 2.6, groundScreenY: -0.15, marginDegrees: 8 },
  path: { pitchDegrees: 18, azimuthDegrees: 18, fitSatellites: true, minEarthRadii: 1.4, maxEarthRadii: 9.0, groundScreenY: -0.5, marginDegrees: 3 },
  rf: { pitchDegrees: 22, azimuthDegrees: -30, fitSatellites: true, minEarthRadii: 1.1, maxEarthRadii: 8.0, groundScreenY: -0.52, marginDegrees: 4 },
  service: { pitchDegrees: 66, azimuthDegrees: -20, fitSatellites: false, minEarthRadii: 0.9, maxEarthRadii: 2.0, groundScreenY: -0.12, marginDegrees: 9 },
  delivery: { pitchDegrees: 16, azimuthDegrees: 32, fitSatellites: true, minEarthRadii: 1.6, maxEarthRadii: 9.0, groundScreenY: -0.45, marginDegrees: 3 },
};

const GEO_STAR_SPECS: StageSpecTable = {
  scenario: { pitchDegrees: 52, azimuthDegrees: 18, fitSatellites: false, minEarthRadii: 1.15, maxEarthRadii: 3.0, groundScreenY: -0.15, marginDegrees: 8 },
  path: { pitchDegrees: 18, azimuthDegrees: 18, fitSatellites: true, minEarthRadii: 1.4, maxEarthRadii: 9.0, groundScreenY: -0.5, marginDegrees: 3 },
  rf: { pitchDegrees: 22, azimuthDegrees: -30, fitSatellites: true, minEarthRadii: 1.1, maxEarthRadii: 8.0, groundScreenY: -0.52, marginDegrees: 4 },
  service: { pitchDegrees: 55, azimuthDegrees: -35, fitSatellites: false, minEarthRadii: 0.5, maxEarthRadii: 1.3, groundScreenY: -0.15, marginDegrees: 10 },
  delivery: { pitchDegrees: 16, azimuthDegrees: 32, fitSatellites: true, minEarthRadii: 1.6, maxEarthRadii: 9.0, groundScreenY: -0.45, marginDegrees: 3 },
};

const LEO_SINGLE_SPECS: StageSpecTable = {
  scenario: { pitchDegrees: 40, azimuthDegrees: 18, fitSatellites: true, minEarthRadii: 0.42, maxEarthRadii: 1.2, groundScreenY: -0.2, marginDegrees: 8 },
  path: { pitchDegrees: 18, azimuthDegrees: 18, fitSatellites: true, minEarthRadii: 0.4, maxEarthRadii: 1.6, groundScreenY: -0.45, marginDegrees: 5 },
  rf: { pitchDegrees: 22, azimuthDegrees: -30, fitSatellites: true, minEarthRadii: 0.28, maxEarthRadii: 0.9, groundScreenY: -0.5, marginDegrees: 6 },
  service: { pitchDegrees: 55, azimuthDegrees: -35, fitSatellites: false, minEarthRadii: 0.4, maxEarthRadii: 1.0, groundScreenY: -0.15, marginDegrees: 10 },
  delivery: { pitchDegrees: 15, azimuthDegrees: 32, fitSatellites: true, minEarthRadii: 0.5, maxEarthRadii: 1.6, groundScreenY: -0.4, marginDegrees: 6 },
};

const LEO_S2S_SPECS: StageSpecTable = {
  scenario: { pitchDegrees: 42, azimuthDegrees: 15, fitSatellites: true, minEarthRadii: 0.8, maxEarthRadii: 2.6, groundScreenY: -0.2, marginDegrees: 7 },
  path: { pitchDegrees: 20, azimuthDegrees: 18, fitSatellites: true, minEarthRadii: 0.9, maxEarthRadii: 3.0, groundScreenY: -0.42, marginDegrees: 4 },
  rf: { pitchDegrees: 22, azimuthDegrees: -30, fitSatellites: true, minEarthRadii: 0.28, maxEarthRadii: 1.4, groundScreenY: -0.5, marginDegrees: 6 },
  service: { pitchDegrees: 55, azimuthDegrees: -35, fitSatellites: false, minEarthRadii: 0.6, maxEarthRadii: 2.2, groundScreenY: -0.15, marginDegrees: 9 },
  delivery: { pitchDegrees: 18, azimuthDegrees: 32, fitSatellites: true, minEarthRadii: 1.0, maxEarthRadii: 3.0, groundScreenY: -0.4, marginDegrees: 5 },
};

const SPEC_TABLES: Record<EngineeringScenarioFamily, StageSpecTable> = {
  GEO_MESH: GEO_MESH_SPECS,
  GEO_STAR: GEO_STAR_SPECS,
  LEO_SINGLE: LEO_SINGLE_SPECS,
  LEO_SITE_TO_SITE: LEO_S2S_SPECS,
};

/**
 * Cesium's PerspectiveFrustum applies its 60° `fov` to the horizontal axis
 * when the canvas is landscape, and to the vertical axis in portrait.
 */
const CAMERA_FOV_RADIANS = Math.PI / 3;
const EARTH_RADIUS_METRES = 6_378_137;
const MIN_VECTOR_MAGNITUDE_SQUARED = 1;
const MAX_INSPECTOR_FRACTION = 0.6;
const FIT_ITERATIONS = 48;

export function resolveEngineeringScenarioFamily(
  technology: 'GEO' | 'LEO',
  topology: string,
): EngineeringScenarioFamily {
  if (technology === 'GEO') {
    return topology === 'MESH' || topology === 'POINT_TO_POINT' ? 'GEO_MESH' : 'GEO_STAR';
  }
  return topology === 'SITE_TO_SITE' ? 'LEO_SITE_TO_SITE' : 'LEO_SINGLE';
}

const compact = (positions: Array<Cartesian3 | null | undefined>): Cartesian3[] =>
  positions.filter((position): position is Cartesian3 => position != null);

const uniquePositions = (positions: Cartesian3[]): Cartesian3[] => {
  const result: Cartesian3[] = [];
  positions.forEach((position) => {
    if (result.some((candidate) => Cartesian3.distanceSquared(candidate, position) < 1)) return;
    result.push(position);
  });
  return result;
};

interface SelectedSubject {
  subject: EngineeringStageSubject;
  primaryGround: Cartesian3[];
  primarySatellites: Cartesian3[];
  secondary: Cartesian3[];
}

const subtractPositions = (all: Cartesian3[], used: Cartesian3[]): Cartesian3[] =>
  all.filter((position) => !used.some((candidate) => Cartesian3.distanceSquared(candidate, position) < 1));

/**
 * Casts the authoritative route nodes into the stage's primary/secondary
 * roles. The limiting-side decision is consumed as published by Engineering
 * Truth; direction only translates it to the physical site for MESH.
 */
const selectSubject = (
  family: EngineeringScenarioFamily,
  input: EngineeringCameraSceneInput,
): SelectedSubject | null => {
  const { nodes, stageId, limitingSide, direction } = input;
  const allGround = uniquePositions(compact([nodes.origin, nodes.destination, nodes.gatewayOrigin, nodes.gatewayDestination]));
  const allSatellites = uniquePositions(compact([nodes.satelliteOrigin, nodes.satelliteDestination]));

  const make = (
    subject: EngineeringStageSubject,
    primaryGround: Array<Cartesian3 | null | undefined>,
    primarySatellites: Array<Cartesian3 | null | undefined>,
  ): SelectedSubject | null => {
    const ground = uniquePositions(compact(primaryGround));
    const satellites = uniquePositions(compact(primarySatellites));
    if (ground.length === 0) return null;
    return {
      subject,
      primaryGround: ground,
      primarySatellites: satellites,
      secondary: subtractPositions([...allGround, ...allSatellites], [...ground, ...satellites]),
    };
  };

  const endpointGround = family === 'GEO_STAR'
    ? [nodes.origin, nodes.gatewayOrigin]
    : family === 'LEO_SINGLE'
      ? [nodes.origin]
      : [nodes.origin, nodes.destination];

  switch (stageId) {
    case 'scenario':
      return make('SCENARIO_CONTEXT', endpointGround, allSatellites);
    case 'path':
      return make('END_TO_END_ROUTE', [...allGround], allSatellites);
    case 'rf': {
      if (family === 'LEO_SINGLE') {
        return make('ACCESS_LINK_GEOMETRY', [nodes.origin], [nodes.satelliteOrigin]);
      }
      if (family === 'LEO_SITE_TO_SITE') {
        if (limitingSide === 'A') return make('LIMITING_SITE_A_ACCESS', [nodes.origin], [nodes.satelliteOrigin]);
        if (limitingSide === 'B') return make('LIMITING_SITE_B_ACCESS', [nodes.destination], [nodes.satelliteDestination]);
        return make('RF_LEGS_UNDECIDED', [nodes.origin, nodes.destination], allSatellites);
      }
      if (limitingSide !== 'uplink' && limitingSide !== 'downlink') {
        return make('RF_LEGS_UNDECIDED', endpointGround, allSatellites);
      }
      if (family === 'GEO_STAR') {
        const uplinkGround = input.topology === 'STAR_FORWARD' ? nodes.gatewayOrigin : nodes.origin;
        const downlinkGround = input.topology === 'STAR_FORWARD' ? nodes.origin : nodes.gatewayOrigin;
        return make(
          limitingSide === 'uplink' ? 'LIMITING_UPLINK' : 'LIMITING_DOWNLINK',
          [limitingSide === 'uplink' ? uplinkGround : downlinkGround],
          [nodes.satelliteOrigin],
        );
      }
      // GEO_MESH — the transmitting site owns the uplink.
      const transmitGround = direction === 'A_TO_B' ? nodes.origin : nodes.destination;
      const receiveGround = direction === 'A_TO_B' ? nodes.destination : nodes.origin;
      return make(
        limitingSide === 'uplink' ? 'LIMITING_UPLINK' : 'LIMITING_DOWNLINK',
        [limitingSide === 'uplink' ? transmitGround : receiveGround],
        [nodes.satelliteOrigin],
      );
    }
    case 'service': {
      if (family === 'GEO_STAR' && nodes.gatewayOrigin) {
        return make('SERVICE_GATE_GATEWAY', [nodes.gatewayOrigin], []);
      }
      if (family === 'LEO_SINGLE' && nodes.gatewayOrigin) {
        return make('SERVICE_GATE_BACKBONE', [nodes.gatewayOrigin], []);
      }
      if (family === 'LEO_SITE_TO_SITE' && (nodes.gatewayOrigin || nodes.gatewayDestination)) {
        return make('SERVICE_GATE_BACKBONE', [nodes.gatewayOrigin, nodes.gatewayDestination], []);
      }
      // No spatially meaningful gate — deliberate calm contextual composition.
      return make('SERVICE_GATE_CONTEXT', endpointGround, []);
    }
    case 'delivery':
      return make('DELIVERED_SERVICE', [...allGround], allSatellites);
    default:
      return null;
  }
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

const averagePosition = (positions: Cartesian3[]): Cartesian3 => {
  const average = positions.reduce((sum, position) => Cartesian3.add(sum, position, sum), new Cartesian3());
  return Cartesian3.divideByScalar(average, positions.length, average);
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

/**
 * Horizontal axis of the scenario's route at the subject anchor. All stages
 * of one scenario share this axis, so per-stage azimuths are deliberate
 * rotations around the same subject rather than arbitrary sides.
 */
const resolveRouteAxis = (
  nodes: EngineeringCameraSceneNodes,
  localUp: Cartesian3,
  anchor: Cartesian3,
): Cartesian3 => {
  const far = nodes.destination ?? nodes.gatewayOrigin ?? nodes.satelliteOrigin;
  if (!far || !nodes.origin) return tangentAxisFor(anchor);
  const span = Cartesian3.subtract(far, nodes.origin, new Cartesian3());
  // Project onto the tangent plane at the anchor.
  const radialComponent = Cartesian3.multiplyByScalar(localUp, Cartesian3.dot(span, localUp), new Cartesian3());
  const horizontal = Cartesian3.subtract(span, radialComponent, new Cartesian3());
  if (Cartesian3.magnitudeSquared(horizontal) < MIN_VECTOR_MAGNITUDE_SQUARED) {
    return tangentAxisFor(anchor);
  }
  Cartesian3.normalize(horizontal, horizontal);
  return canonicalizeAxis(horizontal);
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

interface Orientation {
  direction: Cartesian3;
  up: Cartesian3;
  right: Cartesian3;
}

const orientationFor = (
  baseDirection: Cartesian3,
  preferredUp: Cartesian3,
  fallbackAxis: Cartesian3,
  yawRadians: number,
  pitchRadians: number,
): Orientation => {
  const up0 = projectedUp(preferredUp, baseDirection, fallbackAxis);
  const right0 = Cartesian3.normalize(Cartesian3.cross(baseDirection, up0, new Cartesian3()), new Cartesian3());

  // Yaw around up: aim toward screen-right so the subject shifts into the
  // visible (non-Inspector) region.
  const yawed = Cartesian3.normalize(
    Cartesian3.add(
      Cartesian3.multiplyByScalar(baseDirection, Math.cos(yawRadians), new Cartesian3()),
      Cartesian3.multiplyByScalar(right0, Math.sin(yawRadians), new Cartesian3()),
      new Cartesian3(),
    ),
    new Cartesian3(),
  );
  const right1 = Cartesian3.normalize(Cartesian3.cross(yawed, up0, new Cartesian3()), new Cartesian3());

  // Pitch around right: aim above/below the subject for vertical placement.
  const direction = Cartesian3.normalize(
    Cartesian3.add(
      Cartesian3.multiplyByScalar(yawed, Math.cos(pitchRadians), new Cartesian3()),
      Cartesian3.multiplyByScalar(up0, Math.sin(pitchRadians), new Cartesian3()),
      new Cartesian3(),
    ),
    new Cartesian3(),
  );
  const up = Cartesian3.normalize(Cartesian3.cross(right1, direction, new Cartesian3()), new Cartesian3());
  return { direction, up, right: right1 };
};

/**
 * Resolves one deliberate, deterministic globe composition for the selected
 * Cause Chain stage. Returns null when the scene has no ground subject yet.
 */
export function resolveEngineeringCameraIntent(
  input: EngineeringCameraSceneInput,
): EngineeringCameraIntent | null {
  const family = resolveEngineeringScenarioFamily(input.technology, input.topology);
  const selected = selectSubject(family, input);
  if (!selected) return null;

  const spec = SPEC_TABLES[family][input.stageId];
  const { primaryGround, primarySatellites } = selected;
  const mustFit = spec.fitSatellites ? [...primaryGround, ...primarySatellites] : primaryGround;

  const earthRadius = primaryGround.reduce(
    (sum, position) => sum + Cartesian3.magnitude(position),
    0,
  ) / primaryGround.length || EARTH_RADIUS_METRES;

  const groundAnchor = earthSurfaceAnchor(primaryGround, earthRadius);
  const localUp = Cartesian3.normalize(groundAnchor, new Cartesian3());

  const routeAxis = resolveRouteAxis(input.nodes, localUp, groundAnchor);
  let lateral = canonicalizeAxis(Cartesian3.normalize(
    Cartesian3.cross(localUp, routeAxis, new Cartesian3()),
    new Cartesian3(),
  ));
  let alongAxis = routeAxis;
  let behindSubjectView = false;

  // Stages that frame a spacecraft use the engineer's viewpoint: the camera
  // stands behind the ground subject looking toward the satellite's azimuth.
  // The RF leg then rises in depth and height (small screen-x), the sites sit
  // low with the Earth beneath them, and the spacecraft is up ahead — instead
  // of smearing the tens-of-thousands-of-kilometres horizontal offset of a
  // GEO satellite across the narrow visible strip.
  if (spec.fitSatellites && primarySatellites.length > 0) {
    const satelliteAnchor = averagePosition(primarySatellites);
    const toSatellite = Cartesian3.subtract(satelliteAnchor, groundAnchor, new Cartesian3());
    const radial = Cartesian3.multiplyByScalar(localUp, Cartesian3.dot(toSatellite, localUp), new Cartesian3());
    const horizontalToSatellite = Cartesian3.subtract(toSatellite, radial, new Cartesian3());
    if (Cartesian3.magnitudeSquared(horizontalToSatellite) >= MIN_VECTOR_MAGNITUDE_SQUARED) {
      // Deliberately NOT canonicalized: pointing toward the satellite azimuth
      // is the meaning of this axis, and it is a pure function of the scene.
      alongAxis = Cartesian3.normalize(horizontalToSatellite, new Cartesian3());
      lateral = Cartesian3.normalize(Cartesian3.cross(localUp, alongAxis, new Cartesian3()), new Cartesian3());
      behindSubjectView = true;
    }
  }

  // Camera offset direction: horizontal component rotated by the stage azimuth
  // around the subject, then lifted by the stage pitch. The ray is anchored at
  // the ground subject so the Earth always stays behind the composition.
  const azimuthRadians = (spec.azimuthDegrees * Math.PI) / 180;
  const pitchRadians = (spec.pitchDegrees * Math.PI) / 180;
  const horizontal = behindSubjectView
    ? Cartesian3.add(
      Cartesian3.multiplyByScalar(alongAxis, -Math.cos(azimuthRadians), new Cartesian3()),
      Cartesian3.multiplyByScalar(lateral, Math.sin(azimuthRadians), new Cartesian3()),
      new Cartesian3(),
    )
    : Cartesian3.add(
      Cartesian3.multiplyByScalar(lateral, Math.cos(azimuthRadians), new Cartesian3()),
      Cartesian3.multiplyByScalar(alongAxis, Math.sin(azimuthRadians), new Cartesian3()),
      new Cartesian3(),
    );
  const offsetDirection = Cartesian3.normalize(
    Cartesian3.add(
      Cartesian3.multiplyByScalar(horizontal, Math.cos(pitchRadians), new Cartesian3()),
      Cartesian3.multiplyByScalar(localUp, Math.sin(pitchRadians), new Cartesian3()),
      new Cartesian3(),
    ),
    new Cartesian3(),
  );

  // Screen-space windows are computed against the actually visible globe
  // rectangle: the Inspector occludes the right-hand strip of the canvas.
  const viewportWidth = Math.max(input.viewport.width, 1);
  const viewportHeight = Math.max(input.viewport.height, 1);
  const inspectorFraction = Math.min(
    Math.max(input.viewport.inspectorWidth, 0) / viewportWidth,
    MAX_INSPECTOR_FRACTION,
  );
  const tanFov = Math.tan(CAMERA_FOV_RADIANS / 2);
  const isLandscape = viewportWidth >= viewportHeight;
  const tanHorizontal = isLandscape ? tanFov : tanFov * (viewportWidth / viewportHeight);
  const tanVertical = isLandscape ? tanFov * (viewportHeight / viewportWidth) : tanFov;
  const tanWindowLeft = -tanHorizontal;
  const tanWindowRight = (1 - 2 * inspectorFraction) * tanHorizontal;
  const windowCenterAngle = Math.atan((tanWindowLeft + tanWindowRight) / 2);
  const groundTargetAngle = Math.atan(spec.groundScreenY * tanVertical);
  const marginTan = Math.tan((spec.marginDegrees * Math.PI) / 180);
  const baseDirection = Cartesian3.negate(offsetDirection, new Cartesian3());

  // Screen composition at a candidate distance: pin the ground subject to its
  // spec'd vertical placement (Earth low, spacecraft high) and balance the
  // fitted content horizontally inside the visible window. Both rules are
  // pure functions of the candidate distance, so the resolved frame stays
  // deterministic and history-free.
  const orientationAtDistance = (distance: number): Orientation => {
    const camera = Cartesian3.add(
      groundAnchor,
      Cartesian3.multiplyByScalar(offsetDirection, distance, new Cartesian3()),
      new Cartesian3(),
    );
    const base = orientationFor(baseDirection, localUp, lateral, 0, 0);
    let minTanX = Number.POSITIVE_INFINITY;
    let maxTanX = Number.NEGATIVE_INFINITY;
    mustFit.forEach((point) => {
      const relative = Cartesian3.subtract(point, camera, new Cartesian3());
      const forward = Cartesian3.dot(relative, base.direction);
      if (forward <= 1e-3) return;
      const tanX = Cartesian3.dot(relative, base.right) / forward;
      minTanX = Math.min(minTanX, tanX);
      maxTanX = Math.max(maxTanX, tanX);
    });
    const contentCenterAngle = Number.isFinite(minTanX) ? Math.atan((minTanX + maxTanX) / 2) : 0;
    const yaw = contentCenterAngle - windowCenterAngle;
    // The ground anchor sits on the base view axis (angle 0 by construction).
    const pitch = -groundTargetAngle;
    return orientationFor(baseDirection, localUp, lateral, yaw, pitch);
  };

  const fitsAtDistance = (distance: number): boolean => {
    const camera = Cartesian3.add(
      groundAnchor,
      Cartesian3.multiplyByScalar(offsetDirection, distance, new Cartesian3()),
      new Cartesian3(),
    );
    const orientation = orientationAtDistance(distance);
    return mustFit.every((point) => {
      const relative = Cartesian3.subtract(point, camera, new Cartesian3());
      const forward = Cartesian3.dot(relative, orientation.direction);
      if (forward <= 1e-3) return false;
      const tanX = Cartesian3.dot(relative, orientation.right) / forward;
      const tanY = Cartesian3.dot(relative, orientation.up) / forward;
      return tanX >= tanWindowLeft + marginTan
        && tanX <= tanWindowRight - marginTan
        && tanY >= -tanVertical + marginTan
        && tanY <= tanVertical - marginTan;
    });
  };

  // Deterministic one-shot framing: smallest distance inside the stage bounds
  // that keeps every primary subject inside the visible frame. No feedback
  // loop — the target is resolved once from current authoritative state.
  const minDistance = earthRadius * spec.minEarthRadii;
  const maxDistance = earthRadius * spec.maxEarthRadii;
  let distance = maxDistance;
  if (fitsAtDistance(minDistance)) {
    distance = minDistance;
  } else if (fitsAtDistance(maxDistance)) {
    let low = minDistance;
    let high = maxDistance;
    for (let iteration = 0; iteration < FIT_ITERATIONS; iteration += 1) {
      const middle = (low + high) / 2;
      if (fitsAtDistance(middle)) {
        high = middle;
      } else {
        low = middle;
      }
    }
    distance = high;
  }

  const orientation = orientationAtDistance(distance);
  const destination = Cartesian3.add(
    groundAnchor,
    Cartesian3.multiplyByScalar(offsetDirection, distance, new Cartesian3()),
    new Cartesian3(),
  );

  const signature = [
    input.technology,
    input.topology,
    input.direction,
    input.stageId,
    family,
    selected.subject,
    Math.round(viewportWidth),
    Math.round(viewportHeight),
    Math.round(inspectorFraction * viewportWidth),
    ...primaryGround.map((position) => `g:${roundedVectorSignature(position, 10_000)}`),
    ...primarySatellites.map((position) => `s:${roundedVectorSignature(position, 10_000)}`),
  ].join('|');

  return {
    scenarioFamily: family,
    stageSubject: selected.subject,
    engineeringQuestion: ENGINEERING_STAGE_QUESTIONS[selected.subject],
    primary: [...primaryGround, ...primarySatellites].map((position) => Cartesian3.clone(position)),
    secondary: selected.secondary.map((position) => Cartesian3.clone(position)),
    frame: {
      destination,
      direction: Cartesian3.clone(orientation.direction),
      up: Cartesian3.clone(orientation.up),
    },
    signature,
  };
}

export function engineeringCameraFrameIsEquivalent(
  current: EngineeringCameraFrame,
  target: EngineeringCameraFrame,
): boolean {
  const positionTolerance = Math.max(2_500, Cartesian3.magnitude(target.destination) * 0.00008);
  return Cartesian3.distance(current.destination, target.destination) <= positionTolerance
    && Cartesian3.dot(current.direction, target.direction) >= 0.99998
    && Cartesian3.dot(current.up, target.up) >= 0.9999;
}
