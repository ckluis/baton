---
type: Rule
id: rule-11-contract-footer
title: "11. Contract footer"
section: "11"
contract: prompt/CONTRACT.md
status: active
---

## 11. Contract footer

Appended verbatim to every spawn prompt:

> CONTRACT: You are running at rung {rung} ({model}/{effort}). Work only inside
> `{work_dir}`. Read `{handoff_path}` for inputs, expected outputs, and
> done-criteria; do not read outside what it names unless the work requires it.
> The rules you are bound by live at `{contract_locator}` — a fully expanded
> path or URL, already resolved for you. Read it if you need a rule you do not
> already have; do not guess one, and do not go looking for the framework
> yourself.
> If you judge this above your rung, stop early and return `ESCALATE` with a
> written escalation packet at `{escalation_path}` — a fast honest ESCALATE is
> a deliverable. If it is not one node, return `SPLIT` with the seams.
> As your final act write `{status_path}` matching the envelope schema exactly,
> write `{digest_path}` matching the digest schema, and make your final text
> response that same JSON and nothing else. Your final text goes to an
> orchestrator that will never read your work products — **the envelope is your
> entire interface.**
