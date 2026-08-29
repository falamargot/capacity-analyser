/**
 * revisitTheme.ts — semantic colours shared by DOM and Cesium.
 *
 * REVISIT uses role colours rather than one module-wide accent: amber identifies
 * Reference, blue identifies Comparison, and neutral white/slate identifies the
 * shared payload system. Green and red remain reserved for outcome semantics.
 *
 * One definition of each colour, consumed by both the DOM and Cesium, so the
 * globe and the panels can never drift apart.
 */

export const REVISIT_COLORS = {
    /** Performance midpoint and caution state — never payload identity. */
    accent: '#EF9F27',
    /** Primary target — amber in header, globe and timeline. */
    target: '#FBBF24',
    /** Secondary target — sky blue in header, globe and timeline. */
    comparison: '#38BDF8',
    /** Payload-equipped satellites and sensor geometry: neutral, target-agnostic. */
    payload: '#F8FAFC',
    /** Payload orbit planes: visible but subordinate to satellites and targets. */
    payloadOrbit: '#CBD5E1',
    /** Valid measured result that does not meet the customer requirement. */
    miss: '#F97316',
    /** Softer end of the finite-miss ramp used by area cells. */
    missSoft: '#FDBA74',
    /** Technical error or observation impossibility such as never-in-view. */
    alert: '#E24B4A',
    alertSoft: '#F09595',
    /** Pass, meets target. */
    pass: '#C0DD97',
    /** Comfortable pass, used at the strong end of the area scale. */
    passStrong: '#65A30D',
    /** Informational/calibration blue, distinct from target-role colours. */
    reference: '#7DD3FC',
    /** The host fleet — dim grey-blue, deliberately recessive. */
    hostFleet: '#7C8BA1',
} as const;

/**
 * Shared outcome vocabulary for DOM badges and compact verdicts.
 *
 * Target identity (amber/blue) must never encode success. Conversely, these
 * classes must never identify Reference or Comparison. Keeping the four states
 * here prevents the desktop card, mobile strip and comparison table drifting.
 */
export const REVISIT_OUTCOME = {
    meets: {
        badge: 'border-lime-400/40 bg-lime-500/15 text-lime-200',
        text: 'text-lime-300',
    },
    misses: {
        badge: 'border-orange-400/40 bg-orange-500/15 text-orange-200',
        text: 'text-orange-300',
    },
    unavailable: {
        badge: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
        text: 'text-slate-500',
    },
    error: {
        badge: 'border-red-400/40 bg-red-500/15 text-red-200',
        text: 'text-red-300',
    },
} as const;

/** Tailwind-ish class fragments reused across the REVISIT panels. */
export const REVISIT_PANEL =
    'revisit-panel rounded-xl border border-slate-700/70 bg-slate-950/80 backdrop-blur-sm shadow-lg';

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
 * The distinction the badge must carry is PROVENANCE, not quality, and there
 * are exactly two provenances: the published HLD reference, or the user's own
 * numbers. A third state existed while the live-TLE fit could be adopted as the
 * analysed reference; it was removed with the adoption itself, because a fitted
 * shell presented alongside the HLD reads as a second, comparable constellation
 * when it is a diagnostic (decision D2, 2026-08-29).
 *
 * "Validated model" was also retired here: it conflated validation of the
 * PROPAGATOR (real — GMAT, SGP4) with authority of the HLD DATA (partly
 * assumed, e.g. the spare distribution).
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
    if (mode === 'CUSTOM') {
        return {
            label: 'Custom constellation',
            chip: 'border-amber-400/35 bg-amber-400/10 text-amber-200',
            text: 'text-amber-200',
            dot: 'bg-amber-400',
        };
    }
    return {
        label: 'HLD reference profile',
        chip: 'border-lime-400/35 bg-lime-400/10 text-lime-200',
        text: 'text-lime-200',
        dot: 'bg-lime-400',
    };
}
