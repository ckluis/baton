---
type: Rule
id: rule-5-2-dry-not-empty
title: "5.2. Dry, not empty"
section: "5.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-5-the-loop
---

### 5.2 Dry, not empty

Stop on **dry rounds**, not on an empty list. A count-based stop ("find ten
bugs") always misses the tail, and an empty-list stop fires on the first lazy
iteration. Two consecutive iterations that admit nothing new is the signal.
