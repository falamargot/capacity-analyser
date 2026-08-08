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
 *   - swath polygons only for the highlighted sub-constellation.
 *
 * All three share one update pass, so they live in one controller. React owns
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
    Cartesian3, Color, Math as CesiumMath, NearFarScalar, PointPrimitiveCollection,
    PolylineCollection, Material, type Viewer,
} from 'cesium';
import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import type { OrbitalElements, RevisitScenario } from '../domain/types';
import {
    eciToEcef, earthRotationRad, preparePropagators, propagateState,
    orbitalPeriodSec, type PropagatorState,
} from '../propagation/keplerJ2';
import { prepareFov } from '../fov/containment';
import { computeFootprint } from '../fov/footprint';
import { REVISIT_COLORS } from '../ui/revisitTheme';

/** Satellite positions refresh at this rate; the camera still renders on demand. */
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
/** Vertices per orbit ring. 128 is smooth at any zoom and costs nothing. */
const ORBIT_SAMPLES = 128;
/** Boundary vertices per swath. */
const SWATH_SAMPLES = 32;

export interface RevisitSceneOptions {
    showOrbits: boolean;
    showSwaths: boolean;
    showHostFleet: boolean;
}

interface SceneHandles {
    points: PointPrimitiveCollection;
    orbits: PolylineCollection;
    swaths: PolylineCollection;
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
        const orbits = viewer.scene.primitives.add(new PolylineCollection());
        const swaths = viewer.scene.primitives.add(new PolylineCollection());
        handlesRef.current = { points, orbits, swaths };

        return () => {
            handlesRef.current = null;
            if (viewer.isDestroyed?.()) return;
            // `remove` destroys the primitive, which releases its GPU buffers.
            // Leaking these is how the 109 MB retention bug happened before.
            viewer.scene.primitives.remove(points);
            viewer.scene.primitives.remove(orbits);
            viewer.scene.primitives.remove(swaths);
        };
    }, [viewer]);

    // ── Rebuild the point set when the fleet or the selection changes ───────
    useEffect(() => {
        const handles = handlesRef.current;
        if (!viewer || viewer.isDestroyed?.() || !handles) return;

        const hostColor = Color.fromCssColorString(REVISIT_COLORS.hostFleet).withAlpha(0.72);
        const payloadColor = Color.fromCssColorString(REVISIT_COLORS.bright);
        const spaceOutline = Color.fromCssColorString('#05070D').withAlpha(0.9);

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
        viewer.scene.requestRender();
    }, [viewer, fleet, selectedIds, options.showHostFleet]);

    // ── The update pass ────────────────────────────────────────────────────
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;

        let frame = 0;
        let lastUpdateMs = 0;
        let lastOrbitMs = 0;
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

            // Satellites. `PointPrimitive.position` copies what it is given, so
            // the scratch vector can be handed straight over — cloning first
            // allocated one Cartesian3 per satellite per tick for nothing.
            let index = 0;
            for (let i = 0; i < fl.length; i++) {
                const isPayload = sel.has(fl[i].id);
                if (!isPayload && !opt.showHostFleet) continue;
                const point = handles.points.get(index++);
                if (!point) break;
                point.position = ecefPosition(propagators[i], epochMs, tSeconds, scratch);
            }

            // Rings move slowly; refresh them on their own, much slower clock.
            if (now - lastOrbitMs >= 1000 / ORBIT_UPDATE_HZ) {
                lastOrbitMs = now;
                updateOrbits(
                    handles, fl, propagators, sel, epochMs, tSeconds, opt.showOrbits
                );
            }

            updateSwaths(handles, sc, fl, propagators, sel, epochMs, tSeconds, opt.showSwaths);

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
        const payloadColor = Color.fromCssColorString(REVISIT_COLORS.accent).withAlpha(0.42);
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
function updateSwaths(
    handles: SceneHandles,
    scenario: RevisitScenario,
    fleet: OrbitalElements[],
    propagators: PropagatorState[],
    selectedIds: Set<string>,
    epochMs: number,
    tSeconds: number,
    show: boolean
): void {
    if (!show) {
        if (handles.swaths.length > 0) {
            handles.swaths.removeAll();
            swathSignature.delete(handles);
            swathPositionCache.delete(handles);
        }
        return;
    }

    const payloadIndices: number[] = [];
    for (let i = 0; i < fleet.length; i++) {
        if (selectedIds.has(fleet[i].id)) payloadIndices.push(i);
    }

    // Boundary vertex count is fixed by SWATH_SAMPLES, so the structure depends
    // only on how many payloads there are and on the instrument's shape.
    const signature = `${payloadIndices.length}|${scenario.payload.shape}`;
    if (swathSignature.get(handles) !== signature) {
        handles.swaths.removeAll();
        const color = Color.fromCssColorString(REVISIT_COLORS.accent).withAlpha(0.75);
        const cache: Cartesian3[][] = [];
        for (let n = 0; n < payloadIndices.length; n++) {
            // computeFootprint closes the ring, so it returns samples + 1 points.
            const positions: Cartesian3[] = new Array(SWATH_SAMPLES + 1);
            for (let k = 0; k <= SWATH_SAMPLES; k++) positions[k] = new Cartesian3();
            cache.push(positions);
            handles.swaths.add({
                positions,
                width: 1.6,
                material: Material.fromType('Color', { color }),
            });
        }
        swathPositionCache.set(handles, cache);
        swathSignature.set(handles, signature);
    }

    const cache = swathPositionCache.get(handles);
    if (!cache) return;

    const fov = prepareFov(scenario.payload);
    for (let n = 0; n < payloadIndices.length; n++) {
        const i = payloadIndices[n];
        const polyline = handles.swaths.get(n);
        if (!polyline) break;

        const eci = propagateState(propagators[i], tSeconds);
        const footprint = computeFootprint(eci, fov, epochMs, tSeconds, SWATH_SAMPLES);
        // A satellite whose footprint cannot be computed (inside the Earth, or a
        // degenerate frame) is hidden rather than left showing its last position.
        if (!footprint || footprint.boundary.length < 3) {
            polyline.show = false;
            continue;
        }
        polyline.show = true;

        const positions = cache[n];
        for (let k = 0; k < positions.length; k++) {
            const point = footprint.boundary[Math.min(k, footprint.boundary.length - 1)];
            Cartesian3.fromDegrees(point.lng, point.lat, 0, undefined, positions[k]);
        }
        polyline.positions = positions;
    }
}

/** Camera framing: the full globe, per UX §4.3 — ENG's framing, not COMM's limb view. */
export function frameGlobe(viewer: Viewer): void {
    viewer.camera.setView({
        destination: Cartesian3.fromDegrees(10, 25, EARTH_RADIUS_KM * 1000 * 3.2),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    });
}
