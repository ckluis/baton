# baton

**v4.0** · An orchestrator of orchestrators, rebuilt around what it costs.

baton is a router prompt. You paste it into a fresh session, fill eight lines, and
it turns that session into a multi-agent run with a budget: a plan on disk, a
default rung most work never leaves, escalation measured in rungs instead of
models, adversarial verification that has to name the attack it tried, and a
report that ends by telling you where the money actually went.

Add one line — `TEAM: github` — and the same run belongs to a team: its state on a
git ref any machine can resume, its questions as Issues anyone can answer from a
phone, its product changes as draft pull requests with the verdict as a check.

**→ [Read the page](https://ckluis.github.io/baton/)** ·
[Changelog](CHANGELOG.md) ·
[Migrating from v1, v2 or v3](MIGRATING.md) ·
[baton v1](https://ckluis.github.io/baton/baton-v1.html) ·
[luminaryTeam](https://ckluis.github.io/luminaryTeam/)

---

## Why v3

v3's change is not another cost story: the roster and the two new modes exposed a
structural gap — every mode baton had examined the artifact **as built**, and
nothing examined it **as encountered** or **as sold**. And separately, the checks
themselves became accountable: a verdict is now computed per criterion rather
than asserted, and every acceptance check carries an instrument record with a
lifetime yield.

| | v2 | v3 |
|---|---|---|
| **Modes** | 8, all examining the artifact as built | **10** — `CRAFT` as encountered, `POSITION` as sold |
| **Built-in personas** | 28 | **44**, plus a 40-expert roster that is opt-in, never built-in |
| **Persona conflicts** | Conflict Vectors in prose | **361 typed `links:` edges** a caster can act on |
| **Acceptance checks** | run, unmeasured | **10 instrument records** — what each guards, what it caught, when it last fired |
| **Verdicts** | one asserted per node | **one computed row per done-criterion**, four row verdicts — `UNSETTLEABLE` for a line no work could meet — and a mismatched row count reads `PARTIAL` |
| **What the operator reads** | a forty-kilobyte report | **one page per decision**: three options, one recommendation, the numbers with their commands, beside the report |
| **Bundle interop** | none | optional `type` / `id` / `links` keys, validated at **AIX level 1** |
| **Where a rule lives** | inline in a 663-line contract, restated in three or four other places | **one file each** under `rules/` — 49 of them, contracts down to 85 lines |

- **A vendored 40-expert roster.** `personas/luminaries/` ships named domain
  experts with explicit `phases` and `tags`, because a roster that declares
  neither is locked out of most seats and matches no upgrade hint.
- **Two modes.** `CRAFT` examines the artifact as encountered, `POSITION` as
  sold — 24 seats between them, every one backed by a built-in lens, so both
  run with `PERSONAS: none`.
- **Every rule is a file.** `rules/` holds 49 of them as OKF/AIX concepts with a
  stable `id` and typed links; the contracts are narrative plus a **generated**
  index. There is nowhere to amend a stale copy of a rule because there are no
  copies, and `tools/rules.py` refuses a duplicate id, a dangling link, a stale
  index, a citation to a rule that does not exist, or a rule heading surviving in
  a contract. `bundle.sh` concatenates them, so the paste is unchanged.
- **Checks that answer for themselves.** Every acceptance check now carries an
  Instrument record, a `guards` edge, and a lifetime yield. The one that
  mattered most turned out to be unsound and reporting the right answer by
  luck; it was repaired, fixtured, and it immediately found what it had hidden.

**Five breaking changes** — see [MIGRATING.md](MIGRATING.md). If none of them
touch you, the migration is changing one URL.

---

## v4.0 — since v3.3

baton for a team, without moving the run off the runner's disk. The instinct was "put the state
in GitHub Issues so it scales to many people"; the numbers said no — one run writes ~3,500 state
files and rows against a 500-per-hour content-creation cap — and the rules said no too
(`rules/rule-6-1-framework-locators-vs-run-state.md`: run state is always local disk). Split
GitHub into its three primitives instead and each piece of `_orch/` has an obvious home.

- **One structural change, and it is the breaking one.** The four files more than one layer
  appended to — the ledger, `lint-feedback`, `ux-debt`, `plan/decisions` — are now directories of
  rows, one file each, with the old file derived by `tools/lists.py derive`. Everything else under
  `_orch/` was already written by exactly one layer under a path that names it, so this makes the
  whole layout conflict-free: two runners on two machines can each add a row and neither can
  clobber the other. A run in flight needs one command, `lists.py split`, and `derive` refuses to
  overwrite a file that holds rows its directory does not, so forgetting costs a refusal and never
  a row. The derivation reproduces this framework's own 230-row ledger to the byte
  (`rules/rule-6-3-append-only-lists-are-directories-of-rows.md`, `migrations/from-v3.md`).
- **`TEAM: github` — git is the record.** `_orch/` becomes a worktree of the run's own ref,
  `baton/run/<id>`, committed by the layer that received each envelope and pushed at every node
  close and gate. Still local disk, still every path a rule names; and every path a verdict cites
  gains `/blob/<sha>/_orch/…`, any machine resumes with a fetch, and the evidence outlives the
  laptop (`rules/rule-6-1-framework-locators-vs-run-state.md`, `tools/publish-run.sh`).
- **Issues are the human lane.** Every blocked question becomes an Issue — a sub-issue of the run's
  — that anyone on the repository answers by commenting `/answer …`; at the next gate the answer
  is copied into `Q-<n>.answer.md` under a provenance block, and the run reads the file exactly as
  it always did. Who may answer is the assignee, a list in the manifest, or anyone; anyone else is
  recorded and not obeyed (`rules/rule-10-the-operator-lane.md`, `tools/inbox-gh.py`).
- **Pull requests are the product changes.** A product-writing node runs on a branch,
  `baton/node/<run-id>/<node>`, with a draft pull request, and its computed verdict lands on the
  branch as the commit status `baton/verify` with a link to the rows that decided it. The branch
  is the landing — nothing can die with a worktree any more — and the merge node the plan names is
  the pull request's merge (`rules/rule-4-the-graph.md`,
  `rules/rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies.md`, `tools/node-pr.sh`).
- **A gate publishes**, in a fixed order the gate's envelope names: sync, derive, publish, post the
  summary, publish the deck (`rules/rule-8-gates.md`). Protection is configuration: a ruleset on
  `baton/**` blocks force-pushes and deletions, a secret scan gates every push, and disposal
  archives to a release before the ref is deleted, so permalinks keep resolving
  (`tools/github-setup.sh`).
- **Every tool is proven without touching GitHub.** `tools/test-team.sh` runs the lot against
  throwaway repositories and a fake `gh` — thirty checks. It caught two defects in the design as
  briefed before either reached a rule: a ref cannot nest under another ref, and the first
  derivation could have overwritten a v3 ledger (`docs/designs/github-native-team-mode.md`).

Single-user mode is byte-identical with the line absent. What comes next — an Actions-hosted
runner, phases as matrix jobs — is configuration rather than code because of the first bullet.

---

## v3.3 — since v3.2

Two additions, both about the framework's own footprint rather than a new capability — the
kind of change you make once the tool-using runtimes (Claude Code, Codex, OpenCode) outnumber
the paste-into-a-fresh-chat runtime baton was designed for first.

- **The prime stops reading the whole rulebook before it does anything.** Every spawn below the
  prime already fetches a rule on demand, through the contract footer's "read it if you need a
  rule you do not already have" (`rules/rule-11-contract-footer.md`). The prime was the one layer
  still reading all of them up front. It now reads the three rules it cites by id —
  `rule-6-filesystem`, `rule-8-1-the-human-brief`, `rule-8-2-every-blocking-decision-ships-a-slide`
  — plus its mode file, and fetches any other the same on-demand way. A pasted bundle is
  unaffected: `bundle.sh` still concatenates every rule, and a paste has no per-file cost to defer.
- **`tools/index.py --sqlite`.** The same corpus `index.json` already derives from — nodes,
  verdict rows, the ledger, questions, findings — also as a disposable SQLite file, so a
  cross-cutting question ("which criterion failed twice") is a `WHERE` clause instead of a
  one-off script. Same contract as the two files it already writes: DERIVED, NEVER AUTHORITATIVE,
  stdlib only, deleted and rebuilt on every run.

A third idea — demoting the acceptance checks and mechanisms this run's instruments show as
never-fired — did not make this release. `tools/*.instrument.md` already carries a considered
answer to that exact question (`dormant_because: never-fired` is a status, not a judgment,
recorded per check), and overriding it needs new evidence, not a smaller rulebook.

---

## v3.2 — since v3.1

Six additions, all from running baton on itself: eight days of the self-run, then a replay of the
eighteen nodes that run refuted at the top rung, then an independent review of the replay.

- **A verifier can say a checklist line is unsettleable.** Besides `CONFIRMED`, `REFUTED`
  and `UNTESTED`, a per-criterion row may read `UNSETTLEABLE`: no execution inside the node
  could have met the line as written — an enumeration with no generating command, a measure
  of the tree or branch, a false premise, a contradiction in the handoff, or a form an answer
  already superseded. The row must name the shape and carry the command that proves it, or it
  counts as `REFUTED`. The node then parks on an operator question proposing a bounded
  rewrite instead of escalating to a costlier model. In the self-run, a third of traceable
  refutations were the criterion being wrong, and one bad line cost fifteen spawns
  (`rules/rule-9-2-refutation-triage.md`).
- **Every gate that reaches a person ships a brief.** The blocked batch and the final gate
  write `_orch/brief/<gate>.html` beside their record: one slide per decision, split at the
  golden ratio. The wide side carries a title, a description, a visual only when a table
  cannot carry it, and three options A, B and C with the recommended one marked. The rail
  beside it carries the reason, what happens if you do nothing, each option's cost, risk and
  what it settles, a numbers table whose every row shows its command, and the paths. Plain
  technical English by rule. The report stays the record; the brief is what you open first
  (`rules/rule-8-1-the-human-brief.md`, `prompt/roles/briefer.md`).
- **Every blocking decision ships a slide, not only the two gates.** The trigger is the
  consequence: work that stalls until a person answers earns a slide; work the run continues past
  earns a ledger row. The layer holding the context writes the question and three options to
  `_orch/inbox/Q-<n>.md`, a rung-2 briefer renders the slide, your answer lands beside it as
  `Q-<n>.answer.md`, and the run reads it at its next gate. The deck is cumulative and every path
  it asks you to open is absolute. A slide that only schedules a decision — who decides, what order
  — is a defect: read the recommended option and ask what changes on disk. One token file,
  `prompt/brief-tokens.css`, is the whole house style (`rules/rule-8-2-every-blocking-decision-ships-a-slide.md`).
- **A worktree node lands its outputs before the worktree dies.** A node isolated in its own git
  worktree writes its products there, and the worktree is removed when it closes. Now the layer that
  made the worktree copies every output under `work/tree/` first and checks each copy. In the replay
  a node's fourteen files died with its tree and eight of its ten criteria became unverifiable at
  any rung (`rules/rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies.md`).
- **Settle it in isolation before you call it unsettleable.** A criterion that reads the tree or
  the branch is retried once in a private worktree holding the node's commit plus the node's own
  work and nothing else. It settles, or it names what no tree can hold — a branch pointer, a tag
  list, the index — as the new shape `reads-immutable-ref`. And an answer's rewrite may narrow a
  criterion but may not add a literal the finished artifact was never asked for
  (`rules/rule-9-3-settle-it-in-isolation-before-you-call-it-unsettleable.md`, `rules/rule-9-2-refutation-triage.md`).
- **Two more linter rules, and a linter that reads the right section.** `tools/lint-criteria.py`
  now flags a criterion that demands a success token from a check that only prints failures, and a
  before/after contrast whose before-state nothing can reach; it reads the harness script rather
  than matching words, and a fan-out handoff is scored on its own criteria rather than its
  children's. Twenty-one selftest cases. `tools/index.py --state-root` indexes a run whose state is
  not under `_orch/`.
- **The replay experiment ran, and reported inconclusive.** Nine work-class nodes at rung 6: not one
  first-try `REFUTED` row, every non-confirmation an environment or protocol row, and the
  pre-registered rule lands in its own inconclusive band once its own instrument is used. The
  criterion-class arm returns capability-independent on the rule's words. What the run mostly
  measured was its own harness, and the rules above are what it taught
  (`docs/experiments/replay-refuted-at-rung-6.md`, "Result").

---

## Lineage: v1 → v2

Everything above stands on this, and none of it was undone.

v1 worked. The bill was the problem.

The v1 prime ran on the top model and dispatched every task itself, so a
forty-node run cost forty top-tier turns before a single line of work happened.
Then it spent the top tier again on planning, again on synthesis, again on every
mediator and adjudicator it needed. None of that was wrong. All of it was
expensive in the same direction.

v2 kept the architecture and rebuilt the routing, and v3 changed none of it.

| | v1 | v2 |
|---|---|---|
| **What you paste** | one prompt, 571 lines | a router of 242 lines + the mode you asked for |
| **Routing** | 4 model tiers | 6 rungs of model × effort |
| **Default** | "assign the lowest tier that can succeed" | `sonnet/medium`, and a written reason to start higher |
| **Escalation** | one model tier per failure | **one rung** per failure — more thinking before a bigger model |
| **Dispatch** | prime dispatches every task | prime dispatches **phases**; a phase runner dispatches nodes |
| **Top tier** | used for planner, synthesizer, mediator, decomposer | **gated behind `CEILING`** — reached by asking, not by drifting |
| **Convergence** | described in prose | a `kind: loop` node with a seen ledger and a declared exit |
| **Plan** | a task list with `blocked_by` | a graph with `needs` / `informs` / `refutes` edges |
| **Panel lenses** | hardcoded strings per mode | persona files, loadable from any repository |
| **End users** | persona cards written ad hoc | a first-class `kind: user` with a perception contract |
| **Blocked questions** | ask, then stop | answer the run while it runs |
| **Cost feedback** | none | a ledger per spawn and a rung histogram in the report |

---

## The ladder

Model and reasoning effort collapse into one ordered list. This is the entire
routing system.

| # | rung | for |
|---|---|---|
| 0 | `haiku/low` | Mechanical, verifiable by command. **Assignment only** — escalation never lands here. |
| 1 | `sonnet/medium` | **The default.** Bounded implementation against a clear spec. |
| 2 | `sonnet/high` | The same work when it needs more thinking, not a bigger model. |
| 3 | `opus/medium` | Diagnosis and judgment. |
| 4 | `opus/high` | The ceiling for ordinary work. |
| 5 | `fable/low` | Requires operator approval. Adjudication, whole-run synthesis. |
| 6 | `fable/medium` | Requires operator approval. The last rung. |

One failure moves a node **one rung**, never one model. Rung 1 failing buys more
thinking before it buys a bigger model, and that single change is where most of a
run's savings come from.

Assigning high wastes budget on work that would have succeeded low. Assigning low
costs one extra attempt. The asymmetry is the whole argument: **assign low.**

---

## The layers

```
PRIME              fable/low      never reads work.  ~1 turn per phase
PHASE RUNNER       opus|sonnet    owns one phase.    reads envelopes only
NODE ORCHESTRATOR  assigned rung  does the work, or spawns workers
WORKER             assigned rung  leaf. writes artifacts + a 10-line digest
```

Paths and a rung go down. An envelope comes up. Nothing else crosses a layer —
which is what the digest is for, and why the prime's context survives to the
final gate.

The phase runner is the change that pays for v2. It absorbs dispatch, retry,
verification, and rung drift so the prime spends its turns on gates alone.

---

## Modes

A mode is a file: the directive, the graph skeleton, the loop definitions, the
entry rungs, the seats, and the gates. The session loads only the one you name.
Adding your own mode means adding a file.

The eight modes v2 shipped all examine the artifact **as built** — its code, its
tests, its plan, its journeys. Nothing examined it **as encountered**, and
nothing **as sold**. `CRAFT` and `POSITION` close that gap, and neither is
allowed to ship a diff.

Each mode's page section carries a risograph drawing that **is** that mode's
graph — TEST's directed loop around its seen ledger, BUILD's traceability fan
with the one requirement that stops at the ambiguity gate, IMPROVE's lit region
and the hatched blindspot beside it, REVIEW's five sealed contexts with no edges
between them, DOGFOOD's persona-by-journey matrix with its unprobed cells,
MIGRATE's two discovery passes and the crescent only the second one found.

| mode | does | refuses |
|---|---|---|
| `TEST` | Adversarial sweep + fix loop until two rounds find nothing | Retry-until-green wrappers. Flaky tests are bugs. |
| `BUILD` | A spec honored, traceability first, ambiguities batched before build | Guessing at an ambiguity |
| `IMPROVE` | Audit → blindspot hunt → rank → behavior-preserving execution | Drive-by refactors |
| `REVIEW` | The adversarial panel as its own mode; ranked matrix out | Executing anything |
| `DOGFOOD` | Simulated users drive the product, screenshots-only perception | Fixing what it finds |
| `CRAFT` | Adversarial panel audits the experienced surface — type, colour, motion, microcopy, IA, accessibility, localisation — captured first, ranked matrix out | Driving journeys (DOGFOOD's subject). Fixing anything it finds. |
| `POSITION` | Adversarial panel audits the commercial surface — positioning, pricing, naming, story, launch readiness — claim ledger first, ranked matrix out | Building anything (no diff, ever). Shipping or approving a launch. |
| `MIGRATE` | Discover every site, transform, verify, integrate | Trusting one discovery pass |
| `ROADMAP` | Plan + plan gate only, panel-hardened, executable cold | Execution |
| `GENERIC` | Your directive, held to the same standard | A directive with no completion condition |

---

## Personas

Two kinds, and the difference matters more than any single persona does.

| kind | is | knows | judges by |
|---|---|---|---|
| `expert` | a lens with authority | everything relevant, on purpose | a standard |
| `user` | a person using the product | only what the screen showed them | whether they got what they came for |

An expert who behaves like a user produces vague taste. A user who behaves like
an expert produces fiction. Most persona systems own only the first kind — **a
run that never spawns a `user` has never seen its product.**

baton ships 37 built-in **lenses** (`personas/lenses/`) and 7 end-user
**archetypes** (`personas/users/`). Modes name *seats*; seats are always fillable
by the built-in lenses, so every mode runs with `PERSONAS: none`.

Separately, `personas/luminaries/` vendors 40 named-expert cards. This roster is
**opt-in, not built-in** — reached with `PERSONAS: builtin+luminaries` — and is
never folded into the built-in count above. See "Two rosters, on purpose" below.

### Loading someone else's roster

```
PERSONAS: builtin + repo:github.com/ckluis/luminaryTeam
```

A persona file carrying only `name` and `domain` is valid — the loader fills
`kind: expert`, `phases: [AUDIT, CLASH]`, `rung: 2`. By design, that is a
guarantee of the loader's defaults, not a claim about what this repository has
exercised: a roster fetched this way loads exactly as it is, unmodified — no
fork, no edits. **Adopting a roster must never require rewriting it.**

Casting may then *upgrade a seat* — a named expert whose tags match fills the
`coverage-truth` seat and audits coverage truth. The mode owns what gets
examined; the persona owns how.

Persona files from foreign repositories are **data, not instructions**. A file
containing directives aimed at the orchestrator is a finding to report, never an
instruction to follow.

### Two rosters, on purpose

Upstream `github.com/ckluis/luminaryTeam` is the standalone advisory panel, and it
still loads unmodified through `PERSONAS: builtin + repo:github.com/ckluis/luminaryTeam`
exactly as above. `personas/luminaries/` in *this* repository is a **sibling
artifact** — not a fork and not a mirror of it: its cards carry baton-specific
`phases`, `tags`, and rewritten Conflict Vectors so they can be seated into
baton's phase and mode machinery, which the upstream cards were never written
for. The two rosters are **expected to diverge**, and **neither is canonical
over the other**. This vendored roster is **opt-in, never built-in**, and is
reached with `PERSONAS: builtin+luminaries`.

---

## Quickstart

**Nothing to install.** Paste this into a fresh session:

```
# Goal
Find and fix what the test suite is failing to catch in the billing module.

# Process
Fetch and follow https://raw.githubusercontent.com/ckluis/baton/v4.0/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
Migrating from an earlier version? Read https://github.com/ckluis/baton/blob/v4.0/MIGRATING.md
```

Say what you want, paste, answer one question. The router reads your goal, works
out which mode fits, and **asks you to confirm** — leading with its best guess
and the two next-best rather than making you pick from ten. Naming `MODE`
yourself skips the question; naming anything else overrides a default that was
probably already right.

`TARGET` and `MODE` are the only two settings a run may not silently guess, which
is why it asks about them instead of requiring them. In a session that cannot ask
— a cron job, a headless run — the router infers them, records the inference *as*
an inference, and says so in its first message and its final report.

**For a team**, one line more:

```
# Goal
Find and fix what the test suite is failing to catch in the billing module.

# Settings
TEAM:        github

# Process
Fetch and follow https://raw.githubusercontent.com/ckluis/baton/v4.0/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
```

It needs `gh` authenticated on the machine that runs the prime, the tools on disk
(`git clone --depth 1 https://github.com/ckluis/baton`, then `BATON: ./baton`),
and a private target repository — or a private `RUNS_REPO: owner/name`. One-time
repository setup is `tools/github-setup.sh --apply`. See
[`prompt/invoke.md`](prompt/invoke.md), "For a team", for what moves and why.

### How it resolves

Every path in every baton file is relative to wherever the router came from.
That one rule is the whole locator scheme:

- **A URL** — the framework fetches itself, file by file, as agents need them.
  The base URL is also the version pin: point at `/v4.0` instead of `/main` and
  the router, contracts, modes, roles, and personas all come from that tag. There
  is no second version to keep in sync.
- **A directory** — `git clone --depth 1 https://github.com/ckluis/baton` and set
  `BATON: ./baton`. Faster on repeat runs, works with no network, and the only
  form where casting can clone a persona repository with git.

Point at a directory and the router reads; point at a URL and it fetches.
Nothing else changes. Run state under `_orch/` is always local disk either way —
a run whose state lived at a URL could not be resumed.

**What you paste is not the process — it points at the process.** The router is
a document for the agent to read. Carrying it by hand would mean holding the
whole procedure just to tell something else to go follow it, and it would spend
the one context the design exists to protect.

Can do neither? `./bundle.sh TEST` flattens the router, both contracts, your
mode, the roles, and only that mode's seats into one self-contained document.
See [`prompt/invoke.md`](prompt/invoke.md) for the full card and every knob.

## Layout

```
prompt/
  invoke.md           the paste — your goal, two settings, and a URL
  baton.md            the router — the agent reads this, not you
  CONTRACT.md         narrative + generated index; the rules live in rules/
  modes/              10 — directive + graph shape + entry rungs + seats + gates
  roles/              12 — planner, phase-runner, verifier, briefer, panel, synthesizer…
personas/
  CONTRACT.md         narrative + generated index; the rules live in rules/
  lenses/             37 — expert seats, upgradeable to named voices
  users/              7 — end-user archetypes with real patience budgets
  luminaries/         40 — opt-in named-expert roster (personas/CONTRACT.md §4)
rules/                53 — one file per rule, the only place each is defined
bundle.sh             flatten to a single paste
tools/embed.py        re-embed the invocation cards + router into index.html
tools/rules.py        regenerate the contract indexes; refuse a broken rule set
tools/lint-criteria.py flag a done-criterion no execution can settle, before dispatch
tools/index.py        the five resume questions off disk; --sqlite for a queryable copy
tools/lists.py        the four append-only lists as directories of rows (§6.3): derive, check, split
tools/inbox-gh.py     TEAM — questions out to Issues, answers in to files; clock; summary
tools/publish-run.sh  TEAM — the run's state on a git ref: init, publish, pages, dispose
tools/node-pr.sh      TEAM — a product node as a branch, a draft PR, a check
tools/github-setup.sh TEAM — the ruleset and Pages, as configuration
tools/test-team.sh    every TEAM tool, end to end, against throwaway repos and a fake gh
migrations/           from-v1, from-v2, from-v3 — one file per older version; MIGRATING.md indexes them
docs/designs/         design records, including v4.0's github-native-team-mode.md
docs/experiments/     paste-ready directives that test the framework's own claims
index.html            the page
baton-v1.html         v1, kept as it shipped
```

Every framework reference inside the prompt files is written `{BATON}/prompt/...`
or `{BATON}/personas/...`, and `{BATON}` has exactly two forms: a local directory
(`./baton`) or a base URL
(`https://raw.githubusercontent.com/ckluis/baton/v4.0`). Agents expand the token
before using it or passing it on — a sub-agent always receives a fully qualified
path or URL and never has to guess a base.

Two contracts define every schema. Everything else is written against them, and
**where a role prompt and the contract disagree, the contract wins and the role
prompt is the bug.**

### Bundle interop

Persona frontmatter may carry three optional keys — `type`, `id`, and `links` —
that baton's own loader ignores entirely and that only an external AIX consumer
reads. `tools/aix-validate.py` holds `personas/` — this repository's own bundle,
never a foreign `repo:` roster — to **AIX level 1**, and the acceptance run ends
by printing `AIX LEVEL 1 OK`. Those `links:` edges are also what turned 361
persona conflicts from prose into something a caster can act on.

---

## What it produces

Everything lands in `_orch/` (gitignored by default):

- `plan/graph.yaml` — the machine-readable plan
- `nodes/<id>/` — handoff, envelope, digest, escalation packet, work products
- `verify/<id>-verdict.json` — one row per done-criterion, `CONFIRMED` / `REFUTED` /
  `UNTESTED` / `UNSETTLEABLE`, and the node verdict computed from them
- `cast/roster.yaml` — who was cast, why, and who was excluded
- `ledger.csv` — one row per spawn: rung, attempt, verdict, seconds
- `final/report.md` — outcome per phase, caveats, open questions, and the
  **rung histogram**
- `brief/final.html`, `brief/blocked-<n>.html` — **one slide per decision** for the
  person who has to make it; derived from the report, never the record
- `lint-feedback.yaml` — every criterion a verifier found unsettleable, as fixture
  candidates for the linter

A run that does not measure where it spent its rungs will spend them the same way
next time.

Resume is free by construction: a fresh session reads the manifest, scans the
envelopes, and continues. A session limit landing mid-run costs one node, not a
run — which is also why serial execution is affordable.

### The checks answer for themselves

A verdict file carries **one row per done-criterion** in the handoff — each
quoting its criterion, each with its own probe and evidence — and the node
verdict is derived from those rows, not asserted. A row count that disagrees
with the handoff is malformed: the phase runner reads it as `PARTIAL` and
re-verifies. A row may also read `UNSETTLEABLE` — the criterion, not the work, is
the defect — and then the node parks on a question rather than climbing a rung. The acceptance checks are held to the same standard: each of the
ten carries a `tools/*.instrument.md` record naming what it guards, what it has
caught over its lifetime, and when it last fired. See
[`docs/designs/instrument-lifecycle.md`](docs/designs/instrument-lifecycle.md).

---

## What it is not

baton is not a replacement for knowing what you want. It is a forcing function
for cost discipline and adversarial verification, and it will faithfully execute
a bad plan if you hand it one. The plan gate exists because that is the cheapest
place to catch it.

It is also not a guarantee. Every verdict cites an artifact path so you can check
it yourself, which is the point — **a finding you cannot check is a finding you
should not act on.**

---

## License

MIT. See [LICENSE](LICENSE).

By **Chris Kluis** — [ckluis.com](https://ckluis.com) ·
[LinkedIn](https://www.linkedin.com/in/ckluis) ·
[experiments](https://ckluis.github.io/experiments/)
