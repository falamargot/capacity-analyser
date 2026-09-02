/**
 * StageControls — globe display controls only.
 *
 * Navigation lives in the application header, and scenario management is its
 * own launcher directly beneath this panel on the stage rail. This overlay is
 * therefore unambiguous: every control inside it changes only what is drawn on
 * the globe.
 *
 * ── WHY IT COLLAPSES BELOW `md` ─────────────────────────────────────────────
 * On a desktop the column stays expanded, so its state is always visible — that
 * is the point of putting it on the stage rather than behind a menu.
 *
 * A phone cannot afford it. Five 44 px touch targets are ~250 px of opaque
 * panel on an 844 px screen, and the consequences were not cosmetic: the stack
 * came to rest over the footer and hid `Pause` behind `Auto-rotate globe`, so a
 * presenter could not stop the simulation at all; and the unobstructed,
 * directly hit-testable globe the compact layout exists for (mobile UX plan §2,
 * gated at 360 px in `mode-smoke`) was down to 260 px.
 *
 * So below `md` it is a closed disclosure with a 44 px summary, and at `md` and
 * above the summary disappears and the column renders exactly as before. The
 * open state is seeded from the breakpoint at mount, the same way
 * `RecommendedEvidenceDisclosure` does it — one pattern for "expanded on a
 * desktop, one tap away on a phone" rather than two.
 */

import React from 'react';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

export interface StageToggle<K extends string> {
    key: K;
    label: string;
    hint?: string;
}

export interface StageControlsProps<K extends string> {
    toggles: ReadonlyArray<StageToggle<K>>;
    toggleState: Record<K, boolean>;
    onToggle: (key: K) => void;
}

const GROUP_BUTTON =
    'min-h-11 rounded-md px-2.5 py-1 text-left text-[12px] font-black uppercase '
    + 'tracking-[0.12em] transition-colors md:min-h-0';

export function StageControls<K extends string>({
    toggles, toggleState, onToggle,
}: StageControlsProps<K>) {
    const [open, setOpen] = React.useState(() => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(min-width: 768px)').matches
    ));
    /*
     * How many toggles are on, for the collapsed summary. Without it the phone
     * summary would hide the very state this panel exists to report.
     */
    const activeCount = toggles.filter(({ key }) => toggleState[key]).length;

    return (
        <details
            id="revisit-stage-controls"
            data-revisit-stage-controls
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
            className={`pointer-events-auto ${REVISIT_PANEL} w-auto max-w-[min(15rem,calc(100vw-1rem))] p-1.5 md:w-[min(15rem,calc(100vw-1rem))]`}
        >
            <summary
                className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-1 md:hidden"
                title="What is drawn on the globe"
            >
                <span className={REVISIT_LABEL}>Display</span>
                <span className="text-[11px] font-black tabular-nums text-slate-500">
                    {activeCount}/{toggles.length}
                </span>
            </summary>

            {/* The heading the phone gets from its `summary`, which is
                `md:hidden`. Above `md` the rail was six unheaded buttons over the
                globe: the reader had to infer from the words that they draw
                things rather than change the analysis. */}
            <div className={`${REVISIT_LABEL} hidden px-1 pb-1 md:block`}>Display</div>

            <div className="flex flex-col gap-1">
                {toggles.map(({ key, label, hint }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onToggle(key)}
                        aria-pressed={toggleState[key]}
                        title={hint}
                        className={`${GROUP_BUTTON} flex items-center gap-2 ${toggleState[key]
                            ? 'bg-white/10 text-slate-100'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                    >
                        {/* On and off differed only by ink weight, which is the
                            same difference as "this label is longer". A filled
                            dot against a hollow ring states the state itself,
                            and does not depend on colour alone. */}
                        <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full border ${toggleState[key]
                                ? 'border-lime-300 bg-lime-300'
                                : 'border-slate-500 bg-transparent'}`}
                        />
                        <span className="truncate">{label}</span>
                    </button>
                ))}
            </div>
        </details>
    );
}
