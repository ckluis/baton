# baton v7 — the plugin

A Claude Code plugin with a mod (Claude Code 2.1.287 or later). It implements
`docs/designs/v7-mods.md`: a **prime orchestrator that never reads**, a **run memory** and a
**project memory** in place of a growing context, **rotation** into that memory, a **model
binding** per role, and a **run pane**.

```bash
claude --plugin-dir ./mod          # from the repo root; the mod hot-reloads on save
/baton start BUILD ./app           # in the session: arm the guard and start the prime
```

Tested with Claude Code **2.1.287**, **2.1.302** and **2.1.316** on macOS. The guard needs 2.1.287 or later.
The memory store needs `node` on `PATH`: the mod runs `bin/memo.mjs` for every memory read and
write.

## What is in it

| path | what |
|---|---|
| `.claude-plugin/plugin.json` | `baton` 7.6.0. The `userConfig` fields are `rotateAtPercent` (35), `wakeBudgetLines` (96) and `memoryDir` (`.baton/memory`). |
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
| `tests/*.test.ts` | `claude plugin test` (502 tests in 31 files) |
| `test/*.test.mjs` | `node --test mod/test/*.test.mjs` (141 tests; two run end-to-end fixtures, `test/fixtures/hooks-smoke.mjs` and `github-smoke.mjs`: the real hooks module under a fake runtime) |

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
falls back to a deterministic merge so the tree never stalls. A reply that talks about its own input
("the entries you pasted are truncated…") is rejected, asked once more with a stricter prompt, and
then replaced by the deterministic merge. Merges stay on Sonnet 5.5: a blind A/B against Haiku 5.5
on 20 real merges kept it (see `CHANGELOG.md`, v7.6.0). The CLI's `merge --summarize` takes
summaries on stdin; without that flag it uses the fallback.

The **run memory** lives in `<cwd>/_orch/memory`. The **project memory** lives in
`<project root>/<memoryDir>`, and the rulings are the namespace `ns/rulings` inside it.

### What a run looks like

- **The guard.** A run is active when `_orch/manifest.json` has `"prime": true` and no
  `"closed": true`, which is what `/baton start` writes. During a run, a `tool.call` with no
  `agentId` (the main loop) gets an allowlist: `Agent`/`Task`, `AskUserQuestion`, `SendMessage`,
  `ToolSearch`, the `baton:prime` skill, and `mcp__baton__*`. Any other tool is refused with the
  route. Subagent calls pass. If the guard throws, its `.catch` refuses the call: the guard fails
  closed. The other gating hooks have a `.catch` too: the command gate, forbidden files, pause, the
  phase gate, enforced rulings and checkpoints fail closed; notes and everything else fail open.
- **Run membership follows the session.** A session belongs to a run only if it started, resumed
  or compacted in the run's directory; that is recorded at `session.start`, keyed to the session
  id, and never re-read from the current directory, so a session that `cd`s into a run is not
  armed and writes no run notes. The manifest records the prime's session. A second interactive
  session started there while the prime is live is asked whether to take over: no leaves it
  unarmed with a line saying why, yes arms it and the first session's band says why it disarmed.
  A restarted session picks the run up. A headless second session is not armed either, but its
  start-up context still tells it that it is the prime (a gap, below).
- **Memory tools.** These are registered when a run is active at `session.start`, or when
  `/baton start` runs: `mcp__baton__memory_wake`, `memory_note`, `memory_zoom`, `memory_recall`,
  `memory_mark`, `project_wake`, `project_note`, `project_recall` and `project_mark`.
  `memory_note` takes an optional `tag`, sanitized like the text, which defaults to the caller's
  role.
- **Marks: ✅ confirmed, ❌ void.** `memory_mark <id> ok|void|clear "<reason>"` (and `project_mark`)
  marks a note or a summary with a one-line reason and who marked it; unmarked is the default.
  Nothing is deleted: a mark is an appended record. `memory_wake`, `memory_zoom`, the summaries and
  `memory_recall` skip a ❌ note, unless recall or zoom is called with `include_void`. A summary over
  a newly voided note reads `#lo-hi: rebuilding (a note was voided)` until the background rebuilds
  it without the note (its old text goes to a superseded log); a summary built only from ✅ notes
  shows ✅. A subagent and a session outside the run cannot mark, the prime cannot replace the
  operator's mark, and rulings are retracted, not marked. A note from a session outside the run is
  refused when it is written.
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
    is a run note (tag `approval`) saying what the command does (writes a file, pushes, runs), and
    a second note records its exit code, the files it wrote and the refs it pushed, so a heredoc
    that writes a file is not recorded as a push.
  - *Phase gate.* In an interactive session, a sub-orchestrator whose return leads with a DONE
    verdict is queued. The prime's next dispatch waits on a dialog: **Approve**, or type what is
    wrong to send the phase back, which refuses the dispatch and tells the prime to re-dispatch that
    phase with the reason. The band flags waiting phases; the Work tab can approve or send back.
- **Enforced rulings.** `/baton enforce <#> <regex>` attaches a pattern to a standing ruling. A
  `tool.check` hook then refuses any shell command matching it, run or no run, with the ruling's
  text. Retracting the ruling (`/baton retract <#>`, or **x** on the ruling in Memory) lifts it. Both are
  notes in the append-only `rulings` namespace, so the history stays.
- **The tracker.** Every level of a run moves through a fixed row of states, like a parcel:
  goal `queued → planned → building → reviewing → ready → merged`, PR `draft → checks → reviewed →
  ready → merged`, phase `briefed → dispatched → verified → approved`, node `red → green → blue →
  verified` (`working → verified` when exempt). Each state is **computed** from the record (the
  node's `work/red.txt`, `green.txt`, `blue.txt` and verdict, the phase's brief and envelope, the PR
  as `gh` reports it), never asserted. When a state moves, the mod writes one row to `_orch/track/`
  with the time it saw it, so how long each state lasted is measured. The Work tab draws each level
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
  up to date. New human comments become one line each through **Haiku 5.5** (`claude-haiku-5-5`)
  (`$.model.complete`), the only model call here. From allowed answerers (assignees, `answerers:`,
  or the PR author), `/approve P3`, `/send-back P3 <reason>` and `/approve <gate>` act as the remote
  gate. A command the gate holds while nobody is at the terminal is asked on the PR instead.
- **Hooks, not reminders** (ideas from [talos](https://github.com/benmarte/talos); no code used). In talos the
  orchestrator has to remember to run a script for the board, the cost, the budget; its own lessons
  log records a run where it forgot. Here each one is a hook:
  - **Spend is metered.** A `turn.step` hook reads every model request's usage, attributes it to the
    agent that made it (its role, and the node or phase in its name), and writes `_orch/spend.json`:
    tokens and a dollar cost per model (a 1-hour cache write at the 1-hour price), a total, and
    Claude Code's own session total with the part baton did not meter. Work shows tokens beside each stepper; the band shows the goal's total; the PR carries one spend
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
  by itself, unfocused (`autoPane`), at session start and when the first subagent spawns, on Work,
  where Claude Code places it (at 144 or more columns); where it does not, the band ends with
  `/baton opens the pane`.
  Spend is metered in every session; it is written to
  `_orch/spend.json` only in a run.
- **The agent table.** Work's agent list is a tree drawn as a table (see "The pane" below), one row
  per agent or phase: agent · context · trend · budget (the agent's own threshold) · model · input ·
  cache write · cache read · output · `this agent` cost and tokens · `roll-up` cost and tokens ·
  steps · state. Output is never cached, so caching shows as writes and reads on the input side.
  Columns drop from the least useful when the pane is narrow (`lib/table.mjs`); agent, model, both
  column groups, steps and state never drop. A subagent past its budget gets one message from the
  mod: finish, or split. A row with low cache reuse after eight requests is flagged.
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
  Work tab to send it back with a reason.
- **Review findings, linked.** A `CHANGES` review's findings are listed in Work, each a link
  to its line on the PR's branch.
- **Trend.** The agent table's `trend` column is each agent's context over its last eight requests.
- **Cheaper to run.** The tracker re-reads the record only when an agent's turn or tool call, a
  poll or an approval could have moved it (else once a minute); the pane skips the memory reads when
  no note was written; a message is sent to Sonnet for rulings only when it could state one. The
  rulings are read from a memo off the tool-call path, refreshed less often by the pane.
- **One file, by design.** The validator follows `$` only into functions declared in the same file,
  so the hooks module stays one `register.js`; pure logic lives in `lib/`.
- **Drill in.** In Work, every agent, phase, node, question and blocked row has a `›`: `↑`/`↓`
  moves over them, `Enter` opens a view in place, `b` goes back. An agent shows where it sits in the
  tree, its model and meter, the task it was given (the lessons the mod added shown apart), its last
  ten tool calls and what it returned; a phase its steps, brief, nodes and envelope; a node its
  done-criteria, its red, green and blue records, the verifier's row for each criterion and the
  lessons it left. In Memory, a ruling opens to the message it was lifted from and its enforcement.
  The views are `lib/detail.mjs`; `/baton show <P3 | T12 | an agent>` prints the same thing.
- **Updates.** Claude Code auto-updates a third-party marketplace only when you turn that on. So an
  installed baton checks for itself, at most every six hours: when a newer version is published,
  the band says so and `9` runs `claude plugin update baton@baton` (then `/reload-plugins`).
  `/baton doctor` reports the version. A checkout (`--plugin-dir`) updates with `git pull`.
- **The queue.** `/baton watch [label]` lists open issues labeled `baton`; `/baton next` archives a
  ready or merged run to `.baton/runs/<run-id>/` and starts the next issue.
- **The pane's two tabs.** **Work** (1) is everything happening: the goal and its PR as links,
  their steps, the merge-ready rows as one line with the queue line under them, the review's
  findings linked to their lines, the agent tree with the phases in it, what waits for you, and the
  newest rulings. **Memory** (2) is everything the run remembers: your rulings first (add, retract
  with **x**, enforcement shown), then the memory explorer. Switching tabs refreshes. There is no
  separate plan section any more: the phases are rows of the agent tree.
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
- **Interface.** `/baton` opens the pane (Work and Memory, above). `1` and `2` switch tabs, `r`
  refreshes, and the pane also refreshes every 5 s while open. The band above the prompt shows the
  context gauge, the threshold tick, the rotation count, the cost and the goal's state. The spinner
  suffix reads `· baton <phase> · <dispatched node>`. Where nothing draws (`claude -p`), `/baton`
  prints every tab as text. `/baton status`, `/baton rotate` and
  `/baton stop` print text everywhere.

### The pane (v7.6)

What each part of the pane does, as the tests pin it. Where a live check in Claude Code 2.1.316
first saw something else, the line says what was fixed and names the check after the fix; what is
still open is listed under known gaps in `CHANGELOG.md` (v7.6.0).

**Width, first.** The agent table wants about 110 columns. Claude Code 2.1.316 docks a pane at
about 73 columns in a 165-column terminal (at most 90), and draws it inline at the terminal's width
below 110 columns, and it squeezes every cell of a row wider than the pane into a `…`. So the
table is laid out for the width the pane is drawn at: droppable columns drop first, then the agent
label and the state are cut; the model, steps, `this agent` and `roll-up` cells and a row's indent
are never cut. A row still too wide for a narrow pane takes two lines, and the agent list counts
screen lines when it scrolls. At a docked width the legend, the goal line and the key hint are cut
at the pane's edge with `…`; in a pane that is both docked and short the list can push the lines
under it out of view (both known gaps).

**Layouts.** `strip` (the default, `DEFAULT_LAYOUT` in `lib/view.mjs`) is the two-line strip
above the prompt. The pane opens only when you dive in: `ctrl+x tab` focuses the strip, then `w`
opens Work and `m` Memory inline at full width, and `Esc` goes back to the strip. `panel` is the
side panel, docked and opening by itself. `/baton layout strip|panel` switches and saves the
choice in baton's own store (key `layout`), and `/baton layout` prints the current one. The strip
and the panel's key hint name the layout and the command that switches it where they have room.
When the layout does not match the renderer Claude Code reports (`isFullscreen`), one line under
the strip says what to type, `/tui default` or `/tui fullscreen`, and that Claude Code restarts
and resumes the session. baton writes no Claude Code setting.

- **The tree.** A dim legend line reads `the tree: prime › P<n>, a phase: a unit of the plan › its
  sub-orchestrator › agent (worker, verifier)`. The phase rows sit one level under the prime, in
  plan order; each phase's sub-orchestrator is a row of its own under its phase row, and its workers
  and verifiers under that. A phase that has not started is a dim `○ P<n>` row reading `pending`,
  with nothing under it. `p` shows the node rows under every phase row, and `p` again hides them.
  Opening a phase row opens the phase view: its steps, its nodes with their states, its spend.
  At 41670d5 the sub-orchestrator's indent was cut live at 165 columns (LV10 §4); after the fix it
  reads one level under its phase, seen live at 108 and at 73 columns.
- **Steps on every row.** The prime's row shows the goal's steps, a phase row the phase's
  (briefed → dispatched → verified → approved), a sub-orchestrator row its phase's, and a worker or
  verifier row its node's (red → green → blue → verified); a row that matches no node or phase
  shows its own lifecycle. An agent's view repeats them on its
  `its work` line with the state names and the time in the current state. At 41670d5, at 108
  columns, a phase row's stepper dropped a mark while its cells were cut (LV10 §6); after the fix
  all four marks are drawn, seen live at 108 and 73 columns.
- **`this agent` and `roll-up`.** The header groups two pairs of columns: `this agent` (the row's
  own cost and tokens) and `roll-up` (the cost and tokens of the row and everything under it). A
  phase row has no `this agent` figures, and an agent with nothing under it has no `roll-up`
  figures. Those empty cells draw nothing. At 41670d5 the cut table drew them as `…` live (LV10
  §10, §11); after the fix they are blank.
- **The model column.** Each agent's cell names the family and version of the model that served
  it, then its reasoning effort: `opus 5.5 · high`, `sonnet 5.5 · low`, `haiku 4.5`. An effort known
  only from the request is followed by a dim `cfg` (`opus 5.5 · high cfg`); with no effort known the
  cell is the model alone. An ID it does not know is shown in full. When the served model differs
  from the one requested or bound, or the served effort from the configured one, the cell turns
  red, and the agent's view and the `/baton` text show the requested and served full IDs. The column sizes to its widest
  cell, never under 10, and never drops. At 41670d5, before the prime's first turn, its cell was
  cut live to `opus 5.…` (LV8); after the fix it reads `opus 5.5` whole before the first turn too.
- **The prime's row.** In a run the main session's row is `◆ prime` and shows the session's own
  model. Outside a run it is `◇ session`, not `◆ prime`.
- **A key for every row.** Every agent and phase row (pending ones too), then every question and
  blocked row, has a letter of its own, shown like `1`, `2` and `r` (the hotkey in the accent, a
  colon, the label): `a` for the prime, then `c d e f …` top to bottom from the pool
  `a c d e f g h i j k l m n o q s t u v w y z` (no `b`, `p`, `r` or `x`). A row keeps its letter for
  as long as it exists, scrolled out of view or not, and across a reload and a restart; a later row
  takes the lowest free letter; past 22 lettered rows a row opens only by focus and Enter. Node rows
  have no letter and open by focus and Enter. The hint line names the focus keys in the same accent:
  `↑/↓ then Enter on › opens a row, or its letter does · ✉ messages a running one · p shows every
  node · b goes back`. From the Work list a row's letter opens it and Claude Code does nothing with
  the key. Inside an opened agent or phase view, a dim `rows a: c: d: …` line carries every row's
  letter, so a letter opens that row there too; the view's own keys (`b`, `r`, a brief's `a`, `y`,
  `w`) win. At 41670d5 Claude Code typed the letter into the prompt instead (LV9 §10); fixed and
  seen live after the fix.
- **The agent list scrolls.** The list takes the pane's full height and every agent stays listed;
  the old `… N earlier finished agents folded` line is gone. A finished row is dimmed, its ✓ or ✗
  keeping its colour. When the rows do not fit, `↑`/`↓` past the first or last row shown scrolls
  the list, `PageUp`/`PageDown` move it by a window, and `Home`/`End` go to its ends, the focus with them. Dim
  `↑ <k> more` and `↓ <k> more` lines stand for the hidden rows and carry their letters, and a
  running row scrolled out of the window is pinned in a strip at that edge, so running agents stay
  in view; a blocked row scrolls out like any other. A row scrolled into view opens like any other.
  At 41670d5, live, `End` moved the window to the end but left the focus on the row that had it,
  and `Home` did the mirror of it (LV15 §11). Claude Code holds a pane's focus by its place among
  the pane's elements, so after the redraw baton now asks it to put the focus on the first or last
  row; seen live after the fix, Enter then opens that row.
- **Questions and blocked nodes.** An open question (`_orch/inbox/Q-<n>.md` with no answer file) is
  a `?` row. It reads `? Q-<n> · queued for G<n> · <first line>`, dim, naming the gate that will
  put it, until the run's record shows it was asked (`_orch/inbox/Q-<n>.asked.md`); then it reads
  `waiting for you`, and only then does the band's `⚑ waiting for you` count it. Opening a `?` row (Enter or its letter) shows its
  brief, the question as written. In the brief `a` answers: Claude Code's dialog opens with the
  question's first line and its numbered options (or type under Other). The answer is written to
  `_orch/inbox/Q-<n>.answer.md`, never overwritten, the `?` row leaves the pane, and the prime gets
  a run note naming the asking node; an asking agent still running is also sent the answer as a
  message. Answering a queued question puts it first (`asked_via: pane`). A blocked row (a node whose
  envelope reads `BLOCKED` or `ESCALATE`, or an agent that returned `BLOCKED`) opens a brief that shows what the node is blocked on
  and its `Blocked by:` line. `y` approves once and `w` approves for the run, each the narrowest
  grant for that kind of block: at a command gate `y` approves that one command and `w` the gate for
  the run; an interpreted block is overruled with `y` and the node re-dispatched on the default it
  recommended. An explicit block, pause, a forbidden file or an enforced ruling has no approve key,
  and the brief says what must be fixed (or `/baton resume`). The run note to the prime carries the
  answer itself, and the pane wakes the prime with a prompt naming the question, the answer, its
  file and the node to dispatch again. At 41670d5 the note carried the question's first line and
  nothing woke the prime (LV13 §11); after the fix, live, the blocked node was dispatched again with
  the answer.
- **The memory explorer.** Memory draws the notes as a table with aligned columns: `id`, `mark`,
  `time` (local `HH:MM`), `source`, `text`. A summary row has a `+` and reads `(k notes) …`; `Enter` on
  its `+` drills into its children and `b` comes back out, one level at a time. The keys are shown like `1`, `2` and `r`: `c` marks the
  focused note ✅, `v` ❌ and `u` clears it; each asks `reason:`, and a dismissed dialog leaves the
  mark as it was and the hint line reading `no mark: a reason is needed`. The `v: ❌ void` button
  also marks by focus and Enter. `3` shows confirmed only and `4` void only; `s` switches between
  the run's memory and the project memory. A note's view lists its mark history and who marked it.
  On a ruling the hint reads `no mark: rulings are retracted, not marked`. At 41670d5, live, the
  note rows were aligned but a summary row was not: its id was cut to `#16-19…`, its empty mark
  cell drew `…`, and its text started two columns left of the `text` header (LV12 §1). After the
  fix a summary's id is whole, its mark cell blank and its text under the header, seen live.

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

**Re-checked 2026-10-19 on Claude Code 2.1.302:** `claude plugin validate mod` passes;
`claude plugin test mod` runs again (the rollout switch is on) and gives `44 pass, 0 fail` after
the tests caught up with v7.3–v7.5 (`$.ui.ask` is now a `tool.call` of `AskUserQuestion`, so the
approvals mock answers that; the code tools, the one-line band and the table's trend column);
`node --test mod/test/*.test.mjs` gives `83 pass, 0 fail`. Live, headless, in a scratch repo:
`/baton doctor` passes every check, `/baton start GENERIC ./` arms the guard, the prime's own
`Bash pwd` is refused with the route, a `baton:worker-cheap` subagent ran `ls -a`, its messages
report `claude-sonnet-5-5`, and `_orch/spend.json` meters the prime and the worker apart.

Every run below used Claude Code 2.1.287 in a temporary directory with
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

## The old "Not verified" list, checked live (v7.6)

Each item was driven on 2026-10-31 in a real interactive Claude Code 2.1.316 session through the
cmux CLI, in a scratch git repo under `$TMPDIR`, with the mod at the run tip. The screens and the
session record of each are under the evidence path named.

- **Automatic rotation at the threshold — verified.** With `rotateAtPercent` set to 7, a long answer
  took the band's gauge to `7%/7%`; with nothing typed, the mod logged `context at 7% (≥ 7%) —
  rotating the prime into memory`, the conversation compacted, and the mod logged `rotation #1
  (plugin)` and the band read `↻1`. The fork's handoff note was in the run memory, so
  `$.session.compact` off the clock is accepted in an interactive session. Evidence:
  `/Users/clank/Desktop/projects/baton/_orch/nodes/LV3/work/result.md` (screens 32, 33, 36).
- **Interactive `/baton rotate` and the ticker's compaction — verified.** At 5% context (threshold
  35%), `/baton rotate` answered `handoff noted; compacting as soon as this command returns
  (rotation #1)`, and a compaction followed with nothing typed; the mod logged `rotation #1
  (plugin)` and the band read `↻1`. No "could not compact" line appeared: the ticker's compaction
  is accepted, and the `/compact` fallback was not needed. Evidence:
  `/Users/clank/Desktop/projects/baton/_orch/nodes/LV4/work/result.md` (screens 09, 10, 12).
- **The kickoff prompt after an interactive `/baton start` — verified.** About 1 s after
  `/baton start`, with nothing else sent, the screen showed `› Prompt from the baton plugin` and the
  kickoff text, and the prime loaded `baton:prime` on it. Evidence:
  `/Users/clank/Desktop/projects/baton/_orch/nodes/LV1/work/result.md` (screens 05, 06).
- **The agentId runtime probe — verified with the fault injected.** A healthy 2.1.316 sends
  `agentId`, so the condition cannot occur on its own. In a scratch copy of the mod with `agentId`
  stripped from `tool.call` (the fault, Q-4 answer A), a subagent's `Bash` and `SubagentHandback`
  calls were refused as the prime's, and when it finished the transcript and `/baton status` showed
  `a subagent finished with no tool call carrying its agentId while prime-classified calls were
  refused — agentId detection may be broken on this build. The guard fails closed`. Evidence:
  `/Users/clank/Desktop/projects/baton/_orch/nodes/LV5/work/result.md` (screens 06, 07, 08).
- **The pane opening by itself at 144 or more columns, and the band's hint below that —
  verified.** At 165 columns the pane opened beside the transcript about 12 s after start, with no
  `/baton` typed. At 82 columns no pane was placed and the band ended with `/baton opens the pane`
  for the whole session. Evidence: `/Users/clank/Desktop/projects/baton/_orch/nodes/LV2/work/result.md`
  (screens 02, 05, 09).

## Other v7.6 checks seen live

The same way, one result each. Every line refuted at 41670d5 was fixed afterwards and checked
live again the same way; the after-fix screen is named beside the first evidence. What is still
open is listed under known gaps in `CHANGELOG.md` (v7.6.0).

| unit | what was checked | result | evidence |
|---|---|---|---|
| T3 | the band shows a cost covering every model that served | verified, as one total equal to `/cost` | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV6/work/result.md` §2 |
| T3 | `_orch/spend.json` shows a cost for every model that served | refuted at 41670d5, verified after the fix for every model baton meters: at 41670d5 it held token counts, no cost, and priced a 1-hour cache write as a 5-minute one; after the fix opus and sonnet carry a cost equal to `/cost`'s, the prime's 1-hour writes at the 1-hour price. Still open (known gap): Claude Code's own Haiku session-title request has no line of its own; it is inside the engine total and its unmetered part | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV6/work/result.md` §1; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX7/work/screens/after-fix.txt` |
| T7 | `cd` into a run arms nothing and writes no notes; a second session is asked, and if declined is not armed and says why; a takeover; a restart picks the run up; a headless second session is not armed | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV7/work/result.md` §1-§6, §8-§10 |
| T7 | that headless session's output says why it is not armed | refuted at 41670d5, verified after the fix: at 41670d5 its start-up context said it is the prime; after the fix it says the run has a live prime in another session and this session is not armed | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV7/work/result.md` §7; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX2/work/screens/after-fix.txt` and the headless case `/Users/clank/Desktop/projects/baton/_orch/nodes/FX2/work/screens/a3-01-headless-H3.txt` |
| T8 | the prime's row reads `opus 5.5` | refuted at 41670d5, verified after the fix: at 41670d5 cut to `opus 5.…` before the first turn; after the fix whole before it, and `opus 5.5 · high` whole at 73 columns | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV8/work/result.md` §1; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/after-fix.txt` and `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/A1-prime-165-before-first-turn.txt` |
| T9 | agent and phase rows open by Enter and by their letters, keys shown like `1`, `2`, `r`, no shared letter, `p` shows and hides node rows | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV9/work/result.md` §1-§9, §11-§13 |
| T9 | a row's letter opens it from inside an opened view | refuted at 41670d5, verified after the fix: at 41670d5 Claude Code typed the letter into the prompt; after the fix the letter opens that row and the prompt stays empty | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV9/work/result.md` §10; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX4/work/screens/after-fix.txt` |
| T10 | the legend, phase rows under the prime, distinct phase and sub-orchestrator rows, pending rows, the phase view, the column groups, roll-up tokens, no plan section, `p`, the queue line under the goal row | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV10/work/result.md` §1-§3, §5, §7-§9, §12-§16 |
| T10 | the sub-orchestrator's indent, the phase row's stepper, empty `this agent` and `roll-up` cells | refuted at 41670d5, verified after the fix: at 41670d5 cut in the squeezed table; after the fix the indent is whole, the stepper has four marks and the empty cells are blank, at 73 and 108 columns | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV10/work/result.md` §4, §6, §10, §11; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/after-fix.txt` (73 columns) and `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/after-fix.a2.txt` (108) |
| T11 | steps on the prime, sub-orchestrator, worker and verifier rows | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV11/work/result.md` §1-§4 |
| T12 | drilling into a summary and back, the keys shown and working | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV12/work/result.md` §2-§6 |
| T12 | aligned columns | refuted at 41670d5, verified after the fix: at 41670d5 refuted for summary rows (note rows were aligned); after the fix every summary's id is whole and its text starts under the `text` header | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV12/work/result.md` §1; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/after-fix.txt` (the fix group's screen; the memory table is in `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/B2-memory-top-108.txt` and `/Users/clank/Desktop/projects/baton/_orch/nodes/FX3/work/screens/B3-memory-end-108.txt`) |
| T13 | `?` and blocked rows open by Enter and by letter, their briefs, answering writes the file and removes the row, approving grants the narrowest thing, `queued for G<n>` then `waiting for you`, the band's count | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV13/work/result.md` §1-§10, §12-§22 |
| T13 | the answer reaches the asking node | refuted at 41670d5, verified after the fix: at 41670d5 the prime's note carried the question, not the answer, and the prime was not woken; after the fix the prime is woken with the answer and the blocked node, dispatched again, quotes it | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV13/work/result.md` §11; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX5/work/screens/after-fix.txt` |
| T14 | a note marked ❌ in the pane leaves `memory_wake`, `include_void` still finds it, the mark column, filters, keys, reason dialog, project memory | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV14/work/result.md` §1-§27 |
| T15 | the list fills the pane and scrolls, every agent reached, running rows in view, no fold line, PageDown, `↓ <k> more`, letters kept while scrolled and after a reopen | verified | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV15/work/result.md` §1-§10, §12-§16 |
| T15 | `End` moves the focus to the last row | refuted at 41670d5, verified after the fix: at 41670d5 the window moved and the focus stayed; after the fix `End` puts the focus on the last row and `Home` on the first, and Enter opens it | `/Users/clank/Desktop/projects/baton/_orch/nodes/LV15/work/result.md` §11; after the fix `/Users/clank/Desktop/projects/baton/_orch/nodes/FX4/work/screens/after-fix.txt` |

## Still not verified

- **Drawing in the Desktop app.** The pane and the band have now been seen in a real terminal
  (above); nobody has looked at them in the Desktop app.
- **Which wake channel fires,** and whether the prime's first act after an interactive rotation is
  `memory_wake`. No prompt was sent to the prime after the live rotations.
- **A sub-orchestrator bootstrap of a full run, a red/green/blue node checked by a verifier, and
  TEAM mode under v7.** None of these has been run with the v7 mod alone.

## Known risks

- **`e.agentId`** was undocumented on 2.1.287; by 2.1.299 the types document it on `tool.call`
  ("`agentId` names the loop"), and the 2.1.302 run above observed it. The guard fails
  closed: a call with no `agentId` is treated as the prime's. Before 2.1.287 it logs a notice
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
