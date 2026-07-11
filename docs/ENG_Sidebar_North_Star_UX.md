# Engineering Sidebar North Star UX

**Product:** Capacity Analyzer  
**Scope:** Globe-first Engineering experience for GEO and LEO  
**Date:** 2026-07-11  
**Status:** Product UX North Star — conceptual vision only, before implementation planning

## 1. Executive vision

Capacity Analyzer should not feel like a globe beside a technical report. It should feel like one spatial engineering instrument.

The globe shows **where the system exists**. The Engineering experience explains **whether it works, why it works, and what limits it**. Those are not separate products or panels; they are two synchronized expressions of the same model.

The North Star replaces the idea of a permanently dense sidebar with three coordinated surfaces:

1. **The Globe Stage** — the primary spatial and temporal representation of the scenario;
2. **The Engineering Lens** — a compact, adaptive reasoning rail for context, verdict, cause, and next action;
3. **The Investigation Canvas** — a focused environment for closure chains, budgets, comparisons, assumptions, and evidence.

```text
                   ┌────────────────────────┐
                   │    SCENARIO MODEL      │
                   │ endpoints, topology,   │
                   │ assumptions, time      │
                   └───────────┬────────────┘
                               │
               ┌───────────────┼────────────────┐
               │               │                │
               ▼               ▼                ▼
       ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐
       │ GLOBE STAGE  │ │ ENG. LENS    │ │ INVESTIGATION   │
       │ where / when │ │ decision / why│ │ proof / compare │
       └──────────────┘ └──────────────┘ └─────────────────┘
               ▲               ▲                ▲
               └───────────────┴────────────────┘
                    one selection and focus model
```

The experience tells one engineering story:

> **Scenario → Path → RF closure → Service gates → Delivery constraints → Delivered result**

At every depth, the user sees the same conclusion, the same active direction, the same path, and the same assumptions. Detail increases; meaning does not change.

The ambition is to make Capacity Analyzer a benchmark application by combining:

- the immediacy of a modern spatial product;
- the rigor and traceability of an engineering tool;
- the narrative clarity of a decision-support system;
- the interaction quality of a professional creative application;
- complete capability parity across desktop and mobile.

## 2. The assumptions this vision challenges

### 2.1 A sidebar does not need to be permanently full-height

A fixed full-height rail encourages accumulation. The North Star uses an adaptive Engineering Lens:

- **quiet** before a scenario exists;
- **compact** when the result is understood;
- **expanded** when the user asks why;
- **replaced by the Investigation Canvas** when proof is required.

The amount of interface reflects the current engineering task.

### 2.2 More visible data does not create more engineering confidence

Confidence comes from a clear causal chain, traceable assumptions, and consistent provenance. Repeating KPIs in multiple cards creates doubt rather than rigor.

### 2.3 The globe is not a background visualization

The globe is an analytical surface. It must show:

- which path the verdict describes;
- which node or segment is limiting;
- what is auto-selected versus manually fixed;
- how direction changes path order;
- how a LEO path changes over time;
- which geometry remains valid when service is blocked.

### 2.4 Configuration should not occupy the entire default view

Most of the time, an engineer reviews a result or investigates a cause. Configuration is a deliberate mode with a clear baseline and consequence preview. It should not compete continuously with results.

### 2.5 GEO and LEO do not need separate UX grammars

Their physics and infrastructure differ. Their top-level engineering questions do not. They share the same reasoning sequence and interaction grammar, then diverge at the proof layer.

### 2.6 Mobile is not a read-only companion

An engineer in the field must be able to create, edit, compare, diagnose, and export the same scenario. Mobile changes spatial composition, never analytical capability.

### 2.7 “Available” is not enough

The useful conclusion is composed:

> **Service available — 8 Mbps delivered, constrained by beam sharing, High confidence.**

The interface must distinguish service availability, RF margin, delivery constraints, and evidence confidence without turning them into competing status badges.

## 3. Product mental model

### 3.1 The six engineering questions

The complete product is organized around six questions, not around components or datasets.

| Question | User meaning | Primary surface |
|---|---|---|
| What am I testing? | endpoints, topology, direction, assumptions, time | Scenario Ribbon / Lens context |
| Does it work? | authoritative end-to-end verdict | Engineering Lens |
| What do I get? | delivered throughput, latency, availability | Engineering Lens |
| Why? | first blocker or largest constraint | Cause Chain |
| Where is that happening? | path node/segment on the system | Globe Stage |
| Can I prove or change it? | budgets, inputs, evidence, alternatives | Investigation Canvas / Configure |

### 3.2 The three depths of everyday use

The five conceptual engineering depths defined in the target design are experienced through three product postures:

#### Decide

The Lens shows the scenario, authoritative verdict, delivered KPIs, confidence, and decisive factor.

#### Explain

The Lens expands to show the causal chain and resolved path. The globe highlights the relevant node or segment.

#### Prove

The Investigation Canvas takes over the analysis area and exposes the complete closure, assumptions, evidence, and comparisons.

```text
DECIDE                     EXPLAIN                    PROVE
Does it work?              Why?                      Show the engineering
What is delivered?         Where is the issue?       derivation and evidence

[compact Lens]    →        [expanded Lens]    →      [Investigation Canvas]
```

### 3.3 One authoritative result object

All surfaces express the same conceptual result:

- scenario identity and revision;
- active technology, topology, and direction;
- path resolution state;
- RF closure state;
- service gate state;
- delivery state;
- delivered performance;
- decisive factor;
- confidence and evidence state;
- temporal validity.

The UI never computes a separate “summary truth.” It changes presentation depth only.

## 4. The spatial UX system

### 4.1 Globe Stage

The Globe Stage occupies the dominant area. It provides spatial, network, and temporal context.

Its default visual hierarchy is:

1. active endpoints;
2. active service path;
3. limiting or selected segment;
4. supporting infrastructure;
5. candidate alternatives;
6. ambient constellation/context.

The globe progressively removes unrelated detail as the user moves from Explore to Explain to Prove.

### 4.2 Scenario Ribbon

The Scenario Ribbon is a thin global context band, not a permanent control dashboard.

It shows:

- Site A and Site B or access destination;
- current time or time window;
- technology scope;
- scenario revision/freshness;
- a single **Configure** action;
- a compact technology comparison when multiple results exist.

It never exposes all terminal and RF controls at once.

### 4.3 Engineering Lens

The Lens is the successor to the conventional sidebar.

It has three heights/depths:

- **Summary:** verdict and primary KPIs;
- **Reasoning:** cause chain, path, and next action;
- **Review:** assumptions, evidence freshness, and investigation index.

The user controls depth explicitly. The Lens can remember depth per scenario, but blocked or incomplete results always open at the depth needed to understand the problem.

### 4.4 Investigation Canvas

The Canvas is a mode of the analysis workspace, not a drawer placed over another drawer.

It contains:

- a persistent scenario/result bar;
- an engineering story navigator;
- one selected closure or evidence view;
- an optional reduced globe context pane;
- comparison and export actions.

### 4.5 Mobile Result Stack

On mobile, the same system becomes a navigable stack:

```text
Globe
  ↕
Result Peek
  → Result Story
  → Configure
  → Investigation
```

These are sibling states with predictable back navigation. They do not stack multiple modals.

## 5. Desktop North Star

### 5.1 Desktop — scenario created, first result

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CAPACITY ANALYZER   [Engineering]   Scope: ALL   14:32 UTC                   Search  Help  •••│
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ① SCENARIO  Paris, FR  ───────────────→  Dakar, SN    Live assumptions · Rev 12  [Configure] │
│              GEO available · LEO available                              [Compare technologies]│
├──────────────────────────────────────────────────────────────────┬───────────────────────────┤
│                                                                  │ ② ENGINEERING LENS       │
│                                                                  │                           │
│                                                                  │ GEO · Star Forward       │
│                                                                  │ GW → Satellite → Paris   │
│                                                                  │ [AUTO]  Direction: FWD   │
│                                                                  │                           │
│                                                                  │ ● SERVICE AVAILABLE       │
│                                                                  │ Constrained by downlink   │
│                         ③ GLOBE STAGE                           │ beam sharing              │
│                                                                  │                           │
│       Paris ●────────────── KVHTS ○──────────────● Dakar        │ ↓ 42 Mbps   ↑ 8 Mbps      │
│                    active route emphasized                       │ 271 ms one-way            │
│                    other context subdued                         │ Availability 99.8% ind.   │
│                                                                  │ Confidence High · 91/100  │
│                                                                  │                           │
│                                                                  │ Main factor               │
│                                                                  │ Beam sharing: -118 Mbps   │
│                                                                  │                           │
│                                                                  │ [Why this result]         │
│                                                                  │ [Investigate factor →]    │
│                                                                  │                           │
│                                                                  │ ④ DEPTH  Summary ▾       │
└──────────────────────────────────────────────────────────────────┴───────────────────────────┘
```

#### Annotations

1. **Scenario Ribbon:** one line of context and one Configure action. The result cannot be misread as belonging to another scenario revision.
2. **Engineering Lens:** the first visible answer is a sentence, not a cluster of badges.
3. **Globe Stage:** the active route uses the same endpoint order and direction as the Lens. The limiting segment is subtly differentiated even before investigation.
4. **Depth control:** the user chooses to expand the explanation. The rail does not default to maximum density.

### 5.2 Desktop — expanded reasoning Lens

```text
┌────────────────────────────── ENGINEERING LENS · REASONING ──────────────────────────────┐
│ GEO · Star Forward · AUTO                                           [Configure] [Collapse]│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ● SERVICE AVAILABLE — THROUGHPUT CONSTRAINED                                           │
│ 42 Mbps down · 8 Mbps up · 271 ms one-way · High confidence                            │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ① CAUSE CHAIN                                                                           │
│                                                                                          │
│ ✓ Scenario        ✓ Path          ✓ RF closure       ✓ Service       ! Delivery         │
│   Ready              Resolved        +3.1 dB            Gates pass      Beam sharing      │
│   Paris/Dakar        KVHTS            Marginal                           -118 Mbps          │
│                                                                       └───────────────┐  │
│                                                                       [Investigate →]│  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ② RESOLVED PATH                                                        Selection: AUTO   │
│ Dakar Traffic GW  →  KVHTS / payload  →  DL Beam 042  →  Paris terminal                  │
│ Ka · FWD · Gateway assignment confirmed                         [Show selection reason]   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ③ ASSUMPTIONS & VALIDITY                                                                 │
│ Paris: 1.2 m Enterprise VSAT · Current weather     Data valid at 14:32 UTC                │
│ Dakar: Traffic Gateway capability · Reference weather               [Review assumptions]  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ④ INVESTIGATE                                                                           │
│ [Beam sharing — limiting] [RF margin — marginal] [Latency] [Ground path] [Evidence]       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Information rhythm

- verdict first;
- causal chain second;
- physical path third;
- assumptions fourth;
- deeper destinations last.

The user never scrolls past configuration controls to find the conclusion.

### 5.3 Desktop — Globe/Lens segment synchronization

When the user points at or focuses a stage in the Cause Chain, the globe responds without changing the scenario.

```text
CAUSE CHAIN FOCUS                        GLOBE RESPONSE

Path resolved                    →       all active nodes labeled
RF closure / uplink              →       Site A ↔ satellite segment emphasized
RF closure / downlink            →       satellite ↔ destination emphasized
Service / gateway                →       traffic gateway and relevant link emphasized
Delivery / beam sharing          →       serving beam footprint and satellite emphasized
Latency / backbone               →       ground route and PoP/SNP chain emphasized
```

The relationship is bidirectional:

- hover or keyboard focus previews correspondence;
- click/tap locks focus;
- Escape or **Clear focus** returns to the complete route;
- locking focus never changes configuration;
- selecting **Configure** is required to alter the route.

### 5.4 Desktop — blocked state as a recovery story

```text
┌────────────────────────────── ENGINEERING LENS ──────────────────────────────────────────┐
│ GEO · Star Return · Site A → Gateway                                   [Configure]        │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ⛔ SERVICE BLOCKED                                                                        │
│ Site A uplink does not close                                                              │
│                                                                                           │
│ Computed margin  -2.7 dB          Required margin  ≥ 0.0 dB                              │
│ Confidence       High · 93/100    Delivered service  None                                │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ WHAT THE MODEL ESTABLISHED                                                                │
│ ✓ Scenario ready  ✓ Satellite/beam resolved  ✓ Gateway resolved  ✓ Policy allowed       │
│ ⛔ Uplink RF closure failed                                                               │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ BEST NEXT MOVE                                                                            │
│ Increase terminal EIRP or reduce modeled weather loss.                                    │
│                                                                                           │
│ [Try larger terminal]  [Inspect uplink budget]  [Compare another path]                   │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Diagnostic geometry and RF potential remain available in Investigation.                   │
└──────────────────────────────────────────────────────────────────────────────────────────┘

GLOBE: Site A ━━━━━━━╳━━━━━━ Satellite ───────── Gateway
       failing uplink drawn as the only red segment; resolved geometry remains visible
```

Blocked states are recovery-oriented:

- one blocker;
- one boundary around what remains valid;
- one recommended next move;
- two or three meaningful alternatives;
- no grid of empty KPIs.

### 5.5 Desktop — technology comparison

Comparison is a deliberate mode. It does not force two full sidebars into one rail.

```text
┌──────────────────────────────────── TECHNOLOGY COMPARISON ─────────────────────────────────┐
│ Scenario: Paris → Dakar · same endpoint assumptions                          [Exit compare]│
├──────────────────────────────┬──────────────────────────────┬──────────────────────────────┤
│                              │ GEO                          │ LEO                          │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
│ Verdict                      │ Available · constrained      │ Available                    │
│ Delivered DL / UL            │ 42 / 8 Mbps                  │ 188 / 28 Mbps                 │
│ Primary latency              │ 271 ms one-way               │ 53 ms RTT                     │
│ Main constraint              │ Downlink beam sharing        │ Terminal cap                  │
│ Availability context         │ 99.8% indicative             │ 99.4% indicative              │
│ Confidence                   │ High 91/100                  │ High 94/100                  │
│ Path                         │ Dakar GW → KVHTS → Paris     │ Paris → OW → SNP             │
│                              │ [Focus GEO] [Investigate]    │ [Focus LEO] [Investigate]    │
├──────────────────────────────┴──────────────────────────────┴──────────────────────────────┤
│ Comparison note: latency bases differ. GEO shows one-way FWD; LEO shows access RTT. [Why?] │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Comparison always names differences in metric basis. It never places superficially similar numbers beside each other without direction and time semantics.

### 5.6 Desktop — Configure mode

Configure is not the sidebar with controls expanded. It is a scenario editor with a live consequence preview.

```text
┌──────────────────────────────────── CONFIGURE SCENARIO ────────────────────────────────────┐
│ Paris → Dakar · GEO Star Forward                           Baseline: 42 / 8 Mbps · Available│
├──────────────────────────────────────────────────────────────┬─────────────────────────────┤
│ SCENARIO EDITOR                                              │ CONSEQUENCE PREVIEW         │
│                                                              │                             │
│ Path                                                         │ Current result              │
│ Technology       GEO                                        │ ● Available · constrained   │
│ Topology         [Star Forward ▾]                            │ 42 / 8 Mbps                 │
│ Selection        [● Auto  ○ Manual]                         │                             │
│                                                              │ Pending changes             │
│ Site A — Paris                                               │ Terminal                    │
│ Terminal          [1.2 m Enterprise VSAT ▾]                  │ 1.2 m → 1.8 m              │
│ Weather           [Current: rain ▾]                           │                             │
│ [Advanced RF assumptions]                                    │ Expected affected stages    │
│                                                              │ • Uplink RF closure         │
│ Auto-selected path                                           │ • Delivered uplink          │
│ KVHTS · DL Beam 042 · Dakar Gateway                           │ • Confidence                │
│ Reason: highest valid delivered service score                │                             │
│ [Review candidates]                                          │ No speculative result shown │
│                                                              │ before recalculation.       │
├──────────────────────────────────────────────────────────────┴─────────────────────────────┤
│ [Discard]                                       [Save as variant] [Apply & recalculate]     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

The preview explains impact, not invented performance. Only the model produces a new result.

### 5.7 Desktop — Investigation Canvas with globe context

```text
┌──────────────────────────────────── INVESTIGATION CANVAS ──────────────────────────────────┐
│ [← Result] GEO · Star FWD · Available / constrained · 42 Mbps DL        [Compare] [Export] │
├───────────────────┬──────────────────────────────────────────────┬──────────────────────────┤
│ ① STORY INDEX     │ ② ENGINEERING PROOF                         │ ③ SPATIAL CONTEXT         │
│                   │                                              │                          │
│ ● Delivery closure│ Selected finding                             │      KVHTS ○              │
│   RF closure      │ Beam sharing is the largest throughput loss  │           ╱               │
│   Access          │                                              │   Beam 42 footprint        │
│   Space           │ RF potential       160 Mbps                  │         ╱                  │
│   Ground          │       │ Beam sharing -118 Mbps               │ Paris ●                   │
│   Latency         │       ▼                                      │                          │
│   Availability    │ Shared capacity    42 Mbps                   │ [Full globe]              │
│   Confidence      │       │ Terminal cap: no loss                │                          │
│   Assumptions     │       │ Protocol: no loss                    │ Focus follows selected    │
│   Evidence        │       ▼                                      │ closure segment           │
│                   │ Delivered          42 Mbps                   │                          │
│ Findings          │                                              │                          │
│ ! Beam sharing    ├──────────────────────────────────────────────┤                          │
│ ! DL margin       │ Inputs & provenance                          │                          │
│                   │ Beam load · allocation · model revision      │                          │
│                   │ [Inspect calculation] [Compare beam]         │                          │
└───────────────────┴──────────────────────────────────────────────┴──────────────────────────┘
```

#### Why the globe remains present

Deep engineering analysis can become abstract. The reduced spatial pane prevents the engineer from losing which endpoint, direction, beam, or ground node the calculation describes. It is optional and can be expanded or hidden, but the Canvas always retains spatial grounding.

## 6. Mobile North Star

### 6.1 Mobile — first result over the globe

```text
┌──────────────────────────── 390 px ────────────────────────────┐
│ CA   Scope [ALL ▾]   [ENG]                       Search  •••   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                                                                │
│                         GLOBE                                  │
│                                                                │
│                 Site A ●──────○ ONEWEB                         │
│                            ╲──● SNP                             │
│                                                                │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ LEO · Single Site · AUTO                              [⌃]      │
│ ● Available — beam sharing constrained                        │
│ ↓ 8 Mbps       ↑ 3 Mbps       53 ms RTT                        │
│ [Configure]            [Why]             [Investigate]         │
└────────────────────────────────────────────────────────────────┘
```

The Result Peek is the mobile Engineering Lens in Summary posture. It never hides the active path and never requires expansion to find the verdict.

### 6.2 Mobile — Result Story

```text
┌────────────────────────── RESULT STORY ─────────────────────────┐
│ ━━━━━   LEO · Single Site · AUTO                    [×]         │
│ Site A → ONEWEB-0174 → SNP Florida                [Configure]   │
├─────────────────────────────────────────────────────────────────┤
│ ● SERVICE AVAILABLE                                             │
│ Throughput constrained by beam sharing                          │
│                                                                 │
│ 8 Mbps down      3 Mbps up      53 ms RTT                       │
│ Confidence High · 94/100                                        │
├─────────────────────────────────────────────────────────────────┤
│ WHY                                                              │
│ ✓ Scenario ready                                                │
│ ✓ Path resolved                                                 │
│ ✓ RF closes                                                     │
│ ✓ Service gates pass                                            │
│ ! Delivery: 188 Mbps → 8 Mbps                                   │
│                                  [Focus beam on globe]           │
├─────────────────────────────────────────────────────────────────┤
│ PATH                                                             │
│ Site A → ONEWEB-0174 / Beam 11 → SNP Florida                   │
│ Terminal OW70L · Current weather · Updated now                  │
├─────────────────────────────────────────────────────────────────┤
│ NEXT                                                             │
│ [Investigate beam sharing]                                      │
│ [Compare GEO and LEO]                                           │
│ [Review assumptions]                                            │
├─────────────────────────────────────────────────────────────────┤
│ Compare                         Export                          Reset│
└─────────────────────────────────────────────────────────────────┘
```

The Story has one vertical scroll. Its header remains visible. The **Focus beam on globe** action temporarily lowers the sheet to the Result Peek so the spatial response is visible.

### 6.3 Mobile — spatial focus choreography

```text
1. User taps “Focus beam on globe”
2. Result Story contracts to Result Peek
3. Globe preserves heading and reveals the complete beam footprint
4. Serving satellite and affected access segment become prominent
5. A small anchored explanation appears: “Beam sharing limits delivered DL”
6. User taps the explanation or swipes the Peek up to return to the same Story position
```

The application never moves the camera so aggressively that the endpoint or route context is lost.

### 6.4 Mobile — Configure

```text
┌────────────────────────── CONFIGURE ─────────────────────────────┐
│ [‹ Result]     Paris → Dakar                         [Cancel]    │
├─────────────────────────────────────────────────────────────────┤
│ PATH                                                             │
│ Technology     [GEO ▾]                                          │
│ Topology       [Star Forward ▾]                                 │
│ Direction      Gateway → Paris                                  │
│ Selection      [● Auto  ○ Manual]                               │
├─────────────────────────────────────────────────────────────────┤
│ SITE A — PARIS                                                   │
│ Terminal       [1.2 m Enterprise VSAT ▾]                        │
│ Weather        [Current · rain ▾]                               │
│ [Advanced RF assumptions]                                       │
├─────────────────────────────────────────────────────────────────┤
│ AUTO PATH                                                        │
│ KVHTS · Beam 042 · Dakar Gateway                                │
│ Highest valid delivered service score                           │
│ [Review candidates]                                             │
├─────────────────────────────────────────────────────────────────┤
│ BASELINE                                                         │
│ Available · 42 / 8 Mbps · beam sharing constrained              │
├─────────────────────────────────────────────────────────────────┤
│                         [Apply & recalculate]                    │
└─────────────────────────────────────────────────────────────────┘
```

The mobile Configure experience is not a reduced form. Advanced controls can route to a second level, but all scenario capabilities exist.

### 6.5 Mobile — blocked recovery

```text
┌────────────────────────── RESULT STORY ─────────────────────────┐
│ GEO · Star Return                                    [×]        │
├─────────────────────────────────────────────────────────────────┤
│ ⛔ SERVICE BLOCKED                                             │
│ Site A uplink does not close                                   │
│ Margin -2.7 dB · High confidence                               │
│ No delivered throughput                                        │
├─────────────────────────────────────────────────────────────────┤
│ VALID                                                           │
│ ✓ Scenario  ✓ Satellite/beam  ✓ Gateway  ✓ Policy             │
│ ⛔ Uplink RF                                                    │
├─────────────────────────────────────────────────────────────────┤
│ BEST NEXT MOVE                                                  │
│ Increase EIRP or reduce modeled weather loss                    │
│ [Try larger terminal]                                          │
│ [Inspect uplink budget]                                        │
│ [Compare another path]                                         │
├─────────────────────────────────────────────────────────────────┤
│ Diagnostic geometry remains available. [Show on globe]          │
└─────────────────────────────────────────────────────────────────┘
```

### 6.6 Mobile — Investigation

```text
┌──────────────────────── INVESTIGATION ──────────────────────────┐
│ [‹ Result]  Uplink RF closure                       [Export]    │
│ Blocked · -2.7 dB · Site A → KVHTS                              │
├─────────────────────────────────────────────────────────────────┤
│ [Closure] [Access] [Space] [Ground] [Evidence]                  │
├─────────────────────────────────────────────────────────────────┤
│ UPLINK CLOSURE                                                   │
│                                                                 │
│ Terminal EIRP             47.2 dBW                              │
│ Free-space/path losses   -XXX.X dB                              │
│ Satellite G/T             XX.X dB/K                             │
│ C/N                       XX.X dB                               │
│ Required threshold        XX.X dB                               │
│ ─────────────────────────────────                               │
│ Margin                    -2.7 dB   BLOCKED                     │
│                                                                 │
│ Largest sensitivity: weather + terminal EIRP                    │
│ [Compare terminal] [Review weather assumption]                  │
├─────────────────────────────────────────────────────────────────┤
│ [Show this segment on globe]                                    │
└─────────────────────────────────────────────────────────────────┘
```

On mobile, complex horizontal closure chains become vertical derivations. Tables scroll only when a table is genuinely the clearest representation.

## 7. Globe-first integration contract

### 7.1 The same story vocabulary appears in both surfaces

| Engineering stage | Lens language | Globe representation |
|---|---|---|
| Scenario | endpoints and topology | endpoint markers and route intent |
| Path | resolved/unresolved | active nodes and segments |
| RF closure | margin/MODCOD/blocked | RF segment emphasis and footprint |
| Service gate | allowed/blocked | relevant country, gateway, SNP, or service zone |
| Delivery | limiter/loss | affected beam, terminal, feeder, or backbone |
| Confidence | evidence quality | subtle provenance indicator, never noisy map decoration |

### 7.2 Hover, focus, lock, and configure are distinct

- **Hover:** transient visual preview, no state change;
- **Keyboard focus:** same preview plus accessible description;
- **Lock focus:** persistent analytical emphasis, no scenario change;
- **Configure:** changes the scenario and triggers recalculation.

This distinction prevents accidental route mutation.

### 7.3 Camera principles

1. Preserve visible engineering content, not raw camera coordinates.
2. Never move the camera on simple hover.
3. A locked focus may gently reframe only when the target would otherwise be obscured.
4. Opening/closing the Lens or Canvas compensates for the changed viewport.
5. Preserve heading and orientation unless the user explicitly requests a canonical view.
6. Keep both endpoints visible for site-to-site reasoning whenever possible.
7. On mobile, contract the result sheet before spatial reframing.
8. Allow **Return to route view** after every focused investigation.

### 7.4 Visual path grammar

```text
Active delivered path       solid, highest contrast
Selected/limiting segment   thicker emphasis plus stage color
Resolved diagnostic path    solid but muted
Candidate alternative       thin/dashed, only on request
Unavailable segment         broken line ending at failure marker
Unresolved expected segment dotted placeholder
Backbone/logical route      distinct ground-network pattern
```

Color never carries direction alone. Animated flow and arrowheads communicate direction, with a static accessible equivalent.

### 7.5 Temporal LEO behavior

LEO results are time-dependent. The Globe and Lens share a validity interval:

```text
Now 14:32:10 UTC · Valid for current serving pass
Handover expected in 03:18
```

The user can enter a temporal story mode:

- scrub a short time window;
- see serving satellite/beam transitions;
- see whether the verdict or limiter changes;
- compare current and worst-in-window performance;
- return to Live without losing the scenario.

Pass continuity appears only when it materially affects the result or when requested.

## 8. Engineering storytelling

### 8.1 The first sentence

Every result begins with a sentence that combines state and cause.

Examples:

- **Service available.** RF and service gates pass with no material delivery constraint.
- **Service available — constrained by beam sharing.** RF potential is 188 Mbps; 8 Mbps is delivered.
- **Service degraded — low downlink margin.** The path closes at +0.7 dB.
- **Service blocked — regulatory gate.** RF geometry remains diagnostic-only.
- **No service path — traffic gateway unresolved.** User coverage exists but the end-to-end route is incomplete.
- **RF budget unavailable — frequency evidence missing.** No closure conclusion was produced.
- **Scenario incomplete — Site B required.** Place or search for the destination.

### 8.2 The Cause Chain

The Cause Chain is the core storytelling object.

```text
Scenario → Path → RF → Service → Delivery
```

Rules:

- show five stages consistently across technologies;
- summarize each stage in one short line;
- stop visual progression at the first blocker;
- if no blocker exists, emphasize the largest delivery loss or thinnest margin;
- expose one stage-specific action;
- synchronize the selected stage with the globe;
- preserve the full ordered textual narration for accessibility and export.

### 8.3 The proof narrative

Investigation converts the five-stage story into a derivation:

```text
What entered the stage?
What transformation or gate was applied?
What came out?
What was lost or invalidated?
Which assumptions and sources support it?
What alternative would change it?
```

Every detailed view follows this grammar. Engineers do not need to relearn each panel.

### 8.4 Explain uncertainty honestly

Confidence is not only a score. The visible summary states the most important evidence boundary:

```text
High 94/100 · measured geometry, modeled load
Medium 68/100 · public coverage, gateway assignment estimated
Low 34/100 · RF budget incomplete
```

The Investigation Evidence view provides the complete factor breakdown.

## 9. Interaction flows

### 9.1 Create and evaluate a scenario

```text
Select Site A on globe/search
        ↓
Choose access or site-to-site intent
        ↓
Add Site B if required
        ↓
System evaluates GEO and LEO in scope
        ↓
Technology comparison appears
        ↓
Recommended/focused result enters Engineering Lens
        ↓
Globe renders the exact path described by the verdict
```

The system does not force terminal/weather configuration before producing a default result. Defaults are explicit and editable.

### 9.2 Understand a limited result

```text
Read authoritative verdict
        ↓
Expand Why or select main factor
        ↓
Cause Chain emphasizes Delivery stage
        ↓
Globe highlights affected beam/segment
        ↓
Choose Investigate
        ↓
Canvas opens directly on the loss
        ↓
Compare an alternative without changing baseline
```

### 9.3 Recover from a blocked result

```text
Read blocker and valid-evidence boundary
        ↓
See best next move
        ├─ Try assumption/path variant
        ├─ Inspect failing budget
        └─ Compare another technology
        ↓
If configuration changes, preserve baseline as undoable variant
        ↓
Recalculate and show verdict delta
```

### 9.4 Manual path override

```text
Configure → change Selection from Auto to Manual
        ↓
Review ranked eligible candidates with reason and consequences
        ↓
Select satellite/beam/path
        ↓
Confirm dependent selections that will change
        ↓
Recalculate
        ↓
Lens shows MANUAL and offers Return to Auto
```

The candidate list is an engineering comparison, not a generic dropdown.

### 9.5 Compare a variant

```text
Investigate or Configure → Compare alternative
        ↓
Create temporary variant
        ↓
Show baseline and variant with identical metric bases
        ↓
Globe toggles or splits spatial paths
        ↓
User discards variant or adopts it explicitly
```

### 9.6 Change direction

Direction is changed from the Scenario/Lens context. The product updates:

- route order on the globe;
- serving beams and relevant selection policy;
- verdict metrics;
- Cause Chain labels;
- investigation focus;
- comparison basis.

The transition never makes the old direction look current while recalculation is pending.

## 10. Motion and transition principles

Motion communicates causality and preserves orientation. It is never decorative telemetry.

### 10.1 Motion hierarchy

| Event | Motion purpose | Character |
|---|---|---|
| Result update | show that inputs caused a new conclusion | brief cross-fade/change highlight |
| Lens expand/collapse | reveal depth without losing globe context | smooth width/content transition |
| Segment focus | connect Cause Chain to globe | subtle emphasis, no camera jump |
| Camera reframe | keep selected engineering content visible | short, spatially conservative flight |
| Enter Investigation | change task posture | clear workspace transition, context retained |
| Direction swap | show route reversal | path flow reverses, labels update atomically |
| Auto handover | show temporal path change | continuity-preserving route morph |
| Blocker appears | prevent stale result interpretation | delivered KPIs withdraw before blocker settles |

### 10.2 Timing character

- micro feedback: approximately 120–180 ms;
- Lens posture changes: approximately 220–320 ms;
- camera compensation/reframe: approximately 250–400 ms;
- major mode transition: approximately 280–420 ms;
- temporal route morph: paced to remain legible, with reduced-motion alternative.

Exact timing is subject to prototype validation. The principle is fast acknowledgement, readable causality, and no abrupt loss of spatial context.

### 10.3 Updating sequence

When a configuration changes:

1. changed inputs highlight;
2. result receives **Updating** state;
3. old delivered KPIs mute and display their timestamp/revision;
4. Cause Chain stages show progress in engineering order;
5. globe path updates only when the new path is coherent;
6. new verdict, metrics, and path appear as one revision;
7. changed outputs briefly emphasize;
8. an optional **Review changes** action explains the delta.

### 10.4 Reduced motion

With reduced motion enabled:

- camera changes use instant but context-preserving framing;
- path flow uses static arrowheads;
- fades are minimized;
- no pulsing status or continuous ambient animation is required to understand state.

## 11. Visual hierarchy and information rhythm

### 11.1 The visual priority stack

```text
1. Overall verdict and cause
2. Delivered performance
3. Active path and direction
4. First blocker / largest constraint
5. Confidence and validity
6. Assumptions and provenance
7. Alternative actions
8. Deep evidence
```

Nothing below level 4 should visually compete with the verdict.

### 11.2 A disciplined density system

The product supports three density layers:

- **Decision density:** generous spacing, sentences, large primary metrics;
- **Reasoning density:** compact aligned stages, path nodes, short evidence lines;
- **Proof density:** tables, equations, margin stacks, and technical metadata.

Proof density exists only in Investigation.

### 11.3 Surface hierarchy

- one dominant Verdict surface;
- Cause Chain uses a structured flow rather than five isolated cards;
- path and assumptions use quiet evidence rows;
- investigation destinations look navigational;
- controls look like controls, never like status cards;
- deep tables use stable columns and sticky headers.

### 11.4 Typography

- verdict: plain-language headline, strongest weight;
- metrics: large tabular numerals, explicit direction and time basis;
- cause: sentence case with technical nouns preserved;
- identifiers: monospace selectively for beam IDs, satellite IDs, coordinates, and equations;
- units stay attached to values and never rely on headers alone;
- long engineering names wrap rather than disappear behind unexplained truncation.

### 11.5 Color

State and technology use independent channels:

- GEO/LEO identity: accent line, icon, or label;
- Available: restrained positive state;
- Constrained/Marginal: amber;
- Blocked: red/rose;
- Incomplete/Unknown: neutral slate;
- Manual override: distinct violet or authored-state treatment;
- Focus: high-contrast outline independent of state.

The globe and Lens share tokens for selected stages, but the map remains legible in light/dark modes and for color-vision differences.

### 11.6 Empty space is functional

Whitespace separates reasoning chapters. It signals the difference between verdict, explanation, evidence, and action. Compactness is earned through removal of duplication, not through smaller type and tighter padding.

## 12. Progressive disclosure rules

### Always visible in a result

- technology/topology/direction;
- Auto/Manual selection state;
- authoritative verdict;
- delivered primary KPIs or explicit absence;
- confidence summary;
- decisive blocker/constraint;
- Why and Investigate actions.

### Visible when the Lens expands

- full Cause Chain;
- compact resolved path;
- assumptions and validity;
- investigation index;
- best next actions.

### Visible only in Investigation

- full RF budgets;
- detailed margin stacks;
- MODCOD and spectral assumptions;
- complete hop and latency breakdown;
- load/capacity derivation;
- pass timeline and handover detail;
- confidence factor breakdown;
- data sources and model revision detail;
- alternative comparison matrices.

### Visible only in Configure

- editable terminal and weather inputs;
- topology and selection policy controls;
- candidate path selection;
- advanced RF parameters;
- variant management.

## 13. State experience

### 13.1 Available

The path and delivered result dominate. Cause Chain is fully passed. Investigation suggests the thinnest margin or largest non-blocking loss without inventing a problem.

### 13.2 Available but constrained

Availability and constraint are expressed together. Delivered KPIs remain valid. The largest loss is visible and linked to the globe.

### 13.3 Degraded or marginal

The interface says what is degraded, how close the threshold is, and whether the delivered result remains valid.

### 13.4 Blocked

No delivered KPIs are shown. The blocker, valid evidence, diagnostic boundary, and best next action dominate.

### 13.5 Path unavailable

The Lens distinguishes:

- no coverage candidate;
- satellite/beam unresolved;
- gateway/SNP/backbone unresolved;
- path unsupported by topology;
- operational route unavailable.

The globe shows resolved geometry and a dotted expected continuation only if useful.

### 13.6 Budget unavailable

The interface makes clear that no RF conclusion exists. It names the missing evidence and avoids labeling the link blocked or healthy.

### 13.7 Incomplete

The interface becomes a guided completion state. It does not render downstream sections with dashes.

### 13.8 Uncertain

Provisional values can be shown if meaningful, but the evidence boundary is part of the headline. The user can inspect exactly what is estimated.

### 13.9 Stale or changing

The result carries its revision/time validity. Live changes preserve the previous result long enough to explain what changed, without presenting it as current.

## 14. GEO and LEO consistency

### Shared above the proof layer

- same Scenario Ribbon;
- same Lens postures;
- same verdict grammar;
- same delivered KPI rules;
- same Cause Chain stages;
- same Auto/Manual interaction;
- same direction interaction;
- same blocked/incomplete recovery pattern;
- same Investigation entry behavior;
- same mobile navigation.

### GEO-specific proof

- Star Forward/Return and terminal-to-terminal semantics;
- endpoint-specific uplink/downlink beams;
- gateway requirements and assignment evidence;
- payload/transponder context;
- combined GEO margin and topology/protocol efficiency;
- dedicated versus shared-service constraints.

### LEO-specific proof

- serving satellite/beam geometry;
- SNP and feeder path;
- backbone/PoP for site-to-site;
- beam sharing/load;
- terminal cap;
- handover and pass continuity;
- time-window validity.

Consistency means shared questions and behaviors, not identical technical diagrams.

## 15. Desktop and mobile consistency contract

| Capability | Desktop | Mobile |
|---|---|---|
| Create/edit scenario | Scenario Ribbon → Configure | Configure screen |
| Read verdict | Engineering Lens | Result Peek / Story |
| Understand cause | Expanded Lens | Result Story |
| Spatial focus | side-by-side globe response | sheet contracts to reveal globe |
| Change topology/direction | Configure or Lens context | Configure |
| Manual path override | candidate comparison in Configure | same comparison as routed screen |
| Deep investigation | Canvas with spatial pane | Investigation screen with Show on globe |
| Compare technology/variant | comparison workspace | routed comparison screen |
| Export | result/Canvas action | Result/Investigation action |
| Accessibility | complete keyboard/focus model | touch plus switch/keyboard support |

The content and meaning are the same. Only spatial arrangement changes.

## 16. Accessibility and professional-use quality

### 16.1 Accessible engineering narration

The verdict is announced as one sentence. The Cause Chain has an ordered textual equivalent. Globe focus changes announce the selected node/segment and its state without reading every map element.

### 16.2 Keyboard and focus

- predictable order: scenario → Lens → Cause Chain → actions;
- arrow-key navigation through stages and comparison columns;
- workspace navigation index is keyboard operable;
- Escape steps back one depth;
- focus returns to the originating action;
- no background surface remains accidentally tabbable under a modal mobile state.

### 16.3 Precision and copyability

Technical values can be copied with units and labels. Long IDs wrap or expose a copy action. Tooltips never contain essential conclusions.

### 16.4 Auditability

Every result exposes:

- scenario revision;
- time validity;
- assumptions summary;
- Auto/Manual state;
- model/evidence confidence;
- route identity;
- exportable narrative and detailed evidence.

### 16.5 High-stress usability

Blocked and changing states avoid flashing, excessive red, or ambiguous animation. The product prioritizes the cause and next action under time pressure.

## 17. What makes this a benchmark engineering application

### 17.1 It is spatially truthful

Every analytical statement can be located on the globe or identified as non-spatial. The selected path, direction, and limiter remain coherent across views.

### 17.2 It is causally legible

The user sees how a scenario becomes a delivered result. The interface does not hide model stages behind disconnected cards.

### 17.3 It distinguishes fact, estimate, and decision

Measured/configured inputs, modeled results, inferred path elements, diagnostic estimates, and final delivered performance have explicit provenance.

### 17.4 It supports expert depth without punishing routine work

The default view is decisive. The deepest view is rigorous. Neither compromises the other.

### 17.5 It treats blocked states as engineering work, not errors

A blocked result is a successful diagnosis with valid evidence and a recovery path.

### 17.6 It preserves analytical context during interaction

Opening panels, focusing segments, changing direction, comparing variants, and moving between mobile screens never makes the user lose which route or result they are studying.

### 17.7 It earns trust through consistency

The same verdict, metrics, assumptions, and cause appear everywhere. Only the depth changes.

## 18. North Star validation journeys

Before implementation planning, interactive prototypes should validate the experience through these journeys.

### Journey A — Five-second feasibility

Select a location, compare GEO/LEO, focus a technology, and correctly state verdict, delivered performance, limiter, and confidence.

### Journey B — Limited-path diagnosis

Recognize “available but constrained,” locate the loss in the Cause Chain, see it on the globe, and open the correct proof view.

### Journey C — Blocked-path recovery

Distinguish resolved geometry from failed RF/service, identify what remains valid, and choose the best next move.

### Journey D — Manual override

Understand Auto selection, create a manual path override, understand dependent changes, recalculate, and return to Auto.

### Journey E — Direction asymmetry

Compare A→B and B→A without confusing metric bases or overwriting direction-specific context.

### Journey F — Time-dependent LEO

Understand current pass validity, inspect an upcoming handover, and return to Live.

### Journey G — Mobile field workflow

Create a scenario, configure a terminal, diagnose a blocker, focus the relevant globe segment, and export without desktop access.

### Journey H — Accessibility

Complete feasibility and blocked diagnosis using keyboard and screen-reader narration, with no dependence on hover or color.

## 19. Experience-level acceptance criteria

The North Star is successful when:

- the first result can be understood in five seconds;
- the cause can be understood in fifteen seconds;
- the user never sees contradictory overall statuses;
- delivered and diagnostic values cannot be confused;
- every blocker has a valid-evidence boundary and next action;
- every key cause can be located on the globe or explicitly identified as non-spatial;
- the globe never becomes decorative during investigation;
- the Engineering Lens does not exceed decision-and-explanation scope;
- deep proof is reachable in one intentional action;
- configuration cannot be mistaken for inspection;
- Auto and Manual path selection are always visible;
- direction and metric basis are always explicit;
- desktop and mobile offer the same analytical capability;
- each surface has one scroll owner and predictable focus behavior;
- visual density increases only with investigation depth;
- result updates preserve provenance and revision coherence;
- the experience remains understandable for both available and blocked paths;
- GEO and LEO feel like one product with technology-specific proof.

## 20. Decisions to validate before implementation planning

1. Should the Engineering Lens default to Summary or Reasoning posture for expert users?
2. Should blocked/incomplete results always force Reasoning posture?
3. What is the exact canonical latency basis for cross-technology comparison?
4. Which constraints qualify for “available but constrained” versus “degraded”?
5. Which path elements are eligible for manual override in GEO and LEO?
6. Should Configure apply as a transaction or support live field-by-field recalculation?
7. How should scenario variants be named, saved, and compared?
8. Which Cause Chain stages can be mapped spatially for every topology?
9. When should the Investigation Canvas retain a globe pane versus use the full width for proof?
10. What time horizon defines a meaningful LEO continuity result?
11. Which assumptions and provenance must remain visible in Summary posture for operational use?
12. Which parts of the engineering narrative belong in exported evidence by default?

## 21. Explicit non-goals

This document does not define:

- current-component reuse;
- code architecture;
- state-management ownership;
- migration strategy;
- delivery phases;
- implementation estimates;
- final typography, color values, or production tokens;
- changes to routing, RF, capacity, regulatory, confidence, or selection computation;
- test-file structure;
- backward compatibility.

Those questions begin only after the product journey, spatial model, state grammar, wireframes, and interaction principles are validated.

## 22. Final North Star statement

The ideal Capacity Analyzer Engineering experience is a globe-first reasoning system.

The user starts with a spatial scenario, receives one authoritative engineering conclusion, follows a visible causal chain, locates the decisive factor on the globe, and enters a focused proof environment only when necessary. Configuration, result, and evidence are unmistakably different activities. GEO and LEO share the same story while retaining their technical truth. Desktop and mobile preserve the same analytical capability and meaning.

The Engineering Lens stays concise because it knows its job. The Investigation Canvas goes deep because it has room and purpose. The globe remains the anchor throughout.

That is the product UX North Star: not a prettier sidebar, but a coherent engineering instrument in which space, calculation, evidence, and decision behave as one.
