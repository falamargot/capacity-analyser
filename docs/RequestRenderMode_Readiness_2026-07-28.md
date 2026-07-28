# `requestRenderMode` Readiness Inventory

**Date:** 2026-07-28
**Companion to:** [Architecture_Performance_Memory_Audit_2026-07-28.md](Architecture_Performance_Memory_Audit_2026-07-28.md) — findings **PERF-1** and **PERF-2**
**Status:** Planning document. **No render-mode change has been made.**

---

## 1. Why this document exists

The audit confirmed that Cesium's `requestRenderMode` is never enabled, so the globe redraws continuously at `targetFrameRate = 30` forever — including on a completely idle tab — and that eight existing `viewer.scene.requestRender()` calls are silent no-ops as a result. That is the most likely cause of the reported machine heat.

It is also the single riskiest change available, because **144 `CallbackProperty` instances across 19 files and 8 `preRender`/`postRender` handlers are written on the assumption that a frame is always coming**. Flipping the flag without rewiring them would freeze animations and leave screen-space labels stuck to stale pixel positions.

This document turns "144 sites" from a scary number into a work plan, and records the gate that must pass before any of it starts.

---

## 2. The gate: measure first

**Do not begin section 4 until a real browser capture exists.** The instrumentation for it shipped with this lot:

```
1. npm run dev
2. Select a representative scenario (e.g. GEO STAR forward with both sites set).
3. Ctrl+Shift+M                    → HUD appears
4. Click "reset", then DO NOT TOUCH the machine for 30 seconds.
5. Click "report"                  → full profile printed to the console
```

The decisive number is **`IDLE frames`** — frames Cesium rendered while the camera was still, no pointer/keyboard input occurred, and no layer reported a scene mutation. Those are precisely the frames `requestRenderMode` would eliminate.

| Idle-frame result | Interpretation | Action |
|---|---|---|
| **> 80 %** | The tab burns ~30 fps of GPU for nothing. PERF-1 confirmed as the heat source. | Proceed with the full plan below |
| **30–80 %** | Meaningful but partial win | Proceed, but the quick mitigations in §3 may be enough |
| **< 30 %** | Something legitimately animates continuously | **Re-examine the premise** — find what, before rewiring anything |

Also record from the same report: `fragment cost` (PERF-2 — the square of `resolutionScale`), `fps`, `frame p95`, `commits/s`, and the engineering-calculation counts.

---

## 3. Low-risk mitigations available before any rewiring

These are reversible one-line changes that reduce load without touching render mode. They are **not** substitutes for §4, and each has a caveat that must be respected.

| Change | Expected effect | Caveat — read before applying |
|---|---|---|
| `targetFrameRate: 30 → 24` | ~20 % fewer frames | Visible on fast camera drags; a UX judgement, not a free win |
| Clamp `resolutionScale` to `min(devicePixelRatio, 1.5)` | Up to 44 % fewer fragments on a DPR-2 panel | **`DPR_FACTOR` is already baked into every `calculateDynamicScale()` call to cancel `resolutionScale` out.** Clamping one without the other changes every icon's on-screen size. Both must move together. |
| Pause rendering on `document.hidden` | Zero cost in a background tab | Must resume correctly and force one frame on return |

The hidden-tab pause is the best effort-to-benefit ratio here and is largely independent of the rest.

---

## 4. The 144 sites, classified

Counted by `grep -rc "CallbackProperty"`. What matters is not the count but the **cadence each site actually needs**, which falls into four groups.

### Group A — Static callbacks (already safe, no work)

`new CallbackProperty(fn, true)` — the second argument is `isConstant`. Cesium evaluates these once and caches, so they behave identically under `requestRenderMode`.

Examples: `TransmissionLinks.tsx:492` `EMPTY_POSITIONS_CALLBACK`, `TransmissionLinks.tsx:536`.

**Action: none.** These need only be confirmed as `isConstant: true` during the per-file pass.

### Group B — Data-cadence followers (~1 Hz) — *the bulk of the win*

Positions driven by a ref that the satellite propagation tick updates once per second. They are re-evaluated 30x/second today but only *change* 1x/second.

| File | Sites | Driver |
|---|---:|---|
| `OneWebCombLayer.tsx` | 14 | comb geometry, 1 Hz |
| `SelectedPointStatusMarker.tsx` | 7 | selection state |
| `SatelliteLayer.tsx` | 4 | `satPositionRef`, 1 Hz |
| `IssLayer.tsx` | 4 | ISS propagation |
| `AircraftLayer.tsx` | 4 | air-traffic poll |
| `VesselLayer.tsx` | 3 | AIS poll |
| `CoverageLayer.tsx` | 3 | coverage selection |
| `TrajectoryLayer.tsx` | 2 | orbit track |
| `SnpLayer.tsx` | 2 | static-ish |
| `GeoGatewayLayer.tsx` | 2 | static-ish |

**Action:** call `requestRender()` from the existing update tick — one call per layer, at the point the ref is written. **This is where nearly all the saving is**, and it is low risk: the data cadence is already explicit in the code.

### Group C — Genuinely animated (need per-frame requests while active)

| File | Sites | Notes |
|---|---:|---|
| `TransmissionLinks.tsx` | 27 | time-parameterised positions (`(time?: JulianDate) => …`) |
| `CommercialSymbolicConnectivityLayer.tsx` | 23 | driven by `commercialAnimationDriver` |
| `CommercialRouteLayer.tsx` | 21 | driven by `commercialAnimationDriver` |
| `CommercialSkyBridgeLayer.tsx` | 13 | driven by `commercialAnimationDriver` |
| `PathFlowAnimation.tsx` | 4 | flow animation along the route |
| `commercialAnimationDriver.ts` | 3 | documents per-frame lerp at 60 fps |

**Action:** these must request a frame **while an animation is in flight, and stop when it settles**. The commercial layers share one driver (57 of the 68 sites), so a single change there covers most of them: the driver already knows when a reveal/focus transition is running and when it has converged.

This is the delicate part — a driver that never stops requesting frames reproduces the current behaviour exactly, while one that stops too early freezes mid-transition. Each needs a settle condition and a visual check.

### Group D — Render-phase handlers (screen-space projection)

Eight handlers that project world positions to screen pixels every frame:

`SatelliteScreenLabels.tsx`, `SelectedPointScreenLabel.tsx`, `SiteScreenLabel.tsx`, `PointAnchorLabel.tsx` (postRender); `AggregatedCoverageVolumeLayer.tsx`, `IssLayer.tsx`, `MoonLayer.tsx`, `CesiumGlobe.tsx:1591` (preRender/postRender).

**Action:** these are *consumers* of frames, not requesters — they run when a frame runs. Under `requestRenderMode` they simply run less often, which is correct: screen position only changes when the camera or the tracked entity moves, and both of those already request a frame in Groups B/C.

**Risk:** a label could lag by one frame after a camera settle. Mitigation: `CesiumGlobe`'s camera `moveEnd` already fires — request one extra frame there.

---

## 5. Suggested sequencing

Each step is independently releasable and independently revertible.

| Step | Work | Verification |
|---|---|---|
| 2b.0 | **Capture the browser baseline** (§2) | Idle-frame % recorded in this doc |
| 2b.1 | Hidden-tab pause + `resolutionScale`/`DPR_FACTOR` clamp together | Icon sizes identical at DPR 1/2/3; heat check |
| 2b.2 | Add `requestRender()` to Group B tick sites — **with `requestRenderMode` still off** (no-ops, so provably zero behaviour change) | Full suite; visual check |
| 2b.3 | Same for Group C animation drivers, still off | Full suite; visual check |
| 2b.4 | Enable `requestRenderMode` **behind a dev flag**, default off | Per-layer visual checklist below |
| 2b.5 | Soak with the flag on; compare profiler reports | Idle frames ≈ 0; fps drops when idle; no visual regression |
| 2b.6 | Flip the default | Before/after profile recorded |

Steps 2b.2 and 2b.3 are the safest possible way to do this: because `requestRender()` is a **no-op while `requestRenderMode` is false**, all the wiring can land and be reviewed *without any behavioural risk at all*, and only step 2b.4 changes what the user sees.

### Per-layer visual checklist for 2b.4

Satellites move · comb geometry follows · coverage polygons redraw on selection · transmission links animate · commercial route reveal + focus transition play through · path flow animates · ISS/aircraft/vessels move · screen labels track during and after camera drag · moon renders · regulatory overlay updates on hover · camera flyTo animates smoothly · theme switch repaints.

---

## 6. Expected outcome

If the idle-frame measurement comes back above 80 %, this work should take a continuously-rendering globe down to one that renders only on change: **near-zero GPU load on an idle tab**, with proportional reductions in fan noise, battery drain and machine temperature — the reported symptom.

It changes no engineering result, no numerical output and no functional scope. It is purely a rendering-cadence change, which is exactly why it belongs in a separate lot from anything touching the engineering engine.
