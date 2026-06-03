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
 *   - Click routing via entity ID convention ('commercial-route-{segmentId}-...')
 *
 * Sky Bridge (SKY_BRIDGE nodes) are handled by CommercialSkyBridgeLayer.
 * OUTCOME nodes are not yet rendered.
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
  CommercialRouteNodeType,
  CommercialRouteEdgeType,
  CommercialRouteStatus,
  CommercialRouteTechnology,
  CommercialRouteSegmentId,
} from '../../types/commercialRouteModel';
import { getPosition, calculateDynamicScale, DPR_FACTOR, type CameraMetricsSnapshot } from './utils';
import { GROUND_POINT_ALTITUDE_KM, LABEL_EYE_OFFSET } from './layerHeights';
import {
  type CommercialAnimationState,
  ANIM_SEGMENT_INDEX,
  UNFOCUSED_OPACITY,
  getSegmentAlpha,
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

/**
 * When no animationRef is provided, build a static CommercialAnimationState
 * from the route model's focusedSegmentId so entities render at the correct
 * opacity without any animation.
 */
function makeStaticAnimState(
  focusedSegmentId: CommercialRouteSegmentId | null,
  routeStatus: CommercialRouteModel['routeStatus'],
): CommercialAnimationState {
  const focusedIdx = focusedSegmentId ? (ANIM_SEGMENT_INDEX[focusedSegmentId] ?? -1) : -1;
  const isSummary  = focusedIdx < 0;
  const opacity = new Float32Array(4);
  for (let i = 0; i < 4; i++) {
    opacity[i] = (isSummary || focusedIdx === i) ? 1.0 : UNFOCUSED_OPACITY;
  }
  return {
    opacity,
    reveal:      new Float32Array([1, 1, 1, 1]),
    pulsePhase:  0,
    focusedIdx,
    routeStatus: (routeStatus ?? 'pending') as CommercialAnimationState['routeStatus'],
  };
}

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
 */
const GroundNode = React.memo<GroundNodeProps>(({
  node, position, segIdx, showLabel, animRef, viewerRef, cameraMetricsRef, sizeScale,
}) => {
  const pixelSizeCallback = useMemo(() => new CallbackProperty(() => {
    if (!viewerRef.current) return 8;
    const dist = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const dyn  = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
    return dyn * 3_000_000 / Math.max(dist, 8_000_000) * 18 * sizeScale;
  }, false), [position, cameraMetricsRef, sizeScale]);

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
 */
const PortalNode = React.memo<GroundNodeProps>(({
  node, position, segIdx, showLabel, animRef, viewerRef, cameraMetricsRef, sizeScale,
}) => {
  const scaleCallback = useMemo(() => new CallbackProperty(() => {
    if (!viewerRef.current) return 0.5;
    const dist = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const dyn  = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
    return dyn * 3_000_000 / Math.max(dist, 8_000_000) * 0.9 * sizeScale;
  }, false), [position, cameraMetricsRef, sizeScale]);

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
 * Label hidden unless backhaul segment is focused.
 */
const HubNode = React.memo<GroundNodeProps>(({
  node, position, segIdx, showLabel, animRef, viewerRef, cameraMetricsRef, sizeScale,
}) => {
  const pixelSizeCallback = useMemo(() => new CallbackProperty(() => {
    if (!viewerRef.current) return 5;
    const dist = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const dyn  = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
    return dyn * 3_000_000 / Math.max(dist, 8_000_000) * 12 * sizeScale;
  }, false), [position, cameraMetricsRef, sizeScale]);

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
 *
 * Each edge owns its own material instance so that its color `CallbackProperty`
 * can read from the shared animRef and update alpha every frame without a React
 * re-render.  The small number of edges in a commercial route makes per-entity
 * materials negligible in memory cost.
 */
const EdgeEntity = React.memo<EdgeEntityProps>(({
  edge, positions, technology, width, owningSegmentId, animRef,
}) => {
  const segIdx = owningSegmentId ? (ANIM_SEGMENT_INDEX[owningSegmentId] ?? -1) : -1;

  const material = useMemo(() => {
    // Build a CallbackProperty that returns the animated alpha for this edge's segment.
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
  // edge identity, technology, segIdx and animRef are all stable for an entity's lifetime.
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
  /**
   * Animation state ref from useCommercialAnimationDriver.
   * When provided: entity colors animate smoothly (reveal + focus transition + pulse).
   * When absent:   entities render at correct static opacity instantly (fallback).
   */
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

  // Fallback: a static CommercialAnimationState ref that mirrors current focus.
  // Recomputed only when the focused segment changes (no 60-fps updates).
  const staticState = useMemo(
    () => makeStaticAnimState(focusedSegmentId, routeModel.routeStatus),
    [focusedSegmentId, routeModel.routeStatus],
  );
  const fallbackRef = useRef<CommercialAnimationState>(staticState);
  fallbackRef.current = staticState;

  const effectiveAnimRef = animationRef ?? fallbackRef;

  // ── Build position map ─────────────────────────────────────────────────────
  const posMap = useMemo(() => buildNodePositionMap(routeModel), [routeModel]);

  // ── Nodes ──────────────────────────────────────────────────────────────────
  // NOTE: This memo no longer depends on `focusedSegmentId` for opacity.
  // Node colors are driven by the CallbackProperty reading animRef every frame.
  // The memo only re-runs when structural data changes (positions, node set, etc.).
  const nodeElements = useMemo(() => {
    return routeModel.nodes.flatMap(node => {
      if (node.nodeType === 'SKY_BRIDGE') return [];
      if (node.nodeType === 'OUTCOME')    return [];

      const coord = posMap.get(node.id);
      if (!coord) return [];
      const position = getPosition(coord.lat, coord.lng, coord.altKm);
      const segIdx   = ANIM_SEGMENT_INDEX[node.segmentId] ?? -1;

      const commonProps = {
        key:             node.id,
        node,
        position,
        segIdx,
        animRef:         effectiveAnimRef,
        viewerRef,
        cameraMetricsRef,
        sizeScale,
      };

      if (node.nodeType === 'NETWORK_PORTAL') {
        return [<PortalNode {...commonProps} showLabel={true} />];
      }
      if (node.nodeType === 'HUB') {
        return [<HubNode {...commonProps} showLabel={isBackhaulFocused} />];
      }
      return [<GroundNode {...commonProps} showLabel={true} />];
    });
  }, [
    routeModel.nodes, posMap, isBackhaulFocused,
    effectiveAnimRef, viewerRef, cameraMetricsRef, sizeScale,
  ]);

  // ── Edges ──────────────────────────────────────────────────────────────────
  // focusedSegmentId is still a dep here for terrestrial tail visibility —
  // those edges are fully hidden/shown (not just faded) based on focus.
  const edgeElements = useMemo(() => {
    return routeModel.edges.flatMap(edge => {
      const fromCoord = posMap.get(edge.fromNodeId);
      const toCoord   = posMap.get(edge.toNodeId);
      if (!fromCoord || !toCoord) return [];

      const owningSegmentId = edge.meta?.owningSegmentId;

      // Terrestrial tails are shown only in backhaul focus — remove them entirely
      // (not just faded) to avoid cluttering the globe in other states.
      if (!isTerrestrialVisible(edge.edgeType, owningSegmentId, focusedSegmentId)) {
        return [];
      }

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

      return [(
        <EdgeEntity
          key={edge.id}
          edge={edge}
          positions={positions}
          technology={technology}
          width={width}
          owningSegmentId={owningSegmentId}
          animRef={effectiveAnimRef}
        />
      )];
    });
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
