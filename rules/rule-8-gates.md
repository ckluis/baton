---
type: Rule
id: rule-8-gates
title: "8. Gates"
section: "8"
contract: prompt/CONTRACT.md
status: active
---

## 8. Gates

A gate is a point where the prime spends a turn. There are exactly four kinds,
and a mode may not invent a fifth:

1. **Plan gate** — the graph is refuted before any of it is executed.
2. **Phase gate** — a phase's nodes are all `DONE`+`CONFIRMED` or
   `BLOCKED`-and-batched; drift is reset; the next phase brief is written;
   the index refresh (`tools/index.py`) is optional — a missing tool or
   failed run is logged and never stalls the gate.
3. **Blocked batch** — questions surfaced to the operator together, with a brief (§8.1).
4. **Final gate** — synthesis, report, brief (§8.1), disposal line.

Gate output is always a written file plus a one-line envelope. **A gate that
produces only conversation did not happen.**

Under `TEAM` (router §1) a gate also publishes, in this order, and each step is
a command the gate's envelope names:

1. `python3 tools/inbox-gh.py sync` — questions out to Issues, answers in to
   `_orch/inbox/*.answer.md` (§10), *before* the gate scans the inbox.
2. `python3 tools/lists.py derive` — the four list files from their rows (§6.3).
3. `tools/publish-run.sh publish` — secret scan, commit, push the run ref (§6.1).
4. `python3 tools/inbox-gh.py post-summary` — `_orch/index/summary.md` onto the
   run Issue, so the team reads the same sixty lines the prime does.
5. `tools/publish-run.sh pages` — when the gate wrote a brief (§8.1), so the
   slide a question links to opens as a page.

A gate that produced only local files, under `TEAM`, did not happen either.

---
