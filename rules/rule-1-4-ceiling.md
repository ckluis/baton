---
type: Rule
id: rule-1-4-ceiling
title: "1.4. Ceiling"
section: "1.4"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-1-the-ladder
---

### 1.4 Ceiling

`CEILING` in the run config is the highest rung a node may reach unattended;
**default `4` (opus/high)**. A node that would escalate past the ceiling goes
`BLOCKED` with a written question instead, and the operator decides whether to
spend a fable rung on it. Blocked-at-ceiling nodes are surfaced as a batch, not
one at a time.

This is the enforcement point for cost. Rungs 5 and 6 exist, and are reached by
asking, not by drifting.
