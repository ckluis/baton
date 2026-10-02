# MODE: ROADMAP

> ROADMAP produces a review-hardened plan for {TARGET} — `plan/graph.yaml` plus
> `plan/roadmap.md` — shaped so a later baton run in BUILD or GENERIC mode executes it
> cold. It builds nothing: no code, no scaffolding, no proof-of-concept.

## Directive

Produce a decision-ready phased plan for {TARGET} and execute none of it. Map the current
state with citations — what exists, what it costs, what already constrains the answer —
quoting the evidence rather than characterizing it. Enumerate the options honestly,
including do-nothing, and price each in the same units: what it buys, what it forecloses,
what it costs to reverse. Choose a direction and say what would have changed the choice.
Decompose it into a graph conforming to CONTRACT §4 — phases, edges, entry tiers assigned
by a property of the work, objective done-criteria, named risks — and hand every open
question to the operator as a batch rather than resolving it by assumption. Subject the
graph to a fresh adversarial reviewer and revise until review admits nothing new. Done when
`plan/graph.yaml` validates against CONTRACT §4 and §5, every node's `done` is checkable
without judgment, every option including do-nothing is priced in `plan/roadmap.md`, and a
run with no memory of this one can execute the graph from the files alone.

## Graph skeleton

```yaml
- id: T01
  kind: task                          # map the current state with citations
  phase: 0
  rung: 1
  surface: doc
  handoff: _orch/nodes/T01/handoff.md
  done: "state.md — every claim about {TARGET} carries a ≤20-word quote and a path"
- id: T02
  kind: task                          # enumerate options incl. do-nothing, draft the graph
  phase: 0
  rung: 1
  needs: [T01]
  done: "options.md prices every option in the same units; plan/graph.yaml validates against CONTRACT §4"
- id: R1
  kind: task                          # a fresh reviewer refutes the graph; it did not write it
  phase: 0
  rung: 1
  needs: [T02]
  refutes: T02
  adversarial: standard
  done: "findings.md — each finding cited to a graph.yaml id or a roadmap.md line, covering feasibility, dependency order, tiers assigned by vibe, scope that arrived because it was nearby, and do-nothing priced"
- id: P1
  kind: task                          # revise the graph against the findings
  phase: 0
  rung: 1
  needs: [R1]
  done: "every finding is applied to graph.yaml or refused in writing with a reason"
- id: L1
  kind: loop
  phase: 0
  body: [R1, P1]
  invariant: "plan/graph.yaml validates against CONTRACT §4 and §5 at the end of every iteration"
  ledger: _orch/loops/L1/seen.yaml     # key: node id + finding shape
  stop:
    dry_rounds: 2
    max_iterations: 3
    max_rungs: 20
  on_stop: S1
- id: S1
  kind: task                          # write the roadmap a cold run can execute
  phase: 1
  rung: 1
  needs: [L1]
  done: "plan/roadmap.md — table first: node id, phase, tier, done-criterion, risk; prose after"
```

The planner may add reviewers, split `T01` per surface, and phase the graph as the work
demands. It may **not** add an execution node, let a reviewer revise the plan it audited, or
close `L1` while a finding is neither applied nor refused in writing. Two things make the
output executable cold: the graph names inputs by path, never by "the thing we discussed"
— a node whose handoff assumes a conversation cannot be resumed — and every rejected
option stays in `roadmap.md` with the reason it lost, do-nothing included, or the next run
re-derives it within an hour of starting.

## Entry tiers

| node class | entry tier | why |
|---|---|---|
| — | 0 `cheap` | ROADMAP has no mechanical node: nothing here is a command with an exit code. |
| everything — state map (`T01`), options and graph (`T02`), review (`R1`), revision (`P1`), synthesis (`S1`) | 1 `frontier` | the default (CONTRACT §1.1). Judgment across contested alternatives, and the graph itself — the artifact every later run inherits. ROADMAP is small on purpose: a mistake here propagates into every run that follows. |

## Gates

- **Plan gate.** The mode's center — it refutes the plan the run itself produced. Passes
  when a fresh reviewer has attacked the graph and `L1` is dry.
- **Phase gate.** One phase. Passes when every finding is applied or refused in writing.
- **Blocked batch.** Unresolved questions go to the operator as one batch; a question
  answered by assumption becomes a `roadmap.md` risk row, never a silent choice.
- **Final gate.** Passes when `plan/graph.yaml` validates against CONTRACT §4 and §5 and
  `plan/roadmap.md` leads with the node table.

## Done

`plan/graph.yaml` validates against CONTRACT §4 and §5; every node at cheap carries a
written reason and every node a `done` checkable without judgment; every loop declares all
four fields; `plan/roadmap.md` opens with the node table and prices every option including
do-nothing; no node in the graph was executed.

## Failure modes of this mode

- **The plan only its author can run.** Nodes reference decisions made in conversation and
  the executing run re-derives them wrong. `S1` writes the table first: a node that cannot
  be stated as a table row is one nobody else can pick up.
- **Do-nothing omitted.** The option that most often wins is the one nobody wrote down, and
  a roadmap that never priced it cannot defend what it chose. `R1` audits for it.
- **Tiers assigned by vibe.** Judgment drafted at cheap to look frugal, so the run
  executing this plan fails its first verification before it starts. `R1` checks the
  one direction that costs: the cheap node that will be refuted and retried at frontier
  anyway (§1.2).
- **Review theater.** The reviewer returns findings, `P1` applies the cosmetic ones, and `L1` goes
  dry because the plan stopped changing rather than stopped being wrong. Every finding is
  applied or refused **in writing**, and the ledger keys findings by shape — a refused
  finding that returns is recognized, not re-litigated.
