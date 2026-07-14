import type { CandidateCoverage } from './analysis';
import type { LinkMode } from './linkMode';
import type { TerminalRFClassId, TerminalRFCustomParams } from '../utils/geoTerminalRFModel';
import type { TerminalType, WeatherType } from '../components/capacity/TerminalConfig';

export type EngineeringConfigureTechnology = 'GEO' | 'LEO';
export type EngineeringSelectionPolicy = 'auto' | 'manual';

export interface EngineeringConfigureLocation {
  label: string;
  lat: number;
  lng: number;
}

export interface EngineeringConfigureSite {
  location: EngineeringConfigureLocation | null;
  geoTerminalType: TerminalType;
  geoRFClassId: TerminalRFClassId;
  geoRFCustomParams: TerminalRFCustomParams | null;
  leoTerminalType: TerminalType;
  leoTerminalModelId: string;
  weatherType: WeatherType;
  autoWeatherEnabled: boolean;
}

export interface EngineeringConfigureDraft {
  technology: EngineeringConfigureTechnology;
  geoLinkMode: LinkMode;
  leoTopologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  direction: 'forward' | 'reverse';
  selectionPolicy: EngineeringSelectionPolicy;
  geoUplinkKeyA: string | null;
  geoDownlinkKeyA: string | null;
  geoUplinkKeyB: string | null;
  geoDownlinkKeyB: string | null;
  siteA: EngineeringConfigureSite;
  siteB: EngineeringConfigureSite;
}

export interface EngineeringConfigureCandidates {
  siteA: CandidateCoverage[];
  siteB: CandidateCoverage[];
  resolved?: {
    siteA: { uplink: CandidateCoverage | null; downlink: CandidateCoverage | null };
    siteB: { uplink: CandidateCoverage | null; downlink: CandidateCoverage | null };
  };
}
