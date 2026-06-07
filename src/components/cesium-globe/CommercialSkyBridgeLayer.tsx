/**
 * CommercialSkyBridgeLayer
 *
 * Renders SKY_BRIDGE nodes from the CommercialRouteModel as open-ring
 * billboards at a "narrative altitude" above the route midpoint.
 *
 * Design rules (COMM-6C / COMM-6D5 / COMM-6D6):
 *   - GEO rings: #60a5fa (blue-400), primary label = satellite name
 *   - LEO rings: #f472b6 (pink-400), primary label = "LEO Relay"
 *   - Blocked rings: #ef4444 (red-400)
 *   - No filled centre — the ring communicates "relay", not "endpoint"
 *   - Labels: primary always visible in satellite/summary; secondary in satellite only
 *
 * Animation (COMM-6E):
 *   - Ring billboard color uses CallbackProperty reading from CommercialAnimationState.
 *   - Alpha = getSegmentAlpha(animRef.current, satellite_segIdx, isPulsed).
 *   - When no animationRef is provided, falls back to static opacity.
 *
 * COMM-6D3 — Sky Bridge rendering layer.
 * COMM-6E   — Animated ring opacity.
 */

import React, { useRef, useMemo } from 'react';
import { Entity, LabelGraphics } from 'resium';
import {
  Cartesian3,
  Cartesian2,
  Color,
  VerticalOrigin,
  HorizontalOrigin,
  CallbackProperty,
  Viewer as CesiumViewerType,
} from 'cesium';
import type {
  CommercialRouteModel,
  CommercialRouteNode,
  CommercialRouteStatus,
  CommercialRouteTechnology,
} from '../../types/commercialRouteModel';
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './utils';
import { LABEL_EYE_OFFSET } from './layerHeights';
import {
  type CommercialAnimationState,
  ANIM_SEGMENT_INDEX,
  FOCUS_OPACITY_PROFILES,
  getSegmentAlpha,
} from './commercialAnimationDriver';

// ─── Ring glyph constants ────────────────────────────────────────────────────

function createRingCanvas(hexColor: string, size = 32): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const cx = size / 2;
  const r  = cx - 4;
  ctx.strokeStyle = hexColor;
  ctx.lineWidth   = 3;
  ctx.shadowColor = hexColor;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.arc(cx, cx, r, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

function createBeaconGlowCanvas(size = 96): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const cx = size / 2;
  const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.12, 'rgba(191,219,254,0.72)');
  gradient.addColorStop(0.36, 'rgba(96,165,250,0.34)');
  gradient.addColorStop(0.68, 'rgba(99,102,241,0.13)');
  gradient.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

const GEO_RING_GLYPH     = createRingCanvas('#60a5fa');
const LEO_RING_GLYPH     = createRingCanvas('#f472b6');
const BLOCKED_RING_GLYPH = createRingCanvas('#ef4444');
const SATELLITE_BEACON_GLOW = createBeaconGlowCanvas();

// ─── Narrative altitude constants ─────────────────────────────────────────────

const GEO_NARRATIVE_ALT_KM = 20_000;
const LEO_NARRATIVE_ALT_KM  = 2_000;

// ─── Label pixel offsets (above the ring billboard) ───────────────────────────

const PRIMARY_LABEL_OFFSET   = new Cartesian2(0, -38);
const SECONDARY_LABEL_OFFSET = new Cartesian2(0, -20);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNarrativePosition(
  nodeId: string,
  routeModel: CommercialRouteModel,
): Cartesian3 | null {
  const connectedEdges = routeModel.edges.filter(
    e => e.edgeType === 'SPACE_LINK'
      && (e.fromNodeId === nodeId || e.toNodeId === nodeId),
  );
  if (connectedEdges.length === 0) return null;
  const groundCoords: { lat: number; lng: number }[] = [];
  for (const edge of connectedEdges) {
    const otherId = edge.fromNodeId === nodeId ? edge.toNodeId : edge.fromNodeId;
    const other   = routeModel.nodes.find(n => n.id === otherId);
    if (other?.position) groundCoords.push(other.position);
  }
  if (groundCoords.length === 0) return null;
  const lat   = groundCoords.reduce((s, p) => s + p.lat, 0) / groundCoords.length;
  const lng   = groundCoords.reduce((s, p) => s + p.lng, 0) / groundCoords.length;
  const altKm = routeModel.technology === 'GEO' ? GEO_NARRATIVE_ALT_KM : LEO_NARRATIVE_ALT_KM;
  return getPosition(lat, lng, altKm);
}

function ringGlyphFor(status: CommercialRouteStatus, technology: CommercialRouteTechnology): HTMLCanvasElement {
  if (status === 'blocked') return BLOCKED_RING_GLYPH;
  return technology === 'GEO' ? GEO_RING_GLYPH : LEO_RING_GLYPH;
}

// ─── Static fallback state ────────────────────────────────────────────────────

function makeStaticSkyBridgeState(focused: CommercialRouteModel['focusedSegmentId']): CommercialAnimationState {
  const focusedIdx = focused ? (ANIM_SEGMENT_INDEX[focused] ?? -1) : -1;
  const profile = focused && focused in FOCUS_OPACITY_PROFILES
    ? FOCUS_OPACITY_PROFILES[focused]
    : FOCUS_OPACITY_PROFILES.summary;
  const opacity = new Float32Array(4);
  for (let i = 0; i < 4; i++) opacity[i] = profile[i];
  return {
    opacity,
    reveal:      new Float32Array([1, 1, 1, 1]),
    pulsePhase:  0,
    focusedIdx,
    routeStatus: 'active',
  };
}

// ─── SkyBridgeEntity ─────────────────────────────────────────────────────────

interface SkyBridgeEntityProps {
  node:               CommercialRouteNode;
  narrativePos:       Cartesian3;
  technology:         CommercialRouteTechnology;
  animRef:            React.MutableRefObject<CommercialAnimationState>;
  /** Show primary commercial label (satellite name / "LEO Relay"). Satellite or summary focus. */
  showPrimaryLabel:   boolean;
  /** Show secondary detail label. Only when satellite segment is explicitly focused. */
  showSecondaryLabel: boolean;
  viewerRef:          React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef:   React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale:          number;
}

/**
 * Single SKY_BRIDGE ring entity with animated opacity and commercial labels.
 *
 * Label rules (COMM-6D5 / 6D6):
 *   GEO — primary: satellite name (e.g. "EUTELSAT 7B") — commercially contractual
 *         secondary: "GEO Relay" — shown only when satellite tab is focused
 *   LEO — primary: "LEO Relay" — abstract service identity
 *         secondary: satellite ID (e.g. "ONEWEB-0435") — shown only when satellite tab focused
 *
 * Ring opacity:
 *   Driven by CallbackProperty reading CommercialAnimationState — satellite segment index (1).
 *   Part C pulse applied when satellite segment is focused.
 */
const SkyBridgeEntity = React.memo<SkyBridgeEntityProps>(({
  node,
  narrativePos,
  technology,
  animRef,
  showPrimaryLabel,
  showSecondaryLabel,
  viewerRef,
  cameraMetricsRef,
  sizeScale,
}) => {
  const SAT_IDX = ANIM_SEGMENT_INDEX.satellite; // 1

  const isGeo = technology === 'GEO';

  const scaleCallback = useMemo(() => {
    const refDist = technology === 'GEO' ? 25_000_000 : 6_000_000;
    return new CallbackProperty(() => {
      const distance     = Cartesian3.distance(cameraMetricsRef.current.position, narrativePos);
      const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
      const base         = dynamicScale * refDist / Math.max(distance, refDist * 0.2);
      return base * 0.65 * sizeScale;
    }, false);
  }, [narrativePos, technology, cameraMetricsRef, sizeScale]);

  const beaconGlowScaleCallback = useMemo(() => {
    const refDist = technology === 'GEO' ? 25_000_000 : 6_000_000;
    return new CallbackProperty(() => {
      const distance = Cartesian3.distance(cameraMetricsRef.current.position, narrativePos);
      const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
      const base = dynamicScale * refDist / Math.max(distance, refDist * 0.2);
      const breath = 0.5 + 0.5 * Math.sin(animRef.current.pulsePhase * 0.46);
      return base * (1.65 + breath * 0.28) * sizeScale;
    }, false);
  }, [animRef, cameraMetricsRef, narrativePos, sizeScale, technology]);

  const beaconGlowColorCallback = useMemo(() => new CallbackProperty(() => {
    const satelliteFocused = animRef.current.focusedIdx === SAT_IDX;
    if (!satelliteFocused) return Color.WHITE.withAlpha(0);
    const segmentAlpha = getSegmentAlpha(animRef.current, SAT_IDX);
    const breath = 0.5 + 0.5 * Math.sin(animRef.current.pulsePhase * 0.46);
    return Color.WHITE.withAlpha(segmentAlpha * (0.68 + breath * 0.28));
  }, false), [animRef, SAT_IDX]);

  const beaconCoreSizeCallback = useMemo(() => new CallbackProperty(() => {
    const breath = 0.5 + 0.5 * Math.sin(animRef.current.pulsePhase * 0.46);
    return (8 + breath * 3.5) * sizeScale;
  }, false), [animRef, sizeScale]);

  const beaconCoreColorCallback = useMemo(() => new CallbackProperty(() => {
    const satelliteFocused = animRef.current.focusedIdx === SAT_IDX;
    if (!satelliteFocused) return Color.WHITE.withAlpha(0);
    const segmentAlpha = getSegmentAlpha(animRef.current, SAT_IDX);
    const breath = 0.5 + 0.5 * Math.sin(animRef.current.pulsePhase * 0.46);
    return Color.fromCssColorString('#ffffff').withAlpha(segmentAlpha * (0.82 + breath * 0.18));
  }, false), [animRef, SAT_IDX]);

  const beaconCoreOutlineCallback = useMemo(() => new CallbackProperty(() => {
    const satelliteFocused = animRef.current.focusedIdx === SAT_IDX;
    if (!satelliteFocused) return Color.fromCssColorString('#60a5fa').withAlpha(0);
    const segmentAlpha = getSegmentAlpha(animRef.current, SAT_IDX);
    return Color.fromCssColorString(isGeo ? '#60a5fa' : '#a78bfa').withAlpha(segmentAlpha * 0.86);
  }, false), [animRef, isGeo, SAT_IDX]);

  // Ring billboard color — animated alpha, optional pulse.
  const ringColorCallback = useMemo(() => {
    const isPulsed = true; // satellite node always pulses when satellite is focused
    let baseHex: string;
    if (node.status === 'blocked') {
      baseHex = '#ef4444';
    } else if (node.status === 'limited') {
      baseHex = isGeo ? '#93c5fd' : '#f9a8d4';
    } else {
      baseHex = isGeo ? '#60a5fa' : '#f472b6';
    }
    const base = Color.fromCssColorString(baseHex);
    return new CallbackProperty(() => {
      const alpha = getSegmentAlpha(animRef.current, SAT_IDX, isPulsed && animRef.current.focusedIdx === SAT_IDX);
      return base.withAlpha(alpha);
    }, false);
  }, [node.status, isGeo, animRef, SAT_IDX]);

  const billboard = useMemo(() => ({
    image:                    ringGlyphFor(node.status, technology),
    scale:                    scaleCallback,
    color:                    ringColorCallback,
    verticalOrigin:           VerticalOrigin.CENTER,
  }), [node.status, technology, scaleCallback, ringColorCallback]);

  // Label text — commercial narrative.
  const primaryLabelText   = isGeo ? node.label : 'LEO Relay';
  const secondaryLabelText = isGeo ? 'GEO Relay' : node.label;
  const primaryFont        = isGeo ? '600 13px Inter, sans-serif' : '600 12px Inter, sans-serif';

  const primaryLabelHex   = node.status === 'blocked' ? '#ef4444' : (isGeo ? '#93c5fd' : '#f9a8d4');
  const primaryBase       = useMemo(() => Color.fromCssColorString(primaryLabelHex), [primaryLabelHex]);
  const secondaryBase     = Color.fromCssColorString('#64748b');
  const outlineBase       = Color.fromCssColorString('#0f172a');

  const primaryFillCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, SAT_IDX);
    return primaryBase.withAlpha(alpha);
  }, false), [primaryBase, animRef, SAT_IDX]);

  const secondaryFillCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, SAT_IDX);
    return secondaryBase.withAlpha(alpha * 0.75);
  }, false), [animRef, SAT_IDX]);

  const labelOutlineCallback = useMemo(() => new CallbackProperty(() => {
    const alpha = getSegmentAlpha(animRef.current, SAT_IDX);
    return outlineBase.withAlpha(alpha * 0.9);
  }, false), [animRef, SAT_IDX]);

  const entityName = isGeo ? `GEO Relay · ${node.label}` : `LEO Relay · ${node.label}`;

  return (
    <>
      {/* Step 2 satellite beacon — symbolic light source, visible only in satellite focus. */}
      <Entity
        id={`commercial-route-satellite-beacon-glow-${node.id}`}
        position={narrativePos}
        billboard={{
          image: SATELLITE_BEACON_GLOW,
          scale: beaconGlowScaleCallback,
          color: beaconGlowColorCallback,
          verticalOrigin: VerticalOrigin.CENTER,
          disableDepthTestDistance: Infinity,
        }}
      />
      <Entity
        id={`commercial-route-satellite-beacon-core-${node.id}`}
        position={narrativePos}
        point={{
          pixelSize: beaconCoreSizeCallback,
          color: beaconCoreColorCallback,
          outlineColor: beaconCoreOutlineCallback,
          outlineWidth: 2,
          disableDepthTestDistance: Infinity,
        }}
      />
      {/* Ring billboard — animated opacity, no label here */}
      <Entity
        id={`commercial-route-satellite-skybridge-${node.id}`}
        position={narrativePos}
        billboard={billboard}
        name={entityName}
      />
      {/* Primary commercial label: satellite name (GEO) or "LEO Relay" (LEO).
          Visible in satellite and summary focus states. */}
      {showPrimaryLabel && (
        <Entity
          id={`commercial-route-satellite-skybridge-label1-${node.id}`}
          position={narrativePos}
        >
          <LabelGraphics
            text={primaryLabelText}
            font={primaryFont}
            fillColor={primaryFillCallback}
            outlineColor={labelOutlineCallback}
            outlineWidth={3}
            style={1}
            verticalOrigin={VerticalOrigin.BOTTOM}
            horizontalOrigin={HorizontalOrigin.CENTER}
            pixelOffset={PRIMARY_LABEL_OFFSET}
            eyeOffset={LABEL_EYE_OFFSET}
            disableDepthTestDistance={Infinity}
          />
        </Entity>
      )}
      {/* Secondary label: satellite ID (LEO) or "GEO Relay" (GEO).
          Shown only when satellite segment is explicitly focused — hidden in summary
          to keep the hero route view readable. */}
      {showSecondaryLabel && (
        <Entity
          id={`commercial-route-satellite-skybridge-label2-${node.id}`}
          position={narrativePos}
        >
          <LabelGraphics
            text={secondaryLabelText}
            font="500 10px Inter, sans-serif"
            fillColor={secondaryFillCallback}
            outlineColor={labelOutlineCallback}
            outlineWidth={2}
            style={1}
            verticalOrigin={VerticalOrigin.BOTTOM}
            horizontalOrigin={HorizontalOrigin.CENTER}
            pixelOffset={SECONDARY_LABEL_OFFSET}
            eyeOffset={LABEL_EYE_OFFSET}
            disableDepthTestDistance={Infinity}
          />
        </Entity>
      )}
    </>
  );
});
SkyBridgeEntity.displayName = 'SkyBridgeEntity';

// ─── CommercialSkyBridgeLayer ─────────────────────────────────────────────────

export interface CommercialSkyBridgeLayerProps {
  routeModel:        CommercialRouteModel;
  viewerRef:         React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef:  React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale?:        number;
  /**
   * Animation state ref from useCommercialAnimationDriver.
   * When provided: ring opacity animates smoothly (reveal + focus + pulse).
   * When absent:   ring renders at static opacity computed from focusedSegmentId.
   *
   * COMM-6E: replaces the previous `opacityMultiplier` prop.
   */
  animationRef?:     React.MutableRefObject<CommercialAnimationState>;
}

const CommercialSkyBridgeLayer: React.FC<CommercialSkyBridgeLayerProps> = ({
  routeModel,
  viewerRef,
  cameraMetricsRef,
  sizeScale = 1,
  animationRef,
}) => {
  const staticState   = useMemo(
    () => makeStaticSkyBridgeState(routeModel.focusedSegmentId),
    [routeModel.focusedSegmentId],
  );
  const fallbackRef   = useRef<CommercialAnimationState>(staticState);
  fallbackRef.current = staticState;

  const effectiveAnimRef = animationRef ?? fallbackRef;

  const skyBridges = useMemo(() => {
    const result: { node: CommercialRouteNode; pos: Cartesian3 }[] = [];
    for (const node of routeModel.nodes) {
      if (node.nodeType !== 'SKY_BRIDGE') continue;
      const pos = computeNarrativePosition(node.id, routeModel);
      if (pos) result.push({ node, pos });
    }
    return result;
  }, [routeModel]);

  if (skyBridges.length === 0) return null;
  // Sky bridge is always rendered — FOCUS_OPACITY_PROFILES controls its visual weight.
  // At satellite focus it's the hero (1.0); other segments fade it to 0.10–0.15.

  const isSatelliteFocused = routeModel.focusedSegmentId === 'satellite';
  const isSummaryView      = !routeModel.focusedSegmentId || routeModel.focusedSegmentId === 'summary';
  const showPrimaryLabel   = isSatelliteFocused || isSummaryView;
  const showSecondaryLabel = isSatelliteFocused;

  return (
    <>
      {skyBridges.map(({ node, pos }) => (
        <SkyBridgeEntity
          key={node.id}
          node={node}
          narrativePos={pos}
          technology={routeModel.technology}
          animRef={effectiveAnimRef}
          showPrimaryLabel={showPrimaryLabel}
          showSecondaryLabel={showSecondaryLabel}
          viewerRef={viewerRef}
          cameraMetricsRef={cameraMetricsRef}
          sizeScale={sizeScale}
        />
      ))}
    </>
  );
};

export default CommercialSkyBridgeLayer;
