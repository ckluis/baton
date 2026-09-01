---
type: Rule
id: rule-4-3-concurrency
title: "4.3. Concurrency"
section: "4.3"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-4-the-graph
---

### 4.3 Concurrency

**Default 2 concurrent node orchestrators. Serial when nodes touch overlapping
files.** Wide fan-outs strand stragglers when a session limit lands, and a
stranded straggler costs a whole re-spawn. Resume-from-disk is free; a lost
fan-out is not. Read-only exploration may go to 4.
