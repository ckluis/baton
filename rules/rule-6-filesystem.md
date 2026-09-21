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
  manifest.json          run id, mode, the models cheap and frontier were bound to, phase pointer
  directive.md           the directive, verbatim
  run-ref.json           TEAM only — the run's hidden ref, run branch, remote and repository (§6.1)
  plan/
    graph.yaml           §4 — the machine-readable plan
    roadmap.md           phases, rationale, risks; table first, prose after
    traceability.yaml    mode-dependent (BUILD, MIGRATE)
    decisions/           §6.3 — one documented default per file
    decisions.md         derived from decisions/ — never written by a layer
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
                         A worktree-isolated node writes into its worktree first; §6.2
                         requires those outputs be landed here before it is removed.
  verify/
    T07-verdict.json     CONFIRMED | REFUTED | PARTIAL + evidence paths
  wt/
    T07/                 a worktree-isolated node's checkout (§4); under TEAM, its branch (§6.2)
  loops/
    L1/seen.yaml         §5.1
  inbox/                 §10 — Q-<n>.md and Q-<n>.answer.md; github.json under TEAM
  brief/                 §8.1 — blocked-<phase>.html, final.html; for a person. Under TEAM each has a .md twin
  ledger/                §7 — one row per file (§6.3)
  ledger.csv             derived from ledger/ — `python3 tools/lists.py derive`
  lint-feedback/         §9.2 — one UNSETTLEABLE criterion per file (§6.3)
  lint-feedback.yaml     derived from lint-feedback/
  ux-debt/               friction that violates no criterion, one item per file (§6.3)
  ux-debt.yaml           derived from ux-debt/; report material
  index/                 derived by tools/index.py — delete it, it rebuilds; never tracked
  final/
    report.md            end-of-run synthesis
    flows/               per-journey flow documents with embedded screenshots
```

`_orch/` is gitignored by the product tree. Under `TEAM` (router §1) it is a git
worktree of a local branch that `publish` pushes to the hidden ref
`refs/baton/run/<id>` (§6.1): still ignored by the product tree, never a branch
on the remote, with `index/`, `wt/` and `**/work/tree/` ignored inside it because
each is either derived or a checkout of something the ref already records.
