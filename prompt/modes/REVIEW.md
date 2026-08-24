# MODE: REVIEW

> REVIEW seats an adversarial expert panel against {TARGET}, each seat in its own
> context, and returns a ranked recommendation matrix whose every row is cited,
> priced, owned, and given a verification path. It executes nothing — no fixes, no
> code, no config, no "while I was in there."

## Directive

Audit {TARGET} adversarially and deliver a decision-ready recommendation matrix; change
nothing. Classify the target first — surfaces, boundaries, dependents, the contract it
claims to honor — and cite the classification before any seat opens. Seat each lens in
its own context and let it find what it finds against its own standard alone, with no
visibility into any other seat's work; require a twenty-word quote plus a location for
every claim and treat an uncitable claim as retracted. Each seat declares at most one
blocking concern and must argue it as concrete harm, never as taste. Where seats oppose
one another, pair them for exactly one exchange in which each states the other's
position charitably before rebutting; a rebuttal without a steelman is discarded
unread. If every seat agrees, treat the agreement as a defect in the panel rather than
a property of the target, and force a clash between the two most opposed positions
anyway. Verify every citation against its source before synthesis: a fabricated or
misplaced quote downgrades its finding to UNVERIFIED, and an UNVERIFIED finding may not
block. Then rank the survivors by harm against effort and give each a P0–P3 priority
under CONTRACT §9, an owning task, and a verification path. Done when every seat has
returned findings or an explicit nothing-found, every P0 and P1 carries a VERIFIED
citation and a named verification path, at least one clash exchange is on record, and
`final/report.md` holds a matrix whose every row is executable by a later BUILD or
IMPROVE run without further interpretation.

## Graph skeleton

```yaml
- id: T01
  kind: task
  phase: 1
  title: Classify the target and inventory its surfaces
  rung: 1
  surface: doc
  handoff: _orch/nodes/T01/handoff.md
  done: "target-map.md names every entry point, dependent, and claimed contract of {TARGET}, each with a path"
- id: F1
  kind: fanout                        # one A-<seat> child per roster seat
  phase: 2
  rung: 1
  needs: [T01]
  done: "one A-<seat> node per roster seat serving AUDIT; no A-node's handoff names another A-node"
- id: A-spec-fidelity
  kind: task
  phase: 2
  title: "AUDIT — does {TARGET} do what it claims"
  rung: 2
  surface: code
  needs: [F1]
  adversarial: panel
  personas: [spec-fidelity]
  done: "findings.md — every finding carries a ≤20-word quote, a path, and a proposed P0–P3"
- id: R-spec-fidelity
  kind: task
  phase: 3
  title: Declare this seat's one blocking concern
  rung: 1
  needs: [A-spec-fidelity]
  done: "red-flag.md holds one blocking concern with its named harm, or the single line NO BLOCKING FLAG"
- id: B1
  kind: barrier
  phase: 4
  title: All seats in before opposition can be measured
  rung: 1
  needs: [R-spec-fidelity, R-blindspot, R-adversarial-input, R-integration-risk, R-leverage-vs-risk]
  done: "every seated lens has one findings.md and one red-flag.md on disk"
- id: C1
  kind: task
  phase: 4
  title: Convergence audit — pair the opposed, force a pairing if nothing opposes
  rung: 3
  needs: [B1]
  done: "pairings.yaml lists every unrun pairing keyed seat-pair+claim, or states the ledger holds them all"
- id: K1
  kind: fanout
  phase: 4
  title: Run each new pairing as one steelman exchange
  rung: 3
  needs: [C1]
  adversarial: panel
  done: "one clash-<key>.md per unrun pairing, each with both steelmen, both rebuttals, and the ruling"
- id: L1
  kind: loop
  phase: 4
  body: [C1, K1]
  invariant: "every pairing in the ledger has exactly one recorded exchange and one ruling"
  ledger: _orch/loops/L1/seen.yaml
  stop:
    dry_rounds: 2
    max_iterations: 3
    max_rungs: 12
  on_stop: B2
- id: B2
  kind: barrier                       # freeze the record before anything is scored
  phase: 5
  rung: 1
  needs: [L1]
  done: "every findings.md, red-flag.md, and clash file is present and non-empty"
- id: V1
  kind: task
  phase: 5
  title: Verify every citation against its source
  rung: 0
  needs: [B2]
  done: "citations.csv marks every quoted claim VERIFIED or UNVERIFIED by exact match against the cited path"
- id: A-severity-inflation
  kind: task
  phase: 5
  title: "VERIFY — re-score every claimed P0 and P1"
  rung: 2
  needs: [V1]
  refutes: B2
  personas: [severity-inflation]
  done: "every claimed P0/P1 names an irreversible or user-visible harm per CONTRACT §9, or is downgraded in place"
- id: S1
  kind: task
  phase: 6
  title: Synthesize the recommendation matrix
  rung: 3
  needs: [V1, A-severity-inflation]
  personas: []            # SYNTH is neutral by construction
  done: "final/report.md matrix — every row has priority, owner task, verification path, citation status"
```

The planner may vary seat count inside personas/CONTRACT.md §4.1's three-to-seven, split
`T01` when {TARGET} spans more than one surface, and add pairings `C1` discovers. It may
**not** give any `A-` node an `informs` edge from another `A-` node, fold the red-flag
stage into the audit stage, run a pairing twice, place the citation pass after
synthesis, or add a node that writes to {TARGET}. `A-blindspot` gets the seat list and
never the findings — an `informs` edge into it destroys the only thing it is for.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| citation verification (`V1`) | 0 | Exact string match of a quote against a path. Verifiable by command; there is no judgment in it. |
| classification, red-flag declaration, barriers | 1 | Bounded restatement against a clear spec — the default. |
| audit seats (`A-*`) | 2 | Pinned by personas/CONTRACT.md §2.1, not chosen here: AUDIT is rung 2 for every expert. |
| convergence audit (`C1`) | 3 | Judgment — whether unanimity is evidence or a seating failure, and which positions are genuinely most opposed. |
| clash (`K1` children) | 3 | Pinned by personas/CONTRACT.md §2.1: CLASH is rung 3. |
| synthesis (`S1`) | 3 | Cross-panel resolution. Rung 5 needs operator approval (CONTRACT §1.4); REVIEW never asks. Nothing here enters above 3 — a panel needing opus/high to read its own findings has produced findings nobody can use. |

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `spec-fidelity` | expert | AUDIT, CLASH | Whether {TARGET} does what it is documented and named to do, versus what seemed sensible to whoever wrote it. |
| `adversarial-input` | expert | AUDIT, CLASH | What malformed, boundary, hostile, or concurrent input reaches an unguarded path. |
| `integration-risk` | expert | AUDIT, CLASH | The seams — callers, contracts, deploy order, backward compatibility. |
| `leverage-vs-risk` | expert | AUDIT, CLASH | Which findings are worth acting on: harm against effort, and what acting would itself endanger. |
| `blindspot` | expert | AUDIT | The failure classes the seating chart cannot catch, and the assumptions every other seat shares. |
| `severity-inflation` | expert | VERIFY | Standing seat. Every claimed P0/P1 against CONTRACT §9 — "could be bad" is never P0. |

Casting prefers named experts tagged `architecture`/`contracts` for `spec-fidelity`,
`security`/`fuzzing` for `adversarial-input`, `distributed`/`operations` for
`integration-risk`, `strategy`/`economics` for `leverage-vs-risk`, `generalist`/
`first-principles` for `blindspot`, `risk`/`triage` for `severity-inflation` — seat
duties still govern the upgrade (personas/CONTRACT.md §4.2).

## Gates

- **Plan gate.** Passes when every seat has exactly one audit node, no audit node can
  read another's output, `L1` declares all four fields CONTRACT §5.3 requires, and no
  node writes to {TARGET}.
- **Phase gate.** Phase 2 passes when every seat returned findings or a nothing-found
  with its probe named; phase 4 when the loop is dry or stopped and every ledger pairing
  has one ruling; phase 5 when `citations.csv` covers every quoted claim.
- **Blocked batch.** A seat that cannot reach {TARGET} — no access, no build, no
  runnable surface — goes `BLOCKED` and batches its question. One blocked seat does
  not block the panel; the matrix records it as unseated.
- **Final gate.** Synthesis at rung 3. Passes when no P0 or P1 row rests on an
  UNVERIFIED citation and every row names an owner and a verification path.

## Done

`final/report.md` holds one matrix row per surviving finding; every row carries a
P0–P3 priority, an owner task id, a verification path, and a citation-status column;
no UNVERIFIED row carries P0 or P1; every seat in `_orch/cast/roster.yaml` appears as a
source or an explicit nothing-found; at least one `clash-*.md` exists with both
steelmen present; and `git status` on {TARGET} is clean.

## Failure modes of this mode

- **Unanimity read as strength.** Five seats agree and the panel calls it a clean bill of
  health. `C1` treats a zero-opposition round as a finding about the panel and forces a
  pairing anyway; a panel that cannot produce two opposed positions from one target was
  cast wrong, and that goes in the report.
- **The polite quote.** A seat paraphrases from memory; the quote reads as real but is
  not at the cited path. `V1` runs at rung 0 with no judgment and no incentive to be
  agreeable, and it sits at the barrier rather than inside synthesis so the synthesizer
  never grades quotes it is simultaneously ranking.
- **Severity as advocacy.** Every seat wants its finding acted on, so everything
  arrives P1. `severity-inflation` holds a `refutes` edge and re-scores against harm,
  not against how strongly the finding was argued.
- **The clash that becomes a conversation.** Two seats trade rebuttals until one
  concedes from fatigue. `L1`'s ledger keys pairings, not rounds — a pairing that has
  run cannot be re-admitted, so "one exchange" is enforced by dedup rather than by an
  instruction nobody can audit.
- **Review that starts fixing.** A seat repairs something trivial in passing and the
  matrix now describes a target that no longer exists. Every node here reads only and the
  final gate checks the target is unmodified — a fix found mid-review becomes a matrix
  row with an owner, never a diff.
