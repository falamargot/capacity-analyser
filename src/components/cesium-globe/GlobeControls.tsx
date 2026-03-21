/**
 * GlobeControls - Zoom and navigation controls for the Cesium viewer
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Cartesian3,
    EasingFunction,
    Math as CesiumMath,
    Viewer as CesiumViewerType
} from 'cesium';
import {
    Globe,
    Map,
    Minus,
    Orbit,
    Plus,
    RotateCcw,
    Settings2,
    ShieldCheck,
    SunMedium,
    Waves
} from 'lucide-react';
import FullscreenButton from '../FullscreenButton';

interface GlobeControlsProps {
    viewerRef: React.RefObject<CesiumViewerType | null>;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    isPhone?: boolean;
    enableLighting?: boolean;
    onToggleLighting?: () => void;
    showSatelliteTrajectory?: boolean;
    onToggleSatelliteTrajectory?: () => void;
    sizeScale?: number;
    onSizeScaleChange?: (scale: number) => void;
    onSizeScaleReset?: () => void;
    view?: 'globe' | 'map';
    onViewChange?: (view: 'globe' | 'map') => void;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
    showAggregatedConnectivity?: boolean;
    onToggleAggregatedConnectivity?: () => void;
    showRegulatoryOverlay?: boolean;
    onToggleRegulatoryOverlay?: () => void;
    satelliteScope?: 'LEO' | 'GEO' | 'ALL';
}

interface ControlButtonProps {
    icon: React.ReactNode;
    label: string;
    subtitle?: string;
    onClick: () => void;
    title: string;
    active?: boolean;
    compact?: boolean;
    accent?: 'blue' | 'emerald' | 'amber';
    disabled?: boolean;
    ariaExpanded?: boolean;
    ariaControls?: string;
    ariaPressed?: boolean;
}

interface DisplayOptionRowProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    enabled: boolean;
    onClick: () => void;
    disabled?: boolean;
    shortcut?: string;
    accent?: 'amber' | 'violet' | 'blue';
    title?: string;
}

const CONTROL_SURFACE_CLASS_NAME = 'border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.86))] shadow-[0_18px_40px_-26px_rgba(15,23,42,0.78)] ring-1 ring-slate-200/60 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(30,41,59,0.84))] dark:ring-slate-700/70';

const accentClassNames: Record<NonNullable<ControlButtonProps['accent']>, string> = {
    blue: 'border-blue-200/90 bg-blue-50/95 text-blue-700 shadow-[0_14px_28px_-22px_rgba(37,99,235,0.78)] dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-200',
    emerald: 'border-emerald-200/90 bg-emerald-50/95 text-emerald-700 shadow-[0_14px_28px_-22px_rgba(5,150,105,0.72)] dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-200',
    amber: 'border-amber-200/90 bg-amber-50/95 text-amber-700 shadow-[0_14px_28px_-22px_rgba(217,119,6,0.72)] dark:border-amber-400/25 dark:bg-amber-500/15 dark:text-amber-200'
};

const optionAccentClassNames: Record<NonNullable<DisplayOptionRowProps['accent']>, string> = {
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    violet: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-200',
    blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200'
};

const formatScaleLabel = (value: number) => value.toFixed(2).replace(/\.?0+$/, '');

const ControlButton: React.FC<ControlButtonProps> = ({
    icon,
    label,
    subtitle,
    onClick,
    title,
    active = false,
    compact = false,
    accent = 'blue',
    disabled = false,
    ariaExpanded,
    ariaControls,
    ariaPressed
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        aria-pressed={ariaPressed}
        className={[
            'group relative inline-flex items-center gap-2 rounded-2xl border text-left transition-all duration-200',
            compact ? 'h-10 w-10 justify-center rounded-xl p-0' : 'min-h-[44px] rounded-[18px] px-3 py-2',
            disabled
                ? 'cursor-not-allowed border-slate-200/80 bg-slate-100/90 text-slate-400 shadow-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-500'
                : active
                    ? accentClassNames[accent]
                    : 'border-white/70 bg-white/78 text-slate-700 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.65)] hover:-translate-y-0.5 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/72 dark:text-slate-200 dark:hover:bg-slate-900'
        ].join(' ')}
    >
        <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-slate-400/30" />
        <span className={compact ? '' : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100/85 text-current dark:bg-slate-800/85'}>
            {icon}
        </span>
        {!compact && (
            <span className="min-w-0">
                <span className="block text-[11px] font-semibold leading-4">{label}</span>
                {subtitle && (
                    <span className="mt-0.5 block text-[10px] leading-3 text-slate-500 dark:text-slate-400">
                        {subtitle}
                    </span>
                )}
            </span>
        )}
    </button>
);

const DisplayOptionRow: React.FC<DisplayOptionRowProps> = ({
    icon,
    label,
    description,
    enabled,
    onClick,
    disabled = false,
    shortcut,
    accent = 'blue',
    title
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={enabled}
        className={[
            'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200',
            disabled
                ? 'cursor-not-allowed border-slate-200/80 bg-slate-50/90 opacity-60 dark:border-slate-700 dark:bg-slate-900/60'
                : enabled
                    ? 'border-slate-200/90 bg-white shadow-[0_16px_28px_-24px_rgba(15,23,42,0.75)] hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-900'
                    : 'border-transparent bg-slate-50/85 hover:-translate-y-0.5 hover:border-slate-200/80 hover:bg-white dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900'
        ].join(' ')}
    >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${optionAccentClassNames[accent]}`}>
            {icon}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span>
            <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">{description}</span>
        </span>
        <span className="shrink-0 text-right">
            {shortcut && (
                <span className="mb-1 inline-flex rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {shortcut}
                </span>
            )}
            <span
                className={[
                    'block rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                    enabled
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                        : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                ].join(' ')}
            >
                {enabled ? 'On' : 'Off'}
            </span>
        </span>
    </button>
);

const GlobeControls: React.FC<GlobeControlsProps> = ({
    viewerRef,
    isFullscreen,
    onToggleFullscreen,
    isPhone = false,
    enableLighting,
    onToggleLighting,
    showSatelliteTrajectory,
    onToggleSatelliteTrajectory,
    sizeScale,
    onSizeScaleChange,
    onSizeScaleReset,
    sceneMode = '3D',
    onSceneModeChange,
    showAggregatedConnectivity,
    onToggleAggregatedConnectivity,
    showRegulatoryOverlay,
    onToggleRegulatoryOverlay,
    satelliteScope
}) => {
    const [isMapOptionsOpen, setIsMapOptionsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const popoverId = 'globe-display-controls';
    const leoDisplayOptionsDisabled = satelliteScope === 'GEO';

    const handleZoomOut = useCallback(() => {
        if (!viewerRef.current) return;

        const camera = viewerRef.current.camera;
        const currentHeight = camera.positionCartographic.height;
        const targetHeight = currentHeight * 1.3;
        const destination = Cartesian3.fromDegrees(
            CesiumMath.toDegrees(camera.positionCartographic.longitude),
            CesiumMath.toDegrees(camera.positionCartographic.latitude),
            targetHeight
        );
        camera.flyTo({
            destination,
            duration: 0.5,
            easingFunction: EasingFunction.LINEAR_NONE
        });
    }, [viewerRef]);

    const handleReset = useCallback(() => {
        if (!viewerRef.current) return;

        viewerRef.current.camera.flyTo({
            destination: Cartesian3.fromDegrees(0, 0, 20000000),
            duration: 1.5,
            easingFunction: EasingFunction.LINEAR_NONE
        });
    }, [viewerRef]);

    const handleZoomIn = useCallback(() => {
        if (!viewerRef.current) return;

        const camera = viewerRef.current.camera;
        const currentHeight = camera.positionCartographic.height;
        const targetHeight = currentHeight * 0.7;
        const destination = Cartesian3.fromDegrees(
            CesiumMath.toDegrees(camera.positionCartographic.longitude),
            CesiumMath.toDegrees(camera.positionCartographic.latitude),
            targetHeight
        );
        camera.flyTo({
            destination,
            duration: 0.5,
            easingFunction: EasingFunction.LINEAR_NONE
        });
    }, [viewerRef]);

    useEffect(() => {
        if (!isMapOptionsOpen) return;

        const onDocPointerDown = (e: PointerEvent) => {
            const el = popoverRef.current;
            if (!el) return;
            if (e.target instanceof Node && el.contains(e.target)) return;
            setIsMapOptionsOpen(false);
        };

        const onEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsMapOptionsOpen(false);
            }
        };

        document.addEventListener('pointerdown', onDocPointerDown);
        document.addEventListener('keydown', onEscape);
        return () => {
            document.removeEventListener('pointerdown', onDocPointerDown);
            document.removeEventListener('keydown', onEscape);
        };
    }, [isMapOptionsOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            switch (e.key.toLowerCase()) {
                case 'l':
                    e.preventDefault();
                    onToggleLighting?.();
                    break;
                case 't':
                    e.preventDefault();
                    onToggleSatelliteTrajectory?.();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    handleZoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    handleZoomOut();
                    break;
                case '0':
                    e.preventDefault();
                    handleReset();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onToggleLighting, onToggleSatelliteTrajectory, handleZoomIn, handleZoomOut, handleReset]);

    return (
        <div className={`absolute right-3 z-10 flex flex-col items-end gap-2 ${isPhone ? 'top-24' : 'top-3'}`}>
            <div className={`relative rounded-[20px] p-1.5 ${CONTROL_SURFACE_CLASS_NAME} ${isMapOptionsOpen ? 'z-20' : ''}`}>
                <div className={`flex items-center ${isPhone ? 'gap-1.5' : 'gap-1.5'}`} ref={popoverRef}>
                    {onSceneModeChange && (
                        <ControlButton
                            icon={sceneMode === '3D' ? <Map className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                            label={sceneMode === '3D' ? 'Map' : 'Globe'}
                            onClick={() => onSceneModeChange(sceneMode === '3D' ? '2D' : '3D')}
                            title={sceneMode === '3D' ? 'Switch to 2D map view' : 'Switch to 3D globe view'}
                            active
                            accent="blue"
                            compact={isPhone}
                        />
                    )}

                    <div className="relative">
                        <ControlButton
                            icon={<Settings2 className="h-4 w-4" />}
                            label="Display"
                            onClick={() => setIsMapOptionsOpen((v) => !v)}
                            title="Open display controls"
                            active={isMapOptionsOpen}
                            accent="amber"
                            compact={isPhone}
                            ariaExpanded={isMapOptionsOpen}
                            ariaControls={popoverId}
                        />

                        {isMapOptionsOpen && (
                            <div
                                id={popoverId}
                                className={`absolute right-0 top-full z-30 mt-2 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 shadow-[0_32px_70px_-34px_rgba(15,23,42,0.7)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] dark:ring-slate-700/80`}
                                role="dialog"
                                aria-label="Display controls"
                            >
                                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_24%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_26%)]" />
                                <div className="relative">
                                    <div className="mb-3 flex items-start justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-700">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">Display Controls</div>
                                        </div>
                                        <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                            Live
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <DisplayOptionRow
                                            icon={<SunMedium className="h-4 w-4" />}
                                            label="Sun Light"
                                            description="Add solar shading."
                                            enabled={!!enableLighting}
                                            onClick={() => onToggleLighting?.()}
                                            shortcut="L"
                                            accent="amber"
                                            title="Toggle sun lighting"
                                        />

                                        <DisplayOptionRow
                                            icon={<Orbit className="h-4 w-4" />}
                                            label="Trajectory"
                                            description="Show the selected orbit."
                                            enabled={!!showSatelliteTrajectory}
                                            onClick={() => onToggleSatelliteTrajectory?.()}
                                            shortcut="T"
                                            accent="violet"
                                            title="Toggle satellite trajectory"
                                        />

                                        {onToggleAggregatedConnectivity && (
                                            <DisplayOptionRow
                                                icon={<Waves className="h-4 w-4" />}
                                                label="Connectivity Envelope"
                                                description={satelliteScope === 'GEO' ? 'Show the union of GEO footprints.' : 'Show the feasibility layer.'}
                                                enabled={!!showAggregatedConnectivity}
                                                onClick={() => onToggleAggregatedConnectivity()}
                                                disabled={false}
                                                accent="blue"
                                                title={satelliteScope === 'GEO' ? 'Toggle GEO aggregated footprints' : 'Toggle aggregated connectivity'}
                                            />
                                        )}

                                        {onToggleRegulatoryOverlay && (
                                            <DisplayOptionRow
                                                icon={<ShieldCheck className="h-4 w-4" />}
                                                label="Regulatory Overlay"
                                                description={leoDisplayOptionsDisabled ? 'Only in ALL or LEO scope.' : 'Show simulated policy zones and blocked-service cues.'}
                                                enabled={!leoDisplayOptionsDisabled && !!showRegulatoryOverlay}
                                                onClick={() => {
                                                    if (!leoDisplayOptionsDisabled) {
                                                        onToggleRegulatoryOverlay?.();
                                                    }
                                                }}
                                                disabled={leoDisplayOptionsDisabled}
                                                accent="violet"
                                                title={leoDisplayOptionsDisabled ? 'Not available in GEO scope' : 'Toggle regulatory overlay (simulated demo data)'}
                                            />
                                        )}
                                    </div>

                                    <div className="mt-3 rounded-[20px] border border-slate-200/80 bg-white/78 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/72">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Marker Scale</div>
                                                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                    Scale all markers.
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {onSizeScaleReset && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onSizeScaleReset()}
                                                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
                                                        title="Reset marker scale to the responsive default"
                                                    >
                                                        <RotateCcw className="h-3 w-3" />
                                                        Reset
                                                    </button>
                                                )}
                                                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                                    {formatScaleLabel(sizeScale ?? 1)}x
                                                </div>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.25"
                                            max="8"
                                            step="0.25"
                                            value={sizeScale ?? 1}
                                            onChange={(e) => onSizeScaleChange?.(parseFloat(e.target.value))}
                                            onDoubleClick={() => onSizeScaleReset?.()}
                                            className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600 dark:bg-slate-700"
                                            title="Adjust marker size. Double-click to reset to the responsive default."
                                            aria-label="Adjust marker size"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {!isPhone && (
                        <FullscreenButton isFullscreen={isFullscreen} onClick={onToggleFullscreen} />
                    )}
                </div>
            </div>

            <div className={`rounded-[20px] p-1.5 ${CONTROL_SURFACE_CLASS_NAME}`}>
                <div className="flex items-center gap-1.5">
                    <ControlButton
                        icon={<Minus className="h-4 w-4" />}
                        label="Zoom out"
                        onClick={handleZoomOut}
                        title="Zoom out"
                        compact
                    />
                    <ControlButton
                        icon={<RotateCcw className="h-4 w-4" />}
                        label="Reset view"
                        onClick={handleReset}
                        title="Reset view"
                        compact
                        active
                        accent="emerald"
                    />
                    <ControlButton
                        icon={<Plus className="h-4 w-4" />}
                        label="Zoom in"
                        onClick={handleZoomIn}
                        title="Zoom in"
                        compact
                    />
                </div>
            </div>
        </div>
    );
};

export default React.memo(GlobeControls);
