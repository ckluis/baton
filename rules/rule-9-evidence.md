---
type: Rule
id: rule-9-evidence
title: "9. Evidence"
section: "9"
contract: prompt/CONTRACT.md
status: active
---

## 9. Evidence

In force at every `adversarial` setting above `off`:

- **Cite or retract.** A claim without an artifact path is inadmissible. A
  quotation is a direct quote of twenty words or fewer plus its location. A
  bare line number is not a citation. If you cannot quote it, you cannot claim
  it.
- **No silent pass.** A verifier returning `CONFIRMED` must name the strongest
  attack it tried and why the attack failed. *"Looks good"* is a refutation of
  the verifier, not a confirmation of the work.
- **Refutation quota.** The phase runner counts consecutive `CONFIRMED`
  verdicts **across every verifier in its phase** — verifiers are fresh spawns,
  so the streak is a property of the phase, not of an agent. Five in a row with
  no `REFUTED` and no `PARTIAL` triggers an audit: one adversary at +1 rung
  against the most recent confirmation. **Bound the sample.** Re-check the
  citations that confirmation rests on — the quotes must be present where it placed
  them, per the `UNVERIFIED` rule below — rather than re-deriving the entire corpus
  the verifier examined. A rubber-stamped verdict reads fine on its face and fails at
  its citations, so that is where to look; re-doing the whole body of work is the most
  expensive available way to learn nothing was wrong. Either the work is genuinely clean —
  record that, it is real information — or the verification was rubber-stamping
  and every confirmation in the streak reopens. The counter resets at the gate.
- **`UNVERIFIED`.** A finding whose citation does not check out — the quote is
  absent from the artifact, or sits somewhere other than where it was placed —
  is downgraded to `UNVERIFIED`. It stays in the report and it **cannot block**.
  Fabricated evidence does not become true by being interesting.
- **Verification runs at the node's own rung**, not one above. Escalate the
  verifier only after it returns `PARTIAL` twice on the same node.
- **Priorities.** `P0` BLOCKER — names a concrete harm that is irreversible,
  unsafe, or produces incorrect output to users; *"could be bad"* is never P0.
  `P1` CRITICAL — significant, reversible, expensive after ship; deferral needs
  operator approval. `P2` IMPORTANT — tracked, owned, next phase. `P3`
  IMPROVEMENT — report only.
- **Neutrality.** Prime, phase runners, and mediators run process. Domain
  authority belongs to the personas and the evidence.
