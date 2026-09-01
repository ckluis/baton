---
type: Design
id: simplicity-scorecard
title: A design-quality baseline for IMPROVE — scenarios, scorecard, and the delta
status: proposed
generated:
  by: agent:claude-opus-5
  at: 2026-09-01
provenance:
  confidence: medium
  source: derived
links:
  - rel: relates-to
    to: instrument-lifecycle
    note: a scorecard is an instrument and inherits that document's obligations
---

# Design: A design-quality baseline for IMPROVE

Drafted 2026-09-01 · Branch: `simplicity-scorecard` · Status: **PROPOSED**
Derived from two external prompts the operator raised:
[audit-your-codebase](https://gist.github.com/aarondfrancis/8735edbe48532f97ee5ea818db4dbd47)
and [measure-software-simplicity](https://gist.github.com/duyetpt/f9bcc40c9d52e1c24572d8bc79f21e5a).

## Problem Statement

**IMPROVE can prove nothing broke. It cannot prove anything got better.**

`prompt/modes/IMPROVE.md`'s `T01` records a **behavior-preservation** baseline — suite result,
coverage, and whatever size and performance numbers are cheap to take — and the mode's completion
condition is *"two consecutive rounds produce no candidate above the cut line, the baseline
reference reproduces exactly."*

Read that carefully. It says: **we ran out of ideas, and we broke nothing.** Neither clause says
the design improved. `T21` demands "a before/after artifact for the claimed gain" per improvement,
which is real, but it is per-candidate and self-selected — the node that landed the change also
names the artifact that proves it helped. There is no measure over the module as a whole, and no
way to answer "was this pass worth running" except by counting candidates landed.

That is an unfalsifiable success condition sitting in a framework whose entire argument is that
unfalsifiable claims are the enemy. §9.1 exists because a single free-text `probe` could not
distinguish a verifier that checked one criterion from one that checked five. This is the same
defect at mode scale.

## What is Adopted, and What is Not

From `measure-software-simplicity`:

| taken | why |
|---|---|
| The eight-principle GQM catalogue, scored `0`–`3` | a rubric with named measures is falsifiable where "it's cleaner now" is not |
| Confidence tracked **separately** from score | a `3` from inference is not a `3` from code plus history plus runtime |
| `Unknown` ≠ `N/A` | this is §9.1's `UNTESTED` under another name — the honest answer stays available |
| Representative change scenarios, 3–5, chosen from history, incidents, or requirements | makes "is it simple?" falsifiable: not simplicity in the abstract, but what a **named future change** would cost |
| Measurement / interpretation / recommendation kept separate | already baton's rule — `personas/CONTRACT.md` §2.1 gives SYNTH duty as **Nothing** |
| "Static metrics are warning signals, not verdicts" | same instinct as §9's *"could be bad is never P0"* |

**Not taken: the pass/fail gate.** The source proposes `overall ≥ 2.2/3` and `evidence coverage
≥ 80%`. Arbitrary thresholds become targets, and the source itself warns *"do not present default
thresholds as scientific laws."* baton reports the profile and never declares pass or fail on it.

From `audit-your-codebase`, one thing only: **the representational lens** — scattered booleans
permitting invalid states, repeated shape assumptions wanting a typed model, duplicated branching
a registry would remove. Everything else in that prompt baton already does, and mostly harder:
its coverage contract is weaker than MIGRATE's two-independent-discovery-passes-and-freeze, its
independence is aspirational where §5's is structural, and it has no adversarial exchange at all.

## Two Additions the Sources Do Not Have

These are the parts that make it baton's rather than a port.

**1. The scenarios are frozen before anything is scored.** MIGRATE's idiom: *"a site register that
the two passes do not agree on is not a plan, and no transform starts until it is frozen."* Same
rule here. Scenarios are named, written to disk, and frozen **before** the scorer reads the module.
Otherwise scenarios get chosen — consciously or not — to flatter the result, and the source's own
guard (*"do not cherry-pick only easy changes"*) is an instruction with nothing enforcing it.

**2. The after-measure is taken by a different agent than the before-measure.** `prompt/CONTRACT.md`
§4.1's author-and-verify guard, applied here: an agent that scored a principle `1` before the work
has an interest in scoring it `2` after. Same scenarios, same formulas, different context.

## Shape

Two nodes and one artifact. **Not a new mode** — the composition already exists.

- **`T01b`** — sibling of `T01`, phase 1. Names 3–5 representative change scenarios from history,
  incidents or requirements, freezes them to `work/scenarios.yaml`, then scores the eight
  principles against the module and writes `work/scorecard-before.md`. Runs **after** `T01`'s
  behavior baseline and **before** `T02` declares the lens list, so the scorecard cannot be shaped
  by knowing which lenses will run.
- **`T40`** — final phase, after `L1` exits. Re-scores using the **frozen** scenarios and the same
  formulas, writes `work/scorecard-after.md` and the per-principle delta. Different agent from
  `T01b`; the handoff says so.
- The mode's completion condition gains one clause: the report carries the before/after scorecard
  delta, **and a principle that moved is cited to the improvement that moved it**.

An improvement pass that lands six changes and moves no principle is not a failure — it is
information, and it is the information IMPROVE currently cannot produce.

## The Lens

`personas/lenses/representation-truth.md`, seated in IMPROVE at `AUDIT`. Its subject is how state
is *represented*: booleans that permit combinations the domain forbids, shape assumptions repeated
at every call site, branching duplicated where a table would do.

It carries the source's refusals, which are the sharp part: no abstraction for hypothetical
extensibility, no change for stylistic consistency, no line-count reduction as its own reward, and
**never "moving existing branching behind a new type"** — over-abstraction wearing simplification's
clothes.

Its upgrade hint points at `domain-modeling`, which seats **Eric Evans** from the vendored roster.
Worth stating plainly: v3 vendored the right experts and gave them nowhere to sit. The only seat
requesting `domain-modeling` today is BUILD's `spec-fidelity`, which examines whether the build
matches the spec — not whether the representation is sound. The roster was ahead of the modes.

## Obligations Inherited from `instrument-lifecycle.md`

A scorecard **is an instrument**, and this repository has just finished learning what unmeasured
instruments do — `check 4` reported the right answer by luck for eleven phases. So:

- if a scorecard check ever enters the acceptance harness it gets an Instrument record, a `guards`
  edge, and a negative fixture it is known to fail, like every other check;
- the scorecard publishes its **measured values beside its scores**, so a reader can challenge the
  judgment rather than accept the number — the source requires this and it is also the
  publish-the-evidence-base rule from that ADR;
- the overall average is reported but **never gates**, and a `0` on any principle is shown at the
  top rather than averaged away.

## Risks

- **Goodharting.** A 0–3 rubric invites optimising the number. Mitigated by: no gate, per-principle
  visibility, frozen scenarios, and a different scorer after. Not eliminated.
- **Scoring cost.** Eight principles across 3–5 scenarios is real work on a large module. `T01b`
  may return `SPLIT` on a module big enough that scoring it is its own phase.
- **False precision.** `2` versus `3` is a judgment, and averaging judgments produces a number that
  looks harder than it is. The delta between two measurements of the same scope is the trustworthy
  part; the absolute is not, and the report must say so.

## Success Criteria

- SC1. `IMPROVE` produces `work/scorecard-before.md` and `work/scorecard-after.md` with the same
  scenarios and formulas.
- SC2. `work/scenarios.yaml` is written and frozen before the module is scored, provable by
  ordering on disk.
- SC3. `T40`'s agent is not `T01b`'s.
- SC4. Every score carries its measured values and a confidence, and any principle lacking evidence
  reads `Unknown` rather than a guess.
- SC5. No number in the report is used as a pass/fail gate.
- SC6. `representation-truth` resolves under `PERSONAS: none` and `sh bundle.sh IMPROVE` exits 0.

## Out of Scope

Seating `representation-truth` in `REVIEW` as well — cheap, but it changes REVIEW's panel and
belongs in its own change. The whole-repo coverage contract from the first gist: MIGRATE already
has a stronger one, and pointing it at audit rather than transformation is a separate question.
