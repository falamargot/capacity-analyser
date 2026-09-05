// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocationSearch } from '../useLocationSearch';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let current: ReturnType<typeof useLocationSearch>;
function Harness({ query }: { query: string }) {
  current = useLocationSearch(query);
  return null;
}
const response = (name: string) => ({ ok: true, json: async () => [{ display_name: name, lat: '48', lon: '2' }] });
const render = async (query: string) => { await act(async () => root.render(<Harness query={query} />)); };
const tick = async (ms = 400) => { await act(async () => vi.advanceTimersByTimeAsync(ms)); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('location search lifecycle', () => {
  it('ignores an older response after a new search completes', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(response('London'));
    vi.stubGlobal('fetch', fetchMock);
    await render('Paris'); await tick();
    await render('London'); await tick();
    await act(async () => resolveOld(response('Paris')));
    expect(current.results[0]?.name).toBe('London');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('does not repopulate results or errors after clear', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolve = r; })));
    await render('Paris'); await tick();
    await act(async () => current.clear());
    await act(async () => resolve(response('Paris')));
    await tick(10_000);
    expect(current.results).toEqual([]);
    expect(current.error).toBeNull();
    expect(current.isLoading).toBe(false);
  });
  it('ends a hung request with actionable feedback', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    await render('Paris'); await tick(); await tick(10_000);
    expect(current.isLoading).toBe(false);
    expect(current.error).toContain('timed out');
  });
  it('reports HTTP failure instead of showing it as no matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await render('Paris'); await tick();
    expect(current.error).toContain('failed');
    expect(current.results).toEqual([]);
  });
});
