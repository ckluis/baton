# Experiment: Opus 5.5 against Sonnet 5.5 on complex work

Drafted 2026-10-01 · Status: **PRE-REGISTERED, not yet run** · Issue #36

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

Not yet run.
