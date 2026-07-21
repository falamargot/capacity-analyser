import type { SatelliteData } from '../../../types/satellites';
import { fmtMs } from '../../../utils/engineeringFormat';
import type { RouteDiagramConnector, RouteDiagramNode } from './RouteDiagram';

/**
 * Pure builders assembling already-computed values from GEOConnectivitySection
 * / LEOConnectivitySection into RouteDiagram's node/connector shape. No new
 * engineering computation happens here — every input is a value the caller
 * already has in scope.
 */

const fmtKm = (v: number | null | undefined): string | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(0)} km` : undefined;

export interface BuildLeoRouteDiagramArgs {
  isS2S: boolean;
  isAtoB: boolean;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  single?: {
    siteLabel: string;
    satellite: SatelliteData | null;
    beamIndex: number | null;
    snpName: string | null;
    userToSatKm: number | null;
    userToSatMs: number | null;
    satToSnpKm: number | null;
    satToSnpMs: number | null;
    /** Already-formatted, e.g. "75.6° · Guaranteed service zone" — pure display string, no formatting logic here. */
    userElevationLabel?: string;
    satToSnpElevationLabel?: string;
  };
  s2s?: {
    satA: SatelliteData | null;
    satB: SatelliteData | null;
    snpAName: string;
    snpBName: string;
    popName: string;
    sameSNP: boolean;
    userLinkAKm: number;
    userLinkAMs: number;
    feederAKm: number;
    feederAMs: number;
    backboneKm: number;
    backboneMs: number;
    feederBKm: number;
    feederBMs: number;
    userLinkBKm: number;
    userLinkBMs: number;
    elevationALabel?: string;
    elevationBLabel?: string;
  };
}

export function buildLeoRouteDiagram(args: BuildLeoRouteDiagramArgs): { nodes: RouteDiagramNode[]; connectors: RouteDiagramConnector[] } {
  const { onSatelliteClick } = args;

  if (!args.isS2S) {
    const s = args.single;
    if (!s) return { nodes: [], connectors: [] };
    const nodes: RouteDiagramNode[] = [
      { id: 'site-a', label: s.siteLabel, kind: 'site' },
      {
        id: 'satellite',
        label: s.satellite?.name ?? 'Unresolved satellite',
        kind: 'satellite',
        sub: s.beamIndex != null ? `Beam ${s.beamIndex}` : undefined,
        onClick: s.satellite && onSatelliteClick ? () => onSatelliteClick(s.satellite) : undefined,
      },
      { id: 'snp', label: s.snpName ?? 'Unresolved SNP', kind: 'snp' },
    ];
    const connectors: RouteDiagramConnector[] = [
      { distanceLabel: fmtKm(s.userToSatKm), latencyLabel: fmtMs(s.userToSatMs), elevationLabel: s.userElevationLabel },
      { distanceLabel: fmtKm(s.satToSnpKm), latencyLabel: fmtMs(s.satToSnpMs), elevationLabel: s.satToSnpElevationLabel },
    ];
    return { nodes, connectors };
  }

  const s = args.s2s;
  if (!s) return { nodes: [], connectors: [] };
  const isAtoB = args.isAtoB;
  const sourceSite = isAtoB ? 'Site A' : 'Site B';
  const destSite = isAtoB ? 'Site B' : 'Site A';
  const sourceSat = isAtoB ? s.satA : s.satB;
  const destSat = isAtoB ? s.satB : s.satA;
  const sourceSnpName = isAtoB ? s.snpAName : s.snpBName;
  const destSnpName = isAtoB ? s.snpBName : s.snpAName;
  const sourceUserKm = isAtoB ? s.userLinkAKm : s.userLinkBKm;
  const sourceUserMs = isAtoB ? s.userLinkAMs : s.userLinkBMs;
  const sourceFeederKm = isAtoB ? s.feederAKm : s.feederBKm;
  const sourceFeederMs = isAtoB ? s.feederAMs : s.feederBMs;
  const destFeederKm = isAtoB ? s.feederBKm : s.feederAKm;
  const destFeederMs = isAtoB ? s.feederBMs : s.feederAMs;
  const destUserKm = isAtoB ? s.userLinkBKm : s.userLinkAKm;
  const destUserMs = isAtoB ? s.userLinkBMs : s.userLinkAMs;
  const sourceElevationLabel = isAtoB ? s.elevationALabel : s.elevationBLabel;
  const destElevationLabel = isAtoB ? s.elevationBLabel : s.elevationALabel;

  const nodes: RouteDiagramNode[] = [
    { id: 'site-source', label: sourceSite, kind: 'site' },
    {
      id: 'sat-source',
      label: sourceSat?.name ?? 'Unresolved satellite',
      kind: 'satellite',
      onClick: sourceSat && onSatelliteClick ? () => onSatelliteClick(sourceSat) : undefined,
    },
    { id: 'snp-source', label: sourceSnpName, kind: 'snp' },
    ...(s.sameSNP ? [] : [{ id: 'pop', label: s.popName, kind: 'pop' as const, sub: 'Backbone PoP' }]),
    ...(s.sameSNP ? [] : [{ id: 'snp-dest', label: destSnpName, kind: 'snp' as const }]),
    {
      id: 'sat-dest',
      label: destSat?.name ?? 'Unresolved satellite',
      kind: 'satellite',
      onClick: destSat && onSatelliteClick ? () => onSatelliteClick(destSat) : undefined,
    },
    { id: 'site-dest', label: destSite, kind: 'site' },
  ];

  // Node count differs by branch (5 nodes/4 connectors when the same SNP
  // serves both satellites — no separate PoP/second-SNP node — vs 7 nodes/6
  // connectors when a backbone hop is needed), so the connector array must
  // match exactly; this mirrors LeoS2SPathStrip.tsx's own sameSNP branching.
  const connectors: RouteDiagramConnector[] = s.sameSNP
    ? [
        { distanceLabel: fmtKm(sourceUserKm), latencyLabel: fmtMs(sourceUserMs), elevationLabel: sourceElevationLabel },
        { distanceLabel: fmtKm(sourceFeederKm), latencyLabel: fmtMs(sourceFeederMs) },
        { distanceLabel: fmtKm(destFeederKm), latencyLabel: fmtMs(destFeederMs) },
        { distanceLabel: fmtKm(destUserKm), latencyLabel: fmtMs(destUserMs), elevationLabel: destElevationLabel },
      ]
    : [
        { distanceLabel: fmtKm(sourceUserKm), latencyLabel: fmtMs(sourceUserMs), elevationLabel: sourceElevationLabel },
        { distanceLabel: fmtKm(sourceFeederKm), latencyLabel: fmtMs(sourceFeederMs) },
        { distanceLabel: fmtKm(s.backboneKm / 2), latencyLabel: fmtMs(s.backboneMs / 2), dashed: true },
        { distanceLabel: fmtKm(s.backboneKm / 2), latencyLabel: fmtMs(s.backboneMs / 2), dashed: true },
        { distanceLabel: fmtKm(destFeederKm), latencyLabel: fmtMs(destFeederMs) },
        { distanceLabel: fmtKm(destUserKm), latencyLabel: fmtMs(destUserMs), elevationLabel: destElevationLabel },
      ];

  return { nodes, connectors };
}

export interface BuildGeoRouteDiagramArgs {
  isMeshOrP2P: boolean;
  isStarReturn: boolean;
  isForwardMeshDirection: boolean;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  satellite: SatelliteData | null;
  /** Display-name fallback for when `satellite` isn't resolved yet but a name is already known (e.g. Mesh mode's dual-segment candidate). */
  satelliteDisplayName?: string;
  star?: {
    userLabel: string;
    gatewayDisplayName: string;
    userToSatKm: number | null;
    userToSatMs: number | null;
    satToGatewayKm: number | null;
    satToGatewayMs: number | null;
    /** Already-formatted, e.g. "33.5°" — pure display string, no formatting logic here. */
    userElevationLabel?: string;
    /** Beam/coverage name serving the user hop for the active direction. */
    userCoverageLabel?: string;
  };
  mesh?: {
    pointALabel: string;
    pointBLabel: string;
    aToSatKm: number;
    aToSatMs: number;
    satToBKm: number;
    satToBMs: number;
    bToSatKm: number;
    bToSatMs: number;
    satToAKm: number;
    satToAMs: number;
    aElevationLabel?: string;
    bElevationLabel?: string;
    aCoverageLabel?: string;
    bCoverageLabel?: string;
  };
}

export function buildGeoRouteDiagram(args: BuildGeoRouteDiagramArgs): { nodes: RouteDiagramNode[]; connectors: RouteDiagramConnector[] } {
  const { onSatelliteClick, satellite } = args;
  const satelliteNode: RouteDiagramNode = {
    id: 'satellite',
    label: satellite?.name ?? args.satelliteDisplayName ?? 'GEO satellite',
    kind: 'satellite',
    onClick: satellite && onSatelliteClick ? () => onSatelliteClick(satellite) : undefined,
  };

  if (!args.isMeshOrP2P) {
    const s = args.star;
    if (!s) return { nodes: [], connectors: [] };
    const firstLabel = args.isStarReturn ? s.userLabel : s.gatewayDisplayName;
    const lastLabel = args.isStarReturn ? s.gatewayDisplayName : s.userLabel;
    const firstKind: RouteDiagramNode['kind'] = args.isStarReturn ? 'site' : 'gateway';
    const lastKind: RouteDiagramNode['kind'] = args.isStarReturn ? 'gateway' : 'site';
    // First hop is user<->satellite when Return (user transmits first), or
    // gateway<->satellite when Forward (gateway transmits first).
    const firstHopKm = args.isStarReturn ? s.userToSatKm : s.satToGatewayKm;
    const firstHopMs = args.isStarReturn ? s.userToSatMs : s.satToGatewayMs;
    const secondHopKm = args.isStarReturn ? s.satToGatewayKm : s.userToSatKm;
    const secondHopMs = args.isStarReturn ? s.satToGatewayMs : s.userToSatMs;
    // The user is always the ground-side ("site") endpoint — the gateway is
    // fixed infrastructure — so elevation/coverage apply wherever that node lands.
    const firstSub = args.isStarReturn ? s.userCoverageLabel : undefined;
    const lastSub = args.isStarReturn ? undefined : s.userCoverageLabel;
    const firstElevation = args.isStarReturn ? s.userElevationLabel : undefined;
    const secondElevation = args.isStarReturn ? undefined : s.userElevationLabel;

    return {
      nodes: [
        { id: 'first', label: firstLabel, kind: firstKind, sub: firstSub },
        satelliteNode,
        { id: 'last', label: lastLabel, kind: lastKind, sub: lastSub },
      ],
      connectors: [
        { distanceLabel: fmtKm(firstHopKm), latencyLabel: fmtMs(firstHopMs), elevationLabel: firstElevation },
        { distanceLabel: fmtKm(secondHopKm), latencyLabel: fmtMs(secondHopMs), elevationLabel: secondElevation },
      ],
    };
  }

  const m = args.mesh;
  if (!m) return { nodes: [], connectors: [] };
  const isForward = args.isForwardMeshDirection;
  const sourceLabel = isForward ? m.pointALabel : m.pointBLabel;
  const destLabel = isForward ? m.pointBLabel : m.pointALabel;
  const firstHopKm = isForward ? m.aToSatKm : m.bToSatKm;
  const firstHopMs = isForward ? m.aToSatMs : m.bToSatMs;
  const secondHopKm = isForward ? m.satToBKm : m.satToAKm;
  const secondHopMs = isForward ? m.satToBMs : m.satToAMs;
  const sourceElevationLabel = isForward ? m.aElevationLabel : m.bElevationLabel;
  const destElevationLabel = isForward ? m.bElevationLabel : m.aElevationLabel;
  const sourceCoverageLabel = isForward ? m.aCoverageLabel : m.bCoverageLabel;
  const destCoverageLabel = isForward ? m.bCoverageLabel : m.aCoverageLabel;

  return {
    nodes: [
      { id: 'source', label: sourceLabel, kind: 'site', sub: sourceCoverageLabel },
      satelliteNode,
      { id: 'dest', label: destLabel, kind: 'site', sub: destCoverageLabel },
    ],
    connectors: [
      { distanceLabel: fmtKm(firstHopKm), latencyLabel: fmtMs(firstHopMs), elevationLabel: sourceElevationLabel },
      { distanceLabel: fmtKm(secondHopKm), latencyLabel: fmtMs(secondHopMs), elevationLabel: destElevationLabel },
    ],
  };
}
