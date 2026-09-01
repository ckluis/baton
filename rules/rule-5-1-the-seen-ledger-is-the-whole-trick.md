---
type: Rule
id: rule-5-1-the-seen-ledger-is-the-whole-trick
title: "5.1. The seen ledger is the whole trick"
section: "5.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-5-the-loop
---

### 5.1 The seen ledger is the whole trick

Every candidate the loop has **ever seen** goes in `seen.yaml` with a stable
key, whether it was admitted or rejected. Each iteration deduplicates against
the ledger — **not** against the admitted set.

Deduplicating against admitted findings only is the classic non-convergence
bug: a candidate the judge rejected in round one reappears in round two, gets
rejected again, and the loop never runs dry. Ledger keys are content-derived
(file + symbol + claim shape), never sequence numbers.
