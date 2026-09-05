---
type: Contract
id: prompt-contract
---

# BATON CONTRACT — v3

Every agent in a baton run obeys this contract. Role prompts add duties on top of
it; nothing in it is optional. Where a role prompt and a rule disagree, **the rule
wins** and the role prompt is the bug.

Read this once, at spawn. Do not re-read it mid-task.

---

## How this contract is shaped

**Every rule lives in exactly one file, under `rules/`.** This file is a narrative
and an index; it contains no rule text. There is nowhere to amend a stale copy,
because there are no copies.

A rule is an OKF/AIX concept — `type: Rule`, a stable `id`, and typed `links` — so
"which rule does this file implement" is a declared edge rather than something a
reader has to infer. Cite a rule by its section (`§4.1`) or by its id
(`rule-4-1-edge-types`); the id is unambiguous and the section is not, because both
contracts number their sections from one.

`bundle.sh` concatenates every rule into the paste an agent receives, so a pasted bundle
already contains them. **An agent resolving this framework by URL must fetch the rule
files as well** — this file is an index, and an index is not a rulebook.

## The shape of a run, in six sentences

Work is routed on one ordered list of **rungs** (model × effort), and one failure
moves a node one rung rather than one model. Each layer passes **locators and a
rung** downward and receives an **envelope** upward; a **digest** exists so no
layer ever opens the layer below's work. The plan is a **graph** with typed edges,
and convergence is a **loop node** with a declared exit rather than a paragraph of
encouragement. Every claim carries a citation or is retracted, and every verdict is
computed per criterion rather than asserted. State lives on disk so any fresh
session resumes and no context is load-bearing. The prime spends its turns on
**gates** and nothing else.

## The rules

<!-- BEGIN GENERATED INDEX — `python3 tools/rules.py` rewrites this. Do not hand-edit. -->

| § | rule | file |
|---|---|---|
| 0 | 0. Layers | [`rule-0-layers.md`](../rules/rule-0-layers.md) |
| 1 | 1. The Ladder | [`rule-1-the-ladder.md`](../rules/rule-1-the-ladder.md) |
| &nbsp;&nbsp;1.1 | 1.1. Entry rung | [`rule-1-1-entry-rung.md`](../rules/rule-1-1-entry-rung.md) |
| &nbsp;&nbsp;1.2 | 1.2. Escalation | [`rule-1-2-escalation.md`](../rules/rule-1-2-escalation.md) |
| &nbsp;&nbsp;1.3 | 1.3. De-escalation is mandatory | [`rule-1-3-de-escalation-is-mandatory.md`](../rules/rule-1-3-de-escalation-is-mandatory.md) |
| &nbsp;&nbsp;1.4 | 1.4. Ceiling | [`rule-1-4-ceiling.md`](../rules/rule-1-4-ceiling.md) |
| &nbsp;&nbsp;1.4a | 1.4a. Who assigns the rung | [`rule-1-4a-who-assigns-the-rung.md`](../rules/rule-1-4a-who-assigns-the-rung.md) |
| &nbsp;&nbsp;1.5 | 1.5. Rung drift | [`rule-1-5-rung-drift.md`](../rules/rule-1-5-rung-drift.md) |
| &nbsp;&nbsp;1.6 | 1.6. Effort is not free, and it is not the same as capability | [`rule-1-6-effort-is-not-free-and-it-is-not-the-same-as.md`](../rules/rule-1-6-effort-is-not-free-and-it-is-not-the-same-as.md) |
| 2 | 2. The Status Envelope | [`rule-2-the-status-envelope.md`](../rules/rule-2-the-status-envelope.md) |
| &nbsp;&nbsp;2.1 | 2.1. Verdicts | [`rule-2-1-verdicts.md`](../rules/rule-2-1-verdicts.md) |
| 3 | 3. The Digest | [`rule-3-the-digest.md`](../rules/rule-3-the-digest.md) |
| 4 | 4. The Graph | [`rule-4-the-graph.md`](../rules/rule-4-the-graph.md) |
| &nbsp;&nbsp;4.1 | 4.1. Edge types | [`rule-4-1-edge-types.md`](../rules/rule-4-1-edge-types.md) |
| &nbsp;&nbsp;4.2 | 4.2. Fan-out and barriers | [`rule-4-2-fan-out-and-barriers.md`](../rules/rule-4-2-fan-out-and-barriers.md) |
| &nbsp;&nbsp;4.3 | 4.3. Concurrency | [`rule-4-3-concurrency.md`](../rules/rule-4-3-concurrency.md) |
| &nbsp;&nbsp;4.4 | 4.4. Decomposition | [`rule-4-4-decomposition.md`](../rules/rule-4-4-decomposition.md) |
| &nbsp;&nbsp;4.5 | 4.5. Done-criteria are atomic | [`rule-4-5-done-criteria-are-atomic.md`](../rules/rule-4-5-done-criteria-are-atomic.md) |
| 5 | 5. The Loop | [`rule-5-the-loop.md`](../rules/rule-5-the-loop.md) |
| &nbsp;&nbsp;5.1 | 5.1. The seen ledger is the whole trick | [`rule-5-1-the-seen-ledger-is-the-whole-trick.md`](../rules/rule-5-1-the-seen-ledger-is-the-whole-trick.md) |
| &nbsp;&nbsp;5.2 | 5.2. Dry, not empty | [`rule-5-2-dry-not-empty.md`](../rules/rule-5-2-dry-not-empty.md) |
| &nbsp;&nbsp;5.3 | 5.3. Every loop declares its exit before its first iteration | [`rule-5-3-every-loop-declares-its-exit-before-its-first.md`](../rules/rule-5-3-every-loop-declares-its-exit-before-its-first.md) |
| 6 | 6. Filesystem | [`rule-6-filesystem.md`](../rules/rule-6-filesystem.md) |
| &nbsp;&nbsp;6.1 | 6.1. Framework locators vs run state | [`rule-6-1-framework-locators-vs-run-state.md`](../rules/rule-6-1-framework-locators-vs-run-state.md) |
| &nbsp;&nbsp;6.2 | 6.2. A worktree node lands its outputs before the worktree dies | [`rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies.md`](../rules/rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies.md) |
| 7 | 7. The Ledger | [`rule-7-the-ledger.md`](../rules/rule-7-the-ledger.md) |
| &nbsp;&nbsp;7.1 | 7.1. `ts` and `seconds` are measured, never remembered | [`rule-7-1-ts-and-seconds-are-measured-never-remembered.md`](../rules/rule-7-1-ts-and-seconds-are-measured-never-remembered.md) |
| &nbsp;&nbsp;7.2 | 7.2. Two row classes, and exactly one writer each | [`rule-7-2-two-row-classes-and-exactly-one-writer.md`](../rules/rule-7-2-two-row-classes-and-exactly-one-writer.md) |
| 8 | 8. Gates | [`rule-8-gates.md`](../rules/rule-8-gates.md) |
| &nbsp;&nbsp;8.1 | 8.1. The human brief — every gate that reaches a person ships one page for that person | [`rule-8-1-the-human-brief.md`](../rules/rule-8-1-the-human-brief.md) |
| &nbsp;&nbsp;8.2 | 8.2. Every blocking decision ships a slide, not only the two gates | [`rule-8-2-every-blocking-decision-ships-a-slide.md`](../rules/rule-8-2-every-blocking-decision-ships-a-slide.md) |
| 9 | 9. Evidence | [`rule-9-evidence.md`](../rules/rule-9-evidence.md) |
| &nbsp;&nbsp;9.1 | 9.1. A verdict is per-criterion, and the node verdict is computed | [`rule-9-1-a-verdict-is-per-criterion-and-the-node.md`](../rules/rule-9-1-a-verdict-is-per-criterion-and-the-node.md) |
| &nbsp;&nbsp;9.2 | 9.2. Refutation triage — a criterion no execution can settle is not a failed node | [`rule-9-2-refutation-triage.md`](../rules/rule-9-2-refutation-triage.md) |
| 10 | 10. The Operator Lane | [`rule-10-the-operator-lane.md`](../rules/rule-10-the-operator-lane.md) |
| 11 | 11. Contract footer | [`rule-11-contract-footer.md`](../rules/rule-11-contract-footer.md) |

<!-- END GENERATED INDEX -->
