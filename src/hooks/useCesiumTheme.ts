import { useEffect } from 'react';
import { Viewer as CesiumViewerType } from 'cesium';
import { useTheme } from '../contexts/ThemeContext';

export const useCesiumTheme = (viewerRef: React.RefObject<CesiumViewerType | null>) => {
    const { theme } = useTheme();

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        // Determine if we should apply night mode settings
        // If theme is 'system', we need to check system preference, but ThemeContext already handles resolving 'system' to 'dark'/'light' on the document class 
        // However, useTheme exposes the raw preference. 
        // We need to check if 'dark' class is present on html or handle system resolution here?
        // Better: use window.matchMedia for system if theme is 'system'.

        // Actually, ThemeContext.tsx effect sets the class on document element.
        // We can check if theme is 'dark' or (theme is 'system' and matches).

        let isDark = false;
        if (theme === 'dark') {
            isDark = true;
        } else if (theme === 'system') {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }

        const layers = viewer.imageryLayers;
        const length = layers.length;

        // Settings
        // Night: Reduced brightness, saturation, slightly increased contrast
        const brightness = isDark ? 0.6 : 1.0;
        const saturation = isDark ? 0.7 : 1.0;
        const contrast = isDark ? 1.15 : 1.0;

        for (let i = 0; i < length; i++) {
            const layer = layers.get(i);
            layer.brightness = brightness;
            layer.saturation = saturation;
            layer.contrast = contrast;
        }

        // Force a re-render of the scene
        viewer.scene.requestRender();

    }, [theme, viewerRef]);
};
