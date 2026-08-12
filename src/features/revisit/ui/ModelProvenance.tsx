/**
 * ModelProvenance — the credibility slot (UX §4.5), and the easiest to
 * underestimate.
 *
 * ENG uses this slot for the CelesTrak feed and its publication date. REVISIT
 * has no TLE of its own, so it carries the assumptions instead — and then, once
 * calibrated, the line that converts the mode from a simulation into evidence:
 *
 *     Fit vs OneWeb TLE · 12 km RMS
 *
 * The residual is stated in kilometres because that is the unit an engineer in
 * the room can sanity-check against a satellite's own dimensions and orbital
 * speed. A non-zero residual is the expected, honest outcome: a real fleet is
 * never a perfect Walker.
 */

import React from 'react';
import type { WalkerFit } from '../calibration/fitWalker';
import type { WalkerSpec } from '../domain/types';
import { fitMatchesReference, type ReferenceProfile } from '../domain/referenceProfiles';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface ModelProvenanceProps {
    reference: WalkerSpec;
    /** Which named profile the reference came from. */
    profile: ReferenceProfile | null;
    fit: WalkerFit | null;
    isRunning: boolean;
    error: string | null;
    onCalibrate: () => void;
    /** Adopt the fitted shell as the reference constellation. */
    onAdoptFit: (spec: WalkerSpec) => void;
}

export const ModelProvenance: React.FC<ModelProvenanceProps> = ({
    reference, profile, fit, isRunning, error, onCalibrate, onAdoptFit,
}) => {
    const matchesFit = Boolean(fit && fitMatchesReference(fit.spec, reference));
    const summaryLabel = profile?.isAuthoritative
        ? 'Validated model'
        : profile
            ? 'Illustrative model'
            : 'Custom constellation';
    const summaryTone = profile?.isAuthoritative ? 'text-lime-200' : 'text-amber-200';
    const dotTone = profile?.isAuthoritative ? 'bg-lime-400' : 'bg-amber-400';

    return (
        <details className={`${REVISIT_PANEL} group px-3 py-2`}>
            <summary className="flex min-h-7 cursor-pointer list-none items-center justify-between gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
                <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${dotTone}`} aria-hidden="true" />
                    <span className={`${REVISIT_LABEL} ${summaryTone}`}>{summaryLabel}</span>
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500 group-open:hidden">
                    details
                </span>
                <span className="hidden text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500 group-open:inline">
                    close
                </span>
            </summary>
            <div className="mt-2 border-t border-slate-700/50 pt-2">
            <span className={REVISIT_LABEL}>Model provenance</span>
            <ul className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-400">
                {/*
                  * R29. Which constellation, and is it meant to be real. An
                  * illustrative shell that produces plausible-looking numbers is
                  * more dangerous than one that produces obviously fake numbers,
                  * because nothing else on screen distinguishes them.
                  */}
                <li className={profile?.isAuthoritative ? 'text-sky-300' : 'text-amber-300'}>
                    {profile ? `${profile.label} · v${profile.version}` : 'Custom constellation'}
                    {!profile?.isAuthoritative && (
                        <span className="block text-amber-200/70">
                            {profile ? 'illustrative — not a real constellation' : 'not a named reference profile'}
                        </span>
                    )}
                </li>
                <li>Kepler + J2 secular · no drag</li>
                {/*
                  * R28. Three radii, three roles — the line names the two that
                  * shape a reported number. Saying only "WGS84" would hide the
                  * altitude datum, which is the part that moved and the part a
                  * reader is most likely to assume wrongly.
                  */}
                <li>WGS84 ellipsoid · altitude above R_eq 6378.137 km</li>
                {/*
                  * The propagator's own credibility line, and distinct from the
                  * OneWeb fit below it. This one is an external authority —
                  * NASA GMAT, numerically integrated — and it covers the
                  * TRAJECTORY across the full window, which is exactly what the
                  * single-epoch fit cannot speak to. Keeping the two on
                  * separate lines is deliberate: collapsing them would let the
                  * stronger claim launder the weaker one.
                  */}
                <li>Propagation cross-checked vs NASA GMAT · 9 km over 72 h</li>
                {/*
                  * R29 closed this. The qualifier that stood here — "altitude
                  * datum not yet GMAT-checked" — is replaced by the measurement
                  * that removed it, not simply deleted. GMAT now validates BOTH
                  * the propagator (at fixed SMA) and the altitude mapping.
                  */}
                <li>Altitude datum GMAT-checked · 1200.00 km at the equator</li>
                {fit ? (
                    // "Fit vs OneWeb TLE · N km RMS" reads as trajectory
                    // validation. It is not: this is a mean-element fit at ONE
                    // epoch and says nothing about how the model tracks the fleet
                    // across the analysis window. The qualifier is part of the
                    // claim, not decoration.
                    <li className="text-sky-300">
                        Single-epoch shell fit vs OneWeb TLE ·{' '}
                        {fit.alongTrackRmsKm.toFixed(0)} km RMS along-track
                        <span className="block text-slate-500">not trajectory-validated</span>
                        {!matchesFit && (
                            <span className="block text-amber-200/70">
                                fitted shell not applied to the current constellation
                            </span>
                        )}
                    </li>
                ) : (
                    <li className="text-slate-500">HLD reference profile · live-TLE fit optional</li>
                )}
            </ul>

            {fit && (
                <div className="mt-1.5 border-t border-slate-700/50 pt-1.5">
                    <p className="text-[10px] leading-4 text-slate-400">
                        {fit.satellitesUsed} real satellites · {fit.planesDetected} planes ·{' '}
                        fitted <span className="font-bold text-slate-200">
                            {fit.spec.planes} × {fit.spec.satsPerPlane} · {fit.spec.inclinationDeg.toFixed(2)}°
                            {' · '}{Math.round(fit.spec.altitudeKm)} km
                        </span>
                    </p>
                    <p className="mt-0.5 text-[9px] leading-3 text-slate-500">
                        RAAN {fit.raanRmsDeg.toFixed(2)}° · in-plane {fit.argLatRmsDeg.toFixed(2)}°
                        {' · '}altitude {fit.altitudeRmsKm.toFixed(1)} km RMS
                    </p>
                    {fit.notes.map((note) => (
                        <p key={note} className="mt-0.5 text-[9px] leading-3 text-amber-200/70">{note}</p>
                    ))}
                    {!matchesFit && (
                        <button
                            type="button"
                            onClick={() => onAdoptFit(fit.spec)}
                            className="mt-1.5 rounded border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-sky-200 hover:bg-sky-500/20"
                        >
                            Use fitted shell
                        </button>
                    )}
                </div>
            )}

            {error && (
                <p className="mt-1.5 text-[9px] leading-3 text-red-300">{error}</p>
            )}

            <button
                type="button"
                onClick={onCalibrate}
                disabled={isRunning}
                className="mt-1.5 rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 transition-colors hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-50"
            >
                {isRunning ? 'Fetching fleet…' : fit ? 'Re-calibrate' : 'Calibrate vs OneWeb'}
            </button>
            </div>
        </details>
    );
};
