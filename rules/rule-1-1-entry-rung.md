---
type: Rule
id: rule-1-1-entry-rung
title: "1.1. Entry tier"
section: "1.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-1-the-ladder
---

### 1.1 Entry tier

The planner assigns every node an entry tier. **Default entry is frontier.** A
node enters at `cheap` only when its handoff names work with no judgment in it
— one command, one file, a result a verifier settles by re-running the command
— and the reason names that property of the work, not a feeling about its
size. *"This is small"* is not a reason. *"This is `pytest -q` and its exit
code"* is.

A node carrying `personas:` is frontier work by definition — a persona's phase
duty is judgment from a lens (personas §2) — and the seat runs there whatever
the node says; the planner may still assign `cheap` for the node's non-persona
work.

The asymmetry reversed. It once read: assigning high wastes the budget on work
that would have succeeded low, and assigning low costs one extra attempt.
Now: assigning frontier to mechanical work wastes a little; assigning cheap to
judgment costs the attempt, the verification that refutes it, the escalation —
and the defect the cheap tier introduced that the verifier did not catch.
**Assign frontier unless the work is a command.**
