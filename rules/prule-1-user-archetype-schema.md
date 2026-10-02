---
type: Rule
id: prule-1-user-archetype-schema
title: "1. User archetype schema"
section: "1"
contract: personas/CONTRACT.md
status: active
---

## 1. User archetype schema

```yaml
---
name: First Run                       # required
kind: user                            # required
phases: [PLAN, PROBE, VERIFY]         # the §2 duties this archetype serves
rung: 1                               # tier (CONTRACT §1); a user archetype is frontier work
tags: [onboarding, first-use]         # optional
---
```

Then prose sections: `## Who`, `## Goal`, `## Knows`, `## Has Never Seen`,
`## Patience`, `## Device & Context`, `## Abandons When`. `type` and `id` are
optional and nothing in baton reads them.

The built-in archetypes are `personas/users/`. A plan may write a card for a
role the built-ins do not cover — DOGFOOD's matrix node does — to
`_orch/cast/<slug>.card.md`, in this schema. A card that could be swapped with
another without anyone noticing is one card: rewrite both or drop one.
