import type { CommercialScenarioViewModel } from './commercialViewModel';

/**
 * Canonical topology descriptor for the commercial architecture diagrams.
 *
 * The diagrams used to render a hardcoded "SITE A -> SAT -> SITE B" chain
 * regardless of the real route, so they lied when the destination was a gateway,
 * an SNP portal, or absent (GEO single-point), or when a LEO route was single
 * site rather than site-to-site. This model is derived from the same canonical
 * view model that drives every other commercial surface, so the picture always
 * matches the resolved route.
 */
export type CommercialDestinationKind =
  | 'site' // a real customer Site B
  | 'gateway' // GEO traffic gateway
  | 'portal' // LEO single-site network/SNP portal
  | 'none'; // coverage at origin only, no destination resolved

export interface CommercialTopologyModel {
  technology: 'GEO' | 'LEO';
  originLabel: string;
  /** One satellite for GEO / LEO single-site, two for LEO site-to-site. */
  satelliteLabels: string[];
  /** LEO two-satellite backbone chain. */
  isSiteToSite: boolean;
  hasBackbone: boolean;
  destinationKind: CommercialDestinationKind;
  destinationLabel: string;
  routeAvailable: boolean;
}

const PLACEHOLDER = '--';

/** Treats the view model's "--" placeholder and blank strings as absent. */
function clean(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === PLACEHOLDER) return undefined;
  return trimmed;
}

export function buildCommercialTopology(viewModel: CommercialScenarioViewModel): CommercialTopologyModel {
  const technology = viewModel.commercialDisplayTechnology;
  const display = viewModel.display;
  const originLabel = clean(viewModel.siteA?.name) ?? 'Site A';
  const routeAvailable = viewModel.activeRouteAvailable;

  if (technology === 'GEO') {
    const satellite = clean(display.satelliteName) ?? clean(display.satelliteNameA) ?? 'GEO satellite';
    const isGateway = display.destinationEndpointKind === 'geo_gateway';
    const siteB = clean(viewModel.siteB?.name);
    const destinationKind: CommercialDestinationKind = isGateway ? 'gateway' : siteB ? 'site' : 'none';
    const destinationLabel = isGateway
      ? clean(display.destinationReceivingSide) ?? clean(display.destinationLocation) ?? 'Traffic gateway'
      : siteB ?? 'No destination';
    return {
      technology,
      originLabel,
      satelliteLabels: [satellite],
      isSiteToSite: false,
      hasBackbone: false,
      destinationKind,
      destinationLabel,
      routeAvailable,
    };
  }

  // LEO — two resolved serving satellites means a site-to-site backbone chain.
  const satA = clean(display.satelliteNameA) ?? clean(display.satelliteName) ?? 'LEO satellite';
  const satB = clean(display.satelliteNameB);
  const isSiteToSite = Boolean(satB);
  const siteB = clean(viewModel.siteB?.name);

  if (isSiteToSite) {
    const destinationKind: CommercialDestinationKind = siteB ? 'site' : 'none';
    return {
      technology,
      originLabel,
      satelliteLabels: [satA, satB as string],
      isSiteToSite: true,
      hasBackbone: true,
      destinationKind,
      destinationLabel: siteB ?? 'No destination',
      routeAvailable,
    };
  }

  // LEO single site — the endpoint is the selected SNP / network portal.
  const portal = clean(display.snpA) ?? clean(display.logicalPop) ?? siteB;
  return {
    technology,
    originLabel,
    satelliteLabels: [satA],
    isSiteToSite: false,
    hasBackbone: false,
    destinationKind: portal ? 'portal' : 'none',
    destinationLabel: portal ?? 'Network',
    routeAvailable,
  };
}
