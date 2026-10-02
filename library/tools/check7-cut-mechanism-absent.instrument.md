---
type: Instrument
id: check-7-cut-mechanism-absent
title: The cut mechanism is gone from every shipped luminary persona
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
      the absence of the `## In <PHASE>` override-cut mechanism from every shipped
      luminary persona file — personas/luminaries/*.md — re-checked at the final gate.
  - rel: relates-to
    to: check-2-no-override-sections
    note: >-
      check 2 asserts the identical predicate over the identical corpus immediately
      after the cut step; this check re-asserts it at the final gate as a second,
      later checkpoint. Two standing checks, one guarded artifact class — deliberate
      defense in depth, not a duplicate oracle. See that record's Scope section.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 7 — the cut mechanism is gone from every shipped persona

The instrument is `_orch/nodes/P11/work/acceptance.sh` line 92, printed under
`=== Check 7: the cut mechanism is gone from every shipped persona ===`:

```sh
grep -l '^## In ' personas/luminaries/*.md && echo "FAIL: override sections survive" || echo "OK"
```

The predicate is identical to check 2's — the same grep over the same corpus — but the polarity
of the shell logic is inverted (a match now means `FAIL`) and it runs as a **final-gate**
re-assertion rather than a post-cut check. This is check 7 of directive §6, unedited.

## Guarded artifact class

The absence of the `## In <PHASE>` override-cut mechanism from every shipped luminary persona
file — `personas/luminaries/*.md` — the same class check 2 guards, re-asserted at the point the
run considers the persona bundle final.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 7` / `check-7` / `check7`) together with a `personas/luminaries/` path — settled by `grep -l 'check 7' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 7` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-7-cut-mechanism-absent"].re_verification_nodes`; reproduce with `grep -rl 'Check 7' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | every recorded run of `acceptance.sh` shows this check printing `OK`; quiet, not useless (ADR SC4) |

### Settle the absence of a catch

```
grep -il 'check 7' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

## Scope

Authored by node `P123` to close ADR SC1 for check 7. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
