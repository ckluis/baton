---
type: Rule
id: rule-4-the-graph
title: "4. The Graph"
section: "4"
contract: prompt/CONTRACT.md
status: active
---

## 4. The Graph

The plan is a directed graph, not a list. `plan/graph.yaml` holds it.

```yaml
- id: T07
  kind: task              # task | loop | gate | fanout | barrier
  phase: 2
  title: Pin the retry semantics with tests
  rung: 1
  surface: code           # code | ui | doc | data
  needs: [T05]            # hard edge — must be DONE and CONFIRMED
  informs: [T06]          # soft edge — if done, its digest path rides in the handoff
  refutes: null           # verification edge — this node's job is to attack that node
  adversarial: standard   # off | standard | panel
  personas: []            # persona slugs bound to this node (§ personas/CONTRACT.md)
  isolation: none         # none | worktree
  handoff: _orch/nodes/T07/handoff.md
  done: "one line, objectively checkable without judgment"
```

`isolation: worktree` runs the node in its own git worktree, and the node's products are written
**inside that worktree** — so §6.2 binds: the layer that created it copies every `outputs` path
into `_orch/nodes/<id>/work/` before removing it, or the node's evidence dies with the tree.

`isolation: worktree` runs the node in its own git worktree. It costs setup time
and disk per node, so it is for exactly one situation: **concurrent nodes that
write to the same files and would otherwise collide.** A serial phase does not
need it. Declaring it in the graph rather than at spawn time is deliberate — a
plan verifier can check it, and a resumed run can tell which node owned which
worktree.
