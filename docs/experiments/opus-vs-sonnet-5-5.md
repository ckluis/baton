# Experiment: Opus 5.5 against Sonnet 5.5 on complex work

Drafted 2026-10-01 · Ran 2026-10-01 · Status: **RUN — split: Opus stays frontier, Sonnet 5.5 is the cheap tier** · Issue #36

## The question

Baton's tiers are `cheap` (mechanical, settled by a command) and `frontier` (everything with judgment
in it). The default binding is moving to Opus 5.5 / Sonnet 5.5 (#35). The effort bench found every
arm passing every hidden test on clear-contract builds, so those builds could not tell models apart.
**On work hard enough to separate them, does Sonnet 5.5 carry judgment work, or only commands?**

## Design

- **Two complex greenfield builds, scored by official conformance suites the builders never see.**
  Both forbid dependencies and network access, so nobody installs a solution. WebFetch and WebSearch
  are disabled, and every transcript is audited for fetches of the suites.
  - `commonmark-py`: a CommonMark 0.31.2 renderer, Python standard library only. Scored on the
    **652 spec examples**. The harness gave the PyPI `commonmark` package 648/652 and an empty repo 0.
  - `jsonschema-node`: a JSON Schema 2020-12 validator, Node built-ins only. Scored on the
    **official test suite, 1,270 required cases** (`refRemote.json` excluded: it needs a server). The
    harness gave `ajv` 1,223/1,270 and an empty repo 0.
- **Arms:** `claude-opus-5-5` and `claude-sonnet-5-5`, both at `medium` (rule 1.1's build effort).
  **Three builds per model per task**, built in rounds of one per model at once.
- **The 18 replayed repair nodes,** with the worker on `claude-sonnet-5-5` / medium and the verifier
  held at `claude-opus-5-5` / medium, so only the worker changes. Compared with the recorded Opus 5.5
  medium arm (`frontier-at-medium-effort.md`: 6 of 18 confirmed, $49.30 in pairs). Same harness, input
  rule, `acae87c` tree and original criterion text.

## Pre-registered decision rule

Let `P_m(task)` be model `m`'s mean conformance pass rate across its three builds, and `C_m` the
replay arm's confirmed-first-try count.

- **Sonnet carries frontier work** if `P_sonnet ≥ P_opus − 0.03` on **both** suites and
  `C_sonnet ≥ C_opus − 1`. Then the default `FRONTIER` binding becomes Sonnet 5.5, and Opus 5.5 is
  kept for planning, synthesis and a retry.
- **Opus stays frontier** if Sonnet trails by more than 0.10 on **either** suite, or `C_sonnet ≤ C_opus − 3`.
  Sonnet 5.5 is then `CHEAP` only.
- **Split** otherwise: Opus stays frontier, Sonnet stays cheap, and the gap is recorded per class.

Also reported: cost and seconds per build and per pair, cost per conformance point, per-section and
per-file pass rates, served-model mismatches, and the transcript audit.

## Result

### The conformance builds: both models at the ceiling

| per build, 3 per model | Opus 5.5 / medium | Sonnet 5.5 / medium | reference |
|---|---|---|---|
| CommonMark, of 652 spec examples | **652 · 652 · 652** | **652 · 652 · 652** | PyPI `commonmark`: 648 |
| JSON Schema 2020-12, of 1,270 cases | 1,264 · 1,264 · 1,264 | 1,263 · 1,264 · 1,264 | `ajv`: 1,223 |
| mean cost · seconds, CommonMark | $3.23 · 1,007 s | **$0.99 · 370 s** | |
| mean cost · seconds, JSON Schema | $1.62 · 420 s | **$0.33 · 113 s** | |

Every build in both models wrote a spec-perfect CommonMark renderer and a near-perfect 2020-12 validator.
They did it from memory, with no network and no dependencies, and beat the established libraries the
harness was validated against. All six JSON Schema builds miss the **same** six cases: five in
`dynamicRef.json` and one in `vocabulary.json`. Identical misses across six independent builds point to
cases that need something the harness withholds, most likely a remote meta-schema, not to a
capability gap. Sonnet 5.5 was **3× faster and 3–5× cheaper** for the same score.

**The transcripts were audited.** No build read the suites, the hidden harness, the experimenter's
scratch files or an installed package (one Python pass over every tool call; 0 hits in 12
transcripts). The caveat is memory, not access: both suites are public, and a Sonnet build said it
reconstructed about 640 spec examples to test against. "Complex" here meant *well-specified*, and that
is where both models are strongest.

### The replay: Sonnet 5.5 trails on repair in a real tree

| 18 replayed nodes, verifier Opus 5.5 / medium | Opus 5.5 worker | Sonnet 5.5 worker |
|---|---|---|
| CONFIRMED first try | **6** | **4** (`P00`, `P11`, `B1`, `F1.4`) |
| worker returned `BLOCKED` within ~35 s | 1 (`P160`) | **5** (`P00`, `P41`, `P90b`, `P160`, `P121`) |
| cost, worker + verifier pairs | $49.30 | **$23.58** (workers $8.27) |

Sonnet lost `P10` (REFUTED) and `P90c`. It also gave up early on four nodes that the Opus worker
attempted. `P00` blocks by design: its handoff's STOP clause fires on this tree. On `P41`,
`P90b`, `P160` and `P121`, Sonnet read the stale-tree clauses in the original handoffs as a reason
to stop. Opus read them as a premise to work around and did the work in a staging copy. Every one
of the 36 spawns was served by the model asked for.

### The rule, applied

- Suites: `P_sonnet` is within 0.03 of `P_opus` on both (1.000 vs 1.000; 0.9950 vs 0.9953). Fine.
- Replay: `C_sonnet = 4`, `C_opus = 6`. "Carries frontier work" needs ≥ 5. "Opus stays frontier"
  needs ≤ 3 or a suite gap over 0.10.
- **Split.** Opus 5.5 stays the frontier tier and Sonnet 5.5 becomes the cheap tier. Recorded per
  class: **equal on well-specified greenfield builds at a third of the cost; two nodes in eighteen
  behind on repair in an inherited tree, mostly by stopping too early.**

**What this does not settle.** The suites were memorised public specifications. A build with a novel
spec might separate the models where these could not. And `BLOCKED` early is a behaviour, not only
a capability: a handoff that tells a Sonnet worker to stage around a stale premise might close the gap.
