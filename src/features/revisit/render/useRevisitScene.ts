/**
 * useRevisitScene — imperative Cesium layers for the revisit globe.
 *
 * ── WHY ONE IMPERATIVE CONTROLLER RATHER THAN FOUR COMPONENTS ───────────────
 * The design note sketched ConstellationLayer / SwathLayer / TargetMarkers as
 * separate React components. At P·S = 256 satellites that shape is the failure
 * mode this codebase has already hit once: `OneWebCombLayer` recreated entities
 * every tick. The performance mandate (design note §5.2) is:
 *
 *   - ONE PointPrimitiveCollection for the whole fleet, positions updated in
 *     place — never one Entity per satellite;
 *   - P orbit polylines, not P·S — a Walker constellation has only P distinct
 *     planes, so 12 lines look identical to 96 and cost an eighth;
 *   - swath outlines and optional projection volumes only for the highlighted
 *     payload sub-constellation.
 *
 * All layers share one update pass, so they live in one controller. React owns
 * mounting; Cesium primitives own their own lifetime.
 *
 * ── FRAME ──────────────────────────────────────────────────────────────────
 * Everything is computed in ECEF using the engine's own GMST, so a satellite is
 * drawn exactly where `containment.ts` says it is. The alternative — Cesium's
 * INERTIAL reference frame, which keeps orbit rings fixed while the Earth spins
 * — needs `Transforms.preloadIcrfFixed()` and a network fetch that can fail. In
 * ECEF the rings precess westward, which is what an observer on the ground
 * actually sees, and it makes the ground-track drift legible. Revisit in Lot 3
 * if the fixed-ring visual is wanted.
 *
 * Time is read from `SimulationClock.getTimeMs()` inside the frame callback,
 * never from React state — time progression deliberately emits no render.
 */

import { useEffect, useRef } from 'react';
import {
    BoundingSphere, Cartesian2, Cartesian3, Color, ColorGeometryInstanceAttribute,
    ComponentDatatype, DistanceDisplayCondition, Geometry, GeometryAttribute, GeometryAttributes,
    GeometryInstance,
    LabelCollection, LabelStyle, Math as CesiumMath, Material, NearFarScalar,
    PerInstanceColorAppearance, PointPrimitiveCollection, PolylineCollection, Primitive,
    PrimitiveCollection, PrimitiveType, VerticalOrigin, type Viewer,
} from 'cesium';
import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import { orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toRad } from '../../../utils/sphericalGeometry';
import { maskLimbRad } from '../fov/footprint';
import type { OrbitalElements, RevisitScenario } from '../domain/types';
import {
    eciToEcef, earthRotationRad, preparePropagators, propagateState,
    orbitalPeriodSec, type PropagatorState,
} from '../propagation/keplerJ2';
import { prepareFov } from '../fov/containment';
import { computeFootprint } from '../fov/footprint';
import { REVISIT_COLORS } from '../ui/revisitTheme';

/**
 * Satellite positions refresh at this rate; the camera still renders on demand.
 *
 * **This constant is what R12's frame rate actually measures.** Measured on an
 * Apple M4 (2026-09-04, `e2e/perf-r12.spec.ts`) with the fleet in motion:
 *
 *     frame cost      p50 1.1 ms   p95 1.9 ms      (budget at 60 Hz: 16.7 ms)
 *     frame interval  p50 17.8 ms  p95 50.7 ms     (50.7 ms = 1000/20)
 *     rendered        35.5 fps     browser ceiling 59.9 fps
 *
 * So the app is CADENCE-bound, not cost-bound: a frame uses ~7 % of the budget,
 * and the p95 interval is this constant. Raising it to 60 would buy the 60 fps
 * target and cost three times the update work — which is the opposite of what
 * Lot 2C set out to do, for motion that is ~2.4 px per tick at ×1 playback.
 * Under accelerated playback the step is large at ANY cadence (~240 px per tick
 * at ×100, ~80 px at 60 Hz), so raising it does not fix what is actually
 * visible there either.
 *
 * Do not "optimise" the render path against R12 without re-reading that: there
 * is no slow frame to find.
 */
const POSITION_UPDATE_HZ = 20;

/**
 * Orbit rings refresh far more slowly than the satellites on them.
 *
 * A ring is fixed in inertial space; drawn in ECEF it only precesses with Earth
 * rotation, 15° per hour — 0.2° between refreshes at 2 Hz, which is well under a
 * pixel at any sensible zoom. Rebuilding 12 rings of 129 points at the satellite
 * cadence was the single largest allocator in the scene and bought nothing.
 */
const ORBIT_UPDATE_HZ = 2;
/** Labels are annotations, not motion evidence; 2 Hz is visually sufficient. */
const LABEL_UPDATE_HZ = 2;
/**
 * Labels are for identifying the highlighted payload topology, not for turning
 * the 634-host scene into an unreadable text cloud. The cap also bounds Cesium's
 * glyph/vertex buffers when the executive slider reaches the full fleet.
 */
export const MAX_SATELLITE_LABELS = 96;
/** Vertices per orbit ring. 128 is smooth at any zoom and costs nothing. */
const ORBIT_SAMPLES = 128;
/** Boundary vertices per swath. */
const SWATH_SAMPLES = 32;
/** Facets around the translucent satellite-to-footprint projection volume. */
const PROJECTION_VOLUME_FACETS = 8;

/** Keep the optional layer bounded when every host in a large fleet is equipped. */
function projectionVolumeFacetCount(payloadCount: number): number {
    if (payloadCount > 256) return 3;
    if (payloadCount > 96) return 4;
    return PROJECTION_VOLUME_FACETS;
}

export interface RevisitSceneOptions {
    showOrbits: boolean;
    showSwaths: boolean;
    showProjectionCones: boolean;
    showHostFleet: boolean;
    showLabels: boolean;
}

interface SceneHandles {
    points: PointPrimitiveCollection;
    labels: LabelCollection;
    orbits: PolylineCollection;
    swaths: PolylineCollection;
    projectionVolumes: PrimitiveCollection;
}

/**
 * (Re)builds the satellite label collection from scratch. Cesium rasterises
 * each label's glyphs into a shared canvas atlas, which is materially more
 * expensive than a point primitive — never called while labels are hidden.
 */
function populateSatelliteLabels(
    handles: SceneHandles,
    fleet: OrbitalElements[],
    selectedIds: Set<string>,
    payloadColor: Color,
    spaceOutline: Color,
    labelBackgroundColor: Color,
): void {
    handles.labels.removeAll();
    for (const el of fleet) {
        if (!selectedIds.has(el.id)) continue;
        if (handles.labels.length >= MAX_SATELLITE_LABELS) break;
        handles.labels.add({
            show: true,
            position: Cartesian3.ZERO,
            text: el.id,
            font: 'bold 11px sans-serif',
            style: LabelStyle.FILL_AND_OUTLINE,
            fillColor: payloadColor,
            outlineColor: spaceOutline,
            outlineWidth: 3,
            showBackground: true,
            backgroundColor: labelBackgroundColor,
            backgroundPadding: new Cartesian2(3, 2),
            pixelOffset: new Cartesian2(0, -14),
            verticalOrigin: VerticalOrigin.BOTTOM,
            scaleByDistance: new NearFarScalar(1.0e6, 1, 3.0e7, 0.7),
            distanceDisplayCondition: new DistanceDisplayCondition(0, 3.0e7),
        });
    }
}

/** ECEF position of a satellite at `tSeconds` after epoch, in metres for Cesium. */
function ecefPosition(
    sat: PropagatorState, epochMs: number, tSeconds: number, out: Cartesian3
): Cartesian3 {
    const eci = propagateState(sat, tSeconds);
    const ecef = eciToEcef(eci, earthRotationRad(epochMs, tSeconds));
    out.x = ecef.x * 1000;
    out.y = ecef.y * 1000;
    out.z = ecef.z * 1000;
    return out;
}

export function useRevisitScene(
    viewer: Viewer | null,
    scenario: RevisitScenario,
    fleet: OrbitalElements[],
    selectedIds: Set<string>,
    options: RevisitSceneOptions,
    /**
     * Reads the current scenario instant, UTC ms — normally
     * `clock.getTimeMs`. Passed in rather than read from context here so the
     * frame loop can call it without React ever re-rendering: time progression
     * deliberately emits no render.
     */
    getTimeMs: () => number
): void {
    const handlesRef = useRef<SceneHandles | null>(null);
    // Latest inputs, read inside the frame callback so it never needs recreating.
    const stateRef = useRef({ scenario, fleet, selectedIds, options, getTimeMs });
    stateRef.current = { scenario, fleet, selectedIds, options, getTimeMs };

    // ── Create and destroy the primitive collections ────────────────────────
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;

        const points = viewer.scene.primitives.add(new PointPrimitiveCollection());
        const labels = viewer.scene.primitives.add(new LabelCollection());
        const orbits = viewer.scene.primitives.add(new PolylineCollection());
        const swaths = viewer.scene.primitives.add(new PolylineCollection());
        const projectionVolumes = viewer.scene.primitives.add(new PrimitiveCollection());
        handlesRef.current = { points, labels, orbits, swaths, projectionVolumes };

        return () => {
            handlesRef.current = null;
            if (viewer.isDestroyed?.()) return;
            // `remove` destroys the primitive, which releases its GPU buffers.
            // Leaking these is how the 109 MB retention bug happened before.
            viewer.scene.primitives.remove(points);
            viewer.scene.primitives.remove(labels);
            viewer.scene.primitives.remove(orbits);
            viewer.scene.primitives.remove(swaths);
            viewer.scene.primitives.remove(projectionVolumes);
        };
    }, [viewer]);

    // ── Rebuild the point set when the fleet or the selection changes ───────
    useEffect(() => {
        const handles = handlesRef.current;
        if (!viewer || viewer.isDestroyed?.() || !handles) return;

        const hostColor = Color.fromCssColorString(REVISIT_COLORS.hostFleet).withAlpha(0.72);
        const payloadColor = Color.fromCssColorString(REVISIT_COLORS.payload);
        const spaceOutline = Color.fromCssColorString('#05070D').withAlpha(0.9);
        const labelBackgroundColor = Color.fromCssColorString('#05070D').withAlpha(0.72);

        handles.points.removeAll();
        for (const el of fleet) {
            const isPayload = selectedIds.has(el.id);
            if (!isPayload && !options.showHostFleet) continue;
            const point = handles.points.add({
                position: Cartesian3.ZERO,
                color: isPayload ? payloadColor : hostColor,
                pixelSize: isPayload ? 9 : 4.5,
                outlineColor: spaceOutline,
                outlineWidth: isPayload ? 2 : 1,
                id: el.id,
            });
            // Screen-space scaling keeps the fleet legible in the full-globe
            // framing without moving a point away from its propagated position.
            point.scaleByDistance = new NearFarScalar(1.0e6, 1.18, 3.0e7, 1.0);
        }
        // Labels are rasterised into a glyph atlas, materially more expensive
        // than a point — never built while hidden. The toggle effect below
        // populates them on demand if the fleet/selection changed while off.
        if (stateRef.current.options.showLabels) {
            populateSatelliteLabels(handles, fleet, selectedIds, payloadColor, spaceOutline, labelBackgroundColor);
        } else {
            handles.labels.removeAll();
        }
        viewer.scene.requestRender();
    }, [viewer, fleet, selectedIds, options.showHostFleet]);

    // Visibility is a cheap property update. Keep the bounded label collection
    // alive across toggles so Cesium's glyph atlas and event plumbing are not
    // repeatedly destroyed and rebuilt. If the fleet/selection changed while
    // labels were off, the collection above will be empty — populate it now
    // rather than waiting for the next fleet change.
    useEffect(() => {
        const handles = handlesRef.current;
        if (!viewer || viewer.isDestroyed?.() || !handles) return;
        if (options.showLabels && handles.labels.length === 0) {
            const payloadColor = Color.fromCssColorString(REVISIT_COLORS.payload);
            const spaceOutline = Color.fromCssColorString('#05070D').withAlpha(0.9);
            const labelBackgroundColor = Color.fromCssColorString('#05070D').withAlpha(0.72);
            populateSatelliteLabels(
                handles, stateRef.current.fleet, stateRef.current.selectedIds,
                payloadColor, spaceOutline, labelBackgroundColor,
            );
        } else {
            for (let index = 0; index < handles.labels.length; index += 1) {
                const label = handles.labels.get(index);
                if (label) label.show = options.showLabels;
            }
        }
        viewer.scene.requestRender();
    }, [viewer, options.showLabels]);

    // ── The update pass ────────────────────────────────────────────────────
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;

        let frame = 0;
        let lastUpdateMs = 0;
        let lastOrbitMs = 0;
        let lastLabelMs = 0;
        const scratch = new Cartesian3();
        let propagators: PropagatorState[] = [];
        /**
         * Cache identity, NOT a digest of a few fields.
         *
         * This previously keyed on `length | fleet[0].id | semiMajorAxis |
         * inclination`, which is invariant under `phasingF`, `fudge` and
         * `raan0Deg`: satellite `P00_S00` sits at argument of latitude 0 whatever
         * the phasing, and at `raan0` whatever the fudge. Editing any of those in
         * the Advanced drawer therefore updated every number while the globe kept
         * drawing the previous geometry.
         *
         * The fleet array is regenerated whenever the Walker spec changes, so its
         * identity is an exact invalidation signal and cannot drift out of step
         * with the fields it summarises.
         */
        let propagatorFleet: OrbitalElements[] | null = null;

        const tick = () => {
            frame = requestAnimationFrame(tick);
            if (viewer.isDestroyed?.()) return;

            const now = performance.now();
            if (now - lastUpdateMs < 1000 / POSITION_UPDATE_HZ) return;
            lastUpdateMs = now;

            const handles = handlesRef.current;
            if (!handles) return;
            const {
                scenario: sc, fleet: fl, selectedIds: sel, options: opt, getTimeMs: readTime,
            } = stateRef.current;

            // Rebuild propagators only when the fleet actually changes.
            if (fl !== propagatorFleet) {
                propagators = preparePropagators(fl);
                propagatorFleet = fl;
            }

            const epochMs = sc.window.startMs;
            const tSeconds = (readTime() - epochMs) / 1000;
            const updateLabels = opt.showLabels
                && now - lastLabelMs >= 1000 / LABEL_UPDATE_HZ;
            if (updateLabels) lastLabelMs = now;

            // Satellites. `PointPrimitive.position` copies what it is given, so
            // the scratch vector can be handed straight over — cloning first
            // allocated one Cartesian3 per satellite per tick for nothing.
            let index = 0;
            let labelIndex = 0;
            for (let i = 0; i < fl.length; i++) {
                const isPayload = sel.has(fl[i].id);
                if (!isPayload && !opt.showHostFleet) continue;
                const point = handles.points.get(index++);
                if (!point) break;
                point.position = ecefPosition(propagators[i], epochMs, tSeconds, scratch);
                if (updateLabels && isPayload && labelIndex < handles.labels.length) {
                    const label = handles.labels.get(labelIndex++);
                    if (label) label.position = scratch;
                }
            }

            // Rings move slowly; refresh them on their own, much slower clock.
            if (now - lastOrbitMs >= 1000 / ORBIT_UPDATE_HZ) {
                lastOrbitMs = now;
                updateOrbits(
                    handles, fl, propagators, sel, epochMs, tSeconds, opt.showOrbits
                );
            }

            updateSensorGeometry(
                handles, sc, fl, propagators, sel, epochMs, tSeconds,
                opt.showSwaths, opt.showProjectionCones,
            );

            viewer.scene.requestRender();
        };

        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [viewer]);
}

/**
 * P polylines, not P·S.
 *
 * One ring per orbital plane, sampled over one period. Every satellite in a
 * plane traces the same ring, so drawing it once per plane is visually identical
 * and eight times cheaper at S = 8.
 */
/**
 * ── STRUCTURE VS GEOMETRY ───────────────────────────────────────────────────
 * These two caches are what let the scene update without reallocating. A ring's
 * STRUCTURE — how many polylines, what colour, how wide — changes only when the
 * fleet, the selection or a display toggle changes. Its GEOMETRY changes with
 * the clock. Tearing the whole collection down every tick conflated the two and
 * paid the structural cost at the geometric rate.
 *
 * `positions` arrays are retained and their `Cartesian3` elements mutated in
 * place; only the array reference is handed back to Cesium to mark it dirty.
 */
const orbitPositionCache = new WeakMap<SceneHandles, Cartesian3[][]>();
const swathPositionCache = new WeakMap<SceneHandles, Cartesian3[][]>();
/** Structural signature of the last build, per collection. */
const orbitSignature = new WeakMap<SceneHandles, string>();
const swathSignature = new WeakMap<SceneHandles, string>();

function updateOrbits(
    handles: SceneHandles,
    fleet: OrbitalElements[],
    propagators: PropagatorState[],
    selectedIds: Set<string>,
    epochMs: number,
    tSeconds: number,
    show: boolean
): void {
    if (!show || fleet.length === 0) {
        if (handles.orbits.length > 0) {
            handles.orbits.removeAll();
            orbitSignature.delete(handles);
            orbitPositionCache.delete(handles);
        }
        return;
    }

    const selectedPlanes = new Set<number>();
    for (const satellite of fleet) {
        if (selectedIds.has(satellite.id)) selectedPlanes.add(satellite.planeIndex);
    }

    // One representative satellite per plane — P rings, not P·S.
    const planeLeads: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < fleet.length; i++) {
        if (seen.has(fleet[i].planeIndex)) continue;
        seen.add(fleet[i].planeIndex);
        planeLeads.push(i);
    }

    const signature = `${planeLeads.length}|${[...selectedPlanes].sort((a, b) => a - b).join(',')}`;
    if (orbitSignature.get(handles) !== signature) {
        // Structure changed: rebuild once, then never again until it changes.
        handles.orbits.removeAll();
        const hostColor = Color.fromCssColorString(REVISIT_COLORS.hostFleet).withAlpha(0.16);
        const payloadColor = Color.fromCssColorString(REVISIT_COLORS.payloadOrbit).withAlpha(0.34);
        const cache: Cartesian3[][] = [];

        for (const lead of planeLeads) {
            const positions: Cartesian3[] = new Array(ORBIT_SAMPLES + 1);
            for (let k = 0; k <= ORBIT_SAMPLES; k++) positions[k] = new Cartesian3();
            cache.push(positions);
            const isPayloadPlane = selectedPlanes.has(fleet[lead].planeIndex);
            handles.orbits.add({
                positions,
                width: isPayloadPlane ? 1.55 : 1,
                material: Material.fromType('Color', {
                    color: isPayloadPlane ? payloadColor : hostColor,
                }),
            });
        }
        orbitPositionCache.set(handles, cache);
        orbitSignature.set(handles, signature);
    }

    // Geometry: mutate the retained vectors, then re-assign to mark dirty.
    const cache = orbitPositionCache.get(handles);
    if (!cache) return;
    for (let p = 0; p < planeLeads.length; p++) {
        const lead = planeLeads[p];
        const positions = cache[p];
        const period = orbitalPeriodSec(fleet[lead].semiMajorAxisKm);
        for (let k = 0; k <= ORBIT_SAMPLES; k++) {
            const t = tSeconds + (k / ORBIT_SAMPLES) * period;
            ecefPosition(propagators[lead], epochMs, t, positions[k]);
        }
        const polyline = handles.orbits.get(p);
        if (polyline) polyline.positions = positions;
    }
}

/**
 * Swaths for the highlighted sub-constellation only.
 *
 * Never for the full reference fleet: 96 footprint polygons per frame is the
 * one thing guaranteed to drop the frame rate, and the host fleet's swaths are
 * not part of the story.
 */
function clearSwaths(handles: SceneHandles): void {
    if (handles.swaths.length === 0) return;
    handles.swaths.removeAll();
    swathSignature.delete(handles);
    swathPositionCache.delete(handles);
}

function clearProjectionVolumes(handles: SceneHandles): void {
    if (handles.projectionVolumes.length > 0) handles.projectionVolumes.removeAll();
}

/** Replace the whole translucent shell as one draw primitive. */
function replaceProjectionVolume(handles: SceneHandles, positions: number[]): void {
    handles.projectionVolumes.removeAll();
    if (positions.length === 0) return;

    const values = new Float64Array(positions);
    const attributes = new GeometryAttributes();
    attributes.position = new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values,
    });
    const geometry = new Geometry({
        attributes,
        primitiveType: PrimitiveType.TRIANGLES,
        boundingSphere: BoundingSphere.fromVertices(values),
    });
    const color = Color.fromCssColorString(REVISIT_COLORS.payload).withAlpha(0.13);
    handles.projectionVolumes.add(new Primitive({
        geometryInstances: new GeometryInstance({
            geometry,
            attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
        }),
        appearance: new PerInstanceColorAppearance({
            translucent: true,
            flat: true,
            closed: false,
        }),
        asynchronous: false,
        allowPicking: false,
    }));
}

/**
 * Does the elevation mask actually cut into the field of view?
 *
 * A mask below the cone's own edge elevation removes nothing — at 1200 km that
 * is 80° for NARROW, 71° for STANDARD, 54° for WIDE — and drawing the "what the
 * mask removed" outline in that case would trace a second ring exactly on top
 * of the first: z-fighting, and no information. So the outline exists only when
 * the two genuinely differ.
 *
 * One boolean for the whole scene rather than one per satellite: the shell is
 * circular, so every payload sits at the same radius and clamps identically.
 */
export function maskClampsFov(scenario: RevisitScenario): boolean {
    const mask = scenario.payload.minElevationDeg;
    if (mask === undefined) return false;
    const satRadiusKm = orbitalRadiusKm(scenario.reference.altitudeKm);
    const bias = Math.hypot(
        scenario.payload.biasDeg.alongTrack, scenario.payload.biasDeg.crossTrack
    );
    const reach = Math.max(scenario.payload.halfAngle1Deg, scenario.payload.halfAngle2Deg) + bias;
    return maskLimbRad(satRadiusKm, toRad(mask)) < toRad(Math.min(reach, 89));
}

/**
 * Payload sensor geometry is updated in one pass. The footprint is the costly
 * part, so the optional projection volume deliberately reuses the exact same
 * result as the swath outline instead of tracing the field of view twice.
 */
function updateSensorGeometry(
    handles: SceneHandles,
    scenario: RevisitScenario,
    fleet: OrbitalElements[],
    propagators: PropagatorState[],
    selectedIds: Set<string>,
    epochMs: number,
    tSeconds: number,
    showSwaths: boolean,
    showProjectionCones: boolean,
): void {
    if (!showSwaths) clearSwaths(handles);
    if (!showProjectionCones) clearProjectionVolumes(handles);
    if (!showSwaths && !showProjectionCones) {
        return;
    }

    const payloadIndices: number[] = [];
    for (let i = 0; i < fleet.length; i++) {
        if (selectedIds.has(fleet[i].id)) payloadIndices.push(i);
    }
    const volumeFacetCount = projectionVolumeFacetCount(payloadIndices.length);

    /*
     * ── The mask outline ─────────────────────────────────────────────────────
     *
     * When an elevation mask cuts into the optics, the solid swath is the
     * masked footprint — what is actually counted — and a DASHED outline traces
     * where the bare optical cone would have reached. Without it the swath
     * simply shrinks and nothing on the globe says why: the mask becomes an
     * invisible assumption on the surface people photograph.
     *
     * Dashed, and in the payload colour rather than grey. Grey already
     * identifies the host fleet and the payload orbit planes, so a grey ring
     * around a payload swath would read as another satellite's geometry. A
     * dashed line reads as a LIMIT; a second solid shape would read as a second
     * coverage — and on a globe where everything drawn is something that counts,
     * the favourable misreading is the one to design against.
     *
     * It costs a second footprint per payload, paid only in this state: a mask
     * that clamps is deliberate, and the reader who set it is studying exactly
     * this. It rides on the existing SENSOR SWATH toggle rather than adding a
     * seventh switch.
     */
    const showMaskOutline = showSwaths && maskClampsFov(scenario);
    const outlineCount = showMaskOutline ? payloadIndices.length : 0;

    // Boundary vertex count is fixed by SWATH_SAMPLES, so the structure depends
    // only on how many payloads there are, on the instrument's shape, and on
    // whether the mask outline is drawn beside each swath.
    const signature = `${payloadIndices.length}|${scenario.payload.shape}|${showMaskOutline}`;
    if (showSwaths && swathSignature.get(handles) !== signature) {
        handles.swaths.removeAll();
        const color = Color.fromCssColorString(REVISIT_COLORS.payload).withAlpha(0.72);
        const outlineColor = Color.fromCssColorString(REVISIT_COLORS.payload).withAlpha(0.4);
        const cache: Cartesian3[][] = [];
        // Masked swaths first, then their optical outlines: the update loop
        // indexes the two halves by `n` and `payloadIndices.length + n`.
        for (let n = 0; n < payloadIndices.length + outlineCount; n++) {
            // computeFootprint closes the ring, so it returns samples + 1 points.
            const positions: Cartesian3[] = new Array(SWATH_SAMPLES + 1);
            for (let k = 0; k <= SWATH_SAMPLES; k++) positions[k] = new Cartesian3();
            cache.push(positions);
            const isOutline = n >= payloadIndices.length;
            handles.swaths.add({
                positions,
                width: isOutline ? 1.2 : 1.6,
                material: isOutline
                    ? Material.fromType('PolylineDash', {
                        color: outlineColor, dashLength: 10,
                    })
                    : Material.fromType('Color', { color }),
            });
        }
        swathPositionCache.set(handles, cache);
        swathSignature.set(handles, signature);
    }

    const swathCache = showSwaths ? swathPositionCache.get(handles) : undefined;
    // The shell must share the exact same propagated instant as the satellite,
    // outline and footprint. A slower mesh clock becomes visibly detached when
    // the presenter accelerates simulation time.
    const volumePositions: number[] | null = showProjectionCones ? [] : null;
    const groundA = new Cartesian3();
    const groundB = new Cartesian3();

    const fov = prepareFov(scenario.payload);
    // The same instrument without its mask — the outline's geometry, prepared
    // once rather than per satellite.
    const opticalFov = showMaskOutline
        ? prepareFov({ ...scenario.payload, minElevationDeg: undefined })
        : null;
    for (let n = 0; n < payloadIndices.length; n++) {
        const i = payloadIndices[n];
        const swath = showSwaths ? handles.swaths.get(n) : undefined;
        const outline = showMaskOutline
            ? handles.swaths.get(payloadIndices.length + n)
            : undefined;

        const eci = propagateState(propagators[i], tSeconds);
        const footprint = computeFootprint(eci, fov, epochMs, tSeconds, SWATH_SAMPLES);
        // A satellite whose footprint cannot be computed (inside the Earth, or a
        // degenerate frame) is hidden rather than left showing its last position.
        if (!footprint || footprint.boundary.length < 3) {
            if (swath) swath.show = false;
            if (outline) outline.show = false;
            continue;
        }

        if (swath && swathCache) {
            swath.show = true;
            const positions = swathCache[n];
            for (let k = 0; k < positions.length; k++) {
                const point = footprint.boundary[Math.min(k, footprint.boundary.length - 1)];
                Cartesian3.fromDegrees(point.lng, point.lat, 0, undefined, positions[k]);
            }
            swath.positions = positions;
        }

        if (outline && opticalFov && swathCache) {
            const opticalFootprint = computeFootprint(
                eci, opticalFov, epochMs, tSeconds, SWATH_SAMPLES
            );
            if (!opticalFootprint || opticalFootprint.boundary.length < 3) {
                outline.show = false;
            } else {
                outline.show = true;
                const positions = swathCache[payloadIndices.length + n];
                for (let k = 0; k < positions.length; k++) {
                    const point = opticalFootprint.boundary[
                        Math.min(k, opticalFootprint.boundary.length - 1)
                    ];
                    Cartesian3.fromDegrees(point.lng, point.lat, 0, undefined, positions[k]);
                }
                outline.positions = positions;
            }
        }

        if (volumePositions) {
            const apex = eciToEcef(eci, earthRotationRad(epochMs, tSeconds));
            const apexX = apex.x * 1000;
            const apexY = apex.y * 1000;
            const apexZ = apex.z * 1000;
            const boundaryLength = Math.max(1, footprint.boundary.length - 1);
            for (let facet = 0; facet < volumeFacetCount; facet++) {
                const boundaryIndex = Math.floor(facet * boundaryLength / volumeFacetCount);
                const point = footprint.boundary[boundaryIndex];
                const nextBoundaryIndex = Math.floor(
                    ((facet + 1) % volumeFacetCount) * boundaryLength / volumeFacetCount,
                );
                const nextPoint = footprint.boundary[nextBoundaryIndex];
                Cartesian3.fromDegrees(point.lng, point.lat, 0, undefined, groundA);
                Cartesian3.fromDegrees(nextPoint.lng, nextPoint.lat, 0, undefined, groundB);
                volumePositions.push(
                    apexX, apexY, apexZ,
                    groundA.x, groundA.y, groundA.z,
                    groundB.x, groundB.y, groundB.z,
                );
            }
        }
    }
    if (volumePositions) replaceProjectionVolume(handles, volumePositions);
}

/** Camera framing: the full globe, per UX §4.3 — ENG's framing, not COMM's limb view. */
export function frameGlobe(viewer: Viewer, verticalScreenBias = 0): void {
    const standoff = EARTH_RADIUS_KM * 1000 * 3.2;
    viewer.camera.setView({
        // Camera standoff only — a distance to place the eye, not a model of
        // the Earth. The 6371 km sphere is fine here and nowhere else in this
        // module (R28): nothing downstream reads it.
        destination: Cartesian3.fromDegrees(10, 25, standoff),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    });

    if (verticalScreenBias === 0) return;

    // Translate in the camera plane so the globe moves up without changing its
    // scale or its nadir-facing orientation. `verticalScreenBias` is expressed
    // as a fraction of the canvas height; converting it at the target plane
    // keeps the composition stable across phone aspect ratios.
    const fovy = ('fovy' in viewer.camera.frustum
        ? viewer.camera.frustum.fovy
        : undefined) ?? CesiumMath.toRadians(60);
    const visibleHeightAtTarget = 2 * standoff * Math.tan(fovy / 2);
    const translation = visibleHeightAtTarget * Math.abs(verticalScreenBias);
    if (verticalScreenBias > 0) viewer.camera.moveDown(translation);
    else viewer.camera.moveUp(translation);
}
