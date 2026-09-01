---
type: Rule
id: rule-7-1-ts-and-seconds-are-measured-never-remembered
title: "7.1. `ts` and `seconds` are measured, never remembered"
section: "7.1"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-7-the-ledger
---

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
