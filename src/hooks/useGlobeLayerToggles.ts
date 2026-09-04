/**
 * useGlobeLayerToggles — the globe's display switches, and their snapshot.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2). Five booleans and the
 * manual GEO coverage visibility were five separate `useState` lines in the
 * component, and every one of them appeared THREE more times: once in the
 * engineering-mode snapshot, once in its restore, and once in the snapshot's
 * dependency array.
 *
 * ── WHY THIS EXISTS, RATHER THAN A STRAIGHT MOVE OF THE SNAPSHOT ────────────
 * The mode snapshot was the next slice on the S-2 list. Measured before
 * touching it, a faithful extraction needed **40+ input fields**, half of them
 * these toggles and their setters — a hook signature longer than the code it
 * would hold, which replaces a long component with a long component plus
 * indirection.
 *
 * So the toggles move first, and they expose the two operations the snapshot
 * actually needs — `captureLayerVisibility` and `restoreLayerVisibility` —
 * instead of thirteen values and setters. The individual values and setters are
 * still returned under their original names, so the ~50 call sites across the
 * component are untouched.
 */

import { useCallback, useState } from 'react';

export interface ManualGeoCoverageVisibility {
  satelliteId: string | null;
  keys: string[];
}

/** Everything the engineering-mode snapshot has to carry about display layers. */
export interface GlobeLayerVisibility {
  showSatelliteTrajectory: boolean;
  showAggregatedConnectivity: boolean;
  showFillRateLayer: boolean;
  showFootprintProjection: boolean;
  showFlowAnimation: boolean;
  manualGeoCoverageVisibility: ManualGeoCoverageVisibility;
}

export interface GlobeLayerTogglesDefaults {
  showSatelliteTrajectory: boolean;
  showAggregatedConnectivity: boolean;
  showFootprintProjection: boolean;
  showFlowAnimation: boolean;
}

export function useGlobeLayerToggles(
  defaults: GlobeLayerTogglesDefaults,
  restoredManualVisibility?: ManualGeoCoverageVisibility | null,
) {
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(defaults.showSatelliteTrajectory);
  const [showAggregatedConnectivity, setShowAggregatedConnectivity] = useState(defaults.showAggregatedConnectivity);
  // Not part of the persisted defaults: the fill-rate layer is a diagnostic and
  // always starts off, whatever the session carried.
  const [showFillRateLayer, setShowFillRateLayer] = useState(false);
  const [showFootprintProjection, setShowFootprintProjection] = useState(defaults.showFootprintProjection);
  const [showFlowAnimation, setShowFlowAnimation] = useState(defaults.showFlowAnimation);
  const [manualGeoCoverageVisibility, setManualGeoCoverageVisibility] = useState<ManualGeoCoverageVisibility>(
    restoredManualVisibility ?? { satelliteId: null, keys: [] },
  );

  /** The keys array is copied on both sides: the snapshot must not alias live state. */
  const captureLayerVisibility = useCallback((): GlobeLayerVisibility => ({
    showSatelliteTrajectory,
    showAggregatedConnectivity,
    showFillRateLayer,
    showFootprintProjection,
    showFlowAnimation,
    manualGeoCoverageVisibility: {
      satelliteId: manualGeoCoverageVisibility.satelliteId,
      keys: [...manualGeoCoverageVisibility.keys],
    },
  }), [
    manualGeoCoverageVisibility,
    showAggregatedConnectivity,
    showFillRateLayer,
    showFlowAnimation,
    showFootprintProjection,
    showSatelliteTrajectory,
  ]);

  const restoreLayerVisibility = useCallback((visibility: GlobeLayerVisibility) => {
    setShowSatelliteTrajectory(visibility.showSatelliteTrajectory);
    setShowAggregatedConnectivity(visibility.showAggregatedConnectivity);
    setShowFillRateLayer(visibility.showFillRateLayer);
    setShowFootprintProjection(visibility.showFootprintProjection);
    setShowFlowAnimation(visibility.showFlowAnimation);
    setManualGeoCoverageVisibility({
      satelliteId: visibility.manualGeoCoverageVisibility.satelliteId,
      keys: [...visibility.manualGeoCoverageVisibility.keys],
    });
  }, []);

  return {
    showSatelliteTrajectory, setShowSatelliteTrajectory,
    showAggregatedConnectivity, setShowAggregatedConnectivity,
    showFillRateLayer, setShowFillRateLayer,
    showFootprintProjection, setShowFootprintProjection,
    showFlowAnimation, setShowFlowAnimation,
    manualGeoCoverageVisibility, setManualGeoCoverageVisibility,
    captureLayerVisibility,
    restoreLayerVisibility,
  };
}
