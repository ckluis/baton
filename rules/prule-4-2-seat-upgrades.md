---
type: Rule
id: prule-4-2-seat-upgrades
title: "4.2. Seat upgrades"
section: "4.2"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-4-casting
---

### 4.2 Seat upgrades

A mode names **seats** — `coverage-truth`, `spec-fidelity`, `journey-honesty`.
Seats are always fillable by this repository's built-in lenses, so every mode
runs with `PERSONAS: none`. When a richer roster is loaded, casting may
**upgrade a seat** to a named persona whose tags match.

A mode's upgrade hints name tags like `ethnography` or `release-engineering`
that **no built-in lens carries**. That is correct. Hints are matched against the
*loaded roster*, which is usually somebody else's — they describe the named
expert you would rather have in that seat. With `PERSONAS: builtin` every hint
misses, every seat keeps its lens, and the mode runs exactly as designed.

The seat's phase duties still govern. A named expert filling the
`coverage-truth` seat audits coverage truth — it does not redirect the panel to
its own favorite subject. **The mode owns what gets examined; the persona owns
how it is examined.**
