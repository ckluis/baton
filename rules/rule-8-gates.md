---
type: Rule
id: rule-8-gates
title: "8. Gates"
section: "8"
contract: prompt/CONTRACT.md
status: active
---

## 8. Gates

A gate is a point where the prime spends a turn. There are exactly four kinds,
and a mode may not invent a fifth:

1. **Plan gate** — the graph is refuted before any of it is executed.
2. **Phase gate** — a phase's nodes are all `DONE`+`CONFIRMED` or
   `BLOCKED`-and-batched; drift is reset; the next phase brief is written;
   the index refresh (`tools/index.py`) is optional — a missing tool or
   failed run is logged and never stalls the gate.
3. **Blocked batch** — questions surfaced to the operator together, with a brief (§8.1).
4. **Final gate** — synthesis, report, brief (§8.1), disposal line.

Gate output is always a written file plus a one-line envelope. **A gate that
produces only conversation did not happen.**

---
