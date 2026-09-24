# v5 — the accountability layer: the design record

Written 2026-09-21, from the question that preceded it: *does baton make sense in a
world with Fable/Astra-level intelligence?* The answer that survived the evidence
is: half of it, and that half matters more now.

## The premise, and what it changes

Every version through v4 priced one thing: the most capable model was the expensive
part of a run. The six-rung ladder, escalation "one rung not one model", the ceiling,
drift, de-escalation, effort-as-a-rung — all of it exists to spend the big model as
late and as rarely as possible. `rules/rule-1-1-entry-rung.md` said it in one line:
*"Assigning high wastes the budget on work that would have succeeded low. Assigning
low costs one extra attempt. The asymmetry is the entire argument: assign low."*

When the most capable model is the sensible default for anything with judgment in
it, the asymmetry reverses. Assigning frontier to mechanical work wastes a little;
assigning cheap to judgment costs the attempt, the verification that refutes it, the
escalation, and a defect the cheap tier introduced that the verifier missed. The
ladder collapses to two agent tiers and one human. That is the whole of v5's
subtraction, and it is a *bet on the premise*, recorded as such: the ledger keeps
`tier`, `model`, `effort` and `seconds` per spawn so the bet is measured, and the
replay harness (`docs/experiments/replay-refuted-at-rung-6.md`) can re-run it.

## What the evidence says ages well

- **Independent verification, at every tier.** A rung-4 adversary broke 3 of 3
  contract changes drafted by an Opus-5 author (`proportionality-and-detection.md`);
  refutation rates were flat across rungs (5/18, 11/38, 5/23). Capability of the
  author does not remove the value of an independent checker — it makes the
  author's mistakes subtler.
- **The criterion, not the model.** A third of traceable refutations were the
  *criterion* being wrong; every remaining non-confirmation in the rung-6 replay was
  an environment or protocol defect. Neither is an intelligence problem.
- **The four things no intelligence answers:** who has the authority to decide;
  what "done" means; whether someone else can check the evidence; whether the run
  survives a session or a laptop. Those are §8/§10, §4.5/§9.1, §9, and §6 — and
  v4's team mode is entirely on this side.

## What ages badly — and is cut

| cut | was | why |
|---|---|---|
| six rungs → three tiers | §1 | the premise it priced changed |
| 1.3 de-escalation is mandatory | a duty | a planner's choice now, not a rule; frontier holding the fix is not waste |
| 1.4 ceiling | the cost enforcement point | frontier is the ceiling; a person is asked, never a larger model |
| 1.4a who assigns the rung | persona duties at fixed rungs | every persona duty is frontier work |
| 1.5 rung drift | per-phase adaptation | fired once in eleven phases; lower branch never |
| 1.6 effort is not free | effort as a rung | effort lives inside the tier |
| §9 refutation quota | five clean confirms → an adversary | never fired in the self-run (10 attacks, 9 failed, streak clean) |
| `PRIME_TURNS` and the deputy | the prime's budget | never used; §3's context discipline is what protects the prime |
| `CEILING` | a setting | replaced by `CHEAP` and `FRONTIER`, which name models, not limits |

53 rules become 48. The corpus was already mostly invariants; the ladder was the
procedural part.

## What stays, unchanged

§2 the envelope, §3 the digest, §4 the graph and its edges, §5 the loop, §6 the
filesystem and the record (v4), §7 the ledger, §8 gates and briefs, §9.1–9.3
computed verdicts and refutation triage, §10 the operator lane and the Issue
doorbell, §11 the footer, every persona rule, all ten modes' directives, seats and
gates, and every tool. The rung *field* keeps its name in graphs, envelopes,
persona cards and the ledger, so nothing that reads them changes; its values are
`0`, `1` or `n/a`.

## Decisions, as built

1. **The pitch.** "Agents do the work. baton keeps the record." Cost discipline is
   a property, not the headline.
2. **Three tiers.** `0 cheap` — mechanical, verifiable by command, assignment only.
   `1 frontier` — the default; everything with judgment. `2 human` — a question,
   never a spawn. Mapping from v4 values: `0 → 0`, `1–6 → 1`.
3. **Escalation is two moves and then a person.** cheap → frontier once; frontier →
   frontier once more *with the verdict's rows in the handoff*; then a question.
   Contradictions go to an adjudicator at frontier; `SPLIT` to a decomposer at
   frontier; `UNSETTLEABLE` parks, as before. A verifier is always frontier and
   always a fresh spawn.
4. **Dispatch belongs to the harness.** A session that can run agents in parallel
   and wait for their envelopes dispatches a phase's nodes through that facility
   under the same handoff-and-envelope contract; the phase-runner role is the
   fallback. Layers are a discipline of context and independence, not a hierarchy
   of spawns.
5. **Rules are invariants.** Five deleted, four rewritten, one bullet cut. A rule
   that scripts *how* an agent should work is gone; a rule a verifier or a tool can
   check stays.
6. **Compatibility by construction.** Field and column names unchanged; values
   remapped mechanically across 10 modes and 84 persona cards by
   `tools/tiers.py` (with `--check`), so a v4 `_orch/` resumes under v5 without
   conversion — its old rung values simply read as frontier.

## Team mode, quiet — decided during the same review

Chris's next objection, once the ladder was gone: v4's team mode "polluted"
GitHub. It put a new object on the repository for every baton concept — a
branch per run, a branch and draft pull request per node, an Issue per question,
labels, a Pages folder per run, a release per disposal. Nothing had run under it.

v5's team mode uses only the three things a repository already has, and leaves
what a colleague's own work leaves: **one pull request, one branch, commits.**

| concern | v4.0 | v5.0 |
|---|---|---|
| the record | branch `baton/run/<id>` | hidden ref `refs/baton/run/<id>` — pushable, fetchable, permalinkable by sha, listed nowhere |
| the product | branch + draft PR per node | one commit per node on the run branch `baton/<id>`, trailers `Baton-Node`/`Baton-Run`, one draft PR for the run |
| the doorbell | Issue per question, sub-issues, labels | a comment per question on the PR; `/answer Q-<n> …` replies; every gate one comment |
| the deck | Pages | the brief's markdown twin, inside the gate comment |
| disposal | a release, then delete | delete the hidden ref; the PR stays |
| verdicts | commit status per node branch | commit status per node commit — the PR's checks |

What is given up: per-node review granularity becomes per-commit (a gain); a
ruleset cannot protect a custom ref, so the hidden record has no force-push guard
— it is protected by push permission and by being re-pushable from any checkout;
and the deck in a comment is markdown, not a page, which is less pretty and more
where people look. `tools/test-team.sh` now ends with the footprint assertion:
1 branch, 1 thread, 0 issues, 0 labels, 0 pages, 0 releases.

One assumption the fakes cannot verify: that GitHub opens a pull request from a
branch that is one *empty* commit ahead of its base. The tool falls back to an
Issue as the thread if it cannot; the first real run settles it.

## Rejected

- **Rename `rung` to `tier` everywhere.** Correct in name, breaking in every reader
  — `index.py`, the ledger, every graph and card — for no behaviour. The name is a
  handle; the rule says what it means.
- **Delete the phase runner.** It is the fallback for a session without a dispatch
  facility, and the paste path still exists.
- **Cut modes to fewer.** What a mode examines — as built, as encountered, as sold —
  is the durable part; only its entry tiers changed.
- **Drop verification for frontier nodes.** The one thing the evidence forbids.

## The bet, measured

Every spawn still records tier, model, effort and seconds. If frontier-by-default
costs more than the runs it saves, the histogram will say so; if the cheap tier's
work starts failing verification, the ledger will say where. The replay harness is
the experiment: run the same eighteen nodes under v5's two tiers, and compare.

**It was measured, and the dollar half of the premise did not hold.** Two runs on the
same eighteen nodes and the same harness:

- `docs/experiments/replay-two-tiers-opus-5-5.md`: frontier at every seat confirmed
  6 of 9 work-class nodes first try (rung 6 got 5), for $78.53 in pairs. The cheap
  tier's one node passed a frontier verifier.
- `docs/experiments/ladder-price-on-two-tier-harness.md`: each node at its original
  rung confirmed 4 of 9. Charged a frontier retry for both nodes it lost, it still came
  to $60.09, **23.5% cheaper**, pre-registered and outside the wash band. Seconds were
  even (3h37m against 3h40m), and verifier strictness did not follow tier.

So "assigning cheap to judgment costs more than it saves" is false on this corpus:
the asymmetry the premise predicted is there, and smaller than the price gap.

**Frontier stays the default, for a different reason.** The reason is operational.
One agent tier needs no entry-tier assignment, and a fresh run cannot plan one well:
the ladder's winning rungs came from a ledger a new run does not have. There is no
drift or de-escalation to audit, and one binding to change when models move. That
argument is unpriced, and it is the one v5 now rests on. The open measurement is
whether effort buys the saving without the ladder: the same nodes with the frontier
model at medium effort in both seats. If it matches frontier's yield at the ladder's
price, v5 keeps one model and lowers its default effort.
