import { describe, expect, it } from 'vitest';
import type { CommercialScenarioViewModel } from '../commercialTypes';
import { buildCommercialNarrativeCardModel } from '../commercialNarrativeModel';

function gatewayViewModel({
  confidence,
  limitation,
  available = true,
}: {
  confidence: string;
  limitation?: string;
  available?: boolean;
}): CommercialScenarioViewModel {
  return {
    scenarioName: 'GEO traffic gateway route',
    serviceStatus: available ? 'active' : 'blocked',
    technology: 'geo',
    commercialDisplayTechnology: 'GEO',
    contextTechnology: 'GEO',
    commercialIntent: { trafficDirection: 'BIDIRECTIONAL' },
    siteA: { name: 'Site A' },
    activeRouteAvailable: available,
    selectedSegmentId: 'siteB',
    primaryWarning: limitation,
    bottleneck: limitation,
    routeSegments: [
      {
        id: 'siteB',
        type: 'destination',
        title: 'Service Delivery',
        status: available ? 'healthy' : 'blocked',
        customerStatus: available ? 'available' : 'unavailable',
        role: 'Traffic Gateway',
        isRouteParticipant: available,
        limitation,
      },
      {
        id: 'summary',
        type: 'summary',
        title: 'Summary',
        status: available ? 'healthy' : 'blocked',
        customerStatus: available ? 'available' : 'unavailable',
        role: 'Service outcome',
        isRouteParticipant: available,
        limitation,
      },
    ],
    recommendation: {
      technology: available ? 'geo' : 'not_available',
      reasonCategory: available ? 'BEST_AVAILABILITY' : 'INSUFFICIENT_DATA',
      label: available ? 'GEO' : 'No viable path',
      chipLabel: available ? 'GEO' : 'None',
      reason: limitation ?? 'GEO route available',
      message: limitation ?? 'GEO route available',
      expectedExperience: limitation ?? 'GEO route available',
    },
    executiveSummary: {
      status: available ? 'available' : 'unavailable',
      statusLabel: available ? 'Connected' : 'Unavailable',
      recommendedTechnology: available ? 'GEO' : 'No viable path',
      expectedExperience: limitation ?? 'GEO route available',
      reason: limitation ?? 'GEO route available',
    },
    comparison: {
      options: [],
      recommendation: {
        technology: available ? 'geo' : 'not_available',
        reasonCategory: available ? 'BEST_AVAILABILITY' : 'INSUFFICIENT_DATA',
        label: available ? 'GEO' : 'No viable path',
        chipLabel: available ? 'GEO' : 'None',
        reason: limitation ?? 'GEO route available',
        message: limitation ?? 'GEO route available',
        expectedExperience: limitation ?? 'GEO route available',
      },
    },
    display: {
      serviceStatusLabel: available ? 'Connected' : 'Unavailable',
      destinationType: 'Traffic Gateway',
      destinationEndpointKind: 'geo_gateway',
      destinationLocation: available ? 'Rambouillet' : 'No commercial gateway resolved',
      destinationGatewayName: available ? 'Rambouillet' : '--',
      destinationGatewayConfidence: confidence,
      routeValue: 'Site->Sat->Traffic Gateway',
    },
  };
}

describe('commercial narrative gateway confidence', () => {
  it('presents PUBLICLY_LIKELY GEO gateways as reference/unconfirmed, not confirmed truth', () => {
    const card = buildCommercialNarrativeCardModel({
      viewModel: gatewayViewModel({ confidence: 'Reference / unconfirmed traffic gateway' }),
      selectedSegmentId: 'siteB',
    });

    expect(card.narrativeStatement).toContain('reference data');
    expect(card.narrativeStatement).toContain('Traffic gateway');
    expect(card.businessNote).toContain('reference / unconfirmed');
    expect(card.facts).toContainEqual({
      label: 'Signal',
      value: 'Reference / unconfirmed traffic gateway',
    });
    expect(card.facts).not.toContainEqual({ label: 'Signal', value: 'Confirmed' });
  });

  it('produces a safe narrative when no commercial gateway is resolved', () => {
    const card = buildCommercialNarrativeCardModel({
      viewModel: gatewayViewModel({
        confidence: 'No commercial gateway resolved',
        limitation: 'No commercial gateway resolved',
        available: false,
      }),
      selectedSegmentId: 'siteB',
    });

    expect(card.businessNote).toBe('No commercial gateway resolved for this service path.');
    expect(card.facts).toContainEqual({ label: 'Destination', value: 'No commercial gateway resolved' });
  });
});
