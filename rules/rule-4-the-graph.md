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
  informs: [T06]          # soft edge — if done, its envelope path rides in the handoff
  refutes: null           # verification edge — this node's job is to attack that node
  adversarial: standard   # off | standard
  personas: []            # user archetype slugs bound to this node (personas/CONTRACT.md)
  isolation: none         # none | worktree
  handoff: _orch/nodes/T07/handoff.md
  done: "one line, objectively checkable without judgment"
```

`isolation: worktree` runs the node in its own git worktree, and the node's products are written
**inside that worktree** — so §6.2 binds: the layer that created it copies every `outputs` path
into `_orch/nodes/<id>/work/` before removing it, or the node's evidence dies with the tree. It
costs setup time and disk per node, so it is for exactly one situation: **concurrent nodes that
write to the same files and would otherwise collide.** A serial phase does not
need it. Declaring it in the graph rather than at spawn time is deliberate — a
plan verifier can check it, and a resumed run can tell which node owned which
worktree.

**Under `TEAM` (router §1) the situation is different and so is the default.** A
node whose `surface` is `code` or `ui` and whose outputs land inside the product
tree is `isolation: worktree` by default, its worktree starts from the run
branch `baton/<id>` and lands as one commit on it (§6.2), and the merge node the
plan names is merging the run's one pull request. The reason is not collision but
review: a team reads baton's changes the way it reads anyone's — one pull
request, one commit per node — and the node's computed verdict (§9.1) rides on
its commit as a check. The plan verifier
refutes a team-mode plan that leaves such a node at `isolation: none`. The
single-user rule above is unchanged.

**Fan-out and barriers.** Default to a pipeline: items flow through stages
independently, and wall-clock is the slowest single chain. A **`fanout`** declares
what it fans out over and how a child is shaped:

```yaml
- id: F2
  kind: fanout
  over: _orch/nodes/T04/work/sites.yaml   # a file the planner does not have to read
  child: { rung: 1, surface: code, done: "one site transformed, tests green" }
  needs: [T04]
```

The dispatcher mints children as `F2.1`, `F2.2`, … when `over` resolves, because the
item list usually does not exist until an earlier node produces it. `needs: [F2]`
means **every child**, not the fanout node — a fanout is `DONE` only when all of its
children are `DONE` and `CONFIRMED`, or the ones that are not have been explicitly
accepted as `BLOCKED`. A **`barrier`** carries `needs` listing every node it waits
on and one line of `why` naming the cross-item work that justifies it: a next stage
that needs context from *all* of the previous one — deduplicating across producers,
an early exit on the total. Flattening or filtering a list is not that; do it inside
the next stage. A **`kind: gate` node is not a §8 gate.** It is an in-graph join
that closes when its children close; only the prime holds a §8 gate, and a mode that
needs an operator checkpoint mid-phase reaches it by returning `BLOCKED`.

**A node that is not one node.** A node that turns out not to be one node — its
seams are separable pieces of work, or it changes a contract other nodes depend on —
returns `SPLIT` with the seams it found. The planner re-plans: it replaces the node
in `graph.yaml` with children carrying `needs` chains, and the parent becomes a
`gate` node that closes when its children do. **Never let a node grow into a phase.**
