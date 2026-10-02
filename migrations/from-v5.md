# Migrating from baton v5.0 to v6.0

v6 cuts what rationed an expensive, fallible, context-limited model and keeps every
field the record is written in. Design record: `docs/designs/v6-shrink.md`.

## 1. The move itself

Change the base URL to `.../ckluis/baton/v6.0`. An invocation that sets nothing new
now binds `FRONTIER` to `claude-opus-5-5` at `medium` and `CHEAP` to
`claude-sonnet-5-5`; name either to bind something else.

**A run in flight** resumes. The prime reads `manifest.json`, scans envelopes and
verdicts, and dispatches the rest itself. Files v5 wrote and v6 no longer reads —
`nodes/*/digest.md`, `cast/roster.yaml`, a phase runner's envelope — stay where
they are as history. Old envelopes are not rewritten; new ones carry `evidence`
and `risk`.

## 2. What breaks

| v5.0 | v6.0 | what to do |
|---|---|---|
| per-node effort: `high` to build, `medium` to verify; no `effort:` meant `high` | one effort, the binding's (`medium`); `effort:` is an optional override | a graph that relied on the implicit `high` declares `effort: high` on those nodes |
| `PERSONAS: builtin+luminaries`, `none`, `path:`, `repo:`; expert seats in every mode | user archetypes only on the default path; experts in `library/` | add `PERSONAS: library` (combinable with the v5 sources) — `library/README.md` |
| `MODE: CRAFT`, `MODE: POSITION` | in `library/prompt/modes/` | `PERSONAS: library` |
| `adversarial: panel`; expert slugs in `personas:` | `adversarial: off \| standard`; `personas:` names user archetypes | `PERSONAS: library`, or let a fresh plain reviewer run |
| envelope `digest` and `digest.md` (rule 3) | envelope `evidence` and `risk` (rule 2) | a custom role that wrote a digest writes the two fields instead |
| the phase runner role; the decomposer role | the router's dispatcher duties (router §4.1); the planner re-plans on `SPLIT` | a harness that spawned either spawns nothing in their place |
| rules 0, 3, 4.2, 4.4, 5.1–5.3; prules other than the user-archetype three | merged into rules 2, 4, 5 and 9, or moved to `library/rules/` | cite §4 and §5 where you cited §4.2, §4.4 or §5.x |

## 3. What does not change

Graphs, envelopes, verdicts, the ledger and its `model`, `effort` and `served:`
columns, the two agent tiers and the human one, the escalation packet, fresh-spawn
verification, concurrency limits, §9.3's isolated retry, the briefs, and `TEAM:
github`'s footprint.
