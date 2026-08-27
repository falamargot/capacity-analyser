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
    /** Reference target — amber in header, globe and timeline. */
    target: '#FBBF24',
    /** Comparison target — sky blue in header, globe and timeline. */
    comparison: '#38BDF8',
    /** Bright values, payload satellites. */
    bright: '#FAC775',
    /** Worst-case gap, out of view. */
    alert: '#E24B4A',
    alertSoft: '#F09595',
    /** Pass, meets target. */
    pass: '#C0DD97',
    /** Informational/calibration blue, distinct from target-role colours. */
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

/**
 * The REVISIT type scale (Programme 7D).
 *
 * Before this campaign the module used six sizes — 8, 9, 10, 11, 12 and 13 px —
 * with 104 of the ~190 occurrences at 8 or 9 px. That is legible on a laptop at
 * arm's length and not legible on a projector or in a shared Teams window,
 * which is where this tool is actually read. The audit measured it; this is the
 * single pass that fixes it, because doing it gradually produces inconsistent
 * densities and a stream of overflow regressions.
 *
 * Four sizes now, and the ordering of the old scale is preserved so no
 * hierarchy inverted:
 *
 *   8, 9 px  → 11 px   labels and dense metadata
 *   10, 11 px → 12 px  values, list rows, secondary text
 *   12, 13 px → 13 px  explanations and prose
 *   32 px    → 32 px   the one headline figure
 *
 * 11 px is the floor. Anything smaller is a decision to make something
 * unreadable in the room the tool is used in. The sizes stay inline Tailwind
 * rather than becoming tokens here: a token object nothing imports is dead
 * weight, and the scale is short enough to hold in your head.
 */
/**
 * Rounding for values that appear in more than one place (Programme 7E follow-up).
 *
 * These lived as two private constants in `RevisitHeader`. The Characteristics
 * summary in `AdvancedDrawer` interpolated the raw numbers instead, which is
 * invisible on the HLD profile — its values are already clean — and produced
 * `87.90084999999999° · 1198.8724764201825 km` beside the header's
 * `87.9° · 1199 km` the moment the model became a measured fit. Same value,
 * three renderings, one screen.
 */
export const displayAltitudeKm = (km: number): string => String(Math.round(km));
export const displayInclinationDeg = (deg: number): string => String(Number(deg.toFixed(2)));

export const REVISIT_LABEL =
    'revisit-label text-[12px] font-black uppercase tracking-[0.16em] text-slate-400';

import type { ReferenceMode } from '../domain/referenceProfiles';

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

export function modelBadge(mode: ReferenceMode | undefined): ModelBadge {
    if (mode === 'MEASURED') {
        return {
            label: 'Measured from live fleet',
            chip: 'border-sky-400/35 bg-sky-400/10 text-sky-200',
            text: 'text-sky-200',
            dot: 'bg-sky-400',
        };
    }
    if (mode === 'CUSTOM') {
        return {
            label: 'Custom constellation',
            chip: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
            text: 'text-amber-200',
            dot: 'bg-amber-400',
        };
    }
    return {
        label: 'Validated model',
        chip: 'border-lime-400/35 bg-lime-400/10 text-lime-200',
        text: 'text-lime-200',
        dot: 'bg-lime-400',
    };
}
