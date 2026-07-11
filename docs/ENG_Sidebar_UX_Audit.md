# Engineering Sidebar UX, Information Architecture and Interaction Audit

**Scope:** Capacity Analyzer Engineering mode, GEO and LEO, desktop and mobile/tablet  
**Date:** 2026-07-11  
**Status:** First-pass audit; no computation or application code changes proposed or made

## Executive summary

The Engineering sidebar is not primarily suffering from a styling problem. It is suffering from an ownership problem: scenario configuration, route selection, service state, RF closure, delivery performance, diagnostics, and export actions are distributed across several UI layers that repeat the same concepts without a single, explicit information hierarchy.

The current implementation already contains good building blocks:

- a global Scenario Builder for endpoints, terminals, and weather;
- compact GEO and LEO topology selectors;
- an above-the-fold `AnswerBlock` intended to answer the first engineering questions quickly;
- layer-oriented headings for Access, Space, Ground, and End-to-End analysis;
- a separate detailed Link Budget workspace that is materially better suited to dense engineering content than a narrow drawer;
- explicit service-gate and confidence models;
- responsive mobile summary and detail surfaces.

The problem is that these layers have accumulated rather than replaced or clarified one another. On a typical LEO result, the same throughput, latency, bottleneck, service state, and satellite are presented in the header route cards, the Answer Block, the service status card, the Link Budget summary, Estimated Performance, the footer, and the detailed workspace. GEO has a similar pattern, with additional satellite and beam selection controls embedded in the results flow. The user must reconcile several cards rather than follow one engineering narrative.

The most important findings are:

1. **The state vocabulary is not coherent enough for engineering decisions.** “Available,” “Limited,” “Connected,” “Blocked,” “No signal,” “No coverage,” and “No budget” describe different layers of the model, but the interface frequently presents them as if they were competing overall verdicts. A LEO satellite can be shown as “Connected” while service is blocked and no RF budget exists. GEO can present “No budget,” “No signal,” and “No coverage” for related but not necessarily identical conditions.

2. **Configuration and results are separated inconsistently.** Endpoint, terminal, and weather controls are in the desktop header, topology controls are in the sidebar, GEO satellite/beam controls are inside the Space Segment results, and advanced terminal details appear as read-only cards in Access Layer. This makes it difficult to know what is an input, what was auto-selected, and what is an output.

3. **The sidebar has too many summary levels.** The Answer Block is a sound pattern, but it is followed by another large service status card and another Link Budget summary before the detailed analysis. These do not form a clear progressive disclosure sequence.

4. **Responsive behavior changes capability, not only layout.** Below the desktop breakpoint, the full Scenario Builder disappears. The phone/mobile ENG surface exposes scope, mode, target selection, compact KPIs, and a detailed sheet, but terminal and weather configuration are no longer clearly available. The detailed Access cards are explicitly “advanced details only,” so the mobile user can inspect assumptions but not reliably change them. This is a critical parity gap for an engineering tool.

5. **Interactive affordances are inconsistent.** GEO satellite and beam rows can look like static engineering facts; when only one option exists they actually become static or disabled, with almost the same visual language. Topology selectors, header route cards, service cards, underlined satellite names, chevrons, native `<details>`, icon-only buttons, and tooltip “?” controls each use different interaction conventions.

6. **Scrolling is a symptom of content duplication and weak prioritization.** The desktop sidebar is one long scroll container. Mobile introduces a full-height detailed sheet with another scrolling content region. The detailed Link Budget workspace has its own vertical scroll, a separate summary rail, horizontal pipeline scrolling, and a still-visible right summary sidebar. These surfaces are individually reasonable but collectively create multiple places to look and multiple scroll contexts.

The recommended target is a shared GEO/LEO Engineering Sidebar Shell with four clear responsibilities:

1. **Context and configuration:** technology, topology, direction, endpoints, terminal/weather summary, and selection policy;
2. **Decision:** one overall service verdict, primary throughput/latency, confidence, and the decisive limiting factor;
3. **Explanation:** a compact ordered gate/constraint chain that explains why the verdict was reached;
4. **Investigation:** collapsible layer details and a single entry into the full Link Budget workspace.

The detailed workspace should remain. It is the correct home for RF closure chains, margin stacks, and per-segment investigation. The sidebar should stop attempting to be both the summary and the full engineering report.

No changes to the computation model are required to reach this target. The work is principally a presentation/view-model consolidation, state vocabulary contract, responsive capability parity effort, and interaction redesign.

## Audit scope and method

This review covered:

- GEO `STAR_FORWARD`, `STAR_RETURN`, `MESH`, and `POINT_TO_POINT`;
- LEO `SINGLE_SITE` and `SITE_TO_SITE`, including active direction;
- available, limited/marginal/degraded, blocked, incomplete, no-coverage, and no-budget presentations;
- the desktop header, route status cards, right Engineering sidebar, detailed Link Budget workspace, mobile compact summary, and mobile detailed sheet;
- source-level inspection of `App.tsx`, `CapacityDetails`, the GEO/LEO connectivity sections, shared sidebar components, terminal and coverage controls, status cards, the workspace frame, and related tests;
- live visual inspection at desktop and mobile breakpoints using the current checkout.

This is a UX and architecture audit. It does not validate RF formulas, route selection correctness, or data quality except where the presentation of those results affects user comprehension.

## Current sidebar architecture

### 1. Application-level Engineering shell

`App.tsx` owns the overall Engineering experience:

- the desktop Scenario Builder;
- ENG/COMM mode;
- ALL/LEO/GEO scope;
- header-level GEO and LEO route status cards;
- the globe and its overlays;
- the right desktop sidebar;
- the mobile compact summary and detailed sheet;
- the detailed Engineering workspace open/closed state;
- the replacement sidebar summary shown while the detailed workspace is open.

This means the “sidebar” is not one component. It is a coordinated set of surfaces with shared state.

### 2. Global Scenario Builder

The desktop `HeaderScenarioBuilder` owns:

- Site A and Site B location selection;
- weather and real-weather toggle per site;
- GEO terminal use case and RF profile per site;
- LEO terminal use case and terminal model per site;
- endpoint swap;
- optional route status cards with GEO/LEO latency, DL, UL, state, recommendation, and limiting text.

This is already the logical configuration layer, but it is visually compact and competes with route results in the same header. It also exposes both GEO and LEO terminal configuration at once, even when the user is focused on only one technology.

### 3. CapacityDetails orchestration

`CapacityDetails` decides between:

- standby/empty state;
- selected-satellite details;
- selected-location Engineering analysis;
- LEO and/or GEO sections;
- technology tabs in ALL mode on surfaces where `externalHeader` is false;
- Estimated Performance;
- PDF export;
- footer capacity and coverage counts.

It also computes and assembles several display/export summaries. This makes it both a domain orchestration component and a page information-architecture component.

### 4. GEO connectivity section

The current GEO order is:

1. topology selector (`STAR_FORWARD`, `STAR_RETURN`, `MESH`, `POINT_TO_POINT`);
2. Engineering Answer Block;
3. Access Layer heading;
4. one or two advanced terminal/gateway cards;
5. Space Segment heading;
6. satellite and uplink/downlink beam selection, when candidates exist;
7. GEO service/status card;
8. End-to-End Analysis heading;
9. Link Budget summary and detailed-workspace launcher;
10. Radio Path, collapsed;
11. latency breakdown, collapsed;
12. Estimated Performance, depending on placement logic;
13. export and footer content provided by `CapacityDetails`.

For MESH and Point-to-Point, direction also affects selected coverages, terminal roles, throughput, latency, and workspace content.

### 5. LEO connectivity section

The current LEO order is:

1. `SINGLE_SITE` / `SITE_TO_SITE` topology selector;
2. Engineering Answer Block;
3. Access Layer heading;
4. one or two advanced terminal cards;
5. Space Segment heading;
6. connected-satellite or site-to-site status banner;
7. detailed service-gate status card;
8. Link Budget summary and detailed-workspace launcher;
9. Ground Segment heading;
10. Radio Path, collapsed;
11. End-to-End Analysis heading;
12. latency breakdown, collapsed;
13. Site-to-Site Estimated Performance or single-site Pass Beam Timeline;
14. Estimated Performance, depending on placement logic;
15. export and footer content provided by `CapacityDetails`.

LEO separates service eligibility, RF/network throughput, SNP/backbone routing, pass evolution, and final performance, but it does not give those layers a stable, explicit state hierarchy.

### 6. Detailed Link Budget workspace

Both technologies share `EngineeringAnalysisWorkspace` and `LinkBudgetWorkspaceFrame`.

The workspace contains:

- title and collapse/full-height controls;
- a left “Investigation KPIs” rail;
- a main result card;
- a “Why?” explanation;
- Level 3 Engineering closure pipeline;
- Level 4 detailed investigation sections;
- a separate right sidebar summary supplied by `App.tsx` with route, radio path, assumptions/sources, and quick actions.

The workspace is a strong architectural direction, but the main content, left rail, and right summary repeat information from the normal sidebar and from each other.

### 7. Responsive architecture

The responsive behavior is a mode switch rather than a simple reflow:

- desktop is used at widths of 1100 px and above;
- below 1100 px, the globe becomes the main surface with a compact analysis card;
- below 920 px, the desktop/mobile header is removed and a floating phone header is used;
- the compact card can show summary or KPIs and opens a full-height detailed analysis sheet;
- the full detailed sheet renders `CapacityDetails` again inside its own scrolling body;
- the detailed Link Budget workspace is still a fixed overlay and becomes full-width below 1100 px.

The layout adapts, but configuration ownership and scroll ownership are not fully re-established for the mobile architecture.

### 8. Component responsibility review

| Component/surface | Why it exists | Current issue | Recommended role |
|---|---|---|---|
| Header Scenario Builder | Define endpoints and assumptions | Shows both GEO and LEO controls simultaneously; absent from compact mobile flow | Canonical scenario configuration surface, with mobile equivalent |
| Header route cards | Compare GEO/LEO quickly and switch focus | Duplicate sidebar verdict/KPIs; look partly like static status cards | Compact technology comparison and focus switch only |
| GEO/LEO topology selector | Select route architecture | Different components, semantics, labels, and accessibility patterns | Shared topology/direction control in a common Context/Configure block |
| Answer Block | Provide 15-second engineering answer | Followed by multiple competing summaries | Canonical sidebar verdict and KPI block |
| Advanced RF Details | Expose selected terminal assumptions | Looks like configuration but is usually read-only; title overstates priority | Compact assumption summary with explicit “Configured in Scenario” and workspace drill-down |
| GEO CoverageSelector | Select satellite and beams | Interactive and static states look similar; nested in result narrative | Explicit Path Selection control, clearly labeled Manual/Automatic |
| GEO/LEO status cards | Explain service gates | Large, visually dominant, repeats verdict and metrics | Compact ordered gate matrix under “Why this result” |
| Link Budget summary | Show RF result and launch detail | Repeats Answer Block and status | One concise investigation launcher with margin/closure cue |
| Radio Path | Show resolved hops | Correctly collapsible but placed late and repeated in workspace/right summary | Compact path summary near context; detailed hops under investigation |
| Latency breakdown | Explain latency | Valuable but repeated by headline and workspace | Collapsed investigation detail; retain summary line |
| Estimated Performance | Present final values | Duplicates Answer Block and Link Budget, can appear contradictory in blocked states | Remove as separate repeated summary or turn into technology-specific supporting evidence |
| Pass Beam Timeline | Show temporal LEO behavior | Long, low-frequency detail in primary flow | Collapsed LEO investigation module or workspace section |
| Export PDF | Export analysis | High vertical cost and low workflow priority | Persistent utility/action area, not analysis content |
| Footer capacity/count | Provide global context | Ambiguous relation to active route and terminal | Relocate to secondary evidence or remove from primary sidebar |
| Detailed workspace | Deep RF investigation | Three simultaneous summary zones and multiple scroll directions | Canonical deep-analysis surface with one summary and one investigation flow |

## UX findings

### UX-1 — The sidebar does not have a single authoritative answer

The user sees several answers to “Does this path work?”:

- header route status: Available / No Signal / Degraded / Blocked;
- Answer Block: Healthy / Limited / Blocked / No Budget;
- service card: Service Available / Service Blocked;
- connected-satellite banner: Connected;
- Link Budget: Healthy / Marginal / Limited / No Budget;
- Estimated Performance: sometimes populated even when the service verdict is blocked;
- workspace: Available / Marginal / Blocked / No Budget.

These can all be internally defensible because they refer to different layers. The UI does not state those layers clearly enough. The result feels contradictory even when the computation is not.

**Impact:** engineers spend time reconciling labels instead of diagnosing the route. Less experienced users may choose the wrong value as the service verdict.

### UX-2 — Important content is visible, but importance is not stable

The Answer Block is visually prominent and appropriately early. The next large service status card often has equal or greater visual weight. The Link Budget summary then adds another strong card. Layer headings are visually subtle, while lower-priority panels use saturated borders, gradients, pills, and tile grids.

The visual hierarchy therefore reflects component design history rather than engineering decision priority.

### UX-3 — Vertical scrolling is created by repeated summaries, not just detailed data

The long scroll contains many compact panels, but the dominant cost is repetition:

- throughput and latency are repeated several times;
- service and RF state are repeated in badges and cards;
- satellite identity is repeated in banners, Link Budget, Radio Path, timeline, and footer/workspace;
- terminal and weather assumptions exist in the header, Access cards, workspace, and right summary;
- route information exists on the globe, in the header, Radio Path, workspace, and right summary.

Collapsing more sections would hide the symptom. A better solution is to assign one canonical location to each level of information.

### UX-4 — The default flow is component-oriented rather than task-oriented

The current sequence follows modeled layers, which is useful during investigation, but the common workflow is:

1. define a scenario;
2. choose or confirm a topology;
3. determine whether service is usable;
4. identify the limiting gate or segment;
5. change an assumption or selection;
6. inspect the detailed budget only if necessary;
7. export or compare.

The sidebar instead alternates between controls, summaries, layer labels, status explanations, and investigation entry points. The user must build the workflow mentally.

### UX-5 — The empty state is clear, but the transition into analysis is abrupt

The standby state explains Origin, Path, and Output well. After selecting a point, the sidebar becomes a dense expert interface with no intermediate orientation. In ALL mode the user also needs to understand which technology is focused and whether the header card or sidebar tab controls that focus.

The interface would benefit from a persistent context strip that survives all states and makes the transition explicit.

### UX-6 — Blocked and incomplete states still carry too much normal-result chrome

When no path or no budget exists, the interface still renders the full sequence of Access, Space, End-to-End, Link Budget, Radio Path, Latency, Estimated Performance, Export, and footer. Many values are `--`, while other diagnostic or fallback values may still be populated.

A blocked state should prioritize:

- the exact blocking layer;
- the evidence that is still valid;
- the next action the user can take;
- a clear boundary between diagnostic-only values and deliverable performance.

It should not look like an available result with empty numbers.

### UX-7 — “Limited” is not self-explanatory

LEO frequently uses Limited for beam sharing or another delivery constraint while Service Available remains true. GEO uses Marginal for link margin. The difference is useful, but the UI does not define whether “Limited” means degraded service, constrained throughput, low RF margin, or a non-blocking model bottleneck.

The user needs a composed statement such as: **Service available — throughput constrained by beam sharing**, not two independent status pills.

### UX-8 — Low-priority utilities remain in the analytical scroll

Export PDF and nominal capacity/covered-satellite counts sit after the engineering analysis. They lengthen the scroll and make the end of the analysis ambiguous. Export is an action; nominal constellation capacity is context. Neither belongs in the primary evidence sequence.

### UX-9 — The detailed workspace is powerful but not fully integrated into the mental model

The normal sidebar uses Access/Space/Ground/End-to-End layers. The workspace introduces Investigation KPIs, Why, Level 3, and Level 4. This is a second hierarchy. It is technically coherent but not explained as a deeper level of the same flow.

The workspace should feel like zooming into the selected bottleneck, not opening a parallel report.

## Interaction findings

### INT-1 — Controls and facts share the same visual language

Examples:

- a GEO satellite row is a combobox only when multiple satellites are available; otherwise it becomes a static row;
- a beam row can be interactive, disabled because only one option exists, or empty, with similar styling;
- a serving LEO satellite is shown in a green banner that looks like a status result, while satellite names elsewhere are underlined buttons;
- header route status cards are selectable, while service status cards with similar visual weight are not;
- Advanced RF Details is expandable but its collapsed summary resembles a static fact card.

Every interactive element should answer “what will happen if I click this?” before hover.

### INT-2 — GEO selection lacks explicit mode and consequence

Selecting a satellite may update both uplink and downlink coverage. Selecting a beam changes the RF result. In MESH/P2P, the active direction changes which endpoint’s candidate pool is used and which side is selectable. The UI does not clearly state:

- whether selection is automatic or manually overridden;
- why the current item is selected;
- which endpoint and direction the control affects;
- which other selections will change as a consequence;
- how to return to automatic selection.

This is one of the highest-risk interaction areas because it changes the engineering scenario while looking like inspection.

### INT-3 — Topology controls are inconsistent between GEO and LEO

GEO groups four modes into STAR and Terminal-to-Terminal. LEO uses a flat two-option selector. Neither shared selector communicates a common model of topology, endpoint requirements, active direction, or incomplete-state requirements.

GEO and LEO should share:

- selected-state semantics;
- keyboard behavior;
- `aria-pressed`/radiogroup semantics;
- endpoint requirement messaging;
- a consistent location in the interface;
- a consistent direction control when the path is bidirectional.

### INT-4 — Collapsible headers have a misleading hit target

`CollapsibleSection` gives the whole header a hover treatment, but only the small chevron button toggles the section. The button has `aria-expanded` but no accessible label. Users reasonably expect the entire header to be clickable.

The native `<details>` investigation sections use a different and generally clearer interaction pattern.

### INT-5 — Custom comboboxes are not complete combobox interactions

The GEO satellite/beam controls are button-triggered popovers but do not expose complete `aria-expanded`, `aria-controls`, listbox/option semantics, Escape handling, or arrow-key selection behavior. Outside-click closing exists, but keyboard and screen-reader behavior is incomplete.

### INT-6 — Tooltip interaction is fragile

The “?” tooltip uses a focusable span with `role="button"`, but it does not expose `aria-expanded`, connect the trigger to the content, identify the popup role, or close on Escape. The same generic accessible name (“Section info”) is repeated. In dense cards, the tooltip can also compete with the main card interaction.

### INT-7 — Icon-only controls rely too heavily on tooltips

The Link Budget open/close icon, workspace expand/collapse icon, reset/clear icons, and some status icons are compact but not always self-evident. The workspace’s vertical fold/unfold metaphor is particularly difficult to predict without hover.

The primary transition from “summary” to “deep analysis” deserves a text label such as **Investigate Link Budget**.

### INT-8 — Direction is distributed across several controls and labels

Direction can be changed via GEO Forward/Return modes, active MESH/P2P tab, LEO Site-to-Site direction, and a direction indicator between sites. The current direction is repeated in pills, labels, latency text, and path order, but there is no single canonical direction control shared across the experience.

### INT-9 — Persisted expansion state lacks scenario context

Collapsible sections persist their state with global storage keys such as `geo-radio-path` and `leo-latency-breakdown`. The state survives technology/topology/scenario changes. Persistence can be useful, but an expansion preference from an available path can produce a noisy blocked-state experience later.

Persist either user preference by section class, or scenario investigation state by technology/topology, but do not mix the two implicitly.

### INT-10 — Workspace focus and modality are ambiguous

The workspace uses `role="dialog"` with `aria-modal="false"`, overlays the globe, retains the right sidebar, and leaves underlying controls conceptually active. On mobile, it can overlay the already modal detailed analysis sheet. Focus containment, return focus, and interaction precedence should be explicitly designed and tested.

## Information architecture findings

### IA-1 — Inputs, selections, derived state, and outputs are not explicitly classified

The current content can be classified into four types:

| Type | Examples | Current placement |
|---|---|---|
| Scenario inputs | endpoints, terminal type/model, RF profile, weather | desktop header; partially absent on mobile |
| Path choices | technology focus, topology, direction, GEO satellite/beam overrides | header and sidebar Space Segment |
| Derived engineering state | resolved satellite/SNP/gateway, RF margin, service gates, confidence, bottleneck | several sidebar cards and header |
| Outputs/evidence | delivered throughput, latency, availability, closure chain, detailed hops | sidebar, workspace, export |

The interface should make these categories visible. The user must never mistake an input for a result or an auto-selected result for a manually locked choice.

### IA-2 — Layer-based architecture and decision-based architecture are mixed

Access/Space/Ground/End-to-End is a good investigation taxonomy. It is not the best first-level summary taxonomy. The Answer Block and service status card are decision-oriented; the layer headings are system-oriented; Estimated Performance is output-oriented.

Recommended hierarchy:

1. **Context/Configure** — what is being evaluated;
2. **Decision** — can it work and at what delivered performance;
3. **Why** — ordered gates and limiting factor;
4. **Investigate by layer** — Access, Space, Ground, End-to-End;
5. **Detailed Link Budget workspace** — closure, margins, per-segment evidence.

### IA-3 — There is no canonical state composition

The interface needs a presentation-level state model that composes existing outputs without changing them. At minimum it should distinguish:

- **Scenario readiness:** endpoints and required configuration present;
- **Path resolution:** satellite/beam/gateway/SNP/backbone resolved;
- **RF closure:** healthy, marginal, blocked, or not computed;
- **Policy/service gates:** allowed, degraded, blocked, or unknown;
- **Delivery constraint:** unconstrained or limited by terminal, sharing, feeder, handover, protocol, etc.;
- **Confidence/evidence:** level and reason.

The overall verdict can then be a sentence assembled from these dimensions instead of a lossy single badge.

### IA-4 — “No budget” and “no coverage” are conflated

GEO’s neutral status path can show “No coverage” even when a route candidate exists but an RF budget is unavailable. The reason text partly distinguishes these cases, but the primary badge does not. LEO similarly distinguishes resolved satellite geometry from beam/RF availability only in secondary content.

These states need separate labels and next actions:

- **Scenario incomplete** — add Site B or required configuration;
- **No candidate coverage** — change location/technology/coverage choice;
- **Path unresolved** — gateway/SNP/backbone missing;
- **Budget unavailable** — insufficient RF evidence;
- **RF blocked** — computed negative closure;
- **Service blocked by policy** — RF may remain diagnostic-only.

### IA-5 — The same data is organized differently by technology

GEO puts the status card after coverage selection. LEO puts a connected banner and status card before Link Budget, then introduces Ground Segment. GEO has no explicit Ground Segment heading even though gateway data is present in Access, status, Radio Path, and detailed budget.

The underlying technologies differ, but the top-level questions should not.

### IA-6 — The right sidebar during detailed analysis is mostly a duplicate summary

When the Link Budget workspace opens, the normal sidebar is replaced with route summary, radio path, assumptions/sources, and quick actions. The workspace itself already includes result, quick references, why, closure, and investigation details. The globe also shows the route.

The right rail should either:

- become a compact persistent Context/Scenario rail with editable assumptions and selection; or
- be removed so the workspace can use the width.

Keeping a second read-only report is low value.

### IA-7 — “Level 3” and “Level 4” lack visible Level 1/2 continuity

The workspace labels closure and investigation as Level 3 and Level 4, but the normal sidebar does not label the Answer Block and explanation as Level 1 and Level 2. The numbering feels internal rather than user-oriented.

Either expose a complete progressive-depth model or remove the level numbers.

## GEO vs LEO consistency review

### What is already consistent

- both have an above-the-fold Answer Block;
- both use Access and Space layer headings;
- both have a Link Budget summary and shared detailed workspace;
- both collapse Radio Path and latency breakdown by default;
- both expose confidence and bottleneck;
- both support single-site and multi-site concepts;
- both use technology accent colors without changing the overall component language;
- both have tests covering topology rendering, blocked/no-budget states, Answer Block ordering, and detailed investigation.

### Important inconsistencies

| Concern | GEO | LEO | UX consequence |
|---|---|---|---|
| Topology model | Four modes in two groups | Two modes in one group | Different mental model and interaction semantics |
| Direction | Forward/Return is partly topology; MESH/P2P has active direction | Site-to-Site has active direction | Direction is not a shared first-class concept |
| Path selection | Satellite and beam can be manually selected | Serving satellite/beam is presented as resolved/automatic | Users cannot tell whether differences are technology rules or missing controls |
| Service state | RF-margin-led status plus gateway tile | Service-gate-led card with RF/load/SNP/regulatory | “Available” means different things |
| Ground segment | Gateway appears across Access/status/path | Explicit Ground Segment heading for SNP/backbone | Layer taxonomy diverges |
| Limited state | Marginal primarily means low RF margin | Limited can mean delivery bottleneck while service remains available | Status comparison is unreliable |
| Satellite presentation | Selector, Link Budget title, path link | Connected banner, Link Budget title, path link | GEO looks configurable; LEO looks factual, but neither states policy clearly |
| Timeline | None | Pass Beam Timeline in primary flow | LEO scroll is longer and temporal evidence is over-promoted |
| Site-to-site incomplete state | MESH/P2P depends on Point B/candidate B | Explicit “Place Site B” messages | Similar prerequisite states use different guidance |
| Detailed investigation | Dual-segment RF panels | Site A/B, backbone, terminal investigations | Appropriate domain variation, but shared shell could be stronger |

### Consistency principle

GEO and LEO should share the same **questions**, not identical internal details:

1. What scenario and direction are active?
2. Is an end-to-end service path usable?
3. What performance is deliverable?
4. What is limiting or blocking it?
5. How confident is the result?
6. Which layer should be investigated?

Technology-specific modules should begin only after these shared questions have been answered.

## Interactive controls review

### Control inventory and recommendation

| Control | Current location | Finding | Recommendation |
|---|---|---|---|
| Site A/B location | Scenario Builder; globe; mobile target flow | Multiple valid entry methods, but ownership differs by breakpoint | Keep multiple entry methods; always show one canonical editable scenario summary |
| Terminal use case/model | desktop Scenario Builder | Correctly an input; both technologies shown simultaneously; mobile parity gap | Filter by active technology or use explicit technology tabs; add mobile Configure sheet |
| Weather/Real toggle | desktop Scenario Builder | Compact but repeated in summaries; absent as an obvious mobile control | Canonical scenario input with visible source: Real/Manual and timestamp/status |
| GEO topology | top of GEO sidebar | Understandable but visually dense and separate from scenario | Put in shared Path Configuration block; use radiogroup semantics |
| LEO topology | top of LEO sidebar | Similar purpose, different pattern | Share structure and prerequisite messaging with GEO |
| Direction | topology buttons, tabs, site indicator | Distributed and sometimes implicit | One explicit direction control adjacent to topology/path summary |
| Technology focus | header route cards, ALL/GEO/LEO scope, mobile tabs | Scope, focus, and recommendation can be confused | Separate “visible technologies” from “analysis focus”; label both |
| GEO satellite | Space Segment combobox/static row | Weak discoverability and dynamic semantics | Label “Serving satellite selection”; show Auto/Manual and Change/Locked state |
| GEO beams | Space Segment comboboxes | Engineering facts inside trigger obscure editability | Use explicit field affordance, direction/endpoint label, and reset-to-auto |
| Satellite links | Radio Path only | Discoverable only after expansion; inconsistent with banners | Use a common “Inspect satellite” secondary action |
| Link Budget detail | icon-only button | High-value action has low discoverability | Text button: “Investigate Link Budget” with margin/status cue |
| Collapsible sections | tiny chevron | Header hover implies larger target | Make full header button; label expanded/collapsed state |
| Tooltips | repeated “?” | Too generic and incomplete popup semantics | Use accessible info buttons; reserve tooltips for definitions, not essential explanations |
| Export | bottom of long scroll | Hard to reach, not part of analysis hierarchy | Put in sticky actions or overflow menu |
| Close/reset detailed analysis | right summary only | Clear, but consumes a full card | Put Close in workspace header; Reset in scenario/action menu with confirmation rules if needed |

### Discoverability rules for the target design

1. Static facts use plain rows/cards with no hover transformation.
2. Editable values use labeled fields or buttons with a visible chevron/edit affordance.
3. Auto-selected values show an **Auto** badge and a reason.
4. Manual overrides show a **Manual override** badge and **Return to Auto** action.
5. Drill-down actions use verbs: **Inspect**, **Investigate**, **Show breakdown**.
6. Technology focus and topology selection use radio/tab semantics, not generic cards.
7. Disabled controls explain why and what prerequisite enables them.

## Engineering workflow review

### Workflow 1 — Quick feasibility check

**User goal:** select a location and determine whether GEO or LEO is usable.

Current friction:

- header cards and sidebar may use different verdict vocabulary;
- the selected technology is clear visually but “scope” versus “focus” is not explicit;
- the sidebar shows several status summaries before the user reaches a stable explanation;
- blocked states retain many empty downstream panels.

Target flow:

1. Select location.
2. See GEO and LEO comparison in header/mobile summary.
3. Focus one technology.
4. Read one composed verdict: “Service available — 8 Mbps DL, constrained by beam sharing, High confidence.”
5. See the first failing/limiting gate and one suggested next step.

### Workflow 2 — Configure an engineering scenario

**User goal:** change terminals, weather, topology, direction, or path selection and observe the effect.

Current friction:

- controls are split between header and sidebar;
- active-technology inputs are mixed with inactive-technology inputs;
- advanced terminal cards in Access are read-only summaries that resemble controls;
- GEO selection changes can update paired coverage choices without an explicit consequence preview;
- mobile does not expose the full configuration workflow.

Target flow:

1. Open a single Configure surface.
2. Edit endpoints, terminal, weather, topology, and direction in a predictable order.
3. For GEO, choose Auto or Manual path selection and see affected endpoint/direction.
4. Apply changes immediately, but show which input changed and which result is recomputing.
5. Retain a compact assumptions summary in the result view.

### Workflow 3 — Diagnose a limited path

**User goal:** understand why service is slower or marginal.

Current friction:

- Limited, Marginal, Service Available, and main bottleneck appear in separate cards;
- the detailed workspace opens as a complete report rather than at the relevant limiter;
- the same KPI is repeated before the actual closure chain.

Target flow:

1. Verdict states availability and constraint in one sentence.
2. Ordered constraint chain highlights the largest loss or thinnest margin.
3. “Investigate beam sharing” or “Inspect uplink margin” opens the workspace focused on that stage.
4. The workspace preserves context and exposes the full chain without another duplicate summary rail.

### Workflow 4 — Diagnose a blocked path

**User goal:** identify the blocker and decide what to change.

Current friction:

- “Connected” can coexist with “Service Blocked” and “No Budget” without explaining that connection means geometry resolution;
- diagnostic performance can be presented alongside blocked delivery;
- many empty panels remain visible;
- suggested remediation is not consistently surfaced.

Target flow:

1. Verdict: “Service blocked — no active RF beam at Site A.”
2. Valid evidence: satellite geometry resolved, SNP reachable, policy allowed.
3. Invalid/diagnostic-only evidence is quarantined and labeled.
4. Suggested actions: change technology, move endpoint, select another eligible GEO beam, complete Site B, or inspect assumptions, depending on the blocker.
5. Detailed investigation remains available but is not required to understand the blocker.

### Workflow 5 — Compare directions or endpoints

**User goal:** compare Forward/Return or A→B/B→A.

Current friction:

- direction changes through different controls depending on technology/topology;
- selected direction affects beam pools, KPIs, latency, path order, and workspace content;
- the current direction is repeated but not controlled consistently.

Target flow:

1. One direction control adjacent to the path summary.
2. All metrics, gate labels, and investigation modules update together.
3. The inactive direction can be compared without losing the current investigation state.
4. Direction-specific manual selections are clearly retained or reset.

### Workflow 6 — Deep RF investigation and export

**User goal:** validate the closure chain, inspect segment details, and export evidence.

Current friction:

- opening the workspace creates left, center, and right information zones with repeated summaries;
- horizontal pipeline scrolling is easy to miss;
- workspace depth labels do not align with sidebar hierarchy;
- export remains in the underlying normal analysis flow.

Target flow:

1. Open workspace from a specific limiter or Link Budget summary.
2. Keep one compact sticky context line.
3. Show result → why → closure → selected investigation.
4. Use tabs or an investigation navigator for Access/Space/Ground/E2E details.
5. Export from the workspace header, preserving the same scenario/result snapshot.

## Prioritized recommendations

### Critical

#### C1 — Define and enforce a composed Engineering state contract

Create a presentation contract, derived from existing computation outputs, that separates:

- readiness;
- path resolution;
- RF closure;
- service/policy gates;
- delivery constraint;
- evidence confidence.

Render one overall verdict sentence and retain the dimensions underneath. Do not collapse all states into one badge.

**Success criterion:** the interface never presents “Connected,” “Blocked,” and “No Budget” without explicitly naming the layer each describes.

#### C2 — Restore full configuration capability on mobile/tablet

Provide a mobile Configure surface for endpoints, active-technology terminal/model, weather source, topology, direction, and GEO path selection where applicable.

**Success criterion:** any scenario that can be created or modified on desktop can be created or modified below 1100 px, without relying on hidden desktop-only controls.

#### C3 — Separate diagnostic-only values from deliverable performance in blocked states

Keep all computed values, but label whether they are:

- deliverable service output;
- RF/geometry diagnostic;
- fallback estimate;
- unavailable.

Do not show diagnostic throughput in a normal “Estimated Performance” panel beneath a blocked verdict without a prominent diagnostic-only boundary.

#### C4 — Make scroll ownership and focus ownership explicit

Desktop sidebar, mobile detail sheet, and detailed workspace must each have one primary vertical scroll container. Define focus entry/return and overlay precedence for the workspace, especially when launched from the mobile detail sheet.

### High

#### H1 — Make the Answer Block the canonical sidebar summary

Merge the useful portions of the service status card into an ordered “Why this result” gate matrix. Remove repeated headline KPIs from Link Budget and Estimated Performance sections.

#### H2 — Establish a shared GEO/LEO sidebar shell

Share:

- context header;
- topology/direction control shell;
- verdict and KPI layout;
- state/gate explanation;
- assumptions summary;
- investigation launcher;
- action placement;
- empty/blocked/incomplete state templates.

Keep technology-specific investigation modules beneath this shell.

#### H3 — Create an explicit Path Configuration section

Move technology focus, topology, direction, and GEO satellite/beam selection into one clearly interactive block. Show Automatic versus Manual selection and the reset behavior.

Do not leave scenario-changing controls embedded among static Space Segment results.

#### H4 — Reduce the normal sidebar to progressive disclosure levels

Recommended normal state:

1. context/configuration summary;
2. verdict and primary KPIs;
3. why/gate chain;
4. compact assumptions and resolved path;
5. investigation launcher and collapsed details;
6. utility actions.

The full closure chain and extensive RF tables belong in the workspace.

#### H5 — Standardize interactive affordances and accessibility

- full-width collapsible header hit targets;
- radiogroup/tab semantics for topology and direction;
- proper combobox/listbox keyboard behavior;
- `aria-expanded`, labels, popup relationships, and Escape handling;
- visible verbs for drill-down actions;
- explicit disabled-state explanations;
- return focus when overlays close.

#### H6 — Design blocked and incomplete states as first-class layouts

Use dedicated templates for missing endpoint, no coverage, unresolved ground path, no budget, RF blocked, and policy blocked. Show the first actionable blocker and valid residual evidence; collapse irrelevant downstream modules.

### Medium

#### M1 — Reframe the detailed workspace around the selected limiter

Open the workspace at the relevant closure stage or investigation module. Replace the generic three-zone duplication with:

- one sticky context/result header;
- one closure/explanation canvas;
- one investigation navigator/content area.

#### M2 — Unify terminology and units

Create a UI vocabulary table for Available, Degraded, Limited, Marginal, Blocked, Unresolved, No Coverage, and No Budget. Standardize one-way vs RTT labels, terminal vs customer/site labels, gateway naming, and confidence formatting.

#### M3 — Relocate Export and global capacity context

Move Export to a sticky action bar or overflow menu. Move nominal constellation capacity and covered-satellite count to an Evidence/Context section or remove them from the active-route sidebar.

#### M4 — Make assumptions compact and editable from one place

The normal sidebar should show a one-line assumption summary with an Edit action. Detailed RF characteristics should remain in the workspace or an advanced Configure panel.

#### M5 — Contextualize persisted disclosure state

Revisit local-storage keys and reset rules so blocked/incomplete states do not inherit noisy expansions. Preserve stable user preferences only where they remain meaningful across scenarios.

#### M6 — Improve horizontal-data affordance

Closure pipelines and long site-to-site route strips need visible horizontal-overflow cues, keyboard scrolling, and responsive alternate layouts rather than relying on hidden overflow.

### Low

#### L1 — Reduce decorative competition

After the architecture is corrected, reduce the number of gradients, halos, badges, borders, and accent colors shown simultaneously. Reserve saturation for state and selection.

#### L2 — Replace generic “?” help with contextual definitions

Use short inline definitions for critical terms and accessible info popovers for optional detail. Avoid repeated generic tooltip triggers.

#### L3 — Improve truncation fallback

Avoid hiding engineering identifiers or bottlenecks behind truncation in primary cards. Permit controlled wrapping and offer copy/inspect actions for long satellite, beam, gateway, and route names.

#### L4 — Add subtle recomputation feedback

When a scenario input or path selection changes, show which result is updating and prevent stale-looking combinations during transient calculation states.

## Suggested target architecture

### Target information hierarchy

```text
Engineering Sidebar
├── 1. Context / Configure (sticky)
│   ├── Technology focus and scope
│   ├── Topology and direction
│   ├── Site A → Site B path summary
│   ├── Terminal/weather assumption summary
│   └── Edit scenario / Auto-Manual path selection
├── 2. Decision
│   ├── Overall composed verdict
│   ├── Primary throughput
│   ├── Primary latency
│   ├── Confidence
│   └── Decisive blocker or limiter
├── 3. Why this result
│   ├── Readiness
│   ├── Path resolution
│   ├── RF closure
│   ├── Policy/service gate
│   └── Delivery constraint
├── 4. Resolved path and assumptions
│   ├── Satellite / beam / gateway or SNP / backbone
│   └── Compact evidence/source indicators
├── 5. Investigate
│   ├── Link Budget launcher
│   ├── Access details
│   ├── Space details
│   ├── Ground details
│   ├── End-to-End / latency details
│   └── LEO temporal behavior when relevant
└── 6. Actions
    ├── Export
    ├── Compare
    └── Reset scenario
```

### Proposed shared presentation model

This is a UI adapter over current computations, not a new computation model.

```ts
interface EngineeringSidebarViewModel {
  context: {
    technology: 'GEO' | 'LEO';
    topology: string;
    direction?: string;
    endpoints: EndpointSummary[];
    assumptions: AssumptionSummary[];
    selectionMode?: 'automatic' | 'manual';
  };
  verdict: {
    service: 'available' | 'degraded' | 'blocked' | 'incomplete' | 'unknown';
    headline: string;
    throughput?: Metric;
    latency?: Metric;
    confidence?: ConfidenceSummary;
    decisiveFactor?: string;
  };
  gates: EngineeringGate[];
  path: ResolvedPathSummary;
  investigation: InvestigationEntry[];
  evidence: EvidenceSummary;
}
```

GEO and LEO adapters should map their existing state into this contract. The adapters must not recalculate RF or service results.

### Proposed state presentation

Example available but limited:

> **Service available — throughput constrained**  
> 8 Mbps downlink · 53 ms RTT · High confidence  
> Limiting factor: DL+UL beam sharing

Example blocked with valid geometry:

> **Service blocked — no active RF beam at Site A**  
> Satellite geometry resolved · SNP reachable · regulatory allowed  
> Throughput values below are diagnostic only

Example GEO no candidate coverage:

> **No GEO coverage candidate at this location**  
> No RF budget was attempted  
> Try another technology, location, or eligible coverage selection

Example incomplete site-to-site:

> **Scenario incomplete — Site B is required**  
> Site A assumptions are ready  
> Place Site B to calculate A→B and B→A

### Proposed component architecture

- `EngineeringSidebarShell`
- `EngineeringContextBar`
- `EngineeringConfigurePanel`
- `EngineeringVerdictCard`
- `EngineeringGateMatrix`
- `ResolvedPathSummary`
- `EngineeringAssumptionsSummary`
- `EngineeringInvestigationList`
- `EngineeringBlockedState`
- `EngineeringIncompleteState`
- `EngineeringActionBar`
- `GeoEngineeringSidebarAdapter`
- `LeoEngineeringSidebarAdapter`

Existing technology-specific detailed components such as `DualSegmentPanel`, LEO RF investigations, latency breakdowns, and the closure pipeline can remain and be routed through `EngineeringInvestigationList` and the workspace.

### Desktop layout

- Keep the Scenario Builder in the header, but show active-technology controls by default and allow comparison configuration explicitly.
- Make Context/Configure sticky at the top of the right sidebar.
- Give the remaining sidebar content one vertical scroll container.
- Keep the verdict visible until the user intentionally enters deep analysis.
- When the workspace opens, convert the right rail into editable scenario context or reclaim its width; do not show a duplicate report.

### Mobile/tablet layout

- Compact bottom card remains the Level 1 verdict.
- Add a **Configure** action beside KPIs/Detailed.
- Detailed sheet header remains fixed and shows technology, topology, direction, and state.
- The sheet body owns the only vertical scroll.
- Link Budget investigation should either replace the sheet body or be a routed sub-view inside it, not a second unrelated fixed overlay.
- Ensure terminal, weather, topology, direction, and GEO selection parity.

## Incremental implementation roadmap

### Phase 0 — Contract and regression baseline

1. Inventory every displayed KPI/state and its source field for each topology.
2. Define golden scenarios for:
   - GEO STAR Forward available, marginal, blocked, no coverage, no gateway, no budget;
   - GEO STAR Return equivalents;
   - GEO MESH/P2P available and incomplete Site B;
   - LEO Single Site available, limited, RF blocked, regulatory blocked, no SNP, no budget;
   - LEO Site-to-Site available, degraded, incomplete, and blocked per endpoint.
3. Snapshot current computation outputs independently of UI strings.
4. Record desktop/tablet/phone scroll and interaction baselines.

### Phase 1 — State vocabulary and view-model adapters

1. Define the composed Engineering state contract.
2. Build GEO and LEO presentation adapters from existing outputs.
3. Add unit tests proving adapters do not change source values.
4. Introduce consistent labels for state dimensions and diagnostic-only values.
5. Keep the existing layout temporarily while replacing contradictory labels.

### Phase 2 — Shared summary and blocked-state templates

1. Replace technology-specific Answer Block differences with `EngineeringVerdictCard`.
2. Convert large service cards to the shared gate matrix.
3. Add first-class incomplete/no-coverage/no-budget/blocked templates.
4. Remove repeated headline KPIs from the normal Link Budget summary and Estimated Performance.
5. Validate all topology/state combinations.

### Phase 3 — Configuration and interaction consolidation

1. Create shared Context/Configure shell.
2. Move topology and direction into the shell.
3. Reframe GEO satellite/beam selection as explicit Path Selection.
4. Add Auto/Manual state and reset behavior without changing selection algorithms.
5. Standardize radiogroup, combobox, collapsible, tooltip, and focus behavior.

### Phase 4 — Scroll and responsive architecture

1. Establish one scroll owner per desktop sidebar, mobile sheet, and workspace.
2. Add mobile Configure parity.
3. Keep context/verdict sticky where appropriate.
4. Resolve workspace-over-mobile-sheet routing and focus behavior.
5. Test short-height laptop, 1100 px boundary, tablet landscape/portrait, and phone safe areas.

### Phase 5 — Workspace integration

1. Make workspace entry limiter-specific.
2. Align sidebar and workspace hierarchy.
3. Remove or repurpose the duplicate right summary rail.
4. Add an investigation navigator for Access/Space/Ground/E2E.
5. Improve responsive pipeline rendering and horizontal-scroll affordance.

### Phase 6 — Secondary content and polish

1. Relocate Export and nominal-capacity context.
2. Revisit Pass Beam Timeline placement.
3. Reduce decorative competition.
4. Improve copy, truncation, units, and definitions.
5. Add subtle recomputation and stale-result feedback.

## Risks and regression points

### 1. Accidental computation changes

The audit recommends presentation adapters, not new calculations. Refactoring must not:

- recompute throughput, margin, latency, availability, confidence, or bottlenecks;
- normalize GEO and LEO state by discarding technology-specific dimensions;
- change which fallback values are computed;
- change route eligibility or regulatory decisions.

Mitigation: adapter tests should compare displayed values directly to existing source outputs.

### 2. GEO paired-selection side effects

Satellite selection currently chooses best real uplink/downlink candidates and can update both. MESH/P2P direction changes the candidate pools. Moving these controls risks changing callback order or selection fallback behavior.

Mitigation: preserve the existing selection handlers and test manual override, direction switch, missing side, synthesized coverage, and reset-to-auto separately.

### 3. Topology and direction state synchronization

GEO `linkMode`, GEO/LEO active direction, LEO topology mode, Site B arming, and endpoint state are coordinated at App/CapacityDetails level. A shared control must not create a second source of truth.

Mitigation: shared controls remain controlled components backed by existing state owners.

### 4. ALL scope versus active technology focus

The application distinguishes visible satellite scope from focused analysis technology. Consolidation could accidentally couple them or hide comparison information.

Mitigation: label and test scope and focus as separate concepts.

### 5. Header/sidebar/mobile state drift

The same scenario is rendered through desktop header, desktop sidebar, mobile summary, mobile detail, export, and workspace. Introducing a shared view model reduces drift only if all surfaces consume it.

Mitigation: migrate surfaces incrementally but establish parity tests for verdict, primary metrics, direction, and confidence.

### 6. Blocked diagnostic behavior

Some blocked states intentionally retain underlying RF geometry or estimates. Simplifying the UI must not suppress engineering evidence that experts need.

Mitigation: quarantine and label diagnostic-only evidence rather than deleting it; ensure workspace access remains available.

### 7. Workspace camera and layout behavior

The detailed workspace changes globe height and uses camera compensation. Width reclamation, right-rail changes, or mobile routing can affect visible globe context and camera effects.

Mitigation: preserve the existing open/close state and camera compensation contract; validate both collapsed and expanded workspace modes manually.

### 8. Scroll regressions

Changing nested `overflow` rules can produce clipped content, lost sticky headers, broken wheel/touch propagation, or inaccessible horizontal pipelines.

Mitigation: test scroll start/end reachability, keyboard scrolling, touch overscroll, short viewport heights, safe areas, and expanded sections.

### 9. Focus and keyboard regressions

Replacing custom controls or overlays can affect command palette shortcuts, Escape handling, return focus, and tab order.

Mitigation: define focus entry/exit for mobile sheet and workspace; use native controls or complete ARIA patterns; add keyboard interaction tests.

### 10. Persisted disclosure behavior

Changing section keys can unexpectedly reset user preferences; retaining current keys can preserve inappropriate open states.

Mitigation: version persisted keys deliberately and document which preferences are migrated or reset.

### 11. Export/report parity

The PDF export currently assembles its own evidence summary from the active computations. Moving visible sections must not imply that exported values have changed or silently diverge from the new verdict.

Mitigation: have export consume the same composed presentation contract where appropriate while retaining raw engineering values.

### 12. Test coverage can validate strings while missing hierarchy

Current section tests are strong on rendering topologies, values, blocked tones, and presence/order of some headings. They do not fully validate scroll ownership, focus, interactive affordance, or whether duplicated statuses are understandable.

Mitigation: add interaction and accessibility tests plus visual/manual scenarios, not only string snapshots.

## Recommended acceptance criteria

The redesign should be considered successful when:

- a first-time engineering user can identify service verdict, delivered throughput, latency, limiter, and confidence within 15 seconds;
- “available but limited” and “blocked with diagnostic geometry” are immediately understandable without opening tooltips;
- each KPI has one canonical summary location in the sidebar;
- all scenario-changing elements are visibly interactive and identify Auto/Manual behavior;
- GEO and LEO share the same top-level information hierarchy across every topology;
- desktop, tablet, and phone expose equivalent engineering configuration capabilities;
- blocked and incomplete states show actionable next steps and do not render a long sequence of meaningless `--` values;
- the normal sidebar fits the decision and explanation workflow, while the workspace owns deep RF investigation;
- each surface has one clear primary vertical scroll container;
- keyboard, focus, tooltip, combobox, collapse, and overlay behavior is consistent and testable;
- the existing computation results remain unchanged.

## Final recommendation

Do not attempt to solve the Engineering sidebar by compacting every card, reducing padding, or adding more collapsible sections. Those changes may reduce height but will preserve the underlying ambiguity.

The correct intervention is to establish a shared state and information contract, make configuration ownership explicit, designate one authoritative verdict, and use progressive disclosure to separate decision, explanation, and investigation. GEO and LEO can retain their distinct engineering details while sharing a common interaction and reasoning framework.

The detailed Link Budget workspace should be preserved and strengthened. The normal sidebar should become shorter, more decisive, and more actionable—not less technical.
