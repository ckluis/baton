# The invocation

This is what you paste. **Nothing to install, and one setting to think about.**

`{BATON}/prompt/baton.md` is the router, and the router is for the agent to
read, not for you to carry. The invocation just says where it lives.

---

## The whole thing

```
# Goal
Find and fix what the test suite is failing to catch in the billing module.

# Process
Fetch and follow https://raw.githubusercontent.com/ckluis/baton/v3.0/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
Migrating from an earlier version? Read https://github.com/ckluis/baton/blob/v3.0/MIGRATING.md
```

Say what you want, paste, answer one question. The router reads your goal, works
out which mode fits, and **asks you to confirm it** — leading with its best
guess and the two next-best rather than making you choose from ten. Picking
beats typing, and a question you answer in one click is cheaper than a setting
you had to look up.

That third line is what makes the rest work: **every path in every baton file is
relative to wherever the router came from.** Say it once and the framework
resolves itself from there — modes, roles, contracts, personas, fetched as they
are needed and never before.

---

## If you already know

Naming `MODE` skips the question. Naming any other setting overrides a default
that was probably already right.

```
# Goal
[free text: constraints, exclusions, definitions of done, technology to avoid.
 Becomes the OPERATOR NOTES appended to _orch/directive.md. For MODE: GENERIC
 it IS the directive. Delete this block if you have nothing to add — an empty
 goal is better than a padded one.]

# Settings
TARGET:      src/billing
MODE:        TEST
BATON:       https://raw.githubusercontent.com/ckluis/baton/v3.0
PERSONAS:    builtin
CEILING:     4
PRIME_TURNS: 12
INBOX:       off

# Process
Fetch and follow {BATON}/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
```

| setting | default | what it does |
|---|---|---|
| `TARGET` | **asked for** | a path, a spec file, a running app URL, or a one-line goal |
| `MODE` | **asked for** | `TEST` `BUILD` `IMPROVE` `REVIEW` `DOGFOOD` `CRAFT` `POSITION` `MIGRATE` `ROADMAP` `GENERIC` |
| `BATON` | the canonical raw URL | where baton lives — a base URL, or a local directory |
| `PERSONAS` | `builtin` | `builtin` · `builtin+luminaries` · `none` · `path:<dir>` · `repo:<host/owner/name>`, combined with `+` |
| `CEILING` | `4` | highest rung reachable without asking. `4` is `opus/high`. |
| `PRIME_TURNS` | `12` | the conductor's own turn budget |
| `INBOX` | `off` | `on` lets a second session answer blocked questions mid-run |

`TARGET` and `MODE` are the only two a run may not silently guess — which is why
they are the two it asks about instead. In a session that cannot ask (a cron
job, a headless run) the router infers them, records the inference as an
inference, and says so in its first message and its final report.

### Pinning a version

The base URL is the pin. The default above is already pinned to a tag —
`v3.0`, the current release — rather than floating on `main`. Point at a
different tag instead (an older release, frozen forever) — or at `main` for
the bleeding edge — and the whole framework — router, contracts, modes,
roles, personas — comes from that base, because everything resolves relative
to the router you fetched:

```
BATON: https://raw.githubusercontent.com/ckluis/baton/v2.0
```

---

## If you would rather have it locally

Faster on repeat runs, works with no network, and the only form that lets
casting clone a persona repository with git:

```sh
git clone --depth 1 https://github.com/ckluis/baton
```

Then `BATON: ./baton`. **Point at a directory and the router reads; point at a
URL and it fetches.** Nothing else changes.

## If you can do neither

`./bundle.sh <MODE>` produces one self-contained document under `dist/` with the
router, both contracts, your mode, the roles, and only that mode's seats
inlined. Paste that instead, put `TARGET` at the top, and the run needs no
network and no filesystem beyond its own work.

---

## Why it is shaped this way

The router tells the prime to read two files and then delegate everything else.
Pasting the router itself would mean carrying the process by hand in order to
tell an agent to go read the process — and it would put two hundred lines of
standing orders in the one context the whole design exists to protect.

So the paste carries what only you know: what you want. The router asks about
the one thing it cannot infer safely, defaults everything it can, and the rest
is already written down at a URL.
