# REVISIT mode — image-generation prompt

Prompt to give an image model (ChatGPT / GPT image), **with the ENG and COMM screenshots attached** as design-system reference.

---

## Prompt

You are generating a **realistic UI screenshot** of a new mode for the desktop application shown in the two attached screenshots (a satellite capacity analysis tool called Capacity Analyzer).

The two attached images show the existing **ENG** and **COMM** modes. **Reuse their design system exactly**: same dark aerospace theme, same panel geometry, same border weights, same rounded corners, same monospace/technical typography, same label styling (tiny uppercase letter-spaced labels above larger values), same translucent card treatment over the globe.

Now render a **third mode called REVISIT**, which analyses how often a satellite constellation can observe a point on Earth.

**Output format:** a single 16:10 landscape desktop screenshot, full-bleed, edge to edge. Photorealistic screen render — crisp, flat, high fidelity. Not an illustration, not concept art, not a device mockup on a desk. No browser chrome, no drop shadows outside panels, no glow, no lens flare, no bloom.

### Colour palette

- Page background: near-black `#080C11`
- Panel surfaces: `#0D141C`, translucent over the globe
- Borders: thin `#22394F`
- Primary text: `#E2E8F0` · secondary `#8FA3B8` · muted labels `#5B6B7D`
- **Accent colour of this mode: amber / orange** — `#EF9F27` for accents and borders, `#FAC775` for bright values. This replaces the cyan and magenta of the other two modes.
- Alert red `#E24B4A`, success green `#C0DD97`, reference cyan `#7DD3FC` used sparingly

### Layout — three horizontal bands

**BAND 1 — top header, about 17% of the height.** Same height and density as the header in the attached screenshots.

Left two-thirds: three panels in a row, separated by small `→` arrows, mirroring the Site A / Site B block geometry of the reference images.

1. Panel labelled `REFERENCE CONSTELLATION` — value `Walker star · 12 × 8 · 87.9° · 1200 km`, small sub-line `f = 1 · fudge 1.00`
2. Panel labelled `HOSTED PAYLOADS`, **amber-bordered and slightly amber-tinted** — a very large numeral `8`, a small caption `4 planes × 2 sats`, and beneath it a horizontal slider track filled amber to about 40% with a visible handle
3. Panel labelled `TARGET` — value `London · 51.5°N`, sub-line `IR payload · 30° off-nadir`

Right third: a segmented mode switcher pill reading `Eng | Comm | Revisit` with **Revisit selected and filled amber**; below it a smaller segmented control `ALL | PAYLOADS` — a **quiet grey** segmented control, not a filled amber button. To the right, a KPI panel styled exactly like the GEO/LEO status block in the attached ENG screenshot, containing the word `REVISIT`, a small green badge `MEETS 2 H TARGET`, and four metrics side by side. Each label is printed **exactly once**:

- `WORST CASE` → `1 h 12` — **roughly twice the size of the other three values, and the only one in bright amber**
- `MEAN` → `38 min`
- `PASSES PER DAY` → `19`
- `IN VIEW` → `6.4 %`

with a small grey line underneath: `72 h window · max-gap definition`

**BAND 2 — main stage, about 68% of the height.** Split roughly 72% globe / 28% right sidebar.

*Globe stage (left):* a photorealistic 3D Earth on a black starfield, viewed as a **full globe** (not a close-up limb view), centred on Europe and Africa, with a visible day/night terminator and city lights on the night side — matching the Earth rendering quality of the attached ENG screenshot.

Over it:
- Roughly 12 **dim grey-blue** satellite dots scattered across the globe — the host fleet. All satellites float clearly **above** the surface, visibly separated from the globe, never resting on it and never floating outside the disc.
- **Exactly 8** bright amber glowing satellite dots — the payload satellites, clearly larger and brighter. Not more than 8.
- Four thin amber orbital arcs plus two dimmer blue-grey arcs. **The orbits are near-polar (87.9° inclination): every arc runs mostly north–south and they converge and bunch tightly near the north and south poles.** They must not cross at mid-latitude like inclined orbits.
- Two or three translucent amber **elliptical footprint patches** on the ground beneath payload satellites
- A wide, soft, semi-transparent amber **painted ribbon** of accumulated coverage. **It runs north–south as vertical stripes following the ground tracks** — never as horizontal east–west bands.
- **The `LONDON` target is the most legible element on the globe**: a bright amber crosshair reticle with two concentric rings over the UK, drawn on top of everything else, with the label `LONDON` fully visible and never crossed by an orbital arc or a swath.
- Top-left translucent card: `2026-08-07 03:41:12 UTC`, then `● 8 payloads · planes 0/3/6/9` in amber, then `● London — out of view, 44 min` in red
- Right edge, a vertical stack of four small square toolbar buttons labelled `ORBITS`, `SWATH`, `PAINT`, `NAMES` — the first three active in amber, the last inactive grey
- Bottom-left translucent legend card with three colour-dot rows: amber `payload satellite`, grey `host fleet`, amber bar `instrument swath`

*Sidebar (right):* same width, padding and card rhythm as the sidebar in the attached ENG screenshot. Top to bottom:

1. A small amber section heading `● WHY THIS REVISIT`
2. A five-row list, each row a label on the left and a status on the right, separated by hairlines — exactly like the `WHY THIS RESULT` checklist in the ENG screenshot:
   - `GEOMETRY` → `lat < incl ✓` (green)
   - `SWATH` → `704 km`
   - `PLANE SPREAD` → `limiting ›` (amber, emphasised)
   - `PHASING` → `f = 1 ✓`
   - `ACCESS WINDOWS` → `57 / 72 h`
3. A card titled `PAYLOADS VS REVISIT` containing a small line chart: an amber curve falling steeply then flattening left to right, a dashed blue horizontal line labelled `requirement 2 h`, a blue dot where the curve crosses it labelled `6 payloads`, and an amber dot labelled `you are here` positioned at **8 payloads** on the x axis, consistent with the header. Y axis labels are `6h`, `4h`, `2h`, `0` — each printed once, horizontal text only, no rotated axis titles.
4. A card titled `MODEL PROVENANCE` with three small grey lines: `Kepler + J2 secular · no drag`, `Spherical earth R = 6371 km`, and in cyan `Fit vs OneWeb TLE · 12 km RMS`

**BAND 3 — bottom ribbon, about 13% of the height.** Full width, in the position occupied by the `COMMERCIAL EVIDENCE` strip of the attached COMM screenshot.

- Small header row: `COVERAGE TIMELINE · 24 H` on the left, `longest gap 1 h 12 · 03:40 → 04:52` on the right in red
- A horizontal bar chart spanning the full width: about twelve **solid amber blocks** of varying widths separated by dark gaps, and **one conspicuously wide gap outlined in red with a translucent red fill** — the worst-case gap. A thin white vertical playhead line crosses the bar at about 40% width.
- Below, a row of small pill buttons: `▶ ×60`, `next pass ›`, `longest gap ›` (red-outlined), and right-aligned `advanced · P S i h f fudge x y z ⌄`

### Must NOT appear

No RF or telecom content of any kind. Specifically: no Site A / Site B fields, no weather selectors, no terminal or VSAT dropdowns, no GEO/LEO service topology strips, no link budget, no dB or Mbps values, no ground station or gateway markers, no coverage contour lines, no aircraft or vessel or ISS icons, no cyan or magenta accents. This mode is Earth observation, not connectivity.

### Quality notes

Prioritise **layout fidelity, density and colour hierarchy** over perfect text legibility. Small labels may be slightly imperfect. The large numerals — `8`, `1 h 12` — and the mode switcher word `Revisit` must be sharp and readable. The interface should feel like a mission-control instrument: dense, calm, precise.

**Never print any label twice or overlap two text strings.** Every string listed above appears once, in one place.

---

## Known failure modes

Observed on the first generation. Re-check each one before accepting an image; if any fails, re-prompt rather than retouch.

| Failure | Why it matters |
|---|---|
| Orbits crossing at mid-latitude instead of converging at the poles | Contradicts the 87.9° inclination printed in the header — a technical audience catches it instantly |
| Coverage paint running east–west | Ground tracks of a near-polar constellation are north–south; the image would contradict its own parameters |
| More than 8 amber satellites | Contradicts the headline payload count, which is the whole point of the feature |
| `1 h 12` rendered at the same weight as the other three KPIs | The worst-case revisit is *the* number; if it does not dominate, the screen has no headline |
| Duplicated or overlapping strings (`WORST CASE CASE`, doubled `longest gap`, repeated axis labels) | Reads as a broken render and undermines the whole mockup |
| `LONDON` label crossed by an arc, or no reticle | The target carries the question being answered; it must be the most legible object on the globe |
| Satellites resting on the surface or floating outside the disc | Destroys the sense of orbital altitude |
