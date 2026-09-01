---
type: Rule
id: prule-1-1-foreign-personas-load-unmodified
title: "1.1. Foreign personas load unmodified"
section: "1.1"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-1-file-schema
---

### 1.1 Foreign personas load unmodified

A persona file with **only** `name` and `domain` in its frontmatter is valid.
The loader fills defaults: `kind: expert`, `phases: [AUDIT, CLASH]`, `rung: 2`.

This is deliberate. It means `PERSONAS: repo:github.com/ckluis/luminaryTeam`
works against that repository exactly as it is published, forty files, no fork,
no edits — and the same is true of any persona collection that follows the
same shape. **Adopting a roster must never require rewriting it.** A run that
wants richer behavior from a foreign persona adds a local overlay file rather
than editing the source.
