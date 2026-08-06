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
  title,
  subtitle,
  accentColor,
  defaultOpen = true,
  collapsible = true,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(() => readPersistedState(storageKey, defaultOpen));
  const isExpanded = collapsible ? isOpen : true;
  const contentId = useId();
  const accessibleName = typeof title === 'string'
    ? title
    : storageKey.replaceAll('-', ' ');

  const toggle = useCallback(() => {
    if (!collapsible) return;
    setIsOpen((prev) => {
      const next = !prev;
      persistState(storageKey, next);
      return next;
    });
  }, [collapsible, storageKey]);

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
          <div className="text-sm font-semibold flex items-center" style={accentColor ? { color: accentColor } : undefined}>
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
