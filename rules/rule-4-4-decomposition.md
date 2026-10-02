---
type: Rule
id: rule-4-4-decomposition
title: "4.4. Decomposition"
section: "4.4"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-4-the-graph
---

### 4.4 Decomposition

A node that turns out not to be one node — its seams are separable pieces of work,
or it changes a contract other nodes depend on — returns `SPLIT` with the seams it
found. The planner re-plans: it replaces the node in `graph.yaml` with children
carrying `needs` chains, and the parent becomes a `gate` node that closes when its
children do. **Never let a node grow into a phase.**
