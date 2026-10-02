# Effort bench v2: three greenfield tasks, five builds per effort

The bench's harness, three hidden suites with their reference implementations, fixtures and all 45 builds live outside this repository, in `/Users/clank/Desktop/projects/effort-blog-bench/` (v2 pre-registered at its commit `c8e8e75`, result `196d688`). This file is the record; `docs/experiments/effort-greenfield-go-blog.md` is v1.

Drafted 2026-09-26 · Ran 2026-09-26 · Status: **RUN — medium to build** (pooled high − medium 0.37, 90% CI 0.18–0.56) · Follows `DESIGN.md` (v1: the Go blog, 3 builds per arm)

## The question

v1 found high best on one greenfield task, by a margin one build could flip, and baton's rule 1.1 now
says "high to build or design" on that evidence. Does it hold across tasks of different shapes, with
more samples?

## Design

- **Tasks** (`tasks/<task>/builder-prompt.md`):
  - `blog-go` — v1's task, unchanged. Builds 4 and 5 are added per arm, so n = 5.
  - `cli-py` — a personal expense tracker CLI in Python 3.9, standard library only. Pure engineering:
    no visual design, exact arithmetic, exit codes, SQLite.
  - `api-node` — a URL shortener HTTP service in Node 25. API design, validation, auth,
    persistence across restart, concurrency.
- **Arms:** `claude-opus-5-5` at `--effort low`, `medium`, `high`, five builds each per task, built as
  rounds of one build per arm at once. Same builder harness as v1: empty directory, `bypassPermissions`,
  Agent tool disabled, cost/turns/seconds from the stream.
- **Hidden tests,** validated before any build:
  - `cli-py` (27 checks): reference 27/27, empty repo 0/27; mutants fail exactly the check they
    target (SQL by string formatting → injection check; `delete` always exit 0 → unknown-id check;
    no `OVER` flag → budget check).
  - `api-node` (24 checks): reference 24/24, empty 0/24; no auth → both auth checks; no click count →
    the click check; a server that crashes on bad JSON → the four checks that need it alive.
  - `blog-go`: v1's 26 checks, unchanged.
- **Blind judge:** one fresh `claude-opus-5-5` / high per build, random label, ports scrubbed.
  `blog-go` keeps v1's rubric and screenshots, so its v1 and v2 builds are comparable.
  `cli-py` and `api-node` use `_hidden/generic-rubric.md`: interface, correctness, code, robustness,
  completeness, tests & docs, each 1–10, `overall` their mean. Judges may run a build's own tests in a
  scratch copy. The v1 blog judgments (round 2, valid) are kept, not redone.

## Pre-registered decision rules

**Per task** — v1's rule, unchanged. With `T` = mean hidden-test pass rate, `J` = mean judge
overall: an arm qualifies if `T ≥ T(high) − 0.05`, `J ≥ J(high) − 0.5`, and none of its builds failed
the task's first build check (`T01` blog, `C02` cli, `A02` api). Recommend the lowest qualifying arm.

**Across tasks — what rule 1.1 says about building:**
- If high is recommended on at least two of the three tasks, "high to build" **stands**.
- If medium qualifies on at least two of the three, rule 1.1 changes to **medium to build**.
- If low qualifies on at least two, it changes to **low to build**.
- Otherwise the result is **split**, and the rule keeps high with the split recorded.

**Reported beside every mean:** min–max per arm; the pooled high − medium judge gap across all
fifteen build pairs with a bootstrap 90% interval (10,000 resamples of builds within task); cost,
seconds and turns per arm; served-model mismatches.

**Noise, measured not assumed:** v1 measured the judge's test-retest noise at 0.30 per build. Any
per-task verdict whose margin is under twice that is labelled fragile.

## Result

**Every one of the 45 builds passed every hidden test** — blog 26/26, cli 27/27, api 24/24, at every
effort. The suites cannot separate the arms on function, so the blind judge decides every task.

| task (5 builds per arm) | low J [min–max] | medium J | high J | rule's pick |
|---|---|---|---|---|
| `blog-go` | 5.63 [5.17–6.00] | 7.30 [7.00–7.50] | 7.76 [7.33–8.33] | **medium** (fragile) |
| `cli-py` | 5.47 [5.00–5.83] | 7.23 [6.83–7.83] | 7.30 [7.00–7.50] | **medium** (fragile) |
| `api-node` | 5.80 [5.33–6.00] | 7.47 [7.17–7.83] | 8.03 [7.83–8.33] | **high** (fragile) |

Margins to qualify (medium J − (high J − 0.5)): blog **+0.036**,
cli **+0.432**, api **-0.066**. Low misses on every task by
1.3–1.7.

**The cross-task rule, applied: medium qualifies on two of three tasks, so rule 1.1 changes to
"medium to build."** All three per-task calls are inside twice the judge's measured noise (0.30),
so all three are fragile by the pre-registered definition — the blog by +0.04, the CLI by +0.43, the
API by −0.07. The verdict therefore rests on the pooled gap below, not on any single task.

**Pooled high − medium: 0.366** judge points (90% bootstrap interval
0.179–0.555). High is reliably a little better — the interval excludes zero — and the
whole interval sits below the 0.5 the rule pre-registered as material. Where it comes from:
robustness and tests on the blog and the API; on the CLI the two arms are indistinguishable.

| mean cost · seconds per build | low | medium | high |
|---|---|---|---|
| `blog-go` | $0.32 · 66s | $0.71 · 173s | $1.39 · 329s |
| `cli-py` | $0.25 · 46s | $0.48 · 108s | $0.65 · 152s |
| `api-node` | $0.28 · 52s | $0.56 · 123s | $0.85 · 211s |

**v1 reversed.** v1 called the blog for high on three builds a side (8.05 vs 7.33). Builds 4 and 5
brought high to 7.76 and medium to 7.30; the gap fell from 0.72 to 0.46 and crossed the line. v1
labelled its own result fragile, and it was.

No served-model mismatches in any build. Spend: builds $27.45, judges $14.11 (both rounds, all tasks).

**What this does not settle.** Three tasks with clear contracts; a vague brief might separate the
arms on function. The judge is the builders' model family. And "material" is the pre-registered 0.5:
a reader who values 0.37 judge points at ~1.6× the price should read the pooled row, not the verdict.
