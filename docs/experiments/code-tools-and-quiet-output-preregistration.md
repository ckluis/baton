# Pre-registration: do the code index tools and quiet output earn their place?

Status: **registered 2026-10-05, before any run.** Decisions D1, D3 and D7 of #48. Nothing below
changes after the first arm runs, except by a dated amendment above this line.

## The claims

1. **Code index tools.** Agents given `code_search`, `code_fetch`, `code_refs` and `code_explore`
   spend less to reach the same result than agents that read whole files. codemunch reports 95%
   fewer exploration tokens. That figure counts raw tokens; under prompt caching a re-read is a
   cache read at a tenth of the input price, so the dollar effect is the thing to measure.
2. **Quiet output.** Cutting a long shell result to its head, its failure lines and its tail
   (the whole of it saved to a file) lowers fresh tokens without making agents miss failures.

## Arms

On effort-blog-bench's e2 stockroom tasks: eight tasks, hidden scoring, three seeds per arm.
Opus 5.5 for every role, Sonnet 5.5 for `-cheap`. Mods on.

| arm | code tools | Read pointer | quiet output |
|---|---|---|---|
| A (control) | off | off | off |
| C | on | on | off |
| Q | off | off | on |
| CQ | on | on | on |

"Off" for the code tools means not registered. The setting `quietOutputLines: 0` turns quiet
output off, and `readHintLines: 0` turns the pointer off.

## What is measured, from the record

- `_orch/spend.json`: fresh tokens, cache reads and API-equivalent $ per task, by role.
- `/baton status`: code tool calls, large reads, quieted outputs and lines kept.
- The hidden suite's score per task.
- For Q: every quieted output is checked against its saved log. Did a failure line in the
  omitted middle go uncaught by the agent? An omitted failure the agent needed, and that its
  envelope missed, counts as a **quiet miss**.

## Decision rules

- **Code tools (C vs A):** keep if API-equivalent $ per task falls by at least 15% and the mean
  hidden score does not fall. Cut if $ falls by less than 5%, or if any task's score falls by more
  than one hidden test. In between: keep the tools, drop the Read pointer, and run three more seeds.
- **Quiet output (Q vs A):** keep at the default threshold if fresh tokens per task fall by at least
  10%, with zero quiet misses and no score drop. One quiet miss: raise the threshold to 1,000
  lines and rerun. Two or more: off by default.
- **Together (CQ):** reported, not decided on; it shows whether the two compound.

## Known weaknesses, stated before the data

- Eight tasks on one codebase in one language family; the index's regex extraction is weakest on
  C-like languages, which the tasks do not exercise.
- The Read pointer and the tools ship together in arm C, so their effects are not separated.
- Three seeds detect a large effect, not a small one.
