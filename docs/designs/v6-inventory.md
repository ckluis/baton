# baton v6 inventory — shrink baton for current models

Read-only inventory of `/Users/clank/Desktop/projects/baton`, taken 2026-10-01. Word counts are `wc -w` on the file as it is on disk.

**The checkout is not exactly `main`.** It is on `exp-personas` (`41b1eee`), which is `main` (`7d0f04c`) plus one file, `docs/experiments/personas-earn-their-place.md`. Every framework file is byte-identical to `main`.

**Two cited experiment files are not on `main`.** `docs/experiments/effort-bench-three-tasks.md` and `docs/experiments/retry-effort.md` exist only on branch `retry-effort-experiment`. `docs/experiments/opus-vs-sonnet-5-5.md` exists only on `exp-opus-vs-sonnet`. I read them with `git show <branch>:<path>`.

## Evidence key

| tag | file | status | what it says that this inventory uses |
|---|---|---|---|
| EB1 | `/Users/clank/Desktop/projects/baton/docs/experiments/effort-greenfield-go-blog.md` | run | Every arm passed 26/26 hidden tests. The judge preferred high; the result was labelled fragile. |
| EB2 | `docs/experiments/effort-bench-three-tasks.md` (branch `retry-effort-experiment`) | run | 45 builds, all passed every hidden test. Pooled high minus medium was 0.37 judge points (90% CI 0.18–0.56), below the pre-registered 0.5 materiality bar. The rule moved to "medium to build". |
| FM | `/Users/clank/Desktop/projects/baton/docs/experiments/frontier-at-medium-effort.md` | run | Opus 5.5 at medium in both seats confirmed 6 first-try, the same as high, for 0.63 of the dollars. |
| LP | `/Users/clank/Desktop/projects/baton/docs/experiments/ladder-price-on-two-tier-harness.md` | run | The ladder was 23.5% cheaper than frontier-by-default. Strictness did not track tier, and seconds were a wash. |
| R2 | `/Users/clank/Desktop/projects/baton/docs/experiments/replay-two-tiers-opus-5-5.md` | run | 19 of 24 UNSETTLEABLE rows were replay artefacts, and no criterion-class node closed. A fresh frontier verifier found what the lower tiers missed. The served-model column caught 3 `<synthetic>` rows. |
| R6 | `/Users/clank/Desktop/projects/baton/docs/experiments/replay-refuted-at-rung-6.md` | run | 23 of 32 UNSETTLEABLE rows came from the harness. Every non-confirmation was an environment or protocol row. |
| RE | `docs/experiments/retry-effort.md` (branch `retry-effort-experiment`) | run | 9 of 12 first-attempt failures were UNSETTLEABLE-only and never retried. With the escalation packet in the handoff, 142 or 143 of 150 failing rows were CONFIRMED at either effort. "The mechanism is the packet." |
| #36 | `docs/experiments/opus-vs-sonnet-5-5.md` (branch `exp-opus-vs-sonnet`) | pre-registered, not run | Does Sonnet 5.5 carry frontier work? This decides whether there are two agent tiers or one. |
| #37 | `/Users/clank/Desktop/projects/baton/docs/experiments/personas-earn-their-place.md` | pre-registered, not run | Do lens cards beat equal-spend plain reviewers? It does **not** test `kind: user` archetypes. |

**Classification.** RATION means the item manages an expensive, fallible or context-limited model. ACCOUNT means it serves criteria, verification, evidence, the record, human decisions, resume or the team surface. BOTH means it does both.

**Proposals.** I propose CUT only where the item has no accountability function. MERGE means the accountability content moves into a named home, and the rationing prose and the file go away. PENDING means the verdict waits on #36 or #37.

---

## 1. Run-contract rules (`rules/rule-*.md`, 12,808 words)

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| rule-0-layers | 266 | Defines the PRIME→DISPATCH→NODE→WORKER layer diagram. Says layers pass locators and receive envelopes. | BOTH | MERGE INTO rule-2 (every return is an envelope, every receipt writes a row) + rule-9 (independence) | Its own text says the phase runner exists because "a forty-task run cost forty top-tier turns". That is prime-turn rationing. The independence clause (whoever dispatches never reads work) is the part to keep. |
| rule-1-the-ladder | 367 | Defines three tiers: cheap, frontier, human. Keeps the field name `rung`. | BOTH | PENDING #36 | Whether cheap and frontier stay separate is exactly #36's question. LP shows strictness did not track tier, and EB2 shows every arm passing. The `human` tier is ACCOUNT and stays either way (merge it into rule-10 if the ladder goes). |
| rule-1-1-entry-rung | 433 | Sets the entry tier and the per-node `effort:` table: high to build, medium to verify, high for planning and retries. | RATION | Effort table: CUT now. Entry-tier half: PENDING #36. | EB2: 0.37 pooled, below materiality, and the rule changed to "medium to build" on a branch that `main` never merged. FM: medium matched high, 6 against 6. RE: retry at high was inconclusive, 5/9 against 4/9, at +44% cost. Effort moved fractions of a judge point. Replace the table with one default effort. |
| rule-1-2-escalation | 385 | cheap→frontier once; frontier→frontier once with the refuted rows; then a person. Lists what does not escalate. | BOTH | KEEP (rewrite as "refuted → one retry carrying the verdict rows → a person"; the cheap→frontier move is PENDING #36) | RE: P41 closed 6 of 6 because the packet named the deviation. 142–143/150 rows confirmed at either effort. The rule's own note says "That was the mechanism; the ladder was the packaging." |
| rule-2-the-status-envelope | 243 | Envelope JSON schema. The disk copy wins; no `status.json` means pending. | ACCOUNT | KEEP (+ absorb the digest's evidence and residual-risk fields) | Resume state on disk. A path that does not exist means FAILED. |
| rule-2-1-verdicts | 139 | The six verdicts: DONE, CAVEATS, BLOCKED, ESCALATE, FAILED, SPLIT. | ACCOUNT | KEEP (reword ESCALATE from "above this tier" to "should not be attempted by an agent") | FM: P160's BLOCKED on an accurate premise check was the correct, cheap outcome. An honest early exit is accountability. |
| rule-3-the-digest | 129 | A 10-line producer-written summary so no layer opens the layer below's work. Too long means SPLIT. | RATION | MERGE INTO rule-2 (`evidence`, `residual_risk` fields on the envelope) | Explicitly a context saver: "a reader who summarizes has already paid the cost the digest exists to avoid". Its EVIDENCE and RESIDUAL RISK lines are the only accountable content. rule-6-2 already says "a digest is not a substitute". |
| rule-4-the-graph | 387 | The `graph.yaml` schema, `isolation: worktree`, and the TEAM default of one commit per node. | ACCOUNT | KEEP | The plan on disk is what the plan verifier refutes. Defect: lines 31 and 35 both open with "`isolation: worktree` runs the node in its own git worktree", a duplicated paragraph. |
| rule-4-1-edge-types | 263 | `needs` requires DONE+CONFIRMED, `informs`, `refutes`, persona independence, `surface: ui` → journey probe. | ACCOUNT | KEEP (the persona-collision clause is PENDING #37) | "unverified work is a guess with a filename". Author is never the refuter. |
| rule-4-2-fan-out-and-barriers | 385 | Pipeline by default; when a barrier is justified; fanout schema; `kind: gate` "costs no prime turn". | BOTH | MERGE INTO rule-4 (keep the fanout schema and "needs: [F2] means every child"; cut the barrier-justification essay and prime-turn prose) | The fanout semantics are graph correctness. The barrier argument is wall-clock economy. "Costs no prime turn" is prime-budget rationing. |
| rule-4-3-concurrency | 66 | Default concurrency 2; serial on overlapping files; 4 for read-only work. | BOTH | KEEP | Guards against session-limit stranding, which is an environment failure. Every experiment hit one: LP had a 13h38m idle gap, FM had P121 killed at 160 s, RE had both P41 replicate-2 workers killed. See §4 below. |
| rule-4-4-decomposition | 94 | A node over about 10 files returns SPLIT, and a decomposer replaces it with a subgraph. | RATION | MERGE INTO rule-4 (one sentence: SPLIT returns seams; the planner re-plans) | The "roughly ten files" threshold sizes nodes for a context-limited model. There is no experiment evidence that SPLIT fired or helped. |
| rule-4-5-done-criteria-are-atomic | 290 | One independently-failing check per criterion line. Runs `lint-criteria.py` before dispatch. | ACCOUNT | KEEP | The criteria linter is a named fix. RE: P76's unbounded "every count statement" was the only coin-flip node. R2: three genuine rows became linter fixtures. |
| rule-5-the-loop | 149 | Loop node schema: invariant, ledger, stop, `max_rungs`. | BOTH | KEEP, absorbing 5.1–5.3 | A declared, auditable stop condition. `max_rungs` is a budget, kept as a hard stop. |
| rule-5-1-the-seen-ledger… | 112 | Dedupe against every candidate ever seen, not only admitted ones. | ACCOUNT | MERGE INTO rule-5 | Convergence correctness, recorded on disk. Not rationing. |
| rule-5-2-dry-not-empty | 67 | Stop after 2 dry rounds, not on an empty list. | BOTH | MERGE INTO rule-5 | Guards against a lazy stop by a fallible model. Small. Keep the substance. |
| rule-5-3-every-loop-declares-its-exit… | 116 | All four exit fields are required; `dry_rounds` ≥ 2; a max-out ends as CAVEATS, not FAILED. | ACCOUNT | MERGE INTO rule-5 | The plan gate checks it. Cited as §5.3 in 9 files (list in part A). |
| rule-6-filesystem | 359 | The `_orch/` layout. | ACCOUNT | KEEP | State on disk is what makes resume possible. |
| rule-6-1-framework-locators-vs-run-state | 366 | `{BATON}` expansion; run state always local; the TEAM hidden ref. | ACCOUNT | KEEP | Team surface and resume. |
| rule-6-2-a-worktree-node-lands-its-outputs… | 822 | Copy a worktree's outputs into `work/` before removing it; under TEAM, the commit is the landing. | ACCOUNT | KEEP (trim the narrative, about 200 words) | Evidence preservation. The F2 observation: 8 criteria permanently UNTESTED because the products died with the worktree. |
| rule-6-3-append-only-lists-are-directories… | 429 | One file per ledger, lint-feedback, ux-debt or decisions row. `lists.py derive` rebuilds the list files. | ACCOUNT | KEEP | Single writer by construction. It is what lets run state live on a git ref (team). |
| rule-7-the-ledger | 323 | One row per spawn at receipt. `model` is what was asked; `served:` is what came back. | ACCOUNT | KEEP | The measured record. R2: 3 of 41 rows carried `served:` placeholders, and every experiment's numbers come from it. |
| rule-7-1-ts-and-seconds-are-measured… | 310 | Time comes from the shell, never from the model. Defines the tier histogram. | BOTH | KEEP (drop "input to the next run's entry-tier assignments") | Anti-fabrication is ACCOUNT. Using the histogram to plan tiers is RATION. |
| rule-7-2-two-row-classes… | 473 | Spawn rows versus event rows (`n/a`); one writer per row. | ACCOUNT | KEEP (could fold into rule-7) | Fixes a real clobber: 3 gate events written twice with different content. |
| rule-8-gates | 260 | The four gate kinds; written file plus envelope; TEAM publish sequence. | BOTH | KEEP (drop the "point where the prime spends a turn" framing) | Gates are where people decide. The prime-turn framing is rationing. |
| rule-8-1-the-human-brief | 1,055 | The brief's shape, palette, rail, voice and "derived never authoritative" rule. | ACCOUNT | MERGE shape and voice INTO `prompt/roles/briefer.md`; keep about 250 words of rule (which gates ship a brief, derived from the record, numbers by command, cites paths) | About 800 words restate briefer.md: slide shape, rail, voice, tokens. The rule part is accountability (the human decision surface). |
| rule-8-2-every-blocking-decision-ships-a-slide | 1,115 | Any decision that stalls work gets a slide. Do not schedule decisions. Absolute paths. The closing message must not restate the deck. | ACCOUNT | KEEP (cut the "expensive layer… spent the context it was protecting on typing" paragraph, about 100 words) | Grounded in the replay's buried decisions. Human decisions. |
| rule-9-evidence | 305 | Cite or retract; no silent pass; UNVERIFIED; fresh-spawn verification; P0–P3; neutrality. | ACCOUNT | KEEP (the "verification runs at frontier" clause is PENDING #36; fresh-spawn independence stays regardless) | R2: the fresh verifier found P41 D-02, P76's 8 missing counts, and P90c's 22-word quote. v5 design: a fresh adversary broke 3 of 3. |
| rule-9-1-a-verdict-is-per-criterion… | 429 | One row per criterion; node verdict computed; UNTESTED. | ACCOUNT | KEEP | The computed verdict is a named fix. Every experiment scores CONFIRMED / PARTIAL / REFUTED from it. |
| rule-9-2-refutation-triage | 1,086 | The UNSETTLEABLE row verdict with shape and probe; parks on a question; feeds the linter. | ACCOUNT | KEEP | RE: 9 of 12 failures were UNSETTLEABLE-only. This is the single biggest failure class, and this rule routes it. |
| rule-9-3-settle-it-in-isolation… | 879 | One isolated-worktree retry before writing measures-outside-node or reads-immutable-ref. | ACCOUNT | KEEP | R6: 23 of 32 UNSETTLEABLE rows were harness-made. R2: 19 of 24 were replay artefacts. This separates harness from criterion. |
| rule-10-the-operator-lane | 500 | `Q-<n>.md` / `.answer.md` on disk; INBOX doorbell; GitHub `/answer` thread; authorized answerers. | ACCOUNT | KEEP | Human decisions and team surface. |
| rule-11-contract-footer | 206 | Text appended to every spawn: tier, work dir, ESCALATE/SPLIT, envelope as the entire interface. | BOTH | KEEP (drop "You are running at tier {rung}" and "above your tier"; tier wording PENDING #36) | The envelope duty is ACCOUNT. The tier self-assessment is RATION. |

## 2. Persona rules (`rules/prule-*.md`, 2,778 words) and `personas/CONTRACT.md`

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| personas/CONTRACT.md | 480 | Persona narrative (expert vs user) and the generated prule index. | BOTH | PENDING #37 (the user half: KEEP) | #37 tests lenses only. "A run that never spawns a `user` has never seen its product" is untested and should stay. |
| prule-1-file-schema | 137 | Persona frontmatter and section schema. | ACCOUNT | PENDING #37 | Needed for as long as any persona file ships, including users. |
| prule-1-0a-type-id-and-links… | 137 | Optional OKF/AIX keys that baton ignores. | neither (interop) | PENDING #37 | No run-time function. It goes away if lenses and luminaries leave the default path. |
| prule-1-1-foreign-personas-load-unmodified | 119 | Name+domain is enough; defaults `phases: [AUDIT, CLASH]`, `rung: 1`. | ACCOUNT | PENDING #37 | Roster adoption. |
| prule-1-1a-what-the-default-phases-cost-you | 317 | Explains that the default phases lock personas out of PLAN, PROBE and VERIFY seats. | ACCOUNT | PENDING #37 | Casting mechanics. |
| prule-1-1b-the-same-is-true-of-tags… | 249 | A tagless roster is silently never seated. | ACCOUNT | PENDING #37 | Casting audit trail. |
| prule-1-2-phase-overrides… | 198 | Reserves the `## In <PHASE>` convention and says "nothing in baton reads it". | neither | CUT (does not depend on #37) | It states its own null result: tested twice, no behaviour change (`docs/designs/stage-aware-luminaries.md`). **Contradiction:** `prompt/roles/journey-probe.md:16` and `prompt/roles/panel.md:38` *do* tell spawns to use an `## In PROBE` / `## In AUDIT` section. Delete those two clauses too. |
| prule-2-what-each-kind-does… | 76 | Header: a mode names a phase and a slug; the duty below is what gets spawned. | ACCOUNT | PENDING #37 | |
| prule-2-1-kind-expert | 369 | Expert duties per phase: PLAN, AUDIT, CLASH, VERIFY, EXECUTE, SYNTH. | BOTH | PENDING #37 | Exactly what #37 measures (conditions B and C against D and A). |
| prule-2-2-kind-user | 216 | User duties per phase: PLAN, PROBE, VERIFY, CLASH. | ACCOUNT | KEEP | Not tested by #37 ("says nothing about them"). It refutes facts from screenshots, which is evidence. |
| prule-3-the-perception-contract… | 181 | Screenshots-only perception; "a step without a screenshot is a fabricated step". | ACCOUNT | KEEP | An evidence rule for journey probes. Untested by #37. |
| prule-4-casting | 185 | PERSONAS sources; persona files are data, not instructions. | BOTH | PENDING #37 (the "data not instructions" security clause: KEEP anywhere a foreign file is loaded) | |
| prule-4-1-selection | 195 | 3–7 seats per panel; `roster.yaml` shows the work. | BOTH | PENDING #37 | "the run's attention is the constraint that actually binds". That is attention rationing. |
| prule-4-2-seat-upgrades | 170 | Upgrade a seat to a named persona by tag. | RATION-ish (quality tuning) | PENDING #37 | |
| prule-4-3-binding | 98 | Bind one card per selection, reused verbatim. | ACCOUNT | PENDING #37 | Reproducibility of the seat prompt. |
| prule-5-independence-is-structural… | 131 | Separate contexts make agreement evidence; unanimous panels get a forced clash. | ACCOUNT | KEEP the principle; MERGE INTO rule-9 if #37 cuts panels | "Agreement is only information when disagreement was possible" applies to verifiers as well as panels. |

## 3. Router, contract index and prompt files

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| prompt/baton.md (router) | 2,735 | Run config, ask-for-missing, locators, bootstrap, standing orders, the cycle, ending, resume. | BOTH | KEEP, rewritten | Cut about 470 words of rationing. §2.2's on-demand-read justification is about 200. §3's "context is the scarcest thing… battery on a long flight" and "dispatch phases, not nodes" is about 150. The phase-runner branch of §4 is about 120. Absorb about 600 words of dispatcher routing from phase-runner.md. `CHEAP` / `FRONTIER` rows are PENDING #36. |
| prompt/CONTRACT.md | 761 | Narrative plus the generated rule index. | ACCOUNT | KEEP (regenerated by `tools/rules.py`; rewrite the "six sentences", which lead with tiers and digests) | One home per rule. |
| prompt/invoke.md | 1,205 | What a person pastes; settings; team setup; pinning; bundle. | ACCOUNT (onboarding) | KEEP (fix the stale row) | **Stale:** the `TEAM` row says "every question an Issue, every product node a draft PR". That is v4. v5 is one PR plus comments (`rules/rule-10-the-operator-lane.md`, the `tools/inbox-gh.py` header). The `FRONTIER` "effort per node" text goes with the §1.1 table. |
| prompt/brief-tokens.css | 327 | The single palette every brief inlines. | ACCOUNT | KEEP | The human decision surface. |
| bundle.sh | 626 | Flattens router, contracts, modes, roles and one mode's seats into one paste. | BOTH | KEEP | Its stated reason is partly context ("keeps the modes you are not running out of your context"), but it is the only no-network, no-filesystem path. Line 63 extracts `## Seats`…`## Gates`, so it breaks if seats are cut (#37). |

## 4. Roles (`prompt/roles/*.md`, 9,650 words)

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| phase-runner | 1,674 | A frontier spawn that owns one phase: dispatch, ledger rows, lint, verify, route verdicts, park UNSETTLEABLE, land worktrees, TEAM publish. | BOTH | MERGE INTO prompt/baton.md as "dispatcher duties"; CUT the separate spawn | The indirection is RATION. It exists so "a forty-node run should cost you four or five turns" (router §3). The routing duties are ACCOUNT and must survive: verdict shape check, §9.2 parking, lint-feedback rows, §6.2 landing. R2 ran with no phase runner, and its wall-clock fell 16h58m→6h02m against R6's phase-runner arm. |
| node-orchestrator | 456 | Does the node, or fans out to workers. Reads the escalation packet first. ESCALATE, SPLIT, BLOCKED, handback. | BOTH | KEEP (drop the worker fan-out and digest-length guidance) | Reading `{escalation_path}` first is the packet mechanism RE credits. |
| planner | 796 | Writes graph, roadmap and handoffs. Atomic criteria, loops, edges, kinds; assigns tier and effort. | BOTH | KEEP (+ absorb decomposer; drop the effort sentence; tier sentence PENDING #36) | Criteria quality is the main lever (RE, R6). |
| plan-verifier | 554 | A fresh spawn that refutes the plan: missing deps, judgment criteria, bundled criteria, loops, persona collisions. | BOTH | KEEP (CUT the "cheap assigned by vibe" and "effort that does not follow the work" bullets, about 120 words) | Independent verification of the plan is ACCOUNT. The tier and effort bullets police rationing. |
| verifier | 984 | Refutes DONE; one row per criterion; computed verdict; the §9.3 isolated retry; UNSETTLEABLE. | ACCOUNT | KEEP | The core named fix (R2, RE). |
| adjudicator | 339 | (a) Rules on contradictions from the artifact; (b) mediates persona clashes. | BOTH | KEEP (a); (b) PENDING #37 | (a) "rule on the evidence, not on seniority" records dissent verbatim. |
| decomposer | 412 | On SPLIT, rewrites the graph into ≤6 children; never does the work. | RATION | MERGE INTO planner | Sizes nodes for a context-limited model. No experiment exercised SPLIT. A re-plan is the planner's job. |
| synthesizer | 421 | Writes `final/report.md` from digests, verdicts and the ledger only; tier histogram; disposal. | BOTH | KEEP (drop "what the next run's entry-tier assignments should assume") | The report is the record. Needs-a-human and linter candidates are ACCOUNT. |
| briefer | 2,228 | Writes the HTML deck plus markdown twin: one slide per decision, rail, voice, checklist. | ACCOUNT | KEEP (becomes the single home for the brief's shape from rule-8-1) | Human decisions and the team thread. |
| casting | 536 | Resolves PERSONAS into `cast/roster.yaml` and cards; security rule. | BOTH | PENDING #37 | |
| journey-probe | 389 | A `kind: user` persona drives the running app; screenshots-only flows; honest abandonment. | ACCOUNT | KEEP (remove the `## In PROBE` clause, see prule-1-2) | Not tested by #37. Produces evidence from the running product. |
| panel | 861 | Six stages: independent audit, red flag, convergence audit, steelman clash, citation barrier, synthesis. | BOTH | PENDING #37 (the stage-5 citation barrier is ACCOUNT; keep it wherever findings are reported) | |

## 5. Modes (`prompt/modes/*.md`, 18,558 words)

Every mode has the same sections: Directive, Graph skeleton, Entry tiers, Seats, Gates, Done, Failure modes. Directive, skeleton, gates, done and failure modes are ACCOUNT (criteria and structure). **Entry tiers** (1,193 words across 10 modes) is RATION and PENDING #36. **Seats** (2,670 words) is PENDING #37.

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| BUILD | 1,625 (entry tiers 126, seats 127) | Implements a spec through a traceability matrix and an ambiguity gate. | BOTH | KEEP; entry tiers PENDING #36; seats PENDING #37 | The ambiguity gate is a human decision. Tests are never authored by the implementer. |
| CRAFT | 2,746 (seats 650) | A craft-expert panel against the experienced surface; changes nothing. | BOTH | PENDING #37 (whole mode is a panel) | The directive is the six-stage panel. |
| DOGFOOD | 1,764 (entry 99, seats 249) | Journey probes as `kind: user` against the running product. | ACCOUNT | KEEP; entry PENDING #36; expert seats PENDING #37; user seats KEEP | User archetypes are outside #37. |
| GENERIC | 1,049 (entry 100, seats 208) | An operator directive with a COMPLETION condition asked for first. | BOTH | KEEP; entry PENDING #36; seats PENDING #37 (`rung-fit` seat: CUT if #36 yields one tier) | "The run invents its own finish line" is the criteria failure. |
| IMPROVE | 2,106 (entry 142, seats 254) | Refactor or cleanup with before/after verification. | BOTH | KEEP; entry PENDING #36; seats PENDING #37 | |
| MIGRATE | 1,950 (entry 134, seats 158) | Discovers sites, then transforms and verifies in batches. | BOTH | KEEP; entry PENDING #36; seats PENDING #37 | "Sites discovery is the whole risk." Batching is about session limits (line 146), so keep it. |
| POSITION | 2,953 (seats 526) | A commercial-expert panel against positioning and pricing; changes nothing. | BOTH | PENDING #37 (whole mode is a panel) | |
| REVIEW | 1,637 (seats 238) | An adversarial expert panel; recommendation matrix. | BOTH | PENDING #37 (whole mode is a panel) | |
| ROADMAP | 1,146 (entry 89, seats 139) | A plan-only graph with plan seats. | BOTH | KEEP; entry PENDING #36; seats PENDING #37 (`rung-fit` seat, node `A-rung-fit`: CUT if #36 yields one tier) | |
| TEST | 1,582 (entry 132, seats 121) | Finds what the suite fails to catch. | BOTH | KEEP; entry PENDING #36; seats PENDING #37 | |

## 6. Tools (`tools/`, 26 files: 46,264 words of code and 6,961 words of instrument records; none is read into an agent's context except where a role tells it to run one)

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| lint-criteria.py | 15,400 | Flags unsettleable done-criteria before dispatch; `--selftest` with 51 cases. | ACCOUNT | KEEP | A named fix: R2 promoted 3 genuine rows into fixtures. "Prose discipline failed nine times out of nine; mechanical detection caught nine out of nine." |
| instruments.py | 10,041 | Scores the instruments: yield, productive/defective split, wake list, promotion eligibility. | ACCOUNT | KEEP (offline; not in the run path) | rule-9-2 cites its output (`_orch/instruments/summary.md`) as evidence for the triage rule. |
| index.py | 4,588 | Answers the resume questions off disk; summary.md; histogram; `--sqlite`; effort-mismatch finding. | BOTH | KEEP (drop the `effort-mismatch` finding if the §1.1 table goes) | Resume and record. `post-gate` posts its summary to the team thread. |
| inbox-gh.py | 2,637 | GitHub thread: open-run, sync Q/A, post-gate, clock check, authorized answerers. | ACCOUNT | KEEP | Team surface. |
| aix-validate.py | 2,047 | Vendored AIX format validator for the persona bundle. | neither (interop) | PENDING #37 | Only validates persona files. |
| lists.py | 1,995 | Derives, checks and splits the four append-only lists. | ACCOUNT | KEEP | rule-6-3. |
| tiers.py | 1,525 | Remaps v4 rungs 0–6 to v5 0–1; checks rung ≤1 and valid `effort:`. | RATION | PENDING #36 (effort check: CUT with the §1.1 table; remap is a one-time v4 migration that could move to `migrations/from-v4.md`) | Called by plan-verifier.md:26, test-dispatch.sh and test-team.sh (list in part A). |
| dispatch.py | 1,510 | Runs one spawn through `claude -p`, measures seconds, records `served:`, writes the ledger row. | BOTH | KEEP (simplify `--effort graph` to one default if §1.1 is cut) | The measured record. Every experiment's served-model and cost numbers came through it. |
| publish-run.sh | 1,334 | TEAM: init the hidden ref and run branch, secret scan, publish, dispose. | ACCOUNT | KEEP | Team surface and record. |
| rules.py | 1,264 | Regenerates the indexes; checks ids, links, and "every rule id cited anywhere resolves". | ACCOUNT | KEEP | **It fails until every citation of a removed rule id is fixed (check 5).** It is the safety net for this refactor. |
| test-team.sh | 1,297 | End-to-end TEAM tools against a fake `gh`; footprint assertion. | ACCOUNT | KEEP (remove its `tiers.py --selftest` line if tiers.py goes) | |
| check4-hint-tags.sh | 943 | Every mode hint tag resolves to a persona carrying it. | ACCOUNT (of casting) | PENDING #37 | |
| node-pr.sh | 635 | TEAM: worktree per node, lands as one commit, verdict as a commit status. | ACCOUNT | KEEP | Team surface. |
| test-dispatch.sh | 496 | Tests per-node effort reaching the spawn, effort-mismatch, `served:`, histogram. | BOTH | KEEP, trimmed (drop the effort-mismatch cases with §1.1; keep `served:` and histogram) | |
| github-setup.sh | 321 | One ruleset on `baton/**`: no force-push, no delete. | ACCOUNT | KEEP | Protects verdict-bearing commits. |
| embed.py | 231 | Embeds invoke.md and baton.md into index.html. | neither (site) | KEEP | check6 guards it. |
| check4-hint-tags.instrument.md | 2,621 | Instrument record for check 4 (active). | ACCOUNT | PENDING #37 | |
| aix-level1-persona-conformance.instrument.md | 794 | Record: personas conform to AIX L1 (dormant, never fired). | ACCOUNT | PENDING #37 | |
| check6-index-html-sync.instrument.md | 579 | Record: index.html matches embed.py (active). | ACCOUNT | KEEP | |
| check9-run-hygiene.instrument.md | 467 | Record: nothing committed and main not touched (dormant, never fired). | ACCOUNT | KEEP (archive candidate: it records one past run's `acceptance.sh`, not a live check) | Not rationing. It points at gitignored `_orch/nodes/P11/work/acceptance.sh`. |
| check1-vendored-frontmatter-keys.instrument.md | 460 | Record: luminary frontmatter keys (dormant). | ACCOUNT | PENDING #37 | |
| check7-cut-mechanism-absent.instrument.md | 441 | Record: no `## In <PHASE>` in luminaries (dormant). | ACCOUNT | PENDING #37 | Duplicates check 2's predicate by design. |
| check5-mode-bundle-integrity.instrument.md | 417 | Record: every mode bundles (dormant). | ACCOUNT | KEEP | |
| check8-new-mode-no-roster.instrument.md | 417 | Record: CRAFT/POSITION seats resolve with no roster (dormant). | ACCOUNT | PENDING #37 | |
| check2-no-override-sections.instrument.md | 415 | Record: no `## In <PHASE>` after the luminary cut (dormant). | ACCOUNT | PENDING #37 | |
| check3-no-orchestrator-prose.instrument.md | 350 | Record: no orchestrator-addressed prose in luminaries (dormant). | ACCOUNT | PENDING #37 | |

## 7. Persona directories and other items

| item | words | what it does | exists to | proposed | evidence / reason |
|---|---|---|---|---|---|
| personas/lenses/ (37 files) | 12,975 | Built-in expert lens cards seated by modes. | BOTH | PENDING #37 | #37 measures exactly this: plain against panel against one-reviewer-four-lenses. `rung-fit.md` (330 words) is a pure-rationing lens (it judges tier assignment). CUT it if #36 yields one tier, whatever #37 says. Three other lenses (`feasibility`, `dependency-order`, `regression-integrity`) link to it. |
| personas/luminaries/ (41 files incl. README) | 19,539 | Opt-in named-expert roster (`builtin+luminaries`). | BOTH | PENDING #37 | Already outside the default path (prule-4-casting). #37 tests lens cards, and a negative result makes this the weakest-evidenced 19.5k words in the repo. |
| personas/users/ (7 files) | 2,179 | End-user archetypes for journey probes. | ACCOUNT | KEEP | Excluded from #37 by its own design. |
| personas/manifest.aix.yaml | 20 | AIX bundle manifest. | neither | PENDING #37 | Goes with aix-validate.py. |
| migrations/ (from-v1..v4) | 3,384 | Upgrade notes per major version. | ACCOUNT (resume across versions) | KEEP (add from-v5; never in the run path) | |

---

## A. Cross-references that break if each CUT or MERGED-away item is removed

Searched with `git grep` over tracked files. Counts exclude the item itself. "History" means CHANGELOG.md, `baton-v1..v4.html`, `migrations/` and `docs/`, which record the past and need not change. **`python3 tools/rules.py` check 5 ("every rule id cited anywhere in the repo resolves to a file") will fail until the live references below are fixed**, which makes it the refactor's checklist.

1. **`rules/prule-1-2-phase-overrides…` (CUT)**
   - `personas/CONTRACT.md:52` (generated index row; `rules.py` regenerates it).
   - `prompt/roles/journey-probe.md:16` ("if the card carries an `## In PROBE` section").
   - `prompt/roles/panel.md:38` ("A seat whose card has no `## In AUDIT`…").
   - `tools/check2-no-override-sections.instrument.md` and `tools/check7-cut-mechanism-absent.instrument.md` guard the absence of the same mechanism. They stay valid but lose their rule anchor.
   - History: CHANGELOG.md, `docs/designs/stage-aware-luminaries.md`.
2. **Effort table in `rules/rule-1-1-entry-rung.md` (CUT section)**
   - Router and invoke: `prompt/baton.md:25` (FRONTIER "effort per node… high when a node names none"); `prompt/invoke.md:94` and `prompt/invoke.md:111`.
   - Roles: `prompt/roles/planner.md:35`; `prompt/roles/plan-verifier.md:23-26` (bullet plus the `tiers.py check` call); `prompt/roles/phase-runner.md:92` ("`medium` effort unless the node is building-class").
   - Tools: `tools/dispatch.py:5,12-15,91,142` and selftest lines 223-276; `tools/index.py:681-693` (`effort-mismatch`) and `:912-913` (by rung/effort); `tools/tiers.py:19-20,102-121` and selftests; `tools/test-dispatch.sh:8-9,30-33,52-74`.
   - Site: `index.html` (1 hit).
   - History: `docs/experiments/*` (cite it as the rule they changed), `docs/designs/v5-accountability-layer.md`, `migrations/from-v4.md`.
3. **`rules/rule-0-layers.md` (MERGE away)**
   - `prompt/CONTRACT.md:51` (index).
   - `prompt/baton.md:219` ("CONTRACT §0").
   - `prompt/roles/phase-runner.md:3,20`.
   - `README.md:88`.
   - `index.html:1972` (embedded router copy; regenerate with `tools/embed.py`).
   - History: CHANGELOG.md, `migrations/from-v1.md`, `migrations/from-v4.md`.
4. **`rules/rule-3-the-digest.md` (MERGE into rule-2)**
   - Rules: `prompt/CONTRACT.md:37,57`; `rules/rule-0-layers.md:31`; `rules/rule-2-the-status-envelope.md:24,36,44`; `rules/rule-4-1-edge-types.md:19` (`informs` carries a digest path); `rules/rule-4-the-graph.md:22`; `rules/rule-6-1…:31`; `rules/rule-6-2…:67,69`; `rules/rule-6-filesystem.md:33`; `rules/rule-11-contract-footer.md:25` (`{digest_path}`).
   - Router: `prompt/baton.md:186,195-196,253`.
   - Roles: `prompt/roles/node-orchestrator.md:24,45,47-49`; `prompt/roles/synthesizer.md:13-15,20`; `prompt/roles/phase-runner.md:11,64,148-149,171`; `prompt/roles/planner.md:54`; `prompt/roles/plan-verifier.md:44`; `prompt/roles/adjudicator.md:14`; `prompt/roles/briefer.md:16`; `prompt/roles/journey-probe.md:45`; `prompt/roles/casting.md:61`; `prompt/roles/panel.md:92`; `prompt/roles/decomposer.md:39,44`.
   - Modes: `prompt/modes/IMPROVE.md:213,223`; `prompt/modes/TEST.md:108,168`.
   - README and site: `README.md:308,314,546`; `index.html` (about 15 lines).
   - No tool parses `digest.md`, so this is prose-only.
5. **`rules/rule-4-4-decomposition.md` (MERGE into rule-4)**
   - `prompt/CONTRACT.md:62`.
   - `rules/rule-1-2-escalation.md:47`.
   - `prompt/roles/node-orchestrator.md:34`.
   - `prompt/roles/plan-verifier.md:29`.
   - `prompt/roles/planner.md:29`.
   - `prompt/roles/decomposer.md:23`.
6. **`prompt/roles/decomposer.md` (MERGE into planner)**
   - `prompt/roles/phase-runner.md:69`.
   - `prompt/roles/planner.md:60`.
   - `rules/rule-1-2-escalation.md:46`.
   - `rules/rule-4-4-decomposition.md:17`.
   - `rules/rule-8-2…:38`.
   - `README.md:268`.
   - `bundle.sh` globs `prompt/roles/*.md`, so it needs no edit.
7. **`prompt/roles/phase-runner.md` (MERGE into router).** "Phase runner" is the named actor in 11 rule files. Each needs "the dispatcher" substituted:
   - `rules/rule-0-layers.md:20,35,40`.
   - `rules/rule-2-1-verdicts.md:19`.
   - `rules/rule-4-2…:48`.
   - `rules/rule-6-2…:42`.
   - `rules/rule-7-1…:40`.
   - `rules/rule-7-2…:31,36,41`.
   - `rules/rule-8-2…:39,47`.
   - `rules/rule-9-1…:34`.
   - `rules/rule-9-2-refutation-triage.md:19,58,61,65,70,72,91,95,106`. Routing is "held by the phase runner"; this is the heaviest dependency.
   - `rules/rule-9-evidence.md:37`.
   - `rules/rule-10-the-operator-lane.md:30`.
   - Router: `prompt/baton.md:203,224,227,229`.
   - Roles: `prompt/roles/journey-probe.md:25`; `prompt/roles/panel.md:89`; `prompt/roles/synthesizer.md:26` ("phase-runner envelopes"); `prompt/roles/verifier.md:95,108`.
   - Modes: `prompt/modes/MIGRATE.md:146`.
   - README and site: `README.md:90,267,306,312,317,491`; `index.html` (about 14 lines).
   - Tools: `tools/check4-hint-tags.instrument.md:108`; `tools/aix-level1…instrument.md:60`.
   - Run state: `_orch/phases/P<n>/brief.md` stays, as the prime's own artifact.
8. **`rules/rule-5-1/5-2/5-3` (MERGE into rule-5).** Keep the §5.x anchors inside rule-5 and nothing below breaks.
   - Rule ids: `prompt/CONTRACT.md:65-67` (index).
   - §5.3 citations: `prompt/modes/CRAFT.md:232`, `DOGFOOD.md:171`, `GENERIC.md:106`, `MIGRATE.md:197`, `POSITION.md:182,251`, `REVIEW.md:168`, `TEST.md:154`; `prompt/roles/plan-verifier.md:32`; `prompt/roles/planner.md:40`.
   - §5.1 citation: `rules/rule-6-filesystem.md:43`.
9. **`tools/tiers.py` (PENDING #36, listed because its effort half goes now)**
   - `prompt/roles/plan-verifier.md:26`.
   - `tools/test-dispatch.sh:6,22,66,74`.
   - `tools/test-team.sh:6,25`.
   - `README.md:77,504`.
   - `MIGRATING.md:8` (`tiers.py remap`).
   - `index.html:295,1649`.
10. **Mode "Entry tiers" sections (PENDING #36)**
    - `prompt/baton.md:114,217` (the phase brief lists entry tiers).
    - `prompt/roles/phase-runner.md:7`.
    - `prompt/modes/ROADMAP.md:14`.
    - `README.md:325,490`.
    - The `rung-fit` seat: `prompt/modes/GENERIC.md:88,128`; `prompt/modes/ROADMAP.md:57,106,110,138`; `personas/lenses/{feasibility,dependency-order,regression-integrity}.md` link to it; `rules/prule-1-1a…:19`; `index.html:1241`.
11. **Mode "Seats" sections (PENDING #37)**
    - `bundle.sh:63` extracts `## Seats`…`## Gates`.
    - `tools/check4-hint-tags.sh` parses mode hints.
    - `rules/prule-1-1a…` carries a shell pipeline over `## Seats`.
    - `check8` guards seat resolution.
12. **Counts that go stale on any cut**
    - "48 rules" in `README.md` and `index.html:1612`.
    - "12 roles" in `README.md:491` and `index.html:1642`.
    - "10 modes" in `prompt/invoke.md` and `README.md:490`.

## B. Estimated word count of the kept framework (excluding personas)

"Framework" here means what an agent reads: `rules/rule-*.md` (12,808), `prompt/baton.md` + `CONTRACT.md` + `invoke.md` + `brief-tokens.css` (5,028), `prompt/roles/` (9,650) and `prompt/modes/` (18,558). That totals **46,044 words today**. `rules/prule-*`, `personas/` and tool code are excluded. I estimated each item's retained words per the tables; the per-item numbers are in the tables' reasons.

| scenario | kept words | change |
|---|---|---|
| A. Firm proposals only, every PENDING item kept as-is | **about 42,000** | about −9% |
| B. #36 collapses to one agent tier and #37 takes lenses off the default path (panel modes CRAFT, POSITION and REVIEW, casting, panel, Seats and Entry-tier sections all leave the default path) | **about 30,000** | about −34% |

The firm cuts are modest because almost everything on disk already does accountability work. The big numbers sit behind #37: lenses and luminaries are 32,514 words outside this count, plus 7,336 words of panel-only modes inside it. The modes are 40% of the framework and are mostly criteria (skeletons, gates, done, failure modes), which this inventory keeps.

## C. The 10 biggest single wins by words removed

| # | item | words removed | depends on |
|---|---|---|---|
| 1 | `personas/luminaries/` off the repo or the default path | 19,539 | #37 |
| 2 | `personas/lenses/` off the default path | 12,975 | #37 |
| 3 | `prompt/modes/POSITION.md` (panel mode) | 2,953 | #37 |
| 4 | `prompt/modes/CRAFT.md` (panel mode) | 2,746 | #37 |
| 5 | `prompt/modes/REVIEW.md` (panel mode) | 1,637 | #37 |
| 6 | Seats sections in the other 7 modes | about 1,256 | #37 |
| 7 | Entry-tier sections in all 10 modes | 1,193 | #36 |
| 8 | `prompt/roles/phase-runner.md` merged into the router (net, after about 600 words of routing move) | about 1,070 | **firm** |
| 9 | `prompt/roles/panel.md` | 861 | #37 |
| 10 | `rules/rule-8-1-the-human-brief.md` shape and voice duplicated in briefer.md | about 800 | **firm** |

**Firm-only wins, which need no experiment, in order:**

1. phase-runner merge, about 1,070.
2. rule-8-1 dedupe, about 800.
3. Router rationing prose, about 470 (offset by the merge above).
4. decomposer → planner, about 310.
5. rule-4-2 trim, about 235.
6. rule-0 merge, about 206.
7. prule-1-2, 198.
8. rule-1-1 effort table, about 180.
9. rule-6-2 narrative trim, about 200.
10. rule-3 digest merge, 129.

Tool-side, firm: the `tiers.py` effort check and the effort cases in `test-dispatch.sh`, `dispatch.py` and `index.py`.

## D. Must NOT be cut, even though it looks like rationing

1. **The escalation packet** (rule-1-2 step 2, node-orchestrator's `{escalation_path}`). It sits in the ladder file but it is the mechanism. RE: P41 closed 6 of 6 because of the packet; 142–143/150 rows came back CONFIRMED at either effort. Cut the ladder, keep "a retry carries the refuting rows verbatim, with a fresh verifier".
2. **The `human` tier and "second failure → a question"** (rule-1, rule-1-2 step 3). It is listed as a tier but it is the human-decision channel.
3. **Fresh-spawn verification** (rule-9, verifier.md). It reads like "verifiers run at frontier", which is tier routing. The part to keep is *fresh and independent*. R2's frontier verifier found three defects lower tiers missed, and v5's record has a fresh adversary breaking 3 of 3. Which model verifies is #36's question; whether a fresh agent verifies is not.
4. **Ledger `model` / `effort` / `served:` columns and `tools/dispatch.py`.** They look like tier bookkeeping, but they are the measured record every experiment here was computed from. R2 found 3 `<synthetic>` placeholder rows through `served:`. Keep the columns even with a single tier and a single effort.
5. **Concurrency 2 and serial batches** (rule-4-3, MIGRATE batching). They look like budget control, but they guard against session-limit stranding, an environment failure every experiment hit: LP's 13h38m gap, FM's P121, RE's two P41 workers.
6. **The §9.3 isolated retry.** It looks like a cost-saving retry, but it is the only thing that separates harness artefacts from bad criteria. R6: 23 of 32 UNSETTLEABLE rows were harness-made; R2: 19 of 24.
7. **ESCALATE / SPLIT / BLOCKED as honest early exits** (rule-2-1, the footer). The tier wording goes; the exits stay. FM's P160 `BLOCKED` on an accurate false-premise check was the right answer and the cheapest pair.
8. **"The layer that holds gates never authors work."** The prime's "you may never read work" is mostly context rationing and can relax. "You may never do object-level work" plus synthesizer's "from the record only" are independence and evidence discipline, so keep those.
9. **rule-6-2 worktree landing.** It reads like file plumbing but is evidence preservation (F2: 8 criteria UNTESTED forever).
10. **rule-7-1 measured time.** It reads like budgeting, but it is anti-fabrication: "an empty cell, never an estimate".
11. **The digest's EVIDENCE and RESIDUAL RISK lines.** Merge them into the envelope; do not drop them with the 10-line cap.
12. **The tier histogram in the final report.** Drop its "plan the next run's tiers" purpose, but keep "how much needed a person" and the reroute count. Both are accountability.
13. **bundle.sh.** Its comment justifies it by context, but it is the only path for a session with no network and no clone.

## E. Defects noticed along the way (no edits made)

- `prompt/invoke.md`, settings table, `TEAM` row: "every question an Issue, every product node a draft PR" is v4 behaviour. v5 is one PR, one comment per question.
- `rules/rule-4-the-graph.md:31` and `:35` duplicate the opening of the `isolation: worktree` paragraph.
- `rules/prule-1-2-…` says nothing reads `## In <PHASE>`, but `prompt/roles/journey-probe.md:16` and `prompt/roles/panel.md:38` do.
- `rules/rule-1-1-entry-rung.md` on `main` still says "high to build". The evidence that changed it to "medium to build" (EB2) and marked the retry row measured-inconclusive (RE) lives only on `retry-effort-experiment`, unmerged.
