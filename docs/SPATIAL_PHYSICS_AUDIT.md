# Cross-Mode Spatial Physics Audit

_2026-08-09/10. Audit complete; Phases 0-3 and R28 executed. See §11-§14._

Follows the REVISIT R4 validation against NASA GMAT R2026a, which exposed two
real orbital-model defects despite ~1850 passing tests. The question here is
whether ENG and COMM carry the same defects, the same blind spots, or different
ones.

---

## 0. Instruction discovery

| File | Status |
|---|---|
| `CLAUDE.md` / `claude.md` | **Same file** — one inode (69722632), not two. Case-insensitive filesystem. Tracked in git as `CLAUDE.md` since Phase 0. |
| `.claude/settings.json`, `settings.local.json`, `launch.json` | Present, tool config only |
| `docs/AI_EXECUTION_POLICY.md` | Present, applicable |

**Was the root `CLAUDE.md` applicable? Yes** — it is the project instruction file
loaded for this working directory, and this audit followed it (targeted reads,
durable notes in `docs/`, minimal conversation).

**No conflicts.** One correction to the record, since itself superseded: a
previous `HANDOFF.md` "Known risks" entry claimed git tracked `CLAUDE.md` and
reported `claude.md` as a separate untracked file. That was wrong *at the time*
this audit began — `git ls-files` showed **neither name tracked**; the two are
one inode on this case-insensitive filesystem, and that single file was
untracked (not ignored), so a fresh clone got no `CLAUDE.md` at all. Flagged as
SPA-08.

**SPA-08 is resolved.** Phase 0 (§9) case-normalised the on-disk name to
`CLAUDE.md` and committed it (`bb81448`). `git ls-files -s` now shows one
tracked blob at `CLAUDE.md`; content was verified byte-identical by SHA-256
across the rename. The original risk — instructions absent from a fresh clone
— is closed. See §4 for the finding's closed status.

---

## 1. Executive conclusion

**1. Are ENG calculations affected or at risk?**
**Not affected by the R4 defects. At risk from a different, independent class.**
ENG does not implement secular orbital rates or J₂ at all — it propagates real
TLEs through `satellite.js` (SGP4), which carries its own validated Brouwer-
Lyddane theory. Neither Bug A (`u̇`) nor Bug B (J₂ reference radius) has an
analogue in ENG, because ENG has no such code. The real ENG risk is **mixed
Earth models**: three separate elevation implementations and two ECEF
conventions, with spherical-6371 geometry fed by *geodetic* latitude and
ellipsoid-height from `eciToGeodetic`. One instance sits on a live engineering
gate (SPA-02).

**2. Are COMM calculations affected or at risk?**
**COMM performs no spatial calculation of any kind.** Every commercial file was
searched for trigonometry, Earth constants, propagation and frame conversion:
zero hits. `commercialRouteModel.ts` imports the spatial types as `import type`
only. COMM is category **C** — it consumes already-computed engineering outputs,
principally `rttMs` (122 references). It is therefore **indirectly exposed**: it
cannot introduce a spatial error, and it cannot detect one either.

**3. Do the R4 fixes need to propagate outside REVISIT?**
**No.** `J2_REFERENCE_RADIUS_KM` and the corrected `u̇` are correctly scoped
inside `src/features/revisit/propagation/keplerJ2.ts`. Nothing outside REVISIT
computes a J₂ rate. Verified by search, not assumed.

**4. Is duplicated spatial/orbital logic present?**
**Yes, but less than the file count suggests.** Three elevation implementations
and two ECEF conventions (SPA-01). The duplication is real; its present numerical
impact is mostly negligible because of where each copy is used — which is a fact
about current call sites, not a property that will survive refactoring.

**5. Should a shared Spatial/Orbital Core be introduced?**
**A small one — yes. A framework — no.** The evidence supports consolidating
elevation/ECEF/range onto one WGS84 implementation and giving the 6371 km sphere
an explicit, named role. It does not support a `SpatialOrbitalCore` abstraction
over propagation, because ENG and REVISIT legitimately use different propagators
for different reasons (real TLEs vs a parametric Walker shell).

**6. Is additional GMAT validation justified?**
**Yes, narrowly.** ENG's ground track, range and elevation are exactly what GMAT
can adjudicate, and they are currently backed only by self-referential tests. Two
to three new scenarios would close the largest blind spot. GMAT must not be used
for RF or commercial logic.

---

## 2. Spatial calculation inventory

| Calculation | ENG | COMM | REVISIT | Implementation | Model / constants | Independent validation | Risk |
|---|---|---|---|---|---|---|---|
| Orbital propagation | ✅ | ❌ | ✅ | ENG: `satellite.js` SGP4 on real TLEs · REVISIT: `keplerJ2.ts` analytic | SGP4/WGS72 · Kepler+J₂ secular, μ=398600.4418, J₂=1.08262668e-3, R_eq=6378.1363 | REVISIT: **GMAT R4** · ENG: none of its own | ENG integration unverified |
| GMST / ECI→ECEF | ✅ | ❌ | ✅ | ENG: `satellite.js` `gstime`/`eciToGeodetic` · REVISIT: `gmstRad`/`eciToEcef` | Both GMST-based | REVISIT: GMAT 0.0065° · **ENG: GMAT V-A, 37 m** | **VERIFIED** |
| Elevation angle (primary) | ✅ | ❌ | ❌ | `capacityCalculator.calculateElevationAngle` | **WGS84** ellipsoid + ENU | **GMAT V-B, 7e-6°** | **VERIFIED** |
| Elevation angle (GEO) | ✅ | ❌ | ❌ | `geoConnectivityModel.elevationDeg` | **WGS84** ECEF | **GMAT V-B, 7e-6°** | **VERIFIED** |
| Elevation angle (LEO forecast) | ✅ | ❌ | ❌ | `satelliteResolution.computeElevationFromCoords` | **WGS84** (shared core) | **GMAT V-B** | **VERIFIED** (SPA-01 closed) |
| 3-D range / distance | ✅ | ❌ | ❌ | `compute3DDistanceKm`, `geoConnectivityModel.distanceKm` | **WGS84** ECEF | **GMAT V-B, 0.6 m** | **VERIFIED** |
| Slant range from elevation | ~~dead~~ removed | ❌ | ❌ | ~~`geoLinkBudget.computeSlantRange`~~ | sphere 6371 | none | SPA-03 — **removed in Phase 0** |
| Surface distance | ✅ | ❌ | ✅ | `earthGeometry.haversineDistanceKm` | sphere 6371 | none | Low — correct use of a sphere |
| GSO belt separation | ✅ | ❌ | ❌ | `gsoProtection.gsoBeltSeparationAngleDeg` | **WGS84 ellipsoid** | **GMAT V-C, 2e-4°** | **VERIFIED** (was SPA-02) |
| LEO footprint radius (ENG) | ✅ | ❌ | ❌ | `leoFootprint.footprintRadiusKm` | sphere 6371 + geodetic alt | none | SPA-06 — ENG only; REVISIT moved to the ellipsoid in R28 |
| Beam comb ground centre | ✅ | ❌ | ❌ | `oneWebComb` ray/sphere | sphere 6 371 000 **m** — units verified consistent | none | Low |
| FOV containment / access | ❌ | ❌ | ✅ | `fov/containment.ts` | inverted LVLH test, **WGS84 targets** (R28) | GMAT + brute force + Cesium | Low |
| Propagation delay | ✅ | consumes | ❌ | `computeOneWayLatencyMs` and inline `d/c` | c = 299792.458 km/s | none | Low formula / see SPA-05 |
| FSPL | ✅ | consumes | ❌ | `geoLinkBudget.computeFsplDb` | `20log₁₀(d_m)+20log₁₀(f_Hz)−147.55` | none | Low — standard SI form |

Shared primitives are only `utils/earthGeometry.ts` (`EARTH_RADIUS_KM`,
haversine) and `utils/sphericalGeometry.ts`. Everything else is per-mode.

---

## 3. Architecture map — as it actually is

```
                         Spatial "truth"
                                |
        +-----------------------+-----------------------+
        |                       |                       |
       ENG                    COMM                   REVISIT
        |                       |                       |
  satellite.js SGP4       (no spatial code)      keplerJ2.ts analytic
  real TLEs               consumes rttMs,        parametric Walker
        |                 latencyMs, elevationDeg        |
  WGS84 ECEF (3x)                |                 sphere 6371 geometry
  sphere 6371 (4x)               |                 R_eq 6378.1363 for J2
        |                        |                       |
  self-referential tests    no spatial tests        GMAT R2026a
     UNVERIFIED               UNVERIFIED              VERIFIED
        |                       |                       |
        +--------- shared: earthGeometry.ts ------------+
                             sphericalGeometry.ts
```

**Capacity Analyzer currently has two independent spatial truths (ENG, REVISIT)
plus a thin shared constants layer.** That is defensible — they answer different
questions — but only one of the two has ever been checked against an outside
authority.

---

## 4. Findings

### SPA-01 — Three elevation implementations, two Earth models
**Architectural risk.** Severity: **Medium** (low numeric impact today).

*Evidence.* `calculateElevationAngle` (WGS84 + ENU) and `geoConnectivityModel.elevationDeg`
(WGS84 ECEF) are correct and mutually consistent. `satelliteResolution.computeElevationFromCoords`
(`satelliteResolution.ts:95–121`) uses a spherical 6371 km model but is fed
geodetic latitude and ellipsoid height from `eciToGeodetic` — a convention mix.

Measured divergence against the WGS84 implementation over a lat/geometry sweep:
**worst 0.133°** for elevations in 0–40°; **0.026–0.046°** near the operating
gates.

*Consequence.* Currently negligible. The spherical copy is used **only** in
`computeRemainingVisibleTime`, which samples on `RVT_STEP_S = 15 s`. At LEO
elevation rates a 0.05° error is well under one second — roughly **30× below the
sampling quantisation**. It does not reach satellite selection, which uses the
WGS84 implementation.

*Affected:* ENG (handover forecast only).

*Recommendation.* Do not treat as a correctness defect. Consolidate during
Phase 2 so the harmless-by-scoping property does not silently become
harmful-by-reuse.

---

### SPA-02 — GSO belt separation mixes a sphere with geodetic latitude, on a hard threshold
**Likely defect (modelling).** Severity: **Medium-High**. **Quantified.**

*Evidence.* `gsoProtection.gsoBeltSeparationAngleDeg` (`gsoProtection.ts:156–197`)
calls `ecefFromGeodetic(lat, lng, EARTH_RADIUS_KM)` — a function *named* geodetic
that implements a **purely spherical** conversion, with no flattening — and is
fed geodetic latitudes. Its own comment says "Spherical-Earth ECEF model —
consistent with the rest of the simulation", so the sphere is deliberate; the
conflation of geodetic latitude with geocentric is what is not.

Measured against a true WGS84 ECEF construction over 24 ground/satellite
geometries: **worst error 0.144°**, typically +0.03° to +0.12°, with the
spherical model usually reporting a **larger** separation (i.e. non-conservative
for interference protection).

*Consequence.* The result is compared against `GSO_KEEPOUT_ANGLE_DEG = 11.5` to
decide whether a beam is **muted**. A sampled case at ground 35°N, satellite
30°N/4°E, 1200 km gives **spherical 10.971° (mute) vs WGS84 11.001° (no mute)** —
a verdict flip straddling the threshold. Beams within ~0.15° of the boundary can
be muted or unmuted incorrectly, changing beam availability and any throughput
or availability figure downstream, including COMM's.

*Affected:* ENG directly (`beamActivation`, `oneWebComb`, `SatelliteDetails`);
COMM indirectly.

*Recommendation.* Do **not** silently change it. Establish an independent
reference first (GMAT can supply the satellite Earth-fixed state; the belt
geometry is then closed-form), quantify how often real geometry lands within
0.15° of 11.5°, then correct. Note the ITU keep-out is defined on a topocentric
angle to the geostationary arc — the ellipsoid is the correct Earth model for a
regulatory quantity.

**Status: RESOLVED in Phase 2 (2026-08-09).** Materiality was measured first, as
the recommendation required: across a 4800-sample sweep of the 16-beam comb over
±45° of satellite latitude, **0.625 %** of beam-instants fall within 0.15° of the
threshold and **0.062 % (3 in 4800) have their mute decision flipped by the Earth
model alone**. Worst separation error 0.113°. Real, but rare — the correction was
made on the grounds that it is a convention error on a regulatory-flavoured
quantity, not because the impact is large. `ecefFromGeodetic` now builds WGS84
ellipsoid vectors; `gsoPointSeparationAngleDeg` was extracted so the geometry can
be validated a belt point at a time. See §12.

---

### SPA-03 — `computeSlantRange` is dead code carrying a documented 5–35 km error
**Harmless difference.** Severity: **Low**.

*Evidence.* `geoLinkBudget.ts:583`. Already `@deprecated` with the error and the
preferred alternative documented.

**Correction to this audit's first revision.** It stated "zero call sites". That
search excluded `__tests__`, and was wrong: `propagationConstants.test.ts`
imported it for a characterisation test measuring its own divergence from WGS84
(agreement within ~40 km for a mid-latitude GEO link). There were zero
*production* call sites, which is what made removal safe — but the original
claim as written was inaccurate, and the same exclusion could have hidden a real
consumer.

*Consequence.* None today. It was a loaded footgun: any future caller inherits a
5–35 km GEO range error, which propagates into FSPL and latency.

*Status:* **Resolved in Phase 0.** Function and its characterisation test
removed; the measured divergence figure is preserved here.

---

### SPA-04 — ENG spatial tests are self-referential; this is the exact R4 blind spot
**Architectural risk.** Severity: **High**.

*Evidence.* `gsoKeepOut.test.ts` states its group 1 as "Geometry-rule
correctness — muted ⇔ separation below `GSO_KEEPOUT_ANGLE_DEG`". That is a
tautology with respect to the implementation: it validates the *wiring*, not the
*geometry*. `leoGeometryConsistency.test.ts` is explicitly a consistency
regression ("rendering, connectivity and throughput must all use the same
canonical semi-major"). Neither compares against an external authority.

*Consequence.* **ENG's spatial layer today has the same evidential status
REVISIT had before R4** — many passing tests, no external oracle. R4 demonstrated
empirically that this configuration can hide a defect large enough to change a
headline result (1080 km, a lost access pass) indefinitely.

*Affected:* ENG, and COMM by inheritance.

*Recommendation.* Phase 1. See §6.

---

### SPA-05 — COMM inherits spatial error through `rttMs` with no independent check
**Architectural risk.** Severity: **Medium**.

*Evidence.* No spatial math exists anywhere under `src/components/commercial/` or
in `commercialRouteModel.ts` (searched for trigonometry, Earth constants,
`satrec`, `gstime`, `eciToGeodetic`, elevation, range — zero hits). It reads
`rttMs` **122 times**, plus `latencyMs` and `elevationDeg`.

*Consequence.* Every commercial verdict is a pure function of engineering
outputs. A geometry error changes commercial conclusions with no independent
signal that anything moved. This compounds the separately-tracked RTT convention
work (items #3–#7 of the 2026-07-24 RTT/throughput audit remain open), which
concerns what `rttMs` *means* rather than whether the geometry behind it is
right — the two are independent and both bear on the same field.

*Recommendation.* No COMM change. Correctness must be established upstream. A
COMM-level sensitivity check (how much does the verdict move for ±X% RTT) would
bound the exposure cheaply.

---

### SPA-06 — R28 altitude convention: partial analogue in ENG's spherical helpers
**Modelling limitation.** Severity: **Low**.

*Evidence.* R28 (REVISIT) is `a = 6371 + h`. **ENG's primary path is not
affected**: `satellite.js` returns geodetic height above the WGS84 ellipsoid, and
the WGS84 elevation/range implementations consume it correctly. However
`leoFootprint.footprintRadiusKm` and `coverageService` (`coverageService.ts:223`)
add that ellipsoid height to the 6371 km sphere — the same conflation, in
coverage geometry rather than dynamics.

*Consequence.* Sub-percent on footprint radius; the geocentric radius at
mid-latitude is ~6365–6378 km against the 6371 km assumed. Affects coverage-ring
size and beam-extent rendering, not link geometry.

*Recommendation.* Record; resolve together with R28 so both modes adopt one
stated convention. Do not change unilaterally.

---

### SPA-07 — `ecefFromGeodetic` is misnamed
**Confirmed defect (naming), no numeric effect beyond SPA-02.** Severity: **Low**.

`gsoProtection.ts:131` implements a spherical conversion under a name asserting
geodetic. A future caller will reasonably assume WGS84. Rename to
`ecefFromSphericalLatLng` when SPA-02 is addressed.

---

### SPA-08 — `CLAUDE.md` was untracked
**Architectural risk.** Severity: **Low** (process, not physics).

*Evidence (at audit start).* `git ls-files` showed no `CLAUDE.md` entry and
`git check-ignore` reported it was not ignored — it was simply untracked. A
fresh clone or CI checkout would have received no project instructions.
Corrected an earlier `HANDOFF.md` claim that git tracked it.

*Status:* **Resolved in Phase 0.** Case-normalised `claude.md` → `CLAUDE.md`
and committed (`bb81448`); content verified byte-identical by SHA-256 across
the rename. `git ls-files -s` now shows one tracked blob at `CLAUDE.md`.

---

## 5. R4 cross-impact

| R4 issue | ENG | COMM | Evidence |
|---|---|---|---|
| **Bug A** — `u̇` missing J₂ term in `Ṁ` | **Not applicable** | **Not applicable** | ENG computes no secular rates. SGP4 performs its own Brouwer-Lyddane propagation internally, including the correct `Ṁ`. Searched `nodalRegression`, `argLat`, `meanMotion`, `RAAN rate` outside REVISIT — only hits are `observedOrbitalElements.ts`, the read-only TLE→elements adapter for REVISIT's calibration |
| **Bug B** — J₂ used mean radius | **Not applicable** | **Not applicable** | No J₂ constant or term exists outside REVISIT. `6371` appears in ENG only as *geometry*, never as a dynamical reference radius |
| **Kozai/Brouwer** harness defect | Not applicable | Not applicable | ENG consumes real TLEs, where the Kozai convention is the *correct* interpretation. The defect was in synthesising TLEs from Brouwer elements, which ENG never does |
| **R28** altitude convention | **Partial** | Indirect | SPA-06 |
| **R29** Ω̇ residual ≤0.3% | Not applicable | Not applicable | No Ω̇ computed outside REVISIT |
| **Structural lesson** — oracles sharing the code's assumptions | **Applies fully** | Applies | SPA-04. This, not the specific formulas, is what R4 says about ENG |

**The single most important line in this table is the last one.** The specific
R4 defects cannot exist in ENG. The *condition that let them survive* is present
in ENG in full.

---

## 6. Validation recommendation — smallest useful set

GMAT R2026a is installed and the workflow is proven (`docs/revisit/gmat/`,
`GmatConsole --run`). Three scenarios, in priority order.

### GMAT should validate

**V-A — ENG LEO ground track and access, against real TLE geometry.**
Take one OneWeb TLE already in the app. Import the same orbit into GMAT and
compare Earth-fixed position, sub-satellite lat/lon, and rise/set boundaries
against a ground site for 24 h. Bounds ENG's whole SGP4 → `eciToGeodetic` →
elevation chain end-to-end.
*Correlation warning:* GMAT cannot ingest a TLE with SGP4 semantics natively;
converting TLE→osculating state to seed GMAT would import `satellite.js`'s own
interpretation and make the oracle correlated. Seed GMAT from an **independently
stated element set** and compare *trajectory shape and event timing*, or accept
this as a bounded rather than absolute check. Document whichever is chosen.

**V-B — Elevation, azimuth and slant range at a fixed ground site.**
GMAT computes these natively for a `GroundStation`. Direct comparison against
`calculateElevationAngle` and `compute3DDistanceKm`. Definitions align
(topocentric, WGS84), so this is a clean, fully independent check — the highest
value per unit of effort, and it validates the implementations SPA-01 says
should become canonical.

### GMAT can provide geometry input only

**V-C — GSO belt separation (SPA-02).** GMAT supplies the validated satellite
Earth-fixed state; the belt-separation angle is then closed-form and can be
computed independently in the test from that state. GMAT does not model the ITU
keep-out rule itself.

### GMAT is not the oracle

FSPL, C/N, MODCOD, throughput, capacity, commercial verdicts. For these the
requirement is `implementation → equation → authoritative source → independent
test`, using independently computed reference vectors:

| Quantity | Equation | Authoritative source | Status |
|---|---|---|---|
| FSPL | `20log₁₀(d)+20log₁₀(f)−147.55` (SI) | ITU-R P.525 | Constant is the standard `20log₁₀(4π/c)`; **no independent reference vector test** |
| Propagation delay | `d/c`, c = 299792.458 km/s | SI definition | Formula trivially correct; the open question is RTT *convention*, not physics |

---

## 7. Architecture recommendation

**Introduce a small shared spatial primitives module. Do not build a
`SpatialOrbitalCore` framework.**

Justified by evidence:

- one WGS84 ECEF conversion (currently three implementations);
- one elevation function (currently three);
- one range function (currently two plus one dead);
- explicit, named Earth constants distinguishing **geometry sphere**
  (`EARTH_RADIUS_KM`, 6371) from **dynamical reference radius**
  (`J2_REFERENCE_RADIUS_KM`, 6378.1363) from **ellipsoid**
  (WGS84 `A`/`F`, currently re-declared inline in `capacityCalculator.ts` twice);
- shared validation fixtures, so one GMAT run serves both modes.

**Not** justified: a unified propagation interface. ENG needs real TLEs with
drag; REVISIT deliberately forbids them (ADR-001 §1) because drag makes multi-day
statistics irreproducible. Forcing one abstraction over both would recreate the
shared-assumption coupling that R4 just exposed. **Keeping the two propagators
independent is a feature — it is what makes them mutual cross-checks.**

---

## 8. Physics Confidence Ledger

| Domain | Current model | Validation source | Independence | Status | Residual uncertainty |
|---|---|---|---|---|---|
| LEO propagation (REVISIT) | Kepler + J₂ secular, Brouwer rates | GMAT R2026a, RK8(9) JGM2 | **High** — numerical integrator, different theory, different implementation, external constants | **VERIFIED** | 9 km bounded over 72 h (J₂ short-period, unmodelled by design); Ω̇ ≤0.3% (R29) |
| LEO propagation (ENG) | SGP4 on real TLEs via `satellite.js` | Third-party established implementation (level 3) | Medium | **SUPPORTED** | Frame conversion now VERIFIED separately (V-A); SGP4's own dynamics remain unvalidated by this project, by design |
| ECI/ECEF + Earth rotation (REVISIT) | Single GMST rotation | GMAT full IAU chain | High | **VERIFIED** | 0.0065° longitude; bounds rate/epoch, not the ~0.36° J2000-vs-date frame offset |
| ECI/ECEF + Earth rotation (ENG) | `satellite.js` `gstime`/`eciToGeodetic` | **GMAT R2026a (V-A)** | **High** — GMAT's own IAU/EOP chain, no shared code | **VERIFIED** | 37 m ground, 0.7 m altitude; residual is the UT1-UTC + polar-motion bias GMST omits |
| Earth geometry — WGS84 paths | WGS84 ellipsoid ECEF | **GMAT R2026a (V-B)** | **High** — GMAT topocentric state, `satellite.js` not involved | **VERIFIED** | Elevation 7.2e-6°, range 0.6 m across three latitudes |
| Earth geometry — spherical paths | Sphere 6371 km, coverage geometry only | none | None | **SUPPORTED** | Phases 2-3 removed every ellipsoid-fed-to-sphere site; SPA-06/R28 altitude convention remains open |
| Access / visibility (REVISIT) | Inverted LVLH FOV containment | GMAT + brute-force sampling | High | **VERIFIED** | Max gap exact at 4 targets |
| Access / visibility (ENG) | Elevation threshold on SGP4 track | **GMAT (V-B)** for the geometry; none for the rule | High for geometry | Geometry **VERIFIED**; rule **UNVERIFIED** | Thresholds and selection are product policy, not physics GMAT can adjudicate |
| Slant range | WGS84 ECEF difference | **GMAT R2026a (V-B)** | **High** | **VERIFIED** | 0.6 m worst over 1197-3146 km; spherical variant removed in Phase 0 |
| Propagation delay | `d/c`, c = 299792.458 km/s | SI definition | n/a | **SUPPORTED** | Physics trivial; RTT *convention* separately open (2026-07-24 audit #3–#7) |
| RF path loss | `20log₁₀(d)+20log₁₀(f)−147.55` | ITU-R P.525 form | Low | **SUPPORTED** | Correct SI constant; no independent reference vector |
| GEO geometry | WGS84 ECEF (live path) | none | None | **SUPPORTED** | Live path sound; dead spherical helper documented at 5–35 km |
| GSO keep-out | **WGS84 ellipsoid**, 11.5° gate | **GMAT (V-C via V-B decomposition)** + analytic zenith invariant | High for the two position legs; the belt point is definitional | **VERIFIED** | Belt-point leg rests on a definition, not an executable oracle |
| LEO handover | Elevation forecast, 15 s sampling | none | **None** | **UNVERIFIED** | Spherical/WGS84 divergence ~30× below sampling step; handover *policy* unvalidated |

**Updated after Phase 1 (2026-08-09).** ENG now holds four VERIFIED spatial
domains — elevation, slant range, WGS84 Earth geometry and frame conversion —
where before it held none. What remains UNVERIFIED is narrower and specific: the
GSO keep-out Earth model (SPA-02, Phase 2), SGP4's own dynamics, and the
access/selection *rules*, which are product policy rather than physics.

An "engineering-grade geometry" claim is now defensible for ENG's site geometry
and frame handling, and specifically **not** for the GSO keep-out until SPA-02 is
resolved.

---

## 9. Proposed implementation plan — phases only, not implemented

Correctness fixes are deliberately kept apart from refactoring.

**Phase 0 — no-risk cleanup. ✅ DONE 2026-08-09.** Removed `computeSlantRange`
and its characterisation test (SPA-03); renamed `ecefFromGeodetic` →
`ecefFromSphericalLatLng` (SPA-07); normalised `claude.md` → `CLAUDE.md` and
tracked it (SPA-08). No production numerical output changed. Gate: 0 TS errors,
ESLint clean, 1857 tests passing (1858 − 1 removed).

**Phase 1 — independent validation, before any physics change. ✅ DONE
2026-08-09.** V-B and V-A both executed against GMAT R2026a. Results in §11.
Headline: ENG's WGS84 geometry and its frame conversion are now **VERIFIED**;
no defect was found in either. Baseline established for Phase 2 and Phase 3.

**Phase 2 — SPA-02, with evidence in hand. ✅ DONE 2026-08-09.** Materiality
measured (0.062 % of beam-instants flip), V-C validation built, Earth model
corrected to WGS84. See §12.

**Phase 3 — deduplicate spatial primitives. ✅ DONE 2026-08-09.** One ECEF, one
elevation, one range, named constants. Pure refactor, verified no-change against
the Phase 1 baseline. See §13.

**Phase 4 — optional.** R28/SPA-06 altitude convention (product decision, both
modes together); COMM RTT sensitivity bound; R29.

---

## 10. Method and limitations

Targeted search and traced call paths only; no recursive repository read. Every
numeric claim was computed during this audit — elevation and GSO divergences from
independent reimplementations of both formulas, call-site counts from `rg`.

Not covered: Cesium rendering geometry (visual only), maritime/air traffic,
GEO capacity and MODCOD chains (not spatial), and the ~350 files with no spatial
content. `oneWebComb`'s beam-comb geometry was checked for unit consistency
(verified: metres throughout) but its beam model was not re-derived — that is
tracked separately under the OneWeb official-slide deltas.

**This audit did not execute GMAT.** All ENG statuses are therefore SUPPORTED or
UNVERIFIED by construction — promoting any of them requires §6.


---

## 11. Phase 1 results — ENG's first external validation

Executed 2026-08-09 against NASA GMAT R2026a. Two tests added; **no production
code changed**. Scripts in `docs/revisit/gmat/`, fixtures in
`src/utils/__tests__/fixtures/`.

Together V-B and V-A cover ENG's spatial chain end to end:

```
  satrec --SGP4--> TEME state --eciToGeodetic--> lat/lon/alt --> elevation, range
                   \_______________________________/  \____________________/
                              V-A: 37 m                    V-B: 7 microdeg
```

### V-B — site geometry (`engGmatSiteGeometry.test.ts`)

GMAT's own topocentric state of a LEO satellite relative to three ground
stations, 24 h at 60 s. Compared against ENG fed only GMAT's published geodetic
lat/lon/alt. **`satellite.js` is not involved on either side.**

| Site | Latitude | Passes ≥10° | Peak elev | Slant range | Elevation error | Range error |
|---|---|---|---|---|---|---|
| Singapore | 1.35°N | 29 | 82.2° | 1197–3044 km | **4.7e-6 °** | **0.3 m** |
| Paris | 48.85°N | 58 | 58.4° | 1368–3074 km | **5.4e-6 °** | **0.4 m** |
| Longyearbyen | 78.22°N | 183 | 85.2° | 1211–3146 km | **7.2e-6 °** | **0.6 m** |

Microdegrees and sub-metre — at the fixture's print precision, not at any
modelling limit. `capacityCalculator.calculateElevationAngle` and
`geoConnectivityModel.elevationDeg` agree with GMAT **and with each other to
1e-6°**, so SPA-01's duplication is confirmed harmless numerically: the two
WGS84 copies are the same function written twice.

GMAT's Topocentric axes were determined **experimentally**, not from
documentation: SEZ (X South, Y East, Z Zenith), confirmed two ways — a station
beneath the satellite gives (0, 0, altitude), and a south-east satellite gives
(+, +, −).

### V-A — frame conversion (`engGmatFrameConversion.test.ts`)

The step nothing had ever checked: SGP4's TEME output → `eciToGeodetic` →
lat/lon/alt. 20 states across the fleet spanning 22 h. GMAT was handed the same
TEME states and converted them with its own IAU precession/nutation/polar-motion
chain, loaded EOP and its own ellipsoid. No propagation, so SGP4's dynamics are
excluded and only the conversion is compared.

| Quantity | Result |
|---|---|
| Worst horizontal ground displacement | **37 m** |
| Worst altitude difference | **0.7 m** |
| Longitude bias, \|lat\| < 60° (n=13) | **+0.000337°**, spread **0.00026°** |
| Longitude residual, \|lat\| > 80° | ±0.003°, sign-changing |

**The residual is explained, not tolerated.** +0.000337° is ~1.2 arcseconds —
the expected magnitude of what a single GMST rotation omits and GMAT models:
UT1−UTC and polar motion. Two pieces of evidence confirm the interpretation
rather than merely permitting it:

1. At mid latitudes the offset is a **bias, not scatter** — the spread is an
   order of magnitude below the mean. A wrong frame, epoch or rotation rate
   would scatter or grow with time; a missing rotation about the pole cannot.
2. The scatter appears **only above 80°**, where it changes sign. That is the
   polar-motion signature: polar motion *tilts* the axis rather than spinning
   about it, so it cannot be absorbed into a longitude offset. Its absence would
   have been more suspicious, not less — it would suggest the two sides shared
   an Earth-orientation model.

At 37 m this sits four orders of magnitude below the ~700 km beam scale ENG
reasons about.

### What Phase 1 did NOT establish

Stated explicitly, because the value of this exercise depends on not
overclaiming:

- **SGP4's dynamics remain unvalidated by this project.** V-A deliberately took
  `satellite.js` TEME states as *input* — they are the output of the code under
  test — so it validates the conversion, not the propagation. ENG's propagation
  stays **SUPPORTED** on the strength of `satellite.js` being an independently
  validated third-party implementation, not VERIFIED.
- **SPA-02 (GSO keep-out) is untouched.** It needs V-C and a correction, which
  is Phase 2 and requires explicit approval.
- **Access/visibility policy** — minimum-elevation thresholds, selection and
  handover rules — is a product decision, not physics. Its *geometry* input is
  now verified; the rules themselves are not the kind of thing GMAT adjudicates.
- Both sides share the standards-level definition of "geodetic latitude and
  height above the WGS84 ellipsoid". Confirmed empirically (topocentric Z equals
  reported altitude at the sub-satellite point) but it is a shared definition,
  and is recorded as such.

### Ledger movement

| Domain | Before Phase 1 | After |
|---|---|---|
| Elevation angle (both WGS84 implementations) | SUPPORTED | **VERIFIED** — GMAT, 7.2e-6° worst |
| Slant range / 3-D distance | SUPPORTED | **VERIFIED** — GMAT, 0.6 m worst |
| ECI/ECEF + Earth rotation (ENG) | SUPPORTED | **VERIFIED** — GMAT, 37 m ground, residual explained |
| LEO propagation (ENG) | SUPPORTED | SUPPORTED — unchanged by design |
| GSO keep-out | UNVERIFIED | UNVERIFIED — Phase 2 |
| Access/visibility (ENG) | UNVERIFIED | Geometry **VERIFIED**; thresholds remain policy |

**ENG now has three VERIFIED spatial domains where it had none.** SPA-04 — the
finding that ENG held the same evidential position REVISIT held before R4 — is
substantially closed for geometry. It remains open for propagation and for the
GSO keep-out.

**No defect was found in ENG's WGS84 geometry.** That is a real result rather
than an absence of one: the same procedure applied to REVISIT found two defects
within hours, so it had demonstrated power to detect exactly this class of error.


---

## 12. Phase 2 results — SPA-02 corrected

**Materiality was measured before anything was changed**, as §4 required. Sweep
of the 16-beam comb across ±45° of satellite latitude, 4800 beam-instants:

| Measure | Value |
|---|---|
| Worst separation error, sphere vs ellipsoid | **0.113°** |
| Beam-instants within 0.15° of the 11.5° threshold | 30 (**0.625 %**) |
| **Mute decisions flipped by the Earth model alone** | 3 (**0.062 %**) |

So the defect is **real but rare** — roughly one beam-instant in 1600. It was
corrected on the merits rather than on impact: the keep-out threshold is
anchored to an ITU Art. 22 EPFD argument, and EPFD is defined on a topocentric
angle to the geostationary arc **from a point on the ellipsoid**. Using geodetic
latitude with a 6371 km sphere was a conflation, not a modelling choice.

ADR-001 §2's coverage sphere is untouched everywhere else.

### How V-C was satisfied

The belt separation decomposes into exactly three pieces:

| Piece | Evidence |
|---|---|
| ground point ECEF | WGS84 — **GMAT-verified, V-B** |
| satellite ECEF | WGS84 — **GMAT-verified, V-B** |
| belt point ECEF | `r = GEO_ORBIT_RADIUS_KM` in the equatorial plane of the Earth-fixed frame — **a definition**, no Earth model |

plus an angle between two difference vectors, which is arithmetic. The committed
V-B fixture therefore carries the load. What V-B left unpinned was **azimuth** —
it asserted elevation and range, which do not fix a 3-D direction. That gap is
closed **frame-invariantly**: the angle between a *pair* of directions is
identical in any orthonormal frame, so GMAT's topocentric vectors are compared
against our ECEF vectors with no basis of our own in between. Constructing an
SEZ basis here would have reintroduced precisely the correlation R4 warned
about. Measured agreement: **2e-4°**, set by fixture print precision; a
spherical-Earth regression would show as ~0.1°.

Three further checks: a **zenith invariant** (for an equatorial station the belt
point at the same longitude is exactly overhead, so separation ≡ 90° − elevation,
chaining onto the GMAT-verified elevation function — exact to 1e-5°); a check
that the belt scan's minimum actually dominates a 2° sampling, which a
point-wise test cannot see; and a pin on the size of the correction so a silent
revert to the sphere is loud.

`gsoPointSeparationAngleDeg` was extracted and exported so the geometry can be
validated one belt point at a time. A minimum is a poor thing to validate — a
discrepancy can hide in *which* belt longitude won rather than in the angle.

**Not a fresh GMAT run.** The install lived in a session scratchpad that had been
cleaned, and re-downloading 455 MB to re-derive a quantity that decomposes into
two verified components and one definition was not a good trade. Recorded rather
than glossed: **the belt-point leg rests on a definition, not on an executable
oracle.** If that is ever considered insufficient, the V-C scenario (real
spacecraft parked on the belt, angle taken between two GMAT topocentric vectors)
is the way to close it.

All 22 pre-existing GSO keep-out tests pass unchanged.

---

## 13. Phase 3 results — one spatial core

`src/utils/wgs84Geometry.ts` is now the only WGS84 ellipsoid model in the
codebase. Before: the constants were declared in **four** places, geodetic→ECEF
was written out **three** times, elevation **three** times, slant range **twice**.
After: one of each.

| Site | Was | Now |
|---|---|---|
| `capacityCalculator.calculateElevationAngle` | own constants + ECEF + ENU | delegates |
| `capacityCalculator.compute3DDistanceKm` | own constants + ECEF | delegates |
| `geoConnectivityModel.toEcef` / `elevationDeg` / `distanceKm` | own constants + ECEF | delegates |
| `gsoProtection.ecefFromGeodetic` | own constants + ECEF | delegates |
| `satelliteResolution.computeElevationFromCoords` | **sphere 6371** | delegates |

**Three Earth radii now exist, each named for its role** — they are numerically
close and were the source of both R4 defects and SPA-02:

```
EARTH_RADIUS_KM         6371       mean sphere      coverage geometry (ADR-001 §2)
WGS84_A_KM              6378.137   ellipsoid        positions and angles
J2_REFERENCE_RADIUS_KM  6378.1363  J₂'s definition  orbital dynamics
```

### One deliberate behaviour change

Consolidating `satelliteResolution.computeElevationFromCoords` (SPA-01's third
implementation, the last spherical one) is **not bit-identical**: it moves the
answer by up to 0.13°, and 0.026–0.046° near the elevation gates.

That is an improvement, not a regression — the ellipsoid figure is the one
verified against GMAT to 7.2e-6° — and it cannot change behaviour in any case:
its only caller, `computeRemainingVisibleTime`, samples on `RVT_STEP_S = 15 s`,
and at LEO elevation rates 0.05° is well under a second, roughly **30× below the
sampling quantisation**. Stated rather than buried, because "pure refactor"
should mean what it says and this one line of it does not.

Everything else is bit-identical, and the Phase 1 GMAT suites are the gate: they
still reproduce 7.2e-6° and 0.6 m after the migration.

### Ledger movement

| Domain | Before | After |
|---|---|---|
| GSO keep-out | UNVERIFIED — spherical, 0.144° bias | **VERIFIED** — WGS84, GMAT-backed via V-B decomposition + analytic invariants |
| Earth geometry — spherical paths | UNVERIFIED — convention mix | **Resolved**: no ellipsoid-fed-to-sphere sites remain; 6371 km now appears only in genuine coverage geometry |

**Remaining UNVERIFIED after Phases 0–3:** SGP4's own dynamics (by design — see
§11); access/selection *thresholds*, which are product policy; and SPA-06 / R28,
the altitude convention, which is an open product decision.


---

## 14. R28 — the altitude datum and the ellipsoid ground model (2026-08-10)

R28 was the last open product decision from this audit. It was resolved as
**adopt the equatorial altitude datum, and move REVISIT's authoritative chain
onto the WGS84 ellipsoid**. ADR-001 §2 is superseded by §2a.

### Two corrections to THIS document

**R1 was wrong, and in the opposite direction.** It recorded the design note's
swath table as "mixing two Earth radii", on the grounds that its swath widths
reproduced on a 6371 km sphere while its horizon angles looked WGS84-equatorial.

Swath widths are **nearly insensitive to the datum at the table's quoted
precision, when each datum is paired consistently** — they differ by metres,
which rounds away in figures quoted to the kilometre. They are a CONSISTENCY
CHECK, not an independent discriminator, and they never distinguished the two
conventions. (They are *not* invariant: r/R = 1 + h/R still depends on R, and
the measured difference at 600 km / 30° off-nadir is 7 m.)

**The discriminating evidence is the horizon angles and the orbital periods.**
Both reproduce on the equatorial datum and neither does on 6371:

| Quantity | Design note | R28 model | Pre-R28 model |
|---|---|---|---|
| Horizon off-nadir, 500/600/700 km | 68.0 / 66.07 / 64.3° | **68.019 / 66.067 / 64.304°** | 68.007 / 66.054 / 64.290° |
| Orbital period, 500/600/700 km | 94.6 / 96.7 / 98.8 min | **94.62 / 96.69 / 98.77 min** | 94.47 / 96.54 / 98.62 min |
| Swath widths | 269 / 585 / 1044 km | agree (consistency check only) | agree (consistency check only) |

The source table was consistent throughout. **The 6371 km model was the
outlier**, and two independent discriminating quantities vote for the datum R28
adopted.

**R21 is fixed, not pinned.** The exact-pole footprint collapse was a
measure-zero defect that had been documented and pinned by a test. It existed
because the geodesic-walk projection needed a compass bearing, and "east" is
undefined over a pole. Ray/ellipsoid intersection never forms an azimuth, so the
degeneracy has no cause any more. The test now asserts a full ring.

### What moved — complete user-facing delta

Measured by running one harness on `main` and on the branch, not recomputed from
the new code. Default scenario: 12 × 8 · 87.9° · 1200 km, STANDARD FOV, 72 h.

**Orbit**

| | Before | After | Δ |
|---|---|---|---|
| Semi-major axis at "1200 km" | 7571.0000 km | 7578.1370 km | **+7.137 km** |
| Orbital period | 109.2671 min | 109.4217 min | +0.155 min (+0.14 %) |
| Mean motion | 9.58382817e-4 | 9.57029245e-4 | −0.141 % |

**Instrument** — presets are *defined* by swath, so the swath figures are
unchanged by construction and the half-angles absorb the difference.

| | Before | After | Δ |
|---|---|---|---|
| NARROW / STANDARD / WIDE half-angle | 8.279764 / 16.130059 / 29.427398° | 8.279785 / 16.130212 / 29.428358° | ≤ +0.001° |
| Horizon off-nadir @ 1200 km | 57.29891° | 57.31474° | +0.0158° |
| Half-swath @ 30° off-nadir, 600 km | 352.209 km | 352.202 km | −7 m |

**Headline KPI — this is the part that matters**

| Target | Max gap before | after | Δ | Mean gap Δ | Passes/day Δ |
|---|---|---|---|---|---|
| Singapore | 11 h 48 m | **9 h 09 m** | **−2 h 39 m** | −20 m | −0.33 |
| Cape Town | 9 h 30 m | 9 h 31 m | +1 m | −47 m | +0.67 |
| London | 9 h 40 m | 9 h 41 m | +1 m | 0 | 0 |
| Longyearbyen | 2 h 46 m | 2 h 46 m | 0 | −1 m | +0.34 |

**Singapore's worst-case gap moved by 2 h 39 m — 22 %**, and an ablation
attributes it precisely. See §14a: it is **entirely the semi-major axis**, not
the ground model.

**Second selection — the split the UI actually reconciles to (2 planes × 4)**

The table above uses `DEFAULT_SELECTION`. The panel displays the *measured best*
split at 8 payloads, which is a different constellation, so its numbers move
differently and are reported separately rather than folded in.

| Target | Max gap before | after | Mean gap | Passes/day |
|---|---|---|---|---|
| Singapore | 6 h 15 m | **11 h 51 m** | 5 h 57 m → 7 h 17 m | 4.00 → 3.33 |
| Cape Town | 6 h 21 m | 6 h 22 m | 5 h 03 m → 5 h 03 m | 4.67 → 4.67 |
| London | 6 h 05 m | 6 h 05 m | 3 h 51 m → 4 h 04 m | 6.00 → 5.67 |
| Longyearbyen | 5 h 54 m | 5 h 54 m | 1 h 11 m → 1 h 09 m | 18.67 → 19.00 |

Singapore moves the other way on this split — **6 h 15 m → 11 h 51 m** — for the
same reason it moved the first way on the default split: a marginal ~1 min pass,
here lost rather than gained. Both directions are the same mechanism (§14a), and
neither is a change in accuracy: the pre-R28 figure was not "right".

**WHY THIS REVISIT panel**

| | Before | After |
|---|---|---|
| Geometry factor | `lat 51.5° < reach 91.0° ✓` | `lat 51.5° < reach 90.0° ✓` |

The old figure was the equatorial estimate `turning + λ` = 87.9 + 3.1, and
**91.0° is not a latitude that exists**. The new value comes from
`maxReachableLatitudeDeg` (§14b) and saturates correctly at the pole. Same
verdict here, but the displayed number is now meaningful and the BLOCKING path
is sound.

**Footprint** — the drawn shape now lands on the same surface as the analysis.

| | Before | After |
|---|---|---|
| Centre / sub-satellite point | 0.000000, 45.453662 | identical |
| Boundary vertex [0] | 3.145510, 45.569118 | 3.163326, 45.568996 |
| Boundary vertex [12] | −0.115283, 48.599178 | −0.115930, 48.595658 |

Vertex shifts are ~2 km, consistent with the ellipsoid's shape rather than with
any change in the FOV.

### Benchmarks — comparative R28 hot-path timings

**Scope, stated up front.** These are **Node/Vitest microbenchmarks, 3
repetitions**, measuring engine and geometry functions in isolation. They are a
*comparative* before/after on the R28 hot paths. They are **not** a
foreground-browser frame-rate measurement, and nothing here bears on 60 fps.
**R12 remains open** and can only be closed by actual foreground Cesium frame
timing.

| | Before | After | Δ |
|---|---|---|---|
| Engine: default selection, 1 target, 72 h | 33.4 ms | 25.5 ms | **−24 %** |
| Engine: full 96-satellite fleet, 72 h | 374 ms | 308 ms | **−18 %** |
| Render hot path: 256 sats × propagate | 0.1 ms | 0.1 ms | — |
| Render: 256 sats × footprint | 5.1 ms | 6.0 ms | +18 % |
| Render: 256 all-limb footprints (worst case) | 4.7 ms | 16.8 ms | +257 % |

The engine got *faster*: fewer marginal access transitions means fewer
bisections. Ray/ellipsoid footprints cost ~18 % more than the geodesic walk,
which is immaterial at 6 ms for a full 256-satellite frame.

The all-limb case is the only real regression, and it is bounded: the limb clamp
bisects, and it only runs for vertices that actually miss the Earth — which
requires a FOV wider than the horizon (the benchmark forces 80° against a 57.3°
horizon). It was first measured at 23.6 ms with a 40-iteration bisection;
reduced to 24 iterations (~1e-7 rad, sub-millimetre on the ground, far below a
rendered pixel) it is 16.8 ms. **The clamp is render-only — the access analysis
never calls `computeFootprint`.**

**Performance acceptance target for the HLD profile change: 634 displayed
satellites, measured as foreground Cesium frame timing.** R28 benchmarked the
currently supported **256**, in Node, comparatively. It has not validated 634,
has not measured a frame rate, and no claim is made that it does either.

### The final-review horizon fix changed no reported number

The production horizon test used the geocentric radius vector while this
module's own comment and the V5 oracle specified the ellipsoid normal. Corrected
(see §14c). Measured by toggling the production file and re-running the whole
report: **KPIs are byte-identical at both selections and all four targets.**

That is the expected outcome and is worth stating rather than assuming — the two
tests differ only within the deflection of the vertical, so they can disagree
only for geometry grazing the horizon, which a 16.13° half-angle instrument at
1200 km never produces. It is a correctness fix, not a numbers change, and the
new 45°-latitude test exists precisely because no reference scenario exercises it.

*(Browser readings taken at different moments differ slightly from the harness
because the UI's analysis window starts at the live simulation clock, not the
harness's fixed epoch. The harness is the controlled comparison.)*

### What R28 does NOT establish

- **The altitude datum is not externally validated.** The committed GMAT fixture
  is pinned to a fixed semi-major axis (7571 km) and deliberately exercises no
  altitude mapping. A new GMAT run seeded from the equatorial datum is required
  before any such claim. The UI and CSV both say so.
- Swath and horizon scalars are **equatorial reference values**, not globally
  exact WGS84 swaths — a swath has no single value on an ellipsoid. The
  authoritative instrument input remains the angular FOV; ground-swath presets
  are derived conveniences.
- The OneWeb HLD reference profile (12 × 48 active, 58 spares, per-plane
  altitudes 1175–1219 km, fudge ≈ 1.015) is **deliberately not part of R28** and
  follows as a separate change. The current 12 × 8 preset remains a labelled
  demo profile, not an authoritative OneWeb result.


---

## 14a. Ablation — what actually moved Singapore's gap

The first write-up of §14 attributed the 2 h 39 min shift to the
geodetic-vs-geocentric deflection. **That attribution was wrong**, and it was
implausible on inspection: Singapore is at 1.35° latitude, where the deflection
is about 0.009°, not the 0.19° maximum quoted.

R28 changed two things at once — the semi-major axis and the ground model — so
they were separated. Test: `src/features/revisit/__tests__/r28Ablation.test.ts`,
which reimplements the access scan so all four cells go through identical code.

### The 2×2

Singapore, 72 h, STANDARD FOV, the default 8-payload selection. Maximum interior
gap:

| | ground = 6371 sphere | ground = WGS84 ellipsoid |
|---|---|---|
| **a = 7571.000 km** (pre-R28) | 11 h 48 m | 11 h 48 m |
| **a = 7578.137 km** (post-R28) | 9 h 09 m | 9 h 09 m |

**The ground model contributes nothing measurable** — 11.80715 h in both columns,
9.14555 h in both. **The entire shift is the semi-major axis.** The row effect is
2 h 39 m; the column effect is under 4 seconds. It is not an interaction either:
the SMA effect is the same size in both ground models.

Why the ground model does so little *here*: at 1.35° latitude the ellipsoid
radius is 6378.13 km against the sphere's 6371 km, so the target moves ~7.1 km
**outward** — and the satellite also moves ~7.14 km outward. The two nearly
cancel in the look-angle geometry. The deflection, the effect originally blamed,
is ~0.009° at this latitude and does even less.

### Which pass moved

| | Passes | Only in this configuration |
|---|---|---|
| pre-R28 | 12 | 38.159 h, 71.046 h |
| post-R28 | 11 | **52.773 h** |

The mechanism is a single grazing pass. Pre-R28 the longest interior gap runs
50.046 h → 61.853 h = **11.807 h**. Post-R28 a pass appears at **52.773 h**
inside that window and splits it into 2.661 h + 9.145 h, so the maximum falls to
9.145 h.

The cause is dynamics: a 7.137 km larger semi-major axis lengthens the orbital
period by 0.14 %, which changes the ground-track drift per revolution. Over 72 h
(~39 revolutions) the track pattern precesses differently and a pass that
previously missed Singapore now clips it. Every pass here is 30 s to 2 min long
— Singapore sits at 1.35° under an 87.9° shell, so tracks cross nearly
north-south and only graze it — which is why the maximum gap is so sensitive to
whether one marginal pass lands.

### Not a sampling artefact

Transition bisection enabled, both ends of the delta, four step sizes:

| Step | pre-R28 max gap | post-R28 max gap |
|---|---|---|
| 20 s | 11.80715 h | 9.14555 h |
| 10 s (production) | 11.80715 h | 9.14555 h |
| 5 s | 11.80715 h | 9.14555 h |
| 2 s | 11.80715 h | 9.14555 h |

Identical to five decimal places across a 10× range, at both ends. The passes
are 30 s to 2 min, which is exactly the regime where coarse sampling would alias
— it does not. **The production step stays at 10 s**; nothing here argues for
changing it.

### Corrected attribution

> Singapore's worst-case revisit gap moved from 11 h 48 m to 9 h 09 m. This is
> attributable **entirely to the change in semi-major axis** (7571.000 →
> 7578.137 km), which alters the orbital period by 0.14 % and hence the
> ground-track drift, causing one marginal ~1 min pass to appear at t = 52.8 h
> and split the longest gap. The sphere→ellipsoid ground-model change
> contributes under 4 seconds at this target and is not an interaction term.
> The result is stable across sampling steps from 20 s to 2 s.

---

## 14b. `explainRevisit` — the reach verdict no longer rests on an equatorial scalar

`groundHalfAngleDeg()` is an equatorial reference value: it solves the spherical
law of sines against `a`, where the ellipsoid's cross-section is circular. It was
feeding `unreachable = |lat| > turning + λ`, which produces the product's
decisive `GEOMETRY / BLOCKING` verdict — "no number of payloads changes this".

That was wrong on two counts: an equatorial scalar is not a latitude reach on an
ellipsoid, least of all at the high latitudes where the question is asked; and it
collapses an asymmetric or biased FOV to a single half-angle.

**Replaced by `maxReachableLatitudeDeg`**, which sweeps the argument of latitude
over a full orbit, projects the FOV boundary by ray/WGS84-ellipsoid intersection,
and takes the largest |geodetic latitude| any boundary vertex reaches.
`groundHalfAngleDeg` remains, clearly labelled, on the SWATH line only.

**Its independent test found a defect in the first version of the bound.**
Validated through `isTargetInFov` — the containment path, which shares no code
with the footprint projection — the bound reported 88.90° for the reference
87.9° shell while containment demonstrably saw a target at 89.50°. Two causes:
24 boundary vertices was too sparse, and a footprint that *contains* a pole
reaches 90° although no vertex does. Fixed with 180 vertices and pole-winding
detection.

That direction of error matters: an under-stated reach makes the product declare
`BLOCKING` for a target it can actually see. Over-stating only withholds a
verdict. Dense sampling alone still cannot prove an upper bound, so the final
implementation separates the two: the sampled maximum is displayed, while
`BLOCKING` uses an analytic conservative upper bound derived from the farthest
possible FOV ray, the WGS84 polar radius and the exact maximum latitude
deflection. A target in between is `UNKNOWN`, never falsely impossible.

The same final review caught a production/oracle mismatch: containment's comment
and V5 oracle used the ellipsoid normal for the target horizon, but the hot path
still dotted the line of sight with the radius vector. Horizon and optional
elevation masks now use the WGS84 normal. A 45°-latitude, 0.05°-elevation test
discriminates the corrected formula from the old one.
