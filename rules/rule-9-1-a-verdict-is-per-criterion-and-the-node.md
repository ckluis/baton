---
type: Rule
id: rule-9-1-a-verdict-is-per-criterion-and-the-node
title: "9.1. A verdict is per-criterion, and the node verdict is computed"
section: "9.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-9-evidence
---

### 9.1 A verdict is per-criterion, and the node verdict is computed

The rules above are duties. This one is a shape, because a duty nothing records
is a duty nobody can check.

A verdict file carries **one row per done-criterion in the handoff**, each
quoting its criterion verbatim, each with its own `verdict`
(`CONFIRMED` / `REFUTED` / `UNTESTED`), its own `probe`, its own `evidence`, and
optionally its own `attack` — the strongest attack tried and why the attack
failed, or on a `REFUTED` row the attack that landed. A `REFUTED` row also carries
`defect` (§9.2), which says whether the work or the criterion was wrong. `attack` is **optional and
additive**: an absent `attack` is **not** malformed, and the rules below are
unchanged by its presence or absence.
The node-level verdict is then **derived, not asserted**:

| rows | node verdict |
|---|---|
| every row `CONFIRMED` | `CONFIRMED` |
| any row `REFUTED` | `REFUTED` |
| any row `UNTESTED`, none `REFUTED` | `PARTIAL` |

A verdict whose row count does not match the handoff's criterion count, or whose
node verdict disagrees with that table, is **malformed**: the phase runner reads
it as `PARTIAL` and re-verifies. It does not get to be a `CONFIRMED`.

**Why this is a schema rule and not advice.** A single free-text `probe` field
cannot distinguish a verifier that checked one criterion of five from one that
checked all five — both produce a well-formed `CONFIRMED`. The duty to check
each one was already written down and was already unfalsifiable. Making the
record per-criterion is what turns "I checked everything" from a claim into
something the next agent can count.

`UNTESTED` exists so the honest answer is always available. A criterion that
could not be checked — no environment, missing dependency, a command that will
not run here — is `UNTESTED` with the reason in its `probe`, and the node lands
`PARTIAL`. **That is a better outcome than a `CONFIRMED` that quietly means
"most of it."**

**This shape binds the sweep, not the lens.** It governs
`{BATON}/prompt/roles/verifier.md`, whose duty is to check every done-criterion.
A **persona** seated at VERIFY has a different duty — personas CONTRACT §2.1
sends it to attack *one* specific `DONE` claim from its own lens, deeply, and
its verdict keeps the single-claim shape. One sweeps and must account for
everything; the other drills and must account for its one hole. Do not force
either into the other's record.

---
