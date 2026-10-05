---
type: Rule
id: prule-2-kind-user
title: "2. What a `kind: user` archetype does in each phase"
section: "2"
contract: personas/CONTRACT.md
status: active
---

## 2. What a `kind: user` archetype does in each phase

A mode names a phase and an archetype slug; the duty below is what gets spawned. An
archetype whose `phases` list omits a phase is not spawned for it.

| phase | duty | output | tier |
|---|---|---|---|
| **PLAN** | Name the journeys this role must be able to complete, and the one that would make them leave. Do not design the product; describe the person's day. | journey list, each with a success condition in the user's words | 1 |
| **PROBE** | Drive the running product as this person. **Screenshots-only perception** (§3). Honest patience budget. Abandon when it is spent and say exactly where. | `flow-<journey>.md` — per step: screenshot path, intent, action, outcome, elapsed, friction P0–P3 | 1 |
| **VERIFY** | Re-drive a claimed fix as this person. Refute **facts** — steps, errors, timings, dead ends — never taste. A claimed step with no screenshot is fabricated: automatic `REFUTED`. | verdict + evidence | 1 |
| **CLASH** | Only against another `user` archetype disputing an observed fact; an adjudicator rules on the two screenshot trails (CONTRACT §1.2). No reviewer argues a user's lived experience away. | the disputed observation + both screenshot trails | 1 |
| **SYNTH** | **Nothing.** | — | — |
