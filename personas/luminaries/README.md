---
type: Note
id: luminaries-readme
---

# personas/luminaries/

This directory vendors a roster of named-expert persona cards. Each card is a
lens derived from that individual's published work and public positions —
their writing, talks, and documented positions, distilled into a `Focus`,
`Style`, `Conflict Vectors`, and a `Signature Challenge`. These cards are
**neither endorsements nor simulations of the people** they are named for:
no one listed here has reviewed or approved a card, and a card is not a claim
that the named individual would say or do what it describes.

The originals live upstream, unvendored, at `github.com/ckluis/luminaryTeam`.

luminaryTeam is the standalone advisory panel — a general-purpose roster of
named experts meant to stand on its own. `personas/luminaries/` is a separate,
baton-specific orchestration roster: these files carry explicit `phases`,
`tags`, and rewritten Conflict Vectors so they can be seated into baton's
phase and mode machinery, which the upstream cards were never written for.
The two are sibling artifacts by design. Neither is canonical over the other,
and they are expected to diverge as each is edited for its own purpose.

This roster is **opt-in, not built-in**. `personas/CONTRACT.md` §4 defines
`builtin` as exactly `personas/lenses/` and `personas/users/`, and explicitly
excludes this directory. These cards are never part of baton's built-in
personas; they are reached only by explicitly opting in, with:

```
PERSONAS: builtin+luminaries
```

An existing run that does not ask for `+luminaries` seats exactly what it
seated before this roster existed.
