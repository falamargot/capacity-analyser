# Engineering Motion UX North Star

**Product:** Capacity Analyzer  
**Scope:** Motion behavior for the Globe Stage, Engineering Lens, Configure experience, Result Story, and Investigation Canvas  
**Date:** 2026-07-11  
**Status:** Conceptual Motion UX specification — before implementation planning

## 1. Purpose

Capacity Analyzer should feel like a living engineering instrument, not because elements are continuously animated, but because every action produces a visible, ordered, and intelligible consequence.

Motion has one job:

> **Help the user understand what changed, why it changed, and where it changed.**

The product’s engineering narrative is:

```text
Scenario
  → Path resolution
  → RF closure
  → Service gates
  → Delivery constraints
  → Delivered result
```

Motion makes this causal sequence perceivable over time.

When the user changes a terminal, the interface should not simply replace 8 Mbps with 24 Mbps. It should reveal that:

1. the terminal assumption changed;
2. the RF and delivery stages are being recomputed;
3. the resolved spatial path remained the same or changed;
4. the terminal cap stopped being the limiter;
5. a different constraint became decisive;
6. the delivered result became 24 Mbps;
7. confidence and validity were updated as part of the same result revision.

Motion is therefore part of engineering explanation and provenance.

## 2. Motion UX principles

### 2.1 Motion follows causality

The order of visible change follows the order of engineering dependency. Inputs change first. Dependent reasoning stages update next. The spatial path updates when coherent. The verdict and delivered metrics settle last as one result revision.

### 2.2 Meaning changes atomically

The interface must never combine:

- a new path with an old verdict;
- a new direction with old metrics;
- a new satellite with an old beam label;
- a blocked state with stale delivered KPIs;
- a new confidence score with old evidence wording.

Intermediate progress can be shown, but it is clearly marked as incomplete. A result becomes current only when its related path, reasoning, metrics, confidence, and validity are coherent.

### 2.3 Spatial continuity matters more than panel continuity

Opening or closing the Engineering Lens or Investigation Canvas must preserve the meaningful route in view. The camera may compensate for changed usable space. It should not mechanically restore old camera coordinates if doing so would hide endpoints or the selected segment.

### 2.4 Motion never hides uncertainty

Animations must not imply that a result is known before computation completes. Speculative values are never animated toward a guessed destination. Estimated or diagnostic values retain their provenance during transition.

### 2.5 Motion respects user intent

- Hover previews; it does not navigate or reframe the camera.
- Focus reveals correspondence; it does not alter the scenario.
- Selection locks analytical focus; it does not change configuration.
- Configure changes the scenario only after a clear commit or reversible direct action.

### 2.6 Motion is interruptible

Professional users move quickly. Lens transitions, camera flights, recalculation stories, and investigation navigation must accept a new instruction without forcing the user to wait for the previous animation to finish.

### 2.7 Motion is quiet at rest

A stable result does not pulse, shimmer, count continuously, or animate ambient status. The living quality comes from meaningful response, temporal satellite motion, and state changes—not decorative activity.

### 2.8 Reduced motion preserves the story

Removing movement must not remove causality. Reduced-motion mode uses ordered state replacement, step emphasis, explicit labels, and context-preserving instant framing.

## 3. The Causal Transition Contract

Every scenario-affecting action follows the same conceptual transaction:

```text
INTENT
  User changes or commits an input
      ↓
IMPACT
  Product identifies affected reasoning stages
      ↓
COMPUTE
  Stages resolve in engineering dependency order
      ↓
SPATIAL COMMIT
  Coherent path revision appears on the globe
      ↓
RESULT COMMIT
  Verdict, metrics, cause, confidence and validity settle together
      ↓
DELTA
  Product briefly explains what materially changed
```

### 3.1 Intent

The initiating control responds immediately:

- pressed/selected feedback;
- changed field emphasis;
- explicit pending value;
- optional Undo for direct changes;
- no unrelated panel motion yet.

### 3.2 Impact

Before calculation starts, the product identifies affected stages.

Example after changing weather:

```text
Weather changed: Clear → Heavy rain
Recomputing: RF closure, delivery, confidence
Unchanged: endpoints, topology, resolved gateway
```

This can be expressed compactly in Configure and through stage states in the Cause Chain.

### 3.3 Compute

The Cause Chain becomes a progress narrative:

```text
✓ Scenario ready
✓ Path retained
… Recomputing RF closure
○ Service gates waiting
○ Delivery waiting
```

Stages do not animate as complete before their inputs are current.

### 3.4 Spatial commit

The globe changes only when a coherent path revision is available.

- If the path is unchanged, it remains stable and a small path-retained acknowledgement appears.
- If a segment changes, the old segment fades to diagnostic context while the new segment draws into place.
- If the entire path changes, the old route remains briefly as a labeled previous route until the new path is legible.
- If no path resolves, the old route withdraws before the new unresolved/blocked representation appears.

### 3.5 Result commit

The Engineering Lens publishes the new result as one revision:

- verdict;
- delivered metrics or explicit absence;
- decisive factor;
- confidence;
- time validity;
- Auto/Manual selection state;
- Cause Chain completion states.

### 3.6 Delta

Only material changes receive emphasis.

```text
Result updated
DL 8 → 24 Mbps
Limiter changed: Terminal cap → Beam sharing
Path unchanged
```

The delta remains available through **Review changes**, then becomes quiet.

## 4. Motion vocabulary

The product uses a small, consistent motion vocabulary.

### 4.1 Acknowledge

Immediate, local response confirming input or focus.

Examples:

- button press;
- field change highlight;
- Cause Chain stage hover;
- selected path node outline.

Typical character: 100–160 ms, minimal displacement.

### 4.2 Reveal

Introduces deeper information while preserving the originating object.

Examples:

- Engineering Lens Summary → Reasoning;
- Cause Chain detail expansion;
- assumptions disclosure;
- investigation table detail.

Typical character: 180–280 ms, content appears from its logical origin rather than from an arbitrary screen edge.

### 4.3 Recompose

Changes spatial layout while retaining context.

Examples:

- Configure replaces the Result Lens;
- Investigation Canvas expands;
- mobile Result Story contracts to expose the globe;
- desktop globe viewport changes when the Lens widens.

Typical character: 240–380 ms, coordinated layout and camera compensation.

### 4.4 Resolve

Shows causal computation and result settlement.

Examples:

- Cause Chain stages completing;
- path resolving on the globe;
- verdict and metrics committing;
- state changing from constrained to available.

Duration follows real work. Short computations use a compact resolve sequence; long computations show stage progress without fake minimum delays.

### 4.5 Trace

Connects analytical focus across Lens, Globe, and Canvas.

Examples:

- hover a downlink stage and highlight the corresponding globe segment;
- select beam sharing and reveal the beam footprint;
- select backbone latency and emphasize the ground route.

Typical character: 120–220 ms for emphasis; no camera movement on hover.

### 4.6 Transfer

Moves the user’s mental focus from one surface to another.

Examples:

- **Investigate uplink** transfers the selected blocker into the Canvas;
- mobile **Show on globe** contracts the sheet and keeps the same segment selected;
- **Back to Result** returns to the originating Cause Chain stage.

The selected object persists visually throughout the transition.

### 4.7 Withdraw

Removes information that is no longer valid before presenting a contradictory state.

Examples:

- delivered KPIs withdraw when service becomes blocked;
- old path withdraws when a direction change invalidates it;
- candidate alternatives disappear when comparison ends.

Withdraw is deliberate but quick. It prevents stale meaning from coexisting with new meaning.

## 5. Surface posture state model

### 5.1 Desktop

```text
EXPLORE
  └─ no scenario / lightweight guidance

RESULT · SUMMARY
  └─ compact Engineering Lens + full Globe Stage

RESULT · REASONING
  └─ expanded Lens + compensated Globe Stage

CONFIGURE
  └─ scenario editor + baseline/consequence preview

INVESTIGATE
  └─ Investigation Canvas + optional spatial context pane

COMPARE
  └─ aligned result/variant view + synchronized spatial paths
```

### 5.2 Mobile

```text
GLOBE + RESULT PEEK
  ↕
RESULT STORY
  ↔ CONFIGURE
  ↔ INVESTIGATION
  ↔ COMPARE
```

Mobile surfaces are sibling navigation states. One sheet/screen exits before another enters. There are no stacked analytical modals.

## 6. Configure ↔ Result choreography

### 6.1 Result → Configure on desktop

The objective is to preserve the baseline and make clear that the user is entering an editing posture.

#### Timeline

```text
T+0 ms       User activates Configure
T+0–120      Configure action acknowledges; Result Lens marks baseline
T+80–300     Lens content recomposes into Scenario Editor
T+120–320    Globe slightly de-emphasizes result-only overlays, active route remains
T+220–360    Baseline summary settles beside/below editor
T+360        First editable field receives focus; no camera movement
```

#### Visual continuity

- scenario identity remains in the same top context position;
- current verdict compresses into **Baseline** rather than disappearing;
- the active route stays visible on the globe;
- editable fields appear where the Context area originated;
- result evidence becomes quieter but remains identifiable.

#### What must not happen

- a full-screen form abruptly replaces the globe without context;
- the result vanishes, leaving the user unable to compare edits to baseline;
- the camera reframes merely because configuration opened;
- fields animate independently in a distracting cascade.

### 6.2 Editing within Configure

Field changes use two states:

- **Draft:** edited but not applied;
- **Committed:** accepted into a new scenario revision.

Draft fields receive a persistent authored-state marker. The consequence preview lists affected stages but does not invent new performance.

```text
Terminal: 1.2 m → 1.8 m   [DRAFT]
Affected: Uplink RF, delivery, confidence
Path expected to remain; not yet recalculated
```

If a control is intentionally live, the product treats every change as a small committed revision with Undo. It never mixes draft and live semantics in the same form without labeling them.

### 6.3 Configure → Result after Apply

#### Storyboard

```text
FRAME 1 — COMMIT
┌ Configure ─────────────────────┐
│ Terminal 1.8 m [changed]       │
│ [Applying…]                    │
└────────────────────────────────┘

FRAME 2 — CAUSAL PROGRESS
┌ Engineering update ────────────┐
│ ✓ Scenario                     │
│ ✓ Path retained                │
│ … RF closure                   │
│ ○ Service                      │
│ ○ Delivery                     │
└────────────────────────────────┘

FRAME 3 — SPATIAL COMMIT
Globe: route remains; Site A access segment briefly emphasizes

FRAME 4 — RESULT COMMIT
┌ Result ────────────────────────┐
│ Available · 24 Mbps            │
│ Limiter: Beam sharing          │
│ Result updated from Rev 12     │
└────────────────────────────────┘

FRAME 5 — DELTA
DL 8 → 24 Mbps · limiter changed · path unchanged
```

The editor does not close before the commit is acknowledged. The Result posture appears when the new revision has enough coherent state to explain itself.

### 6.4 Cancel / discard

Cancel reverses only the Configure posture. The baseline route and result regain normal emphasis. No recalculation animation occurs because no scenario changed.

If drafts exist, the transition explicitly withdraws draft markers before returning to Result.

## 7. Result ↔ Investigation choreography

### 7.1 Result → Investigation on desktop

Investigation is entered from a specific cause, segment, or evidence question whenever possible.

#### Example: Investigate beam sharing

```text
T+0          User selects “Investigate beam sharing”
T+0–140      Delivery stage and beam-sharing factor lock focus
T+80–260     Globe emphasizes serving satellite and beam footprint
T+140–360    Investigation Canvas grows from the selected Lens region
T+180–380    Lens summary transfers into the Canvas context bar
T+240–420    Engineering proof opens directly at Beam sharing
T+320–440    Optional spatial pane settles with the same beam selected
```

The selected factor acts as a visual thread. The user sees it in the Lens, on the globe, in the Canvas title, and in the first proof view.

### 7.2 Investigation without a specific factor

If the user opens general Investigation:

- the Canvas opens at the decisive blocker/constraint;
- if no meaningful limiter exists, it opens at the complete closure overview;
- the transition states the chosen starting point: **Opening at downlink margin — thinnest closure**.

### 7.3 Investigation → Result

The Canvas collapses toward the originating Lens location. The selected stage remains focused in the expanded Reasoning Lens. The globe returns from local segment context to the complete route only after the Lens is ready.

```text
Canvas proof
   ↓ Back to Result
Canvas context bar becomes Lens verdict
   ↓
Selected investigation becomes focused Cause Chain stage
   ↓
Globe widens from segment focus to full route
```

Scroll position in the Canvas is not mapped mechanically into the Lens. The semantic origin—such as RF closure, beam sharing, or latency—is restored.

### 7.4 Switching investigation sections

Changing Access → Space → Ground does not re-enter the Canvas. The proof area cross-recomposes around the persistent story index and context bar.

- related spatial focus updates after the new section heading is visible;
- camera does not move unless the selected evidence requires a different region and the target is obscured;
- rapid navigation cancels previous section transitions;
- selected section and globe focus commit together.

## 8. Progressive construction of engineering reasoning

### 8.1 The Cause Chain is both result and progress

The five stages remain in stable positions:

```text
Scenario → Path → RF → Service → Delivery
```

Their state changes, not their order. Stable placement lets the user learn the system and see which stage is active.

### 8.2 Short recalculation

For computations that resolve almost immediately, do not artificially slow the interface. Use a compressed causal sequence:

1. affected stages enter Updating;
2. the first affected stage acknowledges;
3. final coherent revision commits;
4. changed stage and final cause highlight briefly.

The sequence can complete in a few hundred milliseconds while preserving order.

### 8.3 Long recalculation

For meaningful waiting periods, stages communicate real progress.

```text
✓ Scenario ready
✓ Path resolved · KVHTS / Beam 42
… Computing RF closure
○ Service gates waiting for RF
○ Delivery waiting for service
```

If a stage has sub-work worth exposing:

```text
RF closure
  ✓ Uplink
  … Payload / downlink
```

Do not expose implementation tasks such as “loading chunk” or “running hook.” Only engineering-relevant progress is shown.

### 8.4 Stop at the blocker

When a stage blocks:

- the stage resolves to Blocked;
- downstream stages become **Not evaluated** or **Diagnostic only**, not Failed;
- delivered KPIs withdraw;
- the globe marks the failing segment/gate;
- the Verdict commits to the blocker;
- a next action reveals after the blocker is readable.

```text
✓ Scenario
✓ Path
⛔ RF blocked
— Service not evaluated
— Delivery not available
```

### 8.5 Constrained success

When all gates pass but delivery is limited:

- the successful chain completes through Service;
- Delivery resolves last with an amber constraint;
- RF potential and delivered output connect visually;
- the Verdict remains Available while the constraint appears as its qualifier.

### 8.6 Complete success

When no material constraint exists:

- all stages complete without celebratory animation;
- the Verdict settles as Available;
- the thinnest margin may receive a quiet investigation cue;
- no artificial “confetti” or pulsing healthy state occurs.

## 9. Scenario update and recalculation feedback

### 9.1 A result revision is the unit of truth

Every committed update receives a conceptual revision identity and validity time. Surfaces transition from Revision N to Revision N+1 together.

During calculation:

```text
Current: Rev 12 · valid at 14:32:10
Updating to Rev 13 · terminal changed
```

After commit:

```text
Rev 13 · updated now
Changed: terminal, RF closure, delivered DL, limiter
Unchanged: path, gateway, regulatory state
```

### 9.2 Stale-value treatment

Old metrics can remain visible for comparison, but they must be visually and semantically marked:

- muted;
- timestamped;
- labeled Previous or Updating;
- excluded from the current authoritative verdict;
- never mixed with new path labels.

### 9.3 Incremental live updates

Time, LEO motion, weather, load, and service inputs may update without a direct user action.

The product distinguishes:

- **expected continuous update:** satellite motion or countdown;
- **material result revision:** serving path, verdict, delivered performance, or limiter changed;
- **freshness update only:** source timestamp changed without material result change.

Only material revisions trigger the full causal story.

### 9.4 Change summary

The delta focuses on engineering meaning:

```text
Serving satellite changed: OW-0174 → OW-0291
Path continuity preserved
RTT 53 → 49 ms
Limiter unchanged: Beam sharing
```

Small numerical noise does not receive visual emphasis unless it crosses a meaningful threshold.

## 10. Globe, Lens and Canvas synchronization

### 10.1 One shared analytical focus

At any moment the product can have:

- no analytical focus: complete route;
- preview focus: hover/keyboard preview;
- locked focus: selected stage/node/segment;
- configuration focus: editable scenario element;
- investigation focus: proof object.

All surfaces read the same focus.

### 10.2 Preview focus

Hovering a Cause Chain stage or path item:

- highlights the related globe object;
- raises its label priority;
- gently mutes unrelated path detail;
- does not move the camera;
- does not alter the Canvas or scenario;
- returns immediately when hover/focus leaves.

### 10.3 Locked focus

Clicking or activating a stage:

- persists the highlight;
- may reveal a compact stage explanation;
- exposes **Investigate** and **Clear focus**;
- may reframe only if the object is obscured;
- keeps the full route available as muted context.

### 10.4 Globe-originated focus

Selecting an active route segment or node on the globe:

1. object acknowledges selection;
2. corresponding Lens stage scrolls into view only if necessary;
3. stage becomes locked focus;
4. stage explanation reveals;
5. no configuration changes;
6. a separate **Configure this path** action is offered when appropriate.

### 10.5 Canvas-originated focus

Selecting a row, closure node, or margin segment in the Canvas:

- related path geometry highlights in the spatial pane or main globe;
- the story index remains stable;
- focus is described in the context bar;
- returning to Result restores the matching Cause Chain stage.

### 10.6 Focus conflict resolution

- newest explicit selection wins;
- hover never overrides locked focus, but can preview within it;
- configuration focus overrides analytical preview without clearing it permanently;
- direction change clears segment focus if it no longer exists;
- result revision retains focus only when the same semantic stage/object remains valid;
- otherwise focus returns to the first changed or decisive stage with a brief explanation.

## 11. Hover, focus and selection choreography

### 11.1 Interaction state ladder

```text
REST
  ↓ pointer hover / keyboard focus
PREVIEW
  ↓ click / Enter / Space
LOCKED ANALYTICAL FOCUS
  ↓ Investigate
PROOF FOCUS

Separate branch:
REST or LOCKED → Configure → SCENARIO EDITING
```

### 11.2 Visual differences

| State | Lens | Globe | Camera | Meaning |
|---|---|---|---|---|
| Rest | normal hierarchy | complete active route | stable | overview |
| Hover | stage/row emphasis | matching object emphasis | none | preview correspondence |
| Keyboard focus | visible focus ring + preview | matching emphasis | none | accessible preview |
| Locked | persistent selected treatment | persistent focus, context muted | only if obscured | analytical selection |
| Configure | field/editor treatment | baseline route retained | none by default | scenario mutation |
| Investigate | proof selection | spatial proof focus | conservative if needed | detailed evidence |

### 11.3 Avoid hover noise

Hover does not:

- show large popovers;
- animate numeric values;
- open accordions;
- start camera movement;
- change path selection;
- persist after the pointer leaves;
- compete with a locked focus.

### 11.4 Touch equivalent

Touch has no hover. The first tap selects/locks focus. A second explicit action investigates or configures. Tapping empty globe space clears focus only after preserving any active editing state.

## 12. Camera behavior and spatial continuity

### 12.1 Camera objectives

Camera motion should answer “where did this happen?” without making the user ask “where did my route go?”

### 12.2 Camera continuity model

Before a layout or focus transition, the product conceptually captures:

- currently visible route objects;
- selected/limiting object;
- endpoint visibility;
- current orientation;
- available globe viewport;
- occlusion from Lens/sheets/Canvas;
- user-authored camera intent such as manual zoom or rotation.

After the transition, it finds the smallest change that preserves relevant content.

### 12.3 Camera priority order

1. keep the selected engineering object visible;
2. keep required route endpoints visible;
3. preserve heading/orientation;
4. preserve relative scale when possible;
5. avoid moving if content is already visible;
6. prefer viewport compensation to full route refit;
7. respect recent manual camera movement.

### 12.4 Hover

No camera motion.

### 12.5 Lens expansion/collapse

If the Lens changes globe width:

- preserve the same visible route content;
- shift framing away from the new occlusion;
- use a short compensated transition;
- do not reset to a canonical view;
- reverse smoothly on collapse.

### 12.6 Enter Investigation

- if a spatial pane remains, transfer the selected segment into it;
- if the globe is hidden, preserve camera state and focus for return;
- if the Canvas shares space with the globe, compensate once after layout settles;
- do not run a second route-fit animation after compensation.

### 12.7 Mobile sheet behavior

To show a spatial focus:

1. Result Story contracts to Result Peek;
2. globe viewport becomes available;
3. camera compensates to keep route and target visible;
4. selected geometry emphasizes;
5. a small anchored explanation appears;
6. returning to Story restores the previous semantic scroll location.

Camera motion never occurs underneath a fully covering sheet where the user cannot see it.

### 12.8 Site-to-site

The camera tries to retain both endpoints and the active path. Segment focus may zoom locally only after a clear transition to Investigation. **Return to route view** always restores the full endpoint context.

### 12.9 User interruption

Any direct camera input cancels the automated flight immediately. The selected analytical focus remains, but the system does not fight the user by restarting the flight.

## 13. State-transition choreography

### 13.1 Successful → constrained

Example: network load increases and beam sharing becomes material.

```text
1. Freshness indicator updates
2. Delivery stage enters Updating; upstream stages stay Passed
3. Delivered KPI is marked Previous, not removed
4. Beam footprint subtly emphasizes
5. Delivery resolves amber with loss amount
6. Verdict becomes “Available — constrained by beam sharing”
7. KPI settles to new value
8. Delta: “DL reduced 42 → 18 Mbps; path unchanged”
```

The interface does not imply that service failed.

### 13.2 Constrained → successful

The Delivery warning resolves to Passed. The limiting loss de-emphasizes. The verdict simplifies to Available. The improvement delta appears briefly, without celebration.

### 13.3 Successful/constrained → blocked

Example: regulatory state changes or RF margin crosses below threshold.

```text
1. Affected stage enters Updating
2. Delivered KPIs become Previous
3. New blocker resolves
4. Downstream delivery becomes Not available / Diagnostic only
5. Previous delivered KPIs withdraw from primary position
6. Globe marks failing gate/segment; valid geometry remains muted
7. Blocked verdict commits
8. Valid-evidence boundary and best next action reveal
```

Red is introduced only when the blocker is established. The UI does not flash blocked during uncertainty.

### 13.4 Blocked → successful

The recovery story is explicit:

1. changed assumption/action highlights;
2. blocking stage recomputes;
3. blocker clears;
4. downstream stages resume in order;
5. delivered path becomes active;
6. delivered KPIs enter only when valid;
7. verdict becomes Available or Constrained;
8. delta states which blocker cleared and what is now delivered.

### 13.5 Path resolved → path unavailable

The previous path withdraws segment by segment from the first invalidated node. Resolved upstream geometry remains. The expected continuation may appear dotted when it explains the missing path.

### 13.6 Path unavailable → resolved

The route constructs from known endpoint outward in dependency order. The path is not drawn as complete before gateway/SNP/backbone resolution is confirmed.

### 13.7 Budget unavailable → RF result

The RF stage changes from Not computed to Updating to its actual closure state. No prior neutral placeholder animates as if it were a margin.

### 13.8 Incomplete → evaluable

When Site B is added:

- Site B acknowledges placement on the globe;
- the scenario path intent appears;
- Cause Chain begins at Scenario;
- the Lens transitions from completion guidance to calculation progress;
- Result appears only after the first coherent revision.

## 14. Desktop motion principles

### 14.1 Preserve simultaneous context

Desktop can show Globe and Lens together. Most motion should therefore explain correspondence rather than navigate away.

### 14.2 Lens posture

Summary ↔ Reasoning uses coordinated width/content reveal:

- outer boundary changes first enough to establish space;
- existing Verdict remains anchored;
- Cause Chain reveals from beneath the Verdict;
- globe compensates for changed usable width;
- new detail becomes interactive after layout settles.

### 14.3 Short-height laptop

The Lens should not animate its entire height. Sticky Context/Verdict remain stable while deeper content reveals into the single scroll area. Auto-scroll occurs only to keep the user-activated target visible.

### 14.4 Canvas entry

The Canvas transition changes task posture clearly. Avoid stacking it above a still-active Lens. The Lens summary transfers into the Canvas context bar and the old rail relinquishes focus.

### 14.5 Multi-monitor and resizes

Window resize and panel resize use direct layout adaptation with minimal motion. Camera compensation runs after the final meaningful resize state, not continuously in a way that causes oscillation.

## 15. Mobile motion principles

### 15.1 Result Peek as spatial anchor

The Peek stays attached to the bottom safe area and changes height only for meaningful posture transitions. It does not bounce with live metric updates.

### 15.2 Peek → Result Story

```text
1. Peek acknowledges swipe/tap
2. Globe slightly de-emphasizes but remains visible during initial lift
3. Peek’s verdict becomes the Story header/verdict without duplication
4. Sheet settles at full Result posture
5. Body becomes scrollable; focus moves to Story heading
```

The verdict should appear to continue into the Story, not disappear and be recreated.

### 15.3 Result Story → Configure / Investigation

The current sheet routes horizontally or cross-recomposes as a sibling view. The header preserves scenario/result context. A second sheet never slides over the first.

### 15.4 Show on globe

The Story contracts before the globe moves. The spatial focus and anchored explanation appear only when the target is visible.

### 15.5 Swipe gestures

Every gesture has a button equivalent. Partial swipes track the finger only for posture transitions, not for engineering result updates. A threshold preview indicates the destination state.

### 15.6 Mobile recalculation

If Configure is full-screen:

- Apply changes the footer to a causal progress summary;
- Configure remains until the commit is acknowledged;
- the app returns to Result Story with the new coherent revision;
- **Show on globe** is offered if the path changed materially.

### 15.7 Rotation and interruption

Device rotation preserves semantic posture, selected stage, and scroll section. Layout recomposes without replaying the entry animation or moving the camera unnecessarily.

## 16. LEO temporal motion

### 16.1 Continuous orbital motion versus analytical change

Satellites may move continuously, but analytical UI changes only when material thresholds or path revisions occur.

Continuous globe motion does not cause:

- continuous KPI counting;
- repeated Lens flashes;
- constant camera following unless explicitly enabled;
- perpetual handover warnings.

### 16.2 Handover preview

Before a predicted handover:

```text
Handover expected in 03:18
Current: OW-0174 / Beam 11
Next: OW-0291 / Beam 07
Expected service continuity: maintained
```

Candidate next path appears only on request or near the transition window, using a secondary dashed grammar.

### 16.3 Handover commit

If continuity is maintained:

1. next satellite/path becomes ready;
2. active emphasis transfers across a short overlap;
3. old route becomes previous context then withdraws;
4. Lens path identity updates atomically;
5. metrics update only if materially changed;
6. Cause Chain retains Passed states where valid;
7. delta reports handover and continuity.

If continuity breaks, the transition follows constrained/blocked choreography instead.

### 16.4 Time scrubbing

Scrubbing is preview, not live result commitment.

- globe and Lens show **Preview at 14:36 UTC**;
- live result remains identifiable;
- path and metrics update at a readable cadence rather than every raw time tick;
- releasing the scrubber commits the preview time;
- **Return to Live** transitions back to current time and current result revision.

## 17. Direction and topology changes

### 17.1 Direction reversal

Direction reversal communicates order change without pretending the physical system rotated.

```text
1. Direction control acknowledges B → A
2. Old directional flow pauses
3. Metrics and path labels enter Updating
4. Route geometry remains when shared, but active arrows withdraw
5. Direction-specific path selection resolves
6. Flow reappears in reverse direction
7. Verdict and metrics commit atomically
8. Changed limiter/beam/path is highlighted
```

### 17.2 Topology change

Topology affects scenario structure. The interface previews prerequisites before commit.

Example STAR → MESH:

- gateway segment de-emphasizes as baseline context;
- Site B requirement becomes explicit;
- if Site B is missing, the interface enters Incomplete rather than attempting a misleading calculation;
- once complete, the new terminal-to-terminal route constructs from endpoints toward the satellite;
- Cause Chain and metric bases reset coherently.

### 17.3 Technology focus change

Switching focus between GEO and LEO in ALL scope does not re-run the scenario unless needed.

- focused Lens result transfers to the other technology;
- globe emphasis changes from one existing evaluated path to the other;
- non-focused path remains ambient comparison context if useful;
- camera moves only if the focused path is not visible;
- comparison basis remains explicit.

## 18. Comparison motion

### 18.1 Enter comparison

The baseline result anchors in the first column. The alternative reveals beside it. Metrics align by meaning and time basis. The globe displays paths using stable baseline/alternative grammar.

### 18.2 Toggle spatial paths

- hover/focus a comparison column previews its path;
- selecting a column locks its spatial emphasis;
- **Show both** uses distinct patterns and a shared camera frame;
- no rapid blinking/toggling is used to communicate difference.

### 18.3 Adopt variant

Adopting a variant is a scenario commit:

1. variant acknowledges selection;
2. baseline labels become Previous;
3. scenario revision commits;
4. chosen spatial path becomes active;
5. comparison collapses into Result;
6. delta summarizes adopted changes;
7. Undo remains available.

## 19. Interruptions, concurrency and failure

### 19.1 New scenario change during recalculation

The newest committed intent supersedes prior unfinished work.

- affected progress resets to the new dependency set;
- completed unchanged stages may remain valid;
- obsolete pending paths never commit to the globe;
- result revision numbers prevent out-of-order settlement;
- the UI explains **Update replaced by newer change** only when helpful.

### 19.2 Camera interaction during automation

Direct user camera input cancels automated movement. Analytical focus persists. No automatic retry occurs until a new explicit focus action.

### 19.3 Surface navigation during recalculation

The user may enter Investigation while a result updates, but the Canvas must clearly distinguish evidence from the current published revision from pending revised evidence. If proof would be misleading, it opens in read-only Previous Revision context with an Updating banner.

### 19.4 Partial computation failure

If a computation or evidence source errors:

- the relevant stage resolves to Error/Unavailable, not Blocked;
- downstream meaning follows the state grammar;
- the old result remains identifiable as Previous if available;
- the globe does not fabricate an unresolved path;
- retry is stage-specific when possible.

### 19.5 Offline or stale data

Freshness changes quietly until it affects confidence or validity. A stale state transition emphasizes provenance, not a generic red error.

## 20. Timing, easing and sequencing guidelines

These values describe character and hierarchy, not production constants.

| Motion class | Indicative duration | Character |
|---|---:|---|
| Press/focus acknowledgement | 80–140 ms | immediate, crisp |
| Hover/trace emphasis | 120–180 ms | quick, reversible |
| Local disclosure | 160–240 ms | readable, contained |
| Lens posture recompose | 220–320 ms | smooth, context preserving |
| Mobile sheet posture | 240–360 ms | direct, touch-linked |
| Camera compensation | 250–400 ms | conservative, ease-out |
| Canvas entry/exit | 280–420 ms | clear task transition |
| Path morph/handover | 300–600 ms | legible continuity |

### 20.1 Easing character

- input acknowledgements: fast ease-out;
- disclosures: balanced ease-out;
- layout recomposition: smooth cubic ease without bounce;
- camera: strong ease-out with no overshoot;
- route transfer: linear-enough to preserve direction, softened at start/end;
- withdrawal of invalid data: quick fade/retract, never dramatic collapse.

### 20.2 Staggering

Stagger is used only to express causal order.

Good:

```text
Path resolves → RF resolves → Service resolves → Delivery resolves
```

Bad:

```text
Five KPI tiles appear one after another because it looks polished
```

### 20.3 No artificial delay

If computation completes instantly, the product compresses the story. It does not impose a long staged animation. Causality can be shown through ordered emphasis within a short transition.

## 21. Reduced motion and accessibility

### 21.1 Reduced-motion causal sequence

Motion is replaced with ordered static updates:

```text
Updating: RF, Service, Delivery
→ Path retained
→ RF closes at +3.1 dB
→ Service gates pass
→ Delivery constrained by beam sharing
→ Result updated: 42 Mbps
```

### 21.2 Camera

Automatic camera flights become instant context-preserving framing or are skipped when the target is already visible. A textual **Focused on downlink segment** acknowledgement accompanies the change.

### 21.3 Screen-reader announcements

Announcements follow the causal transaction without flooding:

1. “Terminal changed. Recalculating RF closure and delivery.”
2. No announcement for every visual micro-step.
3. “Result updated. Service available. Downlink 24 megabits per second. Limiting factor beam sharing. Path unchanged.”

Blocked result:

> “Result updated. Service blocked. Site A uplink margin minus 2.7 decibels. Service and delivery were not evaluated.”

### 21.4 Keyboard

- focus does not trigger camera movement;
- Enter/Space locks focus;
- Escape clears one focus/navigation depth;
- arrow navigation through Cause Chain updates preview trace;
- rapid key navigation cancels obsolete trace transitions;
- focus remains visible during surface recomposition.

### 21.5 Cognitive accessibility

- no essential information appears only during a brief animation;
- delta summaries remain available after emphasis ends;
- state words accompany color and motion;
- movement never causes layout content to become temporarily unreadable;
- continuous animation can be paused independently of result updates.

## 22. Motion storyboards

### 22.1 Scenario change: terminal upgrade

```text
[1] USER INTENT
Configure: Terminal 1.2 m → 1.8 m
           └─ changed field highlighted

[2] IMPACT
Affected stages: RF, Delivery, Confidence
Path expected unchanged

[3] COMPUTE
Scenario ✓  Path ✓  RF …  Service ○  Delivery ○

[4] SPATIAL
Globe retains full path; Site A uplink segment emphasizes

[5] RESULT
Available · 24 Mbps
Cause: Beam sharing

[6] DELTA
DL 8 → 24 Mbps
Limiter Terminal cap → Beam sharing
Path unchanged
```

### 22.2 State transition: available → blocked

```text
[1] INPUT REVISION
Regulatory source updated

[2] AFFECTED STAGE
Service gate enters Updating; RF remains Passed

[3] WITHDRAW
Delivered KPIs marked Previous

[4] BLOCKER
Regulatory gate resolves Blocked

[5] GLOBE
RF path remains diagnostic; blocked geography/gate emphasizes

[6] VERDICT
Service blocked — regulatory gate
No delivered throughput

[7] NEXT ACTION
Inspect policy evidence / compare another technology
```

### 22.3 Investigation transfer

```text
Lens: “Beam sharing -118 Mbps” [selected]
       │
       ├─ Globe footprint highlights
       │
       └─ Canvas grows from selection
              ↓
Canvas: “Delivery closure / Beam sharing”
        160 Mbps → -118 Mbps → 42 Mbps
        spatial pane retains Beam 42
```

### 22.4 Mobile show-on-globe

```text
Result Story full height
   ↓ tap Show on globe
Story contracts to Peek
   ↓ viewport becomes visible
Camera compensates
   ↓
Selected segment emphasizes + anchored explanation
   ↓ swipe/tap Why
Story returns to previous Cause Chain position
```

### 22.5 LEO handover

```text
Current path OW-0174 ───── user
Next path    OW-0291 - - - user
               ↓ readiness confirmed
Current and next overlap briefly
               ↓ active emphasis transfers
Old path becomes previous and withdraws
               ↓
Lens commits new serving satellite and material KPI delta
```

## 23. Motion anti-patterns

The North Star explicitly rejects:

- camera movement on hover;
- re-running route-fit after every panel transition;
- animated counters for every KPI update;
- pulsing healthy badges;
- skeleton loaders that do not reflect engineering progress;
- random card staggering;
- bouncing or overshooting panels;
- drawing a full route before all required nodes resolve;
- leaving stale delivered metrics visible under a blocked verdict;
- changing the path before direction/topology labels update;
- showing a guessed result while computation runs;
- stacking Configure, Result, and Investigation modals;
- animating hidden globe changes behind a full-screen mobile sheet;
- forcing users to wait for motion before issuing the next command;
- using red during uncertainty before a blocker is established;
- relying on motion to communicate information that is not also persistent.

## 24. Validation scenarios

Motion prototypes should be evaluated through real engineering stories rather than isolated transitions.

### 24.1 Configure / recalculate

- terminal change with same path and new limiter;
- weather change that crosses RF threshold;
- topology change requiring Site B;
- manual satellite/beam override changing dependent selections;
- cancel with unsaved drafts;
- rapid successive field changes.

### 24.2 State changes

- available → constrained;
- constrained → available;
- available → blocked;
- blocked → available;
- path resolved → no path;
- no path → resolved;
- budget unavailable → healthy/marginal/blocked;
- confidence only changes while verdict remains stable.

### 24.3 Spatial coordination

- Cause Chain hover with no camera movement;
- locked segment focus already visible;
- locked focus obscured by Lens expansion;
- site-to-site full-route preservation;
- Investigation with and without spatial pane;
- mobile Show on globe and return;
- user interrupts camera flight.

### 24.4 LEO time

- continuity-preserving handover;
- handover that changes limiter;
- handover that causes temporary block;
- time scrub preview and Return to Live;
- continuous motion with no material result update.

### 24.5 Accessibility

- reduced motion;
- keyboard-only Cause Chain and Canvas navigation;
- screen-reader recalculation summary;
- high-frequency live updates without announcement flooding;
- device rotation during Configure/Investigation.

## 25. Motion acceptance criteria

The Motion UX is successful when:

- users can identify which input initiated an update;
- users can identify which engineering stages were recomputed;
- no surface displays mixed result revisions;
- path, direction, verdict, metrics, confidence, and validity settle coherently;
- the first blocker or largest constraint is perceptible in causal order;
- globe changes reveal where the engineering consequence occurred;
- hover/focus/selection/configuration have unmistakably different consequences;
- camera movement never makes users lose the route they were studying;
- direct camera input always wins over automation;
- Configure, Result, and Investigation feel like related postures, not separate applications;
- returning from Investigation restores semantic focus;
- mobile exposes spatial consequences before moving the camera;
- blocked transitions remove or quarantine invalid delivered metrics;
- successful transitions remain calm and professional;
- long computation shows engineering progress, not implementation progress;
- short computation is not artificially delayed;
- live LEO motion does not create constant UI noise;
- reduced-motion users receive the complete causal story;
- every transient emphasis has a persistent textual equivalent or review path;
- motion remains interruptible and responsive under expert use.

## 26. Decisions to validate before implementation planning

1. Which scenario controls commit live and which use Apply?
2. What constitutes a material KPI change worthy of delta emphasis?
3. Which Cause Chain stages can report meaningful incremental progress from the computation model?
4. When is an old route useful as previous context, and when should it withdraw immediately?
5. How long should a result delta remain visible by default?
6. Which analytical focus selections justify camera reframing?
7. How recently must the user have manipulated the camera for automation to stay suppressed?
8. Should blocked states automatically expand the Lens to Reasoning posture?
9. How should live weather/load updates be grouped to avoid frequent revisions?
10. What handover preview window is meaningful for LEO engineering work?
11. Which proof views require a persistent spatial pane in Investigation?
12. What is the preferred sibling-screen transition for mobile Configure/Result/Investigation after prototype testing?

## 27. Explicit non-goals

This document does not define:

- animation libraries;
- CSS or rendering implementation;
- state-management architecture;
- computation orchestration;
- exact production timing constants;
- GPU/performance strategy;
- camera APIs;
- component reuse;
- migration phases;
- implementation estimates;
- changes to engineering computation.

The specification defines product behavior and causal storytelling. Technical planning begins only after these motion principles and journeys are validated.

## 28. Final Motion UX statement

Capacity Analyzer should move like an engineering model becoming understandable.

Inputs acknowledge. Dependencies reveal themselves. The reasoning chain resolves in order. The globe shows where the consequence occurred. The verdict settles only when the path, metrics, cause, confidence, and validity agree. Investigation grows from the exact question the user asked and returns them to the same semantic place. Camera behavior preserves spatial memory. Mobile reveals the globe before asking it to move. Blocked states withdraw invalid delivery claims; successful states remain calm.

This is not animation layered onto the interface. It is the temporal form of the product’s engineering logic.
