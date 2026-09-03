---
type: Rule
id: rule-9-2-refutation-triage
title: "9.2. Refutation triage — a refuted row names what was wrong"
section: "9.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-9-evidence
  - rel: relates-to
    to: rule-9-1-a-verdict-is-per-criterion-and-the-node
    note: adds one field to the row shape §9.1 defines; changes nothing else about it
  - rel: relates-to
    to: rule-1-2-escalation
    note: trigger 3 fires only on a `work` refutation
  - rel: relates-to
    to: rule-4-5-done-criteria-are-atomic
    note: the linter catches the shapes at authoring time; this rule catches the ones it missed
---

### 9.2 Refutation triage — a refuted row names what was wrong

A `REFUTED` row (§9.1) carries one more field, **`defect`**, with exactly two values:

| `defect` | means | consequence |
|---|---|---|
| `work` | the artifact fails a criterion that an execution inside the node could have satisfied | §1.2 trigger 3 — one rung up, fresh context |
| `criterion` | no execution inside the node can settle the criterion as written | the node **does not escalate** — it parks `BLOCKED` on a question that proposes a bounded rewrite |

**`criterion` is a narrow finding, not an excuse.** It applies only when the row also
names which of these shapes the criterion has, quoting the criterion verbatim:

1. **Unbounded enumeration** — it asks for *every* instance of something across an artifact
   and carries no command that generates the enumeration, so each verifier finds a different gap.
2. **Measures outside the node** — it reads the tree, branch, or index rather than the node's own
   work, so nothing the node does can change the answer.
3. **Superseded form** — an operator answer or a phase brief has already rewritten what it
   asks for, and the handoff still carries the old text.

Hard is not unsettleable. A criterion the artifact *could* have met as written is a `work`
refutation however much effort meeting it would take. A `criterion` row that names no shape, or
does not quote the criterion, is **malformed** and the phase runner reads the verdict as
`PARTIAL` (§9.1).

**Routing, held by the phase runner:**

- Any `work` row → `FAILED`, one rung up (§1.2). Unchanged.
- Only `criterion` rows → the node stays at its rung and parks `BLOCKED`. The phase runner writes
  `_orch/inbox/Q-<n>.md` per §10: the criterion verbatim, the verifier's shape and reason, a
  proposed rewrite that a command can settle, and the default — the node reported
  `DONE-WITH-CAVEATS` naming the criterion, never a silent close. The answer authorises the
  rewrite; the criteria not named stay byte-identical; a fresh verifier re-verifies at the same
  rung. This is the path `Q-09`, `Q-10` and `Q-11` walked by hand.
- Both → the `work` rows escalate now; the `criterion` rows are filed in the same question, so the
  escalated attempt is not judged on a criterion nobody can settle. Its verifier marks a filed,
  unanswered criterion `UNTESTED` with the question id in its `probe`. **A `PARTIAL` whose only
  `UNTESTED` rows cite an open question is not re-verified** — it waits for the answer, and at
  the final gate an unanswered one is a *needs a human* line (§10).

**Every `criterion` row is a linter fixture the run did not have.** The phase runner appends it to
`_orch/lint-feedback.yaml` — node, criterion verbatim, shape, verifier, question id — and the final
report lists that file's entries as candidates for `tools/lint-criteria.py`. A shape the linter
already flags but that was dispatched anyway is an authoring defect, recorded as such.

**Why this is a rule and not advice.** Without a `defect` field, §1.2 escalates every refutation
as if the work were wrong. In this framework's own run, of 21 refutations traceable to their
follow-up, 6 changed the criterion and 8 changed the product
(`_orch/instruments/summary.md`). `P76`'s criterion 1 was refuted by four verifiers on four
different gaps and settled only when `Q-11` rewrote it as six derivation commands, fourteen spawns
later. The phase runner at `ACCEPT-P90c` improvised this rule because the contract lacked it;
when a layer has to invent a rule, the contract is missing the rule. A materiality scheme that
priced criteria was drafted for the same problem and withdrawn
(`docs/designs/proportionality-and-detection.md` §1). This rule prices nothing: it records what
the verifier already knows, and routes on it.
