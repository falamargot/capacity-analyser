import { memo, useCallback, useId, useState, type ReactNode } from 'react';
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
  /**
   * The scenario dimension this preference belongs to — technology, topology,
   * direction, whatever makes the section a different section (audit INT-9).
   *
   * Without it the same key governs a section across scenarios it does not
   * describe: collapsing the LEO latency breakdown in single-site mode also
   * collapsed it in site-to-site, where it lists different legs. Two GEO call
   * sites also shared one key across MESH and STAR.
   *
   * Optional, because some sections genuinely are global — a utility panel's
   * state should survive a topology switch. Omitting it keeps the old
   * behaviour, deliberately, rather than forcing a scope on every caller.
   */
  scope?: string;
  /** Section title rendered in the header. */
  title: ReactNode;
  /** Optional subtitle shown below the title in smaller text. */
  subtitle?: ReactNode;
  /** Accent color applied to the left border indicator. */
  accentColor?: string;
  /** Whether the section starts open when no persisted state exists. Default: true */
  defaultOpen?: boolean;
  /** Whether the section can be collapsed by the user. Default: true */
  collapsible?: boolean;
  /** Section body. Only mounted when expanded (no hidden DOM). */
  children: ReactNode;
}

const CollapsibleSection = memo<CollapsibleSectionProps>(({
  storageKey,
  scope,
  title,
  subtitle,
  accentColor,
  defaultOpen = true,
  collapsible = true,
  children,
}) => {
  const persistenceKey = scope ? `${scope}:${storageKey}` : storageKey;
  /*
   * State is keyed by the persistence key, not just seeded from it.
   *
   * `useState`'s initialiser runs once per MOUNT, and a topology switch
   * re-renders this same instance with a new scope — so namespacing the storage
   * key alone would have left the previous scenario's collapse on screen until
   * something unmounted the section. Re-reading during render (React's
   * documented "adjust state when a prop changes" pattern) is what makes the
   * section show what the user chose FOR THIS scenario, which is the whole
   * point of INT-9.
   */
  const [persisted, setPersisted] = useState(() => ({
    key: persistenceKey,
    open: readPersistedState(persistenceKey, defaultOpen),
  }));
  if (persisted.key !== persistenceKey) {
    setPersisted({ key: persistenceKey, open: readPersistedState(persistenceKey, defaultOpen) });
  }
  const isOpen = persisted.open;
  const setIsOpen = useCallback((update: (previous: boolean) => boolean) => {
    setPersisted((previous) => ({ key: previous.key, open: update(previous.open) }));
  }, []);
  const isExpanded = collapsible ? isOpen : true;
  const contentId = useId();
  const accessibleName = typeof title === 'string'
    ? title
    : storageKey.replaceAll('-', ' ');

  const toggle = useCallback(() => {
    if (!collapsible) return;
    setIsOpen((prev) => {
      const next = !prev;
      persistState(persistenceKey, next);
      return next;
    });
  }, [collapsible, persistenceKey, setIsOpen]);

  return (
    <div className="continuous-section bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200/70 dark:border-slate-700/70 overflow-hidden">
      <div
        className={`relative flex w-full items-center justify-between gap-3 px-3 py-2 text-left ${collapsible ? 'hover:bg-gray-100/50 dark:hover:bg-slate-700/30 transition-colors' : ''}`}
      >
        {collapsible && (
          <button
            type="button"
            onClick={toggle}
            className="absolute inset-0 z-0 w-full rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400/70"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${accessibleName}`}
          />
        )}
        <div className="pointer-events-none relative z-10 min-w-0 flex-1">
          <div className="flex items-center text-sm font-semibold text-gray-900 dark:text-gray-100" style={accentColor ? { color: accentColor } : undefined}>
            {title}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        {collapsible && (
          <span className="pointer-events-none relative z-10 flex shrink-0 items-center justify-center rounded-md p-1 text-gray-500 dark:text-gray-400" aria-hidden="true">
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </span>
        )}
      </div>
      {isExpanded && (
        <div id={contentId} className="border-t border-gray-200/70 dark:border-slate-700/70 px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
});

CollapsibleSection.displayName = 'CollapsibleSection';

export default CollapsibleSection;
