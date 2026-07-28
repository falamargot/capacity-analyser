import React, { useEffect, useState } from 'react';
import { collectMemoryStats, type MemoryStats } from '../utils/memoryMonitor';
import {
  collectRuntimeStats,
  formatRuntimeReport,
  resetRuntimeProfiler,
  type RuntimeStats,
} from '../utils/runtimeProfiler';

const HUD_TOGGLE_KEY = 'm';

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10 };
const sectionTitle: React.CSSProperties = {
  color: '#fff',
  fontWeight: 600,
  marginTop: 6,
  marginBottom: 2,
  opacity: 0.85,
};

export const MemoryMonitorHud: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [stats, setStats] = useState<MemoryStats | null>(null);
    const [runtime, setRuntime] = useState<RuntimeStats | null>(null);

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === HUD_TOGGLE_KEY) {
                setVisible(v => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        if (!visible) return;

        const tick = () => {
            setStats(collectMemoryStats());
            setRuntime(collectRuntimeStats());
        };
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [visible]);

    if (!import.meta.env.DEV) return null;
    if (!visible || !stats) return null;

    const heapPct = stats.heap ? Math.round((stats.heap.usedMB / stats.heap.limitMB) * 100) : null;
    const heapColor = heapPct == null ? '#9cf' : heapPct > 80 ? '#f99' : heapPct > 60 ? '#fc9' : '#9cf';

    // Idle frames are the PERF-1 measurement: frames Cesium drew while nothing
    // changed. Anything above a few percent is work requestRenderMode removes.
    const idlePct = runtime?.frame.idleFramePct ?? 0;
    const idleColor = idlePct > 50 ? '#f99' : idlePct > 20 ? '#fc9' : '#9f9';
    const fragMult = runtime?.render.fragmentCostMultiplier ?? null;
    const fragColor = fragMult != null && fragMult > 2 ? '#f99' : fragMult != null && fragMult > 1 ? '#fc9' : '#9f9';

    return (
        <div
            style={{
                position: 'fixed',
                top: 8,
                right: 8,
                zIndex: 99999,
                background: 'rgba(0,0,0,0.82)',
                color: '#9cf',
                font: '11px/1.35 ui-monospace,Menlo,monospace',
                padding: '6px 10px',
                borderRadius: 6,
                pointerEvents: 'auto',
                minWidth: 250,
                maxHeight: '80vh',
                overflowY: 'auto',
                userSelect: 'none',
            }}
        >
            <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4, ...row }}>
                <span>perf</span>
                <span style={{ opacity: 0.5, fontWeight: 400 }}>ctrl+shift+m</span>
            </div>

            {stats.heap && (
                <div style={{ color: heapColor }}>
                    heap: {stats.heap.usedMB}/{stats.heap.totalMB}
                    <span style={{ opacity: 0.5 }}> /{stats.heap.limitMB}</span> MB
                    {heapPct != null && <span style={{ opacity: 0.7 }}> ({heapPct}%)</span>}
                </div>
            )}
            {stats.cesium && (
                <>
                    <div>entities: {stats.cesium.entities}</div>
                    <div>primitives: {stats.cesium.primitives} <span style={{ opacity: 0.5 }}>(g {stats.cesium.groundPrimitives})</span></div>
                    <div>dataSources: {stats.cesium.dataSources}</div>
                    <div>imageryLayers: {stats.cesium.imageryLayers}</div>
                </>
            )}
            <div>timers: {stats.activeTimers}</div>
            <div>listeners (delta): {stats.activeListeners}</div>

            {runtime && (
                <>
                    <div style={sectionTitle}>frames · {runtime.elapsedSec.toFixed(0)}s</div>
                    <div style={row}><span>fps</span><span>{runtime.frame.fps.toFixed(1)}</span></div>
                    <div style={row}>
                        <span>frame p95</span>
                        <span>{runtime.frame.frameMs.p95.toFixed(1)} ms</span>
                    </div>
                    <div style={{ ...row, color: idleColor }}>
                        <span>idle frames</span>
                        <span>{runtime.frame.idleFrames} ({idlePct.toFixed(0)}%)</span>
                    </div>
                    <div style={{ ...row, opacity: 0.65 }}>
                        <span>requestRenderMode</span>
                        <span>{runtime.render.requestRenderModeEnabled === null
                            ? '?'
                            : runtime.render.requestRenderModeEnabled ? 'on' : 'OFF'}</span>
                    </div>
                    <div style={{ ...row, color: fragColor }}>
                        <span>fragment cost</span>
                        <span>{fragMult != null ? `${fragMult.toFixed(2)}x` : '?'}</span>
                    </div>

                    <div style={sectionTitle}>react</div>
                    <div style={row}>
                        <span>commits/s</span>
                        <span>{runtime.elapsedSec > 0
                            ? (runtime.react.commits / runtime.elapsedSec).toFixed(1)
                            : '0'}</span>
                    </div>
                    <div style={row}>
                        <span>commit p95</span>
                        <span>{runtime.react.commitMs.p95.toFixed(1)} ms</span>
                    </div>

                    {runtime.engine.total > 0 && (
                        <>
                            <div style={sectionTitle}>engineering calcs</div>
                            {Object.entries(runtime.engine.counts).map(([k, v]) => (
                                <div key={k} style={{ ...row, opacity: 0.8 }}>
                                    <span>{k}</span><span>{v}</span>
                                </div>
                            ))}
                        </>
                    )}

                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                            type="button"
                            onClick={() => { resetRuntimeProfiler(); setRuntime(collectRuntimeStats()); }}
                            style={{
                                flex: 1, font: 'inherit', color: '#9cf', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                                borderRadius: 4, padding: '2px 6px',
                            }}
                        >
                            reset
                        </button>
                        <button
                            type="button"

                            onClick={() => console.log(formatRuntimeReport())}
                            style={{
                                flex: 1, font: 'inherit', color: '#9cf', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
                                borderRadius: 4, padding: '2px 6px',
                            }}
                        >
                            report
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
