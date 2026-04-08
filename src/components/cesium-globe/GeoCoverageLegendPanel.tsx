import React, { useMemo, useState } from 'react';
import type { GeoCoverageLegendItem } from './CoverageLayer';

interface GeoCoverageLegendPanelProps {
  items: GeoCoverageLegendItem[];
  hoveredItemKey?: string | null;
  onHoverItemChange?: (itemKey: string | null) => void;
  isPhone?: boolean;
  isFullscreen?: boolean;
  hasSatelliteIndicator?: boolean;
  hasCoverageSwitcher?: boolean;
}

const getModeTone = (mode: GeoCoverageLegendItem['mode']) => {
  if (mode === 'overview') {
    return {
      dot: 'bg-sky-300',
      ring: 'shadow-[0_0_0_1px_rgba(125,211,252,0.18)]',
      text: 'text-sky-50',
      unit: 'text-sky-200/72',
    };
  }

  if (mode === 'dimmed') {
    return {
      dot: 'bg-slate-300',
      ring: 'shadow-[0_0_0_1px_rgba(203,213,225,0.12)]',
      text: 'text-slate-100',
      unit: 'text-slate-300/68',
    };
  }

  return {
    dot: 'bg-cyan-300',
    ring: 'shadow-[0_0_0_1px_rgba(103,232,249,0.18)]',
    text: 'text-white',
    unit: 'text-cyan-100/76',
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
}) => {
  const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);

  const sortedItems = useMemo(
    () => [...items],
    [items],
  );
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
  const shouldCollapseSingleCoverage = hasCoverageSwitcher && groupedItems.length === 1;
  const panelZIndexClassName = isPhone && !isFullscreen ? 'z-20' : 'z-[1180]';
  const positionClassName = hasCoverageSwitcher
    ? (isPhone
        ? 'left-2 top-[calc(env(safe-area-inset-top)+11.25rem)]'
        : (hasSatelliteIndicator ? 'left-2 top-36' : 'left-2 top-24'))
    : hasSatelliteIndicator
      ? (isPhone
          ? (isFullscreen
              ? 'left-2 top-[calc(env(safe-area-inset-top)+3.95rem)]'
              : 'left-2 top-[calc(env(safe-area-inset-top)+8.25rem)]')
          : 'left-2 top-24')
      : isPhone
        ? (isFullscreen
            ? 'left-2 top-[calc(env(safe-area-inset-top)+0.9rem)]'
            : 'left-2 top-[calc(env(safe-area-inset-top)+5.25rem)]')
        : 'left-2 top-14';

  if (sortedItems.length === 0 || (isPhone && isFullscreen)) {
    return null;
  }

  return (
    <div className={`pointer-events-none absolute ${panelZIndexClassName} max-w-[calc(100vw-1rem)] ${positionClassName}`}>
      <div className={`pointer-events-auto inline-block max-w-[min(18rem,calc(100vw-1rem))] ${isPhone ? 'max-w-[min(14rem,calc(100vw-1rem))]' : ''}`}>
        <div className="relative px-2 py-2">
          <div className="pointer-events-none absolute bottom-2 left-[0.8rem] top-2 w-px bg-[linear-gradient(180deg,rgba(148,163,184,0),rgba(148,163,184,0.42),rgba(148,163,184,0))]" />

          <div className="space-y-3">
            {groupedItems.map((group, groupIndex) => (
              <section
                key={group.coverageKey}
                className={groupIndex > 0 ? 'border-t border-white/7 pt-3' : ''}
              >
                {!shouldCollapseSingleCoverage && (
                  <div className="mb-2 pl-4">
                    <div className="truncate text-[10px] font-medium leading-4 text-slate-100/84">
                      {group.coverageLabel}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
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
                          'group relative flex w-full items-center gap-2.5 rounded-[14px] py-1.5 pl-3 pr-2 text-left transition-all duration-200',
                          isActive
                            ? `bg-white/[0.08] ${tone.ring}`
                            : 'hover:bg-white/[0.04]',
                        ].join(' ')}
                        aria-label={showUnit ? `${valueText} ${item.levelUnit}` : valueText}
                      >
                        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                          <span className={`h-1.5 w-1.5 rounded-full transition-all duration-200 ${tone.dot} ${isActive ? 'scale-125' : 'scale-100 opacity-72 group-hover:opacity-100'}`} />
                        </span>

                        <span className="min-w-0">
                          <span className={`font-semibold tabular-nums leading-none ${showUnit ? 'text-[16px]' : 'text-[13px]'} ${tone.text}`}>
                            {valueText}
                          </span>
                          {showUnit && (
                            <span className={`ml-1.5 text-[9px] font-medium leading-none ${tone.unit}`}>
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
