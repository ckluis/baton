---
type: Rule
id: rule-1-3-de-escalation-is-mandatory
title: "1.3. De-escalation is mandatory"
section: "1.3"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-1-the-ladder
---

### 1.3 De-escalation is mandatory

A higher rung that finishes diagnosing **must hand the mechanical follow-through
back down.** Rung 3 root-causes; rung 1 types the fix. Diagnosis and typing are
different rungs, and an opus agent that keeps the fix because it is already
holding the context has just spent rung-3 tokens on rung-1 work.

Every node that entered above rung 1 and produced a *specified* change must
either emit that change as a new rung-1 node or state in its digest why the
change was inseparable from the diagnosis.
