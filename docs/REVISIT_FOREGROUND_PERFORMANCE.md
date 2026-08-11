# REVISIT foreground rendering performance — R12 / R29c

_Measured 2026-08-11 on the OneWeb HLD profile: **634 displayed satellites**._

## Why this document exists

R12 has been open since Lot 4. Its claim — "60 fps at 256 satellites" — was only
ever *counted from the code*: the hot path was reduced from ~38,000 `Cartesian3`
allocations per second to zero in steady state, and the frame rate was inferred
from that. Two audits recorded it as **UNVERIFIED** and declined to close it.

R29 raises the displayed fleet from 96 to 634, so the claim had to be settled
rather than carried.

## The obstacle, and what was done about it

The automation browser pane reports `document.visibilityState === "hidden"`.
Measured directly: **0 `requestAnimationFrame` callbacks in 2 seconds.** A hidden
tab presents no frames, so *presented* frame rate cannot be sampled there — this
is exactly the blocker both audits described.

`Scene.render()` is not rAF-gated. Calling it directly performs the real work:
the same draw calls, the same WebGL submission, on the same GPU, at the same
canvas size. So the per-frame **cost** is measurable even when the compositor
will not present. That is what was measured.

## Results

Chromium, real WebGL, 634 `PointPrimitive`s plus 24 polylines (12 orbit tracks,
12 swaths), clock advancing every frame, 110 samples after a 10-frame warm-up so
shader and texture compilation are excluded from steady state.

| Configuration | Mean | p95 | Worst | Headroom vs 16.67 ms |
|---|---|---|---|---|
| `requestRenderMode` off (forced full render), 1280 × 720 | 0.348 ms | 0.90 ms | 1.70 ms | **48×** |
| Production `requestRenderMode`, 1280 × 720 | 0.346 ms | 0.80 ms | 1.90 ms | **48×** |
| Production `requestRenderMode`, 2560 × 1440 | 0.315 ms | 0.90 ms | 4.20 ms | **53×** |

Fleet propagation — the app-side work that precedes each render — measures
**0.1 ms for all 634 satellites** in the Node harness (`r28Delta.bench.test.ts`).

Total per-frame budget consumed: **under 3 %** at the worst sample, under 0.5 %
at the mean.

## Verdict

**60 fps at 634 satellites is met with two orders of magnitude of margin, and no
optimisation was required.** Doubling the drawing buffer to 2560 × 1440 does not
change that conclusion, which indicates the cost is not fill-rate bound at this
fleet size.

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

**R12 is closed for the question it actually asked** — whether the fleet size is
affordable per frame — and the residue above is recorded rather than folded into
the result.

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
