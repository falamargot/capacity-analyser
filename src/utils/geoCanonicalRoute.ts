/**
 * THE canonical GEO route resolution boundary.
 *
 * Given a resolved scenario (coverages, gateway selection, terminals, modems,
 * weather), this produces the ONE route object every GEO surface reads:
 *
 *   scenario inputs → P.618 site fades → dual-segment RF budget (both service
 *   directions) → network layer → directional modem ceiling → GeoCanonicalRoute
 *
 * ENG (`useEngineeringAnalysis`) and COMM (`buildGeoRouteAnalysisViewModel`) both
 * call `resolveCanonicalGeoRoute`. Neither builds a `DualSegmentResult`, computes a
 * site fade, or decides which modem bounds which direction on its own any more.
 *
 * The two surfaces may still be handed DIFFERENT scenarios — COMM's decision support
 * deliberately evaluates the full analytical satellite set while ENG follows the
 * header scope — but for one scenario they now produce byte-identical routes,
 * because there is exactly one implementation.
 *
 * Both service directions are ALWAYS resolved when the scenario supports them,
 * including the companion STAR direction that is not currently on screen. A
 * direction that cannot be resolved stays null; it is never inferred from the other.
 */

import type { CandidateCoverage } from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import type { SatelliteData } from '../types/satellites';
import type { TerminalType, WeatherType } from '../components/capacity/terminalAssumptions';
import {
  buildMeshResult,
  buildStarForwardResult,
  buildStarReturnResult,
  type DualSegmentResult,
  type GeoRoutePhysicalOptions,
} from './geoDualSegmentBudget';
import type { GeoBand } from './geoLinkBudget';
import { estimateP618PlanningAttenuation } from './geoPhysicalAssumptions';
import { resolveStarGatewayFeederCandidate } from './geoTopologySelection';
import { getGeoModemProfile, type GeoModemId } from './geoModemCatalogue';
import type { TerminalRFClassId, TerminalRFCustomParams } from './geoTerminalRFModel';
import type { StarTrafficGatewaySelection } from './geoConnectivityModel';
import {
  activeGeoServiceDirection,
  resolveGeoRouteDelivery,
  type GeoRouteDelivery,
  type GeoServiceDirection,
} from './geoDeliveryChain';

export interface GeoCanonicalRouteInput {
  linkMode: LinkMode;
  /** Presentation tab. Only selects which resolved direction is "active"; never changes physics. */
  activeMeshTab?: 'forward' | 'reverse';
  activePoint: { lat: number; lng: number } | null;
  pointB: { lat: number; lng: number } | null;

  /** Site A / Site B coverages, already resolved by the caller's selection policy. */
  uplinkAtUser: CandidateCoverage | null;
  downlinkAtUser: CandidateCoverage | null;
  uplinkAtB: CandidateCoverage | null;
  downlinkAtB: CandidateCoverage | null;

  /** STAR feeder resolution inputs. */
  starGatewaySelection: StarTrafficGatewaySelection | null;
  candidateCoveragesAtGateway: CandidateCoverage[];
  /** Fallback feeder candidates when the serving satellite cannot be identified. */
  uplinkAtGateway?: CandidateCoverage | null;
  downlinkAtGateway?: CandidateCoverage | null;
  satellites: SatelliteData[];

  geoTerminalType: TerminalType;
  geoTerminalTypeB?: TerminalType;
  geoRFClassIdA?: TerminalRFClassId | null;
  geoRFClassIdB?: TerminalRFClassId | null;
  geoRFCustomParamsA?: TerminalRFCustomParams | null;
  geoRFCustomParamsB?: TerminalRFCustomParams | null;
  geoModemIdA?: GeoModemId | null;
  geoModemIdB?: GeoModemId | null;

  weatherType: WeatherType;
  weatherTypeB?: WeatherType;

  pointALabel?: string;
  pointBLabel?: string;
}

export interface GeoCanonicalRoute {
  linkMode: LinkMode;
  /** Result modelling the FORWARD (download) direction: MESH A→B, STAR hub→remote. */
  forwardResult: DualSegmentResult | null;
  /** Result modelling the REVERSE (upload) direction: MESH B→A, STAR remote→hub. */
  reverseResult: DualSegmentResult | null;
  /**
   * The result the currently selected topology/tab presents. For MESH this is the
   * single mesh result either way; for STAR it is the selected direction's result.
   */
  activeResult: DualSegmentResult | null;
  /** The single active-direction rule, applied once here. */
  activeDirection: GeoServiceDirection;
  /** Modem-limited delivery for BOTH directions. */
  delivery: GeoRouteDelivery;
}

const isSiteToSite = (linkMode: LinkMode): boolean =>
  linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';

const isStar = (linkMode: LinkMode): boolean =>
  linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN';

const elevationOf = (
  primary: CandidateCoverage | null,
  fallback: CandidateCoverage | null,
): number => primary?.elevation ?? fallback?.elevation ?? 30;

/**
 * Site fades are a property of the SITE and the RF direction, never of the UI.
 * Site B's uplink fade is its uplink fade whatever tab is open — the previous COMM
 * copy picked this direction from `activeMeshTab`, so switching the inspector tab
 * silently changed Site B's modeled attenuation.
 */
function buildEndpointWeatherAdjDb(
  input: GeoCanonicalRouteInput,
  band: GeoBand,
): NonNullable<GeoRoutePhysicalOptions['endpointWeatherAdjDb']> {
  const latA = input.activePoint?.lat ?? 0;
  const latB = input.pointB?.lat ?? latA;
  const weatherB = input.weatherTypeB ?? input.weatherType;
  return {
    a: {
      uplink: estimateP618PlanningAttenuation({
        band,
        direction: 'uplink',
        latitudeDeg: latA,
        elevationDeg: elevationOf(input.uplinkAtUser, input.downlinkAtUser),
        weatherType: input.weatherType,
      }).excessLossDb,
      downlink: estimateP618PlanningAttenuation({
        band,
        direction: 'downlink',
        latitudeDeg: latA,
        elevationDeg: elevationOf(input.downlinkAtUser, input.uplinkAtUser),
        weatherType: input.weatherType,
      }).excessLossDb,
    },
    b: {
      uplink: estimateP618PlanningAttenuation({
        band,
        direction: 'uplink',
        latitudeDeg: latB,
        elevationDeg: elevationOf(input.uplinkAtB, input.downlinkAtB),
        weatherType: weatherB,
      }).excessLossDb,
      downlink: estimateP618PlanningAttenuation({
        band,
        direction: 'downlink',
        latitudeDeg: latB,
        elevationDeg: elevationOf(input.downlinkAtB, input.uplinkAtB),
        weatherType: weatherB,
      }).excessLossDb,
    },
  };
}

function gatewayFadeDb(
  input: GeoCanonicalRouteInput,
  band: GeoBand,
  direction: 'uplink' | 'downlink',
): number {
  return estimateP618PlanningAttenuation({
    band,
    direction,
    latitudeDeg: input.starGatewaySelection?.gateway.lat ?? 0,
    elevationDeg: input.candidateCoveragesAtGateway[0]?.elevation ?? 30,
    weatherType: input.weatherTypeB ?? input.weatherType,
  }).excessLossDb;
}

function resolveFeeder(
  input: GeoCanonicalRouteInput,
  reference: CandidateCoverage,
  linkMode: 'STAR_FORWARD' | 'STAR_RETURN',
): CandidateCoverage | null {
  const gatewaySelection = input.starGatewaySelection;
  if (!gatewaySelection) return null;
  const satellite = input.satellites.find((entry) => entry.id === reference.satelliteId) ?? null;
  if (!satellite) {
    return (linkMode === 'STAR_FORWARD' ? input.uplinkAtGateway : input.downlinkAtGateway) ?? null;
  }
  return resolveStarGatewayFeederCandidate({
    reference,
    gatewayPool: input.candidateCoveragesAtGateway,
    satellite,
    gateway: gatewaySelection.gateway,
    linkMode,
  }).candidate ?? null;
}

/**
 * Resolves the canonical GEO route for a scenario.
 *
 * STAR routes are only constructed for STAR topologies — a MESH scenario that happens
 * to also have a served STAR gateway does not pay for two STAR link budgets it would
 * immediately discard.
 */
export function resolveCanonicalGeoRoute(input: GeoCanonicalRouteInput): GeoCanonicalRoute | null {
  const { linkMode } = input;
  const modemA = getGeoModemProfile(input.geoModemIdA);
  const modemB = getGeoModemProfile(input.geoModemIdB);
  const activeDirection = activeGeoServiceDirection(linkMode, input.activeMeshTab);

  const band = (
    input.downlinkAtUser?.band
    ?? input.uplinkAtUser?.band
    ?? input.uplinkAtB?.band
    ?? input.downlinkAtB?.band
    ?? 'Ku'
  ) as GeoBand;

  let forwardResult: DualSegmentResult | null = null;
  let reverseResult: DualSegmentResult | null = null;

  if (isStar(linkMode)) {
    const gatewaySelection = input.starGatewaySelection;
    if (!gatewaySelection) return null;

    const terminalKeyA = input.geoRFClassIdA ?? input.geoTerminalType;
    const basePhysicalOptions = { modemA, modemB, planningScenario: 'nominal' as const };

    // Outbound: gateway uplink → satellite → customer downlink.
    if (input.downlinkAtUser) {
      const feederUplink = resolveFeeder(input, input.downlinkAtUser, 'STAR_FORWARD');
      if (feederUplink) {
        forwardResult = buildStarForwardResult(
          input.downlinkAtUser,
          feederUplink,
          gatewaySelection.trafficCapability,
          input.pointALabel,
          estimateP618PlanningAttenuation({
            band,
            direction: 'downlink',
            latitudeDeg: input.activePoint?.lat ?? 0,
            elevationDeg: elevationOf(input.downlinkAtUser, input.uplinkAtUser),
            weatherType: input.weatherType,
          }).excessLossDb,
          input.geoRFClassIdA ?? undefined,
          input.geoRFCustomParamsA,
          gatewaySelection.gateway.name,
          { ...basePhysicalOptions, gatewayWeatherAdjDb: gatewayFadeDb(input, band, 'uplink') },
        );
      }
    }

    // Return: customer uplink → satellite → gateway downlink.
    if (input.uplinkAtUser) {
      const feederDownlink = resolveFeeder(input, input.uplinkAtUser, 'STAR_RETURN');
      if (feederDownlink) {
        reverseResult = buildStarReturnResult(
          input.uplinkAtUser,
          feederDownlink,
          gatewaySelection.trafficCapability,
          input.pointALabel,
          estimateP618PlanningAttenuation({
            band,
            direction: 'uplink',
            latitudeDeg: input.activePoint?.lat ?? 0,
            elevationDeg: elevationOf(input.uplinkAtUser, input.downlinkAtUser),
            weatherType: input.weatherType,
          }).excessLossDb,
          terminalKeyA,
          input.geoRFCustomParamsA,
          gatewaySelection.gateway.name,
          { ...basePhysicalOptions, gatewayWeatherAdjDb: gatewayFadeDb(input, band, 'downlink') },
        );
      }
    }
  } else if (isSiteToSite(linkMode)) {
    const { uplinkAtUser, downlinkAtUser, uplinkAtB, downlinkAtB } = input;
    if (!uplinkAtUser || !downlinkAtUser || !uplinkAtB || !downlinkAtB) return null;

    const meshResult = buildMeshResult(
      uplinkAtUser,
      downlinkAtB,
      uplinkAtB,
      downlinkAtUser,
      { pointA: input.pointALabel, pointB: input.pointBLabel },
      input.geoRFClassIdA ?? input.geoTerminalType,
      input.geoRFClassIdB ?? input.geoTerminalTypeB ?? input.geoTerminalType,
      undefined,
      undefined,
      input.geoRFCustomParamsA,
      input.geoRFCustomParamsB,
      linkMode,
      {
        modemA,
        modemB,
        planningScenario: 'nominal',
        endpointWeatherAdjDb: buildEndpointWeatherAdjDb(input, band),
      },
    );
    // A mesh result carries A→B in `.forward` and B→A in `.reverse`, so the same
    // object models both service directions.
    forwardResult = meshResult;
    reverseResult = meshResult;
  } else {
    return null;
  }

  if (!forwardResult && !reverseResult) return null;

  return {
    linkMode,
    forwardResult,
    reverseResult,
    activeResult: activeDirection === 'reverse' ? reverseResult : forwardResult,
    activeDirection,
    delivery: resolveGeoRouteDelivery({ linkMode, forwardResult, reverseResult, modemA, modemB }),
  };
}
