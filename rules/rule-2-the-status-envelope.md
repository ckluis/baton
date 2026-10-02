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
  "rung": 1,
  "model": "claude-opus-5-5",
  "effort": "medium",
  "attempt": 2,
  "verdict": "DONE",
  "outputs": ["_orch/nodes/T03/work/patch-notes.md"],
  "summary": "Max three sentences. What happened, not how.",
  "evidence": ["_orch/nodes/T03/work/suite.txt — the suite passes with test_retry_backoff"],
  "risk": "the backoff ceiling under clock skew is untested",
  "caveats": [],
  "escalation_reason": null,
  "handback": null
}
```

| field | rule |
|---|---|
| `verdict` | one of the six in §2.1 |
| `outputs` | paths only. A path that does not exist is a `FAILED`, not a `DONE`. |
| `summary` | three sentences, hard cap. The reader is routing, not learning. |
| `evidence` | required on `DONE` / `DONE-WITH-CAVEATS`: at most three entries, each one path plus what it proves |
| `risk` | required on `DONE` / `DONE-WITH-CAVEATS`: what remains unproven, in at most two sentences, or `"none"` |
| `escalation_reason` | required on `ESCALATE`; names what exceeded the tier |
| `handback` | optional: a `cheap` node this agent is spinning off for separable mechanical follow-through (§1.1) |

A **verifier** writes `verify/<node>-verdict.json` as its work product and still
returns an ordinary envelope, with the verdict path as its sole `output` and its
`summary` naming the probe it ran. The verdict file is the record; the envelope
is the interface.

Disk copy wins on conflict with the final text. A node with no `status.json` is
`pending` — that is what makes resume free.
