---
type: Rule
id: rule-7-2-two-row-classes-and-exactly-one-writer
title: "7.2. Two row classes, and exactly one writer each"
section: "7.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-7-the-ledger
---

### 7.2 Two row classes, and exactly one writer each

The schema above describes a **spawn row**. Runs also need to record events that are not
spawns — a gate closing, a drift applied, a node accepted over a caveat. Those are **event
rows**, and they are a different shape wearing the same columns:

| | `rung` / `model` / `effort` | `seconds` | `started_at` |
|---|---|---|---|
| **spawn row** | as dispatched | measured per §7.1 | exists |
| **event row** | `n/a` | empty | does not exist — do not synthesize one |

An event row writes `n/a` rather than `0`, because `0` is a real rung (§1) and an event has no
rung at all. It writes `seconds` empty for the same reason §7.1 gives: an absent measurement is
better than an invented one. **Event rows are excluded from the rung histogram** — they describe
the run, not its spending.

**Exactly one layer writes any given row.** The layer that received the envelope writes the
spawn row. An event row is written by the layer that *held* the event — but if two layers each
have something to record about the same event, that is two events, not one: the phase runner's
close and the prime's gate are different facts and each gets its own row, distinguished in the
`note`. What is forbidden is two layers writing the *same* fact twice.

This is the file's only concurrency assumption, so state it plainly: the ledger is append-only
and single-writer **per row**, not per file. Concurrent phase runners appending their own rows
is fine.

Observed in this framework's own run, and the reason both halves of this section exist. Three
gate events were written twice, by the phase runner and the prime, with **different content each
time** — one carried drift and streak counts, the other the phase's outcome. Neither was wrong;
the schema had nowhere to put two perspectives on one event, so one row clobbered another.

And the event rows already written carry real rungs, not `n/a`: measured across that run's
ledger, thirteen carry `0`, one carries `1`, one carries `2`. Rung `0` is `haiku/low` (§1), so a
gate that spawned nothing is currently indistinguishable in the histogram from a haiku node that
did work. **The histogram this framework uses to plan its next run is contaminated today.** That
is what the `n/a` rule above fixes, and it is why event rows are excluded from the histogram
rather than merely labelled.

```csv
ts,node,rung,model,effort,attempt,verdict,seconds,note
```
