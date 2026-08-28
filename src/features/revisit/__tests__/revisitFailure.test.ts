/**
 * A failure has to name itself.
 *
 * The field report that started this work said "the payload sweep failed" and
 * nothing more, and the disclosure underneath it was empty — so an engine
 * exception, a crashed Worker and a Worker that never existed were
 * indistinguishable from the screen. These contracts are what make the three
 * tellable apart without a debugger.
 */

import { describe, expect, it } from 'vitest';
import {
    describeRevisitFailure, inlineFailureCause, needsWorkerRestart, revisitFailure,
    revisitFailureDetail,
} from '../domain/revisitFailure';

describe('revisitFailure', () => {
    it('names the target, the operation and the fault in one line', () => {
        const failure = revisitFailure(
            { path: 'Worker', kind: 'runtime error', message: '' },
            'Fleet sizing', 'Secondary target',
        );
        expect(describeRevisitFailure(failure))
            .toBe('Secondary target · Fleet sizing · Worker runtime error');
    });

    it('still says something useful when the runtime supplies no message', () => {
        const failure = revisitFailure(
            { path: 'Worker', kind: 'runtime error', message: '' },
            'Fleet sizing', 'Secondary target',
        );
        // A Worker `error` event can carry an empty message. The detail must
        // never collapse to an empty string, or the disclosure reads as
        // "we do not know" when the interesting half was known all along.
        expect(revisitFailureDetail(failure)).toBe(describeRevisitFailure(failure));
        expect(revisitFailureDetail(failure).length).toBeGreaterThan(0);
    });

    it('puts the label before the engine message so the source is read first', () => {
        const failure = revisitFailure(
            { path: 'Worker', kind: 'engine error', message: 'ladder is empty' },
            'Analysis', 'Primary target',
        );
        expect(revisitFailureDetail(failure)).toBe(
            'Primary target · Analysis · Worker engine error\nladder is empty'
        );
    });

    it('omits the target when a computation has none', () => {
        const failure = revisitFailure(
            { path: 'Main thread', kind: 'unavailable', message: 'no module workers' },
            'Fleet sizing',
        );
        expect(describeRevisitFailure(failure))
            .toBe('Fleet sizing · Main thread unavailable');
    });

    it('classifies a thrown value from the inline path', () => {
        expect(inlineFailureCause(new RangeError('planes must be positive'))).toEqual({
            path: 'Main thread', kind: 'engine error', message: 'planes must be positive',
        });
        expect(inlineFailureCause('plain string').message).toBe('plain string');
    });

    /*
     * Retry scope. Replacing the Worker requeues and restarts every other sweep
     * in flight, so it is reserved for the case where the Worker is what broke.
     * A secondary target failing with an engine exception must not reset a
     * reference sweep that is seconds from finishing.
     */
    it('replaces the Worker only when the Worker is what broke', () => {
        const cause = (kind: 'engine error' | 'runtime error' | 'unavailable' | 'invalid input') =>
            revisitFailure({ path: 'Worker', kind, message: '' }, 'Fleet sizing', 'Secondary target');

        expect(needsWorkerRestart(cause('runtime error'))).toBe(true);
        expect(needsWorkerRestart(cause('unavailable'))).toBe(true);
        expect(needsWorkerRestart(cause('engine error'))).toBe(false);
        expect(needsWorkerRestart(cause('invalid input'))).toBe(false);
        expect(needsWorkerRestart(null)).toBe(false);
    });
});
