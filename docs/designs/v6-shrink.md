# v6 — shrink baton for current models: the design record

Written 2026-10-01 · Issue #38 · Supersedes #34's rule change; carries #34's experiment records

## The premise

v5 kept half of baton and called it the accountability layer. Six experiments since then measured
the other half on Claude Opus 5.5 and Sonnet 5.5, and the result was consistent. **Choices that ration
the model barely move outcomes.** Tier, effort, ladder and persona choices moved results by fractions of
a judge point, or not at all.

**What failed was always one of three things:**
- criteria no execution can settle (9 of 12 replay failures)
- the environment
- claims nobody checked

**What fixed them:**
- an independent fresh verifier
- the criteria linter
- the escalation packet (a retry carrying the verdict rows)
- the measured record

v6 cuts what existed to ration an expensive, fallible, context-limited model. Everything that does
accountability work stays. Where a file does both, the accountable half stays and the rationing half
goes.

## The evidence

| experiment | finding | what it decides here |
|---|---|---|
| `effort-bench-three-tasks.md` | 45 greenfield builds, all passing every hidden test at every effort. High beat medium by only 0.37 judge points (90% CI 0.18–0.56), at 1.4–2× the cost. Low lost everywhere. | one default effort, medium |
| `frontier-at-medium-effort.md` | medium matched high's yield on the 18 replayed repair nodes, for 31% less | same |
| `retry-effort.md` | a retry at high: 5/9 against 4/9, +44% cost, the gap one coin-flip node. The packet did the work. 9 of 12 failures never retry (UNSETTLEABLE-only). | the retry keeps the packet and drops the effort bump |
| `opus-vs-sonnet-5-5.md` | both models at the ceiling of two conformance suites, Sonnet 3–5× cheaper; on repair, Sonnet 4 against Opus 6, mostly by stopping early | `FRONTIER` = Opus 5.5, `CHEAP` = Sonnet 5.5 |
| `personas-earn-their-place.md` | a plain reviewer found 15.67 of 16 seeded defects; four lens cards found 16, the same as four plain reviewers, at 4× the cost | lens cards and panels come off the default path |
| `ladder-price-on-two-tier-harness.md`, `replay-two-tiers-opus-5-5.md` | a ladder priced 23.5% cheaper but saved little; seconds were even | no ladder; two agent tiers and a person |

## Decisions

1. **Default binding: `FRONTIER` = `claude-opus-5-5` at `medium`; `CHEAP` = `claude-sonnet-5-5`.** No
   Fable until a version beats Opus 5.5 on these experiments (#35). Baton still names properties in
   its rules and models only in the invocation's defaults.
2. **One effort.** Rule 1.1's per-node effort table is cut. Frontier work runs at the binding's effort.
   `effort:` on a graph node survives as an optional override, and the tools still check and record
   it. A retry keeps its effort and carries the packet: the measured mechanism, not the measured
   effort.
3. **Personas off the default path.** The 37 expert lenses, the 41 luminaries, casting, the panel role,
   the persona-casting rules, and the two panel-only modes (`CRAFT`, `POSITION`) move to `library/`.
   It is opt-in (`PERSONAS: library`), never bundled by default, and not in the contract index. Every
   default mode loses its `## Seats` section. `REVIEW` becomes plain fresh reviewers. **Kept on the
   default path:** user archetypes (`personas/users/`), the journey probe and the screenshots-only
   perception rule. The persona experiment did not test them, and they produce evidence from the
   running product.
4. **No phase runner.** Every current harness can spawn agents and wait. The router's dispatcher
   duties absorb what the phase runner did that was accountable:
   - the verdict shape check
   - §9.2 parking
   - lint-feedback rows
   - §6.2 landing
   - ledger rows at receipt

   The two-tier replay ran without one, and its wall-clock fell.
5. **No digest.** A digest existed so no layer would open the layer below's work, a context saver.
   Its two accountable lines become envelope fields: `evidence`, and `risk` (what remains unproven).
6. **No decomposer.** `SPLIT` returns seams, and the planner re-plans. No experiment exercised a split.
7. **Rules merged.**
   - rule 0 goes into rules 2 and 9.
   - rules 4.2 and 4.4 go into rule 4.
   - rules 5.1–5.3 go into rule 5.
   - The brief's visual shape moves from rule 8.1 to `briefer.md`, and the rule keeps what is
     accountable.
   - prule 1.2, a convention its own text says nothing reads, is cut.
8. **Prose that rations goes:** prime turn budgets, "context is the scarcest thing", "dispatch
   phases, not nodes", and histogram-driven tier planning.

## Kept, though it looks like rationing

- **The escalation packet.** It is the measured mechanism.
- **Fresh-spawn verification.**
- **Concurrency limits.** Every experiment hit a session limit.
- **§9.3's isolated retry.** It separates harness artefacts from bad criteria.
- **The cheap tier.** It runs commands, and Sonnet 5.5 is a third of the cost.
- **The ledger's `model`, `effort` and `served:`.**
- **The human tier.**

## Team surface

v5's quiet team mode is unchanged: GitHub Issues and pull requests, with one PR per run, questions
answered as comments, and the record on a hidden ref. Nothing in it rations.

## How the cut is checked

- **Index and citations:** `tools/rules.py --check` fails until every cited rule id resolves.
- **The page:** `tools/embed.py --check` keeps the page in sync.
- **Tools:** `tools/test-team.sh`, `tools/test-dispatch.sh` and the linter selftest all pass.
- **The paste:** `bundle.sh` builds a paste for every default mode.

Word counts before and after are in the PR.
