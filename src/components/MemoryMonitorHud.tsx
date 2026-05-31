import React, { useEffect, useState } from 'react';
import { collectMemoryStats, type MemoryStats } from '../utils/memoryMonitor';

const HUD_TOGGLE_KEY = 'm';

export const MemoryMonitorHud: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [stats, setStats] = useState<MemoryStats | null>(null);

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

        const tick = () => setStats(collectMemoryStats());
        tick();
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, [visible]);

    if (!import.meta.env.DEV) return null;
    if (!visible || !stats) return null;

    const heapPct = stats.heap ? Math.round((stats.heap.usedMB / stats.heap.limitMB) * 100) : null;
    const heapColor = heapPct == null ? '#9cf' : heapPct > 80 ? '#f99' : heapPct > 60 ? '#fc9' : '#9cf';

    return (
        <div
            style={{
                position: 'fixed',
                top: 8,
                right: 8,
                zIndex: 99999,
                background: 'rgba(0,0,0,0.78)',
                color: '#9cf',
                font: '11px/1.35 ui-monospace,Menlo,monospace',
                padding: '6px 10px',
                borderRadius: 6,
                pointerEvents: 'auto',
                minWidth: 200,
                userSelect: 'none',
            }}
        >
            <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>mem</span>
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
        </div>
    );
};
