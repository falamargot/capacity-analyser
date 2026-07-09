import type { CandidateCoverage } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import { GEO_GATEWAYS, type GeoGatewayData } from '../components/globe/GlobeConfig';
import {
  resolveStarTrafficGatewayForCoverage,
  type StarTrafficGatewayResolution,
} from './geoConnectivityModel';
import { supportsStarTrafficTopology } from './geoGroundInfrastructure';
import type { LinkMode } from '../types/linkMode';

const canarySeen = new Set<string>();

/**
 * DEV-only observability: reports (once per distinct combination) the two
 * divergence classes the beam-aware routing work can produce, so their real-world
 * incidence is measurable instead of assumed:
 * - uplink and downlink coverage carrying different beam tokens at the same point
 *   (the precondition for direction-sensitive gateway resolution to matter), and
 * - the legacy per-satellite gateway disagreeing with the beam-aware gateway
 *   (the precondition for marker/latency/throughput desync across surfaces).
 * No-op in production builds.
 */
export const logStarGatewayCanaryDev = ({
  context,
  satelliteName,
  linkMode,
  legacyGatewayName,
  beamAwareGatewayName,
  downlinkBeamId,
  uplinkBeamId,
}: {
  context: string;
  satelliteName: string | null | undefined;
  linkMode: LinkMode;
  legacyGatewayName: string | null | undefined;
  beamAwareGatewayName: string | null | undefined;
  downlinkBeamId: string | null | undefined;
  uplinkBeamId: string | null | undefined;
}): void => {
  if (!import.meta.env.DEV) return;

  const beamTokensDiverge = !!downlinkBeamId && !!uplinkBeamId && downlinkBeamId !== uplinkBeamId;
  const gatewaysDiverge = !!legacyGatewayName && !!beamAwareGatewayName && legacyGatewayName !== beamAwareGatewayName;
  if (!beamTokensDiverge && !gatewaysDiverge) return;

  const key = [context, satelliteName, linkMode, downlinkBeamId, uplinkBeamId, legacyGatewayName, beamAwareGatewayName].join('|');
  if (canarySeen.has(key)) return;
  canarySeen.add(key);

  console.warn('[GEO Gateway Canary]', {
    context,
    satelliteName: satelliteName ?? 'unknown',
    linkMode,
    ...(beamTokensDiverge ? { beamTokensDiverge: { downlinkBeamId, uplinkBeamId } } : {}),
    ...(gatewaysDiverge ? { gatewaysDiverge: { legacyGatewayName, beamAwareGatewayName } } : {}),
  });
};

/**
 * STAR gateway resolution must follow the traffic direction: the Forward gateway
 * serves the user's downlink beam, the Return gateway serves the user's uplink
 * beam. Uplink and downlink contours are independent features and can carry
 * different beam tokens at the same location, so callers must never substitute
 * one direction's coverage for the other when resolving the gateway.
 */
export const pickStarGatewayReferenceCoverage = (
  linkMode: LinkMode,
  downlinkAtUser: CandidateCoverage | null | undefined,
  uplinkAtUser: CandidateCoverage | null | undefined,
): CandidateCoverage | null => {
  if (linkMode === 'STAR_FORWARD') return downlinkAtUser ?? null;
  if (linkMode === 'STAR_RETURN') return uplinkAtUser ?? null;
  return null;
};

export const resolveActiveStarTrafficGatewaySelection = ({
  linkMode,
  satellite,
  downlinkAtUser,
  uplinkAtUser,
  fallbackCoverage,
  gateways = GEO_GATEWAYS,
  failedGatewaySiteIds,
}: {
  linkMode: LinkMode;
  satellite: SatelliteData | null | undefined;
  downlinkAtUser: CandidateCoverage | null | undefined;
  uplinkAtUser: CandidateCoverage | null | undefined;
  fallbackCoverage: CandidateCoverage | null | undefined;
  gateways?: GeoGatewayData[];
  failedGatewaySiteIds?: ReadonlySet<string>;
}): StarTrafficGatewayResolution | null => {
  if (!satellite || (linkMode !== 'STAR_FORWARD' && linkMode !== 'STAR_RETURN')) return null;
  if (!supportsStarTrafficTopology(satellite)) return null;

  const gatewayReferenceCoverage = pickStarGatewayReferenceCoverage(linkMode, downlinkAtUser, uplinkAtUser);

  return resolveStarTrafficGatewayForCoverage(
    satellite,
    gatewayReferenceCoverage ?? fallbackCoverage,
    gateways,
    { failedGatewaySiteIds }
  );
};
