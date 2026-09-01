---
type: Rule
id: rule-0-layers
title: "0. Layers"
section: "0"
contract: prompt/CONTRACT.md
status: active
---

## 0. Layers

```
OPERATOR
  │   run config; answers to blocked questions
  ▼
PRIME              fable/low      never reads work. ~1 turn per phase.
  │   phase brief — paths and a rung, nothing else
  ▼
PHASE RUNNER       opus|sonnet    owns one phase. reads envelopes only.
  │   handoff path + rung
  ▼
NODE ORCHESTRATOR  assigned rung  does the work, or spawns workers.
  │   work dir
  ▼
WORKER             assigned rung  leaf. writes artifacts.
```

Each layer passes **locators and a rung** downward, never contents (§6.1). Each layer
receives an **envelope** upward (§2), never prose. A layer that opens its
child's work products has broken the contract — the digest (§3) exists so it
never has to.

**Why the phase runner exists.** In v1 the prime dispatched every task, so a
forty-task run cost forty top-tier turns. That was the whole bill. The phase
runner absorbs dispatch, routing, retry, and verification so the prime spends
its turns on gates alone. Prime turn budget is declared in the run config and
counted in `manifest.json`. When it is spent, the prime hands its remaining
gates to an opus deputy and records the handover in the final report. **Running
out of prime turns is a normal outcome, not a failure.**

---
