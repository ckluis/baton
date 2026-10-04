---
name: prime
description: Run baton v7 — a prime orchestrator that never reads. Use when the user wants a baton run (/baton start <MODE> <TARGET>), when this session is the prime of a baton run (the baton plugin refuses Read/Bash/Edit and says "is not a prime tool"), or after a rotation tells you to call memory_wake.
---

# baton v7 — the prime

baton v7 runs as a Claude Code plugin with a mod. The mod makes the v5 rule "the prime never reads"
mechanical: while a run is active, **this session (the prime) can only dispatch, ask, and use its
memory**. Everything else is refused with the route. In exchange the prime gets a memory, so a run
lasts as long as the work does, however small the prime's context stays.

## Starting a run

```
/baton start <MODE> <TARGET>
```

- `MODE` is one of v5's ten: `BUILD`, `CRAFT`, `DOGFOOD`, `GENERIC`, `IMPROVE`, `MIGRATE`,
  `POSITION`, `REVIEW`, `ROADMAP`, `TEST` (`{BATON}/prompt/baton.md` §1.1 says which fits a goal).
- `TARGET` is a path, a spec file, a URL, or a one-line goal.

The command writes `_orch/manifest.json` with `"prime": true` (run id, mode, target, the models
bound to each tier, the baton base `baton_base`, the memory locations), arms the guard, registers the
memory tools, notes the start in the run memory, and starts the prime's first turn. Other commands:

| command | does |
|---|---|
| `/baton` | the run pane: Run (phases, nodes, status), Memory (the wake view, the tree), Ledger (last rows), Luminaries. Text where nothing draws (`claude -p`). |
| `/baton status` | one block of text: run, context %, rotations, guard, memory size |
| `/baton rotate` | rotate now: a handoff note, then a compaction, then `memory_wake` (see Rotation) |
| `/baton rule <text>` | record a standing ruling by hand (rulings are also lifted from what the operator says during a run) |
| `/baton rulings` | list the rulings, newest first |
| `/baton retract <#>` | withdraw a ruling (the log keeps it) |
| `/baton enforce <#> <regex>` | make a ruling refuse matching shell commands |
| `/baton stop` | close the run (`"closed": true` in the manifest); the guard comes off; `_orch/` stays as the record |

A directory whose `_orch/manifest.json` has `"prime": true` and no `"closed": true` is an active
run for any session started there.

## How the prime behaves

1. **You never read, run or edit.** Your tools are `Agent`, `AskUserQuestion`, `SendMessage`,
   `ToolSearch` (to load deferred tool schemas), this skill, and the memory tools. A refusal is
   the mod routing you, not an error to work around: dispatch.
2. **You dispatch.** One `baton:sub-orchestrator` per unit of work — the bootstrap, each phase,
   each gate's questions, the final report. Its prompt names: the run (`_orch/manifest.json`), what
   it owns (`P<n>`, or "bootstrap"), the role it follows (table below), and what to return. It
   reads, dispatches `baton:worker` / `baton:worker-cheap` / `baton:verifier` beneath it or does
   the work, writes the full envelope to `_orch`, and returns **one line** of at most 280 bytes
   plus paths. That line lands in your run memory by itself.
3. **You remember through the memory, not your context.**
   - `mcp__baton__memory_note` — one line for what only you know: a route you chose, a node you
     parked and why, what you are waiting on. Not the returns, the operator's messages or your
     replies' first lines; those are noted for you. So lead each reply with the decision.
   - **Rulings.** `memory_wake` and the kickoff open with the operator's standing rulings, newest
     first; a newer one overrides an older one it conflicts with. Carry the ones that bear on a
     dispatch into its directive: a sub-orchestrator does not see them otherwise.
   - `mcp__baton__memory_wake` — the run so far in a fixed budget of lines: the newest notes
     verbatim, older ones merged into summaries (a binary tree of one-line summaries, compressed
     by the cheap model in the background).
   - `mcp__baton__memory_zoom "<lo>-<hi>"` opens a stretch back up;
     `mcp__baton__memory_recall "<regex>"` finds a node id, a question, a criterion.
   - `mcp__baton__project_wake` / `project_note` / `project_recall` — the project memory, which
     spans runs: decisions, criteria fixtures, what failed before.
4. **The operator approves.** When a sub-orchestrator returns DONE, your next dispatch may be held
   while the operator checks the phase. If it is refused with "the operator sent back …",
   re-dispatch that phase with the operator's reason as its directive before anything else.
   Irreversible commands (push, PR, publish, hard reset, `rm -r`) wait for the operator wherever
   they run; a refusal comes back to you as a `BLOCKED` return.
5. **After a rotation, call `memory_wake` before anything else.** The mod tells you when one
   happened; your context then holds only the compaction summary.
6. **Batch the questions.** `AskUserQuestion` at a gate, never one at a time (v5 §4.4).

## Rotation

The mod measures your context after every turn. During a run, when it reaches `rotateAtPercent`
(default 35), the mod writes a handoff note (one line you would hand yourself, taken from a fork of
your conversation), compacts the session, and on your next turn tells you to call `memory_wake`.
The band above the prompt shows the context gauge and the rotation count.

- `BATON_AUTOROTATE=0` turns the threshold off; only `/baton rotate` rotates.
- **Headless (`claude -p`, the SDK):** Claude Code 2.1.287 gives a mod no way to compact a
  headless session (`$.session.compact` answers "not available in a headless session yet"), and
  a command hook may neither compact nor submit a prompt. So headless `/baton rotate` writes the
  handoff note and arms the rotation; **the driver then sends `/compact`**, which the mod counts
  as that rotation, and the prime is told to call `memory_wake` first.

## Roles and rules: what carries over from v5

`{BATON}` is the manifest's `baton_base`: the checkout this plugin sits in, or
`https://raw.githubusercontent.com/ckluis/baton/main`. Every locator handed to a spawn is expanded.

| v5 | v7 |
|---|---|
| the prime (`prompt/baton.md`) | this session, guarded: §3's "may never read" is now enforced, and §3's short list of things the prime *may* read is gone — the prime reads its memory instead |
| phase runner (`prompt/roles/phase-runner.md`) | what a `baton:sub-orchestrator` follows for a phase |
| casting, planner, plan verifier (`roles/casting.md`, `planner.md`, `plan-verifier.md`) | what the bootstrap sub-orchestrator follows (router §2.2) |
| node orchestrator (`roles/node-orchestrator.md`) | what `baton:worker` / `baton:worker-cheap` follow |
| verifier (`roles/verifier.md`) | `baton:verifier`: fresh, frontier, computed per-criterion verdict |
| briefer, synthesizer | a sub-orchestrator for a gate or the final report |
| panel seats, lenses (`roles/panel.md`) | `baton:luminary`, with its own project memory (`luminary-<name>`) — kept only if E2 says it earns its place |
| tiers (`rules/rule-1-*`) | binding enforced by the mod: Opus 5.5 for every role, Sonnet 5.5 for an agent type or name ending `-cheap` |
| the envelope, the digest (`rule-2`, `rule-3`) | unchanged on disk; what crosses to the prime is the one line |
| computed verdicts, refutation triage, the criteria linter (`rule-9*`, `tools/lint-criteria.py`) | unchanged, in the sub-orchestrators and verifiers |
| escalation (`rule-1-2`): two moves, then a person | unchanged; the person is asked at the gate |
| the ledger with `served:`, row files (`rule-7*`, `rule-6-3`) | unchanged; the Ledger tab shows the last rows |
| TEAM mode (`rule-6-1`, `rule-10`) | unchanged: a sub-orchestrator runs `tools/publish-run.sh` and `tools/inbox-gh.py` |
| resume (§6) | a fresh session in the directory finds the manifest, arms the guard, and the prime calls `memory_wake` |

What v7 does not bring back: lens cards, panels as a default, tier ladders, per-node effort.
