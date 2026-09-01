---
type: Instrument
id: check-5-mode-bundle-integrity
title: Every mode plus ALL still bundles via bundle.sh
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
    to: mode-bundle-integrity
    note: >-
      every mode file's ability to bundle via bundle.sh, including the no-argument
      ALL bundle — prompt/modes/*.md against bundle.sh, and by extension every seat's
      persona resolution the bundle step depends on.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 5 — every mode plus ALL still bundles

The instrument is `_orch/nodes/P11/work/acceptance.sh` lines 68-72, printed under
`=== Check 5: every mode plus ALL still bundles ===`. For every `prompt/modes/*.md` file it runs
`sh bundle.sh <mode>` and echoes `<mode> OK` or `<mode> FAIL`, then runs the no-argument
`sh bundle.sh` for `ALL` the same way, and removes the `dist` directory it produces. Directive §6
gave a literal 8-mode list; this harness instead derives the mode list from
`ls prompt/modes/*.md` — the authorised deviation named in `_orch/nodes/P11/handoff.md` — so it
passes unedited at 8 modes and at 10 once `CRAFT`/`POSITION` land.

## Guarded artifact class

Every mode file's ability to bundle — `prompt/modes/*.md` resolved through `bundle.sh` — including
the no-argument `ALL` bundle. A bundle failure here means a mode's seats do not all resolve to a
real persona file, the exact failure mode check 8 also guards for the two newest modes
specifically.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`check 5` / `check-5` / `check5`) together with a `prompt/modes/` or `bundle.sh` path — settled by `grep -l 'check 5' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | **28** nodes, matched via `check 5` | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-5-mode-bundle-integrity"].re_verification_nodes`; reproduce with `grep -rl 'Check 5' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, row order is run order) is the latest of the 28 re-verifying nodes — same `yield_per_instrument` row, `last_fired_basis` |
| dormant_because | **never-fired** | every recorded run of `acceptance.sh` shows every mode plus `ALL` bundling `OK`; the mode list grew from 8 to 10 without the harness or this check needing to change |

### Settle the absence of a catch

```
grep -il 'check 5' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

## Scope

Authored by node `P123` to close ADR SC1 for check 5. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
