import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let pickBeamFootprintPoints: typeof import('../AggregatedCoverageVolumeLayer').pickBeamFootprintPoints;

beforeAll(async () => {
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    location: { href: 'http://localhost/' },
  });
  vi.stubGlobal('Path2D', class Path2D {
    constructor(_path?: string) {}
  });
  vi.stubGlobal('document', {
    location: { href: 'http://localhost/' },
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
    documentElement: {
      style: {},
    },
    getElementsByTagName: vi.fn(() => []),
    createComment: vi.fn(() => ({ nodeType: 8 })),
    createElement: (tagName: string) => {
      if (tagName !== 'canvas') {
        return {
          tagName,
          style: {},
          innerHTML: '',
          textContent: '',
          setAttribute: vi.fn(),
          appendChild: vi.fn(),
          removeChild: vi.fn(),
          getElementsByTagName: vi.fn(() => []),
        };
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          globalAlpha: 1,
          fillRect: vi.fn(),
          createRadialGradient: () => ({
            addColorStop: vi.fn(),
          }),
          beginPath: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
        }),
        toDataURL: () => 'data:image/png;base64,test',
      };
    },
  });
  ({ pickBeamFootprintPoints } = await import('../AggregatedCoverageVolumeLayer'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('pickBeamFootprintPoints', () => {
  it('returns an empty ring when the GEO beam feature is null', () => {
    expect(pickBeamFootprintPoints(null)).toEqual([]);
  });
});
