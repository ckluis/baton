---
type: Rule
id: rule-6-3-append-only-lists-are-directories-of-rows
title: "6.3. Append-only lists are directories of rows"
section: "6.3"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-6-filesystem
  - rel: relates-to
    to: rule-7-the-ledger
    note: the ledger is the first and largest of the four lists
  - rel: relates-to
    to: rule-7-2-two-row-classes-and-exactly-one-writer
    note: makes "single-writer per row" true by construction — the row is the file
  - rel: relates-to
    to: rule-9-2-refutation-triage
    note: lint-feedback is the second list
  - rel: relates-to
    to: rule-6-1-framework-locators-vs-run-state
    note: what lets run state live on a git ref without a merge protocol
---

### 6.3 Append-only lists are directories of rows

Four things under `_orch/` are lists that more than one layer appends to: the
ledger (§7), `lint-feedback` (§9.2), `ux-debt`, and `plan/decisions`. Everything
else in §6 is written by exactly one layer, under a path that names its writer —
a node under `nodes/<id>/`, a verifier at `verify/<id>-verdict.json`, the prime
under `phases/P<n>/`. The four lists were the only paths two writers could reach
at once.

So a list is a directory, and a row is a file in it:

```
ledger/<ts>-<node>-<attempt>.csv        one §7 row, with its header line
lint-feedback/<node>-<criterion>.yaml   one `entries:` item, indented as it will appear
ux-debt/<node>-<n>.yaml                 one `entries:` item, likewise
plan/decisions/<id>.md                  one documented default, a `## ` section
```

The writer of a row creates its file and touches nothing else. **The file the
list used to be is derived**: `python3 tools/lists.py derive` writes
`ledger.csv`, `lint-feedback.yaml`, `ux-debt.yaml` and `plan/decisions.md` from
their directories, rows in filename order, byte-for-byte reproducible, and every
reader that wants the file keeps reading it. `tools/lists.py check` refuses a
derived file that no longer equals its rows, and `tools/index.py` reads the
directory directly, so the histogram never waits on the derivation.

**Why a rule and not a convention.** Two layers writing one file was the only
concurrency the layout ever had, and it is where the record broke: three gate
events written twice with different content (§7.2), and a row whose `ts` went
backwards (`docs/designs/ledger-clock.md`). A row that is its own file has one
writer by construction; two runners on two machines can each add a row without
either seeing the other's until it is fetched, and neither can clobber it. That
is what lets a run's state live on a git ref (§6.1) without a merge protocol:
no two rows ever share a path.

A run that began before this rule keeps its files. `tools/lists.py split` turns
a file into its directory once, and `derive` reproduces the file from it —
verified on this framework's own run, whose 230-row ledger round-trips to the
byte.
