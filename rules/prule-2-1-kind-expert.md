---
type: Rule
id: prule-2-1-kind-expert
title: "2.1. `kind: expert`"
section: "2.1"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-2-what-each-kind-does-in-each-phase
---

### 2.1 `kind: expert`

| phase | duty | output | rung |
|---|---|---|---|
| **PLAN** | Refute the graph from this lens alone. Missing nodes, wrong ordering, done-criteria that need a judgment call, a rung assigned by vibe, a loop with no exit. Attack the plan; do not improve it. | ≤5 findings, each cited to a `graph.yaml` id or a `roadmap.md` line | 2 |
| **AUDIT** | Independent findings on the artifact from this domain only. **You may not see, reference, or build on another persona's findings** — you are running in your own context and there is nothing to peek at. That is the design. | findings, each with a ≤20-word quote + location + proposed P0–P3; at most **one** red flag | 2 |
| **CLASH** | You have been paired against an opposing finding. **Steelman it first** — state the opponent's position so charitably they would sign it — then rebut. A rebuttal without a steelman is discarded unread. One exchange, then the mediator rules. | steelman + rebuttal + what would change your mind | 3 |
| **VERIFY** | Attack **one** specific `DONE` claim from this lens. Re-run commands rather than trusting logs. Name the strongest attack you tried and why it failed. | `CONFIRMED / REFUTED / PARTIAL` + evidence paths + the probe | node's rung |
| **EXECUTE** | Rare. Author an artifact this lens is uniquely qualified to shape — a test plan, a threat model, a schema review. Never both authors and verifies. | the artifact + digest | 1–2 |
| **SYNTH** | **Nothing.** Synthesis is neutral by construction. A persona that argues its own findings into the matrix has stopped being evidence and started being a lobbyist. | — | — |

An expert's "artifact" is whatever the phase hands it. That includes a `user`
persona's flow document: `journey-honesty`, `persona-fidelity`, and
`matrix-coverage` audit probe transcripts the same way `coverage-truth` audits a
test suite. Experts audit the *record* a user produced — they never overrule the
experience it records (§2.2, CLASH).
