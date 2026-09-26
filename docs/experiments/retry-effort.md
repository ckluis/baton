# Experiment: a frontier retry at medium or at high effort

Drafted 2026-09-26 · Status: **PRE-REGISTERED, not yet run**

## The question

`rules/rule-1-1-entry-rung.md` says a frontier retry (§1.2's second move) runs at `high`, and marks it
*not measured*. Repair and verification nodes enter at `medium`. When one is refuted, does retrying it
at `high` confirm more than retrying at `medium`, and is the difference worth its price?

## Which nodes can be retried at all

The medium arm (`docs/experiments/frontier-at-medium-effort.md`) left 12 of 18 replayed nodes
unconfirmed. **Nine of them failed only on `UNSETTLEABLE` rows.** Under §9.2 such a node parks on a
question and is never retried at any effort. That count is itself a finding: most first-attempt
failures in this corpus are not retries at all.

That leaves three nodes the medium arm REFUTED, which §1.2 would retry:

| node | class | first-attempt verdict | what failed |
|---|---|---|---|
| `P41` | work | REFUTED | the `spec-fidelity` seat, single-claim |
| `P76` | criterion | REFUTED | 1 row, the original criterion #1 |
| `P160` | work | REFUTED | 44 rows: the worker returned `BLOCKED` after 78 s |

## Design

- **Arms:** the retry worker at `claude-opus-5-5` **medium** or **high**. **Three replicates** per
  node per arm: 18 retries in all.
- **The retry is §1.2 as written:** a fresh spawn in a fresh tree at `acae87c`, with the refuting
  verdict as its escalation packet (`nodes/<id>/escalation.json`), read first. Everything else is the
  medium arm's harness, unchanged: input rule, withheld set, the corpus `chmod a-w`, original criterion
  text for criterion-class nodes, and `P41`'s single-claim seat.
- **Verifier:** a fresh `claude-opus-5-5` / **medium** spawn in both arms, which is what rule 1.1 gives
  a repair node's verifier. The worker's effort is the only thing that differs.
- Seconds, cost and served model are measured per spawn. A replicate is run with its medium and high
  retries at the same time, so both share the moment's conditions.

## Pre-registered decision rule

With `R(e)` = retries CONFIRMED out of 9 at effort `e`, and `rows(e)` = the first attempt's failing
rows that come back CONFIRMED, summed over the 9 retries:

- If `R(high) ≥ R(medium) + 2`, **retry at high stands.**
- If `R(high) ≤ R(medium)` and `rows(high) ≤ 1.1 × rows(medium)`, the rule changes to **retry at the
  node's own effort** (medium for a medium node).
- Anything else is **inconclusive**. The rule keeps high, and its table marks the row *measured,
  inconclusive* instead of *not measured*.

Also reported: cost and seconds per arm, cost per confirmed retry, and each node's three results
beside each other. Two of three replicates disagreeing on a node is itself a result: the retry is a coin.

## Result

Not yet run.
