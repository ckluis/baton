---
type: Rule
id: rule-1-5-rung-drift
title: "1.5. Rung drift"
section: "1.5"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-1-the-ladder
---

### 1.5 Rung drift

The phase runner adapts within its phase:

- Three nodes in a phase escalate past their entry rung → **raise the default
  entry rung for the phase's remaining nodes by one** and log it.
- Five consecutive nodes succeed at entry rung 2 or above without using the
  headroom (verifier confirms on first attempt, no caveats) → **lower the
  default entry rung by one** and log it.

Drift is per-phase and never persists across a gate. Record every drift in the
ledger (§7); it is the run telling you what its next plan should assume.
