import type { TerminalType } from '../components/capacity/TerminalConfig';

export type LeoMobilityClass = 'fixed' | 'portable' | 'aero' | 'maritime';
export type LeoTerminalFamily = 'Fixed' | 'Land Mobility' | 'Maritime' | 'Aviation';
export type LeoAntennaType = 'PARABOLIC' | 'ESA';
export type LeoScanLossModel =
  | { type: 'NONE'; label: string; note: string }
  | { type: 'ESA_COSINE'; label: string; exponent: number; maxLossDb: number; note: string };

export interface LeoTerminalProfile {
  id: TerminalType;
  label: string;
  terminalFamily: LeoTerminalFamily;
  modelName: string;
  category: 'residential' | 'land-mobile' | 'aviation' | 'maritime';
  antennaType: LeoAntennaType;
  maxDlMbps: number;
  maxUlMbps: number;
  rxGtDbK: number;
  txEirpDbw: number;
  rxScanLossModel: LeoScanLossModel;
  txScanLossModel: LeoScanLossModel;
  dlReferenceBandwidthHz: number;
  ulReferenceBandwidthHz: number;
  dlUsableBeamBandwidthHz: number;
  ulUsableBeamBandwidthHz: number;
  mobilityClass: LeoMobilityClass;
  sourceNote: string;
  notes: string[];
  assumptions: string[];
}

const MHZ = 1e6;
const PARABOLIC_SCAN: LeoScanLossModel = {
  type: 'NONE',
  label: 'Mechanical tracking',
  note: 'Parabolic terminal scan loss is modeled as 0 dB because the dish mechanically tracks the satellite.',
};
const ESA_RX_SCAN: LeoScanLossModel = {
  type: 'ESA_COSINE',
  label: 'ESA receive cosine scan',
  exponent: 1.3,
  maxLossDb: 6,
  note: 'ESA receive scan loss is an engineering cosine approximation versus off-boresight scan angle.',
};
const ESA_TX_SCAN: LeoScanLossModel = {
  type: 'ESA_COSINE',
  label: 'ESA transmit cosine scan',
  exponent: 1.8,
  maxLossDb: 8,
  note: 'ESA transmit scan loss is an engineering cosine approximation; Tx loss is modeled slightly stronger than Rx.',
};

export function computeLeoTerminalScanLossDb(
  model: LeoScanLossModel,
  elevationDeg: number,
): number {
  if (model.type === 'NONE') return 0;
  const clampedElevation = Math.max(5, Math.min(90, elevationDeg));
  const scanAngleDeg = 90 - clampedElevation;
  const cosScan = Math.max(0.05, Math.cos((scanAngleDeg * Math.PI) / 180));
  const lossDb = 10 * model.exponent * Math.log10(cosScan);
  return Math.max(-model.maxLossDb, Math.min(0, lossDb));
}

export const LEO_TERMINAL_PROFILES: Record<TerminalType, LeoTerminalProfile> = {
  fixed: {
    id: 'fixed',
    label: 'Fixed',
    terminalFamily: 'Fixed',
    modelName: 'Representative fixed VSAT',
    category: 'residential',
    antennaType: 'PARABOLIC',
    maxDlMbps: 250,
    maxUlMbps: 50,
    rxGtDbK: 5.2,
    txEirpDbw: 40,
    rxScanLossModel: PARABOLIC_SCAN,
    txScanLossModel: PARABOLIC_SCAN,
    dlReferenceBandwidthHz: 50 * MHZ,
    ulReferenceBandwidthHz: 20 * MHZ,
    dlUsableBeamBandwidthHz: 250 * MHZ,
    ulUsableBeamBandwidthHz: 100 * MHZ,
    mobilityClass: 'fixed',
    sourceNote: 'Representative engineering assumption. Not claimed as an official OneWeb terminal datasheet value.',
    notes: ['Outdoor fixed user terminal, larger aperture and stable pointing.'],
    assumptions: ['G/T and EIRP are engineering assumptions, not vendor-certified values.'],
  },
  mobile: {
    id: 'mobile',
    label: 'Land Mobility',
    terminalFamily: 'Land Mobility',
    modelName: 'Representative land-mobile ESA',
    category: 'land-mobile',
    antennaType: 'ESA',
    maxDlMbps: 100,
    maxUlMbps: 20,
    rxGtDbK: 2.8,
    txEirpDbw: 34,
    rxScanLossModel: ESA_RX_SCAN,
    txScanLossModel: ESA_TX_SCAN,
    dlReferenceBandwidthHz: 40 * MHZ,
    ulReferenceBandwidthHz: 10 * MHZ,
    dlUsableBeamBandwidthHz: 200 * MHZ,
    ulUsableBeamBandwidthHz: 50 * MHZ,
    mobilityClass: 'portable',
    sourceNote: 'Representative ESA mobility terminal assumption. Replace with official datasheet values when available.',
    notes: ['Compact land-mobile terminal with smaller aperture and lower uplink power.'],
    assumptions: ['Reduced reference bandwidth models smaller scheduled allocations.'],
  },
  aviation: {
    id: 'aviation',
    label: 'Aviation',
    terminalFamily: 'Aviation',
    modelName: 'Representative aero ESA',
    category: 'aviation',
    antennaType: 'ESA',
    maxDlMbps: 150,
    maxUlMbps: 30,
    rxGtDbK: 4.2,
    txEirpDbw: 37,
    rxScanLossModel: ESA_RX_SCAN,
    txScanLossModel: ESA_TX_SCAN,
    dlReferenceBandwidthHz: 50 * MHZ,
    ulReferenceBandwidthHz: 15 * MHZ,
    dlUsableBeamBandwidthHz: 250 * MHZ,
    ulUsableBeamBandwidthHz: 75 * MHZ,
    mobilityClass: 'aero',
    sourceNote: 'Representative aero ESA assumption. Not vendor-certified; verify against aircraft terminal datasheet before operational use.',
    notes: ['Aero terminal assumes clearer weather path but mobility-pointing losses remain in the beam model.'],
    assumptions: ['Throughput caps represent service equipment limits, not RF link-budget inputs.'],
  },
  maritime: {
    id: 'maritime',
    label: 'Maritime',
    terminalFamily: 'Maritime',
    modelName: 'Representative stabilized maritime VSAT',
    category: 'maritime',
    antennaType: 'PARABOLIC',
    maxDlMbps: 200,
    maxUlMbps: 40,
    rxGtDbK: 4.8,
    txEirpDbw: 38,
    rxScanLossModel: PARABOLIC_SCAN,
    txScanLossModel: PARABOLIC_SCAN,
    dlReferenceBandwidthHz: 50 * MHZ,
    ulReferenceBandwidthHz: 20 * MHZ,
    dlUsableBeamBandwidthHz: 250 * MHZ,
    ulUsableBeamBandwidthHz: 100 * MHZ,
    mobilityClass: 'maritime',
    sourceNote: 'Representative stabilized parabolic maritime terminal assumption. Not claimed as an official vendor figure.',
    notes: ['Stabilized maritime terminal with medium-high aperture and uplink power.'],
    assumptions: ['Sea-motion penalties are represented by the existing geometry/scan-loss model only.'],
  },
};

export function getLeoTerminalProfile(type: TerminalType): LeoTerminalProfile {
  return LEO_TERMINAL_PROFILES[type] ?? LEO_TERMINAL_PROFILES.fixed;
}
