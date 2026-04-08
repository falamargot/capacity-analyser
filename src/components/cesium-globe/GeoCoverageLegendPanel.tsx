import React, { useMemo, useState } from 'react';
import type { GeoCoverageLegendItem } from './CoverageLayer';

const COVERAGE_PANEL_WIDTH_CLASS = 'w-[min(13.5rem,calc(100vw-1rem))]';

interface GeoCoverageLegendPanelProps {
  items: GeoCoverageLegendItem[];
  hoveredItemKey?: string | null;
  onHoverItemChange?: (itemKey: string | null) => void;
  isPhone?: boolean;
  isFullscreen?: boolean;
  hasSatelliteIndicator?: boolean;
  hasCoverageSwitcher?: boolean;
  hideHeader?: boolean;
}

const DESKTOP_TOP_DEFAULT_PX = 56;
const DESKTOP_TOP_WITH_SATELLITE_PX = 96;
const DESKTOP_TOP_WITH_SWITCHER_PX = 88;
const DESKTOP_TOP_WITH_SWITCHER_AND_SATELLITE_PX = 136;

const getDesktopTopOffsetPx = ({
  hasSatelliteIndicator,
  hasCoverageSwitcher,
}: Pick<GeoCoverageLegendPanelProps, 'hasSatelliteIndicator' | 'hasCoverageSwitcher'>): number => {
  if (hasCoverageSwitcher) {
    return hasSatelliteIndicator
      ? DESKTOP_TOP_WITH_SWITCHER_AND_SATELLITE_PX
      : DESKTOP_TOP_WITH_SWITCHER_PX;
  }

  return hasSatelliteIndicator
    ? DESKTOP_TOP_WITH_SATELLITE_PX
    : DESKTOP_TOP_DEFAULT_PX;
};

const getModeTone = (mode: GeoCoverageLegendItem['mode']) => {
  if (mode === 'overview') {
    return {
      border: 'border-sky-300/18',
      background: 'bg-sky-400/[0.08]',
      value: 'text-sky-50',
      unit: 'text-sky-200/78',
    };
  }

  if (mode === 'dimmed') {
    return {
      border: 'border-white/8',
      background: 'bg-white/[0.03]',
      value: 'text-slate-100',
      unit: 'text-slate-300/72',
    };
  }

  return {
    border: 'border-cyan-300/16',
    background: 'bg-cyan-400/[0.08]',
    value: 'text-white',
    unit: 'text-cyan-100/78',
  };
};

const formatLevelValue = (item: GeoCoverageLegendItem): string => {
  if (typeof item.levelValue !== 'number' || Number.isNaN(item.levelValue)) {
    return item.contourLabel;
  }

  return Number.isInteger(item.levelValue)
    ? item.levelValue.toString()
    : item.levelValue.toFixed(1);
};

const GeoCoverageLegendPanel: React.FC<GeoCoverageLegendPanelProps> = ({
  items,
  hoveredItemKey = null,
  onHoverItemChange,
  isPhone = false,
  isFullscreen = false,
  hasSatelliteIndicator = false,
  hasCoverageSwitcher = false,
  hideHeader = false,
}) => {
  const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);

  const sortedItems = useMemo(() => [...items], [items]);
  const groupedItems = useMemo(() => {
    const groups = new Map<string, {
      coverageLabel: string;
      items: GeoCoverageLegendItem[];
    }>();

    for (const item of sortedItems) {
      const group = groups.get(item.coverageKey);
      if (group) {
        group.items.push(item);
        continue;
      }

      groups.set(item.coverageKey, {
        coverageLabel: item.coverageLabel,
        items: [item],
      });
    }

    return Array.from(groups.entries()).map(([coverageKey, group]) => ({
      coverageKey,
      coverageLabel: group.coverageLabel,
      items: group.items,
    }));
  }, [sortedItems]);

  const activeItemKey = focusedItemKey ?? hoveredItemKey;
  const panelZIndexClassName = isPhone && !isFullscreen ? 'z-20' : 'z-[1180]';
  const positionClassName = hasCoverageSwitcher
    ? (isPhone
        ? 'left-0.5 top-[calc(env(safe-area-inset-top)+10.7rem)]'
        : (hasSatelliteIndicator ? 'left-0.5 top-[8.5rem]' : 'left-0.5 top-[5.5rem]'))
    : hasSatelliteIndicator
      ? (isPhone
          ? (isFullscreen
              ? 'left-0.5 top-[calc(env(safe-area-inset-top)+3.95rem)]'
              : 'left-0.5 top-[calc(env(safe-area-inset-top)+8.25rem)]')
          : 'left-0.5 top-24')
      : isPhone
        ? (isFullscreen
            ? 'left-0.5 top-[calc(env(safe-area-inset-top)+0.9rem)]'
            : 'left-0.5 top-[calc(env(safe-area-inset-top)+5.25rem)]')
        : 'left-0.5 top-14';
  const desktopTopOffsetPx = getDesktopTopOffsetPx({ hasSatelliteIndicator, hasCoverageSwitcher });
  const maxPanelHeight = isPhone
    ? 'min(13rem, calc(100% - 1rem))'
    : `min(15rem, max(8rem, calc(100% - ${desktopTopOffsetPx + 20}px)))`;
  const singleGroup = groupedItems.length === 1 ? groupedItems[0] : null;
  const shouldHideHeader = hideHeader || groupedItems.length >= 2 || (!!singleGroup && hasCoverageSwitcher);

  if (sortedItems.length === 0 || (isPhone && isFullscreen)) {
    return null;
  }

  return (
    <div className={`pointer-events-none absolute ${panelZIndexClassName} max-w-[calc(100vw-0.25rem)] ${positionClassName}`}>
      <div
        className={`pointer-events-auto overflow-hidden rounded-[18px] border border-slate-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(17,24,39,0.82))] shadow-[0_22px_48px_-30px_rgba(15,23,42,0.92)] ring-1 ring-slate-700/70 backdrop-blur-xl ${COVERAGE_PANEL_WIDTH_CLASS}`}
      >
        {!shouldHideHeader && (
          <div className="border-b border-white/8 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/88">
                  Contours
                </div>
                {singleGroup ? (
                  <div className="mt-1 truncate text-[12px] font-semibold text-white">
                    {singleGroup.coverageLabel}
                  </div>
                ) : (
                  <div className="mt-1 text-[12px] font-semibold text-white">
                    Coverage Levels
                  </div>
                )}
              </div>
              <div className="shrink-0 rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[9px] font-semibold text-slate-200">
                {sortedItems.length}
              </div>
            </div>
          </div>
        )}

        <div className={`overflow-y-auto overscroll-contain ${shouldHideHeader ? 'px-1.5 py-1.5' : 'px-1.5 py-2'}`} style={{ maxHeight: maxPanelHeight }}>
          <div className="space-y-2">
            {groupedItems.map((group, groupIndex) => (
              <section
                key={group.coverageKey}
                className={groupIndex > 0 ? 'border-t border-white/8 pt-2' : ''}
              >
                {!singleGroup && (
                  <div className="mb-1 truncate px-1 text-[9px] font-medium text-slate-300/88">
                    {group.coverageLabel}
                  </div>
                )}

                <div className="flex flex-wrap gap-0.5">
                  {group.items.map((item) => {
                    const tone = getModeTone(item.mode);
                    const isActive = activeItemKey === item.key;
                    const valueText = formatLevelValue(item);
                    const showUnit = typeof item.levelValue === 'number' && item.levelUnit.trim().length > 0;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onMouseEnter={() => {
                          setFocusedItemKey(item.key);
                          onHoverItemChange?.(item.key);
                        }}
                        onMouseLeave={() => {
                          setFocusedItemKey(null);
                          onHoverItemChange?.(null);
                        }}
                        className={[
                          'group flex min-w-0 flex-col items-start justify-center rounded-[10px] border px-0.5 py-1 text-left transition-all duration-200',
                          isActive ? 'border-blue-400 bg-blue-500/[0.12] ring-1 ring-blue-300/70 shadow-[0_0_0_1px_rgba(96,165,250,0.35)]' : tone.border,
                          isActive
                            ? ''
                            : 'bg-white/[0.035] hover:bg-white/[0.07]',
                        ].join(' ')}
                        aria-label={showUnit ? `${valueText} ${item.levelUnit}` : valueText}
                      >
                        <span className="min-w-0">
                          <span className={`block truncate font-semibold tabular-nums leading-none ${showUnit ? 'text-[10px]' : 'text-[10px]'} ${isActive ? 'text-blue-50' : tone.value}`}>
                            {valueText}
                          </span>
                          {showUnit && (
                            <span className={`mt-0.5 block text-[7px] font-medium leading-none ${isActive ? 'text-blue-100/90' : tone.unit}`}>
                              {item.levelUnit}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(GeoCoverageLegendPanel);
