# The invocation

This is what you paste. **There is nothing to install and nothing to clone.**

`prompt/baton.md` is the router, and the router is for the agent to read, not
for you to carry. The invocation just tells it where the router lives.

---

## The whole thing

```
# Goal
Find and fix what the test suite is failing to catch in the billing module.

# Settings
TARGET: src/billing
MODE:   TEST

# Process
Fetch and follow https://raw.githubusercontent.com/ckluis/baton/main/prompt/baton.md
You are the PRIME ORCHESTRATOR it describes. Resolve every other file it names
against that same base URL. Read it completely before you start any work.
```

Change two lines, paste, walk away. Everything else has a default that is
already correct, and a default you never had to type is a decision you never
had to make.

That third line is the one that makes the whole scheme work: **every path in
every baton file is relative to wherever the router came from.** Tell the agent
that once, and the framework resolves itself from there — modes, roles,
contracts, personas, all of it, fetched as they are needed and never before.

---

## Every knob

```
# Goal
[free text: constraints, exclusions, definitions of done, technology to avoid.
 Becomes the OPERATOR NOTES appended to _orch/directive.md. Required for
 MODE: GENERIC, where it IS the directive. Delete this block if you have
 nothing to add — an empty goal is better than a padded one.]

# Settings
TARGET:      src/billing
MODE:        TEST
BATON:       https://raw.githubusercontent.com/ckluis/baton/main
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
| `TARGET` | **required** | a path, a spec file, a running app URL, or a one-line goal |
| `MODE` | **required** | `TEST` `BUILD` `IMPROVE` `REVIEW` `DOGFOOD` `MIGRATE` `ROADMAP` `GENERIC` |
| `BATON` | the canonical raw URL | where baton lives — a base URL, or a local directory |
| `PERSONAS` | `builtin` | `builtin` · `none` · `path:<dir>` · `repo:<host/owner/name>`, combined with `+` |
| `CEILING` | `4` | highest rung reachable without asking. `4` is `opus/high`. |
| `PRIME_TURNS` | `12` | the conductor's own turn budget |
| `INBOX` | `off` | `on` lets a second session answer blocked questions mid-run |

`TARGET` and `MODE` are the two a run may never guess. Everything else it can.

### Pinning a version

The base URL is the pin. Swap `main` for a tag and the whole framework — router,
contracts, modes, roles, personas — comes from that tag, because everything
resolves relative to the router you fetched:

```
BATON: https://raw.githubusercontent.com/ckluis/baton/v2.0
```

---

## If you would rather have it locally

A clone is faster on repeat runs, works with no network, and is the only form
that lets casting clone a persona repository with git:

```sh
git clone --depth 1 https://github.com/ckluis/baton
```

```
BATON: ./baton
```

Same invocation otherwise. **Point `BATON` at a directory and the router reads;
point it at a URL and the router fetches.** Nothing else changes.

## If you can do neither

`./bundle.sh <MODE>` produces one self-contained document under `dist/` with the
router, both contracts, your mode, the roles, and only that mode's seats
inlined. Paste that instead of the invocation, put `TARGET` and `MODE` at the
top, and the run needs no network and no filesystem beyond its own work.

---

## Why it is shaped this way

The router tells the prime to read two files and then delegate everything else.
Pasting the router itself would mean carrying the process by hand in order to
tell an agent to go read the process — and it would put a hundred and fifty
lines of standing orders in the one context the whole design exists to protect.

So the paste carries what only you know: what you want, and how much you are
willing to spend finding out. The rest is already written down, at a URL.
