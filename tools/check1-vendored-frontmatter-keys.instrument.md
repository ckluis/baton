---
type: Instrument
id: check-1-vendored-frontmatter-keys
title: Every vendored luminary persona file sets all four required frontmatter keys
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
    to: vendored-luminary-frontmatter-keys
    note: >-
      the `kind`/`phases`/`rung`/`tags` frontmatter keys on every vendored luminary
      persona file — personas/luminaries/*.md, excluding personas/luminaries/README.md
      per _orch/plan/decisions.md entry D-01 (a framing note, not a vendored persona).
  - rel: relates-to
    to: instrument-lifecycle
    note: >-
      the ADR (docs/designs/instrument-lifecycle.md) this record is authored to close
      SC1 against; authored by node P123 per _orch/nodes/P123/handoff.md.
---

# Instrument: check 1 — every vendored file sets all four keys

The instrument is the loop at `_orch/nodes/P11/work/acceptance.sh` lines 17-30, printed under
`=== Check 1: every vendored file sets all four keys ===`. For every `personas/luminaries/*.md`
file except `README.md`, it greps for a leading `kind:`, `phases:`, `rung:` and `tags:` line and
echoes `MISSING $k: $f` for any key a file lacks. **Silence is the pass condition** — nothing is
echoed when every file carries all four keys. This is check 1 of directive §6, with the
`README.md` exclusion as the one authorised deviation (`_orch/plan/decisions.md` D-01), stated in
`acceptance.sh`'s own header comment.

## Guarded artifact class

The four-key frontmatter contract on every vendored luminary persona file. Today that is every
file matched by `personas/luminaries/*.md` other than `README.md` — 40 files at the time of the
port (`_orch/inbox/Q-05.md`, `Q-07.md` traceability), verifiable live with:

```
ls personas/luminaries/*.md | grep -v README.md | wc -l
```

## History

Each line carries the evidence path that settles it.

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 1` / `check-1` / `check1`) together with a `personas/luminaries/` path — settled by `grep -l 'check 1' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 1` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-1-vendored-frontmatter-keys"].re_verification_nodes`; reproduce with `grep -rl 'Check 1' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | this is a status, not a judgment — quiet is what the design exists to distinguish from useless (ADR SC4). The check runs unconditionally inside `acceptance.sh` on every invocation; it has simply never had anything to report |

### Settle the absence of a catch

```
grep -il 'check 1' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output — no question in the inbox has ever named check 1 as the source of a finding.

## Scope

This record was authored by node `P123` (`_orch/nodes/P123/handoff.md`) to close ADR Success
Criterion SC1 for check 1. `_orch/nodes/P123/work/acceptance.md` records the findings
`tools/instruments.py` raises against it.
