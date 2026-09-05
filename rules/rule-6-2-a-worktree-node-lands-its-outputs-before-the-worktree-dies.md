---
type: Rule
id: rule-6-2-a-worktree-node-lands-its-outputs-before-the-worktree-dies
title: "6.2. A worktree node lands its outputs before the worktree dies"
section: "6.2"
contract: prompt/CONTRACT.md
status: active
links:
  - rel: part-of
    to: rule-6-filesystem
  - rel: relates-to
    to: rule-4-the-graph
    note: adds the missing half of `isolation: worktree`
  - rel: relates-to
    to: rule-9-evidence
    note: a criterion whose artifact no longer exists cannot be re-verified at any rung
  - rel: relates-to
    to: rule-2-the-status-envelope
    note: `outputs` paths must still resolve after the worktree is gone
---

### 6.2 A worktree node lands its outputs before the worktree dies

Two rules already written are individually correct and jointly destroy evidence.

§6 says `work/` holds **all** of a node's artifacts. §4 offers `isolation: worktree`, which runs
the node in its own git worktree so concurrent nodes cannot collide — and a node running there
writes its products **into the worktree**, because that is the tree its handoff's paths resolve
against. The worktree is then removed, which is correct: leaving eighteen of them on disk is not a
resting state. The products go with it.

So, as a duty on the layer that created the worktree:

> **Before `git worktree remove`, copy every path in the node's envelope `outputs` into
> `_orch/nodes/<id>/work/`.** Then verify each copied path exists. A worktree may not be removed
> while any `outputs` path resolves only inside it.

An `outputs` path that no longer resolves makes the envelope false (§2: *a path that does not
exist is a `FAILED`, not a `DONE`*), and it makes every criterion resting on that artifact
permanently unverifiable — not `REFUTED`, not `UNSETTLEABLE`, but `UNTESTED` forever, because the
thing being judged is gone. No rung can recover it and no resume can rebuild it.

**A digest is not a substitute.** §3 caps a digest at ten lines and forbids it from crossing
layers as a document. It says what changed; it is not the artifact and cannot be verified against.
A node whose products are gone but whose digest survives has left a claim with no evidence, which
§9 calls inadmissible.

**Where this bites hardest is the node you would most want to re-check.** A node isolated in a
worktree is isolated because it writes a lot, or writes where others write. Those are the nodes
whose products matter.

**Why a rule.** Observed in this framework's own replay run. `F2` authored fourteen persona lens
files inside a worktree at `e78e7b0`. The worktree was removed at the end of its phase, as its
brief required. When the operator later adopted a rewrite of one criterion and asked for a
re-verification, ten criteria were re-read and **eight came back `UNTESTED`, permanently**: the
only surviving product was `lens-build-log.md`, a log *about* the lenses. The verifier could settle
the two criteria that read the log and none of the eight that read the lenses. The node's own
verdict is now unimprovable at any rung, and no evidence of the fourteen files exists anywhere in
the run. Nothing was done wrong — every rule was followed exactly, which is what makes it a defect
in the rules rather than in the run.
