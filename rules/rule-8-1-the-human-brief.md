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
---

### 8.1 The human brief

Two of the four gates reach a person: the **blocked batch** (gate 3) and the **final gate**
(gate 4). Each one ships, beside its written file, one HTML page written for that person:

| gate | brief | written from |
|---|---|---|
| blocked batch | `_orch/brief/blocked-<n>.html`, `<n>` the phase number of the gate | the batch's `_orch/inbox/Q-*.md` files, `manifest.json` |
| final gate | `_orch/brief/final.html` | `final/report.md`, `manifest.json`, `ledger.csv` |

The brief is written by the **briefer** (`{BATON}/prompt/roles/briefer.md`) at rung 2, spawned
by the prime inside the same gate turn, after the report or the batch exists. The prime's
closing message names the brief's path before the report's, because the brief is the page a
person opens first.

**Derived, never authoritative.** The report and the question files are the record. The brief
restates them for a reader who did not watch the run, and every claim in it cites a path under
`_orch/`. Its numbers are re-derived by command, not copied; where a re-derived number disagrees
with the record, the brief prints both and names the command, because that disagreement is the
tripwire that caught a stale count in this framework's own run. A brief that asserts something
neither the record nor a command supports is a defect in the brief. It is temporary by
construction: it lives under `_orch/`, gitignored with it (§6), and is disposed of with the run.

**The shape is fixed — 1-3-1 per decision.** A title. One paragraph, at most eighty words, on
what the run was asked to do and what it did. Then, once for a final brief and once per question
for a blocked batch:

1. **One problem.** The decision this section puts in front of the reader, as one declarative
   sentence naming the question file. A final brief with no decision states that plainly and the
   three options below are about what to do with the result.
2. **Three options.** Exactly three per decision. Each states what it is, what it costs, what it
   risks, and what it settles. Fewer than three means the run has not looked; more is a menu, and
   a menu is work handed back. When only one option is real, the other two are *do nothing* — the default
   the run will assume per §10 — and *defer*, with the trigger that would reopen it.
3. **One recommendation.** Which option, and the reason in one paragraph. Then what happens if
   the reader does nothing, stated as a consequence rather than a warning.

After the 1-3-1: a **numbers table** whose every row shows the command that produced it, the
**needs-a-human list** mapped one to one onto the report's, and a **visual only when it carries
information a table cannot** — the plan graph, a before-and-after, a timeline. Inline SVG, no
external resources, no decoration.

**The voice is not the contract's.** This contract is written for agents and argues as it
goes. The brief is written for a person and does not. Its standard: declarative sentences of at
most twenty-five words; active voice; a term defined the first time it appears; numbers in
tables, never in prose; no metaphor, idiom, irony, rhetorical question, or aside; no hedge
without the reason for it. A reader of fifteen with the terms defined should follow every
sentence.

**Why a rule.** This framework's own final report is forty kilobytes and correct; its
operator asked, after reading it, what had been done and what to do next. A record that is
complete and unread has not reached anyone. The brief is the run spending one rung-2 spawn so
the person does not spend an hour.
