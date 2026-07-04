# GEO Ground Infrastructure Roadmap

## Purpose

Capacity Analyzer uses a capability-driven GEO Ground Infrastructure model to
separate a physical site from the engineering functions hosted at that site.
This distinction is essential because one location can host several operational
roles, and not every ground location is a commercial traffic gateway.

The model is intended to answer engineering questions such as:

- Which physical sites exist in the GEO ground segment?
- Which capabilities are present at each site?
- Which capabilities are eligible for satellite control, TT&C, monitoring,
  commercial traffic, RF access, and network backhaul?
- Which claims are confirmed, publicly likely, unverified, or not applicable?
- Which assumptions are safe enough for engineering visualization, and which
  require operational validation before production use?

The long-term objective is to make Capacity Analyzer reason about the GEO ground
network from explicit capabilities instead of overloaded "gateway" terminology.
This improves physical correctness, auditability, routing decisions, RF
analysis, operational confidence, and future integration with authoritative
network data.

## Domain Model

### GroundSite

A `GroundSite` represents a physical ground location. It carries stable site
identity and geography:

- site identifier
- public code
- name
- latitude and longitude
- region
- operator
- hosted capabilities

A site is not itself a teleport, SCC, TT&C station, or monitoring station. Those
are capabilities hosted by the site.

### GroundCapability

A `GroundCapability` represents an operational function hosted at a
`GroundSite`. Each capability has:

- capability identity
- owning site
- capability kind
- confidence level
- optional source
- supported satellite scope

Capabilities are the unit that should drive engineering behavior. A route,
visibility decision, link budget, control assignment, or operational narrative
should depend on the relevant capability, not only on the physical site.

### SCC

SCC, or Satellite Control Center capability, represents satellite control
responsibility. The current model distinguishes:

- nominal SCC
- backup SCC

SCC capability should ultimately answer which satellites are controlled from a
site, which site is nominal, which site is backup, and what failover policy
applies.

### TT&C

TT&C capability represents tracking, telemetry, and telecommand services. It is
separate from SCC because a site may provide spacecraft communication services
without being the nominal or backup control center for a satellite.

The current model represents TT&C service categories, but not the detailed RF,
antenna, frequency, allocation, or operational constraints behind those
services.

### Monitoring

Monitoring capability represents ground-segment observation and supervision
functions. The current model includes CSC monitoring, with room for spectrum,
QoS, and payload verification roles.

Monitoring is not equivalent to commercial traffic teleport capability. A
monitoring site can be relevant to engineering supervision without being an RF
endpoint for user traffic.

### Traffic Teleport

Traffic Teleport capability represents eligibility to carry commercial GEO user
traffic. It is the capability that should gate commercial STAR_FORWARD and
STAR_RETURN traffic paths.

The current model distinguishes traffic eligibility and confidence. A
traffic-capable site may be:

- confirmed
- publicly likely
- unverified
- not applicable

Traffic Teleport capability is currently the most developed capability category,
but it still lacks confirmed internal validation, beam allocation, capacity,
backhaul, redundancy, and quantitative RF chain data.

### RF Capability

RF Capability represents the radio access characteristics associated with a
traffic teleport. The current model contains nested RF records for C, Ku, and Ka
bands with bidirectional support and confidence.

Target maturity requires RF capability to describe actual engineering
properties, including antenna class, EIRP, G/T, polarization, frequency ranges,
payload compatibility, beam support, and site-specific RF chain constraints.

### Network Backhaul

Network Backhaul capability represents the terrestrial or core-network
connectivity behind a ground site. The model defines the concept of backhaul,
including internet, private core, and operator backbone classes.

No backhaul capabilities are currently instantiated. This means GEO traffic
routes can describe a satellite-to-ground endpoint, but cannot yet prove the
ground-to-network segment as an engineering asset.

### Relationships

The model relationships are:

- A `GroundSite` hosts zero or more `GroundCapability` records.
- A `GroundCapability` belongs to exactly one `GroundSite`.
- SCC, TT&C, Monitoring, Traffic Teleport, and Network Backhaul are specialized
  capability categories.
- RF Capability is currently nested under Traffic Teleport capability.
- Satellite assignments should eventually bind satellites to specific SCC,
  TT&C, Monitoring, Traffic Teleport, RF, and Backhaul capabilities.
- Confidence and source metadata should attach to each engineering claim, not
  only to the site.

## Current Completeness

Current state snapshot:

- 10 physical GEO ground sites are modeled.
- 15 top-level ground capabilities are modeled.
- 5 SCC capabilities are modeled.
- 2 TT&C capabilities are modeled.
- 3 Monitoring capabilities are modeled.
- 5 Traffic Teleport capabilities are modeled.
- 15 nested RF capability records are modeled.
- 0 Network Backhaul capabilities are instantiated.
- 0 capabilities are internally confirmed.
- All instantiated top-level capabilities currently use `PUBLICLY_LIKELY`.

| Engineering domain | Current maturity | Target maturity | Priority | Engineering impact |
|---|---|---|---|---|
| Physical site registry | Engineering-ready | Production-ready | P0 | Provides stable geographic anchors for visualization, routing, and capability inventory. Needs site-level source and confidence to become authoritative. |
| Capability taxonomy | Engineering-ready | Production-ready | P0 | Separates physical sites from SCC, TT&C, Monitoring, Traffic Teleport, RF, and Backhaul roles. This is the core architectural correction. |
| SCC model | Prototype | Production-ready | P0 | Nominal and backup roles exist, but concrete satellite assignments, failover rules, and operational confirmation are incomplete. |
| TT&C model | Prototype | Engineering-ready | P1 | TT&C service labels exist, but RF, antenna, frequency, allocation, and source data are absent. |
| Monitoring model | Prototype | Engineering-ready | P1 | CSC monitoring is represented, but scope, source, satellite assignment, and monitoring type granularity are incomplete. |
| Traffic Teleport model | Prototype | Production-ready | P0 | Traffic eligibility, C/Ku/Ka RF skeleton, service classes, confidence, and source exist for selected sites. Internal confirmation, capacity, beam, RF chain, and backhaul remain absent. |
| RF capability model | Prototype | Production-ready | P1 | Band and direction are represented. Quantitative RF chain details, antenna class, frequency ranges, polarization, and payload compatibility are missing. |
| Network Backhaul model | Placeholder | Engineering-ready | P1 | Backhaul type exists in the domain model, but no site has instantiated backhaul capability. End-to-end GEO route realism is therefore incomplete. |
| Satellite assignment model | Placeholder | Production-ready | P0 | Assignment types exist, but authoritative satellite-to-capability records are not populated. This limits routing correctness and failover analysis. |
| Confidence and source model | Prototype | Production-ready | P0 | Confidence exists per capability, but many sources are missing and no capability is currently confirmed. |
| Capacity model | Placeholder | Engineering-ready | P2 | Gateway capacity, service capacity, RF chain capacity, and contention are not modeled at the ground-infrastructure level. |
| Redundancy and resilience model | Placeholder | Engineering-ready | P2 | Backup SCC labels exist, but facility, RF, backhaul, and operational redundancy are not modeled. |

## Data Enrichment Roadmap

### P0

P0 enrichments establish correctness boundaries. They determine whether the
model can be trusted to select the right ground capability for GEO engineering
analysis.

| Enrichment | Objective | Why it matters | Expected impact | Dependencies |
|---|---|---|---|---|
| Confirm traffic teleport eligibility | Promote or demote `PUBLICLY_LIKELY` Traffic Teleport capabilities based on authoritative validation. | Commercial STAR_FORWARD and STAR_RETURN paths must not assume traffic gateway status from public evidence alone. | Clear separation between confirmed traffic endpoints and unconfirmed reference endpoints. | Ops/Infra validation, authoritative site inventory, source traceability. |
| Populate satellite-to-capability assignments | Bind each GEO satellite to nominal SCC, backup SCC, TT&C, monitoring, and traffic capabilities. | Generic `EUTELSAT/*` support is too broad for operational routing and failover reasoning. | Capability selection becomes satellite-specific and auditable. | Fleet inventory, control allocation records, monitoring allocation records. |
| Establish confidence promotion rules | Define what evidence is required for `CONFIRMED`, `PUBLICLY_LIKELY`, `UNVERIFIED`, and `NOT_APPLICABLE`. | Confidence must mean the same thing across SCC, TT&C, Monitoring, Traffic Teleport, RF, and Backhaul. | Consistent engineering interpretation and reliable audit trails. | Architecture ownership, validation authority, evidence catalog. |
| Add source coverage for every capability | Attach a source or validation reference to every instantiated capability. | Missing source data prevents engineers from knowing whether a capability is operational fact, public inference, or placeholder. | Better reviewability and lower risk of silent assumptions. | Documentation references, internal records, external public evidence. |
| Define SCC failover policy | Describe nominal-to-backup behavior for each controlled satellite. | Backup SCC labels do not by themselves define operational failover behavior. | More accurate resilience and scenario analysis. | Satellite assignments, operations process, incident/failover policy. |

### P1

P1 enrichments make the model technically useful for RF and end-to-end route
analysis.

| Enrichment | Objective | Why it matters | Expected impact | Dependencies |
|---|---|---|---|---|
| Instantiate Network Backhaul capabilities | Add backhaul capability records for sites that provide network egress or core connectivity. | GEO traffic analysis is incomplete without the terrestrial segment behind the teleport. | End-to-end route modeling can distinguish RF endpoint from network endpoint. | Network architecture data, provider/core classification, site validation. |
| Enrich RF capability records | Populate antenna class, EIRP, G/T, frequency ranges, polarization, and RF chain constraints. | Current RF records only indicate band and direction. | Link budget and feasibility analysis can become site-specific instead of generic. | RF engineering data, antenna inventory, frequency plan evidence. |
| Map supported beams and payloads | Bind ground capabilities to satellite payloads, beams, and coverage contexts. | Traffic eligibility depends on which payloads and beams a site can actually support. | More accurate gateway selection, coverage diagnostics, and route explanations. | Frequency plans, payload catalog, beam inventory, teleport allocation data. |
| Enrich TT&C capability detail | Add TT&C RF resources, supported satellites, frequency bands, and operational constraints. | TT&C is currently represented only as service labels. | Control and telemetry analysis becomes physically grounded. | TT&C engineering records, antenna inventory, regulatory/frequency data. |
| Enrich Monitoring scope | Differentiate CSC, spectrum, QoS, and payload verification coverage with assignment and source. | Monitoring roles have different operational meanings and should not be collapsed. | Better engineering diagnosis and clearer visualization of supervision paths. | Monitoring system inventory, NOC/CSC records, satellite assignment data. |

### P2

P2 enrichments improve capacity, resilience, and operational realism.

| Enrichment | Objective | Why it matters | Expected impact | Dependencies |
|---|---|---|---|---|
| Model gateway capacity | Add capacity dimensions for traffic teleports, RF chains, bands, services, and beams. | A site can be eligible but still capacity constrained. | Throughput and congestion analysis can account for ground limitations. | RF chain data, service allocation, utilization telemetry. |
| Model redundancy and resilience | Capture facility redundancy, antenna redundancy, RF chain redundancy, backhaul redundancy, and power resilience. | Backup labels are not enough to evaluate operational robustness. | Scenario analysis can represent degraded and failover states. | Site engineering data, network design, operations resilience policy. |
| Add ownership and responsibility boundaries | Distinguish site operator, facility owner, service owner, and network/backhaul owner. | Engineering accountability may differ from physical operation. | More accurate architecture reviews and escalation paths. | Contractual/operator records, internal ownership mapping. |
| Add operational status | Represent active, standby, degraded, maintenance, unavailable, and retired states per capability. | Static capability presence does not describe live operational readiness. | Better incident simulation and operational dashboards. | NOC data, maintenance systems, telemetry feeds. |
| Add regulatory and spectrum constraints | Bind capabilities to allowed bands, geographies, licenses, and service restrictions. | RF feasibility depends on regulatory context, not only geometry. | More defensible feasibility analysis for service planning. | Regulatory datasets, license references, spectrum engineering data. |

### P3

P3 enrichments move the model from static architecture inventory toward a live
network representation.

| Enrichment | Objective | Why it matters | Expected impact | Dependencies |
|---|---|---|---|---|
| Integrate measured telemetry | Connect capability records to measured utilization, health, alarms, and performance. | A digital twin requires observed state, not only design state. | Capacity Analyzer can compare planned capability with live behavior. | Telemetry pipelines, access control, data normalization. |
| Add temporal validity | Track when capability claims become valid, expire, or change. | Ground infrastructure evolves over time. | Historical and future scenario analysis becomes possible. | Change management records, versioned source data. |
| Model service policies | Represent service eligibility by customer segment, product, SLA class, and topology. | Technical capability does not always imply commercial service availability. | Commercial and engineering narratives can align with real service rules. | Product catalog, SLA policy, network planning data. |
| Model route optimization constraints | Include policy, cost, latency, capacity, resilience, and operational preferences in route selection. | The best route is not always the nearest visible route. | More realistic route recommendations and what-if analysis. | P0-P2 data maturity, optimization criteria, operational policy. |
| Build live digital twin interfaces | Expose the ground model as an authoritative architecture asset for visualization, simulation, and operations. | A mature model should become reusable infrastructure, not only application-local data. | Shared GEO network understanding across engineering, operations, and planning. | Governance, APIs, telemetry, authoritative data stewardship. |

## Known Assumptions

The current model depends on the following engineering assumptions:

- Traffic Teleport capabilities for Rambouillet, Cagliari, Turin, Mexico City,
  and Hermosillo are `PUBLICLY_LIKELY`, not internally confirmed.
- No Traffic Teleport capability is currently `CONFIRMED`.
- All instantiated top-level capabilities are `PUBLICLY_LIKELY`.
- Supported satellites are generic: `EUTELSAT` and `*`.
- Generic satellite support is used instead of concrete satellite assignments.
- SCC capability exists as nominal or backup role, but failover behavior is not
  explicitly modeled.
- TT&C capability assumes tracking, telemetry, and telecommand services where
  present, but without RF or antenna detail.
- Monitoring capability defaults to CSC monitoring where present.
- Monitoring scope is generic and does not prove spectrum, QoS, or payload
  verification coverage.
- Traffic Teleport service classes are limited to `STAR_FORWARD` and
  `STAR_RETURN`.
- RF records for traffic teleports assume C, Ku, and Ka support.
- RF records are bidirectional by default.
- RF records do not contain EIRP.
- RF records do not contain G/T.
- RF records do not contain antenna class.
- RF records do not contain frequency ranges.
- RF records do not contain polarization.
- RF records do not contain supported beam assignments.
- RF records do not contain supported payload assignments.
- Network Backhaul capability is defined but not instantiated.
- Ground-to-network connectivity is not proven by the current ground model.
- Site operator is fixed as EUTELSAT for all modeled sites.
- Facility ownership, service ownership, and backhaul ownership are not
  distinguished.
- Site coordinates are treated as sufficient physical anchors.
- Site-level confidence is not modeled separately from capability confidence.
- Source metadata is present for Traffic Teleport capabilities only.
- Public evidence is treated as useful for engineering visualization but
  insufficient for production confirmation.
- Legacy gateway projections remain available while downstream systems migrate
  toward capability-driven behavior.

## Validation Strategy

Validation should promote assumptions into confirmed engineering facts through
evidence, ownership, and repeatable review.

| Assumption area | Confirmation path | Required evidence | Confirmation owner |
|---|---|---|---|
| Traffic Teleport eligibility | Validate each candidate site with Ops/Infra and commercial ground-network owners. | Internal site inventory, teleport service records, operating responsibility, supported services. | Ground infrastructure owner. |
| SCC nominal and backup assignments | Validate satellite control allocations per spacecraft. | Control center allocation matrix, fleet operations records, failover responsibility. | Satellite operations owner. |
| SCC failover behavior | Validate operational failover rules and activation conditions. | Failover runbooks, incident process, backup SCC readiness criteria. | Satellite operations and resilience owners. |
| TT&C capability | Validate tracking, telemetry, and telecommand resources per site and satellite. | TT&C station inventory, antenna resources, frequency assignments, supported spacecraft list. | TT&C engineering owner. |
| Monitoring capability | Validate monitoring role, scope, and assigned satellites. | CSC/spectrum/QoS/payload verification system records, coverage scope, operational dashboards. | Monitoring/NOC owner. |
| RF band support | Validate per-site C, Ku, and Ka support. | Antenna inventory, RF chain records, frequency plan references, payload compatibility. | RF engineering owner. |
| RF quantitative parameters | Validate EIRP, G/T, antenna class, polarization, and frequency ranges. | Measured or designed RF parameters, antenna/HPA/LNA chain records, engineering acceptance data. | RF engineering owner. |
| Beam and payload support | Validate which payloads and beams are reachable through each traffic teleport. | Payload routing plan, beam allocation plan, frequency plan, teleport assignment records. | Payload and network planning owners. |
| Network Backhaul | Validate terrestrial/core connectivity behind each site. | Backhaul topology, provider/core attachment, capacity, redundancy, routing policy. | Network architecture owner. |
| Capacity | Validate traffic, RF chain, beam, and backhaul capacity limits. | Capacity planning records, utilization telemetry, RF chain capacity, service allocation. | Capacity planning owner. |
| Redundancy | Validate resilience across site, antenna, RF chain, power, and backhaul layers. | Architecture diagrams, resilience tests, failover records, maintenance policy. | Resilience and operations owners. |
| Ownership | Validate facility, operator, service, and network responsibility boundaries. | Authoritative ownership records, contracts, operational responsibility matrix. | Architecture governance owner. |

An assumption should become `CONFIRMED` only when the evidence is traceable,
owned, current, and specific to the capability being promoted. Confirmation of a
site does not automatically confirm every capability at that site.

## Long-term Vision

The GEO Ground Infrastructure model can evolve into a Digital Twin of the GEO
ground network.

At maturity, the model should represent not only where ground sites are located,
but what each site can do, how each capability is connected, which satellites and
beams it supports, which services it can carry, how much capacity is available,
how resilient it is, and what operational state it is currently in.

A mature Digital Twin would support:

- capability-aware route selection
- satellite-specific SCC, TT&C, monitoring, traffic, RF, and backhaul mapping
- site-specific link budget and capacity analysis
- confirmed versus inferred engineering views
- failure, maintenance, and degraded-mode simulation
- live operational overlays for health, utilization, and alarms
- historical and future-state scenario analysis
- architecture governance through traceable sources and confidence states

The architectural end state is a ground model that can answer three questions
with evidence:

1. What exists physically?
2. What capability does it provide?
3. How confidently can Capacity Analyzer use that capability for engineering
   decisions?

When those answers are available per site, per capability, per satellite, per
beam, and per service, the GEO ground model becomes more than a visualization
catalog. It becomes an engineering representation of the operating GEO network.
