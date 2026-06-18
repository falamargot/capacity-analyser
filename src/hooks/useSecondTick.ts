import { useEffect, useState } from 'react';

// Shared 1s ticker so multiple components don't each run their own
// setInterval (previously 5 independent timers firing 5 separate React
// reconciliation passes per second). One underlying interval, started
// lazily on first subscriber and stopped when the last one unmounts.
type Listener = () => void;
const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function ensureTicking() {
    if (intervalId !== null) return;
    intervalId = setInterval(() => {
        for (const listener of listeners) listener();
    }, 1000);
}

function stopIfIdle() {
    if (listeners.size === 0 && intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
    }
}

export function useSecondTick(): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const listener = () => setTick((t) => t + 1);
        listeners.add(listener);
        ensureTicking();
        return () => {
            listeners.delete(listener);
            stopIfIdle();
        };
    }, []);
    return tick;
}
