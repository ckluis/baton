# Migrating from baton v2.0 to v5.0

Three hops: v2.0 → v3.0 carried five breaking changes; v3.x → v4.0 carries one;
v4.0 → v5.0 carries one more — the meaning of a `rung` value (§7). If none of the
seven touch you, the migration is changing one URL.

## 1. The move itself

Change the base URL in your invocation to:

```
https://raw.githubusercontent.com/ckluis/baton/v4.0
```

## 2. The five breaking changes you pass through at v3.0

From `CHANGELOG.md`'s `## v3.0 / ### Breaking`.

1. **`bundle.sh` exits 1 on a missing seat** (was: warn-and-ship). Symptom: a roster
   that bundled successfully under v2.0 — short a seat, silently — now hard-fails
   with `error: mode $mode seats \`$slug\` but no file exists in personas/{...}/`.
   Fix: add the missing persona file, or drop the seat from the mode's roster.
2. **Eleven lenses gained phases** (e.g. `adversarial-input` AUDIT,CLASH,VERIFY →
   PLAN,AUDIT,CLASH,VERIFY; ten others similarly widened — full list in
   `CHANGELOG.md`). Symptom: an existing mode now spawns duties at phases these
   lenses previously stayed silent for, so seat count and cost change with no
   operator action. Fix: nothing to do — this is the new behaviour. If cost is a
   concern, diff `phases:` per lens against your v2.0 run's ledger and trim seats
   explicitly if a widened lens isn't wanted at a given phase.
3. **The author-and-verify guard** (`prompt/CONTRACT.md` §4.1, new). Symptom: a
   graph legal under v2 — same persona slug seated to author a node and again on
   its verification — is now refuted at the plan gate before any of it runs. Fix:
   split the seat so authoring and verifying use different slugs.
4. **Verdicts are per-criterion and computed** (`prompt/CONTRACT.md` §9.1, new).
   Symptom: a verifier still writing v2.0's flat object (`node`, `verdict`,
   `evidence`, `probe`) gets its `CONFIRMED` silently downgraded to `PARTIAL` and
   the node re-verified, even though the node's own work never changed. Fix:
   verifiers must emit the `criteria` array — one row per handoff done-criterion.
5. **`DOGFOOD` drops a phase from `returning-power`** (`PLAN, PROBE, VERIFY, CLASH`
   → `PLAN, PROBE, VERIFY`). Symptom: under the default `PERSONAS: builtin`, a
   CLASH-phase finding this persona used to be eligible to raise no longer gets
   raised — no operator action required. Fix: nothing to do — this is the new
   behaviour; re-add `CLASH` locally if you relied on it.

## 3. The one breaking change at v4.0

6. **The four append-only lists are directories of rows** (`prompt/CONTRACT.md`
   §6.3, new). `ledger.csv`, `lint-feedback.yaml`, `ux-debt.yaml` and
   `plan/decisions.md` are now *derived* from `ledger/`, `lint-feedback/`,
   `ux-debt/` and `plan/decisions/`; a layer that has a row to add writes one
   new file. Symptom: a v2 or v3 `_orch/` resumed under v4 has a `ledger.csv`
   with rows and no `ledger/` directory — the phase runner writes new rows to
   the directory, and `tools/lists.py derive` **refuses** to overwrite the file
   because it holds rows the directory does not. Fix, once per run, before
   resuming:

   ```
   python3 tools/lists.py split ledger
   python3 tools/lists.py split lint-feedback   # if the file exists
   python3 tools/lists.py split decisions       # if the file exists
   python3 tools/lists.py derive
   ```

   `split` keeps the file's order and `derive` reproduces it to the byte — this
   was verified on baton's own 230-row ledger. `tools/index.py` reads either
   layout.

## 4. What does NOT break

**4a. A foreign persona file carrying only `name` and `domain` still loads
unmodified.** `personas/CONTRACT.md` §1.1's promise is byte-identical to the v2.0
tag; the only diff is a trailing `---` rule that closed the section at the tag
and is now absorbed into the following `### 1.1a` subsection. You may add local
overlay files; you never have to edit the source.

**4b. Two different "v2-shaped" verdicts — only one still works.** A §9.1 verdict
row that carries **no `attack` field** is valid: `attack` is optional and
additive. A **v2.0 flat-object verdict** — no `criteria` array — is **not**
valid; that is breaking change #4.

**4c. AIX conformance is never required of a foreign roster.** `personas/CONTRACT.md`
§1.0a: `type`, `id` and `links` are optional keys; baton's loader ignores all
three. Conformance is a property of baton's own bundle, not a precondition of
adopting yours.

**4d. `TEAM` is opt-in.** With the line absent, a v4.0 run is a v3.3 run plus
#6. Nothing about GitHub, Issues, pull requests or refs applies to you until you
write `TEAM: github`.

## 5. Resuming a v2 `_orch/` under v4

`prompt/baton.md` §6: "Never re-plan a graph that exists." Resume never re-runs
the plan gate, so the author-and-verify guard (#3) does not retroactively refute
an in-flight v2 graph — it only binds graphs planned fresh under v3+. Run the
`split` commands in #6 first. `_orch/`'s on-disk shape is otherwise the v2 shape
plus additions: a `started_at` file per node (v3, timing), and the four
directories (v4).

**Untested, still:** `tools/lint-criteria.py` runs at dispatch time against
every handoff about to be spawned — including a v2-authored one never written
against §4.5's atomic-criteria rule. Whether this stalls, auto-corrects, or just
logs against an old handoff is not settled by inspection; the only way to know
is to resume an actual v2 run under v5 tooling and watch what the phase runner
does at its next dispatch. This document does not run one.

## 7. The v5.0 hop

7. **A `rung` value means a tier** (`prompt/CONTRACT.md` §1): `0` cheap, `1`
   frontier, `n/a`. A v2 graph's `rung: 3` reads as frontier and needs no
   conversion; a checkout of the framework runs `python3 tools/tiers.py remap
   --framework` once. `CEILING` and `PRIME_TURNS` are gone from the invocation.
   [`from-v4.md`](from-v4.md) has the table and what changed around it.
