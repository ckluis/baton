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

**Amendment, 2026-10-02, before any E1 run.** The harness builder found two flaws in the design above, and both
are fixed before the first model call:
- **Scale.** At one paragraph per envelope, arm A would end near 20K tokens of a 1M window, where nothing
  rots, so the test could not separate the arms. Each envelope now carries 60 routing-irrelevant detail lines
  (`gen.py --pad 60`), and arm A ends at about 252K tokens. The checkpoints and rotation points are unchanged.
- **Controls.** Every scored checkpoint was a trap where the obvious action is wrong, so a prime that learned
  "the obvious answer is never right" could score without remembering anything. Twelve **control**
  checkpoints are added, 6 per half, where the obvious action is correct. The prime sees all 36 numbered
  alike. `S` remains dependency accuracy over the 24 seeded checkpoints. **A run whose control accuracy is
  below 0.75 is flagged contrarian, reported, and excluded from its arm's mean.**

**E1b — the same test near the window (exploratory; pre-registered 2026-10-02, after E1 seed 1 came back 24/24
in every arm and before seeds 2–3 were scored).** If Opus 5.5 does not rot at 252K, the question that matters
for a long run is whether it rots near its 1M window. One seed per arm (`--seed 4`) with the padding raised so
arm A ends near 850K tokens. Arm A then sets `DISABLE_AUTO_COMPACT=1` and is allowed to fail at the window;
reaching the window is a result. B and C rotate at the same five points as E1. The rule is E1's, applied to
n = 1 and labelled exploratory: one seed cannot carry a verdict, only a direction. Cost and wall-clock per arm
are reported, because at this size they may decide the question even when accuracy does not.

**E1c — compaction depth, not context size (pre-registered 2026-10-02, before any E1c run).** E1 compacted 5
times per run, too few for summary-of-summary decay to show. The operator's work sessions, which run near a
billion tokens with subagents, compact dozens to hundreds of times, and there the choice is never "carry
everything". It is default compaction (B) against memory rotation (C). E1c tests that choice at depth, cheaply.
- **Shape:** fresh seeds 11, 12 and 13, `--pad 0 --rotate-every 4`. That gives **29 compactions per run**.
  Each dependency is planted so that it crosses 7–21 of them (mean 11.9, 16 of 24 crossing at least 10), and
  the context stays small.
- **Arms:** B and C only, 3 runs each, the prime `claude-opus-5-5` at medium. Rotation is mechanised as in E1.
- **Rule:** E1's, between B and C. **Memory wins** if `S(C) ≥ S(B) + 0.10`. **Memory loses** if
  `S(C) < S(B)`. Anything else is inconclusive. The contrarian exclusion applies.
- **Also reported:** accuracy on dependencies that cross at least 10 compactions, against those that cross
  fewer; and the count of `PARK`-instead-of-`DISPATCH` errors per arm. That error is the over-caution seen in
  E1's compacting arms (B seed 3, C seed 2), seen before this design was written.

**Defect found in E1's answer key, 2026-10-02, after E1 ran and before any E1c or E1b run.** Some DISPATCH-expected
checkpoints (controls, and some kind-b triggers) rested on one envelope claiming a node's needs were "DONE and
CONFIRMED", while the record did not show it: a need was BLOCKED, REFUTED, IDLE or never mentioned. By CONTRACT
§4.1, PARK was defensible on every one of them. The compacting arms parked on exactly those checkpoints, which is
how the defect surfaced; the uncorrected scores read as an over-caution bias, and that reading is withdrawn.
- **The audit:** `e1/audit_key.py` flags 4–6 such checkpoints per seed in seeds 1–3. The rule is the audit's,
  applied to every arm alike.
- **E1, rescored on the valid checkpoints** (`e1/rescore_audited.py`): **A = B = C = 1.000** on dependencies and
  controls, in all nine runs. **The verdict is inconclusive, a tie at the ceiling.**
- **The generator is fixed:** every DISPATCH checkpoint's needs are CONFIRMED in the record before it, enforced by
  a self-check. Seeds 4 and 11–13 were regenerated and audit clean, and E1c and E1b run on them unchanged otherwise.

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
