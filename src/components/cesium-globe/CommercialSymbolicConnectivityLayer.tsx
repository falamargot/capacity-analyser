import React, { useEffect, useMemo, useRef } from 'react';
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
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
  PolygonHierarchy,
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
import { getPosition, LEO_SMOKED_GLYPH, SATELLITE_GLYPH, type CameraMetricsSnapshot } from './utils';
import { GROUND_POINT_ALTITUDE_KM, GROUND_POINT_LAYER_HEIGHT_M, LABEL_EYE_OFFSET } from './layerHeights';

interface CommercialSymbolicConnectivityLayerProps {
  routeModel: CommercialRouteModel;
  viewerRef: React.RefObject<CesiumViewerType | null>;
  cameraMetricsRef: React.MutableRefObject<CameraMetricsSnapshot>;
  sizeScale?: number;
  routeHeroMode?: boolean;
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

interface LeoServingSatellite {
  key: string;
  node: CommercialRouteNode;
  label: string;
  status: CommercialRouteStatus;
  coord: RouteCoordinate;
  position: Cartesian3;
}

interface LeoSiteBeam {
  id: string;
  endpoint: SymbolicEndpoint;
  satellite: LeoServingSatellite;
  status: CommercialRouteStatus;
}

interface LeoServingTopology {
  satellites: LeoServingSatellite[];
  beams: LeoSiteBeam[];
}

const ARC_SEGMENTS = 48;
const LEO_BEAM_SEGMENTS = 44;
const LEO_RELAY_SEGMENTS = 40;
const LABEL_OFFSET = new Cartesian2(0, -18);
const FLOW_EPOCH = JulianDate.fromDate(new Date(0));
const FLOW_PHASES = [0, 0.34, 0.68] as const;
const ACCESS_RADIO_WAVE_PHASES = [0, 0.24, 0.48, 0.72] as const;
const DESTINATION_RECEPTION_PHASES = [0, 0.34, 0.68] as const;
const ACCESS_RING_SEGMENTS = 96;
const ARRIVAL_MOMENT_SECONDS = 1.05;
const SYMBOLIC_ROUTE_ALTITUDE_KM = GROUND_POINT_ALTITUDE_KM + 18;
const SYMBOLIC_ENDPOINT_MARKER_ALTITUDE_KM = SYMBOLIC_ROUTE_ALTITUDE_KM + 8;
const SYMBOLIC_ENDPOINT_HALO_HEIGHT_M = GROUND_POINT_LAYER_HEIGHT_M + 2400;
const SATELLITE_LABEL_OFFSET = new Cartesian2(38, 0);
const GEO_SATELLITE_LABEL_OFFSET = new Cartesian2(78, -20);
const GEO_SATELLITE_PIXEL_OFFSET = new Cartesian2(0, -20);
const LEO_FOCUS_SATELLITE_FADE_SECONDS = 0.8;
const LEO_FOCUS_BEAM_DELAY_SECONDS = 0.42;
const LEO_FOCUS_BEAM_GROW_SECONDS = 1.18;
const LEO_FOCUS_RELAY_DELAY_SECONDS = 1.12;
const LEO_FOCUS_RELAY_FADE_SECONDS = 0.72;
const SERVICE_OUTCOME_ARC_COLORS: Record<CommercialRouteStatus, string> = {
  active: '#34d399',
  limited: '#f59e0b',
  blocked: '#94a3b8',
  pending: '#94a3b8',
};

function drawCommercialGeoSatelliteGlyph(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return SATELLITE_GLYPH;

  const drawRoundedRect = (x: number, y: number, width: number, height: number, radius: number): void => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const drawPanel = (cx: number, cy: number, angle: number, width: number, height: number): void => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const gradient = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    gradient.addColorStop(0, '#1d4ed8');
    gradient.addColorStop(0.5, '#60a5fa');
    gradient.addColorStop(1, '#1e40af');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = 'rgba(191, 219, 254, 0.95)';
    ctx.lineWidth = 1.7;
    ctx.shadowColor = 'rgba(96, 165, 250, 0.55)';
    ctx.shadowBlur = 5;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeRect(-width / 2, -height / 2, width, height);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.lineWidth = 1;
    for (let x = -width / 2 + width / 4; x < width / 2; x += width / 4) {
      ctx.beginPath();
      ctx.moveTo(x, -height / 2 + 1);
      ctx.lineTo(x, height / 2 - 1);
      ctx.stroke();
    }
    ctx.restore();
  };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(64, 48);
  ctx.rotate(-0.38);

  drawPanel(-38, -2, 0, 46, 17);
  drawPanel(38, 2, 0, 46, 17);

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.86)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-18, -1);
  ctx.lineTo(18, 1);
  ctx.stroke();

  const bodyGradient = ctx.createLinearGradient(-11, -24, 12, 24);
  bodyGradient.addColorStop(0, '#f8fafc');
  bodyGradient.addColorStop(0.45, '#cbd5e1');
  bodyGradient.addColorStop(1, '#64748b');
  ctx.shadowColor = 'rgba(191, 219, 254, 0.48)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.lineWidth = 1.5;
  drawRoundedRect(-11, -22, 22, 44, 7);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.62)';
  ctx.beginPath();
  ctx.ellipse(0, -22, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.ellipse(0, -22, 4.2, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(226, 232, 240, 0.78)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(0, 26, 12, 4.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  return canvas.toDataURL('image/png');
}

const COMM_GEO_SATELLITE_GLYPH = drawCommercialGeoSatelliteGlyph();

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

function technologyRouteColor(technology: CommercialRouteTechnology): Color {
  return Color.fromCssColorString(technology === 'GEO' ? '#60a5fa' : '#f472b6');
}

function endpointStatusColor(status: CommercialRouteStatus): Color {
  if (status === 'blocked') return Color.fromCssColorString('#ef4444');
  if (status === 'limited') return Color.fromCssColorString('#f59e0b');
  if (status === 'pending') return Color.fromCssColorString('#38bdf8');
  return Color.fromCssColorString('#34d399');
}

function endpointAccentColor(endpoint: SymbolicEndpoint, focused: CommercialRouteSegmentId | null): Color {
  if (endpoint.segmentId === 'access' && focused === 'access') {
    return Color.fromCssColorString('#22d3ee');
  }
  if (endpoint.segmentId === 'destination' && focused === 'destination') {
    return Color.fromCssColorString('#34d399');
  }
  return endpointStatusColor(endpoint.status);
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

function buildSymbolicArcApexPosition(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  technology: CommercialRouteTechnology,
  offsetKm: number,
): Cartesian3 {
  const normalizedDestLng = normalizeLngNear(destination.lng, origin.lng);
  const distanceKm = approximateDistanceKm(origin, destination);
  const peakKm = Math.min(
    technology === 'GEO' ? 2100 : 1400,
    Math.max(technology === 'GEO' ? 750 : 500, distanceKm * 0.17),
  ) + offsetKm;
  const lat = (origin.lat + destination.lat) / 2;
  const lng = denormalizeLng((origin.lng + normalizedDestLng) / 2);
  return getPosition(lat, lng, SYMBOLIC_ROUTE_ALTITUDE_KM + peakKm);
}

function routeCoordPosition(coord: RouteCoordinate): Cartesian3 {
  return getPosition(coord.lat, coord.lng, coord.altitudeKm ?? GROUND_POINT_ALTITUDE_KM);
}

function easeOutCubic(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return 1 - (1 - clamped) ** 3;
}

function animationSeconds(time: JulianDate | undefined, startSeconds: number): number {
  const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
  return now - startSeconds;
}

function timedProgress(
  time: JulianDate | undefined,
  startSeconds: number,
  delaySeconds: number,
  durationSeconds: number,
): number {
  return easeOutCubic((animationSeconds(time, startSeconds) - delaySeconds) / durationSeconds);
}

function animatedAlpha(
  time: JulianDate | undefined,
  startSeconds: number,
  delaySeconds: number,
  durationSeconds: number,
  maxAlpha: number,
): number {
  return timedProgress(time, startSeconds, delaySeconds, durationSeconds) * maxAlpha;
}

function interpolateOpenPolylinePosition(
  positions: Cartesian3[],
  progress: number,
  scratch: Cartesian3,
): Cartesian3 | undefined {
  if (positions.length === 0) return undefined;
  if (positions.length === 1) return Cartesian3.clone(positions[0], scratch);
  if (progress <= 0) return Cartesian3.clone(positions[0], scratch);
  if (progress >= 1) return Cartesian3.clone(positions[positions.length - 1], scratch);

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < positions.length - 1; index += 1) {
    const length = Cartesian3.distance(positions[index], positions[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength <= 0) return Cartesian3.clone(positions[0], scratch);

  const targetLength = progress * totalLength;
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

function revealPolylinePositions(
  positions: Cartesian3[],
  progress: number,
  scratch: Cartesian3,
): Cartesian3[] {
  if (positions.length < 2) return positions;
  if (progress >= 1) return positions;
  if (progress <= 0) return [positions[0], positions[0]];

  const tip = interpolateOpenPolylinePosition(positions, progress, scratch);
  if (!tip) return [positions[0], positions[0]];

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < positions.length - 1; index += 1) {
    const length = Cartesian3.distance(positions[index], positions[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }

  const targetLength = totalLength * Math.min(1, Math.max(0, progress));
  const revealed: Cartesian3[] = [positions[0]];
  let traversed = 0;

  for (let index = 1; index < positions.length; index += 1) {
    const segmentDistance = segmentLengths[index - 1] ?? 0;
    if (traversed + segmentDistance >= targetLength) break;
    revealed.push(positions[index]);
    traversed += segmentDistance;
  }

  revealed.push(Cartesian3.clone(tip));
  return revealed.length >= 2 ? revealed : [positions[0], tip];
}

function resolveSkyBridgeNodes(routeModel: CommercialRouteModel): {
  primary: CommercialRouteNode | null;
  secondary: CommercialRouteNode | null;
} {
  const skyBridges = routeModel.nodes.filter((node) => node.nodeType === 'SKY_BRIDGE');
  const primary = skyBridges.find((node) => !node.meta?.isSecondary) ?? skyBridges[0] ?? null;
  const secondary = skyBridges.find((node) => node.meta?.isSecondary === true) ?? skyBridges[1] ?? null;
  return { primary, secondary };
}

function leoSatelliteKey(node: CommercialRouteNode): string {
  const coord = node.meta?.orbitalPosition;
  return node.meta?.satelliteId
    ?? node.meta?.satelliteNoradId
    ?? (coord
      ? `${node.label}:${coord.lat.toFixed(3)}:${coord.lng.toFixed(3)}:${(coord.altitudeKm ?? 0).toFixed(0)}`
      : node.id);
}

function sameRouteCoordinate(a: RouteCoordinate, b: RouteCoordinate): boolean {
  return Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(normalizeLngNear(a.lng, b.lng) - b.lng) < 0.0001;
}

function averageRouteCoordinate(coords: RouteCoordinate[]): RouteCoordinate | null {
  if (coords.length === 0) return null;
  const referenceLng = coords[0].lng;
  const lat = coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length;
  const lng = denormalizeLng(coords.reduce((sum, coord) => sum + normalizeLngNear(coord.lng, referenceLng), 0) / coords.length);
  return { lat, lng };
}

function uniqueSymbolicEndpoints(endpoints: SymbolicEndpoint[]): SymbolicEndpoint[] {
  return endpoints.filter((endpoint, index, array) => (
    array.findIndex((item) => sameRouteCoordinate(item.coord, endpoint.coord)) === index
  ));
}

function buildLeoPresentationSatelliteCoord(
  originalCoord: RouteCoordinate,
  servingEndpoints: SymbolicEndpoint[],
  allEndpoints: SymbolicEndpoint[],
): RouteCoordinate {
  const routeCenter = averageRouteCoordinate(allEndpoints.map((endpoint) => endpoint.coord));
  if (!routeCenter || servingEndpoints.length === 0) {
    return {
      ...originalCoord,
      altitudeKm: Math.max(760, Math.min(1_300, originalCoord.altitudeKm ?? 1_050)),
    };
  }

  const anchor = averageRouteCoordinate(servingEndpoints.map((endpoint) => endpoint.coord)) ?? servingEndpoints[0].coord;
  const normalizedCenterLng = normalizeLngNear(routeCenter.lng, anchor.lng);
  const endpointBlend = servingEndpoints.length > 1 ? 0.52 : 0.38;
  const originalBlend = servingEndpoints.length > 1 ? 0.12 : 0.08;
  const normalizedOriginalLng = normalizeLngNear(originalCoord.lng, anchor.lng);

  return {
    lat: anchor.lat
      + (routeCenter.lat - anchor.lat) * endpointBlend
      + (originalCoord.lat - anchor.lat) * originalBlend,
    lng: denormalizeLng(
      anchor.lng
      + (normalizedCenterLng - anchor.lng) * endpointBlend
      + (normalizedOriginalLng - anchor.lng) * originalBlend,
    ),
    altitudeKm: Math.max(820, Math.min(1_180, originalCoord.altitudeKm ?? 1_050)),
  };
}

function resolveLeoServingTopology(
  routeModel: CommercialRouteModel,
  origin: SymbolicEndpoint | null,
  destination: SymbolicEndpoint | null,
): LeoServingTopology {
  const endpoints = [origin, destination].filter((endpoint): endpoint is SymbolicEndpoint => Boolean(endpoint));
  const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));

  // Collect all SKY_BRIDGE/LEO nodes (including those without orbitalPosition).
  const leoSkyBridgeNodes: CommercialRouteNode[] = [];
  const isSkyBridgeNodeId = new Set<string>();
  for (const node of routeModel.nodes) {
    if (node.nodeType !== 'SKY_BRIDGE' || node.meta?.technology !== 'LEO') continue;
    leoSkyBridgeNodes.push(node);
    isSkyBridgeNodeId.add(node.id);
  }

  // Pre-scan SPACE_LINK edges to map each satellite node → first connected endpoint.
  // This allows a fallback position to be built for satellites whose orbitalPosition
  // is transiently absent (e.g. during tab resume or initial computation).
  const satelliteNodeToEndpointId = new Map<string, string>();
  for (const edge of routeModel.edges) {
    if (edge.edgeType !== 'SPACE_LINK') continue;
    const fromIsEndpoint = endpointById.has(edge.fromNodeId);
    const toIsEndpoint = endpointById.has(edge.toNodeId);
    if (fromIsEndpoint && isSkyBridgeNodeId.has(edge.toNodeId) && !satelliteNodeToEndpointId.has(edge.toNodeId)) {
      satelliteNodeToEndpointId.set(edge.toNodeId, edge.fromNodeId);
    }
    if (toIsEndpoint && isSkyBridgeNodeId.has(edge.fromNodeId) && !satelliteNodeToEndpointId.has(edge.fromNodeId)) {
      satelliteNodeToEndpointId.set(edge.fromNodeId, edge.toNodeId);
    }
  }

  // Build satellite objects. Nodes with orbitalPosition use their real coordinate;
  // nodes without it fall back to their connected endpoint at standard LEO altitude,
  // keeping the satellite visible while its position is being (re-)computed.
  const satellitesByNodeId = new Map<string, LeoServingSatellite>();
  const satellitesByKey = new Map<string, LeoServingSatellite>();

  for (const node of leoSkyBridgeNodes) {
    let coord = node.meta?.orbitalPosition;
    if (!coord) {
      const endpointId = satelliteNodeToEndpointId.get(node.id);
      const endpoint = endpointId ? endpointById.get(endpointId) : undefined;
      if (endpoint) {
        coord = { lat: endpoint.coord.lat, lng: endpoint.coord.lng, altitudeKm: 1_050 };
      } else if (endpoints.length > 0) {
        // Connected endpoint is not yet known (e.g. destination still loading).
        // Fall back to the route centroid so the satellite stays visible.
        const centroid = averageRouteCoordinate(endpoints.map((ep) => ep.coord));
        if (!centroid) continue;
        coord = { lat: centroid.lat, lng: centroid.lng, altitudeKm: 1_050 };
      } else {
        continue;
      }
    }

    const key = leoSatelliteKey(node);
    const existing = satellitesByKey.get(key);
    if (existing) {
      satellitesByNodeId.set(node.id, existing);
      continue;
    }
    const satellite: LeoServingSatellite = {
      key,
      node,
      label: node.label,
      status: node.status,
      coord,
      position: routeCoordPosition(coord),
    };
    satellitesByNodeId.set(node.id, satellite);
    satellitesByKey.set(key, satellite);
  }

  const beams: LeoSiteBeam[] = [];

  for (const edge of routeModel.edges) {
    if (edge.edgeType !== 'SPACE_LINK') continue;

    const fromEndpoint = endpointById.get(edge.fromNodeId);
    const toEndpoint = endpointById.get(edge.toNodeId);
    const fromSatellite = satellitesByNodeId.get(edge.fromNodeId);
    const toSatellite = satellitesByNodeId.get(edge.toNodeId);

    const endpoint = fromEndpoint ?? toEndpoint;
    const satellite = fromEndpoint ? toSatellite : toEndpoint ? fromSatellite : null;
    if (!endpoint || !satellite) continue;

    beams.push({
      id: `${endpoint.id}-${satellite.key}`,
      endpoint,
      satellite,
      status: edge.status,
    });
  }

  const presentationSatellitesByKey = new Map<string, LeoServingSatellite>();
  for (const satellite of satellitesByKey.values()) {
    const servingEndpoints = uniqueSymbolicEndpoints(beams
      .filter((beam) => beam.satellite.key === satellite.key)
      .map((beam) => beam.endpoint)
    );
    const presentationCoord = buildLeoPresentationSatelliteCoord(satellite.coord, servingEndpoints, endpoints);
    presentationSatellitesByKey.set(satellite.key, {
      ...satellite,
      coord: presentationCoord,
      position: routeCoordPosition(presentationCoord),
    });
  }

  const presentationBeams = beams.map((beam) => ({
    ...beam,
    satellite: presentationSatellitesByKey.get(beam.satellite.key) ?? beam.satellite,
  }));

  return {
    satellites: [...presentationSatellitesByKey.values()],
    beams: presentationBeams,
  };
}

function buildLeoSiteBeamPositions(endpoint: RouteCoordinate, satellite: RouteCoordinate): Cartesian3[] {
  const satelliteAltKm = Math.max(650, Math.min(2_100, satellite.altitudeKm ?? 1_200));
  const normalizedSatLng = normalizeLngNear(satellite.lng, endpoint.lng);
  const distanceKm = approximateDistanceKm(endpoint, { lat: satellite.lat, lng: normalizedSatLng });
  const bowKm = Math.min(90, Math.max(22, distanceKm * 0.024));

  return Array.from({ length: LEO_BEAM_SEGMENTS + 1 }, (_, index) => {
    const t = index / LEO_BEAM_SEGMENTS;
    const eased = 1 - (1 - t) ** 1.72;
    const lat = endpoint.lat + (satellite.lat - endpoint.lat) * eased;
    const lng = denormalizeLng(endpoint.lng + (normalizedSatLng - endpoint.lng) * eased);
    const altitudeKm = SYMBOLIC_ROUTE_ALTITUDE_KM
      + (satelliteAltKm - SYMBOLIC_ROUTE_ALTITUDE_KM) * eased
      + Math.sin(t * Math.PI) * bowKm;
    return getPosition(lat, lng, altitudeKm);
  });
}

function buildLeoRelayPositions(from: RouteCoordinate, to: RouteCoordinate): Cartesian3[] {
  const normalizedToLng = normalizeLngNear(to.lng, from.lng);
  const fromAltKm = Math.max(650, Math.min(2_100, from.altitudeKm ?? 1_200));
  const toAltKm = Math.max(650, Math.min(2_100, to.altitudeKm ?? 1_200));
  const relayDistanceKm = approximateDistanceKm(from, { lat: to.lat, lng: normalizedToLng });
  const relayDropKm = Math.min(720, Math.max(260, relayDistanceKm * 0.05));

  return Array.from({ length: LEO_RELAY_SEGMENTS + 1 }, (_, index) => {
    const t = index / LEO_RELAY_SEGMENTS;
    const ease = 0.5 - Math.cos(t * Math.PI) * 0.5;
    const lat = from.lat + (to.lat - from.lat) * ease;
    const lng = denormalizeLng(from.lng + (normalizedToLng - from.lng) * ease);
    const linearAltitudeKm = fromAltKm + (toAltKm - fromAltKm) * ease;
    const altitudeKm = Math.max(SYMBOLIC_ROUTE_ALTITUDE_KM + 160, linearAltitudeKm - Math.sin(t * Math.PI) * relayDropKm);
    return getPosition(lat, lng, altitudeKm);
  });
}

function buildAccessRadioRingPositions(
  origin: RouteCoordinate,
  radiusMeters: number,
  altitudeMeters: number,
): Cartesian3[] {
  const radiusKm = radiusMeters / 1000;
  const altitudeKm = altitudeMeters / 1000;
  const latRadiusDeg = radiusKm / 111.32;
  const lngRadiusDeg = radiusKm / Math.max(18, 111.32 * Math.cos(origin.lat * Math.PI / 180));

  return Array.from({ length: ACCESS_RING_SEGMENTS + 1 }, (_, index) => {
    const theta = (index / ACCESS_RING_SEGMENTS) * Math.PI * 2;
    const lat = origin.lat + Math.sin(theta) * latRadiusDeg;
    const lng = denormalizeLng(origin.lng + Math.cos(theta) * lngRadiusDeg);
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
  if (!focused || focused === 'satellite' || focused === 'backhaul') return 1;
  if (focused === 'summary') return 0.86;
  return shouldFocusEndpoint(endpoint, focused) ? 1 : 0.42;
}

function arcAlpha(focused: CommercialRouteSegmentId | null): number {
  const base = 0.9;
  if (!focused || focused === 'satellite') return base;
  if (focused === 'summary') return 0.98;
  if (focused === 'access' || focused === 'destination') return 0.78;
  return 0.66;
}

function arcAccentColor(spec: SymbolicArcSpec, focused: CommercialRouteSegmentId | null): Color {
  const { status, technology } = spec;
  if (status === 'blocked' || status === 'pending') return routeStatusColor(status);
  if (focused === 'access') return Color.fromCssColorString('#22d3ee');
  if (!focused || focused === 'summary' || focused === 'satellite') return technologyRouteColor(technology);
  return routeStatusColor(status);
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

function expectedGeoSatelliteFocusEntityIds(
  origin: SymbolicEndpoint | null,
  destination: SymbolicEndpoint | null,
  skyBridge: CommercialRouteNode | null,
): Set<string> {
  const ids = new Set<string>();
  if (!origin || !destination) return ids;

  const entityPosKey = symbolicArcEntityPositionKey(origin, destination);
  ids.add(`commercial-route-satellite-focus-geo-arc-halo-${entityPosKey}`);
  ids.add(`commercial-route-satellite-focus-geo-arc-${entityPosKey}`);

  const glyphId = `geo-${skyBridge?.id ?? 'satellite'}-${entityPosKey}`;
  ids.add(`commercial-route-satellite-focus-glyph-glow-${glyphId}`);
  ids.add(`commercial-route-satellite-focus-glyph-${glyphId}`);

  return ids;
}

function expectedLeoSatelliteFocusEntityIds(topology: LeoServingTopology): Set<string> {
  const ids = new Set<string>();

  for (const beam of topology.beams) {
    const entityKey = entitySafeSignature(`${beam.endpoint.id}-${beam.satellite.key}`);
    ids.add(`commercial-route-leo-site-satellite-beam-halo-${entityKey}`);
    ids.add(`commercial-route-leo-site-satellite-beam-${entityKey}`);
  }

  for (const satellite of topology.satellites) {
    const entityKey = entitySafeSignature(satellite.key);
    ids.add(`commercial-route-leo-serving-satellite-glow-${entityKey}`);
    ids.add(`commercial-route-leo-serving-satellite-${entityKey}`);
  }

  const relayFrom = topology.satellites[0] ?? null;
  const relayTo = topology.satellites.length > 1 ? topology.satellites[1] : null;
  if (relayFrom && relayTo) {
    ids.add(`commercial-route-leo-satellite-relay-${entitySafeSignature(`${relayFrom.key}-${relayTo.key}`)}`);
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
        || id.startsWith('commercial-route-satellite-focus-')
        || id.startsWith('commercial-route-leo-footprint-projection-')
        || id.startsWith('commercial-route-leo-site-satellite-beam-')
        || id.startsWith('commercial-route-leo-serving-satellite-')
        || id.startsWith('commercial-route-leo-satellite-relay-')
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
  const baseColor = useMemo(
    () => endpointAccentColor(endpoint, focusedSegmentId),
    [endpoint, focusedSegmentId],
  );
  const weight = endpointWeight(endpoint, focusedSegmentId);

  // Use primitive segmentId (string) so these CallbackProperty instances are not
  // recreated on every render when `endpoint` gets a new object reference.
  const pointSize = useMemo(() => new CallbackProperty(() => {
    const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
    const distanceScale = 3_000_000 / Math.max(distance, 6_000_000);
    const isFocused = endpoint.segmentId === (focusedSegmentId ?? '');
    const destinationBoost = endpoint.segmentId === 'destination' && focusedSegmentId === 'destination' ? 1.28 : 1;
    const focusBoost = isFocused || !focusedSegmentId || focusedSegmentId === 'summary' ? 1.25 * destinationBoost : 0.95;
    return Math.max(18, 30 * distanceScale * focusBoost * sizeScale);
  }, false), [cameraMetricsRef, endpoint.segmentId, focusedSegmentId, position, sizeScale]);

  const haloColor = useMemo(() => {
    const scratch = new Color();
    return new CallbackProperty((time?: JulianDate) => {
      const seconds = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 0.75);
      Color.clone(baseColor, scratch);
      const accessBoost = endpoint.segmentId === 'access' && focusedSegmentId === 'access' ? 1.35 : 1;
      const destinationBoost = endpoint.segmentId === 'destination' && focusedSegmentId === 'destination' ? 1.55 : 1;
      scratch.alpha = (0.38 + pulse * 0.24) * weight * accessBoost * destinationBoost;
      return scratch;
    }, false);
  }, [baseColor, endpoint.segmentId, focusedSegmentId, weight]);

  const haloRadius = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const seconds = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 0.75);
    const isFocused = !focusedSegmentId || focusedSegmentId === 'summary' || endpoint.segmentId === focusedSegmentId;
    const accessBoost = endpoint.segmentId === 'access' && focusedSegmentId === 'access' ? 1.38 : 1;
    const destinationBoost = endpoint.segmentId === 'destination' && focusedSegmentId === 'destination' ? 1.42 : 1;
    return (68_000 + pulse * 34_000) * (isFocused ? 1.2 : 0.85) * accessBoost * destinationBoost;
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

const RadioWaveBeacon = React.memo<{
  endpoint: SymbolicEndpoint;
  direction: 'transmit' | 'receive';
  sizeScale: number;
}>(({ endpoint, direction, sizeScale }) => {
  const endpointLat = endpoint.coord.lat;
  const endpointLng = endpoint.coord.lng;
  const posKey = useMemo(
    () => `${endpointLat.toFixed(4)},${endpointLng.toFixed(4)}`,
    [endpointLat, endpointLng],
  );

  const phases = direction === 'receive' ? DESTINATION_RECEPTION_PHASES : ACCESS_RADIO_WAVE_PHASES;
  const rings = useMemo(() => phases.map((phase, index) => {
    const progressAt = (time?: JulianDate): number => {
      const seconds = time ? JulianDate.secondsDifference(time, FLOW_EPOCH) : Date.now() / 1000;
      const cycleSeconds = direction === 'receive' ? 3.1 : 3.6;
      const cycle = ((seconds / cycleSeconds + phase) % 1 + 1) % 1;
      return direction === 'receive' ? 1 - cycle : cycle;
    };
    const ease = (progress: number): number => 1 - (1 - progress) ** 2.7;
    const accent = direction === 'receive' ? '#34d399' : '#22d3ee';

    const positions = new CallbackProperty((time?: JulianDate) => {
      const progress = progressAt(time);
      const eased = ease(progress);
      const radiusMeters = direction === 'receive'
        ? (20_000 + eased * 82_000) * Math.max(0.9, sizeScale)
        : (24_000 + eased * 100_000) * Math.max(0.9, sizeScale);
      const altitudeMeters = direction === 'receive'
        ? GROUND_POINT_LAYER_HEIGHT_M + 6_000 + eased * 82_000
        : GROUND_POINT_LAYER_HEIGHT_M + 8_000 + eased * 120_000;
      return buildAccessRadioRingPositions({ lat: endpointLat, lng: endpointLng }, radiusMeters, altitudeMeters);
    }, false);

    const outlineColor = new CallbackProperty((time?: JulianDate) => {
      const progress = progressAt(time);
      const eased = ease(progress);
      const fade = direction === 'receive' ? (1 - progress) ** 1.9 : (1 - progress) ** 1.35;
      const alpha = direction === 'receive'
        ? Math.max(0, 0.48 * fade + 0.04 * (1 - eased))
        : Math.max(0, 0.58 * fade + 0.055 * (1 - eased));
      return Color.fromCssColorString(accent).withAlpha(alpha);
    }, false);

    const material = new PolylineGlowMaterialProperty({
      color: outlineColor,
      glowPower: 0.36,
      taperPower: 0.72,
    });

    return {
      id: `commercial-route-${direction}-radio-wave-${endpoint.id}-${entitySafeSignature(posKey)}-${index}`,
      positions,
      material,
    };
  }), [direction, endpoint.id, endpointLat, endpointLng, phases, posKey, sizeScale]);

  return (
    <>
      {rings.map((ring) => (
        <Entity
          key={ring.id}
          id={ring.id}
          polyline={{
            positions: ring.positions,
            width: 4 * Math.max(0.9, sizeScale),
            material: ring.material,
            depthFailMaterial: ring.material,
            arcType: ArcType.NONE,
            clampToGround: false,
          }}
        />
      ))}
    </>
  );
}, (prev, next) =>
  prev.endpoint.id === next.endpoint.id &&
  prev.endpoint.coord.lat === next.endpoint.coord.lat &&
  prev.endpoint.coord.lng === next.endpoint.coord.lng &&
  prev.direction === next.direction &&
  prev.sizeScale === next.sizeScale
);
RadioWaveBeacon.displayName = 'RadioWaveBeacon';

const DestinationArrivalMoment = React.memo<{
  origin: SymbolicEndpoint;
  destination: SymbolicEndpoint;
  technology: CommercialRouteTechnology;
  sizeScale: number;
}>(({ origin, destination, technology, sizeScale }) => {
  const originLat = origin.coord.lat;
  const originLng = origin.coord.lng;
  const destinationLat = destination.coord.lat;
  const destinationLng = destination.coord.lng;
  const startSecondsRef = useRef(Date.now() / 1000);

  const positions = useMemo(() => (
    buildSymbolicArcPositions(
      { lat: originLat, lng: originLng },
      { lat: destinationLat, lng: destinationLng },
      technology,
      -80,
    )
  ), [destinationLat, destinationLng, originLat, originLng, technology]);

  const posKey = useMemo(
    () => entitySafeSignature(`${originLat.toFixed(4)},${originLng.toFixed(4)}-${destinationLat.toFixed(4)},${destinationLng.toFixed(4)}`),
    [destinationLat, destinationLng, originLat, originLng],
  );

  const arrivalPosition = useMemo(() => {
    const scratch = new Cartesian3();
    return new CallbackProperty((time?: JulianDate) => {
      const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
      const raw = Math.min(1, Math.max(0, (now - startSecondsRef.current) / ARRIVAL_MOMENT_SECONDS));
      const eased = 1 - (1 - raw) ** 3;
      return interpolatePolylinePosition(positions, eased, scratch);
    }, false);
  }, [positions]);

  const arrivalAlpha = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const raw = Math.min(1, Math.max(0, (now - startSecondsRef.current) / ARRIVAL_MOMENT_SECONDS));
    if (raw >= 1) return Color.WHITE.withAlpha(0);
    const fadeOut = raw > 0.78 ? (1 - raw) / 0.22 : 1;
    return Color.fromCssColorString('#d1fae5').withAlpha(0.92 * fadeOut);
  }, false), []);

  const arrivalGlowColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const now = time ? JulianDate.toDate(time).getTime() / 1000 : Date.now() / 1000;
    const raw = Math.min(1, Math.max(0, (now - startSecondsRef.current) / ARRIVAL_MOMENT_SECONDS));
    if (raw >= 1) return Color.fromCssColorString('#34d399').withAlpha(0);
    const fadeOut = raw > 0.78 ? (1 - raw) / 0.22 : 1;
    return Color.fromCssColorString('#34d399').withAlpha(0.34 * fadeOut);
  }, false), []);

  return (
    <>
      <Entity
        id={`commercial-route-destination-arrival-glow-${posKey}`}
        position={arrivalPosition}
      >
        <PointGraphics
          pixelSize={18 * sizeScale}
          color={arrivalGlowColor}
          outlineColor={Color.fromCssColorString('#34d399').withAlpha(0.10)}
          outlineWidth={1}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
      <Entity
        id={`commercial-route-destination-arrival-core-${posKey}`}
        position={arrivalPosition}
      >
        <PointGraphics
          pixelSize={6.5 * sizeScale}
          color={arrivalAlpha}
          outlineColor={Color.fromCssColorString('#34d399').withAlpha(0.82)}
          outlineWidth={2}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
    </>
  );
}, (prev, next) =>
  prev.origin.coord.lat === next.origin.coord.lat &&
  prev.origin.coord.lng === next.origin.coord.lng &&
  prev.destination.coord.lat === next.destination.coord.lat &&
  prev.destination.coord.lng === next.destination.coord.lng &&
  prev.technology === next.technology &&
  prev.sizeScale === next.sizeScale
);
DestinationArrivalMoment.displayName = 'DestinationArrivalMoment';

function satelliteFocusColor(
  status: CommercialRouteStatus,
  technology: CommercialRouteTechnology,
): Color {
  if (status === 'blocked') return Color.fromCssColorString('#ef4444');
  if (status === 'pending') return Color.fromCssColorString('#94a3b8');
  if (status === 'limited') return Color.fromCssColorString(technology === 'GEO' ? '#93c5fd' : '#f9a8d4');
  return Color.fromCssColorString(technology === 'GEO' ? '#60a5fa' : '#f472b6');
}

const SatelliteFocusGlyph = React.memo<{
  id: string;
  label: string;
  position: Cartesian3;
  technology: CommercialRouteTechnology;
  status: CommercialRouteStatus;
  sizeScale: number;
}>(({ id, label, position, technology, status, sizeScale }) => {
  const isGeo = technology === 'GEO';
  const glyph = isGeo ? COMM_GEO_SATELLITE_GLYPH : LEO_SMOKED_GLYPH;
  const accent = useMemo(() => satelliteFocusColor(status, technology), [status, technology]);
  const glowColor = useMemo(() => accent.withAlpha(isGeo ? 0.48 : 0.24), [accent, isGeo]);
  const coreOutlineColor = useMemo(() => accent.withAlpha(isGeo ? 0.92 : 0.78), [accent, isGeo]);
  const billboardColor = useMemo(() => Color.WHITE.withAlpha(status === 'blocked' ? 0.72 : 1), [status]);
  const labelFillColor = useMemo(() => Color.WHITE.withAlpha(status === 'blocked' ? 0.78 : 0.94), [status]);
  const labelOutlineColor = useMemo(() => Color.fromCssColorString('#020617').withAlpha(0.9), []);

  return (
    <>
      <Entity
        id={`commercial-route-satellite-focus-glyph-glow-${id}`}
        position={position}
      >
        <PointGraphics
          pixelSize={(isGeo ? 88 : 24) * sizeScale}
          color={glowColor}
          outlineColor={coreOutlineColor.withAlpha(isGeo ? 0.34 : 0.18)}
          outlineWidth={isGeo ? 3 : 1}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
      <Entity
        id={`commercial-route-satellite-focus-glyph-${id}`}
        position={position}
        billboard={{
          image: glyph,
          scale: (isGeo ? 0.68 : 0.72) * sizeScale,
          color: billboardColor,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          pixelOffset: isGeo ? GEO_SATELLITE_PIXEL_OFFSET : undefined,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
        name={label}
      >
        <LabelGraphics
          text={label}
          font="600 11px Inter, sans-serif"
          fillColor={labelFillColor}
          outlineColor={labelOutlineColor}
          outlineWidth={3}
          style={2}
          verticalOrigin={VerticalOrigin.CENTER}
          horizontalOrigin={HorizontalOrigin.LEFT}
          pixelOffset={isGeo ? GEO_SATELLITE_LABEL_OFFSET : SATELLITE_LABEL_OFFSET}
          eyeOffset={LABEL_EYE_OFFSET}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
    </>
  );
}, (prev, next) =>
  prev.id === next.id &&
  prev.label === next.label &&
  prev.position === next.position &&
  prev.technology === next.technology &&
  prev.status === next.status &&
  prev.sizeScale === next.sizeScale
);
SatelliteFocusGlyph.displayName = 'SatelliteFocusGlyph';

const LeoServingSatelliteGlyph = React.memo<{
  satellite: LeoServingSatellite;
  sizeScale: number;
  animationStartSeconds: number;
}>(({ satellite, sizeScale, animationStartSeconds }) => {
  const accent = useMemo(() => satelliteFocusColor(satellite.status, 'LEO'), [satellite.status]);
  const id = useMemo(() => entitySafeSignature(satellite.key), [satellite.key]);
  const glyphColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const alpha = animatedAlpha(time, animationStartSeconds, 0, LEO_FOCUS_SATELLITE_FADE_SECONDS, satellite.status === 'blocked' ? 0.7 : 1);
    return Color.WHITE.withAlpha(alpha);
  }, false), [animationStartSeconds, satellite.status]);
  const glowColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const alpha = animatedAlpha(time, animationStartSeconds, 0, LEO_FOCUS_SATELLITE_FADE_SECONDS, satellite.status === 'blocked' ? 0.18 : 0.34);
    return accent.withAlpha(alpha);
  }, false), [accent, animationStartSeconds, satellite.status]);
  const glowOutlineColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const alpha = animatedAlpha(time, animationStartSeconds, 0, LEO_FOCUS_SATELLITE_FADE_SECONDS, 0.18);
    return accent.withAlpha(alpha);
  }, false), [accent, animationStartSeconds]);
  const labelFillColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const alpha = animatedAlpha(time, animationStartSeconds, 0.12, LEO_FOCUS_SATELLITE_FADE_SECONDS, satellite.status === 'blocked' ? 0.72 : 0.9);
    return Color.WHITE.withAlpha(alpha);
  }, false), [animationStartSeconds, satellite.status]);
  const labelOutlineColor = useMemo(() => new CallbackProperty((time?: JulianDate) => {
    const alpha = animatedAlpha(time, animationStartSeconds, 0.12, LEO_FOCUS_SATELLITE_FADE_SECONDS, 0.88);
    return Color.fromCssColorString('#020617').withAlpha(alpha);
  }, false), [animationStartSeconds]);

  return (
    <>
      <Entity
        id={`commercial-route-leo-serving-satellite-glow-${id}`}
        position={satellite.position}
      >
        <PointGraphics
          pixelSize={46 * sizeScale}
          color={glowColor}
          outlineColor={glowOutlineColor}
          outlineWidth={2}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
      <Entity
        id={`commercial-route-leo-serving-satellite-${id}`}
        position={satellite.position}
        billboard={{
          image: LEO_SMOKED_GLYPH,
          scale: 0.82 * sizeScale,
          color: glyphColor,
          verticalOrigin: VerticalOrigin.CENTER,
          horizontalOrigin: HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }}
        name={satellite.label}
      >
        <LabelGraphics
          text={satellite.label}
          font="600 11px Inter, sans-serif"
          fillColor={labelFillColor}
          outlineColor={labelOutlineColor}
          outlineWidth={3}
          style={2}
          verticalOrigin={VerticalOrigin.CENTER}
          horizontalOrigin={HorizontalOrigin.LEFT}
          pixelOffset={SATELLITE_LABEL_OFFSET}
          eyeOffset={LABEL_EYE_OFFSET}
          disableDepthTestDistance={Number.POSITIVE_INFINITY}
        />
      </Entity>
    </>
  );
}, (prev, next) =>
  prev.satellite.key === next.satellite.key &&
  prev.satellite.label === next.satellite.label &&
  prev.satellite.status === next.satellite.status &&
  prev.satellite.coord.lat === next.satellite.coord.lat &&
  prev.satellite.coord.lng === next.satellite.coord.lng &&
  (prev.satellite.coord.altitudeKm ?? 0) === (next.satellite.coord.altitudeKm ?? 0) &&
  prev.sizeScale === next.sizeScale &&
  prev.animationStartSeconds === next.animationStartSeconds
);
LeoServingSatelliteGlyph.displayName = 'LeoServingSatelliteGlyph';

const LeoSiteToSatelliteBeam = React.memo<{
  beam: LeoSiteBeam;
  sizeScale: number;
  animationStartSeconds: number;
}>(({ beam, sizeScale, animationStartSeconds }) => {
  const positions = useMemo(
    () => buildLeoSiteBeamPositions(beam.endpoint.coord, beam.satellite.coord),
    [beam.endpoint.coord, beam.satellite.coord],
  );
  const entityKey = useMemo(
    () => entitySafeSignature(`${beam.endpoint.id}-${beam.satellite.key}`),
    [beam.endpoint.id, beam.satellite.key],
  );
  const color = useMemo(() => satelliteFocusColor(beam.status, 'LEO'), [beam.status]);
  const animatedPositions = useMemo(() => {
    const scratch = new Cartesian3();
    return new CallbackProperty((time?: JulianDate) => {
      const progress = timedProgress(time, animationStartSeconds, LEO_FOCUS_BEAM_DELAY_SECONDS, LEO_FOCUS_BEAM_GROW_SECONDS);
      return revealPolylinePositions(positions, progress, scratch);
    }, false);
  }, [animationStartSeconds, positions]);
  const material = useMemo(() => new PolylineGlowMaterialProperty({
    color: new CallbackProperty((time?: JulianDate) => {
      const alpha = animatedAlpha(time, animationStartSeconds, LEO_FOCUS_BEAM_DELAY_SECONDS, LEO_FOCUS_BEAM_GROW_SECONDS, beam.status === 'blocked' ? 0.68 : 0.94);
      const pulseSeconds = animationSeconds(time, animationStartSeconds);
      const pulse = 0.9 + 0.1 * Math.sin(pulseSeconds * Math.PI * 1.22);
      return color.withAlpha(alpha * pulse);
    }, false),
    glowPower: 0.28,
    taperPower: 0.72,
  }), [animationStartSeconds, beam.status, color]);
  const haloMaterial = useMemo(() => new PolylineGlowMaterialProperty({
    color: new CallbackProperty((time?: JulianDate) => {
      const alpha = animatedAlpha(time, animationStartSeconds, LEO_FOCUS_BEAM_DELAY_SECONDS - 0.08, LEO_FOCUS_BEAM_GROW_SECONDS, beam.status === 'active' || beam.status === 'limited' ? 0.24 : 0.12);
      return Color.WHITE.withAlpha(alpha);
    }, false),
    glowPower: 0.3,
    taperPower: 0.7,
  }), [animationStartSeconds, beam.status]);

  return (
    <>
      <Entity
        id={`commercial-route-leo-site-satellite-beam-halo-${entityKey}`}
        polyline={{
          positions: animatedPositions,
          width: 14 * sizeScale,
          material: haloMaterial,
          depthFailMaterial: haloMaterial,
          arcType: ArcType.NONE,
          clampToGround: false,
        }}
      />
      <Entity
        id={`commercial-route-leo-site-satellite-beam-${entityKey}`}
        polyline={{
          positions: animatedPositions,
          width: 5.8 * sizeScale,
          material,
          depthFailMaterial: material,
          arcType: ArcType.NONE,
          clampToGround: false,
        }}
      />
    </>
  );
}, (prev, next) =>
  prev.beam.id === next.beam.id &&
  prev.beam.status === next.beam.status &&
  prev.beam.endpoint.coord.lat === next.beam.endpoint.coord.lat &&
  prev.beam.endpoint.coord.lng === next.beam.endpoint.coord.lng &&
  prev.beam.satellite.key === next.beam.satellite.key &&
  prev.beam.satellite.coord.lat === next.beam.satellite.coord.lat &&
  prev.beam.satellite.coord.lng === next.beam.satellite.coord.lng &&
  prev.beam.satellite.coord.altitudeKm === next.beam.satellite.coord.altitudeKm &&
  prev.sizeScale === next.sizeScale &&
  prev.animationStartSeconds === next.animationStartSeconds
);
LeoSiteToSatelliteBeam.displayName = 'LeoSiteToSatelliteBeam';

const LeoSatelliteRelay = React.memo<{
  from: LeoServingSatellite;
  to: LeoServingSatellite;
  sizeScale: number;
  animationStartSeconds: number;
}>(({ from, to, sizeScale, animationStartSeconds }) => {
  const positions = useMemo(
    () => buildLeoRelayPositions(from.coord, to.coord),
    [from.coord, to.coord],
  );
  const entityKey = useMemo(() => entitySafeSignature(`${from.key}-${to.key}`), [from.key, to.key]);
  const material = useMemo(() => new PolylineDashMaterialProperty({
    color: new CallbackProperty((time?: JulianDate) => {
      const alpha = animatedAlpha(time, animationStartSeconds, LEO_FOCUS_RELAY_DELAY_SECONDS, LEO_FOCUS_RELAY_FADE_SECONDS, 0.48);
      return Color.fromCssColorString('#c4b5fd').withAlpha(alpha);
    }, false),
    dashLength: 14,
    dashPattern: 0b1111000011110000,
  }), [animationStartSeconds]);

  return (
    <Entity
      id={`commercial-route-leo-satellite-relay-${entityKey}`}
      polyline={{
        positions,
        width: 2.8 * sizeScale,
        material,
        depthFailMaterial: material,
        arcType: ArcType.NONE,
        clampToGround: false,
      }}
    />
  );
}, (prev, next) =>
  prev.from.key === next.from.key &&
  prev.to.key === next.to.key &&
  prev.from.coord.lat === next.from.coord.lat &&
  prev.from.coord.lng === next.from.coord.lng &&
  prev.from.coord.altitudeKm === next.from.coord.altitudeKm &&
  prev.to.coord.lat === next.to.coord.lat &&
  prev.to.coord.lng === next.to.coord.lng &&
  prev.to.coord.altitudeKm === next.to.coord.altitudeKm &&
  prev.sizeScale === next.sizeScale &&
  prev.animationStartSeconds === next.animationStartSeconds
);
LeoSatelliteRelay.displayName = 'LeoSatelliteRelay';

const LeoSatelliteServiceFocus = React.memo<{
  topology: LeoServingTopology;
  sizeScale: number;
}>(({ topology, sizeScale }) => {
  const animationStartSecondsRef = useRef(Date.now() / 1000);
  const animationStartSeconds = animationStartSecondsRef.current;
  const relayFrom = topology.satellites[0] ?? null;
  const relayTo = topology.satellites.length > 1 ? topology.satellites[1] : null;

  return (
    <>
      {topology.satellites.map((satellite) => (
        <LeoServingSatelliteGlyph
          key={`satellite-${satellite.key}`}
          satellite={satellite}
          sizeScale={sizeScale}
          animationStartSeconds={animationStartSeconds}
        />
      ))}
      {topology.beams.map((beam) => (
        <LeoSiteToSatelliteBeam
          key={`beam-${beam.id}`}
          beam={beam}
          sizeScale={sizeScale}
          animationStartSeconds={animationStartSeconds}
        />
      ))}
      {relayFrom && relayTo && (
        <LeoSatelliteRelay
          from={relayFrom}
          to={relayTo}
          sizeScale={sizeScale}
          animationStartSeconds={animationStartSeconds}
        />
      )}
    </>
  );
}, (prev, next) =>
  prev.sizeScale === next.sizeScale &&
  prev.topology.satellites.map((satellite) => (
    `${satellite.key}:${satellite.coord.lat}:${satellite.coord.lng}:${satellite.coord.altitudeKm ?? 0}:${satellite.status}`
  )).join('|') === next.topology.satellites.map((satellite) => (
    `${satellite.key}:${satellite.coord.lat}:${satellite.coord.lng}:${satellite.coord.altitudeKm ?? 0}:${satellite.status}`
  )).join('|') &&
  prev.topology.beams.map((beam) => (
    `${beam.endpoint.id}:${beam.endpoint.coord.lat}:${beam.endpoint.coord.lng}:${beam.satellite.key}:${beam.satellite.coord.lat}:${beam.satellite.coord.lng}:${beam.satellite.coord.altitudeKm ?? 0}:${beam.status}`
  )).join('|') === next.topology.beams.map((beam) => (
    `${beam.endpoint.id}:${beam.endpoint.coord.lat}:${beam.endpoint.coord.lng}:${beam.satellite.key}:${beam.satellite.coord.lat}:${beam.satellite.coord.lng}:${beam.satellite.coord.altitudeKm ?? 0}:${beam.status}`
  )).join('|')
);
LeoSatelliteServiceFocus.displayName = 'LeoSatelliteServiceFocus';

const GeoSatelliteServiceFocus = React.memo<{
  spec: SymbolicArcSpec;
  origin: SymbolicEndpoint;
  destination: SymbolicEndpoint;
  skyBridge: CommercialRouteNode | null;
  sizeScale: number;
}>(({ spec, origin, destination, skyBridge, sizeScale }) => {
  const originLat = origin.coord.lat;
  const originLng = origin.coord.lng;
  const destinationLat = destination.coord.lat;
  const destinationLng = destination.coord.lng;
  const positions = useMemo(() => (
    buildSymbolicArcPositions(
      { lat: originLat, lng: originLng },
      { lat: destinationLat, lng: destinationLng },
      'GEO',
      0,
    )
  ), [destinationLat, destinationLng, originLat, originLng]);
  const satellitePosition = useMemo(() => (
    buildSymbolicArcApexPosition(
      { lat: originLat, lng: originLng },
      { lat: destinationLat, lng: destinationLng },
      'GEO',
      120,
    )
  ), [destinationLat, destinationLng, originLat, originLng]);
  const posKey = useMemo(
    () => entitySafeSignature(`${originLat.toFixed(4)},${originLng.toFixed(4)}-${destinationLat.toFixed(4)},${destinationLng.toFixed(4)}`),
    [destinationLat, destinationLng, originLat, originLng],
  );
  const color = useMemo(() => satelliteFocusColor(spec.status, 'GEO'), [spec.status]);
  const material = useMemo(() => new PolylineGlowMaterialProperty({
    color: color.withAlpha(0.92),
    glowPower: 0.32,
    taperPower: 0.56,
  }), [color]);
  const haloMaterial = useMemo(() => new PolylineGlowMaterialProperty({
    color: Color.WHITE.withAlpha(spec.status === 'active' || spec.status === 'limited' ? 0.28 : 0.14),
    glowPower: 0.34,
    taperPower: 0.5,
  }), [spec.status]);
  const satelliteLabel = skyBridge?.label ?? 'GEO Satellite';

  return (
    <>
      <Entity
        id={`commercial-route-satellite-focus-geo-arc-halo-${posKey}`}
        polyline={{
          positions,
          width: 15 * sizeScale,
          material: haloMaterial,
          depthFailMaterial: haloMaterial,
          arcType: ArcType.NONE,
          clampToGround: false,
        }}
      />
      <Entity
        id={`commercial-route-satellite-focus-geo-arc-${posKey}`}
        polyline={{
          positions,
          width: 5.8 * sizeScale,
          material,
          depthFailMaterial: material,
          arcType: ArcType.NONE,
          clampToGround: false,
        }}
      />
      <SatelliteFocusGlyph
        id={`geo-${skyBridge?.id ?? 'satellite'}-${posKey}`}
        label={satelliteLabel}
        position={satellitePosition}
        technology="GEO"
        status={spec.status}
        sizeScale={sizeScale}
      />
    </>
  );
}, (prev, next) =>
  prev.spec.id === next.spec.id &&
  prev.spec.status === next.spec.status &&
  prev.origin.coord.lat === next.origin.coord.lat &&
  prev.origin.coord.lng === next.origin.coord.lng &&
  prev.destination.coord.lat === next.destination.coord.lat &&
  prev.destination.coord.lng === next.destination.coord.lng &&
  prev.skyBridge?.id === next.skyBridge?.id &&
  prev.skyBridge?.label === next.skyBridge?.label &&
  prev.sizeScale === next.sizeScale
);
GeoSatelliteServiceFocus.displayName = 'GeoSatelliteServiceFocus';

const SymbolicServiceArc = React.memo<{
  spec: SymbolicArcSpec;
  origin: SymbolicEndpoint;
  destination: SymbolicEndpoint;
  focusedSegmentId: CommercialRouteSegmentId | null;
  sizeScale: number;
}>(({ spec, origin, destination, focusedSegmentId, sizeScale }) => {
  const originLat = origin.coord.lat;
  const originLng = origin.coord.lng;
  const destinationLat = destination.coord.lat;
  const destinationLng = destination.coord.lng;
  const positions = useMemo(() => (
    buildSymbolicArcPositions(
      { lat: originLat, lng: originLng },
      { lat: destinationLat, lng: destinationLng },
      spec.technology,
      0,
    )
  ), [destinationLat, destinationLng, originLat, originLng, spec.technology]);

  // Position key — changes whenever either endpoint coordinate changes.
  // Used in entity keys so Resium is forced to remount (remove + create)
  // the Cesium entities rather than updating them in place, which avoids
  // a Cesium ConstantProperty caching issue where polyline geometry is not
  // rebuilt when the positions array reference changes.
  const posKey = useMemo(
    () => `${originLat.toFixed(4)},${originLng.toFixed(4)}-${destinationLat.toFixed(4)},${destinationLng.toFixed(4)}`,
    [destinationLat, destinationLng, originLat, originLng],
  );
  const entityPosKey = useMemo(() => entitySafeSignature(posKey), [posKey]);

  const color = useMemo(() => arcAccentColor(spec, focusedSegmentId), [focusedSegmentId, spec]);
  const hasTransmission = spec.status === 'active' || spec.status === 'limited';
  const isConclusionFocus = !focusedSegmentId || focusedSegmentId === 'summary';

  const material = useMemo(() => {
    const alpha = arcAlpha(focusedSegmentId);
    return new PolylineGlowMaterialProperty({
      color: new CallbackProperty((time?: JulianDate) => {
        if (!isConclusionFocus || !hasTransmission) return color.withAlpha(alpha);
        const seconds = time ? JulianDate.secondsDifference(time, FLOW_EPOCH) : Date.now() / 1000;
        const pulse = 0.84 + 0.16 * Math.sin(seconds * Math.PI * 1.35);
        return color.withAlpha(alpha * pulse);
      }, false),
      glowPower: isConclusionFocus ? 0.34 : 0.26,
      taperPower: 0.55,
    });
  }, [color, focusedSegmentId, hasTransmission, isConclusionFocus]);
  const haloMaterial = useMemo(() => (
    new PolylineGlowMaterialProperty({
      color: Color.WHITE.withAlpha(hasTransmission ? (isConclusionFocus ? 0.34 : 0.28) : 0.16),
      glowPower: isConclusionFocus ? 0.34 : 0.28,
      taperPower: 0.5,
    })
  ), [hasTransmission, isConclusionFocus]);
  const flowAlpha = useMemo(() => {
    if (!focusedSegmentId || focusedSegmentId === 'summary') return 1;
    if (focusedSegmentId === 'satellite') return 0.95;
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
  routeHeroMode = false,
}) => {
  const { origin, destination } = useMemo(() => resolveEndpoints(routeModel), [routeModel]);
  const arcSpecs = useMemo(() => buildArcSpecs(routeModel), [routeModel]);
  const effectiveFocusedSegmentId = routeModel.focusedSegmentId ?? (routeHeroMode ? 'summary' : null);
  const isSatelliteFocus = routeModel.focusedSegmentId === 'satellite';
  const showGeoSatelliteFocus = routeModel.technology === 'GEO' && (isSatelliteFocus || routeHeroMode);
  const leoServingTopology = useMemo(
    () => resolveLeoServingTopology(routeModel, origin, destination),
    [destination, origin, routeModel],
  );
  const showLeoSatelliteFocus = routeModel.technology === 'LEO'
    && isSatelliteFocus
    && leoServingTopology.satellites.length > 0;
  const skyBridgeNodes = useMemo(() => resolveSkyBridgeNodes(routeModel), [routeModel]);
  const expectedArcEntityIds = useMemo(
    () => (
      showGeoSatelliteFocus
        ? expectedGeoSatelliteFocusEntityIds(origin, destination, skyBridgeNodes.primary)
        : showLeoSatelliteFocus
          ? expectedLeoSatelliteFocusEntityIds(leoServingTopology)
        : expectedSymbolicArcEntityIds(origin, destination, arcSpecs)
    ),
    [arcSpecs, destination, leoServingTopology, origin, showGeoSatelliteFocus, showLeoSatelliteFocus, skyBridgeNodes.primary],
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
      {destination && routeSignature && !showGeoSatelliteFocus && !showLeoSatelliteFocus && arcSpecs.map((spec) => (
        <SymbolicServiceArc
          key={`${spec.id}-${routeSignature}`}
          spec={spec}
          origin={origin}
          destination={destination}
          focusedSegmentId={effectiveFocusedSegmentId}
          sizeScale={sizeScale}
        />
      ))}
      {destination && routeSignature && showGeoSatelliteFocus && arcSpecs.map((spec) => (
        <GeoSatelliteServiceFocus
          key={`geo-focus-${spec.id}-${routeSignature}`}
          spec={spec}
          origin={origin}
          destination={destination}
          skyBridge={skyBridgeNodes.primary}
          sizeScale={sizeScale}
        />
      ))}
      {showLeoSatelliteFocus && (
        <LeoSatelliteServiceFocus
          key={`leo-focus-${routeSignature ?? originSignature}-${leoServingTopology.satellites.map((satellite) => satellite.key).join('-')}`}
          topology={leoServingTopology}
          sizeScale={sizeScale}
        />
      )}
      {effectiveFocusedSegmentId === 'access' && (
        <RadioWaveBeacon
          key={`access-signal-${originSignature}`}
          endpoint={origin}
          direction="transmit"
          sizeScale={sizeScale}
        />
      )}
      {effectiveFocusedSegmentId === 'destination' && destination && destinationSignature && (
        <>
          <DestinationArrivalMoment
            key={`destination-arrival-${routeSignature}`}
            origin={origin}
            destination={destination}
            technology={routeModel.technology}
            sizeScale={sizeScale}
          />
          <RadioWaveBeacon
            key={`destination-signal-${destinationSignature}`}
            endpoint={destination}
            direction="receive"
            sizeScale={sizeScale}
          />
        </>
      )}
      {/* Origin marker — always shown when origin is known */}
      <SymbolicEndpointMarker
        key={`origin-${originSignature}`}
        endpoint={origin}
        focusedSegmentId={effectiveFocusedSegmentId}
        cameraMetricsRef={cameraMetricsRef}
        sizeScale={sizeScale}
      />
      {/* Destination marker — shown only when position is known */}
      {destination && destinationSignature && (
        <SymbolicEndpointMarker
          key={`destination-${destinationSignature}`}
          endpoint={destination}
          focusedSegmentId={effectiveFocusedSegmentId}
          cameraMetricsRef={cameraMetricsRef}
          sizeScale={sizeScale}
        />
      )}
    </>
  );
};

export default React.memo(CommercialSymbolicConnectivityLayer);
