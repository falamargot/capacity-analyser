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
import FullscreenButton from '../FullscreenButton';
import { Settings2, Globe, Map } from 'lucide-react';

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
    view?: 'globe' | 'map';
    onViewChange?: (view: 'globe' | 'map') => void;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
}

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
    // view = 'globe',
    // onViewChange,
    sceneMode = '3D',
    onSceneModeChange,
}) => {
    const [isMapOptionsOpen, setIsMapOptionsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement | null>(null);

    const handleZoomOut = useCallback(() => {
        if (!viewerRef.current) return;

        const camera = viewerRef.current.camera;
        const currentHeight = camera.positionCartographic.height;
        const targetHeight = currentHeight * 1.3; // Zoom out by 30%
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
        const targetHeight = currentHeight * 0.7; // Zoom in by 30%
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

        document.addEventListener('pointerdown', onDocPointerDown);
        return () => document.removeEventListener('pointerdown', onDocPointerDown);
    }, [isMapOptionsOpen]);

    return (
        <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2">
            {isPhone ? (
                <>
                    {/* First row: Switch Globe/Map, Map Settings, Fullscreen */}
                    <div className="flex items-center gap-1" ref={popoverRef}>
                        {onSceneModeChange && (
                            <button
                                type="button"
                                onClick={() => onSceneModeChange(sceneMode === '3D' ? '2D' : '3D')}
                                className="bg-white/90 dark:bg-slate-900/95 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-800 transition-colors text-gray-700 dark:text-gray-100"
                                title={sceneMode === '3D' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
                                aria-label={sceneMode === '3D' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
                            >
                                {sceneMode === '3D' ? <Map className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                            </button>
                        )}



                        {/* Always show Map Settings in phone mode */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsMapOptionsOpen((v) => !v)}
                                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white/90 dark:bg-slate-900/95 rounded-md shadow-sm backdrop-blur-sm transition-colors"
                                title="Map options"
                                aria-label="Map options"
                            >
                                <Settings2 size={16} />
                            </button>

                            {isMapOptionsOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-gray-200 dark:border-slate-700 p-3 z-20">
                                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Map Options</div>

                                    <button
                                        type="button"
                                        onClick={onToggleLighting}
                                        className="w-full flex items-center justify-between py-2 text-sm text-gray-800 dark:text-gray-200"
                                    >
                                        <span>Sun Light</span>
                                        <span className={`text-xs font-semibold ${enableLighting ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {enableLighting ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={onToggleSatelliteTrajectory}
                                        className="w-full flex items-center justify-between py-2 text-sm text-gray-800 dark:text-gray-200"
                                    >
                                        <span>Trajectory</span>
                                        <span className={`text-xs font-semibold ${showSatelliteTrajectory ? 'text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {showSatelliteTrajectory ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    <div className="pt-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-gray-800 dark:text-gray-200">Size</div>
                                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">{sizeScale ?? 1}x</div>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.25"
                                            max="8"
                                            step="0.25"
                                            value={sizeScale ?? 1}
                                            onChange={(e) => onSizeScaleChange?.(parseFloat(e.target.value))}
                                            onDoubleClick={() => onSizeScaleChange?.(1)}
                                            className="w-full mt-2 h-1 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                                            title="Adjust object size (0.25x to 8x) - Double-click to reset to 1x"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <FullscreenButton isFullscreen={isFullscreen} onClick={onToggleFullscreen} />
                    </div>

                    {/* Second row: Zoom -, Reset, Zoom + */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleZoomOut}
                            className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                            title="Zoom arrière"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>

                        <button
                            onClick={handleReset}
                            className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                            title="Initialiser la vue"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                <path d="M3 3v5h5"></path>
                            </svg>
                        </button>

                        <button
                            onClick={handleZoomIn}
                            className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                            title="Zoom avant"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                                <line x1="11" y1="8" x2="11" y2="14"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                    </div>
                </>
            ) : (
                <>
                    {/* First row: Switch Globe/Map, Map Settings, Fullscreen */}
                    <div className="flex items-center gap-1" ref={popoverRef}>
                        {onSceneModeChange && (
                            <button
                                type="button"
                                onClick={() => onSceneModeChange(sceneMode === '3D' ? '2D' : '3D')}
                                className="bg-white/90 dark:bg-slate-900/95 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-800 transition-colors text-gray-700 dark:text-gray-100"
                                title={sceneMode === '3D' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
                                aria-label={sceneMode === '3D' ? 'Switch to 2D Map' : 'Switch to 3D Globe'}
                            >
                                {sceneMode === '3D' ? <Map className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                            </button>
                        )}



                        {/* Map Settings button */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsMapOptionsOpen((v) => !v)}
                                className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white/90 dark:bg-slate-900/95 rounded-md shadow-sm backdrop-blur-sm transition-colors"
                                title="Map options"
                                aria-label="Map options"
                            >
                                <Settings2 size={16} />
                            </button>

                            {isMapOptionsOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg border border-gray-200 dark:border-slate-700 p-3 z-20">
                                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">Map Options</div>

                                    <button
                                        type="button"
                                        onClick={onToggleLighting}
                                        className="w-full flex items-center justify-between py-2 text-sm text-gray-800 dark:text-gray-200"
                                    >
                                        <span>Sun Light</span>
                                        <span className={`text-xs font-semibold ${enableLighting ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {enableLighting ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={onToggleSatelliteTrajectory}
                                        className="w-full flex items-center justify-between py-2 text-sm text-gray-800 dark:text-gray-200"
                                    >
                                        <span>Satellite Trajectory</span>
                                        <span className={`text-xs font-semibold ${showSatelliteTrajectory ? 'text-purple-700 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {showSatelliteTrajectory ? 'ON' : 'OFF'}
                                        </span>
                                    </button>

                                    <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between py-2">
                                            <span className="text-sm text-gray-800 dark:text-gray-200">Size</span>
                                            <input
                                                type="range"
                                                min="0.25"
                                                max="8"
                                                step="0.25"
                                                value={sizeScale || 1}
                                                onChange={(e) => onSizeScaleChange?.(parseFloat(e.target.value))}
                                                onDoubleClick={() => onSizeScaleChange?.(1)}
                                                className="w-20 h-1 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                                                title="Adjust object size (0.25x to 8x) - Double-click to reset to 1x"
                                            />
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400 text-right">{sizeScale}x</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <FullscreenButton isFullscreen={isFullscreen} onClick={onToggleFullscreen} />
                    </div>

                    {/* Second row: Zoom -, Reset, Zoom + */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={handleZoomOut}
                            className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                            title="Zoom arrière"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>

                        <button
                            onClick={handleReset}
                            className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                            title="Initialiser la vue"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                <path d="M3 3v5h5"></path>
                            </svg>
                        </button>

                        <button
                            onClick={handleZoomIn}
                            className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 dark:hover:bg-slate-700 transition-colors text-gray-700 dark:text-gray-200"
                            title="Zoom avant"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                                <line x1="11" y1="8" x2="11" y2="14"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default React.memo(GlobeControls);
