---
type: Instrument
id: check-3-no-orchestrator-prose
title: No orchestrator-addressed prose came along with the luminary cut
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
    to: luminary-orchestrator-prose-absent
    note: >-
      the absence of orchestrator-addressed `## Protocol` / `## Audit Output` sections
      from every vendored luminary persona file — personas/luminaries/*.md.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 3 — no orchestrator-addressed prose came along

The instrument is `_orch/nodes/P11/work/acceptance.sh` line 38, printed under
`=== Check 3: no orchestrator-addressed prose came along ===`:

```sh
grep -l '^## Protocol\|^## Audit Output' personas/luminaries/*.md || echo "OK: clean"
```

It lists any vendored luminary file still carrying an orchestrator-addressed `## Protocol` or
`## Audit Output` section (prose meant for the source framework's own orchestrator, not for
baton). On a clean corpus it prints `OK: clean`. This is check 3 of directive §6, unedited.

## Guarded artifact class

The absence of orchestrator-addressed `## Protocol` / `## Audit Output` sections from every
vendored luminary persona file — `personas/luminaries/*.md`.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 3` / `check-3` / `check3`) together with a `personas/luminaries/` path — settled by `grep -l 'check 3' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 3` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-3-no-orchestrator-prose"].re_verification_nodes`; reproduce with `grep -rl 'Check 3' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | the check runs unconditionally on every `acceptance.sh` invocation and has always printed `OK: clean`; quiet, not useless (ADR SC4) |

### Settle the absence of a catch

```
grep -il 'check 3' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

## Scope

Authored by node `P123` to close ADR SC1 for check 3. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
