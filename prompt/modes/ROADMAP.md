# MODE: ROADMAP

> ROADMAP produces a panel-hardened plan for {TARGET} — `plan/graph.yaml` plus
> `plan/roadmap.md` — shaped so a later baton run in BUILD or GENERIC mode executes it
> cold. It builds nothing: no code, no scaffolding, no proof-of-concept.

## Directive

Produce a decision-ready phased plan for {TARGET} and execute none of it. Map the current
state with citations — what exists, what it costs, what already constrains the answer —
quoting the evidence rather than characterizing it. Enumerate the options honestly,
including do-nothing, and price each in the same units: what it buys, what it forecloses,
what it costs to reverse. Choose a direction and say what would have changed the choice.
Decompose it into a graph conforming to CONTRACT §4 — phases, edges, entry rungs assigned
by a property of the work, objective done-criteria, named risks — and hand every open
question to the operator as a batch rather than resolving it by assumption. Subject the
graph to an adversarial panel and revise until the panel admits nothing new. Done when
`plan/graph.yaml` validates against CONTRACT §4 and §5, every node's `done` is checkable
without judgment, every option including do-nothing is priced in `plan/roadmap.md`, and a
run with no memory of this one can execute the graph from the files alone.

## Graph skeleton

```yaml
- id: T01
  kind: task                          # map the current state with citations
  phase: 0
  rung: 2
  surface: doc
  handoff: _orch/nodes/T01/handoff.md
  done: "state.md — every claim about {TARGET} carries a ≤20-word quote and a path"
- id: T02
  kind: task                          # enumerate options incl. do-nothing, draft the graph
  phase: 0
  rung: 3
  needs: [T01]
  done: "options.md prices every option in the same units; plan/graph.yaml validates against CONTRACT §4"
- id: F1
  kind: fanout                        # one child per PLAN seat
  phase: 0
  rung: 1
  needs: [T02]
  done: "one A-<seat> node per roster seat serving PLAN; no A-node's handoff names another"
- id: A-feasibility
  kind: task                          # PLAN — refute the graph from this lens alone
  phase: 0
  rung: 2
  needs: [F1]
  refutes: T02
  adversarial: panel
  personas: [feasibility]
  done: "≤5 findings, each cited to a graph.yaml id or a roadmap.md line"
- id: B1
  kind: barrier                       # revision needs every seat's findings at once
  phase: 0
  rung: 1
  needs: [A-feasibility, A-dependency-order, A-rung-fit, A-scope-creep]
  done: "every seat returned findings or an explicit nothing-found"
- id: P1
  kind: task                          # revise the graph against the findings
  phase: 0
  rung: 3
  needs: [B1]
  done: "every finding is applied to graph.yaml or refused in writing with a reason"
- id: L1
  kind: loop
  phase: 0
  body: [F1, A-feasibility, B1, P1]
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
  rung: 3
  needs: [L1]
  personas: []                        # SYNTH is neutral
  done: "plan/roadmap.md — table first: node id, phase, rung, done-criterion, risk; prose after"
```

The planner may add seats, split `T01` per surface, and phase the graph as the work
demands. It may **not** add an execution node, let a seat revise the plan it audited, or
close `L1` while a finding is neither applied nor refused in writing. Two things make the
output executable cold: the graph names inputs by path, never by "the thing we discussed"
— a node whose handoff assumes a conversation cannot be resumed — and every rejected
option stays in `roadmap.md` with the reason it lost, do-nothing included, or the next run
re-derives it within an hour of starting.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| fanout, barrier | 1 | Bookkeeping against a closed list. |
| state map (`T01`), seats | 2 | Citation-grade reading of an unfamiliar surface; PLAN is rung 2 per personas/CONTRACT.md §2.1. |
| options and graph (`T02`), revision (`P1`), synthesis (`S1`) | 3 | Judgment across contested alternatives, and the graph itself — the artifact every later run inherits. ROADMAP is small and rung-heavy on purpose: a mistake here propagates into every run that follows. |

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `feasibility` | expert | PLAN, CLASH | Whether each phase can actually be done with what exists — skills, access, dependencies, time — or is a wish with a done-criterion. |
| `dependency-order` | expert | PLAN, CLASH | Whether `needs` edges match reality: work scheduled before its prerequisite, cycles, false ordering that serializes independent work. |
| `rung-fit` | expert | PLAN | Whether entry rungs name a property of the work (CONTRACT §1.1) or were assigned by vibe, in both directions. |
| `scope-creep` | expert | PLAN | Which nodes serve {TARGET} and which arrived because they were nearby. |

Casting prefers experts tagged `delivery`/`estimation` for `feasibility`,
`systems`/`scheduling` for `dependency-order`, `orchestration`/`cost` for `rung-fit`,
`product`/`prioritization` for `scope-creep`.

## Gates

- **Plan gate.** The mode's center — it refutes the plan the run itself produced. Passes
  when every seat has attacked the graph and `L1` is dry.
- **Phase gate.** One phase. Passes when every finding is applied or refused in writing.
- **Blocked batch.** Unresolved questions go to the operator as one batch; a question
  answered by assumption becomes a `roadmap.md` risk row, never a silent choice.
- **Final gate.** Passes when `plan/graph.yaml` validates against CONTRACT §4 and §5 and
  `plan/roadmap.md` leads with the node table.

## Done

`plan/graph.yaml` validates against CONTRACT §4 and §5; every node above rung 1 carries a
written reason and every node a `done` checkable without judgment; every loop declares all
four fields; `plan/roadmap.md` opens with the node table and prices every option including
do-nothing; no node in the graph was executed.

## Failure modes of this mode

- **The plan only its author can run.** Nodes reference decisions made in conversation and
  the executing run re-derives them wrong. `S1` writes the table first: a node that cannot
  be stated as a table row is one nobody else can pick up.
- **Do-nothing omitted.** The option that most often wins is the one nobody wrote down, and
  a roadmap that never priced it cannot defend what it chose. `scope-creep` audits for it.
- **Rungs assigned by ambition.** Everything important is drafted at rung 4, so the run
  executing this plan is expensive before it starts. `rung-fit` checks both directions: the
  padded rung and the node that will escalate three times.
- **Panel theater.** Seats return findings, `P1` applies the cosmetic ones, and `L1` goes
  dry because the plan stopped changing rather than stopped being wrong. Every finding is
  applied or refused **in writing**, and the ledger keys findings by shape — a refused
  finding that returns is recognized, not re-litigated.
