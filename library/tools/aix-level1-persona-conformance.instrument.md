---
type: Instrument
id: aix-level1-persona-conformance
title: Every file in baton's own personas/ bundle conforms to AIX Level 1
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
    to: aix-level1-own-bundle-conformance
    note: >-
      AIX Level 1 conformance (a non-empty `type` field, per tools/aix-validate.py) of
      every file in baton's own personas bundle — personas/lenses/*.md,
      personas/users/*.md and personas/luminaries/*.md — and only that bundle: it must
      never be pointed at a roster loaded from a `repo:` or `path:` source, per
      personas/CONTRACT.md §1.1 and _orch/nodes/P94/handoff.md.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: the AIX Level 1 check — not one of the nine

The instrument is the block at the end of `_orch/nodes/P11/work/acceptance.sh` (after `exit 0`'s
preceding lines), printed under
`=== AIX check (added by _orch/nodes/P94/handoff.md — not one of the nine) ===`. It runs
`python3 tools/aix-validate.py /Users/clank/Desktop/projects/baton/personas --level 1` and prints
`AIX LEVEL 1 OK` on success, `AIX LEVEL 1 FAIL` followed by the validator's own output on any
error, or a `SKIPPED` token naming the reason if `python3` or the validator is missing. This check
is **not one of directive §6's nine** — it was added by `_orch/nodes/P94/handoff.md` ("P94 — wire
the AIX validator in as a check") and the acceptance-harness comment at the block says so plainly.
It is nonetheless a standing check in `acceptance.sh` today, so ADR SC1 applies to it the same as
to the nine, and this node's handoff names it explicitly as one of the ten blocks to cover.

**Scope is non-negotiable and load-bearing** (`_orch/nodes/P94/handoff.md`'s own THE HAZARD
section): this check validates **only** `/Users/clank/Desktop/projects/baton/personas` — baton's
own bundle. A minimal foreign persona carrying only `name` and `domain` — precisely the shape
`personas/CONTRACT.md` §1.1 guarantees loads unmodified — **fails** AIX Level 0, because AIX
requires `type` and §1.1 does not. Running this check against a loaded foreign roster would make
AIX conformance a precondition of adoption and break that promise. This Instrument record's
`guards` edge is scoped identically, for the same reason.

## Guarded artifact class

AIX Level 1 conformance of every file in baton's own `personas/` bundle —
`personas/lenses/*.md`, `personas/users/*.md`, `personas/luminaries/*.md` — validated by
`tools/aix-validate.py --level 1`, and never a roster resolved from a `repo:` or `path:` source.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no `_orch/inbox/Q-*.md` names this instrument (`aix`) together with a `personas/` path — settled by `grep -il 'aix' _orch/inbox/Q-*.md` (excluding `*.answer.md`), which returns nothing |
| re-verifications caused | `tools/instruments.py` itself derives **1** (node `P123`, whose own `work/acceptance.md` quotes this record's id, and whose `work/invariant.txt` shows the check actually running and printing `AIX LEVEL 1 OK`); **independently, by direct citation, 32 files** across the whole run's `_orch/nodes/*/work/` contain the literal string `AIX LEVEL 1` | tool's own derivation: `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="aix-level1-persona-conformance"].re_verifications_caused`/`.re_verification_nodes`. Independent citation: `grep -rl 'AIX LEVEL 1' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` → 32 (one of the 32 is `_orch/nodes/P11/work/acceptance.sh` itself, the script source, not a run record) |
| last fired | `unknown` — `P123` is the one recorded firing but has not yet been appended to `_orch/ledger.csv` (ledger rows are written at envelope receipt by the phase runner, after this node returns), so it cannot be ordered against the other checks' firings | `_orch/instruments/instruments.json` → same row, `last_fired_basis` (`last-fired-unorderable` finding); `_orch/ledger.csv` row order, never a clock |
| dormant_because | **never-fired** | no `_orch/inbox/Q-*.md` ties a defect to this check against baton's own `personas/`; every recorded run this node found prints `AIX LEVEL 1 OK` |

### Settle the absence of a catch

```
grep -il 'aix' _orch/inbox/Q-*.md | grep -v '\.answer\.md$'
```
No output.

### A methodological note, stated rather than hidden

This record's `id` does not carry the `check-<digit>` shape, so `tools/instruments.py`'s
`instrument_markers` special-case (which expands e.g. `check-4-...` into `check 4`/`check-4`/
`check4`) does not apply here, and the tool's own substring-marker match against corpus prose
finds this record's exact id string in only one place — the prose of this very node's own
`work/acceptance.md` — rather than in the many historical run records that actually printed
`AIX LEVEL 1 OK` before this record existed. That is a known, explainable gap in the tool's
heuristic (it can only find a marker coined *after* the record is authored, never retroactively),
not an error in this record's evidence: the `grep -rl 'AIX LEVEL 1'` command above independently
and directly settles that this check has run and passed repeatedly, sourced from 32 real files
under `_orch/nodes/`, cited by path, most of them predating this record. See
`_orch/nodes/P123/work/acceptance.md` for the reconciliation between the two.

## Scope

Authored by node `P123` to close ADR SC1 for the AIX check. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
