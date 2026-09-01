# MODE: IMPROVE

> Audit {TARGET}, hunt the audit's own blindspots, rank every candidate by leverage against risk, and execute only the improvements that demonstrably preserve behavior.
> This mode refuses drive-by refactors and refuses behavior change: a diff that touches a file no accepted candidate names, or that alters an observable behavior without an operator-approved flag, is refuted regardless of how much better it is.

## Directive

Perform a rigorous improvement pass on {TARGET}: record a behavior-preservation
baseline first — suite result, coverage, and whatever size and performance
numbers are cheap to take — then audit the module for correctness hazards, hidden
coupling, duplication, dead code, needless complexity, performance waste, unclear
contracts, and missing tests, every finding cited to a file and line; then hunt
the audit's own blindspots with a fresh agent that is given the audit's lens list
and none of its findings, charged with naming the failure classes no chosen lens
can catch and probing for each, reading the module as its callers and its
operators experience it rather than as its author, and attacking every assumption
the code, its tests, and the audit lenses all share unexamined — each class
yielding either a cited finding or an explicit record of what was probed, how,
and that nothing was found; rank all candidates, audit and blindspot alike, by
leverage against risk and effort, and put the cut line to the operator; execute
only accepted candidates, each landed atomically with tests and a before/after
artifact, with no drive-by refactor and no behavior change absent an approved
flag; and re-audit with a fresh blindspot agent after every execution round.
Complete when two consecutive rounds produce no candidate above the cut line, the
baseline reference reproduces exactly, and every executed improvement carries
before/after evidence at a cited path rather than an assertion that it helped.

## Graph skeleton

`handoff:` paths follow CONTRACT §6 and are elided.

```yaml
- id: T01                       # phase 1 — the behavior-preservation reference
  kind: task
  phase: 1
  title: Record the baseline — suite, coverage, size, and cheap performance numbers
  rung: 0
  surface: code
  done: "work/baseline/*.txt exist, each naming the command that produced it and the revision it ran against"
- id: T02
  kind: task
  phase: 1
  title: Declare the lens list the audit will run
  rung: 1
  needs: [T01]
  done: "work/lenses.yaml names each audit lens and the finding class it is responsible for — nothing else; this file is the blindspot agent's only input"
- id: F1                        # phase 2 — the audit
  kind: fanout
  phase: 2
  title: Audit — one child node per lens, independent contexts
  rung: 2
  needs: [T02]
  adversarial: standard
  personas: [behavior-preservation, leverage-vs-risk]
  done: "work/findings/<lens>.yaml per lens: each finding has a ≤20-word quote, file:line, proposed P0–P3, and at most one red flag"
- id: T10                       # phase 2 — the blindspot pass. needs T02 ONLY.
  kind: task
  phase: 2
  title: Hunt what the lens list structurally cannot see
  rung: 4
  needs: [T02]
  personas: [blindspot]
  done: "work/blindspot.yaml covers all three obligations — uncovered failure classes, the module as its callers and operators meet it, shared assumptions — and every class carries either a cited finding or 'probed X via Y, found nothing'; every row tagged blindspot: true"
- id: B1                        # phase 3 — rank once, across both sources
  kind: barrier
  phase: 3
  title: Rank every candidate by leverage against risk and effort; propose the cut line
  rung: 3
  needs: [F1, T10]
  personas: [leverage-vs-risk, scope-creep]
  done: "plan/improvements.yaml ranks every candidate with leverage, risk, effort, the files it may touch, and above|below the proposed cut line"
- id: L1                        # phase 4 — execute
  kind: loop
  phase: 4
  body: [T20, T21, T22]
  invariant: "the baseline reference reproduces at the end of every iteration, and no diff touches a file outside its candidate's declared file list"
  ledger: _orch/loops/L1/seen.yaml
  stop:
    dry_rounds: 2
    max_iterations: 5
    max_rungs: 35
  on_stop: T30
- id: T20
  kind: task
  phase: 4
  title: Land one accepted improvement atomically, with its tests
  rung: 1
  done: "the diff touches only the candidate's declared files; the suite is green; no observable behavior changed without an approved flag cited in the digest"
- id: T21
  kind: task
  phase: 4
  title: Refute the improvement — behavior preservation and the claimed gain
  rung: 1
  needs: [T20]
  refutes: T20
  personas: [behavior-preservation]
  done: "verify/T20-verdict.json cites the baseline file it reproduced and a before/after artifact for the claimed gain; an assertion without an artifact is REFUTED"
- id: T22
  kind: task
  phase: 4
  title: Re-audit the changed surface with a fresh blindspot agent
  rung: 2
  needs: [T21]
  personas: [blindspot]
  done: "new candidates appended to plan/improvements.yaml with their ledger keys; a candidate already in seen.yaml is not re-proposed"
- id: T30                       # phase 5
  kind: gate
  phase: 5
  title: Close — the module is measurably better, with proof
  rung: 1
  needs: [L1]
  adversarial: panel
  personas: [behavior-preservation, blindspot, leverage-vs-risk, scope-creep]
  done: "every executed candidate has a CONFIRMED verdict and a before/after artifact; every below-line candidate is logged, not built"
```

The planner may vary the lens split in `F1`, the number of execution rounds, and
whether ranking runs once or once per round. It may not create any `needs` or
`informs` edge from `F1` — or from any node carrying audit findings — into `T10`.
That missing edge is the entire mechanism: a blindspot agent that has read the
findings hunts the same ground and returns a longer version of the audit. It may
not merge `T20` and `T21`, may not let `B1` run before both sources have
finished, and may not stop the loop on an empty candidate list.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| baseline capture, re-running the reference commands | 0 | one command, one file |
| lens declaration, landing an accepted candidate, before/after verification | 1 | the default; the candidate row is the clear spec rung 1 is defined against |
| audit lens (`F1`), re-audit (`T22`) | 2 | AUDIT duty is rung 2 by personas/CONTRACT §2.1 — set by the persona contract, not by this mode |
| ranking (`B1`) | 3 | deciding leverage against risk across two independently produced candidate sets is contested judgment, and the cut line is the most expensive decision in the run |
| blindspot (`T10`) | 4 | it reasons about the complement of a lens set across the module, its call sites, and its operational surface — the one cross-cutting node in this mode |

`T10` is the only node in IMPROVE that enters above rung 3, and §1.3 binds it
hardest: it diagnoses, it never types. Every probe it wants run and every fix it
implies leaves as a rung-1 handback.

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `behavior-preservation` | expert | AUDIT, VERIFY | whether the observable contract survived; the difference between reproducing the baseline and asserting it |
| `blindspot` | expert | AUDIT | the failure classes the lens list cannot catch; the module as callers and operators meet it; assumptions code, tests, and lenses share |
| `leverage-vs-risk` | expert | PLAN, AUDIT, CLASH | whether a candidate's payoff justifies touching working code; the cut line itself |
| `scope-creep` | expert | PLAN, VERIFY | diffs wider than their candidate; refactors that arrived as passengers |

Casting upgrades (personas/CONTRACT §4.2) prefer tags
`refactoring`/`maintainability` for `behavior-preservation`,
`architecture`/`product` for `leverage-vs-risk`, `discipline`/`process` for
`scope-creep`. `blindspot` is listed with no upgrade hint deliberately, and the
claim that once stood here — that it is the seat where a foreign roster pays for
itself, because an upgrade with a genuinely different domain sees a different
complement — is withdrawn. That seat audits the panel rather than the artifact:
it receives the roster's lens list and never its findings, so an upgrade that
brings a different domain does not widen what the panel can see, it spends the
seat that exists to name what a panel of specialists structurally cannot see on
one more specialist.

## Gates

**Plan gate.** Checks that `T01` precedes every audit node, that `T10` has no
edge carrying findings, that `plan/improvements.yaml` will carry a declared file
list per candidate, and that `L1` stops on dry rounds rather than an empty list.
`leverage-vs-risk` and `scope-creep` run their PLAN duties here.

**Phase gate.** Phase 2 closes when every lens in `work/lenses.yaml` has a
findings file and `work/blindspot.yaml` accounts for all three obligations.
Phase 3 closes when the cut line is set. Phase 4 closes when `L1` exits.

**Blocked batch.** Two blocks are characteristic. The cut line goes to the
operator with the ranked list — the run proposes, the operator draws it. Any
candidate that cannot be executed without changing observable behavior blocks for
an approved flag; it is never executed on the argument that the old behavior was
wrong.

**Final gate.** Synthesis reports what changed, what it bought with before/after
numbers, what was logged below the line, and the rung histogram. Below-line
candidates ship as a backlog a later run can execute directly.

## Done

`_orch/loops/L1/seen.yaml` records two consecutive iterations in which no
admitted candidate ranked above the cut line. Every candidate marked executed in
`plan/improvements.yaml` has a `CONFIRMED` verdict citing both a reproduced
baseline file and a before/after artifact. No diff in the run touches a file
absent from its candidate's declared list. Every below-line candidate is present
in the report and absent from the tree.

## Failure modes of this mode

- **Blindspot contamination.** Someone helpfully passes the audit digests to the
  blindspot agent "for context" and it returns the audit with better prose. The
  missing edge is the mechanism, the plan gate rejects any path from `F1` into
  `T10`, and `work/lenses.yaml` is deliberately a list of lens names with no
  findings in it so there is nothing to leak.
- **The blindspot pass reports absence as coverage.** "No concurrency issues
  found" is not a finding, it is a mood. Every uncovered class must yield either
  a citation or the sentence *probed X via Y, found nothing* — the second is a
  real deliverable and the run's evidence rules make it inadmissible without the
  probe named.
- **Improvement by assertion.** The digest says the function is now faster and
  cites the diff. `T21` refutes on that alone: preservation is a reproduced
  baseline file and a gain is a before/after artifact, and `T21` is a separate
  node so the agent that made the improvement is not the one grading it.
- **The passenger refactor.** A candidate touching one file arrives with a
  rename across nine. The candidate row declares its files, `L1`'s invariant
  makes the wider diff a loop violation rather than a code-review opinion, and
  `scope-creep` sits at VERIFY where it can still stop it.
- **The loop that re-audits forever.** Each round the re-audit rediscovers the
  candidates the cut line already rejected, and dry rounds never arrive. Ledger
  keys are file + symbol + claim shape and record rejections, so a rejected
  candidate is recognized rather than re-ranked — and `max_rungs` exists because
  a re-audit is the most expensive thing this mode does per round.
