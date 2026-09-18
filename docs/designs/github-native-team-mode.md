# GitHub-native team mode — the design record for v4.0

Written 2026-09-18, from the decision brief that preceded the build. The brief
asked "should baton's state live in GitHub Issues so it scales to a team?" The
answer that survived the numbers was narrower and better.

## The finding that shaped everything

Split GitHub into its three primitives and each piece of `_orch/` has an
obvious home, and only one thing has to stay local:

| primitive | carries | why it, and not another |
|---|---|---|
| **git** (a run ref) | everything under `_orch/` except the executing node's `work/` and derived `index/` | no content-creation rate limit; every path becomes `/blob/<sha>/…`; resume is a fetch |
| **pull requests** | product-writing nodes | a team already trusts a PR to answer "what changed, who checked it, is it green" — which is the envelope + verdict + merge-node triple |
| **Issues** | the human lane only: questions, gate summaries | ~25 events a run against a 500/hour content-creation cap; anyone can answer from anywhere |
| **local disk** | a checkout plus the running node | `rule-6-1-framework-locators-vs-run-state` keeps its three reasons — writable, resumable, one source of truth — with the ref as the record once pushed |

"Everything in Issues" was rejected on the contract (§6.1: "run state is
always local disk") and on arithmetic: one run writes ~3,500 state files and
rows; GitHub allows 500 content-creating API calls an hour. The human lane uses
about five percent of that budget across a 41.7-hour run.

## The one structural change: §6.3

Exactly four files under `_orch/` were appended to by more than one layer —
`ledger.csv`, `lint-feedback.yaml`, `ux-debt.yaml`, `plan/decisions.md`.
Everything else was already partitioned by node, phase or gate. Making each list
a directory of rows and deriving the file (`tools/lists.py`) makes the whole
layout conflict-free, which is what lets the state live on a ref without a
merge protocol, and what will let phases become matrix jobs later without a
rewrite. The derivation round-trips baton's own 230-row ledger to the byte.

## What the tests caught

Two defects in the design as briefed, both found by `tools/test-team.sh` before
any of it reached a rule:

1. **A ref cannot nest under another ref.** The brief named node branches
   `baton/run-<id>/node-<id>`. A branch `baton/run-t1` occupies the ref file
   `refs/heads/baton/run-t1`, so git refuses to create anything beneath it. The
   scheme is now `baton/run/<id>` for the run ref and `baton/node/<run-id>/<node>`
   beside it; the ruleset pattern `refs/heads/baton/**` still covers both.
2. **`derive` could have destroyed a v3 ledger.** A v3 run resumed under v4
   without `split` has a file with rows and a directory without them; the first
   derivation would have overwritten the file with the directory's one new row.
   `derive` now refuses when the file holds rows the directory lacks, and the
   refusal is a selftest case.

## Decisions, as built

1. **One router, `TEAM: github`, two invocation cards** — not a fork. Team
   behaviour is gated on the setting; single-user mode is byte-identical.
2. **The run ref is the record; `_orch` is a worktree of it**
   (`git worktree add --orphan`). The layer that receives an envelope commits it;
   pushes happen at node close and at gates. `index/`, `wt/` and `**/work/tree/`
   are ignored inside the ref.
3. **Lists are directories of rows** (§6.3). Rows are named `<ts>-<node>-<attempt>`;
   `split` prefixes migrated rows with their sequence to keep a file's order.
4. **Product-writing nodes are branches with draft PRs; the verdict is a commit
   status** (`baton/verify`, `target_url` → the verdict permalink). The branch is
   the landing (§6.2): the checkout under `work/tree/` keeps every `outputs` path
   local; `landed.json` records branch, sha, tree.
5. **The human lane is Issues**: one per question, sub-issues of the run Issue;
   `/answer` or a closing comment; provenance in the answer file; sync at gates
   only, because rule-10 already reads the inbox only at gates.
6. **One runner per run** in v4.0. An Actions-hosted runner and matrix phases
   are the next two releases; both become configuration rather than code because
   of 3.
7. **Protection is configuration**: a ruleset on `refs/heads/baton/**` blocks
   force-pushes and deletions (`tools/github-setup.sh`); a secret scan gates
   every push; disposal archives to a release before deleting the ref, so
   permalinks keep resolving.

## Deferred, with a purpose

- **GitHub Actions as the runner** (Issue form → `workflow_dispatch`, self-hosted
  runner for jobs over six hours, environments with required reviewers as the
  phase-gate approval). Needs a headless-prime variant of router §1.1.
- **Phases as matrix jobs.** Possible only because of §6.3; not needed until a
  run is throughput-bound, and none has been (`concurrency_policy: 1`).
- **Other forges.** GitLab is the test that the rules say "forge" and not
  "GitHub": `rule-10-the-operator-lane` and
  `rule-6-1-framework-locators-vs-run-state` name the behaviour; the tools name
  the host.

## Numbers the design rests on

- self-run: 2,981 node files, 249 verdict files, 230 ledger rows; 12 questions,
  13 gates; 26 MB; 41.7 wall-hours; 5–6 session-limit kills survived with zero
  redone nodes.
- GitHub: 5,000 REST requests/hour (PAT), 1,000/hour (`GITHUB_TOKEN`, per repo);
  80/minute and 500/hour content-creating; 1,000 statuses per sha per context;
  Actions jobs 6 hours hosted, 5 days self-hosted, 35 days per workflow run.
