/**
 * GEO modem catalogue — the modem/hardware throughput ceiling that sits ABOVE the
 * RF link budget. The RF chain (geoLinkBudget/geoDualSegmentBudget) already models
 * what the *air interface* can carry given EIRP/G-T/bandwidth/MODCOD; a physical
 * modem then caps how much of that a terminal can actually source (transmit) or
 * sink (receive), regardless of how much spectrum or margin exists.
 *
 * These are DISTINCT GEO modem profiles — deliberately NOT derived from the LEO
 * terminal catalogue and NOT inferred from an RF class. Every ceiling must be
 * EXACTLY sourced from a datasheet, or it is left `null`:
 *   · maxTxMbps / maxRxMbps — per-direction ceilings, set only when the datasheet
 *     quotes them directionally (e.g. "300 Mbps return / 800 Mbps outbound").
 *   · aggregateCeilingMbps — a single "up to X Mbps" MAX that conservatively bounds
 *     either direction. NOT a floor: a "300+ Mbps" figure is a minimum, not a
 *     ceiling, and must be left null.
 * A modem never manufactures a directional number it cannot cite.
 *
 * Provenance: `sourceUrl` points to the manufacturer publication used and
 * `datasheetRevision` records its revision/date. `mode` and `ceilingNature`
 * describe exactly what each published figure represents.
 *
 * Delivered vs estimated (see `limitDirectionalThroughputMbps`): a throughput is
 * only a delivered rate when BOTH endpoint modems are known. With either endpoint
 * missing a modem, the result is an estimated ceiling and must not be shown as a
 * guaranteed rate.
 */

export type GeoModemId =
  | 'idirect_mdm2510'
  | 'idirect_iq200'
  | 'idirect_mdm5010'
  | 'comtech_cdm780';

export const GEO_MODEM_CATALOGUE_VERSION = '2026-07-25.1';

/** How a modem's throughput ceiling is sourced. */
export type ModemCeilingNature =
  | 'datasheet_directional' // per-direction TX/RX taken directly from the datasheet
  | 'datasheet_aggregate'   // single "up to X" MAX, applied conservatively per direction
  | 'official_release_directional'
  | 'unspecified';          // no usable ceiling published (floor-only or vague) → caps null

export type GeoModemTopology = 'STAR' | 'MESH' | 'POINT_TO_POINT';
/**
 * `unsupported` means the manufacturer evidence explicitly rules the topology out —
 * it is the only value that HARD BLOCKS a route. Silence is `unknown`, which keeps
 * the route unverified instead of blocked.
 *
 * No profile below currently uses `unsupported`: every seeded source either states
 * support or says nothing. The blocking path in `verifyModemTopology` is therefore
 * gated by catalogue data rather than unreachable, and is covered by tests so it
 * still behaves the day a datasheet does rule a topology out.
 */
export type GeoTopologySupport = 'supported' | 'unsupported' | 'unknown';

export interface GeoModemWaveformCapability {
  minSymbolRateMsps: number | null;
  maxSymbolRateMsps: number | null;
  /** Highest supported constellation order. null means unpublished, never unlimited. */
  maxModulationOrder: 4 | 8 | 16 | 32 | 64 | 128 | 256 | null;
  /** Supported occupied-carrier roll-offs. Empty means unpublished. */
  rollOffFactors: readonly number[];
  waveform: string;
}

export interface GeoModemProfile {
  id: GeoModemId;
  label: string;
  vendor: string;
  /** Per-direction transmit (return/uplink) ceiling, Mbps. null unless directionally sourced. */
  maxTxMbps: number | null;
  /** Per-direction receive (outbound/downlink) ceiling, Mbps. null unless directionally sourced. */
  maxRxMbps: number | null;
  /** Single aggregate MAX ceiling (bounds either direction). null if none/floor-only/vague. */
  aggregateCeilingMbps: number | null;
  /** Provenance of the ceiling figures above. */
  ceilingNature: ModemCeilingNature;
  /** Single-hop MESH (SCPC/mesh mode) — only asserted true when the source states it. */
  meshCapable: boolean;
  topologySupport: Readonly<Record<GeoModemTopology, GeoTopologySupport>>;
  txWaveform: GeoModemWaveformCapability;
  rxWaveform: GeoModemWaveformCapability;
  /** Operational mode the published figure(s) apply to. */
  mode: string;
  /** Manufacturer datasheet or official product-release URL. */
  sourceUrl: string;
  /** Datasheet revision or official publication date. */
  datasheetRevision: string;
  /** Human-readable citation as provided. */
  source: string;
  notes?: string;
}

export const GEO_MODEM_CATALOGUE: readonly GeoModemProfile[] = [
  {
    id: 'idirect_mdm2510',
    label: 'iDirect MDM2510',
    vendor: 'iDirect',
    // "up to 150 Mbps" is a genuine MAX but not directional → aggregate ceiling only.
    maxTxMbps: null,
    maxRxMbps: null,
    aggregateCeilingMbps: 150,
    ceilingNature: 'datasheet_aggregate',
    meshCapable: false, // iNFINITI TDMA remote; single-hop mesh not asserted by the source.
    topologySupport: { STAR: 'supported', MESH: 'unknown', POINT_TO_POINT: 'unknown' },
    txWaveform: {
      minSymbolRateMsps: 0.032,
      maxSymbolRateMsps: 20,
      maxModulationOrder: 64,
      rollOffFactors: [],
      waveform: 'MF-TDMA / Mx-DMA return',
    },
    rxWaveform: {
      minSymbolRateMsps: 0.256,
      maxSymbolRateMsps: 500,
      maxModulationOrder: 64,
      rollOffFactors: [],
      waveform: 'DVB-S2X outbound',
    },
    mode: 'TDMA (iNFINITI)',
    sourceUrl: 'https://www.idirect.net/wp-content/uploads/2020/03/Product-Sheet-MDM2510.pdf',
    datasheetRevision: 'D0001062 RevB',
    source: 'ST Engineering iDirect MDM2510 product sheet — up to 150 Mbps non-directional.',
  },
  {
    id: 'idirect_iq200',
    label: 'iDirect iQ 200',
    vendor: 'iDirect',
    // "300+ Mbps" is a FLOOR, not a ceiling → no usable cap. Do not treat 300 as a max.
    maxTxMbps: null,
    maxRxMbps: null,
    aggregateCeilingMbps: null,
    ceilingNature: 'unspecified',
    meshCapable: true, // Source states MESH support.
    topologySupport: { STAR: 'supported', MESH: 'supported', POINT_TO_POINT: 'supported' },
    txWaveform: {
      minSymbolRateMsps: 0.128,
      maxSymbolRateMsps: 15,
      maxModulationOrder: 16,
      rollOffFactors: [],
      waveform: 'Adaptive TDMA return',
    },
    rxWaveform: {
      minSymbolRateMsps: 5,
      maxSymbolRateMsps: 119,
      maxModulationOrder: 256,
      rollOffFactors: [],
      waveform: 'DVB-S2X ACM outbound',
    },
    mode: 'DVB-S2X ACM / SCPC mesh',
    sourceUrl: 'https://www.idirect.net/wp-content/uploads/2020/03/ProductSheet-iQ200-Rackmount-SatelliteModem.pdf',
    datasheetRevision: 'D0001017 RevF',
    source: 'ST Engineering iDirect iQ 200 Rackmount product sheet — >300 Mbps in L2oS, MESH support.',
    notes: 'Published as a minimum ("300+"); no ceiling to cap on. Left uncapped pending a max figure.',
  },
  {
    id: 'idirect_mdm5010',
    label: 'iDirect MDM5010',
    vendor: 'iDirect',
    // Exact directional figures from the source.
    maxTxMbps: 300, // return
    maxRxMbps: 800, // outbound
    aggregateCeilingMbps: null,
    ceilingNature: 'official_release_directional',
    meshCapable: false, // Source cites outbound/return rates only; mesh not asserted.
    topologySupport: { STAR: 'supported', MESH: 'unknown', POINT_TO_POINT: 'supported' },
    txWaveform: {
      minSymbolRateMsps: null,
      maxSymbolRateMsps: 100,
      maxModulationOrder: null,
      rollOffFactors: [],
      waveform: 'Mx-DMA MRC return',
    },
    rxWaveform: {
      minSymbolRateMsps: null,
      maxSymbolRateMsps: null,
      maxModulationOrder: null,
      rollOffFactors: [],
      waveform: 'DVB-S2X outbound',
    },
    mode: 'TDM outbound / TDMA-SCPC return',
    sourceUrl: 'https://www.idirect.net/news/st-engineering-idirect-unveils-mx-dma-waveform-upgrade-and-sets-new-performance-record-in-return-technology/',
    datasheetRevision: 'Official release · 2023-06-05',
    source: 'ST Engineering iDirect release — 300 Mbps return / 800 Mbps outbound in VSAT mode.',
  },
  {
    id: 'comtech_cdm780',
    label: 'Comtech CDM-780',
    vendor: 'Comtech',
    // "several Gbps" is not a usable exact ceiling → left null.
    maxTxMbps: null,
    maxRxMbps: null,
    aggregateCeilingMbps: null,
    ceilingNature: 'unspecified',
    meshCapable: false, // Trunking/gateway (point-to-point); single-hop mesh not asserted.
    topologySupport: { STAR: 'supported', MESH: 'unknown', POINT_TO_POINT: 'supported' },
    txWaveform: {
      minSymbolRateMsps: 10,
      maxSymbolRateMsps: 500,
      maxModulationOrder: 256,
      rollOffFactors: [0.05, 0.10, 0.15, 0.20, 0.25, 0.35],
      waveform: 'DVB-S2/S2X SCPC',
    },
    rxWaveform: {
      minSymbolRateMsps: 10,
      maxSymbolRateMsps: 500,
      maxModulationOrder: 256,
      rollOffFactors: [0.05, 0.10, 0.15, 0.20, 0.25, 0.35],
      waveform: 'DVB-S2/S2X SCPC',
    },
    mode: 'SCPC trunking / gateway',
    sourceUrl: 'https://comtech.com/wp-content/uploads/2023/07/ds-CDM780.pdf',
    datasheetRevision: '2023-07-25',
    source: 'Comtech CDM-780 datasheet — 10–500 Msps, DVB-S2/S2X, QPSK through 256APSK.',
    notes: 'Multi-Gbps trunk; no precise published ceiling encoded — left uncapped pending an exact figure.',
  },
] as const;

const MODEM_BY_ID = new Map<GeoModemId, GeoModemProfile>(
  GEO_MODEM_CATALOGUE.map((m) => [m.id, m]),
);

export function getGeoModemProfile(id: GeoModemId | null | undefined): GeoModemProfile | null {
  if (!id) return null;
  return MODEM_BY_ID.get(id) ?? null;
}

/** Effective TX ceiling: directional figure if present, else the aggregate MAX, else null. */
export function effectiveTxCapMbps(m: GeoModemProfile): number | null {
  const caps = [m.maxTxMbps, m.aggregateCeilingMbps].filter((v): v is number => v != null && v > 0);
  return caps.length > 0 ? Math.min(...caps) : null;
}

/** Effective RX ceiling: directional figure if present, else the aggregate MAX, else null. */
export function effectiveRxCapMbps(m: GeoModemProfile): number | null {
  const caps = [m.maxRxMbps, m.aggregateCeilingMbps].filter((v): v is number => v != null && v > 0);
  return caps.length > 0 ? Math.min(...caps) : null;
}

export interface MeshTopologyCheck {
  /** Confirmed compatible: both endpoints have a selected, mesh-capable modem. */
  compatible: boolean;
  /**
   * Cannot be confirmed yet: at least one endpoint has no modem selected, so mesh
   * capability is unknown (distinct from a confirmed incompatibility).
   */
  unverified: boolean;
  /** IDs whose manufacturer evidence explicitly marks this topology unsupported. */
  incompatibleModemIds: GeoModemId[];
  reason: string;
}

export interface ModemTopologyCheck extends MeshTopologyCheck {
  topology: GeoModemTopology;
  unknownModemIds: GeoModemId[];
}

export function verifyModemTopology(
  topology: GeoModemTopology,
  sourceModem: GeoModemProfile | null,
  destModem: GeoModemProfile | null,
): ModemTopologyCheck {
  const selected = [sourceModem, destModem].filter((m): m is GeoModemProfile => m != null);
  const incompatibleModemIds = selected
    .filter((modem) => modem.topologySupport[topology] === 'unsupported')
    .map((modem) => modem.id);
  const unknownModemIds = selected
    .filter((modem) => modem.topologySupport[topology] === 'unknown')
    .map((modem) => modem.id);
  const missingEndpoint = sourceModem == null || destModem == null;

  if (incompatibleModemIds.length > 0) {
    return {
      topology,
      compatible: false,
      unverified: false,
      incompatibleModemIds,
      unknownModemIds,
      reason: `Unsupported ${topology} topology: ${incompatibleModemIds.join(', ')}.`,
    };
  }
  if (missingEndpoint || unknownModemIds.length > 0) {
    return {
      topology,
      compatible: false,
      unverified: true,
      incompatibleModemIds: [],
      unknownModemIds,
      reason: missingEndpoint
        ? `${topology} capability unverified — select a modem at both endpoints.`
        : `${topology} capability is not published for: ${unknownModemIds.join(', ')}.`,
    };
  }
  return {
    topology,
    compatible: true,
    unverified: false,
    incompatibleModemIds: [],
    unknownModemIds: [],
    reason: `Both endpoint modems support ${topology}.`,
  };
}

/**
 * Verifies that a MESH/single-hop route's endpoint modems can actually form a mesh.
 * `meshCapable` is otherwise an inert flag; this turns it into a checkable result:
 *  · both modems selected and mesh-capable → compatible.
 *  · any selected modem explicitly marked unsupported → confirmed incompatible (blocking).
 *  · an endpoint without a modem → unverified (cannot confirm, not yet a block).
 */
export function verifyMeshTopology(
  sourceModem: GeoModemProfile | null,
  destModem: GeoModemProfile | null,
): MeshTopologyCheck {
  const result = verifyModemTopology('MESH', sourceModem, destModem);
  return {
    compatible: result.compatible,
    unverified: result.unverified,
    incompatibleModemIds: result.incompatibleModemIds,
    reason: result.reason,
  };
}

export interface DirectionalWaveformConstraint {
  minSymbolRateMsps: number | null;
  maxSymbolRateMsps: number | null;
  maxModulationOrder: GeoModemWaveformCapability['maxModulationOrder'];
  rollOff: number;
  fullySpecified: boolean;
}

const maxNullable = (values: Array<number | null>): number | null => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
};

const minNullable = (values: Array<number | null>): number | null => {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value));
  return finite.length > 0 ? Math.min(...finite) : null;
};

/**
 * Common waveform that both ends can physically process for source TX → dest RX.
 * Unknown published fields stay null; they never become an invented constraint.
 */
export function directionalWaveformConstraint(
  sourceModem: GeoModemProfile | null,
  destModem: GeoModemProfile | null,
  preferredRollOff = 0.15,
): DirectionalWaveformConstraint {
  const tx = sourceModem?.txWaveform ?? null;
  const rx = destModem?.rxWaveform ?? null;
  const txRollOffs = tx?.rollOffFactors ?? [];
  const rxRollOffs = rx?.rollOffFactors ?? [];
  const commonRollOffs = txRollOffs.length > 0 && rxRollOffs.length > 0
    ? txRollOffs.filter((value) => rxRollOffs.includes(value))
    : txRollOffs.length > 0 ? txRollOffs : rxRollOffs;
  const rollOff = commonRollOffs.length > 0
    ? [...commonRollOffs].sort((a, b) => Math.abs(a - preferredRollOff) - Math.abs(b - preferredRollOff))[0]
    : preferredRollOff;
  return {
    minSymbolRateMsps: maxNullable([tx?.minSymbolRateMsps ?? null, rx?.minSymbolRateMsps ?? null]),
    maxSymbolRateMsps: minNullable([tx?.maxSymbolRateMsps ?? null, rx?.maxSymbolRateMsps ?? null]),
    maxModulationOrder: minNullable([
      tx?.maxModulationOrder ?? null,
      rx?.maxModulationOrder ?? null,
    ]) as DirectionalWaveformConstraint['maxModulationOrder'],
    rollOff,
    fullySpecified: sourceModem != null
      && destModem != null
      && tx?.maxSymbolRateMsps != null
      && rx?.maxSymbolRateMsps != null
      && tx.maxModulationOrder != null
      && rx.maxModulationOrder != null,
  };
}

export type DirectionalLimitCause = 'rf' | 'source_tx' | 'dest_rx';

export interface DirectionalLimitResult {
  /** Throughput after applying the tightest KNOWN ceiling among {RF end-to-end, source TX, dest RX}. */
  limitedMbps: number;
  /** Which constraint set the limit. */
  limitedBy: DirectionalLimitCause;
  /**
   * True unless a KNOWN modem ceiling bounds BOTH ends of this direction — i.e. the
   * source TX cap AND the destination RX cap are both known numbers. It is therefore
   * still an estimated ceiling when: an endpoint has no modem, OR a selected modem's
   * cap for this direction is unknown (e.g. iQ 200's floor-only figure, CDM-780's
   * vague "several Gbps"). A single known cap still lowers the figure, but the result
   * stays estimated. UIs must not present an estimated ceiling as guaranteed throughput.
   */
  isEstimatedCeiling: boolean;
  /** The effective source TX ceiling used (null when unknown). */
  sourceTxCapMbps: number | null;
  /** The effective destination RX ceiling used (null when unknown). */
  destRxCapMbps: number | null;
}

/**
 * Directional modem limitation for one direction (source terminal → satellite →
 * destination terminal). `rfEndToEndMbps` is the RF end-to-end throughput already
 * limited by the network layer (i.e. `getDisplayedThroughput`). The source modem's
 * TX ceiling and the destination modem's RX ceiling are applied on top when known,
 * mirroring the STAR limitation chain: min(RF end-to-end + network, source TX, dest RX).
 *
 * A throughput is only DELIVERED (fully capped) when a KNOWN modem ceiling bounds
 * both ends of the direction (source TX and dest RX). If either is unknown — no modem,
 * or a selected modem whose cap for this direction is unpublished — the result is an
 * estimated ceiling even though any known cap is still applied.
 */
export function limitDirectionalThroughputMbps(
  rfEndToEndMbps: number,
  sourceModem: GeoModemProfile | null,
  destModem: GeoModemProfile | null,
): DirectionalLimitResult {
  let limitedMbps = rfEndToEndMbps;
  let limitedBy: DirectionalLimitCause = 'rf';

  const txCap = sourceModem ? effectiveTxCapMbps(sourceModem) : null;
  const rxCap = destModem ? effectiveRxCapMbps(destModem) : null;

  if (txCap != null && txCap < limitedMbps) {
    limitedMbps = txCap;
    limitedBy = 'source_tx';
  }
  if (rxCap != null && rxCap < limitedMbps) {
    limitedMbps = rxCap;
    limitedBy = 'dest_rx';
  }

  return {
    limitedMbps,
    limitedBy,
    // Delivered only when a known ceiling bounds BOTH ends of the direction.
    isEstimatedCeiling: txCap == null || rxCap == null,
    sourceTxCapMbps: txCap,
    destRxCapMbps: rxCap,
  };
}
