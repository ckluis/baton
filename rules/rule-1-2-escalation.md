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
---

### 1.2 Escalation

One failure moves a node **one rung**, never one model. Rung 1 failing buys
more thinking before it buys a bigger model — that single change is where most
of a run's savings come from.

Triggers, any one sufficient:

1. Verdict `ESCALATE` — the agent judged the work above its rung. Re-spawn one
   rung up immediately; do not retry at the current rung.
2. Verdict `FAILED` — one rung up. (Not two failures. One. A rung is cheap.)
3. A verifier `REFUTED` a `DONE` claim on a `work` row — counts as `FAILED`. A
   refutation whose every row is `defect: criterion` does not escalate; it parks
   on a question (§9.2), because a bigger model cannot satisfy a criterion no
   execution can settle.
4. Two agents return contradictory conclusions about the same artifact — jump
   directly to rung 4 and spawn an adjudicator. Skip the intermediate rungs; a
   contradiction is not a difficulty, and grinding it out one rung at a time
   just buys the same disagreement twice.
5. Verdict `SPLIT` — the node is not one node. Do not escalate it; hand it to a
   decomposer at rung 3, which replaces it with a subgraph (§4.4).
