# MODE: DOGFOOD

> DOGFOOD casts a matrix of `kind: user` personas, drives the running product at
> {TARGET} through their real journeys, and ships flow documents plus a ranked UX
> report grounded in screenshots. It fixes nothing — every finding leaves as a backlog
> row for a later IMPROVE or BUILD run.

## Directive

Simulate the real users of {TARGET} and report what they actually experience; fix
nothing. Derive the persona matrix first — every user tier, every role inside it, and
each role's top journeys with a success condition stated in that person's own words —
and get the matrix and its cards operator-approved as one batch before a single journey
runs, because persona choices change everything downstream. Then prove the environment:
a reachable app, seeded data, and working credentials for every cell, demonstrated by
signing in as each role; a cell that cannot authenticate blocks its own journeys and
nothing else. Drive one journey per persona per cell under the perception contract in
personas/CONTRACT.md §3, on an honest patience budget, abandoning when it is spent and
saying exactly where. Probe the tier boundaries as first-class work, not as an
afterthought: tenant isolation, privilege escalation, impersonation and support flows —
these are the findings only simulated users surface. Record every step as a flow
document with its screenshot embedded, and ground every finding in observable fact —
steps, dead ends, error text, elapsed time — never in taste. Re-drive every claimed
friction as the same person and refute facts only; a claimed step with no screenshot is
fabricated. Dedupe across personas so friction hit by many roles gains severity, then
rank by frequency against severity. Done when every approved matrix cell has either a
flow document with screenshots or a recorded reason it could not run, every P0 and P1
has been re-driven and confirmed, and `final/ux-report.md`, `final/flows/`, and the fix
backlog are on disk with nothing under {TARGET} modified.

## Graph skeleton

```yaml
- id: M1
  kind: task
  phase: 1
  title: Derive the persona matrix and journey list
  rung: 3
  surface: ui
  personas: [first-run, returning-power, admin-operator]   # PLAN duty, §2.2
  handoff: _orch/nodes/M1/handoff.md
  done: "matrix.yaml holds every tier x role x journey cell, each with a success condition in the user's words"
- id: G1
  kind: gate
  phase: 1
  title: Matrix gate — operator approves cells and cards as ONE batch
  rung: 1
  needs: [M1]
  done: "_orch/inbox/Q-01.answer.md exists and every cell in matrix.yaml is marked approved, cut, or amended"
- id: E1
  kind: fanout                        # one child per approved cell's role
  phase: 2
  rung: 0
  needs: [G1]
  done: "env-<role>.md holds a post-login screenshot per role, or names the exact credential that failed"
- id: F1
  kind: fanout                        # one child per approved persona x journey cell
  phase: 3
  rung: 1
  needs: [E1]
  done: "one P-<persona>-<journey> node per approved cell whose role authenticated"
- id: P-first-run-signup
  kind: task
  phase: 3
  title: "PROBE — first-run user completes signup"
  rung: 3
  surface: ui
  needs: [F1]
  personas: [first-run]
  done: "flow-signup.md — every step has a screenshot path, intent, action, outcome, elapsed, friction P0-P3"
- id: V-first-run-signup
  kind: task
  phase: 3
  rung: 3
  needs: [P-first-run-signup]
  refutes: P-first-run-signup
  personas: [returning-power]          # a different user re-drives; never the author
  done: "verdict.json CONFIRMED/REFUTED/PARTIAL per claimed friction, with its own screenshot trail"
- id: X1
  kind: task
  phase: 3
  title: Cross-tier probe — tenant isolation, privilege boundary, impersonation
  rung: 3
  surface: ui
  needs: [E1]
  personas: [admin-operator, low-trust-evaluator]
  done: "cross-tier.md records each boundary attempt, the screenshot of what rendered, and the verdict"
- id: L1
  kind: loop
  phase: 3
  body: [F1, P-first-run-signup, V-first-run-signup, X1]
  invariant: "every cell in the ledger has a flow document or a recorded reason it could not run"
  ledger: _orch/loops/L1/seen.yaml     # key: persona + journey + surface reached
  stop:
    dry_rounds: 2
    max_iterations: 3
    max_rungs: 30
  on_stop: B1
- id: B1
  kind: barrier                       # dedupe needs every persona's findings at once
  phase: 4
  rung: 1
  needs: [L1]
  done: "every approved cell has a status and every flow document is present"
- id: D1
  kind: task
  phase: 4
  title: Dedupe findings across personas and score frequency x severity
  rung: 2
  needs: [B1]
  done: "findings.yaml — one row per distinct friction, listing every persona that hit it and its merged severity"
- id: A-journey-honesty
  kind: task
  phase: 4
  title: "AUDIT — did the probes complete the flows or narrate plausible fiction"
  rung: 2
  needs: [B1]
  refutes: B1
  adversarial: panel
  personas: [journey-honesty]
  done: "every claimed completion is matched to its screenshot, or the step is marked fabricated"
- id: S1
  kind: task
  phase: 5
  title: Ship the UX report, the flow documents, and the fix backlog
  rung: 3
  needs: [D1, A-journey-honesty]
  personas: []                        # SYNTH is neutral
  done: "final/ux-report.md, final/flows/<role>.md per role, and backlog.yaml where every row has an owner and a repro path"
```

The planner may resize the matrix (personas/CONTRACT.md §4.1 binds the panel to three
to seven), add cross-tier probes, and split a journey that spans more than one role. It
may **not** run any journey before `G1` closes, let a failed credential cell block a
different cell's journeys, let a probe verify its own flow document, or add a node that
writes to {TARGET}. `final/flows/` is a deliverable, not a byproduct: a clean journey's
flow document is one editing pass from real user documentation, so it is written for a
human reader from the first draft.

## Entry rungs

| node class | entry rung | why |
|---|---|---|
| environment proof (`E1` children) | 0 | Sign in, screenshot, record. Verifiable by command. |
| fanout, barrier, matrix gate | 1 | Bookkeeping against a closed list — the default rung. |
| dedupe (`D1`), panel seats | 2 | Merging near-identical friction across roles needs judgment about sameness, and the audit seats are rung 2 per personas/CONTRACT.md §2.1. |
| matrix derivation (`M1`) | 3 | Every downstream node inherits this node's mistakes, and a wrong matrix is unrecoverable after `G1`. |
| probe, verify, cross-tier (`P-*`, `V-*`, `X1`) | 3 | Pinned by personas/CONTRACT.md §2.2, not chosen here: PROBE and VERIFY are rung 3 for `kind: user`. Driving a UI from pixels alone under a patience budget is the one duty in baton that is genuinely rung-3 work — this is the mode where the majority of nodes sit above rung 1, and the reason is in the contract, not in the plan. |
| synthesis (`S1`) | 3 | Cross-persona resolution. |

## Seats

| seat slug | kind | phases | what it examines |
|---|---|---|---|
| `journey-honesty` | expert | AUDIT, CLASH | Whether probes completed the flows or narrated plausible fiction — every claim against its screenshot. |
| `persona-fidelity` | expert | AUDIT, CLASH | Whether each probe behaved as its card or drifted into an expert developer who knows the URL scheme. |
| `matrix-coverage` | expert | AUDIT | Which approved persona x journey cells went unprobed, and whether the gaps are the interesting ones. |
| `severity-inflation` | expert | VERIFY | Every claimed P0/P1 against CONTRACT §9 — a slow page is not a blocker. |
| `first-run` | user | PLAN, PROBE, VERIFY | Signup, onboarding, first value. Knows nothing; abandons early. |
| `admin-operator` | user | PLAN, PROBE, VERIFY | Provisioning, roles, billing, support paths. Owns the tier boundary probes. |
| `returning-power` | user | PLAN, PROBE, VERIFY, CLASH | Speed, keyboard paths, bulk work, the flow that got slower. |
| `mobile-commuter` | user | PROBE | The same journeys on a narrow viewport with one thumb and a bad connection. |
| `low-trust-evaluator` | user | PROBE | Whether the product earns data: permissions, pricing clarity, export, delete-my-account. |

Casting prefers named experts tagged `qa`/`exploratory-testing` for `journey-honesty`,
`ux-research`/`ethnography` for `persona-fidelity`, `test-design`/`combinatorics` for
`matrix-coverage`, and `risk`/`triage` for `severity-inflation`. Add `assistive-tech` or
`delegate` when {TARGET} has a compliance surface or a shared-account workflow;
personas/CONTRACT.md §4.1's ceiling of seven binds.

## Gates

- **Plan gate.** Passes when every approved cell has exactly one probe node, no probe
  node verifies itself, `L1` carries all four fields CONTRACT §5.3 requires, and the
  matrix gate precedes every probe.
- **Matrix gate** (`G1`, a blocked batch). The matrix and every bound card go to the
  operator as one batch. Passes when each cell is approved, cut, or amended in writing.
  This is the only gate in the mode that halts everything — nothing downstream is worth
  running against the wrong roster.
- **Phase gate.** Phase 2 passes when every role has a post-login screenshot or a named
  credential failure. Phase 3 passes when the loop is dry or stopped and every P0/P1 has
  a `V-` verdict. Phase 4 passes when dedupe covers every finding.
- **Blocked batch.** Credential failures, missing fixtures, and unreachable surfaces
  batch together per cell. A blocked cell drops its own journeys and appears in the
  report as an unprobed cell; it never stops the run.
- **Final gate.** Passes when `final/flows/` holds one document per role, the report's
  every row cites a screenshot, and {TARGET} is unmodified.

## Done

Every approved matrix cell has either a flow document with screenshots or a recorded
reason it could not run; every P0 and P1 carries a `V-` verdict of CONFIRMED or PARTIAL
from a different persona than the one that raised it; `final/ux-report.md` ranks findings
by frequency against severity; `final/flows/<role>.md` exists per role; `backlog.yaml`
rows all carry an owner and a repro path; `git status` on {TARGET} is clean.

## Failure modes of this mode

- **The fluent narration.** A probe describes a signup it never completed, in convincing
  detail, because the flow is easy to imagine. The `V-` node re-drives it as a different
  persona and a step with no screenshot is fabricated on sight; `journey-honesty` then
  matches every claimed completion to a file at the barrier. Two mechanisms, because
  this is the failure that makes the whole mode worthless.
- **The persona that reads the source.** A probe gets stuck, quietly consults the code
  or the docs, and completes a flow no real user could. `persona-fidelity` audits
  behavior against the card, and the tell is always the same: an action taken on an
  element that appears in no prior screenshot.
- **The matrix that is really one user five times.** Five cards, one point of view, and
  the run reports the same friction five times as if it were corroboration.
  personas/CONTRACT.md §4.3 forces cards that could not be swapped unnoticed, and
  `matrix-coverage` audits the cells for whether the gaps are the interesting ones.
- **Severity by empathy.** A frustrated persona rates everything P1 because the
  experience felt bad. `severity-inflation` re-scores against CONTRACT §9, and the merged
  row in `D1` earns its severity from how many roles hit it, not from how it read.
- **Dogfood that starts fixing.** A one-line copy change is obvious and someone makes
  it, so the report now describes a product that no longer exists and the backlog has a
  hole in it. Every node here reads and drives only; the final gate checks the target is
  unmodified.
