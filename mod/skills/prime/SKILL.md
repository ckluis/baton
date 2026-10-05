---
name: prime
description: Run baton v7 — a prime orchestrator that never reads. Use when the user wants a baton run (/baton start <MODE> <TARGET>), when this session is the prime of a baton run (the baton plugin refuses Read/Bash/Edit and says "is not a prime tool"), or after a rotation tells you to call memory_wake.
---

# baton v7 — the prime

baton v7 runs as a Claude Code plugin with a mod. The mod makes the router's standing order "the conductor never plays a note"
mechanical: while a run is active, **this session (the prime) can only dispatch, ask, and use its
memory**. Everything else is refused with the route. In exchange the prime gets a memory, so a run
lasts as long as the work does, however small the prime's context stays.

## Starting a run

```
/baton start <MODE> <TARGET>
```

- `MODE` is one of the eight: `BUILD`, `DOGFOOD`, `GENERIC`, `IMPROVE`, `MIGRATE`, `REVIEW`,
  `ROADMAP`, `TEST` (`{BATON}/prompt/baton.md` §1.1 says which fits a goal).
- `TARGET` is a path, a spec file, a URL, or a one-line goal.

The command writes `_orch/manifest.json` with `"prime": true` (run id, mode, target, the models
bound to each tier, the baton base `baton_base`, the memory locations), arms the guard, registers the
memory tools, notes the start in the run memory, and starts the prime's first turn. Other commands:

| command | does |
|---|---|
| `/baton` | the run pane: Track (every level as measured steps), Agents (the live tree), Memory (a browser over the tree), Rulings, Ledger, Run. Text where nothing draws (`claude -p`). |
| `/baton start #12` | the goal is GitHub issue #12 (BUILD unless a mode is given): a draft PR closes it, a PR reviewer judges it |
| `/baton watch [label]` | list open issues labeled `baton` (or the label given) as the goal queue |
| `/baton next [#n]` | once this goal is ready or merged: archive `_orch/` to `.baton/runs/<run-id>/` and start the next issue |
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
6. **Batch the questions.** `AskUserQuestion` at a gate, never one at a time (router §4, step 4).

## A goal from GitHub

When the manifest names an `issue`, the goal is that issue and its output is one draft PR.

1. The bootstrap sub-orchestrator opens the run branch and the draft PR (`Closes #<issue>`), as its
   card says. The phases run as usual; each node lands as one commit with its verdict as a check.
2. After the last phase, **dispatch `baton:pr-reviewer`** with the PR number, the issue number and
   the round (1). It is fresh by construction and returns one line: `VERDICT READY` or `CHANGES`.
3. On `CHANGES`, **dispatch a sub-orchestrator as the PR steward** for that round. It turns the high
   and medium findings into a fix phase and returns. Then dispatch the reviewer again (round 2, 3).
4. On `READY`, the steward marks the PR ready for review. **Never merge.** At round 3 without
   `READY`, the steward writes a brief and you ask the operator.

The mod reads the PR with `gh` every couple of minutes and notes what changed: the reviewer's
verdict, merge-ready (every check green, `READY` with no high finding, no open thread, mergeable,
up to date), and one line per new human comment. Allowed answerers can act from the PR thread:
`/approve P3`, `/send-back P3 <reason>`, `/approve push` (for a command the gate held while nobody
was here). Those land in your memory like anything else.

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

## Roles and rules: what carries over from v6

`{BATON}` is the manifest's `baton_base`: the checkout this plugin sits in, or
`https://raw.githubusercontent.com/ckluis/baton/main`. Every locator handed to a spawn is expanded.

| v6 | v7 |
|---|---|
| the dispatcher (`prompt/baton.md`) | this session, guarded: §3's "never do object-level work" is now enforced, and §3's short list of things the dispatcher *may* read is gone — the prime reads its memory instead |
| the cycle for one phase (router §4: phase brief, dispatch, phase gate) | what a `baton:sub-orchestrator` does for a phase |
| bootstrap: directive, planner, plan verifier (the router's *Bootstrap*, `roles/planner.md`, `plan-verifier.md`) | what the bootstrap sub-orchestrator does |
| node orchestrator (`roles/node-orchestrator.md`) | what `baton:worker` / `baton:worker-cheap` follow, red then green then blue (§9.4) |
| verifier (`roles/verifier.md`) | `baton:verifier`: fresh, frontier, computed per-criterion verdict, red/green/blue checks |
| briefer, synthesizer, adjudicator, journey probe | what a sub-orchestrator spawns for a gate, the final report, a split verdict, a `surface: ui` node |
| tiers (§1) | binding enforced by the mod: Opus 5.5 for every role, Sonnet 5.5 for an agent type or name ending `-cheap` |
| the envelope (§2) | unchanged on disk; what crosses to the prime is the one line |
| computed verdicts, refutation triage, red/green/blue, the criteria linter (§9, `tools/lint-criteria.py`) | unchanged, in the sub-orchestrators and verifiers |
| escalation (§1.2): two moves, then a person | unchanged; the person is asked at the gate |
| the ledger with `served:`, row files (§7, §6.3) | unchanged; the Ledger tab shows the last rows |
| TEAM mode (§6.1, §10) | unchanged: a sub-orchestrator runs `tools/publish-run.sh` and `tools/inbox-gh.py` |
| resume (§6) | a fresh session in the directory finds the manifest, arms the guard, and the prime calls `memory_wake` |

What v7 removes: the expert library (lens cards, luminaries, casting, panels, `CRAFT`, `POSITION`), which v6 had already taken off the default path. A memory-bearing luminary matched a plain reviewer in E2 (`docs/designs/v7-mods.md`).
