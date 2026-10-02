---
type: Rule
id: prule-1-1a-what-the-default-phases-cost-you
title: "1.1a. What the default phases cost you"
section: "1.1a"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-1-file-schema
---

### 1.1a What the default phases cost you

`phases: [AUDIT, CLASH]` is a real ceiling, not a formality. **A default of
`[AUDIT, CLASH]` locks a persona out of a large share of the seat-phase slots
the modes actually ask for** — every mode's Seats table carries a `phases`
column per seat, and slots asking for `PLAN`, `PROBE`, or `VERIFY` are common
in those tables, not exceptional. `rung-fit`, `feasibility`,
`dependency-order`, `scope-creep`, `severity-inflation`, `equivalence`, and
every `kind: user` seat all sit outside `[AUDIT, CLASH]`. A roster that ships
only `name` and `domain` can never fill any of them, and no tag match opens
the door. This is true of whatever set of modes a run loads, however many
ship — a new mode adds more such slots, it does not move the default's two
phases to cover them.

Do not trust a hardcoded number here; re-derive the current ratio instead.
From the repo root:

```sh
for f in prompt/modes/*.md; do awk '/^## Seats/{f=1;next} f && /^\| `/{print}' "$f"; done \
  | sed -E 's/^\| `[a-z0-9-]+` \| (expert|user) \| ([A-Z, ]+) \|.*/\2/' \
  | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort | uniq -c
```

That prints a count per phase token across every shipped mode's Seats table;
sum the `PLAN` + `PROBE` + `VERIFY` lines against the grand total to see today's
share.

That is the price of loading unmodified, and it is worth paying — a roster you
can adopt in one line is worth more than one you must edit to use. But it means
**a persona that should serve PLAN, PROBE, or VERIFY has to say so**, either in
its own frontmatter or in an overlay. Say it explicitly; the default will not
guess it for you.
