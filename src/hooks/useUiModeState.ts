import { useCallback, useState } from 'react';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';

/**
 * The two skins of the main application.
 *
 * The mode ITSELF is no longer owned here — it was lifted to `useAppModeState`
 * at the root so a third peer view (REVISIT) can unmount `<App/>` entirely
 * rather than mount inside it (ADR-001 §4, audit §5.1). What stays behind is
 * scope and technology focus, which are ENG/COMM concepts with no meaning
 * outside this application.
 */
export type UiMode = 'engineering' | 'commercial';
export type ActiveTechnology = 'LEO' | 'GEO';

export const useUiModeState = () => {
  const [satelliteScope, setSatelliteScope] = useState<SatelliteScope>('ALL');
  const [activeConnectivityTab, setActiveConnectivityTab] = useState<ActiveTechnology>('LEO');

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
    activeTechnology: activeConnectivityTab,
    technologyScope: satelliteScope,
    satelliteScope,
    activeConnectivityTab,
    setActiveTechnology: setActiveConnectivityTab,
    setTechnologyScope: setSatelliteScope,
    setSatelliteScope,
    setActiveConnectivityTab,
    handleTechnologyChange,
    handleTechnologyScopeChange,
  };
};
