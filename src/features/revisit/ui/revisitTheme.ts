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
