---
type: Rule
id: rule-4-2-fan-out-and-barriers
title: "4.2. Fan-out and barriers"
section: "4.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-4-the-graph
---

### 4.2 Fan-out and barriers

**Default to pipeline.** Items flow through stages independently; item A may be
in stage 3 while item B is still in stage 1. Wall-clock is the slowest single
chain, not the sum of slowest-per-stage.

A `barrier` node is correct **only** when the next stage needs cross-item
context from *all* of the previous stage:

- deduplicating findings across every producer before expensive verification
- an early exit that depends on the total ("zero findings → skip the panel")
- a stage whose prompt genuinely references "the other results"

A barrier is **not** justified by needing to flatten, map, or filter a list —
do that inside the next stage — nor by the stages feeling conceptually
separate. That is what a pipeline already models.

A **`kind: gate` node is not a §8 gate.** It is an in-graph checkpoint that
closes when its children close — a join, nothing more. It costs **no prime
turn** and does not count against `PRIME_TURNS`. Only the prime holds a §8 gate,
and only the four kinds listed there exist. The
briefer spawn inside gates 3 and 4 (§8.1) is part of that gate's turn and does not
increment `prime_turns_spent` either. A mode that needs an
operator-facing checkpoint mid-phase reaches it by returning `BLOCKED`, which
routes into the blocked batch.

A **`fanout`** declares what it fans out over and how a child is shaped:

```yaml
- id: F2
  kind: fanout
  over: _orch/nodes/T04/work/sites.yaml   # a file the planner does not have to read
  child: { rung: 1, surface: code, done: "one site transformed, tests green" }
  needs: [T04]
```

Children are minted by the phase runner as `F2.1`, `F2.2`, … when `over`
resolves, because the item list usually does not exist until an earlier node
produces it. `needs: [F2]` means **every child**, not the fanout node — a fanout
is `DONE` only when all of its children are `DONE` and `CONFIRMED`, or when the
ones that are not have been explicitly accepted as `BLOCKED`.

A **`barrier`** carries `needs` listing every node it waits on, and one line of
`why` naming the cross-item work that justifies it (§4.2). A barrier with no
`why` is a pipeline stage that has not noticed yet.
