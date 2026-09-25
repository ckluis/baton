# Experiment: the frontier model at medium effort, both seats

Drafted 2026-09-24 · Ran 2026-09-24 · Status: **RUN — effort buys the saving** · Cost cap: 45 spawns (37 spawn rows at the node gate, $50.57)

## The question

The ladder-pricing run ([ladder-price-on-two-tier-harness.md](ladder-price-on-two-tier-harness.md))
came in 23.5% cheaper than frontier-by-default. Part of that saving was effort, not model: its top
rung ran `claude-opus-5-5` at medium and cost 0.63 of the frontier pair on the same nodes. v5 now
keeps frontier as its default for an operational reason: one agent tier to bind, plan and audit
(`docs/designs/v5-accountability-layer.md`, *The bet, measured*). This run asks whether one tier at
a lower effort keeps frontier's yield at the ladder's price. If it does, v5 keeps one model and
lowers its default effort.

## The design

**Held from the two earlier arms, exactly:** the same 18 nodes, classes, commits and original
handoffs; `HEAD` pinned to `acae87c`; the corrected input rule and withheld set, which now also
withholds both earlier arms' records; the corpus `chmod a-w`; `P41` verified by the
`spec-fidelity` seat in single-claim shape; `F2`'s fan-out inlined; criterion-class verifiers
given the original criterion text verbatim; one worker and one verifier per node, concurrency 1,
no escalation; the same dispatcher, with cost read from each spawn's result event. No plan gate is
spawned.

**What changes:** every worker and every verifier runs as `claude-opus-5-5` at **medium** effort.

## Pre-registered decision rule

Let `M(n)` be node `n`'s pair cost in this run, `F(n)` its frontier pair from the two-tier replay,
`CM` and `CF` the sets each arm confirmed on the first try. As in the ladder run, a node the
frontier confirmed and this arm did not is charged one retry at its frontier pair:

```
medium_total = Σ M(n) + Σ_{n ∈ CF \ CM} F(n)
```

Measured against the two earlier totals, which were fixed before this run:
`ladder_total` $60.09 and `frontier_total` $78.53.

- If `medium_total ≤ 66.10` (within 10% of `ladder_total`), **effort buys the saving.** v5 keeps
  one model and lowers its default effort to medium.
- If `medium_total ≥ 70.68` (within 10% of `frontier_total`), **effort buys nothing.** The saving
  was the ladder's cheaper models, and the operational argument must carry the full price.
- Anything between is **partial**, and is reported with both distances.

Also reported: `CM` per class against `CF` and `CL`; any node in `CM \ CF`, which would mean
medium confirmed what high did not; and pair seconds.

Malformed verdicts are excluded from `CM` and counted on their own. A spawn killed by a session
limit, or run on the wrong tree, is re-run whole; its cost is reported and kept out of the total.

## The confounds, stated before the result

1. **The verifier moves with the worker.** A medium-effort verifier may confirm what a high-effort
   one would refute, so `CM` may overcount. The report names every node where `CM` and `CF`
   disagree, and gives the worst case with every `CM \ CF` confirmation assumed false.
2. **One sample per node.** The ladder outcome turned on two nodes; this one may too.
3. **Tree state and harness** are the earlier arms', replay artefacts included. They fall on all
   three arms alike.

## Result

Run `frontier-medium-20260924T141138Z`, through the same dispatcher with `HEAD` pinned to `acae87c`.
Every worker and verifier was `claude-opus-5-5` at medium, and no plan gate was spawned. Every
number below is recomputed by `python3 _orch/medium/final/derive.py`, run from
`/Users/clank/Desktop/projects/baton-opus55-replay`. The run record is gitignored; it is
`/Users/clank/Desktop/projects/baton-opus55-replay/_orch/medium/final/report.md`.

One spawn is reported and kept out of the total: `P121`'s first worker. The account session limit
killed it at 160 s ($1.27), and the node was re-run whole. No verdict was malformed in any of the
three arms.

### The decision rule, applied

```
CF      = P00, P10, P11, B1, P90b, F1.4          (6)
CL      = P00, P11, B1, F1.4                     (4)
CM      = P00, P10, P11, B1, F1.4, P90c          (6)
CF \ CM = P90b        CM \ CF = P90c

medium_total = ΣM 49.30 + F(P90b) 4.77 = 54.07
thresholds: effort buys the saving ≤ 66.10; effort buys nothing ≥ 70.68
distance to ladder_total -6.02 (-10.0%); to frontier_total -24.46 (-31.1%)
```

- **Effort buys the saving.** `medium_total` is $12.03 under the threshold. It is not only within
  10% of `ladder_total`: it is 10.0% below it. In the rule's words, v5 keeps one model and lowers
  its default effort to medium.
- **`CM` per class, against `CF` and `CL`:** work 5 of 9 (frontier 6, ladder 4); criterion 1 of 7
  (0, 0); non-discriminating 0 of 2 (0, 0).
- **`CM \ CF` is one node, `P90c`.** Assume its confirmation false and `medium_total` is unchanged at
  $54.07. The rule charges a retry only for nodes in `CF`, and `P90c` is not one. The harshest
  reading, with every medium CONFIRMED overturned (including the four all three arms
  confirmed), gives $66.05. That is inside the threshold by five cents.

### The comparison

| measure | frontier (Opus 5.5/high, both seats) | ladder (original rung, both seats) | medium (Opus 5.5/medium, both seats) |
|---|---|---|---|
| work class CONFIRMED first try | 6 of 9 | 4 of 9 | **5 of 9** |
| criterion class CONFIRMED first try | 0 of 7 | 0 of 7 | **1 of 7** |
| non-discriminating CONFIRMED first try | 0 of 2 | 0 of 2 | **0 of 2** |
| node verdicts C / P / R | 6 / 8 / 4 | 4 / 8 / 6 | **6 / 9 / 3** |
| malformed verdicts | 0 | 0 | **0** |
| Σ pair cost, 18 nodes | $78.53 | $52.53 | **$49.30** |
| mean pair | $4.36 | $2.92 | **$2.74** |
| pair $ by class: work / criterion / non-discriminating | 35.62 / 36.48 / 6.43 | 21.49 / 21.13 / 9.90 | **18.38 / 24.42 / 6.50** |
| total under its rule | $78.53 | $60.09 | **$54.07** |
| pair seconds, 18 nodes | 12,696 | 12,657 | **7,871** |
| verifier seconds per swept row | 12.2 | 11.8 | **7.7** |
| wall-clock, run start → node gate, gross | 6h01m33s | 17h15m33s | **2h39m31s** |
| session-limit idle gap | 2h21m09s | 13h38m32s | **27m31s** |
| wall-clock net of that gap | 3h40m24s | 3h37m01s | **2h12m00s** |
| UNSETTLEABLE rows (replay-artefact / genuine, as labelled) | 24 (19 / 5) | 32 (27 / 5) | **25 (21 / 4)** |
| served: reroutes / `<synthetic>` placeholders | 0 / 3 | 0 / 1 | **0 / 1** |

- **The same nodes, priced three ways, grouped by the ladder's rung:**
  - rung 0: medium $1.42, frontier $1.73, ladder $0.46;
  - rung 1: $9.21, $13.89, $7.66;
  - rung 2: $18.41, $26.24, $21.15;
  - rung 3: $20.26, $36.67, $23.26.
- **Where medium saves against the ladder.** It costs more than the ladder on the cheap rungs, where
  the ladder ran Haiku and Sonnet at medium. It costs less on rungs 2 and 3. It is dearer than the
  ladder on 10 of 18 nodes, and dearer than frontier on one (`P132`, whose frontier worker returned
  `BLOCKED` and attempted nothing).

### The confounds, as they fell

1. **The verifier moves with the worker. It did not overcount `CM` where the arms split.** Medium
   and frontier disagree on two nodes, one each way.
   - **`P90c`: the medium worker's artifact differs.**
     - The three arms refuted different rows: frontier refuted #4, the ladder refuted #14 (the
       original criterion, given verbatim), and medium confirmed both.
     - On #4, the frontier worker quoted a statement as two spans joined across a line break,
       22 words against a 20-word cap. The medium worker quoted a 9-word fragment, the kind the
       frontier verifier's own attack says would have met the cap.
     - On #14, the ladder's `Q-11.md` carried a quotation its audit missed. The medium `Q-11.md`
       has 16 quoted spans, none wrapping a line, and each is audited, a substring of an audited
       quote, or the question's own note.
     - The medium verifier was fast (85 s against 197 s) and used a quote search that would have
       missed wrapped quotes. There were none to miss.
     - This is the first criterion-class CONFIRMED in any arm, and it is earned by the artifact. The
       rule charges it nothing either way.
   - **`P90b`: a stricter medium verifier.**
     - Both workers staged their edits and rebuilt the original run's diff, because the handoff's
       literal diff is empty at `acae87c`.
     - The frontier verifier accepted the reconstruction on #11–13. The medium verifier ran an
       isolated retry and filed them UNSETTLEABLE, as state the replay withholds.
     - This is the same shape as the ladder's `P10` #19, and it costs medium $4.77.

   Among nodes neither confirmed, the medium verifier agreed with the frontier seat where the
   ladder's did not: on `P01b`'s false-premise rows, on `P76` #1, and on PARTIAL rather than REFUTED
   for `P111` and `P121`. It ran 37% fewer seconds per row. What this run cannot rule out is an
   overcount on the nodes both arms confirmed, since no high-effort verifier read a medium artifact.
2. **One sample per node, and here a second sample exists.** The ladder's rung 3 ran the same
   binding, `claude-opus-5-5`/medium, on `P160`, `P80`, `P111`, `P112` and `P121`.
   - **`P160` split.** The medium worker returned `BLOCKED` after 78 s. In its words, *"the
     dispatched tree acae87c is v5 … and the revision itself landed at 76c11e9, an ancestor of
     HEAD. A plan against this tree would roll the product back, criteria 42 and 45 are already
     false here, and the invariant script cd's into the archived repo outside my write scope."* It
     filed a question recommending re-dispatch at `7dc943f`. The ladder's worker, at the same
     binding, and the frontier's both planned against `7dc943f` materialized under `work/`. So the
     `BLOCKED` is a one-sample coin, not a property of medium effort. It made `P160` the cheapest
     medium pair ($1.34, against $8.02 frontier). Priced at the ladder's pair instead,
     `medium_total` is $59.01, still under the threshold.
   - **The other four split on cost, not on yield.** On `P80`, `P111`, `P112` and `P121`, this arm
     paid $18.92 against the ladder's $16.97 for the same binding, 11.5% more, and neither
     confirmed any of them.
   - **The outcome crosses only under two stacked readings.** Every medium confirmation must be
     overturned *and* `P160` re-priced as worked ($70.99 at the ladder's pair, $72.73 at the
     frontier's). Frontier's own cheap `BLOCKED` on `P132` is not re-priced in that comparison
     either.
3. **Tree state and harness fell on all three arms.** All three ran at `acae87c` with the same
   withheld set.
   - The generators' walk-up recurred. `P121` wrote `_orch/index/` and `_orch/instruments/` into
     the frontier arm's run directory, and `P122` wrote `_orch/instruments/` there. Each removed
     what it wrote, as their transcripts show. No file any arm's numbers come from was touched.
   - The `P122` worker ran the invariant script once in the operator's tree after a failed path
     remap. In its words, *"It rewrote that tree's index.html with identical content"*. That tree
     is clean now.

### Verdict on v5's default

v5 should keep one model and lower its default effort to medium. On this corpus, `claude-opus-5-5`
at medium in both seats confirmed first try as often as at high: six nodes each. Its one confirmation
outside the frontier's held up under inspection, and its one loss was a strict verifier call, not a worse worker. It
cost 0.63 of the frontier's dollars and 0.62 of its pair seconds. Its rule total came in under the
ladder's, so the ladder's saving was effort more than model. The operational argument for one
tier, already the reason v5 keeps frontier, no longer has to carry a price: one tier to bind, plan
and audit now costs less than four. That is the pre-registered consequence, and this run gives no
reason to soften it. It gives one reason to watch it: the margin rests partly on a node where a
medium worker declined work that the same binding did in another arm.

### What this does not settle

- **Whether `CM` is an overcount on the nodes both arms confirmed.** Settling it needs a high-effort
  verifier on the medium arm's artifacts.
- **Medium's rate of declining work.** One of two same-binding samples on `P160` returned `BLOCKED`
  on an accurate premise check. Two samples do not make a rate. Whether medium blocks more often
  than high on false-premise handoffs, and what a re-dispatch then costs, was not measured.
- **Medium effort in the other seats.** Only workers and verifiers ran here. The plan gate, the
  phase runner, the synthesizer and the auditor were not priced at medium, and this synthesis ran
  at frontier.
- **The retry's real price.** As in the ladder run, a lost node is charged at its frontier pair.
  A real v5 retry at medium may cost less or may fail again.
- **The eleven nodes no arm confirmed first try.** Ten medium nodes carry UNSETTLEABLE rows. Most need a person, and that cost is in no total.
- **Variance.** One sample per node except the five rung-3 nodes, where repeat samples of the same
  binding differed by about 11% in cost and once in whether the worker attempted the node.
- **Anything outside this corpus.** Eighteen nodes the self-run refuted, replayed on a tree where
  most fixes are already landed.
