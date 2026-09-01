---
type: Rule
id: prule-1-1b-the-same-is-true-of-tags-and-it-bites-harder
title: "1.1b. The same is true of `tags`, and it bites harder"
section: "1.1b"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-1-file-schema
---

### 1.1b The same is true of `tags`, and it bites harder

§4.2 upgrades a seat to "a named persona **whose tags match**" a mode's hint.
`tags` has no default. A roster that omits it matches no hint, so **every seat
keeps its built-in lens and the roster is loaded but never seated** — the
failure is silent, and it looks exactly like a roster that had nothing to offer.

This is not hypothetical: none of the forty files at `ckluis/luminaryTeam`
carries a `tags:` field, and it is the roster this contract names as its worked
example.

A casting agent given a tagless roster will often improvise — match a hint
against the persona's `domain` prose because that is the sensible thing to do.
**Do not rely on it.** Improvised matching is unspecified, varies between runs,
and cannot be audited from `roster.yaml` afterward. When casting matches on
anything other than a literal `tags` entry, it must say so in the roster's `why`
field, so the record shows a judgment was made rather than a rule applied.

The fix on the roster side is one line of frontmatter. The fix on baton's side
is to vendor what it depends on: `personas/luminaries/` files carry explicit
`tags` and explicit `phases`, which is what makes them seatable where a `repo:`
roster is not.
