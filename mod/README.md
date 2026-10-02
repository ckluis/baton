# baton v7 — the plugin

A Claude Code plugin with a mod (Claude Code 2.1.287 or later). It implements
`docs/designs/v7-mods.md`: a **prime orchestrator that never reads**, a **run memory** and a
**project memory** in place of a growing context, **rotation** into that memory, a **model
binding** per role, and a **run pane**.

```bash
claude --plugin-dir ./mod          # from the repo root; the mod hot-reloads on save
/baton start BUILD ./app           # in the session: arm the guard and start the prime
```

Tested with Claude Code **2.1.287** on macOS. The mods surface is early access, so pin that.
The memory store needs `node` on `PATH`: the mod runs `bin/memo.mjs` for every memory read and
write.

## What is in it

| path | what |
|---|---|
| `.claude-plugin/plugin.json` | `baton` 7.0.0-dev. The `userConfig` fields are `rotateAtPercent` (35), `wakeBudgetLines` (96) and `memoryDir` (`.baton/memory`). |
| `hooks/register.js` | the hooks module: guard, memory tools, return notes, merges, rotation, binding, `/baton`, pane, band, spinner |
| `lib/memcore.mjs` | the memory core, pure (no Node): records, tree math, wake tiling, zoom, recall, merge prompt |
| `lib/memstore.mjs` | the core on disk (Node): fixed-width files, the lockfile, merges, views |
| `bin/memo.mjs` | the CLI over the store (node, no dependencies). The mod drives the store through it. |
| `lib/guard.mjs`, `lib/binding.mjs`, `lib/view.mjs` | the prime allowlist, the model binding, and the pane and band text, all pure |
| `agents/` | `sub-orchestrator`, `worker`, `worker-cheap`, `verifier`, `luminary`. Plugin agents are `baton:<name>`. |
| `skills/prime/SKILL.md` | `baton:prime`: how to start a run, how the prime behaves, and how v5's roles and rules map onto v7 |
| `tests/*.test.ts` | `claude plugin test` (32 tests) |
| `test/*.test.mjs` | `node --test mod/test/*.test.mjs` (31 tests) |

### The memory

One memory is one directory. Each note is a fixed-width record of 320 bytes: a timestamp, a
16-byte tag, at most 280 bytes of UTF-8 text, then a sentinel `|\n`. A torn write is never read as
a note, and note *i* is read with one seek to `i × 320`.

The summaries form an aligned power-of-two tree. Block `(k, i)` covers notes
`[i·2^k, (i+1)·2^k)`, and level `k` lives in `tree/L<k>.dat` at record `i`. A block is complete
exactly when `(i+1)·2^k ≤ n`. The pending-merge queue is every complete block with no summary,
lowest level first. A block is ready when its two children exist.

`wake` starts from the canonical tiling, which is the fewest aligned blocks. It then splits blocks
one at a time until the budget is spent. A block with no summary yet is split first. After that,
the split goes to the block that is largest relative to its age, `size / (n − start)`, with ties to
the newer block. The newest notes come out verbatim, and older ones fall into blocks sized roughly
in proportion to their age. `zoom lo-hi` tiles a sub-range the same way, and `recall` is a
case-insensitive regex over notes, tags and summaries.

Writers take an `O_EXCL` lockfile. A lock is broken when its PID is dead or the lock is older than
30 s. Readers never lock. The tests check that eight concurrent writers lose and tear nothing, and
that three concurrent mergers write each summary once.

Merges run in the background on `$.clock`. The mod sends each ready block's two children to
`$.model.complete` on `claude-sonnet-5-5` with a strict ≤280-byte prompt. If no answer comes, it
falls back to a deterministic merge so the tree never stalls. The CLI's `merge --summarize` takes
summaries on stdin; without that flag it uses the fallback.

The **run memory** lives in `<cwd>/_orch/memory`. The **project memory** lives in
`<project root>/<memoryDir>`, and a luminary's memory is the namespace `ns/luminary-<name>` inside it.

### What a run looks like

- **The guard.** A run is active when `_orch/manifest.json` has `"prime": true` and no
  `"closed": true`, which is what `/baton start` writes. During a run, a `tool.call` with no
  `agentId` (the main loop) gets an allowlist: `Agent`/`Task`, `AskUserQuestion`, `SendMessage`,
  `ToolSearch`, the `baton:prime` skill, and `mcp__baton__*`. Any other tool is refused with the
  route. Subagent calls pass. If the guard throws, its `.catch` refuses the call: the guard fails
  closed.
- **Memory tools.** These are registered when a run is active at `session.start`, or when
  `/baton start` runs: `mcp__baton__memory_wake`, `memory_note`, `memory_zoom`, `memory_recall`,
  `project_wake`, `project_note` and `project_recall`.
- **Return notes.** When a subagent the prime dispatched returns, its first line becomes one run
  note, tagged with its role. The line comes from its `SubagentHandback` call where the harness
  has one, and otherwise from `turn.complete`'s `answer`.
- **Rotation.** `session.measure` reports `context.percent` at or above `rotateAtPercent`. The mod
  writes a handoff note (one line from `$.model.fork`), then calls `$.session.compact` off the
  clock. Every compaction during a run is counted as a rotation. The prime is told to call
  `memory_wake` through three channels: `SessionStart` (source `compact`) `additionalContext`, the
  next prompt's `context`, and the next allowed tool result's `context`. Whichever comes first
  consumes it. `BATON_AUTOROTATE=0` turns the threshold off.
- **Binding.** During a run, `agent.spawn` sets `claude-opus-5-5` for every agent type and
  `claude-sonnet-5-5` for a type or `name` ending in `-cheap`, whatever model the caller asked for.
  Forks are left alone.
- **Interface.** `/baton` opens a pane with four tabs: Run, Memory, Ledger and Luminaries. Keys
  1–4 switch tabs, `r` refreshes, and the pane also refreshes every 5 s while open. The band above
  the prompt shows the context gauge, the threshold tick, the rotation count, the note count and
  the phase. The spinner suffix reads `· baton <phase> · <dispatched node>`. Where nothing draws
  (`claude -p`), `/baton` prints every tab as text. `/baton status`, `/baton rotate` and
  `/baton stop` print text everywhere.

## For experiment E1

- **Tool names.** `$.tool.register` produces exactly `mcp__baton__memory_wake`,
  `mcp__baton__memory_note`, `mcp__baton__memory_zoom` and `mcp__baton__memory_recall`, plus
  `mcp__baton__project_{wake,note,recall}`. With `ENABLE_TOOL_SEARCH=false` they appear in the
  init event's tool list. `--tools` does not filter them, because it filters built-ins only.
  `AskUserQuestion` is absent in `-p`, and the init list names the Agent tool `Task` while
  `tool.call` sees `Agent`; the guard allows both. They are registered only when a run is active
  at session start (`_orch/manifest.json` with `"prime": true`), or after `/baton start`, which
  takes effect from the next prompt.
- **`BATON_AUTOROTATE=0`.** The measured threshold never rotates. Only `/baton rotate` does.
- **`/baton rotate` headless.** On 2.1.287 a mod cannot compact a `-p` or SDK session.
  `$.session.compact` answers *"not available in a headless (-p / SDK) session yet: compaction
  here runs inside a turn (a /compact prompt)"*. A `command.run` hook (and anything it schedules)
  may neither compact nor `$.prompt.submit`, because the host check says *"it would compact under
  the turn this hook is holding"*. A dropped prompt still emits a `result`, so holding the next
  prompt would desynchronise a driver. Headless `/baton rotate` therefore writes the handoff note
  and arms the rotation. **The driver then sends `/compact`.** That produces the ordinary
  `compact_boundary` (trigger `manual`), the mod counts it as rotation *n* ("baton rotate +
  /compact"), and the prime is told to call `memory_wake` first. This was verified live (see below).
  Arms B and C therefore compact by the same mechanism.
- **`/baton rotate` interactive.** The command returns, and a ticker that `session.start` started
  calls `$.session.compact`. The ticker exists because a compaction started from inside the
  command's frame is refused.

## Verified

Every run here used Claude Code 2.1.287 in a temporary directory with
`--plugin-dir mod --model claude-sonnet-5-5`.

| claim | how | result |
|---|---|---|
| the manifest and hooks validate | `claude plugin validate mod` | `✔ Validation passed` |
| the mod's hooks behave | `claude plugin test mod` | `32 pass, 0 fail` |
| the memory core, store, CLI, locking, guard and binding are correct | `node --test mod/test/*.test.mjs` | `31 pass, 0 fail` |
| the prime is denied `Read` during a run | headless `claude -p`, fake `_orch` | denied, with the route text |
| the prime can spawn an agent, which can read | same run | `baton:worker-cheap` read `secret.txt` and returned the word |
| the binding applies | same run | the subagent's messages report `claude-sonnet-5-5` (`-cheap`) |
| `memory_note` and `memory_wake` work, and the files exist | same run, then `memo wake` on `_orch/memory` | note #0 is on disk, and wake printed it |
| a dispatched agent's return is noted automatically | stream-json run | `#0 [worker-cheap] Smoke test worker: OK-ALPHA 7731`, taken from its `SubagentHandback` |
| the handoff note comes from a fork | stream-json run | a one-line handoff, tagged `handoff` |
| background merges on the cheap model | stream-json run | `1 summaries` after the second note |
| headless rotation produces a `compact_boundary`, and the prime wakes first | stream-json: note → `/baton rotate` → `/compact` → "Continue the run" | `compact_boundary` (manual, 25,433 → 2,472 tokens). The mod logged "rotation #1 (baton rotate + /compact)". The prime's first action after it was `mcp__baton__memory_wake` |
| `/baton start` and `/baton` headless | stream-json, no model call | the manifest was written (`baton_base` is the local checkout), the start was noted, and the text pane printed |
| tool names and `ENABLE_TOOL_SEARCH=false` | the init event of `-p "/baton status"` | the four `mcp__baton__memory_*` tools are listed |

## Not verified (interactive UI only, or not reached)

- **Drawing.** The pane, the band and the spinner were checked only through
  `claude plugin test`'s `$.ui.mount` on terminal and desktop: the trees validate, the tabs switch,
  and the text is right. Nobody has looked at them in a real terminal or in the Desktop app.
- **Automatic rotation** (the threshold, then `$.session.compact` off the clock) and
  **interactive `/baton rotate`** (the ticker). Headless sessions cannot compact from a mod, and
  these paths were exercised only in `claude plugin test`. Whether the ticker's compaction is
  accepted in an interactive session on 2.1.287 is untested. If it is refused, the session logs
  why, and `/compact` still completes the rotation.
- **The kickoff prompt after an interactive `/baton start`.** The ticker submits it. Headless, the
  kickoff text rides in the command's output instead.
- **Which wake channel fires.** In the live run the prime called `memory_wake` first, but the stream
  does not show whether `SessionStart`'s `additionalContext` or the prompt's `context` carried the
  instruction.
- **The agentId runtime probe.** The mod logs a notice when a subagent finishes with no tool call
  carrying its id while prime-classified calls were being refused. This path was never triggered.
- **Luminary memory in a real review, sub-orchestrator bootstrap of a full run, and TEAM mode under
  v7.** None of these has been run.

## Known risks

- **`e.agentId` is undocumented** in the mods reference. It is declared in the 2.1.287 types
  (`AgentLoop` on `ToolCallInput`), and the spike and these runs observed it. The guard fails
  closed: a call with no `agentId` is treated as the prime's. On another version it logs a notice
  at load. If a future build drops the field, subagents get refused and the run stops loudly; it
  does not leak.
- **Auto-mode classifier.** In `auto` permission mode, an early smoke run that told the prime "if
  Read is denied, do what the denial says" had its dispatch blocked as *"[Auto-Mode Bypass]"*. The
  deny text now describes routing ("is not a prime tool … delegates by design"). A real prime
  dispatches without first trying to read, and the later runs dispatched fine. A run in auto mode
  could still hit this if the prime reads first and then dispatches the same read.
- **Rotation mechanics depend on the build.** Today headless rotation needs the driver's
  `/compact`. If a later build allows `$.session.compact` in headless sessions or from commands,
  the mod already tries a direct compaction first.
- **The handoff fork reads the whole conversation,** system reminders included. In one run the
  handoff line picked up a remark about OAuth connectors. The cost is one cached fork call per
  rotation.
- **The ToolSearch allowance.** The prime needs `ToolSearch` to load deferred schemas, so it is on
  the allowlist. It reads no files.
