---
type: Rule
id: rule-4-5-done-criteria-are-atomic
title: "4.5. Done-criteria are atomic"
section: "4.5"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-4-the-graph
---

### 4.5 Done-criteria are atomic

The `done:` line in `graph.yaml` is a one-line summary; the done-criteria in
the node's `handoff.md` are the checklist a verifier actually walks, and each
line in that checklist is one independently-failing check, not a sentence
bundling several. A criterion that requires more than one pass over the
artifact to settle — a count, then a per-item property, then a format rule —
is several criteria that have not been split yet. The planner splits at
authoring time (`prompt/roles/planner.md` governs how); a criterion that
resists splitting because it is genuinely one fact stays as one line.
§9.1 rows one verdict per done-criterion line — a criterion that still bundles
several checks collapses them into a single row, and the row can go
`CONFIRMED` without any one of the bundled checks having been verified on its
own.

`tools/lint-criteria.py` runs over a handoff before dispatch, flagging two proven
unsettleable shapes: an instrument reading the tree or branch not the node's own
work, and a universal carrying no command that generates its enumeration.

---
