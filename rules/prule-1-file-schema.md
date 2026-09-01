---
type: Rule
id: prule-1-file-schema
title: "1. File schema"
section: "1"
contract: personas/CONTRACT.md
status: active
---

## 1. File schema

```yaml
---
name: James Bach                      # required
type: Persona                         # optional, OKF/AIX interop only — see 1.0a
id: james-bach                        # optional, OKF/AIX interop only — see 1.0a
kind: expert                          # expert | user        (default: expert)
domain: Testing, QA & Automation      # required for expert
phases: [PLAN, AUDIT, CLASH, VERIFY]  # default: [AUDIT, CLASH]
rung: 2                               # default rung         (default: 2)
tags: [testing, quality, regression]  # for casting (§4)
---
```

Then prose sections. `expert` files carry: `## Focus`, `## Style`,
`## Conflict Vectors`, `## Red Flag Trigger`, `## Signature Challenge`.
`user` files carry: `## Who`, `## Goal`, `## Knows`, `## Has Never Seen`,
`## Patience`, `## Device & Context`, `## Abandons When`.
