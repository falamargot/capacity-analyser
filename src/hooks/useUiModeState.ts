import { useCallback, useEffect, useState, useTransition } from 'react';
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

  useEffect(() => {
    if (satelliteScope === 'LEO' || satelliteScope === 'GEO') {
      setActiveConnectivityTab(satelliteScope);
    }
  }, [satelliteScope]);

  const handleUiModeChange = useCallback((mode: UiMode) => {
    startUiModeTransition(() => setUiMode(mode));
  }, []);

  const handleTechnologyChange = useCallback((technology: ActiveTechnology) => {
    setActiveConnectivityTab(technology);
  }, []);

  const handleTechnologyScopeChange = useCallback((scope: SatelliteScope) => {
    setSatelliteScope(scope);
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
