# Migrating from baton v3.x to v4.0

Covers v3.0, v3.1, v3.2 and v3.3. Every hop inside v3 was additive; v4.0 carries
**one** breaking change, and it costs one command per run in flight.

## 1. The move itself

Change the base URL to `.../ckluis/baton/v4.0`.

If you have no run in flight, that is the whole migration. `TEAM` is opt-in;
with the line absent, a v4.0 run behaves as a v3.3 run except for §2 below.

## 2. The one breaking change: lists are directories of rows

`prompt/CONTRACT.md` §6.3 (`rules/rule-6-3-append-only-lists-are-directories-of-rows.md`).
The four files more than one layer appended to are now derived from directories:

| was (v3) | is (v4) — the record | derived view |
|---|---|---|
| `_orch/ledger.csv` | `_orch/ledger/<ts>-<node>-<attempt>.csv`, one row each | `ledger.csv` |
| `_orch/lint-feedback.yaml` | `_orch/lint-feedback/<node>-<criterion>.yaml` | `lint-feedback.yaml` |
| `_orch/ux-debt.yaml` | `_orch/ux-debt/<node>-<n>.yaml` | `ux-debt.yaml` |
| `_orch/plan/decisions.md` | `_orch/plan/decisions/<id>.md` | `decisions.md` |

**Symptom** of resuming a v3 `_orch/` without migrating it: the phase runner
writes its next row into `ledger/`, and `python3 tools/lists.py derive` refuses
to overwrite `ledger.csv` — "holds 230 rows but ledger/ holds 1 — REFUSING". The
refusal is the guard; nothing is lost. **Fix**, once per run, before resuming:

```
python3 tools/lists.py split ledger
python3 tools/lists.py split lint-feedback   # only if the file exists
python3 tools/lists.py split decisions       # only if the file exists
python3 tools/lists.py derive                # reproduces each file to the byte
python3 tools/lists.py check                 # says so
```

`split` prefixes each migrated row's filename with its sequence so the file's
order is preserved; `derive` reproduces the original byte-for-byte (verified on
baton's own 230-row ledger, 32-row lint-feedback and 9-section decisions).
`tools/index.py` reads either layout, so the histogram does not depend on when
you run this. A run that never had one of the files needs nothing for it.

Readers are unaffected: the synthesizer, the instruments and the acceptance
checks read `ledger.csv` as before — the derived one.

## 3. What each v3 hop added, if you are coming from earlier than v3.3

- **v3.0 → v3.1.** Every rule moved out of the two contracts into one file each
  under `rules/`; the contracts are narrative plus a generated index. If you
  fetch `prompt/CONTRACT.md` directly, it no longer contains the rules — read
  `rules/*.md` or `dist/baton-ALL.md`. Cite a rule by id
  (`rule-4-1-edge-types`) rather than section where you can.
- **v3.1 → v3.2.** Additive: §6.2 (a worktree node lands its outputs), §8.2
  (every blocking decision ships a slide), §9.3 (settle in isolation before
  `UNSETTLEABLE`); a verifier may write one more shape, `reads-immutable-ref`.
  `tools/lint-criteria.py` gained two rules; `tools/index.py --state-root`.
- **v3.2 → v3.3.** Additive: the prime reads the three rules it cites by id and
  fetches the rest on demand (`prompt/baton.md` §2.2); `tools/index.py --sqlite`
  writes a derived, disposable `run.db`.

## 4. What v4.0 adds, all opt-in under `TEAM: github`

Read [`prompt/invoke.md`](../prompt/invoke.md), "For a team", before turning it
on. In one paragraph: `_orch/` becomes a worktree of the run ref `baton/run/<id>`
pushed at every node close and gate (§6.1); every blocked question becomes an
Issue anyone on the repository can answer with `/answer …` (§10); every
product-writing node becomes a branch `baton/node/<run-id>/<node>` with a draft
pull request and its verdict as the commit status `baton/verify` (§4, §6.2); the
gate publishes (§8). It needs `gh` authenticated on the runner, the tools on disk
(`git clone --depth 1 https://github.com/ckluis/baton` and `BATON: ./baton`), a
**private** target repository or a private `RUNS_REPO`, and one run of
`tools/github-setup.sh --apply`. Prove the tools on your machine first:
`tools/test-team.sh` runs every one of them against throwaway repositories and a
fake `gh`, no network needed.

## 5. Resuming a v3 `_orch/` under v4 — with `TEAM`

Run §2's `split` first. Then `tools/publish-run.sh init <run-id>` **adopts** the
existing `_orch/` into a worktree of the run ref — it copies what is there, so a
half-finished v3 run becomes the first commit on its ref — and `tools/inbox-gh.py
sync` opens an Issue for every question that is still unanswered. Questions
answered by hand under v3 keep their `Q-<n>.answer.md` and get no Issue.
