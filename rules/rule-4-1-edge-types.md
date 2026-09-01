---
type: Rule
id: rule-4-1-edge-types
title: "4.1. Edge types"
section: "4.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-4-the-graph
---

### 4.1 Edge types

- **`needs`** — hard. The node is not runnable until every `needs` target is
  `DONE` **and** `CONFIRMED`. `DONE` alone is not enough; unverified work is a
  guess with a filename.
- **`informs`** — soft. Does not gate. When the source has finished, its
  **digest path** is added to this node's handoff. This is how context travels
  without contaminating: a path, not a paste.
- **`refutes`** — verification. The node exists to attack a specific claim.
  Its author may never be the author of the target.

**That separation binds `personas:`, not just authorship.** A persona slug
seated on a node may not also be seated on a node that `refutes` it, nor on the
verification of a node it was seated on to author. The duty already exists —
`{BATON}/personas/CONTRACT.md` §2.1, the `EXECUTE` row — but a duty with no
enforcement point is still constructible in a graph, so this is where the graph
enforces it. The plan verifier hunts the collision and refutes the graph
carrying it, before any of it runs.

`surface: ui` is not decoration. A node carrying it gets a **journey probe**
(`{BATON}/prompt/roles/journey-probe.md`) added to its verification alongside the
ordinary verifier, scoped to only the roles and journeys that node affects. If
the probe cannot run — app unreachable, credentials failing — it returns
`BLOCKED` and the node keeps its code verdict with a logged caveat. **Never
stall a run on a missing environment.**
