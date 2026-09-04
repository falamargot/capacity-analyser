import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Overlays and modals — command palette, help menu, target-sources menu,
 * satellite modal, simulation settings, desktop header collapse and the mobile
 * analysis panel.
 *
 * S-2 slice: MOVED out of `App.tsx`, not rewritten. Same state, same handlers,
 * same effects in the same relative order, same dependency arrays. The one
 * addition is `closeAllOverlays`, which names an intention that `App.tsx`
 * previously spelled out as five setter calls inside `handleResetView` — the
 * prerequisite noted in AUDIT_BACKLOG for extractions of this kind.
 *
 * Deliberately NOT moved: the `isCommandPaletteOpen → globe mode peek` effect.
 * It writes state belonging to another cluster, so it stays at the call site
 * rather than making this hook take a callback it would have to hold in a ref.
 */

export interface UseOverlayStateInput {
  isMobile: boolean;
  isFullscreen: boolean;
  hasMobileSelection: boolean;
  /** Re-runs the mobile summary reveal animation when the selection changes. */
  mobileSelectionChoreographyKey: string;
}

export function useOverlayState({
  isMobile,
  isFullscreen,
  hasMobileSelection,
  mobileSelectionChoreographyKey,
}: UseOverlayStateInput) {
  const commandPaletteSearchRef = useRef<HTMLInputElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const targetSourcesButtonRef = useRef<HTMLButtonElement>(null);
  const targetSourcesMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileAnalysisPanelOpen, setIsMobileAnalysisPanelOpen] = useState(false);
  const [isMobileAnalysisSummaryReady, setIsMobileAnalysisSummaryReady] = useState(false);
  const [isEngineeringConfigureOpen, setIsEngineeringConfigureOpen] = useState(false);
  const [engineeringHeaderConfigureFocusSignal, setEngineeringHeaderConfigureFocusSignal] = useState(0);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTargetSourcesMenuOpen, setIsTargetSourcesMenuOpen] = useState(false);
  const [isDesktopHeaderCollapsed, setIsDesktopHeaderCollapsed] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [isSimulationSettingsOpen, setIsSimulationSettingsOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    if (isFullscreen || !hasMobileSelection) {
      setIsMobileAnalysisPanelOpen(false);
    }
  }, [
    hasMobileSelection,
    isMobile,
    isFullscreen,
  ]);

  useEffect(() => {
    if (!isMobile || !hasMobileSelection) {
      setIsMobileAnalysisSummaryReady(false);
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsMobileAnalysisSummaryReady(true);
      return undefined;
    }

    setIsMobileAnalysisSummaryReady(false);
    const timeout = window.setTimeout(() => setIsMobileAnalysisSummaryReady(true), 220);
    return () => window.clearTimeout(timeout);
  }, [hasMobileSelection, isMobile, mobileSelectionChoreographyKey]);

  useEffect(() => {
    if (!isMobile || !isMobileAnalysisPanelOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, isMobileAnalysisPanelOpen]);

  const handleCloseCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
  }, []);

  const handleMobileTargetSearchFocus = useCallback(() => {
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleMobileTargetSearchChange = useCallback((value: string) => {
    setCommandPaletteQuery(value);
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleToggleTargetSourcesMenu = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setIsTargetSourcesMenuOpen((current) => !current);
  }, []);

  const handleToggleHelpMenu = useCallback(() => {
    if (!isHelpMenuOpen) {
      setIsSatelliteModalOpen(false);
      setIsTargetSourcesMenuOpen(false);
      setIsCommandPaletteOpen(false);
      setCommandPaletteQuery('');
    }
    setIsHelpMenuOpen((current) => !current);
  }, [isHelpMenuOpen]);

  const handleToggleSimulationSettings = useCallback(() => {
    setIsSimulationSettingsOpen((open) => !open);
  }, []);

  /**
   * The five dismissals `handleResetView` used to inline, in the same order.
   * `isSimulationSettingsOpen`, the mobile panel and the engineering configure
   * sheet are NOT closed here — reset view never closed them either.
   */
  const closeAllOverlays = useCallback(() => {
    setIsSatelliteModalOpen(false);
    setIsCommandPaletteOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setCommandPaletteQuery('');
    setIsHelpMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isHelpMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isHelpMenuOpen]);

  useEffect(() => {
    if (!isTargetSourcesMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        !targetSourcesMenuRef.current?.contains(event.target as Node)
        && !targetSourcesButtonRef.current?.contains(event.target as Node)
      ) {
        setIsTargetSourcesMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isTargetSourcesMenuOpen]);

  useEffect(() => {
    if (!isSatelliteModalOpen) return;
    setIsCommandPaletteOpen(false);
  }, [isSatelliteModalOpen]);

  useEffect(() => {
    if (!isDesktopHeaderCollapsed) return;
    setIsTargetSourcesMenuOpen(false);
    setIsHelpMenuOpen(false);
  }, [isDesktopHeaderCollapsed]);

  return {
    commandPaletteSearchRef,
    helpMenuRef,
    targetSourcesButtonRef,
    targetSourcesMenuRef,
    isMobileAnalysisPanelOpen,
    setIsMobileAnalysisPanelOpen,
    isMobileAnalysisSummaryReady,
    isEngineeringConfigureOpen,
    setIsEngineeringConfigureOpen,
    engineeringHeaderConfigureFocusSignal,
    setEngineeringHeaderConfigureFocusSignal,
    isSatelliteModalOpen,
    setIsSatelliteModalOpen,
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    isTargetSourcesMenuOpen,
    setIsTargetSourcesMenuOpen,
    isDesktopHeaderCollapsed,
    setIsDesktopHeaderCollapsed,
    commandPaletteQuery,
    setCommandPaletteQuery,
    isHelpMenuOpen,
    setIsHelpMenuOpen,
    isSimulationSettingsOpen,
    setIsSimulationSettingsOpen,
    handleCloseCommandPalette,
    handleMobileTargetSearchFocus,
    handleMobileTargetSearchChange,
    handleToggleTargetSourcesMenu,
    handleToggleHelpMenu,
    handleToggleSimulationSettings,
    closeAllOverlays,
  };
}
