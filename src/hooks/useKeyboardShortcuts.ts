import { useEffect } from 'react';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';

interface KeyboardShortcutsConfig {
  onScopeChange: (scope: SatelliteScope) => void;
  onToggleFullscreen: () => void;
  onToggleHelpPanel: () => void;
  onToggleEntryPointPanel: () => void;
  onResetView: () => void;
  /** Close the active overlay without invoking the destructive view reset. */
  onDismissOverlay?: () => void;
  onModePeekChange?: (pressed: boolean) => void;
  /** While true, only Escape remains active and dismisses the overlay. */
  overlayOpen?: boolean;
  /** Disable shortcuts when an input/textarea/select is focused */
  enabled?: boolean;
}

const useKeyboardShortcuts = ({
  onScopeChange,
  onToggleFullscreen,
  onToggleHelpPanel,
  onToggleEntryPointPanel,
  onResetView,
  onDismissOverlay,
  onModePeekChange,
  overlayOpen = false,
  enabled = true,
}: KeyboardShortcutsConfig) => {
  useEffect(() => {
    if (!enabled) return;

    const isEditableTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      const tag = element?.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!element?.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

      // Modal/inspector ownership takes precedence over the global shortcut
      // layer. In particular, Escape must dismiss the overlay and must never
      // fall through to the scenario-reset command.
      if (overlayOpen) {
        if (key === 'escape') {
          e.preventDefault();
          onDismissOverlay?.();
        }
        return;
      }

      // Cmd+K / Ctrl+K — keyboard shortcuts help (always active, even in inputs)
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        onToggleHelpPanel();
        return;
      }

      // Cmd+S on macOS / Ctrl+S on non-macOS — open entry point panel
      if (((isMac && e.metaKey) || (!isMac && e.ctrlKey)) && key === 's') {
        e.preventDefault();
        onToggleEntryPointPanel();
        return;
      }

      // Skip remaining shortcuts when an input/textarea/select is focused
      if (isEditableTarget(e.target)) return;

      switch (key) {
        case 's':
          if (!e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            if (!e.repeat) onModePeekChange?.(true);
          }
          break;
        case '1':
          e.preventDefault();
          onScopeChange('ALL');
          break;
        case '2':
          e.preventDefault();
          onScopeChange('LEO');
          break;
        case '3':
          e.preventDefault();
          onScopeChange('GEO');
          break;
        case 'f':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onToggleFullscreen();
          }
          break;
        case 'escape':
          e.preventDefault();
          onResetView();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 's') {
        onModePeekChange?.(false);
      }
    };

    const handleBlur = () => {
      onModePeekChange?.(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [
    enabled,
    onDismissOverlay,
    onModePeekChange,
    onResetView,
    onScopeChange,
    onToggleEntryPointPanel,
    onToggleFullscreen,
    onToggleHelpPanel,
    overlayOpen,
  ]);
};

export default useKeyboardShortcuts;
