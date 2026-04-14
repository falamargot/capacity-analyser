import { memo } from 'react';
import type { LinkMode } from '../../types/linkMode';
import { LINK_MODE_LABELS, LINK_MODE_REQUIRES_POINT_B } from '../../types/linkMode';

interface LinkModeSelectorProps {
  linkMode: LinkMode;
  onChange: (mode: LinkMode) => void;
  /** When true, the second point has not been selected yet (shows a prompt). */
  awaitingPointB?: boolean;
  disabled?: boolean;
}

const MODES: LinkMode[] = ['STAR_FORWARD', 'STAR_RETURN', 'MESH', 'POINT_TO_POINT'];

const LinkModeSelector = memo<LinkModeSelectorProps>(({
  linkMode,
  onChange,
  awaitingPointB = false,
  disabled = false,
}) => {
  const needsPointB = LINK_MODE_REQUIRES_POINT_B.has(linkMode);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Link Mode
        </span>
      </div>

      {/* Mode buttons — 2 × 2 grid */}
      <div className="grid grid-cols-2 gap-1">
        {MODES.map((mode) => {
          const isActive = linkMode === mode;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange(mode)}
              className={[
                'px-2 py-1.5 rounded text-xs font-medium transition-colors text-left leading-tight',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {LINK_MODE_LABELS[mode]}
            </button>
          );
        })}
      </div>

      {/* Second-point prompt for MESH / P2P */}
      {needsPointB && awaitingPointB && (
        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0 animate-pulse" />
          <span className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
            Hold <strong>Shift</strong> and click on the globe to set <strong>Point B</strong>
          </span>
        </div>
      )}

      {/* Point B set confirmation */}
      {needsPointB && !awaitingPointB && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
          <span className="text-xs text-green-800 dark:text-green-300 leading-snug">
            Two points selected. Click the globe without <strong>Shift</strong> to reset Point A.
          </span>
        </div>
      )}
    </div>
  );
});

LinkModeSelector.displayName = 'LinkModeSelector';
export default LinkModeSelector;
