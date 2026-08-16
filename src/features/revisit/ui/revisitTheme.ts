/**
 * revisitTheme.ts — the amber identity (UX §3).
 *
 * The charter gives GEO a stable blue/cyan identity and LEO a dynamic
 * magenta/violet one. REVISIT takes amber/orange: the payload is an infrared
 * sensor and amber is the thermal colour, it collides with neither existing
 * mode, and it signals at a glance that the user has left the telecom world for
 * Earth observation.
 *
 * Known adjacency: amber is already used for `Monitoring` markers in the GEO
 * GROUND SITES legend. No real collision — those markers do not exist in
 * REVISIT — but it is the first place a conflict would surface.
 *
 * One definition of each colour, consumed by both the DOM and Cesium, so the
 * globe and the panels can never drift apart.
 */

export const REVISIT_COLORS = {
    /** Accent, borders, active toolbar. */
    accent: '#EF9F27',
    /** Ground target — white so it remains distinct from amber orbital evidence. */
    target: '#FFFFFF',
    /** Bright values, payload satellites. */
    bright: '#FAC775',
    /** Worst-case gap, out of view. */
    alert: '#E24B4A',
    alertSoft: '#F09595',
    /** Pass, meets target. */
    pass: '#C0DD97',
    /** Reference and calibration notes. */
    reference: '#7DD3FC',
    /** The host fleet — dim grey-blue, deliberately recessive. */
    hostFleet: '#7C8BA1',
} as const;

/** Tailwind-ish class fragments reused across the REVISIT panels. */
export const REVISIT_PANEL =
    'revisit-panel rounded-xl border border-amber-500/25 bg-slate-950/80 backdrop-blur-sm shadow-lg';

/**
 * Menus, popovers and dialogs that float above the shell. Themed through one
 * CSS token so they cannot open as a dark sheet in the light theme — which also
 * kept every label inside them readable (see `index.css`).
 */
export const REVISIT_MENU_SURFACE = 'revisit-menu-surface backdrop-blur-md';

/** Recessed surfaces inside a panel — segmented controls, wells. */
export const REVISIT_INSET_SURFACE = 'revisit-inset-surface';

export const REVISIT_LABEL =
    'revisit-label text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';

/**
 * The model badge — one vocabulary, two surfaces (header chip and sidebar
 * summary), so they cannot drift apart.
 *
 * The distinction the badge must carry is PROVENANCE, not quality. Before the
 * third state existed, adopting a live-TLE fit dropped the badge to the amber
 * "Custom constellation" fallback, because `referenceProfileFor` resolves a
 * named profile by exact structural equality and a fit never reproduces a
 * profile's per-plane ladder, seam and spares. Pressing the button that makes
 * the model MORE faithful to the real fleet therefore read as a downgrade.
 *
 * "Custom" now means what it says: someone edited a parameter by hand.
 */
export interface ModelBadge {
    label: string;
    /** Header chip: border, background and text in one string. */
    chip: string;
    /** Sidebar summary: text colour only. */
    text: string;
    dot: string;
}

export function modelBadge(
    profile: { isAuthoritative: boolean } | null | undefined,
    isMeasuredShell: boolean,
): ModelBadge {
    if (isMeasuredShell) {
        return {
            label: 'Measured from live fleet',
            chip: 'border-sky-400/35 bg-sky-400/10 text-sky-200',
            text: 'text-sky-200',
            dot: 'bg-sky-400',
        };
    }
    if (profile?.isAuthoritative) {
        return {
            label: 'Validated model',
            chip: 'border-lime-400/35 bg-lime-400/10 text-lime-200',
            text: 'text-lime-200',
            dot: 'bg-lime-400',
        };
    }
    return {
        label: profile ? 'Illustrative model' : 'Custom constellation',
        chip: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
        text: 'text-amber-200',
        dot: 'bg-amber-400',
    };
}
