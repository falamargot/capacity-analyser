# AI Execution Policy

## Goal

Maximise autonomous execution while minimising context growth.

---

## Golden Rule

Repository memory > Conversation memory.

---

## Long-lived information

Store permanently:

- plans
- implementation progress
- reviews
- architecture
- assumptions
- risks

---

## Short-lived information

Never keep in conversation:

- command outputs
- test logs
- screenshots
- diffs
- generated code
- browser observations

Unless required to explain a blocker.

---

## Preferred workflow

Analyse

↓

Plan

↓

Implement

↓

Test

↓

Browser validation

↓

Review

↓

Report

---

## Autonomous behaviour

Continue until:

- implementation complete
- tests pass
- browser validation complete
- review complete

---

## Context budget

Treat conversation as expensive.

Treat markdown documents as free.

Always move durable knowledge into markdown.
