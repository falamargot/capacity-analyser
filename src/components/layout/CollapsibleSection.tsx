import { memo, useCallback, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

// ─── localStorage-backed persistence ──────────────────────────────────────────
// Each section gets a unique storageKey. Collapsed/expanded state survives
// page reloads so engineers don't have to re-open the same sections every time.

const STORAGE_PREFIX = 'collapsible:';

function readPersistedState(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

function persistState(key: string, open: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, open ? '1' : '0');
  } catch {
    // quota exceeded — ignore silently
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  /** Unique key used for localStorage persistence. Must be stable across renders. */
  storageKey: string;
  /** Section title rendered in the header. */
  title: ReactNode;
  /** Optional subtitle shown below the title in smaller text. */
  subtitle?: ReactNode;
  /** Accent color applied to the left border indicator. */
  accentColor?: string;
  /** Whether the section starts open when no persisted state exists. Default: true */
  defaultOpen?: boolean;
  /** Section body. Only mounted when expanded (no hidden DOM). */
  children: ReactNode;
}

const CollapsibleSection = memo<CollapsibleSectionProps>(({
  storageKey,
  title,
  subtitle,
  accentColor,
  defaultOpen = true,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(() => readPersistedState(storageKey, defaultOpen));

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      persistState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-100/50 dark:hover:bg-slate-700/30 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold flex items-center" style={accentColor ? { color: accentColor } : undefined}>
            {title}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
});

CollapsibleSection.displayName = 'CollapsibleSection';

export default CollapsibleSection;
