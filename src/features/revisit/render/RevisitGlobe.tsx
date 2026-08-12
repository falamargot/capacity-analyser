/**
 * RevisitGlobe — the evidence.
 *
 * Its own Cesium viewer, isolated from `CesiumGlobe.tsx`.
 *
 * `requestRenderMode` is on here. Proposal §3.6 described this as the first
 * place in the codebase to enable it — that is NO LONGER TRUE: `CesiumGlobe.tsx`
 * enables it too, behind a systematic migration (`globeRenderRequest.ts` plus
 * the "step 2b.x" wiring across a dozen layers). This viewer is a second,
 * independent consumer of the same mode, not a pathfinder for it, and the main
 * app already owns the render-request discipline described below.
 *
 * Basemap is Cesium's bundled Natural Earth II — offline, deterministic, boots
 * instantly, and dim enough that amber payload satellites and swaths carry the
 * eye. The main app's basemap machinery is deliberately not reused: the whole
 * point of this slice is that nothing crosses the boundary.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Viewer as ResiumViewer, type CesiumComponentRef } from 'resium';
import {
    Cartesian2, Cartesian3, Cartographic, Color, Ellipsoid, ImageryLayer,
    Math as CesiumMath, Rectangle, ScreenSpaceEventHandler, ScreenSpaceEventType,
    TileMapServiceImageryProvider, buildModuleUrl, Viewer as CesiumViewer,
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
    /** Slow automatic rotation. */
    autoRotate: boolean;
    /** Called when the user clicks a point on the globe. */
    onPickTarget: (latDeg: number, lonDeg: number) => void;
}

/** Static screen-space reticle: crisp at any zoom and free of per-frame work. */
function createTargetReticle(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return canvas;

    const centre = 32;
    context.strokeStyle = REVISIT_COLORS.target;
    context.fillStyle = REVISIT_COLORS.target;
    context.lineWidth = 1.5;
    context.shadowColor = 'rgba(255, 255, 255, 0.45)';
    context.shadowBlur = 4;

    for (const radius of [12, 23]) {
        context.beginPath();
        context.arc(centre, centre, radius, 0, Math.PI * 2);
        context.stroke();
    }
    for (const [x1, y1, x2, y2] of [
        [centre, 2, centre, 19], [centre, 45, centre, 62],
        [2, centre, 19, centre], [45, centre, 62, centre],
    ]) {
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
    }
    context.beginPath();
    context.arc(centre, centre, 2.5, 0, Math.PI * 2);
    context.fill();
    return canvas;
}

export const RevisitGlobe: React.FC<RevisitGlobeProps> = ({
    scenario, fleet, selectedIds, options, getTimeMs, areaAnalysis, requirementMs,
    autoRotate, onPickTarget,
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
    //
    // Switchable, because rotation actively fights three things the mode needs:
    // reading a swath's position, clicking an exact point, and holding a stable
    // frame while someone photographs the screen.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.() || !autoRotate) return;
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
    }, [viewer, autoRotate]);

    // ── Click the globe to place the target ─────────────────────────────────
    // The UX spec left "city picker, map click, or both" open (§9). Both: the
    // picker carries the story targets, and a click answers "what about here?"
    // without anyone editing coordinates mid-demo.
    //
    // LEFT_CLICK fires only for a press-and-release without drag, so this does
    // not fight camera rotation.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

        handler.setInputAction((event: { position: Cartesian2 }) => {
            if (viewer.isDestroyed?.()) return;
            // pickEllipsoid returns undefined when the click misses the globe —
            // space, or past the limb.
            const cartesian = viewer.camera.pickEllipsoid(
                event.position, viewer.scene.globe.ellipsoid
            );
            if (!cartesian) return;

            const carto = Cartographic.fromCartesian(cartesian);
            onPickTarget(
                CesiumMath.toDegrees(carto.latitude),
                CesiumMath.toDegrees(carto.longitude),
            );
        }, ScreenSpaceEventType.LEFT_CLICK);

        return () => handler.destroy();
    }, [viewer, onPickTarget]);

    useRevisitScene(viewer, scenario, fleet, selectedIds, options, getTimeMs);

    // The target reticle. An Entity is right here — there is exactly one of it,
    // and the per-entity cost the fleet must avoid is irrelevant at n = 1.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        const { target } = scenario;
        const entity = viewer.entities.add({
            position: Cartesian3.fromDegrees(target.lonDeg, target.latDeg, 0),
            billboard: {
                image: createTargetReticle(),
                width: 64,
                height: 64,
                // Draw the reticle in front of coincident ground overlays while
                // retaining normal globe occlusion on the far side of Earth.
                eyeOffset: new Cartesian3(0, 0, -1_000),
            },
            label: {
                text: target.name.toUpperCase(),
                // Concrete families only. Cesium rasterises label glyphs to a
                // canvas atlas, and the CSS-level `system-ui` keyword does not
                // resolve there reliably — it measured the full string but drew
                // almost none of it, which showed up as a picked coordinate
                // label rendering as a single stray character.
                font: '600 13px Helvetica, Arial, sans-serif',
                fillColor: Color.fromCssColorString(REVISIT_COLORS.target),
                outlineColor: Color.fromCssColorString('#05070D'),
                outlineWidth: 3,
                showBackground: true,
                backgroundColor: Color.fromCssColorString('#05070D').withAlpha(0.86),
                backgroundPadding: new Cartesian2(7, 4),
                pixelOffset: new Cartesian2(0, -48),
                eyeOffset: new Cartesian3(0, 0, -1_000),
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
