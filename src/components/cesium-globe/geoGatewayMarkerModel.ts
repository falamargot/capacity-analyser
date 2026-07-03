import {
  GEO_GATEWAYS,
  getGroundSiteById,
  getGroundSiteByPublicCode,
  type CapabilityConfidence,
  type GeoGatewayData,
  type GroundCapabilityKind,
  type TrafficEligibility,
} from '../globe/GlobeConfig';

export type GeoGatewayRenderMode = 'engineering' | 'commercial';

export type GeoGatewayMarkerKind =
  | 'TRAFFIC_TELEPORT'
  | 'SATELLITE_CONTROL'
  | 'MONITORING'
  | 'TTC'
  | 'GROUND_SITE';

export interface GeoGatewayMarkerMetadata {
  siteId: string;
  publicCode: string;
  capabilityKinds: GroundCapabilityKind[];
  capabilityLabels: string[];
  markerKind: GeoGatewayMarkerKind;
  markerColorCss: string;
  outlineColorCss: string;
  outlineWidth: number;
  trafficConfidence: CapabilityConfidence | null;
  trafficEligibility: TrafficEligibility | null;
  isTrafficEligible: boolean;
  hasControlCapability: boolean;
}

export const CAPABILITY_LABELS: Record<GroundCapabilityKind, string> = {
  SATELLITE_CONTROL: 'SCC',
  TTC: 'TT&C',
  MONITORING: 'Monitoring',
  TRAFFIC_TELEPORT: 'Traffic Teleport',
  NETWORK_BACKHAUL: 'Network Backhaul',
};

export const MARKER_STYLE: Record<GeoGatewayMarkerKind, { fill: string; outline: string }> = {
  TRAFFIC_TELEPORT: { fill: '#22d3ee', outline: '#0891b2' },
  SATELLITE_CONTROL: { fill: '#a78bfa', outline: '#7c3aed' },
  MONITORING: { fill: '#f59e0b', outline: '#b45309' },
  TTC: { fill: '#34d399', outline: '#059669' },
  GROUND_SITE: { fill: '#94a3b8', outline: '#475569' },
};

const markerKindFromCapabilities = (capabilityKinds: GroundCapabilityKind[]): GeoGatewayMarkerKind => {
  if (capabilityKinds.includes('TRAFFIC_TELEPORT')) return 'TRAFFIC_TELEPORT';
  if (capabilityKinds.includes('MONITORING')) return 'MONITORING';
  if (capabilityKinds.includes('TTC')) return 'TTC';
  if (capabilityKinds.includes('SATELLITE_CONTROL')) return 'SATELLITE_CONTROL';
  return 'GROUND_SITE';
};

export const buildGeoGatewayMarkerMetadata = (gateway: GeoGatewayData): GeoGatewayMarkerMetadata => {
  const site = getGroundSiteById(gateway.gateway_id) ?? getGroundSiteByPublicCode(gateway.teleportCode);
  const capabilities = site?.capabilities ?? [];
  const capabilityKinds = capabilities.map((capability) => capability.kind);
  const markerKind = markerKindFromCapabilities(capabilityKinds);
  const trafficCapability = capabilities.find((capability) => capability.kind === 'TRAFFIC_TELEPORT');
  const hasControlCapability = capabilityKinds.includes('SATELLITE_CONTROL');
  const style = MARKER_STYLE[markerKind];

  return {
    siteId: site?.siteId ?? gateway.gateway_id,
    publicCode: site?.publicCode ?? gateway.teleportCode,
    capabilityKinds,
    capabilityLabels: capabilityKinds.map((kind) => CAPABILITY_LABELS[kind]),
    markerKind,
    markerColorCss: style.fill,
    outlineColorCss: hasControlCapability ? MARKER_STYLE.SATELLITE_CONTROL.outline : style.outline,
    outlineWidth: hasControlCapability ? 3 : 2,
    trafficConfidence: trafficCapability?.confidence ?? null,
    trafficEligibility: trafficCapability?.trafficEligibility ?? null,
    isTrafficEligible: trafficCapability?.trafficEligibility === 'ELIGIBLE_CONFIRMED' ||
      trafficCapability?.trafficEligibility === 'ELIGIBLE_PUBLICLY_LIKELY',
    hasControlCapability,
  };
};

export const getGeoGatewaysForRendering = (
  allowedGatewayNames: Set<string> | null = null,
  renderMode: GeoGatewayRenderMode = 'engineering',
): GeoGatewayData[] => {
  const allowedGateways = allowedGatewayNames != null
    ? GEO_GATEWAYS.filter((gateway) => allowedGatewayNames.has(gateway.name))
    : GEO_GATEWAYS;

  if (renderMode !== 'commercial') return allowedGateways;

  return allowedGateways.filter((gateway) => buildGeoGatewayMarkerMetadata(gateway).isTrafficEligible);
};
