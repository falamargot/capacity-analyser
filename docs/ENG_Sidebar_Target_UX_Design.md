# Target Engineering Sidebar UX Design

**Product:** Capacity Analyzer  
**Scope:** Conceptual design for GEO and LEO Engineering modes  
**Date:** 2026-07-11  
**Status:** Design proposal for validation — not an implementation plan

## 1. Design intent

If Capacity Analyzer were created today, the Engineering Sidebar would not be designed as a container for every engineering value. It would be designed as a guided reasoning interface.

Its purpose would be to help an engineer answer, in order:

1. **What scenario am I evaluating?**
2. **Is the requested service possible?**
3. **What performance is actually deliverable?**
4. **What blocks or limits it?**
5. **Which layer explains that result?**
6. **What evidence and equations produced it?**

The target experience therefore has one narrative:

```text
SCENARIO
   ↓
PATH RESOLUTION
   ↓
RF CLOSURE
   ↓
SERVICE GATES
   ↓
DELIVERY CONSTRAINTS
   ↓
DELIVERED RESULT
```

The sidebar presents the outcome and the shortest useful explanation. A separate Engineering Investigation workspace presents the full closure chain, margins, assumptions, and evidence.

The interface is powerful because it exposes depth on demand, not because it shows everything at once.

## 2. North-star experience

Within five seconds of a result becoming available, the user should be able to say:

> “The path is available, it delivers 8 Mbps down and 3 Mbps up at 53 ms RTT, and beam sharing is the main constraint.”

Within fifteen seconds, the user should also know:

- which technology, topology, and direction are active;
- whether the path was selected automatically or manually;
- whether the result is available, degraded, blocked, incomplete, or uncertain;
- whether the displayed performance is deliverable or diagnostic-only;
- what the first limiting or failing engineering stage is;
- how confident the model is and why;
- what action or investigation is most relevant next.

The user should not need to reconcile several status cards to construct this sentence.

## 3. Core design principles

### 3.1 One authoritative verdict

The interface shows one overall service verdict. RF closure, policy, capacity, path resolution, and confidence remain visible as dimensions of that verdict, not as competing verdicts.

Good:

> **Service available — throughput constrained by beam sharing**

Bad:

> Connected · Available · Limited · Marginal

### 3.2 Separate configuration, result, and evidence

Every visible item belongs to one of three modes:

- **Configure:** values the user can change;
- **Result:** values the model concluded;
- **Evidence:** details that explain or support the result.

These modes never share an ambiguous card style.

### 3.3 Progressive engineering depth

The experience has five depths:

| Depth | User question | Surface |
|---|---|---|
| 0 — Compare | Which technology should I inspect? | Technology comparison strip |
| 1 — Decide | Does it work, and what do I get? | Sidebar verdict |
| 2 — Explain | Why is it available, limited, or blocked? | Sidebar gate chain |
| 3 — Localize | Which engineering layer or segment is responsible? | Investigation index |
| 4 — Prove | What budgets, equations, assumptions, and sources produced it? | Investigation workspace |

Each depth earns the right to show more detail.

### 3.4 Shared reasoning, technology-specific proof

GEO and LEO share the first three depths. They diverge only when the engineer investigates technology-specific layers.

The top-level experience always answers the same questions. GEO may then expose gateway, uplink/downlink beam, payload, and dual-segment budgets. LEO may expose serving beam, SNP, feeder, backbone, handover, load, and temporal continuity.

### 3.5 State is expressed as a sentence, not a color

Color reinforces a conclusion but never carries it alone. Every state includes:

- a noun: Service, Scenario, Path, RF budget;
- a state: available, degraded, blocked, incomplete, unresolved;
- a cause or qualifier;
- an appropriate next action when the state is not healthy.

### 3.6 The sidebar is for decisions; the workspace is for investigation

The sidebar remains short enough to navigate confidently. It does not contain complete RF tables, long hop descriptions, or full closure diagrams.

### 3.7 Mobile has capability parity

Mobile reorganizes the same workflow. It does not remove terminal, weather, topology, direction, or path-selection capability.

### 3.8 One scroll owner per surface

- desktop sidebar: one vertical scroll area beneath a sticky context header;
- mobile result sheet: one vertical scroll area beneath a fixed sheet header;
- investigation workspace: one vertical scroll area, with local horizontal diagrams only when unavoidable.

## 4. The engineering reasoning model

### 4.1 The five reasoning stages

#### Stage A — Scenario readiness

The system verifies that the requested analysis can be attempted.

Examples:

- Site A present;
- Site B present when required;
- terminal profile selected;
- topology and direction defined;
- environmental assumptions available.

#### Stage B — Path resolution

The system identifies the elements required to construct a path.

Examples:

- GEO satellite and coverage candidate;
- uplink/downlink beam;
- traffic gateway when the topology requires one;
- LEO serving satellite and beam;
- SNP and backbone path;
- endpoint-to-endpoint route.

#### Stage C — RF closure

The system determines whether the radio path closes and at what margin/MODCOD/rate.

This stage is distinct from path resolution. A satellite can be geometrically resolved while the RF path is blocked.

#### Stage D — Service gates

The system applies non-RF conditions that can allow, degrade, or block service.

Examples:

- regulatory state;
- ground infrastructure availability;
- service-zone eligibility;
- operational constraints.

#### Stage E — Delivery constraints

The system turns feasible RF capacity into delivered performance.

Examples:

- shared capacity;
- terminal cap;
- feeder bound;
- protocol efficiency;
- handover or temporal continuity;
- network/backbone effects.

### 4.2 Verdict composition

The final verdict is derived conceptually in this order:

```text
If scenario is incomplete
  → Scenario incomplete
Else if path cannot be resolved
  → Path unavailable or unresolved
Else if RF cannot be computed
  → RF budget unavailable
Else if RF does not close
  → Service blocked by RF
Else if a service gate blocks
  → Service blocked by [gate]
Else if delivery is materially constrained
  → Service available — constrained by [factor]
Else if confidence is insufficient
  → Service potentially available — evidence uncertain
Else
  → Service available
```

This hierarchy prevents “Connected,” “No budget,” and “Blocked” from appearing as unexplained peers.

### 4.3 Status grammar

| Overall state | Required headline pattern | Performance treatment |
|---|---|---|
| Available | Service available | Delivered KPIs shown normally |
| Available but constrained | Service available — constrained by X | Delivered KPIs shown; loss/constraint emphasized |
| Degraded | Service degraded — X | Delivered KPIs shown with degradation qualifier |
| Blocked | Service blocked — X | No delivered KPIs; diagnostic values separated |
| Path unavailable | No service path — X | Show resolved evidence and next action |
| Budget unavailable | RF budget unavailable — X | No closure conclusion; show missing evidence |
| Incomplete | Scenario incomplete — X required | Show completion action, not empty result cards |
| Uncertain | Result uncertain — X | Show provisional values with confidence boundary |

### 4.4 Performance provenance

Every headline metric has a visible provenance category:

- **Delivered:** valid end-to-end result after service gates and constraints;
- **RF potential:** capacity implied by RF closure before network constraints;
- **Diagnostic estimate:** computed for investigation but not deliverable;
- **Unavailable:** not computed or not meaningful.

Only Delivered metrics occupy the primary verdict card.

## 5. Global interaction model

### 5.1 Three user modes

The interface has three explicit interaction modes, even if they are not presented as literal tabs.

#### Review

Default mode. The user reads the current verdict, causes, path, and assumptions.

#### Configure

The user changes scenario inputs or path-selection policy. Editable controls are grouped in one surface. Results remain visible in the background or summary so the consequence is understandable.

#### Investigate

The user follows a limiter or gate into detailed engineering evidence. The workspace opens focused on the selected stage.

The user never changes a scenario input accidentally while believing they are merely inspecting a result.

### 5.2 Automatic versus manual selection

Satellite, coverage, beam, gateway/SNP choice, and route selection must declare their selection policy.

```text
Serving satellite   KVHTS        [AUTO]
Reason              Best valid end-to-end margin
                                      [Override…]
```

After an override:

```text
Serving satellite   E10B         [MANUAL]
Changed by user     14:32 UTC
                                [Return to Auto]
```

Rules:

- Auto is the default.
- Manual selection is visibly persistent.
- Changing a satellite explains which dependent beam selections will update.
- Direction-specific overrides are labeled by endpoint and direction.
- Returning to Auto is always available from the same control.

### 5.3 Recalculation feedback

After a configuration change:

- the previous result remains visible but is marked **Updating**;
- changed assumptions are briefly highlighted;
- stale metrics are visually muted and not presented as current;
- the new verdict replaces the old one atomically;
- the gate chain indicates which stages were recomputed.

### 5.4 Focus versus scope

The product separates:

- **Scope:** which technologies are visible/evaluated (`ALL`, `GEO`, `LEO`);
- **Focus:** which result occupies the Engineering Sidebar.

In ALL scope, a comparison strip selects focus. Selecting GEO focus does not hide LEO from the globe unless the user changes scope.

### 5.5 Direction

Direction is a first-class control adjacent to topology.

```text
Topology   Site-to-Site
Direction  [ A → B ] [ B → A ] [ Compare ]
```

It is not hidden inside a path diagram or represented only by label changes.

## 6. Desktop target wireframes

### 6.1 Desktop — full Engineering view, available but constrained

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CAPACITY ANALYZER   Scope [ALL ▾]   Mode [ENGINEERING]      Time 14:32 UTC       Help  Export │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ SCENARIO  A: Paris, FR  ─────────────→  B: Dakar, SN           [Edit scenario] [Swap A/B]     │
│           GEO: 1.2 m VSAT · Clear      GEO: 0.9 m VSAT · Rain   Assumptions: Current          │
├───────────────────────────────────────────────────────────────────┬──────────────────────────┤
│                                                                   │ ① FOCUS / CONTEXT        │
│                                                                   │ [GEO] [LEO]              │
│                                                                   │ GEO · Star Forward       │
│                                                                   │ Gateway → Sat → Site A   │
│                         GLOBE / MAP                               │ Direction [Forward ▾]    │
│                                                                   │ Selection [AUTO]          │
│                                                                   │              [Configure]  │
│                                                                   ├──────────────────────────┤
│                                                                   │ ② VERDICT                │
│                                                                   │ ● SERVICE AVAILABLE       │
│                                                                   │ Throughput constrained    │
│                                                                   │ by downlink beam sharing  │
│                                                                   │                          │
│                                                                   │  ↓ 42 Mbps   ↑ 8 Mbps     │
│                                                                   │  271 ms one-way           │
│                                                                   │  Confidence: High 91/100  │
│                                                                   ├──────────────────────────┤
│                                                                   │ ③ WHY THIS RESULT         │
│                                                                   │ ✓ Scenario ready          │
│                                                                   │ ✓ Path resolved           │
│                                                                   │ ✓ RF closes      +3.1 dB  │
│                                                                   │ ✓ Service gates pass      │
│                                                                   │ ! Delivery constrained    │
│                                                                   │   Beam sharing: -118 Mbps │
│                                                                   │ [Explain constraint →]    │
│                                                                   ├──────────────────────────┤
│                                                                   │ ④ RESOLVED PATH           │
│                                                                   │ Dakar GW → KVHTS → Paris  │
│                                                                   │ Ka · Beam DL-042          │
│                                                                   │ [Inspect path]            │
│                                                                   ├──────────────────────────┤
│                                                                   │ ⑤ INVESTIGATE             │
│                                                                   │ Link budget      Marginal │
│                                                                   │ Access layer         Ready│
│                                                                   │ Space segment    Limiting │
│                                                                   │ Ground segment       Ready│
│                                                                   │ Latency              Ready│
│                                                                   │ [Open investigation →]    │
│                                                                   ├──────────────────────────┤
│                                                                   │ [Compare] [Export] [Reset]│
└───────────────────────────────────────────────────────────────────┴──────────────────────────┘
```

#### Annotations

1. **Focus / Context is sticky.** It answers “what result am I reading?” and exposes the only entry into configuration from the sidebar.
2. **The Verdict is the largest visual object.** It combines availability and constraint into one statement. No other section repeats the headline KPIs.
3. **Why This Result is an ordered chain.** It shows the first failure or largest loss without forcing the user into layer details.
4. **Resolved Path is evidence, not a second verdict.** It names the actual nodes and selection policy.
5. **Investigate is an index, not an accordion dump.** Each row communicates readiness or relevance and opens the workspace focused on that layer.
6. **The globe remains primary context.** It does not lose its role when the sidebar becomes informative.
7. **Global actions are low and quiet.** Export does not compete with engineering reasoning.

### 6.2 Desktop — comparison and technology focus

When scope is ALL, a compact comparison strip appears above the focused sidebar result.

```text
┌───────────────────────────────────────────────────────────┐
│ TECHNOLOGY COMPARISON                                     │
├──────────────────────────┬────────────────────────────────┤
│ GEO                      │ LEO                            │
│ ● Available · constrained│ ● Available                   │
│ 42 / 8 Mbps · 271 ms     │ 188 / 28 Mbps · 48 ms         │
│ Limit: beam sharing      │ Limit: terminal cap           │
│ [Focused]                │ [Focus LEO]                   │
└──────────────────────────┴────────────────────────────────┘
```

This strip exists only to compare and choose focus. It does not repeat confidence, full gate reasoning, paths, or investigation controls.

### 6.3 Desktop — blocked state

Blocked and incomplete states use a different content composition, not the available layout filled with dashes.

```text
┌────────────────────────── ENGINEERING SIDEBAR ──────────────────────────┐
│ GEO · Star Return · Site A → Gateway                    [Configure]      │
├──────────────────────────────────────────────────────────────────────────┤
│ ⛔ SERVICE BLOCKED                                                     │
│ Uplink RF does not close at Site A                                      │
│                                                                          │
│ Required margin     0.0 dB                                               │
│ Computed margin    -2.7 dB                                               │
│ Confidence          High · 93/100                                        │
│                                                                          │
│ No delivered throughput is available.                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ WHAT IS STILL VALID                                                      │
│ ✓ Scenario complete                                                      │
│ ✓ KVHTS / UL beam 104 resolved                                           │
│ ✓ Traffic Gateway Dakar resolved                                         │
│ ✓ Regulatory gate passed                                                 │
│ ⛔ RF closure failed at Site A uplink                                    │
├──────────────────────────────────────────────────────────────────────────┤
│ RECOMMENDED NEXT STEPS                                                    │
│ 1  Inspect uplink margin and weather loss                                │
│ 2  Compare a larger terminal profile                                     │
│ 3  Return satellite/beam selection to Auto                               │
│                                                                          │
│ [Investigate uplink margin →]       [Edit assumptions]                    │
├──────────────────────────────────────────────────────────────────────────┤
│ DIAGNOSTIC EVIDENCE                                                       │
│ RF potential and geometry values are available for investigation only.   │
│ [Show diagnostic evidence]                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Why this form exists

- It replaces empty KPI grids with an explicit failure statement.
- It states which evidence remains trustworthy.
- It prevents diagnostic estimates from looking deliverable.
- It makes the next engineering action visible.
- It opens investigation at the failing stage rather than at the top of a generic report.

### 6.4 Desktop — incomplete scenario

```text
┌────────────────────────── ENGINEERING SIDEBAR ──────────────────────────┐
│ LEO · Site-to-Site · A → B                              [Configure]      │
├──────────────────────────────────────────────────────────────────────────┤
│ ◌ SCENARIO INCOMPLETE                                                   │
│ Site B is required to compute an end-to-end path                         │
│                                                                          │
│ ✓ Site A configured: Paris · OW70L · Current weather                    │
│ ○ Site B not set                                                         │
│                                                                          │
│ [Place Site B on map]  [Search location]                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ WHAT WILL BE COMPUTED NEXT                                               │
│ Access A → SNP A → backbone → SNP B → Access B                           │
│ Both A→B and B→A directions will be evaluated.                           │
└──────────────────────────────────────────────────────────────────────────┘
```

No Link Budget, latency breakdown, performance card, or export result is rendered until the scenario can support them.

### 6.5 Desktop — Configure panel

Configure is a deliberate side sheet that temporarily replaces the result sidebar while leaving a small result summary visible.

```text
┌──────────────────────────── CONFIGURE SCENARIO ───────────────────────────┐
│ Result summary: Available · 42 Mbps down · Beam sharing limited           │
├───────────────────────────────────────────────────────────────────────────┤
│ PATH                                                                      │
│ Technology        GEO                                                     │
│ Topology          [Star Forward ▾]                                        │
│ Direction         Gateway → Site A                                        │
│ Selection policy  (●) Automatic   ( ) Manual                              │
├───────────────────────────────────────────────────────────────────────────┤
│ SITE A — PARIS                                                            │
│ Terminal use case [Fixed ▾]                                               │
│ RF profile        [Ka Enterprise VSAT ▾]                                  │
│ Weather source    [● Current  ○ Manual]  Rain · updated 4 min ago         │
│ [Advanced RF parameters…]                                                 │
├───────────────────────────────────────────────────────────────────────────┤
│ AUTO-SELECTED PATH                                                        │
│ Satellite         KVHTS · best valid end-to-end margin                    │
│ Downlink beam     DL-042 · +3.1 dB                                        │
│ Traffic Gateway   Dakar · beam assignment                                 │
│                                                      [Override path…]     │
├───────────────────────────────────────────────────────────────────────────┤
│                                             [Cancel] [Apply and recalculate]│
└───────────────────────────────────────────────────────────────────────────┘
```

#### Configure panel rules

- Controls use conventional form styling.
- Derived selections are read-only until Manual policy is chosen.
- Advanced RF parameters are separated from normal terminal selection.
- The current result remains summarized so the user understands the baseline.
- Apply is explicit for multi-field edits; small single-field overrides may update immediately if undo is obvious.
- When Apply is used, the result enters Updating state until all dependent stages are current.

## 7. Mobile target wireframes

### 7.1 Mobile — map with result peek

The first mobile result is intentionally small. It answers only the decision question and provides three next actions.

```text
┌──────────────────────────── 390 px ────────────────────────────┐
│ Capacity Analyzer   [ALL ▾] [ENG] [Targets]                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│                         GLOBE                                  │
│                                                                │
│                    Site A ●──────○ Sat                         │
│                                                                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ LEO · Single Site · AUTO                              [⌃]      │
│ ● Service available — beam sharing constrained                │
│                                                                │
│ ↓ 8 Mbps       ↑ 3 Mbps       RTT 53 ms                        │
│                                                                │
│ [Configure]              [Why]             [Investigate]       │
└────────────────────────────────────────────────────────────────┘
```

#### Why this section exists

- It preserves globe context.
- It provides the same authoritative verdict as desktop.
- It gives direct access to configuration, explanation, and investigation.
- It avoids an intermediate “KPIs” expansion that repeats the same metrics.

### 7.2 Mobile — result sheet

Tapping the result peek or Why opens one full-height sheet.

```text
┌──────────────────────────── RESULT ─────────────────────────────┐
│ ━━━━━      LEO · Single Site · Site A → SNP          [×]       │
│ [Configure]                              Selection: AUTO         │
├─────────────────────────────────────────────────────────────────┤
│ ● SERVICE AVAILABLE                                             │
│ Throughput constrained by DL+UL beam sharing                    │
│                                                                 │
│ 8 Mbps down       3 Mbps up       53 ms RTT                     │
│ Confidence: High 94/100                                         │
├─────────────────────────────────────────────────────────────────┤
│ WHY THIS RESULT                                                  │
│ ✓ Scenario ready                                                │
│ ✓ Path resolved · ONEWEB-0174 → SNP Florida                    │
│ ✓ RF closes · DL +29.6 dB / UL +11.7 dB                        │
│ ✓ Service gates pass                                            │
│ ! Beam sharing reduces 188 Mbps → 8 Mbps                        │
│                                           [Explain loss →]       │
├─────────────────────────────────────────────────────────────────┤
│ PATH & ASSUMPTIONS                                               │
│ ONEWEB-0174 · Beam 11 · SNP Florida                             │
│ OW70L · Fixed · Current weather                                  │
│                                           [Review details]       │
├─────────────────────────────────────────────────────────────────┤
│ INVESTIGATE                                                      │
│ › Link budget                         Marginal                   │
│ › Beam sharing                        Limiting                   │
│ › Ground path                         Ready                      │
│ › Latency                             Ready                      │
│ › Pass continuity                     4 handovers                │
├─────────────────────────────────────────────────────────────────┤
│ [Compare]                    [Export]                    [Reset]  │
└─────────────────────────────────────────────────────────────────┘
```

The sheet header stays fixed. The body is the only vertical scroll area. Technology, topology, direction, and state remain visible while the user scrolls.

### 7.3 Mobile — Configure sheet

Configure is a sibling sheet, not an accordion embedded in results.

```text
┌────────────────────────── CONFIGURE ─────────────────────────────┐
│ [‹ Result]      Scenario configuration               [Cancel]   │
├─────────────────────────────────────────────────────────────────┤
│ TECHNOLOGY & PATH                                                │
│ Technology       [LEO ▾]                                        │
│ Topology         [Single Site] [Site-to-Site]                    │
│ Direction        Site A → SNP                                   │
│ Selection        [● Auto  ○ Manual]                             │
├─────────────────────────────────────────────────────────────────┤
│ SITE A                                                           │
│ Location         28.94°N, 71.42°W                 [Change]      │
│ Terminal type    [Fixed ▾]                                      │
│ Terminal model   [Intellian OW70L ▾]                            │
│ Weather          [Current ▾] · updated 4 min ago                 │
│ [Advanced terminal assumptions]                                 │
├─────────────────────────────────────────────────────────────────┤
│ AUTO PATH                                                        │
│ Satellite        ONEWEB-0174                                    │
│ Beam             11                                             │
│ SNP              Florida                                        │
│ Reason           Highest valid delivered service score          │
│ [Override path]                                                 │
├─────────────────────────────────────────────────────────────────┤
│                          [Apply and recalculate]                 │
└─────────────────────────────────────────────────────────────────┘
```

All desktop configuration capabilities remain accessible.

### 7.4 Mobile — blocked state

```text
┌──────────────────────────── RESULT ─────────────────────────────┐
│ GEO · Star Return                                     [×]       │
├─────────────────────────────────────────────────────────────────┤
│ ⛔ SERVICE BLOCKED                                             │
│ Uplink RF does not close at Site A                              │
│                                                                 │
│ Margin -2.7 dB · High confidence                                │
│ No delivered throughput                                        │
├─────────────────────────────────────────────────────────────────┤
│ VALID EVIDENCE                                                   │
│ ✓ Scenario complete                                             │
│ ✓ Satellite, beam and gateway resolved                          │
│ ✓ Policy allowed                                                │
│ ⛔ Uplink closure failed                                        │
├─────────────────────────────────────────────────────────────────┤
│ NEXT BEST ACTION                                                 │
│ Inspect weather and terminal EIRP                               │
│ [Investigate uplink]        [Edit terminal]                      │
├─────────────────────────────────────────────────────────────────┤
│ Diagnostic values are available in Investigation.               │
└─────────────────────────────────────────────────────────────────┘
```

### 7.5 Mobile — investigation screen

Investigation replaces the result sheet body. It does not open another overlay above it.

```text
┌──────────────────────── INVESTIGATION ──────────────────────────┐
│ [‹ Result]   Beam sharing · LEO Single Site          [Export]   │
│ Available · 8 Mbps down · 53 ms RTT                             │
├─────────────────────────────────────────────────────────────────┤
│ [Closure] [Access] [Space] [Ground] [Latency] [Evidence]        │
├─────────────────────────────────────────────────────────────────┤
│ WHY SELECTED                                                     │
│ Largest throughput reduction: 188 Mbps → 8 Mbps                 │
├─────────────────────────────────────────────────────────────────┤
│ CLOSURE                                                          │
│ RF potential                                                     │
│ 188 Mbps                                                         │
│     │ Beam sharing · -180 Mbps                                  │
│     ▼                                                            │
│ Shared capacity                                                  │
│ 8 Mbps                                                           │
│     │ Feeder bound · no further loss                            │
│     ▼                                                            │
│ Delivered                                                        │
│ 8 Mbps                                                           │
├─────────────────────────────────────────────────────────────────┤
│ ASSUMPTIONS USED                                      [Inspect]  │
└─────────────────────────────────────────────────────────────────┘
```

On narrow screens, closure diagrams become vertical. Horizontal scrolling is reserved for data tables that cannot be meaningfully reflowed.

## 8. Deep Engineering Investigation workspace

### 8.1 Purpose

The workspace exists to prove and explore the result. It is not another summary dashboard.

It answers:

- exactly where the path closes or fails;
- how raw RF potential became delivered performance;
- which assumptions and sources were used;
- how each segment contributes to margin and latency;
- what alternative selection or assumption would change the result.

### 8.2 Desktop workspace wireframe

```text
┌──────────────────────────────── ENGINEERING INVESTIGATION ────────────────────────────────┐
│ [← Back to result]  LEO · Site A → SNP · Available / constrained        [Compare] [Export]│
│ 8 Mbps down · 3 Mbps up · 53 ms RTT · High confidence                         [Close ×]   │
├──────────────────────┬─────────────────────────────────────────────────────────────────────┤
│ INVESTIGATION INDEX  │ SELECTED: BEAM SHARING                                                  │
│                      │                                                                     │
│ ● Closure            │ Why selected                                                        │
│   Access             │ Largest loss in delivered-throughput chain                          │
│   Space              ├─────────────────────────────────────────────────────────────────────┤
│   Ground             │ RF POTENTIAL 188 Mbps                                               │
│   Latency            │        │                                                            │
│   Availability       │        ├─ Beam sharing: 59 simulated users, -180 Mbps               │
│   Confidence         │        ▼                                                            │
│   Assumptions        │ SHARED CAPACITY 8 Mbps                                              │
│   Sources            │        │                                                            │
│                      │        ├─ Ka feeder bound: no additional loss                        │
│ Findings             │        ├─ Terminal cap: no additional loss                          │
│ ! Beam sharing       │        ├─ Handover/protocol: no additional loss                     │
│   UL margin          │        ▼                                                            │
│                      │ DELIVERED 8 Mbps                                                     │
│                      ├─────────────────────────────────────────────────────────────────────┤
│                      │ PARAMETERS & EVIDENCE                                                │
│                      │ Beam 11 · 32APSK 3/4 · Load 52% · Source: planning model            │
│                      │ [Show calculation inputs] [Compare terminal] [Compare beam]          │
└──────────────────────┴─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Workspace behavior

- The top context line is sticky and contains the same verdict as the sidebar.
- The left index is navigation, not a KPI rail.
- The workspace opens on the stage selected from the sidebar.
- Findings are ordered by engineering relevance, not component order.
- The center canvas shows one reasoning chain at a time.
- Assumptions and evidence are adjacent to the calculation they affect.
- Alternative comparisons are deliberate actions, not silent overrides.
- Closing returns focus and scroll position to the originating sidebar row.

### 8.4 GEO investigation structure

```text
Closure
├── Active direction
├── Uplink budget
├── Payload / transponder context
├── Downlink budget
├── Combined end-to-end margin
├── MODCOD / RF throughput
├── Protocol or topology efficiency
└── Delivered throughput

Path
├── Site A terminal
├── Uplink coverage / beam
├── GEO satellite / payload
├── Downlink coverage / beam
├── Site B or Traffic Gateway
└── Ground/backhaul context where applicable
```

### 8.5 LEO investigation structure

```text
Closure
├── Access RF potential
├── Beam sharing
├── Feeder bound
├── Terminal cap
├── Handover / continuity
├── Protocol / smoothing
└── Delivered throughput

Path
├── Site A access
├── Serving satellite / beam
├── SNP / feeder
├── Backbone / PoP when site-to-site
├── Site B feeder / serving satellite
└── Site B access
```

### 8.6 Site-to-site direction comparison

In both GEO and LEO, the workspace can compare directions without changing the primary result silently.

```text
Direction comparison
┌──────────────────────────────┬──────────────────────────────┐
│ A → B                        │ B → A                        │
│ 42 Mbps · 61 ms              │ 18 Mbps · 66 ms              │
│ Limit: Site B downlink       │ Limit: Site B uplink        │
│ [Investigate]                │ [Investigate]                │
└──────────────────────────────┴──────────────────────────────┘
```

The active investigation direction is explicit and does not overwrite direction-specific manual selections.

## 9. Why each target sidebar section exists

### 9.1 Context / Configure

**Purpose:** prevent misreading by making technology, topology, direction, endpoints, and selection policy continuously visible.

**Always visible:** yes, in compact form.

**Expandable:** opens the dedicated Configure surface.

**Not allowed here:** detailed RF parameters, full coverage candidate lists, or performance explanation.

### 9.2 Verdict

**Purpose:** provide the authoritative engineering answer.

**Always visible:** yes when a scenario has produced a result.

**Contents:** overall state, qualifier/cause, delivered KPIs, confidence, decisive factor.

**Not allowed here:** diagnostic-only throughput, duplicate service-gate tiles, or secondary constellation statistics.

### 9.3 Why This Result

**Purpose:** explain the verdict in the minimum number of stages.

**Always visible:** the ordered stage summary is visible; deeper detail is expandable or routed to Investigation.

**Contents:** readiness, path, RF, service gate, delivery constraint.

**Behavior:** the first failure or largest loss is visually dominant and actionable.

### 9.4 Resolved Path

**Purpose:** prove which physical/logical elements the result refers to.

**Always visible:** compact path summary.

**Expandable:** hop distances, beams, gateways/SNPs, backbone, and selection reasons.

**Interaction:** Inspect actions never mutate the path. Overrides live only in Configure.

### 9.5 Assumptions

**Purpose:** keep the result auditable without mixing controls into the result.

**Always visible:** compact terminal/weather/source summary.

**Editable:** via Configure.

**Detailed:** parameters and confidence contributions live in Investigation.

### 9.6 Investigate

**Purpose:** route the user to the most relevant proof layer.

**Always visible:** a short index with status/relevance.

**Behavior:** opens the workspace focused on the selected item.

**Not allowed here:** full calculation tables inside the normal sidebar.

### 9.7 Actions

**Purpose:** keep export, compare, share, and reset available without making them part of the engineering narrative.

**Placement:** quiet footer/action bar; sticky on mobile if necessary.

## 10. Visual hierarchy and rhythm

The visual system supports reasoning rather than decoration.

### 10.1 Vertical rhythm

```text
Context       compact, sticky, 1 unit of emphasis
Verdict       largest card, 3 units of emphasis
Why           structured rows, 2 units of emphasis
Path          compact evidence, 1 unit of emphasis
Investigate   navigational list, 1 unit of emphasis
Actions       quiet utility band
```

Spacing creates chapters. Borders do not wrap every individual value.

### 10.2 Typography

- verdict headline: plain language, strongest type;
- delivered metrics: large tabular numerals with explicit units and direction;
- section names: sentence case or restrained uppercase, never more prominent than the result;
- technical identifiers: monospace only where scanning/copying benefits;
- explanations: normal sentence casing and readable line length;
- labels such as RF, EIRP, G/T, MODCOD remain technical and precise.

### 10.3 Color

- neutral surfaces carry most content;
- green/teal: service available or verified pass;
- amber: available with constraint, low margin, or degraded;
- red/rose: blocking condition;
- blue/pink may identify GEO/LEO focus but never replace state color;
- muted gray: unresolved, incomplete, not computed, or secondary evidence.

Technology color and state color are never conflated.

### 10.4 Cards and containers

Use containers for conceptual groups, not every metric. A four-cell KPI grid is acceptable only inside the single Verdict card. Gate rows, path nodes, and assumptions should read as structured content, not a wall of independent tiles.

### 10.5 Motion

- result updates cross-fade or update in place;
- changed assumptions briefly highlight;
- workspace transitions preserve globe context and orientation;
- blocked-state transitions do not flash stale delivered KPIs;
- motion lasts long enough to show causality but never delays engineering work.

## 11. Responsive behavior

### 11.1 Desktop wide

- globe and sidebar visible simultaneously;
- sidebar width supports readable engineering text, approximately 420–480 px conceptually;
- investigation workspace uses the full analysis area;
- comparison strip may sit above or adjacent to the focused result.

### 11.2 Short-height laptop

- Context and compact Verdict remain visible;
- Why, Path, and Investigate scroll beneath them;
- the interface does not shrink text to preserve everything above the fold;
- actions remain reachable without nested scrolling.

### 11.3 Tablet

- map-first layout with result peek;
- result and Configure use full-height sheets;
- split view may be used in landscape if both panes remain readable;
- all capabilities remain available.

### 11.4 Phone

- result peek provides decision-level information;
- Result, Configure, and Investigation are routed sibling screens/sheets;
- only one sheet owns scrolling;
- closure diagrams stack vertically;
- tables may use explicit horizontal scroll with a visible cue;
- safe-area and thumb reach influence action placement.

## 12. GEO and LEO specialization within the shared shell

| Shared section | GEO specialization | LEO specialization |
|---|---|---|
| Context | STAR/MESH/P2P topology; Forward/Return/A→B/B→A | Single Site/Site-to-Site; A→B/B→A |
| Path selection | satellite, uplink/downlink coverage/beam, traffic gateway | serving satellite/beam, SNP and route policy, generally automatic unless override is supported |
| RF stage | uplink/downlink and combined margin | access/feeder RF, MODCOD and scan geometry |
| Service gates | gateway/path support, regulatory/evidence status | SNP, regulatory, service zone, operational constraints |
| Delivery constraints | transponder/shared service, topology/protocol efficiency, terminal | beam sharing, feeder, terminal, handover, protocol/smoothing |
| Temporal evidence | usually secondary/static | pass continuity and handovers may be relevant |
| Investigation | dual-segment budgets and payload/gateway evidence | access/feeder/backbone and temporal evidence |

The shell never hides meaningful technology differences. It makes them comparable by placing them under the same questions.

## 13. Interaction and accessibility contract

### 13.1 Control semantics

- technology, topology, and direction use tabs or radio-group semantics;
- dropdown selection uses a complete combobox/listbox pattern;
- collapsible regions use a full-width labeled trigger;
- drill-down controls use verb labels;
- icon-only buttons are reserved for universally understood close/back actions;
- static path nodes never acquire hover styling that implies editing.

### 13.2 Keyboard

- logical tab order follows Context → Verdict actions → Why → Path → Investigate → Actions;
- arrow keys operate radio groups and listboxes;
- Escape closes the current popup/sheet/workspace level only;
- focus returns to the action that opened a surface;
- workspace sections are reachable through its navigation index.

### 13.3 Screen readers

- the overall verdict is announced as a single coherent summary;
- state is never communicated by color alone;
- updating/recalculation is announced without repeatedly reading the entire sidebar;
- diagrams have equivalent ordered textual descriptions;
- diagnostic-only values are explicitly labeled in accessible names.

### 13.4 Touch

- all primary targets meet comfortable touch sizing;
- result peek gestures have visible button equivalents;
- horizontal scroll regions are limited and visibly signposted;
- destructive reset is separated from frequent Configure/Investigate actions.

## 14. Empty, loading, stale and error states

### 14.1 No scenario

The sidebar teaches the workflow:

```text
1  Set Site A
2  Choose access or site-to-site
3  Review GEO and LEO results
```

It does not present empty engineering modules.

### 14.2 Computing

```text
Evaluating LEO Site-to-Site
✓ Scenario ready
✓ Access A resolved
… Resolving Site B and backbone
```

Progress mirrors the reasoning stages. It is not a generic spinner.

### 14.3 Stale

If weather, time, satellite geometry, or network conditions change while the user is reading:

```text
Result changed since 14:32 UTC
Serving satellite updated; delivered performance recomputed
[Review changes]
```

The interface distinguishes a live update from a user configuration change.

### 14.4 Model/data error

Errors identify the failed evidence source or calculation layer and separate application failure from a valid “service unavailable” engineering conclusion.

## 15. The complete engineering narrative

### Step 1 — First visible result

The technology comparison strip or mobile result peek answers which options are available and which result is focused.

The user sees no detailed RF data yet.

### Step 2 — Authoritative decision

The Verdict states service availability, delivered performance, confidence, and the decisive blocker/constraint.

This is the only place where primary delivered KPIs are shown at sidebar scale.

### Step 3 — Causal explanation

Why This Result presents the ordered stages from scenario readiness to delivery. The user sees the first failure or largest loss.

The interface now answers “why,” without yet showing full equations.

### Step 4 — Physical/logical grounding

Resolved Path and Assumptions identify the satellite, beam, gateway/SNP, endpoints, terminal, weather, direction, and selection policy to which the result applies.

The result becomes auditable.

### Step 5 — Investigation choice

The Investigate index highlights the most relevant layer and exposes all other layers without expanding them into the sidebar.

The user chooses what to inspect.

### Step 6 — Focused closure

The workspace opens on the selected limiter or failure. It shows the local closure chain and the loss/margin that matters.

### Step 7 — Segment evidence

The engineer can navigate to Access, Space, Ground, Latency, Availability, Confidence, Assumptions, and Sources. Detailed tables and parameters are attached to the stage they support.

### Step 8 — Compare or modify

The engineer can compare direction, terminal, beam, or technology. Comparison never silently changes the baseline scenario. If the user chooses an alternative, Configure makes the change explicit and the result recomputes.

### Step 9 — Export

Export captures the current scenario, authoritative verdict, closure explanation, assumptions, confidence, and selected detailed evidence. It does not export contradictory summaries from different UI layers.

## 16. Concept validation scenarios

The conceptual design should be reviewed against these scenarios before any implementation planning begins.

### GEO

- Star Forward, healthy RF and unconstrained delivery;
- Star Forward, service available but capacity constrained;
- Star Return, negative uplink margin;
- Star path with coverage but unresolved traffic gateway;
- no GEO coverage candidate;
- coverage resolved but RF budget evidence unavailable;
- MESH A→B and B→A with asymmetric terminals;
- Point-to-Point with dedicated capacity assumptions;
- Site B missing;
- manual satellite/beam override and return to Auto.

### LEO

- Single Site available;
- Single Site available but beam-sharing limited;
- satellite geometry resolved but no active RF beam;
- RF valid but regulatory blocked;
- RF valid but SNP unavailable;
- terminal limited;
- handover/continuity limited;
- Site-to-Site via same SNP;
- Site-to-Site via backbone and two SNPs;
- Site B missing;
- A→B and B→A asymmetric result.

### Responsive and interaction

- desktop wide and short-height laptop;
- tablet landscape and portrait;
- phone result, Configure, and Investigation flows;
- keyboard-only operation;
- screen-reader verdict and diagram narration;
- result recomputation while a detailed section is open;
- workspace open/close with context preservation;
- long satellite, beam, gateway, and location names;
- low-confidence and stale-data states.

## 17. Decisions to validate with stakeholders

Before implementation planning, the product and engineering teams should validate:

1. Is the composed verdict hierarchy correct for every GEO and LEO state?
2. Is “service available but constrained” preferable to treating every capacity constraint as degraded?
3. Which metrics qualify as Delivered versus RF potential or Diagnostic estimate?
4. Should GEO/LEO comparison be persistent in ALL scope or invoked on demand?
5. Which path elements may be manually overridden in each technology?
6. Should Configure apply changes immediately or as a grouped transaction?
7. Which assumptions must remain visible in the normal sidebar?
8. Which investigation layer should open by default for each blocker/limiter?
9. Is Pass Continuity a primary investigation category for all LEO scenarios or only when relevant?
10. Should the desktop Scenario Builder remain globally visible or become the same Configure surface used on mobile?
11. What evidence and provenance must be included in export?
12. What exact confidence wording is acceptable for operational and customer-facing use?

## 18. Non-goals at this stage

This conceptual design intentionally does not define:

- component APIs;
- React ownership or state placement;
- migration phases;
- implementation estimates;
- CSS classes or final visual tokens;
- changes to RF, routing, capacity, regulatory, or confidence computation;
- data-model changes;
- test file changes;
- backward-compatibility strategy.

Those decisions should begin only after the user journey, state grammar, wireframes, and investigation narrative have been validated.

## 19. Final design position

The target Engineering Sidebar is not a smaller report. It is an engineering decision instrument.

It gives the result once, explains it in causal order, grounds it in a resolved path and explicit assumptions, then offers a focused route into proof. GEO and LEO feel like two technologies inside the same analytical product rather than two sidebars that happen to share a frame.

On desktop, the sidebar supports rapid decisions beside the globe. On mobile, the same reasoning becomes a result sheet, a Configure sheet, and an Investigation screen with full capability parity. At the deepest level, the workspace presents closure and evidence without repeating the summary at every turn.

The conceptual design should be validated as a whole before implementation planning begins.
