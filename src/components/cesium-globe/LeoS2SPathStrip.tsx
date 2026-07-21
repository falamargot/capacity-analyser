import React from 'react';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import BottomPathRibbon, { type PathRibbonItem } from './BottomPathRibbon';

type RouteDirection = 'A_TO_B' | 'B_TO_A';

interface LeoS2SPathStripProps {
  result: LeoSiteToSiteResult;
  activeDirection?: RouteDirection;
  variant?: 'overlay' | 'inline';
}

const fmtKm = (km: number): string =>
  km > 0 ? `${Math.round(km).toLocaleString()} km` : '--';

const fmtMs = (ms: number | null | undefined): string =>
  ms != null && Number.isFinite(ms) && ms > 0 ? `${Math.round(ms)} ms` : '--';

const fmtMbps = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v) || v <= 0) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Gbps`;
  return `${Math.round(v)} Mbps`;
};

const MISSING = '\u2014';
const ELLIPSIS = '\u2026';

const truncate = (value: string, max = 14): string =>
  value.length > max ? `${value.slice(0, max)}${ELLIPSIS}` : value;

const CYAN = '#06b6d4';
const ORANGE = '#f97316';
const VIOLET = '#8b5cf6';
const SLATE = '#64748b';

const directionLabel = (direction: RouteDirection): string =>
  direction === 'B_TO_A' ? 'B→A' : 'A→B';

const LeoS2SPathStrip: React.FC<LeoS2SPathStripProps> = ({
  result,
  activeDirection = 'A_TO_B',
  variant = 'overlay',
}) => {
  const {
    servingSatelliteA,
    servingSatelliteB,
    selectedSnpA,
    selectedSnpB,
    logicalPop,
    userLinkDistanceAKm,
    feederDistanceAKm,
    userLinkDistanceBKm,
    feederDistanceBKm,
    backboneDistanceKm,
    userLinkLatencyAms,
    feederLatencyAms,
    feederLatencyBms,
    userLinkLatencyBms,
    backboneOneWayLatencyMs,
    finalThroughputAtoBMbps,
    finalThroughputBtoAMbps,
    oneWayLatencyAtoBMs,
    oneWayLatencyBtoAMs,
  } = result;

  const isReverse = activeDirection === 'B_TO_A';
  const selectedThroughput = isReverse ? finalThroughputBtoAMbps : finalThroughputAtoBMbps;
  const selectedOneWayLatencyMs = isReverse ? oneWayLatencyBtoAMs : oneWayLatencyAtoBMs;
  if (selectedThroughput == null || !Number.isFinite(selectedThroughput) || selectedThroughput <= 0) {
    return null;
  }

  const sourceSite = isReverse ? 'Site B' : 'Site A';
  const destinationSite = isReverse ? 'Site A' : 'Site B';
  const sourceSatName = isReverse ? (servingSatelliteB?.name ?? MISSING) : (servingSatelliteA?.name ?? MISSING);
  const destinationSatName = isReverse ? (servingSatelliteA?.name ?? MISSING) : (servingSatelliteB?.name ?? MISSING);
  const sourceSnpName = isReverse ? (selectedSnpB?.name ?? MISSING) : (selectedSnpA?.name ?? MISSING);
  const destinationSnpName = isReverse ? (selectedSnpA?.name ?? MISSING) : (selectedSnpB?.name ?? MISSING);
  const sourceUserDistanceKm = isReverse ? userLinkDistanceBKm : userLinkDistanceAKm;
  const sourceUserLatencyMs = isReverse ? userLinkLatencyBms : userLinkLatencyAms;
  const sourceFeederDistanceKm = isReverse ? feederDistanceBKm : feederDistanceAKm;
  const sourceFeederLatencyMs = isReverse ? feederLatencyBms : feederLatencyAms;
  const destinationFeederDistanceKm = isReverse ? feederDistanceAKm : feederDistanceBKm;
  const destinationFeederLatencyMs = isReverse ? feederLatencyAms : feederLatencyBms;
  const destinationUserDistanceKm = isReverse ? userLinkDistanceAKm : userLinkDistanceBKm;
  const destinationUserLatencyMs = isReverse ? userLinkLatencyAms : userLinkLatencyBms;
  const popName = logicalPop?.name ?? 'Core PoP';
  const sameSNP = sourceSnpName === destinationSnpName && sourceSnpName !== MISSING;
  const halfBackboneKm = backboneDistanceKm / 2;

  const items: PathRibbonItem[] = [
    { type: 'node', node: { label: sourceSite, color: CYAN } },
    { type: 'connector', connector: { topLabel: fmtKm(sourceUserDistanceKm), bottomLabel: fmtMs(sourceUserLatencyMs), color: CYAN } },
    { type: 'node', node: { label: truncate(sourceSatName), sub: isReverse ? 'Sat B' : 'Sat A', color: CYAN } },
    { type: 'connector', connector: { topLabel: fmtKm(sourceFeederDistanceKm), bottomLabel: fmtMs(sourceFeederLatencyMs), color: ORANGE } },
    { type: 'node', node: { label: sourceSnpName, sub: isReverse ? 'SNP B' : 'SNP A', color: ORANGE } },
  ];

  if (sameSNP) {
    items.push({ type: 'note', label: 'same SNP' });
  } else {
    items.push(
      {
        type: 'connector',
        connector: {
          topLabel: fmtKm(halfBackboneKm),
          bottomLabel: backboneOneWayLatencyMs > 0 ? fmtMs(backboneOneWayLatencyMs / 2) : undefined,
          color: VIOLET,
          dashed: true,
        },
      },
      { type: 'node', node: { label: popName, sub: 'PoP', color: VIOLET, dot: VIOLET } },
      {
        type: 'connector',
        connector: {
          topLabel: fmtKm(halfBackboneKm),
          bottomLabel: backboneOneWayLatencyMs > 0 ? fmtMs(backboneOneWayLatencyMs / 2) : undefined,
          color: VIOLET,
          dashed: true,
        },
      },
      { type: 'node', node: { label: destinationSnpName, sub: isReverse ? 'SNP A' : 'SNP B', color: ORANGE } },
    );
  }

  items.push(
    { type: 'connector', connector: { topLabel: fmtKm(destinationFeederDistanceKm), bottomLabel: fmtMs(destinationFeederLatencyMs), color: ORANGE } },
    { type: 'node', node: { label: truncate(destinationSatName), sub: isReverse ? 'Sat A' : 'Sat B', color: CYAN } },
    { type: 'connector', connector: { topLabel: fmtKm(destinationUserDistanceKm), bottomLabel: fmtMs(destinationUserLatencyMs), color: CYAN } },
    { type: 'node', node: { label: destinationSite, color: CYAN } },
  );

  return (
    <BottomPathRibbon
      title="LEO Site-to-Site Path"
      accentColor={CYAN}
      summary={`${directionLabel(activeDirection)} ${fmtMbps(selectedThroughput)} · latency ${fmtMs(selectedOneWayLatencyMs)}`}
      items={items}
      variant={variant}
      legendItems={[
        { color: CYAN, label: 'User link' },
        { color: ORANGE, label: 'Feeder link' },
        { color: VIOLET, label: 'Backbone / terrestrial network', dashed: true },
        { color: SLATE, label: 'Latency value is selected one-way route', dashed: true },
      ]}
      trailingNote="Backbone capacity assumed non-limiting"
    />
  );
};

export default React.memo(LeoS2SPathStrip);
