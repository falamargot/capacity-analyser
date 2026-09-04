/**
 * useEngineeringModeSnapshot — what survives a switch out of Engineering mode.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2, seventh slice). The three
 * functions are one protocol: capture the view before leaving, restore it on
 * return, and decide per destination mode whether anything is captured at all —
 * REVISIT unmounts the whole app and only persists the explicit telecom-session
 * contract, so a camera snapshot there would be captured into nothing.
 *
 * ── WHY THIS TOOK TWO PREPARATORY MOVES ─────────────────────────────────────
 * Measured before extracting: a faithful hook needed **40+ input fields**, most
 * of them display toggles and coverage keys with their setters. A signature
 * longer than the code it holds is not an improvement — it replaces a long
 * component with a long component plus indirection, and it would have frozen
 * that coupling into an interface.
 *
 * So the state moved first and grew capture/restore pairs of its own:
 * `useGlobeLayerToggles` (thirteen fields → two calls) and
 * `useGeoCoverageSelection` (eight → two). Only then was this worth moving.
 */

import { useCallback, useRef } from 'react';
import type { Viewer as CesiumViewerType } from 'cesium';
import {
  captureEngineeringCameraSnapshot,
  flyToEngineeringCameraSnapshot,
  type EngineeringCameraSnapshot,
} from '../utils/engineeringCameraSnapshot';
import type { GlobeLayerVisibility } from './useGlobeLayerToggles';
import type { GeoCoverageKeySet } from './useGeoCoverageSelection';
import type { LinkMode } from '../types/linkMode';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { CountryOverlayMode } from '../types/countryOverlays';
import type { AppMode } from '../hooks/useAppModeState';

/** Camera flight duration when returning to Engineering, seconds. */
const MODE_SWITCH_CAMERA_ANIMATION_SECONDS = 0.22;

export interface EngineeringModeSnapshot extends GlobeLayerVisibility, GeoCoverageKeySet {
  camera: EngineeringCameraSnapshot | null;
  satelliteScope: SatelliteScope;
  activeConnectivityTab: 'LEO' | 'GEO';
  countryOverlayMode: CountryOverlayMode;
  linkMode: LinkMode;
  leoTopologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  activeMeshTab: 'forward' | 'reverse';
}

export interface UseEngineeringModeSnapshotInput {
  appMode: AppMode;
  viewerRef: React.MutableRefObject<CesiumViewerType | null>;
  globeContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportSnapshot: { innerHeight: number };
  satelliteScope: SatelliteScope;
  activeConnectivityTab: 'LEO' | 'GEO';
  countryOverlayMode: CountryOverlayMode;
  linkMode: LinkMode;
  leoTopologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  activeMeshTab: 'forward' | 'reverse';
  captureLayerVisibility: () => GlobeLayerVisibility;
  restoreLayerVisibility: (visibility: GlobeLayerVisibility) => void;
  captureCoverageKeys: () => GeoCoverageKeySet;
  restoreCoverageKeys: (keys: GeoCoverageKeySet) => void;
  preserveSiteBCoverageKeysOnNextPointBResetRef: React.MutableRefObject<boolean>;
  preserveMeshTabOnNextLinkModeRef: React.MutableRefObject<boolean>;
  setActiveMeshTab: (tab: 'forward' | 'reverse') => void;
  setCountryOverlayMode: (mode: CountryOverlayMode) => void;
  setCommercialSelectedSegment: (segment: 'summary') => void;
  setIsMobileAnalysisPanelOpen: (open: boolean) => void;
  handleTechnologyScopeChange: (scope: SatelliteScope) => void;
  handleTechnologyChange: (tab: 'LEO' | 'GEO') => void;
  handleLinkModeChange: (mode: LinkMode) => void;
  handleLeoTopologyModeChange: (mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => void;
  handleUiModeChange: (mode: AppMode) => void;
  persistTelecomSession: () => void;
}

export function useEngineeringModeSnapshot(input: UseEngineeringModeSnapshotInput) {
  const {
    appMode, viewerRef, globeContainerRef, viewportSnapshot,
    satelliteScope, activeConnectivityTab, countryOverlayMode, linkMode, leoTopologyMode,
    activeMeshTab, captureLayerVisibility, restoreLayerVisibility,
    captureCoverageKeys, restoreCoverageKeys,
    preserveSiteBCoverageKeysOnNextPointBResetRef, preserveMeshTabOnNextLinkModeRef,
    setActiveMeshTab, setCountryOverlayMode, setCommercialSelectedSegment,
    setIsMobileAnalysisPanelOpen, handleTechnologyScopeChange, handleTechnologyChange,
    handleLinkModeChange, handleLeoTopologyModeChange, handleUiModeChange, persistTelecomSession,
  } = input;

  const engineeringModeSnapshotRef = useRef<EngineeringModeSnapshot | null>(null);

  const captureEngineeringModeSnapshot = useCallback((): EngineeringModeSnapshot => {
    const viewer = viewerRef.current;
    const viewportHeight =
      globeContainerRef.current?.getBoundingClientRect().height ??
      viewportSnapshot.innerHeight;

    return {
      camera: viewer && !viewer.isDestroyed?.()
        ? captureEngineeringCameraSnapshot(viewer, viewportHeight)
        : null,
      satelliteScope,
      activeConnectivityTab,
      ...captureLayerVisibility(),
      countryOverlayMode,
      linkMode,
      leoTopologyMode,
      activeMeshTab,
      ...captureCoverageKeys(),
    };
  }, [
    activeConnectivityTab,
    activeMeshTab,
    captureCoverageKeys,
    captureLayerVisibility,
    countryOverlayMode,
    leoTopologyMode,
    linkMode,
    satelliteScope,
    viewportSnapshot.innerHeight,
, globeContainerRef, viewerRef]);

  const restoreEngineeringModeSnapshot = useCallback((snapshot: EngineeringModeSnapshot) => {
    const linkModeWillChange = snapshot.linkMode !== linkMode;
    preserveSiteBCoverageKeysOnNextPointBResetRef.current = linkModeWillChange;
    preserveMeshTabOnNextLinkModeRef.current = linkModeWillChange;

    handleTechnologyScopeChange(snapshot.satelliteScope);
    handleTechnologyChange(snapshot.activeConnectivityTab);
    restoreLayerVisibility(snapshot);
    setCountryOverlayMode(snapshot.countryOverlayMode);
    handleLinkModeChange(snapshot.linkMode);
    handleLeoTopologyModeChange(snapshot.leoTopologyMode);
    setActiveMeshTab(snapshot.activeMeshTab);
    restoreCoverageKeys(snapshot);

    const cameraSnapshot = snapshot.camera;
    if (cameraSnapshot) {
      requestAnimationFrame(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed?.()) return;
        viewer.resize?.();
        flyToEngineeringCameraSnapshot(viewer, cameraSnapshot, MODE_SWITCH_CAMERA_ANIMATION_SECONDS);
      });
    }
  }, [handleLeoTopologyModeChange, handleLinkModeChange, handleTechnologyChange, handleTechnologyScopeChange, linkMode, setActiveMeshTab, preserveSiteBCoverageKeysOnNextPointBResetRef, restoreLayerVisibility, restoreCoverageKeys, preserveMeshTabOnNextLinkModeRef, setCountryOverlayMode, viewerRef]);

  const handleModeSwitch = useCallback((mode: AppMode) => {
    if (mode === appMode) return;

    // REVISIT is a peer view, not a skin of this one: it unmounts App entirely,
    // Persist only the explicit telecom-session contract before the runtime and
    // its Cesium viewer are destroyed.
    if (mode === 'revisit') {
      persistTelecomSession();
      handleUiModeChange(mode);
      return;
    }

    if (mode === 'commercial') {
      engineeringModeSnapshotRef.current = captureEngineeringModeSnapshot();
      setCommercialSelectedSegment('summary');
      setIsMobileAnalysisPanelOpen(false);
      handleUiModeChange(mode);
      return;
    }

    const snapshot = engineeringModeSnapshotRef.current;
    handleUiModeChange(mode);

    if (snapshot) {
      restoreEngineeringModeSnapshot(snapshot);
      engineeringModeSnapshotRef.current = null;
    }
  }, [appMode, captureEngineeringModeSnapshot, handleUiModeChange, persistTelecomSession, restoreEngineeringModeSnapshot, setCommercialSelectedSegment, setIsMobileAnalysisPanelOpen]);

  return { handleModeSwitch, captureEngineeringModeSnapshot, restoreEngineeringModeSnapshot };
}
