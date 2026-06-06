import React, { useEffect, useMemo } from 'react';
import { Entity, LabelGraphics, PointGraphics } from 'resium';
import {
  ArcType,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HorizontalOrigin,
  JulianDate,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
  Viewer as CesiumViewerType,
} from 'cesium';
import type {
  CommercialRouteModel,
  CommercialRouteNode,
  CommercialRouteSegmentId,
  CommercialRouteStatus,
  CommercialRouteTechnology,
  RouteCoordinate,
} from '../../types/commercialRouteModel';
import { getPosition, type CameraMetricsSnapshot } from './utils';
import { GROUND_POINT_ALTITUDE_KM, GROUND_POINT_LAYER_HEIGHT_M, LABEL_EYE_OFFSET } from './layerHeights';

interface CommercialSymbolicConnectivityLayerProps {
  routeModel: CommercialRouteModel;
  viewerRef: React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale?: number;
}

interface SymbolicEndpoint {
  id: string;
  label: string;
  coord: RouteCoordinate;
  segmentId: CommercialRouteSegmentId;
  status: CommercialRouteStatus;
}

interface SymbolicArcSpec {
  id: string;
  technology: CommercialRouteTechnology;
  status: CommercialRouteStatus;
}

const ARC_SEGMENTS = 48;
const LABEL_OFFSET = new Cartesian2(0, -18);
const FLOW_EPOCH = JulianDate.fromDate(new Date(0));
const FLOW_PHASES = [0, 0.34, 0.68] as const;
const SYMBOLIC_ROUTE_ALTITUDE_KM = GROUND_POINT_ALTITUDE_KM + 18;
const SYMBOLIC_ENDPOINT_MARKER_ALTITUDE_KM = SYMBOLIC_ROUTE_ALTITUDE_KM + 8;
const SYMBOLIC_ENDPOINT_HALO_HEIGHT_M = GROUND_POINT_LAYER_HEIGHT_M + 2400;
const SERVICE_OUTCOME_ARC_COLORS: Record<CommercialRouteStatus, string> = {
  active: '#34d399',
  limited: '#f59e0b',
  blocked: '#94a3b8',
  pending: '#94a3b8',
};

function normalizeLngNear(lng: number, referenceLng: number): number {
  let value = lng;
  while (value - referenceLng > 180) value -= 360;
  while (value - referenceLng < -180) value += 360;
  return value;
}

function denormalizeLng(lng: number): number {
  let value = lng;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function routeStatusColor(status: CommercialRouteStatus): Color {
  return Color.fromCssColorString(SERVICE_OUTCOME_ARC_COLORS[status]);
}

function endpointStatusColor(status: CommercialRouteStatus): Color {
  if (status === 'blocked') return Color.fromCssColorString('#ef4444');
  if (status === 'limited') return Color.fromCssColorString('#f59e0b');
  if (status === 'pending') return Color.fromCssColorString('#38bdf8');
  return Color.fromCssColorString('#34d399');
}

function endpointFromNode(node: CommercialRouteNode | undefined): SymbolicEndpoint | null {
  if (!node?.position) return null;
  return {
    id: node.id,
    label: node.label,
    coord: node.position,
    segmentId: node.segmentId,
    status: node.status,
  };
}

function resolveEndpoints(routeModel: CommercialRouteModel): {
  origin: SymbolicEndpoint | null;
  destination: SymbolicEndpoint | null;
} {
  const origin = endpointFromNode(routeModel.nodes.find((node) => node.nodeType === 'ORIGIN'));
  const destination = endpointFromNode(
    routeModel.nodes.find((node) => node.nodeType === 'DESTINATION')
    ?? routeModel.nodes.find((node) => node.nodeType === 'NETWORK_PORTAL')
  );
  return { origin, destination };
}

function approximateDistanceKm(a: RouteCoordinate, b: RouteCoordinate): number {
  const earthRadiusKm = 6371;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (normalizeLngNear(b.lng, a.lng) - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function buildSymbolicArcPositions(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  technology: CommercialRouteTechnology,
  offsetKm: number,
): Cartesian3[] {
  const normalizedDestLng = normalizeLngNear(destination.lng, origin.lng);
  const distanceKm = approximateDistanceKm(origin, destination);
  const peakKm = Math.min(
    technology === 'GEO' ? 2100 : 1400,
    Math.max(technology === 'GEO' ? 750 : 500, distanceKm * 0.17),
  ) + offsetKm;

  return Array.from({ length: ARC_SEGMENTS + 1 }, (_, index) => {
    const t = index / ARC_SEGMENTS;
    const ease = 0.5 - Math.cos(t * Math.PI) * 0.5;
    const lat = origin.lat + (destination.lat - origin.lat) * ease;
    const lng = denormalizeLng(origin.lng + (normalizedDestLng - origin.lng) * ease);
    const altitudeKm = SYMBOLIC_ROUTE_ALTITUDE_KM + Math.sin(t * Math.PI) * peakKm;
    return getPosition(lat, lng, altitudeKm);
  });
}

function interpolatePolylinePosition(
  positions: Cartesian3[],
  progress: number,
  scratch: Cartesian3,
): Cartesian3 | undefined {
  if (positions.length === 0) return undefined;
  if (positions.length === 1) return Cartesian3.clone(positions[0], scratch);

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < positions.length - 1; index += 1) {
    const length = Cartesian3.distance(positions[index], positions[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength <= 0) return Cartesian3.clone(positions[0], scratch);

  const targetLength = (((progress % 1) + 1) % 1) * totalLength;
  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (targetLength <= traversed + segmentLength || index === segmentLengths.length - 1) {
      const localT = segmentLength > 0 ? (targetLength - traversed) / segmentLength : 0;
      return Cartesian3.lerp(positions[index], positions[index + 1], localT, scratch);
    }
    traversed += segmentLength;
  }

  return Cartesian3.clone(positions[positions.length - 1], scratch);
}

function shouldFocusEndpoint(endpoint: SymbolicEndpoint, focused: CommercialRouteSegmentId | null): boolean {
  if (!focused || focused === 'summary') return true;
  return endpoint.segmentId === focused;
}

function endpointWeight(endpoint: SymbolicEndpoint, focused: CommercialRouteSegmentId | null): number {
  if (!focused || focused === 'summary' || focused === 'satellite' || focused === 'backhaul') return 1;
  return shouldFocusEndpoint(endpoint, focused) ? 1 : 0.42;
}

function arcAlpha(focused: CommercialRouteSegmentId | null): number {
  const base = 0.9;
  if (!focused || focused === 'summary' || focused === 'satellite') return base;
  if (focused === 'access' || focused === 'destination') return 0.78;
  return 0.66;
}

function buildArcSpecs(routeModel: CommercialRouteModel): SymbolicArcSpec[] {
  const recommendedTech = routeModel.technology;
  const outcomeStatus = routeModel.nodes.find((node) => node.segmentId === 'summary')?.status
    ?? routeModel.routeStatus;
  return [{
    id: `recommended-${recommendedTech.toLowerCase()}`,
    technology: recommendedTech,
    status: outcomeStatus,
  }];
}

function coordinateSignature(coord: RouteCoordinate): string {
  return `${coord.lat.toFixed(5)}:${coord.lng.toFixed(5)}`;
}

function entitySafeSignature(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function symbolicArcEntityPositionKey(origin: SymbolicEndpoint, destination: SymbolicEndpoint): string {
  const posKey = `${origin.coord.lat.toFixed(4)},${origin.coord.lng.toFixed(4)}-${destination.coord.lat.toFixed(4)},${destination.coord.lng.toFixed(4)}`;
  return entitySafeSignature(posKey);
}

function expectedSymbolicArcEntityIds(
  origin: SymbolicEndpoint | null,
  destination: SymbolicEndpoint | null,
  arcSpecs: SymbolicArcSpec[],
): Set<string> {
  const ids = new Set<string>();
  if (!origin || !destination) return ids;

  const entityPosKey = symbolicArcEntityPositionKey(origin, destination);
  for (const spec of arcSpecs) {
    ids.add(`commercial-route-satellite-symbolic-arc-${spec.id}-${entityPosKey}-visibility-halo`);
    ids.add(`commercial-route-satellite-symbolic-arc-${spec.id}-${entityPosKey}`);
    for (let index = 0; index < FLOW_PHASES.length; index += 1) {
      ids.add(`commercial-route-satellite-symbolic-flow-${spec.id}-${entityPosKey}-${index}-glow`);
      ids.add(`commercial-route-satellite-symbolic-flow-${spec.id}-${entityPosKey}-${index}`);
    }
  }
  return ids;
}

function removeStaleSymbolicArcEntities(
  viewer: CesiumViewerType,
  expectedIds: Set<string>,
): void {
  const entities = [...viewer.entities.values];
  for (const entity of entities) {
    const id = entity.id;
    if (
      typeof id === 'string'
      && (
        id.startsWith('commercial-route-satellite-symbolic-arc-')
        || id.startsWith('commercial-route-satellite-symbolic-flow-')
      )
      && !expectedIds.has(id)
    ) {
      viewer.entities.remove(entity);
    }
  }
}

const SymbolicEndpointMarker = React.memo<{
  endpoint: SymbolicEndpoint;
  focusedSegmentId: CommercialRouteSegmentId | null;
  cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale: number;
}>(({ endpoint, focusedSegmentId, cameraMetricsRef, sizeScale }) => {
  const position = useMemo(
    () => getPosition(endpoint.coord.lat, endpoint.coord.lng, SYMBOLIC_ENDPOINT_MARKER_ALTITUDE_KM),
    [endpoint.coord.lat, endpoint.coord.lng],
  );
  const haloPosition = useMemo(
    () => getPosition(endpoint.coord.lat, endpoint.coord.lng, GROUND_POINT_ALTITUDE_KM),
    [endpoint.coord.lat, endpoint.coord.lng],
  );
  const posKey = useMemo(
    () => `${endpoint.coord.lat.toFixed(4)},${endpoint.coord.lng.toFixed(4)}`,
    [endpoint.coord.lat, endpoint.coord.lng],
  );
  const baseColor = useMemo(() => endpointStatusColor(endpoint.status), [endpoint.status]);
  const weight = endpointWeight(endpoint, focusedSegmentId);

  // Use primitive segmentId (string) so these CallbackProperty instances are not
  // recreated on every render when `endpoint` gets a new object reference.
  const pointSize = useMemo(() => new CallbackProperty(() => {
    const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const distanceScale = 3_000_000 / Math.max(distance, 6_000_000);
    const focusBoost = endpoint.segmentId === (focusedSegmentId ?? '') || !focusedSegmentId || focusedSegmentId === 'summary' ? 1.25 : 0.95;
    return Math.max(18, 30 * distanceScale * focusBoost * sizeScale);
  }, false), [cameraMetricsRef, endpoint.segmentId, focusedSegmentId, position, sizeScale]);

  const haloColor = useMemo(() => {
    const scratch = new Color();
    return new CallbackProperty((time?: JulianDate) => {
      const seconds = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 0.75);
      Color.clone(baseColor, scratch);
      scratch.alpha = (0.38 + pulse * 0.24) * weight;
      return scratch;
    }, false);
  }, [baseColor, weight]);

  const haloRadius = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const seconds = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 0.75);
    const isFocused = !focusedSegmentId || focusedSegmentId === 'summary' || endpoint.segmentId === focusedSegmentId;
    return (68_000 + pulse * 34_000) * (isFocused ? 1.2 : 0.85);
  }, false), [endpoint.segmentId, focusedSegmentId]);

  const haloMaterial = useMemo(() => new ColorMaterialProperty(haloColor), [haloColor]);

  const pointColor = useMemo(() => baseColor.withAlpha(0.96 * weight), [baseColor, weight]);
  const pointOutlineColor = useMemo(() => Color.WHITE.withAlpha(0.9 * weight), [weight]);
  const labelColor = useMemo(() => Color.WHITE.withAlpha(0.88 * weight), [weight]);
  const outlineColor = useMemo(() => Color.fromCssColorString('#020617').withAlpha(0.9 * weight), [weight]);

  return (
    <>
      <Entity
        key={`halo-${endpoint.id}-${posKey}`}
        id={`commercial-route-${endpoint.segmentId}-symbolic-endpoint-halo-${endpoint.id}`}
        position={haloPosition}
        ellipse={{
          semiMajorAxis: haloRadius,
          semiMinorAxis: haloRadius,
          material: haloMaterial,
          outline: false,
          height: SYMBOLIC_ENDPOINT_HALO_HEIGHT_M,
        }}
      />
      <Entity
        key={`marker-${endpoint.id}-${posKey}`}
        id={`commercial-route-${endpoint.segmentId}-symbolic-endpoint-${endpoint.id}`}
        name={endpoint.label}
        position={position}
        point={{
          pixelSize: pointSize,
          color: pointColor,
          outlineColor: pointOutlineColor,
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
      >
        <LabelGraphics
          text={endpoint.label}
          font="600 12px Inter, sans-serif"
          fillColor={labelColor}
          outlineColor={outlineColor}
          outlineWidth={3}
          style={1}
          verticalOrigin={VerticalOrigin.BOTTOM}
          horizontalOrigin={HorizontalOrigin.CENTER}
          pixelOffset={LABEL_OFFSET}
          eyeOffset={LABEL_EYE_OFFSET}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
    </>
  );
}, (prev, next) =>
  prev.endpoint.id === next.endpoint.id &&
  prev.endpoint.coord.lat === next.endpoint.coord.lat &&
  prev.endpoint.coord.lng === next.endpoint.coord.lng &&
  prev.endpoint.status === next.endpoint.status &&
  prev.focusedSegmentId === next.focusedSegmentId &&
  prev.sizeScale === next.sizeScale
);
SymbolicEndpointMarker.displayName = 'SymbolicEndpointMarker';

const SymbolicServiceArc = React.memo<{
  spec: SymbolicArcSpec;
  origin: SymbolicEndpoint;
  destination: SymbolicEndpoint;
  focusedSegmentId: CommercialRouteSegmentId | null;
  sizeScale: number;
}>(({ spec, origin, destination, focusedSegmentId, sizeScale }) => {
  const positions = useMemo(() => (
    buildSymbolicArcPositions(origin.coord, destination.coord, spec.technology, 0)
  ), [destination.coord.lat, destination.coord.lng, origin.coord.lat, origin.coord.lng, spec.technology]);

  // Position key — changes whenever either endpoint coordinate changes.
  // Used in entity keys so Resium is forced to remount (remove + create)
  // the Cesium entities rather than updating them in place, which avoids
  // a Cesium ConstantProperty caching issue where polyline geometry is not
  // rebuilt when the positions array reference changes.
  const posKey = useMemo(
    () => `${origin.coord.lat.toFixed(4)},${origin.coord.lng.toFixed(4)}-${destination.coord.lat.toFixed(4)},${destination.coord.lng.toFixed(4)}`,
    [destination.coord.lat, destination.coord.lng, origin.coord.lat, origin.coord.lng],
  );
  const entityPosKey = useMemo(() => entitySafeSignature(posKey), [posKey]);

  const color = useMemo(() => routeStatusColor(spec.status), [spec.status]);
  const hasTransmission = spec.status === 'active' || spec.status === 'limited';

  const material = useMemo(() => {
    const alpha = arcAlpha(focusedSegmentId);
    return new PolylineGlowMaterialProperty({
      color: color.withAlpha(alpha),
      glowPower: 0.26,
      taperPower: 0.55,
    });
  }, [color, focusedSegmentId]);
  const haloMaterial = useMemo(() => (
    new PolylineGlowMaterialProperty({
      color: Color.WHITE.withAlpha(hasTransmission ? 0.28 : 0.16),
      glowPower: 0.28,
      taperPower: 0.5,
    })
  ), [hasTransmission]);
  const flowAlpha = useMemo(() => {
    if (!focusedSegmentId || focusedSegmentId === 'summary' || focusedSegmentId === 'satellite') return 0.95;
    if (focusedSegmentId === 'access' || focusedSegmentId === 'destination') return 0.82;
    return 0.72;
  }, [focusedSegmentId]);

  // Flow particle positions — one stable CallbackProperty per phase slot.
  // Stored in useMemo so they're recreated only when positions change,
  // preventing Resium from updating entity.position on every focus change.
  const flowPositions = useMemo(() => (
    FLOW_PHASES.map((phase) => {
      const scratch = new Cartesian3();
      return new CallbackProperty((time?: JulianDate) => {
        const seconds = time ? JulianDate.secondsDifference(time, FLOW_EPOCH) : Date.now() / 1000;
        const progress = (seconds / 2.6 + phase) % 1;
        return interpolatePolylinePosition(positions, progress, scratch);
      }, false);
    })
  ), [positions]);

  // Memoized flow particle colors — prevent inline Color allocation on every render.
  const flowColor = useMemo(() => color.withAlpha(flowAlpha), [color, flowAlpha]);
  const flowGlowFillColor = useMemo(() => flowColor.withAlpha(0.22), [flowColor]);
  const flowGlowOutlineColor = useMemo(() => flowColor.withAlpha(0.12), [flowColor]);
  const flowWhiteColor = useMemo(() => Color.WHITE.withAlpha(flowAlpha), [flowAlpha]);

  return (
    <>
      <Entity
        key={`arc-halo-${spec.id}-${posKey}`}
        id={`commercial-route-satellite-symbolic-arc-${spec.id}-${entityPosKey}-visibility-halo`}
        polyline={{
          positions,
          width: 14 * sizeScale,
          material: haloMaterial,
          depthFailMaterial: haloMaterial,
          arcType: ArcType.NONE,
          clampToGround: false,
        }}
      />
      <Entity
        key={`arc-main-${spec.id}-${posKey}`}
        id={`commercial-route-satellite-symbolic-arc-${spec.id}-${entityPosKey}`}
        polyline={{
          positions,
          width: 5.5 * sizeScale,
          material,
          depthFailMaterial: material,
          arcType: ArcType.NONE,
          clampToGround: false,
        }}
      />
      {hasTransmission && FLOW_PHASES.map((_phase, index) => {
        const position = flowPositions[index];
        return (
          <React.Fragment key={`${spec.id}-flow-${index}-${posKey}`}>
            <Entity
              id={`commercial-route-satellite-symbolic-flow-${spec.id}-${entityPosKey}-${index}-glow`}
              position={position}
            >
              <PointGraphics
                pixelSize={11 * sizeScale}
                color={flowGlowFillColor}
                outlineColor={flowGlowOutlineColor}
                outlineWidth={1}
                disableDepthTestDistance={Number.POSITIVE_INFINITY}
              />
            </Entity>
            <Entity
              id={`commercial-route-satellite-symbolic-flow-${spec.id}-${entityPosKey}-${index}`}
              position={position}
            >
              <PointGraphics
                pixelSize={4.8 * sizeScale}
                color={flowWhiteColor}
                outlineColor={flowColor}
                outlineWidth={2}
                disableDepthTestDistance={Number.POSITIVE_INFINITY}
              />
            </Entity>
          </React.Fragment>
        );
      })}
    </>
  );
}, (prev, next) =>
  prev.spec.id === next.spec.id &&
  prev.spec.status === next.spec.status &&
  prev.spec.technology === next.spec.technology &&
  prev.origin.coord.lat === next.origin.coord.lat &&
  prev.origin.coord.lng === next.origin.coord.lng &&
  prev.origin.status === next.origin.status &&
  prev.destination.coord.lat === next.destination.coord.lat &&
  prev.destination.coord.lng === next.destination.coord.lng &&
  prev.destination.status === next.destination.status &&
  prev.focusedSegmentId === next.focusedSegmentId &&
  prev.sizeScale === next.sizeScale
);
SymbolicServiceArc.displayName = 'SymbolicServiceArc';

const CommercialSymbolicConnectivityLayer: React.FC<CommercialSymbolicConnectivityLayerProps> = ({
  routeModel,
  viewerRef,
  cameraMetricsRef,
  sizeScale = 1,
}) => {
  const { origin, destination } = useMemo(() => resolveEndpoints(routeModel), [routeModel]);
  const arcSpecs = useMemo(() => buildArcSpecs(routeModel), [routeModel]);
  const expectedArcEntityIds = useMemo(
    () => expectedSymbolicArcEntityIds(origin, destination, arcSpecs),
    [arcSpecs, destination, origin],
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    removeStaleSymbolicArcEntities(viewer, expectedArcEntityIds);
  }, [expectedArcEntityIds, viewerRef]);

  // Origin is required to render anything. Destination may be absent when
  // coverage is still being checked or the route is in an intermediate state.
  if (!origin) return null;

  const originSignature = coordinateSignature(origin.coord);
  const destinationSignature = destination ? coordinateSignature(destination.coord) : null;
  // Route signature drives arc key — arc only renders when both endpoints are known.
  const routeSignature = destinationSignature ? `${originSignature}-${destinationSignature}` : null;

  return (
    <>
      {/* Arc — only when both endpoint positions are known */}
      {destination && routeSignature && arcSpecs.map((spec) => (
        <SymbolicServiceArc
          key={`${spec.id}-${routeSignature}`}
          spec={spec}
          origin={origin}
          destination={destination}
          focusedSegmentId={routeModel.focusedSegmentId}
          sizeScale={sizeScale}
        />
      ))}
      {/* Origin marker — always shown when origin is known */}
      <SymbolicEndpointMarker
        key={`origin-${originSignature}`}
        endpoint={origin}
        focusedSegmentId={routeModel.focusedSegmentId}
        cameraMetricsRef={cameraMetricsRef}
        sizeScale={sizeScale}
      />
      {/* Destination marker — shown only when position is known */}
      {destination && destinationSignature && (
        <SymbolicEndpointMarker
          key={`destination-${destinationSignature}`}
          endpoint={destination}
          focusedSegmentId={routeModel.focusedSegmentId}
          cameraMetricsRef={cameraMetricsRef}
          sizeScale={sizeScale}
        />
      )}
    </>
  );
};

export default React.memo(CommercialSymbolicConnectivityLayer);
