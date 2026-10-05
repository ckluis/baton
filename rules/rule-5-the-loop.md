---
type: Rule
id: rule-5-the-loop
title: "5. The Loop"
section: "5"
contract: prompt/CONTRACT.md
status: active
---

## 5. The Loop

Convergence is a node kind, not a paragraph of encouragement in a mode file.

```yaml
- id: L1
  kind: loop
  phase: 3
  body: [T07, T08, T09]                 # the subgraph run each iteration
  invariant: "suite is green at the end of every iteration"
  ledger: _orch/loops/L1/seen.yaml      # dedup memory across iterations
  stop:
    dry_rounds: 2                       # consecutive iterations admitting nothing new; 2 is the floor
    max_iterations: 6                   # hard stop
    max_rungs: 40                       # total rung-attempts before forced stop
  on_stop: T10
```

Every node in `body` carries the **same `phase` as the loop node**. A loop that
spans a phase boundary would have a §8 phase gate firing mid-iteration, and a
gate that lands halfway through a convergence has settled nothing. A loop that
genuinely needs work from two phases is two loops.

**The seen ledger is the whole trick.** Every candidate the loop has **ever
seen** goes in `seen.yaml` with a stable key, whether it was admitted or rejected. Each iteration deduplicates against
the ledger — **not** against the admitted set.

Deduplicating against admitted findings only is the classic non-convergence
bug: a candidate the judge rejected in round one reappears in round two, gets
rejected again, and the loop never runs dry. Ledger keys are content-derived
(file + symbol + claim shape), never sequence numbers.

**Dry, not empty.** Stop on **dry rounds**, not on an empty list. A count-based
stop ("find ten bugs") always misses the tail, and an empty-list stop fires on the first lazy
iteration. Two consecutive iterations that admit nothing new is the signal.

**Every loop declares its exit before its first iteration.** A loop node without
all four of `invariant`, `ledger`, `dry_rounds`, and `max_iterations` is malformed and the plan gate rejects it. **`dry_rounds` has a
floor of 2** — one quiet round is a lazy iteration, not convergence, and a loop
that declares `dry_rounds: 1` has declared it will stop at the first shrug. A loop that hits
`max_iterations` or `max_rungs` exits `DONE-WITH-CAVEATS`, never `FAILED` —
and the caveat names what was still moving when it stopped.
