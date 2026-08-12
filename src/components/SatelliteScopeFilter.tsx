import React from 'react';

export type SatelliteScope = 'ALL' | 'GEO' | 'LEO';

interface SatelliteScopeFilterProps {
  currentScope: SatelliteScope;
  onScopeChange: (scope: SatelliteScope) => void;
  compact?: boolean;
}

const SatelliteScopeFilter: React.FC<SatelliteScopeFilterProps> = ({
  currentScope,
  onScopeChange,
  compact = false,
}) => {
  const scopes: SatelliteScope[] = ['ALL', 'GEO', 'LEO'];

  const getScopeColor = (scope: SatelliteScope) => {
    switch (scope) {
      case 'GEO':
        return '#3b82f6'; // Blue-500 (lighter than 600 for better dark mode visibility)
      case 'LEO':
        return '#ec4899'; // Pink-500
      default:
        // Return null/undefined here to let class handle the color, or a neutral color
        // But the consuming component expects a color. 
        // Let's rely on the style prop only for special colors.
        return undefined; // Handled by class
    }
  };

  return (
    <div role="group" aria-label="Satellite scope" className={`${compact ? 'grid w-full grid-cols-3 rounded-[16px] p-0.5 shadow-sm' : 'flex rounded-lg p-0.5'} bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700`}>
      {scopes.map((scope) => (
        <button
          key={scope}
          type="button"
          onClick={() => onScopeChange(scope)}
          aria-label={`${scope} satellite scope`}
          aria-pressed={currentScope === scope}
          className={`
            rounded-md font-medium transition-all duration-200
            ${compact ? 'flex min-w-0 items-center justify-center rounded-[12px] px-1.5 py-1.5 text-[11px]' : 'px-4 py-2 text-sm'}
            ${currentScope === scope
              ? 'bg-white dark:bg-slate-600 shadow-sm text-gray-900 dark:text-gray-100 dark:ring-1 dark:ring-slate-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
            }
          `}
          style={{
            // Apply color only when selected, or maybe adapt for dark mode to be more visible
            color: currentScope === scope ? getScopeColor(scope) : undefined
          }}
        >
          {scope}
        </button>
      ))}
    </div>
  );
};

export default SatelliteScopeFilter;
