#!/usr/bin/env python3
"""baton criterion linter - catches unsettleable done-criteria BEFORE a node is spawned.

    python3 tools/lint-criteria.py _orch/nodes/P121/handoff.md
    python3 tools/lint-criteria.py _orch/nodes/*/handoff.md
    python3 tools/lint-criteria.py --selftest   prove each rule can FLAG its known-bad
                                               fixture and stays silent on the repaired
                                               one beside it

WHY.  This run authored nine unsettleable done-criteria, three of them inside the
phase whose brief opened by warning against them.  Prose discipline failed nine
times out of nine; mechanical detection caught nine out of nine, every time at the
moment the criterion was applied.  This tool moves that detection earlier - to
handoff-write time, before a node has spent a rung on a criterion no execution can
satisfy.  It is the same move `P80` made for `personas/CONTRACT.md` Section 2.1: a
stated duty became real only when it gained an enforcement point.

WHAT IT DOES.  It reads a handoff, finds its done-criteria section, and reports the
criteria that are unsettleable as authored.  It REPORTS.  It never rewrites a
criterion, never edits a handoff, never writes any file at all - a tool that edits
its own inputs is the failure this run indicts.  Output goes to stdout only.

EXIT BEHAVIOUR, and it matches what the code does:

    0   no FLAG was raised.  WARN lines may still have been printed; a warning is
        a criterion the linter could not settle, not a criterion it judged bad.
    1   at least one FLAG was raised - a criterion that, as authored, cannot be
        settled by any execution.
    2   usage error, or an input path that could not be read.

FLAG vs WARN.  A FLAG is a positive finding: the linter matched a proven defective
shape and names it.  A WARN is the opposite of a silent pass: the linter matched
part of a shape and could NOT settle the rest, and it says exactly what it could
not settle.  The tool fails toward a false alarm.  It never passes a criterion it
could not classify without saying so.

THE SHAPES IT REJECTS, each derived from a criterion this run actually authored
(the corpus and the per-shape evidence are in `_orch/nodes/P121/work/corpus.md`):

  A  tree/branch instrument.  `git diff` / `git status` / `git log` asked to settle
     something about the node's own work, on a branch the run is forbidden to
     commit.  `P80` #6 asked `git diff --stat` for "exactly two product files
     changed" on a branch already carrying 31 uncommitted files.  This is NOT a
     keyword match: `git show HEAD:prompt/CONTRACT.md` is perfectly settleable
     because that path is tracked, and it is the operator-adopted remedy recorded
     in `_orch/inbox/Q-10.answer.md`.  Trackedness is resolved with `git ls-files`.
     `git status --short` asserting about the index, and `git log --oneline -1
     <ref>` asserting about a branch pointer, are settleable and are not flagged.

  B  unbounded enumeration.  A universal whose set is defined by an interpretive
     predicate - "every count statement found across ...", "one line per quoted
     string in ..." - with no command attached that generates the enumeration.
     `_orch/inbox/Q-11.answer.md` is the rule: a universal must carry the command
     that generates its enumeration.  Two competent agents enumerate two different
     sets and neither is wrong.

  C  a fresh measurement pinned to an old recorded value.  `P111` #21 required a
     repaired instrument's output to be a subset of a baseline written by the
     BLIND version of that same instrument.  `P112` #15 required a tool measuring
     the live corpus to report the number a document written earlier records.
     `P01b` #4 asserted a file "still contains" a token it never contained.  A pin
     with an explicit escape for divergence ("or names precisely which differs and
     why") is settleable and is not flagged.

  D  a criterion contradicted by the same handoff, or attributed to the node by an
     instrument that cannot attribute.  `P112` #29 (D1) forbade every write outside
     three paths while the handoff mandated `python3 tools/index.py`, which writes
     `_orch/index/`.  `P120` #14 (D2) required a region byte-identical when criterion
     15 of the same handoff required that region changed.  The linter reads the whole
     handoff, so it can see both sides.

     D3 is the attribution case, and it is the one that needs its discriminator
     stated, because the shape is common and most instances of it are fine.  An
     allow-list scope criterion says "no file outside <list> ... BY THIS NODE" and
     settles it with an mtime `find` against a scope marker.  mtime records WHEN a
     file changed and never WHICH agent changed it, so the `find` also reports every
     write made by a command the handoff mandates and by any agent running
     concurrently.  What separates a settleable instance from an unsettleable one is
     one clause in the criterion's own text: whether it NAMES the writes it expects
     not to be the node's.  `P120` #25 does not, and every one of the five nodes that
     shipped this clause without a carve-out - `P101` #27, `P110` #14, `P111` #28,
     `P114` #24, `P115` #20 - had to write an unauthorised paragraph into its
     acceptance record attributing `index.html` to `tools/embed.py`.  `P121` #32,
     `P122` #27 and `P123` #22 carry the carve-out and are silent here.  The paired
     fixtures are `_orch/nodes/P121/work/fixtures/rule-d3-pair/`.

  E  a cross-node temporal baseline.  A criterion that settles a claim about an
     artifact against a snapshot or copy of THAT artifact held by a different node,
     or against an artifact another node in the same phase writes or mutates, is
     unsettleable: the thing it compares against can change under it, so the
     comparison does not measure this node's work.  `P123` #12 as authored asserted
     `tools/check4-hint-tags.instrument.md` byte-identical to its state before
     `P123` ran and settled that by `diff` against a copy held in
     `_orch/nodes/P122/work/`.  `P122` is an earlier node of the same phase and it
     edits that file's frontmatter, so once `P122` had landed the diff measured
     `P122`'s change and not `P123`'s: the criterion could not fail for the right
     reason and could not pass for it either.  The defect and its repair are
     recorded at `_orch/nodes/PR13/work/routing.md`, section "One criterion defect
     the linter did not catch, fixed before dispatch".

     THE DISCRIMINATOR is three clauses of the criterion's own text and all three
     are required, because the linter has no graph, no node ordering and no clock:
     it cannot ask whether the other node has closed, so it asks instead what the
     criterion claims its baseline IS.  (1) the claim is self-relative in time -
     the artifact is "byte-identical to its state before this node ran",
     "unchanged by this node", "unmodified by this node"; (2) the path the
     criterion's comparison clause names as the baseline - the first path after
     `against`, `identical to`, `compared with` - lies under
     `_orch/nodes/<id>/work/` for an `<id>` that is not the node this file belongs
     to; and (3) that path is a snapshot or copy of the artifact the claim is about
     - its basename carries a snapshot suffix (`.pre`, `.before`, `.orig`, `.bak`,
     `.baseline`, `.snapshot`) or, stripped of one, names a path the criterion also
     names.  A path the criterion names only in order to FORBID it as the baseline
     - "Do not settle it against X", "rather than X" - is excluded before (2) is
     asked, so naming the wrong copy in order to rule it out never flags.

     What the three clauses separate, which is the whole reason there are three.
     `P124` #27 settles `check 4`'s output against
     `_orch/nodes/P120/work/check4-after.txt` - another node of the same phase,
     `DONE`+`CONFIRMED` before `P124` ran, and the operator-adopted way this run
     pins `check 4`.  It fails clause (1): it claims nothing about this node's own
     before-state, so it is a read of a finished upstream artifact rather than a
     self-baseline, and it stays silent.  `P123` #12 in its repaired form settles
     against `work/check4-hint-tags.instrument.md.pre`, the copy the node's own
     first act takes, and names the `P122` copy explicitly as the wrong one; it
     fails clause (2) twice over - its baseline is under no other node's directory,
     and the `P122` path sits inside a negation.  It stays silent too, and it has
     to: a rule that flags the repaired form has flagged the remedy.  The paired
     fixtures are `_orch/nodes/P131/work/fixtures/known-bad/12-P123-12-prefix.md`
     and `_orch/nodes/P131/work/fixtures/known-good/09-P124-27.md`.

     The limit, stated rather than hidden.  Clause (1) is all the rule can see of
     "the compared-against thing can change under it".  A criterion that uses
     another node's snapshot as its own before-state without SAYING so - carrying
     no self-relative temporal clause anywhere in its text - is invisible to rule
     E, and rule E's silence over such a criterion is not a judgement that it is
     settleable.  Clause (2) also needs to know which node the file belongs to; if
     that cannot be read from the file's path or from a `# HANDOFF - <id>` heading,
     rule E declines to judge rather than guessing.

     D4 is the same claim with its instrument named only by anaphora - "settled by
     the same `find`", pointing at a sibling criterion.  `P113` #11 is the case.  The
     linter can guess the referent but cannot read a command out of the criterion in
     front of it, so this is a WARN and never a FLAG: it names the sibling it thinks
     is meant and says what it could not settle.  A limit worth stating plainly: D3
     and D4 sort these criteria by what each one's text exposes about its instrument,
     not by whether the write actually happened.  A criterion that hides its
     instrument behind a cross-reference gets a warning, not a verdict.

  F  a success token demanded from a check that only prints failures.  A criterion
     requiring a named check of a named script to print its OK token, when that
     check's body emits nothing but failure lines, cannot be settled by any correct
     execution: silence IS that check's pass, so a clean run prints nothing and the
     criterion demands output the instrument never produces.  `P111` #29 and `P112`
     #30 are the same sentence in two handoffs - "checks 1, 2, 3, 5, 6, 7 and 8 print
     their OK tokens" - and checks 1 and 8 of `_orch/nodes/P11/work/acceptance.sh`
     have no OK token to print: check 1's only echo is `MISSING $k: $f`, check 8's
     only echoes are `$m not authored` and two `has NO ...` lines.  Both handoffs
     also forbid editing that script, so no permitted execution could add one.  The
     operator decision authorising this rule is `_orch-replay/inbox/Q-7.answer.md` -
     note the `_orch-replay/` prefix, a different question set from the archived
     `_orch/inbox/` that rules A and B cite.

     What the flag claims, stated exactly.  Not "unsatisfiable": the archived run's
     two rung-3 verifiers CONFIRMED this very sentence, reading the silence as the
     pass (`_orch/verify/P111-verdict.json` row 29, `_orch/verify/P112-verdict.json`
     row 30), and the replay's two read it literally and did not.  The defect is
     that two competent verifiers settle it opposite ways.  A harness reader that
     only saw `echo` misjudged real scripts: it now reads `printf`, credits a check
     with what a helper function it calls prints, and reads a negated failure noun
     ("no differences found") as the success message it is.

     THIS IS NOT A KEYWORD MATCH, and it cannot be, because the corpus carries that
     sentence in both its defective and its repaired form.  The linter opens the
     script the criterion names - resolving a bare `acceptance.sh` through the paths
     the handoff itself gives - splits it at its `echo "=== Check N: ... ==="`
     banners, and classifies each check by the literals its own body echoes.  A check
     that echoes any success literal is settleable and is never named.  That is the
     whole discriminator, and it is what keeps `P121` #29, `P122` #24, `P132` #35 and
     `P160` #43 silent: each names only checks 2, 3, 5, 6 and 7, every one of which
     does print an OK token, and each says of checks 1 and 8 that they print nothing
     at all.  A rule that flagged those has flagged the remedy.

     The limit, stated rather than hidden.  A check whose body echoes nothing the
     linter can classify - check 4 delegates to `sh tools/check4-hint-tags.sh` and
     echoes nothing itself - is a WARN and never a FLAG; so is a criterion naming a
     check the script does not have, and one that names a script the linter cannot
     find.  A criterion that names a check but no script at all - `P51.1` #5, "Check
     6 prints `index.html in sync`" - is settled against the handoff's harness when
     the handoff names exactly one that exists, and is otherwise passed over in
     silence: with two harnesses in scope the rule would be guessing which one the
     criterion meant, and with none it has not identified an instrument at all.  That
     silence is not a judgement that such a criterion is settleable.

  G  a before/after contrast with no reachable before-state.  A criterion requiring
     an artifact to behave one way BEFORE this node's change and the opposite way
     after - "refused by the unmodified tool preserved at `work/instruments.py.pre`
     and allowed by the current tool, so the fixture genuinely tests the change" -
     settles the before half against a copy the node's own first act takes.  That
     copy captures whatever the artifact already is at dispatch; it is a pre-change
     copy only if a pre-change version exists somewhere the run can reach.  `P132`
     #31 is the case: `git log --follow -- tools/instruments.py` reports one commit,
     the file's first and only, and it already carries the behaviour the criterion
     calls new, so no execution can produce the refusing half of the contrast.  The
     operator decision is `_orch-replay/inbox/Q-10.answer.md` - again the replay
     question, not the archived `_orch/inbox/Q-10.answer.md` rule A cites.

     THE DISCRIMINATOR is four clauses of the criterion's own text, one of the
     handoff's, and one question put to git, and all six are needed, because most
     criteria that name a `.pre` copy are perfectly settleable.  (1) the criterion
     names a snapshot path (`.pre`, `.before`, `.orig`, `.bak`, `.baseline`,
     `.snapshot`) and calls it a before-state - "unmodified", "original", "preserved
     at"; (2) it names the other half of the contrast as the CURRENT artifact; (3) it
     requires the two to DIFFER in outcome - a refused/allowed, rejected/accepted,
     fails/passes pair, or an explicit "genuinely tests the change"; (4) it carries
     no instrument that reads history, no `git log`, `git show <rev>:` or `git
     cat-file`, so it never asks whether the before-state is reachable; (5) the
     handoff nowhere tells THIS node to change the artifact - because when it does,
     the `.pre` copy is the working tree at dispatch and the node's own edit is the
     after-state, and the contrast exists whatever history holds.  That fifth clause
     is what the archive proves: `P132` #31 was settled CONFIRMED in the original
     run (`_orch/verify/P132-verdict.json` row 31), where the handoff told `P132` to
     change the tool and the `.pre` copy predated the change.  It went unsettleable
     in the replay only because the replay's tree already carried the edit.  Only
     then does the linter ask `git log --follow` how many commits touch the artifact:
     two or more and a distinct earlier version is reachable, the contrast can be
     built, and the criterion is not flagged.

     Clause (3) is what separates this from the ordinary use of a `.pre` copy, which
     is to assert SAMENESS.  `P132` #7, #9 and #13, `P160` #41, `P121` #23 through
     #26, `P122` #9, #10 and #22 all settle against a `.pre` snapshot and all claim
     the two agree, or name exactly where they differ; none claims the snapshot
     BEHAVES differently, so none needs a before-state that history must hold, and
     every one stays silent.  A snapshot under another node's work directory is rule
     E's subject, not this one's, and is left to it.

     The limit.  The count is of commits, not of distinct contents: an artifact with
     two commits that never changed it reads as reachable and stays silent.  Exactly
     one commit is the flag.  Zero is a WARN and not a flag, because no commit at all
     says as much about the path the linter resolved as about history - and so are a
     criterion that names the artifact only by its snapshot, and a tree git cannot be
     asked.

  H  an arithmetic contradiction across two criteria: one mutation required to
     refute both arms of a complementary pair.  A node's positive control asks a
     single mutation to flip an assertion from pass to fail - that flip is what
     proves the assertion refutable at all.  Two criteria of one handoff asked the
     SAME mutation to flip an arm asserting a value is ABOVE a threshold and a
     second arm asserting the complementary outcome, at or below that threshold.
     Exactly one of those two holds for any value, so no honest construction
     satisfies both; only a constant that crashes both runs does.  The consequence
     was worse than a failed check.  The node's positive control was not in fact
     refutable by mutation, so the anti-tautology guarantee the pair existed to
     provide was vacuous, and the node read as green.

     THE DISCRIMINATOR is arithmetic rather than vocabulary, and it has four
     clauses.  (1) each criterion names exactly ONE comparison against a threshold -
     `> 0.8`, "at or below 0.8", "at least 5" - because a criterion naming two says
     nothing about which one its mutation is meant to flip, and the linter will not
     guess; (2) the two operators are exact complements (`>` against `<=`, `<`
     against `>=`) on the SAME threshold, compared as numbers, so `0.8` and `.80`
     are one threshold and `0.8` and `0.9` are two; (3) each criterion requires a
     mutation to REFUTE its arm - a mutation noun and a flip verb, both present, so
     a criterion that merely mentions a bound is not a party to this; and (4) the
     mutation is the same mutation.  Clause (4) is what separates the defect from
     the pair that reads almost identically and is perfectly satisfiable: two
     complementary arms flipped by two DIFFERENT mutations are exactly how a
     two-armed gate is positively controlled, and a rule that flagged them would
     flag the remedy.

     Clause (4) is settled from the text and nowhere else.  A criterion that points
     at its sibling's mutation - "that same mutation", "the same one-line change" -
     establishes it, and that is a FLAG.  Two criteria that each spell a mutation
     out without saying whether it is the same one establish nothing, and that is a
     WARN naming the sibling and what it could not settle; the WARN additionally
     requires the two to name a path in common, so a coincidence of thresholds
     across unrelated criteria never raises it.

     The limit, stated rather than hidden.  This rule reads a PAIR of criteria.  A
     single criterion requiring one mutation to flip both arms in one sentence is
     the same defect and is NOT detected: binding each arm to its own flip verb
     inside one sentence is an interpretive act, and a rule that guessed the binding
     would flag "the mutation flips the `> 0.8` arm while the `<= 0.8` arm is
     unaffected", which is the correct wording.  Nor does the rule read the metric:
     two complementary arms over two different quantities, flipped by one mutation,
     are satisfiable, and clause (4) is all that stands between this rule and that
     case.  Its silence is not a judgement that a criterion is settleable.

  I  a precondition the run's own sequencing forbids.  Two shapes under one rule,
     because both are a criterion that cannot be evaluated at the point it is
     checked.  Five of the six occurrences this register records were authored by an
     orchestrator mid-flight, which is exactly when a criterion skips review.

     I1 is the ordering case, and it is settled from the plan rather than from
     words.  A criterion of node `X` that reads an artifact under `nodes/<Y>/work/`
     for a `Y` the graph places strictly AFTER `X` can never be evaluated: at the
     moment `X` is verified that artifact does not exist, and no execution of `X`
     can make it exist.  §4 puts the machine-readable plan at
     `<orch>/plan/graph.yaml` and gives every node a `needs` list, so downstream is
     a fact to look up rather than a word to match - the same move rule A makes with
     `git ls-files` and rule F makes by opening the script.  `Y` is downstream of
     `X` when `X` lies in the transitive closure of `Y`'s `needs`.  A path named
     only in order to be ruled OUT - "not against `_orch/nodes/P9/work/x`" - is
     excluded first, the way rule E excludes a forbidden baseline.  The reverse read
     is the common and legitimate one and stays silent: `P124` #27 reads
     `_orch/nodes/P120/work/check4-after.txt`, an UPSTREAM node's finished artifact,
     and that is the operator-adopted way this run pins check 4.

     I2 is the same scan finding a node the plan does not contain.  A criterion
     depending on `nodes/<Y>/work/` where the graph names this node but no `Y` at
     all is a WARN and never a FLAG: the linter has found a dependency the plan does
     not explain, and it cannot tell a typo from a node authored outside the graph.

     I3 is the rewrite case, and it needs no graph: a criterion asserting an
     artifact is unchanged - "`tools/prober.py` is byte-identical to
     `work/prober.py.pre`" - inside a handoff whose own instructions tell THIS node
     to rewrite that same artifact.  The criterion's precondition is that the file
     still holds its dispatch state; the handoff's own steps destroy it.  This is
     rule D2's contradiction taken from the other side.  D2 reads one criterion
     against a sibling CRITERION; I3 reads one criterion against the handoff's
     INSTRUCTIONS, which is where a mid-flight criterion's contradiction lives,
     because at the moment it is written there is often no sibling criterion to
     contradict yet.

     THE DISCRIMINATOR for I3 is three clauses of the criterion's own text.  (1) the
     sameness claim is PREDICATIVE - "is byte-identical", "remains unchanged", "was
     not modified" - and never attributive, so "the unmodified tool preserved at
     `work/prober.py.pre`" describes a snapshot and does not trip it; (2) the claim
     carries no exception ("other than", "apart from", "except", "outside"), because
     a criterion that names the change it expects is settleable and is the repaired
     form; and (3) the claim is about the WHOLE artifact rather than a region of it
     - a criterion scoping its sameness to a section, a block, a line range or a
     named function stays silent, because a node told to change a file elsewhere can
     leave that region byte-identical.  The subject must also be the artifact and
     not the snapshot of it.

     The limit.  I1 needs a graph.  With no `plan/graph.yaml` above the handoff,
     with a file it cannot parse under §4's documented shape, or with this node
     absent from it, the rule declines in silence rather than guess an ordering, and
     that silence is not a judgement.  It reads `needs`, the hard edge, and not
     `informs`, because a soft edge orders nothing.  It triggers on a PATH under
     another node's directory and never on a bare node id in prose, which is usually
     a citation.  I3 is bounded by `node_edits`, which wants an edit verb near the
     path in the handoff's instruction sections: a handoff that mandates the rewrite
     through a command alone, naming no verb, is invisible to it.

NO CLOCK, NO STATE.  Two runs over an unchanged tree are byte-identical under
`cmp`.  Nothing is cached, nothing is remembered, no field is a wall-clock reading.

STDLIB ONLY, PYTHON 3.9.  `sys.stdlib_module_names` does not exist on this box's
3.9.6, so nothing here relies on it - the same constraint `tools/index.py` and
`tools/instruments.py` work under.  Imports: os, re, subprocess, sys.
"""

import os
import re
import subprocess
import sys

# ---------------------------------------------------------------------------
# lexicons.  Every entry is here because a real criterion of this run needed it.
# ---------------------------------------------------------------------------

# executables a backticked span may open with for that span to count as a command
EXECUTABLES = {
    "git", "grep", "egrep", "fgrep", "rg", "diff", "cmp", "comm", "find", "sed",
    "awk", "sort", "uniq", "wc", "head", "tail", "cat", "ls", "shasum", "md5",
    "md5sum", "sha256sum", "python3", "python", "sh", "bash", "make", "test",
    "tr", "cut", "xargs", "printf", "echo", "stat", "basename", "dirname",
}

# nouns naming a thing a reader must JUDGE rather than a syntax a command extracts
INTERPRETIVE_NOUNS = {
    "statement", "statements", "mention", "mentions", "reference", "references",
    "claim", "claims", "instance", "instances", "occurrence", "occurrences",
    "quotation", "quotations", "assertion", "assertions", "usage", "usages",
    "appearance", "appearances",
}
# multi-word interpretive heads, matched before the single-word list
INTERPRETIVE_PHRASES = ("quoted string", "quoted strings", "count statement",
                        "count statements")

QUANTIFIER_RE = re.compile(
    r"\b(every|each|all|any|no|per)\s+((?:[A-Za-z][A-Za-z-]*\s+){0,3}?)"
    r"([A-Za-z][A-Za-z-]*)\b", re.I)

DISCOVERY_RE = re.compile(
    r"\b(found\s+(?:in|across|under|among)|appearing\b|anywhere\s+in|that\s+exists?\b)", re.I)

AGREEMENT_RE = re.compile(
    r"\b(identical\s+to|byte-identical\s+to|matches|agrees?\s+with|agreeing\s+with|"
    r"(?:strict\s+)?subset\s+of|superset\s+of|reproduces|same\s+as|unchanged\s+from)\b", re.I)

STALE_REF_RE = re.compile(r"\b(baseline|pre-repair|prior\s+state|originally\s+recorded)\b", re.I)

PROSE_REF_RE = re.compile(
    r"\b(?:agrees?\s+with|agreeing\s+with|matching|consistent\s+with)\s+the\s+"
    r"[^,.;]{0,48}?\b(table|document|ADR|design|spec|note|record)\b", re.I)

ESCAPE_RE = re.compile(r"\bor\s+(names|records|explains|states|reports|lists)\b", re.I)

EXCEPTION_RE = re.compile(r"\b(other\s+than|apart\s+from|except|outside)\b", re.I)

PRESERVATION_RE = re.compile(r"\bstill\s+(contains?|carries|has|have|reads?|shows?|says?|names?|is|are)\b", re.I)

SETTLING_RE = re.compile(
    r"\bsettled\s+(by|the\s+same\s+way)\b|\bsettle\s+it\s+with\b|\bshown\s+by\b|"
    r"\bproved?\s+by\b|\bby\s+(pasting|quoting|grepping|diffing|counting|showing|extracting|mapping)\b",
    re.I)

# generators this repo ships, and the directory each one writes.  Both are content
# writes: deleting the directory loses information the generator then rebuilds.
# `tools/embed.py` (run by acceptance.sh check 6) is deliberately NOT here: it
# rewrites `index.html` unconditionally but byte-identically, so it changes mtime
# and not content.  Treating an mtime touch as a modification would flag scope
# criteria this run has verified CONFIRMED.
GENERATOR_WRITES = {
    "tools/index.py": "_orch/index/",
    "tools/instruments.py": "_orch/instruments/",
}

# A generator counts as MANDATED only when the handoff actually invokes it.  A
# handoff that merely names `tools/instruments.py` in prose - `P116` line 48 does,
# in a status list - mandates nothing, and flagging its scope criterion would be a
# false alarm against a node this run verified 21/21 CONFIRMED.
def mandate_re(gen):
    return re.compile(r"(?:python3?|sh|bash)\s+\S*" + re.escape(gen), re.I)

SCOPE_RE = re.compile(r"\bno\s+file\s+outside\b", re.I)
AUTHORSHIP_RE = re.compile(r"\bby\s+this\s+node\b", re.I)
MTIME_RE = re.compile(r"-newer\b|\.scope-marker\b", re.I)
# The carve-out that makes an mtime scope criterion settleable: the criterion
# itself names the writes it expects NOT to be the node's, so every hit the
# `find` reports can be attributed from the criterion's own text.  This run
# authored the shape both ways - `P120` #25 without the clause (recorded
# defective at `_orch/nodes/PR13/work/authoring-defects.md`) and `P121` #32,
# `P122` #27 and `P123` #22 with it.  That is the discriminator, and it is a
# property of the text rather than of what happened to be running at the time.
CARVEOUT_RE = re.compile(
    r"expected\s+in\s+that\s+list|not\s+(?:\*\*)?this\s+node'?.?s(?:\*\*)?\s+writes|"
    r"not\s+yours|phase\s+runner'?.?s\s+writes|written\s+by\s+the\s+phase\s+runner", re.I)
# An instrument named only by anaphora - the criterion points at a sibling's
# command instead of carrying one.  The linter can guess the referent but cannot
# read it out of this criterion, so this is a warning, never a flag.
DELEGATED_RE = re.compile(r"\bsame\s+`?find`?\b|\bsettled\s+the\s+same\s+way\b|"
                          r"\bthe\s+same\s+command\b", re.I)
BYTE_IDENTICAL_RE = re.compile(r"\bbyte-identical\b", re.I)
RANGE_EXTRACTOR_RE = re.compile(r"/\^?[^/`]+/\s*,\s*/\^?[^/`]+/")
SIBLING_CHANGE_RE = re.compile(
    r"\bhas\s+any\s+change\b|\bmust\s+change\b|\bgained\b|\brequires?\s+the\s+node\s+to\s+change\b|"
    r"\bis\s+changed\b|\bchange\s+outside\b", re.I)

# --- rule E: the cross-node temporal baseline -------------------------------
# (1) the claim is about this node's OWN before-state.  Without this clause the
# rule would flag `P124` #27, which reads a finished upstream artifact.
SELF_BASELINE_RE = re.compile(
    r"\bbefore\s+(?:\*\*)?this(?:\*\*)?\s+node\s+(?:ran|runs|began|started)\b|"
    r"\b(?:unchanged|unmodified|untouched)\s+by\s+(?:\*\*)?this(?:\*\*)?\s+node\b|"
    r"\bnot\s+(?:modified|changed|edited|touched)\s+by\s+(?:\*\*)?this(?:\*\*)?\s+node\b|"
    r"\bwas\s+not\s+(?:modified|changed|edited|touched)\s+by\s+this\s+node\b|"
    r"\bits\s+state\s+before\s+this\s+node\b", re.I)
# (2) the comparison clause.  The baseline is the first path after the operator.
COMPARISON_RE = re.compile(
    r"\b(?:against|identical\s+to|byte-identical\s+to|compared?\s+(?:against|to|with)|"
    r"diffed?\s+against)\b", re.I)
# a path named only to be ruled OUT as the baseline is not the baseline.  This is
# what keeps the repaired `P123` #12 silent while it names the `P122` copy.
NEGATED_BASELINE_RE = re.compile(
    r"\b(?:do(?:es)?\s+(?:\*\*)?not(?:\*\*)?\s+(?:settle|compare|diff|use)|"
    r"never\s+(?:settle|compare|diff|use)|not\s+against|rather\s+than|instead\s+of|"
    r"wrong\s+(?:baseline|copy|one))\b", re.I)
NODE_WORKDIR_RE = re.compile(r"_orch/nodes/([A-Za-z0-9][A-Za-z0-9_.-]*)/work/")
SELF_PATH_RE = re.compile(r"_orch/nodes/([A-Za-z0-9][A-Za-z0-9_.-]*)/")
HANDOFF_ID_RE = re.compile(r"^#\s*HANDOFF\s*[-\u2013\u2014]+\s*`?([A-Za-z0-9][A-Za-z0-9_.-]*)`?", re.M)
# (3) the baseline is a SNAPSHOT of the artifact the claim is about.
SNAPSHOT_SUFFIX_RE = re.compile(r"[.-](pre|before|orig|bak|baseline|snapshot)$", re.I)

# --- rule F: a success token demanded from a check that only prints failures ---
# the plural form the corpus authored four times over, defective and repaired:
# "checks 1, 2, 3, 5, 6, 7 and 8 print their OK tokens".
# The list may be a range ("checks 1-8"), may repeat the noun ("check 1 and check
# 8"), may name the script inline ("of `acceptance.sh`" - a dot, so the clause
# must not exclude one), and may say "report" or "pass, each printing".  Each of
# those forms was silent before 2026-09-06 and each is a criterion a verifier
# would read exactly as the corpus form.
CHECK_LIST_RE = re.compile(
    r"\bchecks?\s+((?:\d+\s*(?:,|and|&|-|–|to|through)\s*(?:checks?\s+)?)*\d+)\s+"
    r"(?:of\s+[^,;]{0,40}?\s+)?(?:pass(?:es)?,?\s+)?(?:must\s+|each\s+|all\s+)?"
    r"(?:print|prints|printing|show|shows|showing|emit|emits|emitting|"
    r"report|reports|reporting)\s+"
    r"(?:their|its|the|an?)\s+(?:OK|success|pass)\b", re.I)
CHECK_RANGE_RE = re.compile(r"(\d+)\s*(?:-|–|to|through)\s*(\d+)")
# the singular form, which names the literal: "check 6 prints `index.html in sync`".
CHECK_TOKEN_RE = re.compile(
    r"\bcheck\s+(\d+)\s+(?:print|prints|printing|show|shows|showing|emit|emits|emitting)\s+"
    r"`([^`]+)`", re.I)
NUMBER_RE = re.compile(r"\d+")
# a check banner in the harness, and any banner at all - the second ends a body, so
# the AIX check appended after check 9 does not read as part of check 9.
CHECK_BANNER_RE = re.compile(r"^\s*echo\s+[\"']===\s*Check\s+(\d+)\b", re.I)
BANNER_RE = re.compile(r"^\s*echo\s+[\"']===")
ECHO_ARG_RE = re.compile(r"\b(?:echo|printf)\s+(?:\"([^\"]*)\"|'([^']*)'|([^;|&()\n]+))")
# a shell function the harness defines - `ok() { echo "OK: $1"; }` - prints on the
# check's behalf when the check calls it, so its literals belong to every check
# that names it.  A rule that read only the check's own `echo` lines flagged a
# harness whose success token came from a helper (2026-09-06 review).
FUNC_DEF_RE = re.compile(r"^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{?")
SEGMENT_SPLIT_RE = re.compile(r"\s*(?:;|&&|\|\||\|)\s*")
# what an echoed literal says about the run that produced it.  SUCCESS is asked
# first: a check that can print a success token satisfies the criterion whatever
# else it may print on the failing path.  A negated failure noun - "no differences
# found", "no missing keys" - is a success message and reads as one.
SUCCESS_LITERAL_RE = re.compile(
    r"\bOK\b|\bPASS(?:ED|ING)?\b|\bSUCCESS\b|\bin\s+sync\b|\bup\s+to\s+date\b|\bclean\b|"
    r"\bno\s+(?:differences?|diffs?|missing|stale|errors?|failures?|violations?|"
    r"mismatch(?:es)?|gaps?|problems?|issues?)\b", re.I)
FAILURE_LITERAL_RE = re.compile(
    r"\bMISSING\b|\bFAIL(?:ED|URE|S)?\b|\bERROR\b|\bSTALE\b|\bBAD\b|\bnot\b|\bnever\b|"
    r"\bcannot\b|\bunresolved\b|\bunauthorised\b|\babsent\b|\bunresolvable\b", re.I)
# the corpus shouts its failures - "has NO fallback lens" - and a bare lowercase
# "no" is how a success message starts, so the shouted form is matched on its own
# and case-sensitively.
FAILURE_SHOUT_RE = re.compile(r"\bNO\b")

# --- rule G: a before/after contrast with no reachable before-state -------------
# (1) the snapshot is called a before-state rather than merely named
BEFORE_STATE_RE = re.compile(
    r"\b(?:unmodified|unrepaired|unfixed|unpatched|original|pre-change|pre-fix|"
    r"preserved|previous|earlier|old)\b|\bbefore\s+the\s+(?:change|edit|fix|repair)\b", re.I)
# (2) the other half of the contrast is the artifact as it is now
CURRENT_PARTY_RE = re.compile(
    r"\bthe\s+(?:current|new|edited|repaired|changed|updated|post-change)\b|"
    r"\bafter\s+the\s+(?:change|edit|fix|repair)\b", re.I)
# (3) the two are required to DIFFER.  A pair counts only when both halves appear;
# this is what leaves every sameness claim against a `.pre` copy alone.
OUTCOME_PAIRS = (
    (re.compile(r"\brefus(?:e|es|ed|al)\b", re.I), re.compile(r"\ballow(?:s|ed)?\b|\badmit(?:s|ted)?\b", re.I)),
    (re.compile(r"\breject(?:s|ed)?\b", re.I), re.compile(r"\baccept(?:s|ed)?\b", re.I)),
    (re.compile(r"\bfail(?:s|ed)?\b", re.I), re.compile(r"\bpass(?:es|ed)?\b", re.I)),
    (re.compile(r"\berror(?:s|ed)?\b", re.I), re.compile(r"\bsucceed(?:s|ed)?\b", re.I)),
    (re.compile(r"\bblock(?:s|ed)?\b", re.I), re.compile(r"\bpermit(?:s|ted)?\b", re.I)),
)
CONTRAST_CLAIM_RE = re.compile(
    r"\bgenuinely\s+tests?\s+the\s+change\b|\bproves?\s+the\s+change\b|"
    r"\bwould\s+have\s+(?:been\s+)?(?:refused|rejected|failed|caught|missed)\b|"
    r"\bbehaves?\s+differently\b|\bdifferent\s+(?:result|outcome|verdict|value|gate)\b", re.I)
# (4) an instrument that reads history.  A criterion carrying one is asking the
# question this rule exists to notice is missing, and is left alone.
HISTORY_INSTRUMENT_RE = re.compile(
    r"\bgit\s+(?:log|show|cat-file|rev-list|rev-parse|worktree)\b|\bHEAD[~^:]|"
    r"\breachable\s+history\b|\bearlier\s+commit\b|\bcommitted\s+version\b|"
    r"\bat\s+(?:commit|revision)\b", re.I)
# (5) the handoff tells THIS node to change the artifact.  Then the `.pre` copy is
# the working tree at dispatch and the node's own edit is the after-state: the
# contrast exists whatever `git log` says, because history is not where the
# before-state lives.  `P132` #31 was settled CONFIRMED in the archived run for
# exactly this reason (`_orch/verify/P132-verdict.json` row 31) and went
# unsettleable in the replay only because the replay's tree already carried the
# edit.  Without this clause the rule flagged every new tool a node is told to
# change (`_orch-replay/final/report-errata.md`, E4).
EDIT_VERB_RE = re.compile(
    r"\b(?:edit|modify|modifi|change|repair|patch|fix|rewrite|rewrit|update|updat|"
    r"extend|amend|teach|add|append)(?:e|s|es|ed|ing)?\b", re.I)
# the path followed by a mark that it is the thing being changed - a handoff's
# expected-outputs list writes "`tools/instruments.py` (edited)"
POST_EDIT_RE = re.compile(
    r"^[`'\"]?\s*(?:\((?:edited|modified|changed|repaired|extended|patched)\)|"
    r"(?:is|gets|will\s+be|must\s+be|to\s+be)\s+(?:edited|modified|changed|repaired|extended|"
    r"patched)|gains\b|so\s+that\b)", re.I)

# --- rule H: one mutation required to refute both arms of a complementary pair ---
# (3) the criterion asks a MUTATION to refute its arm.  Both halves are required:
# a criterion that merely names a bound is not making a refutability claim at all.
MUTATION_RE = re.compile(
    r"\bmutat(?:e|es|ed|ing|ion|ions)\b|\bsabotag(?:e|es|ed|ing)\b|"
    r"\bone-line\s+(?:change|edit|mutation)\b|\bsingle-line\s+(?:change|edit)\b|"
    r"\ba\s+single\s+(?:edit|change|line\s+change)\b|\bpositive\s+control\b|"
    r"\bperturb(?:s|ed|ing|ation)?\b", re.I)
REFUTE_RE = re.compile(
    r"\bflip(?:s|ped|ping)?\b|\brefut(?:e|es|ed|ing|able)\b|"
    r"\bfrom\s+pass\s+to\s+fail\b|\bturns?\s+.{0,24}?\bred\b|"
    r"\bmakes?\s+(?:it\s+|that\s+|the\s+\w+\s+)?(?:arm\s+)?fail\b|"
    r"\bcauses?\s+.{0,24}?\bto\s+fail\b|\bno\s+longer\s+(?:holds?|passes)\b|"
    r"\bbreaks?\s+(?:the\s+)?(?:arm|assertion|check|criterion)\b", re.I)
# (4) the mutation is the SAME mutation.  This is the clause that separates the
# defect from the ordinary two-mutation positive control, so it is never inferred:
# the criterion has to point at its sibling's mutation in words.
SAME_MUTATION_RE = re.compile(
    r"\b(?:that|the|this)\s+same\s+(?:one-line\s+|single-line\s+)?"
    r"(?:mutation|change|edit|sabotage|perturbation)\b|"
    r"\bthat\s+mutation\b|\bthe\s+mutation\s+(?:above|already\s+named)\b|"
    r"\bthe\s+(?:same\s+)?mutation\s+(?:of|in|from)\s+criterion\s+\d+\b", re.I)
_H_NUM = r"(\d+(?:\.\d+)?|\.\d+)"
# (1) and (2): the comparison and its threshold.  Order matters - "at or below"
# contains "below", so the two-sided forms are matched first and an overlapping
# one-sided match over the same span is dropped.  Symbolic forms exclude their own
# two-character spellings: `<` does not match the `<` of `<=`.
COMPARISON_FORMS = (
    (re.compile(r"(?:at\s+or\s+below|no\s+(?:more|greater|higher)\s+than|at\s+most|"
                r"not\s+(?:more|greater|higher)\s+than)\s+" + _H_NUM + r"\s*(%?)", re.I), "<="),
    (re.compile(r"(?:at\s+or\s+above|no\s+(?:less|lower|fewer)\s+than|at\s+least|"
                r"not\s+(?:less|lower|fewer)\s+than)\s+" + _H_NUM + r"\s*(%?)", re.I), ">="),
    (re.compile(r"(?:strictly\s+)?(?:above|greater\s+than|more\s+than|higher\s+than|"
                r"exceed(?:s|ing)?)\s+" + _H_NUM + r"\s*(%?)", re.I), ">"),
    (re.compile(r"(?:strictly\s+)?(?:below|less\s+than|fewer\s+than|lower\s+than)\s+"
                + _H_NUM + r"\s*(%?)", re.I), "<"),
    (re.compile(r"<=\s*" + _H_NUM + r"\s*(%?)"), "<="),
    (re.compile(r">=\s*" + _H_NUM + r"\s*(%?)"), ">="),
    (re.compile(r"<(?!=)\s*" + _H_NUM + r"\s*(%?)"), "<"),
    (re.compile(r">(?!=)\s*" + _H_NUM + r"\s*(%?)"), ">"),
)
# the same four operators with the threshold named by anaphora instead of a number -
# "at or below that threshold" - which is how the second half of a complementary
# pair is usually written.  Only consulted when the criterion names no number, and
# the resulting arm binds to whatever threshold its partner names.
COMPARISON_ANAPHORA = (
    (re.compile(r"(?:at\s+or\s+below|no\s+(?:more|greater)\s+than|at\s+most)\s+"
                r"(?:that|the\s+same|the)\s+threshold\b", re.I), "<="),
    (re.compile(r"(?:at\s+or\s+above|no\s+less\s+than|at\s+least)\s+"
                r"(?:that|the\s+same|the)\s+threshold\b", re.I), ">="),
    (re.compile(r"(?:above|greater\s+than|more\s+than|exceed(?:s|ing)?)\s+"
                r"(?:that|the\s+same|the)\s+threshold\b", re.I), ">"),
    (re.compile(r"(?:below|less\s+than)\s+(?:that|the\s+same|the)\s+threshold\b", re.I), "<"),
)
COMPLEMENT = {">": "<=", "<=": ">", "<": ">=", ">=": "<"}

# --- rule I: a precondition the run's own sequencing forbids --------------------
# a path under some node's work directory, whatever the orchestration root is
# called.  The archived run wrote `_orch/`, the replay `_orch-replay/`, so the
# prefix is not matched - only the `nodes/<id>/` segment §6 fixes.
NODE_ANY_DIR_RE = re.compile(r"(?:^|/)nodes/([A-Za-z0-9][A-Za-z0-9_.-]*)/")
# the §4 graph, read for exactly two keys - `id` and `needs`.  A node entry opens
# with `- id:`; a
# list item that opens with any other key means the file is not in the shape §4
# documents, and the parser declines the whole file rather than mis-attribute an
# edge to the wrong node.  `informs` is a soft edge and orders nothing, so it is
# not read.
GRAPH_ID_RE = re.compile(r"^\s*-\s+id:\s*[\"']?([A-Za-z0-9][A-Za-z0-9_.-]*)[\"']?\s*(?:#.*)?$")
GRAPH_DASH_KEY_RE = re.compile(r"^\s*-\s+[A-Za-z_][A-Za-z0-9_]*\s*:")
GRAPH_KEY_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*(?:#.*)?$")
GRAPH_FLOW_RE = re.compile(r"^\[(.*)\]$")
GRAPH_ITEM_RE = re.compile(r"^\s*-\s+[\"']?([A-Za-z0-9][A-Za-z0-9_.-]*)[\"']?\s*(?:#.*)?$")
GRAPH_EMPTY = ("", "~", "null", "[]", "Null", "NULL")
# (1) the sameness claim, PREDICATIVE.  An attributive "the unmodified tool
# preserved at `work/prober.py.pre`" describes a snapshot and is rule G's subject,
# not this one's; without the copula this rule would flag rule G's own known-bad.
UNCHANGED_CLAIM_RE = re.compile(
    r"\b(?:is|are|remains?|stays?|must\s+be|should\s+be|shall\s+be|was|were|be)\s+"
    r"(?:still\s+)?(?:byte-identical|byte-for-byte\s+identical|bit-identical|identical|"
    r"unchanged|unmodified|untouched)\b|"
    r"\b(?:is|are|was|were|has|have)\s+not\s+(?:been\s+)?"
    r"(?:modified|changed|edited|touched|rewritten|regenerated)\b|"
    r"\bno\s+(?:byte|line|character)\s+of\b", re.I)
# (3) a claim scoped to a REGION of the artifact.  A node told to change a file
# elsewhere can leave a named region byte-identical, so a scoped claim is not
# contradicted by the instruction to edit and stays silent.
REGION_SCOPE_RE = re.compile(
    r"\b(?:the|that|its|a)\s+(?:\w+[-\s]){0,3}?"
    r"(?:region|section|block|stanza|paragraph|frontmatter|front-matter|header|footer|"
    r"preamble|heading|table|body\s+of)\b|"
    r"\blines?\s+\d+\b|\bbetween\s+`[^`]+`\s+and\s+`[^`]+`|"
    r"\bthe\s+`[^`]+`\s+(?:function|method|class|rule|clause|field|key|entry|section)\b", re.I)
# a prohibition standing immediately in front of an edit verb.  "Do not edit
# `tools/foo.py`" is not an instruction to change it, and reading it as one would
# make rule I3 flag the one pairing that is always correct - a criterion asserting
# a file unchanged in a handoff that forbids changing it.
PROHIBITION_RE = re.compile(
    r"\b(?:do\s+not|don'?t|does\s+not|did\s+not|must\s+not|may\s+not|cannot|can'?t|"
    r"never|not|without|forbidden\s+to|rather\s+than|instead\s+of|no)"
    r"(?:\s+\w+){0,2}\s*$", re.I)

BACKTICK_RE = re.compile(r"`([^`]+)`")
BARE_PATH_RE = re.compile(r"(?<![`\w])(/(?:[A-Za-z0-9._-]+/)+[A-Za-z0-9._-]+)")
PLACEHOLDER_RE = re.compile(r"<[a-z_]+>", re.I)


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def backticks(text):
    return BACKTICK_RE.findall(text)


def is_command(span):
    tok = span.strip().split()
    if not tok:
        return False
    head = tok[0]
    if head in EXECUTABLES:
        return True
    return head.endswith(".sh") or head.endswith(".py")


def commands(text):
    return [s for s in backticks(text) if is_command(s)]


def is_derivation_command(span):
    """A command that could actually generate an enumeration: it carries a target.

    `grep -F` names a tool and nothing to run it over; it settles nothing.
    `grep -rhoE ... prompt/modes/*.md` names what to enumerate.
    """
    tok = span.strip().split()
    if len(tok) < 2:
        return False
    for t in tok[1:]:
        if t.startswith("-"):
            continue
        if "/" in t or "*" in t or "." in t or t.startswith("'") or t.startswith('"'):
            return True
    return False


def looks_like_path(span):
    s = span.strip()
    if " " in s or not s:
        return False
    return "/" in s or s.endswith(".md") or s.endswith(".py") or s.endswith(".sh")


def paths_in(text):
    out = []
    for s in backticks(text):
        if looks_like_path(s):
            out.append(s)
    for s in BARE_PATH_RE.findall(text):
        out.append(s)
    seen, uniq = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


TOKEN_SPLIT_RE = re.compile(r"[\s`'\"()\[\],;|<>*]+")


def path_tokens(text):
    """Every whitespace- or punctuation-delimited token of `text` that could be a
    path, in document order.  `paths_in` reads a criterion, where a path is
    backticked on its own; this reads a whole handoff, where the path that resolves
    a criterion's bare filename is usually inside a command span - `cp
    tools/instruments.py work/instruments.py.pre` - and so invisible to `paths_in`."""
    out, seen = [], set()
    for tok in TOKEN_SPLIT_RE.split(text):
        tok = tok.strip().rstrip(".:")
        if not tok or "/" not in tok:
            continue
        if tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def has_settling_clause(text):
    if SETTLING_RE.search(text):
        return True
    return bool(commands(text))


def strip_backticks(text):
    """Replace each backticked span with one opaque token, so the quantifier scan
    counts a backticked path as one word rather than however many words it holds."""
    return BACKTICK_RE.sub(" BTQUOTE ", text)


# ---------------------------------------------------------------------------
# trackedness, resolved with git ls-files - never by keyword
# ---------------------------------------------------------------------------

class Tracked(object):
    """Caches `git ls-files` answers.  Cache is per-process, so output stays
    byte-identical across runs; nothing is written to disk."""

    def __init__(self, root):
        self.root = root
        self._cache = {}
        self._versions = {}
        self._git_ok = None

    def git_available(self):
        if self._git_ok is None:
            try:
                r = subprocess.Popen(
                    ["git", "rev-parse", "--is-inside-work-tree"], cwd=self.root,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                r.communicate()
                self._git_ok = (r.returncode == 0)
            except (OSError, ValueError):
                self._git_ok = False
        return self._git_ok

    def is_tracked(self, path):
        """True / False / None (could not resolve)."""
        rel = self.relative(path)
        if rel in self._cache:
            return self._cache[rel]
        if not self.git_available():
            self._cache[rel] = None
            return None
        try:
            p = subprocess.Popen(
                ["git", "ls-files", "--error-unmatch", "--", rel], cwd=self.root,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            p.communicate()
            ans = (p.returncode == 0)
        except (OSError, ValueError):
            ans = None
        self._cache[rel] = ans
        return ans

    def history_versions(self, path):
        """How many commits in reachable history touch `path`; None if git cannot
        say.  Rule G asks this and nothing else of history: a criterion that
        contrasts an artifact's before-state against its after-state needs at least
        two reachable versions for the contrast to exist at all."""
        rel = self.relative(path)
        if rel in self._versions:
            return self._versions[rel]
        if not self.git_available():
            self._versions[rel] = None
            return None
        try:
            p = subprocess.Popen(
                ["git", "log", "--follow", "--format=%H", "--", rel], cwd=self.root,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            so, _ = p.communicate()
            if p.returncode != 0:
                ans = None
            else:
                ans = len([ln for ln in so.decode("utf-8", "replace").split("\n") if ln.strip()])
        except (OSError, ValueError):
            ans = None
        self._versions[rel] = ans
        return ans

    def relative(self, path):
        rel = path
        if rel.startswith(self.root + os.sep):
            rel = rel[len(self.root) + 1:]
        return rel.lstrip("./")


# ---------------------------------------------------------------------------
# the acceptance harness, read - never run.  Rule F resolves what a check can
# print by opening the script the criterion names, the way rule A resolves
# trackedness with `git ls-files` rather than by keyword.
# ---------------------------------------------------------------------------

class Harness(object):
    """Caches the per-check echo literals of a shell script.  Cache is
    per-process, so output stays byte-identical across runs; nothing is written to
    disk and no script is ever executed."""

    def __init__(self, root):
        self.root = root
        self._cache = {}

    def resolve(self, name, handoff_text):
        """Absolute path of the script a criterion names, or None.  A criterion
        that says `acceptance.sh` names the file without saying where it is; the
        handoff that carries the criterion does say, so the basename is resolved
        against the paths the handoff itself gives, in the order it gives them."""
        base = os.path.basename(name)
        cands = [name]
        for p in path_tokens(handoff_text):
            if os.path.basename(p) == base and p not in cands:
                cands.append(p)
        for c in cands:
            ap = c if os.path.isabs(c) else os.path.join(self.root, c)
            if os.path.isfile(ap):
                return os.path.abspath(ap)
        return None

    def checks(self, path):
        """{check number: [echoed literal, ...]} for a banner-structured script, or
        None if it cannot be read.  A check's body runs from its banner to the next
        banner of any kind, so a check appended after the numbered ones does not
        read as part of the last."""
        if path in self._cache:
            return self._cache[path]
        try:
            fh = open(path, "r")
            try:
                body = fh.read()
            finally:
                fh.close()
        except (IOError, OSError):
            self._cache[path] = None
            return None
        lines = body.split("\n")
        # first pass: the literals each shell function prints, so a check that
        # calls `ok "check 1"` is credited with what `ok` echoes.
        funcs, fname = {}, None
        for ln in lines:
            if ln.lstrip().startswith("#"):
                continue
            if fname is None:
                m = FUNC_DEF_RE.match(ln)
                if m:
                    fname = m.group(1)
                    funcs[fname] = []
                    tail = ln[m.end():]
                    for g in ECHO_ARG_RE.findall(tail):
                        lit = (g[0] or g[1] or g[2]).strip()
                        if lit:
                            funcs[fname].append(lit)
                    if tail.rstrip().endswith("}"):
                        fname = None
                continue
            if ln.strip() == "}" or ln.rstrip().endswith("}"):
                for g in ECHO_ARG_RE.findall(ln):
                    lit = (g[0] or g[1] or g[2]).strip()
                    if lit:
                        funcs[fname].append(lit)
                fname = None
                continue
            for g in ECHO_ARG_RE.findall(ln):
                lit = (g[0] or g[1] or g[2]).strip()
                if lit:
                    funcs[fname].append(lit)
        # second pass: the checks, skipping function bodies
        out, cur, in_func = {}, None, False
        for ln in lines:
            if ln.lstrip().startswith("#"):
                continue  # a comment quoting an echo is not an echo
            if in_func:
                if ln.strip() == "}" or ln.rstrip().endswith("}"):
                    in_func = False
                continue
            m = FUNC_DEF_RE.match(ln)
            if m:
                in_func = not ln[m.end():].rstrip().endswith("}")
                continue
            m = CHECK_BANNER_RE.match(ln)
            if m:
                cur = int(m.group(1))
                out.setdefault(cur, [])
                continue
            if BANNER_RE.match(ln):
                cur = None
                continue
            if cur is None:
                continue
            for g in ECHO_ARG_RE.findall(ln):
                lit = (g[0] or g[1] or g[2]).strip()
                if lit:
                    out[cur].append(lit)
            for seg in SEGMENT_SPLIT_RE.split(ln.strip()):
                head = seg.split()[0] if seg.split() else ""
                if head in funcs:
                    out[cur].extend(funcs[head])
        self._cache[path] = out
        return out


# ---------------------------------------------------------------------------
# the plan graph, read - never written.  Rule I1 resolves node ordering the way
# rule A resolves trackedness and rule F resolves a check: by opening the thing
# that knows, rather than by matching a word.  §4 puts it at `plan/graph.yaml`
# under the orchestration root, and §6 fixes the handoff at `nodes/<id>/handoff.md`
# beside it, so the graph is found by walking up from the handoff itself and the
# root may be called `_orch/` or `_orch-replay/` or anything else.
# ---------------------------------------------------------------------------

class Graph(object):
    """Caches parsed `plan/graph.yaml` files, keyed by path.  Cache is per-process,
    so output stays byte-identical across runs; nothing is written to disk."""

    def __init__(self, root):
        self.root = root
        self._cache = {}

    def locate(self, handoff_path):
        """The `plan/graph.yaml` above this handoff, or None.  Walks up from the
        handoff's own directory, so the orchestration root's name is never assumed."""
        d = os.path.abspath(os.path.dirname(handoff_path) or ".")
        while True:
            cand = os.path.join(d, "plan", "graph.yaml")
            if os.path.isfile(cand):
                return cand
            parent = os.path.dirname(d)
            if parent == d:
                return None
            d = parent

    def nodes_for(self, handoff_path):
        """{node id: set of ids it `needs`} for the plan above this handoff, or None
        when there is no graph or the file is not in the shape §4 documents."""
        path = self.locate(handoff_path)
        if path is None:
            return None
        if path in self._cache:
            return self._cache[path]
        try:
            fh = open(path, "r")
            try:
                body = fh.read()
            finally:
                fh.close()
        except (IOError, OSError):
            self._cache[path] = None
            return None
        self._cache[path] = parse_graph(body)
        return self._cache[path]

    def downstream(self, nodes, start):
        """Every node the plan places strictly after `start`: the transitive closure
        of the reverse `needs` edge.  `informs` is a soft edge and orders nothing, so
        it is not read."""
        rev = {}
        for nid, needs in nodes.items():
            for up in needs:
                rev.setdefault(up, set()).add(nid)
        seen, stack = set(), [start]
        while stack:
            cur = stack.pop()
            for nxt in sorted(rev.get(cur, ())):
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        seen.discard(start)
        return seen


def parse_graph(text):
    """`- id: T07` opens a node, `needs:` carries its hard edges in either YAML
    spelling.  Returns None the moment a list item opens with a key other than
    `id`: the file is then not in §4's documented shape, and a parser that guessed
    which node an edge belonged to would invent an ordering.  No YAML library -
    this module is stdlib-only on 3.9, the same constraint `tools/index.py` works
    under."""
    nodes, cur, collecting = {}, None, False
    for line in text.split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = GRAPH_ID_RE.match(line)
        if m:
            cur, collecting = m.group(1), False
            nodes.setdefault(cur, set())
            continue
        if GRAPH_DASH_KEY_RE.match(line):
            return None  # a node entry that does not open with `id`.  Decline.
        if cur is None:
            continue
        mi = GRAPH_ITEM_RE.match(line)
        if collecting and mi:
            nodes[cur].add(mi.group(1))
            continue
        mk = GRAPH_KEY_RE.match(line)
        if not mk:
            collecting = False
            continue
        key, val = mk.group(1), mk.group(2)
        collecting = False
        if key != "needs":
            continue
        val = val.strip()
        if val == "":
            collecting = True   # a block sequence follows on the lines below
            continue
        if val in GRAPH_EMPTY:
            continue
        mf = GRAPH_FLOW_RE.match(val)
        if mf:
            for tok in mf.group(1).split(","):
                tok = tok.strip().strip("\"'")
                if tok:
                    nodes[cur].add(tok)
    return nodes or None


# ---------------------------------------------------------------------------
# handoff parsing
# ---------------------------------------------------------------------------

CRIT_HEAD_RE = re.compile(r"^#{2,4}\s+.*Done-criteria", re.I)
HEAD_RE = re.compile(r"^#{1,6}\s+")
NUM_RE = re.compile(r"^(\d+)\.\s+(.*)$")


def parse_handoff(text):
    """Returns (criteria, whole_text).  criteria is a list of (number, text)."""
    lines = text.split("\n")
    # A fan-out handoff carries two such headings - `F2` has "## Child done-criteria"
    # at line 97 and "## Done-criteria for this node" at line 129 - and the node's
    # own section is the one a verifier sweeps.  Prefer the heading that does not
    # say "child"; among those, the last, because a node's own criteria close the
    # handoff.  Taking the first heading linted `F2`'s nine child criteria and never
    # its ten (`_orch-replay/final/report-errata.md`, E8).
    heads = [i for i, ln in enumerate(lines) if CRIT_HEAD_RE.match(ln)]
    own = [i for i in heads if "child" not in lines[i].lower()]
    if own:
        heads = own
    if not heads:
        return [], text
    start = heads[-1] + 1
    body = []
    for ln in lines[start:]:
        if HEAD_RE.match(ln):
            break
        body.append(ln)
    crits, cur = [], None
    for ln in body:
        m = NUM_RE.match(ln)
        if m:
            if cur:
                crits.append(cur)
            cur = [int(m.group(1)), m.group(2)]
        elif cur is not None:
            if ln.strip() == "":
                continue
            if ln.startswith(" ") or ln.startswith("\t"):
                cur[1] = cur[1] + " " + ln.strip()
            else:
                crits.append(cur)
                cur = None
    if cur:
        crits.append(cur)
    return [(n, t) for n, t in crits], text


# ---------------------------------------------------------------------------
# the rules.  Each returns a list of (level, rule, message).
# ---------------------------------------------------------------------------

GIT_CMD_RE = re.compile(r"^git\s+(\S+)(.*)$", re.S)
INDEX_ASSERTION_RE = re.compile(r"\bnothing\s+staged\b|\bstaged\s+column\b|\bnothing\s+is\s+staged\b|"
                                r"\bno\s+file\s+.{0,30}staged\b|\bthe\s+index\b", re.I)
LOG_POINTER_RE = re.compile(r"-1\b|-n\s*1\b")


def rule_a(num, text, tracked):
    out = []
    gits = [c for c in commands(text) if c.strip().startswith("git ")]
    if not gits:
        return out
    for cmd in gits:
        m = GIT_CMD_RE.match(cmd.strip())
        if not m:
            continue
        sub, rest = m.group(1), m.group(2)
        if sub == "status":
            if INDEX_ASSERTION_RE.search(text):
                continue  # measures the index, not the tree.  Settleable.
            out.append(("FLAG", "A1",
                        "`%s` is the settling mechanism, and the criterion asserts about the "
                        "working tree rather than the index. On an uncommittable branch the "
                        "tree carries every other node's edits, so no execution of this node "
                        "can make the assertion true (the `P80` #6 shape, `_orch/inbox/Q-10.md`)."
                        % cmd))
            continue
        if sub == "log":
            if LOG_POINTER_RE.search(rest):
                continue  # reads a branch pointer.  Settleable.
            out.append(("WARN", "A4",
                        "`%s` settles this criterion, but it does not read a single branch "
                        "pointer (`-1`), so the linter cannot settle what state it measures."
                        % cmd))
            continue
        if sub in ("diff", "show", "stash"):
            targets = []
            after = rest
            for tok in after.replace("|", " ").split():
                if tok.startswith("HEAD:"):
                    targets.append(tok[len("HEAD:"):])
                elif "/" in tok and not tok.startswith("-"):
                    targets.append(tok)
            placeholder = bool(PLACEHOLDER_RE.search(rest))
            targets = [t for t in targets if t and not PLACEHOLDER_RE.search(t)]
            if not targets and placeholder:
                # a placeholder like HEAD:<path> - resolve from the criterion's own paths
                targets = [p for p in paths_in(text) if "/" in p]
            if not targets and placeholder:
                out.append(("WARN", "A3",
                            "`%s` settles this criterion against a placeholder target, and the "
                            "criterion names no path the linter could substitute for it. It could "
                            "not settle which path `git ls-files` should be asked about, so it "
                            "could not settle whether the instrument can see its target." % cmd))
                continue
            if not targets:
                out.append(("FLAG", "A1",
                            "`%s` is the settling mechanism and names no path, so it reports on "
                            "the whole uncommittable branch rather than on this node's own work "
                            "(the `P80` #6 shape, `_orch/inbox/Q-10.md`: `git diff --stat` "
                            "reported 31 files for a node that touched two)." % cmd))
                continue
            unresolved, untracked = [], []
            for t in targets:
                st = tracked.is_tracked(t)
                if st is None:
                    unresolved.append(t)
                elif st is False:
                    untracked.append(t)
            if untracked:
                out.append(("FLAG", "A2",
                            "`%s` settles this criterion against %s, which `git ls-files` reports "
                            "as untracked. `git show HEAD:` and `git diff` cannot see a path that "
                            "has never been committed, and this run is forbidden to commit."
                            % (cmd, ", ".join("`%s`" % t for t in untracked))))
            if unresolved:
                out.append(("WARN", "A3",
                            "`%s` settles this criterion, but the linter could not resolve the "
                            "trackedness of %s with `git ls-files`; it could not settle whether "
                            "the instrument can see that path."
                            % (cmd, ", ".join("`%s`" % t for t in unresolved))))
    return out


def rule_b(num, text):
    out = []
    flat = strip_backticks(text)
    low = flat.lower()
    hits = []
    for phrase in INTERPRETIVE_PHRASES:
        for m in re.finditer(r"\b(every|each|all|any|no|per|one\s+line\s+per)\s+"
                             r"((?:[a-z][a-z-]*\s+){0,3}?)" + phrase.replace(" ", r"\s+") + r"\b",
                             low):
            hits.append((m.group(0).strip(), "interpretive head"))
    for m in QUANTIFIER_RE.finditer(flat):
        head = m.group(3).lower()
        tail = flat[m.end():]
        window = " ".join(tail.split()[:5])
        if head in INTERPRETIVE_NOUNS:
            hits.append((m.group(0).strip(), "interpretive head"))
        elif DISCOVERY_RE.search(window):
            hits.append((m.group(0).strip(), "discovery predicate"))
    if not hits:
        return out
    if any(is_derivation_command(c) for c in commands(text)):
        return out
    seen, uniq = set(), []
    for h, why in hits:
        k = (h, why)
        if k not in seen:
            seen.add(k)
            uniq.append((h, why))
    phrase, why = uniq[0]
    out.append(("FLAG", "B",
                "universal \"%s\" (%s) with no derivation command attached. "
                "`_orch/inbox/Q-11.answer.md`: a universal must carry the command that generates "
                "its enumeration. Without one, two competent agents enumerate two different sets "
                "and neither is refutable (the `P76` #1 shape, refuted twice)." % (phrase, why)))
    return out


def rule_c(num, text):
    out = []
    if AGREEMENT_RE.search(text) and STALE_REF_RE.search(text) and not ESCAPE_RE.search(text):
        ref = STALE_REF_RE.search(text).group(0)
        out.append(("FLAG", "C1",
                    "a fresh measurement is pinned to a value recorded earlier (\"%s\"), with no "
                    "escape for divergence. `_orch/verify/P111-verdict.json` row 21: \"a baseline "
                    "written by a blind instrument cannot contain what that instrument could not "
                    "see, so any repair that finds a new tag necessarily fails this criterion.\""
                    % ref))
    if PROSE_REF_RE.search(text) and not paths_in(text) and not ESCAPE_RE.search(text):
        out.append(("FLAG", "C2",
                    "a fresh measurement is required to agree with a value recorded in prose "
                    "(\"%s\"), which names no file and no command that re-derives it. The `P112` "
                    "#15 shape: the tool measured the live corpus and reported 1; the criterion "
                    "required the number a document written earlier records."
                    % PROSE_REF_RE.search(text).group(0).strip()))
    if PRESERVATION_RE.search(text) and not has_settling_clause(text):
        out.append(("FLAG", "C3",
                    "a preservation claim (\"%s\") with no settling clause and no command: the "
                    "prior state it preserves is asserted, not measured. The `P01b` #4 shape - "
                    "\"the criterion's premise that this file carries a `PHASE: PROBE` token is "
                    "false for both the pre- and post-edit state\" "
                    "(`_orch/verify/P01b-verdict.json` row 4)."
                    % PRESERVATION_RE.search(text).group(0)))
    return out


def rule_d(num, text, all_crits, handoff_text):
    out = []
    # D1 - a scope allow-list that omits a directory a mandated generator writes
    if SCOPE_RE.search(text):
        allow = [p for p in paths_in(text)]
        for gen, wdir in sorted(GENERATOR_WRITES.items()):
            if not mandate_re(gen).search(handoff_text):
                continue
            covered = any(wdir.startswith(a.rstrip("/") + "/") or a.rstrip("/") == wdir.rstrip("/")
                          for a in allow)
            if not covered:
                out.append(("FLAG", "D1",
                            "this criterion forbids every write outside its list, but the same "
                            "handoff mandates `%s`, which writes `%s` - not in the list. The "
                            "`P112` #29 shape: \"the criterion omits the carve-out, which makes "
                            "the criterion unsatisfiable by any node that obeys the handoff\" "
                            "(`_orch/verify/P112-verdict.json` row 29)." % (gen, wdir)))
    # D2 - a region required byte-identical that a sibling criterion requires changed
    if BYTE_IDENTICAL_RE.search(text) and not EXCEPTION_RE.search(text):
        extractor = RANGE_EXTRACTOR_RE.search(text) or re.search(r"\bextract(?:ing|ed)\b", text, re.I)
        if extractor:
            fileset = None
            fs = re.search(r"\b((?:every|each|no|any)\s+[a-z ]{0,30}?file[s]?\s+this\s+node\s+edited)",
                           text, re.I)
            if fs:
                fileset = fs.group(1).lower()
                fileset = re.sub(r"^(every|each|no|any)\s+", "", fileset)
            if fileset:
                for onum, otext in all_crits:
                    if onum == num:
                        continue
                    if fileset in otext.lower() and SIBLING_CHANGE_RE.search(otext):
                        out.append(("FLAG", "D2",
                                    "this criterion requires a region of \"%s\" byte-identical, "
                                    "extracted mechanically, while criterion %d of the same "
                                    "handoff requires those same files changed and the handoff "
                                    "nowhere proves the two regions disjoint. The `P120` #14 "
                                    "shape: \"14 and 15 cannot both hold for any edited file\" "
                                    "(`_orch/nodes/PR13/work/authoring-defects.md`)."
                                    % (fileset, onum)))
                        break
    # D3 - an mtime instrument asked to attribute authorship, with no carve-out
    if (SCOPE_RE.search(text) and AUTHORSHIP_RE.search(text)
            and MTIME_RE.search(text) and "find" in text
            and not CARVEOUT_RE.search(text)):
        out.append(("FLAG", "D3",
                    "an allow-list scope claim is attributed (\"by this node\") but settled by an "
                    "mtime instrument, and the criterion names no expected non-node write. mtime "
                    "records WHEN a file changed, never WHICH agent changed it, and this run's "
                    "handoffs mandate commands that write outside the list while the node runs, so "
                    "the `find` reports hits the criterion has no way to attribute. The `P120` #25 "
                    "shape (`_orch/nodes/PR13/work/authoring-defects.md`). The same shape carrying "
                    "the carve-out - `P121` #32, `P122` #27, `P123` #22, each naming `index.html` "
                    "and the generator directories as writes that are not the node's - is "
                    "settleable and is not flagged."))
    # D4 - the same claim whose instrument is named only by anaphora
    if (SCOPE_RE.search(text) and AUTHORSHIP_RE.search(text)
            and not MTIME_RE.search(text) and DELEGATED_RE.search(text)
            and not CARVEOUT_RE.search(text)):
        ref = None
        for onum, otext in all_crits:
            if onum != num and MTIME_RE.search(otext) and "find" in otext:
                ref = onum
                break
        where = ("criterion %d of the same handoff, which is an mtime `find`" % ref) if ref \
            else "no sibling criterion in this file"
        out.append(("WARN", "D4",
                    "an allow-list scope claim is attributed (\"by this node\") but carries no "
                    "instrument of its own - it delegates to %s. The linter cannot settle from "
                    "this criterion's text which instrument settles it; if it is that mtime "
                    "`find`, rule D3 applies and the criterion needs the carve-out D3 names. "
                    "Write the command into the criterion, or name the expected non-node writes, "
                    "and this warning is answered." % where))
    return out


def self_node_id(path, text):
    """Which node this file belongs to, or None.  Read from the file's own path
    first - `_orch/nodes/<id>/...` - and from a `# HANDOFF - <id>` heading only
    when the path does not say.  Never guessed: rule E declines to judge rather
    than assume a file belongs to the node whose directory it names."""
    apath = os.path.abspath(path).replace(os.sep, "/")
    m = SELF_PATH_RE.search(apath)
    if m:
        return m.group(1)
    m = HANDOFF_ID_RE.search(text)
    if m:
        return m.group(1)
    return None


def forbidden_baselines(text):
    """Paths the criterion names in order to rule them OUT as the baseline."""
    out = set()
    for m in NEGATED_BASELINE_RE.finditer(text):
        for p in paths_in(text[m.end():m.end() + 200]):
            out.add(p)
    return out


def comparison_baselines(text):
    """The paths this criterion compares against: the first path after each
    comparison operator, minus the ones it explicitly forbids.  Taking the first
    path only is deliberate - it is the operand of the comparison, where a later
    path in the same sentence is usually the subject or the evidence file."""
    forbidden = forbidden_baselines(text)
    out = []
    for m in COMPARISON_RE.finditer(text):
        ps = paths_in(text[m.end():m.end() + 200])
        if not ps:
            continue
        p = ps[0]
        if p in forbidden or p in out:
            continue
        out.append(p)
    return out


def snapshot_subject(baseline, text):
    """If `baseline` is a snapshot or copy of some artifact the criterion also
    names, return that artifact's name; otherwise None."""
    base = os.path.basename(baseline)
    m = SNAPSHOT_SUFFIX_RE.search(base)
    stem = base[:m.start()] if m else base
    for p in paths_in(text):
        if p != baseline and os.path.basename(p) == stem:
            return p
    if m:
        return stem
    return None


def rule_e(num, text, self_id):
    """The cross-node temporal baseline.  See THE SHAPES IT REJECTS, entry E."""
    out = []
    if self_id is None:
        return out
    if not SELF_BASELINE_RE.search(text):
        return out
    for baseline in comparison_baselines(text):
        m = NODE_WORKDIR_RE.search(baseline)
        if not m:
            continue
        owner = m.group(1)
        if owner == self_id:
            continue  # this node's own snapshot of its own before-state.  Fine.
        subject = snapshot_subject(baseline, text)
        if subject is None:
            continue
        out.append(("FLAG", "E1",
                    "this criterion claims an artifact is in the state it was in before THIS node "
                    "ran, and settles that against `%s` - a snapshot of `%s` held under node `%s`'s "
                    "work directory, not this node's. A baseline another node owns can be written "
                    "or mutated by that node after it is taken, so the diff measures that node's "
                    "change rather than this one's: the criterion can neither fail nor pass for the "
                    "right reason. The `P123` #12 shape (`_orch/nodes/PR13/work/routing.md`, \"One "
                    "criterion defect the linter did not catch, fixed before dispatch\"). Take the "
                    "baseline in this node's own first act and settle against that."
                    % (baseline, subject, owner)))
        break
    return out


def demanded_checks(text):
    """The numbered checks a criterion requires a success token from, in the order
    it names them.  Two forms, both authored by this run: the plural list ("checks
    1, 2, 3, 5, 6, 7 and 8 print their OK tokens") and the singular named literal
    ("check 6 prints `index.html in sync`")."""
    out = []
    for m in CHECK_LIST_RE.finditer(text):
        span = m.group(1)
        nums = []
        for a, b in CHECK_RANGE_RE.findall(span):
            nums.extend(range(int(a), int(b) + 1))
        for n in NUMBER_RE.findall(CHECK_RANGE_RE.sub(" ", span)):
            nums.append(int(n))
        for n in nums:
            if n not in out:
                out.append(n)
    for m in CHECK_TOKEN_RE.finditer(text):
        n = int(m.group(1))
        if n not in out:
            out.append(n)
    return out


def commas(nums):
    """Join numbers the way a criterion names them: "1 and 8", not "1, 8".  The
    linter quotes criteria back at their authors, so it writes the way they do."""
    s = [str(n) for n in nums]
    if len(s) < 2:
        return "".join(s)
    return ", ".join(s[:-1]) + " and " + s[-1]


def classify_check(literals):
    """'success' if the check can print one, 'failure' if every literal it prints
    is a failure line, 'unsettled' if it prints nothing or nothing classifiable."""
    if any(SUCCESS_LITERAL_RE.search(lit) for lit in literals):
        return "success"
    failures = [lit for lit in literals
                if FAILURE_LITERAL_RE.search(lit) or FAILURE_SHOUT_RE.search(lit)]
    if failures and len(failures) == len(literals):
        return "failure"
    return "unsettled"


def rule_f(num, text, handoff_text, harness):
    """A success token demanded from a check that only prints failures.  See THE
    SHAPES IT REJECTS, entry F."""
    out = []
    wanted = demanded_checks(text)
    if not wanted:
        return out
    plural = "s" if len(wanted) > 1 else ""
    scripts = [p for p in paths_in(text) if p.endswith(".sh")]
    if scripts:
        named = scripts[0]
        path = harness.resolve(named, handoff_text)
        if path is None:
            out.append(("WARN", "F2",
                        "this criterion requires check%s %s of `%s` to print a success token, and "
                        "the linter could not find that script - neither at that path nor at any "
                        "path the handoff gives for a file of that name. It could not settle "
                        "whether the check has a success token to print."
                        % (plural, commas(wanted), named)))
            return out
    else:
        # The criterion names a check but not the script it belongs to - "Check 6
        # prints `index.html in sync`".  One harness in the handoff and there is
        # nothing to guess; two and there is, so the rule declines rather than
        # picking one, and says nothing rather than warning about a criterion whose
        # instrument it never identified.
        cands = []
        for p in path_tokens(handoff_text):
            if not p.endswith(".sh"):
                continue
            ap = p if os.path.isabs(p) else os.path.join(harness.root, p)
            ap = os.path.abspath(ap)
            if os.path.isfile(ap) and ap not in cands:
                cands.append(ap)
        if len(cands) != 1:
            return out
        path = cands[0]
    parsed = harness.checks(path)
    if not parsed:
        out.append(("WARN", "F2",
                    "this criterion requires check%s %s of `%s` to print a success token, and the "
                    "linter could not read that script as a banner-structured harness (expected "
                    "`echo \"=== Check N: ... ===\"` lines), so it could not settle what any check "
                    "prints." % (plural, commas(wanted), os.path.basename(path))))
        return out
    silent, unsettled = [], []
    for n in wanted:
        if n not in parsed:
            unsettled.append((n, "the script has no check %d" % n))
            continue
        verdict = classify_check(parsed[n])
        if verdict == "failure":
            silent.append(n)
        elif verdict == "unsettled":
            unsettled.append((n, "check %d echoes nothing the linter can classify" % n))
    if silent:
        sample = []
        for n in silent:
            for lit in parsed[n][:1]:
                sample.append("check %d's `%s`" % (n, lit))
        out.append(("FLAG", "F1",
                    "this criterion requires check%s %s of `%s` to print a success token, and "
                    "%s only output lines are failures - %s. Silence IS their pass, so a clean "
                    "run prints nothing the criterion names, and the criterion is ambiguous: in "
                    "this framework's own archive two verifiers read the silence as the pass and "
                    "confirmed this sentence, and two others read it literally and called it "
                    "unsatisfiable (`_orch/verify/P111-verdict.json` row 29 against "
                    "`_orch-replay/verify/P111-verdict.json` row 29). A criterion two verifiers "
                    "settle opposite ways is a defect in the words "
                    "(`_orch-replay/inbox/Q-7.answer.md`, the `P111` #29 / `P112` #30 shape). "
                    "The repaired wording - `P121` #29, `P122` #24, `P132` #35 - names only the "
                    "checks that do print one and says of the rest that they print nothing at "
                    "all, and is not flagged."
                    % ("s" if len(silent) > 1 else "",
                       commas(silent), os.path.basename(path),
                       "their" if len(silent) > 1 else "its", "; ".join(sample))))
    for n, why in unsettled:
        out.append(("WARN", "F2",
                    "this criterion requires check %d of `%s` to print a success token, and %s, "
                    "so the linter could not settle whether that check has one to print. Name "
                    "the literal the check prints, and this warning is answered."
                    % (n, os.path.basename(path), why)))
    return out


def contrasted_outcomes(text):
    """True when the criterion requires its two states to DIFFER: an opposed pair of
    outcome words with both halves present, or an explicit claim that the contrast
    is what the criterion tests.  A sameness claim carries neither."""
    for lo, hi in OUTCOME_PAIRS:
        if lo.search(text) and hi.search(text):
            return True
    return bool(CONTRAST_CLAIM_RE.search(text))


def snapshot_operand(text):
    """The first path the criterion names whose basename carries a snapshot suffix."""
    for p in paths_in(text):
        if SNAPSHOT_SUFFIX_RE.search(os.path.basename(p)):
            return p
    return None


def contrast_subject(snapshot, text, handoff_text, root=None):
    """The artifact a snapshot is a snapshot OF: the path, named by the criterion or
    by the handoff around it, whose basename is the snapshot's basename stripped of
    its suffix.  A path that exists is preferred over one that does not, because a
    handoff often names the same basename twice - `tools/instruments.py` and
    `work/instruments.py` - and history can only be asked about the real one.  None
    when only the snapshot is named."""
    base = os.path.basename(snapshot)
    m = SNAPSHOT_SUFFIX_RE.search(base)
    if not m:
        return None
    stem = base[:m.start()]
    cands = []
    for source in (paths_in(text), path_tokens(handoff_text)):
        for p in source:
            if p != snapshot and os.path.basename(p) == stem and p not in cands:
                cands.append(p)
    if root:
        for p in cands:
            ap = p if os.path.isabs(p) else os.path.join(root, p)
            if os.path.isfile(ap):
                return p
    return cands[0] if cands else None


def rule_g(num, text, handoff_text, self_id, tracked):
    """A before/after contrast with no reachable before-state.  See THE SHAPES IT
    REJECTS, entry G."""
    out = []
    snapshot = snapshot_operand(text)
    if snapshot is None:
        return out
    if not (BEFORE_STATE_RE.search(text) and CURRENT_PARTY_RE.search(text)):
        return out
    if not contrasted_outcomes(text):
        return out  # a sameness claim against a `.pre` copy.  Settleable, and common.
    if HISTORY_INSTRUMENT_RE.search(text):
        return out  # the criterion asks history the question this rule asks.
    m = NODE_WORKDIR_RE.search(snapshot)
    if m and self_id is not None and m.group(1) != self_id:
        return out  # another node's snapshot is rule E's subject, not this one's.
    subject = contrast_subject(snapshot, text, handoff_text, tracked.root)
    if subject is None:
        out.append(("WARN", "G2",
                    "this criterion contrasts a before-state held at `%s` against the artifact as "
                    "it is now, and names no path for the artifact itself, so the linter could "
                    "not settle which file to ask history about." % snapshot))
        return out
    if node_edits(subject, handoff_text):
        return out  # the node's own edit is the after-state; the `.pre` copy is real.
    versions = tracked.history_versions(subject)
    if not versions:
        # None: git could not answer.  0: no commit touches that path at all, which
        # says as much about the path the linter resolved as about history.  Either
        # way it has not settled the question, and it says so rather than flagging.
        out.append(("WARN", "G2",
                    "this criterion contrasts `%s` before and after this node's change and settles "
                    "the before half against `%s`, a copy taken at dispatch. `git log` reports no "
                    "commit reachable for `%s`, so the linter could not settle whether a "
                    "pre-change state exists to contrast against."
                    % (subject, snapshot, subject)))
        return out
    if versions >= 2:
        return out  # a distinct earlier version is reachable.  The contrast exists.
    out.append(("FLAG", "G1",
                "this criterion requires `%s` to behave one way before this node's change and the "
                "opposite way after, and settles the before half against `%s` - a copy taken by "
                "this node's own first act, which captures whatever the artifact already is at "
                "dispatch. The handoff never tells this node to change `%s`, so that copy is the "
                "current file; the criterion never asks whether a pre-change state is reachable, "
                "and `git log --follow` reports %d commit%s touching `%s`, so no version distinct "
                "from the current one is reachable and the contrast cannot be constructed at any "
                "rung. The `P132` #31 shape as the replay met it (`_orch-replay/verify/"
                "P132-verdict.json` row 31; the decision is `_orch-replay/inbox/Q-10.answer.md`) - "
                "note the archived run settled that same row CONFIRMED because its handoff DID "
                "tell the node to change the tool, which is why this rule asks. Name the revision "
                "the before-state comes from - `git show <rev>:%s` - or tell the node to make the "
                "change, or drop the contrast."
                % (subject, snapshot, subject, versions, "" if versions == 1 else "s", subject,
                   subject)))
    return out


def node_edits(subject, handoff_text):
    """True when the handoff instructs this node to change `subject`: an edit verb
    within a short window of the path or its basename, outside the done-criteria
    themselves.  The window is generous on purpose - a handoff says "edit
    `tools/instruments.py` so that" or "in `tools/instruments.py`, add a rule" - and
    a false negative here only returns rule G to the commit count it asked before."""
    # Only the handoff's instruction sections are read - never the done-criteria,
    # whose own prose says "the change" of the very contrast this rule is judging.
    lines = handoff_text.split("\n")
    heads = [i for i, ln in enumerate(lines) if CRIT_HEAD_RE.match(ln)]
    own = [i for i in heads if "child" not in lines[i].lower()] or heads
    text = "\n".join(lines[:own[-1]]) if own else handoff_text
    base = os.path.basename(subject)
    for needle in (subject, base):
        for m in re.finditer(re.escape(needle), text):
            before = text[max(0, m.start() - 120):m.start()]
            after = text[m.end():m.end() + 40]
            # the verb must come before the path within the window, or the path
            # must be followed by an "(edited)" mark; a bare noun elsewhere is not
            # an instruction.  A verb standing behind a prohibition - "Do not edit
            # `tools/foo.py`" - is not an instruction to change it either, and
            # reading it as one would make rule I3 flag the one pairing that is
            # always correct: a criterion asserting a file unchanged inside a
            # handoff that forbids changing it.
            for v in EDIT_VERB_RE.finditer(before):
                lead = before[max(0, v.start() - 30):v.start()]
                if not PROHIBITION_RE.search(lead):
                    return True
            if POST_EDIT_RE.search(after):
                return True
    return False


def comparison_arms(text):
    """Every distinct (operator, threshold) this criterion compares against, in
    document order.  The threshold is normalised numerically so `0.8` and `.80` are
    one threshold and a percent sign stays part of it; it is None when the criterion
    names the bound by anaphora ("at or below that threshold") instead of a number,
    in which case it binds to whatever its partner names.  Two-sided forms are read
    first and a one-sided match over the same span is dropped, because "at or below"
    contains "below"."""
    def scan(forms, numeric):
        arms, spans = [], []
        for rx, op in forms:
            for m in rx.finditer(text):
                if any(m.start() < e and st < m.end() for st, e in spans):
                    continue  # "at or below" contains "below"; the wider form won
                spans.append((m.start(), m.end()))
                thresh = "%g%s" % (float(m.group(1)), m.group(2) or "") if numeric else None
                if (op, thresh) not in arms:
                    arms.append((op, thresh))
        return arms

    return scan(COMPARISON_FORMS, True) or scan(COMPARISON_ANAPHORA, False)


def refutation_claim(text):
    """True when the criterion asks a MUTATION to refute its arm.  Both halves are
    required: a mutation with nothing it flips is a step, and a flip with no
    mutation behind it is an ordinary outcome."""
    return bool(MUTATION_RE.search(text) and REFUTE_RE.search(text))


def rule_h(num, text, all_crits):
    """One mutation required to refute both arms of a complementary pair.  See THE
    SHAPES IT REJECTS, entry H."""
    out = []
    mine = comparison_arms(text)
    if len(mine) != 1:
        return out  # two arms in one criterion says nothing about which is flipped
    if not refutation_claim(text):
        return out
    op, thresh = mine[0]
    want = COMPLEMENT[op]
    for onum, otext in all_crits:
        if onum <= num:
            continue  # the pair is reported once, from the earlier of the two
        theirs = comparison_arms(otext)
        if len(theirs) != 1:
            continue
        oop, othresh = theirs[0]
        if oop != want:
            continue
        if thresh is not None and othresh is not None and thresh != othresh:
            continue
        if not refutation_claim(otext):
            continue
        shown = thresh if thresh is not None else othresh
        named = shown if shown is not None else "that threshold"
        if SAME_MUTATION_RE.search(text) or SAME_MUTATION_RE.search(otext):
            out.append(("FLAG", "H1",
                        "this criterion requires one mutation to flip an arm asserting `%s %s`, "
                        "and criterion %d of the same handoff requires that SAME mutation to flip "
                        "an arm asserting `%s %s`. Exactly one of those two holds for any value, "
                        "so no honest construction satisfies both - only a constant that crashes "
                        "both runs does. The cost is not a failed check: a positive control that "
                        "cannot be refuted by mutation proves nothing, so the anti-tautology "
                        "guarantee this pair exists to provide is vacuous and the node reads "
                        "green. Flip the two arms with two different mutations, or drop one."
                        % (op, named, onum, oop, named)))
            break
        shared = [p for p in paths_in(text) if p in paths_in(otext)]
        if not shared:
            continue  # a coincidence of thresholds across unrelated criteria
        out.append(("WARN", "H2",
                    "this criterion requires a mutation to flip an arm asserting `%s %s`, and "
                    "criterion %d of the same handoff requires a mutation to flip an arm "
                    "asserting the exact complement, `%s %s`, over a path both name (`%s`). The "
                    "linter could not settle from either text whether the two mutations are the "
                    "same one. If they are, no execution satisfies both and rule H1 applies; if "
                    "they are two different mutations the pair is the ordinary positive control "
                    "and is fine. Say which, and this warning is answered."
                    % (op, named, onum, oop, named, shared[0])))
        break
    return out


def rule_i(num, text, handoff_text, self_id, graph, handoff_path):
    """A precondition the run's own sequencing forbids.  See THE SHAPES IT REJECTS,
    entry I."""
    out = []
    # I1 / I2 - an artifact under a node the plan places after this one
    nodes = graph.nodes_for(handoff_path) if graph is not None else None
    if nodes and self_id is not None and self_id in nodes:
        down = graph.downstream(nodes, self_id)
        forbidden = forbidden_baselines(text)
        for p in paths_in(text):
            if p in forbidden:
                continue
            m = NODE_ANY_DIR_RE.search(p)
            if not m:
                continue
            other = m.group(1)
            if other == self_id:
                continue
            if other in down:
                out.append(("FLAG", "I1",
                            "this criterion depends on `%s`, an artifact under node `%s`'s work "
                            "directory, and `plan/graph.yaml` places `%s` strictly AFTER this "
                            "node: `%s` reaches this node through its `needs` chain. At the "
                            "moment this node is verified that artifact does not exist, and no "
                            "execution of this node can make it exist, so the criterion cannot "
                            "be evaluated at the point it is checked. Read an artifact this "
                            "node's own work produces, or move the criterion to `%s`."
                            % (p, other, other, other, other)))
                break
            if other not in nodes:
                out.append(("WARN", "I2",
                            "this criterion depends on `%s`, under a node `%s` that "
                            "`plan/graph.yaml` does not contain, though it does contain this "
                            "node. The linter could not settle whether `%s` runs before this "
                            "node, after it, or at all, so it could not settle whether that "
                            "artifact exists when this criterion is checked."
                            % (p, other, other)))
                break
    # I3 - an artifact asserted unchanged that this handoff tells this node to rewrite
    if (UNCHANGED_CLAIM_RE.search(text) and not EXCEPTION_RE.search(text)
            and not REGION_SCOPE_RE.search(text) and not RANGE_EXTRACTOR_RE.search(text)):
        for p in paths_in(text):
            if SNAPSHOT_SUFFIX_RE.search(os.path.basename(p)):
                continue  # the snapshot is the baseline, not the subject
            if not node_edits(p, handoff_text):
                continue
            out.append(("FLAG", "I3",
                        "this criterion asserts `%s` is unchanged, and the same handoff's own "
                        "instructions tell this node to change `%s`. The criterion's precondition "
                        "is that the file still holds the state it had at dispatch; the handoff's "
                        "steps destroy that state before the criterion is ever read, so no node "
                        "that obeys the handoff can satisfy it. This is the `P120` #14 "
                        "contradiction from the other side - D2 reads a criterion against a "
                        "sibling criterion, and this reads one against the instructions, which is "
                        "where a criterion authored mid-flight contradicts itself, because at "
                        "that moment there is no sibling criterion yet. Name the change the "
                        "criterion expects (\"byte-identical other than ...\"), scope the claim to "
                        "a region the node does not touch, or assert the sameness of something "
                        "this node is not told to rewrite." % (p, p)))
            break
    return out

# ---------------------------------------------------------------------------
# driver
# ---------------------------------------------------------------------------

USAGE = ("usage: python3 tools/lint-criteria.py <handoff.md> [<handoff.md> ...]\n"
         "       python3 tools/lint-criteria.py --selftest\n")


def repo_root(start):
    d = os.path.abspath(os.path.dirname(start) or ".")
    while True:
        if os.path.isdir(os.path.join(d, ".git")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return os.path.abspath(".")
        d = parent


def lint_file(path, tracked, harness, graph, out):
    try:
        fh = open(path, "r")
        try:
            text = fh.read()
        finally:
            fh.close()
    except (IOError, OSError) as exc:
        out.append("ERROR %s: cannot read (%s)" % (path, exc.strerror or "unreadable"))
        return None
    crits, whole = parse_handoff(text)
    self_id = self_node_id(path, text)
    out.append("== %s" % path)
    if not crits:
        out.append("   WARN  -  no done-criteria section found; the linter could not settle "
                   "which lines of this file are criteria. Expected a heading matching "
                   "'## Done-criteria'.")
        out.append("   criteria: 0  flags: 0  warnings: 1")
        return (0, 1)
    flags = warns = 0
    for num, ctext in crits:
        findings = []
        findings += rule_a(num, ctext, tracked)
        findings += rule_b(num, ctext)
        findings += rule_c(num, ctext)
        findings += rule_d(num, ctext, crits, whole)
        findings += rule_e(num, ctext, self_id)
        findings += rule_f(num, ctext, whole, harness)
        findings += rule_g(num, ctext, whole, self_id, tracked)
        findings += rule_h(num, ctext, crits)
        findings += rule_i(num, ctext, whole, self_id, graph, path)
        for level, rule, msg in findings:
            if level == "FLAG":
                flags += 1
            else:
                warns += 1
            out.append("   %-4s #%-3d [%s] %s" % (level, num, rule, msg))
    out.append("   criteria: %d  flags: %d  warnings: %d" % (len(crits), flags, warns))
    return (flags, warns)


# the harness the F fixtures are linted against.  Check 1 can only print a failure,
# check 2 and check 3 each carry a success token, check 4 delegates and echoes
# nothing of its own - the four cases rule F has to tell apart, in the shape the
# real `_orch/nodes/P11/work/acceptance.sh` has.
SELFTEST_HARNESS = """#!/bin/sh
echo "=== Check 1: every vendored file sets all four keys ==="
# a comment quoting `echo "OK"` must not read as an echo
for f in a b; do
  grep -q x "$f" || echo "MISSING $k: $f"
done

echo "=== Check 2: no override sections survived the cut ==="
grep -l '^## In ' *.md || echo "OK: no override sections"

echo "=== Check 3: the page is not stale ==="
diff -q a b >/dev/null && echo "index.html in sync" || echo "PAGE STALE"

echo "=== Check 4: every tag resolves ==="
sh tools/delegated.sh

echo "=== Check 5: every card has a domain ==="
for f in a b; do
  grep -q domain "$f" || echo "MISSING domain: $f"
done
ok "check 5"

echo "=== Check 6: the router embeds ==="
diff -q a b >/dev/null && printf 'OK: router embedded\\n' || echo "ROUTER STALE"

echo "=== Check 7: the page matches its source ==="
diff -q a b >/dev/null && echo "no differences found"

echo "=== AIX check (not one of the numbered checks) ==="
echo "AIX LEVEL 1 OK"
"""
# the helper is defined before any banner, the way a real harness defines it
SELFTEST_HARNESS = 'ok() { echo "OK: $1"; }\n' + SELFTEST_HARNESS

SELFTEST_HANDOFF = """# HANDOFF - X1

## Steps

1. Run `sh tools/harness.sh` and paste all of it into `work/invariant.txt`.
2. `cp tools/prober.py _orch/nodes/X1/work/prober.py.pre`
3. `cp tools/twice.py _orch/nodes/X1/work/twice.py.pre`

## Done-criteria

1. %s
"""

# the same handoff for a node that is told to change the artifact - the ordinary
# case, in which the `.pre` copy is a real before-state whatever history holds.
SELFTEST_HANDOFF_EDIT = SELFTEST_HANDOFF.replace(
    "## Done-criteria",
    "4. Edit `tools/prober.py` so the gate refuses a pure re-reviewer.\n\n## Done-criteria")

# a fan-out handoff: the child section comes first and the node's own last
SELFTEST_HANDOFF_FANOUT = """# HANDOFF - X2

## Child done-criteria - each child is judged on these

1. The child wrote its file.
2. The child changed nothing else.

## Done-criteria for this node

1. %s
2. Every child closed.
3. The roll-up ran.
"""


# a two-criterion handoff, because rule H reads a PAIR: the arithmetic
# contradiction lives between two criteria, never inside one.
SELFTEST_HANDOFF_PAIR = """# HANDOFF - X3

## Steps

1. Run `python3 tools/gate.py` and paste every line into `work/gate.txt`.

## Done-criteria

1. %s
2. %s
"""

# a handoff that FORBIDS the edit.  "Do not edit `tools/prober.py`" is not an
# instruction to change it, and rule I3 must not read it as one: a criterion
# asserting a file unchanged inside a handoff that forbids changing it is the one
# pairing that is always correct.
SELFTEST_HANDOFF_FORBID = SELFTEST_HANDOFF.replace(
    "## Done-criteria",
    "4. Do not edit `tools/prober.py`; it is an input and nothing else.\n\n## Done-criteria")

# a handoff at its §6 address, so `plan/graph.yaml` sits two directories above it
# and `self_node_id` reads `N1` off the path rather than off a heading.
SELFTEST_HANDOFF_GRAPH = """# HANDOFF - N1

## Steps

1. Write `_orch/nodes/N1/work/out.txt`.

## Done-criteria

1. %s
"""

# `N2` needs `N1` and `N3` needs `N2`, so both are strictly after this node - `N3`
# only transitively, which is why the rule closes the edge rather than reading one
# hop.  `N0` is upstream.  `Z9` only INFORMS `N1`: a soft edge orders nothing, so
# reading `Z9`'s work directory is not a defect.  Both YAML spellings of a list
# appear, because the parser has to read the one the plan happens to use.
SELFTEST_GRAPH = """- id: N0
  kind: task
  needs: []
  handoff: _orch/nodes/N0/handoff.md
- id: N1
  kind: task
  needs: [N0]            # hard edge
  handoff: _orch/nodes/N1/handoff.md
- id: N2
  kind: task
  needs:
    - N1
  handoff: _orch/nodes/N2/handoff.md
- id: N3
  kind: task
  needs: [N2]
  handoff: _orch/nodes/N3/handoff.md
- id: Z9
  kind: task
  needs: []
  informs: [N1]
  handoff: _orch/nodes/Z9/handoff.md
"""


def selftest():
    """Prove each new rule FLAGS its known-bad fixture and stays SILENT on the
    repaired wording beside it.  A rule that cannot fail is not a rule; a rule that
    fires on the repair is worse than no rule, because it teaches authors to route
    around the linter.  Every fixture below is inline and every file it touches is
    inside a temporary tree: nothing under `_orch/` is read, and nothing anywhere is
    written outside that tree, which is removed before this returns."""
    import shutil, tempfile

    tmp = tempfile.mkdtemp()
    try:
        os.makedirs(os.path.join(tmp, "tools"))
        os.makedirs(os.path.join(tmp, "node"))
        def write(rel, body):
            fh = open(os.path.join(tmp, rel), "w")
            try:
                fh.write(body)
            finally:
                fh.close()

        write("tools/harness.sh", SELFTEST_HARNESS)

        def git(*args):
            p = subprocess.Popen(["git", "-c", "user.name=selftest",
                                  "-c", "user.email=selftest@localhost"] + list(args),
                                 cwd=tmp, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            p.communicate()
            return p.returncode

        # `prober.py` gets one commit - the shape `tools/instruments.py` has in the
        # tree `P132` ran against.  `twice.py` gets two, so a pre-change version of
        # it IS reachable and rule G must leave the same sentence alone.
        git("init", "-q")
        write("tools/prober.py", "gate = 'allow'\n")
        write("tools/twice.py", "gate = 'refuse'\n")
        git("add", "-A")
        git("commit", "-q", "-m", "first")
        write("tools/twice.py", "gate = 'allow'\n")
        git("add", "-A")
        git("commit", "-q", "-m", "second")

        # the plan the graph-reading half of rule I is settled against, at the §6
        # address: `<orch>/plan/graph.yaml`, with the handoff at `<orch>/nodes/<id>/`.
        os.makedirs(os.path.join(tmp, "_orch", "plan"))
        os.makedirs(os.path.join(tmp, "_orch", "nodes", "N1"))
        write("_orch/plan/graph.yaml", SELFTEST_GRAPH)

        tracked, harness, graph = Tracked(tmp), Harness(tmp), Graph(tmp)
        hp = os.path.join(tmp, "node", "handoff.md")
        gp = os.path.join(tmp, "_orch", "nodes", "N1", "handoff.md")

        def lint(criterion, letter, template=None):
            write("node/handoff.md", (template or SELFTEST_HANDOFF) % criterion)
            out = []
            lint_file(hp, tracked, harness, graph, out)
            return [ln for ln in out if "[%s" % letter in ln]

        def lint_pair(first, second, letter):
            """Rule H reads two criteria of one handoff, so its fixtures are pairs."""
            write("node/handoff.md", SELFTEST_HANDOFF_PAIR % (first, second))
            out = []
            lint_file(hp, tracked, harness, graph, out)
            return [ln for ln in out if "[%s" % letter in ln]

        def lint_graph(criterion, letter):
            """The same lint from inside a run that has a plan, so rule I1 can ask it."""
            write("_orch/nodes/N1/handoff.md", SELFTEST_HANDOFF_GRAPH % criterion)
            out = []
            lint_file(gp, tracked, harness, graph, out)
            return [ln for ln in out if "[%s" % letter in ln]

        def has(lines, tag):
            return any("[%s]" % tag in ln for ln in lines)

        cases = []

        # --- rule F ------------------------------------------------------------
        bad_f = ("`work/invariant.txt` contains a full `harness.sh` run in which checks "
                 "1, 2 and 3 print their OK tokens, and the run ends `AIX LEVEL 1 OK`.")
        good_f = ("`work/invariant.txt` contains a full `harness.sh` run in which checks "
                  "2 and 3 print their OK tokens, check 1 prints nothing at all (its pass "
                  "condition), and the run ends `AIX LEVEL 1 OK`.")
        literal_f = ("`work/invariant.txt` contains a full `harness.sh` run with check 3 "
                     "printing `index.html in sync`.")
        delegated_f = ("`work/invariant.txt` contains a full `harness.sh` run in which "
                       "checks 2 and 4 print their OK tokens.")
        missing_f = ("`work/invariant.txt` contains a full `nowhere.sh` run in which "
                     "checks 1 and 2 print their OK tokens.")
        f1 = lint(bad_f, "F")
        cases.append(("F flags the check whose only output lines are failures", has(f1, "F1")))
        cases.append(("F names check 1 and not checks 2 or 3",
                      any("check 1 of" in ln and "checks 2" not in ln for ln in f1)))
        cases.append(("F is silent on the repaired wording, which names only checks that print one",
                      not lint(good_f, "F")))
        cases.append(("F is silent when the named literal is one the check prints",
                      not lint(literal_f, "F")))
        d = lint(delegated_f, "F")
        cases.append(("F warns, never flags, on a check that echoes nothing classifiable",
                      has(d, "F2") and not has(d, "F1")))
        m = lint(missing_f, "F")
        cases.append(("F warns, never flags, when the script cannot be found",
                      has(m, "F2") and not has(m, "F1")))
        cases.append(("F resolves the handoff's only harness when the criterion names none",
                      has(lint("Check 1 prints its OK token.", "F"), "F1")))
        cases.append(("F is silent on that same form when the check does print one",
                      not lint("Check 3 prints `index.html in sync`.", "F")))
        # the forms that were silent or wrong before the 2026-09-06 review
        cases.append(("F reads a range: 'checks 1-3'",
                      has(lint("`work/invariant.txt` contains a full `harness.sh` run in which "
                               "checks 1-3 print their OK tokens.", "F"), "F1")))
        cases.append(("F reads the script named inline: 'checks 1 and 2 of `tools/harness.sh`'",
                      has(lint("`work/invariant.txt` shows checks 1 and 2 of `tools/harness.sh` "
                               "print their OK tokens.", "F"), "F1")))
        cases.append(("F reads 'check 1 and check 2 each report their OK line'",
                      has(lint("`work/invariant.txt` contains a full `harness.sh` run in which "
                               "check 1 and check 2 each report their OK line.", "F"), "F1")))
        cases.append(("F is silent when a helper function prints the success token",
                      not lint("`work/invariant.txt` contains a full `harness.sh` run in which "
                               "checks 2 and 5 print their OK tokens.", "F")))
        cases.append(("F is silent when the success token comes from printf",
                      not lint("`work/invariant.txt` contains a full `harness.sh` run in which "
                               "checks 2 and 6 print their OK tokens.", "F")))
        cases.append(("F reads a negated failure noun as a success message",
                      not lint("`work/invariant.txt` contains a full `harness.sh` run in which "
                               "checks 2 and 7 print their OK tokens.", "F")))
        cases.append(("the parser lints the node's own criteria, not a fan-out's child section",
                      len(parse_handoff(SELFTEST_HANDOFF_FANOUT % "x")[0]) == 3))

        # --- rule G ------------------------------------------------------------
        bad_g = ("The fixture is refused by the unmodified tool preserved at "
                 "`work/prober.py.pre` and allowed by the current tool, so the fixture "
                 "genuinely tests the change, settled by pasting both runs into "
                 "`work/fixture-proof.md`.")
        reachable_g = bad_g.replace("prober.py.pre", "twice.py.pre")
        sameness_g = ("The comparison rule is unchanged, settled by quoting the function out "
                      "of the current file and out of `work/prober.py.pre` and reading the two "
                      "side by side.")
        history_g = (bad_g[:-1] + ", and `git show HEAD~1:tools/prober.py` is the revision the "
                     "before-state is taken from.")
        cases.append(("G flags a before/after contrast whose before-state is not reachable",
                      has(lint(bad_g, "G"), "G1")))
        cases.append(("G is silent when a distinct earlier version IS reachable",
                      not lint(reachable_g, "G")))
        cases.append(("G is silent on a sameness claim against the same `.pre` copy",
                      not lint(sameness_g, "G")))
        cases.append(("G is silent when the criterion names the revision it compares against",
                      not lint(history_g, "G")))
        cases.append(("G is silent when the handoff tells the node to change the artifact",
                      not lint(bad_g, "G", SELFTEST_HANDOFF_EDIT)))

        # --- rule H ------------------------------------------------------------
        above_h = ("The positive control holds: mutating `tools/gate.py` so the reviewer "
                   "count is reported as a constant flips the arm asserting the score is "
                   "above 0.8 from pass to fail, pasted into `work/gate.txt`.")
        same_below_h = ("That same mutation flips the arm asserting the score is at or "
                        "below 0.8 from pass to fail, pasted into `work/gate.txt`.")
        other_below_h = ("Mutating `tools/gate.py` so the reviewer count is reported as zero "
                         "flips the arm asserting the score is at or below 0.8 from pass to "
                         "fail, pasted into `work/gate.txt`.")
        anaphoric_h = ("That same mutation flips the arm asserting the score is at or below "
                       "that threshold from pass to fail, pasted into `work/gate.txt`.")
        far_below_h = same_below_h.replace("0.8", "0.9")
        unrelated_h = ("Mutating `tools/latency.py` so the timer is reported as a constant "
                       "flips the arm asserting the latency is at or below 0.8 from pass to "
                       "fail, pasted into `work/other.txt`.")
        both_arms_h = ("The positive control holds: mutating `tools/gate.py` flips the arm "
                       "asserting the score is above 0.8 while the arm asserting it is at or "
                       "below 0.8 is unaffected, pasted into `work/gate.txt`.")
        no_mutation_h = ("`work/gate.txt` records the score as at or below 0.8 for the "
                         "fixture, quoted from `tools/gate.py`'s own output.")
        h1 = lint_pair(above_h, same_below_h, "H")
        cases.append(("H flags one mutation asked to refute both arms of a complementary pair",
                      has(h1, "H1")))
        cases.append(("H reports the pair once, from the earlier criterion", len(h1) == 1))
        cases.append(("H binds a threshold named by anaphora to the one its partner names",
                      has(lint_pair(above_h, anaphoric_h, "H"), "H1")))
        cases.append(("H reads `> 0.8` and `<= 0.8` in their symbolic spelling too",
                      has(lint_pair(
                          "Mutating `tools/gate.py` flips the `> 0.8` arm from pass to fail.",
                          "That same mutation flips the `<= 0.8` arm from pass to fail.",
                          "H"), "H1")))
        two = lint_pair(above_h, other_below_h, "H")
        cases.append(("H warns, never flags, when the two mutations are not said to be the same",
                      has(two, "H2") and not has(two, "H1")))
        cases.append(("H is silent when the complementary arms sit on different thresholds",
                      not lint_pair(above_h, far_below_h, "H")))
        cases.append(("H does not even warn when two unattributed mutations share no path, "
                      "so the arms are not shown to measure one thing",
                      not lint_pair(above_h, unrelated_h, "H")))
        cases.append(("H is silent on a criterion that names both arms, which says nothing "
                      "about which one the mutation flips",
                      not lint_pair(both_arms_h, same_below_h, "H")))
        cases.append(("H is silent when no mutation is asked to refute anything",
                      not lint_pair(no_mutation_h,
                                    "`work/gate.txt` records the score as above 0.8.", "H")))
        cases.append(("H is silent on the same two arms flipped by two mutations in one "
                      "direction, which is the ordinary positive control",
                      not lint_pair(above_h, above_h, "H")))

        # --- rule I ------------------------------------------------------------
        down_i = ("`work/out.txt` agrees line for line with "
                  "`_orch/nodes/N2/work/summary.txt`, pasted into `work/proof.md`.")
        deep_i = down_i.replace("N2", "N3")
        up_i = down_i.replace("N2", "N0")
        own_i = down_i.replace("N2", "N1")
        soft_i = down_i.replace("N2", "Z9")
        absent_i = down_i.replace("N2", "N7")
        ruled_out_i = ("`work/out.txt` agrees line for line with `work/own-copy.txt` - not "
                       "against `_orch/nodes/N2/work/summary.txt`, which is the wrong copy - "
                       "pasted into `work/proof.md`.")
        cases.append(("I flags a criterion depending on a node the plan places after this one",
                      has(lint_graph(down_i, "I"), "I1")))
        cases.append(("I closes the `needs` chain rather than reading one hop",
                      has(lint_graph(deep_i, "I"), "I1")))
        cases.append(("I is silent on an upstream node's finished artifact, the `P124` #27 read",
                      not lint_graph(up_i, "I")))
        cases.append(("I is silent on this node's own work directory", not lint_graph(own_i, "I")))
        cases.append(("I is silent on a soft `informs` edge, which orders nothing",
                      not lint_graph(soft_i, "I")))
        cases.append(("I is silent on a downstream path the criterion names only to rule out",
                      not lint_graph(ruled_out_i, "I")))
        a = lint_graph(absent_i, "I")
        cases.append(("I warns, never flags, on a node the plan does not contain",
                      has(a, "I2") and not has(a, "I1")))
        cases.append(("I is silent about ordering when there is no plan above the handoff",
                      not lint(down_i, "I")))

        bad_i3 = "`tools/prober.py` is byte-identical to `work/prober.py.pre`, settled by `cmp`."
        carve_i3 = ("`tools/prober.py` is byte-identical to `work/prober.py.pre` other than "
                    "the gate clause this node adds, settled by `diff`.")
        region_i3 = ("The header region of `tools/prober.py` is byte-identical to "
                     "`work/prober.py.pre`, settled by `cmp`.")
        cases.append(("I flags a sameness claim about an artifact the handoff tells this "
                      "node to rewrite",
                      has(lint(bad_i3, "I", SELFTEST_HANDOFF_EDIT), "I3")))
        cases.append(("I is silent when the criterion names the change it expects",
                      not lint(carve_i3, "I", SELFTEST_HANDOFF_EDIT)))
        cases.append(("I is silent when the sameness is scoped to a region the node can leave alone",
                      not lint(region_i3, "I", SELFTEST_HANDOFF_EDIT)))
        cases.append(("I is silent when the handoff never tells this node to change the artifact",
                      not lint(bad_i3, "I")))
        cases.append(("I is silent when the handoff FORBIDS the edit, the one pairing "
                      "that is always correct",
                      not lint(bad_i3, "I", SELFTEST_HANDOFF_FORBID)))
        cases.append(("I reads a predicative claim only - rule G's own known-bad calls a "
                      "snapshot `unmodified` and must not trip it",
                      not lint(bad_g, "I", SELFTEST_HANDOFF_EDIT)))
        cases.append(("the graph parser declines a plan whose entries do not open with `id`",
                      parse_graph("- kind: task\\n  id: N1\\n  needs: [N0]\\n") is None))
        cases.append(("the graph parser reads both YAML spellings of `needs`",
                      parse_graph(SELFTEST_GRAPH)["N1"] == set(["N0"])
                      and parse_graph(SELFTEST_GRAPH)["N2"] == set(["N1"])))

        # --- no clock, no state -------------------------------------------------
        cases.append(("two runs over one unchanged fixture are byte-identical",
                      lint(bad_f, "F") == lint(bad_f, "F")))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("Each case below states what the linter must do. A rule that cannot flag its "
          "known-bad\nfixture is not a rule; a rule that flags the repair is worse than no "
          "rule.\n")
    bad = 0
    for label, ok in cases:
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
        if not ok:
            bad += 1
    print("\n%d/%d cases hold." % (len(cases) - bad, len(cases)))
    return 1 if bad else 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        sys.stderr.write(USAGE)
        return 2 if len(argv) < 2 else 0
    root = repo_root(argv[1])
    tracked = Tracked(root)
    harness = Harness(root)
    graph = Graph(root)
    out = []
    total_flags = 0
    bad_input = False
    for path in argv[1:]:
        res = lint_file(path, tracked, harness, graph, out)
        if res is None:
            bad_input = True
        else:
            total_flags += res[0]
    sys.stdout.write("\n".join(out) + "\n")
    if bad_input:
        return 2
    return 1 if total_flags else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
