import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type {
  CommercialCustomerServiceState,
  CommercialRouteSegment,
  CommercialScenarioViewModel,
  CommercialTechnologyOption,
} from './commercialViewModel';

export interface CommercialNarrativeFact {
  label: string;
  value: string;
}

export interface CommercialNarrativeCardModel {
  segmentId: CommercialRouteSegmentId;
  stepNumber: number;
  stepTotal: number;
  eyebrow: string;
  title: string;
  statusLabel: string;
  statusTone: 'good' | 'warning' | 'danger' | 'neutral';
  narrativeStatement: string;
  facts: CommercialNarrativeFact[];
  businessNote: string;
}

const segmentOrder: CommercialRouteSegmentId[] = ['access', 'satellite', 'destination', 'summary'];

const segmentTitles: Record<CommercialRouteSegmentId, string> = {
  access: 'Origin Site',
  satellite: 'Space Coverage',
  backhaul: 'Network Transit',
  destination: 'Service Delivery',
  summary: 'Recommendation',
};

const customerStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Connected',
  limited: 'At Risk',
  degraded: 'At Risk',
  alternative_available: 'Alternative',
  unavailable: 'Unavailable',
};

const accessStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Site Ready',
  limited: 'Site At Risk',
  degraded: 'Site At Risk',
  alternative_available: 'Alternative Available',
  unavailable: 'Cannot Connect',
};

const satelliteCoverageStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Covered',
  limited: 'Coverage Limited',
  degraded: 'Coverage At Risk',
  alternative_available: 'Partial Coverage',
  unavailable: 'Not Covered',
};

const satelliteServingStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Coverage Confirmed',
  limited: 'Coverage Limited',
  degraded: 'Coverage At Risk',
  alternative_available: 'Partial Coverage',
  unavailable: 'No Coverage',
};

const destinationStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Delivered',
  limited: 'Partial',
  degraded: 'At Risk',
  alternative_available: 'Partial',
  unavailable: 'Unavailable',
};

function canonicalSegmentId(type: CommercialRouteSegment['type']): CommercialRouteSegmentId {
  switch (type) {
    case 'access':
      return 'access';
    case 'satellite':
      return 'satellite';
    case 'backhaul':
      return 'backhaul';
    case 'destination':
      return 'destination';
    case 'summary':
      return 'summary';
  }
}

function canonicalSegmentIdFromRaw(value: string | undefined | null): CommercialRouteSegmentId | undefined {
  switch (value) {
    case 'access':
      return 'access';
    case 'satellite':
      return 'satellite';
    case 'backhaul':
      return 'summary';
    case 'destination':
    case 'siteB':
      return 'destination';
    case 'summary':
      return 'summary';
    default:
      return undefined;
  }
}

function visibleSegmentId(segmentId: CommercialRouteSegmentId): CommercialRouteSegmentId {
  return segmentId === 'backhaul' ? 'summary' : segmentId;
}

function segmentForId(
  viewModel: CommercialScenarioViewModel,
  segmentId: CommercialRouteSegmentId,
): CommercialRouteSegment | undefined {
  return viewModel.routeSegments.find((segment) => canonicalSegmentId(segment.type) === segmentId);
}

function clean(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '--') return undefined;
  return trimmed;
}

function compactFacts(facts: Array<{ label: string; value?: string | null }>, max = 3): CommercialNarrativeFact[] {
  const seen = new Set<string>();
  const result: CommercialNarrativeFact[] = [];

  facts.forEach((fact) => {
    const value = clean(fact.value);
    if (!value) return;
    const key = `${fact.label}:${value}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ label: fact.label, value });
  });

  return result.slice(0, max);
}

function statusTone(segment: CommercialRouteSegment | undefined): CommercialNarrativeCardModel['statusTone'] {
  if (!segment) return 'neutral';
  if (segment.customerStatus === 'available') return 'good';
  if (segment.customerStatus === 'unavailable') return 'danger';
  if (segment.customerStatus === 'limited' || segment.customerStatus === 'degraded') return 'warning';
  return 'neutral';
}

function selectedConstraint(
  segment: CommercialRouteSegment | undefined,
  viewModel: CommercialScenarioViewModel,
): string | undefined {
  if (segment?.isRouteParticipant || segment?.status === 'healthy') {
    return clean(segment.limitation);
  }
  return clean(segment?.limitation) ?? clean(viewModel.primaryWarning);
}

function routeParticipantLabel(segment: CommercialRouteSegment | undefined): string {
  if (!segment) return 'Pending';
  if (segment.isRouteParticipant) return 'Confirmed';
  if (segment.status === 'blocked') return 'Not available';
  if (segment.status === 'unknown') return 'Pending confirmation';
  return customerStateLabel[segment.customerStatus];
}

function nodeLabelsForSegment(
  routeModel: CommercialRouteModel | undefined,
  segmentId: CommercialRouteSegmentId,
): string[] {
  if (!routeModel) return [];
  return routeModel.nodes
    .filter((node) => node.segmentId === segmentId)
    .map((node) => clean(node.label))
    .filter((value): value is string => value !== undefined);
}

function alternateOption(viewModel: CommercialScenarioViewModel): CommercialTechnologyOption | undefined {
  const recommended = viewModel.recommendation.technology;
  if (recommended !== 'leo' && recommended !== 'geo') return undefined;
  return viewModel.comparison.options.find((option) => option.technology !== recommended);
}

function gatewayLabel(routeModel: CommercialRouteModel | undefined): string | undefined {
  const hubs = nodeLabelsForSegment(routeModel, 'backhaul');
  return hubs[0];
}

function backbonePathLabel(viewModel: CommercialScenarioViewModel, routeModel: CommercialRouteModel | undefined): string | undefined {
  const hubs = nodeLabelsForSegment(routeModel, 'backhaul');
  const routedHubs = hubs.length > 0 ? hubs.join(' -> ') : undefined;
  return clean(routedHubs)
    ?? clean([viewModel.display.snpA, viewModel.display.snpB].filter((value) => clean(value)).join(' -> '))
    ?? clean(viewModel.display.logicalPop)
    ?? clean(viewModel.display.routeValue);
}

function recommendedTechnologyLabel(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.recommendation.technology === 'leo') return 'LEO';
  if (viewModel.recommendation.technology === 'geo') return 'GEO';
  if (viewModel.recommendation.technology === 'hybrid') return 'Hybrid';
  if (viewModel.recommendation.technology === 'not_available') return 'No viable path';
  return 'Pending';
}

function businessNote(
  constraint: string | undefined,
  healthyMessage = 'No issue currently affects this part of the route.',
): string {
  if (!constraint) return healthyMessage;
  const normalized = constraint.toLowerCase();
  if (normalized.includes('regulatory') || normalized.includes('restricted')) {
    return 'Regulatory restrictions reduce availability in this area.';
  }
  if (normalized.includes('capacity') || normalized.includes('throughput') || normalized.includes('congest')) {
    return 'Available capacity is limited and may reduce service quality.';
  }
  if (normalized.includes('coverage') || normalized.includes('visibility') || normalized.includes('satellite')) {
    return 'Satellite visibility is currently the main limiting factor.';
  }
  if (normalized.includes('select') || normalized.includes('location') || normalized.includes('destination')) {
    return 'The route needs a complete customer endpoint before it can be presented commercially.';
  }
  if (normalized.includes('no active service') || normalized.includes('no active connectivity') || normalized.includes('no viable')) {
    return 'No commercial service path is currently available for this scenario.';
  }
  if (normalized.includes('weather')) {
    return 'Weather conditions may reduce service quality for this part of the path.';
  }
  if (normalized.includes('gateway') || normalized.includes('snp') || normalized.includes('backhaul') || normalized.includes('portal')) {
    return 'The terrestrial network path is the dependency to confirm for service continuity.';
  }
  return constraint;
}

function serviceOutcomeStatement(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.recommendation.technology === 'leo' || viewModel.recommendation.technology === 'geo') {
    return `${recommendedTechnologyLabel(viewModel)} is currently the preferred connectivity option.`;
  }
  if (viewModel.recommendation.technology === 'hybrid') {
    return 'Both connectivity options can support the customer outcome.';
  }
  if (viewModel.recommendation.technology === 'not_available') {
    return 'No commercial service path is currently available.';
  }
  return 'The commercial recommendation is waiting for route data.';
}

function destinationTitle(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.display.destinationEndpointKind === 'geo_gateway') return 'Gateway Destination';
  if (viewModel.siteB) return 'Customer Destination';
  return 'Receiving Site';
}

function destinationNarrativeStatement(
  viewModel: CommercialScenarioViewModel,
  segment: CommercialRouteSegment | undefined,
): string {
  const isGateway = viewModel.display.destinationEndpointKind === 'geo_gateway';
  if (segment?.customerStatus === 'available') {
    return isGateway
      ? 'Gateway reception is confirmed for this direction.'
      : 'Service reception is confirmed at the destination terminal.';
  }
  if (segment?.customerStatus === 'unavailable') {
    return isGateway
      ? 'The GEO gateway cannot currently receive or forward this service.'
      : 'The destination terminal cannot currently receive the selected service.';
  }
  return isGateway
    ? 'Gateway reception conditions are still being evaluated.'
    : 'Reception conditions are still being evaluated at the destination terminal.';
}

function destinationBottomLine(
  viewModel: CommercialScenarioViewModel,
  segment: CommercialRouteSegment | undefined,
  constraint: string | undefined,
): string {
  const isGateway = viewModel.display.destinationEndpointKind === 'geo_gateway';
  if (constraint && segment?.customerStatus === 'unavailable') return businessNote(constraint);
  if (segment?.customerStatus === 'available') {
    return isGateway
      ? 'The GEO gateway is ready to receive or forward the selected service.'
      : 'The destination terminal is receiving the selected service.';
  }
  if (segment?.customerStatus === 'unavailable') {
    return 'The destination terminal cannot currently receive the selected service.';
  }
  return 'Reception conditions are still being evaluated before the service can be presented commercially.';
}

export function buildCommercialNarrativeCardModel({
  viewModel,
  commercialRouteModel,
  selectedSegmentId,
}: {
  viewModel: CommercialScenarioViewModel;
  commercialRouteModel?: CommercialRouteModel;
  selectedSegmentId?: string;
}): CommercialNarrativeCardModel {
  const focusedSegmentId = visibleSegmentId(commercialRouteModel?.focusedSegmentId
    ?? canonicalSegmentIdFromRaw(selectedSegmentId)
    ?? canonicalSegmentIdFromRaw(viewModel.selectedSegmentId)
    ?? 'summary');
  const segment = segmentForId(viewModel, focusedSegmentId)
    ?? segmentForId(viewModel, 'summary')
    ?? viewModel.routeSegments[0];
  const title = segmentTitles[focusedSegmentId];
  const statusLabel = segment ? customerStateLabel[segment.customerStatus] : viewModel.executiveSummary.statusLabel;
  const constraint = selectedConstraint(segment, viewModel);

  switch (focusedSegmentId) {
    case 'access': {
      const siteName = clean(viewModel.siteA?.name) ?? segment?.role ?? 'the origin site';
      return {
        segmentId: focusedSegmentId,
        stepNumber: 1,
        stepTotal: segmentOrder.length,
        eyebrow: 'Origin Site',
        title,
        statusLabel: segment ? accessStateLabel[segment.customerStatus] : statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: segment?.isRouteParticipant
          ? `${siteName} is ready to connect to the satellite network.`
          : `${siteName} is waiting for connection confirmation.`,
        facts: compactFacts([
          { label: 'Location', value: clean(viewModel.siteA?.name) ?? segment?.role },
          { label: 'Signal verified', value: segment?.isRouteParticipant ? 'Confirmed' : 'Pending' },
          { label: 'Coverage confidence', value: segment?.isRouteParticipant ? 'High' : 'Pending' },
        ]),
        businessNote: businessNote(
          constraint,
          segment?.isRouteParticipant
            ? `${siteName} is confirmed as the service origin.`
            : 'Connection will confirm once the origin path is verified.',
        ),
      };
    }

    case 'satellite': {
      const satelliteName = clean(viewModel.display.satelliteName);
      const isGeoService = viewModel.commercialDisplayTechnology === 'GEO';
      const siteAName = clean(viewModel.siteA?.name) ?? 'your location';
      const siteBName = clean(viewModel.siteB?.name) ?? 'the destination';
      const satNameA = clean(viewModel.display.satelliteNameA) ?? satelliteName ?? 'Coverage satellite';
      const satNameB = clean(viewModel.display.satelliteNameB) ?? 'Coverage satellite';
      const contextFacts = isGeoService
        ? [
            { label: 'Serving satellite', value: satelliteName ?? segment?.summary },
            { label: `${siteAName} coverage`, value: segment?.isRouteParticipant ? 'Covered' : 'Pending' },
            { label: `${siteBName} coverage`, value: segment?.isRouteParticipant ? 'Covered' : 'Pending' },
          ]
        : [
            { label: `${siteAName} satellite`, value: satNameA },
            { label: `${siteBName} satellite`, value: satNameB },
            { label: 'Coverage status', value: segment?.isRouteParticipant ? 'Both sites covered' : 'Pending' },
          ];

      return {
        segmentId: focusedSegmentId,
        stepNumber: 2,
        stepTotal: segmentOrder.length,
        eyebrow: 'Space Coverage',
        title: 'Space Coverage',
        statusLabel: segment
          ? isGeoService
            ? satelliteCoverageStateLabel[segment.customerStatus]
            : satelliteServingStateLabel[segment.customerStatus]
          : statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: isGeoService
          ? segment?.isRouteParticipant
            ? `${satelliteName ?? 'The selected GEO satellite'} provides continuous coverage over both sites from geostationary orbit.`
            : 'Satellite coverage is not yet confirmed.'
          : segment?.isRouteParticipant
            ? `Two dedicated LEO satellites provide low-orbit coverage — one for ${siteAName}, one for ${siteBName}.`
            : 'Serving satellites are not yet confirmed.',
        facts: compactFacts(contextFacts),
        businessNote: businessNote(
          constraint,
          segment?.isRouteParticipant
            ? isGeoService
              ? 'Both sites are confirmed within the satellite coverage zone.'
              : 'Both sites have dedicated low-orbit satellite coverage.'
            : 'Coverage will confirm once satellite visibility is established.',
        ),
      };
    }

    case 'backhaul': {
      const isGeoGatewayRelevant = viewModel.commercialDisplayTechnology === 'GEO'
        && commercialRouteModel?.destinationIsPortal === true;
      const infrastructure = isGeoGatewayRelevant
        ? gatewayLabel(commercialRouteModel)
        : backbonePathLabel(viewModel, commercialRouteModel);

      return {
        segmentId: focusedSegmentId,
        stepNumber: 3,
        stepTotal: segmentOrder.length,
        eyebrow: 'Network Transit',
        title: 'Network Transit',
        statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: segment?.isRouteParticipant
          ? 'Traffic is routing through the confirmed network path.'
          : 'Network transit path is not yet confirmed.',
        facts: compactFacts([
          { label: isGeoGatewayRelevant ? 'Network gateway' : 'Network path', value: infrastructure },
          { label: 'Transit status', value: segment?.isRouteParticipant ? 'Confirmed' : 'Pending' },
          { label: 'Network node', value: clean(viewModel.display.logicalPop) ?? segment?.role },
        ]),
        businessNote: businessNote(constraint),
      };
    }

    case 'destination': {
      const isGateway = viewModel.display.destinationEndpointKind === 'geo_gateway';
      const destName = clean(viewModel.siteB?.name) ?? clean(viewModel.display.destinationLocation) ?? (isGateway ? 'the gateway' : 'the destination');
      return {
        segmentId: focusedSegmentId,
        stepNumber: 3,
        stepTotal: segmentOrder.length,
        eyebrow: 'Service Delivery',
        title: 'Service Delivery',
        statusLabel: segment ? destinationStateLabel[segment.customerStatus] : statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: destinationNarrativeStatement(viewModel, segment),
        facts: compactFacts([
          { label: 'Destination', value: destName },
          { label: 'Receive type', value: isGateway ? 'Network gateway' : 'Customer terminal' },
          { label: 'Signal', value: segment?.isRouteParticipant ? 'Confirmed' : 'Pending' },
          { label: 'End-to-end path', value: segment?.isRouteParticipant ? 'Verified' : 'Pending' },
        ]),
        businessNote: destinationBottomLine(viewModel, segment, constraint),
      };
    }

    case 'summary':
    default: {
      const alternative = alternateOption(viewModel);
      const backhaulSegment = segmentForId(viewModel, 'backhaul');
      const backhaulConstraint = selectedConstraint(backhaulSegment, viewModel);
      const summaryConstraint = constraint ?? backhaulConstraint;
      return {
        segmentId: 'summary',
        stepNumber: 4,
        stepTotal: segmentOrder.length,
        eyebrow: 'Recommendation',
        title: 'Recommendation',
        statusLabel: viewModel.executiveSummary.statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: serviceOutcomeStatement(viewModel),
        facts: compactFacts([
          { label: 'Recommended technology', value: recommendedTechnologyLabel(viewModel) },
          { label: 'Forecast confidence', value: viewModel.display.confidence ?? viewModel.display.confidenceNote },
          { label: 'Reason', value: viewModel.recommendation.reason },
          { label: 'Alternative', value: alternative ? `${alternative.label} — ${alternative.available ? 'available' : 'unavailable'}` : undefined },
        ], 4),
        businessNote: businessNote(summaryConstraint, viewModel.executiveSummary.expectedExperience),
      };
    }
  }
}
