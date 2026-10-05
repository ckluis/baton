---
type: Instrument
id: check-8-new-mode-no-roster
title: Every new mode runs with no roster at all
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
    to: new-mode-fallback-persona-resolution
    note: >-
      every CRAFT/POSITION seat's fallback persona file existing on disk, so each new
      mode still resolves with no roster at all (CONTRACT §4.2's property every
      existing mode already has) — prompt/modes/CRAFT.md and prompt/modes/POSITION.md
      against personas/lenses/*.md, personas/users/*.md and personas/luminaries/*.md.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 8 — every new mode runs with no roster at all

The instrument is `_orch/nodes/P11/work/acceptance.sh` lines 96-107, printed under
`=== Check 8: every new mode runs with no roster at all ===`. For `CRAFT` and `POSITION`, it
extracts each Seats-table row between `## Seats` and `## Gates`, and for every `expert` seat
requires a matching file in `personas/lenses/` or `personas/luminaries/`, and for every `user` seat
a matching file in `personas/users/`. It echoes `$m not authored` if the mode file is absent, or
`$m seat $slug has NO fallback lens` / `... has NO user file` for a missing fallback. **Silence is
the pass condition.** This is check 8 of directive §6, unedited.

## Guarded artifact class

Every `CRAFT`/`POSITION` seat's fallback persona file existing on disk — `prompt/modes/CRAFT.md`
and `prompt/modes/POSITION.md` against `personas/lenses/*.md`, `personas/users/*.md` and
`personas/luminaries/*.md` — the same no-roster-operable property check 5 verifies indirectly by
actually running `bundle.sh`, checked here directly against the Seats table instead.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 8` / `check-8` / `check8`) together with a `prompt/modes/` or `personas/` path — settled by `grep -l 'check 8' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 8` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-8-new-mode-no-roster"].re_verification_nodes`; reproduce with `grep -rl 'Check 8' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | every recorded run of `acceptance.sh` prints nothing for this block; quiet, not useless (ADR SC4) |

### Settle the absence of a catch

```
grep -il 'check 8' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

## Scope

Authored by node `P123` to close ADR SC1 for check 8. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
