---
type: Rule
id: rule-3-the-digest
title: "3. The Digest"
section: "3"
contract: prompt/CONTRACT.md
status: active
---

## 3. The Digest

Every work product a higher layer might want to "just peek at" gets a digest
instead. Written by the **producing** agent — never by a reader, because a
reader who summarizes has already paid the cost the digest exists to avoid.

```
---
node: T03
artifacts: [_orch/nodes/T03/work/patch-notes.md]
---
WHAT CHANGED    ≤3 lines
EVIDENCE        ≤3 lines, each one path plus what it proves
RESIDUAL RISK   ≤2 lines, or "none"
NEXT            ≤2 lines, or "nothing"
```

Ten lines is the ceiling. **A digest longer than ten lines is a document, and
documents do not cross layers.** If ten lines cannot carry it, the node was too
big — return `SPLIT`.

---
