export type FiveGDeployedBand =
  | '3.4'
  | '3.5'
  | '3.6'
  | '3.7'
  | '3.8'
  | '4.0'
  | '4.2';

export type FiveGPlannedBand =
  | '3.6'
  | '3.7'
  | '3.8'
  | '4.0'
  | '4.2';

export type FiveGSpectrumStatus =
  | 'deployed'
  | 'planned'
  | 'mixed'
  | 'no-data';

interface FiveGBandStyle {
  label: string;
  fillColor: string;
}

interface FiveGSpectrumCountryRecord {
  deployedBand?: FiveGDeployedBand;
  plannedBand?: FiveGPlannedBand;
}

export interface FiveGSpectrumCountryInfo {
  isoA2: string | null;
  countryName: string;
  status: FiveGSpectrumStatus;
  statusLabel: string;
  statusDescription: string;
  bandLabel: string;
  deployedBand: FiveGDeployedBand | null;
  plannedBand: FiveGPlannedBand | null;
  deployedBandLabel: string | null;
  plannedBandLabel: string | null;
  fillColor: string;
  secondaryFillColor: string | null;
  fillAlpha: number;
  outlineColor: string;
  usesStripedFill: boolean;
}

export const FIVE_G_DEPLOYED_BAND_STYLES: Record<FiveGDeployedBand, FiveGBandStyle> = {
  '3.4': { label: 'Up to 3.4 GHz', fillColor: '#9b4aa6' },
  '3.5': { label: 'Up to 3.5 GHz', fillColor: '#4448c8' },
  '3.6': { label: 'Up to 3.6 GHz', fillColor: '#1a9ddd' },
  '3.7': { label: 'Up to 3.7 GHz', fillColor: '#28b446' },
  '3.8': { label: 'Up to 3.8 GHz', fillColor: '#ffea00' },
  '4.0': { label: 'Up to 4 GHz', fillColor: '#ff7f27' },
  '4.2': { label: 'Up to 4.2 GHz', fillColor: '#ef1c23' },
};

export const FIVE_G_PLANNED_BAND_STYLES: Record<FiveGPlannedBand, FiveGBandStyle> = {
  '3.6': { label: 'Up to 3.6 GHz', fillColor: '#93cee3' },
  '3.7': { label: 'Up to 3.7 GHz', fillColor: '#b7f100' },
  '3.8': { label: 'Up to 3.8 GHz', fillColor: '#eadfa6' },
  '4.0': { label: 'Up to 4 GHz', fillColor: '#ffca1b' },
  '4.2': { label: 'Up to 4.2 GHz', fillColor: '#c48aa4' },
};

const NO_DATA_STYLE = {
  label: 'No data',
  fillColor: '#94a3b8',
};

const DEFAULT_FILL_ALPHA = 0.44;

const FIVE_G_COUNTRY_NAME_ALIASES: Record<string, string> = {
  Somaliland: 'SO',
};

const FIVE_G_SPECTRUM_DATA: Record<string, FiveGSpectrumCountryRecord> = {
  AD: { deployedBand: '3.8' },
  AE: { deployedBand: '3.7' },
  AL: { deployedBand: '3.8' },
  AR: { deployedBand: '3.6' },
  AX: { deployedBand: '3.8' },
  AU: { deployedBand: '3.7' },
  AT: { deployedBand: '3.8' },
  BA: { deployedBand: '3.8' },
  BD: { plannedBand: '3.6' },
  BE: { deployedBand: '3.8' },
  BG: { deployedBand: '3.8' },
  BH: { deployedBand: '3.6' },
  BO: { deployedBand: '3.6' },
  BR: { deployedBand: '3.7', plannedBand: '3.8' },
  CA: { deployedBand: '3.7', plannedBand: '3.8' },
  CH: { deployedBand: '3.7' },
  CL: { deployedBand: '3.8' },
  CN: { deployedBand: '3.6' },
  CO: { deployedBand: '4.2' },
  CR: { deployedBand: '3.7' },
  CY: { deployedBand: '3.8' },
  CZ: { deployedBand: '3.8' },
  DE: { deployedBand: '3.8' },
  DJ: { plannedBand: '3.8' },
  DK: { deployedBand: '3.8' },
  DO: { deployedBand: '3.6' },
  DZ: { plannedBand: '3.8' },
  EC: { plannedBand: '4.2' },
  EE: { deployedBand: '3.8' },
  EG: { plannedBand: '3.8' },
  ES: { deployedBand: '4.0' },
  FI: { deployedBand: '3.8' },
  FO: { deployedBand: '3.8' },
  FR: { deployedBand: '3.8' },
  GG: { deployedBand: '4.2' },
  GH: { deployedBand: '3.6' },
  GI: { deployedBand: '4.2' },
  GR: { deployedBand: '3.8' },
  GT: { plannedBand: '3.7' },
  GB: { deployedBand: '4.2' },
  HR: { deployedBand: '4.2' },
  HN: { plannedBand: '3.7' },
  HU: { deployedBand: '3.8' },
  CI: { deployedBand: '3.6' },
  IE: { deployedBand: '3.8' },
  ID: { deployedBand: '3.6' },
  IM: { deployedBand: '4.2' },
  IN: { deployedBand: '3.6', plannedBand: '3.7' },
  IR: { deployedBand: '3.6' },
  IS: { deployedBand: '3.8' },
  IT: { deployedBand: '3.8' },
  IL: { plannedBand: '3.8' },
  JE: { deployedBand: '4.2' },
  JO: { deployedBand: '3.6' },
  JP: { deployedBand: '4.2' },
  IQ: { plannedBand: '3.8' },
  KE: { deployedBand: '3.8' },
  KH: { plannedBand: '3.7' },
  KR: { deployedBand: '3.7' },
  KZ: { deployedBand: '4.0' },
  KW: { deployedBand: '4.2' },
  LB: { plannedBand: '3.8' },
  LI: { deployedBand: '3.7' },
  LT: { deployedBand: '3.7' },
  LU: { deployedBand: '3.8' },
  LV: { deployedBand: '3.8' },
  LY: { plannedBand: '3.8' },
  MA: { plannedBand: '3.8' },
  MC: { deployedBand: '3.8' },
  ME: { deployedBand: '3.8' },
  MX: { deployedBand: '3.6' },
  MK: { deployedBand: '3.8' },
  MR: { plannedBand: '3.8' },
  MM: { plannedBand: '3.6' },
  MT: { deployedBand: '3.8' },
  MY: { deployedBand: '3.6' },
  NG: { deployedBand: '3.7' },
  NA: { plannedBand: '3.6' },
  NL: { deployedBand: '3.4' },
  NO: { deployedBand: '3.8' },
  NZ: { deployedBand: '3.8' },
  OM: { plannedBand: '4.0' },
  PK: { deployedBand: '3.6' },
  PE: { deployedBand: '3.6', plannedBand: '3.8' },
  PH: { deployedBand: '3.8' },
  PL: { deployedBand: '3.7' },
  PG: { deployedBand: '3.5' },
  PT: { deployedBand: '4.0' },
  PR: { deployedBand: '4.0' },
  RO: { deployedBand: '3.8' },
  RS: { deployedBand: '3.8' },
  SA: { deployedBand: '3.8', plannedBand: '4.0' },
  SE: { deployedBand: '3.8' },
  SG: { deployedBand: '3.7' },
  SM: { deployedBand: '3.8' },
  SI: { deployedBand: '3.6' },
  SK: { deployedBand: '3.8' },
  SO: { deployedBand: '3.8' },
  SR: { deployedBand: '3.8' },
  SD: { plannedBand: '3.8' },
  SV: { plannedBand: '3.7' },
  SY: { plannedBand: '3.8' },
  TH: { plannedBand: '3.7' },
  TN: { deployedBand: '3.6' },
  TZ: { deployedBand: '3.6' },
  UA: { deployedBand: '4.0' },
  UG: { deployedBand: '3.5' },
  US: { deployedBand: '4.0' },
  UY: { deployedBand: '3.7', plannedBand: '3.8' },
  UZ: { deployedBand: '3.8' },
  VN: { plannedBand: '3.7' },
  YE: { plannedBand: '3.8' },
  'CN-TW': { plannedBand: '3.6' },
  XK: { deployedBand: '3.8' },
  ZA: { deployedBand: '4.2' },
  AO: { deployedBand: '3.6' },
  CG: { deployedBand: '3.6' },
};

const getCountryStatus = (record?: FiveGSpectrumCountryRecord): FiveGSpectrumStatus => {
  if (!record) return 'no-data';
  if (record.deployedBand && record.plannedBand) return 'mixed';
  if (record.deployedBand) return 'deployed';
  if (record.plannedBand) return 'planned';
  return 'no-data';
};

export const getFiveGSpectrumCountryInfo = (
  isoA2: string | null | undefined,
  countryName: string,
): FiveGSpectrumCountryInfo => {
  const normalizedIsoA2 = isoA2?.trim().toUpperCase() || null;
  const aliasIsoA2 = FIVE_G_COUNTRY_NAME_ALIASES[countryName.trim()] ?? null;
  const resolvedIsoA2 = normalizedIsoA2 && normalizedIsoA2 !== 'UNKNOWN'
    ? normalizedIsoA2
    : aliasIsoA2;
  const record = resolvedIsoA2 ? FIVE_G_SPECTRUM_DATA[resolvedIsoA2] : undefined;
  const status = getCountryStatus(record);

  const deployedBand = record?.deployedBand ?? null;
  const plannedBand = record?.plannedBand ?? null;
  const deployedBandLabel = deployedBand ? FIVE_G_DEPLOYED_BAND_STYLES[deployedBand].label : null;
  const plannedBandLabel = plannedBand ? FIVE_G_PLANNED_BAND_STYLES[plannedBand].label : null;

  const primaryStyle = deployedBand
    ? FIVE_G_DEPLOYED_BAND_STYLES[deployedBand]
    : plannedBand
      ? FIVE_G_PLANNED_BAND_STYLES[plannedBand]
      : NO_DATA_STYLE;
  const secondaryStyle = plannedBand ? FIVE_G_PLANNED_BAND_STYLES[plannedBand] : null;

  const statusLabel =
    status === 'mixed'
      ? 'Deployed + planned'
      : status === 'deployed'
        ? 'Deployed'
        : status === 'planned'
          ? 'Planned'
          : 'No data';

  const statusDescription =
    status === 'mixed'
      ? `Deployed ${deployedBandLabel ?? 'band'} with planned expansion to ${plannedBandLabel ?? 'another band'}.`
      : status === 'deployed'
        ? `${deployedBandLabel ?? 'Band'} already deployed.`
        : status === 'planned'
          ? `${plannedBandLabel ?? 'Band'} planned but not yet deployed.`
          : 'No demo spectrum data available for this country.';

  const bandLabel =
    status === 'mixed'
      ? `Deployed ${deployedBandLabel ?? '—'} / Planned ${plannedBandLabel ?? '—'}`
      : status === 'deployed'
        ? (deployedBandLabel ?? 'No deployed band')
        : status === 'planned'
          ? (plannedBandLabel ?? 'No planned band')
          : 'No data';

  return {
    isoA2: resolvedIsoA2,
    countryName,
    status,
    statusLabel,
    statusDescription,
    bandLabel,
    deployedBand,
    plannedBand,
    deployedBandLabel,
    plannedBandLabel,
    fillColor: primaryStyle.fillColor,
    secondaryFillColor: status === 'mixed' ? secondaryStyle?.fillColor ?? null : null,
    fillAlpha: status === 'no-data' ? 0.24 : DEFAULT_FILL_ALPHA,
    outlineColor: primaryStyle.fillColor,
    usesStripedFill: status === 'mixed',
  };
};
