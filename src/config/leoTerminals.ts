import type { TerminalType } from '../components/capacity/TerminalConfig';

export type LeoMobilityClass = 'FIXED' | 'LAND_MOBILITY' | 'MARITIME' | 'AVIATION';
export type LeoTerminalFamily = 'Fixed' | 'Land Mobility' | 'Maritime' | 'Aviation';
export type LeoTerminalCategory = 'fixed' | 'land-mobile' | 'maritime' | 'aviation';
export type LeoAntennaType = 'PARABOLIC' | 'ESA';
export type LeoTerminalSourceType = 'OFFICIAL_DATASHEET' | 'ENGINEERING_ESTIMATE' | 'GENERIC_PROFILE';
export type LeoCertificationStatus = 'EUTELSAT_ONEWEB_CERTIFIED' | 'PUBLICLY_REFERENCED' | 'PLACEHOLDER';
export type LeoSupportedBand = 'Ku';
export type LeoScanLossModel =
  | { id: 'PARABOLIC_ZERO_LOSS'; type: 'NONE'; label: string; note: string }
  | { id: 'ESA_COSINE_N_1_4'; type: 'ESA_COSINE'; label: string; exponent: number; maxLossDb: number; note: string };

export interface LeoTerminalCatalogEntry {
  id: string;
  uiCategory: TerminalType;
  vendor: string;
  model: string;
  label: string;
  description: string;
  terminalFamily: LeoTerminalFamily;
  category: LeoTerminalCategory;
  antennaType: LeoAntennaType;
  maxDlMbps: number;
  maxUlMbps: number;
  rxGtDbK: number;
  txEirpDbw: number;
  gainRxDbi?: number;
  gainTxDbi?: number;
  noiseFigureDb?: number;
  outputPowerDbw?: number;
  rxScanLossModel: LeoScanLossModel;
  txScanLossModel: LeoScanLossModel;
  dlReferenceBandwidthHz: number;
  ulReferenceBandwidthHz: number;
  dlUsableBeamBandwidthHz: number;
  ulUsableBeamBandwidthHz: number;
  mobilityClass: LeoMobilityClass;
  isDefaultForFamily?: boolean;
  sourceType: LeoTerminalSourceType;
  sourceLabel: string;
  sourceUrl?: string;
  notes: string[];
  assumptions: string[];
  certificationStatus: LeoCertificationStatus;
  supportedBands: LeoSupportedBand[];
  enabled: boolean;
}

export type LeoTerminalProfile = LeoTerminalCatalogEntry;

const MHZ = 1e6;

export const PARABOLIC_ZERO_LOSS: LeoScanLossModel = {
  id: 'PARABOLIC_ZERO_LOSS',
  type: 'NONE',
  label: 'PARABOLIC_ZERO_LOSS',
  note: 'Mechanically tracked parabolic terminals are modeled with 0 dB terminal scan loss.',
};

export const ESA_COSINE_N_1_4: LeoScanLossModel = {
  id: 'ESA_COSINE_N_1_4',
  type: 'ESA_COSINE',
  label: 'ESA_COSINE_N_1_4',
  exponent: 1.4,
  maxLossDb: 8,
  note: 'Electronically steered antennas use a cosine^1.4 engineering scan-loss approximation versus off-boresight scan angle.',
};

const KU_LEO_BANDS: LeoSupportedBand[] = ['Ku'];
// Feasibility reference carrier/allocation bandwidths. These are terminal-profile
// assumptions used by the RF chain, then bounded by the shared beam capacity model.
const ONEWEB_REF_BW = {
  dlReferenceBandwidthHz: 50 * MHZ,
  ulReferenceBandwidthHz: 20 * MHZ,
  dlUsableBeamBandwidthHz: 250 * MHZ,
  ulUsableBeamBandwidthHz: 100 * MHZ,
};

export const LEO_TERMINAL_CATALOG: LeoTerminalCatalogEntry[] = [
  {
    id: 'intellian-ow70l',
    uiCategory: 'fixed',
    vendor: 'Intellian',
    model: 'OW70L',
    label: 'Fixed',
    description: 'Dual 73 cm mechanically tracked Eutelsat OneWeb enterprise terminal.',
    terminalFamily: 'Fixed',
    category: 'fixed',
    antennaType: 'PARABOLIC',
    maxDlMbps: 195,
    maxUlMbps: 32,
    rxGtDbK: 12.2,
    txEirpDbw: 36.6,
    gainRxDbi: 36.0,
    gainTxDbi: 38.4,
    rxScanLossModel: PARABOLIC_ZERO_LOSS,
    txScanLossModel: PARABOLIC_ZERO_LOSS,
    ...ONEWEB_REF_BW,
    mobilityClass: 'FIXED',
    isDefaultForFamily: true,
    sourceType: 'OFFICIAL_DATASHEET',
    sourceLabel: 'Intellian OW70L-Dac public RF spec sheet',
    sourceUrl: 'https://fcc.report/FCC-ID/XXZ-INTOW70LDAC/5364481.pdf',
    notes: [
      'Dual 73 cm mechanically tracked OneWeb enterprise terminal.',
      'Public RF specification lists 12.2 dB/K G/T and 36.6 dBW / 40 MHz dual-carrier EIRP.',
      'Throughput caps follow the public Eutelsat OneWeb terminal-class service limits used by this equipment class.',
    ],
    assumptions: [
      'Parabolic antenna scan loss is 0 dB because the antenna mechanically tracks the satellite.',
    ],
    certificationStatus: 'EUTELSAT_ONEWEB_CERTIFIED',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'hughes-hl1120w',
    uiCategory: 'fixed',
    vendor: 'Hughes',
    model: 'HL1120W',
    label: 'Fixed',
    description: 'Low-profile full-duplex ESA enterprise terminal for Eutelsat OneWeb.',
    terminalFamily: 'Fixed',
    category: 'fixed',
    antennaType: 'ESA',
    maxDlMbps: 195,
    maxUlMbps: 32,
    rxGtDbK: 11.3,
    txEirpDbw: 36.6,
    rxScanLossModel: ESA_COSINE_N_1_4,
    txScanLossModel: ESA_COSINE_N_1_4,
    ...ONEWEB_REF_BW,
    mobilityClass: 'FIXED',
    sourceType: 'OFFICIAL_DATASHEET',
    sourceLabel: 'Hughes HL1120W public datasheet',
    sourceUrl: 'https://www.hughes.com/wp-content/uploads/2026/02/Hughes_LEO_HL1120W_Terminal.pdf',
    notes: [
      'Flat-panel ESA enterprise terminal.',
      'Public Hughes datasheet lists up to 11.3 dB/K G/T, +36.6 dBW EIRP, 195 Mbps downlink and 32 Mbps uplink.',
      'ESA scan loss is applied to both receive G/T and transmit EIRP.',
    ],
    assumptions: [
      'G/T and EIRP are treated as broadside/reference RF values before modeled scan loss.',
    ],
    certificationStatus: 'EUTELSAT_ONEWEB_CERTIFIED',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'intellian-ow70m',
    uiCategory: 'maritime',
    vendor: 'Intellian',
    model: 'OW70M',
    label: 'Maritime',
    description: 'Stabilized dual-parabolic maritime terminal for Eutelsat OneWeb.',
    terminalFamily: 'Maritime',
    category: 'maritime',
    antennaType: 'PARABOLIC',
    maxDlMbps: 195,
    maxUlMbps: 32,
    rxGtDbK: 12.2,
    txEirpDbw: 36.6,
    gainRxDbi: 36.5,
    gainTxDbi: 37.8,
    rxScanLossModel: PARABOLIC_ZERO_LOSS,
    txScanLossModel: PARABOLIC_ZERO_LOSS,
    ...ONEWEB_REF_BW,
    mobilityClass: 'MARITIME',
    isDefaultForFamily: true,
    sourceType: 'OFFICIAL_DATASHEET',
    sourceLabel: 'Eutelsat/Intellian OW70M public datasheet',
    sourceUrl: 'https://www.eutelsat.com/system/files/2026-03/DOC_Brochure_Intellian_OW70M.pdf',
    notes: [
      'Stabilized dual-parabolic maritime terminal.',
      'Public datasheet lists 12.2 dB/K G/T and 36.6 dBW / 40 MHz dual-carrier EIRP.',
      'Throughput caps follow the public Eutelsat OneWeb terminal-class service limits used by this equipment class.',
    ],
    assumptions: [
      'Sea-motion stabilization penalties are not modeled separately from the terminal scan-loss behavior.',
    ],
    certificationStatus: 'EUTELSAT_ONEWEB_CERTIFIED',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'kymeta-peregrine-u8',
    uiCategory: 'maritime',
    vendor: 'Kymeta',
    model: 'Peregrine u8',
    label: 'Maritime',
    description: 'Maritime flat-panel ESA terminal for OneWeb/Eutelsat OneWeb service.',
    terminalFamily: 'Maritime',
    category: 'maritime',
    antennaType: 'ESA',
    maxDlMbps: 195,
    maxUlMbps: 32,
    rxGtDbK: 9.0,
    txEirpDbw: 36.6,
    rxScanLossModel: ESA_COSINE_N_1_4,
    txScanLossModel: ESA_COSINE_N_1_4,
    ...ONEWEB_REF_BW,
    mobilityClass: 'MARITIME',
    sourceType: 'ENGINEERING_ESTIMATE',
    sourceLabel: 'Kymeta Peregrine u8 public product sheet plus maritime engineering derating',
    sourceUrl: 'https://eutelsatns.us/wp-content/uploads/2025/08/700_00254_000_rev11_Peregrine_u8_LEO_product_sheet_October_2024.pdf',
    notes: [
      'Maritime ESA terminal; values should be refined with validated datasheets.',
      'Public product sheets commonly reference 195 Mbps downlink, 32 Mbps uplink and 36.6 dBW dual-carrier EIRP.',
      'The 9.0 dB/K receive G/T is a conservative planning value, not claimed as the official datasheet figure.',
    ],
    assumptions: [
      'Conservative maritime planning G/T is used to account for installation and operational margin.',
      'ESA scan loss is applied to both receive G/T and transmit EIRP.',
    ],
    certificationStatus: 'PUBLICLY_REFERENCED',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'kymeta-hawk-u8',
    uiCategory: 'mobile',
    vendor: 'Kymeta',
    model: 'Hawk u8',
    label: 'Mobile',
    description: 'Land mobility all-in-one flat-panel ESA terminal for Eutelsat OneWeb.',
    terminalFamily: 'Land Mobility',
    category: 'land-mobile',
    antennaType: 'ESA',
    maxDlMbps: 195,
    maxUlMbps: 32,
    rxGtDbK: 11.0,
    txEirpDbw: 36.6,
    rxScanLossModel: ESA_COSINE_N_1_4,
    txScanLossModel: ESA_COSINE_N_1_4,
    ...ONEWEB_REF_BW,
    mobilityClass: 'LAND_MOBILITY',
    isDefaultForFamily: true,
    sourceType: 'OFFICIAL_DATASHEET',
    sourceLabel: 'Kymeta Hawk u8 LEO public product sheet',
    sourceUrl: 'https://kymeta-corp.files.svdcdn.com/production/files/700-00249-000-rev09-Hawk-u8-LEO-product-sheet-March-2025.pdf?dm=1741575476',
    notes: [
      'Land mobility terminal for vehicles and trains.',
      'Public Kymeta product sheet lists 11 dB/K broadside G/T, 36.6 dBW dual-carrier EIRP, 195 Mbps downlink and 32 Mbps uplink.',
      'The referenced product sheet marks some transmit specifications as preliminary.',
      'ESA scan loss is applied to both receive G/T and transmit EIRP.',
    ],
    assumptions: [
      'G/T and EIRP are treated as broadside/reference RF values before modeled scan loss.',
    ],
    certificationStatus: 'EUTELSAT_ONEWEB_CERTIFIED',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'hughes-mobility-terminal',
    uiCategory: 'mobile',
    vendor: 'Hughes',
    model: 'Mobility Terminal',
    label: 'Mobile',
    description: 'Placeholder Hughes land-mobility ESA profile pending a validated public datasheet.',
    terminalFamily: 'Land Mobility',
    category: 'land-mobile',
    antennaType: 'ESA',
    maxDlMbps: 150,
    maxUlMbps: 32,
    rxGtDbK: 8.0,
    txEirpDbw: 34.0,
    rxScanLossModel: ESA_COSINE_N_1_4,
    txScanLossModel: ESA_COSINE_N_1_4,
    dlReferenceBandwidthHz: 40 * MHZ,
    ulReferenceBandwidthHz: 20 * MHZ,
    dlUsableBeamBandwidthHz: 200 * MHZ,
    ulUsableBeamBandwidthHz: 100 * MHZ,
    mobilityClass: 'LAND_MOBILITY',
    sourceType: 'ENGINEERING_ESTIMATE',
    sourceLabel: 'Hughes ESA mobility placeholder based on public Hughes OneWeb ESA references',
    sourceUrl: 'https://www.hughes.com/resources/press-releases/hughes-enables-worldwide-leo-connectivity-eutelsat-oneweb-approval-new-esa',
    notes: [
      'Placeholder profile pending validated public datasheet.',
      'Do not treat the RF values as official Hughes or Eutelsat specifications.',
    ],
    assumptions: [
      'Planning values are intentionally lower than the fixed HL1120W profile to represent a smaller or mobility-constrained ESA.',
      'ESA scan loss is applied to both receive G/T and transmit EIRP.',
    ],
    certificationStatus: 'PLACEHOLDER',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'stellar-blu-sidewinder',
    uiCategory: 'aviation',
    vendor: 'Stellar Blu',
    model: 'Sidewinder',
    label: 'Aviation',
    description: 'Low-profile aviation ESA terminal for LEO and multi-orbit IFC deployments.',
    terminalFamily: 'Aviation',
    category: 'aviation',
    antennaType: 'ESA',
    maxDlMbps: 195,
    maxUlMbps: 32,
    rxGtDbK: 9.5,
    txEirpDbw: 40.0,
    rxScanLossModel: ESA_COSINE_N_1_4,
    txScanLossModel: ESA_COSINE_N_1_4,
    ...ONEWEB_REF_BW,
    mobilityClass: 'AVIATION',
    isDefaultForFamily: true,
    sourceType: 'ENGINEERING_ESTIMATE',
    sourceLabel: 'Stellar Blu Sidewinder public product page plus engineering RF estimate',
    sourceUrl: 'https://www.stellar-blu.com/sidewinder/',
    notes: [
      'Low-profile aviation ESA terminal.',
      'Public product page references service above 190 Mbps downlink and 40 Mbps uplink; RF values are engineering estimates.',
      'Throughput cap is aligned to the current Eutelsat OneWeb terminal-class uplink cap used elsewhere in this catalog.',
    ],
    assumptions: [
      'Aviation RF values are representative planning inputs pending a public RF datasheet.',
      'ESA scan loss is applied to both receive G/T and transmit EIRP.',
    ],
    certificationStatus: 'PUBLICLY_REFERENCED',
    supportedBands: KU_LEO_BANDS,
    enabled: true,
  },
  {
    id: 'generic-fixed-parabolic-vsat',
    uiCategory: 'fixed',
    vendor: 'Generic',
    model: 'Representative fixed VSAT',
    label: 'Fixed',
    description: 'Fallback fixed parabolic profile used only if no validated terminal is enabled.',
    terminalFamily: 'Fixed',
    category: 'fixed',
    antennaType: 'PARABOLIC',
    maxDlMbps: 250,
    maxUlMbps: 50,
    rxGtDbK: 5.2,
    txEirpDbw: 40,
    rxScanLossModel: PARABOLIC_ZERO_LOSS,
    txScanLossModel: PARABOLIC_ZERO_LOSS,
    ...ONEWEB_REF_BW,
    mobilityClass: 'FIXED',
    sourceType: 'GENERIC_PROFILE',
    sourceLabel: 'Generic representative engineering profile',
    notes: [
      'Fallback only. Not claimed as an official OneWeb or Eutelsat terminal value.',
      'Parabolic dish assumes mechanical tracking, so terminal scan loss is 0 dB.',
    ],
    assumptions: [
      'Used as a safety fallback when a category has no enabled catalog entry.',
    ],
    certificationStatus: 'PLACEHOLDER',
    supportedBands: KU_LEO_BANDS,
    enabled: false,
  },
];

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

export function getEnabledLeoTerminalCatalogEntries(category?: TerminalType): LeoTerminalCatalogEntry[] {
  return LEO_TERMINAL_CATALOG.filter(
    (entry) => entry.enabled && (category == null || entry.uiCategory === category),
  );
}

export function getLeoTerminalProfile(type: TerminalType, terminalId?: string | null): LeoTerminalProfile {
  const enabledForType = getEnabledLeoTerminalCatalogEntries(type);
  const selected = terminalId
    ? enabledForType.find((entry) => entry.id === terminalId)
    : null;

  return (
    selected
    ?? enabledForType.find((entry) => entry.isDefaultForFamily)
    ?? enabledForType[0]
    ?? getEnabledLeoTerminalCatalogEntries('fixed').find((entry) => entry.isDefaultForFamily)
    ?? getEnabledLeoTerminalCatalogEntries('fixed')[0]
    ?? LEO_TERMINAL_CATALOG.find((entry) => entry.sourceType === 'GENERIC_PROFILE')
    ?? LEO_TERMINAL_CATALOG[0]
  );
}

export const LEO_TERMINAL_PROFILES: Record<TerminalType, LeoTerminalProfile> = {
  fixed: getLeoTerminalProfile('fixed'),
  mobile: getLeoTerminalProfile('mobile'),
  maritime: getLeoTerminalProfile('maritime'),
  aviation: getLeoTerminalProfile('aviation'),
};
