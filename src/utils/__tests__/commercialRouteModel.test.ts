import { describe, expect, it } from 'vitest';
import { GEO_GATEWAYS, type GeoGatewayData } from '../../components/globe/GlobeConfig';
import type { CommercialScenarioViewModel } from '../../components/commercial/commercialTypes';
import type { ResolvedGeoGateway } from '../geoConnectivityModel';
import { buildCommercialRouteModel } from '../commercialRouteModel';

function resolvedGateway(teleportCode: string, overrides: Partial<GeoGatewayData> = {}): ResolvedGeoGateway {
  const gateway = GEO_GATEWAYS.find((entry) => entry.teleportCode === teleportCode);
  if (!gateway) throw new Error(`Missing GEO gateway fixture: ${teleportCode}`);
  const resolvedGatewayData = { ...gateway, ...overrides };
  return {
    gatewayId: resolvedGatewayData.gateway_id,
    gatewayName: resolvedGatewayData.name,
    latitude: resolvedGatewayData.lat,
    longitude: resolvedGatewayData.lng,
    controlAssignmentRole: 'nominal',
    reason: 'test fixture',
    assignmentSource: 'reference-gateway-allocation',
    teleportCode: resolvedGatewayData.teleportCode,
    region: resolvedGatewayData.region,
    gateway: resolvedGatewayData,
    gatewayElevationDeg: 30,
    satToGatewayDistanceKm: 38000,
  };
}

function baseViewModel(destinationType = 'SNP'): CommercialScenarioViewModel {
  const segment = (id: string, type: CommercialScenarioViewModel['routeSegments'][number]['type']) => ({
    id,
    type,
    title: id,
    status: 'healthy' as const,
    customerStatus: 'available' as const,
    role: id,
    isRouteParticipant: true,
  });

  return {
    scenarioName: 'GEO commercial route',
    evaluationState: 'EVALUATED_AVAILABLE',
    serviceStatus: 'active',
    technology: 'geo',
    commercialDisplayTechnology: 'GEO',
    contextTechnology: 'GEO',
    commercialIntent: { trafficDirection: 'BIDIRECTIONAL' },
    siteA: { name: 'Site A' },
    siteB: destinationType === 'SNP' ? { name: 'Paris' } : { name: 'Site B' },
    activeRouteAvailable: true,
    routeSegments: [
      segment('access', 'access'),
      segment('satellite', 'satellite'),
      segment('backhaul', 'backhaul'),
      segment('siteB', 'destination'),
      segment('summary', 'summary'),
    ],
    recommendation: {
      technology: 'geo',
      reasonCategory: 'BEST_AVAILABILITY',
      label: 'GEO',
      chipLabel: 'GEO',
      reason: 'GEO route available',
      message: 'GEO route available',
      expectedExperience: 'GEO route available',
    },
    executiveSummary: {
      status: 'available',
      statusLabel: 'Connected',
      recommendedTechnology: 'GEO',
      expectedExperience: 'GEO route available',
      reason: 'GEO route available',
    },
    comparison: {
      options: [],
      recommendation: {
        technology: 'geo',
        reasonCategory: 'BEST_AVAILABILITY',
        label: 'GEO',
        chipLabel: 'GEO',
        reason: 'GEO route available',
        message: 'GEO route available',
        expectedExperience: 'GEO route available',
      },
    },
    display: {
      serviceStatusLabel: 'Connected',
      satelliteName: 'EUTELSAT Test',
      destinationType,
      destinationEndpointKind: destinationType === 'Gateway' ? 'geo_gateway' : 'customer',
      destinationGatewayConfidence: 'Reference / unconfirmed traffic gateway',
    },
  };
}

describe('commercialRouteModel GEO gateway safety', () => {
  it('includes a GEO STAR gateway only when it resolves to a traffic teleport capability', () => {
    const model = buildCommercialRouteModel(baseViewModel('SNP'), {
      activeAnalysisPoint: { lat: 48.85, lng: 2.35 },
      siteB: null,
      resolvedAutoGeoGateway: resolvedGateway('RAM'),
      resolvedSelectedGeoGateway: null,
      activeLeoRouteEvidence: null,
      geoRouteAnalysis: null,
      activeGeoSatellite: null,
    });

    const hub = model.nodes.find((node) => node.nodeType === 'HUB');
    expect(hub?.label).toBe('Rambouillet (reference / unconfirmed)');
    expect(hub?.meta?.groundCapabilityKind).toBe('TRAFFIC_TELEPORT');
    expect(hub?.meta?.capabilityConfidence).toBe('PUBLICLY_LIKELY');
    expect(hub?.meta?.isUnconfirmedReference).toBe(true);
  });

  it.each(['DUB', 'PER'] as const)('does not display %s as a commercial gateway', (teleportCode) => {
    const model = buildCommercialRouteModel(baseViewModel('SNP'), {
      activeAnalysisPoint: { lat: 48.85, lng: 2.35 },
      siteB: null,
      resolvedAutoGeoGateway: resolvedGateway(teleportCode),
      resolvedSelectedGeoGateway: null,
      activeLeoRouteEvidence: null,
      geoRouteAnalysis: null,
      activeGeoSatellite: null,
    });

    expect(model.nodes.some((node) => node.nodeType === 'HUB')).toBe(false);
    expect(model.edges.some((edge) => edge.fromNodeId.includes('HUB') || edge.toNodeId.includes('HUB'))).toBe(false);
  });

  it('omits the commercial gateway node when no eligible traffic capability exists', () => {
    const model = buildCommercialRouteModel(baseViewModel('SNP'), {
      activeAnalysisPoint: { lat: 48.85, lng: 2.35 },
      siteB: null,
      resolvedAutoGeoGateway: resolvedGateway('RAM', { trafficStatus: 'NOT_APPLICABLE' }),
      resolvedSelectedGeoGateway: null,
      activeLeoRouteEvidence: null,
      geoRouteAnalysis: null,
      activeGeoSatellite: null,
    });

    expect(model.nodes.some((node) => node.nodeType === 'HUB')).toBe(false);
  });

  it('keeps GEO point-to-point commercial routes free of gateway nodes', () => {
    const model = buildCommercialRouteModel(baseViewModel('Site B'), {
      activeAnalysisPoint: { lat: 48.85, lng: 2.35 },
      siteB: { lat: 40.71, lng: -74.01 },
      resolvedAutoGeoGateway: resolvedGateway('RAM'),
      resolvedSelectedGeoGateway: null,
      activeLeoRouteEvidence: null,
      geoRouteAnalysis: null,
      activeGeoSatellite: null,
    });

    expect(model.destinationIsPortal).toBe(false);
    expect(model.nodes.some((node) => node.nodeType === 'HUB')).toBe(false);
  });

  it('preserves mobile endpoint identity, altitude, labels, and route direction', () => {
    const model = buildCommercialRouteModel(baseViewModel('Site B'), {
      activeAnalysisPoint: { lat: 41.2, lng: -72.4, altitude: 11.6 },
      siteB: { lat: 43.2, lng: -82.95, altitude: 9.8 },
      originEndpointKind: 'aircraft',
      destinationEndpointKind: 'aircraft',
      originEndpointLabel: 'AAL1331',
      destinationEndpointLabel: 'AAL151',
      flowDirection: 'B_TO_A',
      resolvedAutoGeoGateway: null,
      resolvedSelectedGeoGateway: null,
      activeLeoRouteEvidence: null,
      geoRouteAnalysis: null,
      activeGeoSatellite: null,
    });

    const origin = model.nodes.find((node) => node.nodeType === 'ORIGIN');
    const destination = model.nodes.find((node) => node.nodeType === 'DESTINATION');
    expect(origin).toMatchObject({
      label: 'AAL1331',
      position: { altitudeKm: 11.6 },
      meta: { endpointKind: 'aircraft' },
    });
    expect(destination).toMatchObject({
      label: 'AAL151',
      position: { altitudeKm: 9.8 },
      meta: { endpointKind: 'aircraft' },
    });
    expect(model.flowDirection).toBe('B_TO_A');
  });
});
