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
PRIME              frontier         never reads work. spends its turns on gates.
  │   phase brief — paths and a tier, nothing else
  ▼
DISPATCH           the harness, or   owns one phase. reads envelopes only.
                   the phase runner
  │   handoff path + tier
  ▼
NODE ORCHESTRATOR  assigned tier    does the work, or spawns workers.
  │   work dir
  ▼
WORKER             assigned tier    leaf. writes artifacts.
```

Each layer passes **locators and a tier** downward, never contents (§6.1). Each
layer receives an **envelope** upward (§2), never prose. A layer that opens its
child's work products has broken the contract — the digest (§3) exists so it
never has to.

**Layers are a discipline of context and independence, not a hierarchy of
spawns.** The phase runner exists because in v1 the prime dispatched every task
and a forty-task run cost forty top-tier turns; it absorbs dispatch, routing,
retry and verification so the prime spends its turns on gates alone. A session
that can run agents in parallel and wait for their envelopes — a harness with
an agent tool, a workflow, a job matrix — dispatches a phase's nodes through
that facility instead, under the same contract (router §4). The phase-runner
role is the fallback for a session that has no such facility, and the
discipline is identical either way: whoever dispatches never reads work
products, every spawn receives locators and a tier, every return is an
envelope, and every receipt writes its row (§7).
