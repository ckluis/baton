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

A node whose scope turns out to touch more than roughly ten files, or to change
a contract other nodes depend on, is not a big node — it is a missing subgraph.
It returns `SPLIT`. A rung-3 decomposer replaces it in `graph.yaml` with
children carrying `needs` chains, and the parent becomes a `gate` node that
closes when its children do. **Never let a node grow into a phase.**
