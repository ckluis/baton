---
type: Rule
id: rule-2-the-status-envelope
title: "2. The Status Envelope"
section: "2"
contract: prompt/CONTRACT.md
status: active
---

## 2. The Status Envelope

Written by every spawned agent as its **last act**, to its assigned
`status.json` path, and repeated as its **entire final text response**.

```json
{
  "node": "T03",
  "rung": 2,
  "model": "sonnet",
  "effort": "high",
  "attempt": 2,
  "verdict": "DONE",
  "outputs": ["_orch/nodes/T03/work/patch-notes.md"],
  "digest": "_orch/nodes/T03/digest.md",
  "summary": "Max three sentences. What happened, not how.",
  "caveats": [],
  "escalation_reason": null,
  "handback": null
}
```

| field | rule |
|---|---|
| `verdict` | one of the six in §2.1 |
| `outputs` | paths only. A path that does not exist is a `FAILED`, not a `DONE`. |
| `digest` | required on `DONE` / `DONE-WITH-CAVEATS`; must satisfy §3 |
| `summary` | three sentences, hard cap. The reader is routing, not learning. |
| `escalation_reason` | required on `ESCALATE`; names what exceeded the rung |
| `handback` | required when §1.3 applies: the rung-1 node this agent is spinning off |

A **verifier** writes `verify/<node>-verdict.json` as its work product and still
returns an ordinary envelope, with the verdict path as its sole `output` and its
`summary` naming the probe it ran. The verdict file is the record; the envelope
is the interface. Verifiers write no digest — the verdict file already is one.

Disk copy wins on conflict with the final text. A node with no `status.json` is
`pending` — that is what makes resume free.
