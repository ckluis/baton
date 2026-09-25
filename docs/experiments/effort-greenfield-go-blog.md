# Effort bench: Opus 5.5 at low, medium and high on a greenfield Go build

The bench's harness, hidden suite, fixtures and all nine builds live outside this repository, in `/Users/clank/Desktop/projects/effort-blog-bench/` (pre-registered at its commit `c4f565e`, result `07fe575`). This file is the record.

Drafted 2026-09-24 · Ran 2026-09-24 · Status: **RUN — high, by a fragile margin** · Total spend $12.88 (builds $7.49, judges $5.39 incl. one invalid round)

## The question

The baton replays measured effort on verification-heavy repair work, and found medium matched high's
yield for 31% less money. A greenfield build is a different shape of work: open-ended, with design
taste in it. Which effort should be the default for a task like *"set up a personal medium.com-inspired
blog in Go"*?

## Design

- **Arms:** `claude-opus-5-5` at `--effort low`, `medium`, `high`. **Three builds per arm** (nine in all),
  run as three rounds of one build per arm at once, so each round's arms share conditions.
- **Builder:** `claude -p`, an empty directory, the identical prompt in `builder-prompt.md` (the user's one
  line plus the interface contract the hidden tests need), `bypassPermissions`, the Agent tool disabled
  so every turn runs on the arm's setting. No time cap. Cost, turns and seconds come from the stream.
- **Hidden tests:** `_hidden/test_blog.py`, 26 black-box checks against hidden fixture posts. The
  builders never see it. Before any build it scored a reference implementation 26/26, an empty repo
  0/26, a draft-leaking mutant 20/26 (exactly the six draft checks failing) and an unsafe-HTML mutant
  25/26 (exactly the injection check failing).
- **Blind judge:** one fresh `claude-opus-5-5` / high spawn per build, given a copy of the repo under a
  random label, four screenshots (home and post, desktop 1280 and mobile 390, served with the hidden
  fixtures), and `_hidden/judge/rubric.md`: six dimensions scored 1–10, `overall` their mean. The judge
  sees no test results and no arm names.

## Pre-registered decision rule

Per arm: `T` = mean hidden-test pass rate, `J` = mean judge overall, `$` = mean build cost.

1. An arm **qualifies** if `T ≥ T(high) − 0.05` and `J ≥ J(high) − 0.5`, and none of its three builds
   failed to compile (`T01`).
2. **Recommend the lowest-effort qualifying arm** as the default for this kind of task. High always
   qualifies against itself.
3. If a lower arm's `T` or `J` *exceeds* high's by more than those margins, say so: effort would then
   be hurting, not only costing.
4. Report the spread (min–max) per arm beside every mean. With three samples, a result whose sign
   depends on one build is called fragile.

## Result

| per arm (3 builds each) | low | medium | high |
|---|---|---|---|
| hidden tests passed | 26/26 ×3 | 26/26 ×3 | 26/26 ×3 |
| judge overall, mean [min–max] | 5.50 [5.17–5.83] | 7.33 [7.00–7.50] | **8.05** [7.50–8.33] |
| reading / mobile | 6.0 / 7.0 | 7.7 / 7.7 | 7.7 / 7.7 |
| code / robustness | 6.3 / 4.0 | 8.0 / 6.7 | 8.7 / 8.7 |
| completeness / tests & docs | 3.7 / 6.0 | 6.0 / 8.0 | 6.7 / 9.0 |
| mean build cost | $0.32 | $0.70 | $1.47 |
| mean build time | 65 s | 177 s | 346 s |
| mean turns | 3 | 14 | 25 |
| Go/HTML/CSS lines (round 1) | 391 | 803 | 1,687 |

**The rule, applied.** Every arm passed every hidden test, so `T` ties at 1.000 and the judge decides.
Low trails high by 2.55 and does not qualify. Medium trails by 0.72 against a 0.5 margin and does not
qualify. **The rule recommends high.** No lower arm beat high.

**Fragile, in the rule's own sense.** One medium build scoring 0.66 higher would flip the outcome to
medium. The judge's own noise, measured below, is 0.30 per build, so that is about two noise-widths —
real, but not wide. Medium's best build (7.50) equals high's worst.

**Where effort went.** Every arm met the functional contract; the hidden suite hit its ceiling and
could not separate them. Effort bought engineering depth, not looks: reading and mobile scores are
identical for medium and high. High's lead is robustness (+2.0: server timeouts, hot reload, a real
404, safe path handling), tests and docs (+1.0) and code (+0.7). Low batched the whole build into
about three turns and shipped a correct but thin blog.

**Two harness findings.**
- *An invalid first judging round.* The copy step used `rsync --exclude blog` to drop the compiled
  binary, which also dropped every directory named `blog`. That gutted the three high builds'
  `internal/blog/` package, and their judges scored 4.0–5.7 against missing code. The round is kept
  in `results/judge-round1-INVALID/`; all nine were re-judged from verified copies.
- *Judge test-retest noise.* The six low and medium copies were identical across both rounds, so the
  round-to-round change measures the judge: a mean of **0.30** per build, with arm means stable
  (low 5.50 → 5.50, medium 7.28 → 7.33).

**What this does not settle.** One task, one spec, three samples; a spec vague enough to separate
the arms on function would be a different test. The judge is the same model family as the builders.
