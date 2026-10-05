---
type: Rule
id: rule-9-4-red-green-blue
title: "9.4. Red, green, blue: a behavior change proves its tests could fail"
section: "9.4"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-9-evidence
  - rel: relates-to
    to: rule-4-5-done-criteria-are-atomic
    note: one red test per atomic criterion; a criterion with no reachable red is the vacuous kind 4.5 already refuses
  - rel: relates-to
    to: rule-9-1-a-verdict-is-per-criterion-and-the-node
    note: a red that could not fail refutes its criterion's row; the freeze and blue checks sit beside the rows and can only lower the computed verdict
  - rel: relates-to
    to: rule-9-3-settle-it-in-isolation-before-you-call-it-unsettleable
    note: the red re-run happens in a private worktree of the same kind
---

### 9.4 Red, green, blue: a behavior change proves its tests could fail

A test written after the code passes by construction: it describes what the code does, not what
the criterion asks, and it would have passed against a wrong implementation too. An agent that
writes both sides in one sitting will write that test unless the order is forced. So every node
whose done-criteria change observable behavior of code runs in three steps, each a commit of its
own (or, where the target is not a repository, a snapshot under `work/`):

| step | what lands | what must be true | recorded in |
|---|---|---|---|
| **red** | the tests, one or more per done-criterion, and nothing else | they run and **fail** against the unchanged code, for the reason the criterion names: an assertion about the missing behavior, not a syntax error, an import of a file the node has not written yet, or a broken fixture | `work/red.txt`: the command, its failing output, the commit |
| **green** | the smallest change that makes them pass | the red tests pass, **unedited**, and the whole suite is green | `work/green.txt`: the command, its output, the commit |
| **blue** | refactoring only | the suite stays green, no test file changes, no behavior changes; "nothing to tidy" is a valid blue and is written down | `work/blue.txt`: what was tidied, or why nothing was, and the green run after it |

**The freeze.** Between red and green the red tests do not change. A green that needed a red test
edited has redefined the criterion. When a red test was genuinely wrong (it tested the wrong
thing, or it failed for the wrong reason), the node goes back to red: fix the test, show it failing
for the right reason, then go green again. Both reds are recorded.

**What the verifier checks**, in a private worktree (§9.3). Check 1 belongs to the criterion each red
test covers: a red that could not fail makes that criterion's row `REFUTED` (§9.1). Checks 2–4
are about the node, and go in the verdict's `rgb` block beside the rows; any of them false makes
the node `REFUTED` whatever its rows say.

1. **Red could fail.** Check out the parent of the red commit, apply the red tests and nothing
   else, and run them. They fail, and the failure is the behavior's absence. A red test that passes
   there is `REFUTED`: it cannot tell the change from no change.
2. **Freeze held.** `git diff <red>..<green> -- <the red test files>` is empty.
3. **Green and blue are green.** The suite passes at the green commit and at the final one.
4. **Blue changed no behavior.** No test file in `<green>..<blue>`, and the suite's pass list is the
   same at both.

**Exempt** is a decision the planner writes into the handoff, never one the node takes for
itself: `rgb: exempt — <reason>`. It fits work with no executable behavior (prose, a design,
configuration nothing exercises) and work whose behavior no harness can reach in the run (a
production-only integration; say which). The plan verifier refutes an exemption whose reason a test
could answer. A node with no exemption and no `red.txt` is `FAILED`, whatever else it did.

**Who writes red.** By default the node does, in its first commit. When a criterion is subtle
enough that the implementer could bend the test toward its own code, the planner splits red into
a node of its own, dispatched before the implementer and never to the same spawn. TEST mode already
does this for every fix: the regression test and the fix are separate nodes.

**What this does not claim.** It does not make a test good. A red that asserts a typo fails and
then passes, and proves nothing about the criterion. That is §4.5's ground (one behavior per
criterion, a reachable before-state) and the verifier's judgment in check 1 ("the failure is the
behavior's absence"). What the rule removes is the test that never could have failed, which is the
one an agent writing code first produces by default. It is also unmeasured in this framework: it is
adopted on the strength of TEST mode's regression-test requirement and ordinary practice, not on a
replay, and the first run that ships under it should count the reds the verifier refuted.
