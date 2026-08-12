import type { ReactNode } from 'react';

interface GlobalAppHeaderProps {
  children: ReactNode;
  className?: string;
  /**
   * Tailwind's cascade order (not DOM class order) decides which z-index utility
   * wins when two are present on the same element, so the base stacking class
   * can't just be appended alongside a caller override — it has to be the one
   * and only z-index utility this element ever renders. Callers that need a
   * different stacking context (e.g. dropping the header behind a fullscreen
   * layer) must go through this prop instead of `className`.
   */
  zIndexClassName?: string;
}

/**
 * The stable application-level header surface shared by every top-level mode.
 *
 * Modes own the content below this boundary, but not the placement, stacking or
 * visual treatment of global navigation. Keeping that contract here prevents a
 * peer mode from looking like a separate application.
 */
export function GlobalAppHeader({ children, className = '', zIndexClassName = 'z-[100]' }: GlobalAppHeaderProps) {
  return (
    <header
      data-global-app-header
      className={`capacity-header relative ${zIndexClassName} shrink-0 border-b border-slate-200/70 bg-white shadow-[0_8px_24px_-22px_rgba(15,23,42,0.38)] transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </header>
  );
}
