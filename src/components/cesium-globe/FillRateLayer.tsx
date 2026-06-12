/**
 * FillRateLayer — densified statistical LEO fill-rate cells.
 *
 * Renders only cells present in the fill-rate dataset. No country bounding-box
 * approximation, no dense global raster, and no synthetic ocean/land fill.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCesium } from 'resium';
import { Color, CustomDataSource, Rectangle } from 'cesium';
import { getFillRateCellBounds, loadFillRateDataset } from '../../services/fillRateService';
import type { FillRateCell, FillRateDatasetMetadata } from '../../types/fillRate';
import { getFillRateProvenanceDescriptor } from '../../utils/fillRateProvenance';
import { BASE_OVERLAY_LAYER_HEIGHT_M } from './layerHeights';

const DS_NAME = 'oneweb-fill-rate-layer';

type FillRateCellSpec = [
  west: number,
  south: number,
  east: number,
  north: number,
  r: number,
  g: number,
  b: number,
  a: number,
];

type ColorStop = {
  pct: number;
  color: { r: number; g: number; b: number };
};

interface ViewerLike {
  dataSources: {
    add: (ds: CustomDataSource) => Promise<CustomDataSource>;
  };
  isDestroyed: () => boolean;
}

export const FILL_RATE_COLOR_STOPS: ColorStop[] = [
  { pct: 0, color: { r: 59, g: 130, b: 246 } },
  { pct: 45, color: { r: 125, g: 181, b: 133 } },
  { pct: 70, color: { r: 234, g: 179, b: 8 } },
  { pct: 95, color: { r: 249, g: 115, b: 22 } },
  { pct: 100, color: { r: 239, g: 68, b: 68 } },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(left: number, right: number, t: number): number {
  return left + (right - left) * t;
}

function getColorStopPair(fillRatePct: number): [ColorStop, ColorStop] {
  const pct = Math.max(0, Math.min(100, fillRatePct));

  for (let i = 1; i < FILL_RATE_COLOR_STOPS.length; i += 1) {
    const previous = FILL_RATE_COLOR_STOPS[i - 1];
    const next = FILL_RATE_COLOR_STOPS[i];
    if (pct <= next.pct) return [previous, next];
  }

  const last = FILL_RATE_COLOR_STOPS[FILL_RATE_COLOR_STOPS.length - 1];
  return [last, last];
}

export function fillRateToColor(fillRatePct: number): Color {
  const pct = Math.max(0, Math.min(100, fillRatePct));
  const t = clamp01(pct / 100);
  const [from, to] = getColorStopPair(pct);
  const span = Math.max(1, to.pct - from.pct);
  const u = clamp01((pct - from.pct) / span);
  const alpha = lerp(0.62, 0.84, t);

  return new Color(
    lerp(from.color.r, to.color.r, u) / 255,
    lerp(from.color.g, to.color.g, u) / 255,
    lerp(from.color.b, to.color.b, u) / 255,
    alpha,
  );
}

export function fillRateGradientCss(): string {
  const stops = FILL_RATE_COLOR_STOPS
    .map(({ pct, color }) => `rgb(${color.r},${color.g},${color.b}) ${pct}%`)
    .join(', ');
  return `linear-gradient(to right, ${stops})`;
}

function cellToSpec(cell: FillRateCell): FillRateCellSpec {
  const { west, south, east, north } = getFillRateCellBounds(cell, 'visual');
  const color = fillRateToColor(cell.fillRatePct);

  return [west, south, east, north, color.red, color.green, color.blue, color.alpha];
}

function buildCellSpecs(cells: readonly FillRateCell[]): FillRateCellSpec[] {
  return cells.map(cellToSpec);
}

const viewerDsMap = new WeakMap<object, Promise<CustomDataSource>>();

async function getOrCreateDataSource(viewer: ViewerLike): Promise<CustomDataSource> {
  const cached = viewerDsMap.get(viewer);
  if (cached) return cached;

  const promise = (async () => {
    const dataset = await loadFillRateDataset();
    const ds = new CustomDataSource(DS_NAME);

    for (const [west, south, east, north, r, g, b, a] of buildCellSpecs(dataset.cells)) {
      ds.entities.add({
        rectangle: {
          coordinates: Rectangle.fromDegrees(west, south, east, north),
          material: new Color(r, g, b, a),
          outline: false,
          height: BASE_OVERLAY_LAYER_HEIGHT_M,
        },
      });
    }

    ds.show = false;
    return viewer.dataSources.add(ds);
  })();

  viewerDsMap.set(viewer, promise);
  return promise;
}

interface FillRateLayerProps {
  visible: boolean;
}

const FillRateLayer: React.FC<FillRateLayerProps> = ({ visible }) => {
  const { viewer } = useCesium();
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (!viewer) return;

    let cancelled = false;

    const attach = async () => {
      try {
        const ds = await getOrCreateDataSource(viewer as ViewerLike);
        if (cancelled || viewer.isDestroyed()) return;
        dataSourceRef.current = ds;
        ds.show = visibleRef.current;
      } catch (error) {
        console.error('[FillRateLayer] Failed to attach DataSource:', error);
      }
    };

    void attach();

    return () => {
      cancelled = true;
      if (dataSourceRef.current) dataSourceRef.current.show = false;
      dataSourceRef.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    if (dataSourceRef.current) dataSourceRef.current.show = visible;
  }, [visible]);

  return null;
};

interface FillRateLegendProps {
  show: boolean;
  isPhone?: boolean;
}

export const FillRateLegend: React.FC<FillRateLegendProps> = ({ show, isPhone }) => {
  const [metadata, setMetadata] = useState<FillRateDatasetMetadata | null>(null);

  useEffect(() => {
    if (!show) return;

    let cancelled = false;
    loadFillRateDataset()
      .then((dataset) => {
        if (!cancelled) setMetadata(dataset.metadata);
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      });

    return () => { cancelled = true; };
  }, [show]);

  if (!show || isPhone) return null;

  const provenance = getFillRateProvenanceDescriptor({
    source: metadata?.source ?? 'calibrated',
    dataMode: metadata?.dataMode ?? 'recent_operational_calibration',
    statistic: metadata?.statistic ?? 'P95_5MIN_AVG',
    windowMinutes: metadata?.windowMinutes ?? 5,
    sourceDate: metadata?.sourceDate,
  });

  return (
    <div
      className="pointer-events-none absolute bottom-0.5 left-0.5 z-30 w-[272px] max-w-[calc(100vw-0.25rem)] transition-all duration-300"
      aria-hidden={false}
    >
      <div className="overflow-hidden rounded-[22px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.78)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(30,41,59,0.78))] dark:ring-slate-700/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Fill Rate (%)
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {provenance.detailLabel}
            </div>
          </div>
          <div className="rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
            {provenance.badgeLabel}
          </div>
        </div>

        <div className="mt-4">
          <div
            className="h-3 w-full rounded-full shadow-[inset_0_0_0_1px_rgba(15,23,42,0.16)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
            style={{
              background: fillRateGradientCss(),
              opacity: 0.94,
            }}
          />
          <div className="relative mt-1 h-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="absolute left-0 top-0">0%</span>
            <span className="absolute top-0 -translate-x-1/2" style={{ left: '70%' }}>70</span>
            <span className="absolute right-0 top-0">95%+</span>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-blue-600" />
            <span className="font-medium text-slate-700 dark:text-slate-200">Nominal</span>
            <span className="ml-auto text-slate-400 dark:text-slate-500">&lt; 70%</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-yellow-500" />
            <span className="font-medium text-slate-700 dark:text-slate-200">Degraded</span>
            <span className="ml-auto text-slate-400 dark:text-slate-500">70 - 95%</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-red-500" />
            <span className="font-medium text-slate-700 dark:text-slate-200">Saturated</span>
            <span className="ml-auto text-slate-400 dark:text-slate-500">&gt; 95%</span>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/55 bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-slate-700/80 dark:bg-slate-950/30 dark:text-slate-400">
          Densified statistical cells. Empty areas mean no calibrated fill-rate cell in the current dataset.
        </div>
      </div>
    </div>
  );
};

export default React.memo(FillRateLayer);
