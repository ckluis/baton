# MODE: TEST

> Attack {TARGET} with tests it was not written to survive, delete the tests that never earned their keep, and fix every failure that surfaces until two consecutive rounds find nothing new.
> This mode refuses to make a suite green by weakening it — no loosened assertion, no widened tolerance, no retry-until-green wrapper, no test rewritten to match a bug.

## Directive

Run a comprehensive adversarial unit test sweep on {TARGET} that deliberately
targets edge cases, malformed inputs, race conditions, boundary values, resource
exhaustion, state corruption, and invalid assumptions; map every existing test to
the behavior it claims to pin before writing a single new one; ensure every test
earns its place by being necessary, non-duplicative, and validating meaningful
behavior — each added test states in a comment the behavior it pins and why that
behavior is not covered elsewhere, and a test that cannot justify itself does not
land; remove or consolidate weak, tautological, and redundant tests without
regressing coverage against the recorded baseline; derive every expected result
from the module's contract — signatures, documentation, call sites — never from
observing what the code currently returns; root-cause every failure in writing
before a fix is typed; land with each fix a permanent regression test that fails
against the pre-fix code; and treat a flaky test as a bug in the code under test,
never as noise to be retried away. Complete when two consecutive convergence
iterations admit no new failing behavior and no new admissible attack, the suite
runs green with zero skipped tests, zero expected-failure markers lacking a filed
question, and zero unexplained failures, and coverage of {TARGET} is at or above
the baseline recorded in phase 1.

## Graph skeleton

`handoff:` paths follow CONTRACT §6 and are elided.

```yaml
- id: T01                       # phase 1 — ground truth
  kind: task
  phase: 1
  title: Record the baseline — suite result and coverage, to files
  rung: 0
  surface: code
  done: "work/baseline/{results,coverage}.txt exist, each naming the command that produced it"
- id: T03
  kind: task
  phase: 1
  title: Map every test to the behavior it pins; flag the weak, duplicate, tautological
  rung: 3
  needs: [T01]
  personas: [suite-economics, coverage-truth]
  done: "work/suite-map.yaml covers every test once; work/flagged.yaml gives each flag a ≤20-word quote, a location, and one of redundant-with <id> | tautological | asserts-implementation"
- id: T04                       # phase 2 — adversarial generation
  kind: task
  phase: 2
  title: Design the attack set from the contract surface, not from observed output
  rung: 2
  needs: [T01]
  informs: [T03]
  done: "work/attacks.yaml rows carry target symbol, failure class, input, expected result, and the contract citation the expectation came from"
- id: F1
  kind: fanout
  phase: 2
  title: Write the attack tests — one child node per target module
  rung: 1
  needs: [T04]
  done: "every attacks.yaml row is a landed test whose comment names the behavior it pins and why it is not covered elsewhere"
- id: B1
  kind: barrier
  phase: 2
  title: Consolidate — apply flagged removals and merges across all producers at once
  rung: 1
  needs: [F1, T03]
  done: "every flagged.yaml entry is removed, merged, or kept with a written reason; suite-map.yaml regenerated"
- id: V1
  kind: task
  phase: 2
  title: Refute the consolidation — prove no behavior lost its only pin
  rung: 1
  needs: [B1]
  refutes: B1
  done: "verify/B1-verdict.json cites the baseline coverage file and re-runs every test that is now a behavior's sole pin"
- id: L1                        # phase 3 — fix loop
  kind: loop
  phase: 3
  body: [T11, T12, T13]
  invariant: "the suite is green at the end of every iteration, and every fix landed this iteration has a regression test that fails against the pre-fix code"
  ledger: _orch/loops/L1/seen.yaml
  stop:
    dry_rounds: 2
    max_iterations: 6
    max_rungs: 40
  on_stop: T20
- id: T11
  kind: task
  phase: 3
  title: Harvest failures at rung 0, then root-cause each admitted one in writing
  rung: 3
  done: "work/failures.yaml keys each failure by file + test id + assertion shape; work/root-causes.md names the defective symbol and mechanism per failure and emits a rung-1 handback per CONTRACT §1.3"
- id: T12
  kind: task
  phase: 3
  title: Apply the diagnosed fix
  rung: 1
  needs: [T11]
  done: "the diff touches only symbols named in root-causes.md and modifies no test file"
- id: T13
  kind: task
  phase: 3
  title: Land the regression test for each fix
  rung: 1
  needs: [T11]
  personas: [regression-integrity]
  done: "each new test fails against the pre-fix revision and passes after; both runs cited in the digest"
- id: T20                       # phase 4 — earns its place
  kind: gate
  phase: 4
  title: Every test added or kept this run justifies itself
  rung: 1
  needs: [L1]
  adversarial: panel
  personas: [coverage-truth, adversarial-input, suite-economics, regression-integrity]
  done: "no test lacks a pinned behavior in suite-map.yaml, and no two tests claim the same behavior without a written reason"
```

The planner may vary `F1`'s width and module partition, the failure classes `T04`
enumerates, and may merge phases 1 and 2 when {TARGET} is a single file. It may
not drop `T01` — a sweep with no recorded baseline cannot prove it did not
regress coverage. It may not give `T12` an edge that lets it edit tests, may not
place a test-authoring node downstream of a fix node, and may not replace `L1`
with a fixed number of fix rounds.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| baseline, suite runs, coverage collection, failure harvest | 0 | one command, one file; assignment only — `T11` spawns its harvest here rather than reading at rung 3 |
| test authoring, consolidation, regression tests, refutation of a diagnosed claim | 1 | the default — bounded work against an approved attack row or flag row |
| attack design (`T04`) | 2 | enumerating failure classes a module has never been shown is where more thinking pays and a bigger model does not |
| suite audit (`T03`) | 3 | necessary-vs-redundant is the named rung-3 judgment; a rung-1 agent deletes what it does not understand |
| root cause (`T11`) | 3 | the named rung-3 diagnosis, and §1.3 forces the typing back down to `T12` |

Nothing in TEST enters at rung 4. A contested call about the same test reaches
the adjudication rung through §1.2 trigger 4, never by assignment.

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `coverage-truth` | expert | AUDIT, VERIFY | whether tests validate meaningful behavior or merely execute lines; attacks the coverage number itself |
| `adversarial-input` | expert | PLAN, AUDIT | which malformed, boundary, race, exhaustion, or state-corruption class is still unattacked |
| `suite-economics` | expert | AUDIT | redundancy, brittleness, runtime — the suite as an asset with a carrying cost |
| `regression-integrity` | expert | AUDIT, VERIFY | whether every bug fixed in `L1` has a test that fails against the pre-fix code |

Casting upgrades (personas/CONTRACT §4.2) prefer tags `testing`/`quality` for
`coverage-truth`, `security`/`fuzzing` for `adversarial-input`,
`refactoring`/`maintainability` for `suite-economics`,
`regression`/`reliability` for `regression-integrity`.

## Gates

**Plan gate.** Checks `L1` against §5.3, that its ledger key is file + test id +
assertion shape rather than a round number, that `T01` precedes every node that
deletes a test, and that no test-authoring node sits downstream of a fix node.
`adversarial-input` runs its PLAN duty here. Passes with zero P0/P1 standing.

**Phase gate.** Phase 1 closes when every test is accounted for in
`suite-map.yaml`. Phase 2 closes when `V1` returns `CONFIRMED` against the
baseline coverage file. Phase 3 closes when `L1` exits by any of its three stops.

**Blocked batch.** The characteristic TEST block: an attack whose expected result
is undecidable from the contract — the test may be wrong or the code may be, and
nobody inside the run can tell. Those park and batch while the loop keeps
running. An unavoidable coverage regression blocks; it never passes as a caveat.

**Final gate.** Synthesis over digests, verdicts, ledger, rung histogram. `T20`
is its evidence.

## Done

The suite command exits zero. The final harvest reports zero skipped tests and
zero expected-failure markers lacking an inbox question. Final coverage ≥
`work/baseline/coverage.txt`. `_orch/loops/L1/seen.yaml` records two consecutive
iterations admitting nothing new. Every test id in the final `suite-map.yaml`
carries exactly one claimed behavior, and every `L1` regression test cites a
failing pre-fix run.

## Failure modes of this mode

- **The sweep pins the bug.** An author reads the code, records what it returns,
  and calls that the expectation — the suite now defends the defect. `T04` must
  cite a contract source for every expectation, and `coverage-truth` at VERIFY
  refutes any test whose expected value exists only in the implementation.
- **The loop converges on the suite instead of the code.** The cheapest way to
  clear a failure is to edit the test. `T12` may not touch test files, and fix
  and regression test are separate nodes: the agent that wants the failure gone
  is not the agent that decides what the test asserts.
- **Flake laundering.** A race acquires a sleep, a retry, or a tolerance and
  leaves the failure list undiagnosed. The ledger key includes the assertion
  shape, so a flake returning two rounds later is recognized rather than
  rediscovered, and `T12` has nothing to apply until `T11` names a mechanism.
- **Consolidation eats real coverage.** Two tests look redundant because their
  names are similar and their reasons are not. `V1` refutes `B1` against the
  baseline; a deletion whose behavior no longer appears in the regenerated
  `suite-map.yaml` is `REFUTED` on that fact alone.
- **Non-convergence by re-proposal.** An attack rejected in round one is a fresh
  idea in round two and the loop never runs dry. The ledger records rejections,
  not only admissions.
