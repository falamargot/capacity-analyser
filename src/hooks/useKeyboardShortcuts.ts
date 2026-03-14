import { useEffect } from 'react';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';

interface KeyboardShortcutsConfig {
  onScopeChange: (scope: SatelliteScope) => void;
  onToggleFullscreen: () => void;
  onOpenCommandPalette: () => void;
  onResetView: () => void;
  /** Disable shortcuts when an input/textarea/select is focused */
  enabled?: boolean;
}

const useKeyboardShortcuts = ({
  onScopeChange,
  onToggleFullscreen,
  onOpenCommandPalette,
  onResetView,
  enabled = true,
}: KeyboardShortcutsConfig) => {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Cmd+K / Ctrl+K — command palette (always active, even in inputs)
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        onOpenCommandPalette();
        return;
      }

      // Skip remaining shortcuts when an input/textarea/select is focused
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      switch (key) {
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

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [enabled, onScopeChange, onToggleFullscreen, onOpenCommandPalette, onResetView]);
};

export default useKeyboardShortcuts;
