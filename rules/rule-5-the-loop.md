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
