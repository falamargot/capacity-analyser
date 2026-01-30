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
        return '#2563eb'; // Blue - same as GEO Connectivity label
      case 'LEO':
        return '#db2777'; // Pink - same as LEO Connectivity label
      default:
        return '#000000'; // Black for ALL
    }
  };

  return (
    <div className={`flex bg-gray-100 rounded-lg ${compact ? 'p-0.5' : 'p-1'}`}>
      {scopes.map((scope) => (
        <button
          key={scope}
          onClick={() => onScopeChange(scope)}
          className={`
            rounded-md font-medium transition-all duration-200
            ${compact ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'}
            ${currentScope === scope
              ? 'bg-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }
          `}
          style={{
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
