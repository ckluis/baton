---
type: Rule
id: rule-10-the-operator-lane
title: "10. The Operator Lane"
section: "10"
contract: prompt/CONTRACT.md
status: active
---

## 10. The Operator Lane

A baton run does not have to stop to ask a question.

If `INBOX: on`, the operator may keep a second Claude Code session open and
message the run by name. **Cross-session messages are plain text and nothing
else** — no files, no history, no ability to grant a permission. So:

> **A message is a doorbell, never a document.**

The message says *"answered Q-03"*. The answer itself is written to
`_orch/inbox/Q-03.answer.md` by the operator's session. The run reads the file,
never the message body. This keeps the durable record on disk where resume can
find it, and it works identically whether the answer arrived by message, by
hand-edited file, or by an operator who typed it into the run directly.

Protocol:

1. A `BLOCKED` node writes `_orch/inbox/Q-<n>.md` — the question, the node it
   blocks, and what the run will assume if it goes unanswered.
2. The prime batches open questions at every gate.
3. At each gate the prime scans `_orch/inbox/*.answer.md`, applies what
   arrived, and unblocks.
4. An unanswered question at the final gate becomes a report line under
   **needs a human** — it never silently becomes an assumption.

Availability varies by Claude Code version and provider. **The disk protocol is
the contract; messaging is only a faster doorbell.** A run with `INBOX: off`
behaves identically, just with longer pauses.

---
