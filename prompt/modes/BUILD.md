# MODE: BUILD

> Implement the spec at {TARGET} completely, with every requirement traced to the node that satisfies it and the evidence that proves it.
> This mode refuses to guess: a spec ambiguity that changes the design becomes an operator question before any code is written, never a decision the run makes quietly and documents afterward.

## Directive

Implement {TARGET} completely and faithfully: treat every stated requirement as a
contract and build the traceability matrix before writing any code, one row per
requirement mapping it to the node or nodes that satisfy it and the method that
will verify it; surface every ambiguity, contradiction, and unstated assumption
as an operator question rather than a guess, batched once before the build
starts, and record a documented default only for ambiguities that cannot change
the design; decompose into phases whose done-criteria cite the spec sections they
satisfy; write tests from the spec's required behavior, never reverse-engineered
from the implementation, and never authored by the agent that wrote the code
under test; verify each requirement against the matrix rather than against the
task that produced it, with concrete evidence at a cited path; document every
deviation from the spec with the approval that permits it. Complete when every
row in the traceability matrix carries a `CONFIRMED` verification, no
requirement is in a built-but-unverified state, no requirement was satisfied by
reinterpretation without an approval trail, and the spec contains no normative
statement absent from the matrix.

## Graph skeleton

`handoff:` paths follow CONTRACT §6 and are elided.

```yaml
- id: T01                       # phase 1 — read the spec, then stop
  kind: task
  phase: 1
  title: Extract every normative statement in the spec into the traceability matrix
  rung: 1
  surface: doc
  done: "plan/traceability.yaml has one row per normative spec statement: id, ≤20-word quote, spec location, nodes [], verification method — no row spans two statements"
- id: T02
  kind: task
  phase: 1
  title: Hunt ambiguities, contradictions, and unstated assumptions
  rung: 3
  needs: [T01]
  personas: [requirement-gaps, spec-fidelity]
  done: "plan/spec-questions.md classifies every question material | cosmetic, cites the requirement ids it affects, and states the default it would take unanswered"
- id: G1                        # the AMBIGUITY GATE
  kind: gate
  phase: 1
  title: Ambiguity gate — no build node is runnable until this closes
  rung: 1
  needs: [T01, T02]
  done: "every material question has an _orch/inbox/Q-*.answer.md; every cosmetic question has a default recorded in plan/decisions.md with the requirement ids it binds"
- id: T10                       # phase 2 — tests from the spec
  kind: fanout
  phase: 2
  title: Author the acceptance tests from the spec text, one child per requirement cluster
  rung: 1
  needs: [G1]
  personas: [test-honesty]
  done: "every matrix row with a test-based verification method has a test citing its requirement id and quoting the spec line it pins; every test fails against the unbuilt tree"
- id: F1                        # phase 2 — implementation
  kind: fanout
  phase: 2
  title: Implement, one child node per requirement cluster
  rung: 1
  needs: [G1]
  informs: [B1]
  done: "each child's diff cites the requirement ids it satisfies; traceability.yaml nodes[] filled for those rows"
- id: B1
  kind: barrier
  phase: 3
  title: Integrate — wire the clusters, resolve cross-cluster contracts once
  rung: 2
  needs: [T10, F1]
  personas: [integration-risk]
  done: "the acceptance tests from T10 run against the integrated tree with a recorded result per requirement id"
- id: V1
  kind: fanout
  phase: 3
  title: Verify each requirement against the matrix, not against the node that built it
  rung: 1
  needs: [B1]
  refutes: F1
  done: "verify/<req-id>-verdict.json per row: CONFIRMED | REFUTED | PARTIAL, evidence paths, and the strongest attack tried"
- id: T20
  kind: gate
  phase: 3
  title: Coverage-of-spec — walk the matrix end to end
  rung: 2
  needs: [V1]
  personas: [spec-fidelity, requirement-gaps]
  done: "work/coverage-of-spec.md lists every row with no CONFIRMED path and assigns each a P0 or P1; deviations listed with their approval trail"
- id: L1                        # phase 4 — close the gaps
  kind: loop
  phase: 4
  body: [T30, T31]
  invariant: "no requirement is left in a built-but-unverified state at the end of an iteration"
  ledger: _orch/loops/L1/seen.yaml
  stop:
    dry_rounds: 2
    max_iterations: 4
    max_rungs: 30
  on_stop: T20
- id: T30
  kind: task
  phase: 4
  title: Close one gap from coverage-of-spec.md
  rung: 1
  done: "the diff cites the requirement id; the test that closes it was authored from the spec quote, not from the new code"
- id: T31
  kind: task
  phase: 4
  title: Re-verify the closed rows
  rung: 1
  needs: [T30]
  refutes: T30
  done: "verify/<req-id>-verdict.json rewritten with a fresh command run, not a cited earlier log"
```

The planner may vary the clustering of requirements, the number of build phases,
and whether `T10` and `F1` fan out over the same partition. It may not create any
`needs` or `informs` edge from an implementation node to the node that tests it —
that edge is exactly how tests become descriptions of the code. It may not make
any node in phase 2 or later runnable before `G1` closes. It may not let a
verification node be authored by the agent that produced its target (§4.1), and
it may not delete a matrix row; a row that turns out not to be a requirement is
resolved by an inbox answer, not by an edit.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| baseline commands, fixture setup, matrix regeneration from a template | 0 | one command, one file |
| requirement extraction, test authoring, implementation, gap closure, verification | 1 | the default; the spec is the clear spec that rung 1 is defined against |
| integration (`B1`), coverage-of-spec (`T20`) | 2 | both reconcile independently produced work against one document — more thinking, same model (§1.2) |
| ambiguity hunt (`T02`) | 3 | resolving what a contract does and does not say is the named rung-3 judgment, and misclassifying material as cosmetic is the one error this mode cannot recover from |

Nothing in BUILD enters at rung 4. A spec that genuinely needs rung 4 to read is
a spec that needs an operator question first.

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `spec-fidelity` | expert | PLAN, AUDIT, VERIFY | whether the build does what is written rather than what seemed sensible; every silent reinterpretation |
| `requirement-gaps` | expert | PLAN, AUDIT | normative statements absent from the matrix; rows that quietly merged two requirements |
| `test-honesty` | expert | AUDIT, VERIFY | whether a test pins spec behavior or implementation behavior; expected values with no spec origin |
| `integration-risk` | expert | AUDIT, CLASH | the seams between clusters — contracts each side satisfied differently and nobody owns |

Casting upgrades (personas/CONTRACT §4.2) prefer tags `requirements`/`architecture`
for `spec-fidelity`, `product`/`analysis` for `requirement-gaps`,
`testing`/`quality` for `test-honesty`, `systems`/`distributed`/`api` for
`integration-risk`.

## Gates

**Plan gate.** Checks that `plan/traceability.yaml` exists before any build node,
that every row cites a spec location, that no build node precedes `G1`, and that
no test node has an edge from its implementation node. `spec-fidelity` and
`requirement-gaps` run their PLAN duties here. Passes when every normative spec
statement appears in exactly one row.

**Phase gate.** Phase 1 closes only through `G1`. Phase 3 closes when every
matrix row has a verdict file — `PARTIAL` counts as having one. Phase 4 closes
when `L1` exits.

**Blocked batch.** `G1` is the mode's defining block and it is deliberate: the
run stops the build, not the whole run, and surfaces every material question at
once. A second batch is normal — integration usually exposes an ambiguity the
spec reader could not see. An unanswered material question at the final gate
becomes a **needs a human** line, never an assumption (§10).

**Final gate.** Synthesis names, per requirement, the evidence path that proves
it, plus every deviation and its approval trail, plus the rung histogram.

## Done

Every row in `plan/traceability.yaml` has a `verify/<req-id>-verdict.json`
reading `CONFIRMED`. `work/coverage-of-spec.md` from the last `T20` run lists
zero rows without a confirmed path. `plan/decisions.md` accounts for every
question `T02` classified cosmetic, and `_orch/inbox/` holds an answer file for
every one it classified material. No test file in the delivered tree was
authored by a node that also appears in a matrix row's `nodes[]` for the same
requirement.

## Failure modes of this mode

- **The matrix becomes a task list.** Three requirements collapse into one row
  because one node covers them, and the row goes green while two behaviors were
  never built. `T01`'s done-criterion forbids a row spanning two normative
  statements, and `requirement-gaps` at PLAN refutes any row whose quote contains
  more than one obligation.
- **Tests describe the code.** The fastest way to make an acceptance test pass is
  to write it after the implementation and copy its constants. The graph forbids
  the edge, `T10` must fail against the unbuilt tree, and `test-honesty` at
  VERIFY refutes any expected value with no spec origin.
- **The run answers its own ambiguity gate.** A material question has an obvious
  answer, so the planner records a default and moves on — the spec has now been
  rewritten by the implementer. `G1` closes only on an answer file for every
  material question; the plan gate treats a material question resolved without
  one as a P0.
- **A node passes while its requirement does not.** The task met its handoff
  criteria and the requirement is still `PARTIAL`. `V1` verifies against the
  matrix row rather than the handoff, which is why it carries `refutes: F1` and
  not `needs` alone.
- **Everything is built and nothing composes.** Each cluster satisfied the shared
  contract its own way. `B1` is the one justified barrier in the mode (§4.2 —
  the next stage genuinely references the other results), and
  `integration-risk` is seated at CLASH because those disputes are between two
  defensible readings, not between right and wrong.
