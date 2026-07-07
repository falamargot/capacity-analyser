import type { CandidateCoverage } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import { GEO_GATEWAYS, type GeoGatewayData } from '../components/globe/GlobeConfig';
import {
  resolveStarTrafficGatewayForCoverage,
  type StarTrafficGatewaySelection,
} from './geoConnectivityModel';
import { supportsStarTrafficTopology } from './geoGroundInfrastructure';
import type { LinkMode } from '../types/linkMode';

export const resolveActiveStarTrafficGatewaySelection = ({
  linkMode,
  satellite,
  downlinkAtUser,
  uplinkAtUser,
  fallbackCoverage,
  gateways = GEO_GATEWAYS,
}: {
  linkMode: LinkMode;
  satellite: SatelliteData | null | undefined;
  downlinkAtUser: CandidateCoverage | null | undefined;
  uplinkAtUser: CandidateCoverage | null | undefined;
  fallbackCoverage: CandidateCoverage | null | undefined;
  gateways?: GeoGatewayData[];
}): StarTrafficGatewaySelection | null => {
  if (!satellite || (linkMode !== 'STAR_FORWARD' && linkMode !== 'STAR_RETURN')) return null;
  if (!supportsStarTrafficTopology(satellite)) return null;

  const gatewayReferenceCoverage = linkMode === 'STAR_FORWARD'
    ? downlinkAtUser
    : uplinkAtUser;

  return resolveStarTrafficGatewayForCoverage(
    satellite,
    gatewayReferenceCoverage ?? fallbackCoverage,
    gateways
  );
};
