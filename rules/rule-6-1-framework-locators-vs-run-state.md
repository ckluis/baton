---
type: Rule
id: rule-6-1-framework-locators-vs-run-state
title: "6.1. Framework locators vs run state"
section: "6.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-6-filesystem
---

### 6.1 Framework locators vs run state

Two different things get referred to by "path" and they must not be confused:

- **Framework files** — this contract, the modes, the roles, the persona files.
  Written as `{BATON}/prompt/...` or `{BATON}/personas/...`, where `{BATON}` is
  either a local directory (`./baton`) or a base URL
  (`https://raw.githubusercontent.com/ckluis/baton/main`), resolved per the
  router's §2.1. **Expand the token before you use it or pass it on.** When you
  hand a framework file to a sub-agent, hand it the fully expanded locator; a
  sub-agent never guesses a base and never receives a `{BATON}` it has to
  resolve itself.
- **Run state** — everything under `_orch/`. This is **always local disk,
  always**. A run whose state lived at a URL could not be written to, could not
  be resumed, and could not be the single source of truth that makes every other
  rule here work.

So a spawn prompt routinely carries both: a remote locator for the role file it
should follow, and a local path for the work it should do. Envelopes, digests,
verdicts, and ledgers are local paths without exception.

**Under `TEAM` (router §1) the local `_orch/` is a git worktree that `publish`
pushes to the run's hidden ref, `refs/baton/run/<id>`** — a ref GitHub lists
nowhere, not a branch. Still a directory on the runner's disk, still every path a
rule names — and additionally committed by the layer that received each envelope
and pushed at every node close and every gate (§8), so the ref is the record once
pushed and any machine can resume it with a fetch. That is not state at a URL:
nothing reads the ref back into a run except a resume, and nothing writes it
except the runner. The checkout is the working copy; the ref is the record. Every
path a verdict cites gains a second form, `/blob/<sha>/...`, that outlives the
machine. What the run leaves *visible* on the repository is one branch,
`baton/<id>`, which is its pull request — one commit per product node (§6.2) —
and nothing else.

---
