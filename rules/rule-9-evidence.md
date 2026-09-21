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
- **`UNVERIFIED`.** A finding whose citation does not check out — the quote is
  absent from the artifact, or sits somewhere other than where it was placed —
  is downgraded to `UNVERIFIED`. It stays in the report and it **cannot block**.
  Fabricated evidence does not become true by being interesting.
- **Verification runs at frontier, as a fresh spawn**, whatever tier did the
  work (§1); a cheap node's verifier re-runs its command. A verifier that
  returns `PARTIAL` twice on the same node is replaced by another fresh spawn,
  never by a larger model, because there is none. Independence is the
  mechanism: in this framework's own run a fresh adversary broke three of three
  contract changes their author had drafted at the top of the ladder, and the
  refutation rate did not move with the tier.
- **Priorities.** `P0` BLOCKER — names a concrete harm that is irreversible,
  unsafe, or produces incorrect output to users; *"could be bad"* is never P0.
  `P1` CRITICAL — significant, reversible, expensive after ship; deferral needs
  operator approval. `P2` IMPORTANT — tracked, owned, next phase. `P3`
  IMPROVEMENT — report only.
- **Neutrality.** Prime, phase runners, and mediators run process. Domain
  authority belongs to the personas and the evidence.
