# Migrating from v2.0 to v3.0

## 1. The move itself

Change the base URL in your invocation to:

```
https://raw.githubusercontent.com/ckluis/baton/v3.0
```

For anyone whose setup is not hit by a breaking change below, **that is the entire
migration** — nothing to install, nothing to edit, no state to convert.

## 2. Breaking changes

Five, from `CHANGELOG.md`'s `## v3.0 / ### Breaking`.

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

## 3. What does NOT break

**3a. A foreign persona file carrying only `name` and `domain` still loads
unmodified.** `personas/CONTRACT.md` §1.1's promise is byte-identical to the tag:
the only diff is a trailing `---` rule that closed the section at the tag and is
now absorbed into the following `### 1.1a` subsection — no prose changed (see
`work/verification.md`). You may add local overlay files; you never have to edit
the source.

**3b. Two different "v2-shaped" verdicts — only one still works.** A §9.1 verdict
row that carries **no `attack` field** is valid: `attack` is "**optional and
additive**... an absent `attack` is **not** malformed" (`prompt/CONTRACT.md`
§9.1). By contrast, a **v2.0 flat-object verdict** — `node`, `verdict`,
`evidence`, `probe`, no `criteria` array — is **not** valid; that is breaking
change #4 above. Do not read "v2 verdicts still work" out of this document and
keep writing the flat object.

**3c. AIX conformance is never required of a foreign roster.** `personas/CONTRACT.md`
§1.0a: "`type`, `id` and `links` are **optional** keys. baton's loader **ignores
all three**." The AIX check in `_orch/nodes/P11/work/acceptance.sh` is scoped
with `AIX_TARGET="/Users/clank/Desktop/projects/baton/personas"` — baton's own
bundle only — and its comment states it "must NEVER be pointed at a roster
resolved from a `repo:` or `path:` source," because §1.1's minimal shape
(`name`+`domain`) fails AIX Level 0. Conformance is a property of baton's own
bundle, not a precondition of adopting yours. (§1.1a/§1.1b — default-phase and
default-tag cost — did not exist at the v2.0 tag; they are new, not renamed.)

## 4. Resuming a v2 `_orch/` under v3

`prompt/baton.md` §6: "Never re-plan a graph that exists." Resume never re-runs
the plan gate, so the **author-and-verify guard** — breaking change #3 above,
the specific new v3 mechanism that could refute a graph — does **not**
retroactively refute an in-flight v2 graph — it only binds graphs planned fresh
under v3. `_orch/`'s on-disk shape is otherwise unchanged from the tag; the only
diff in CONTRACT §6's filesystem schema is the addition of a `started_at` file
per node (additive, for §7.1 timing).

**Untested:** a new per-node lint, `tools/lint-criteria.py`, now runs at dispatch
time (`prompt/roles/phase-runner.md` step 3, added since the tag) against every
handoff about to be spawned — including a v2-authored one that was never written
against §4.5's atomic-criteria rule. Whether this stalls, auto-corrects, or just
logs against an old handoff is not settled by inspection; **the only way to know
is to resume an actual v2 run under v3 tooling and watch what the phase runner
does at its next dispatch** — this document does not run one.
