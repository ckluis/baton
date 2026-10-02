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
PRIME              frontier         dispatches every node; holds the gates; never authors or verifies.
  │   handoff path + tier
  ▼
NODE ORCHESTRATOR  assigned tier    does the work, or spawns workers.
  │   work dir
  ▼
WORKER             assigned tier    leaf. writes artifacts.
```

Each layer passes **locators and a tier** downward, never contents (§6.1). Each
layer receives an **envelope** upward (§2), and every receipt writes its row (§7).
Whoever dispatches a node is never its author or its verifier (§9).
