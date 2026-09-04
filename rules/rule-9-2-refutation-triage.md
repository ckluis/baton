---
type: Rule
id: rule-9-2-refutation-triage
title: "9.2. Refutation triage — a criterion no execution can settle is not a failed node"
section: "9.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-9-evidence
  - rel: relates-to
    to: rule-9-1-a-verdict-is-per-criterion-and-the-node
    note: adds the fourth row verdict §9.1's table computes over
  - rel: relates-to
    to: rule-1-2-escalation
    note: trigger 3 is unchanged; an UNSETTLEABLE row is not a REFUTED row
  - rel: relates-to
    to: rule-10-the-operator-lane
    note: the phase runner writes the question on the node's behalf
  - rel: relates-to
    to: rule-4-5-done-criteria-are-atomic
    note: the linter catches these shapes at authoring time; this rule catches the ones it missed
---

### 9.2 Refutation triage

A verifier that finds a criterion **no execution inside the node could have settled** does not
write `REFUTED`. It writes the fourth row verdict:

| row verdict | means | node computes to |
|---|---|---|
| `REFUTED` | the artifact fails a criterion it could have met | `REFUTED` — §1.2 trigger 3, one rung up |
| `UNSETTLEABLE` | the criterion cannot be settled as written | `PARTIAL`, parked on a question — **not** one rung up |

**`UNSETTLEABLE` is a demonstrated finding, not an excuse.** The row must carry all three:

1. the criterion quoted verbatim;
2. a **`shape`**, one of: `unbounded-enumeration` (asks for *every* instance with no command that
   generates the enumeration, so each verifier finds a different gap), `measures-outside-node`
   (reads the tree, branch or index, which nothing inside the node can change),
   `false-premise` (asserts a fact about the input that was never true),
   `self-contradictory` (conflicts with another line of the same handoff), or
   `superseded-form` (an answer file or brief has already rewritten it and the handoff still
   carries the old text);
3. a **`probe` that is the command whose output shows the criterion cannot be settled** — the
   form `_orch/inbox/Q-10.md` used: the measured branch has thirty-one changed files and no rung
   can make it two. What the artifact actually shows goes in `evidence`, so the rewrite can be
   judged against it.

Hard is not unsettleable. A criterion the artifact *could* have met as written is `REFUTED`
however much work meeting it would take. An `UNSETTLEABLE` row missing its shape or its
demonstrating probe is **read as `REFUTED`** by the phase runner: the cheap branch is the one
that has to prove itself.

**Routing, held by the phase runner.** §9.1's computation is unchanged in spirit: any `REFUTED`
row makes the node `REFUTED`; otherwise any `UNTESTED` or `UNSETTLEABLE` row makes it `PARTIAL`.

- A `PARTIAL` with any `UNSETTLEABLE` row is **not re-verified** (§9's re-verify-then-escalate
  rule does not apply). The phase runner writes `_orch/inbox/Q-<n>.md` **on the node's behalf**
  (§10.1): the criterion verbatim, the shape and probe, a proposed rewrite that a command can
  settle, and the default — the node reported `DONE-WITH-CAVEATS` naming the criterion. If
  `_orch/lint-feedback.yaml` already carries this node and criterion, the existing question is
  cited instead of a second one written.
- The node's envelope is not rewritten; the agent that wrote it is gone (§2). The phase runner
  tracks the node as **`BLOCKED`-and-batched** in its own envelope, and that is the node's state
  at every gate (§8, phase-runner terminal states). Its `needs` edges stay closed like any
  blocked node's (§4.1). Resume reads the state off disk: a verdict with an `UNSETTLEABLE` row
  and no matching `_orch/inbox/Q-<n>.answer.md` is parked.
- The answer authorises the rewrite. The criteria not named stay byte-identical; a fresh verifier
  re-verifies at the same rung. An unanswered question at the final gate is a *needs a human*
  line (§10.4), never an assumption.
- A verdict with both `REFUTED` and `UNSETTLEABLE` rows escalates on the `REFUTED` rows now. The
  phase runner files the question at the same time, so the re-spawn's verifier — which will find
  the same criterion and mark it `UNSETTLEABLE` again — lands `PARTIAL` and parks rather than
  looping.

**Every `UNSETTLEABLE` row is a linter fixture the run did not have.** The phase runner appends
it to `_orch/lint-feedback.yaml` — node, criterion verbatim, shape, verifier, question id — at
the moment it files the question, and the final report lists that file's entries as candidates
for `tools/lint-criteria.py`. A shape the linter already flags but that was dispatched anyway is
an authoring defect, recorded as such.

**Why this is a rule and not advice.** Without a fourth row verdict, §1.2 escalates every
refutation as if the work were wrong. In this framework's own run, `_orch/instruments/summary.md`
examined twenty-one refutations and could trace fourteen to their follow-up: six changed the
criterion, eight changed the product. `P76`'s criterion 1 was refuted by four verifiers on four
different gaps and settled only when `Q-11` rewrote it as six derivation commands, fifteen spawns
later. The phase runner at `ACCEPT-P90c` improvised this rule because the contract lacked it. A
materiality scheme that priced criteria was drafted for the same problem and withdrawn
(`docs/designs/proportionality-and-detection.md` §1); it failed because an accepted node had no
verdict token and blocked every hard edge into it. This rule adds the token at the row, where
§9.1 already computes, and parks the node in a state the gates already know.
