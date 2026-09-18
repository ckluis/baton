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
   blocks, and what the run will assume if it goes unanswered. Under §9.2 the
   phase runner writes it on a parked node's behalf, same shape.
2. The prime batches open questions at every gate and ships the batch with a brief
   (§8.1) — one page, three options per question, one recommendation.
3. At each gate the prime scans `_orch/inbox/*.answer.md`, applies what
   arrived, and unblocks.
4. An unanswered question at the final gate becomes a report line under
   **needs a human** — it never silently becomes an assumption.

Availability varies by Claude Code version and provider. **The disk protocol is
the contract; messaging is only a faster doorbell.** A run with `INBOX: off`
behaves identically, just with longer pauses.

**Two doorbells, one contract.** `INBOX: on` is the second session above. `TEAM:
github` (router §1) is a GitHub Issue: at each gate `tools/inbox-gh.py sync`
opens one Issue per `Q-<n>.md` that has none — a sub-issue of the run's Issue,
labelled `baton:blocked`, body verbatim — and reads each open one back. An
answer is a comment that begins `/answer`, or the comment that closes the Issue.
The tool copies it into `Q-<n>.answer.md` under a provenance block —
`answered_by`, `answered_via: github-issue`, `issue`, `comment_url`,
`answered_at` (the server's time), `synced_at` (measured, §7.1) — and closes the
Issue. The run reads the file, never the comment; a person who edits the file by
hand and a person who comments from a phone leave the same record.
`_orch/inbox/github.json` records which Issue rang for which question.

**Who may answer.** The Issue's assignee; anyone in `manifest.json`'s
`answerers:` list; if neither is set, any collaborator. An answer from anyone
else is written to the file with `unauthorized: true`, is **not** applied, is
not closed, and is surfaced in the next brief so the run neither ignores a
person nor obeys one it was not told to. The login is recorded in the answer
file and in the gate's ledger event row (§7.2) — better provenance than a
hand-edited file ever carried.

---
