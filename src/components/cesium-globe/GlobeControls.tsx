/**
 * GlobeControls - Zoom and navigation controls for the Cesium viewer
 */
import React, { useCallback } from 'react';
import {
    Cartesian3,
    EasingFunction,
    Math as CesiumMath,
    Viewer as CesiumViewerType
} from 'cesium';
import FullscreenButton from '../FullscreenButton';

interface GlobeControlsProps {
    viewerRef: React.RefObject<CesiumViewerType | null>;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}

const GlobeControls: React.FC<GlobeControlsProps> = ({
    viewerRef,
    isFullscreen,
    onToggleFullscreen
}) => {
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

    return (
        <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-2">
            <div className="flex items-center gap-1">
                <button
                    onClick={handleZoomOut}
                    className="bg-white/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 transition-colors"
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
                    className="bg-white/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 transition-colors"
                    title="Initialiser la vue"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                        <path d="M3 3v5h5"></path>
                    </svg>
                </button>

                <button
                    onClick={handleZoomIn}
                    className="bg-white/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 transition-colors"
                    title="Zoom avant"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                        <line x1="11" y1="8" x2="11" y2="14"></line>
                        <line x1="8" y1="11" x2="14" y2="11"></line>
                    </svg>
                </button>

                <FullscreenButton isFullscreen={isFullscreen} onClick={onToggleFullscreen} />
            </div>
        </div>
    );
};

export default React.memo(GlobeControls);
