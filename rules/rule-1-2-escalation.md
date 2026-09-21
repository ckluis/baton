---
type: Rule
id: rule-1-2-escalation
title: "1.2. Escalation"
section: "1.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-1-the-ladder
  - rel: relates-to
    to: rule-9-2-refutation-triage
    note: an UNSETTLEABLE row parks; it never escalates
  - rel: relates-to
    to: rule-10-the-operator-lane
    note: the human tier is a question in the inbox
---

### 1.2 Escalation

Two moves, and then a person.

1. **`cheap` fails → `frontier`, once.** Verdict `ESCALATE`, `FAILED`, or a
   verifier's `REFUTED` at the cheap tier re-spawns the node at frontier
   immediately, with the escalation packet or the verdict's rows in its
   handoff. Never retry at cheap.
2. **`frontier` fails → `frontier` once more, with the evidence.** A `FAILED`
   or `REFUTED` at frontier is information, not a difficulty: the re-spawn
   carries the refuted rows — criterion, probe, evidence — verbatim in its
   handoff, and its verifier is a fresh spawn. The retry is a different prompt,
   not a repeat. A criterion refuted twice is not tried a third time.
3. **The second frontier failure → `human`.** The node goes `BLOCKED` with a
   question (§10): what was tried, what the verifier found each time, and the
   three options the layer holding the context can see (§8.2). Batched at the
   gate, never one at a time. `ESCALATE` from frontier goes here directly — the
   agent has said the work is above what any agent should be asked.

What does not escalate:

- An `UNSETTLEABLE` row (§9.2) — the node parks on a question, because no tier
  satisfies a criterion no execution can settle.
- Two agents returning contradictory conclusions about the same artifact —
  spawn an adjudicator at frontier (`{BATON}/prompt/roles/adjudicator.md`). A
  contradiction is not a difficulty, and there is no larger model to jump to;
  an adjudicator that cannot rule on the evidence returns a `human` question.
- `SPLIT` — the node is not one node; a decomposer at frontier replaces it with
  a subgraph (§4.4).
- Verification — a verifier is always frontier and always a fresh spawn (§9).
  It is never an escalation of the node it checks.

Observed, and the reason the second move exists: in this framework's own run,
22 nodes escalated once and every attempt-2 row read `DONE` or `CONFIRMED` —
and every one of those attempts carried the previous verdict in its handoff.
That was the mechanism; the ladder was the packaging.
