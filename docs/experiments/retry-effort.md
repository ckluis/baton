# Experiment: a frontier retry at medium or at high effort

Drafted 2026-09-26 · Ran 2026-09-26 to 2026-09-27 · Status: **RUN — inconclusive; retry at high kept, marked measured**

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

| per arm, 9 retries | medium | high |
|---|---|---|
| retries CONFIRMED | **4 of 9** | **5 of 9** |
| first attempt's failing rows now CONFIRMED | 142 of 150 | 143 of 150 |
| cost, worker + verifier | $40.10 | $57.77 (+44%) |
| seconds, worker + verifier | 6,221 | 8,998 (+45%) |

| node, replicates 1 / 2 / 3 | medium | high |
|---|---|---|
| `P41` | C · C · C | C · C · C |
| `P76` | C · R · P | P · C · C |
| `P160` | P · P · P | P · P · P |

(C = CONFIRMED, P = PARTIAL, R = REFUTED.)

**The rule, applied.** High confirmed one more retry than medium, not the two the rule needs for
"retry at high stands", and not few enough for "retry at the node's own effort". The outcome is
**inconclusive**. Rule 1.1 keeps `high` for a frontier retry, and its table now marks that row
*measured, inconclusive* instead of *not measured*.

**What the nodes say.**
- **`P41` retries reliably at either effort.** The escalation packet named the unregistered
  deviation that refuted the first attempt, and all six retries closed it. The packet did the
  work; effort did not.
- **`P160` is fixed identically by both.** The first attempt's worker returned `BLOCKED` after 78 s
  and left 44 rows refuted. Every retry, at either effort, did the work and resolved all 44. Each
  is left `PARTIAL` on the same two replay-artefact rows, which no retry can settle.
- **`P76` is a coin.** Its original criterion #1, *"every count statement"*, is unbounded, and
  medium-effort verifiers split on it: settled, unsettleable, or false, across six retries. The
  whole difference between the arms is this one node, 1 of 3 against 2 of 3.

**Two findings beyond the rule.**
- **Most first-attempt failures are not retries.** Nine of the medium arm's twelve failures were
  `UNSETTLEABLE`-only and park under §9.2. A retry policy governs three nodes in eighteen here.
- **With the evidence in the handoff, a retry mostly succeeds at either effort.** 142 or 143 of 150
  failing rows came back CONFIRMED. §1.2's own observation holds here too: the mechanism is the
  packet, and effort decides at most the coin-flip nodes.

**Harness notes.** One account session limit killed both replicate-2 `P41` workers mid-run; both
were set aside, logged as event rows, and re-run whole. All 36 live spawns were served by the model asked for; the two aborted ones show `<synthetic>`, the session-limit placeholder.

**What this does not settle.** Three nodes. A different corpus with more capability-bound
refutations could separate the arms; this one mostly measured the packet.
