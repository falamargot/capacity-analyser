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
    /** Dev diagnostics grouped by target constructor and event type. */
    listenerBreakdown?: Record<string, number>;
}

type ViewerGetter = () => unknown | null;

let viewerGetter: ViewerGetter | null = null;
let installed = false;
const activeIntervals = new Set<number>();
const activeTimeouts = new Set<number>();
let listenerCount = 0;
const listenerBreakdown = new Map<string, number>();

type Listener = EventListenerOrEventListenerObject;
interface TrackedListener {
    original: Listener;
    installed: Listener;
    capture: boolean;
    removed: boolean;
    abortCleanup?: () => void;
    breakdownKey: string;
}

const trackedListeners = new WeakMap<EventTarget, Map<string, Map<Listener, Map<boolean, TrackedListener>>>>();
interface ListenerObservation {
    target: WeakRef<EventTarget>;
    record: WeakRef<TrackedListener>;
}
const listenerObservations = new Set<ListenerObservation>();

function activeListenerSnapshot(): { count: number; breakdown: Record<string, number> } {
    let count = 0;
    const breakdown = new Map<string, number>();
    for (const observation of listenerObservations) {
        const target = observation.target.deref();
        const record = observation.record.deref();
        if (!target || !record) {
            listenerObservations.delete(observation);
            continue;
        }
        if (record.removed) continue;
        // Listeners attached to a detached element cannot receive UI events and
        // the element/listener cycle is garbage-collectable. Counting them as
        // active made every unmounted React form and Cesium canvas look leaked.
        if (target instanceof Node && !target.isConnected) continue;
        count++;
        breakdown.set(record.breakdownKey, (breakdown.get(record.breakdownKey) ?? 0) + 1);
    }
    return {
        count,
        breakdown: Object.fromEntries([...breakdown.entries()].sort((a, b) => b[1] - a[1])),
    };
}

function captureFrom(options?: boolean | AddEventListenerOptions | EventListenerOptions): boolean {
    return typeof options === 'boolean' ? options : Boolean(options?.capture);
}

function trackedRecord(target: EventTarget, type: string, listener: Listener, capture: boolean): TrackedListener | undefined {
    return trackedListeners.get(target)?.get(type)?.get(listener)?.get(capture);
}

function rememberTrackedListener(target: EventTarget, type: string, record: TrackedListener): void {
    let byType = trackedListeners.get(target);
    if (!byType) {
        byType = new Map();
        trackedListeners.set(target, byType);
    }
    let byListener = byType.get(type);
    if (!byListener) {
        byListener = new Map();
        byType.set(type, byListener);
    }
    let byCapture = byListener.get(record.original);
    if (!byCapture) {
        byCapture = new Map();
        byListener.set(record.original, byCapture);
    }
    byCapture.set(record.capture, record);
    listenerObservations.add({ target: new WeakRef(target), record: new WeakRef(record) });
}

function forgetTrackedListener(target: EventTarget, type: string, record: TrackedListener): void {
    if (record.removed) return;
    record.removed = true;
    record.abortCleanup?.();
    listenerCount = Math.max(0, listenerCount - 1);
    const nextBreakdown = (listenerBreakdown.get(record.breakdownKey) ?? 1) - 1;
    if (nextBreakdown <= 0) listenerBreakdown.delete(record.breakdownKey);
    else listenerBreakdown.set(record.breakdownKey, nextBreakdown);

    const byType = trackedListeners.get(target);
    const byListener = byType?.get(type);
    const byCapture = byListener?.get(record.original);
    byCapture?.delete(record.capture);
    if (byCapture?.size === 0) byListener?.delete(record.original);
    if (byListener?.size === 0) byType?.delete(type);
}

export function setMemoryMonitorViewerGetter(getter: ViewerGetter): void {
    viewerGetter = getter;
}

export function collectMemoryStats(): MemoryStats {
    const listeners = activeListenerSnapshot();
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
        activeListeners: listeners.count,
        listenerBreakdown: listeners.breakdown,
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
        if (!listener) return origAdd.call(this, type, listener, options as never);
        const capture = captureFrom(options);
        // The DOM ignores duplicate registrations with the same
        // target/type/listener/capture tuple. The previous monitor counted each
        // attempted add and therefore reported hundreds of phantom listeners
        // after repeated Cesium mounts.
        if (trackedRecord(this, type, listener, capture)) return;

        const once = typeof options === 'object' && Boolean(options?.once);
        const signal = typeof options === 'object' ? options?.signal : undefined;
        if (signal?.aborted) {
            return origAdd.call(this, type, listener, options as never);
        }

        const record: TrackedListener = {
            original: listener,
            installed: listener,
            capture,
            removed: false,
            breakdownKey: `${this.constructor?.name ?? 'EventTarget'}:${type}`,
        };
        if (once) {
            record.installed = function (this: EventTarget, event: Event) {
                forgetTrackedListener(this, type, record);
                if (typeof listener === 'function') listener.call(this, event);
                else listener.handleEvent(event);
            };
        }
        rememberTrackedListener(this, type, record);
        listenerCount++;
        listenerBreakdown.set(record.breakdownKey, (listenerBreakdown.get(record.breakdownKey) ?? 0) + 1);

        if (signal) {
            const onAbort = () => forgetTrackedListener(this, type, record);
            origAdd.call(signal, 'abort', onAbort, { once: true });
            record.abortCleanup = () => origRemove.call(signal, 'abort', onAbort, false);
        }

        return origAdd.call(this, type, record.installed, options as never);
    };
    proto.removeEventListener = function (type, listener, options) {
        if (!listener) return origRemove.call(this, type, listener, options as never);
        const record = trackedRecord(this, type, listener, captureFrom(options));
        if (!record) return origRemove.call(this, type, listener, options as never);
        forgetTrackedListener(this, type, record);
        return origRemove.call(this, type, record.installed, options as never);
    };

    win.__memStats = collectMemoryStats;

    _setInterval(() => {
        // Intentionally lightweight: reads only performance.memory (a free Chrome API)
        // and the in-memory counter fields — no Cesium API access. viewer.entities.values
        // can rebuild its internal array when dirty (entity add/remove), which blocks the
        // main thread and delays the next rAF frame, causing visible satellite animation
        // stutter. Reserve the full Cesium snapshot for explicit window.__memStats() calls
        // and the HUD (both user-triggered, not automatic).
        const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
         
        console.log('[mem]', {
            heap: m
                ? `${Math.round(m.usedJSHeapSize / 1048576)}/${Math.round(m.totalJSHeapSize / 1048576)} MB (lim ${Math.round(m.jsHeapSizeLimit / 1048576)})`
                : 'n/a',
            timers: activeIntervals.size + activeTimeouts.size,
            listeners: activeListenerSnapshot().count,
        });
    }, 30_000) as unknown as number;
}

