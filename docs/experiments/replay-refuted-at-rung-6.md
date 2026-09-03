# Experiment: replay the refuted nodes at rung 6

Drafted 2026-09-02 · Status: **READY TO RUN** · Cost cap: 45 spawns

## The question

Is the ladder cost engineering or epistemic engineering? The self-run gives a flat 27%
refutation rate at rungs 1, 2 and 3, and every one of its 22 escalations closed at +1 rung on the
first try. Neither fact says what a materially stronger worker would have done on the first
attempt, because no fable row exists in `_orch/ledger.csv`.

This replays every node the run refuted at first attempt, with the worker at rung 6 and the
verifier held at the rung that refuted it originally. One arm, no planning, no phases.

## Pre-registered decision rule

Two classes, decided before the run from the original verdict files:

- **work-class** — the original refutation was a defect in the artifact. If ≥ 8 of the 9
  discriminating work-class nodes are `CONFIRMED` first try at rung 6, the ladder's escalation
  half is cost engineering and collapses to three tiers (cheap, strong, human). If ≤ 4 are, the
  ladder holds. 5 to 7 is inconclusive and will be reported as inconclusive.
- **criterion-class** — the original refutation was the criterion, later rewritten by an
  operator answer. These run against the **original** criterion text. If they are still refuted
  at rung 6, refutation triage (`rules/rule-9-2-refutation-triage.md`) is capability-independent.
  If a rung-6 worker satisfies an unbounded enumeration that four sonnet verifiers could not, that
  is a finding against §9.2's premise and the report says so.

Seven further nodes are **non-discriminating**: their fix is already in the tree, so a replay
satisfies them trivially. They run anyway, because the verifier's `defect` tags on all 18 are
the triage data §9.2 needs, and because a rung-6 worker that *fails* a trivially satisfiable
criterion is itself information.

## The tree-state confound, stated

The original run worked on an uncommitted tree that was squashed into commits by area, not by
time, on 2026-09-01. There is no commit that reproduces the tree a given node saw. So:

- re-derivation nodes run in a worktree at **`HEAD`** — their artifact is regenerated from the
  tree every time, and the current tree is a fair input;
- `F1.4` and `F2` run in a worktree at **`e78e7b0`** (the `v2.0` tag, pre-run), where the cards
  and lenses they author do not yet exist and their inputs live in the archived corpus;
- the five instrument-era nodes have no reproducible pre-state and are non-discriminating.

## The nodes

Entry rung and refuting-verifier rung are from `_orch/ledger.csv`. The handoff is the original,
read-only. "Original criterion" for criterion-class nodes is quoted in the named file.

| node | class | worktree | worker rung | verifier rung | original refutation | original criterion source |
|---|---|---|---|---|---|---|
| `P00` | work | HEAD | 6 | 0 | §1 baseline summarised, not verbatim | `_orch/verify/P00-verdict.json` |
| `P10` | work | HEAD | 6 | 2 | tag vocabulary omitted 12 tags | `_orch/verify/P10-verdict.json` |
| `P11` | work | HEAD | 6 | 2 | 9 misattribution points | `_orch/verify/P11-verdict.json` |
| `B1` | work | HEAD | 6 | 2 | a fourth disposition value | `_orch/verify/B1-verdict.json` |
| `P41` | work | HEAD | 6 | 2 | 8 of 9 deferred rows unprioritised | `_orch/verify/P41-verdict.json` |
| `P90b` | work | HEAD | 6 | 2 | see verdict | `_orch/verify/P90b-verdict.json` |
| `P160` | work | HEAD | 6 | 3 | Part 7 lines lack file/location/change | `_orch/verify/P160-verdict.json` |
| `F1.4` | work | `e78e7b0` | 6 | 1 | bare surnames past the opening clause | `_orch/verify/F1.4-verdict.json` |
| `F2` | work | `e78e7b0` | 6 | 1 | roll-up recorded as prose, not artifact | `_orch/verify/F2-verdict.json` |
| `P01b` | criterion | HEAD | 6 | 1 | literal `PHASE:` token never existed | `_orch/verify/P01b-verdict.json` row 4 |
| `P76` | criterion | HEAD | 6 | 1 | unbounded "every count statement" | `_orch/inbox/Q-09.md`, the quoted original |
| `P80` | criterion | HEAD | 6 | 3 | criterion 6 measures the branch | `_orch/inbox/Q-10.md` |
| `P90c` | criterion | HEAD | 6 | 1 | criterion 14 enumerates quoted strings | `_orch/verify/P90c-verdict.json` row 14 |
| `P111` | non-discriminating | HEAD | 6 | 3 | check 4 subset claim | `_orch/verify/P111-verdict.json` |
| `P112` | non-discriminating | HEAD | 6 | 3 | yield row / files-outside claim | `_orch/verify/P112-verdict.json` |
| `P121` | non-discriminating | HEAD | 6 | 3 | fixture corpus not verbatim | `_orch/verify/P121-verdict.attempt1.json` |
| `P122` | non-discriminating | HEAD | 6 | 2 | promoter-equals-repairer case | `_orch/verify/P122-verdict.json` |
| `P132` | non-discriminating | HEAD | 6 | 2 | non-list `repaired:` silently zero | `_orch/verify/P132-verdict.json` |

Nine discriminating work-class nodes, four criterion-class, five non-discriminating.

## Operator pre-steps, by hand, before pasting

```sh
cd ~/Desktop/projects/baton
git checkout refutation-triage            # the branch carrying §9.2; the run reads rules from disk
chmod -R a-w _orch                        # the corpus is evidence; any write to it must fail loudly
mkdir _orch-replay
```

After the run: `chmod -R u+w _orch`. Nothing in the run commits, stages or pushes.

## The paste

```
# Goal
Replay 18 nodes from the archived run at /Users/clank/Desktop/projects/baton/_orch with the
worker at rung 6 and the verifier at the rung that refuted the node originally. The node table,
classes, worktree commits, and the decision rule are in
/Users/clank/Desktop/projects/baton/docs/experiments/replay-refuted-at-rung-6.md — read it
completely first; it is the plan. Do not re-plan it.

TARGET: /Users/clank/Desktop/projects/baton
MODE: GENERIC
BATON: /Users/clank/Desktop/projects/baton
PERSONAS: none
CEILING: 6
PRIME_TURNS: 6

# Process
Read /Users/clank/Desktop/projects/baton/prompt/baton.md and follow it. You are the PRIME
ORCHESTRATOR it describes. Resolve every other file it names against that same directory.

# Operating policy — binds every spawn
- Run state root is `_orch-replay/`, not `_orch/`. `_orch/` is the read-only corpus and is
  chmod a-w; every path a handoff names under `_orch/nodes/<id>/work/` is written under
  `_orch-replay/nodes/<id>/work/` instead. A spawn that tries to write into `_orch/` has
  failed and says so.
- Rungs 5 and 6 are approved for exactly the 18 worker spawns in the table. No other spawn
  may use them. Every verifier runs at the table's verifier rung, never higher.
- One worker and one verifier per node. Concurrency 1. No escalation on REFUTED: a refuted
  replay is the result, not a failure to retry. Cost cap 45 spawns including resume.
- Each worker runs in its own git worktree at the table's commit (`git worktree add
  _orch-replay/wt/<id> <commit>`), edits only there, and is given: the original handoff path,
  the worktree path as the tree the handoff's product paths resolve against, and the archived
  corpus for every `_orch/` input the handoff names. The worker never sees the original
  verdict file or any later attempt.
- Each verifier follows prompt/roles/verifier.md exactly, including §9.2's `defect` and
  `shape` fields on every REFUTED row, writes `_orch-replay/verify/<id>-verdict.json`, and
  for criterion-class nodes verifies against the ORIGINAL criterion text named in the table,
  not the handoff's rewritten form.
- Ledger every spawn to `_orch-replay/ledger.csv` per §7.1 with shell-measured seconds.
- Before any spawn, run `python3 tools/lint-criteria.py` over all 18 original handoffs and
  record its flags to `_orch-replay/lint-baseline.txt`. That is the linter's score on this
  corpus and costs nothing.

# Done
`_orch-replay/final/report.md` carries: one row per node with class, replay verdict, the
`defect`/`shape` tags of every REFUTED row, and measured seconds; the pre-registered decision
rule applied verbatim with its outcome (collapse / holds / inconclusive) for work-class, and
the capability-independence outcome for criterion-class; the linter baseline; and every
worktree removed. No product file in the main tree is changed.
```

## What this does not settle

- A stronger **verifier**. The verifier rung is held constant on purpose; a second arm with
  rung-6 verifiers on the same 18 nodes is the next experiment, not this one.
- Token cost. The ledger records seconds. If the decision turns on dollars, add a token
  count per spawn from the harness before reading the result.
- Anything about phases, digests, or the phase runner. This is a node-level replay.
