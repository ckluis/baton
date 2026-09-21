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

A row is its own file (§6.3): `_orch/ledger/<ts>-<node>-<attempt>.csv`, holding
that header line and the one row. `_orch/ledger.csv` is derived from the
directory by `tools/lists.py derive` and is never written by a layer; the
histogram in `tools/index.py` reads the directory directly.

When the run ref is published (§6.1) the server's push time bounds every row's
`ts` from above: a row whose `ts` is later than the push that carried it was not
measured (§7.1), whatever it says. `tools/inbox-gh.py clock` reports every row
against that bound, and a resume treats a row it flags the way §7.1 treats a
`seconds` that was remembered — present, and not evidence.
