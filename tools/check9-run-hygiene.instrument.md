---
type: Instrument
id: check-9-run-hygiene
title: Nothing was committed and main was not touched
status: dormant
dormant_because: never-fired
generated:
  by: agent:claude-sonnet-5
  at: 2026-08-31
provenance:
  confidence: medium
  source: derived
links:
  - rel: guards
    to: run-git-state-hygiene
    note: >-
      the run's own git repository state — the current branch pointer and `main`'s
      HEAD position — .git/HEAD and .git/refs/heads/main, so nothing gets silently
      committed and `main` never moves while the run is in flight.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 9 — nothing was committed and main was not touched

The instrument is `_orch/nodes/P11/work/acceptance.sh` line 111, printed under
`=== Check 9: nothing was committed and main was not touched ===`:

```sh
git branch --show-current && git log --oneline -1 main
```

This is check 9 of directive §6, unedited. **Unlike every other check in this file, check 9
computes no pass/fail token of its own** — it unconditionally prints the current branch and
`main`'s HEAD commit. The actual assertion (branch equals the expected working branch, `main`'s
commit equals its recorded baseline, and separately `git status --short` shows nothing staged) is
made by whoever reads this check's output and compares it against the run's recorded baseline —
exactly what every node handoff in this run's later phases does explicitly in its own
done-criteria (for example `_orch/nodes/P94/handoff.md` criterion 17). This record documents that
shape rather than pretending check 9 is a self-asserting oracle like checks 1 or 8.

## Guarded artifact class

The run's own git repository state: the current branch pointer (`.git/HEAD`) and `main`'s HEAD
position (`.git/refs/heads/main`), so that no node silently commits, stages, or merges into `main`
while the run is in flight.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 9` / `check-9` / `check9`) together with `.git/` — settled by `grep -l 'check 9' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 9` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-9-run-hygiene"].re_verification_nodes`; reproduce with `grep -rl 'Check 9' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | no node's own reading of this check's output has ever recorded a branch or `main` mismatch — settled from disk, not impression: `main` has read `e78e7b0` at every check-9 invocation this node found in `_orch/nodes/*/work/` |

### Settle the absence of a catch

```
grep -il 'check 9' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

## Scope

Authored by node `P123` to close ADR SC1 for check 9. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
