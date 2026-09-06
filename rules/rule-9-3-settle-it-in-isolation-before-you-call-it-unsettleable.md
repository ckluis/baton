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
    note: replaces the `measures-outside-node` shape that rule used to list
  - rel: relates-to
    to: rule-4-the-graph
    note: the retry runs in the `isolation: worktree` the graph already defines
  - rel: relates-to
    to: rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies
    note: the retry's worktree is retired under the same duty
---

### 9.3 Settle it in isolation before you call it unsettleable

A criterion that reads the tree, the branch or the index used to have its own `shape`,
`measures-outside-node`, and writing it parked the node on a question. That shape is removed. It
was not describing a defect in the criterion. It was describing the environment the node happened
to run in, wearing an authoring label — and it manufactured questions no one could answer, because
there was nothing wrong with the words.

**So the test is a command, not a judgment.** Before a verifier may call such a criterion
unsettleable:

> Re-run the criterion's own settling command **once**, in a clean private git worktree at the
> node's commit, with nothing else in the tree.

- **It settles** → the row is `CONFIRMED` or `REFUTED` on what it shows. Not unsettleable. The node
  does not park, no question is filed, and nothing reaches the operator.
- **It still cannot settle** → the criterion reads something no execution can reach in any tree —
  a branch pointer, a tag list, another node's output, the index itself. That is `shape:
  reads-immutable-ref`, and its `probe` is the isolated run that failed, not the shared-tree run.

One retry. Never two: a second adds no information, and the first already cost a worktree. The
worktree is retired under §6.2 like any other — outputs landed first.

**Why the shape had to go rather than be split.** Measured over this framework's own replay run,
which filed 32 `UNSETTLEABLE` fixtures with a cause labelled on each:

| shape | fixtures | genuine criterion defects |
|---|---|---|
| `measures-outside-node` | **23 of 32** | **0** |
| `false-premise` | 3 | 3 |
| `self-contradictory` | 3 | 3 |
| `superseded-form` | 2 | 1 |
| `unbounded-enumeration` | 1 | 1 |

It produced 71% of everything that run parked and not one reusable fixture. Every other shape is
almost purely genuine — 8 of 9. A label that fires constantly and is never right is not a category
that needs splitting.

Three independent findings from the same run agree with the table. `P80`'s criterion 6 was called
unsettleable because it measured a shared branch with thirty-one changed files; run in a clean
isolated worktree it settled immediately, and settled **false** — a real defect the label had been
hiding. `P160`'s criterion 45 was rewritten to remove the dependency and the rewrite reintroduced
it, so rewording is not the fix. And `tools/lint-criteria.py` cannot flag the shape statically,
because it was never in the text.

**The honest limit on that evidence.** That run was hostile to settling by construction: its corpus
was read-only and every worktree was pinned to one commit, so environmental causes are
over-represented. The 23-of-23 is strong enough to remove a label that was never right, and not
strong enough to prove the label could never be right. `reads-immutable-ref` exists for the case
that survives the retry. If an ordinary run also produces zero genuine instances, this rule can
drop that shape too.

**What this costs and what it buys.** One spawn per row that would otherwise have parked a node.
In the run that motivated it, five nodes parked on questions and the questions took a human three
rounds to answer. The retry is cheaper than the question, and unlike the question it can return a
`REFUTED` — which is information about the work rather than about the words.
