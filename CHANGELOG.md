# Changelog

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
