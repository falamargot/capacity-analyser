import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import {
  calculateOverlayRibbonPlacement,
  type OverlayRibbonPlacement,
} from './bottomPathRibbonPlacement';

export interface PathRibbonNode {
  label: string;
  sub?: string;
  color: string;
  dot?: string;
}

export interface PathRibbonConnector {
  topLabel?: string;
  bottomLabel?: string;
  color: string;
  dashed?: boolean;
}

export type PathRibbonItem =
  | { type: 'node'; node: PathRibbonNode }
  | { type: 'connector'; connector: PathRibbonConnector }
  | { type: 'note'; label: string };

export interface PathRibbonLegendItem {
  color: string;
  label: string;
  dashed?: boolean;
}

interface BottomPathRibbonProps {
  title: string;
  accentColor: string;
  summary?: React.ReactNode;
  items: PathRibbonItem[];
  legendItems?: PathRibbonLegendItem[];
  trailingNote?: string | null;
  pathDensity?: 'compact' | 'spacious';
  /**
   * 'overlay' (default) floats the strip over the globe canvas, as used in
   * Connectivity View. 'inline' renders as a static block for embedding in
   * a flow layout (e.g. the Engineering Analysis sidebar), with no absolute
   * positioning, dismiss button, or width clamp.
   */
  variant?: 'overlay' | 'inline';
}

const PathNode: React.FC<PathRibbonNode> = ({ label, sub, color, dot }) => (
  <div className="flex flex-col items-center gap-0.5 shrink-0">
    <div
      className="w-2.5 h-2.5 rounded-full border-2 shrink-0"
      style={{ borderColor: color, backgroundColor: dot ?? color + '55' }}
    />
    <span className="text-[10px] font-semibold text-center leading-tight whitespace-nowrap" style={{ color }}>
      {label}
    </span>
    {sub && (
      <span className="text-[9px] text-slate-500 text-center leading-tight whitespace-nowrap dark:text-slate-400">
        {sub}
      </span>
    )}
  </div>
);

const PathConnector: React.FC<PathRibbonConnector & { density?: 'compact' | 'spacious' }> = ({
  topLabel,
  bottomLabel,
  color,
  dashed,
  density = 'compact',
}) => (
  <div className={`flex flex-col items-center gap-0 flex-1 ${density === 'spacious' ? 'min-w-[8rem]' : 'min-w-[2.5rem] max-w-[5rem]'}`}>
    <span className="text-[9px] text-center leading-tight whitespace-nowrap" style={{ color }}>
      {topLabel ?? '--'}
    </span>
    <div
      className="w-full h-px my-0.5"
      style={{
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent 8px)`
          : color,
      }}
    />
    {bottomLabel && (
      <span className="text-[9px] text-slate-500 text-center leading-tight whitespace-nowrap dark:text-slate-400">
        {bottomLabel}
      </span>
    )}
  </div>
);

const LegendItem: React.FC<PathRibbonLegendItem> = ({ color, label, dashed }) => (
  <div className="flex items-center gap-1.5">
    <div
      className="w-5 h-px"
      style={{
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`
          : color,
      }}
    />
    <span className="text-[9px] text-slate-500 dark:text-slate-400">{label}</span>
  </div>
);

const BottomPathRibbon: React.FC<BottomPathRibbonProps> = ({
  title,
  accentColor,
  summary,
  items,
  legendItems = [],
  trailingNote,
  pathDensity = 'compact',
  variant = 'overlay',
}) => {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isInline = variant === 'inline';
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [overlayPlacement, setOverlayPlacement] = useState<OverlayRibbonPlacement | null>(null);

  useEffect(() => {
    if (isInline) return;

    const ribbon = overlayRef.current;
    const container = ribbon?.offsetParent as HTMLElement | null;
    if (!ribbon || !container) return;

    const updatePlacement = () => {
      const containerRect = container.getBoundingClientRect();
      const legend = container.querySelector<HTMLElement>('[data-geo-ground-site-legend]');
      const legendRight = legend
        ? legend.getBoundingClientRect().right - containerRect.left
        : null;
      const nextPlacement = calculateOverlayRibbonPlacement(
        container.clientWidth,
        legendRight,
      );

      setOverlayPlacement((currentPlacement) => {
        if (
          currentPlacement?.leftPx === nextPlacement?.leftPx
          && currentPlacement?.widthPx === nextPlacement?.widthPx
        ) {
          return currentPlacement;
        }
        return nextPlacement;
      });
    };

    updatePlacement();

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePlacement);
    resizeObserver?.observe(container);

    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(updatePlacement);
    mutationObserver?.observe(container, { childList: true, subtree: true });
    window.addEventListener('resize', updatePlacement);

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', updatePlacement);
    };
  }, [isInline]);

  if (dismissed) return null;

  return (
    <div
      ref={overlayRef}
      className={isInline
        ? 'w-full'
        : `absolute bottom-8 z-30 pointer-events-auto ${overlayPlacement ? '' : 'left-1/2 -translate-x-1/2'}`}
      style={isInline
        ? undefined
        : overlayPlacement
          ? {
              left: `${overlayPlacement.leftPx}px`,
              maxWidth: `${overlayPlacement.widthPx}px`,
              width: `${overlayPlacement.widthPx}px`,
            }
          : { maxWidth: '860px', width: 'calc(100% - 2rem)' }}
    >
      <div className={isInline
        ? 'overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/70'
        : 'overflow-hidden rounded-xl border border-white/70 bg-white/88 shadow-2xl ring-1 ring-slate-200/70 backdrop-blur-md dark:border-transparent dark:bg-slate-950/88 dark:ring-white/12'}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-3 py-1.5 dark:border-white/8">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
            <span className="text-[10px] font-semibold text-slate-700 uppercase tracking-wider dark:text-slate-300">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {summary && (
              <span className="mr-2 text-[10px] text-slate-600 dark:text-slate-400">
                {summary}
              </span>
            )}
            <button
              type="button"
              aria-label={collapsed ? 'Expand path' : 'Collapse path'}
              onClick={() => setCollapsed(c => !c)}
              className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            >
              {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {!isInline && (
              <button
                type="button"
                aria-label="Dismiss path strip"
                onClick={() => setDismissed(true)}
                className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!collapsed && (
          <div className="flex w-full items-start gap-1 px-4 py-3 overflow-x-auto">
            {items.map((item, index) => {
              if (item.type === 'node') {
                return <PathNode key={index} {...item.node} />;
              }
              if (item.type === 'connector') {
                return <PathConnector key={index} {...item.connector} density={pathDensity} />;
              }
              return (
                <div key={index} className="mx-1 flex shrink-0 items-center self-center text-[9px] italic text-slate-500 dark:text-slate-400">
                  {item.label}
                </div>
              );
            })}
          </div>
        )}

        {!collapsed && (legendItems.length > 0 || trailingNote) && (
          <div className="flex items-center gap-4 px-4 pb-2 flex-wrap">
            {legendItems.map((item) => (
              <LegendItem key={`${item.label}-${item.color}`} {...item} />
            ))}
            {trailingNote && (
              <span className="ml-auto text-[9px] italic text-slate-500 dark:text-slate-500">
                {trailingNote}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(BottomPathRibbon);
