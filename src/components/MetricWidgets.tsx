import React from 'react';

/* ── RTT Indicator ─────────────────────────────────────────────── */

interface RttIndicatorProps {
    value: number | null; // ms
    maxMs?: number;       // scale max (default 600 for GEO)
    accentColor?: string; // hex color for the bar
    label?: string;
}

/** Color-coded RTT dot + value + mini progress bar */
export const RttIndicator: React.FC<RttIndicatorProps> = ({ value, maxMs = 600, accentColor, label = 'RTT' }) => {
    if (value == null) {
        return (
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}:</span>
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">—</span>
            </div>
        );
    }

    const dotColor = value <= 50 ? '#22c55e' : value <= 200 ? '#f59e0b' : '#ef4444';
    const ratio = Math.min(value / maxMs, 1);

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: dotColor }} />
                    {label}
                </span>
                <span className="text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {Math.round(value)} ms
                </span>
            </div>
            <div className="h-1.5 w-full bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${ratio * 100}%`, backgroundColor: accentColor || dotColor }}
                />
            </div>
        </div>
    );
};

/* ── Throughput Bar ─────────────────────────────────────────────── */

interface ThroughputBarProps {
    label: string;
    gbps: number | null;
    maxGbps: number;
    accentColor: string;
    performanceFactor?: number;
    sharedScaleMaxMbps?: number;
    trackWidthRatio?: number;
}

function formatThroughput(gbps: number): string {
    if (gbps >= 1) return `${gbps.toFixed(1)} Gbps`;
    return `${Math.round(gbps * 1000)} Mbps`;
}

/** Animated horizontal bar showing throughput relative to terminal max */
export const ThroughputBar: React.FC<ThroughputBarProps> = ({
    label,
    gbps,
    maxGbps,
    accentColor,
    performanceFactor,
    sharedScaleMaxMbps,
    trackWidthRatio,
}) => {
    const isUsable = performanceFactor == null || performanceFactor > 0;
    const displayValue = gbps != null && isUsable ? gbps : null;
    const valueMbps = displayValue != null ? displayValue * 1000 : null;
    const defaultRatio = displayValue != null ? Math.min(displayValue / maxGbps, 1) : 0;

    // Shared visual scale in Mbps so equal Mbps => equal on-screen length across DL/UL.
    const ratio = (
        valueMbps != null &&
        sharedScaleMaxMbps != null &&
        trackWidthRatio != null &&
        trackWidthRatio > 0
    )
        ? Math.min(valueMbps / (sharedScaleMaxMbps * trackWidthRatio), 1)
        : defaultRatio;

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium text-gray-600 dark:text-gray-400 truncate">{label}</span>
                <span className="shrink-0 whitespace-nowrap text-base font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {displayValue != null ? formatThroughput(displayValue) : (gbps != null ? 'Insufficient margin' : '—')}
                </span>
            </div>
            <div className="h-2 w-full bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                        width: `${ratio * 100}%`,
                        backgroundColor: accentColor,
                        opacity: displayValue != null ? 1 : 0.3,
                    }}
                />
            </div>
        </div>
    );
};

/* ── Stability Indicator ───────────────────────────────────────── */

interface StabilityIndicatorProps {
    stability: string | null; // 'High' | 'Medium' | 'Low' | 'Unstable'
    accentColor?: string;
    tooltip?: string;
}

const STABILITY_LEVELS: Record<string, { bars: number; color: string }> = {
    'High': { bars: 4, color: '#22c55e' },
    'Medium': { bars: 3, color: '#f59e0b' },
    'Low': { bars: 2, color: '#f97316' },
    'Unstable': { bars: 1, color: '#ef4444' },
};

/** Signal-strength style indicator (1-4 bars) */
export const StabilityIndicator: React.FC<StabilityIndicatorProps> = ({ stability, tooltip }) => {
    const config = stability ? STABILITY_LEVELS[stability] : null;
    const activeBars = config?.bars ?? 0;
    const activeColor = config?.color ?? '#9ca3af';

    return (
        <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Stability</span>
            <div
                className={`flex items-end gap-0.5 ${tooltip ? 'cursor-help' : ''}`}
                title={tooltip}
                aria-label={tooltip}
            >
                {[1, 2, 3, 4].map((level) => (
                    <div
                        key={level}
                        className="rounded-sm transition-colors duration-300"
                        style={{
                            width: '5px',
                            height: `${8 + level * 4}px`,
                            backgroundColor: level <= activeBars ? activeColor : '#d1d5db',
                        }}
                    />
                ))}
                <span className="text-xs font-semibold ml-1.5 tabular-nums" style={{ color: activeColor }}>
                    {stability ?? '—'}
                </span>
            </div>
        </div>
    );
};

/* ── Combined Performance Panel ────────────────────────────────── */

interface PerformancePanelProps {
    rtt: number | null;
    downlinkGbps: number | null;
    uplinkGbps: number | null;
    maxDlGbps: number;
    maxUlGbps: number;
    stability?: string | null;
    performanceFactor?: number;
    accentColor: string;     // '#db2777' for LEO, '#2563eb' for GEO
    rttMaxMs?: number;       // max for RTT bar scale
    rttLabel?: string;
    noDataMessage?: string;
    stabilityTooltip?: string;
    downlinkLabel?: string;
    uplinkLabel?: string;
    /** Hide the uplink bar — the downlink bar takes full width */
    hideUplink?: boolean;
    /** Hide the downlink bar — the uplink bar takes full width */
    hideDownlink?: boolean;
}

/** Full performance panel combining RTT + DL + UL + Stability */
export const PerformancePanel: React.FC<PerformancePanelProps> = ({
    rtt, downlinkGbps, uplinkGbps, maxDlGbps, maxUlGbps,
    stability, performanceFactor, accentColor, rttMaxMs = 600,
    rttLabel = 'RTT',
    noDataMessage,
    stabilityTooltip,
    downlinkLabel = 'Downlink throughput',
    uplinkLabel = 'Uplink throughput',
    hideUplink = false,
    hideDownlink = false,
}) => {
    const allEmpty = rtt == null && downlinkGbps == null && uplinkGbps == null;
    const DL_WIDTH_RATIO = 3 / 5;
    const UL_WIDTH_RATIO = 2 / 5;
    const maxDlMbps = maxDlGbps * 1000;
    const maxUlMbps = maxUlGbps * 1000;
    const sharedScaleMaxMbps = Math.max(
        maxDlMbps / DL_WIDTH_RATIO,
        maxUlMbps / UL_WIDTH_RATIO
    );

    const dlColSpan = hideUplink ? 'sm:col-span-5' : 'sm:col-span-3';
    const ulColSpan = hideDownlink ? 'sm:col-span-5' : 'sm:col-span-2';

    if (allEmpty && noDataMessage) {
        return (
            <div className="space-y-3">
                <RttIndicator value={null} label={rttLabel} />
                <div className="grid grid-cols-1 gap-3 items-start sm:grid-cols-5">
                    {!hideDownlink && (
                        <div className={dlColSpan}>
                            <ThroughputBar
                                label={downlinkLabel}
                                gbps={null}
                                maxGbps={maxDlGbps}
                                accentColor={accentColor}
                                sharedScaleMaxMbps={sharedScaleMaxMbps}
                                trackWidthRatio={DL_WIDTH_RATIO}
                            />
                        </div>
                    )}
                    {!hideUplink && (
                        <div className={ulColSpan}>
                            <ThroughputBar
                                label={uplinkLabel}
                                gbps={null}
                                maxGbps={maxUlGbps}
                                accentColor={accentColor}
                                sharedScaleMaxMbps={sharedScaleMaxMbps}
                                trackWidthRatio={UL_WIDTH_RATIO}
                            />
                        </div>
                    )}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">{noDataMessage}</div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <RttIndicator value={rtt} maxMs={rttMaxMs} accentColor={accentColor} label={rttLabel} />
            <div className="grid grid-cols-1 gap-3 items-start sm:grid-cols-5">
                {!hideDownlink && (
                    <div className={dlColSpan}>
                        <ThroughputBar
                            label={downlinkLabel}
                            gbps={downlinkGbps}
                            maxGbps={maxDlGbps}
                            accentColor={accentColor}
                            performanceFactor={performanceFactor}
                            sharedScaleMaxMbps={sharedScaleMaxMbps}
                            trackWidthRatio={DL_WIDTH_RATIO}
                        />
                    </div>
                )}
                {!hideUplink && (
                    <div className={ulColSpan}>
                        <ThroughputBar
                            label={uplinkLabel}
                            gbps={uplinkGbps}
                            maxGbps={maxUlGbps}
                            accentColor={accentColor}
                            performanceFactor={performanceFactor}
                            sharedScaleMaxMbps={sharedScaleMaxMbps}
                            trackWidthRatio={UL_WIDTH_RATIO}
                        />
                    </div>
                )}
            </div>
            {stability !== undefined && <StabilityIndicator stability={stability ?? null} tooltip={stabilityTooltip} />}
        </div>
    );
};
