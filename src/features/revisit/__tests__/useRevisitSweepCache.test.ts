import { describe, expect, it } from 'vitest';
import type { PayloadSweepResult } from '../analysis/payloadSweep';
import { cacheSweep, MAX_CACHED_SWEEPS } from '../workers/sweepScheduler';

const result = (warning: string): PayloadSweepResult => ({ points: [], warnings: [warning] });

describe('shared payload sweep cache', () => {
    it('is bounded to the retained working set and evicts the oldest entry', () => {
        const cache = new Map<string, PayloadSweepResult>();
        for (let index = 0; index < MAX_CACHED_SWEEPS + 1; index += 1) {
            cacheSweep(cache, `target-${index}`, result(String(index)));
        }
        expect(cache).toHaveLength(MAX_CACHED_SWEEPS);
        expect(cache.has('target-0')).toBe(false);
        expect(cache.get(`target-${MAX_CACHED_SWEEPS}`)?.warnings)
            .toEqual([String(MAX_CACHED_SWEEPS)]);
    });

    it('promotes a reused entry by reference rather than copying it', () => {
        const cache = new Map<string, PayloadSweepResult>();
        const reused = result('reused');
        cacheSweep(cache, 'a', reused);
        cacheSweep(cache, 'b', result('b'));
        cacheSweep(cache, 'a', reused);
        cacheSweep(cache, 'c', result('c'), 2);
        expect(cache.has('b')).toBe(false);
        expect(cache.get('a')).toBe(reused);
    });
});
