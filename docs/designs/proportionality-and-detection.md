---
type: Design
id: proportionality-and-detection
title: Three contract changes that did not survive verification
status: proposed
generated:
  by: agent:claude-opus-5
  at: 2026-09-01
provenance:
  confidence: high
  source: derived
links:
  - rel: relates-to
    to: instrument-lifecycle
    note: the same argument about mechanisms that go unmeasured
---

# Design: Three contract changes that did not survive verification

Drafted 2026-09-01 · Status: **PROPOSED — none of this shipped.** Only §7.2 shipped, and it is
not in this document.

## Why this exists

An evaluation of baton found its largest opportunity: **the contract has no vocabulary for
"this criterion is not worth a rung."** Three contract changes were drafted to close that and two
adjacent gaps. A rung-4 adversarial verifier then broke all three, and they were withdrawn rather
than shipped with the defects recorded as caveats.

The diagnoses are all sound. The drafts were not. This records both, so the next attempt starts
from the failures rather than rediscovering them.

---

## 1. Materiality — verification effort capped by what a criterion protects

**The problem is real.** Every done-criterion is equally binding regardless of stakes, so
bookkeeping earns the same escalate-verify-re-verify loop as a shipped defect. In this
framework's own run, one criterion was verified **five times**, and a phase runner eventually
improvised the missing rule on its own authority — `_orch/ledger.csv`, `ACCEPT-P90c`: accepting a
twice-refuted node because "escalating buys the same disagreement a third time." **When an agent
has to invent a rule the contract lacks, the contract is missing the rule.**

**Why the draft failed. Four defects, any one fatal:**

1. **The default governs everything.** The draft made an unmarked criterion P2. Essentially none
   of the ~1,979 numbered done-criteria in `_orch/nodes/*/handoff.md` carries a priority, so the
   default is not a fallback for a minority — it is the entire population.
2. **P2 already means something else.** `prompt/roles/panel.md:77` — "`P2`/`P3` are report-only,
   logged." So the draft's default outcome for a refutation was a log line, on a corpus where
   every criterion is unmarked.
3. **No verdict token for the result.** §9.1 computes `REFUTED` from any refuted row; the draft
   then said *accept*. But §4.1 requires `DONE` **and** `CONFIRMED`, and neither §2.1's six
   verdicts nor §9.1's three contain `ACCEPTED`. An accepted node blocks every hard edge into it,
   permanently. `prompt/baton.md` already says "accepted with caveats" at the gate — a third state
   §8 does not list — and the draft would have made that divergence load-bearing.
4. **The ratchet was inverted.** The draft forbade *raising* a priority after refutation and said
   nothing about lowering it. Refutation is usually the moment the true stakes become knowable,
   and the layer that pays for escalations is the layer with the mandate to edit handoffs before
   dispatch.

**What a working version needs:** an `ACCEPTED` verdict token or a §4.1/§8 amendment; a
resolution of P2's two meanings; a priority that is recorded at dispatch and immutable in both
directions; and an enforcement point, since neither `plan-verifier.md` nor `tools/lint-criteria.py`
can see a priority shape. Also note the draft misread its own founding case: `ACCEPT-P90c` was an
*unsettleable-criterion* defect, which `lint-criteria.py` already catches — marking that criterion
P0 would have looped it forever.

## 2. Briefs carry locators and probes, never facts

**The problem is real and measured.** `_orch/final/report.md` — "`P60`'s handoff and the phase-7
brief both said **six**; the ledger says **five**." The orchestrator was the contamination vector,
passing stale counts downward in hand-authored prose; nothing shipped wrong only because agents
re-derived from disk anyway.

**Why the draft failed:**

1. **It disarms the INVARIANT block.** Roughly fifty handoffs assert expected values — "check 9
   must show `main` at `e78e7b0`, nothing staged." That is a stated fact about the target, which
   the draft forbade, and it is the guard against committing on a branch the operator froze. A
   check with no expected value has nothing to compare against.
2. **Its exception collides with §10.** The draft exempted "an operator ruling" while its next
   sentence said "anything a command could answer is not" — and §10 already says the ruling lives
   in a file the run *reads*. Three textually supported readings.
3. **It deletes a working tripwire.** The corpus independently converged on *fact plus
   disclaimer* — "if your own count disagrees with these numbers, **your count wins and you say
   so**" — which makes upper-layer drift measurable. The draft removes the redundancy that made
   the divergence visible.

**What a working version needs:** a carve-out for asserted expected values, the §10 collision
resolved, and a rule that prefers *fact plus disclaimer* over *no fact* — the redundancy is the
detector, not the defect.

## 3. Partitioned fan-outs overlap on purpose

**The problem is real.** Two verifier children applied different standards to the same row shape
across a fourteen-child fan-out, and it surfaced only because one of them chose to write it down.
A clean partition guarantees divergence is invisible: every item is judged once, so no two
judgments can be compared.

**Why the draft failed:** **the verdict file is keyed by the item, not the child.**
`_orch/verify/` holds 147 files named `R-<row-id>-verdict.json` and zero named for a child. Two
children given one shared item write the *same path*; the second overwrites the first, and the
disagreement is deleted by the filesystem before anyone can read it. As drafted it is a no-op on
the exact fan-out shape it cites, and it costs one extra item per boundary to achieve nothing.

Two further defects: it would fire §1.2 trigger 4 — *jump to rung 4, spawn an adjudicator* — up to
thirteen times in a fourteen-child fan-out, and its examples include authoring fan-outs, where two
children assigned one file is a write collision §4.3 answers with serial dispatch.

**What a working version needs:** a verdict path keyed by child *and* item, an explicit comparison
step, a bound on how many adjudications an overlap may trigger, and language restricting it to
*judging* fan-outs.

---

## What did ship

Only **§7.2, two row classes and one writer each** — and only after the verifier corrected it
twice. The original draft justified single-writer by claiming a corrupted rung histogram; gate
rows carry `n/a` rungs and contribute nothing to any histogram, so that harm could not have
occurred. And it assigned the contested row to the *thinner* writer: the two duplicate gate rows
in the run carried **different content**, one with drift and streak counts and one with the
phase's outcome. The real defect was a schema with nowhere to put two perspectives on one event.
The shipped version says so, and says two layers with different things to record is two rows.

## The lesson worth keeping

All three drafts were written from a good evaluation, by an author who had just spent a week
learning why unfalsifiable claims are dangerous, and all three were unsound in ways that a
single rung-4 adversary found in one pass. The evaluation's diagnoses survived; its author's
remedies did not. **A correct problem statement is not a correct fix, and the gap between them
is exactly the width of a verification pass.**
