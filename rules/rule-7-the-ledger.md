---
type: Rule
id: rule-7-the-ledger
title: "7. The Ledger"
section: "7"
contract: prompt/CONTRACT.md
status: active
---

## 7. The Ledger

One append-only row per spawn, written by the spawning layer **at envelope
receipt** — not at dispatch. At dispatch neither `verdict` nor `seconds` exists
yet, and a row written then can only guess at both.

```csv
ts,node,rung,model,effort,attempt,verdict,seconds,note
```
