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
  access: 'Customer Access',
  satellite: 'Satellite Service',
  backhaul: 'Network Backbone',
  destination: 'Destination',
  summary: 'Service Outcome',
};

const customerStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Available',
  limited: 'Limited',
  degraded: 'Degraded',
  alternative_available: 'Alternative Available',
  unavailable: 'Unavailable',
};

const accessStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Access Confirmed',
  limited: 'Access Limited',
  degraded: 'Access Degraded',
  alternative_available: 'Alternate Access',
  unavailable: 'Access Unavailable',
};

const satelliteCoverageStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Coverage Confirmed',
  limited: 'Coverage Limited',
  degraded: 'Coverage Degraded',
  alternative_available: 'Alternate Coverage',
  unavailable: 'Coverage Unavailable',
};

const satelliteServingStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Service Confirmed',
  limited: 'Service Limited',
  degraded: 'Service Degraded',
  alternative_available: 'Alternate Service',
  unavailable: 'Service Unavailable',
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
    case 'access':
      return {
        segmentId: focusedSegmentId,
        stepNumber: 1,
        stepTotal: segmentOrder.length,
        eyebrow: 'Customer Access',
        title,
        statusLabel: segment ? accessStateLabel[segment.customerStatus] : statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: segment?.isRouteParticipant
          ? 'The origin site is ready to connect to the satellite network.'
          : 'The origin site is waiting for access confirmation.',
        facts: compactFacts([
          { label: 'Origin site identified', value: viewModel.siteA?.name ?? segment?.role ?? 'Confirmed' },
          { label: 'Access path available', value: routeParticipantLabel(segment) },
          { label: 'Signal can reach the network', value: segment?.isRouteParticipant ? 'Confirmed' : undefined },
        ]),
        businessNote: businessNote(
          constraint,
          segment?.isRouteParticipant
            ? 'Access is confirmed from the customer terminal.'
            : 'Access will confirm once the origin path is available.',
        ),
      };

    case 'satellite': {
      const satelliteName = clean(viewModel.display.satelliteName);
      const isGeoService = viewModel.commercialDisplayTechnology === 'GEO';
      const contextFacts = isGeoService
        ? [
            { label: 'Serving satellite', value: satelliteName ?? segment?.summary },
            { label: 'Uplink coverage', value: segment?.isRouteParticipant ? 'Site A covered' : undefined },
            { label: 'Downlink coverage', value: segment?.isRouteParticipant ? 'Site B covered' : undefined },
          ]
        : [
            { label: 'Site A satellite', value: clean(viewModel.display.satelliteNameA) ?? satelliteName ?? segment?.summary },
            { label: 'Site B satellite', value: clean(viewModel.display.satelliteNameB) ?? 'Serving LEO satellite' },
            { label: 'Endpoint access', value: segment?.isRouteParticipant ? 'Both sites served' : undefined },
          ];

      return {
        segmentId: focusedSegmentId,
        stepNumber: 2,
        stepTotal: segmentOrder.length,
        eyebrow: isGeoService ? 'Serving Satellite' : 'Serving Satellites',
        title: isGeoService ? 'Serving Satellite' : 'Serving Satellites',
        statusLabel: segment
          ? isGeoService
            ? satelliteCoverageStateLabel[segment.customerStatus]
            : satelliteServingStateLabel[segment.customerStatus]
          : statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: isGeoService
          ? segment?.isRouteParticipant
            ? 'This GEO satellite receives traffic from the origin site through its uplink coverage and delivers traffic to the destination site through its downlink coverage.'
            : 'Satellite coverage is not yet confirmed.'
          : segment?.isRouteParticipant
            ? 'Each endpoint is currently served by its own access satellite.'
            : 'The serving satellites are not yet confirmed.',
        facts: compactFacts(contextFacts),
        businessNote: businessNote(
          constraint,
          segment?.isRouteParticipant
            ? isGeoService
              ? 'One GEO satellite serves both customer locations.'
              : 'Two LEO satellites provide access service to the customer endpoints.'
            : 'Service will confirm once the serving satellite view is available.',
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
        title,
        statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: segment?.isRouteParticipant
          ? 'Traffic uses the selected network path.'
          : 'Network transit is not yet confirmed.',
        facts: compactFacts([
          { label: isGeoGatewayRelevant ? 'Gateway' : 'Infrastructure', value: infrastructure },
          { label: 'Transit', value: routeParticipantLabel(segment) },
          { label: 'Network', value: clean(viewModel.display.logicalPop) ?? segment?.role },
        ]),
        businessNote: businessNote(constraint),
      };
    }

    case 'destination':
      return {
        segmentId: focusedSegmentId,
        stepNumber: 3,
        stepTotal: segmentOrder.length,
        eyebrow: commercialRouteModel?.destinationIsPortal ? 'Network Exit' : 'Destination',
        title,
        statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: segment?.isRouteParticipant
          ? 'The destination can receive service.'
          : 'The destination is not yet confirmed.',
        facts: compactFacts([
          { label: 'Endpoint', value: viewModel.siteB?.name ?? segment?.summary },
          { label: 'Receiving side', value: viewModel.display.destinationType },
          { label: 'Reachability', value: routeParticipantLabel(segment) },
        ]),
        businessNote: businessNote(constraint),
      };

    case 'summary':
    default: {
      const alternative = alternateOption(viewModel);
      const backhaulSegment = segmentForId(viewModel, 'backhaul');
      const isGeoGatewayRelevant = viewModel.commercialDisplayTechnology === 'GEO'
        && commercialRouteModel?.destinationIsPortal === true;
      const infrastructure = isGeoGatewayRelevant
        ? gatewayLabel(commercialRouteModel)
        : backbonePathLabel(viewModel, commercialRouteModel);
      const backhaulConstraint = selectedConstraint(backhaulSegment, viewModel);
      const summaryConstraint = constraint ?? backhaulConstraint;
      return {
        segmentId: 'summary',
        stepNumber: 4,
        stepTotal: segmentOrder.length,
        eyebrow: 'Service Outcome',
        title,
        statusLabel: viewModel.executiveSummary.statusLabel,
        statusTone: statusTone(segment),
        narrativeStatement: serviceOutcomeStatement(viewModel),
        facts: compactFacts([
          { label: 'Preferred option', value: recommendedTechnologyLabel(viewModel) },
          { label: isGeoGatewayRelevant ? 'Gateway' : 'Network path', value: infrastructure },
          { label: 'Transit', value: routeParticipantLabel(backhaulSegment) },
          { label: 'Why it matters', value: viewModel.recommendation.reason },
          { label: 'Alternative', value: alternative ? `${alternative.label} ${alternative.available ? 'available' : alternative.statusLabel.toLowerCase()}` : undefined },
        ], 5),
        businessNote: businessNote(summaryConstraint, viewModel.executiveSummary.expectedExperience),
      };
    }
  }
}
