# Capacity Analyzer UX Charter

## Purpose

This charter defines the global design vision for Capacity Analyzer.

It is intended to be used as:

1. A system prompt for Codex / Claude Code before UI work.
2. A challenge framework for every screen and panel.
3. A guide for the UI roadmap.
4. A design review checklist before shipping interface changes.

## Product Identity

Capacity Analyzer is not:

- A network inventory tool.
- A planning spreadsheet.
- An OSS/NMS console.
- A telecom administration portal.

Capacity Analyzer is:

- A space connectivity cockpit.
- A GEO / LEO decision-support platform.
- A demonstration tool for customers, partners, and executives.
- A technical analysis tool for engineers.

The design must balance presentation impact with technical credibility.

## Mode Intent

### COMM Mode

COMM mode is for storytelling and immediate understanding.

It should prioritize:

- Visual impact.
- A strong wow effect.
- Customer and executive readability.
- Understanding in less than 10 seconds.
- Clear service journey progression.
- Minimal cognitive load.

COMM mode should feel like a guided space connectivity story, not a configuration screen.

### ENG Mode

ENG mode is for engineering analysis and transparency.

It should prioritize:

- Technical analysis.
- Engineering depth.
- Troubleshooting.
- Traceability of computations.
- Derived analysis rather than duplicated configuration.
- Progressive disclosure for advanced information.

ENG mode should feel like an expert analysis cockpit, not an enterprise admin console.

Both modes must share the same visual language.

## Information Homes

Each information item should have one primary home.

| Area | Primary Role |
| --- | --- |
| Header | Scenario configuration |
| Globe | Spatial understanding |
| Ribbon | Journey progression |
| Sidebar | Analysis |

Avoid showing the same information twice unless there is a strong storytelling or engineering reason.

## Design Principles

### 1. The Globe Is The Hero

The globe must remain the primary visual element.

The user should always feel that the world, satellites, and route are the center of the experience.

Headers, ribbons, and sidebars support the globe. They must never visually dominate it.

### 2. Site A <-> Site B Is The Story

Everything starts from Site A and Site B.

The header must immediately communicate:

```text
Site A
  |
Connectivity
  |
Site B
```

before any technical details.

### 3. GEO And LEO Must Have Identities

GEO and LEO should not feel like two generic tabs. They should feel like two different connectivity worlds.

GEO should feel:

- Stable.
- Premium.
- Blue / cyan.
- Orbital.
- Continuous coverage.

LEO should feel:

- Dynamic.
- Modern.
- Magenta / violet.
- Constellation-based.
- Multi-hop.

Whenever possible, visual language should reinforce those identities.

### 4. Visual Story First

Every panel should answer:

```text
What story am I telling?
```

before answering:

```text
What data am I displaying?
```

This principle is especially important in COMM mode.

### 5. No Duplicated Information

Each information item should have a primary home.

Header:

- Site A.
- Site B.
- Weather assumptions.
- GEO terminal assumptions.
- LEO terminal assumptions.
- Other scenario configuration.

Globe:

- Earth context.
- Sites.
- Route.
- Satellites.
- Beams and coverage.
- Spatial relationships.

Ribbon:

- Journey progression.
- Service path.
- Step-by-step narrative.

Sidebar:

- Analysis.
- Status.
- Constraints.
- Bottlenecks.
- Technical explanation.

Avoid duplication unless it improves comprehension or is required for engineering traceability.

### 6. Premium Mission Control Feel

The visual direction should take inspiration from:

- Mission control rooms.
- Satellite operations.
- Space applications.
- High-end command centers.

Use:

- Strong hierarchy.
- Intentional spacing.
- Subtle glow.
- Meaningful animation.
- Progressive disclosure.
- Premium contrast.
- Clear focal points.

Avoid:

- Spreadsheet appearance.
- Dense forms.
- Enterprise administration tool aesthetics.
- Flat telecom portal patterns.
- Panels that compete with the globe.

### 7. The Five Second Test

A new user seeing the screen for five seconds should understand:

1. Which sites are involved.
2. Which route is selected.
3. GEO or LEO status.
4. Whether service is available.
5. What is currently happening.

If not, the UI is too dense, too ambiguous, or visually mis-prioritized.

## UI Decision Framework

For every future UI change, do not optimize only for density.

Evaluate:

- Visual hierarchy.
- Storytelling.
- Wow effect.
- Mission-control appearance.
- Globe prominence.
- Cognitive load.
- Information ownership.
- COMM readability.
- ENG technical transparency.

## Screen Challenge Questions

Use these questions to challenge every screen:

- Is the globe still the hero?
- Can a new user identify Site A and Site B immediately?
- Is the selected route obvious?
- Are GEO and LEO visually distinct?
- Does the screen tell a story before it exposes raw data?
- Is any information duplicated without a strong reason?
- Are advanced details progressively disclosed?
- Does the design feel like a space connectivity cockpit?
- Does the screen pass the five second test?
- Would this screen work in a customer or executive demonstration?
- Would this screen still support engineering troubleshooting?

## Design Review Checklist

Before shipping a UI change, verify:

- [ ] The globe remains visually dominant.
- [ ] Site A and Site B are immediately legible.
- [ ] The route story is clear.
- [ ] GEO has a stable blue/cyan orbital identity.
- [ ] LEO has a dynamic magenta/violet constellation identity.
- [ ] COMM mode favors storytelling and fast understanding.
- [ ] ENG mode favors analysis and computation transparency.
- [ ] Configuration lives in the header.
- [ ] Spatial meaning lives on the globe.
- [ ] Journey progression lives in the ribbon.
- [ ] Analysis lives in the sidebar.
- [ ] No duplicated information was introduced without a strong reason.
- [ ] Panels do not visually overpower the globe.
- [ ] The UI avoids spreadsheet or telecom admin aesthetics.
- [ ] Progressive disclosure is used for secondary detail.
- [ ] The screen passes the five second test.

## Roadmap Lens

Prioritize UI roadmap work that improves:

- Globe prominence.
- Site A <-> Site B storytelling.
- GEO / LEO visual identity.
- COMM mode demonstration value.
- ENG mode technical clarity.
- Reduction of duplicated information.
- Progressive disclosure.
- Premium mission-control feel.

Deprioritize work that only adds density, tables, controls, or configuration surface without improving the story or analysis.

## Prompt For Future UI Work

When asking Codex / Claude Code to modify the UI, include this charter as context and require the following:

```text
Before making UI changes, apply docs/design/CAPACITY_ANALYZER_UX_CHARTER.md.

Do not optimize only for density.
Preserve globe prominence.
Keep Site A <-> Site B as the core story.
Maintain distinct GEO and LEO identities.
Avoid duplicated information.
Use COMM mode for storytelling and ENG mode for analysis.
Preserve the premium mission-control feel.
Check the result against the five second test.
```
