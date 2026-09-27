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

**At frontier, the planner also sets the node's `effort:`, and it follows the kind of work, not its
size.** Effort is the one lever left inside a tier. Measured, it bought less than its price nearly
everywhere it was tested:

| the node's work | `effort` | evidence |
|---|---|---|
| building or designing something new: an implementation from a goal, a new tool, a page | `medium` | three greenfield tasks, five builds per effort: all 45 builds passed every hidden test; a blind judge put high 0.37 above medium (90% interval 0.18–0.56), below the 0.5 pre-registered as material, at 1.4–2× the cost (`docs/experiments/effort-bench-three-tasks.md`) |
| verifying a specified claim; repairing or re-deriving against a named criterion | `medium` | on the eighteen replayed nodes medium matched high's first-try yield, 6 against 6, for 31% less (`docs/experiments/frontier-at-medium-effort.md`) |
| planning, adjudication, synthesis, a brief | `high` | not measured; judgment over a whole run, spent once |
| a frontier retry (§1.2) | `high` | measured, inconclusive: 5 of 9 retries confirmed at high against 4 of 9 at medium, for 44% more, the whole gap one coin-flip node; the escalation packet did the work at either effort (`docs/experiments/retry-effort.md`) |

A frontier node with no `effort:` runs at `high`, so a graph written before this table spends as it
always did. A verifier takes `medium`: its work is a specified claim whatever the worker did. Low
effort was measured too and lost on every task by 1.3–1.7 judge points, so no row names it. The cheap
tier's effort is the harness's default. The ledger's `effort` column records what ran (§7), so this
table is re-checked by every run's histogram, not assumed.
