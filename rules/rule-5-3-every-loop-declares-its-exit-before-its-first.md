---
type: Rule
id: rule-5-3-every-loop-declares-its-exit-before-its-first
title: "5.3. Every loop declares its exit before its first iteration"
section: "5.3"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-5-the-loop
---

### 5.3 Every loop declares its exit before its first iteration

A loop node without all four of `invariant`, `ledger`, `dry_rounds`, and
`max_iterations` is malformed and the plan gate rejects it. **`dry_rounds` has a
floor of 2** — one quiet round is a lazy iteration, not convergence, and a loop
that declares `dry_rounds: 1` has declared it will stop at the first shrug. A loop that hits
`max_iterations` or `max_rungs` exits `DONE-WITH-CAVEATS`, never `FAILED` —
and the caveat names what was still moving when it stopped.

---
