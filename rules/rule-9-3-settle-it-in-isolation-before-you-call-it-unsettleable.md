---
type: Rule
id: rule-9-3-settle-it-in-isolation-before-you-call-it-unsettleable
title: "9.3. Settle it in isolation before you call it unsettleable"
section: "9.3"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-9-evidence
  - rel: relates-to
    to: rule-9-2-refutation-triage
    note: gates the `measures-outside-node` shape behind one retry and adds `reads-immutable-ref` beside it
  - rel: relates-to
    to: rule-4-the-graph
    note: the retry runs in a private worktree of the kind `isolation: worktree` already defines
  - rel: relates-to
    to: rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies
    note: the retry's worktree is retired under the same duty; the node's landed outputs are what it applies
---

### 9.3 Settle it in isolation before you call it unsettleable

A criterion that reads the tree, the branch or the index — `git diff --stat` for the node's own
file count, `git status --short` for what it changed — is settleable or not depending on what
else is in the tree when it runs. On a shared uncommitted branch it reads every node's edits at
once; in a private worktree it reads only this node's. The verdict must not depend on which of
those the verifier happened to be standing in. So:

**The test is a command, not a judgment.** Before a verifier writes `UNSETTLEABLE` with shape
`measures-outside-node` or `reads-immutable-ref`, it runs the criterion's own settling command
**once**, in a private git worktree that holds the node's commit **plus the node's own changes and
nothing else**:

```sh
git worktree add <scratch>/verify-<node> <the node's commit>
# apply this node's work, and only this node's: its envelope `outputs` as landed under
# _orch/nodes/<id>/work/ (§6.2), copied to their product paths in the worktree, or the
# node's own diff applied with `git apply` when the outputs are edits to tracked files
# run the criterion's settling command there, and nowhere else
git worktree remove --force <scratch>/verify-<node>
```

A retry that omits the node's changes has settled nothing: `git diff --stat` in a bare checkout
prints nothing for every node, and "exactly two files changed" would come back `REFUTED` for a
node that changed exactly two. The retry's whole point is to hold the node's work constant and
remove everyone else's.

Then, on what the isolated run shows:

| the isolated run | row verdict |
|---|---|
| settles | `CONFIRMED` or `REFUTED`. The node does not park and no question is filed. |
| cannot settle because the criterion reads a thing no tree can hold — a branch pointer, a tag list, another node's output, the run index | `UNSETTLEABLE`, shape `reads-immutable-ref`; the `probe` is the isolated run |
| cannot settle because the criterion's target is outside the node's write set or its input was withheld — a read-only corpus file, an answer file the node was not given | `UNSETTLEABLE`, shape `measures-outside-node`; the `probe` is the isolated run and names the withheld or read-only path |

One retry. A second adds no information, and the first already cost a worktree. The retry is
work the verifier does inside its own spawn, not a spawn of its own.

**What the evidence does and does not say.** This framework's replay run filed thirty-two
`UNSETTLEABLE` rows; twenty-three carried `measures-outside-node`, and every one of the
twenty-three was caused by the replay's own harness — eleven by a read-only corpus and withheld
answer files, eleven by worktrees pinned to a commit whose successors had already landed, one
mixed. None was a defect in the words. But that run ran every node in its own worktree at
concurrency one, so the shape's founding case — concurrent nodes on one uncommitted tree, the
`P80` #6 that `_orch/inbox/Q-10.md` records — could not occur in it. Zero genuine instances in a
run that could not produce the genuine instance is not evidence that the shape is empty. The
shape stays, gated behind the retry, until an ordinary run with concurrent nodes on a shared tree
labels its instances.

Two further cautions the same run supplies. `P80` #6 in the replay "settled false" in isolation
because the node made no edit: the guard it was to insert already existed at the replay's commit,
which the run's own report names as its largest threat and says "directly manufactured" that
refutation. It is the declared tree-state confound, not a defect the label was hiding. And three
of the nine rows under the other shapes — `P111` #29, `P112` #30, `P132` #31 — were `CONFIRMED`
by the archived run's own verifiers, so those shapes are not "almost purely genuine" either; the
archive counts five of nine.

**The linter's part.** `tools/lint-criteria.py` rule A1 already flags the static form of this
shape — a `git status --short` or `git diff` asserting about the working tree — and did so nine
times in the replay's baseline. What no linter can see is the environment the node will run in,
which is why this rule exists at verification time.

**What this costs and what it buys.** One worktree per row that would otherwise have parked a
node, inside a spawn the run was already paying for. In the run that motivated it, five nodes
parked on questions and the questions took a person three rounds to answer. The retry is cheaper
than the question, and unlike the question it can return a `REFUTED` — which is information
about the work rather than about the words.
