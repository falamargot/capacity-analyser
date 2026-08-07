/**
 * RevisitGlobe — the evidence.
 *
 * Its own Cesium viewer, isolated from `CesiumGlobe.tsx`. That isolation is
 * what makes this the right place to turn **requestRenderMode on** for the
 * first time in this codebase (proposal §3.6): a revisit scene is mostly static
 * between control changes, the blast radius is contained, and it produces real
 * evidence for the main-app change the architecture audit flags as PERF-1.
 *
 * Basemap is Cesium's bundled Natural Earth II — offline, deterministic, boots
 * instantly, and dim enough that amber payload satellites and swaths carry the
 * eye. The main app's basemap machinery is deliberately not reused: the whole
 * point of this slice is that nothing crosses the boundary.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer as ResiumViewer, type CesiumComponentRef } from 'resium';
import {
    Cartesian3, Color, Ellipsoid, ImageryLayer, Rectangle, TileMapServiceImageryProvider,
    buildModuleUrl, Viewer as CesiumViewer,
} from 'cesium';
import { setMemoryMonitorViewerGetter } from '../../../utils/memoryMonitor';
import type { OrbitalElements, RevisitScenario } from '../domain/types';
import { REVISIT_COLORS } from '../ui/revisitTheme';
import { frameGlobe, useRevisitScene, type RevisitSceneOptions } from './useRevisitScene';
import { heatColorFor } from './heatMapColors';
import type { AreaAnalysis } from '../analysis/areaAnalysis';

interface RevisitGlobeProps {
    scenario: RevisitScenario;
    fleet: OrbitalElements[];
    selectedIds: Set<string>;
    options: RevisitSceneOptions;
    getTimeMs: () => number;
    /** Per-cell area results to drape as a heat map. Null hides the layer. */
    areaAnalysis: AreaAnalysis | null;
    /** The requirement the heat scale is anchored to. */
    requirementMs: number;
}

export const RevisitGlobe: React.FC<RevisitGlobeProps> = ({
    scenario, fleet, selectedIds, options, getTimeMs, areaAnalysis, requirementMs,
}) => {
    const viewerRef = useRef<CesiumViewer | null>(null);
    const [viewer, setViewer] = useState<CesiumViewer | null>(null);

    const handleViewerRef = useCallback((ref: CesiumComponentRef<CesiumViewer> | null) => {
        const instance = ref?.cesiumElement ?? null;
        viewerRef.current = instance;
        setViewer(instance);
    }, []);

    // Scene setup, once the viewer exists.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;

        // On-demand rendering: the scene redraws when something asks it to,
        // not 60 times a second regardless. `useRevisitScene` requests a render
        // after each position update.
        viewer.scene.requestRenderMode = true;
        viewer.scene.maximumRenderTimeChange = Infinity;

        // ── The requestRenderMode companion, and it is not optional ──────────
        // With on-demand rendering, ANYTHING that finishes asynchronously must
        // ask for a frame or its result is never drawn. Imagery tiles resolve
        // long after the first render, so without this the globe can sit black
        // forever: the surface has tiles it has never been asked to paint.
        //
        // This bites hardest when the tab is hidden during startup — rAF stops,
        // our own animation loop stops with it, and nothing else is left to
        // request a frame. Same failure class as the LEO visibility freeze this
        // codebase already fixed once.
        const requestFrame = () => {
            if (!viewer.isDestroyed?.()) viewer.scene.requestRender();
        };
        const removeTileProgress = viewer.scene.globe.tileLoadProgressEvent
            .addEventListener(requestFrame);

        // Returning to the tab must repaint. `resize()` first: a hidden tab can
        // collapse the viewport to 0×0, and Cesium latches the canvas size, so a
        // bare requestRender would redraw at zero size and change nothing.
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible' || viewer.isDestroyed?.()) return;
            viewer.resize();
            viewer.scene.requestRender();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Layout changes (panel open, window resize) have the same requirement.
        const observer = new ResizeObserver(() => {
            if (viewer.isDestroyed?.()) return;
            viewer.resize();
            viewer.scene.requestRender();
        });
        observer.observe(viewer.container);

        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
        viewer.scene.globe.baseColor = Color.fromCssColorString('#0B1220');
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.backgroundColor = Color.fromCssColorString('#05070D');

        // Cesium's bundled offline basemap — no network, no token, no failure path.
        let cancelled = false;
        void TileMapServiceImageryProvider.fromUrl(
            buildModuleUrl('Assets/Textures/NaturalEarthII')
        ).then((provider) => {
            if (cancelled || !viewerRef.current || viewerRef.current.isDestroyed?.()) return;
            const layers = viewerRef.current.imageryLayers;
            layers.removeAll();
            const layer = new ImageryLayer(provider);
            // Dim the basemap so the constellation is the brightest thing on screen.
            layer.brightness = 0.62;
            layer.saturation = 0.45;
            layers.add(layer);
            viewerRef.current.scene.requestRender();
        }).catch(() => {
            // A missing basemap is cosmetic — the globe still renders as a dark
            // sphere and every number on screen remains correct.
        });

        frameGlobe(viewer);

        // Dev-only handle, in the same spirit as window.__memStats / __perfStats.
        // Statically dropped from production builds.
        if (import.meta.env.DEV) {
            (window as unknown as { __revisitViewer?: CesiumViewer }).__revisitViewer = viewer;
        }

        // Wire the memory monitor to THIS viewer from day one (ADR-001 §4):
        // this codebase has already been bitten by unbounded viewer retention.
        setMemoryMonitorViewerGetter(() => viewerRef.current);

        return () => {
            cancelled = true;
            removeTileProgress();
            document.removeEventListener('visibilitychange', handleVisibility);
            observer.disconnect();
            setMemoryMonitorViewerGetter(() => null);
        };
    }, [viewer]);

    // Slow automatic rotation — ENG's framing, a full globe (UX §4.3).
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        let frame = 0;
        let last = performance.now();
        const spin = () => {
            frame = requestAnimationFrame(spin);
            if (viewer.isDestroyed?.()) return;
            const now = performance.now();
            const dt = (now - last) / 1000;
            last = now;
            // One revolution every ~3 minutes: present, never distracting.
            viewer.scene.camera.rotate(Cartesian3.UNIT_Z, -dt * 0.035);
            viewer.scene.requestRender();
        };
        frame = requestAnimationFrame(spin);
        return () => cancelAnimationFrame(frame);
    }, [viewer]);

    useRevisitScene(viewer, scenario, fleet, selectedIds, options, getTimeMs);

    // The target reticle. An Entity is right here — there is exactly one of it,
    // and the per-entity cost the fleet must avoid is irrelevant at n = 1.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        const { target } = scenario;
        const entity = viewer.entities.add({
            position: Cartesian3.fromDegrees(target.lonDeg, target.latDeg, 0),
            point: {
                pixelSize: 10,
                color: Color.fromCssColorString(REVISIT_COLORS.accent),
                outlineColor: Color.WHITE.withAlpha(0.9),
                outlineWidth: 2,
            },
            label: {
                text: target.name.toUpperCase(),
                font: '600 13px system-ui, sans-serif',
                fillColor: Color.WHITE,
                showBackground: true,
                backgroundColor: Color.fromCssColorString('#0B1220').withAlpha(0.75),
                pixelOffset: new Cartesian3(0, -22, 0),
            },
            ellipse: {
                semiMajorAxis: 220_000,
                semiMinorAxis: 220_000,
                material: Color.TRANSPARENT,
                outline: true,
                outlineColor: Color.fromCssColorString(REVISIT_COLORS.accent).withAlpha(0.6),
                height: 0,
            },
        });
        viewer.scene.requestRender();
        return () => {
            if (viewer.isDestroyed?.()) return;
            viewer.entities.remove(entity);
        };
    }, [viewer, scenario]);

    // ── Area heat map ───────────────────────────────────────────────────────
    // One rectangle per grid cell, as entities. Cell counts are bounded to 400
    // by validateArea, which is well inside what the entity layer handles — the
    // per-entity cost that the 256-satellite fleet must avoid does not bite at
    // this scale, and rectangles are static so they never update per frame.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.() || !areaAnalysis) return;

        const half = areaAnalysis.area.gridSpacingDeg / 2;
        const added = areaAnalysis.cells.map((cell) => {
            const { rgb } = heatColorFor(cell.maxGapMs, requirementMs);
            return viewer.entities.add({
                rectangle: {
                    coordinates: Rectangle.fromDegrees(
                        cell.target.lonDeg - half, cell.target.latDeg - half,
                        cell.target.lonDeg + half, cell.target.latDeg + half,
                    ),
                    material: new Color(rgb[0], rgb[1], rgb[2], 0.55),
                    height: 0,
                },
            });
        });

        viewer.scene.requestRender();
        return () => {
            if (viewer.isDestroyed?.()) return;
            for (const entity of added) viewer.entities.remove(entity);
            viewer.scene.requestRender();
        };
    }, [viewer, areaAnalysis, requirementMs]);

    return (
        <ResiumViewer
            full
            ref={handleViewerRef}
            baseLayer={false}
            ellipsoid={Ellipsoid.WGS84}
            timeline={false}
            animation={false}
            shouldAnimate={false}
            infoBox={false}
            selectionIndicator={false}
            homeButton={false}
            navigationHelpButton={false}
            sceneModePicker={false}
            baseLayerPicker={false}
            geocoder={false}
            fullscreenButton={false}
            vrButton={false}
        />
    );
};
