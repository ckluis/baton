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

**The shape is fixed: one slide per decision.** The page is a deck. A final brief has one slide
for the result and one for each open question; a blocked brief has one per question. Every slide
is split at the golden ratio. The **wide side** carries only what a person needs to choose:

1. **A title** naming the decision, and a description of two to four sentences: what was asked,
   what happened, what is being decided.
2. **A visual**, only when it carries information a table cannot — the plan graph, a
   before-and-after, a timeline. Inline SVG, no external resources, no decoration. Most slides
   have none.
3. **Three options, A, B and C.** Exactly three. Each is a name and one sentence. The
   recommended one is marked. Fewer than three means the run has not looked; more is a menu,
   and a menu is work handed back. When only one option is real, B is *do nothing* — the default
   the run will assume per §10 — and C is *defer*, with the trigger that would reopen it.

The **rail** beside it carries what backs the choice: the reason for the recommendation and what
happens if the reader does nothing, stated as a consequence; each option's cost, risk and what it
settles; a **numbers table** whose every row shows the command that produced it, which is the
only place a number may appear; and the paths the slide rests on. The report's **needs-a-human**
list maps onto the deck one to one, as a slide or as a record row.

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
