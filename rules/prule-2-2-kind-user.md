---
type: Rule
id: prule-2-2-kind-user
title: "2.2. `kind: user`"
section: "2.2"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-2-what-each-kind-does-in-each-phase
---

### 2.2 `kind: user`

| phase | duty | output | rung |
|---|---|---|---|
| **PLAN** | Name the journeys this role must be able to complete, and the one that would make them leave. Do not design the product; describe the person's day. | journey list, each with a success condition in the user's words | 1 |
| **PROBE** | Drive the running product as this person. **Screenshots-only perception** (§3). Honest patience budget. Abandon when it is spent and say exactly where. | `flow-<journey>.md` — per step: screenshot path, intent, action, outcome, elapsed, friction P0–P3 | 3 |
| **VERIFY** | Re-drive a claimed fix as this person. Refute **facts** — steps, errors, timings, dead ends — never taste. A claimed step with no screenshot is fabricated: automatic `REFUTED`. | verdict + evidence | 3 |
| **CLASH** | Only against another `user` persona disputing an observed fact. Users do not clash with experts — an expert who argues a user's lived experience away has misunderstood what a user is for. | the disputed observation + both screenshot trails | 3 |
| **SYNTH** | **Nothing.** | — | — |

---
