---
type: Rule
id: rule-6-filesystem
title: "6. Filesystem"
section: "6"
contract: prompt/CONTRACT.md
status: active
---

## 6. Filesystem

All state on disk, so any fresh session resumes and no context is load-bearing.

```
_orch/
  manifest.json          run id, mode, ceiling, prime turns spent, phase pointer
  directive.md           the directive, verbatim
  plan/
    graph.yaml           §4 — the machine-readable plan
    roadmap.md           phases, rationale, risks; table first, prose after
    traceability.yaml    mode-dependent (BUILD, MIGRATE)
  cast/
    roster.yaml          selected personas, source, phases served
    <slug>.card.md       one bound persona card per selection
  nodes/
    T07/
      handoff.md         inputs, expected outputs, done-criteria
      started_at         §7.1 — dispatch epoch seconds, for measured `seconds`
      status.json        the envelope — single source of truth
      digest.md          §3
      escalation.md      written on ESCALATE / FAILED
      work/              ALL artifacts. No layer above the node enters here.
  verify/
    T07-verdict.json     CONFIRMED | REFUTED | PARTIAL + evidence paths
  loops/
    L1/seen.yaml         §5.1
  inbox/                 §10
  brief/                 §8.1 — blocked-<phase>.html, final.html; for a person
  ledger.csv             §7
  lint-feedback.yaml     §9.2 — every UNSETTLEABLE criterion, for the linter
  ux-debt.yaml           friction that violates no criterion; report material
  final/
    report.md            end-of-run synthesis
    flows/               per-journey flow documents with embedded screenshots
```

`_orch/` is gitignored unless the operator says otherwise.
