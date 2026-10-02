---
type: Rule
id: prule-1-0a-type-id-and-links-optional-for-okf-aix
title: "1.0a. `type`, `id` and `links` — optional, for OKF/AIX interop only"
section: "1.0a"
contract: personas/CONTRACT.md
status: active
links:
  - rel: part-of
    to: prule-1-file-schema
---

### 1.0a `type`, `id` and `links` — optional, for OKF/AIX interop only

`type`, `id` and `links` are **optional** keys. baton's loader **ignores all
three** — no loader path, no casting rule, no acceptance check reads any of
those fields off a persona file. They exist for one reason: OKF/AIX
interoperability and machine-checkable link integrity, so `personas/` can be
validated against the
[AIX format](https://github.com/DavidROliverBA/aix-format) as a bundle without
changing what makes a persona file loadable inside baton.

**§1.1's foreign-roster promise is unchanged by this.** A persona file
carrying only `name` and `domain` — no `type`, no `id` — is still valid and
still loads exactly as §1.1 describes.
