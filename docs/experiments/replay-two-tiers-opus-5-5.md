# Experiment: the eighteen refuted nodes replayed under two tiers, Opus 5.5 at frontier

Drafted 2026-09-23 · Ran 2026-09-23 · Status: **RUN — inconclusive (work class), capability-independent (criterion class)** · Cost cap: 45 spawns (41 spawn rows at the node gate, $81.08)

## The question

v5 bets that frontier by default is cheaper than a ladder. Everything with judgment in it runs on
the most capable model at its highest effort. The cheap tier gets only work a command can check
(`rules/rule-1-the-ladder.md`). The rung-6 replay
([replay-refuted-at-rung-6.md](replay-refuted-at-rung-6.md)) asked whether a much stronger worker
would have passed, on the first attempt, the eighteen nodes the self-run refuted. It came back
inconclusive, with its verifiers held at the tier that had refuted each node.

This run asks the v5 version of that question. With **Claude Opus 5.5 (high)** as FRONTIER for
every worker and every verifier:
- how many of the eighteen close on the first try;
- does the cheap tier's work survive a frontier verifier;
- does frontier-by-default cost more than the runs it saves?

## The design

**Held from rung 6, exactly.** The operator chose to replicate the rung-6 run's *final corrected*
protocol at the opening gate:
- the same eighteen nodes, classes, commits and original handoffs;
- the phase-3 input rule: withhold only the verify tree and the node's own later attempts;
- `P41` run once under that rule, verified by the `spec-fidelity` persona seat in single-claim
  shape;
- `F2`'s fan-out inlined;
- criterion-class verifiers given the original criterion text verbatim;
- workers barred from grepping the corpus ledger for verdict tokens;
- the corpus `chmod a-w`;
- one worker and one verifier per node, concurrency 1, no escalation on REFUTED;
- the cap of 45 spawns;
- the pre-registered decision rule, unchanged.

**What changed.**
- **Tiers.** Every worker ran at FRONTIER (`claude-opus-5-5`, effort high). The exception is
  `P00`, whose handoff is a command run, so it ran at CHEAP (`claude-sonnet-5`). **Every verifier
  also ran at FRONTIER**, as a fresh spawn (v5 §1.2, §9).
- **Dispatch.** The prime ran each spawn itself, as
  `claude -p --model <m> --effort <e> --output-format stream-json`, from a shell script. There was
  no phase-runner layer, the Agent tool was disabled in workers, and seconds come from the shell
  clock.
- **Measurement.** The served model per assistant message was read from the stream, and each
  spawn's `total_cost_usd` and tokens from its result event.

**The confounds, stated before the result.**
1. **Both seats changed.** The rung-6 run moved only the worker. This run moves the worker *and*
   the verifier: rung 6's verifiers were haiku/low, sonnet/medium, sonnet/high and opus/medium,
   and here all are Opus 5.5/high. No difference between the runs can be credited to the worker
   alone. `P41` is the sharpest case, because the instrument is the same persona card in the same
   shape but with a stronger model behind the seat.
2. **Tree state.** "HEAD" means `acae87c` (the v5-accountability tip) here. At rung 6 it meant that
   run's refutation-triage HEAD. More fixes are already landed at `acae87c`, and `main` sits at
   `fe811a1` rather than `e78e7b0`.
3. **The linter changed** between the runs, so the two lint baselines are not the same
   instrument. Both are reported.
4. **The dispatch architecture changed.** Rung 6's wall-clock includes phase runners; this run's
   does not. Leaf spawn seconds are the like-for-like measure.
5. **Session limits.** One account session limit hit this run at `P90c`, from about 10:24 to 12:42
   America/New_York, with the prime idle. It killed one worker and two verifier spawns, and the
   node was re-run whole. Rung 6 lost time to two limits. Both runs are reported gross and net of
   the idle gap.

## The decision rule, applied

The rule is quoted verbatim from the design record, with "at rung 6" read as "at FRONTIER":

> If ≥ 8 of the 9 discriminating work-class nodes are `CONFIRMED` first try at rung 6, the
> ladder's escalation half is cost engineering and collapses to three tiers (cheap, strong,
> human). If ≤ 4 are, the ladder holds. 5 to 7 is inconclusive and will be reported as
> inconclusive.
>
> Of the 7: if ≥ 6 are still not `CONFIRMED` at rung 6, refutation triage
> (`rules/rule-9-2-refutation-triage.md`) is capability-independent; if ≤ 3, a rung-6 worker
> satisfies criteria sonnet verifiers called unsettleable and that is a finding against §9.2's
> premise; 4 or 5 is inconclusive.

- **Work class: 6 of 9 CONFIRMED → inconclusive.**
  - CONFIRMED: `P00`, `P10`, `P11`, `B1`, `P90b`, `F1.4`.
  - `P160` and `F2` each fail on one replay-artefact row, on the same criteria that held them at
    rung 6.
  - `P41` is REFUTED by the frontier seat on one unregistered deviation, decisions.md `D-02`.
  - As at rung 6, the eight swept work-class verdicts carry **no REFUTED row**.
- **Criterion class: 7 of 7 not CONFIRMED → capability-independent.** This is 6 of 6 under the
  rung-6 review's reading, which leaves out `P121`; here `P121`'s blind held. Only `P76` and
  `P90c` carry a REFUTED row. The other five are PARTIAL on UNSETTLEABLE rows.
- **Counted by original criterion,** as the rung-6 review asked: of 8, **3 confirmed**
  (`P90c` #14, `P111` #21, `P121` #10), **1 settled false** (`P76` #1), **4 unsettleable**
  (`P01b` #4, `P80` #6, `P112` #15, `P112` #29). Rung 6 was 1 / 3 / 4.
  - Three criteria are unsettleable in both runs, with the same shapes: `P01b` #4, `P112` #15
    and `P112` #29. The fourth slot swapped. `P76` #1 was unsettleable at rung 6 and is settled
    false here; `P80` #6 was settled false at rung 6 and is unsettleable here, as a replay
    artefact.
  - Four criteria changed verdict between the runs, and both seats moved for every one of them.
    So the criterion-level shift cannot be credited to the worker.
- **Malformed verdicts: 0 of 18.** Rung 6 also had 0. The two aborted verifier spawns wrote no
  file.

## The comparison

Every number below is recomputed by `python3 _orch/final/derive.py`, run from
`/Users/clank/Desktop/projects/baton-opus55-replay`. The run record is gitignored; it is
`/Users/clank/Desktop/projects/baton-opus55-replay/_orch/final/report.md`.

| measure | rung 6 (fable worker; verifier at the refuting tier) | two tiers (Opus 5.5/high worker and verifier) |
|---|---|---|
| work class CONFIRMED first try | 5 of 9 (4 of 9 strict) | **6 of 9** |
| criterion class CONFIRMED first try | 0 of 7 | **0 of 7** |
| non-discriminating CONFIRMED first try | 0 of 2 | **0 of 2** |
| original criteria confirmed / false / unsettleable | 1 / 3 / 4 | **3 / 1 / 4** |
| malformed verdicts | 0 | **0** |
| spawn rows to the node gate | 45 (40 leaf + 5 phase-runner) | **41** (38 completed + 3 aborted) |
| leaf spawn seconds (pause-free) | 19,831 | **13,053** |
| verifier seconds per swept row | 22.6 | **12.2** |
| wall-clock, run start → node gate, gross | 16h58m | **6h02m** |
| wall-clock net of session-limit idle gaps | 8h33m (two gaps, 8h25m) | **3h40m** (one gap, 2h21m) |
| UNSETTLEABLE rows | 32 | **24** (19 replay-artefact, 5 genuine) |
| of which `measures-outside-node` | 23 (72%) | **8 (33%)**; 14 (58%) with `reads-immutable-ref`, a shape rung 6 did not have |
| lint baseline: criteria / FLAG / WARN | 367 / 23 / 2 | 368 / 32 / 2 (a later linter) |
| total_cost_usd | not recorded | **$81.08** (cheap $0.72; frontier $80.36, including $1.07 aborted) |

Three work-class cells differ from rung 6, and none of the three isolates the worker:
- **`P10`:** a process claim that a sonnet verifier left UNTESTED, and that a frontier verifier
  confirmed on circumstantial evidence.
- **`P90b`:** rung 6 had run it under the defective phase-1 input rule and never re-measured it.
- **`P41`:** a stricter seat.

**Does frontier-by-default cost more than the runs it saves?**
- **In seconds, no.** It used a third less spawn time than the rung-6 arm.
- **In dollars:**
  - It saved at most **6** retry pairs against the original ladder, and a net **1** against
    rung 6.
  - Its 18 node pairs cost $78.53, a mean of $4.36.
  - The 12 unconfirmed nodes cost either approach the same follow-up. So frontier-by-default
    costs no more than the ladder only if a ladder worker-plus-verifier pair costs at least
    **$3.27, 75% of a frontier pair**.
  - No ladder pair has ever been priced. That number is the break-even, not the answer.

The cheap tier's work did not fail verification anywhere. The one cheap spawn, `P00`, came back
9/9 CONFIRMED from a frontier verifier. That is n = 1, on a command-run node.

## The served-model count

**3 of 41 spawn rows carry `served: <model>` differing from the `model` column, and 0 of them are
reroutes.**

All three are the `P90c` spawns that the session limit killed:

| row | what happened | assistant messages | notice |
|---|---|---|---|
| worker, attempt 1 | died at 142 s | 47 real `claude-opus-5-5` messages, then one `<synthetic>` | "You've hit your session limit · resets 12:30pm (America/New_York)" |
| verifier, attempts 1 and 2 | ran 4 s and 3 s | only the same `<synthetic>` message, with no model call and zero cost | same |

`<synthetic>` is Claude Code's error placeholder, not a model. Across all spawn directories:
- 2,513 assistant messages were served by `claude-opus-5-5`;
- 58 by `claude-sonnet-5`, the cheap worker, as asked;
- 3 are `<synthetic>`.

The directive asked for a watch on Opus 5.5 re-serving cyber- or bio-flagged turns on Opus 4.8 or
Opus 5. **The stream showed no such notice.** Several worker envelopes self-reported a `model` that
is not what ran; `P00`'s says `haiku`. That is why the ledger takes `model` from the dispatcher and
`served:` from the stream, never from the envelope.

## Verdict on the v5 bet

The bet stands, but not for the reason it was made: on this corpus it neither saves runs nor
measurably wastes them. The cheap half held on the one node that used it, a command-run node at
CHEAP that passed a frontier sweep 9/9. The frontier half did not show the expected capability
dividend. Opus 5.5 at high closed 6 of 9 work-class nodes on the first try against fable's 5, which
the rule calls inconclusive, and the extra node traces to a verifier judgement and a harness
correction rather than to the worker. No criterion-class node closed. Most of what stopped the
other twelve is not capability at all: 19 of 24 UNSETTLEABLE rows are replay artefacts, and the
eight swept work-class verdicts carry no REFUTED row. Frontier did pay for itself in
verification. It swept rows about twice as fast as the lower tiers had, and it found what they
missed: `P41`'s unquoted deviation `D-02`, eight missing count statements in `P76`, and a 22-word
quote in `P90c`. So frontier-by-default spends its premium on a stricter verifier and a faster
run, while the retries it was meant to save were never capability failures here. Whether that
premium beats the ladder in dollars turns on one unmeasured number: the price of a ladder
worker-plus-verifier pair against 75% of a frontier pair.

## What this does not settle

- **The worker alone.** Both seats moved. Separating them needs a frontier worker against the
  rung-6 verifiers, or a rung-6 worker against frontier verifiers, on the same eighteen nodes.
- **Dollars against a ladder.** This run priced its own spawns; rung 6 and the original self-run
  recorded none. The break-even ratio is measured, and which side of it the ladder falls on is
  not.
- **The cheap tier's failure rate.** One spawn is not a rate.
- **The tree-state confound, again.** `acae87c` is later than rung 6's HEAD, and 19 of 24
  UNSETTLEABLE rows come from fixes that are already landed, from `main` sitting at `fe811a1`, or
  from the withheld verify tree. `P132` could not be measured at all (`Q-13`).
- **Retry sections in the handoffs.** 5 of the 18 original handoffs (`P41`, `P90b`, `P160`,
  `P01b`, `P132`) carry a heading naming a later attempt, retry or amendment. That was the same in
  both arms, and it favours first-try confirmation in both.
- **Anything about phases, digests or the phase runner.** This run had no phase runner.

## Draft: a clause for rules/rule-7-the-ledger.md (not applied)

The `model` column records the model the dispatcher asked for: the binding of the row's tier, as
passed to the harness. It is never rewritten from what came back. The `note` column records what
the harness reports was actually served, as `served: <model>`, whenever the stream shows any
assistant message from a model other than the one asked for. That includes a harness placeholder
such as `<synthetic>`, which Claude Code emits in place of a model reply when a call fails, for
example at an account session limit. A placeholder is recorded exactly like a model, because a
row that ran on no model differs from its `model` column just as a rerouted row does. The tier
histogram (§7.1) counts attempts and seconds by `model`, since that is what the run chose to
spend. A reroute count comes from `note`: rows whose `served:` names a real model other than
`model`, with placeholder rows counted separately and never as reroutes.
