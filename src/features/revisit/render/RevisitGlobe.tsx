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
    Math as CesiumMath, PointPrimitiveCollection, PolygonHierarchy, Rectangle,
    KeyboardEventModifier, ScreenSpaceEventHandler, ScreenSpaceEventType, TileMapServiceImageryProvider,
    buildModuleUrl, Viewer as CesiumViewer,
} from 'cesium';
import { setMemoryMonitorViewerGetter } from '../../../utils/memoryMonitor';
import type { OrbitalElements, RevisitScenario } from '../domain/types';
import { REVISIT_COLORS } from '../ui/revisitTheme';
import { frameGlobe, useRevisitScene, type RevisitSceneOptions } from './useRevisitScene';
import { heatColorFor } from './heatMapColors';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import type { AreaTarget } from '../domain/areaTarget';
import {
    REFERENCE_POINT_ID, type RevisitAnalysisContext, type RevisitComparisonPoint,
} from '../domain/analysisTargets';

interface RevisitGlobeProps {
    scenario: RevisitScenario;
    fleet: OrbitalElements[];
    selectedIds: Set<string>;
    options: RevisitSceneOptions;
    getTimeMs: () => number;
    /** Per-cell area results to drape as a heat map. Null hides the layer. */
    areaAnalysis: AreaAnalysis | null;
    /** P2b-A polygon being drawn/imported; previewed without triggering analysis. */
    areaDraft: AreaTarget | null;
    isDrawingArea: boolean;
    analysisContext: RevisitAnalysisContext;
    comparisonPoints: RevisitComparisonPoint[];
    selectedPointId: typeof REFERENCE_POINT_ID | string;
    /** The requirement the heat scale is anchored to. */
    requirementMs: number;
    /** Slow automatic rotation. */
    autoRotate: boolean;
    /** Called when the user clicks a point on the globe. */
    onPickTarget: (latDeg: number, lonDeg: number) => void;
    onDrawAreaVertex: (latDeg: number, lonDeg: number) => void;
    onAddComparisonPoint: (latDeg: number, lonDeg: number) => void;
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
    scenario, fleet, selectedIds, options, getTimeMs, areaAnalysis, areaDraft,
    isDrawingArea, analysisContext, comparisonPoints, selectedPointId,
    requirementMs, autoRotate, onPickTarget,
    onDrawAreaVertex, onAddComparisonPoint,
}) => {
    const viewerRef = useRef<CesiumViewer | null>(null);
    const frameForCurrentLayoutRef = useRef<(() => void) | null>(null);
    const [viewer, setViewer] = useState<CesiumViewer | null>(null);
    const areaDraftPointsRef = useRef<{ id: string | null; points: PointPrimitiveCollection } | null>(null);

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

        // On phones the result strip and timeline occupy the bottom of the
        // canvas. Centre the globe in the unobstructed band above that footer,
        // instead of in the full canvas where it reads visibly too low.
        const frameForCurrentLayout = () => {
            const canvasRect = viewer.scene.canvas.getBoundingClientRect();
            const shell = viewer.container.closest('.revisit-shell');
            const resultStrip = shell?.querySelector<HTMLElement>('[data-revisit-result-strip]');
            const coverageRibbon = shell?.querySelector<HTMLElement>('.revisit-coverage-ribbon');
            const header = shell?.querySelector<HTMLElement>('[data-global-app-header]');
            const compact = window.matchMedia('(max-width: 767px)').matches;
            const resultStripRect = resultStrip?.getBoundingClientRect();
            const footerTop = resultStripRect && resultStripRect.height > 0
                ? resultStripRect.top
                : coverageRibbon?.getBoundingClientRect().top;
            const footerOcclusion = footerTop !== undefined
                ? Math.max(0, canvasRect.bottom - footerTop)
                : 0;
            const headerOcclusion = header
                ? Math.max(0, header.getBoundingClientRect().bottom - canvasRect.top)
                : 0;
            const verticalScreenBias = canvasRect.height > 0
                ? compact
                    // The extra 2.5% favours the globe over the empty sky above
                    // it, while the measured half-footer term keeps the sphere
                    // centred against one or several timeline lanes.
                    ? Math.min(0.34, Math.max(0.08, (footerOcclusion - headerOcclusion) / (2 * canvasRect.height)) + 0.025)
                    : Math.max(-0.2, Math.min(0.2, (footerOcclusion - headerOcclusion) / (2 * canvasRect.height)))
                : 0;

            frameGlobe(viewer, verticalScreenBias);
            viewer.scene.requestRender();
        };
        frameForCurrentLayoutRef.current = frameForCurrentLayout;
        const initialFrame = requestAnimationFrame(frameForCurrentLayout);

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
            cancelAnimationFrame(initialFrame);
            frameForCurrentLayoutRef.current = null;
            removeTileProgress();
            document.removeEventListener('visibilitychange', handleVisibility);
            observer.disconnect();
            setMemoryMonitorViewerGetter(() => null);
        };
    }, [viewer]);

    // Adding comparison lanes (or switching POINTS/AREA) changes the footer
    // height without resizing the Cesium canvas. Reframe after React has laid
    // out that new footer so the globe does not fall back to the canvas centre.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        let secondFrame = 0;
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => frameForCurrentLayoutRef.current?.());
        });
        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
        };
    }, [analysisContext, comparisonPoints.length, viewer]);

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

        const pointAt = (event: { position: Cartesian2 }) => {
            if (viewer.isDestroyed?.()) return;
            // pickEllipsoid returns undefined when the click misses the globe —
            // space, or past the limb.
            const cartesian = viewer.camera.pickEllipsoid(
                event.position, viewer.scene.globe.ellipsoid
            );
            if (!cartesian) return null;

            const carto = Cartographic.fromCartesian(cartesian);
            return {
                latDeg: CesiumMath.toDegrees(carto.latitude),
                lonDeg: CesiumMath.toDegrees(carto.longitude),
            };
        };

        handler.setInputAction((event: { position: Cartesian2 }) => {
            const point = pointAt(event);
            if (!point) return;
            const { latDeg, lonDeg } = point;
            if (isDrawingArea) onDrawAreaVertex(latDeg, lonDeg);
            else if (analysisContext === 'POINTS') {
                onPickTarget(latDeg, lonDeg);
            }
        }, ScreenSpaceEventType.LEFT_CLICK);

        handler.setInputAction((event: { position: Cartesian2 }) => {
            if (isDrawingArea || analysisContext !== 'POINTS') return;
            const point = pointAt(event);
            if (point) onAddComparisonPoint(point.latDeg, point.lonDeg);
        }, ScreenSpaceEventType.LEFT_CLICK, KeyboardEventModifier.SHIFT);

        return () => handler.destroy();
    }, [
        viewer, isDrawingArea, analysisContext,
        onAddComparisonPoint, onDrawAreaVertex, onPickTarget,
    ]);

    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.() || !isDrawingArea) return;
        const canvas = viewer.scene.canvas;
        const previousCursor = canvas.style.cursor;
        canvas.style.cursor = 'crosshair';
        return () => { canvas.style.cursor = previousCursor; };
    }, [viewer, isDrawingArea]);

    useRevisitScene(viewer, scenario, fleet, selectedIds, options, getTimeMs);

    // The target reticle. An Entity is right here — there is exactly one of it,
    // and the per-entity cost the fleet must avoid is irrelevant at n = 1.
    const pointTarget = scenario.target;
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        const target = pointTarget;
        const pointContextActive = analysisContext === 'POINTS';
        const entity = viewer.entities.add({
            position: Cartesian3.fromDegrees(target.lonDeg, target.latDeg, 0),
            billboard: {
                image: createTargetReticle(),
                color: Color.WHITE.withAlpha(pointContextActive ? 1 : 0.25),
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
                fillColor: Color.fromCssColorString(REVISIT_COLORS.target).withAlpha(pointContextActive ? 1 : 0.3),
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
    }, [viewer, pointTarget, analysisContext]);

    // Secondary comparison points are deliberately static and bounded to two.
    // They use simple entities rather than joining the fleet's hot primitive loop.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.() || comparisonPoints.length === 0) return;
        const pointContextActive = analysisContext === 'POINTS';
        const added = comparisonPoints.map((point, index) => {
            const selected = selectedPointId === point.id;
            const color = Color.fromCssColorString('#38BDF8').withAlpha(pointContextActive ? 1 : 0.25);
            return viewer.entities.add({
                position: Cartesian3.fromDegrees(point.target.lonDeg, point.target.latDeg, 0),
                point: {
                    pixelSize: selected ? 15 : 11,
                    color,
                    outlineColor: Color.fromCssColorString('#05070D'),
                    outlineWidth: 3,
                },
                label: {
                    text: `COMPARE ${index + 1} · ${point.target.name}`.toUpperCase(),
                    font: '600 11px Helvetica, Arial, sans-serif',
                    fillColor: color,
                    outlineColor: Color.fromCssColorString('#05070D'),
                    outlineWidth: 3,
                    showBackground: true,
                    backgroundColor: Color.fromCssColorString('#05070D').withAlpha(0.82),
                    backgroundPadding: new Cartesian2(5, 3),
                    pixelOffset: new Cartesian2(0, -22),
                },
            });
        });
        viewer.scene.requestRender();
        return () => {
            if (viewer.isDestroyed?.()) return;
            for (const entity of added) viewer.entities.remove(entity);
            viewer.scene.requestRender();
        };
    }, [viewer, comparisonPoints, selectedPointId, analysisContext]);

    // ── P2b-A polygon preview ───────────────────────────────────────────────
    // Entities are rebuilt on every vertex, but the point PRIMITIVE COLLECTION
    // — the expensive part, a GPU buffer allocation via `scene.primitives.add`
    // — is kept alive across edits to the SAME draft (matched by `id`, not the
    // user-editable `name`) and merely repopulated. A 20-30 vertex freehand
    // draw then costs 20-30 cheap `removeAll`/`add` passes instead of 20-30
    // full primitive-collection create/destroy cycles.
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;
        if (!areaDraft || areaDraft.boundary.length === 0) {
            const existing = areaDraftPointsRef.current;
            if (existing) {
                viewer.scene.primitives.remove(existing.points);
                areaDraftPointsRef.current = null;
                viewer.scene.requestRender();
            }
            return;
        }
        const belongsToVisibleAnalysis = Boolean(areaAnalysis?.area.id)
            && areaAnalysis?.area.id === areaDraft.id;
        if (!isDrawingArea && areaAnalysis && !belongsToVisibleAnalysis) return;

        const draftId = areaDraft.id ?? null;
        let handles = areaDraftPointsRef.current;
        if (!handles || handles.id !== draftId) {
            if (handles) viewer.scene.primitives.remove(handles.points);
            handles = { id: draftId, points: viewer.scene.primitives.add(new PointPrimitiveCollection()) };
            areaDraftPointsRef.current = handles;
        }

        const positions = areaDraft.boundary.map((point) => (
            Cartesian3.fromDegrees(point.lonDeg, point.latDeg, 250)
        ));
        const areaContextActive = analysisContext === 'AREA';
        const pointColor = Color.fromCssColorString('#38BDF8').withAlpha(areaContextActive ? 1 : 0.28);
        handles.points.removeAll();
        for (const position of positions) {
            handles.points.add({
                position,
                color: pointColor,
                pixelSize: 8,
                outlineColor: Color.fromCssColorString('#05070D'),
                outlineWidth: 2,
            });
        }

        const outlinePositions = positions.length >= 3 ? [...positions, positions[0]] : positions;
        const outline = positions.length >= 2 ? viewer.entities.add({
            polyline: {
                positions: outlinePositions,
                width: 2.5,
                material: pointColor.withAlpha(areaContextActive ? 0.95 : 0.24),
            },
        }) : null;
        const fill = positions.length >= 3 ? viewer.entities.add({
            polygon: {
                hierarchy: new PolygonHierarchy(positions),
                material: pointColor.withAlpha(areaContextActive ? 0.12 : 0.035),
                height: 0,
            },
        }) : null;

        viewer.scene.requestRender();
        return () => {
            if (viewer.isDestroyed?.()) return;
            if (outline) viewer.entities.remove(outline);
            if (fill) viewer.entities.remove(fill);
            viewer.scene.requestRender();
        };
    }, [viewer, areaDraft, areaAnalysis, isDrawingArea, analysisContext]);

    // The persisted point collection above outlives any single effect run —
    // release it only when the viewer itself goes away.
    useEffect(() => () => {
        const handles = areaDraftPointsRef.current;
        if (handles && viewer && !viewer.isDestroyed?.()) {
            viewer.scene.primitives.remove(handles.points);
        }
        areaDraftPointsRef.current = null;
    }, [viewer]);

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
                    material: new Color(rgb[0], rgb[1], rgb[2], analysisContext === 'AREA' ? 0.55 : 0.14),
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
    }, [viewer, areaAnalysis, requirementMs, analysisContext]);

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
