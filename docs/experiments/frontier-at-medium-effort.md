# Experiment: the frontier model at medium effort, both seats

Drafted 2026-09-24 · Status: **PRE-REGISTERED, not yet run** · Cost cap: 45 spawns

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

Not yet run.
