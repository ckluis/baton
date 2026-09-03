# baton

**v3.1** · An orchestrator of orchestrators, rebuilt around what it costs.

baton is a router prompt. You paste it into a fresh session, fill eight lines, and
it turns that session into a multi-agent run with a budget: a plan on disk, a
default rung most work never leaves, escalation measured in rungs instead of
models, adversarial verification that has to name the attack it tried, and a
report that ends by telling you where the money actually went.

**→ [Read the page](https://ckluis.github.io/baton/)** ·
[Changelog](CHANGELOG.md) ·
[Migrating from v2](MIGRATING.md) ·
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
| **Verdicts** | one asserted per node | **one computed row per done-criterion**; a mismatched row count reads `PARTIAL` |
| **Bundle interop** | none | optional `type` / `id` / `links` keys, validated at **AIX level 1** |
| **Where a rule lives** | inline in a 663-line contract, restated in three or four other places | **one file each** under `rules/` — 49 of them, contracts down to 83 lines |

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
Fetch and follow https://raw.githubusercontent.com/ckluis/baton/v3.1/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
Migrating from an earlier version? Read https://github.com/ckluis/baton/blob/v3.1/MIGRATING.md
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

### How it resolves

Every path in every baton file is relative to wherever the router came from.
That one rule is the whole locator scheme:

- **A URL** — the framework fetches itself, file by file, as agents need them.
  The base URL is also the version pin: point at `/v3.1` instead of `/main` and
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
  roles/              11 — planner, phase-runner, verifier, panel, synthesizer…
personas/
  CONTRACT.md         narrative + generated index; the rules live in rules/
  lenses/             37 — expert seats, upgradeable to named voices
  users/              7 — end-user archetypes with real patience budgets
  luminaries/         40 — opt-in named-expert roster (personas/CONTRACT.md §4)
rules/                49 — one file per rule, the only place each is defined
bundle.sh             flatten to a single paste
tools/embed.py        re-embed the invocation + router into index.html
tools/rules.py        regenerate the contract indexes; refuse a broken rule set
index.html            the page
baton-v1.html         v1, kept as it shipped
```

Every framework reference inside the prompt files is written `{BATON}/prompt/...`
or `{BATON}/personas/...`, and `{BATON}` has exactly two forms: a local directory
(`./baton`) or a base URL
(`https://raw.githubusercontent.com/ckluis/baton/v3.1`). Agents expand the token
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
- `verify/<id>-verdict.json` — `CONFIRMED` / `REFUTED` / `PARTIAL` + evidence
- `cast/roster.yaml` — who was cast, why, and who was excluded
- `ledger.csv` — one row per spawn: rung, attempt, verdict, seconds
- `final/report.md` — outcome per phase, caveats, open questions, and the
  **rung histogram**

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
re-verifies. The acceptance checks are held to the same standard: each of the
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
