# The invocation

This is what you paste. It is not the process — it points at the process.

`prompt/baton.md` is the router, and the router is for the agent to read, not
for you to carry. Everything below is the smallest thing that starts a run.

---

## Minimal — two settings and a pointer

```
# Goal
Find and fix what the test suite is failing to catch in the billing module.

# Settings
TARGET: src/billing
MODE:   TEST

# Process
Read ./baton/prompt/baton.md completely and follow it. You are the PRIME
ORCHESTRATOR it describes. It names the other files to read — read those, and
nothing beyond what they name. Do not start work until you have read it.
```

Eleven lines, and three of them are yours to write. Everything else has a
default that is already correct, and a default you never had to type is a
decision you never had to make.

---

## Full — every knob

```
# Goal
[free text: constraints, exclusions, definitions of done, technology to avoid.
 Becomes the OPERATOR NOTES appended to _orch/directive.md. Required for
 MODE: GENERIC, where it IS the directive. Delete this block if you have
 nothing to add — an empty goal is better than a padded one.]

# Settings
TARGET:      src/billing
MODE:        TEST
BATON:       ./baton
PERSONAS:    builtin
CEILING:     4
PRIME_TURNS: 12
INBOX:       off

# Process
Read ./baton/prompt/baton.md completely and follow it. You are the PRIME
ORCHESTRATOR it describes. It names the other files to read — read those, and
nothing beyond what they name. Do not start work until you have read it.

If ./baton does not exist:
  git clone --depth 1 https://github.com/ckluis/baton
```

| setting | default | what it does |
|---|---|---|
| `TARGET` | **required** | a path, a spec file, a running app URL, or a one-line goal |
| `MODE` | **required** | `TEST` `BUILD` `IMPROVE` `REVIEW` `DOGFOOD` `MIGRATE` `ROADMAP` `GENERIC` |
| `BATON` | `./baton` | where this repository is, as a directory or a base URL |
| `PERSONAS` | `builtin` | `builtin` · `none` · `path:<dir>` · `repo:<host/owner/name>`, combined with `+` |
| `CEILING` | `4` | highest rung reachable without asking. `4` is `opus/high`. |
| `PRIME_TURNS` | `12` | the conductor's own turn budget |
| `INBOX` | `off` | `on` lets a second session answer blocked questions mid-run |

`TARGET` and `MODE` are the two the run may not guess. Everything else it can.

---

## If you cannot clone

Point `BATON` at a base URL and the router fetches instead of reading:

```
BATON: https://raw.githubusercontent.com/ckluis/baton/main
```

Slower and it needs network access on every file, and casting cannot clone a
persona repository over it — so `PERSONAS: builtin` or `none`. Prefer a clone
whenever a clone is possible.

If you can do neither, `./bundle.sh <MODE>` produces one self-contained
document under `dist/` with the router, both contracts, your mode, the roles,
and only that mode's seats inlined. Paste that instead and skip the pointer.

---

## Why it is shaped this way

The router tells the prime to read two files and then delegate everything else.
Pasting the router itself would mean carrying the process by hand in order to
tell an agent to go read the process — and it would put 162 lines of standing
orders in the one context the whole design exists to protect.

So the paste carries what only you know: what you want, and how much you are
willing to spend finding out. The rest is already written down.
