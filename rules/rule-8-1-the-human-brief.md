---
type: Rule
id: rule-8-1-the-human-brief
title: "8.1. The human brief — every gate that reaches a person ships one page for that person"
section: "8.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-8-gates
  - rel: relates-to
    to: rule-10-the-operator-lane
    note: the blocked batch is one of the two gates that carry a brief
  - rel: relates-to
    to: rule-8-2-every-blocking-decision-ships-a-slide
    note: 8.2 widens the trigger from these two gates to any decision that stalls work
---

### 8.1 The human brief

Two of the four gates reach a person: the **blocked batch** (gate 3) and the **final gate**
(gate 4). Each one ships, beside its written file, one HTML page written for that person:

| gate | brief | written from |
|---|---|---|
| blocked batch | `_orch/brief/blocked-<n>.html`, `<n>` the phase number of the gate | the batch's `_orch/inbox/Q-*.md` files, `manifest.json` |
| final gate | `_orch/brief/final.html` | `final/report.md`, `manifest.json`, `ledger.csv` |

Under `TEAM` (router §1) each brief has a **markdown twin** beside it —
`blocked-<n>.md`, `final.md` — one `##` section per slide, the same three
options, the same numbers with their commands, no styling. The gate posts it
as a comment on the run's thread (§8, §10), and a comment cannot carry a page.
The HTML is for a person opening the file; the markdown is for a person reading
the thread; both derive from the same record.

The brief is written by the **briefer** (`{BATON}/prompt/roles/briefer.md`) at frontier, spawned
by the prime inside the same gate, after the report or the batch exists. The prime's
closing message names the brief's path before the report's, because the brief is the page a
person opens first.

**Derived, never authoritative.** The report and the question files are the record. The brief
restates them for a reader who did not watch the run, and every claim in it cites a path under
`_orch/`. Its numbers are re-derived by command, not copied; where a re-derived number disagrees
with the record, the brief prints both and names the command, because that disagreement is the
tripwire that caught a stale count in this framework's own run. A brief that asserts something
neither the record nor a command supports is a defect in the brief. It is temporary by
construction: it lives under `_orch/`, gitignored with it (§6), and is disposed of with the run.

**One slide per decision.** The brief is a deck: a final brief has one slide for the
result and one per open question, a blocked brief one per question, and every slide
carries exactly three options with one recommended. The report's **needs-a-human**
list maps onto the deck one to one. Every path a person is to open is fully
qualified (§8.2). The briefer's role file fixes the shape, the look and the voice;
this rule fixes what the brief is for and what it may claim.

**Why a rule.** This framework's own final report is forty kilobytes and correct; its
operator asked, after reading it, what had been done and what to do next. A record that is
complete and unread has not reached anyone. The brief is the run spending one spawn so
the person does not spend an hour.
