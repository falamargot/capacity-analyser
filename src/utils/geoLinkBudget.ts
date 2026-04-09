export type GeoBand = 'C' | 'Ku' | 'Ka';

export interface TerminalParams {
  // Downlink receive
  antennaDiameterM: number;
  gtTerminalDbk: number;

  // Uplink transmit
  eirpTerminalDbw: number;
}

export const DEFAULT_TERMINAL: TerminalParams = {
  antennaDiameterM: 1.2,
  gtTerminalDbk: 17.0,
  eirpTerminalDbw: 44.0,
};

export const BAND_PARAMS: Record<GeoBand, {
  freqDownGhz: number;
  freqUpGhz: number;
  defaultBwMhz: number;
  atmosLossDb: number;
}> = {
  C: { freqDownGhz: 3.8, freqUpGhz: 5.9, defaultBwMhz: 36, atmosLossDb: 0.5 },
  Ku: { freqDownGhz: 11.7, freqUpGhz: 14.0, defaultBwMhz: 36, atmosLossDb: 1.5 },
  Ka: { freqDownGhz: 19.7, freqUpGhz: 29.5, defaultBwMhz: 250, atmosLossDb: 4.0 },
};

const BOLTZMANN_CONSTANT_DBW_PER_K_PER_HZ = -228.6;

interface ModcodEntry {
  name: string;
  requiredCnDb: number;
  efficiency: number;
}

const DVB_S2X_MODCODS: ModcodEntry[] = [
  { name: 'QPSK 1/4', requiredCnDb: -2.35, efficiency: 0.49 },
  { name: 'QPSK 1/3', requiredCnDb: -1.24, efficiency: 0.66 },
  { name: 'QPSK 2/5', requiredCnDb: -0.30, efficiency: 0.79 },
  { name: 'QPSK 1/2', requiredCnDb: 1.00, efficiency: 0.99 },
  { name: 'QPSK 3/5', requiredCnDb: 2.23, efficiency: 1.19 },
  { name: 'QPSK 2/3', requiredCnDb: 3.10, efficiency: 1.32 },
  { name: 'QPSK 3/4', requiredCnDb: 4.03, efficiency: 1.49 },
  { name: 'QPSK 4/5', requiredCnDb: 4.68, efficiency: 1.59 },
  { name: 'QPSK 5/6', requiredCnDb: 5.18, efficiency: 1.65 },
  { name: '8PSK 3/5', requiredCnDb: 5.50, efficiency: 1.78 },
  { name: '8PSK 2/3', requiredCnDb: 6.62, efficiency: 1.98 },
  { name: '8PSK 3/4', requiredCnDb: 7.91, efficiency: 2.23 },
  { name: '8PSK 5/6', requiredCnDb: 9.35, efficiency: 2.48 },
  { name: '16APSK 2/3', requiredCnDb: 8.97, efficiency: 2.64 },
  { name: '16APSK 3/4', requiredCnDb: 10.21, efficiency: 2.97 },
  { name: '16APSK 4/5', requiredCnDb: 11.03, efficiency: 3.17 },
  { name: '16APSK 5/6', requiredCnDb: 11.61, efficiency: 3.30 },
  { name: '16APSK 8/9', requiredCnDb: 12.89, efficiency: 3.52 },
  { name: '32APSK 3/4', requiredCnDb: 12.73, efficiency: 3.70 },
  { name: '32APSK 4/5', requiredCnDb: 13.64, efficiency: 3.95 },
  { name: '32APSK 5/6', requiredCnDb: 14.28, efficiency: 4.12 },
  { name: '32APSK 8/9', requiredCnDb: 15.69, efficiency: 4.40 },
];

const LOWEST_MODCOD = DVB_S2X_MODCODS[0];

export interface LinkBudgetResult {
  fsplDb: number;
  slantRangeKm: number;
  frequencyGhz: number;
  bandwidthMhz: number;
  atmosphericLossDb: number;
  cn0Dbhz: number;
  cnDb: number;
  linkMarginDb: number;
  spectralEfficiency: number;
  achievableThroughputMbps: number;
  modcod: string;
}

const computeFsplDb = (slantRangeKm: number, frequencyGhz: number): number => (
  (20 * Math.log10(slantRangeKm * 1000)) +
  (20 * Math.log10(frequencyGhz * 1e9)) -
  147.55
);

const resolveModcod = (cnDb: number): ModcodEntry | null => {
  let best: ModcodEntry | null = null;

  for (const modcod of DVB_S2X_MODCODS) {
    if (cnDb >= modcod.requiredCnDb) {
      if (!best || modcod.efficiency > best.efficiency) {
        best = modcod;
      }
    }
  }

  return best;
};

export function lookupModcod(cnDb: number): { name: string; efficiency: number } {
  const modcod = resolveModcod(cnDb);
  if (!modcod) {
    return { name: 'Below threshold', efficiency: 0 };
  }

  return {
    name: modcod.name,
    efficiency: modcod.efficiency,
  };
}

const computeLinkBudget = (
  eirpTxDbw: number,
  gtRxDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): LinkBudgetResult => {
  const fsplDb = computeFsplDb(slantRangeKm, frequencyGhz);
  const cn0Dbhz =
    eirpTxDbw +
    gtRxDbk -
    fsplDb -
    atmosphericLossDb -
    BOLTZMANN_CONSTANT_DBW_PER_K_PER_HZ;
  const cnDb = cn0Dbhz - (10 * Math.log10(bandwidthMhz * 1e6));
  const selectedModcod = resolveModcod(cnDb);
  const requiredCnDb = selectedModcod?.requiredCnDb ?? LOWEST_MODCOD.requiredCnDb;
  const spectralEfficiency = selectedModcod?.efficiency ?? 0;

  return {
    fsplDb,
    slantRangeKm,
    frequencyGhz,
    bandwidthMhz,
    atmosphericLossDb,
    cn0Dbhz,
    cnDb,
    linkMarginDb: cnDb - requiredCnDb,
    spectralEfficiency,
    achievableThroughputMbps: spectralEfficiency * bandwidthMhz,
    modcod: selectedModcod?.name ?? 'Below threshold',
  };
};

export function computeDownlinkBudget(
  eirpSatDbw: number,
  gtTerminalDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): LinkBudgetResult {
  return computeLinkBudget(
    eirpSatDbw,
    gtTerminalDbk,
    slantRangeKm,
    frequencyGhz,
    bandwidthMhz,
    atmosphericLossDb,
  );
}

export function computeUplinkBudget(
  eirpTerminalDbw: number,
  gtSatDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): LinkBudgetResult {
  return computeLinkBudget(
    eirpTerminalDbw,
    gtSatDbk,
    slantRangeKm,
    frequencyGhz,
    bandwidthMhz,
    atmosphericLossDb,
  );
}

export function computeSlantRange(elevationDeg: number, altitudeKm: number): number {
  const earthRadiusKm = 6371;
  const elevRad = elevationDeg * Math.PI / 180;

  return (
    Math.sqrt(
      ((earthRadiusKm + altitudeKm) ** 2) -
      ((earthRadiusKm * Math.cos(elevRad)) ** 2)
    ) -
    (earthRadiusKm * Math.sin(elevRad))
  );
}
