/**
 * ModelProvenance — the evidence block of the constellation panel (UX §4.5).
 *
 * ENG uses this slot for the CelesTrak feed and its publication date. REVISIT has
 * no TLE of its own, so it carries the assumptions instead.
 *
 * ── ENGINE CLAIMS VS MODEL CLAIMS ───────────────────────────────────────────
 * The first list describes the PROPAGATOR and holds for every model: Kepler + J2,
 * the WGS84 altitude datum, and the NASA GMAT cross-check that covers the
 * trajectory across the full window. The second describes the SELECTED MODEL and
 * changes with it.
 *
 * Keeping them apart is deliberate. The GMAT line is an external authority over
 * the trajectory; the OneWeb fit is a single-epoch mean-element residual that says
 * nothing about how the model tracks the fleet over time. Collapsing the two would
 * let the stronger claim launder the weaker one.
 *
 * The fit itself is NOT here. It lives in `TleComparisonDialog`, because it
 * describes the real catalogue rather than the analysed model, and because a
 * block that can be opened and never closed does not belong in a settings
 * panel. This component states only what is true of the constellation being
 * simulated.
 */

import React from 'react';
import type { ReferenceMode, ReferenceProfile } from '../domain/referenceProfiles';
import { REVISIT_LABEL } from './revisitTheme';

export interface ModelProvenanceProps {
    mode: ReferenceMode;
    /** The named profile the current specification resolves to, when it does. */
    profile: ReferenceProfile | null;
    /** CUSTOM reached by restoring a saved scenario, not by editing (m4). */
    isRestored?: boolean;
}

/** Claims about the propagator. True for every model. */
const ENGINE_CLAIMS = [
    'Kepler + J2 secular · no drag',
    // R28. Three radii, three roles — this names the two that shape a reported
    // number. Saying only "WGS84" would hide the altitude datum, which is the
    // part that moved and the part a reader is most likely to assume wrongly.
    'WGS84 ellipsoid · altitude above R_eq 6378.137 km',
    'Propagation cross-checked vs NASA GMAT · 9 km over 72 h',
    // R29 closed this. The qualifier that stood here — "altitude datum not yet
    // GMAT-checked" — is replaced by the measurement that removed it.
    //
    // "at 1200 km" now says WHERE the check was made, because the sentence sat
    // directly above a Characteristics line reading 1198.87 km for a measured
    // shell: three altitudes on one screen, one of them a datum validation and
    // not the fleet's altitude at all.
    'Altitude datum GMAT-checked at 1200 km · engine claim, not this model’s altitude',
] as const;

export const ModelProvenance: React.FC<ModelProvenanceProps> = ({
    mode, profile, isRestored = false,
}) => (
    <div>
        <span className={REVISIT_LABEL}>Evidence</span>

        <ul className="mt-1 space-y-0.5 text-[12px] leading-4 text-slate-400">
            {ENGINE_CLAIMS.map((claim) => <li key={claim}>{claim}</li>)}
        </ul>

        <div className="mt-1.5 border-t border-slate-700/50 pt-1.5 text-[12px] leading-4">
            {mode === 'HLD' && (
                <p className="text-sky-300">
                    {profile ? `${profile.label} · v${profile.version}` : 'HLD reference profile'}
                </p>
            )}

            {mode === 'CUSTOM' && (
                /*
                 * m4. A restored scenario always reads back as CUSTOM, because the
                 * fit is not persisted and its provenance cannot be re-asserted
                 * without re-measuring. Saying "hand-entered" there would replace
                 * one lost fact with a false one, so the two cases are separated.
                 */
                isRestored ? (
                    <p
                        className="text-amber-300"
                        title="The specification was restored exactly as saved. Whether it was measured from the live fleet or entered by hand is not recorded in a saved scenario — re-measure to re-establish that."
                    >
                        Restored specification · provenance not recorded
                    </p>
                ) : (
                    <p
                        className="text-amber-300"
                        title="These numbers were entered by hand. Nothing external vouches for them — the engine claims above still hold, the constellation is yours."
                    >
                        Hand-entered · no external provenance
                    </p>
                )
            )}

        </div>
    </div>
);
