# Changelog

## Unreleased

## v3.2 — 2026-09-06

Everything here came from running baton on itself: a replay of the eighteen nodes the self-run
refuted, at the top rung, followed by an independent review of that replay. The two rules from the
"Unreleased" section that preceded this release, §9.2 and §8.1, ship here too.

### Contract

- **`prompt/CONTRACT.md` §8.2 — every blocking decision ships a slide, not only the two gates.**
  The trigger is the consequence, not the gate: a decision that stalls work until a person answers
  gets a slide in the run's brief; a decision the run continues past gets a ledger row. The expensive
  layer writes the question, the shape and three options into `_orch/inbox/Q-<n>.md`; a rung-2
  briefer renders it; the answer lands beside it as `Q-<n>.answer.md`; the run reads it at its next
  gate. The deck is cumulative across the run, every path a person is asked to open is absolute, and
  the closing message names the deck and says how many decisions need a human, never what they are.
  **A slide that schedules a decision has not made one**: options about who decides or what order to
  decide in settle nothing, and the test is mechanical — read the recommended option and ask what
  changes on disk. One token set, `prompt/brief-tokens.css`, is inlined verbatim by every brief; a
  briefer that declares its own palette has forked the house style. `prompt/roles/briefer.md`,
  `prompt/roles/phase-runner.md` and `prompt/baton.md` updated.
- **`prompt/CONTRACT.md` §6.2 — a worktree node lands its outputs before the worktree dies.** §6 said
  `work/` holds all artifacts; §4's `isolation: worktree` had the node write its products into a
  tree that was then removed. Now the layer that created the worktree copies every envelope
  `outputs` path to `_orch/nodes/<id>/work/tree/<worktree-relative path>` and verifies each copy
  before `git worktree remove`; the envelope is rewritten to the landed paths with the original kept
  as `worktree_path`. Landing is evidence, not shipping: the product reaches `main` only through a
  merge node the plan names. In the replay, `F2`'s fourteen lens files died with its worktree and
  eight of its ten criteria became unverifiable forever.
- **`prompt/CONTRACT.md` §9.3 — settle it in isolation before you call it unsettleable.** Before a
  verifier writes `UNSETTLEABLE` on a criterion that reads the tree, the branch or the index, it
  re-runs the criterion's own settling command once in a private worktree that holds the node's
  commit plus the node's own landed outputs and nothing else. It settles → `CONFIRMED` or `REFUTED`.
  It reads a thing no tree holds — a branch pointer, a tag list, another node's output, the index —
  → the new shape `reads-immutable-ref`. Its target is outside the node's write set or its input was
  withheld → `measures-outside-node`, kept. The retry is a worktree inside the verifier's spawn, not
  a spawn. The replay's twenty-three `measures-outside-node` rows were all caused by the replay's
  own harness, but that run isolated every node at concurrency one and so could not produce the
  shape's founding case; the shape stays until an ordinary run labels its instances.
- **`prompt/CONTRACT.md` §9.2 — a rewrite is judged on substance against an artifact that predates
  it.** An answer's rewrite may narrow what is measured or name the command that measures it; it
  may not add a literal the artifact was never asked for — a fixed heading, a file name, a command's
  raw output — and then refute the artifact for lacking it. Observed on `P90b`: twelve rows of an
  artifact with a clearly headed amendment section came back `REFUTED` on a heading chosen two days
  later.

### Tools

- **`tools/lint-criteria.py` — two rules, and the right section.** Rule F flags a criterion that
  demands a success token from a harness check whose only output lines are failures, reading the
  script rather than matching keywords; it reads `printf`, credits a check with what a helper
  function it calls prints, and reads a negated failure noun as the success message it is. Its
  claim is ambiguity, not impossibility: the archived run's verifiers confirmed the same sentence
  reading silence as the pass. Rule G flags a before/after contrast whose before-state is a copy the
  node's own first act takes, when the handoff never tells the node to change the artifact and
  history holds no distinct version. The parser now lints a fan-out handoff's own done-criteria
  rather than its children's — `F2`'s ten node criteria had never been scored. `--selftest` grew
  from thirteen cases to twenty-one; the flag count over the corpus is unchanged.
- **`tools/index.py --state-root`** (or `BATON_STATE_ROOT`) — a run whose state is not `_orch/`
  can be indexed. The replay logged three `INDEX-FAILED` rows because the path was hardcoded.

### Experiments

- **The rung-6 replay ran, and its pre-registered rule returned inconclusive.** Eighteen nodes the
  self-run refuted were replayed with the worker at rung 6 and the verifier at the rung that refuted
  each. Work-class arm: no first-try verdict carried a `REFUTED` row; every non-confirmation was an
  environment or protocol row; under the pre-registered instrument the count sits in the rule's
  inconclusive band, and the arm is not evidence about rung 6 in either direction. Criterion-class
  arm: capability-independent on the rule's words. The run's report, addendum and errata live in
  the run directory; `docs/experiments/replay-refuted-at-rung-6.md` carries the result.


- **`prompt/CONTRACT.md` §9.2 — refutation triage.** A verifier now has a fourth row
  verdict, `UNSETTLEABLE`, for a criterion no execution inside the node could have settled as
  written: an enumeration with no generating command, a measure of the tree or branch, a false
  premise, a contradiction inside the handoff, or a form an answer already superseded. The row
  must name its shape and carry the command that demonstrates it, or it is read as `REFUTED`.
  The node computes to `PARTIAL`, is not re-verified, and parks as `BLOCKED`-and-batched on a
  question the phase runner writes on its behalf proposing a bounded rewrite; it never buys a
  bigger model. Every such row is appended to `_orch/lint-feedback.yaml` for the final report.
  §1.2 trigger 3 is unchanged; §9.1, §6, §4.2, §10.1 amended; `verifier.md`, `phase-runner.md`
  and `synthesizer.md` updated. In baton's own run, of twenty-one refutations examined fourteen
  were traceable to their follow-up: six changed the criterion, eight the product; `P76`
  criterion 1 cost fifteen spawns, and a phase runner improvised this rule at `ACCEPT-P90c`. It
  is the narrow successor to the withdrawn materiality draft
  (`docs/designs/proportionality-and-detection.md` §1): it adds the token at the row, where §9.1
  already computes, and parks the node in a state the gates already know.

- **`prompt/CONTRACT.md` §8.1 — the human brief.** The two gates that reach a person, the
  blocked batch and the final gate, now ship one HTML page beside their record:
  `_orch/brief/blocked-<n>.html` and `_orch/brief/final.html`, written by a new rung-2 role,
  `prompt/roles/briefer.md`. The page is a deck, one slide per decision, split at the golden
  ratio: the wide side carries a title, a description, a visual only when a table cannot carry
  it, and exactly three options A, B and C with the recommended one marked; the rail beside it
  carries the reason, the consequence of doing nothing, each option's cost, risk and what it
  settles, a numbers table whose every row shows its command, and the paths. Plain technical
  English by rule: short declarative sentences, defined terms, no metaphor, no numbers in prose.
  Derived from the report, never authoritative, disposed of with `_orch/`. The router's closing
  message names the brief before the report.

## v3.1 — 2026-09-02

### Modes and personas

- Added `personas/lenses/representation-truth.md` — a lens for how state is
  *represented*: invalid combinations a type permits but the domain forbids,
  shapes re-assumed at every call site, branching a table would carry. It
  refuses abstraction for hypothetical extensibility and refuses relocating
  existing branching behind a new type.
- `IMPROVE` gained a **design baseline** beside its behavior baseline. `T01b`
  freezes three to five representative change scenarios before scoring the
  module against them; `T40` re-scores against the frozen scenarios after the
  execution loop, taken by a different agent, and reports the delta per
  principle. The mode could previously prove nothing broke; it could not prove
  anything got better. No score is used as a pass/fail gate.

### Contract

- **`prompt/CONTRACT.md` §7.2 — two ledger row classes, one writer each.** The schema described
  a spawn row; runs also record events that are not spawns — a gate closing, a drift applied.
  Those now have a stated shape: `n/a` rung rather than `0` (because `0` is a real rung), empty
  `seconds` rather than a synthesized one, and excluded from the rung histogram because they
  describe the run rather than its spending. Exactly one layer writes any given **fact**; two
  layers with different things to record about one event write two rows, distinguished in the
  note. Three gate events were written twice in baton's own run, by the phase runner and the
  prime, with different content each time — a lossy-record defect, not a corrupted-histogram
  one. `prompt/roles/phase-runner.md` updated to match.

### Design notes

- `docs/designs/simplicity-scorecard.md` — the design behind IMPROVE's baseline above.
- `docs/designs/proportionality-and-detection.md` — three further contract changes that were
  drafted, adversarially verified, and **withdrawn rather than shipped**: verification effort
  capped by criterion priority, briefs carrying locators instead of facts, and partitioned
  fan-outs overlapping to detect verifier divergence. All three diagnoses hold; all three drafts
  were unsound. The document records what each needs before it can ship, so the next attempt
  starts from the failures rather than rediscovering them.

### Every rule is a file

`prompt/CONTRACT.md` was 663 lines and `personas/CONTRACT.md` 308, and a rule
stated in one of them was restated in three or four other places — the role
prompts an agent walks, the mode files, the Python that implements it. Amending
one and missing the rest failed three consecutive reviews of a single change.

**46 rules now live one-per-file under `rules/`**, as OKF/AIX concepts with a
stable `id`, a `section`, and typed `part-of` links. The contracts become thin
narrative plus a **generated** index — 82 and 63 lines. This removes a class of
mistake instead of detecting it: there is nowhere to amend a stale copy of a rule
because there are no copies, and the index cannot drift because nobody writes it.

`bundle.sh` concatenates every rule in section order, so the paste an agent
receives is unchanged. Verified by word-frequency diff of the full bundle before
and after: **zero words lost**.

`tools/rules.py` is now 209 lines and is a gate rather than an index. It refuses
on: a rule file that does not parse or is missing a required field, a duplicate
id, a filename that disagrees with its id, a `links.to` that resolves to nothing,
a numbered rule heading surviving in a contract (a rule with two homes), a stale
index, or a rule id cited anywhere in the repo that is not a rule. `--selftest`
mutates a copy of the rule set four ways and requires every mutation to be
**rejected** — the previous version of this tool was withdrawn because its
self-test was monotone-positive and scored 5/5 against an implementation with no
matching logic at all.

Ids are unambiguous where sections were not: `§4.1` exists in both contracts,
`rule-4-1-edge-types` and `prule-4-1-selection` cannot collide.

## v3.0 — 2026-08-31

Named experts, two new modes, and the OKF/AIX interop layer this repository now
carries about its own bundle.

**Personas**
- Added a vendored luminary roster under `personas/luminaries/`: 40 named-expert
  persona cards. It is opt-in, not built-in — reached only by asking for
  `PERSONAS: builtin+luminaries`; a run that asks for plain `builtin` seats exactly
  what it seated before this roster existed.
- Added 15 new lenses under `personas/lenses/` (36 now, versus 21 at v2.0), so every
  seat in the two new modes, `CRAFT` and `POSITION`, has a built-in fallback and
  both modes run with no roster at all.
- `personas/CONTRACT.md` gained §1.2, new since v2.0 — the section does not exist at
  the tag at all. It records the `## In <PHASE>` phase-override convention —
  tested twice, at AUDIT and again at CLASH — as a documented grammar reserved for a
  future roster author, not a mechanism baton runs on today. No shipped persona uses
  it, and nothing in baton reads it.

**Modes**
- Added `CRAFT`, which seats an adversarial panel of craft experts against a
  target's experienced surface — type, colour, motion, microcopy, information
  architecture, accessibility, localisation — captures that surface first so every
  seat argues from a file, and returns a ranked, cited recommendation matrix.
  Refuses to drive journeys, which is DOGFOOD's subject, and refuses to fix
  anything — every finding leaves as a matrix row for a later run, never a diff.
- Added `POSITION`, which seats an adversarial panel of commercial experts against a
  target's commercial surface — positioning, pricing and packaging, naming, the
  story, launch readiness, and the discovery evidence underneath — builds a claim
  ledger first so every seat argues from a quoted line, and returns a ranked, cited
  recommendation matrix. Refuses to build anything and refuses to ship anything — it
  does not approve a launch.

**Interop**
- Adopted OKF/AIX bundle interop: persona frontmatter may carry optional `type`,
  `id` and `links` keys, ignored entirely by baton's own loader and meaningful only
  to an external AIX consumer. A new validator, `tools/aix-validate.py`, checks
  `personas/` — baton's own bundle, never a foreign `repo:` roster — at **AIX level
  1**.

**Generators**
- `tools/embed.py` generates `index.html`'s embedded invocation card and router
  disclosure, extracted from `prompt/invoke.md` and `prompt/baton.md`.
- `tools/index.py` generates `_orch/index/index.json` and `_orch/index/summary.md`,
  the five-question resume index computed off `_orch/` run state.
- `tools/instruments.py` generates `_orch/instruments/instruments.json` and
  `_orch/instruments/summary.md`, the instrument scorecard.

**Instruments**
- Added the instrument lifecycle design, `docs/designs/instrument-lifecycle.md`, and
  10 `tools/*.instrument.md` records — one per acceptance check — that the
  scorecard above reads.

### Breaking

- **`bundle.sh` warns-and-ships → exits 1 on a missing seat.** At the tag:
  `[ -f "$f" ] && emit "$f" "$d" || echo "warn: seat $slug has no file" >&2` — a
  warning to stderr, then the bundle ships anyway. Now: a seat with no matching
  file under `personas/{lenses,luminaries}` or `personas/users` prints
  `` error: mode $mode seats `$slug` but no file exists in personas/{...}/ `` and
  the same line notes "a bundle missing a seat is a bundle that silently runs
  short-handed," then the script `exit 1`s. Symptom: a roster that bundled
  successfully under v2.0 — short a seat, silently — can hard-fail under v3.0 with
  the exact same command and the exact same roster.

- **Eleven lenses gained phases.** `phases:` differs between the tag and the
  working tree for: `adversarial-input` (`AUDIT, CLASH, VERIFY` → `PLAN, AUDIT,
  CLASH, VERIFY`), `call-site-truth` (`AUDIT, VERIFY` → `AUDIT, CLASH, VERIFY`),
  `equivalence` (`AUDIT, VERIFY` → `AUDIT, CLASH, VERIFY`), `integration-risk`
  (`PLAN, AUDIT, VERIFY` → `PLAN, AUDIT, CLASH, VERIFY`), `journey-honesty`
  (`AUDIT, VERIFY` → `AUDIT, CLASH, VERIFY`), `leverage-vs-risk` (`PLAN, CLASH` →
  `PLAN, AUDIT, CLASH`), `persona-fidelity` (`AUDIT, VERIFY` → `AUDIT, CLASH,
  VERIFY`), `scope-creep` (`PLAN, CLASH` → `PLAN, CLASH, VERIFY`),
  `severity-inflation` (`AUDIT, CLASH` → `AUDIT, CLASH, VERIFY`), `spec-fidelity`
  (`AUDIT, CLASH, VERIFY` → `PLAN, AUDIT, CLASH, VERIFY`), and `test-honesty`
  (`AUDIT, CLASH` → `AUDIT, CLASH, VERIFY`). No `rung:`, `kind:` or `tags:` line
  changed for any lens or user persona. Symptom: an existing mode now spawns duties
  at phases where these lenses previously stayed silent, so a v2 run's seat count
  and cost change without the operator changing anything.

- **The author-and-verify guard.** `prompt/CONTRACT.md` §4.1 now reads: "That
  separation binds `personas:`, not just authorship. A persona slug seated on a
  node may not also be seated on a node that `refutes` it, nor on the verification
  of a node it was seated on to author." Absent at the tag — `grep -c 'That
  separation binds'` against the tag's `prompt/CONTRACT.md` prints `0`. Symptom: a
  graph that was legal under v2 — the same persona slug seated to author a node and
  again on its verification — is now refuted at the plan gate before any of it
  runs.

- **Verdicts are per-criterion and computed, not asserted.** At the tag,
  `prompt/roles/verifier.md` wrote a single flat object:
  `{"node": "{node_id}", "verdict": "CONFIRMED|REFUTED|PARTIAL", "evidence":
  ["paths"], "probe": "what you tried"}`. `prompt/CONTRACT.md` gains §9.1: a
  verdict now carries a `criteria` array with one row per handoff done-criterion,
  and the node verdict is derived from those rows rather than written directly —
  "A verdict whose row count does not match the handoff's criterion count, or
  whose node verdict disagrees with that table, is malformed: the phase runner
  reads it as `PARTIAL` and re-verifies. It does not get to be a `CONFIRMED`."
  Symptom: a verifier that still writes the old flat-object shape — exactly what
  worked under v2.0 — gets its `CONFIRMED` silently downgraded to `PARTIAL` and the
  node re-verified, even when the node's own work never changed.

- **`DOGFOOD`'s Seats table drops a phase from `returning-power`.** At the tag:
  `` | `returning-power` | user | PLAN, PROBE, VERIFY, CLASH | ... | ``. Now:
  `PLAN, PROBE, VERIFY` — `CLASH` is gone. Symptom: a `DOGFOOD` run under the
  default `PERSONAS: builtin`, with no change on the operator's part, now seats
  `returning-power` at one fewer phase than it did under v2.0, so a CLASH-phase
  finding this persona used to be eligible to raise no longer gets raised.

## v2.0 — 2026-08-24

A cost rewrite. The v1 architecture was right; its routing was expensive in one
direction, and the top model paid for all of it.

**Routing**
- Replaced the four-tier model ladder with **six rungs of model × effort**.
  `sonnet/medium` is the default rung.
- One failure moves a node **one rung**, not one model tier — a failing rung-1
  node buys more thinking before it buys a bigger model.
- Added `CEILING` (default rung 4, `opus/high`). Fable rungs are reached by
  asking, not by drifting.
- Added **rung drift**: a phase runner raises or lowers the default entry rung
  from what its phase is actually doing, and resets at the gate.
- Made **de-escalation mandatory** — a diagnosing rung must hand the specified
  fix back down or say why it could not.

**Layers**
- Added the **phase runner** between prime and nodes. The prime now spends about
  one turn per phase instead of one per task.
- Added `PRIME_TURNS`, a declared budget for the conductor's own turns, with a
  documented handover to an opus deputy when it is spent.
- Formalized the **digest**: ten lines, written by the producer, the only thing
  that crosses a layer besides an envelope.

**Topology**
- The plan is a **graph** with typed edges — `needs`, `informs`, `refutes` —
  instead of a task list with `blocked_by`.
- Convergence became a first-class **`kind: loop` node** with a seen ledger,
  a declared invariant, and a mandatory exit condition. Dedupe is against
  everything seen, not everything admitted.
- Added `fanout` / `barrier` node kinds and the pipeline-by-default rule.

**Personas**
- Split the prompt into a **router plus files**: two contracts, 8 modes,
  11 roles, 28 personas.
- Introduced the persona schema with two kinds — `expert` and `user` — and a
  per-phase duty table for each.
- Personas load from any repository, and a file carrying only `name` and
  `domain` is valid. `repo:github.com/ckluis/luminaryTeam` works unmodified.
- Added **seats** and seat upgrades: modes name what gets examined, personas
  own how.
- Added 7 end-user archetypes and the screenshots-only perception contract.
- Independence is now structural — each persona is its own context — so
  unanimity is treated as a failure signal and gets a forced clash.

**Verification**
- Verification runs at the node's own rung, not one above.
- Added the **refutation quota**: five consecutive confirmations in a phase
  trigger an adversary one rung up.
- Added `UNVERIFIED` — a finding whose citation does not check out stays in the
  report and cannot block.

**Invocation**
- What you paste is no longer the router. `prompt/invoke.md` defines an
  eleven-line invocation — a goal, `TARGET`, `MODE`, and three lines pointing
  the session at the router's URL. Every other setting has a default.
- **No install step.** `BATON` defaults to the canonical raw URL, so a run needs
  no clone, no config file, and nothing on disk but its own state.
- Every path in every baton file resolves against wherever the router came from,
  which makes the base URL the version pin — point at a tag and the whole
  framework comes from that tag, with no second version to keep in sync.
- Casting can enumerate a `repo:` persona source over the GitHub contents API
  when git is unavailable, and degrades to the built-in lenses rather than
  blocking the run when neither route works.
- CONTRACT §6.1 separates framework locators (a directory or a URL) from run
  state (always local disk, always).
- The router became a document the *agent* reads. Pasting it meant carrying the
  whole procedure by hand in order to tell an agent to go read the procedure,
  and it spent 162 lines of the one context the design exists to protect.

**Asking beats requiring**
- `TARGET` and `MODE` are no longer required in the paste. The router reads the
  Goal, infers the mode, and asks the operator to confirm through the session's
  structured question tool — leading with its best fit and the two next-best
  rather than listing all eight, because a question with eight options is a menu.
- It may list directories (listings only, never contents) to turn "the billing
  module" into `src/billing`, and proposes the obvious candidate.
- Where it cannot ask, it infers, records the inference *as* an inference in
  `manifest.json` and `directive.md`, and surfaces it in the first message and
  the final report. A stated assumption is recoverable; a silent one is not.
- The minimum paste is now seven lines: a goal, and three pointing at the router.

**Locators**
- Every framework reference in every prompt file is now written
  `{BATON}/prompt/...` or `{BATON}/personas/...`. `{BATON}` has exactly two
  forms — a local directory or a base URL — and agents expand it before using it
  or passing it on, so a sub-agent always receives a fully qualified path or URL
  and never guesses a base.
- The router carries the locator table for every framework file; the contract
  footer carries the resolved contract locator, so a spawned agent can look up a
  rule it lacks instead of guessing one.
- Wired `prompt/roles/plan-verifier.md` into the plan gate — it was written but
  never named, so nothing could reach it.

**The page**
- Gave every mode its own hero band with risograph concept artwork drawn as
  inline SVG — two plates (yellow and cyan) with halftone fills and a 2px
  misregistration, no external assets. Each drawing is the mode's actual
  topology rather than a decoration of it.
- Added a "what comes out" section: the `_orch/` tree a run leaves behind, and
  the rung histogram beside it.

**Operations**
- Added the **operator lane**: a blocked run can be answered mid-flight. A
  message is a doorbell, never a document; the answer goes on disk.
- Added `ledger.csv` and the **rung histogram** in the final report.
- Added `bundle.sh` for environments that cannot clone.

## v1.0 — 2026-08-23

Initial release. A single 571-line prompt: a Fable-led orchestrator of
orchestrators with file-passing handoffs, a four-tier escalation ladder,
adversarial verification, and six modes.
Now preserved in this repository as `baton-v1.html`, byte for byte apart from
its own metadata, an archived banner, and links pointing at v2.
