# MODE: REVIEW

> REVIEW sets fresh reviewers against {TARGET}, each in its own context, and returns a
> ranked recommendation matrix whose every row is cited, priced, owned, and given a
> verification path. It executes nothing — no fixes, no code, no config, no "while I
> was in there."

## Directive

Audit {TARGET} adversarially and deliver a decision-ready recommendation matrix; change
nothing. Classify the target first — surfaces, boundaries, dependents, the contract it
claims to honor — and cite the classification before any reviewer opens. Spawn one fresh
reviewer per surface the classification names, each in its own context, with no
visibility into any other reviewer's work, attacking correctness, contract fidelity,
hostile input, integration seams, and what acting on each finding would itself endanger;
require a twenty-word quote plus a location for every claim and treat an uncitable claim
as retracted. Each reviewer declares at most one blocking concern and must argue it as
concrete harm, never as taste. Where two reviewers reach opposite conclusions about the
same artifact, an adjudicator rules on the evidence (CONTRACT §1.2). Verify every
citation against its source before synthesis: a fabricated or misplaced quote downgrades
its finding to UNVERIFIED, and an UNVERIFIED finding may not block. Then rank the
survivors by harm against effort and give each a P0–P3 priority under CONTRACT §9, an
owning task, and a verification path. Done when every reviewer has returned findings or
an explicit nothing-found, every P0 and P1 carries a VERIFIED citation and a named
verification path, and `final/report.md` holds a matrix whose every row is executable by
a later BUILD or IMPROVE run without further interpretation.

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
  kind: fanout                        # one A-<n> child per surface in target-map.md
  phase: 2
  rung: 1
  needs: [T01]
  done: "one A-<n> node per surface; no A-node's handoff names another A-node"
- id: A-1
  kind: task
  phase: 2
  title: "AUDIT — a fresh reviewer, one surface, its own context"
  rung: 1
  surface: code
  needs: [F1]
  adversarial: standard
  done: "findings.md — every finding carries a ≤20-word quote, a path, and a proposed P0–P3; one blocking concern with its named harm, or the line NO BLOCKING FLAG"
- id: B1
  kind: barrier                       # freeze the record before anything is scored
  phase: 3
  rung: 1
  needs: [F1]
  done: "every reviewer has one findings.md on disk, present and non-empty"
- id: V1
  kind: task
  phase: 3
  title: Verify every citation against its source
  rung: 0
  needs: [B1]
  done: "citations.csv marks every quoted claim VERIFIED or UNVERIFIED by exact match against the cited path"
- id: V2
  kind: task
  phase: 3
  title: "VERIFY — re-score every claimed P0 and P1"
  rung: 1
  needs: [V1]
  refutes: B1
  done: "every claimed P0/P1 names an irreversible or user-visible harm per CONTRACT §9, or is downgraded in place"
- id: S1
  kind: task
  phase: 4
  title: Synthesize the recommendation matrix
  rung: 1
  needs: [V1, V2]
  done: "final/report.md matrix — every row has priority, owner task, verification path, citation status"
```

The planner may split `T01` when {TARGET} spans more than one surface, and a large
surface across two reviewers. One fresh reviewer per surface is the default because a
plain reviewer found 15.67 of 16 seeded defects, and four lens cards or four plain
reviewers found 16 at four times the cost (`docs/experiments/personas-earn-their-place.md`).
The planner may **not** give any `A-` node an `informs` edge from another `A-` node,
place the citation pass after synthesis, or add a node that writes to {TARGET}.

## Entry tiers

| node class | entry tier | why |
|---|---|---|
| citation verification (`V1`) | 0 `cheap` | Exact string match of a quote against a path. Verifiable by command; there is no judgment in it. |
| everything else — classification, reviewers (`A-*`), barrier, re-scoring (`V2`), synthesis (`S1`) | 1 `frontier` | the default (CONTRACT §1.1). REVIEW never asks a person mid-run — a reviewer that cannot read its own findings has produced findings nobody can use, and that reaches the gate as a question (§1.2). |

## Gates

- **Plan gate.** Passes when every surface has exactly one audit node, no audit node can
  read another's output, and no node writes to {TARGET}.
- **Phase gate.** Phase 2 passes when every reviewer returned findings or a nothing-found
  with its probe named; phase 3 when `citations.csv` covers every quoted claim.
- **Blocked batch.** A reviewer that cannot reach {TARGET} — no access, no build, no
  runnable surface — goes `BLOCKED` and batches its question. One blocked reviewer does
  not block the rest; the matrix records its surface as unreviewed.
- **Final gate.** Synthesis at frontier. Passes when no P0 or P1 row rests on an
  UNVERIFIED citation and every row names an owner and a verification path.

## Done

`final/report.md` holds one matrix row per surviving finding; every row carries a
P0–P3 priority, an owner task id, a verification path, and a citation-status column;
no UNVERIFIED row carries P0 or P1; every surface in `target-map.md` appears as a
source or an explicit nothing-found; and `git status` on {TARGET} is clean.

## Failure modes of this mode

- **Agreement read as strength.** Two reviewers report the same finding and it is called
  corroborated. It is evidence only because they ran in separate contexts with nothing to
  peek at (CONTRACT §9); a reviewer handed another's findings has produced one opinion
  twice.
- **The polite quote.** A reviewer paraphrases from memory; the quote reads as real but is
  not at the cited path. `V1` runs at cheap with no judgment and no incentive to be
  agreeable, and it sits at the barrier rather than inside synthesis so the synthesizer
  never grades quotes it is simultaneously ranking.
- **Severity as advocacy.** Every reviewer wants its finding acted on, so everything
  arrives P1. `V2` holds a `refutes` edge and re-scores against harm, not against how
  strongly the finding was argued.
- **Review that starts fixing.** A reviewer repairs something trivial in passing and the
  matrix now describes a target that no longer exists. Every node here reads only and the
  final gate checks the target is unmodified — a fix found mid-review becomes a matrix
  row with an owner, never a diff.
