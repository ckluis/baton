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
| `.claude-plugin/plugin.json` | `baton` 7.5.0. The `userConfig` fields are `rotateAtPercent` (35), `wakeBudgetLines` (96) and `memoryDir` (`.baton/memory`). |
| `hooks/register.js` | the hooks module: guard, memory tools, return notes, merges, rotation, binding, `/baton`, pane, band, spinner |
| `lib/memcore.mjs` | the memory core, pure (no Node): records, tree math, wake tiling, zoom, recall, merge prompt |
| `lib/memstore.mjs` | the core on disk (Node): fixed-width files, the lockfile, merges, views |
| `bin/memo.mjs` | the CLI over the store (node, no dependencies). The mod drives the store through it. |
| `lib/guard.mjs`, `lib/binding.mjs`, `lib/view.mjs` | the prime allowlist, the model binding, and the pane and band text, all pure |
| `lib/rulings.mjs` | ruling extraction prompt and parsing, retract and enforce, all pure |
| `lib/agents.mjs` | the agent tree (prime → sub-orchestrators → workers) and its pane rows, pure |
| `lib/approve.mjs` | the command gates, the phase gate, and how answers read, pure |
| `lib/ledger.mjs` | spend and the budget, forbidden files, the goal's label and board column, `Blocked by`, pure |
| `lib/detail.mjs` | the views Enter opens on an agent, a phase, a node or a ruling, pure |
| `lib/lessons.mjs` | lessons: from refuted rows to code areas, relevance to a spawn's prompt, pure |
| `lib/table.mjs` | the agent table: columns, widths, the drop order for narrow panes, pure |
| `lib/codeidx.mjs`, `bin/code.mjs` | the code index: symbol extraction per language, end lines, ranking; the CLI the code tools run |
| `lib/quiet.mjs` | quiet output: head, failures, tail, pure |
| `lib/track.mjs` | the tracker: each level's states computed from the record, measured transitions, steppers; the PR's merge-ready rows, the reviewer's comment, gate commands, pure |
| `agents/` | `sub-orchestrator` (also the PR steward), `worker`, `worker-cheap`, `verifier`, `pr-reviewer`. Plugin agents are `baton:<name>`. |
| `skills/prime/SKILL.md` | `baton:prime`: how to start a run, how the prime behaves, and how v6's roles and rules map onto v7 |
| `tests/*.test.ts` | `claude plugin test` (44 tests) |
| `test/*.test.mjs` | `node --test mod/test/*.test.mjs` (61 tests; two run end-to-end fixtures, `test/fixtures/hooks-smoke.mjs` and `github-smoke.mjs`: the real hooks module under a fake runtime) |

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
`<project root>/<memoryDir>`, and the rulings are the namespace `ns/rulings` inside it.

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
- **Operator notes and rulings.** Each prompt the operator sends during a run becomes a run note
  (tag `operator`). In the background, the cheap model reads it for a standing rule ("from now on…",
  "never…", a change of mind) and, if it finds one, writes it as one line to the project memory's
  `rulings` namespace. With no model answer, a marker check (`always`, `never`, `from now on`, …)
  stands in, and it errs toward missing a ruling. `memory_wake` and the kickoff open with the newest
  12 rulings, newest first, so the latest word wins without anyone editing a CLAUDE.md.
  `/baton rule <text>` records one by hand, and `/baton rulings` lists them. The idea is OptChat's
  (rulings "stick" from the log); the implementation is a namespace and a hook.
- **Prime replies.** When a prime turn ends, the first line of its answer becomes a run note
  (tag `prime-reply`), so the memory records why the prime dispatched what it did, not only what
  came back.
- **Approvals.** Two gates, on by default (userConfig `approvals`, `phaseGate`; `BATON_APPROVALS=0`
  turns both off):
  - *Command gate.* During a run, `git push`, `gh pr create|merge|close`, a release or package
    publish, `git reset --hard` / `git clean -f` / `git checkout -- .` and `rm -r` wait for the
    operator, from any agent at any depth. The question names the chain (`prime › P3 › T7 wants to
    git push`) and the top rulings. **Approve**, **Approve every … for this run**, **Refuse**, or a
    typed reason, which the agent reads as its refusal. With nobody to ask (`claude -p`, or the
    dialog dismissed) the command is refused and the agent is told to return `BLOCKED`. Each answer
    is a run note (tag `approval`).
  - *Phase gate.* In an interactive session, a sub-orchestrator whose return leads with a DONE
    verdict is queued. The prime's next dispatch waits on a dialog: **Approve**, or type what is
    wrong to send the phase back, which refuses the dispatch and tells the prime to re-dispatch that
    phase with the reason. The band flags waiting phases; the Agents tab can approve or send back.
- **Enforced rulings.** `/baton enforce <#> <regex>` attaches a pattern to a standing ruling. A
  `tool.check` hook then refuses any shell command matching it, run or no run, with the ruling's
  text. Retracting the ruling (`/baton retract <#>`, or **x** in the Rulings tab) lifts it. Both are
  notes in the append-only `rulings` namespace, so the history stays.
- **The tracker.** Every level of a run moves through a fixed row of states, like a parcel:
  goal `queued → planned → building → reviewing → ready → merged`, PR `draft → checks → reviewed →
  ready → merged`, phase `briefed → dispatched → verified → approved`, node `red → green → blue →
  verified` (`working → verified` when exempt). Each state is **computed** from the record (the
  node's `work/red.txt`, `green.txt`, `blue.txt` and verdict, the phase's brief and envelope, the PR
  as `gh` reports it), never asserted. When a state moves, the mod writes one row to `_orch/track/`
  with the time it saw it, so how long each state lasted is measured. The Track tab draws each level
  as a stepper with durations; a flagged step (refuted, blocked, changes, sent back) is red.
- **A goal from GitHub.** `/baton start #12` reads the issue with `gh` and makes it the goal
  (BUILD unless a mode is given), `TEAM: github`, run branch `baton/<run-id>`. The bootstrap opens a
  draft PR that closes the issue. After the last phase the prime dispatches `baton:pr-reviewer`, a
  fresh Opus reviewer that posts one structured comment (`<!-- baton:pr-review round=n -->`,
  `VERDICT: READY | CHANGES`, findings with `path:line`). On `CHANGES` a sub-orchestrator acting as
  the **PR steward** runs a fix phase, then the reviewer again, at most three rounds. On `READY` the
  steward marks the PR ready. baton never merges.
- **PR polling, no model.** Every `prPollSeconds` (120) during a run, `gh pr view --json …` gives
  state, checks, mergeability and comments. **Merge-ready** is computed like a verdict: every check
  green, the reviewer's latest verdict `READY` with no high finding, no unresolved thread, mergeable,
  up to date. New human comments become one line each through **Haiku 4.5**
  (`$.model.complete`), the only model call here. From allowed answerers (assignees, `answerers:`,
  or the PR author), `/approve P3`, `/send-back P3 <reason>` and `/approve <gate>` act as the remote
  gate. A command the gate holds while nobody is at the terminal is asked on the PR instead.
- **Hooks, not reminders** (ideas from [talos](https://github.com/benmarte/talos); no code used). In talos the
  orchestrator has to remember to run a script for the board, the cost, the budget; its own lessons
  log records a run where it forgot. Here each one is a hook:
  - **Spend is metered.** A `turn.step` hook reads every model request's usage, attributes it to the
    agent that made it (its role, and the node or phase in its name), and writes `_orch/spend.json`.
    Track shows tokens beside each stepper; the band shows the goal's total; the PR carries one spend
    comment, edited in place.
  - **A budget on rounds.** With `tokensPerGoal` set, `agent.spawn` refuses another review or fix
    round once the goal has spent it (a note at 80%), and tells the prime to brief the operator.
  - **The reviewer waits for a clean base.** A `pr-reviewer` spawn on a PR that conflicts with its
    base is refused: merge the base in first. A PR with no checks and a conflict is diagnosed as such.
  - **Forbidden files.** `git add` naming a secret, key or env file is refused outright, from any
    agent; a forbidden file in the PR fails merge-ready.
  - **More merge-ready rows:** the PR closes the issue, no other open PR claims it, and the main
    checkout is clean (a worktree's relative write leaking out shows here).
  - **The goal on GitHub.** Each goal state change sets one `baton:<state>` label on the issue and,
    with `boardProject`, moves the issue's card on a Projects board.
  - **Blocked by.** Open questions show the line they rest on and whether it is `explicit` (fix the
    cause) or `interpreted` (you may overrule it).
- **Always there, no command.** In any interactive session with the mod loaded, the band above the
  prompt carries plan usage (each rate-limit window the API reports: `5h`, `week`, a model's own week
  such as `Fable week`, a gateway's `spend`, with reset times) and the session's cost. The pane opens
  by itself, unfocused (`autoPane`), at session start and when the first subagent spawns, on Agents
  outside a run and Track inside one. Spend is metered in every session; it is written to
  `_orch/spend.json` only in a run.
- **The agent table.** Agents is a table, one row per agent: agent · context · budget (the agent's
  own threshold) · model · input · cache write · cache read · output · cost · steps · state. Output
  is never cached, so caching shows as writes and reads on the input side. Columns drop from the
  least useful when the pane is narrow (`lib/table.mjs`). A subagent past its budget gets one
  message from the mod: finish, or split. A row with low cache reuse after eight requests is flagged.
- **A code index, built in** (`bin/code.mjs`, `lib/codeidx.mjs`; codemunch's idea, MIT, baton's own
  code). `code_search`, `code_fetch`, `code_refs`, `code_explore` are registered in every session
  and answered in JavaScript, not by model steps. The index is warmed in the background at session
  start, and every query re-stats the tracked files and re-parses only the changed ones, so it is
  never stale and never set up or updated by hand. It lives in `.baton/code/` with its own
  `.gitignore`. The prime may not use the code tools: reading code is a subagent's job. A Read of a
  whole source file over `readHintLines` (300) runs as asked and carries a pointer to `code_fetch`.
- **Quiet output.** A shell result over `quietOutputLines` (400) is cut to its first 40 lines, up
  to 80 lines that look like failures, and its last 40; the whole output is saved to
  `_orch/out/` (or `.baton/out/` outside a run) and its path ends the result. `BATON_QUIET=0` or
  `quietOutputLines: 0` turns it off. Whether it and the code tools stay is pre-registered:
  `docs/experiments/code-tools-and-quiet-output-preregistration.md`.
- **Notifications.** A phase waiting for you, a PR ready to merge, a new question, a spent budget:
  a toast at once and a desktop notification (OSC 9, 99 or 777 for your terminal, else a bell) at
  the next Stop or Notification, once each.
- **One install.** The repository is a marketplace: `/plugin marketplace add ckluis/baton`, then
  `/plugin install baton@baton`. Nothing else to install, initialize or update.
- **`/baton doctor`**, also run in the background when a session starts: node, the git repository,
  `gh` and its login, ripgrep, the Claude Code version the guard is verified on, the project
  memory. A failed check that matters puts one red line in the band.
- **Pause.** `/baton pause` holds every new spawn and every gated command, from any agent, until
  `/baton resume`; running agents finish what they are doing. The band says so.
- **A new session picks the run up.** A session started or resumed in a directory with an active run
  is told it is that run's prime: load the skill, call `memory_wake` first, dispatch.
- **Lessons that stick** (`lib/lessons.mjs`). A verifier's REFUTED row becomes a lesson in the project
  memory's `lessons` namespace, tagged with the code areas it concerns. A worker or sub-orchestrator
  later spawned with a prompt touching those areas (or naming the node) gets the newest relevant
  lessons appended to its prompt at `agent.spawn`. Rulings are the operator's lessons for the prime;
  these are the verifiers' lessons for the agents.
- **Checkpoints.** Before `reset --hard`, `clean -f` or `rm -r` runs, the whole working tree
  (untracked files included) is committed to `refs/baton/checkpoints/<id>` through a temporary index:
  the branch, the index and the files do not move. `/baton checkpoints` lists them; `/baton restore
  <id>` puts the files back, after checkpointing the state it replaces.
- **One key.** With a phase waiting, typing `1` into an empty prompt approves it; `2` opens the
  Workspace to send it back with a reason.
- **Review findings, linked.** A `CHANGES` review's findings are listed in the Workspace, each a link
  to its line on the PR's branch.
- **Trend.** The agent table's `trend` column is each agent's context over its last eight requests.
- **Cheaper to run.** The tracker re-reads the record only when an agent's turn or tool call, a
  poll or an approval could have moved it (else once a minute); the pane skips the memory reads when
  no note was written; a message is sent to Sonnet for rulings only when it could state one.
- **One file, by design.** The validator follows `$` only into functions declared in the same file,
  so the hooks module stays one `register.js`; pure logic lives in `lib/`.
- **Drill in.** In Work, every agent, phase and node row has a `›`: `↑`/`↓` moves over them, `Enter`
  opens a view in place, `b` goes back. An agent shows where it sits in the tree, its model and meter,
  the task it was given (the lessons the mod added shown apart), its last ten tool calls and what it
  returned; a phase its steps, brief, nodes and envelope; a node its done-criteria, its red, green
  and blue records, the verifier's row for each criterion and the lessons it left. In Memory, a
  ruling opens to the message it was lifted from and its enforcement; `+` opens a memory block. The
  views are `lib/detail.mjs`; `/baton show <P3 | T12 | an agent>` prints the same thing.
- **Updates.** Claude Code auto-updates a third-party marketplace only when you turn that on. So an
  installed baton checks for itself, at most every six hours: when a newer version is published,
  the band says so and `9` runs `claude plugin update baton@baton` (then `/reload-plugins`).
  `/baton doctor` reports the version. A checkout (`--plugin-dir`) updates with `git pull`.
- **The queue.** `/baton watch [label]` lists open issues labeled `baton`; `/baton next` archives a
  ready or merged run to `.baton/runs/<run-id>/` and starts the next issue.
- **The pane's two tabs.** **Work** (1) is everything happening: the goal and its PR as links,
  their steps, the merge-ready rows as one line, the review's findings linked to their lines, the
  agent table, the plan as one line per phase (its steps, durations, how many nodes are verified,
  which are stuck, its spend; `p` opens every node and the full merge rows), what waits for you,
  and the newest rulings. **Memory** (2) is everything the run remembers: your rulings first (add,
  retract with **x**, enforcement shown), then the memory browser. Switching tabs refreshes.
- **The band is one line:** `5h ▕██░░░▏42% · wk ▕█░░░░▏18% · Fable ▕░░░░░▏3% · ctx ▕█░┊░░▏24%/35% ·
  ↻3 · $17.41 · #12 building · PR #47 5/6`. A second line appears only when something waits for you.
- **Rotation.** `session.measure` reports `context.percent` at or above `rotateAtPercent`. The mod
  writes a handoff note (one line from `$.model.fork`), then calls `$.session.compact` off the
  clock. Every compaction during a run is counted as a rotation. The prime is told to call
  `memory_wake` through three channels: `SessionStart` (source `compact`) `additionalContext`, the
  next prompt's `context`, and the next allowed tool result's `context`. Whichever comes first
  consumes it. `BATON_AUTOROTATE=0` turns the threshold off.
- **Binding.** During a run, `agent.spawn` sets `claude-opus-5-5` for every agent type and
  `claude-sonnet-5-5` for a type or `name` ending in `-cheap`, whatever model the caller asked for.
  Forks are left alone.
- **Interface.** `/baton` opens a pane with five tabs: Run, Agents, Memory, Rulings and Ledger.
  Keys 1–5 switch tabs, `r` refreshes, and the pane also refreshes every 5 s while open. The band above
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
| the mod's hooks behave | `claude plugin test mod` | `32 pass, 0 fail` before rulings. The 12 tests added since (`tests/rulings.test.ts`, `tests/approvals.test.ts`) are **not yet run**: on 2026-10-04 the mods rollout switch served off, and `claude plugin test` refuses to run. Their `ui.ask` mock follows the pattern of the other API mocks and is itself unverified. |
| the GitHub goal flow and the tracker, without Claude Code or GitHub | `node --test mod/test/github-smoke.test.mjs` | 26 checks against a scripted `gh`: start from an issue, computed states and measured rows, PR polling, the reviewer's verdict, merge-ready, remote `/approve`, a non-answerer ignored, a headless push asked on the PR, Track links, the band, watch and next |
| the hooks behave end to end, without Claude Code | `node --test mod/test/hooks-smoke.test.mjs` | 25 checks: the tree, the command gate (approve, reason, approve-for-run, headless refusal), the phase gate, enforce and retract, the Agents, Memory and Rulings tabs, the band, `-p` text |
| the memory core, store, CLI, locking, guard, binding and rulings helpers are correct | `node --test mod/test/*.test.mjs` | `36 pass, 0 fail` |
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
- **A sub-orchestrator bootstrap of a full run, a red/green/blue node checked by a verifier, and
  TEAM mode under v7.** None of these has been run.

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
