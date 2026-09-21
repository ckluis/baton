# Migrating from baton v1 to v4.0

v1 was one prompt — 571 lines, pasted whole — with the prime on the top model
dispatching every task itself. It is kept exactly as it shipped at
[`baton-v1.html`](../baton-v1.html) and will stay there. Nothing in v4 reads a v1
run, and nothing needs to: the migration is not a conversion, it is a different
invocation.

## 1. The move itself

Stop pasting the prompt. Paste this instead:

```
# Goal
<what you want, in your own words>

# Process
Fetch and follow https://raw.githubusercontent.com/ckluis/baton/v4.0/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
```

The router reads your goal, proposes a mode, and asks you to confirm it. That is
the whole invocation; everything v1 made you carry by hand is now a file the agent
fetches when it needs it. For a team, add one line — `TEAM: github` under a
`# Settings` heading — and read [`prompt/invoke.md`](../prompt/invoke.md), "For a team".

## 2. What is different, in the order you will notice it

1. **Routing is a ladder of rungs, not tiers of models.** v1 assigned "the lowest
   tier that can succeed" and escalated one *model* per failure. v4 starts at
   `sonnet/medium` (rung 1) and escalates one *rung* — more thinking before a
   bigger model. The top of the ladder is behind `CEILING` (default 4) and is
   reached by asking, never by drifting. Expect the same work to cost less and
   the bill to say where it went (`rules/rule-1-the-ladder.md`).
2. **The prime dispatches phases, not tasks.** A forty-node run costs the prime
   four or five turns, not forty; a phase runner spends the rest. If you tuned
   v1 prompts to keep the prime's context alive, that tuning has nothing left to
   do (`rules/rule-0-layers.md`).
3. **The plan is a graph with typed edges, and convergence is a loop node with a
   declared exit.** v1's "iterate until good" prose is a `kind: loop` with a seen
   ledger (`rules/rule-4-the-graph.md`, `rules/rule-5-the-loop.md`).
4. **A verdict is computed per criterion, and a verifier must name its attack.**
   "Looks good" is a refutation of the verifier (`rules/rule-9-evidence.md`,
   `rules/rule-9-1-a-verdict-is-per-criterion-and-the-node.md`).
5. **Every decision that stalls work ships a slide.** You read one page, three
   options, one recommendation — not a forty-kilobyte report
   (`rules/rule-8-1-the-human-brief.md`, `rules/rule-8-2-every-blocking-decision-ships-a-slide.md`).
6. **The run's state is a directory of files, and under `TEAM` a git ref.** v1
   wrote `_orch/tasks/` and a `verify.sh`; v4 writes `_orch/nodes/<id>/`,
   `_orch/verify/`, and a ledger that is a directory of rows
   (`rules/rule-6-filesystem.md`, `rules/rule-6-3-append-only-lists-are-directories-of-rows.md`).

## 3. A v1 run in flight

There is no resume path from a v1 `_orch/` into v4: the task list, the
verifier script and the envelope shapes are different objects, not older
versions of the same ones. Finish the run under v1 — the page still works — or
start it again under v4 with the same goal. A v4 run that begins from a v1
run's *outputs* (the code it changed, the report it wrote) is the ordinary case:
point `TARGET` at them.

## 4. What did not change

The reason the tool exists. v1's problem was the bill, and v4's every rule is
about who pays for what: rungs, digests, envelopes, gates. If v1 worked for you,
v4 is v1 with the meter running visibly.
