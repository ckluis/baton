# Experiment: do persona lenses still earn their place?

Drafted 2026-10-01 · Status: **PRE-REGISTERED, not yet run** · Issue #37

## The question

Baton carries 37 expert lenses, 41 luminaries and 7 user archetypes, about 35,000 words. A lens is a
bound point of view seated at a phase (personas CONTRACT). With a current model, does seating one make
a reviewer find more, or is a plain careful reviewer as good?

## Design

- **The artifact:** one of the effort bench's best builds (a URL-shortener API, about 970 lines,
  judged 8.33/10) with **16 defects seeded** by the experimenter. Its own tests stay green
  (62 pass, 1 skipped), so running the tests finds nothing. Ground truth is kept outside the
  reviewers' reach.
  - 3 aimed at `adversarial-input`
  - 3 at `spec-fidelity`
  - 4 at `test-honesty` (each weakened test hides a code defect)
  - 3 at `claim-evidence` (README claims the code does not back)
  - 3 aimed at **no lens**: missing server timeouts, an `X-Forwarded-Host` host-header injection,
    `Math.random` slugs
- **Reviewers:** `claude-opus-5-5` at `medium`, rule 1.1's verification effort. Each gets the task's
  spec and a private copy it may run. Agent and web tools are disabled.
- **Conditions,** three replicates each:
  - **A, plain:** one reviewer, no persona.
  - **B, panel:** four reviewers, each seated with one of the four lens cards (loaded unmodified from
    `personas/lenses/`). Their findings are pooled.
  - **C, one reviewer, four lenses:** one reviewer given all four cards, told to cover each.
  - **D, plain ×4:** four plain reviewers, pooled. **The control:** the same spend as B with no
    persona, so B against D isolates the cards from the extra spawns.
- **Scoring:** a fresh `claude-opus-5-5` / medium scorer per review set, blind to condition, matches
  findings to the seeded list. A match needs the same location and the same problem, not merely the
  same file. It also counts findings that match nothing. Recall is out of 16, overall and per lens.

## Pre-registered decision rule

With `R(x)` the mean seeded defects found by condition `x` across its three replicates:

- **Persona cards earn their place** if `R(B) ≥ R(D) + 2` (a panel beats an equal-spend plain
  ensemble), **or** `R(C) ≥ R(A) + 2` (the cards help a single reviewer at the same spend).
- **Persona cards are cut from the default path** (kept as an optional library) if
  `R(B) ≤ R(D) + 1` **and** `R(C) ≤ R(A) + 1`.
- Per lens: a card that does not find more of *its own* category than condition D did is recorded as
  not earning its seat, whatever the totals say.

`kind: user` archetypes (journey probes against a running interface) are **not** tested here, and
the result says nothing about them.

## Result

Not yet run.
