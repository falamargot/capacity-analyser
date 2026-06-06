/**
 * commercialAnimationDriver
 *
 * Drives all Commercial Route animations without triggering React re-renders.
 * Animation state lives in a MutableRefObject<CommercialAnimationState> that
 * Cesium CallbackProperty instances can read from on every frame.
 *
 * Animations managed here:
 *   A — Route reveal: segments fade in progressively when a new route loads.
 *   B — Focus transition: smooth opacity lerp between focused (1.0) and
 *       unfocused (UNFOCUSED_OPACITY) when the Journey Strip tab changes.
 *   C — Node pulse: very subtle sine-wave amplitude on the focused segment.
 *
 * Parts D/E (GEO/LEO hero moments) are naturally provided by B — the smooth
 * opacity rise of the satellite segment IS the "hero asset" moment.
 *
 * COMM-6E
 */

import { useRef, useEffect } from 'react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';

// ─── Segment index mapping ────────────────────────────────────────────────────

/** Maps CommercialRouteSegmentId → Float32Array index [0..3] or −1 for summary. */
export const ANIM_SEGMENT_INDEX: Record<CommercialRouteSegmentId, number> = {
  access:      0,
  satellite:   1,
  backhaul:    2,
  destination: 3,
  summary:    -1,
};

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Milliseconds after route load at which each segment's reveal begins. */
const REVEAL_DELAY_MS = [0, 320, 600, 880] as const;
/** Duration for each segment's alpha 0 → 1 ease-out. */
const REVEAL_DURATION_MS = 480;

/**
 * Total reveal wall-clock time (last segment delay + its duration).
 * Exported so callers (e.g. outcome highlight) can choose a matching CSS delay.
 */
export const ROUTE_REVEAL_TOTAL_MS = REVEAL_DELAY_MS[3] + REVEAL_DURATION_MS; // 1360 ms

/**
 * Per-frame lerp coefficient for focus transitions.
 * At 60 fps, reaches ~95 % of target in ~240 ms:
 *   1 − (1 − 0.11)^14 ≈ 0.81.
 */
const FOCUS_LERP_K = 0.11;

/** Opacity for non-focused segments — kept for backward compatibility. */
export const UNFOCUSED_OPACITY = 0.15;

/**
 * Storytelling opacity targets for each animated segment index
 * [access(0), satellite(1), backhaul(2), destination(3)]
 * when a given segment is focused.
 *
 * Hero segment → 1.0 · peer endpoints → 0.25 · background → 0.05–0.15
 */
export const FOCUS_OPACITY_PROFILES: Record<CommercialRouteSegmentId, readonly [number, number, number, number]> = {
  //                          acc    sat    bck    dst
  access:      [1.00, 0.15, 0.05, 0.25],
  satellite:   [0.25, 1.00, 0.05, 0.25],
  backhaul:    [0.25, 0.10, 1.00, 0.25],
  destination: [0.25, 0.15, 0.05, 1.00],
  summary:     [1.00, 1.00, 1.00, 1.00],
};

/**
 * Pulse frequency in radians per frame (very slow).
 * At 60 fps: 0.022 rad/frame ≈ 0.21 Hz — a barely perceptible breathing.
 */
const PULSE_FREQ = 0.022;

// ─── State type ───────────────────────────────────────────────────────────────

export interface CommercialAnimationState {
  /** Per-segment animated focus opacity [0..1]. Index = ANIM_SEGMENT_INDEX value. */
  readonly opacity: Float32Array;   // length 4
  /** Per-segment reveal progress [0..1]: 0 invisible → 1 fully revealed. */
  readonly reveal:  Float32Array;   // length 4
  /** Sine phase for the subtle node pulse [0..2π]. */
  pulsePhase:  number;
  /** Segment index of the currently focused segment (−1 = summary / overview). */
  focusedIdx:  number;
  /** Current route status — controls pulse amplitude and colour hint. */
  routeStatus: 'active' | 'limited' | 'blocked' | 'pending';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Maps route status to pulse amplitude.  Very small by design. */
function pulseAmplitude(status: CommercialAnimationState['routeStatus']): number {
  switch (status) {
    case 'active':  return 0.06;
    case 'limited': return 0.09;
    case 'blocked': return 0.11;
    default:        return 0.03;
  }
}

/**
 * Compute the final animated alpha for a segment, combining:
 *   reveal progress × focus opacity × subtle pulse (focused nodes only).
 *
 * Designed to be called inside a Cesium CallbackProperty — reads from the
 * animation state ref every frame with zero allocations on the hot path.
 *
 * @param state     Current animation state (from the ref).
 * @param segIdx    Segment index (ANIM_SEGMENT_INDEX[id]).  −1 = always 1.0.
 * @param isPulsed  Whether this node is the one that should pulse.
 */
export function getSegmentAlpha(
  state: CommercialAnimationState,
  segIdx: number,
  isPulsed = false,
): number {
  if (segIdx < 0) return 1.0;                   // summary / unowned → always full
  const reveal = state.reveal[segIdx]  ?? 1.0;
  const focus  = state.opacity[segIdx] ?? 1.0;
  const pulse  = isPulsed
    ? 1 + pulseAmplitude(state.routeStatus) * Math.sin(state.pulsePhase)
    : 1.0;
  return Math.min(1, reveal * focus * pulse);
}

/**
 * Alpha for the pulse halo rendered behind a focused endpoint (Site A / Site B).
 * Returns 0 when the segment is not focused.
 * Breathes between 0.12 and 0.38 at a slower cadence than the main node pulse
 * to avoid competing with it visually.
 */
export function getHaloAlpha(
  state: CommercialAnimationState,
  segIdx: number,
): number {
  if (segIdx < 0 || state.focusedIdx !== segIdx) return 0;
  const reveal = state.reveal[segIdx] ?? 1.0;
  const phase  = state.pulsePhase * 0.55 + Math.PI * 0.5;
  return reveal * (0.25 + 0.13 * Math.sin(phase));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Drives the commercial route animation system.
 *
 * Returns a stable `MutableRefObject<CommercialAnimationState>` whose `.current`
 * is updated by a `requestAnimationFrame` loop.  Cesium `CallbackProperty`
 * instances read from this ref each frame — no React re-renders triggered.
 *
 * The hook detects:
 *  - Route identity changes → triggers segment reveal sequence.
 *  - focusedSegmentId changes → updates opacity target, starts lerp.
 *
 * Respects `prefers-reduced-motion`: reveal and lerp are skipped (instant).
 */
export function useCommercialAnimationDriver(
  routeModel: CommercialRouteModel | null | undefined,
): React.MutableRefObject<CommercialAnimationState> {
  const stateRef = useRef<CommercialAnimationState>({
    opacity:     new Float32Array([1, 1, 1, 1]),
    reveal:      new Float32Array([1, 1, 1, 1]),
    pulsePhase:  0,
    focusedIdx:  -1,
    routeStatus: 'pending',
  });

  const targetOpacity  = useRef(new Float32Array([1, 1, 1, 1]));
  const revealStart    = useRef<number | null>(null);
  const rafId          = useRef<number | null>(null);

  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Detect new route (node IDs change) → restart reveal.
  const prevRouteId = useRef<string | null>(null);
  useEffect(() => {
    if (!routeModel) return;
    const id = routeModel.nodes.map(n => n.id).join('|');
    if (id === prevRouteId.current) return;
    prevRouteId.current = id;

    if (reducedMotion.current) {
      stateRef.current.reveal.fill(1);
      return;
    }
    stateRef.current.reveal.fill(0);
    revealStart.current = performance.now();
  }, [routeModel]);

  // Recalculate target opacities when the focused segment changes.
  useEffect(() => {
    const focused    = routeModel?.focusedSegmentId ?? null;
    const focusedIdx = focused !== null ? (ANIM_SEGMENT_INDEX[focused] ?? -1) : -1;
    stateRef.current.focusedIdx  = focusedIdx;
    stateRef.current.routeStatus =
      (routeModel?.routeStatus ?? 'pending') as CommercialAnimationState['routeStatus'];

    const profile = focused && focused in FOCUS_OPACITY_PROFILES
      ? FOCUS_OPACITY_PROFILES[focused]
      : FOCUS_OPACITY_PROFILES.summary;
    for (let i = 0; i < 4; i++) {
      targetOpacity.current[i] = profile[i];
    }

    if (reducedMotion.current) {
      for (let i = 0; i < 4; i++) {
        stateRef.current.opacity[i] = targetOpacity.current[i];
      }
    }
  }, [routeModel?.focusedSegmentId, routeModel?.routeStatus]);

  // Main RAF loop — stable for the component's lifetime, reads everything from refs.
  useEffect(() => {
    const tick = (now: DOMHighResTimeStamp) => {
      const s = stateRef.current;
      const t = targetOpacity.current;

      // A — Route reveal
      const rs = revealStart.current;
      if (rs !== null) {
        const elapsed = now - rs;
        for (let i = 0; i < 4; i++) {
          const progress = Math.min(1, Math.max(0,
            (elapsed - REVEAL_DELAY_MS[i]) / REVEAL_DURATION_MS,
          ));
          s.reveal[i] = easeOutCubic(progress);
        }
        if (elapsed > REVEAL_DELAY_MS[3] + REVEAL_DURATION_MS + 60) {
          s.reveal.fill(1);
          revealStart.current = null;
        }
      }

      // B — Focus opacity smooth lerp
      for (let i = 0; i < 4; i++) {
        s.opacity[i] += (t[i] - s.opacity[i]) * FOCUS_LERP_K;
      }

      // C — Pulse phase advance
      s.pulsePhase = (s.pulsePhase + PULSE_FREQ) % (2 * Math.PI);

      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, []); // stable — only reads refs

  return stateRef;
}
