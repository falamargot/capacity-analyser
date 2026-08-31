import React, { useEffect, useId, useRef, useState } from 'react';
import type { ReferenceMode, ReferenceProfile } from '../domain/referenceProfiles';
import { REVISIT_MENU_SURFACE } from './revisitTheme';

interface ModelEvidencePopoverProps {
    mode: ReferenceMode;
    profile: ReferenceProfile | null;
    isRestored?: boolean;
}

const ENGINE_CLAIMS = [
    'Kepler + J2 secular · no drag',
    'WGS84 ellipsoid · altitude above R_eq 6378.137 km',
    'Propagation cross-checked vs NASA GMAT · 9 km over 72 h',
    'Altitude datum GMAT-checked at 1200 km · engine claim, not this model’s altitude',
] as const;

/** Compact access to the technical evidence without making it permanent panel chrome. */
export const ModelEvidencePopover: React.FC<ModelEvidencePopoverProps> = ({
    mode, profile, isRestored = false,
}) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverId = useId();

    useEffect(() => {
        if (!open) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-label="Model evidence"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? popoverId : undefined}
                onClick={() => setOpen((current) => !current)}
                title="Show model evidence"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-500/70 text-[10px] font-black normal-case tracking-normal text-slate-400 transition-colors hover:border-sky-400/70 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
            >
                i
            </button>

            {open && (
                <div
                    id={popoverId}
                    role="dialog"
                    aria-label="Model evidence"
                    data-revisit-panel-flyout
                    className={`${REVISIT_MENU_SURFACE} absolute left-0 top-full z-30 mt-1.5 w-[22rem] max-w-[calc(100vw-3rem)] rounded-lg border border-slate-600/80 bg-slate-950/95 p-3 text-left shadow-2xl`}
                >
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-300">
                            Evidence
                        </p>
                        <button
                            type="button"
                            aria-label="Close model evidence"
                            onClick={() => {
                                setOpen(false);
                                buttonRef.current?.focus();
                            }}
                            className="flex h-5 w-5 items-center justify-center rounded text-[14px] text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                        >
                            ×
                        </button>
                    </div>

                    <ul className="mt-2 space-y-1 text-[12px] leading-4 text-slate-400">
                        {ENGINE_CLAIMS.map((claim) => <li key={claim}>{claim}</li>)}
                    </ul>

                    <div className="mt-2 border-t border-slate-700/60 pt-2 text-[12px] leading-4">
                        {mode === 'HLD' ? (
                            <p className="text-sky-300">
                                {profile
                                    ? `${profile.label} · v${profile.version}`
                                    : 'HLD reference profile'}
                            </p>
                        ) : isRestored ? (
                            <p className="text-amber-300">
                                Restored specification · provenance not recorded
                            </p>
                        ) : (
                            <p className="text-amber-300">
                                Hand-entered · no external provenance
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
