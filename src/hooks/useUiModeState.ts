import { useCallback, useState, useTransition } from 'react';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';

export type UiMode = 'engineering' | 'commercial';
export type ActiveTechnology = 'LEO' | 'GEO';

export const useUiModeState = () => {
  const [satelliteScope, setSatelliteScope] = useState<SatelliteScope>('ALL');
  const [activeConnectivityTab, setActiveConnectivityTab] = useState<ActiveTechnology>('LEO');
  const [uiMode, setUiMode] = useState<UiMode>('engineering');
  // isPending is true for exactly the transition render where uiMode just changed.
  // Used to skip buildGeoRouteAnalysisViewModel during mode switches so Cesium's
  // rAF loop is not blocked by the expensive computation during the switch frame.
  const [isUiModeTransitionPending, startUiModeTransition] = useTransition();

  const handleUiModeChange = useCallback((mode: UiMode) => {
    startUiModeTransition(() => setUiMode(mode));
  }, []);

  // Scope and technology focus are coupled: scope is either ALL or equal to the
  // active technology. Both handlers maintain the invariant synchronously so no
  // render ever observes scope and focus disagreeing.
  const handleTechnologyChange = useCallback((technology: ActiveTechnology) => {
    setActiveConnectivityTab(technology);
    setSatelliteScope((current) => (current === 'ALL' ? current : technology));
  }, []);

  const handleTechnologyScopeChange = useCallback((scope: SatelliteScope) => {
    setSatelliteScope(scope);
    if (scope === 'LEO' || scope === 'GEO') {
      setActiveConnectivityTab(scope);
    }
  }, []);

  return {
    uiMode,
    commercialMode: uiMode === 'commercial',
    activeTechnology: activeConnectivityTab,
    technologyScope: satelliteScope,
    satelliteScope,
    activeConnectivityTab,
    isUiModeTransitionPending,
    startUiModeTransition,
    setUiMode,
    setActiveTechnology: setActiveConnectivityTab,
    setTechnologyScope: setSatelliteScope,
    setSatelliteScope,
    setActiveConnectivityTab,
    handleUiModeChange,
    handleTechnologyChange,
    handleTechnologyScopeChange,
  };
};
