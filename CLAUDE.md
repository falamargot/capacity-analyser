# Claude Code Project Instructions

This repository is designed for long autonomous engineering sessions.

Your objective is to maximise engineering throughput while minimising conversation growth.

The repository is the primary long-term memory.

The conversation is only used for task coordination.

---

# Execution Principles

Always prefer:

Repository state

over

Conversation state.

Whenever durable knowledge is produced, persist it inside /docs.

Never rely on previous conversation history if the same information can be stored in the repository.

---

# Working mode

Operate autonomously.

Do not interrupt execution for confirmations unless:

- requirements are contradictory
- implementation would become unsafe
- a business decision cannot reasonably be inferred

Otherwise continue until completion.

---

# Required execution phases

Every significant implementation should follow these phases.

1. Requirement analysis

2. Architecture review

3. Implementation plan

4. Development

5. Unit tests

6. Integration tests

7. Browser validation

8. Code review

9. Final report

---

# Repository documents

Maintain these files continuously.

docs/IMPLEMENTATION_PLAN.md

docs/IMPLEMENTATION_STATUS.md

docs/REVIEW_REPORT.md

docs/HANDOFF.md

These documents are the authoritative project state.

Never duplicate their contents into the conversation.

---

# Conversation policy

Keep conversation extremely concise.

Do not:

- explain routine edits
- paste source files
- paste diffs
- paste test logs
- narrate every action

Report only:

- completed milestones
- blockers
- important discoveries
- final summary

---

# Browser

Use the integrated browser whenever visual validation is required.

Prefer validating behaviour rather than describing behaviour.

---

# Quality

Never reduce code quality to save time.

Never simplify algorithms without justification.

Prefer correctness over speed.

---

# Context optimisation

Before producing a long response ask yourself:

"Will this still be useful 100 turns later?"

If not, avoid writing it.

Persist durable information inside the repository instead.

---

# Handoff

At the end of every completed phase update HANDOFF.md.

A completely new Claude Code session should be able to continue from HANDOFF.md without requiring previous conversation history.
