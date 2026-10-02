---
type: Instrument
id: check-4-hint-tag-resolution
title: Every tag named in a mode hint resolves to a persona that carries it
status: active
generated:
  by: agent:claude-opus-5
  at: 2026-08-27
verified:
  - by: node:P20-verify
    at: 2026-08-25
  - by: node:P111
    at: 2026-08-27
repaired:
  - by: node:P111
    at: 2026-08-27
promoted:
  by: node:P111
  at: 2026-08-27
  note: >-
    P111 promoted this record to `active` having itself repaired and authored
    it — the collision operator decision 3's authorship bar exists to refuse,
    recorded plainly in this file's own "Promotion" section rather than
    papered over. An independent re-judge by a verifier that wrote none of
    the repair, the fixtures or the record then re-judged the promotion sound
    on its own authority: _orch/verify/P111-verdict.json,
    authorship_bar.does_the_promotion_to_active_stand.my_answer — "YES —
    `active` stands, on this verdict rather than on P111's own say-so, and
    with one required documentation correction." — and
    authorship_bar.role — "This verifier did not write the repair, the
    fixtures or the record; every claim below was re-run independently."
provenance:
  confidence: medium
  source: derived
links:
  - rel: guards
    to: prompt-modes-hint-paragraphs
    note: >-
      the casting upgrade-hint paragraph in every prompt/modes/*.md — the paragraph
      naming preferred persona tags as `a`/`b`/`c` chains against a seat slug. Ten
      files today: BUILD, CRAFT, DOGFOOD, GENERIC, IMPROVE, MIGRATE, POSITION,
      REVIEW, ROADMAP, TEST.
  - rel: contradicts
    to: check-4-negative-fixture-odd-chain
    note: >-
      _orch/nodes/P111/work/fixtures/odd-chain/ — a copy of prompt/modes/ with
      `analysis`/`api`/`zzz-odd-chain-unresolved` seeded at ROADMAP.md:112. The
      third element resolves to no persona. The unrepaired instrument passes this
      corpus; the repaired one must reject it.
  - rel: contradicts
    to: check-4-negative-fixture-newline-straddle
    note: >-
      _orch/nodes/P111/work/fixtures/newline-straddle/ — a copy of prompt/modes/
      with `analysis`/ ending ROADMAP.md:112 and `zzz-straddle-unresolved`
      beginning ROADMAP.md:113. The second element resolves to no persona. The
      unrepaired instrument passes this corpus; the repaired one must reject it.
  - rel: relates-to
    to: instrument-lifecycle
    note: the ADR whose Worked Example table this record instantiates
---

# Instrument: check 4 — hint-tag resolution

The instrument is `tools/check4-hint-tags.sh`. It is wired into check 4 of
`_orch/nodes/P11/work/acceptance.sh`. It prints the hint tags named in
`prompt/modes/*.md` that no persona carries, one per line, sorted. Empty output is a pass.

This is the first Instrument record authored under
`docs/designs/instrument-lifecycle.md`. It instantiates that ADR's *Worked Example* table.

## Location is provisional

**Open Question 2 of the ADR — "Does an instrument record live beside its instrument, or in
one bundle?" — is deliberately still open, and this node did not settle it.** The record sits
at `tools/check4-hint-tags.instrument.md`, beside its instrument, because that is the more
discoverable of the two options and because there is exactly one record so far, which is too
small a sample to choose a bundle layout from. If the operator later prefers one bundle, moving
this file is a rename; nothing references its path except this sentence and P111's digest.

## History

Each line carries the evidence path that settles it.

| field | value | evidence |
|---|---|---|
| defects caught, lifetime | **0** | no verdict under `_orch/verify/` cites check 4 as the instrument that found a defect; check 4 has printed empty (or the same stable residue) in every invariant block from phase 2 to phase 11 |
| re-verifications caused | several | its output is quoted in the phase-2 through phase-11 invariant blocks |
| known-blind since | **phase 3** | `_orch/verify/P20-verdict.json` |
| disposition then | **filed residual, never applied** | the unrepaired regex was still in `_orch/nodes/P11/work/acceptance.sh` at the start of node P111 on 2026-08-27 — preserved verbatim at `_orch/nodes/P111/work/acceptance.sh.pre` lines 44-47 and as a runnable script at `_orch/nodes/P111/work/check4-broken.sh` |
| correctness today (pre-repair) | right answer, unsound method — 75 of 76 hint tags | ADR *Worked Example*; and see *Correction* below |
| exit condition | reject a seeded odd-chain **and** a newline-straddling pair | met — `_orch/nodes/P111/work/fixture-proof.md` §4 |

### The phase-3 record, quoted verbatim

`_orch/verify/P20-verdict.json`, criterion 13, `probe` field — quoted from the file, not
paraphrased from the ADR:

> Ran the exact check-4 regex `grep -ohE '`[a-z-]+`/`[a-z-]+`'` over each extracted paragraph:
> CRAFT yields 13 pairs, POSITION 12. Attacked the non-overlapping-match trap the existing
> modes fall into — REVIEW.md's hint chains four tags as
> `architecture`/`contracts`/`api-design`/`domain-modeling`, where **the regex consumes the
> first pair and leaves the rest invisible** — and neither new paragraph chains: every pair is
> exactly two tags, and no pair straddles a newline.

The same file's top-level `probe` field records the second half of the defect, and records
explicitly that it was filed as a non-blocking residual:

> Two residual findings for the phase runner, **neither blocking**: [...] the design warns
> P21/P22 never to put a digit-bearing tag in a hint pair but not that re-wrapping a
> transcribed paragraph can split a pair across a newline, where **the line-based check-4 grep
> would stop seeing it**.

Both halves of the defect were therefore known in phase 3, on 2026-08-25. Neither was applied.
The regex reached this node unchanged, five phases later.

Settle it:

```
grep -c 'the regex consumes the first pair and leaves the rest invisible' _orch/verify/P20-verdict.json
grep -c 'the line-based check-4 grep would stop seeing it' _orch/verify/P20-verdict.json
```

### The defect, stated

The pre-repair extractor was

```sh
grep -rhoE '`[a-z-]+`/`[a-z-]+`' prompt/modes/*.md | tr '/' '\n' | tr -d '`' | sort -u
```

1. `grep -o` matches **non-overlapping**, so in a chain `` `a`/`b`/`c` `` it consumes
   `` `a`/`b` `` and never sees `c`. Every odd-length chain lost its tail.
2. It is **line-based**, so a chain whose `/` separator straddles a newline was invisible on
   both sides of the break.

Under the ADR's classifier that is `dormant_because: unsound`, and `unsound` is **blocked from
gating**. Recording it dormant would have shipped this branch with the guard on hint-tag
resolution removed, so the phase-12 brief directed a repair instead.

### Correction to the ADR's "75 of 76"

The ADR records the pre-repair extractor as seeing **75 of 76** hint tags, with the single
invisible tag being `threat-modeling`. Measured by the repaired extractor over the same corpus
on 2026-08-27, the true figure is **75 of 79**. Four tags were invisible, not one:

| tag | why invisible | file:line | resolves? |
|---|---|---|---|
| `threat-modeling` | 3rd element of a same-line odd chain | `prompt/modes/TEST.md:150`, `prompt/modes/REVIEW.md:159` | yes |
| `discovery` | 3rd element of an odd chain split by a line wrap | `prompt/modes/BUILD.md:150`→`151` | yes |
| `statistical-rigor` | 3rd element of an odd chain split by a line wrap | `prompt/modes/DOGFOOD.md:167`→`168`, `prompt/modes/REVIEW.md:162`→`163` | yes |
| `generalist` | **1st** element of a chain split by a line wrap | `prompt/modes/REVIEW.md:161`→`162` | **no** |

The ADR's figure was itself derived from an extractor that handled defect (1) but not defect
(2), which is the mechanism the ADR warns about in *Failure Modes*: an unmeasured instrument
measuring an unmeasured instrument. Full derivation in
`_orch/nodes/P111/work/acceptance.md` §F-§G.

### The instrument's first catch, and it is unresolved

The fourth row above is the whole point of this record. `generalist` is named as a preferred
tag for the `blindspot` seat at `prompt/modes/REVIEW.md:161`, no persona carries it, and no
instrument in this repository had ever seen it. Check 4's lifetime catch count moves from 0 to
1 on the day it is repaired.

Because that moves check 4's reported answer from 11 unresolved tags to 12, node P111 returned
**`BLOCKED`** rather than accepting the new number, per its handoff step 5 — fitting the
instrument to the expected answer is the failure this whole design exists to prevent. The
finding is at `_orch/nodes/P111/work/finding.md`; the operator question is at
`_orch/inbox/Q-12.md`. **The extractor was not adjusted to reach 11.**

## Repair

`tools/check4-hint-tags.sh`, POSIX shell, takes the modes directory as `$1` (default
`prompt/modes`) so `acceptance.sh` and the fixture harness run the same code path.

- **Joining.** A line is joined to the next **only** where the join point is genuinely a chain
  separator: the line ends with a closing backtick immediately followed by `/`, or the next
  line begins with `/` immediately followed by an opening backtick. Joining unconditionally
  would invent chains out of ordinary adjacent backticked prose —
  `prompt/modes/CRAFT.md:222`→`223` is exactly that shape, two hint clauses joined by the
  English word "and", and the rule correctly declines it. Six joins are performed over the real
  corpus, all six enumerated with both lines in `_orch/nodes/P111/work/acceptance.md` §H.
- **Extraction.** Two passes are unioned rather than one pair-matching pass:
  `` `[a-z-]+`/ `` (every element followed by a separator) and `` /`[a-z-]+` `` (every element
  preceded by one). Each pass tiles cleanly, so non-overlapping matching costs nothing; the
  first yields every element of a chain but the last, the second every element but the first,
  and the union is every element at any chain length. A lone backticked word with no `/` on
  either side matches neither pass, which preserves the property that made hint tags separable
  from seat slugs and ordinary prose. (P115 tightened both passes to additionally require a
  backtick on the far side of the separator, and made the line-join step reset on a blank line —
  see **Known limitations**, below — without moving the answer over the real corpus.)
- **Scratch** via `mktemp` with a `trap ... EXIT HUP INT TERM`, never the old fixed
  `/tmp/hinted.txt` / `/tmp/carried.txt`.
- **The persona side is unchanged** — same three globs
  (`personas/luminaries/*.md personas/lenses/*.md personas/users/*.md`), same `sed`/`tr`
  handling, same `comm -23`, same output shape.

Nothing was invented **over the corpus this instrument guards**: the repaired tag set is a
strict superset of the pre-repair set (`comm -23 broken repaired` is empty), and every one of
the four delta members is traced to a real hint chain with its `file:line` quoted. Evidence:
`_orch/nodes/P111/work/acceptance.md` §F and §G.

**Correction (P115, 2026-08-28).** This was originally stated as an unconditional property of
the repair — "nothing was invented," full stop. `_orch/verify/P111-verdict.json`'s
authorship-bar review flagged that as an overstatement: what the evidence actually supports is
that the repair is sound over the corpus it guards and over both of P111's fixtures, **not**
that it is unconditionally sound. The same review found two latent over-reach classes the repair
had not been asked to reject and had not been tested against. Neither affected any reading in
this run — see **Known limitations**, below, for both, and for their closure.

The edit to check 4 in `_orch/nodes/P11/work/acceptance.sh` is authorised from **outside** the
run by `_orch/phases/P12/brief.md` — the same shape as check 6's authorisation in
`_orch/inbox/Q-04.answer.md`, not a node quietly relaxing its own gate. The authorisation is
named in a comment at the edit site. No other check in that file was touched.

## Promotion — 2026-08-27

`status` moves `dormant`/`unsound` → **`active`**. `dormant_because` is dropped.

**The mechanical gate (operator decision 3, 2026-08-27).** `unsound` leaves `blocked` only by
being repaired *and* rejecting a negative fixture it is known to fail. Both fixtures were built
and proven against the **unrepaired** instrument first, before any repair existed:

| fixture | seeded tag | unrepaired instrument | repaired instrument |
|---|---|---|---|
| `_orch/nodes/P111/work/fixtures/odd-chain/` | `zzz-odd-chain-unresolved` | does **not** surface it — fixture passes, check is blind | **surfaces it** — fixture rejected |
| `_orch/nodes/P111/work/fixtures/newline-straddle/` | `zzz-straddle-unresolved` | does **not** surface it — fixture passes, check is blind | **surfaces it** — fixture rejected |

Evidence paths:

- `_orch/nodes/P111/work/fixture-proof.md` §1 — the fixtures, and `diff -rq` showing each is a
  copy of `prompt/modes/` differing in one file.
- `_orch/nodes/P111/work/fixture-proof.md` §2 — `grep` proving neither seeded tag is carried by
  any persona.
- `_orch/nodes/P111/work/fixture-proof.md` §3 — the **pre-repair** runs of
  `_orch/nodes/P111/work/check4-broken.sh` against both fixtures, seeded tag absent in each.
- `_orch/nodes/P111/work/fixture-proof.md` §4 — the post-repair runs of
  `tools/check4-hint-tags.sh` against both fixtures, seeded tag surfaced in each.
- `_orch/nodes/P111/work/check4-broken.sh` — the unrepaired pipeline, kept runnable so the
  fixtures can be re-proven against it at any time.

**The authorship bar is NOT met, and this is not papered over.** Operator decision 3 makes
promotion a mechanical gate *plus an authorship bar*, and `unsound` additionally requires a
human. Node P111 is **both the repairer and the promoter** of this instrument. It wrote the
repair, it wrote the fixtures the repair is judged against, and it is recording its own
promotion. No independent agent reviewed either. That is precisely the author-and-judge
collision the ADR's Open Question 1 names and the instrument-lifecycle design exists to expose,
and it is present here in the first record the design ever produced.

The promotion therefore does **not** rest on an independent judgement. It rests on the human
authorisation carried by `_orch/phases/P12/brief.md`, which directed this node to repair check 4
rather than record it dormant. If that authorisation is read narrowly — as authorising the
*repair* but not the *self-promotion* — then `status` should be `candidate`, not `active`, and
this record should be re-judged by an agent that did not write the repair. The operator question
at `_orch/inbox/Q-12.md` puts that choice, alongside the `generalist` finding, in front of a
human.

## Known limitations — found 2026-08-27, closed 2026-08-28

`_orch/verify/P111-verdict.json`'s authorship-bar review — the second, independently-written
reference extractor checked against P111's repair — found two latent over-reach classes. Neither
occurred anywhere in the corpus this instrument guards, so neither affected any reading at the
time; both were nonetheless exactly the "unsound but right by luck" condition this whole design
exists to correct. Node P115 closed both.

1. **Over-join across a blank line after a dangling separator.**
   - Reproduction, quoted verbatim from `_orch/verify/P111-verdict.json`,
     `authorship_bar.is_the_repair_sound_or_merely_agreeable.attacks_that_landed_latently[0]`:
     a mode file containing line 1 ending `` the tags are `analysis`/ ``, line 2 blank, line 3
     beginning `` `zzz-after-blank` is ordinary prose, not a chain element. `` — the pre-P115
     extractor printed `zzz-after-blank`, which resolves to no persona and is not a chain
     element.
   - Mechanism: joining a blank line left the pending-separator state unchanged, so a dangling
     `` `/ `` survived the paragraph break and the next join absorbed the following paragraph's
     first backticked word as if it were a chain continuation.
   - Disposition: **closed by P115.** The line-join step now resets pending-separator state on
     any blank line. Guarded by `_orch/nodes/P115/work/fixtures/blank-line-overjoin/` — proven
     to fail against the pre-fix extractor and pass against the fixed one in
     `_orch/nodes/P115/work/fixture-proof.md` §3–§4.

2. **Single-sided element matching.**
   - Reproduction, quoted verbatim from the same verdict field, index 1: a mode file containing
     `` See `prompt`/modes for the modes, and tools/`zzz-path-right` for tools. `` — the pre-P115
     extractor printed both `prompt` and `zzz-path-right`, neither a genuine chain element.
   - Mechanism: the two extraction passes required a backtick on only one side of the `/`, so a
     backtick-delimited token adjacent to a bare `/` (e.g. path-shaped inline code) read as a
     chain element.
   - Disposition: **closed by P115.** Each pass now requires a backtick on the far side of the
     separator too, via a throwaway-duplicated private copy of the joined text (`sed` doubles the
     far-side backtick before each pass' `grep`) so the far-side check never costs the next token
     its own delimiter — the non-overlapping tiling property that made odd-length chains visible
     is preserved. See the header comment in `tools/check4-hint-tags.sh`. Guarded by
     `_orch/nodes/P115/work/fixtures/single-sided/`, proven the same way in
     `_orch/nodes/P115/work/fixture-proof.md` §3–§4.

Both fixtures are copies of `prompt/modes/` with the shape seeded and a `zzz-`-prefixed token
that no persona carries (settled by `grep`, `_orch/nodes/P115/work/fixture-proof.md` §2).
Closing both did **not** move the extractor's answer over the real corpus: `sh
tools/check4-hint-tags.sh` still prints exactly the same 12 tags, identical to
`_orch/nodes/PR12/work/check4-after-P111.txt` (`_orch/nodes/P115/work/fixture-proof.md` §6), and
P111's two existing fixtures — `odd-chain` and `newline-straddle` — are still rejected
(`_orch/nodes/P115/work/fixture-proof.md` §5).

This record makes no claim that these were the only two latent classes possible — only that
these are the two the verifier found, and that this node closed both.

## Scope

Node P111 authored an Instrument record for check 4 only. The other checks in
`acceptance.sh` have none. ADR success criterion SC1 ("every standing check has an Instrument
record with a `guards` edge") is therefore **not** met by this node and remains open.
