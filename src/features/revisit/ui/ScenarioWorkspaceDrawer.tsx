import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { REVISIT_MENU_SURFACE } from './revisitTheme';

interface ScenarioWorkspaceDrawerProps {
    onClose: () => void;
    children: React.ReactNode;
}

/**
 * A real application-level drawer: it does not consume analysis-column space
 * and is portalled above the Cesium canvas. Focus is contained while open and
 * restored to the launcher when it closes.
 */
export const ScenarioWorkspaceDrawer: React.FC<ScenarioWorkspaceDrawerProps> = ({
    onClose, children,
}) => {
    const panelRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const returnFocusTo = document.activeElement instanceof HTMLElement
            ? document.activeElement : null;
        const panel = panelRef.current;
        panel?.querySelector<HTMLElement>('[data-drawer-autofocus]')?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !panel) return;
            const focusable = [...panel.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
                + 'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )].filter((element) => !element.hidden && element.offsetParent !== null);
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            returnFocusTo?.focus();
        };
    }, [onClose]);

    if (typeof document === 'undefined') return null;
    return createPortal(
        /*
         * `revisit-shell` is the theming scope, and this drawer is portalled to
         * `document.body` — outside the shell element. Without the class none of
         * the light-theme overrides in `index.css` reached it, so the workspace
         * rendered dark-stage text colours whatever the theme said.
         *
         * The surface has to follow, or the fix is worse than the defect: light
         * foreground tokens on a hard-coded dark panel measured 2.56:1 and the
         * Axe gate rejected 129 nodes. So the panel uses the shared
         * `revisit-menu-surface` token rather than a fixed `#070c18`
         * (Programme 7E).
         */
        <div className="revisit-shell fixed inset-0 z-[100]" data-testid="scenario-workspace-drawer">
            <button
                type="button"
                aria-label="Dismiss scenario workspace"
                onClick={onClose}
                className="absolute inset-0 h-full w-full cursor-default bg-slate-950/65 backdrop-blur-[2px]"
            />
            <aside
                ref={panelRef}
                id="revisit-scenario-workspace-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="revisit-scenario-workspace-title"
                className={`absolute inset-y-0 left-0 flex w-full max-w-[27rem] flex-col border-r border-sky-400/25 text-slate-100 shadow-[18px_0_50px_rgba(0,0,0,0.5)] ${REVISIT_MENU_SURFACE}`}
            >
                <header className="flex items-start justify-between gap-4 border-b border-slate-700/70 px-4 py-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-300">REVISIT</p>
                        <h2 id="revisit-scenario-workspace-title" className="mt-1 text-base font-black uppercase tracking-[0.08em]">
                            Scenario workspace
                        </h2>
                        <p className="mt-1 text-[12px] leading-4 text-slate-400">
                            Save, restore and share complete Points or Area demonstrations.
                        </p>
                    </div>
                    <button
                        type="button"
                        data-drawer-autofocus
                        onClick={onClose}
                        aria-label="Close scenario workspace"
                        className="min-h-10 min-w-10 rounded border border-slate-700 text-lg text-slate-300 hover:border-sky-400/50 hover:text-white"
                    >×</button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    {children}
                </div>
            </aside>
        </div>,
        document.body,
    );
};
