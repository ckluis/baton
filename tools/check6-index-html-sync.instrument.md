---
type: Instrument
id: check-6-index-html-sync
title: index.html is not stale relative to what tools/embed.py regenerates
status: active
generated:
  by: agent:claude-sonnet-5
  at: 2026-08-31
provenance:
  confidence: medium
  source: derived
links:
  - rel: guards
    to: index-html-embed-sync
    note: >-
      ./index.html staying byte-identical to what tools/embed.py regenerates from the
      current persona/mode corpus after any hand-edit — the embedded <pre> blocks and
      the two line counts.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR this record is authored to close SC1 against.
---

# Instrument: check 6 — the page is not stale

The instrument is `_orch/nodes/P11/work/acceptance.sh` lines 85-88, printed under
`=== Check 6: the page is not stale ===`:

```sh
tmp=$(mktemp); cp index.html "$tmp"
python3 tools/embed.py
diff -q "$tmp" index.html >/dev/null && echo "index.html in sync" || { echo "PAGE STALE"; cp "$tmp" index.html; echo "index.html restored to its pre-check content"; }
rm -f "$tmp"
```

This is **not** directive §6 verbatim. The literal §6 line (`git diff --quiet index.html`) can
only pass by staging or committing `index.html`, both forbidden by D1-C, so `_orch/inbox/Q-04.md`
asked which rule bends; `Q-04.answer.md` authorised this snapshot-diff form from outside the run.
`P11`'s header comment cites that authorisation, and it is the same shape as check 5's authorised
deviation — a node is not quietly relaxing its own gate.

## Guarded artifact class

`./index.html` staying in sync with what `tools/embed.py` regenerates from `personas/` and
`prompt/modes/*.md` — i.e. that a hand-edit to the page's stats, layout or `PERSONAS` table is
never left stale by a forgotten re-embed.

## History

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **2** | `_orch/inbox/Q-04.md` and `_orch/inbox/Q-09.md` each name `check 6` and name `index.html` — settled below |
| re-verifications caused | **28** nodes, 47 artefacts | `_orch/instruments/instruments.json` → `yield_per_instrument[instrument="check-6-index-html-sync"].re_verification_nodes`; reproduce with `grep -rl 'Check 6' _orch/nodes/*/work/{invariant,acceptance}* 2>/dev/null \| wc -l` |
| last fired | **P122-verify2** | `_orch/ledger.csv` row 209 (append-only, so row order is run order) is the latest of the 28 re-verifying nodes — `_orch/instruments/instruments.json` → same row, `last_fired_basis` |
| status | **active** | it runs and gates on every `acceptance.sh` invocation; every recorded run this node found prints `index.html in sync` |

### The two catches, characterised honestly

`_orch/inbox/Q-04.md` and `_orch/inbox/Q-09.md` are what this instrument's own tooling attributes
as "defects caught" — each names `check 6` and names `index.html`. Read plainly, neither is a
defect the check found in a live, currently-shipped `index.html`:

- `Q-04.md` is a defect in **check 6's own directive-§6 wording**, discovered before the check was
  ever written into `acceptance.sh` in its current form: the literal `git diff --quiet` form can
  never pass once `index.html` is hand-edited without staging or committing, which D1-C forbids.
  `Q-04.answer.md` fixed the check's own design (the snapshot-diff form above) rather than finding
  anything wrong with the page's content.
- `Q-09.md` is `P76`'s unbounded-instrument dispute (a different check, its own done-criterion 1);
  it mentions check 6 only in passing, as one line of evidence that `P76`'s other criteria were
  clean ("`tools/embed.py` run, check 6 prints `index.html in sync`"). It is not check 6 catching
  anything either.

Both are recorded here rather than suppressed because the tool's own derivation attributes them
mechanically and this record does not get to edit that out — see `_orch/nodes/P123/work/acceptance.md`
for the same point stated for the scorecard.

```
grep -c 'check 6' _orch/inbox/Q-04.md _orch/inbox/Q-09.md
grep -c 'index.html' _orch/inbox/Q-04.md _orch/inbox/Q-09.md
```

## Scope

Authored by node `P123` to close ADR SC1 for check 6. Findings `tools/instruments.py` raises
against this record are listed in `_orch/nodes/P123/work/acceptance.md`.
