# MODE: MIGRATE

> MIGRATE mechanically transforms a large set of call sites, files, or configs across
> {TARGET} to a new form, one site at a time, each transform verified for equivalence
> before it is integrated. It does not redesign anything — a better idea found mid-run
> becomes a backlog row, never a diff.

## Directive

Transform every site in {TARGET} from the old form to the new form and prove that
nothing else changed. Establish the behavioral baseline first — suite result, and the
observable outputs the transform must preserve — recorded to files that later nodes
compare against rather than remember. Discover the sites twice, by two methods that
fail differently: one static pass over the code, and one independent pass that finds
what static reading cannot — dynamic dispatch, reflection, string-built names,
configuration, fixtures, generated code, and documentation that will lie the moment the
old form disappears. Reconcile the two registers and resolve every disagreement to
either a site or an explicit not-a-site with a written reason; a site register that the
two passes do not agree on is not a plan, and no transform starts until it is frozen.
Then move each site through transform and verification independently, changing exactly
the form and nothing adjacent — no renames of convenience, no reformatting, no fixing
the bug you found, no upgrading the thing next to it. Verify each transformed site
against the baseline for behavioral equivalence, including its error paths and its
edge cases, and re-run commands rather than trusting the transform's own account of
itself. Integrate only what verified, in one pass, with the full suite green. Done when
every entry in the frozen register is transformed and CONFIRMED or is carried in the
report as an explicit exception with its reason, no occurrence of the old form remains
outside that exception list, the baseline comparison shows no behavioral difference, and
the suite is green.

## Graph skeleton

```yaml
- id: T00
  kind: task
  phase: 1
  title: Record the behavioral baseline
  rung: 0
  surface: code
  handoff: _orch/nodes/T00/handoff.md
  done: "baseline/ holds suite output, coverage, and the observable outputs the transform must preserve"
- id: D1
  kind: task
  phase: 1
  title: "Discovery pass A — static: grep, AST, type checker, call graph"
  rung: 2
  needs: []
  done: "register-a.yaml lists every candidate site with path, line, and the exact old-form text"
- id: D2
  kind: task
  phase: 1
  title: "Discovery pass B — non-static: runtime traces, config, fixtures, generated code, docs, strings"
  rung: 2
  needs: []
  informs: []                         # deliberately empty — must not see register-a
  done: "register-b.yaml lists every candidate site found by a method that does not read the same text D1 read"
- id: B1
  kind: barrier                       # reconciliation needs both registers whole
  phase: 1
  rung: 1
  needs: [D1, D2]
  done: "both registers exist and each names the method that produced it"
- id: D3
  kind: task
  phase: 1
  title: Reconcile the registers and freeze the site list
  rung: 3
  needs: [B1]
  done: "register.yaml — every entry appears in A, in B, or carries a written reason it is a site or is not"
- id: G1
  kind: gate
  phase: 1
  title: Register freeze — no transform starts against an unfrozen list
  rung: 1
  needs: [D3, T00]
  done: "register.yaml is marked frozen and its entry count is recorded in manifest.json"
- id: F1
  kind: fanout                        # one child per site batch, batch size from D3
  phase: 2
  rung: 1
  needs: [G1]
  done: "one X-<batch> node per batch; no two batches name the same file"
- id: X-b01
  kind: task
  phase: 2
  title: "Transform batch 01 to the new form"
  rung: 1
  surface: code
  needs: [F1]
  done: "every site in batch 01 is in the new form; the diff touches no line outside a registered site"
- id: Y-b01
  kind: task
  phase: 2
  title: "Verify batch 01 against the baseline"
  rung: 1
  needs: [X-b01]
  refutes: X-b01
  personas: [equivalence]
  done: "verdict.json CONFIRMED/REFUTED/PARTIAL, naming the strongest inequivalence probe tried and why it failed"
- id: L1
  kind: loop
  phase: 2
  body: [F1, X-b01, Y-b01]
  invariant: "the suite is green against the integrated set at the end of every iteration"
  ledger: _orch/loops/L1/seen.yaml     # key: file + symbol + old-form text
  stop:
    dry_rounds: 2
    max_iterations: 6
    max_rungs: 60
  on_stop: B2
- id: B2
  kind: barrier                       # integration needs every verified batch at once
  phase: 3
  rung: 1
  needs: [L1]
  done: "every register entry is CONFIRMED, REFUTED-and-reverted, or carried as a written exception"
- id: A-call-site-truth
  kind: task
  phase: 3
  title: "AUDIT — did discovery actually find every site"
  rung: 2
  needs: [B2]
  refutes: D3
  adversarial: panel
  personas: [call-site-truth]
  done: "an independent sweep for the old form returns only the written exceptions, each quoted with its path"
- id: I1
  kind: task
  phase: 3
  title: Integrate the verified batches and run the full suite
  rung: 2
  surface: code
  needs: [B2, A-call-site-truth]
  done: "one integrated tree, suite green, baseline comparison shows no behavioral difference"
```

The planner sets batch size, adds discovery methods, and may split `I1` when
integration order matters. It may **not** give `D2` an `informs` edge from `D1`, start a
transform before `G1` freezes the register, let a transform node author its own
verification, or widen a batch to include a site the register does not name.

The transform nodes are rung 1 and shaped for wide parallelism, and CONTRACT §4.3 caps
concurrency at 2. That tension is real and the cap wins. The answer is pipeline
discipline, not a wider fan: batch 01 verifies while batch 02 transforms, so wall-clock
is the slowest single chain rather than the sum of the stages, and a session limit
landing mid-run strands one batch instead of thirty. The phase runner spawns each
transform with `isolation: worktree` whenever two batches could touch the same file —
worktrees are what make two concurrent transforms safe, and the batching rule that no
two batches name the same file is what keeps the number of worktrees at two.

### Sites discovery is the whole risk

A migration that misses three percent of its sites is worse than one never started. The
run ends with a codebase in two forms, a search-and-replace that now looks finished, and
a residue that surfaces months later in the paths nobody exercises. Every other risk in
this mode is recoverable; this one is not, because nothing downstream is looking for it.

So discovery is the only stage that runs twice, by two methods chosen to fail
differently, in contexts that cannot see each other. `D1` reads the code. `D2` is
forbidden to: it must find sites through execution traces, configuration, fixtures,
generated output, serialized data, documentation, or anything else that names the old
form without spelling it the way the source does. Agreement between them is evidence
because disagreement was possible. Every delta is adjudicated at rung 3 into a site or a
written not-a-site, and `A-call-site-truth` re-runs the sweep after integration against
the frozen register — if it finds an occurrence that is not on the exception list, `D3`
is refuted and the register reopens.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| baseline (`T00`) | 0 | Run the suite, record numbers to files. Verifiable by command. |
| transform (`X-*`), verify (`Y-*`), fanout, barrier, gate | 1 | The default. A transform against a frozen register and an explicit new form is bounded implementation; a verifier comparing to a recorded baseline is bounded checking. This is where nearly every node in the mode lives. |
| discovery (`D1`, `D2`), audit seats, integrate (`I1`) | 2 | Discovery is search under an adversarial assumption that the obvious method is incomplete. Integration resolves overlapping diffs across worktrees. Audit seats are rung 2 per personas/CONTRACT.md §2.1. |
| reconcile (`D3`) | 3 | The only judgment call in the mode, and the one that cannot be undone later: deciding what is and is not a site. Everything downstream inherits it. |

Nothing enters above 3. A `REFUTED` transform costs one rung (CONTRACT §1.2) and the
retry is cheap — that asymmetry is why transforms start at 1 and stay there.

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `equivalence` | expert | VERIFY, CLASH | Whether the new form does exactly what the old one did — return values, error paths, ordering, timing, side effects, and the edge cases the suite does not cover. |
| `call-site-truth` | expert | AUDIT, CLASH | Whether discovery found every site, including the ones grep cannot see: dynamic dispatch, reflection, string-built names, config, fixtures, generated code, docs. |
| `integration-risk` | expert | AUDIT | What breaks when the batches land together — import cycles, ordering, partially migrated interfaces, downstream consumers, deploy sequencing. |
| `scope-creep` | expert | VERIFY | Whether any diff touches a line the register does not name. Every improvement smuggled into a transform is a behavior change nobody reviewed. |

Casting prefers named experts tagged `refactoring`/`semantics`/`consistency` for
`equivalence`, `static-analysis`/`tooling` for `call-site-truth`,
`distributed`/`release-engineering`/`observability`/`resilience`/`api-design`
for `integration-risk`, and `discipline`/`code-review` for `scope-creep`.

## Gates

- **Plan gate.** Passes when discovery runs twice by named different methods, no
  transform node precedes `G1`, no transform authors its own verification, `L1` carries
  all four fields CONTRACT §5.3 requires, and batches do not share files.
- **Register freeze** (`G1`). Passes when every delta between the two registers is
  resolved in writing and the frozen entry count is in `manifest.json`. An unresolved
  delta is `BLOCKED`, not a default.
- **Phase gate.** Phase 2 passes when every batch is CONFIRMED or reverted; a `REFUTED`
  batch is reverted and re-entered at one rung up, never patched forward.
- **Blocked batch.** Sites the run cannot transform without a product decision — an API
  with no equivalent, a config the run cannot reach — batch together at the phase gate.
- **Final gate.** Passes when the post-integration sweep finds only the written
  exceptions and the baseline comparison shows no behavioral difference.

## Done

`register.yaml` is frozen; every entry is CONFIRMED, or reverted, or listed in the
report's exception table with a reason; an independent sweep for the old form returns
only those exceptions; the baseline comparison in `final/report.md` shows no behavioral
difference; the suite is green on the integrated tree; and no diff in the run touches a
file the register does not name.

## Failure modes of this mode

- **The 97% migration.** Discovery finds what grep finds, the run reports success, and
  the remaining sites surface as production failures months later. `D2` exists only to
  fail differently from `D1`, and `A-call-site-truth` re-sweeps after integration with a
  `refutes` edge back to `D3` — a stray occurrence reopens the register rather than
  closing the run.
- **The helpful transform.** An agent holding one file in context fixes a bug, renames a
  variable, and reformats — all improvements, none reviewed, all now indistinguishable
  from the migration in the diff. `scope-creep` verifies that every changed line maps to
  a registered site, and the batch's `done` criterion is written to be checkable by diff
  rather than by judgment.
- **Equivalence assumed from a green suite.** The suite passes because it never covered
  the error path the old form handled differently. `equivalence` is a VERIFY seat that
  probes error paths and edge cases against the recorded baseline and must name the
  strongest inequivalence probe it tried (CONTRACT §9).
- **The wide fan that strands.** Thirty transforms launch, a session limit lands, and
  twenty-eight half-finished worktrees cost a re-spawn each. Concurrency stays at 2 and
  the stages pipeline; resume is free because every batch's state is its own
  `status.json`.
- **The register that drifts.** A transform discovers a site the register missed and
  quietly adds it, so the frozen count no longer describes the run. New sites go into
  `L1`'s ledger and are admitted as new batches on the next iteration — which is what
  makes the loop's dry rounds meaningful rather than decorative.
