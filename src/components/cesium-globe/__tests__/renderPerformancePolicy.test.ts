import { describe, expect, it } from 'vitest';
import {
    getCesiumRenderPerformancePolicy,
    PATH_FLOW_FRAME_INTERVAL_MS,
    shouldRequestPathFlowFrame,
} from '../renderPerformancePolicy';

describe('getCesiumRenderPerformancePolicy', () => {
    it('keeps DPR 1 rendering unchanged', () => {
        expect(getCesiumRenderPerformancePolicy(1)).toEqual({
            physicalDpr: 1,
            resolutionScale: 1,
            iconDprFactor: 2,
        });
    });

    it('caps DPR 2 rendering at 1.5 while preserving the icon/render ratio', () => {
        const policy = getCesiumRenderPerformancePolicy(2);
        expect(policy.resolutionScale).toBe(1.5);
        expect(policy.iconDprFactor).toBe(1.5);
        expect(policy.iconDprFactor / policy.resolutionScale).toBe(1);
    });

    it('caps higher DPR displays without increasing fragment cost', () => {
        const policy = getCesiumRenderPerformancePolicy(3);
        expect(policy.resolutionScale).toBe(1.5);
        expect(policy.iconDprFactor).toBe(1.5);
    });

    it('falls back safely for invalid DPR values', () => {
        expect(getCesiumRenderPerformancePolicy(0).physicalDpr).toBe(1);
        expect(getCesiumRenderPerformancePolicy(Number.NaN).resolutionScale).toBe(1);
    });
});

describe('path flow cadence', () => {
    it('requests the first frame immediately', () => {
        expect(shouldRequestPathFlowFrame(100, null)).toBe(true);
    });

    it('coalesces animation requests inside the target interval', () => {
        expect(shouldRequestPathFlowFrame(100 + PATH_FLOW_FRAME_INTERVAL_MS - 0.1, 100)).toBe(false);
        expect(shouldRequestPathFlowFrame(100 + PATH_FLOW_FRAME_INTERVAL_MS, 100)).toBe(true);
    });
});
