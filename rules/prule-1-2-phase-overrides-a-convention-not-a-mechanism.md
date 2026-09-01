---
type: Rule
id: prule-1-2-phase-overrides-a-convention-not-a-mechanism
title: "1.2. Phase overrides — a convention, not a mechanism baton uses"
section: "1.2"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-1-file-schema
---

### 1.2 Phase overrides — a convention, not a mechanism baton uses

Reserved for a future roster author, and recorded here so the grammar is not
reinvented differently later. A persona *may* refine how it works in one phase
by adding a section headed `## In <PHASE>`. `<PHASE>` must match an enumerated
phase token exactly — for `kind: expert`: `PLAN`, `AUDIT`, `CLASH`, `VERIFY`,
`EXECUTE`; for `kind: user`: `PLAN`, `PROBE`, `VERIFY`, `CLASH`. `## In SYNTH`
is invalid for both kinds, because §2.1 and §2.2 make SYNTH duty *Nothing*. Any
other heading — `## In Practice` — is ordinary prose, never an override.

**No shipped persona in this repository uses the convention, and nothing in
baton reads it.** It was tested twice, at AUDIT and again at CLASH, and neither
run changed persona behaviour: a persona that states its method in `## Focus`,
`## Style`, and `## Signature Challenge` is already saying the same thing, so
the override restates it. The evidence is in
`docs/designs/stage-aware-luminaries.md` under "Proof Run Result".

---
