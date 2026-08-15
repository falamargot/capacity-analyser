# REVISIT — compact-viewport (mobile) UX plan

_Written 2026-08-15. Implemented the same day; see §6 for status._

## 1. The complaint

On a phone REVISIT had no usable globe: it could neither be seen nor
manipulated, and the data on screen was not ordered by what a user needs first.

## 2. Measured evidence (iPhone-class viewport, 375 × 812)

Measured in the browser on `main` before the change:

| Band | Top (px) | Height (px) | Share of viewport |
|---|---|---|---|
| Context header (triad) | 0 | **331** | 41 % |
| Stage toolbar (Back / Present / Scenarios / Reset) | 339 | 58 | 7 % |
| Analysis column (`max-h-[22vh]`, bottom-anchored) | 470 | 179 | 22 % |
| Coverage ribbon | 649 | 163 | 20 % |

The globe canvas filled the stage (482 px) but only **73 px** of it — the band
between the toolbar and the analysis column — was neither covered nor
click-blocked by a `pointer-events-auto` overlay. That is **9 %** of the
viewport, and the Earth's centre sat *behind* the analysis column, so the one
gesture the scene exists for (rotate) had almost no surface to start on.

Root causes, in order of cost:

1. The triad (constellation / hosted payloads / analysis target) was rendered in
   full at every width. It is read-once configuration.
2. The analysis column was permanently docked over the bottom of the stage.
3. The stage toolbar rendered as a five-button band lying across the scene.
4. The ribbon's control row wrapped into two lines, because `−1 h` / `+1 h`
   would not fit beside play/pause, speed and the UTC timestamp.

## 3. Principles for the compact layout

- **Globe first.** Below `md` the scene is the default surface; every panel is
  something the user *opens*.
- **Collapsing a panel must never collapse the answer.** REVISIT's entry promise
  is a number on screen immediately, so the verdict and the worst-case gap stay
  visible at all times.
- **Keep the one control that is manipulated continuously.** That is the payload
  count, not the FOV preset or the Walker geometry.
- **`md:` and up is unchanged.** Every rule here is a compact-viewport rule.

## 4. Data priority (what earns permanent screen space)

| Rank | Datum | Where, compact | Why |
|---|---|---|---|
| 1 | Verdict vs requirement (Meets / Misses / Never in view) | Result strip, always | The decision |
| 2 | Worst-case gap (worst cell in AREA) | Result strip, always | The contractual number |
| 3 | The requirement it is judged against | Result strip label, always | A verdict without its threshold is not a verdict |
| 4 | Mean gap (mean cell in AREA) | Result strip, always | Stops the headline reading as cherry-picked (ADR-001 §3) |
| 5 | Access timeline + playhead | Ribbon, always | The temporal evidence behind 1–2 |
| 6 | Payload count | Header bar stepper, always | The variable being explored |
| 7 | Constellation / target identity | Header bar line, always | Which scenario the numbers belong to |
| 8 | Passes/day, in-view %, vs-1-payload, curve, details, export | Analysis sheet, on demand | Supporting evidence |
| 9 | Walker geometry, FOV preset, area definition, comparison points | Setup disclosure, on demand | Read-once configuration |
| 10 | Scene layer toggles, presenter mode, scenarios, reset | Stage menu, on demand | View plumbing |

## 5. The compact layout

- **Header bar (~44 px)** — one line: `12 × 48 STAR · London`, altitude /
  inclination / swath underneath, and a `− 12 +` payload stepper. Tapping the
  line expands the full triad in place (`#revisit-mobile-setup`).
- **Stage** — everything else. One 44 px `☰` button top-left opens the former
  toolbar as a vertical menu (`#revisit-stage-controls`). Warnings render
  `pointer-events-none` below `md` so they never eat a rotate gesture.
- **Result strip (~64 px)** — verdict pill, `worst case vs <requirement>`, the
  gap in headline type, the mean beside it. It is also the sheet handle.
- **Analysis sheet** — `closed` (default) / `half` (48 dvh) / `full` (82 dvh),
  with a grab handle and a dismiss control. Contains the existing summary /
  curve / details tabs unchanged.
- **Ribbon (~127 px)** — play/pause, speed, timestamp, lanes, hour axis on one
  row. Only the `−1 h` / `+1 h` steppers are `sm`-and-up: they duplicate
  tap-to-seek on the timeline directly below them, and they were what forced the
  control row to wrap into two.

Result at 375 × 812: header 75 px, globe **530 px of directly hittable canvas**
(7× the previous 73 px), strip 65 px, ribbon 127 px.

## 6. Status

Implemented 2026-08-15 in `RevisitHeader.tsx`, `RevisitApp.tsx`,
`CoverageRibbon.tsx` and the new `MobileResultStrip.tsx`.

Unit coverage: `src/features/revisit/__tests__/RevisitMobileUi.test.tsx`
(collapsed-by-default triad, stepper wiring, strip verdicts).

E2E: the compact layout means specs written against the desktop layout must
open a surface before asserting on it. `e2e/revisitCompact.ts` provides
`waitForRevisitReady` / `openRevisitSetup` / `openRevisitAnalysis` /
`openRevisitStageControls` / `openRevisitSurfaces`, no-ops at `md` and up, and
the REVISIT specs call `openRevisitSurfaces` in `beforeEach`.

## 7. Deliberately not done

- No swipe-to-dismiss gesture on the sheet — tap targets only, so the gesture
  never competes with the globe's own drag handling.
- The sheet does not auto-open on load: that would restore the original
  complaint on every entry, and the strip already carries the headline.
- The setup disclosure and the analysis sheet are not mutually exclusive. Opening
  both at once is legal and leaves the sheet ~190 px tall: it is capped at
  `min(<snap>, 100%)` of the stage row, so it can never slide up behind the
  header (which is `z-[100]` and would otherwise swallow taps on the sheet's
  tab row — this was a real defect caught by the mobile E2E gate).
- Requirement selection stays inside the sheet (one tap away). Putting a second
  `<select>` on the strip would push the headline gap off the line.
