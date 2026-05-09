export type LeoLinkDirection = 'downlink' | 'uplink';

export type LeoBottleneckFactor =
  | 'rf'
  | 'scan loss'
  | 'modcod'
  | 'terminal'
  | 'beam sharing'
  | 'backhaul'
  | 'handover'
  | 'regulatory'
  | 'service gate'
  | null;

export type LeoBottleneckScope = 'DL' | 'UL' | 'DL+UL' | 'none';

export interface LeoRfChainBreakdown {
  effectiveEirpDb: number;
  receiverGtDbK: number;
  rawTerminalRfDb: number;
  terminalScanLossDb: number;
  scanLossDb: number;
  weatherLossDb: number;
  fsplDb: number;
  cnDb: number;
  modcod: string | null;
  modcodTableId: string;
  modcodTableLabel: string;
  modcodTableSourceNote: string;
  slantRangeKm: number;
  referenceBandwidthHz: number;
  usableBandwidthHz: number;
  rfChainThroughputMbps: number;
}

export interface LeoNetworkLayerBreakdown {
  peakRfMbps: number;
  terminalCapMbps: number;
  activeUsers: number;
  beamSharingMbps: number;
  backhaulFactor: number;
  backhaulMbps: number;
  handoverFactor: number;
  handoverMbps: number;
  smoothingAlpha: number;
  finalUserMbps: number;
  bottleneck: LeoBottleneckFactor;
}

export interface LeoThroughputLeg {
  direction: LeoLinkDirection;
  label: string;
  rf: LeoRfChainBreakdown;
  network: LeoNetworkLayerBreakdown;
}

export interface LeoTerminalAssumptionSnapshot {
  id: string;
  label: string;
  terminalFamily: string;
  vendor: string;
  model: string;
  description: string;
  category: string;
  antennaType: 'PARABOLIC' | 'ESA';
  mobilityClass: string;
  maxDlMbps: number;
  maxUlMbps: number;
  rxGtDbK: number;
  txEirpDbw: number;
  rxScanLossModelLabel: string;
  txScanLossModelLabel: string;
  dlReferenceBandwidthHz: number;
  ulReferenceBandwidthHz: number;
  dlUsableBeamBandwidthHz: number;
  ulUsableBeamBandwidthHz: number;
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string;
  notes: string[];
  assumptions: string[];
  certificationStatus: string;
  supportedBands: string[];
}

export interface LeoThroughputResult {
  satelliteId: string;
  selectedBeamIndex: number;
  candidateBeamCount: number;
  normalizedDistance: number;
  userElevationDeg: number;
  snpElevationDeg: number | null;
  limitingElevationDeg: number;
  terminal: LeoTerminalAssumptionSnapshot;
  downlink: LeoThroughputLeg;
  uplink: LeoThroughputLeg;
  mainBottleneck: {
    factor: LeoBottleneckFactor;
    scope: LeoBottleneckScope;
    label: string;
  };
}
