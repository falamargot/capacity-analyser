# REVISIT Mode — UX specification

**Date:** 2026-08-06
**Status:** Design specification — before implementation
**Reads with:** `CAPACITY_ANALYZER_UX_CHARTER.md` (the governing charter), `REVISIT_MODE_IMAGE_PROMPT.md` (visual reference), `../REVISIT_SIMULATOR_DESIGN.md` (what is computed)

---

## 1. Mode intent

The charter defines COMM as *storytelling and immediate understanding* and ENG as *engineering analysis and transparency*.

**REVISIT is a third intent: quantified justification.**

It exists to produce one defensible sentence in front of a non-technical decision maker:

> *"You need 6 hosted payloads to see London every 2 hours."*

It borrows COMM's readability and ENG's traceability, and it is subordinate to neither. Like COMM it must be understood in under ten seconds; like ENG it must show its reasoning and its provenance on demand.

**Audience:** senior executives, customers, partners — with an engineer in the room who will check the numbers.

---

## 2. Governing principle

> **The number is the product. The globe is its evidence.**

Every layout decision below follows from that. If a change makes the globe more impressive at the cost of making the headline number less prominent, it is wrong.

---

## 3. Visual identity — amber

The charter gives GEO a *stable, premium, blue/cyan* identity and LEO a *dynamic, modern, magenta/violet* one. REVISIT takes **amber/orange**.

| Role | Token |
|---|---|
| Accent, borders, active toolbar | `#EF9F27` |
| Bright values, payload satellites | `#FAC775` |
| Alert (worst-case gap, out of view) | `#E24B4A` / `#F09595` |
| Pass / meets target | `#C0DD97` |
| Reference and calibration notes | `#7DD3FC` |

**Why amber.** The payload is an infrared sensor — amber is the thermal colour. It collides with neither existing mode identity, and it signals at a glance that the user has left the telecom world for Earth observation.

**Known adjacency.** Amber is already used in the `GEO GROUND SITES` legend for *Monitoring* markers. No real collision — those markers do not exist in REVISIT — but it is the first place a conflict would surface if the two ever meet.

---

## 4. Information homes

The charter assigns each information item one primary home. REVISIT keeps all four slots and changes their contents.

| Home | ENG / COMM | REVISIT |
|---|---|---|
| **Header** | Site A ↔ Site B scenario | Constellation → Payloads → Target |
| **Globe** | Sites, route, beams, coverage | Host fleet, payload satellites, swaths, accumulated coverage, target |
| **Ribbon** | Journey progression through the service path | **Progression through time** — the 24 h coverage timeline |
| **Sidebar** | Analysis, bottleneck, provenance | Why this revisit, value curve, model provenance |

### 4.1 Header — the new triad

The charter's second principle is *"Site A ↔ Site B is the story"*. REVISIT has no route. Its triad is:

```
CONSTELLATION  →  HOSTED PAYLOADS  →  TARGET
```

Same visual syntax as the Site A / Site B blocks — separated panels, tiny uppercase label above a larger value — with the middle panel amber-bordered and amber-tinted because it is the one the user actually manipulates.

**The payload slider lives here, not in the sidebar.** It is scenario configuration, and the charter is explicit about who owns that. Keeping it in the header also prevents it from growing into a settings panel that competes with the globe.

The slider walks a **pre-validated ladder** of `(x, y)` sub-constellation configurations sorted by payload count — never raw `x`, `y`, `z` entry. Where two configurations yield the same payload count, the better-performing one is selected automatically and the comparison surfaced: *"8 payloads over 8 planes beats 8 over 2 planes."*

### 4.2 Top-right KPI panel — the headline

Reuses the exact treatment of the `GEO [BLOCKED] · LAT / DL / UL` block in ENG: a verdict badge, a row of metrics, and one grey line of qualification underneath.

- Verdict badge, in the grammar ENG already uses for `Service blocked — uplink link budget failed`:
  `MEETS 2 H TARGET` / `MISSES 2 H TARGET — 4 MORE PAYLOADS NEEDED`
- `WORST CASE` — **roughly twice the size of the others and the only one in bright amber**
- `MEAN`, `PASSES PER DAY`, `IN VIEW` — secondary, equal weight
- Qualifier line: `72 h window · max-gap definition`

Both max and mean are always shown, labelled. Showing mean alone invites the accusation of cherry-picking; showing max alone hides the typical experience. See ADR-001 §3.

### 4.3 Globe stage

Framing is **ENG's, not COMM's**: a full globe with slow automatic rotation. COMM's close limb view is beautiful and makes a constellation illegible — the planes crossing near the poles are the point. Reserve close-ups for an optional zoom to the target at the moment of a pass.

| Element | Treatment |
|---|---|
| Host fleet | Dim grey-blue points, no labels. **Must be numerous and clearly visible** — the whole story is that our payloads are a small highlighted subset of a much larger fleet |
| Payload satellites | Bright amber, larger, optional `P03_S07` labels |
| Orbits | One polyline per **plane**, not per satellite — `P` lines instead of `P·S` |
| Swaths | Translucent amber, **highlighted sub-constellation only** |
| Accumulated coverage | Soft amber paint following ground tracks, building over time |
| Target | Amber crosshair reticle with two concentric rings, drawn above everything, label never crossed by an arc |

Top-left card: timestamp, payload count and selected planes in amber, target status in red or green (`London — out of view, 44 min`).

Right toolbar replaces `REG / 5G / CONN / LOAD` and `AIR / SEA / ISS` with `ORBITS / SWATH / PAINT / NAMES` — the four display options from the functional spec, in a slot already designed for exactly this.

Bottom-left legend card: payload satellite, host fleet, instrument swath.

### 4.4 Ribbon — from spatial journey to temporal journey

This is the most important transposition in the whole mode.

In ENG and COMM the ribbon narrates the *service path*. REVISIT has no spatial journey; its progression is **time**. Same slot, same "progression" semantics, different axis.

- A 24 h bar: filled amber where the target is in view, empty during gaps
- **The longest gap outlined in red with a translucent fill**, its duration and clock times labelled
- A thin white playhead bound to `SimulationClock`, click to seek
- Hour axis `00:00 → 24:00`

This element makes revisit tangible without a word of explanation, and it is the single most valuable thing on screen after the headline number.

Transport controls beneath: play with speed multiplier, and two seek buttons that matter more than they look — **`next pass ›` and `longest gap ›`**. In a live demo nobody wants to hunt a timeline for the interesting moment, and both are free because the engine has already computed the intervals.

The COMM `COMMERCIAL EVIDENCE` strip of four chevron-linked cards is **replaced, not adapted**: its progression is discrete (service stages), REVISIT's is continuous (time).

### 4.5 Sidebar — analysis

**`WHY THIS REVISIT`** transposes ENG's `WHY THIS RESULT` checklist exactly — same component, same row grammar, same expand chevrons, same *decisive factor* emphasis:

| Row | Example value |
|---|---|
| `GEOMETRY` | `lat < incl ✓` |
| `SWATH` | `704 km` |
| `PLANE SPREAD` | `limiting ›` — emphasised amber |
| `PHASING` | `f = 1 ✓` |
| `ACCESS WINDOWS` | `57 / 72 h` |

The row marked *limiting* answers "what is holding me back" in a vocabulary the audience already reads elsewhere in the product. It is the direct analogue of ENG's `Decisive factor`.

**`PAYLOADS VS REVISIT`** — the value curve. Amber curve falling as payload count rises, a dashed line at the customer requirement, a marker where the curve crosses it, and the current position. Hand-rolled SVG; no charting dependency (ADR-001 and proposal §3.5).

**`MODEL PROVENANCE`** — the credibility slot, and the easiest to underestimate. ENG uses it for the CelesTrak feed and publication date. REVISIT has no TLE, so it carries the assumptions instead:

```
Kepler + J2 secular · no drag
Spherical earth R = 6371 km
Fit vs OneWeb TLE · 12 km RMS
```

That last line is what converts the mode from a simulation into evidence. See proposal §3.4.

---

## 5. Progressive disclosure

Engineering parameters — `P`, `S`, `i`, `h`, `f`, `fudge`, `x`, `y`, `z` — live in an **Advanced drawer, closed by default**, reachable from the bottom-right of the ribbon. Reuse `CollapsibleSection.tsx`.

The drawer must enforce validity rather than validate after the fact: `x` and `y` dropdowns populated with the actual divisors of `P` and `S`, never free text. And it must warn on the degenerate case `z ≡ 0 (mod y)`, where the shift maps the selection onto itself and the control appears to do nothing. A slider that visibly does nothing mid-demo costs more than the feature is worth.

---

## 6. The entry moment

The charter demands understanding in under ten seconds. Clicking REVISIT must **never** open an empty configuration form.

It opens on a preset scenario, already computed, already animating, with a number on screen. Configuration is discovered afterwards, not before.

---

## 7. Motion

Per `ENG_Motion_UX_North_Star.md`: *"every action produces a visible, ordered, and intelligible consequence."*

When the payload slider moves from 4 to 8, the interface must not simply replace `3 h 10` with `1 h 12`. It should reveal that:

1. the payload selection changed — new satellites **appear in a staggered cascade**, not as a block;
2. their swaths begin sweeping;
3. the coverage timeline re-fills, visibly closing gaps;
4. the longest-gap block shrinks and moves;
5. the headline number counts down to its new value;
6. the marker on the value curve slides to its new position.

Motion is part of the demonstration, not decoration.

---

## 8. What must not appear

The mode must *feel* emptied of telecom, or it is just another tab.

No Site A / Site B fields. No weather selectors. No terminal or VSAT configuration. No GEO/LEO service topology strips. No link budget, no dB, no Mbps, no MODCOD. No ground stations, gateways or teleports. No coverage contours. No aircraft, vessel or ISS layers. No cyan or magenta accents.

---

## 9. Open UX questions

| Question | Note |
|---|---|
| Should REVISIT be a visual peer of ENG/COMM in the switcher, or set slightly apart? | It shares no scenario data with the other two — only the clock and the theme. A separator or distinct label would prevent the assumption that an ENG scenario carries over. |
| Mode-switch transition | Switching unmounts `<App/>` and rebuilds the Cesium viewer. Needs a deliberate transition rather than a blank flash. |
| Target selection affordance | City picker, map click, or both. |
| Where the latitude-sensitivity chart lives | Second chart in the sidebar, or inside the Advanced drawer. |
