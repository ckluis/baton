---
type: Rule
id: prule-4-1-selection
title: "4.1. Selection"
section: "4.1"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-4-casting
---

### 4.1 Selection

**Three to seven per panel.** Not forty. A large roster does not produce more
coverage; it produces shorter, more generic findings from every seat, because
the run's attention is the constraint that actually binds.

This caps the **panel** — what gets spawned — not the roster you cast from, and
not the mode's Seats table. A mode may list more candidate seats than any one
panel uses, and casting picks from that menu; the `selected:` key below is the
panel, and it is the thing that must stay between three and seven.

The casting agent shows its work in `roster.yaml`:

```yaml
mode: TEST
selected:
  - slug: coverage-truth
    source: builtin
    kind: expert
    phases: [AUDIT, VERIFY]
    why: "mode-pinned lens"
  - slug: james-bach
    source: repo:ckluis/luminaryTeam
    kind: expert
    phases: [AUDIT, CLASH]
    why: "tag match: testing; upgrades the coverage-truth seat with a named voice"
excluded_notable:
  - slug: joe-celko
    why: "no schema changes in scope"
upgrades:
  - seat: coverage-truth
    to: james-bach
    note: "lens seat filled by a named expert; lens definition still governs the phase duties"
```
