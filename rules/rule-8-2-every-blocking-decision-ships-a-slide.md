---
type: Rule
id: rule-8-2-every-blocking-decision-ships-a-slide
title: "8.2. Every blocking decision ships a slide, not only the two gates"
section: "8.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-8-gates
  - rel: relates-to
    to: rule-8-1-the-human-brief
    note: generalises 8.1's two gates to any decision that will stall work
  - rel: relates-to
    to: rule-10-the-operator-lane
    note: a question written to the inbox is the record; the slide is how it reaches a person
  - rel: relates-to
    to: rule-9-2-refutation-triage
    note: a parked UNSETTLEABLE node is a blocking decision and earns a slide
---

### 8.2 Every blocking decision ships a slide

§8.1 gives a brief to two of the four gates. That was too narrow, and the gap has a
shape: **a decision that reaches a person as prose in a terminal is a decision that
can be scrolled past.** Everything else in this contract exists so work does not
depend on someone having been watching at the right moment. A question does not get
an exemption from that.

So the trigger is not the gate. The trigger is the consequence:

| the decision | what it gets |
|---|---|
| work stalls until a human answers | **a slide** — §8.1's shape, in the run's brief |
| the run continues either way | a ledger row (§7) and a report line |

That is the whole rule. A `BLOCKED` node mid-phase, a node that hits `CEILING` on
escalation (§1.4), a `SPLIT` the decomposer cannot resolve alone, a node parked on an
`UNSETTLEABLE` criterion (§9.2), a confound a phase runner discovers in its own
protocol — each stalls work, so each earns a slide. A drift, a streak, an accepted
caveat, an index refresh that failed: none of them stall anything, so none of them
gets a page.

**The split is the point, and it is what makes this affordable.** Deciding *what* the
decision is, *why* it is a decision, and what the three real options are needs the
run's whole context and belongs to the layer holding it — the prime at a gate, the
phase runner inside a phase. Rendering it needs none of that context. So the
expensive layer writes the question, the shape and the three options into
`_orch/inbox/Q-<n>.md`, and a **rung-2 briefer** turns that into the page. A layer
that writes its own HTML has spent rung-3 tokens on typing (§1.3), and a layer that
skips the page because writing one felt like ceremony has handed the decision back as
prose.

**A slide that schedules a decision has not made one.** The options on a slide are what to
*do*. Options about **who decides** — *a human labels them / defer to a fresh agent* — or about
**what order to decide in** — *answer Q-1 first / answer everything now* — settle nothing: the
reader picks one, and the real question is still open, now with a round trip spent on it. Both
shapes are the same error, which is a slide that has scheduled work instead of dispatching it.

The test is mechanical. Read the recommended option and ask what changes on disk when the
operator picks it. If the honest answer is *"we then decide"*, the slide is a defect and the
decision underneath it is the one that needed the page.

So: put the **real** decisions on slides, one each, even when there are four of them and they
rhyme. Four label calls are four decisions, not one decision about labelling. A question the
operator must answer gets its own slide carrying the question, not a slide asking which question
to take first. The exception is narrow and real — when **sequencing genuinely is the decision**,
because the order changes the outcome and not merely the calendar, the slide says so and names
what the chosen order forecloses.

Observed, again, in this framework's own replay run. The final deck asked *who should label
`P121`'s four unsettleable rows* and *which parked question to answer first*. The operator
answered both in one line, and both of the underlying decisions — the four labels, and `Q-1`
itself — were still open afterwards and had to be put back to them. Two slides, one round trip,
nothing settled.

**Batching still applies and is not weakened.** §8.1's blocked batch is how slides
reach a person: they accumulate into one deck at the next gate rather than
interrupting six times (§4, *batch, do not interrupt*). One slide per decision, one
deck per gate. A slide written mid-phase waits in the deck; it does not page anyone.

**The deck is cumulative across the run.** A decision answered at phase 2's gate keeps
its slide, marked with the answer and the path to the `Q-<n>.answer.md` that settled
it. A reader at the final gate can see every choice the run put to a person and what
came back, which is the record the closing message cannot carry.

**Naming, and this is not a detail.** Every path a brief prints for a person to *open* —
in the page's record rows, in a question file, in the closing message — is **fully
qualified from the filesystem root**. `_orch/brief/final.html` is a path a reader must
first resolve against a working directory they may not have;
`/Users/you/project/_orch/brief/final.html` opens. A relative path in a document meant
for a person is a defect in the document.

The one exception is a path **inside a command**. §8.1 requires every number to show the
command that produced it, and that command has to stay runnable exactly as printed, so it
keeps whatever paths it needs. The deck states the working directory once, in the header,
and the commands are relative to it. A command rewritten to absolute paths for tidiness is
a command nobody checked.

**The closing message does not restate the deck.** §5 already says the prime's closing
message is small. This is why: if the message re-narrates the slides, the page it just
named becomes redundant and the decisions land back in the terminal, which is the
failure this rule exists to prevent. Name the path, give the verdict, stop.

**Why a rule.** In this framework's own replay run, five decisions needed a human. All
five were correctly written to `_orch/inbox/`, and a four-slide brief was correctly
built for them at `_orch-replay/brief/final.html`. The prime then listed all five in
its closing message as prose, and the operator — who had watched the entire run —
asked why no slides had been produced. The page existed. It had been buried by the
layer that commissioned it. Neither the briefer nor the rule was at fault; §8.1 simply
had nothing to say about what the commissioning layer must *not* do afterwards.
