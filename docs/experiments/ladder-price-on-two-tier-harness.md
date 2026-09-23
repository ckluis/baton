# Experiment: price the ladder on the two-tier harness

Drafted 2026-09-23 · Status: **PRE-REGISTERED, not yet run** · Cost cap: 45 spawns

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

Not yet run.
