# REVISIT render-submission microbenchmark — R29c evidence for R12

_Measured 2026-08-11 on the OneWeb HLD profile: **634 displayed satellites**._

## Why this document exists

R12 has been open since Lot 4. Its claim — "60 fps at 256 satellites" — was only
ever *counted from the code*: the hot path was reduced from ~38,000 `Cartesian3`
allocations per second to zero in steady state, and the frame rate was inferred
from that. Two audits recorded it as **UNVERIFIED** and declined to close it.

R29 raises the displayed fleet from 96 to 634, so the CPU-side rendering cost
needed to be characterised. The measurement below is useful evidence, but it
does not settle the frame-rate target.

## The obstacle, and what was done about it

The automation browser pane reports `document.visibilityState === "hidden"`.
Measured directly: **0 `requestAnimationFrame` callbacks in 2 seconds.** A hidden
tab presents no frames, so *presented* frame rate cannot be sampled there — this
is exactly the blocker both audits described.

`Scene.render()` is not rAF-gated. Calling it directly exercises Cesium's
synchronous scene update and WebGL command-submission path at the same canvas
size. It does **not** wait for GPU completion or exercise browser presentation,
compositor scheduling, the application's rAF loop, or all surrounding
main-thread work. The numbers below are therefore render-submission durations,
not complete per-frame costs.

## Results

Chromium, real WebGL, 634 `PointPrimitive`s plus 24 polylines (12 orbit tracks,
12 swaths), clock advancing every frame, 110 samples after a 10-frame warm-up so
shader and texture compilation are excluded from steady state.

| Configuration | Mean | p95 | Worst |
|---|---|---|---|
| `requestRenderMode` off (forced full render), 1280 × 720 | 0.348 ms | 0.90 ms | 1.70 ms |
| Production `requestRenderMode`, 1280 × 720 | 0.346 ms | 0.80 ms | 1.90 ms |
| Production `requestRenderMode`, 2560 × 1440 | 0.315 ms | 0.90 ms | 4.20 ms |

Fleet propagation — the app-side work that precedes each render — measures
**0.1 ms for all 634 satellites** in the Node harness (`r28Delta.bench.test.ts`).

## Verdict

**No CPU-side Cesium submission bottleneck is evident at 634 satellites.** The
result supports keeping the current `PointPrimitiveCollection` design and does
not motivate an optimisation by itself. It does not establish 60 fps or a
numerical margin against the 16.67 ms presentation budget.

The reason is structural rather than lucky: satellites are a single
`PointPrimitiveCollection` — one draw call for all 634 — with positions written
into pre-allocated `Cartesian3` objects. Fleet size moves a buffer upload, not a
draw-call count.

## What this does NOT establish

Stated plainly, because the distinction is the whole reason R12 stayed open:

- This measures per-frame **cost**, not **presented** frame rate. A compositor
  stall, a `will-change` mistake, or a layout thrash outside the canvas could
  still drop frames without changing any number above.
- It is one machine, one GPU, one browser. No claim is made about low-end
  hardware.
- Only the REVISIT scene was measured. ENG's globe draws different content.

**R12 remains open.** To close it, run the production application in a genuinely
visible foreground browser with its normal `requestAnimationFrame` loop, clock
advancing, 634 satellites and the relevant orbit/FOV layers enabled. Record at
least 10–30 seconds of rAF intervals (p50/p95/p99), long frames over 16.67 ms and
33.3 ms, and main-thread/GPU evidence where the browser exposes it. The standard
viewport and 2560 × 1440 should both be covered.

## Reproducing

With the dev server running and REVISIT open, in the browser console:

```js
const v = window.__revisitViewer, s = v.scene, c = v.clock;
const t = [];
for (let i = 0; i < 10; i++) { c.tick(); s.requestRender(); s.render(c.currentTime); }
for (let i = 0; i < 120; i++) {
  c.tick();
  const t0 = performance.now();
  s.requestRender(); s.render(c.currentTime);
  t.push(performance.now() - t0);
}
t.sort((a, b) => a - b);
console.log('mean', t.reduce((a, b) => a + b) / t.length, 'p95', t[Math.floor(t.length * 0.95)]);
```
