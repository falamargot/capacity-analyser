import type { WalkerSpec } from './types';

/**
 * Apply an engineering edit without retaining profile data that overrides it.
 * Structural plane edits detach every per-plane array because extending those
 * arrays would invent physical data that the user did not supply.
 */
export function referenceWithPatch(reference: WalkerSpec, patch: Partial<WalkerSpec>): WalkerSpec {
    const next: WalkerSpec = { ...reference, ...patch };
    const planesChanged = patch.planes !== undefined && patch.planes !== reference.planes;
    const altitudeChanged = patch.altitudeKm !== undefined
        && patch.altitudeKm !== reference.altitudeKm;
    const spacingChanged = (patch.pattern !== undefined && patch.pattern !== reference.pattern)
        || (patch.fudge !== undefined && patch.fudge !== reference.fudge);

    if (planesChanged || altitudeChanged) delete next.planeAltitudesKm;
    if (planesChanged || spacingChanged) delete next.raanOffsetsDeg;
    if (planesChanged) delete next.sparesPerPlane;
    return next;
}
