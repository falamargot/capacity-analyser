export type LeoLinkDirection = 'downlink' | 'uplink';

export type LeoBottleneckFactor =
  | 'rf'
  | 'scan loss'
  | 'modcod'
  | 'terminal'
  | 'beam sharing'
  | 'feeder'
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
  /** Per-user share after the beam pool (public aggregate, RF-implied and Ka feeder bounds) is divided (Mbps). */
  beamSharingMbps: number;
  /**
   * Ka feeder capacity for the direction carrying this traffic (Mbps, L-O2);
   * null when no feeder model applied (no SNP).
   */
  feederCapacityMbps: number | null;
  /** Weakest-direction Ka feeder C/N margin (dB); null when no feeder model applied. */
  feederMarginDb: number | null;
  /** True when the feeder capacity — not RF or the public aggregate — bounded the beam pool. */
  feederLimited: boolean;
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
  notes: readonly string[];
  assumptions: readonly string[];
  certificationStatus: string;
  supportedBands: readonly string[];
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
