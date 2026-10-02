---
type: Instrument
id: check-2-no-override-sections
title: No `## In <PHASE>` override section survived the luminary cut
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
    to: luminary-override-cut-absent
    note: >-
      the absence of the `## In <PHASE>` override-cut mechanism from every vendored
      luminary persona file — personas/luminaries/*.md — checked immediately after
      the cut step that is supposed to remove it.
  - rel: relates-to
    to: check-7-cut-mechanism-absent
    note: >-
      check 7 re-asserts the identical predicate over the identical corpus at the
      final gate, as a second, later checkpoint rather than a duplicate oracle — see
      that record's Scope section.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 2 — no override sections survived the cut

The instrument is `_orch/nodes/P11/work/acceptance.sh` line 34, printed under
`=== Check 2: no override sections survived the cut ===`:

```sh
grep -l '^## In ' personas/luminaries/*.md || echo "OK: no override sections"
```

It lists any vendored luminary file that still carries a `## In <PHASE>` heading; on a clean
corpus `grep -l` finds nothing, fails, and the `||` branch prints `OK: no override sections`.
This is check 2 of directive §6, unedited.

## Guarded artifact class

The absence of the `## In <PHASE>` override-cut mechanism from every vendored luminary persona
file — `personas/luminaries/*.md` — asserted right after the cut step that removes it, before any
later phase can reintroduce it.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 2` / `check-2` / `check2`) together with a `personas/luminaries/` path — settled by `grep -l 'check 2' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 2` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-2-no-override-sections"].re_verification_nodes`; reproduce with `grep -rl 'Check 2' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | the check runs unconditionally on every `acceptance.sh` invocation and has always printed `OK: no override sections`; quiet, not useless (ADR SC4) |

### Settle the absence of a catch

```
grep -il 'check 2' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

## Scope

Authored by node `P123` to close ADR SC1 for check 2. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
