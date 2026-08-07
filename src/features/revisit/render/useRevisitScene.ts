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
    Cartesian3, Color, Math as CesiumMath, PointPrimitiveCollection,
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

        const hostColor = Color.fromCssColorString(REVISIT_COLORS.hostFleet).withAlpha(0.55);
        const payloadColor = Color.fromCssColorString(REVISIT_COLORS.bright);

        handles.points.removeAll();
        for (const el of fleet) {
            const isPayload = selectedIds.has(el.id);
            if (!isPayload && !options.showHostFleet) continue;
            handles.points.add({
                position: Cartesian3.ZERO,
                color: isPayload ? payloadColor : hostColor,
                pixelSize: isPayload ? 9 : 4,
                outlineColor: isPayload ? Color.BLACK.withAlpha(0.6) : Color.TRANSPARENT,
                outlineWidth: isPayload ? 1 : 0,
                id: el.id,
            });
        }
        viewer.scene.requestRender();
    }, [viewer, fleet, selectedIds, options.showHostFleet]);

    // ── The update pass ────────────────────────────────────────────────────
    useEffect(() => {
        if (!viewer || viewer.isDestroyed?.()) return;

        let frame = 0;
        let lastUpdateMs = 0;
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

            // Satellites — positions written in place, no allocation per point.
            let index = 0;
            for (let i = 0; i < fl.length; i++) {
                const isPayload = sel.has(fl[i].id);
                if (!isPayload && !opt.showHostFleet) continue;
                const point = handles.points.get(index++);
                if (!point) break;
                point.position = ecefPosition(propagators[i], epochMs, tSeconds, scratch).clone();
            }

            rebuildOrbits(handles, fl, propagators, epochMs, tSeconds, opt.showOrbits);
            rebuildSwaths(handles, sc, fl, propagators, sel, epochMs, tSeconds, opt.showSwaths);

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
function rebuildOrbits(
    handles: SceneHandles,
    fleet: OrbitalElements[],
    propagators: PropagatorState[],
    epochMs: number,
    tSeconds: number,
    show: boolean
): void {
    handles.orbits.removeAll();
    if (!show || fleet.length === 0) return;

    const color = Color.fromCssColorString(REVISIT_COLORS.accent).withAlpha(0.22);
    const seen = new Set<number>();
    const scratch = new Cartesian3();

    for (let i = 0; i < fleet.length; i++) {
        const plane = fleet[i].planeIndex;
        if (seen.has(plane)) continue;
        seen.add(plane);

        const period = orbitalPeriodSec(fleet[i].semiMajorAxisKm);
        const positions: Cartesian3[] = new Array(ORBIT_SAMPLES + 1);
        for (let k = 0; k <= ORBIT_SAMPLES; k++) {
            const t = tSeconds + (k / ORBIT_SAMPLES) * period;
            positions[k] = ecefPosition(propagators[i], epochMs, t, scratch).clone();
        }
        handles.orbits.add({
            positions,
            width: 1.2,
            material: Material.fromType('Color', { color }),
        });
    }
}

/**
 * Swaths for the highlighted sub-constellation only.
 *
 * Never for the full reference fleet: 96 footprint polygons per frame is the
 * one thing guaranteed to drop the frame rate, and the host fleet's swaths are
 * not part of the story.
 */
function rebuildSwaths(
    handles: SceneHandles,
    scenario: RevisitScenario,
    fleet: OrbitalElements[],
    propagators: PropagatorState[],
    selectedIds: Set<string>,
    epochMs: number,
    tSeconds: number,
    show: boolean
): void {
    handles.swaths.removeAll();
    if (!show) return;

    const fov = prepareFov(scenario.payload);
    const color = Color.fromCssColorString(REVISIT_COLORS.accent).withAlpha(0.75);

    for (let i = 0; i < fleet.length; i++) {
        if (!selectedIds.has(fleet[i].id)) continue;
        const eci = propagateState(propagators[i], tSeconds);
        const footprint = computeFootprint(eci, fov, epochMs, tSeconds, SWATH_SAMPLES);
        if (!footprint) continue;

        const positions = footprint.boundary.map((p) =>
            Cartesian3.fromDegrees(p.lng, p.lat, 0)
        );
        if (positions.length < 3) continue;

        handles.swaths.add({
            positions,
            width: 1.6,
            material: Material.fromType('Color', { color }),
        });
    }
}

/** Camera framing: the full globe, per UX §4.3 — ENG's framing, not COMM's limb view. */
export function frameGlobe(viewer: Viewer): void {
    viewer.camera.setView({
        destination: Cartesian3.fromDegrees(10, 25, EARTH_RADIUS_KM * 1000 * 3.2),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    });
}
