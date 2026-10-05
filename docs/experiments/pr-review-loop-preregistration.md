# Pre-registration: does the PR review loop earn its place?

Status: **registered 2026-10-05, before any run under it.** Decision D10 of #44. Nothing below may
change after the first goal ships through the loop, except by an amendment that says what changed
and why, dated, above this line.

## The claim

A fresh `baton:pr-reviewer` after the last phase, with a steward that turns its findings into fix
rounds (at most three), leaves PRs that the operator accepts with fewer problems than PRs that
skipped the loop, at a cost worth paying.

## What is measured, per goal, from the record

All of it comes from `_orch/track/` (states and when each was entered), the reviewer's comments
on the PR (`<!-- baton:pr-review round=n -->`), the run memory, and the PR as `gh` reports it.
Nobody is asked to remember anything.

| measure | where it comes from |
|---|---|
| rounds to `READY` (1, 2, 3, or never) | the reviewer comments |
| findings per round, by severity | the reviewer comments |
| **accepted findings**: a finding whose `path:line` the fix round's commits touch | the comments × `git log` of the fix phase |
| **dismissed findings**: high or med findings the operator overrides (`/approve` without a fix) or that a later round withdraws | the thread and the next comment |
| **escapes**: problems the operator finds after `READY`, as review comments or follow-up commits before the merge | the thread, the commits after the `READY` comment |
| time in `reviewing` | `_orch/track/` goal rows |
| cost of the loop | ledger rows of the reviewer and steward spawns |

## Decision rule

After **ten goals** have reached `merged` through the loop:

- **Keep the loop** if accepted findings are at least half of all high and med findings, **and**
  escapes average below one per goal.
- **Cut to one round** (review once, fix once, no re-review) if accepted findings are at least half
  but rounds 2–3 accepted fewer than one finding per goal between them.
- **Cut the loop** if accepted findings are under a third. In that case the reviewer is generating
  work, not catching it.
- Anything in between: inconclusive. Run ten more goals and apply the same rule once, then decide.

## Known weaknesses, stated before the data

- No control arm. Goals are not randomized to skip the loop, so "escapes" has no baseline. A
  control would need goals done twice; the record is honest about that, and the rule above uses
  accepted findings as the primary signal for that reason.
- "Accepted" is approximated by a fix commit touching the cited lines, which over-counts fixes that
  merely move code.
- The operator is one person, and their review effort varies from goal to goal.
