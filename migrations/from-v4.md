# Migrating from baton v4.0 to v5.0

One breaking change, and it is the meaning of a value, not the shape of a file.

## 1. The move itself

Change the base URL to `.../ckluis/baton/v5.0`.

A run in flight needs nothing. A checkout of the framework — a fork, a `path:`
or `repo:` roster whose cards carry `rung:` — needs one command (§2). An
invocation that still names `CEILING` or `PRIME_TURNS` is told so in the run's
first message and otherwise ignored; delete the two lines, and add `CHEAP` and
`FRONTIER` only if you want to bind the two tiers to specific models.

## 2. The one breaking change: what a `rung` value means

`prompt/CONTRACT.md` §1 (`rules/rule-1-the-ladder.md`). The field is still called
`rung` everywhere — graphs, envelopes, persona cards, the ledger — so nothing that
reads it changes. Its values changed meaning:

| v4 `rung` | model it named | v5 `rung` | tier |
|---|---|---|---|
| 0 | `haiku/low` | `0` | **cheap** — mechanical, verifiable by command; assignment only |
| 1 | `sonnet/medium` (the default) | `1` | **frontier** — everything with judgment; the default |
| 2 | `sonnet/high` | `1` | frontier |
| 3 | `opus/medium` | `1` | frontier |
| 4 | `opus/high` | `1` | frontier |
| 5 | `fable/low` (asked for) | `1` | frontier |
| 6 | `fable/medium` (asked for) | `1` | frontier |
| — | (a question) | `2` | **human** — never a spawn; a question in the inbox |

**Symptom** of an unmigrated checkout: `python3 tools/tiers.py check --framework`
refuses every `rung:` above 1 — `prompt/modes/TEST.md:43: rung: 3 - above 1`.
The framework still *works* (any value above 0 reads as frontier), but the file
says something the rule no longer means. **Fix**, once:

```
python3 tools/tiers.py remap --framework     # prompt/modes/*.md and personas/*/*.md: 0 → 0, 1–6 → 1
python3 tools/tiers.py check --framework     # every value is 0 or 1
```

Here that moved 131 values across 94 files (10 modes, 84 persona cards) and
changed nothing else: `max_rungs` in a loop's `stop:` block is a spawn budget, not
a rung field, and is untouched; prose is untouched; the ledger is never rewritten.

**A run in flight** (`_orch/`) needs nothing. Old ledger rows keep the values they
were written with — they are history, and `tools/index.py`'s histogram shows them
as such. New spawns write `0` or `1`. A graph entry that still says `rung: 3`
reads as frontier; `python3 tools/tiers.py remap --state-root _orch` normalises
`plan/graph.yaml` and the handoffs if you want the files to say so.

## 2b. Team mode's footprint

v4.0's `TEAM: github` created a branch per run, a branch and draft pull request
per product node, an Issue per question, three labels, a Pages folder per run
and a release per disposal. v5.0's creates **one pull request, one branch, one
hidden ref** — what a colleague's own work leaves:

| v4.0 | v5.0 |
|---|---|
| branch `baton/run/<id>` holding `_orch/` | hidden ref `refs/baton/run/<id>` — not a branch; listed nowhere |
| branch + draft PR per node, `baton/node/<id>/<node>` | one commit per node on the run branch `baton/<id>`; the run has one draft PR |
| an Issue per question, sub-issues, labels | a comment per question on the PR; `/answer Q-<n> …` replies |
| `gh-pages/runs/<id>/` decks, `post-summary` on a run Issue | one gate comment carrying the summary and the deck's markdown twin |
| a release per disposal | delete the hidden ref; the PR stays |
| `tools/publish-run.sh pages`, `tools/node-pr.sh pr` | gone |

Nothing had run under v4.0's surface. If a run did: push its record to the hidden
ref and drop the branch (`git push origin baton/run/<id>:refs/baton/run/<id>` and
`git push origin :baton/run/<id>`); questions already answered on Issues keep
their `Q-<n>.answer.md`; unanswered ones get a comment on the run's pull request
at the next `sync`; node branches can be merged into the run branch or left.
`tools/github-setup.sh --apply` again reduces the ruleset to the one that
remains.

## 3. What changed around the value

- **Entry is frontier unless the work is a command** (`rules/rule-1-1-entry-rung.md`).
  A plan that assigned `rung: 1` to judgment because it was the default is now
  reading `1` as frontier, which is what v5 wants. A plan that assigned `0` to
  something with judgment in it was wrong before and is wrong now; the plan
  verifier's "cheap assigned by vibe" finding names it.
- **Escalation is two moves, then a person** (`rules/rule-1-2-escalation.md`). A
  node that would have climbed to rung 4 now retries at frontier once, carrying
  the verdict's rows, and then asks. `CEILING`-blocked questions no longer exist;
  the same question arrives one failure later and better informed.
- **A verifier is always frontier, always a fresh spawn** (`rules/rule-9-evidence.md`).
  A cheap node's verifier re-runs its command at frontier.
- **The refutation quota is gone** from §9; **rung drift, de-escalation, the
  ceiling, who-assigns, effort-as-a-rung** are gone from §1. A handoff citing
  any of them cites nothing; the linter does not flag that, a reader will.
- **Dispatch belongs to the harness** (`rules/rule-0-layers.md`, router §4). If the
  session running the prime can run agents in parallel and wait for them, the
  prime dispatches nodes itself; the phase runner remains for sessions that
  cannot. A run started under v4 with a phase runner mid-phase finishes that
  phase the same way.

## 4. What does NOT break

- **Every schema.** Envelopes (§2), verdicts (§9.1), the ledger (§7), graphs
  (§4), persona cards (`prule-1`): same fields, same names.
- **Team mode** (v4.0) — untouched. `TEAM: github`, the run ref, Issues, pull
  requests, the publish sequence, every team tool.
- **Every mode's directive, seats and gates.** Only each mode's "Entry rungs"
  table became an "Entry tiers" table.
- **The paste and the bundle.** `bundle.sh` works; its header now says v5.
- **`tools/index.py`, `tools/lists.py`, `tools/lint-criteria.py`** — unchanged;
  the field they read kept its name.

## 5. Why

The premise the ladder priced changed: when the most capable model is the
sensible default for anything with judgment in it, escalation "one rung, not one
model" has nothing to save. What the evidence kept — independent verification at
every tier, computed verdicts, gates, the record — is what v5 is. The design
record is `docs/designs/v5-accountability-layer.md`; the bet is measured by the
ledger's `model`, `effort` and `seconds` columns, and the replay harness can run
the same eighteen nodes under two tiers.
