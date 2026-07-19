/**
 * CommercialRouteLayer
 *
 * Renders the CommercialRouteModel as a business route narrative on the Cesium
 * globe. This layer is the primary visual source of truth for commercial mode:
 *
 *   ORIGIN → Satellite Service → Backbone → DESTINATION
 *
 * Responsibilities:
 *   - Ground nodes: ORIGIN, DESTINATION, NETWORK_PORTAL, HUB
 *   - Edges: SPACE_LINK arcs, BACKBONE_LINK dashed ground lines, TERRESTRIAL_TAIL
 *   - Animated opacity via CommercialAnimationState (COMM-6E)
 *   - Pulse halo rings on focused endpoint nodes (access / destination)
 *   - Click routing via entity ID convention ('commercial-route-{segmentId}-...')
 *
 * Sky Bridge (SKY_BRIDGE nodes) are handled by CommercialSkyBridgeLayer.
 * OUTCOME nodes are not rendered.
 *
 * Opacity storytelling:
 *   All nodes and edges remain in the Cesium scene at all times.
 *   FOCUS_OPACITY_PROFILES drives per-segment target opacity based on the
 *   focused Journey segment — no hard-cut show/hide except TERRESTRIAL_TAIL.
 *
 * COMM-6D4 — Commercial Route Narrative Rendering.
 * COMM-6E   — Route reveal and focus transition animations.
 */

import React, { useRef, useMemo } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
  Cartesian3,
  Color,
  ArcType,
  PolylineGlowMaterialProperty,
  PolylineDashMaterialProperty,
  CallbackProperty,
  VerticalOrigin,
  HorizontalOrigin,
  Cartesian2,
  Viewer as CesiumViewerType,
} from 'cesium';
import type {
  CommercialRouteModel,
  CommercialRouteNode,
  CommercialRouteEdge,
  CommercialRouteEdgeType,
  CommercialRouteNodeType,
  CommercialRouteStatus,
  CommercialRouteTechnology,
  CommercialRouteSegmentId,
} from '../../types/commercialRouteModel';
import { getPosition, calculateDynamicScale, DPR_FACTOR, type CameraMetricsSnapshot } from './utils';
import { GROUND_POINT_ALTITUDE_KM, LABEL_EYE_OFFSET } from './layerHeights';
import {
  type CommercialAnimationState,
  ANIM_SEGMENT_INDEX,
  FOCUS_OPACITY_PROFILES,
  getSegmentAlpha,
  getHaloAlpha,
} from './commercialAnimationDriver';

// ─── Constants ────────────────────────────────────────────────────────────────

const GEO_NARRATIVE_ALT_KM = 20_000;
const LEO_NARRATIVE_ALT_KM = 2_000;
const ARC_SEGMENTS = 12;

// ─── Pre-drawn canvas shapes ──────────────────────────────────────────────────

function createDiamondCanvas(color: string, size = 28): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const cx = size / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(cx, 3);
  ctx.lineTo(size - 3, cx);
  ctx.lineTo(cx, size - 3);
  ctx.lineTo(3, cx);
  ctx.closePath();
  ctx.stroke();
  return canvas;
}

const PORTAL_DIAMOND = createDiamondCanvas('#67e8f9'); // cyan-300

// ─── Position helpers ─────────────────────────────────────────────────────────

interface Coord3 { lat: number; lng: number; altKm: number }

function skyBridgeCoord(nodeId: string, routeModel: CommercialRouteModel): Coord3 | null {
  const connected = routeModel.edges.filter(
    e => e.edgeType === 'SPACE_LINK' && (e.fromNodeId === nodeId || e.toNodeId === nodeId),
  );
  if (connected.length === 0) return null;
  const groundCoords: { lat: number; lng: number }[] = [];
  for (const edge of connected) {
    const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
    const other   = routeModel.nodes.find(n => n.id === otherId);
    if (other?.position) groundCoords.push(other.position);
  }
  if (groundCoords.length === 0) return null;
  const lat   = groundCoords.reduce((s, p) => s + p.lat, 0) / groundCoords.length;
  const lng   = groundCoords.reduce((s, p) => s + p.lng, 0) / groundCoords.length;
  const altKm = routeModel.technology === 'GEO' ? GEO_NARRATIVE_ALT_KM : LEO_NARRATIVE_ALT_KM;
  return { lat, lng, altKm };
}

function buildNodePositionMap(routeModel: CommercialRouteModel): Map<string, Coord3> {
  const map = new Map<string, Coord3>();
  for (const node of routeModel.nodes) {
    if (node.position) {
      map.set(node.id, { lat: node.position.lat, lng: node.position.lng, altKm: GROUND_POINT_ALTITUDE_KM });
    } else if (node.nodeType === 'SKY_BRIDGE') {
      const pos = skyBridgeCoord(node.id, routeModel);
      if (pos) map.set(node.id, pos);
    }
  }
  return map;
}

function generateArcPositions(from: Coord3, to: Coord3, segments = ARC_SEGMENTS): Cartesian3[] {
  const positions: Cartesian3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t      = i / segments;
    const lat    = from.lat + (to.lat - from.lat) * t;
    const lng    = from.lng + (to.lng - from.lng) * t;
    const altFactor  = Math.sin(t * (Math.PI / 2));
    const linearAlt  = from.altKm + (to.altKm - from.altKm) * t;
    const belly      = Math.sin(t * Math.PI) * (Math.abs(to.altKm - from.altKm) * 0.06);
    const altKm      = Math.max(linearAlt + belly * (1 - Math.abs(altFactor - 0.5) * 2), 0.01);
    positions.push(getPosition(lat, lng, altKm));
  }
  return positions;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function statusColor(status: CommercialRouteStatus): Color {
  switch (status) {
    case 'active':  return Color.fromCssColorString('#38bdf8');
    case 'limited': return Color.fromCssColorString('#fb923c');
    case 'blocked': return Color.fromCssColorString('#ef4444');
    default:        return Color.fromCssColorString('#94a3b8');
  }
}

// ─── Terrestrial tail visibility ─────────────────────────────────────────────

/** Terrestrial tails are shown only when the backhaul segment is focused. */
function isTerrestrialVisible(
  edgeType: CommercialRouteEdgeType,
  owningSegmentId: CommercialRouteSegmentId | undefined,
  focusedSegmentId: CommercialRouteSegmentId | null,
): boolean {
  if (edgeType !== 'TERRESTRIAL_TAIL') return true;
  if (!focusedSegmentId || focusedSegmentId === 'summary') return false;
  return focusedSegmentId === 'backhaul' || focusedSegmentId === owningSegmentId;
}

// ─── Static fallback animation state ─────────────────────────────────────────

function makeStaticAnimState(
  focusedSegmentId: CommercialRouteSegmentId | null,
  routeStatus: CommercialRouteModel['routeStatus'],
): CommercialAnimationState {
  const focusedIdx = focusedSegmentId ? (ANIM_SEGMENT_INDEX[focusedSegmentId] ?? -1) : -1;
  const opacity = new Float32Array(4);
  const profile = focusedSegmentId && focusedSegmentId in FOCUS_OPACITY_PROFILES
    ? FOCUS_OPACITY_PROFILES[focusedSegmentId]
    : FOCUS_OPACITY_PROFILES.summary;
  for (let i = 0; i < 4; i++) opacity[i] = profile[i];
  return {
    opacity,
    reveal:      new Float32Array([1, 1, 1, 1]),
    pulsePhase:  0,
    focusedIdx,
    routeStatus: (routeStatus ?? 'pending') as CommercialAnimationState['routeStatus'],
  };
}

// ─── Halo entity ──────────────────────────────────────────────────────────────

/**
 * Pulse halo ring behind a focused endpoint (Site A when access, Site B when destination).
 * Uses getHaloAlpha — returns 0 when not focused, breathes 0.12–0.38 when focused.
 * The entity is always in the scene; opacity gates its visibility.
 */
interface HaloEntityProps {
  position: Cartesian3;
  segIdx: number;
  baseColor: Color;
  animRef: React.MutableRefObject<CommercialAnimationState>;
}

const HaloEntity = React.memo<HaloEntityProps>(({ position, segIdx, baseColor, animRef }) => {
  const colorCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getHaloAlpha(animRef.current, segIdx);
    return baseColor.withAlpha(alpha);
  }, false), [baseColor, segIdx, animRef]);

  const sizeCallback = useMemo(() => new CallbackProperty(() => {
    if (animRef.current.focusedIdx !== segIdx) return 2;
    const phase = animRef.current.pulsePhase * 0.55 + Math.PI * 0.5;
    return 42 + 16 * ((1 + Math.sin(phase)) * 0.5); // breathes 42 → 58 px
  }, false), [segIdx, animRef]);

  return (
    <Entity
      position={position}
      point={{
        pixelSize:                sizeCallback,
        color:                    colorCallback,
        outlineWidth:             0,
        disableDepthTestDistance: Infinity,
      }}
    />
  );
});
HaloEntity.displayName = 'HaloEntity';

// ─── Node rendering components ────────────────────────────────────────────────

interface GroundNodeProps {
  node:             CommercialRouteNode;
  position:         Cartesian3;
  segIdx:           number;
  showLabel:        boolean;
  animRef:          React.MutableRefObject<CommercialAnimationState>;
  viewerRef:        React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale:        number;
}

/**
 * ORIGIN / DESTINATION node: filled circle, status colour, animated alpha.
 * When focused, node grows 35 % to assert visual primacy.
 */
const GroundNode = React.memo<GroundNodeProps>(({
  node, position, segIdx, showLabel, animRef, viewerRef, cameraMetricsRef, sizeScale,
}) => {
  const pixelSizeCallback = useMemo(() => new CallbackProperty(() => {
    if (!viewerRef.current) return 8;
    const dist      = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const dyn       = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
    const focusMult = animRef.current.focusedIdx === segIdx ? 1.35 : 1.0;
    return dyn * 3_000_000 / Math.max(dist, 8_000_000) * 18 * sizeScale * focusMult;
  }, false), [position, cameraMetricsRef, sizeScale, segIdx, animRef, viewerRef]);

  const isPulsed   = node.segmentId !== 'summary';
  const baseColor  = useMemo(() => statusColor(node.status), [node.status]);

  const colorCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx, isPulsed && animRef.current.focusedIdx === segIdx);
    return baseColor.withAlpha(alpha);
  }, false), [baseColor, segIdx, isPulsed, animRef]);

  const outlineCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.WHITE.withAlpha(alpha * 0.6);
  }, false), [segIdx, animRef]);

  const labelFillCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.WHITE.withAlpha(alpha);
  }, false), [segIdx, animRef]);

  const labelOutlineCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.fromCssColorString('#0f172a').withAlpha(alpha * 0.9);
  }, false), [segIdx, animRef]);

  const entityId = `commercial-route-${node.segmentId}-node-${node.id}`;

  return (
    <Entity
      id={entityId}
      position={position}
      point={{
        pixelSize:                pixelSizeCallback,
        color:                    colorCallback,
        outlineColor:             outlineCallback,
        outlineWidth:             2,
        disableDepthTestDistance: Infinity,
      }}
      name={node.label}
    >
      {showLabel && (
        <LabelGraphics
          text={node.label}
          font="600 12px Inter, sans-serif"
          fillColor={labelFillCallback}
          outlineColor={labelOutlineCallback}
          outlineWidth={3}
          style={1}
          verticalOrigin={VerticalOrigin.BOTTOM}
          horizontalOrigin={HorizontalOrigin.CENTER}
          pixelOffset={new Cartesian2(0, -8)}
          eyeOffset={LABEL_EYE_OFFSET}
          disableDepthTestDistance={Infinity}
          translucencyByDistance={undefined}
        />
      )}
    </Entity>
  );
});
GroundNode.displayName = 'GroundNode';

/**
 * NETWORK_PORTAL node: diamond billboard, cyan family, animated alpha.
 * When focused (destination segment), grows 35 %.
 */
const PortalNode = React.memo<GroundNodeProps>(({
  node, position, segIdx, showLabel, animRef, viewerRef, cameraMetricsRef, sizeScale,
}) => {
  const scaleCallback = useMemo(() => new CallbackProperty(() => {
    if (!viewerRef.current) return 0.5;
    const dist      = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const dyn       = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
    const focusMult = animRef.current.focusedIdx === segIdx ? 1.35 : 1.0;
    return dyn * 3_000_000 / Math.max(dist, 8_000_000) * 0.9 * sizeScale * focusMult;
  }, false), [position, cameraMetricsRef, sizeScale, segIdx, animRef, viewerRef]);

  const billboardColorCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx, animRef.current.focusedIdx === segIdx);
    return Color.fromCssColorString('#67e8f9').withAlpha(alpha);
  }, false), [segIdx, animRef]);

  const labelFillCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.fromCssColorString('#67e8f9').withAlpha(alpha);
  }, false), [segIdx, animRef]);

  const labelOutlineCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.fromCssColorString('#0f172a').withAlpha(alpha * 0.9);
  }, false), [segIdx, animRef]);

  const entityId = `commercial-route-${node.segmentId}-portal-${node.id}`;

  return (
    <Entity
      id={entityId}
      position={position}
      billboard={{
        image:                    PORTAL_DIAMOND,
        scale:                    scaleCallback,
        color:                    billboardColorCallback,
        verticalOrigin:           VerticalOrigin.CENTER,
        disableDepthTestDistance: Infinity,
      }}
      name={node.label}
    >
      {showLabel && (
        <LabelGraphics
          text={node.label}
          font="500 11px Inter, sans-serif"
          fillColor={labelFillCallback}
          outlineColor={labelOutlineCallback}
          outlineWidth={3}
          style={1}
          verticalOrigin={VerticalOrigin.BOTTOM}
          horizontalOrigin={HorizontalOrigin.CENTER}
          pixelOffset={new Cartesian2(0, -10)}
          eyeOffset={LABEL_EYE_OFFSET}
          disableDepthTestDistance={Infinity}
        />
      )}
    </Entity>
  );
});
PortalNode.displayName = 'PortalNode';

/**
 * HUB node: small filled circle, violet family, animated alpha.
 * When focused (backhaul segment), grows 35 %.
 * Label shown only when backhaul segment is focused.
 */
const HubNode = React.memo<GroundNodeProps>(({
  node, position, segIdx, showLabel, animRef, viewerRef, cameraMetricsRef, sizeScale,
}) => {
  const pixelSizeCallback = useMemo(() => new CallbackProperty(() => {
    if (!viewerRef.current) return 5;
    const dist      = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const dyn       = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
    const focusMult = animRef.current.focusedIdx === segIdx ? 1.35 : 1.0;
    return dyn * 3_000_000 / Math.max(dist, 8_000_000) * 12 * sizeScale * focusMult;
  }, false), [position, cameraMetricsRef, sizeScale, segIdx, animRef, viewerRef]);

  const colorCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx, animRef.current.focusedIdx === segIdx);
    return Color.fromCssColorString('#a78bfa').withAlpha(alpha);
  }, false), [segIdx, animRef]);

  const outlineCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.fromCssColorString('#c4b5fd').withAlpha(alpha * 0.5);
  }, false), [segIdx, animRef]);

  const labelFillCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.fromCssColorString('#a78bfa').withAlpha(alpha);
  }, false), [segIdx, animRef]);

  const labelOutlineCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, segIdx);
    return Color.fromCssColorString('#0f172a').withAlpha(alpha * 0.9);
  }, false), [segIdx, animRef]);

  const entityId = `commercial-route-${node.segmentId}-hub-${node.id}`;

  return (
    <Entity
      id={entityId}
      position={position}
      point={{
        pixelSize:                pixelSizeCallback,
        color:                    colorCallback,
        outlineColor:             outlineCallback,
        outlineWidth:             1.5,
        disableDepthTestDistance: Infinity,
      }}
      name={node.label}
    >
      {showLabel && (
        <LabelGraphics
          text={node.label}
          font="500 11px Inter, sans-serif"
          fillColor={labelFillCallback}
          outlineColor={labelOutlineCallback}
          outlineWidth={3}
          style={1}
          verticalOrigin={VerticalOrigin.BOTTOM}
          horizontalOrigin={HorizontalOrigin.CENTER}
          pixelOffset={new Cartesian2(0, -6)}
          eyeOffset={LABEL_EYE_OFFSET}
          disableDepthTestDistance={Infinity}
        />
      )}
    </Entity>
  );
});
HubNode.displayName = 'HubNode';

// ─── Edge rendering ───────────────────────────────────────────────────────────

interface EdgeEntityProps {
  edge:             CommercialRouteEdge;
  positions:        Cartesian3[];
  technology:       CommercialRouteTechnology;
  width:            number;
  owningSegmentId:  CommercialRouteSegmentId | undefined;
  animRef:          React.MutableRefObject<CommercialAnimationState>;
}

/**
 * Animated polyline edge.
 * Each edge owns its own material instance so its color CallbackProperty can
 * read from the shared animRef and update alpha every frame without a React re-render.
 */
const EdgeEntity = React.memo<EdgeEntityProps>(({
  edge, positions, technology, width, owningSegmentId, animRef,
}) => {
  const segIdx = owningSegmentId ? (ANIM_SEGMENT_INDEX[owningSegmentId] ?? -1) : -1;

  const material = useMemo(() => {
    const getAlpha = () => getSegmentAlpha(animRef.current, segIdx);

    if (edge.edgeType === 'BACKBONE_LINK') {
      const isBlocked = edge.status === 'blocked';
      const baseHex   = isBlocked ? '#ef4444' : '#a78bfa';
      return new PolylineDashMaterialProperty({
        color: new CallbackProperty(
          () => Color.fromCssColorString(baseHex).withAlpha(getAlpha() * 0.7),
          false,
        ),
        dashPattern: 255,
      });
    }

    if (edge.edgeType === 'TERRESTRIAL_TAIL') {
      return new PolylineDashMaterialProperty({
        color: new CallbackProperty(
          () => Color.fromCssColorString('#475569').withAlpha(getAlpha() * 0.45),
          false,
        ),
        dashPattern: 3855,
      });
    }

    // SPACE_LINK — technology-aware glow arc.
    const isGeo      = technology === 'GEO';
    const baseAlpha  = isGeo ? 0.92 : 0.82;
    const glowPower  = isGeo ? 0.22 : 0.14;

    const spaceColor = new CallbackProperty(() => {
      const alpha = getAlpha() * baseAlpha;
      if (edge.status === 'blocked') {
        return Color.fromCssColorString('#ef4444').withAlpha(alpha);
      }
      if (edge.status === 'limited') {
        return Color.fromCssColorString(isGeo ? '#93c5fd' : '#f9a8d4').withAlpha(alpha);
      }
      if (edge.status === 'pending') {
        return Color.fromCssColorString('#94a3b8').withAlpha(alpha * 0.65);
      }
      return Color.fromCssColorString(isGeo ? '#60a5fa' : '#f472b6').withAlpha(alpha);
    }, false);

    return new PolylineGlowMaterialProperty({
      color:      spaceColor,
      glowPower,
      taperPower: 0.55,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edge.id, edge.edgeType, edge.status, technology, segIdx, animRef]);

  if (positions.length < 2) return null;

  return (
    <Entity
      id={`commercial-route-edge-${edge.id}`}
      polyline={{
        positions,
        width,
        material,
        arcType: ArcType.NONE,
        clampToGround: false,
      }}
    />
  );
});
EdgeEntity.displayName = 'EdgeEntity';

// ─── Main layer ───────────────────────────────────────────────────────────────

export interface CommercialRouteLayerProps {
  routeModel:        CommercialRouteModel;
  viewerRef:         React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef:  React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale?:        number;
  animationRef?:     React.MutableRefObject<CommercialAnimationState>;
}

const CommercialRouteLayer: React.FC<CommercialRouteLayerProps> = ({
  routeModel,
  viewerRef,
  cameraMetricsRef,
  sizeScale = 1,
  animationRef,
}) => {
  const focusedSegmentId  = routeModel.focusedSegmentId;
  const isBackhaulFocused = focusedSegmentId === 'backhaul';
  const technology        = routeModel.technology;
  const firstBackboneNodeId = useMemo(
    () => routeModel.nodes.find(node => node.nodeType === 'HUB')?.id ?? null,
    [routeModel.nodes],
  );

  const staticState = useMemo(
    () => makeStaticAnimState(focusedSegmentId, routeModel.routeStatus),
    [focusedSegmentId, routeModel.routeStatus],
  );
  const fallbackRef = useRef<CommercialAnimationState>(staticState);
  fallbackRef.current = staticState;

  const effectiveAnimRef = animationRef ?? fallbackRef;

  const posMap = useMemo(() => buildNodePositionMap(routeModel), [routeModel]);

  // ── Nodes ──────────────────────────────────────────────────────────────────
  //
  // All non-OUTCOME, non-SKY_BRIDGE nodes are always in the Cesium scene.
  // FOCUS_OPACITY_PROFILES drives their visual weight — no hard-cut show/hide.
  // A HaloEntity is added for ORIGIN and DESTINATION/PORTAL nodes; it is
  // invisible (alpha = 0) unless its segment is the active focus.
  const nodeElements = useMemo(() => {
    const elements: React.ReactElement[] = [];

    for (const node of routeModel.nodes) {
      if (node.nodeType === 'SKY_BRIDGE') continue;
      if (node.nodeType === 'OUTCOME')    continue;

      const coord = posMap.get(node.id);
      if (!coord) continue;
      const position = getPosition(coord.lat, coord.lng, coord.altKm);
      const segIdx   = ANIM_SEGMENT_INDEX[node.segmentId] ?? -1;
      const base     = statusColor(node.status);

      // Pulse halo behind focused endpoints (ORIGIN for access, DESTINATION for destination)
      if (node.nodeType === 'ORIGIN' || node.nodeType === 'DESTINATION' || node.nodeType === 'NETWORK_PORTAL') {
        elements.push(
          <HaloEntity
            key={`${node.id}-halo`}
            position={position}
            segIdx={segIdx}
            baseColor={base}
            animRef={effectiveAnimRef}
          />,
        );
      }

      const commonProps = {
        node,
        position,
        segIdx,
        animRef:         effectiveAnimRef,
        viewerRef,
        cameraMetricsRef,
        sizeScale,
      };

      // Label: show on the focused endpoint node (Cesium label supplements SiteScreenLabel)
      const showLabel =
        (node.nodeType === 'ORIGIN' && focusedSegmentId === 'access')
        || ((node.nodeType === 'DESTINATION' || node.nodeType === 'NETWORK_PORTAL') && focusedSegmentId === 'destination');

      if (node.nodeType === 'NETWORK_PORTAL') {
        elements.push(<PortalNode key={node.id} {...commonProps} showLabel={showLabel} />);
      } else if (node.nodeType === 'HUB') {
        elements.push(<HubNode key={node.id} {...commonProps} showLabel={isBackhaulFocused && node.id === firstBackboneNodeId} />);
      } else {
        elements.push(<GroundNode key={node.id} {...commonProps} showLabel={showLabel} />);
      }
    }

    return elements;
  }, [
    routeModel.nodes, posMap, focusedSegmentId, isBackhaulFocused, firstBackboneNodeId,
    effectiveAnimRef, viewerRef, cameraMetricsRef, sizeScale,
  ]);

  // ── Edges ──────────────────────────────────────────────────────────────────
  //
  // All edges are always in the scene; FOCUS_OPACITY_PROFILES handles their weight.
  // TERRESTRIAL_TAIL edges are the exception: only visible in backhaul focus to
  // avoid clutter in other states.
  const edgeElements = useMemo(() => {
    const elements: React.ReactElement[] = [];

    for (const edge of routeModel.edges) {
      const fromCoord = posMap.get(edge.fromNodeId);
      const toCoord   = posMap.get(edge.toNodeId);
      if (!fromCoord || !toCoord) continue;

      const owningSegmentId = edge.meta?.owningSegmentId;

      if (!isTerrestrialVisible(edge.edgeType, owningSegmentId, focusedSegmentId)) continue;

      let positions: Cartesian3[];
      let width: number;

      if (edge.edgeType === 'SPACE_LINK') {
        positions = generateArcPositions(fromCoord, toCoord);
        width = (technology === 'GEO' ? 3.0 : 2.2) * sizeScale;
      } else if (edge.edgeType === 'BACKBONE_LINK') {
        positions = [
          getPosition(fromCoord.lat, fromCoord.lng, GROUND_POINT_ALTITUDE_KM),
          getPosition(toCoord.lat,   toCoord.lng,   GROUND_POINT_ALTITUDE_KM),
        ];
        width = 1.8 * sizeScale;
      } else {
        // TERRESTRIAL_TAIL
        positions = [
          getPosition(fromCoord.lat, fromCoord.lng, GROUND_POINT_ALTITUDE_KM),
          getPosition(toCoord.lat,   toCoord.lng,   GROUND_POINT_ALTITUDE_KM),
        ];
        width = 1.0 * sizeScale;
      }

      elements.push(
        <EdgeEntity
          key={edge.id}
          edge={edge}
          positions={positions}
          technology={technology}
          width={width}
          owningSegmentId={owningSegmentId}
          animRef={effectiveAnimRef}
        />,
      );
    }

    return elements;
  }, [
    routeModel.edges, posMap, focusedSegmentId, technology, sizeScale,
    effectiveAnimRef,
  ]);

  return (
    <>
      {nodeElements}
      {edgeElements}
    </>
  );
};

export default CommercialRouteLayer;
