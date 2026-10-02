# v7 — baton as a Claude Code mod: the design record

Written 2026-10-02 · Issue #42 · Builds on v6 (#41)

## The premise

v6 kept the accountability layer and cut the rationing. One thing it cut deserves to come back, in a form
current tools can enforce: **a prime orchestrator that never reads anything**, so its context holds
decisions rather than files, and the run lasts as long as the work does. v5 asked the prime not to read.
v7 makes it impossible, and gives the prime a memory instead.

Two outside pieces make this practical:
- **Claude Code mods** (v2.1.287+): plugin event handlers that run inside Claude Code and can deny a tool
  call, measure the context, compact a session, register tools and commands, call a model, and draw panes.
- **OptMem's ideas** (VictorTaelin/OptMem): an append-only log of one-line notes, a binary tree of
  summaries, an age-decayed fixed-budget wake view, and zoom and recall. OptMem ships no license, so baton
  **reimplements the ideas and copies no code.**

## Verified before designing (a spike, 2026-10-02, Claude Code 2.1.287, headless `claude -p`)

| need | mechanism | result |
|---|---|---|
| the prime cannot read | `tool.call` returns `{ deny }` | Read denied to the prime |
| tell the prime from a subagent | `tool.call`'s `e.agentId`: set for a subagent's call, absent for the prime's | confirmed. It is undocumented in the reference, so the mod checks it at load |
| measure context rot | `session.measure` + `$.session.usage().context` | `{ tokens, window, percent }` after every turn |
| a denied prime does not cheat | the deny reason names the dispatch route | the prime spawned a subagent. A naive Bash-only guard leaked, so v7 uses an **allowlist** for the prime |

## The architecture

```
prime (main session)  ── tools: Agent, memory_*, AskUserQuestion, SendMessage. Everything else denied.
  │   view of the run: memory_wake (fixed budget) + its current step
  ├─ sub-orchestrator (one per phase): reads, dispatches workers or does the work, returns ONE line + paths
  │    ├─ worker (frontier or cheap by node)
  │    └─ verifier (fresh, frontier)
  └─ luminary (optional): a reviewer with its own memory across runs
```

- **Run memory:** every envelope becomes one note of at most 280 bytes. Merges are compressed by
  `$.model.complete` on the cheap tier, never by a subagent. `memory_wake` prints a fixed-budget view:
  recent notes verbatim, older ones collapsed. `memory_zoom` and `memory_recall` open a stretch back up.
- **Rotation:** when `session.measure` reports the prime past a threshold, the mod writes a handoff note
  and compacts. After compaction (`SessionStart`, source `compact`) the prime is told to run
  `memory_wake` and continue. The prime's context then stays bounded however long the run is.
- **Project memory:** a second memory that spans runs: decisions, criteria fixtures, what failed before.
- **Luminaries:** each keeps its own memory of past reviews: what it found, what it missed, and what the
  verifier overturned. Ship them only if E2 says they beat a fresh plain reviewer.
- **The interface:** a run pane (graph, nodes, ledger, memory tree, luminaries), the phase and node on the
  spinner, a context gauge above the prompt, and `/baton` commands.
- **Binding:** `agent.spawn` enforces the model per agent type: Opus 5.5 for the prime, sub-orchestrators
  and verifiers; Sonnet 5.5 for cheap work.
- **What carries over from v6:** the envelope, the computed per-criterion verdict, refutation triage, the
  criteria linter, the escalation packet, the ledger with `served:`, the human questions, and TEAM mode.

## E1 — does the memory-rotating prime resist context rot? (pre-registered)

**The run.** A synthetic dispatch run of **120 envelopes**, fed to the prime one at a time as sub-orchestrator
returns. It carries **24 seeded long-range dependencies**, each planted at least 30 envelopes before it
matters. They come in three kinds:
- a node parked early whose answer arrives later
- an operator decision that changes a later route
- a criterion refuted twice that must go to a person, not be retried a third time

At each of 24 checkpoints the prime must state its next action. A **scripted oracle** that knows the rules and
the seeds scores the action right or wrong. No judge is involved.

**Arms**, 3 runs each, the prime always `claude-opus-5-5` at medium:
- **A, carry:** no compaction. The context grows for the whole run.
- **B, default:** Claude Code's own compaction at a forced low threshold.
- **C, memory:** the v7 mod, with the prime denied reads and rotating into `memory_wake` at the same threshold.

**Rule.** Let `S(x)` be checkpoint accuracy. **Memory wins** if `S(C) ≥ S(B) + 0.10` and
`S(C) ≥ S(A) − 0.05`. **Memory loses** if `S(C) < S(B)`. Anything else is inconclusive. The late half
(checkpoints 13–24) is reported separately, because rot shows late.

## E2 — do memory-bearing luminaries earn their place? (pre-registered)

**The setup.** **Eight review tasks** on one evolving codebase. Each carries 6 seeded defects:
- 3 **generic** (any careful reviewer can find them)
- 3 that violate **project conventions** stated nowhere in the code, only learnable from earlier reviews'
  outcomes. Example: "every handler must call `audit()`".

After each task, the ground truth is revealed **to the luminary's memory only**, as the verifier would reveal
it in a real run.

**Arms**, 3 replicates each:
- **L:** a luminary, `claude-opus-5-5` / medium, with its own memory carried across the eight tasks.
- **P:** a fresh plain reviewer per task, with no memory.
- **L0:** the same luminary card with its memory wiped before each task. This isolates memory from the card.

Scoring is blind, as in #37.

**Rule.** On tasks 5–8, **luminaries earn their place** if `R(L) ≥ R(P) + 1.5` seeded defects per task,
and `R(L) ≥ R(L0) + 1.0`. They are **cut** if `R(L) ≤ R(P) + 0.5`. Anything else is inconclusive. The
generic and convention defects are reported separately.

## What v7 does not do

It does not reintroduce lens cards, panels, tier ladders or per-node effort. v6's evidence on those stands.
