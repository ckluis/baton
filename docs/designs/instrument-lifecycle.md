---
type: Design
id: instrument-lifecycle
title: Instrument Lifecycle — dormancy, classifiers, and revival triggers
status: accepted
generated:
  by: agent:claude-opus-5
  at: 2026-08-27
provenance:
  confidence: medium
  source: primary
links:
  - rel: relates-to
    to: stage-aware-luminaries
    note: the run whose corpus supplies every number cited here
---

# Design: Instrument Lifecycle — dormancy, classifiers, and revival triggers

> This file carries AIX frontmatter and its siblings in `docs/designs/` do not. That is
> deliberate, not drift: a document proposing that instruments be AIX-encoded concepts should
> be one. Nothing validates `docs/` — the acceptance check is scoped to `personas/` — so the
> keys cost nothing and commit no one.

Drafted 2026-08-27 from the corpus of the phase-aware-luminaries run · Branch: `phase-aware-luminaries`
Repo: ckluis/baton
Status: **ACCEPTED.** Built in this branch. See Operator Decisions below.
Mode: Design

## Operator Decisions

All four decisions below were made **2026-08-27**.

1. **Build it now, in this branch.** The operator **overrode** this ADR's own recommendation.
   *Next Steps* (below) named "Operator decision on this ADR" as its first, gating step, and
   *Constraints* argued the lifecycle machinery "must not become a trusted-but-unverified
   oracle" and "must not create a new unmeasured instrument" — both counsel a decision before
   implementation, not implementation before a decision. The operator decided to build it
   anyway, in this branch, rather than defer. That override is recorded here plainly; the
   sentences arguing for deferral elsewhere in this document were not deleted, softened, or
   rewritten to agree with what happened.
2. **Add `attack:` to CONTRACT §9.1 now**, additive and optional — closes **Open Question 5**.
3. **Promotion is a mechanical gate plus an authorship bar.** A check may be promoted
   `dormant`/`blocked` → `active` only after (a) its named negative fixtures are proven, by
   independent re-run, to defeat the unrepaired instrument and to be rejected by the repaired
   one — the mechanical gate — and (b) an agent who was neither the repairer nor the check's own
   promoter signs off — the authorship bar. This closes **Open Question 1**. `unsound` and
   `unsettleable` instruments additionally require a human in the loop; the mechanical gate and
   the authorship bar alone are not sufficient for those two classifiers.
4. **`tools/index.py` fires from the phase gate, not a harness hook.** The standalone,
   no-hook-dependency constraint above (see *Constraints*) extends to how the index is invoked,
   not just how it is written: baton stays provider-agnostic end to end.

## Problem Statement

baton measures its **agents** relentlessly and its **instruments** not at all.

Every agent output is refuted, cited, per-criterion verdicted, quota-audited and adjudicated.
Meanwhile the scripts and criteria doing that measuring are written once, trusted forever, and
never scored. The run just completed makes the asymmetry concrete:

- **`check 4` is unsound and shipped anyway.** Its extractor,
  `grep -rhoE '`[a-z-]+`/`[a-z-]+`'`, matches non-overlapping pairs, so the third element of an
  odd-length tag chain is silently dropped. Proven with a fixture: given ``x `a`/`b`/`c` y`` it
  reports `a` and `b` and never sees `c`. This happens for real — REVIEW.md's
  `` `distributed`/`operations`/`observability` `` chain yields only `distributed` and
  `operations` to the check.
- **It got the wrong answer, using an unsound method — and this document's own first measurement
  of that fact was itself wrong.** Measured against a correct extractor, the unrepaired check
  sees 75 of 79 hint tags. An earlier draft of this document put the total at 76, not 79 — three
  short — and named only one tag as invisible. Four tags
  were invisible to it, not one: `threat-modeling` (`REVIEW.md:159`, `TEST.md:150`), `discovery`
  (`BUILD.md:150-151`), `statistical-rigor` (`DOGFOOD.md:167-168`, `REVIEW.md:162-163`) and
  `generalist` (`REVIEW.md:161-162`) — the last three all newline-straddling; `observability` is
  rescued only because it appears in a second chain elsewhere. The unresolved count the unrepaired check
  reports — 11 — is **not** correct either: `generalist` resolves to no persona, so the true
  unresolved count is 12. This document's own original measurement was taken with a
  partially-blind extractor — one that fixed the non-overlapping-match defect but **not** the
  line-based one, so it could see `threat-modeling` (a same-line third element) and could not
  see the three newline-straddling tags. **The document diagnosing an unsound instrument was
  itself written using an unsound instrument.** **Soundness and correctness came apart and
  nobody could tell — including this document, on its first pass** — because a passing
  `comm -23` prints nothing. Independent verification: `_orch/verify/P111-verdict.json`,
  `authorship_bar.adr_count_recomputed`.
- **We already knew.** `_orch/verify/P20-verdict.json` records a verifier finding that "the
  regex consumes the first pair and leaves the rest invisible" — in phase 3. It was filed as
  residual, neither blocking, and **never applied**. The regex is in `acceptance.sh` today.
- **Six done-criteria were unsettleable** in two shapes — criteria measuring the git tree or
  branch on a branch forbidden to commit (where 40+ files are untracked, so `git show HEAD:` is
  inapplicable), and criteria asking a verifier to enumerate every instance of something with no
  defined enumeration method. One was refuted by four independent verifiers, each finding a
  *different* gap.
- **The evidence to score instruments exists but has no schema slot.** 220 verdict files carry
  889 criterion rows with `probe`, `evidence`, `quote`, `criterion` and `author`. CONTRACT §9
  requires every `CONFIRMED` to "name the strongest attack it tried and why the attack failed" —
  but §9.1's row shape has no `attack` field, so it lives in prose and is heuristically
  detectable in only 133 of those 889 rows. This is §9.1's own lesson recurring one level up:
  *a duty nothing records is a duty nobody can check.*

Nothing in the framework asks whether a check has ever caught anything, and nothing records why
one was dropped. So checks accumulate monotonically, and the suite gets larger without getting
better.

## The Core Claim

**Retire an instrument to the ledger, not to the bin — and let the reason set the cadence.**

The first half is not a new principle; it is CONTRACT §5.1 applied one level up. The loop's seen
ledger records every candidate it has *ever* seen, "whether it was admitted or rejected," and
§5.1 names deduplicating against admitted-only as the classic non-convergence bug: a rejected
candidate reappears, is rejected again, and the loop never runs dry. Deleting a retired check
reproduces exactly that — the next run re-derives it, re-discovers it earns nothing, and
re-retires it, with no memory that the question was already settled.

The safety half matters just as much: **"never caught anything" is not "cannot catch anything."**
`check 4` caught nothing in part because the hint paragraphs were stable. Deleting it removes the
guard precisely when someone next edits a hint paragraph. That is switching off a smoke alarm
because it has never gone off.

The second half — cadence from cause — is what makes this more than bookkeeping. A single
"re-test every N runs" timer is wrong for four of the five reasons an instrument goes quiet.

## Constraints

- **Derived, never authoritative.** The scorecard and lifecycle index are generated from disk.
  Deleting them loses nothing. Files remain the source of truth (CONTRACT §6).
- **Standalone, stdlib-only, no server, no hook dependency.** Same contract as `tools/index.py`:
  baton is provider-agnostic and anything that needs a harness feature dies outside it.
- **Must not become a trusted-but-unverified oracle.** This design exists because instruments go
  unmeasured; it must not create a new unmeasured instrument. See *Failure Modes*.
- **Must not gate on its own wrong answer.** A lifecycle rule that is mistaken should produce a
  false alarm, never a false pass.
- **No new required frontmatter on `personas/`.** `bundle.sh` pastes whole persona files into
  every spawn, so keys there cost tokens in every run forever. Instrument records live beside the
  instruments, not on the personas.

## The Classifier

`dormant_because` is a **strict enum**, not prose. That is the whole load-bearing decision: if
the reason is free text, no generator can compute a revival, and this design degrades into a
comment.

| `dormant_because` | revival trigger | why not a timer |
|---|---|---|
| `never-fired` | **event** — the artifact class named by its `guards` edge changes | elapsed time is irrelevant; the guarded surface being touched is the entire signal |
| `unsound` | **blocked** — until the instrument is repaired *and* passes a negative fixture it is known to fail | reviving a broken oracle on a schedule re-runs a broken oracle. `check 4` is here |
| `unsettleable` | **never as-is** — only as a rewritten instrument, with the rewrite authorised from outside the run | the criterion is the defect, not the check; re-running it buys the same disagreement (CONTRACT §1.2 trigger 4) |
| `low-yield-high-cost` | **sampled** — every N runs | the only case where a timer is genuinely correct |
| `superseded` | **dependency** — revive only if its superseder goes dormant | an edge, not a schedule |

Only one of five is a timer. That is the argument for classifying the cause rather than tuning a
global N.

## Lifecycle

```
                  ┌───────────────────────────────────────────┐
                  │                                           │
   active ──────► dormant ──(trigger fires)──► candidate ─────┘
     ▲               │                             │
     │               │ (periodic, non-gating)      │ (passes negative fixture)
     │               ▼                             ▼
     │            shadow ──(fires in shadow)──► active
     │                                             
     └──────────────── repaired ◄──── blocked ◄── unsound / unsettleable
```

- **active** — runs, gates.
- **dormant** — does not gate. Carries `dormant_because` and a `guards` edge.
- **shadow** — runs, result recorded, **does not gate**.
- **candidate** — a trigger fired; queued for a human or a gate to promote.
- **blocked** — `unsound` or `unsettleable`; cannot be promoted until repaired and fixtured.

### Shadow mode is the part that earns this design

A dormant check that is never executed decays into an unknown: the codebase moves under it, and
on the day its trigger finally fires it fails for reasons unrelated to what it guards, and gets
retired again for the wrong reason. Running it occasionally with its result **recorded but not
gating** converts "dormant" from an unknown into a measured state.

It also repairs the silent-failure asymmetry that motivated all of this. Today a passing check is
indistinguishable from a blind one — both print nothing. Under this design, a dormant check that
wakes and fires is loud, and one that stays quiet across N shadow runs is *telling you its
guarded surface is stable*. Both are information. Silence stops being ambiguous.

## AIX Encoding

An instrument becomes an AIX concept. No new machinery is required — the fields exist:

```yaml
---
type: Instrument
id: check-4-hint-tag-resolution
title: Every tag named in a mode hint resolves to a persona that carries it
status: dormant
dormant_because: unsound
generated:
  by: agent:claude-opus-5
  at: 2026-08-27
verified:
  - by: node:P20-verify
    at: 2026-08-25
repaired:
  - by: node:P111
    at: 2026-08-27
provenance:
  confidence: low
  source: derived
links:
  - rel: guards
    to: prompt-modes-hint-paragraphs
    note: the casting upgrade-hint paragraph in every prompt/modes/*.md
  - rel: contradicts
    to: check-4-negative-fixture-odd-chain
    note: the fixture it must reject before it may leave `blocked`
---
```

`guards` is a custom rel. AIX §6.2 explicitly permits producers to introduce custom lowercase
kebab-case rels and **requires consumers to treat an unknown rel as a generic `relates-to`
rather than rejecting it** — so this costs nothing in interoperability and an OKF-only consumer
still sees the edge.

**`repaired:` — added 2026-08-31, by `P132`.** A list of entries, each carrying `by:` and `at:`,
the same shape as `verified:`. It names the parties that **repaired** this instrument, as
distinct from the parties that merely **re-reviewed** it and are recorded in `verified:`. The
field is **additive and optional**: an absent `repaired:` does not make a record malformed, does
not make it invalid, and does not make it fail any check — every record accepted before this
field existed stays a valid record with no `repaired:` key at all. It exists because
`tools/instruments.py`'s authorship bar could not tell a repairer from a purely independent
re-reviewer from `verified:` alone, and so over-refused the second case as if it were the
first — see *What Phase 13 Produced* below for the finding this closes.

**Absent is not the same as present-and-unreadable.** `tools/instruments.py` reads `repaired:`
— and `verified:`, which has the same shape — in three states, not two: **absent** (no such
key, an undeclared history), **declared** (a list every one of whose items is a mapping carrying
a non-empty `by:`), and **malformed** (the key is present and its value is anything else). Only
the block-list form above is `declared`. A `by:`/`at:` mapping written directly under the key, a
bare scalar, `null`, an empty key, or a list holding an item that is not a mapping or carries no
`by:` are all **malformed**, and so — because this frontmatter dialect has no flow sequences and
reads `[]` as the two-character string `"[]"` — is `repaired: []`. A malformed value never reads
as a declared-but-empty history: the authorship bar answers `unknown` plus an
`authorship-bar-undecidable` finding naming the shape it actually read, never `true`. The cost
is a deliberate over-refusal — a record that means "nobody repaired me" cannot say so in this
dialect and is answered `unknown` — and that is the direction this gate is required to fail in.
Write the block-list form and the field is read.

The point of the encoding: **the revival rule becomes derivable from frontmatter.** No bespoke
scheduler, no separate config. The generator computes "what should wake up" exactly the way
`tools/index.py` computes "what is pending" — by reading files.

## Worked Example: `check 4` as the first Instrument record

| field | value | evidence |
|---|---|---|
| `status` | `dormant` | — |
| `dormant_because` | `unsound` | non-overlapping regex drops the 3rd element of odd chains; fixture ``x `a`/`b`/`c` y`` → reports `a`,`b` only |
| defects caught, lifetime | **0** — *no longer current, see* **What Building It Produced** *below: check 4 caught its first lifetime defect, `generalist`, on the day it was repaired* | no verdict in `_orch/verify/` cites check 4 as the instrument that found a defect *(true only up to the day this ADR was built)* |
| re-verifications caused | several | its output is quoted in phase-2 through phase-11 invariant blocks |
| known-blind since | phase 3 | `_orch/verify/P20-verdict.json` — "the regex consumes the first pair and leaves the rest invisible" |
| disposition then | filed residual, never applied | the regex is in `acceptance.sh` today |
| correctness today | **wrong answer, unsound method** — *corrected; this row originally read "right answer, unsound method," which was false in both halves* | sees 75 of 79 hint tags, not 76; four invisible — `threat-modeling`, `discovery`, `statistical-rigor`, `generalist` (the last three newline-straddling); the unrepaired check's reported unresolved count, 11, is also wrong by one — `generalist` resolves to no persona, so the true count is 12 |
| exit condition | must reject a seeded odd-chain **and** a newline-straddling pair before returning to `active` | — |

This is the record that would have made the phase-3 finding actionable instead of residual.

## What Building It Produced

The operator overrode this ADR's own recommendation to defer (see **Operator Decisions** above)
and built the design in this branch. That produced the following facts on disk:

- **`check 4` was repaired, fixtured, and promoted to `active`.** Its promotion rests on an
  independent verdict, not on its repairer's self-promotion: node `P111` repaired and fixtured
  the check but did **not** itself meet Operator Decision 3's authorship bar — it was both
  repairer and promoter of its own work, and it recorded that collision plainly rather than
  papering over it. A separate verifier that wrote none of the repair re-ran every gate check
  independently and judged the promotion sound on its own authority, not on `P111`'s word.
  Evidence: `_orch/verify/P111-verdict.json`, `authorship_bar.does_the_promotion_to_active_stand`.
- **On the day it was repaired, `check 4` caught its first lifetime defect** — `generalist` at
  `prompt/modes/REVIEW.md:161-162`, a hint tag no persona in this repository carries. This is what
  moves the *Worked Example*'s "defects caught, lifetime: 0" from a permanent fact to a stale
  one. Whether `generalist` is a mode-file defect, a persona-roster gap, or an intended forward
  reference is **open** and belongs to the operator, not to this document: `_orch/inbox/Q-12.md`.
- **`P111` returned `BLOCKED`** rather than tune the repaired extractor to reproduce the
  historical 11-tag answer — exactly the discipline this design's `unsound` classifier exists to
  require.
- **Three more unsettleable criteria were written during phase 12** — by the phase runner itself,
  in the very brief that warned against writing them. They are the run's seventh, eighth and
  ninth (six earlier ones, found before this ADR was drafted, motivated it in the first place).
  Full record: `_orch/nodes/PR12/work/authoring-defects.md`.
  - `P111` #21 — required the repaired check's output to be a strict subset of a baseline
    written by the *blind*, pre-repair check. No correct repair can satisfy it: a baseline
    written by an instrument that cannot see a tag cannot contain that tag.
  - `P112` #15 — required the scorecard to report 0 lifetime defects "agreeing with the ADR,"
    after the true figure had already become 1. Satisfiable only by making the tool lie.
  - `P112` #29 — forbade writing `_orch/index/` while the same handoff mandated running
    `tools/index.py`, which writes it.

  All three were caught **mechanically by the verifier at the moment they were applied**, not
  after four verifiers disagreed — the outcome this ADR was proposed to produce. In every case
  the node was right and the criterion was wrong, and no criterion was rewritten after the fact
  to make a verdict look better; both refuting verdicts stand on disk.
- **Two of the three share a shape this ADR's original list did not name:** a criterion that
  pins a *new* measurement to an *old* recorded value — a baseline file (`P111` #21), a table in
  this very ADR (`P112` #15). That is the criterion-level form of fitting the instrument to the
  remembered answer — the exact failure this design exists to prevent, recurring one level up, in
  done-criteria rather than in a standing check. This is direct evidence for **Open Question 4**
  (below), which asks whether the lifecycle applies to done-criteria or only to standing checks.
  Open Question 4 **stays open** — this is evidence for it, not an answer to it.

## What Phase 13 Produced

Phase 13 landed four nodes against this ADR: `P120`, `P121`, `P122`, `P123`. `P124` reconciles
this document against what they actually did — not what they were asked to do. Derivation
commands and their live output are in `work/derivation.md`.

### SC1 — closed

```
$ grep -c '^echo "=== ' _orch/nodes/P11/work/acceptance.sh
10
$ grep -l 'rel: guards' tools/*.instrument.md | wc -l
      10
```

The two numbers agree: **10** standing checks are declared in `acceptance.sh`, and **10**
`tools/*.instrument.md` records carry a `guards` edge. **SC1 — "Every standing check in
`acceptance.sh` has an Instrument record with a `guards` edge." — is met.** `P123` authored the
nine records that closed the gap; `check 4`'s own record predates this phase and already carried
`rel: guards`.

### Decision 3 — the authorship bar now has an enforcement point, and it fires

Operator Decision 3 (mechanical gate plus authorship bar, closing Open Question 1) was, until
this phase, a sentence with no code behind it: `tools/instruments.py`'s gate was hard-wired to
`unknown` and could refuse nothing. `P122` made it decidable. It is not a hypothetical — it
fires today:

```
$ python3 tools/instruments.py >/dev/null 2>&1
$ grep -n 'authorship-bar-collision' _orch/instruments/summary.md
43:- authorship-bar-collision `tools/check4-hint-tags.instrument.md` - authorship collision: promoter `node:P111` IS this record's recorded `verified:` entry #2 (`node:P111`); operator decision 3's authorship bar refuses a promoter who is the record's author or any party its own `verified:` history records
```

**The bar refuses the promotion of `tools/check4-hint-tags.instrument.md`** — the one real
instrument this repository has promoted to `active` — because the promoter it names, `P111`,
is the same node that had itself repaired and authored the record it then promoted. The rule
finally caught the collision it was written for, and the collision it caught was its own
design's first application.

Its limits, recorded in the same breath, from `P122`'s envelope `caveats`
(`_orch/nodes/P122/status.json`): the gate can only refuse a party the record itself records.
**It over-refuses a purely independent re-reviewer** who repaired nothing but is listed in
`verified:`, because disk cannot distinguish a repair-verification from a pure re-verification —
closing that over-refusal needs a `repaired:` field the schema does not have. **In the opposite
direction, the gate is blind to a promoter named in neither `generated:` nor `verified:`** — no
code closes that gap, only a record that names its own history honestly does. A gate whose
limits are not written down is the next unmeasured oracle.

**Amendment, 2026-08-31, by `P132`**: the schema gained `repaired:` (see *AIX Encoding* above)
because this rule could not tell a repairer from a purely independent re-reviewer and so
over-refused the second case as if it were the first, exactly as the paragraph above records.
`tools/instruments.py`'s authorship bar now compares the promoter against `generated.by` and
every `repaired:` entry, no longer against `verified:`; `tools/check4-hint-tags.instrument.md`
was backfilled with a `repaired:` entry naming `P111`, and the bar still refuses its promotion —
now via the repairer path rather than the `verified:` path. The opposite-direction blind spot
named in the same paragraph is unchanged by this amendment and stays open.

Narrowing the compared parties to `repaired:` alone made the **shape** of that one field
load-bearing in a way no field's shape was before: it is now the only refusable list the bar
has, so a value the reader silently drops silently empties the gate. `P132`'s first attempt read
`repaired:` only when it was a list while treating the key's mere presence as a declaration, and
a `repaired:` written as a mapping therefore passed a promoter it names — a `true` earned from
evidence that was present and broken. The rule now reads both `repaired:` and `verified:` in the
three states *AIX Encoding* documents, and answers `unknown` plus a finding wherever it cannot
read the value. This also closes, for this gate, the standing caveat `P122`'s verifier recorded
against a `verified:` block written as a mapping whose entries are silently dropped.

### Worked example: the Q-12 category error

The repaired `check 4` reported an unresolved tag `generalist` in `prompt/modes/REVIEW.md`, and
the reflex reading — a tag missing from the roster — was wrong: the actual defect was a category
error in the `blindspot` seat, a meta-auditor of the panel that a domain-expert upgrade hint
cannot coherently name (`_orch/inbox/Q-12.answer.md`). Minting the tag would have been fiction —
every persona in the roster is a domain specialist, none is a generalist — and upgrading the seat
to a domain expert would have defeated it, filling the very seat that exists to notice what
specialists structurally cannot see with one more specialist. `P120` found the same error in
**four modes, not one**: REVIEW, CRAFT, IMPROVE and POSITION each seat `blindspot`, each carried
the same incoherent hint, and all four are now removed with the reason recorded in the mode file
itself.

This is worth recording as the worked example this ADR asked for precisely because **the
instrument did not diagnose the defect — it made the defect visible, and the diagnosis still
required judgement.** Check 4 could report an unresolved tag; only the operator's reasoning
about what the `blindspot` seat exists to do turned that observation into a category error
rather than a roster gap or a missing persona. An instrument described as diagnosing things is
the trusted-but-unverified oracle this design was written against.

### SC2 through SC5, from disk

- **SC2** — "`check 4` is `dormant`/`unsound` and cannot return to `active` without rejecting
  both seeded fixtures." As literally written this is now false on its face: `check 4` **is**
  `active` (`tools/check4-hint-tags.instrument.md` frontmatter). What the criterion actually
  tests — that promotion required rejecting both seeded negative fixtures before `active` was
  reached — did happen, recorded in that same record's own History table: `exit condition |
  reject a seeded odd-chain and a newline-straddling pair | met — _orch/nodes/P111/work/fixture-proof.md §4`.
  SC2's sentence describes a state the design has already moved past; the gate it was written to
  require was satisfied before promotion.
- **SC3** — "The generator reproduces, from disk alone, the yield table in *Worked Example*
  above." Partially demonstrated, not confirmed whole. `_orch/instruments/summary.md` computes,
  from disk, `check-4-hint-tag-resolution (active) - 1 defect(s) caught, 31 re-verification(s),
  last fired: P123` — the defects-caught figure, 1, agrees with the *Worked Example* table's own
  correction ("check 4 caught its first lifetime defect... on the day it was repaired"). The
  table's "several" re-verifications was never a number to check equality against, so 31 is
  consistent with it but does not confirm a reproduction of a number that was never stated.
- **SC4** — "At least one instrument is retired as `low-yield-high-cost` and at least one is
  *kept* despite zero lifetime catches, with the reason recorded — proving the design
  distinguishes "quiet" from "useless"." Half met: eight of the ten records (every check but 4
  and 6) are `dormant`/`never-fired` with zero lifetime catches and the reason recorded in each
  record's own file, satisfying the second half. **No instrument anywhere in
  `_orch/instruments/instruments.json` carries `dormant_because: low-yield-high-cost`.** The
  first half of SC4 is unmet.
- **SC5** — originally: "The suite is smaller after one full cycle than before it, with no loss
  of caught defects." As originally written this was unmet, and not narrowly: the suite grew
  from the single `check-4` record that existed before this phase to **ten** records now.
  Phase 13 built the suite out rather than shrinking it. SC5 was reworded 2026-08-31 by `P130`
  (see the amendment note under *Success Criteria*) to: "After a cycle in which at least one
  instrument reaches a retirement classifier, the suite shrinks, with no loss of caught
  defects." Against that reworded wording, SC5 is **not yet measurable**: this design treats
  `dormant_because: low-yield-high-cost` and `dormant_because: superseded` as the retirement
  classifiers (see the amendment note for why the other three enum values are excluded), and
  from disk, zero instruments carry either value —
  `grep -l 'dormant_because: low-yield-high-cost' tools/*.instrument.md | wc -l` and
  `grep -l 'dormant_because: superseded' tools/*.instrument.md | wc -l` both read `0`
  (`_orch/nodes/P130/work/derivation.md`). No instrument has reached a retirement classifier
  yet, so the reworded criterion has nothing to evaluate.

### The `check4-hint-tags.instrument.md` yield disagreement, reconciled in prose

`tools/instruments.py` raises a finding against its own first-promoted record —
`yield-disagrees-with-claim`: "this tool derives 1 lifetime defect(s) caught for
`check-4-hint-tag-resolution` from disk, but tools/check4-hint-tags.instrument.md (the record's
own History table) asserts 0. The derived number stands; the document is stale." The record's
own History table, unedited by this node, states `defects caught, lifetime | 0` in its table
cell, with a note pointing the reader to *What Building It Produced* above for the correction
rather than rewriting the cell itself. The disagreement is not resolved and no number in that
file was edited to settle it — the generator's derived figure and the record's own History table
simply disagree, on disk, in this ADR's telling exactly as they do in the tool's.

## What the Generator Computes

`tools/instruments.py` (proposed), same contract as `tools/index.py` — stdlib only, idempotent,
writes only its own output directory:

1. **Yield per instrument** — defects caught, re-verifications caused, last time it fired.
2. **The productive/defective split** — for every `REFUTED`, did the fix change the **product** or
   change the **test**? Six times this run it changed the test. An instrument whose refutations
   only ever rewrite itself is defective, not strict.
3. **Wake list** — dormant instruments whose trigger has fired, by classifier.
4. **Shadow drift** — instruments whose shadow result changed while dormant.
5. **Never-woken** — see below; this is a finding, not a status.

## Failure Modes This Design Introduces

- **A wrong `guards` edge makes a check dormant forever, invisibly.** This is the same
  quiet-global-failure the design exists to prevent, rebuilt in the lifecycle layer. Mitigation:
  **"dormant and never woken in N runs" is reported as a finding**, not as a healthy state.
- **The scorecard becomes the next unmeasured oracle.** It is subject to its own rules: it needs
  a negative fixture, it publishes its evidence base rather than a verdict, and it gets a seat in
  the refutation quota.
- **Optimising toward what history caught.** Scoring instruments on past yield biases toward known
  failure classes and away from new ones. This run warns twice: the V1.7/V1.8 contradiction was
  detected by an accident of partition, and `check 4`'s blind spot was harmless by luck. Both
  would have taught a history-tuned system the wrong lesson. Mitigation, borrowed from the loop's
  own `dry_rounds` floor of 2: **keep a fixed fraction of probes fresh and unguided by the
  ledger.** History must not fully determine the next attack.

## Open Questions

1. **Who promotes `candidate` → `active`?** A gate, or a human? Automatic promotion re-creates
   the author-and-judge collision this run found in the phase runner. **CLOSED — 2026-08-27.**
   See Operator Decision 3: promotion is a mechanical gate plus an authorship bar, and `unsound`
   / `unsettleable` additionally require a human.
2. **Does an instrument record live beside its instrument, or in one bundle?** Beside is more
   discoverable; one bundle is easier to generate over. **Still open.**
3. **Shadow cadence.** Every run is probably too often for an expensive check; the classifier may
   need a per-instrument `shadow_every`. **Still open.**
4. **Does this apply to done-criteria, or only to standing checks?** Criteria are per-node and
   ephemeral, but the six unsettleable ones were *shapes* that recurred. A shape-level record may
   be the right unit. **Still open.** New evidence, not an answer: two of phase 12's own
   unsettleable criteria (`P111` #21, `P112` #15 — see **What Building It Produced**) share a
   shape this list did not originally name — a criterion that pins a new measurement to an old
   recorded value. That is the criterion-level form of the exact failure this design exists to
   prevent, and it bears directly on this question, but it does not settle it.

   Further evidence from phase 13, also not an answer, and recorded here as an honest residual
   rather than settled: `P121` counted **nine** pre-phase-13 unsettleable criterion defects in
   the run's corpus (`_orch/nodes/P121/status.json`, `caveats[2]`). Its own verifier, classifying
   the same 14 `REFUTED` rows independently before reading `P121`'s tally, counted **eight**
   (`_orch/verify/P121-verdict.json` line 314). The two counts differ only on `F2` #6 — `P121`'s
   corpus keeps it as a criterion defect; the verifier's does not, because the row's own
   refutation lands on a work defect and `F2` #6 is classified by the shape of its other half.
   Both counts are on disk and no fixture was moved to reconcile them; `F2` #6 stays exactly
   where `P121` put it. The disagreement is not settled, not resolved, and not averaged here —
   two independent counts of the same corpus landing one apart is itself information about how
   settleable this corpus is, which is the actual subject of this question.
5. **The `attack` field.** Adding `attack:` to §9.1's row shape is a prerequisite for scoring
   probes and is a contract change. In scope here, or its own decision? **CLOSED — 2026-08-27.**
   See Operator Decision 2: in scope here, additive and optional.

## Success Criteria

- SC1. Every standing check in `acceptance.sh` has an Instrument record with a `guards` edge.
- SC2. `check 4` is `dormant`/`unsound` and cannot return to `active` without rejecting both
  seeded fixtures.
- SC3. The generator reproduces, from disk alone, the yield table in *Worked Example* above.
- SC4. At least one instrument is retired as `low-yield-high-cost` and at least one is *kept*
  despite zero lifetime catches, with the reason recorded — proving the design distinguishes
  "quiet" from "useless".
- SC5. After a cycle in which at least one instrument reaches a retirement classifier, the
  suite **shrinks**, with no loss of caught defects.
  - **Amendment, 2026-08-31, by `P130`**: the original SC5 read: "The suite is **smaller**
    after one full cycle than before it, with no loss of caught defects." That original
    criterion was reworded, not met — it was unmeasurable on the cycle that created the
    records, because there was nothing to retire from, and it was UNMET as originally written
    (the suite grew from one record to ten). The sentence above is the reworded form.
  - **Which classifiers count as "reaches a retirement classifier"**: this design treats
    `dormant_because: low-yield-high-cost` and `dormant_because: superseded` as retirement —
    the instrument is taken out of the suite rather than parked awaiting a trigger or a repair.
    *The Classifier* table row for `low-yield-high-cost` reads "**sampled** — every N runs |
    the only case where a timer is genuinely correct", and SC4 above already uses "retired" for
    this classifier ("at least one instrument is retired as `low-yield-high-cost`"). The row
    for `superseded` reads "**dependency** — revive only if its superseder goes dormant | an
    edge, not a schedule" — the instrument stays out of the suite for as long as its superseder
    stands. Excluded: `never-fired` (row: "**event** — the artifact class named by its `guards`
    edge changes") and `unsound` (row: "**blocked** — until the instrument is repaired *and*
    passes a negative fixture it is known to fail") are parked awaiting a trigger or a repair,
    not taken out of the suite. `unsettleable` (row: "**never as-is** — only as a rewritten
    instrument, with the rewrite authorised from outside the run") never revives as the same
    instrument, but the ADR's own vocabulary reserves "retired" for `low-yield-high-cost`
    (SC4) and does not use it for `unsettleable`, so it is excluded here too.

## Next Steps

1. Operator decision on this ADR. **Done** — decided 2026-08-27; see Operator Decisions above.
2. Add `attack:` to CONTRACT §9.1's row shape (Open Question 5) — cheap, and it unlocks probe
   scoring later. **Done** (`P110`, CONTRACT §9.1).
3. Author Instrument records for the checks in `acceptance.sh`, `check 4` first. **Done** —
   `P123` authored the remaining nine records. `grep -c '^echo "=== ' _orch/nodes/P11/work/acceptance.sh`
   and `grep -l 'rel: guards' tools/*.instrument.md | wc -l` both read **10**; Success Criterion
   SC1 is met. See *What Phase 13 Produced* below.
4. Build `tools/instruments.py` against this run's corpus, which contains all five classifier
   cases. **Done** (`P112`, `tools/instruments.py`).
5. Only then consider the attack library, which depends on step 2. **Not started.**

## Rollback

Delete `docs/designs/instrument-lifecycle.md`, any `*.instrument.md` records, and
`tools/instruments.py`. No product file changes; no contract change except the optional §9.1
`attack:` field, which is additive and ignorable. Nothing in this design is load-bearing for a
run — an absent lifecycle index means every check simply stays `active`, which is today's
behaviour.
