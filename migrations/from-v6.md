# Migrating from baton v6.0 to v7.0

v7 adds a Claude Code mod that runs the prime, deletes the expert library, and adds one rule.
The router prompt, the record and every field it is written in are unchanged. Design and
results record: `docs/designs/v7-mods.md`.

## 1. The move itself

**Pasting the router** (any harness): change the base URL to `.../ckluis/baton/v7.0`. That is
the whole move.

**Using the mod** (Claude Code 2.1.287 or later; mods are early access): from a clone,
`claude --plugin-dir ./mod`, then `/baton start <MODE> <TARGET>` in the session. The prime is the
main session, guarded; sub-orchestrators do what v6's dispatcher did, one phase each.

**A run in flight** resumes either way. Under the router nothing changed. Under the mod, a v6
`_orch/` is not a mod run (its manifest has no `"prime": true`), so finish it under the router,
or archive it and start a mod run.

## 2. What breaks

| v6.0 | v7.0 | what to do |
|---|---|---|
| `PERSONAS: library`: lenses, luminaries, casting, panels | deleted | nothing; the run treats it as `builtin`. A plain fresh reviewer matched every expert setup measured |
| `MODE: CRAFT`, `MODE: POSITION` (in `library/`) | deleted | use `REVIEW` with your criteria, or `DOGFOOD` for the experienced surface |
| a node changing code behavior could land code and tests together | rule 9.4: red, then green, then blue, each a commit, with `work/red.txt`, `green.txt`, `blue.txt` | nothing for the router; a custom node role writes the three files; a planner marks `rgb: exempt — <reason>` where no test can reach the behavior |

## 3. What does not change

Graphs, envelopes, verdicts, the ledger, the two agent tiers and the human one, escalation,
fresh-spawn verification, the briefs, `TEAM: github`, and the eight modes.
