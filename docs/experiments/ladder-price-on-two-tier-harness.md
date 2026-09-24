# Experiment: price the ladder on the two-tier harness

Drafted 2026-09-23 · Ran 2026-09-23 to 2026-09-24 · Status: **RUN — the ladder is cheaper** · Cost cap: 45 spawns (39 spawn rows at the node gate, $53.67)

## The question

The two-tier replay ([replay-two-tiers-opus-5-5.md](replay-two-tiers-opus-5-5.md)) left the v5 bet's
dollar case as a break-even with no measured side. Frontier-by-default costs no more than a ladder
only if a ladder worker-plus-verifier pair costs at least $3.27, 75% of the mean frontier pair
($4.36). No run has priced a ladder pair. This one does.

## The design

**Held from the two-tier replay, exactly:** the same 18 nodes, classes, commits and original
handoffs; the same corrected input rule, withheld set and corpus `chmod a-w`; `P41` verified by the
`spec-fidelity` seat in single-claim shape; `F2`'s fan-out inlined; criterion-class verifiers given
the original criterion text verbatim; one worker and one verifier per node, concurrency 1, no
escalation; the same dispatcher (`claude -p --model <m> --effort <e> --output-format stream-json`,
Agent tool disabled in workers, seconds by shell clock, cost from each spawn's result event).

**What changes: every worker and every verifier runs at the node's original tier.** That tier is
read from the original self-run's ledger, where each node's first-attempt worker and its verifier
sat at the same rung. It is bound to today's model of the same family and the original effort:

| rung | original | bound to today | nodes |
|---|---|---|---|
| 0 | haiku / low | `claude-haiku-4-5-20251001` / low | `P00` |
| 1 | sonnet / medium | `claude-sonnet-5` / medium | `F1.4`, `F2`, `P01b`, `P76`, `P90c` |
| 2 | sonnet / high | `claude-sonnet-5` / high | `P10`, `P11`, `B1`, `P41`, `P90b`, `P122`, `P132` |
| 3 | opus / medium | `claude-opus-5-5` / medium | `P160`, `P80`, `P111`, `P112`, `P121` |

No plan gate is spawned: the table above is the plan, and planner spawns would add cost that is
not part of any pair.

## Pre-registered decision rule

Let `F(n)` be node `n`'s measured frontier pair cost from the two-tier replay, and `L(n)` its
ladder pair cost from this run. Let `CF` and `CL` be the sets each arm confirmed on the first try.
Each arm is charged one retry for every node the *other* arm confirmed and it did not, priced at
that node's frontier pair — v5's escalation target, and a measured number:

```
frontier_total = Σ F(n) + Σ_{n ∈ CL \ CF} F(n)
ladder_total   = Σ L(n) + Σ_{n ∈ CF \ CL} F(n)
```

- If `frontier_total ≤ ladder_total`, **frontier-by-default holds in dollars.**
- If `ladder_total < frontier_total` by more than 10% of `frontier_total`, **the ladder is cheaper**
  and the bet rests on seconds and on verification strictness, not on dollars.
- Anything between is **a wash** and is reported as a wash.

Also reported, as the question was first posed: the mean ladder pair against $3.27.

Malformed verdicts are excluded from `CF` and `CL` and counted on their own. A spawn killed by a
session limit is re-run whole, and its cost is reported but kept out of both totals.

## The confounds, stated before the result

1. **The verifier moves with the worker.** A ladder verifier is weaker than a frontier one, so it
   may confirm what a frontier verifier would refute. `CL` is then an overcount, which favours the
   ladder. The report names every node where the arms disagree.
2. **Today's models, not the self-run's.** "opus" is `claude-opus-5-5` at medium here, not the
   model the self-run used. This prices a ladder built today, which is the choice v5 faces.
3. **Tree state and harness** are the two-tier replay's, including `HEAD` at `acae87c` and the
   replay-artefact rows that result. They fall on both arms alike.
4. **One sample per node.** No variance is measured.

## Result

Run `ladder-price-20260923T191900Z`, through the same dispatcher with `HEAD` pinned to `acae87c`.
Every number below is recomputed by `python3 _orch/ladder/final/derive.py`, run from
`/Users/clank/Desktop/projects/baton-opus55-replay`. The run record is gitignored; it is
`/Users/clank/Desktop/projects/baton-opus55-replay/_orch/ladder/final/report.md`.

Three spawns are reported and kept out of both totals. Two are the `P00` pair that ran on
`2fc262d` before `HEAD` was pinned, a harness error ($0.48). The third is `P111`'s worker, which the
account session limit killed at 89 s ($0.67). Each node was re-run whole. No verdict was
malformed in either arm.

### The decision rule, applied

```
CF      = P00, P10, P11, B1, P90b, F1.4      (6)
CL      = P00, P11, B1, F1.4                 (4)
CF \ CL = P10, P90b        CL \ CF = ∅

frontier_total = ΣF 78.53 + 0                                  = 78.53
ladder_total   = ΣL 52.53 + F(P10) 2.79 + F(P90b) 4.77          = 60.09
difference 18.44 = 23.5% of frontier_total; the wash band is 7.85 (10%)
```

- **The ladder is cheaper,** by more than twice the wash band. In the rule's words, the bet now
  rests on seconds and on verification strictness, not on dollars.
- **Asked as first posed: the mean ladder pair is $2.92, below the $3.27 break-even.** It is 67%
  of the $4.36 mean frontier pair, where the frontier needed 75%. The break-even assumed the
  frontier saves six retries; against this ladder it saved two.
- **Even the worst case for confound 1 leaves the outcome standing.** Suppose a frontier verifier
  would overturn all four of the ladder's first-try confirmations. Then `ladder_total` is $69.28,
  still 11.8% under `frontier_total`.

### The comparison

| measure | frontier arm (Opus 5.5/high, both seats) | ladder (original rung, both seats) |
|---|---|---|
| work class CONFIRMED first try | 6 of 9 | **4 of 9** |
| criterion class CONFIRMED first try | 0 of 7 | **0 of 7** |
| non-discriminating CONFIRMED first try | 0 of 2 | **0 of 2** |
| node verdicts C / P / R | 6 / 8 / 4 | **4 / 8 / 6** |
| malformed verdicts | 0 | **0** |
| Σ pair cost, 18 nodes | $78.53 | **$52.53** |
| mean pair | $4.36 | **$2.92** |
| pair $ by class: work / criterion / non-discriminating | 35.62 / 36.48 / 6.43 | **21.49 / 21.13 / 9.90** |
| pair seconds, 18 nodes | 12,696 | **12,657** |
| verifier seconds per swept row | 12.2 | **11.8** |
| wall-clock, run start → node gate, gross | 6h01m33s | **17h15m33s** |
| session-limit idle gap | 2h21m09s | **13h38m32s** (the limit reset after ~17 min; the rest is the prime's overnight absence) |
| wall-clock net of that gap | 3h40m24s | **3h37m01s** |
| UNSETTLEABLE rows (replay-artefact / genuine, as labelled) | 24 (19 / 5) | **32 (27 / 5)** |
| served: reroutes / `<synthetic>` placeholders | 0 / 3 | **0 / 1** |

Pair cost by rung, ladder against frontier on the same nodes:
- rung 0, haiku/low: $0.46 against $1.73 (1 node);
- rung 1, sonnet/medium: $7.66 against $13.89 (5 nodes);
- rung 2, sonnet/high: $21.15 against $26.24 (7 nodes);
- rung 3, opus-5-5/medium: $23.26 against $36.67 (5 nodes).

Rung 2 was the worst binding: 0.81 of the frontier price, 48.5% of the ladder's seconds, and
dearer than frontier outright on `P10`, `P122` and `P132`. `P132` is the extreme case. The frontier
pair cost $2.87 because its worker returned `BLOCKED` and attempted nothing, while the ladder
worker spent 1,121 s doing the work.

### The confounds, as they fell

1. **The verifier moves with the worker. It did not overcount `CL`.** `CL` is a strict subset of
   `CF`, so the ladder confirmed no node the frontier refused. The two nodes the ladder lost went
   one each way:
   - **`P10`: a stricter ladder verifier.** Row 19, *"No source file was fetched over the
     network"*, is UNTESTED at sonnet/high because no execution log exists. That is the same
     judgement a sonnet/high verifier made at rung 6. The frontier verifier CONFIRMED it on a
     `grep -rn http` over the outputs. The other 18 rows agree. The ladder is charged $2.79 for a
     process claim that no artifact can settle.
   - **`P90b`: the ladder worker.** The two prompts are identical apart from run id, tier and
     remapped paths, including the remap clause and *"A write into it has failed; say so in your
     envelope rather than working around it."*
     - The Sonnet worker treated the node's two required edits as writes to the read-only corpus.
       Both were refused, and it returned `FAILED`.
     - The frontier worker made the same edits to staged copies under its `work/` directory and
       met criteria 1–9 there.
     - The ladder verifier scored 12 rows UNSETTLEABLE and labelled them replay artefacts. The
       frontier worker cleared those rows under the same harness, so they measure the worker.
     - The node's REFUTED is row 17, a `comm -23` check the worker skipped. The verifier then ran
       it itself and it passed.
     - This is a result, not a harness fault.

   **Among the nodes neither arm confirmed, strictness did not track tier:**
   - The ladder's verifiers returned REFUTED on six nodes against the frontier's four.
   - **`P41`: a Sonnet seat refuted it too.** The rung-2 `spec-fidelity` seat refuted `P41` on
     the same criterion as the frontier seat, finding a bucket-(b) deviation whose trail is the
     document itself. The two-tier replay attributed its refutation partly to the stronger seat,
     because rung 6's sonnet seat had passed `P41`. That attribution now has a Sonnet counterexample,
     though each seat judged a different worker's document.
   - **`P121` #18:** the ladder verifier built its own ambiguous fixtures and exposed a silent
     exit 0. The frontier verifier re-ran the worker's fixtures.
   - **`P01b`:** the ladder verifier made a §9.2 error in the harsh direction. It scored two rows
     REFUTED whose premise its own probe calls false; the frontier seat filed them UNSETTLEABLE.
   - **`P76`:** the frontier seat was the harsher one. It settled #1 false, where the ladder filed
     it as an unbounded enumeration.

   What this run cannot rule out is the overcount itself. No frontier verifier read a ladder
   artifact. The worst case prices that at 11.8%, still outside the band.
2. **Today's models.** Rungs 1 and 2 are both Sonnet 5, so the ladder has three models, not four.
   Rung 3 is the frontier model at medium effort rather than high. On its five nodes, four
   criterion-class and one work-class (`P160`), that cost 0.63 of the frontier pair, with no
   change in first-try yield (zero in both arms). Part of the ladder's saving is therefore effort, not model.
3. **Tree state and harness fell on both arms.** Both ran at `acae87c` with the same withheld set.
   The ladder's extra UNSETTLEABLE rows are mostly `P90b`'s twelve, which confound 1 accounts for.
   The harness also leaked in both arms: the ladder `P111` worker's `tools/instruments.py` walked up
   and wrote into the frontier arm's run directory. It is the same walk-up the frontier arm saw at
   `P121` and `P132`, and it touches no file either arm's numbers come from.
4. **One sample per node.** The rule turns on two nodes, and at least one of them (`P10`) is a
   verifier's coin on an unsettleable process claim. The margin tolerates about four more
   mean-priced retries before it reaches the band.

### Verdict on the v5 bet's dollar case

The dollar case for frontier-by-default does not hold on this corpus. A ladder built today, with
each node at its original rung and its verifier at the same rung, priced its pairs at 67% of the
frontier's. It lost only two first-try confirmations to the frontier. One was a verifier declining
to confirm a claim no artifact can settle; the other was a Sonnet worker misreading a path remap.
After paying for both at frontier prices, it came in 23.5% cheaper, and it stays cheaper even if
every one of its four confirmations is assumed false. The pre-registered consequence is that the
bet now rests on seconds and on verification strictness. This run weakens both. Seconds were a
wash: 12,657 pair seconds against 12,696, and 3h37m against 3h40m net. The two-tier replay's
speed advantage was against rung 6's phase-runner architecture, not against a ladder on the same
harness. Strictness did not track tier either. The cheaper verifiers refuted more nodes, `P41` among
them, and ran at least one probe the frontier seat did not (`P121` #18). They also made one triage
error the frontier seat did not. What remains for frontier-by-default is the argument that one tier is simpler to run
than four. That is an argument about operations, and no run so far has priced it.

### What this does not settle

- **Whether `CL` is an overcount.** Settling it needs a frontier verifier on the ladder's
  artifacts, or a ladder verifier on the frontier's, for the same eighteen nodes.
- **The retry's real price.** The rule charges a lost node at its frontier pair. A real ladder
  escalates one rung, which may cost less or may fail again. Neither was measured.
- **The twelve nodes neither arm confirmed.** The rule assumes they cost both approaches the same
  follow-up. Eleven ladder nodes and nine frontier nodes carry UNSETTLEABLE or UNTESTED rows. Most of those
  rows need a person, not another worker, and that cost is in neither total.
- **Entry-tier assignment.** Every tier was read from the self-run's ledger. A ladder that picks
  entry tiers from a fresh plan pays for a planner and may pick differently.
- **Variance.** One sample per node, and the outcome turns on two nodes.
- **The cheap tier.** `P00` at haiku/low passed its own haiku verifier 9/9. No stronger seat
  checked that artifact, and one command-run node is not a rate.
- **Anything outside this corpus.** Eighteen nodes the self-run refuted, replayed on a tree where
  most fixes are already landed.
