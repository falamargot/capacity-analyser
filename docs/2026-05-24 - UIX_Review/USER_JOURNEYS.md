# Capacity Analyser — User Journeys

*Version 1.0 — 2026-05-22.*
*Derived from INFORMATION_ARCHITECTURE.md and COCKPIT_UI_SPEC.md.*
*Describes user experience only. No implementation detail.*

---

## Table of Contents

1. [Executive](#1-executive)
2. [Sales Engineer](#2-sales-engineer)
3. [Capacity Engineer](#3-capacity-engineer)
4. [RF Engineer](#4-rf-engineer)
5. [Operations Engineer](#5-operations-engineer)
6. [Customer Demo](#6-customer-demo)

---

## Notation

Each journey follows this structure:

> **Goal** — what the user is trying to achieve.
> **Starting screen** — where the user is when the journey begins.
> **Steps** — numbered, each describing what the user sees, reads, decides, and does.
> **Destination** — the workspace or state where the journey ends.

Information the user **consumes** is marked in *italics*.
Decisions the user **takes** are marked in **bold**.

---

## 1. Executive

The executive has no engineering vocabulary. Their question is always one of three: Is this territory covered? Are we better than the competition here? What is the regulatory situation? They spend less than two minutes per analysis. They never open a drawer.

---

### 1.1 Territory Coverage Check

**Goal:** Verify that OneWeb covers a prospect's headquarters location and understand the headline service quality.

**Starting screen:** Mission Cockpit, no point selected. Globe shows the full Earth with the satellite constellation animating in real time.

1. The executive looks at the globe. *They see satellites moving overhead.* The globe itself communicates that the network is live and global. No action required yet.

2. They click directly on the map at the prospect's city — for example, Lagos, Nigeria. *Site A marker appears immediately, colored green.* No loading delay is perceptible.

3. *The Route Strip updates:* `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. Three green dots. *The Engineering Context Strip reads:* `↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms`.

4. **Decision:** The executive has the answer. Coverage confirmed. Service is available, regulatory status is allowed, and the headline numbers are competitive. No further action needed.

5. They optionally read the city name in the Mission Bar to confirm they clicked the right location: *"Lagos, Nigeria  6.455°N  3.384°E"*.

**Destination:** Mission Cockpit. Journey complete in under 30 seconds.

---

### 1.2 Regulatory Territory Overview

**Goal:** Understand which countries in West Africa have confirmed regulatory approval for LEO service before a board-level market expansion discussion.

**Starting screen:** Mission Cockpit.

1. The executive clicks the country overlay control in the Globe Controls column (the `🌐` icon). **They select "Regulatory" overlay.**

2. *The globe repaints: West African countries turn green (ALLOWED_CONFIRMED), yellow-green (ALLOWED_ESTIMATED), or red/gray (RESTRICTED / BLOCKED / UNKNOWN).* The legend appears at the globe edge.

3. *They read the color pattern across the region.* Nigeria is green. Cameroon is yellow-green. DRC is gray. The spatial picture tells the story faster than a table would.

4. They hover over a specific country. *An inspection card appears showing the country name and its exact regulatory status string (e.g., "ALLOWED — National frequency coordination filed").* No click required.

5. **Decision:** They identify two target markets confirmed and two that need regulatory tracking. They take a screenshot of the globe for the board deck.

**Destination:** Mission Cockpit with regulatory overlay active. Journey complete in under 90 seconds.

---

### 1.3 LEO vs GEO Comparison for a Specific Territory

**Goal:** Quickly understand whether the LEO or GEO offer is stronger for a location in Southeast Asia before a partner meeting.

**Starting screen:** Mission Cockpit, scope set to ALL.

1. The executive clicks on Kuala Lumpur. *Both LEO and GEO auto-resolve simultaneously.*

2. *The Route Strip shows two rows:*
   - `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`
   - `◆ GEO  ● Available`

3. *The Engineering Context Strip shows both rows side by side:*
   - `◆ LEO  ↓ 310 Mbps  ↑ 46 Mbps  ⏱ 29 ms`
   - `◆ GEO  ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms`

4. **Decision:** LEO wins on throughput and decisively on latency. GEO is available as backup. The executive has a clear talking point: "LEO is 10× better on latency and the coverage is confirmed."

5. They do not open the Segment Analysis drawer. The cockpit numbers are sufficient for a partner conversation.

**Destination:** Mission Cockpit. Journey complete in under 45 seconds.

---

## 2. Sales Engineer

The sales engineer runs live demonstrations, responds to prospect questions in real time, and needs to produce a shareable report at the end of each session. They move faster than a capacity engineer but occasionally need to show a second layer of numbers when the prospect asks "but what's the actual margin?" They also run vertical-specific demos (aviation, maritime).

---

### 2.1 Single Location Demo with Report

**Goal:** Demonstrate OneWeb coverage and performance to a prospect at their Paris headquarters, then export a report to leave behind.

**Starting screen:** Mission Cockpit, scope ALL.

1. *The sales engineer opens the application on their laptop in front of the prospect. The globe is full-screen with the satellite constellation animating.* They say: "Here's the live constellation right now."

2. They click on Paris. *The Site A marker places immediately at the Eiffel Tower area. The Globe animates — the transmission link draws from the point up to the serving OneWeb satellite, then down to the nearest SNP.*

3. *Route Strip:* `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. The prospect sees three green dots. The engineer says: "Covered, regulatory approved, backhaul confirmed."

4. *Engineering Context Strip:* `↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms`. The engineer says: "320 megabits down, 28 millisecond round-trip. That's better latency than 5G fixed wireless in most markets."

5. The prospect asks: "What about the GEO option?" The sales engineer points to the second row: `◆ GEO  ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms`. They say: "GEO is also available — more throughput options, but LEO wins on latency."

6. The prospect asks: "What terminal are you assuming?" **The sales engineer clicks `[ Analyse → ]` to open the Segment Analysis drawer.**

7. *The drawer slides in from the right. The globe shrinks to the left but stays live. The LEO tab is active. The Terminal section shows: `[Fixed ▾] [FBU-200 ▾]`.*

8. **The sales engineer changes the terminal** to match the prospect's existing hardware. *The performance numbers update.*

9. The prospect is satisfied. **The sales engineer clicks `↗ Export`** in the Mission Bar.

10. *A PDF generates and downloads automatically.* It contains the location, analysis scope, current KPIs, terminal configuration, and a globe screenshot. The sales engineer emails it to the prospect.

**Destination:** Mission Cockpit with Segment Analysis drawer open. Report exported. Journey complete in 4–6 minutes.

---

### 2.2 Aviation Vertical Demo

**Goal:** Demonstrate in-flight connectivity performance for an airline prospect by selecting a live aircraft currently flying over Europe.

**Starting screen:** Mission Cockpit, air traffic layer off.

1. **The sales engineer enables the air traffic layer** via the `✈` icon in Globe Controls. *Aircraft icons appear over Europe, Asia, and the Americas, each moving in real time.*

2. They visually identify a widebody aircraft over the Atlantic (prominent icon). They hover over it. *The inspection card shows: "AF007  Air France  Boeing 777  Alt: 39,000 ft  Speed: 890 km/h".*

3. **They click the aircraft.** *The Mission Bar updates to show the flight identity and altitude. The terminal automatically switches to aviation profile. Weather is shown as "Clear" (above clouds, forced).* The globe flyTo animation moves the camera to the aircraft's current position.

4. *Route Strip updates for the aircraft's current position:* `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. *Engineering Context Strip:* `↓ 280 Mbps  ↑ 42 Mbps  ⏱ 31 ms`.

5. The engineer says: "That's a live Air France flight right now. 280 megabits, 31 milliseconds latency. Real in-flight conditions at 39,000 feet."

6. The prospect asks about capacity for multiple passengers. **The sales engineer opens the Segment Analysis drawer.** *The terminal shows "Aviation" type, with the aviation hardware profile pre-selected.*

7. *They point to the bottleneck label: "Beam sharing".* "That reflects the number of other aircraft in the same beam right now. Still 280 Mbps to that single aircraft."

**Destination:** Segment Analysis drawer, aviation mode. Journey complete in 3–5 minutes.

---

### 2.3 Maritime Vertical Demo

**Goal:** Show a maritime prospect live VSAT coverage for a specific vessel currently at sea.

**Starting screen:** Mission Cockpit, maritime layer off.

1. **The sales engineer enables the maritime layer** via the `🚢` icon in Globe Controls. *Vessel icons appear on sea lanes globally.*

2. They search for a specific vessel. **They press `Cmd+K`** to open the Command Palette. They type the vessel name. *The result appears in the search list: "MSC MARIA  Container  MMSI 636021983  Currently: Gulf of Guinea".*

3. **They click the result.** *The globe fliesBoardTo the Gulf of Guinea and focuses on the vessel. The Mission Bar shows vessel identity. Terminal switches to maritime profile.*

4. *Route Strip:* `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. *KPIs: `↓ 295 Mbps  ↑ 44 Mbps  ⏱ 30 ms`.*

5. The prospect asks: "What happens in heavy rain in the Gulf?" **The sales engineer opens Segment Analysis. They change the weather control to "Heavy Rain".** *The throughput drops to ↓ 240 Mbps. The margin is still positive.* "Still well above the service threshold. The system absorbs the rain fade."

6. **They reset weather to "Auto" (real precipitation from API).** *The throughput recovers to 295 Mbps* — it's not raining there right now.

**Destination:** Segment Analysis drawer, maritime mode with weather control demonstrated. Journey complete in 5–7 minutes.

---

### 2.4 Regulatory Concern Handling

**Goal:** A prospect raises a regulatory question mid-demo: "I heard that Congo is restricted — is that true?"

**Starting screen:** Cockpit, previous demo location selected.

1. **The sales engineer activates the regulatory overlay** via the `🌐` Globe Control. *The Democratic Republic of Congo turns gray (UNKNOWN) or amber (RESTRICTED).*

2. They click on DRC. *Route Strip:* `◆ LEO  ● RF OK  ● SNP OK  ● RESTRICTED`. The amber chip is immediately visible.

3. They click on neighboring Rwanda. *Route Strip:* `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED_CONFIRMED`. Green.

4. *The sales engineer turns to the prospect:* "Congo is currently marked restricted — pending coordination. Rwanda, Zambia, Tanzania — all confirmed." They point to the green countries around it.

**Destination:** Mission Cockpit with regulatory overlay. Journey complete in under 60 seconds.

---

### 2.5 Entering Presentation Mode for a Screen Share

**Goal:** The sales engineer is presenting over a video call and wants maximum visual impact on the shared screen.

**Starting screen:** Mission Cockpit with a point selected and analysis running.

1. **They open `⚙` settings and activate Presentation Mode.**

2. *The Mission Bar, Globe Controls, and Coverage Switcher disappear. The globe expands to full screen. The Route Strip and Engineering Context Strip remain at the bottom at 150% scale.* Status dots are 12px. KPI numbers are 32px bold.

3. They move their cursor off-screen. *The `[✕ Exit]` button fades after 3 seconds. The screen shows nothing but Earth, satellites, transmission links, and the two bottom strips.* The audience can read the numbers from the back of a conference room.

4. When the demo is over, **they move the cursor to the bottom right** to reveal `[✕ Exit]` and click it.

**Destination:** Presentation Mode → back to Mission Cockpit. Journey complete in under 30 seconds setup.

---

## 3. Capacity Engineer

The capacity engineer needs to size a satellite link. They always open the Segment Analysis drawer. They configure the terminal, pick the topology, and verify that the throughput and margin numbers meet the customer's SLA. They do not need raw RF chain values — but they do need the margin verdict, the limiting segment, and the bottleneck label.

---

### 3.1 Single Site Capacity Sizing

**Goal:** Determine whether a fixed terminal at a mining site in Western Australia can meet a 100 Mbps downlink SLA using OneWeb, under clear sky and light rain conditions.

**Starting screen:** Mission Cockpit, scope LEO.

1. The capacity engineer clicks on the mining site coordinates in Western Australia. *Site A marker places. Auto-resolution selects the best OneWeb satellite.*

2. *Route Strip:* `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. *KPIs: `↓ 290 Mbps  ↑ 43 Mbps  ⏱ 32 ms`.*

3. **They click `[ Analyse → ]`** to open the Segment Analysis drawer.

4. *LEO tab is active.* **They set terminal type to "Fixed" and select the correct hardware model from the dropdown.**

5. *Throughput updates to reflect the specific hardware: `↓ 275 Mbps`.* The SLA of 100 Mbps is met by a factor of 2.75×. **Decision noted.**

6. **They change weather to "Light Rain"** using the weather control. *Throughput drops to `↓ 230 Mbps`.* Still well above 100 Mbps. **Decision: SLA met under rain conditions.**

7. **They change weather to "Heavy Rain"** as a stress test. *Throughput drops to `↓ 140 Mbps`.* Still above 100 Mbps. **Decision: SLA met under heavy rain.** The capacity engineer notes this as the worst-case margin.

8. They read the *Bottleneck label: "Beam sharing"*. This tells them the throughput limit is contention with other users, not the RF chain. **Decision: Throughput is sharing-limited, not hardware-limited. If exclusivity is required, that's a commercial discussion.**

9. They **reset weather to "Auto"** and **click `↗ Export`** to generate the capacity sizing report.

**Destination:** Segment Analysis drawer, LEO tab, weather scenarios tested. Report exported. Journey complete in 8–12 minutes.

---

### 3.2 GEO Topology Selection

**Goal:** A customer in East Africa wants VSAT service. Determine which GEO topology and terminal class deliver the best margin for a Star Forward service.

**Starting screen:** Mission Cockpit, scope GEO.

1. The capacity engineer clicks on Nairobi. *Auto-resolution picks the best GEO beam. Coverage Switcher pills appear on the globe showing three candidate beams.*

2. *Route Strip:* `◆ GEO  ● Available`. *KPIs: `↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms`.*

3. **They click `[ Analyse → ]`** to open Segment Analysis. *GEO tab is active.*

4. *The topology selector shows `[→ Star Fwd] [← Star Ret] [⇌ Mesh] [↔ P2P]`.* **They confirm Star Forward is selected** (the customer's service type).

5. *Coverage list shows three candidate beams.* **They compare the E2E margin for each beam.** Beam EB shows `+4.2 dB  ✔ Healthy`. Beam H3 shows `+1.8 dB  ⚠ Marginal`. **They select Beam EB.** The globe Coverage Switcher updates to show EB as active.

6. *Link description reads: "Gateway → Satellite → Site A"* with Rambouillet gateway identified. **Decision: routing path is clear.**

7. **They change the terminal RF class from "Ku Standard" to "Ku High-Gain"**. *The E2E margin improves to `+6.1 dB  ✔ Healthy`. Throughput increases to `↓ 220 Mbps`.* **Decision: high-gain terminal is recommended for this location.**

8. **They test "Star Return" topology.** *The topology switches. Link description becomes "Site A → Satellite → Gateway". Margin reads `+3.1 dB  ✔ Healthy` for the return direction.* **Decision: return link is healthy with the same terminal.**

9. The capacity engineer notes both margins and the gateway identity. They export the report.

**Destination:** Segment Analysis, GEO tab, Star Forward with Ku High-Gain terminal confirmed. Report exported. Journey complete in 10–15 minutes.

---

### 3.3 Site-to-Site Link Planning

**Goal:** Size a OneWeb site-to-site link between two offshore oil platforms: one in the North Sea and one in the Gulf of Mexico.

**Starting screen:** Mission Cockpit, scope LEO.

1. The capacity engineer clicks on the North Sea platform coordinates. *Site A places. LEO resolves.*

2. *Engineering Context Strip: `↓ 310 Mbps  ↑ 47 Mbps  ⏱ 29 ms`.*

3. **They arm Site B** using the `[⊕ Site B]` button in the Mission Bar.

4. **They click on the Gulf of Mexico platform.** *Site B marker places. The globe draws the S2S path strip connecting both endpoints. LEO S2S screen labels appear.*

5. **They click `[ Analyse → ]`.** *Segment Analysis drawer opens. LEO tab shows `[S2S ▾]` mode. The tab content changes to the dual-site layout.*

6. *Site A card: "North Sea  El. 38°  SL-E-048  SNP: Bergen, NO".*
   *Site B card: "Gulf of Mexico  El. 44°  SL-W-012  SNP: Miami, US".*

7. *Combined path performance:*
   - `A → B:  284 Mbps`
   - `B → A:  291 Mbps`
   - `⏱ RTT:  62 ms`

8. **They set a terminal type for each site** independently (both "Fixed", matching the platform hardware).

9. **They change weather for Site A to "Heavy Rain"** (North Sea storm). *A → B throughput drops to 218 Mbps. B → A is unchanged at 291 Mbps.* **Decision: the asymmetry under North Sea storm is acceptable for the use case (telemetry upload from the Gulf platform is the critical direction).**

10. They export the report with both sites and the S2S analysis included.

**Destination:** Segment Analysis, LEO S2S tab, per-site weather scenarios validated. Journey complete in 12–18 minutes.

---

### 3.4 Weather Impact Sensitivity Analysis

**Goal:** For a customer in Singapore, determine the throughput degradation profile from clear sky through storm conditions to set SLA floor values.

**Starting screen:** Mission Cockpit, Segment Analysis drawer open, Singapore selected.

1. *The capacity engineer records the clear sky baseline:* `↓ 315 Mbps  ↑ 47 Mbps  Margin: +4.8 dB`.

2. **They change weather to "Light Rain".** *↓ 290 Mbps. Margin: +3.2 dB.*

3. **They change weather to "Heavy Rain".** *↓ 215 Mbps. Margin: +1.1 dB. Verdict changes to ⚠ Marginal.*

4. **They change weather to "Storm".** *↓ 140 Mbps. Margin: −0.4 dB. Verdict changes to ✕ Blocked.* **Decision: storm conditions produce a service outage at this terminal class.**

5. **They switch terminal to "High-Gain"** to recalculate under storm. *↓ 190 Mbps. Margin: +1.2 dB. Verdict: ⚠ Marginal.* **Decision: high-gain terminal survives storm conditions. Recommend this for Singapore.**

6. The capacity engineer records the four throughput values and the terminal recommendation. They do not need the RF chain — the margin verdict and the bottleneck label are sufficient.

**Destination:** Segment Analysis drawer with weather sensitivity analysis complete. Journey complete in 10 minutes.

---

## 4. RF Engineer

The RF engineer validates every number. They always open the Engineering Analysis panel. They navigate sub-tabs methodically: RF Chain first, Latency second, Pass Timeline third. They look for any row with an amber or red border. They verify that C/N is above the MODCOD threshold, that scan loss is within expected range, and that the pass timeline shows no SNP-less gaps.

---

### 4.1 LEO Link Budget Validation

**Goal:** Validate the OneWeb link budget for a fixed terminal in Oman against the engineering specification document. Verify C/N, MODCOD selection, and scan loss are consistent with the expected values at 38° elevation.

**Starting screen:** Mission Cockpit, scope LEO.

1. The RF engineer clicks precisely on the customer's coordinates in Oman (they type the lat/lng into the search field via `Cmd+K` and select the location result). *Site A places at the exact coordinates.*

2. *Engineering Context Strip: `↓ 285 Mbps  ↑ 42 Mbps  ⏱ 31 ms`. Elevation shows in the Segment Analysis after opening.*

3. **They click `[ Analyse → ]`** to open Segment Analysis.

4. *LEO tab shows: Satellite SL-E-082, Beam 9, Elevation 38°.* The engineer notes the elevation matches the expected geometry. **They configure the terminal** to match the engineering spec (specific hardware model).

5. **They click `[ Open Link Budget → ]`** at the bottom of the Segment Analysis LEO tab. *The drawer expands to 640px. The Engineering Analysis RF Chain sub-tab is active.*

6. The engineer reads the RF Chain table row by row:
   - *`EIRP: 42.5 dBW`* — matches spec ✔
   - *`FSPL: 196.8 dB`* — within expected range for 38° elevation and 800 km orbit ✔
   - *`Scan Loss: −2.1 dB`* — the row has an amber left border (above 2 dB threshold). The engineer notes this. At 38° elevation with this beam geometry, 2.1 dB is expected. ✔
   - *`Weather: 0.0 dB`* — clear sky, correct ✔
   - *`G/T: 19.4 dB/K`* — matches satellite spec sheet ✔
   - *`C/N: 10.8 dB`* — the engineer compares this against the MODCOD table
   - *`MODCOD: 8PSK 2/3`* — C/N is 0.8 dB above the 8PSK 2/3 threshold. Tight but valid. **Decision: within spec but limited margin. Note for customer.**

7. *Bottleneck: "Beam sharing"*. The engineer notes the primary throughput limit is contention, not the RF chain. **Decision: RF chain is not the limiting factor at this location.**

8. They read the net throughput: *`↓ 285 Mbps  ↑ 42 Mbps`*. Consistent with what was shown in the cockpit. **Decision: numbers are internally consistent.**

**Destination:** Full Engineering Analysis panel, RF Chain sub-tab. Journey complete in 15–20 minutes.

---

### 4.2 Scan Loss and Elevation Sensitivity

**Goal:** Understand how scan loss degrades as elevation decreases toward the 10° cutoff. Compare beam center performance against beam edge.

**Starting screen:** Full Engineering Analysis open from the previous journey.

1. *The RF Chain shows scan loss at 38° elevation: −2.1 dB.*

2. The engineer moves the Site A marker to a location where the elevation to the same satellite is lower (approximately 18°). *The RF Chain table updates: Scan Loss changes to −5.4 dB. The row's left border turns red.* C/N drops. *MODCOD downgrades to QPSK 3/4.* Net throughput drops to *↓ 180 Mbps*.

3. **Decision:** Below ~22°, the MODCOD degrades and throughput falls significantly. The engineer records the inflection point.

4. They **switch to the Pass Beam Timeline sub-tab**. *The timeline shows elevation rising from 14° to 44° and back across the ±10-minute window. The throughput sparkline mirrors the elevation profile — higher elevation = higher throughput.*

5. They read the *handover annotations on the timeline: two beam transitions (Beam 9 → Beam 11 → Beam 9) and one SNP transition (Manaus → Lima).* **Decision:** The SNP transition at +6 minutes creates a 2-sample throughput dip. The engineer flags this for the customer's SLA documentation.

6. They note the *"NEXT HANDOVER in ~3 min → Beam 11"* line at the bottom of the timeline. This confirms the handover prediction is functioning.

**Destination:** Engineering Analysis, Pass Beam Timeline sub-tab. Journey complete in 20 minutes cumulative.

---

### 4.3 GEO Dual-Segment Budget Validation

**Goal:** Validate the uplink and downlink margins for a GEO Star Forward service in Nigeria. Confirm that rain fade does not bring the downlink margin below 1 dB.

**Starting screen:** Mission Cockpit, scope GEO.

1. The RF engineer clicks on Lagos, Nigeria. *GEO auto-resolution selects the best beam.*

2. **They click `[ Analyse → ]`** to open Segment Analysis. **GEO tab is active. They select "Star Forward" topology.**

3. *E2E margin shows: `+3.8 dB  ✔ Healthy`. Limiting segment: Downlink.* **Decision:** Downlink is the weak link. The engineer needs to see the full uplink and downlink breakdown.

4. **They click `[ Open Link Budget → ]`**. *Engineering Analysis opens. GEO technology tab active. Sub-tab: Dual Segment.*

5. The engineer reads both segments:
   - *Uplink (Gateway → Satellite): Margin `+6.2 dB  ✔ Healthy`*. Well-sized.
   - *Downlink (Satellite → Terminal): Margin `+3.8 dB  ✔ Healthy`*.
   - *Rain fade applied on downlink: −2.4 dB*. The engineer checks: the downlink budget includes the rain margin. The net `+3.8 dB` is after rain fade. **Decision: downlink is sized correctly.**

6. **They change weather to "Heavy Rain"** in the Segment Analysis terminal panel (the weather control is accessible from both the Segment Analysis and the Engineering Analysis header context). *Downlink margin drops to `+1.1 dB  ⚠ Marginal`*. Red border appears on the rain fade row.

7. *E2E margin: `+1.1 dB  ⚠ Marginal`. Limiting segment: still Downlink.* **Decision:** Heavy rain pushes the downlink to marginal but not below threshold. The service survives but with reduced availability confidence. The engineer notes: "Heavy rain → marginal. Recommend high-gain terminal for annual link availability above 99.7%."

8. **They switch the terminal to "Ku High-Gain"**. *Downlink margin under heavy rain: `+3.4 dB  ✔ Healthy`.* **Decision confirmed: high-gain terminal recommended.**

**Destination:** Engineering Analysis, GEO Dual Segment sub-tab, rain fade analysis complete. Journey complete in 20–25 minutes.

---

### 4.4 Beam Health Impact on Link Budget

**Goal:** Determine the effect on link budget if Beam 9 is operating at 60% health (hardware degradation scenario).

**Starting screen:** Mission Cockpit, LEO scope, existing analysis point.

1. **The RF engineer opens the Simulation Workspace** via the `⚗ Sim` button in the Segment Analysis drawer header.

2. *Simulation Workspace opens. Beam health grid shows all 16 beams at 100%.*

3. **They drag the health bar for Beam 9 down to 60%.** *The comb layer on the globe immediately updates — Beam 9 turns amber. The amber `⚗ SIM ACTIVE  Beam 9 at 60%` banner appears.*

4. **They click `Apply & Close`.** *Returns to the previous workspace — Full Engineering Analysis.*

5. *The RF Chain table updates. The `⚗` superscript appears next to the EIRP and C/N rows, indicating these reflect simulated conditions.* The engineer reads:
   - *`C/N: 9.3 dB`* — down from 10.8 dB at full health.
   - *`MODCOD: QPSK 3/4`* — downgraded from 8PSK 2/3.
   - *`↓ Net: 195 Mbps`* — down from 285 Mbps.

6. **Decision:** At 60% beam health, the MODCOD degrades and throughput drops by ~30%. If this represents a typical beam hardware wear scenario, the customer's 200 Mbps SLA floor is now at risk. The engineer flags this for the maintenance scheduling team.

7. **They reset the simulation** (either from the `⚗ SIM ACTIVE` banner's `[Edit]` link or from the Simulation Workspace's `[Reset All]` button). *The ⚗ badge disappears. Numbers return to nominal.*

**Destination:** Engineering Analysis with simulation state tested and reset. Journey complete in 15 minutes.

---

### 4.5 Satellite Inspection — GSO Arc Compliance

**Goal:** Verify that a customer's OneWeb terminal installation in Brazil at 25°S latitude satisfies the GSO arc avoidance requirement.

**Starting screen:** Mission Cockpit, Brazilian site selected, LEO scope.

1. *Segment Analysis is open. The serving satellite is SL-E-082.* The engineer clicks the satellite name or entity on the globe. **They click the satellite.** *The workspace transitions to Satellite Inspection.*

2. *Globe recenters on SL-E-082. Comb layer is rendered prominently. The inspection panel shows satellite identity and the Beam Status Grid.*

3. **They expand the `[▸ View pitch safety chart]` section.** *The GSO Avoidance chart renders — a curve showing required pitch angle vs. latitude.*

4. *At 25°S (the customer's latitude), the curve reads: "Required pitch: 22.4°".* The engineer checks the customer's antenna mount specification: the mount provides up to 30° of pitch adjustment. **Decision:** The GSO compliance requirement is met with margin. The installation is approved.

5. They **press `←`** or `Escape` to return to the previous workspace.

**Destination:** Satellite Inspection workspace, GSO chart validated. Journey complete in 8 minutes.

---

## 5. Operations Engineer

The operations engineer monitors ground segment health. They are not analyzing a customer location — they are looking at the infrastructure itself. Their primary concern is: which SNPs are healthy, which satellites route through which SNPs, and what happens to service when a specific SNP goes offline. They open inspection workspaces directly by clicking on infrastructure entities.

---

### 5.1 SNP Health Check

**Goal:** Check whether the Manaus SNP in Brazil is operational and identify which satellites currently depend on it for backhaul.

**Starting screen:** Mission Cockpit, scope LEO, no point selected. Globe shows the full constellation with SNP markers.

1. The operations engineer looks at the globe. *They see the SNP markers distributed globally. Manaus is visible in northern Brazil.*

2. They hover over the Manaus SNP marker. *An inspection card appears: "SNP Manaus  Brazil North  ● Operational  3 satellites in range".*

3. **They click the Manaus SNP marker.** *The workspace transitions to the Ground Infrastructure Inspection workspace. Globe refocuses on Manaus. Backhaul link lines draw from the SNP to the three connected satellites.*

4. *The inspection panel shows:*
   - Status: `● Operational`
   - Connected satellites: `SL-E-082  El. 42°  ● In range`, `SL-W-014  El. 21°  ● In range`, `SL-N-037  El. 8°  ○ Marginal`

5. *The engineer notes SL-N-037 is at 8° elevation — marginal backhaul.* **Decision:** This satellite may transition to a different SNP as it moves. The Manaus SNP is healthy but supporting a marginal satellite that will likely hand off in the next few minutes.

6. They monitor the globe for a few seconds. *The satellite positions update. SL-N-037 elevation drops to 6° and then disappears from the connected list.* **Decision confirmed:** Natural handoff observed, no fault.

**Destination:** Ground Infrastructure Inspection, SNP mode. Journey complete in 3–5 minutes.

---

### 5.2 SNP Failure Impact Simulation

**Goal:** The Nairobi SNP is scheduled for a 4-hour maintenance window tomorrow. Determine which customers in East Africa will be affected and whether the service degrades to BLOCKED or only DEGRADED.

**Starting screen:** Mission Cockpit, scope LEO. Regulatory overlay off.

1. The operations engineer clicks on the Nairobi SNP marker on the globe. *Ground Infrastructure Inspection opens. Panel shows Nairobi SNP, Operational, with 4 connected satellites.*

2. *Connected satellites: SL-E-082, SL-E-019, SL-E-054, SL-N-003 — all in range.*

3. **They toggle the "Inject failure" switch** in the Failure Simulation box in the inspection panel. *The box turns amber. The Nairobi SNP status chip turns red (FAILED). The connected satellites list updates: each satellite now shows "Routing affected".*

4. *The `⚗ SIM ACTIVE  Nairobi SNP failed` banner appears at the top of all workspaces.*

5. The operations engineer **returns to the Mission Cockpit** (clicks `←` or presses `Escape`). *The globe now shows the Nairobi SNP in red. The comb layers for the affected satellites show reduced coverage.*

6. **They click on a customer location in Nairobi itself.** *Route Strip: `◆ LEO  ✕ RF OK  ✕ SNP FAILED  ● ALLOWED`. The SNP chip is red. Engineering Context Strip: dashes for LEO throughput — service unavailable.*

7. **They click on a customer location in Addis Ababa, Ethiopia** (farther from Nairobi). *Route Strip: `◆ LEO  ● RF OK  ⚠ SNP DEGRADED  ● ALLOWED`.* The SNP chip is amber, not red. Throughput shows a reduced value. **Decision:** Ethiopia degrades but does not lose service — it re-routes through a different SNP (Accra or Djibouti).

8. **Decision summary:** Nairobi-area customers will experience service loss during the maintenance window. Ethiopian and southern Kenyan customers will experience throughput degradation but not outage. The operations engineer prepares the maintenance impact brief accordingly.

9. **They click the `[Edit]` link in the `⚗ SIM ACTIVE` banner** to return to the Simulation Workspace. **They click `[Reset All]`.** *The simulation clears. Nairobi SNP returns to Operational.*

**Destination:** Mission Cockpit (after simulation reset). Journey complete in 15–20 minutes.

---

### 5.3 Beam Outage Simulation

**Goal:** Satellite SL-E-082 is scheduled to undergo a planned beam shutdown on Beams 9 and 10 for transponder reconfiguration. Determine the coverage impact over Central Africa.

**Starting screen:** Mission Cockpit, scope LEO.

1. **The operations engineer clicks on satellite SL-E-082** on the globe. *Satellite Inspection workspace opens. Globe recenters on the satellite. Beam Status Grid shows all 16 beams green.*

2. **They click on Beam 9 in the grid.** *The beam cell expands inline.* **They click `[Toggle]` on the Hard HS control for Beam 9.** *Beam 9 turns red in the grid. On the globe, the Beam 9 comb polygon turns red.*

3. **They repeat for Beam 10.** *Two beams are now HS. The comb layer on the globe shows Beams 9 and 10 in red.*

4. *The `⚗ SIM ACTIVE  Beam 9 HS  Beam 10 HS` banner appears.*

5. The engineer **returns to the Mission Cockpit** (← arrow). *The globe shows the satellite with two red beam polygons. The affected coverage areas are visually obvious.*

6. **They click inside one of the red beam footprint areas on the globe** (a location that falls within the HS beams). *Route Strip: `◆ LEO  ✕ RF BLOCKED`. The status chip is red.* The best satellite auto-resolution has found no viable beam at that location for this satellite. The service falls back to a different satellite if one is available, or shows BLOCKED.

7. **They hover over the adjacent beam footprints** to understand how the remaining 14 active beams provide coverage. *The comb layer shows the 14 active beams in green. The two red beams create a gap in the coverage pattern.*

8. **Decision:** Beams 9 and 10 cover a corridor in Central Africa. During the maintenance window, approximately 12% of the East African coverage area will fall back to secondary satellites. The engineer includes a satellite coverage map screenshot in the maintenance advisory.

9. **They return to Satellite Inspection and remove both HS flags.** *Grid returns to all-green.*

**Destination:** Satellite Inspection (simulation reset). Journey complete in 15 minutes.

---

### 5.4 Gateway Routing Verification

**Goal:** Confirm that the Rambouillet teleport is correctly configured as the nominal SCC for the Eutelsat IS-37W satellite serving Central Europe.

**Starting screen:** Mission Cockpit, scope GEO.

1. The operations engineer looks at the globe. *Gateway markers are visible across Europe, the Americas, and Asia.* They locate Rambouillet, France (marked as a teleport icon near Paris).

2. **They click the Rambouillet gateway marker.** *Ground Infrastructure Inspection workspace opens. Globe refocuses on Rambouillet. Link lines draw to the served satellites.*

3. *The panel shows:*
   - Gateway: Rambouillet, France
   - Role: Teleport
   - Ka Verified: ✔
   - Satellite routing:
     - `Nominal SCC:  IS-37W   ● Active`
     - `Backup SCC:   IS-702A  ○ Standby`
     - `Monitoring:   IS-904E  ○ Monitor`

4. *The engineer confirms IS-37W is correctly marked as the nominal SCC.* **Decision:** Configuration matches the network documentation. IS-702A is correctly in standby.

5. They note that IS-904E is in monitoring role. **Decision:** No anomaly. Monitoring of IS-904E is expected for handover readiness.

**Destination:** Ground Infrastructure Inspection, Gateway mode. Journey complete in 3 minutes.

---

## 6. Customer Demo

The customer demo journey is distinct from the sales engineer's journey. Here, the customer themselves is exploring the product — either in an unguided trial, a live proof-of-concept session, or a guided walkthrough at an event. The customer has no prior knowledge of the product. The experience must be discoverable and immediately rewarding.

---

### 6.1 First Contact — Unguided Exploration

**Goal:** A prospective customer is given access to the application for the first time and is told: "Click anywhere on Earth and see what happens."

**Starting screen:** Mission Cockpit. Globe animating with live satellites.

1. The customer looks at the globe for a few seconds. *They see satellites moving, labelled with names. The globe rotates slowly.* No instruction is needed — the motion itself communicates that this is live data. Curiosity is triggered.

2. They click on their home country. *A status marker appears. The transmission link animates. The Route Strip populates with status chips.*

3. *They read: `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`.* The three green dots are self-explanatory. "OK" is understood without training.

4. *They read the Engineering Context Strip:* `↓ 310 Mbps  ↑ 46 Mbps  ⏱ 29 ms`. Even a non-technical customer understands "310 Mbps down."

5. They try a second location — a competitor's territory or a remote region. *The route strip changes. Some countries show an amber "RESTRICTED" chip.* The spatial comparison is immediate and intuitive.

6. They hover over a satellite. *The inspection card appears showing the satellite name and orbit.* They may click it — which opens the Satellite Inspection workspace. The beam grid and the globe-centered view communicate complexity and sophistication without requiring interpretation.

7. They press `Escape`. *The Mission Cockpit returns. Their analysis point is still selected.*

**Destination:** Mission Cockpit, having discovered the core workflow through natural exploration. Journey complete in 5–10 minutes.

---

### 6.2 Live Guided Demonstration — Coverage vs Competition

**Goal:** A guided demonstration at a trade show booth, run by a facilitator, showing a prospect why the combined LEO+GEO proposition is superior at their specific location.

**Starting screen:** Mission Cockpit, scope ALL, in Presentation Mode.

1. *Facilitator says: "Where are your operations?"* The prospect says "Mumbai." The facilitator **types "Mumbai" in the search field** (`Cmd+K`). *The globe flyTo-animates to Mumbai. Site A places.*

2. *Full-screen globe with two-row Engineering Context Strip visible at the bottom:*
   `◆ LEO  ↓ 295 Mbps  ↑ 44 Mbps  ⏱ 30 ms`
   `◆ GEO  ↓ 170 Mbps  ↑ 11 Mbps  ⏱ 540 ms`

3. *Facilitator:* "That's live, right now. OneWeb LEO gives you 295 megabits with 30 millisecond latency. The GEO option is also available — useful as backup. LEO is 18× lower latency."

4. *The prospect watches the globe. Satellites continue moving. The transmission link is animated. The comb layer shows the 16 beams of the serving satellite over the Indian Ocean.*

5. **Facilitator activates the regulatory overlay.** *India turns green. Pakistan is amber. Myanmar is red.* "Here's the regulatory picture across South Asia."

6. The prospect asks: "What about our Manila office?" **Facilitator clicks Manila.** *Globe flyTo-animates in 1.2 seconds. Site A moves to Manila.* Status updates instantly. `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. `↓ 305 Mbps  ⏱ 27 ms`. *"Same story. Covered, compliant, 27 milliseconds."*

7. **Facilitator enables air traffic layer.** *Aircraft appear over Asia.* They hover over a Philippine Airlines flight near Manila. *Inspection card: "PAL 112  Airbus A321  Alt: 34,000ft"*. "If you have aviation customers — we track every flight in real time, and the same coverage applies 10 kilometres up."

**Destination:** Mission Cockpit in Presentation Mode, regulatory overlay and air traffic demonstrated. Journey complete in 8 minutes.

---

### 6.3 Technical Deep Dive — Customer Engineer Validation

**Goal:** A customer's own RF engineer has been given access and wants to verify that the published link budget for their terminal class is achievable at their remote site in northern Canada at 65°N latitude.

**Starting screen:** Mission Cockpit.

1. The customer engineer clicks on their site coordinates in northern Canada (65°N). *Site A places. Elevation to the serving satellite: 22°.*

2. *Route Strip: `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`.* They note the RF OK at 22° — this is a relatively low elevation and they want to understand the margin.

3. **They open Segment Analysis.** They set the terminal to their specific hardware model. *Throughput: `↓ 210 Mbps  ↑ 31 Mbps  ⏱ 36 ms`.* Lower than southern latitudes but positive.

4. **They open the Link Budget.** *RF Chain sub-tab. Scan Loss: −4.2 dB. Red left border.* The row is red — the scan loss is elevated at 22° elevation. C/N: 8.6 dB. MODCOD: QPSK 3/4. The customer engineer expected 8PSK at this terminal class. They note the MODCOD downgrade is due to scan loss, not a hardware issue.

5. **They switch to the Pass Beam Timeline.** *At 65°N, the elevation profile across the ±10-minute window is notably flat: the satellite does not rise above 25° from this latitude.* The throughput sparkline shows consistently 200–220 Mbps throughout the pass. No dramatic handover dips. *"NEXT HANDOVER in ~4 min → Beam 12".*

6. **Decision:** The customer's RF engineer is satisfied. The link budget math is consistent with their own calculations. The scan loss is expected at 65°N. The MODCOD selection is reasonable. The pass timeline shows no coverage gaps.

7. They **export a PDF** containing the link budget and the pass timeline for their engineering review archive.

**Destination:** Engineering Analysis, Pass Beam Timeline sub-tab. PDF exported. Journey complete in 20–25 minutes.

---

### 6.4 ISS and Globe Exploration — Educational / Showcase

**Goal:** During an open-day event, a visitor (non-technical) wants to explore the product with no analysis objective — pure curiosity about satellites and space.

**Starting screen:** Mission Cockpit.

1. The visitor looks at the globe. **A facilitator enables ISS tracking** via the `🛰` Globe Controls icon. *The ISS model appears on the globe with its orbital path drawn as a ground track line.*

2. **The facilitator clicks the ISS.** *Celestial Objects Inspection workspace opens. Globe refocuses on the ISS. The orbit path is bright. Panel shows: "Altitude: 408 km  Velocity: 27,600 km/h  Orbital period: 92.2 min".*

3. **They enable "Follow ISS"** in the panel. *The globe camera begins tracking the ISS continuously, rotating slowly to match its orbital motion.* The visitor watches Earth scroll beneath the station in real time.

4. **They press `Escape`** to return to the Mission Cockpit. **They click on the Moon** icon in Globe Controls. *The Moon entity appears in the globe at its current ephemeris position.*

5. **They click on the Moon entity.** *Celestial Objects Inspection workspace. Lunar phase and distance data.* The visitor is engaged without needing to understand satellite capacity analysis.

6. They return to the cockpit. **They click somewhere in the ocean.** *Status: `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED`. `↓ 300 Mbps` — even in the middle of the ocean.* The visitor says: "Even out at sea?" The facilitator confirms.

**Destination:** Mission Cockpit after ISS and Moon exploration. Journey complete in 10 minutes.

---

*End of USER_JOURNEYS.md — Version 1.0*
*Produced from INFORMATION_ARCHITECTURE.md and COCKPIT_UI_SPEC.md.*
*This document describes the user experience only. No implementation detail.*
