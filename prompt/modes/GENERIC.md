# MODE: GENERIC

> Run an operator-written directive to the same standard as a built-in one — decomposed, verified, converged.
> This mode refuses a directive with no objective completion condition; it establishes one by asking before it plans anything else.

## Directive

The OPERATOR NOTES block is the directive, verbatim, and {TARGET} is whatever it
names. The prime copies it into `_orch/directive.md` unedited and adds nothing.
The planner holds it to the standard every built-in directive meets: an
imperative statement of the work plus a completion condition a verifier can check
without judgment. If the notes carry none — or carry one whose evaluation is an
opinion, *when it is good enough*, *until it works well* — the planner's **first**
blocked question, written before any other node exists, proposes two or three
candidate conditions in the operator's own terms and asks which binds. The answer
is appended under `COMPLETION:` and becomes the `done:` of the final gate.
Planning past an unanswered completion question is the one thing GENERIC never
does.

## Graph skeleton

```yaml
- id: T00
  kind: task
  phase: 1
  title: Establish the completion condition and the evidence that would prove it
  rung: 3
  done: "_orch/directive.md carries a COMPLETION: line — quoted from the notes or answered from the inbox — plus the artifact paths that would demonstrate it"
- id: F1
  kind: fanout
  phase: 2
  title: Execute — one child per decomposed unit of the directive
  rung: 1
  needs: [T00]
  done: "each child's done-criterion cites the clause of the directive it satisfies"
- id: V1
  kind: fanout
  phase: 2
  title: Refute each claimed result at its own rung
  rung: 1
  needs: [F1]
  refutes: F1
  done: "verify/<node>-verdict.json names the strongest attack tried and why it failed"
- id: L1
  kind: loop
  phase: 2
  body: [F1, V1]
  invariant: "the check named in COMPLETION: runs clean at the end of every iteration"
  ledger: _orch/loops/L1/seen.yaml
  stop: { dry_rounds: 2, max_iterations: 5, max_rungs: 30 }
  on_stop: T30
- id: T30
  kind: gate
  phase: 3
  title: Close against the COMPLETION line
  rung: 1
  needs: [L1]
  adversarial: standard
  done: "the COMPLETION: condition is demonstrated by the artifact paths T00 named"
```

Shaping an arbitrary directive, in order: find the completion condition or ask
for it; make the artifacts that prove it the final gate's `done:`; record a
rung-0 baseline of whatever the directive changes, because preservation is
undecidable without one; split at the directive's own conjunctions — each *and*
is usually a node, each *until* a loop; fix the surface (`code` | `ui` | `doc` |
`data`), which selects the seats; rewrite any `done:` needing judgment; add one
`refutes` node per producer, never authored by the producer; give the loop a
content-derived ledger key. A directive with nothing to converge on gets no loop
node — a one-pass graph is a legitimate GENERIC plan.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| baselines, command runs, collection | 0 | one command, one file |
| execution, authoring, verification of a specified claim | 1 | the default, and where an unfamiliar directive starts — an unknown is not a reason to spend |
| directive interpretation (`T00`) | 3 | deciding what an English sentence obliges is contract ambiguity, and every node below inherits that reading |

`T00` is the only node above rung 1, and only when it must: notes that already
carry a completion condition, named artifacts, and a surface make it a rung-1 node.

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `feasibility` | expert | PLAN | whether this graph is executable at these rungs at all |
| `dependency-order` | expert | PLAN | edges that should be `needs` and are not; work ordered by narrative |
| `rung-fit` | expert | PLAN | rungs assigned by vibe, in either direction |
| `scope-creep` | expert | PLAN, VERIFY | nodes doing work the directive does not ask for |

Those four seat on every GENERIC run: they judge the plan rather than the domain,
and a plan that never had a shape is this mode's characteristic failure. Add two
or three by surface and no more (personas/CONTRACT §4.1) — code →
`coverage-truth`, `behavior-preservation`, `call-site-truth`; a written source →
`spec-fidelity`, `requirement-gaps`; a running interface → `journey-honesty` plus
at least one `kind: user`, since a UI directive seated only with experts has
described the product instead of using it; a document or plan → `equivalence`,
`severity-inflation`. An unclear surface means `T00` is unfinished — ask rather
than seat everything. Casting upgrades prefer tags matching the surface, never
tags matching the directive's vocabulary.

## Gates

All four of CONTRACT §8 fire unchanged. The **plan gate** carries the extra
weight: it refuses a graph whose final `done:` is not the `COMPLETION:` line, any
`done:` needing judgment, and any loop missing a §5.3 field. The **blocked
batch** opens with the completion question when one was needed. The **final
gate** demonstrates the completion condition against `T00`'s artifacts and names
every directive clause no node claimed.

## Done

`_orch/directive.md` carries a `COMPLETION:` line. `T30` returns `DONE` citing
the artifact paths `T00` named. Every clause of the directive maps to at least
one node id in `plan/graph.yaml`, and every node maps back to a clause.

## Failure modes of this mode

- **The run invents its own finish line.** The notes were vague, the planner
  picked something reasonable, and the run stopped where nobody asked. `T00`
  blocks instead; the plan gate rejects a final `done:` with no `COMPLETION:`
  behind it.
- **The graph is the directive's sentences in order.** Prose ordering becomes
  `needs` edges, serializing independent work and parallelizing dependent work.
  `dependency-order` at PLAN exists for exactly this.
- **Everything enters at rung 3 because the work is unfamiliar.** Unfamiliar to
  the planner is not above rung 1; §1.1's asymmetry does not weaken because a
  directive is novel. `rung-fit` refutes at PLAN, rung drift (§1.5) corrects what
  the gate missed.
- **A clause quietly goes unbuilt.** With no traceability matrix there is no
  structural memory of what was asked. The substitute is the two-way mapping
  checked at the final gate — clause to node, node to clause, unmatched clauses
  named in the report.
