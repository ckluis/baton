---
type: Rule
id: rule-2-1-verdicts
title: "2.1. Verdicts"
section: "2.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-2-the-status-envelope
---

### 2.1 Verdicts

- **`DONE`** — every done-criterion in the handoff met, evidence in `outputs`.
- **`DONE-WITH-CAVEATS`** — done, and `caveats` lists the accepted residual
  risk in the operator's language, not the agent's.
- **`BLOCKED`** — needs an operator decision or an unmet external dependency.
  The phase runner parks the node, continues the rest of the phase, and batches
  the question.
- **`ESCALATE`** — above this rung. **A fast honest ESCALATE beats a slow fake
  DONE, and costs less than both.** No penalty attaches to escalating early.
- **`FAILED`** — attempted and did not succeed. Costs one rung.
- **`SPLIT`** — this is not one node. Return the seams you found; do not
  attempt the work.

---
