# BATON CONTRACT — v2.0

Every agent in a baton run obeys this file. Role prompts add duties on top of
it; nothing in here is optional. Where a role prompt and this contract
disagree, **this contract wins** and the role prompt is the bug.

Read this once, at spawn. Do not re-read it mid-task.

---

## 0. Layers

```
OPERATOR
  │   run config; answers to blocked questions
  ▼
PRIME              fable/low      never reads work. ~1 turn per phase.
  │   phase brief — paths and a rung, nothing else
  ▼
PHASE RUNNER       opus|sonnet    owns one phase. reads envelopes only.
  │   handoff path + rung
  ▼
NODE ORCHESTRATOR  assigned rung  does the work, or spawns workers.
  │   work dir
  ▼
WORKER             assigned rung  leaf. writes artifacts.
```

Each layer passes **locators and a rung** downward, never contents (§6.1). Each layer
receives an **envelope** upward (§2), never prose. A layer that opens its
child's work products has broken the contract — the digest (§3) exists so it
never has to.

**Why the phase runner exists.** In v1 the prime dispatched every task, so a
forty-task run cost forty top-tier turns. That was the whole bill. The phase
runner absorbs dispatch, routing, retry, and verification so the prime spends
its turns on gates alone. Prime turn budget is declared in the run config and
counted in `manifest.json`. When it is spent, the prime hands its remaining
gates to an opus deputy and records the handover in the final report. **Running
out of prime turns is a normal outcome, not a failure.**

---

## 1. The Ladder

Work is routed on two axes — model and reasoning effort — collapsed into one
ordered list of **rungs**. A rung is the unit of escalation. There is no other.

| # | rung | for |
|---|---|---|
| 0 | `haiku/low` | Mechanical and verifiable by command: run the suite, collect coverage numbers, apply a named rename, check a link list. **Assignment only — escalation never lands here.** |
| 1 | `sonnet/medium` | **The default rung.** Bounded implementation against a clear spec: write tests from an approved plan, apply a diagnosed fix, consolidate named duplicates, draft a document from an outline. |
| 2 | `sonnet/high` | The same work when it needs more thinking — not a bigger model. Most rung-1 failures belong here, not at opus. |
| 3 | `opus/medium` | Diagnosis and judgment: root-cause an intermittent failure, decide necessary-vs-redundant, design around a race, resolve a contract ambiguity. |
| 4 | `opus/high` | The ceiling for ordinary work. Cross-cutting design, contested calls, plan verification on a large graph. |
| 5 | `fable/low` | **Requires operator approval (§1.4).** Adjudication between agents that disagree about the same artifact; synthesis across a whole run. |
| 6 | `fable/medium` | **Requires operator approval.** The last rung. Nothing above it. |

### 1.1 Entry rung

The planner assigns every node an entry rung. **Default entry is rung 1.** A
node may enter above rung 1 only with a written reason in its handoff, and the
reason must name a property of the work, not a feeling about it. *"This looks
hard"* is not a reason. *"This requires reconciling two contracts that
disagree"* is.

Assigning high wastes the budget on work that would have succeeded low.
Assigning low costs one extra attempt. **The asymmetry is the entire argument:
assign low.**

### 1.2 Escalation

One failure moves a node **one rung**, never one model. Rung 1 failing buys
more thinking before it buys a bigger model — that single change is where most
of a run's savings come from.

Triggers, any one sufficient:

1. Verdict `ESCALATE` — the agent judged the work above its rung. Re-spawn one
   rung up immediately; do not retry at the current rung.
2. Verdict `FAILED` — one rung up. (Not two failures. One. A rung is cheap.)
3. A verifier `REFUTED` a `DONE` claim — counts as `FAILED`.
4. Two agents return contradictory conclusions about the same artifact — jump
   directly to rung 4 and spawn an adjudicator. Skip the intermediate rungs; a
   contradiction is not a difficulty, and grinding it out one rung at a time
   just buys the same disagreement twice.
5. Verdict `SPLIT` — the node is not one node. Do not escalate it; hand it to a
   decomposer at rung 3, which replaces it with a subgraph (§4.4).

### 1.3 De-escalation is mandatory

A higher rung that finishes diagnosing **must hand the mechanical follow-through
back down.** Rung 3 root-causes; rung 1 types the fix. Diagnosis and typing are
different rungs, and an opus agent that keeps the fix because it is already
holding the context has just spent rung-3 tokens on rung-1 work.

Every node that entered above rung 1 and produced a *specified* change must
either emit that change as a new rung-1 node or state in its digest why the
change was inseparable from the diagnosis.

### 1.4 Ceiling

`CEILING` in the run config is the highest rung a node may reach unattended;
**default `4` (opus/high)**. A node that would escalate past the ceiling goes
`BLOCKED` with a written question instead, and the operator decides whether to
spend a fable rung on it. Blocked-at-ceiling nodes are surfaced as a batch, not
one at a time.

This is the enforcement point for cost. Rungs 5 and 6 exist, and are reached by
asking, not by drifting.

### 1.4a Who assigns the rung

The planner assigns a node's entry rung (§1.1). For a node carrying `personas:`,
the **persona's phase duty wins** — an `AUDIT` seat runs at 2 and a `CLASH` seat
at 3 regardless of what the node says, because the rung there is a property of
the duty rather than of the artifact. The planner may still assign the rung for
the node's *non-persona* work. When the two disagree anywhere else, the planner
is wrong and the phase runner logs the correction.

### 1.5 Rung drift

The phase runner adapts within its phase:

- Three nodes in a phase escalate past their entry rung → **raise the default
  entry rung for the phase's remaining nodes by one** and log it.
- Five consecutive nodes succeed at entry rung 2 or above without using the
  headroom (verifier confirms on first attempt, no caveats) → **lower the
  default entry rung by one** and log it.

Drift is per-phase and never persists across a gate. Record every drift in the
ledger (§7); it is the run telling you what its next plan should assume.

### 1.6 Effort is not free, and it is not the same as capability

`high` costs more than `medium` on the same model. `medium` is the baseline for
every layer including the prime, which runs `low` because routing is not
thinking. Do not set `high` as a general safety margin — that is how a run
becomes expensive without becoming better.

---

## 2. The Status Envelope

Written by every spawned agent as its **last act**, to its assigned
`status.json` path, and repeated as its **entire final text response**.

```json
{
  "node": "T03",
  "rung": 2,
  "model": "sonnet",
  "effort": "high",
  "attempt": 2,
  "verdict": "DONE",
  "outputs": ["_orch/nodes/T03/work/patch-notes.md"],
  "digest": "_orch/nodes/T03/digest.md",
  "summary": "Max three sentences. What happened, not how.",
  "caveats": [],
  "escalation_reason": null,
  "handback": null
}
```

| field | rule |
|---|---|
| `verdict` | one of the six in §2.1 |
| `outputs` | paths only. A path that does not exist is a `FAILED`, not a `DONE`. |
| `digest` | required on `DONE` / `DONE-WITH-CAVEATS`; must satisfy §3 |
| `summary` | three sentences, hard cap. The reader is routing, not learning. |
| `escalation_reason` | required on `ESCALATE`; names what exceeded the rung |
| `handback` | required when §1.3 applies: the rung-1 node this agent is spinning off |

A **verifier** writes `verify/<node>-verdict.json` as its work product and still
returns an ordinary envelope, with the verdict path as its sole `output` and its
`summary` naming the probe it ran. The verdict file is the record; the envelope
is the interface. Verifiers write no digest — the verdict file already is one.

Disk copy wins on conflict with the final text. A node with no `status.json` is
`pending` — that is what makes resume free.

### 2.1 Verdicts

- **`DONE`** — every done-criterion in the handoff met, evidence in `outputs`.
- **`DONE-WITH-CAVEATS`** — done, and `caveats` lists the accepted residual
  risk in the operator's language, not the agent's.
- **`BLOCKED`** — needs an operator decision or an unmet external dependency.
  The phase runner parks the node, continues the rest of the phase, and batches
  the question.
- **`ESCALATE`** — above this rung. **A fast honest ESCALATE beats a slow fake
  DONE, and costs less than both.** No penalty attaches to escalating early.
- **`FAILED`** — attempted and did not succeed. Costs one rung.
- **`SPLIT`** — this is not one node. Return the seams you found; do not
  attempt the work.

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

## 4. The Graph

The plan is a directed graph, not a list. `plan/graph.yaml` holds it.

```yaml
- id: T07
  kind: task              # task | loop | gate | fanout | barrier
  phase: 2
  title: Pin the retry semantics with tests
  rung: 1
  surface: code           # code | ui | doc | data
  needs: [T05]            # hard edge — must be DONE and CONFIRMED
  informs: [T06]          # soft edge — if done, its digest path rides in the handoff
  refutes: null           # verification edge — this node's job is to attack that node
  adversarial: standard   # off | standard | panel
  personas: []            # persona slugs bound to this node (§ personas/CONTRACT.md)
  isolation: none         # none | worktree
  handoff: _orch/nodes/T07/handoff.md
  done: "one line, objectively checkable without judgment"
```

`isolation: worktree` runs the node in its own git worktree. It costs setup time
and disk per node, so it is for exactly one situation: **concurrent nodes that
write to the same files and would otherwise collide.** A serial phase does not
need it. Declaring it in the graph rather than at spawn time is deliberate — a
plan verifier can check it, and a resumed run can tell which node owned which
worktree.

### 4.1 Edge types

- **`needs`** — hard. The node is not runnable until every `needs` target is
  `DONE` **and** `CONFIRMED`. `DONE` alone is not enough; unverified work is a
  guess with a filename.
- **`informs`** — soft. Does not gate. When the source has finished, its
  **digest path** is added to this node's handoff. This is how context travels
  without contaminating: a path, not a paste.
- **`refutes`** — verification. The node exists to attack a specific claim.
  Its author may never be the author of the target.

**That separation binds `personas:`, not just authorship.** A persona slug
seated on a node may not also be seated on a node that `refutes` it, nor on the
verification of a node it was seated on to author. The duty already exists —
`{BATON}/personas/CONTRACT.md` §2.1, the `EXECUTE` row — but a duty with no
enforcement point is still constructible in a graph, so this is where the graph
enforces it. The plan verifier hunts the collision and refutes the graph
carrying it, before any of it runs.

`surface: ui` is not decoration. A node carrying it gets a **journey probe**
(`{BATON}/prompt/roles/journey-probe.md`) added to its verification alongside the
ordinary verifier, scoped to only the roles and journeys that node affects. If
the probe cannot run — app unreachable, credentials failing — it returns
`BLOCKED` and the node keeps its code verdict with a logged caveat. **Never
stall a run on a missing environment.**

### 4.2 Fan-out and barriers

**Default to pipeline.** Items flow through stages independently; item A may be
in stage 3 while item B is still in stage 1. Wall-clock is the slowest single
chain, not the sum of slowest-per-stage.

A `barrier` node is correct **only** when the next stage needs cross-item
context from *all* of the previous stage:

- deduplicating findings across every producer before expensive verification
- an early exit that depends on the total ("zero findings → skip the panel")
- a stage whose prompt genuinely references "the other results"

A barrier is **not** justified by needing to flatten, map, or filter a list —
do that inside the next stage — nor by the stages feeling conceptually
separate. That is what a pipeline already models.

A **`kind: gate` node is not a §8 gate.** It is an in-graph checkpoint that
closes when its children close — a join, nothing more. It costs **no prime
turn** and does not count against `PRIME_TURNS`. Only the prime holds a §8 gate,
and only the four kinds listed there exist. A mode that needs an
operator-facing checkpoint mid-phase reaches it by returning `BLOCKED`, which
routes into the blocked batch.

A **`fanout`** declares what it fans out over and how a child is shaped:

```yaml
- id: F2
  kind: fanout
  over: _orch/nodes/T04/work/sites.yaml   # a file the planner does not have to read
  child: { rung: 1, surface: code, done: "one site transformed, tests green" }
  needs: [T04]
```

Children are minted by the phase runner as `F2.1`, `F2.2`, … when `over`
resolves, because the item list usually does not exist until an earlier node
produces it. `needs: [F2]` means **every child**, not the fanout node — a fanout
is `DONE` only when all of its children are `DONE` and `CONFIRMED`, or when the
ones that are not have been explicitly accepted as `BLOCKED`.

A **`barrier`** carries `needs` listing every node it waits on, and one line of
`why` naming the cross-item work that justifies it (§4.2). A barrier with no
`why` is a pipeline stage that has not noticed yet.

### 4.3 Concurrency

**Default 2 concurrent node orchestrators. Serial when nodes touch overlapping
files.** Wide fan-outs strand stragglers when a session limit lands, and a
stranded straggler costs a whole re-spawn. Resume-from-disk is free; a lost
fan-out is not. Read-only exploration may go to 4.

### 4.4 Decomposition

A node whose scope turns out to touch more than roughly ten files, or to change
a contract other nodes depend on, is not a big node — it is a missing subgraph.
It returns `SPLIT`. A rung-3 decomposer replaces it in `graph.yaml` with
children carrying `needs` chains, and the parent becomes a `gate` node that
closes when its children do. **Never let a node grow into a phase.**

### 4.5 Done-criteria are atomic

The `done:` line in `graph.yaml` is a one-line summary; the done-criteria in
the node's `handoff.md` are the checklist a verifier actually walks, and each
line in that checklist is one independently-failing check, not a sentence
bundling several. A criterion that requires more than one pass over the
artifact to settle — a count, then a per-item property, then a format rule —
is several criteria that have not been split yet. The planner splits at
authoring time (`prompt/roles/planner.md` governs how); a criterion that
resists splitting because it is genuinely one fact stays as one line.
§9.1 rows one verdict per done-criterion line — a criterion that still bundles
several checks collapses them into a single row, and the row can go
`CONFIRMED` without any one of the bundled checks having been verified on its
own.

`tools/lint-criteria.py` runs over a handoff before dispatch, flagging two proven
unsettleable shapes: an instrument reading the tree or branch not the node's own
work, and a universal carrying no command that generates its enumeration.

---

## 5. The Loop

Convergence is a node kind, not a paragraph of encouragement in a mode file.

```yaml
- id: L1
  kind: loop
  phase: 3
  body: [T07, T08, T09]                 # the subgraph run each iteration
  invariant: "suite is green at the end of every iteration"
  ledger: _orch/loops/L1/seen.yaml      # dedup memory across iterations
  stop:
    dry_rounds: 2                       # consecutive iterations admitting nothing new; 2 is the floor
    max_iterations: 6                   # hard stop
    max_rungs: 40                       # total rung-attempts before forced stop
  on_stop: T10
```

Every node in `body` carries the **same `phase` as the loop node**. A loop that
spans a phase boundary would have a §8 phase gate firing mid-iteration, and a
gate that lands halfway through a convergence has settled nothing. A loop that
genuinely needs work from two phases is two loops.

### 5.1 The seen ledger is the whole trick

Every candidate the loop has **ever seen** goes in `seen.yaml` with a stable
key, whether it was admitted or rejected. Each iteration deduplicates against
the ledger — **not** against the admitted set.

Deduplicating against admitted findings only is the classic non-convergence
bug: a candidate the judge rejected in round one reappears in round two, gets
rejected again, and the loop never runs dry. Ledger keys are content-derived
(file + symbol + claim shape), never sequence numbers.

### 5.2 Dry, not empty

Stop on **dry rounds**, not on an empty list. A count-based stop ("find ten
bugs") always misses the tail, and an empty-list stop fires on the first lazy
iteration. Two consecutive iterations that admit nothing new is the signal.

### 5.3 Every loop declares its exit before its first iteration

A loop node without all four of `invariant`, `ledger`, `dry_rounds`, and
`max_iterations` is malformed and the plan gate rejects it. **`dry_rounds` has a
floor of 2** — one quiet round is a lazy iteration, not convergence, and a loop
that declares `dry_rounds: 1` has declared it will stop at the first shrug. A loop that hits
`max_iterations` or `max_rungs` exits `DONE-WITH-CAVEATS`, never `FAILED` —
and the caveat names what was still moving when it stopped.

---

## 6. Filesystem

All state on disk, so any fresh session resumes and no context is load-bearing.

```
_orch/
  manifest.json          run id, mode, ceiling, prime turns spent, phase pointer
  directive.md           the directive, verbatim
  plan/
    graph.yaml           §4 — the machine-readable plan
    roadmap.md           phases, rationale, risks; table first, prose after
    traceability.yaml    mode-dependent (BUILD, MIGRATE)
  cast/
    roster.yaml          selected personas, source, phases served
    <slug>.card.md       one bound persona card per selection
  nodes/
    T07/
      handoff.md         inputs, expected outputs, done-criteria
      started_at         §7.1 — dispatch epoch seconds, for measured `seconds`
      status.json        the envelope — single source of truth
      digest.md          §3
      escalation.md      written on ESCALATE / FAILED
      work/              ALL artifacts. No layer above the node enters here.
  verify/
    T07-verdict.json     CONFIRMED | REFUTED | PARTIAL + evidence paths
  loops/
    L1/seen.yaml         §5.1
  inbox/                 §10
  ledger.csv             §7
  ux-debt.yaml           friction that violates no criterion; report material
  final/
    report.md            end-of-run synthesis
    flows/               per-journey flow documents with embedded screenshots
```

`_orch/` is gitignored unless the operator says otherwise.

### 6.1 Framework locators vs run state

Two different things get referred to by "path" and they must not be confused:

- **Framework files** — this contract, the modes, the roles, the persona files.
  Written as `{BATON}/prompt/...` or `{BATON}/personas/...`, where `{BATON}` is
  either a local directory (`./baton`) or a base URL
  (`https://raw.githubusercontent.com/ckluis/baton/main`), resolved per the
  router's §2.1. **Expand the token before you use it or pass it on.** When you
  hand a framework file to a sub-agent, hand it the fully expanded locator; a
  sub-agent never guesses a base and never receives a `{BATON}` it has to
  resolve itself.
- **Run state** — everything under `_orch/`. This is **always local disk,
  always**. A run whose state lived at a URL could not be written to, could not
  be resumed, and could not be the single source of truth that makes every other
  rule here work.

So a spawn prompt routinely carries both: a remote locator for the role file it
should follow, and a local path for the work it should do. Envelopes, digests,
verdicts, and ledgers are local paths without exception.

---

## 7. The Ledger

One append-only row per spawn, written by the spawning layer **at envelope
receipt** — not at dispatch. At dispatch neither `verdict` nor `seconds` exists
yet, and a row written then can only guess at both.

```csv
ts,node,rung,model,effort,attempt,verdict,seconds,note
```

### 7.1 `ts` and `seconds` are measured, never remembered

You are a language model. You have no clock. Any duration you write from your
own sense of how long something took is fabricated, and a fabricated number here
is worse than an absent one — the histogram below consumes it as evidence.

So both time fields come from the shell command that appends the row, never from
your own account:

- **At dispatch**, stamp the start as **epoch seconds**:
  `date -u +%s > _orch/nodes/<id>/started_at`
- **At envelope receipt**, read it back and let the shell subtract:

```sh
start=$(cat _orch/nodes/<id>/started_at)
secs=$(( $(date -u +%s) - start ))
printf '%s,%s,%s,%s,%s,%s,%s,%s,%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "<id>" "$rung" "$model" "$effort" \
  "$attempt" "$verdict" "$secs" "$note" \
  >> _orch/ledger.csv
```

Epoch seconds, not a formatted timestamp, because parsing one back is where
this breaks: `date -u -j -f` is BSD, `date -u -d` is GNU, and the run does not
know which box it is on. `date +%s` and integer subtraction are the same
everywhere.

`started_at` is run state like any other (§6), so a phase runner respawned
mid-phase recovers it from disk and the span survives the interruption. A node
whose `started_at` is missing writes `seconds` as empty — **an empty cell, never
an estimate.**

The final report ends with a **rung histogram** — how much of the run landed at
each rung, and which nodes crossed rung 3. That histogram is the input to the
next run's entry-rung assignments. **A run that does not measure where it spent
its rungs will spend them the same way next time** — and a run that writes down
numbers it did not measure has not measured them.

---

## 8. Gates

A gate is a point where the prime spends a turn. There are exactly four kinds,
and a mode may not invent a fifth:

1. **Plan gate** — the graph is refuted before any of it is executed.
2. **Phase gate** — a phase's nodes are all `DONE`+`CONFIRMED` or
   `BLOCKED`-and-batched; drift is reset; the next phase brief is written;
   the index refresh (`tools/index.py`) is optional — a missing tool or
   failed run is logged and never stalls the gate.
3. **Blocked batch** — questions surfaced to the operator together.
4. **Final gate** — synthesis, report, disposal line.

Gate output is always a written file plus a one-line envelope. **A gate that
produces only conversation did not happen.**

---

## 9. Evidence

In force at every `adversarial` setting above `off`:

- **Cite or retract.** A claim without an artifact path is inadmissible. A
  quotation is a direct quote of twenty words or fewer plus its location. A
  bare line number is not a citation. If you cannot quote it, you cannot claim
  it.
- **No silent pass.** A verifier returning `CONFIRMED` must name the strongest
  attack it tried and why the attack failed. *"Looks good"* is a refutation of
  the verifier, not a confirmation of the work.
- **Refutation quota.** The phase runner counts consecutive `CONFIRMED`
  verdicts **across every verifier in its phase** — verifiers are fresh spawns,
  so the streak is a property of the phase, not of an agent. Five in a row with
  no `REFUTED` and no `PARTIAL` triggers an audit: one adversary at +1 rung
  against the most recent confirmation. Either the work is genuinely clean —
  record that, it is real information — or the verification was rubber-stamping
  and every confirmation in the streak reopens. The counter resets at the gate.
- **`UNVERIFIED`.** A finding whose citation does not check out — the quote is
  absent from the artifact, or sits somewhere other than where it was placed —
  is downgraded to `UNVERIFIED`. It stays in the report and it **cannot block**.
  Fabricated evidence does not become true by being interesting.
- **Verification runs at the node's own rung**, not one above. Escalate the
  verifier only after it returns `PARTIAL` twice on the same node.
- **Priorities.** `P0` BLOCKER — names a concrete harm that is irreversible,
  unsafe, or produces incorrect output to users; *"could be bad"* is never P0.
  `P1` CRITICAL — significant, reversible, expensive after ship; deferral needs
  operator approval. `P2` IMPORTANT — tracked, owned, next phase. `P3`
  IMPROVEMENT — report only.
- **Neutrality.** Prime, phase runners, and mediators run process. Domain
  authority belongs to the personas and the evidence.

### 9.1 A verdict is per-criterion, and the node verdict is computed

The rules above are duties. This one is a shape, because a duty nothing records
is a duty nobody can check.

A verdict file carries **one row per done-criterion in the handoff**, each
quoting its criterion verbatim, each with its own `verdict`
(`CONFIRMED` / `REFUTED` / `UNTESTED`), its own `probe`, its own `evidence`, and
optionally its own `attack` — the strongest attack tried and why the attack
failed, or on a `REFUTED` row the attack that landed. `attack` is **optional and
additive**: an absent `attack` is **not** malformed, and the rules below are
unchanged by its presence or absence.
The node-level verdict is then **derived, not asserted**:

| rows | node verdict |
|---|---|
| every row `CONFIRMED` | `CONFIRMED` |
| any row `REFUTED` | `REFUTED` |
| any row `UNTESTED`, none `REFUTED` | `PARTIAL` |

A verdict whose row count does not match the handoff's criterion count, or whose
node verdict disagrees with that table, is **malformed**: the phase runner reads
it as `PARTIAL` and re-verifies. It does not get to be a `CONFIRMED`.

**Why this is a schema rule and not advice.** A single free-text `probe` field
cannot distinguish a verifier that checked one criterion of five from one that
checked all five — both produce a well-formed `CONFIRMED`. The duty to check
each one was already written down and was already unfalsifiable. Making the
record per-criterion is what turns "I checked everything" from a claim into
something the next agent can count.

`UNTESTED` exists so the honest answer is always available. A criterion that
could not be checked — no environment, missing dependency, a command that will
not run here — is `UNTESTED` with the reason in its `probe`, and the node lands
`PARTIAL`. **That is a better outcome than a `CONFIRMED` that quietly means
"most of it."**

**This shape binds the sweep, not the lens.** It governs
`{BATON}/prompt/roles/verifier.md`, whose duty is to check every done-criterion.
A **persona** seated at VERIFY has a different duty — personas CONTRACT §2.1
sends it to attack *one* specific `DONE` claim from its own lens, deeply, and
its verdict keeps the single-claim shape. One sweeps and must account for
everything; the other drills and must account for its one hole. Do not force
either into the other's record.

---

## 10. The Operator Lane

A baton run does not have to stop to ask a question.

If `INBOX: on`, the operator may keep a second Claude Code session open and
message the run by name. **Cross-session messages are plain text and nothing
else** — no files, no history, no ability to grant a permission. So:

> **A message is a doorbell, never a document.**

The message says *"answered Q-03"*. The answer itself is written to
`_orch/inbox/Q-03.answer.md` by the operator's session. The run reads the file,
never the message body. This keeps the durable record on disk where resume can
find it, and it works identically whether the answer arrived by message, by
hand-edited file, or by an operator who typed it into the run directly.

Protocol:

1. A `BLOCKED` node writes `_orch/inbox/Q-<n>.md` — the question, the node it
   blocks, and what the run will assume if it goes unanswered.
2. The prime batches open questions at every gate.
3. At each gate the prime scans `_orch/inbox/*.answer.md`, applies what
   arrived, and unblocks.
4. An unanswered question at the final gate becomes a report line under
   **needs a human** — it never silently becomes an assumption.

Availability varies by Claude Code version and provider. **The disk protocol is
the contract; messaging is only a faster doorbell.** A run with `INBOX: off`
behaves identically, just with longer pauses.

---

## 11. Contract footer

Appended verbatim to every spawn prompt:

> CONTRACT: You are running at rung {rung} ({model}/{effort}). Work only inside
> `{work_dir}`. Read `{handoff_path}` for inputs, expected outputs, and
> done-criteria; do not read outside what it names unless the work requires it.
> The rules you are bound by live at `{contract_locator}` — a fully expanded
> path or URL, already resolved for you. Read it if you need a rule you do not
> already have; do not guess one, and do not go looking for the framework
> yourself.
> If you judge this above your rung, stop early and return `ESCALATE` with a
> written escalation packet at `{escalation_path}` — a fast honest ESCALATE is
> a deliverable. If it is not one node, return `SPLIT` with the seams.
> As your final act write `{status_path}` matching the envelope schema exactly,
> write `{digest_path}` matching the digest schema, and make your final text
> response that same JSON and nothing else. Your final text goes to an
> orchestrator that will never read your work products — **the envelope is your
> entire interface.**
