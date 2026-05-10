/**
 * Dev-only memory & lifecycle monitor.
 *
 * Tracks JS heap (Chrome only), Cesium entity/primitive/datasource/imagery counts,
 * and an aggregate count of active intervals/timeouts and event listeners. The
 * timer/listener counters work by wrapping the global APIs on install — they only
 * count operations that happen AFTER install, so treat them as delta indicators
 * (does the count grow over a long session?) rather than absolute totals.
 *
 * Install once from main.tsx; wire the viewer getter from App.tsx once the Cesium
 * Viewer is mounted. Read counters via `__memStats()` in the console or via the
 * MemoryMonitorHud component (Ctrl+Shift+M).
 */

export interface MemoryStats {
    timestamp: number;
    cesium: {
        entities: number;
        primitives: number;
        groundPrimitives: number;
        dataSources: number;
        imageryLayers: number;
    } | null;
    heap: {
        usedMB: number;
        totalMB: number;
        limitMB: number;
    } | null;
    activeTimers: number;
    activeListeners: number;
}

type ViewerGetter = () => unknown | null;

let viewerGetter: ViewerGetter | null = null;
let installed = false;
const activeIntervals = new Set<number>();
const activeTimeouts = new Set<number>();
let listenerCount = 0;
let consoleLogIntervalId: number | null = null;

export function setMemoryMonitorViewerGetter(getter: ViewerGetter): void {
    viewerGetter = getter;
}

export function collectMemoryStats(): MemoryStats {
    let cesium: MemoryStats['cesium'] = null;
    try {
        const viewer = viewerGetter ? (viewerGetter() as any) : null;
        if (viewer && !viewer.isDestroyed?.()) {
            cesium = {
                entities: viewer.entities?.values?.length ?? 0,
                primitives: viewer.scene?.primitives?.length ?? 0,
                groundPrimitives: viewer.scene?.groundPrimitives?.length ?? 0,
                dataSources: viewer.dataSources?.length ?? 0,
                imageryLayers: viewer.imageryLayers?.length ?? 0,
            };
        }
    } catch {
        cesium = null;
    }

    let heap: MemoryStats['heap'] = null;
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (m) {
        heap = {
            usedMB: Math.round(m.usedJSHeapSize / 1048576),
            totalMB: Math.round(m.totalJSHeapSize / 1048576),
            limitMB: Math.round(m.jsHeapSizeLimit / 1048576),
        };
    }

    return {
        timestamp: Date.now(),
        cesium,
        heap,
        activeTimers: activeIntervals.size + activeTimeouts.size,
        activeListeners: listenerCount,
    };
}

export function installMemoryMonitor(): void {
    if (installed) return;
    if (!import.meta.env.DEV) return;
    installed = true;

    const win = window as unknown as {
        setInterval: typeof window.setInterval;
        clearInterval: typeof window.clearInterval;
        setTimeout: typeof window.setTimeout;
        clearTimeout: typeof window.clearTimeout;
        __memStats?: () => MemoryStats;
    };

    const _setInterval = win.setInterval.bind(window);
    const _clearInterval = win.clearInterval.bind(window);
    const _setTimeout = win.setTimeout.bind(window);
    const _clearTimeout = win.clearTimeout.bind(window);

    win.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        const id = _setInterval(handler as never, timeout, ...(args as [])) as unknown as number;
        activeIntervals.add(id);
        return id;
    }) as typeof window.setInterval;

    win.clearInterval = ((id?: number) => {
        if (id != null) activeIntervals.delete(id);
        return _clearInterval(id as never);
    }) as typeof window.clearInterval;

    win.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        let id: number;
        if (typeof handler === 'function') {
            const wrapped = (...callArgs: unknown[]) => {
                activeTimeouts.delete(id);
                (handler as (...a: unknown[]) => void)(...callArgs);
            };
            id = _setTimeout(wrapped as never, timeout, ...(args as [])) as unknown as number;
        } else {
            id = _setTimeout(handler as never, timeout, ...(args as [])) as unknown as number;
        }
        activeTimeouts.add(id);
        return id;
    }) as typeof window.setTimeout;

    win.clearTimeout = ((id?: number) => {
        if (id != null) activeTimeouts.delete(id);
        return _clearTimeout(id as never);
    }) as typeof window.clearTimeout;

    const proto = EventTarget.prototype;
    const origAdd = proto.addEventListener;
    const origRemove = proto.removeEventListener;
    proto.addEventListener = function (type, listener, options) {
        listenerCount++;
        return origAdd.call(this, type, listener, options as never);
    };
    proto.removeEventListener = function (type, listener, options) {
        if (listenerCount > 0) listenerCount--;
        return origRemove.call(this, type, listener, options as never);
    };

    win.__memStats = collectMemoryStats;

    consoleLogIntervalId = _setInterval(() => {
        // Intentionally lightweight: reads only performance.memory (a free Chrome API)
        // and the in-memory counter fields — no Cesium API access. viewer.entities.values
        // can rebuild its internal array when dirty (entity add/remove), which blocks the
        // main thread and delays the next rAF frame, causing visible satellite animation
        // stutter. Reserve the full Cesium snapshot for explicit window.__memStats() calls
        // and the HUD (both user-triggered, not automatic).
        const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        // eslint-disable-next-line no-console
        console.log('[mem]', {
            heap: m
                ? `${Math.round(m.usedJSHeapSize / 1048576)}/${Math.round(m.totalJSHeapSize / 1048576)} MB (lim ${Math.round(m.jsHeapSizeLimit / 1048576)})`
                : 'n/a',
            timers: activeIntervals.size + activeTimeouts.size,
            listeners: listenerCount,
        });
    }, 30_000) as unknown as number;
}

export function stopMemoryMonitorConsoleLogger(): void {
    if (consoleLogIntervalId != null) {
        window.clearInterval(consoleLogIntervalId);
        consoleLogIntervalId = null;
    }
}
