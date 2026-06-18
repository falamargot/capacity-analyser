import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Cartesian3,
    EasingFunction,
    Math as CesiumMath,
    Viewer as CesiumViewerType,
} from 'cesium';
import {
    Activity,
    BarChart2,
    Globe,
    Map,
    Maximize2,
    Minus,
    Minimize2,
    MoreHorizontal,
    Orbit,
    Plane,
    Plus,
    RotateCcw,
    Ship,
    Satellite,
    SunMedium,
    Waves,
} from 'lucide-react';
import type { CountryOverlayMode } from '../../types/countryOverlays';

interface GlobeIntelligenceRailProps {
    viewerRef: React.RefObject<CesiumViewerType | null>;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    variant?: 'full' | 'camera-only';
    placement?: 'left' | 'right';
    rightOffset?: string;
    // Category A state + toggles
    countryOverlayMode: CountryOverlayMode;
    onCountryOverlayModeChange: (mode: CountryOverlayMode) => void;
    showAggregatedConnectivity: boolean;
    onToggleAggregatedConnectivity: () => void;
    showFillRateLayer: boolean;
    onToggleFillRateLayer: () => void;
    fillRateLayerAvailable?: boolean;
    airTrafficEnabled: boolean;
    onToggleAirTraffic: () => void;
    maritimeTrafficEnabled: boolean;
    onToggleMaritimeTraffic: () => void;
    issLiveEnabled: boolean;
    onToggleIssLive: () => void;
    // Category B (display preferences, behind ⋯)
    enableLighting?: boolean;
    onToggleLighting?: () => void;
    showSatelliteTrajectory?: boolean;
    onToggleSatelliteTrajectory?: () => void;
    showFootprintProjection?: boolean;
    onToggleFootprintProjection?: () => void;
    showFlowAnimation?: boolean;
    onToggleFlowAnimation?: () => void;
    sizeScale?: number;
    onSizeScaleChange?: (scale: number) => void;
    onSizeScaleReset?: () => void;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
    basemapOptions?: Array<{ id: string; label: string }>;
    selectedBasemapId?: string;
    onBasemapChange?: (id: string) => void;
    isPhone?: boolean;
    isMobileViewport?: boolean;
}

// ─── Camera helpers (mirrors GlobeControls logic exactly) ────────────────────

function zoomIn(viewerRef: React.RefObject<CesiumViewerType | null>) {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const h = camera.positionCartographic.height;
    camera.flyTo({
        destination: Cartesian3.fromDegrees(
            CesiumMath.toDegrees(camera.positionCartographic.longitude),
            CesiumMath.toDegrees(camera.positionCartographic.latitude),
            h * 0.7
        ),
        duration: 0.5,
        easingFunction: EasingFunction.LINEAR_NONE,
    });
}

function zoomOut(viewerRef: React.RefObject<CesiumViewerType | null>) {
    if (!viewerRef.current) return;
    const camera = viewerRef.current.camera;
    const h = camera.positionCartographic.height;
    camera.flyTo({
        destination: Cartesian3.fromDegrees(
            CesiumMath.toDegrees(camera.positionCartographic.longitude),
            CesiumMath.toDegrees(camera.positionCartographic.latitude),
            h * 1.3
        ),
        duration: 0.5,
        easingFunction: EasingFunction.LINEAR_NONE,
    });
}

function resetCamera(viewerRef: React.RefObject<CesiumViewerType | null>) {
    if (!viewerRef.current) return;
    viewerRef.current.camera.flyTo({
        destination: Cartesian3.fromDegrees(0, 0, 20000000),
        duration: 1.5,
        easingFunction: EasingFunction.LINEAR_NONE,
    });
}

// ─── Rail button ──────────────────────────────────────────────────────────────

interface RailButtonProps {
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
    title: string;
    accentColor?: string;
}

const RailButton: React.FC<RailButtonProps> = ({ icon, label, active, disabled, onClick, title, accentColor }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        aria-pressed={active}
        disabled={disabled}
        className={[
            'flex min-h-11 w-9 flex-col items-center justify-center gap-0.5 rounded-lg px-0 py-1.5 text-center transition-all duration-150',
            disabled
                ? 'cursor-not-allowed text-slate-300 opacity-45 dark:text-slate-600'
                : active
                ? `${accentColor ?? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'} ring-1 ring-blue-300/40 dark:ring-blue-400/20`
                : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
        ].join(' ')}
    >
        <span className="h-4 w-4 shrink-0">{icon}</span>
        <span className="w-full text-[9px] font-bold uppercase leading-none tracking-[0.04em]">{label}</span>
    </button>
);

// ─── Camera icon button (compact, no label) ───────────────────────────────────

const CameraButton: React.FC<{ icon: React.ReactNode; onClick: () => void; title: string; active?: boolean }> = ({
    icon, onClick, title, active,
}) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className={[
            'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150',
            active
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
        ].join(' ')}
    >
        <span className="h-4 w-4">{icon}</span>
    </button>
);

const formatScaleLabel = (v: number) => v.toFixed(2).replace(/\.?0+$/, '');

// ─── Main component ───────────────────────────────────────────────────────────

const GlobeIntelligenceRail: React.FC<GlobeIntelligenceRailProps> = ({
    viewerRef,
    isFullscreen,
    onToggleFullscreen,
    variant = 'full',
    placement = 'right',
    rightOffset,
    countryOverlayMode,
    onCountryOverlayModeChange,
    showAggregatedConnectivity,
    onToggleAggregatedConnectivity,
    showFillRateLayer,
    onToggleFillRateLayer,
    fillRateLayerAvailable = true,
    airTrafficEnabled,
    onToggleAirTraffic,
    maritimeTrafficEnabled,
    onToggleMaritimeTraffic,
    issLiveEnabled,
    onToggleIssLive,
    enableLighting,
    onToggleLighting,
    showSatelliteTrajectory,
    onToggleSatelliteTrajectory,
    showFootprintProjection,
    onToggleFootprintProjection,
    showFlowAnimation = true,
    onToggleFlowAnimation,
    sizeScale,
    onSizeScaleChange,
    onSizeScaleReset,
    sceneMode = '3D',
    onSceneModeChange,
    basemapOptions = [],
    selectedBasemapId,
    onBasemapChange,
    isPhone = false,
    isMobileViewport = false,
}) => {
    const [isOverflowOpen, setIsOverflowOpen] = useState(false);
    const overflowRef = useRef<HTMLDivElement>(null);

    const handleZoomIn = useCallback(() => zoomIn(viewerRef), [viewerRef]);
    const handleZoomOut = useCallback(() => zoomOut(viewerRef), [viewerRef]);
    const handleReset = useCallback(() => resetCamera(viewerRef), [viewerRef]);

    const handleToggleReg = useCallback(() => {
        onCountryOverlayModeChange(countryOverlayMode === 'regulatory' ? 'none' : 'regulatory');
    }, [countryOverlayMode, onCountryOverlayModeChange]);

    const handleToggle5G = useCallback(() => {
        onCountryOverlayModeChange(countryOverlayMode === '5g-spectrum' ? 'none' : '5g-spectrum');
    }, [countryOverlayMode, onCountryOverlayModeChange]);

    // Close overflow on outside click or Escape
    useEffect(() => {
        if (!isOverflowOpen) return;
        const onDown = (e: PointerEvent) => {
            if (overflowRef.current && e.target instanceof Node && !overflowRef.current.contains(e.target)) {
                setIsOverflowOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOverflowOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [isOverflowOpen]);

    // Keyboard shortcuts — mirrors GlobeControls
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            switch (e.key) {
                case '+': case '=': e.preventDefault(); handleZoomIn(); break;
                case '-': e.preventDefault(); handleZoomOut(); break;
                case '0': e.preventDefault(); handleReset(); break;
                case 'l': case 'L':
                    if (variant === 'full') {
                        e.preventDefault();
                        onToggleLighting?.();
                    }
                    break;
                case 'p': case 'P':
                    if (variant === 'full') {
                        e.preventDefault();
                        onToggleFootprintProjection?.();
                    }
                    break;
                case 't': case 'T':
                    if (variant === 'full') {
                        e.preventDefault();
                        onToggleSatelliteTrajectory?.();
                    }
                    break;
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [handleZoomIn, handleZoomOut, handleReset, onToggleLighting, onToggleFootprintProjection, onToggleSatelliteTrajectory, variant]);

    const railSurface = 'rounded-2xl border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.94))] shadow-[0_8px_30px_-16px_rgba(15,23,42,0.45)] dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.88))]';
    const isMobile = isPhone || isMobileViewport;
    const showCompactFullscreenControls = isMobile && isFullscreen;
    const showExtendedControls = variant === 'full' && !showCompactFullscreenControls;
    const railTopClass = showCompactFullscreenControls ? 'top-3' : isMobile ? 'top-32' : 'top-3';
    const usesCustomRightOffset = placement === 'right' && Boolean(rightOffset);
    const railSideClass = placement === 'left'
        ? 'left-3 items-start'
        : usesCustomRightOffset
            ? 'items-end'
            : 'right-3 items-end';
    const railStyle: React.CSSProperties | undefined = usesCustomRightOffset
        ? { right: rightOffset }
        : undefined;
    const railZClass = variant === 'camera-only' ? 'z-50' : 'z-30';
    const popoverSideClass = placement === 'left'
        ? 'left-full ml-2'
        : 'right-full mr-2';
    const cameraControls = (
        <div className={`${railSurface} flex w-12 flex-col items-center gap-0.5 p-1.5`}>
            <CameraButton icon={<Plus className="h-4 w-4" />} onClick={handleZoomIn} title="Zoom in (+)" />
            <CameraButton icon={<RotateCcw className="h-4 w-4" />} onClick={handleReset} title="Reset view (0)" active />
            <CameraButton icon={<Minus className="h-4 w-4" />} onClick={handleZoomOut} title="Zoom out (-)" />
            <CameraButton
                icon={isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                onClick={onToggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                active={isFullscreen}
            />
        </div>
    );

    const layerControls = (
        <div className={`${railSurface} flex w-12 flex-col items-center gap-0.5 p-1.5`} aria-label="Layer controls">
            <RailButton
                icon={<Globe className="h-4 w-4" />}
                label="REG"
                active={countryOverlayMode === 'regulatory'}
                onClick={handleToggleReg}
                title="Regulatory zones overlay"
            />
            <RailButton
                icon={<Globe className="h-4 w-4" />}
                label="5G"
                active={countryOverlayMode === '5g-spectrum'}
                onClick={handleToggle5G}
                title="5G spectrum overlay"
            />
            <RailButton
                icon={<Waves className="h-4 w-4" />}
                label="CONN"
                active={showAggregatedConnectivity}
                onClick={onToggleAggregatedConnectivity}
                title="Aggregated connectivity layer"
            />
            <RailButton
                icon={<BarChart2 className="h-4 w-4" />}
                label="LOAD"
                active={showFillRateLayer && fillRateLayerAvailable}
                disabled={!fillRateLayerAvailable}
                onClick={onToggleFillRateLayer}
                title={fillRateLayerAvailable ? 'Network Load model' : 'Network Load is available in LEO or ALL scope only'}
                accentColor="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            />
        </div>
    );

    const objectControls = (
        <div className={`${railSurface} flex w-12 flex-col items-center gap-0.5 p-1.5`} aria-label="Object controls">
            <RailButton
                icon={<Plane className="h-4 w-4" />}
                label="AIR"
                active={airTrafficEnabled}
                onClick={onToggleAirTraffic}
                title="Aircraft traffic layer"
            />
            <RailButton
                icon={<Ship className="h-4 w-4" />}
                label="SEA"
                active={maritimeTrafficEnabled}
                onClick={onToggleMaritimeTraffic}
                title="Maritime traffic layer"
            />
            <RailButton
                icon={<Satellite className="h-4 w-4" />}
                label="ISS"
                active={issLiveEnabled}
                onClick={onToggleIssLive}
                title="ISS live layer"
            />
        </div>
    );

    return (
        <div
            className={`absolute ${railSideClass} ${railTopClass} ${railZClass} flex flex-col gap-2`}
            style={railStyle}
        >
            {/* Camera controls */}
            {cameraControls}

            {/* Layer toggles */}
            {showExtendedControls && layerControls}

            {/* Object toggles */}
            {showExtendedControls && objectControls}

            {/* Category B — display preferences behind ⋯ */}
            {showExtendedControls && (
                <div className="relative" ref={overflowRef}>
                    <div className={`${railSurface} flex w-12 flex-col items-center p-1.5`}>
                        <CameraButton
                            icon={<MoreHorizontal className="h-4 w-4" />}
                            onClick={() => setIsOverflowOpen((v) => !v)}
                            title="Display preferences"
                            active={isOverflowOpen}
                        />
                    </div>

                    {isOverflowOpen && (
                        <div
                            className={`absolute ${popoverSideClass} top-0 z-[1310] w-[272px] max-w-[calc(100vw-5rem)] overflow-hidden rounded-[20px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-2.5 shadow-[0_24px_56px_-28px_rgba(15,23,42,0.65)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))] dark:ring-slate-700/80`}
                            role="dialog"
                            aria-label="Display preferences"
                        >
                            <div className="mb-2 border-b border-slate-200/80 pb-2 dark:border-slate-700">
                                <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">Display Preferences</div>
                            </div>

                            {/* Scene mode */}
                            {onSceneModeChange && (
                                <div className="mb-2">
                                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Scene</div>
                                    <div className="flex gap-1.5">
                                        {(['3D', '2D'] as const).map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => onSceneModeChange(mode)}
                                                className={[
                                                    'flex-1 rounded-xl border py-1.5 text-[12px] font-semibold transition-all',
                                                    sceneMode === mode
                                                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                                        : 'border-slate-200/80 bg-white/90 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200',
                                                ].join(' ')}
                                            >
                                                {mode === '3D' ? 'Globe' : 'Map'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Basemap */}
                            {basemapOptions.length > 0 && onBasemapChange && (
                                <div className="mb-2">
                                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Basemap</div>
                                    <select
                                        value={selectedBasemapId}
                                        onChange={(e) => onBasemapChange(e.target.value)}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-900 outline-none transition focus:border-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        aria-label="Choose basemap"
                                    >
                                        {basemapOptions.map((opt) => (
                                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Toggle rows */}
                            <div className="space-y-1">
                                {onToggleLighting && (
                                    <OverflowToggleRow
                                        icon={<SunMedium className="h-3.5 w-3.5" />}
                                        label="Sun Lighting"
                                        enabled={!!enableLighting}
                                        onClick={() => onToggleLighting()}
                                        title="Toggle solar shading (L)"
                                    />
                                )}
                                {onToggleSatelliteTrajectory && (
                                    <OverflowToggleRow
                                        icon={<Orbit className="h-3.5 w-3.5" />}
                                        label="Trajectory"
                                        enabled={!!showSatelliteTrajectory}
                                        onClick={() => onToggleSatelliteTrajectory()}
                                        title="Toggle satellite orbit arc (T)"
                                    />
                                )}
                                {onToggleFootprintProjection && (
                                    <OverflowToggleRow
                                        icon={<Globe className="h-3.5 w-3.5" />}
                                        label="Footprint"
                                        enabled={!!showFootprintProjection}
                                        onClick={() => onToggleFootprintProjection()}
                                        title="Toggle satellite footprint projection (P)"
                                    />
                                )}
                                {onToggleFlowAnimation && (
                                    <OverflowToggleRow
                                        icon={<Activity className="h-3.5 w-3.5" />}
                                        label="Flow Animation"
                                        enabled={!!showFlowAnimation}
                                        onClick={() => onToggleFlowAnimation()}
                                        title="Toggle traffic flow animation"
                                    />
                                )}
                            </div>

                            {/* Marker scale */}
                            {onSizeScaleChange && (
                                <div className="mt-2 rounded-[16px] border border-slate-200/80 bg-white/78 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/72">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Marker Scale</span>
                                        <div className="flex items-center gap-1.5">
                                            {onSizeScaleReset && (
                                                <button
                                                    type="button"
                                                    onClick={onSizeScaleReset}
                                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                                    title="Reset marker scale"
                                                >
                                                    <RotateCcw className="h-2.5 w-2.5" />
                                                    Reset
                                                </button>
                                            )}
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                                {formatScaleLabel(sizeScale ?? 1)}x
                                            </span>
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.25"
                                        max="8"
                                        step="0.25"
                                        value={sizeScale ?? 1}
                                        onChange={(e) => onSizeScaleChange(parseFloat(e.target.value))}
                                        onDoubleClick={() => onSizeScaleReset?.()}
                                        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600 dark:bg-slate-700"
                                        aria-label="Adjust marker size"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Overflow toggle row ──────────────────────────────────────────────────────

interface OverflowToggleRowProps {
    icon: React.ReactNode;
    label: string;
    enabled: boolean;
    onClick: () => void;
    title?: string;
}

const OverflowToggleRow: React.FC<OverflowToggleRowProps> = ({ icon, label, enabled, onClick, title }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-pressed={enabled}
        className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-1.5 transition-all hover:border-slate-200/80 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-900"
    >
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${enabled ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            {icon}
        </span>
        <span className="flex-1 text-left text-[12px] font-semibold text-slate-800 dark:text-slate-200">{label}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${enabled ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-200/80 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            {enabled ? 'On' : 'Off'}
        </span>
    </button>
);

export default React.memo(GlobeIntelligenceRail);
