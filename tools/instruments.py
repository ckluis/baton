#!/usr/bin/env python3
"""baton instrument scorecard - scores the instruments, not just the agents.

    python3 tools/instruments.py            # run from the repo root
    python3 tools/instruments.py <root>     # or point it at another corpus root

It reads the Instrument records (`*.instrument.md`) plus `_orch/verify/`,
`_orch/inbox/`, `_orch/nodes/` and `_orch/phases/`, and writes exactly two files,
both under `_orch/instruments/`:

    _orch/instruments/instruments.json   the machine view, five named sections
    _orch/instruments/summary.md         the human view, 60 lines or fewer

The five sections, one each in both outputs:

    1. `yield_per_instrument`         defects caught, re-verifications caused,
                                      last time it fired
    2. `productive_defective_split`   per REFUTED verdict: did the fix change the
                                      product, or change the test?
    3. `wake_list`                    dormant instruments whose revival trigger
                                      has fired, GROUPED BY `dormant_because`
    4. `never_woken_findings`         dormant and not woken in N runs - a FINDING,
                                      never a status (a wrong `guards` edge would
                                      otherwise hide a check forever)
    5. `promotion_eligibility`        fixture rejected AND the promoter is not the
                                      author or last repairer; `unsound` and
                                      `unsettleable` always need a human

DERIVED, NEVER AUTHORITATIVE.  Everything here is recomputed from files on every
run.  `_orch/instruments/` is a cache and nothing else:
DELETING `_orch/instruments/` LOSES NOTHING.
The next run rebuilds it byte for byte.  The Instrument records and
the files under `_orch/` stay the source of truth (CONTRACT §6).  This tool
writes only `_orch/instruments/` and nowhere else, ever - not a record, not a
`status.json`, not a verdict, not the ledger.  A tool that mutates run state
while scoring it is a liability.

WRONG ANSWERS MUST FAIL TOWARD RE-VERIFICATION, NEVER TOWARD A FALSE PASS.
Anywhere this tool cannot determine something - the product/test split for a
`REFUTED` it cannot trace, an Instrument record it cannot parse, a `guards`
target that resolves to nothing, an authorship chain it cannot settle - it emits
the string `unknown` PLUS a finding, and counts the row as
needs-re-verification.  It NEVER emits `eligible for promotion`, `active`,
`productive` or `healthy` on absent evidence.  A false alarm is the correct
direction of error for a lifecycle rule; a false pass is not.  Concretely:
`health` is `healthy` only for a record that parses, carries a status in the
enum, has a `dormant_because` consistent with that status, has a `guards` edge
that resolves to at least one real file, and has NO finding attached to it.
`promotion.eligible` is `true` only when every one of its named gates is
`true`; a single `unknown` gate makes it `unknown`, never `true`.

THE PRODUCTIVE/DEFECTIVE SPLIT - THE RULE, STATED.  This is the one genuinely
heuristic computation here, so the rule is stated rather than implied, and every
row publishes its evidence base rather than a bare verdict.  For each `REFUTED`
criterion row in a verdict file, the tool finds that node's SUCCESSOR verdict -
the next file in the same node's verdict lineage (`<node>-verdict-<n>.json` in
ascending `<n>`; for a `<node>-verdict.superseded-by-<x>.json` the successor is
the live lineage head) - and compares the same row:

    (1) successor row exists and its CRITERION TEXT DIFFERS
            -> `test-changing`.  The measurement was rewritten.  The instrument
               refuted, and what moved was the instrument.
    (2) successor row exists, criterion text IDENTICAL, verdict now `CONFIRMED`
            -> `product-changing`.  The measurement held still and the artefact
               under test moved to satisfy it.
    (3) no successor row, but the corpus DECLARES the criterion the defect -
        the row's own `probe`/`attack`/`evidence` text, or an `_orch/inbox/Q-*.md`
        whose `Blocks:` line names this node, contains one of the literal phrases
        `unsettleable`, `unsatisfiable`, `cannot be satisfied`, `the criterion is
        the defect`
            -> `test-changing (declared)`.  The recorded disposition is that the
               criterion must be rewritten, not the artefact.
    (4) anything else - no successor, no declaration, or a successor that is
        still `REFUTED`
            -> `unknown`, plus a finding, counted as needs-re-verification.

A single-claim verdict (CONTRACT §9.1, no `criteria` list) is handled the same
way with its `claim` field standing in for the criterion text.  The rule's known
limit, stated because an unstated limit is the failure this whole design exists
to correct: "the artefact under test moved" is inferred from the criterion
holding still, NOT from watching a diff.  A node that satisfied a criterion by
weakening a work product rather than fixing it would read as `product-changing`
here.  The rule sees what the corpus records, and the corpus records verdicts,
not diffs.

THE `attack` FIELD IS OPTIONAL.  CONTRACT §9.1 gained an optional `attack` key.
A verdict row that carries one and a verdict row that does not are BOTH
well-formed; neither is a finding.  When present, `attack` is read as evidence
for signal (3) above and nowhere else.

`dormant_because` IS A STRICT ENUM.  A record whose `dormant_because` is absent
while `status: dormant`, misspelled, or outside the five values
(`never-fired`, `unsound`, `unsettleable`, `low-yield-high-cost`, `superseded`)
is a FINDING, not a silently-skipped row.  Free text there degrades the whole
design into a comment.

NO CLOCK.  No field is a wall-clock reading.  Every count that looks temporal -
"runs", "last fired" - is derived from the corpus itself (`_orch/phases/`
directories, node work artefacts), so two runs over an unchanged corpus are
byte-identical under `cmp`.

NEVER CRASHES.  A truncated verdict, an absent `status.json`, a node directory
holding only `started_at`, a record whose frontmatter is not parseable at all,
a `guards` edge pointing at nothing - each is a row in `findings`, never a
traceback.  The script exits 0 on a corpus it cannot fully parse, because a
partial scorecard that names what it could not read is worth more than an error.

THE AUTHORSHIP-BAR IDENTITY RULE, STATED.  `promoted.by`, `generated.by` and
`verified[].by` name identities in two disjoint schemes this run never unifies:
`agent:<name>` (the model that produced a record) and `node:<id>` (the graph
node that acted on it).  The rule: split each identity on its first `:` into
(scheme, value).  Two identities are compared ONLY when their schemes are
equal; then they match iff their values are equal, byte for byte.  A missing
colon, or two identities in different schemes, is UNCOMPARABLE, and the
comparison contributes `unknown` - never `true`, never `false` - so a
same-spelled value that crossed schemes (an `agent:` value that happens to
spell a `node:` id) can never read as a match.

THE RECORDED PARTIES.  The schema now carries a `repaired:` field (added
2026-08-31 by `P132`; see `docs/designs/instrument-lifecycle.md`'s *AIX
Encoding* section for why) - a list of the parties that REPAIRED this
record, same `by:`/`at:` shape as `verified:` and `generated:`.  What the
promoter is compared against is: `generated.by` (the record's author) and
EVERY entry of `repaired:`, in list order - NOT `verified:`.  `verified:`
names every party that re-reviewed the record, a repairer and a purely
independent re-reviewer alike, and disk could not tell those two roles apart
from `verified:` alone; `repaired:` exists precisely so a record can say
which of them repaired something.  A promoter who re-reviewed but did not
repair - named in `verified:`, absent from `repaired:` - no longer collides
with this bar.  Comparing only the last `repaired:` entry would repeat the
exact bug proved wrong when this rule still compared only the last
`verified:` entry: a genuine repairer displaced from the last slot by a
later entry would clear the bar (fixture
`_orch/nodes/P122/work/fixture-repairer-displaced/`, and its
`repaired:`-shaped equivalent at
`_orch/nodes/P132/work/fixtures/repairer-displaced/`).  So every `repaired:`
entry is compared, in list order, not merely the last one.  Since operator
decision 3 treats "the repairer" and a later independent reviewer as
distinct roles, that history is the expected shape, not a corner case.
Where `repaired:` is absent and no author is recorded there are no recorded
parties to collide with, so the gate settles `true` by absence of any party
- UNLESS one of the three cases in the two sections immediately below
applies: an unreadable `repaired:`, an unreadable `verified:` under an
absent `repaired:`, or an undeclared history the promoter re-reviewed.

READING A PARTY LIST - THREE STATES, NOT TWO.  `read_party_list` classifies
`verified:` and `repaired:` alike as ABSENT (no such key), DECLARED (a list
every one of whose items is a mapping carrying a non-empty `by:`), or
MALFORMED (the key is present and its value is anything else - a mapping
written directly under the key, a scalar, `null`, or a list holding an item
that is not a mapping or carries no `by:`).  The third state is the point.
Reading the field only when it `isinstance(..., list)` and deciding WHETHER
THE RECORD DECLARED ANYTHING from the key's mere presence collapses
MALFORMED into DECLARED-AND-EMPTY: a mapping written under `repaired:`
yields zero repairers while still counting as a declared history, the
undeclared branch is skipped, and a promoter named only in `verified:`
clears the gate `true` - a pass earned from evidence that is present and
broken.  `repaired:` is the ONLY refusable list this bar has left, so a
shape that silently empties it silently empties the gate.  MALFORMED
therefore reads `unknown` plus an `authorship-bar-undecidable` finding
naming the shape actually read: the record said something about who repaired
it, this dialect cannot read what, and a party hidden in that unreadable
value may be the promoter.  This holds however the promoter compares against
the parties that COULD be read - only an outright collision (`false`)
outranks it, because `false` refuses harder than `unknown` does.

The same read is applied to `verified:`, and for the same reason.  The
undeclared-history case below reads `verified:` to find out whether the
promoter re-reviewed the record; a `verified:` written as a mapping empties
that check just as silently, and a promoter named there - broken shape and
all - would clear a record that declares no `repaired:` history at all.  So
a record with NO `repaired:` key and a MALFORMED `verified:` also reads
`unknown` plus a finding.  Where `repaired:` is DECLARED the shape of
`verified:` does not matter to this bar: the record has said, readably, who
repaired it, and that settles the question `verified:` was only being
consulted about.

One deliberate over-refusal falls out of all this: this frontmatter dialect
has no flow sequences, so `repaired: []` is read as the string `"[]"` and
lands in MALFORMED rather than in DECLARED-with-no-entries.  An empty
declared history is not expressible here and reads `unknown`.  That is the
safe direction - a record is told its shape is unreadable instead of being
passed on it - and it is fixed by declaring the history in the block-list
shape the *AIX Encoding* section documents, not by loosening this reader.

THE CASE THE NEW FIELD MAKES POSSIBLE - AN UNDECLARED HISTORY.  A record can
carry `verified:` entries while carrying no `repaired:` key at all: it has
simply never declared which, if any, of its reviewers were repairers.  When
the promoter matches such a `verified:`-only entry and the record's
frontmatter has no `repaired:` key at all, that entry may or may not be a
repairer - disk does not say which, because the record never said.  This
rule does NOT read it as a collision (`repaired:`, which this record does
not have, is what the bar is scoped to) and it does NOT read it as a clean
pass either: the gate reads `unknown`, plus an `authorship-bar-undecidable`
finding, never `true` - a `true` here would be exactly the false pass this
whole design exists to refuse.  Only a record whose `repaired:` is DECLARED
in the sense above - a readable list of entries, even one that does not name
the promoter - has declared its history; a `verified:`-only match against
such a record passes cleanly, because the record itself says, readably, that
this party was not a repairer.  MERE PRESENCE OF THE KEY IS NOT A
DECLARATION.

WHAT THIS RULE CAN AND CANNOT SETTLE.  It can settle a collision with any
party the record itself records, readably, as author or repairer, and it now
also settles the undeclared-history shape and both malformed-party-list
shapes above as `unknown` rather than passing them on missing or broken
evidence.  It CANNOT see a party that acted on the record without being
recorded in `generated:` or `verified:` at all - such a promoter clears this
gate.  That is the one remaining direction in which this gate can pass
something it should refuse, and it is closed only by a record that names its
own history honestly, not by this code.

`promoter_not_author_or_repairer` is `false` the moment ANY recorded party -
the author, or a readable `repaired:` entry - resolves `true` (a same-scheme
identity match, naming which party in the finding); it is `unknown` the
moment the malformed-history case or the undeclared-history case above
applies, or when any remaining comparison is `unknown` with no `true` found
- the same fail-toward-re-verification rule this script applies everywhere
else, applied here to identity; it is `true` only when every recorded party
resolves `false` AND `repaired:` is absent-or-readable AND `verified:` is
readable wherever the undeclared-history case has to consult it AND that
case does not apply.  Absent `promoted:` (or a `promoted:` with no `by:`)
leaves the gate `unknown` exactly as before this rule existed; this rule
only ever turns an `unknown` gate into `false`, into
`unknown` plus a named finding, or into `true` earned from disk - never a
`true` invented on missing or unreadable evidence.

This script imports only the Python standard library, takes no ambient
configuration of any kind - nothing is read from the process settings, no
harness feature, no editor plug-in, no callback registered anywhere - and is
standalone: nothing in baton has to be running for it to work.  The corpus root
comes from the argument, the working directory, or the script's own location,
and from nowhere else.
"""

import glob
import json
import os
import re
import sys

# --------------------------------------------------------------------------
# constants
# --------------------------------------------------------------------------

SCHEMA = "baton-instruments/1"

# The ADR's classifier. Strict enum: anything else is a finding.
DORMANT_BECAUSE_ENUM = (
    "never-fired",
    "unsound",
    "unsettleable",
    "low-yield-high-cost",
    "superseded",
)

# The ADR's lifecycle states.
STATUS_ENUM = ("active", "dormant", "shadow", "candidate", "blocked")

# The ADR's trigger-per-classifier table, quoted as the tool's own rule.
TRIGGER_RULE = {
    "never-fired": "event - wake when the artefact class named by the `guards` "
                   "edge shows a recorded change; elapsed time is irrelevant",
    "unsound": "blocked - never wakes on a schedule; wakes only when repaired "
               "AND its negative fixture is rejected",
    "unsettleable": "never as-is - only as a rewritten instrument, with the "
                    "rewrite authorised from outside the run",
    "low-yield-high-cost": "sampled - every N runs; the only case where a timer "
                           "is correct (N = %d runs)",
    "superseded": "dependency - wake only if its superseder goes dormant; an "
                  "edge, not a schedule",
}

# `low-yield-high-cost` sampling cadence, in runs. A run is one directory under
# `_orch/phases/`. Corpus-derived, never a clock.
SAMPLE_EVERY_N_RUNS = 5

# "dormant and never woken in N runs" is a finding, not a healthy state.
NEVER_WOKEN_N_RUNS = 3

# Where Instrument records are looked for. Bounded on purpose: an unbounded
# `**/*.instrument.md` would sweep up the fixture corpora that live under
# `_orch/nodes/*/work/` and pollute the live scorecard with test data.
RECORD_DIRS = (
    "tools",
    "instruments",
    os.path.join("docs", "instruments"),
    os.path.join("_orch", "instruments", "records"),
)

# Where concept ids can be declared, for resolving a link `to:` target.
CONCEPT_DIRS = (os.path.join("docs", "designs"),) + RECORD_DIRS

ROW_VERDICTS = ("CONFIRMED", "REFUTED", "UNTESTED")

VERDICT_FILE_RE = re.compile(
    r"^(?P<node>.+)-verdict(?:-(?P<seq>\d+))?"
    r"(?:\.superseded-by-(?P<sup>[^.]+))?\.json$"
)
QUESTION_FILE_RE = re.compile(r"^(Q-[^.]+)\.md$")
BLOCKS_RE = re.compile(r"^\s*\**\s*Blocks:?\**\s*(.*)$", re.IGNORECASE)
PATHISH_RE = re.compile(r"[A-Za-z0-9_.*-]+(?:/[A-Za-z0-9_.*-]+)+")
ID_LINE_RE = re.compile(r"^id:\s*(\S+)\s*$", re.MULTILINE)

# Signal (3) of the split rule: the corpus declaring the criterion the defect.
DECLARED_DEFECT_PHRASES = (
    "unsettleable",
    "unsatisfiable",
    "cannot be satisfied",
    "the criterion is the defect",
)

MAX_LIST_IN_SUMMARY = 6
SUMMARY_CEILING = 60

UNKNOWN = "unknown"


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------


def natural_key(text):
    """Sort key that orders P9 before P10 and is stable for any string."""
    parts = re.split(r"(\d+)", str(text))
    return tuple((1, int(p)) if p.isdigit() else (0, p) for p in parts)


def read_text(path):
    """Return a file's text, or None if it cannot be read at all."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except (OSError, ValueError):
        return None


def rel(root, path):
    """Path relative to the corpus root, forward slashes, for the output."""
    try:
        out = os.path.relpath(path, root)
    except ValueError:
        out = path
    return out.replace(os.sep, "/")


def listdir(path):
    try:
        return sorted(os.listdir(path))
    except OSError:
        return []


def clip_text(text, limit=220):
    text = " ".join(str(text).split())
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def identity_key(value):
    """Split an identity string on its first `:` into (scheme, value).

    Returns None if `value` is not a non-empty string containing `:` - an
    identity that cannot even be split has no scheme to compare on.
    """
    if not isinstance(value, str) or ":" not in value:
        return None
    scheme, _, rest = value.partition(":")
    if not scheme or not rest:
        return None
    return (scheme, rest)


def identities_match(a, b):
    """True/False/UNKNOWN. See the module header's "AUTHORSHIP-BAR IDENTITY
    RULE" for the full statement. Same scheme -> decidable equality. Missing,
    unparseable, or cross-scheme -> UNKNOWN, never a guessed True or False.
    """
    ka, kb = identity_key(a), identity_key(b)
    if ka is None or kb is None:
        return UNKNOWN
    if ka[0] != kb[0]:
        return UNKNOWN
    return ka[1] == kb[1]


def read_party_list(frontmatter, key):
    """Read a `by:`/`at:` party list (`verified:`, `repaired:`) as
    (state, entries, problem).

    `state` is one of:
      `"absent"`      the key is not in frontmatter at all -- the record has
                      declared nothing here. `entries` is [], `problem` None.
      `"declared"`    the value is a list every one of whose items is a
                      mapping carrying a non-empty `by:`. `entries` holds
                      those `by:` values in list order; `problem` is None.
      `"malformed"`   the key is present but its value is NOT that shape.
                      `entries` is [] and `problem` names what was read.

    Three states, never two, and that is the whole point of the function.
    Reading the field with an inline `isinstance(..., list)` and deciding
    WHETHER THE RECORD DECLARED ANYTHING from the key's mere presence
    collapses MALFORMED into DECLARED-AND-EMPTY: the entries vanish
    silently while the key still counts as a declaration. That flattening
    is what a mapping written directly under `repaired:` produced, and it
    turned present-but-broken evidence into a clean `true` on the
    authorship bar. Both fields this reader serves feed that bar --
    `repaired:` supplies its only refusable list, `verified:` supplies the
    undeclared-history check -- so a shape that silently empties either one
    silently empties the gate. Malformed evidence is `unknown` plus a
    finding: never `true`, never a silent empty declaration.

    Note the deliberate over-refusal: this frontmatter dialect has no flow
    sequences, so `repaired: []` reads as the string `"[]"`, not as an empty
    list, and lands in MALFORMED. An empty declared history is therefore not
    expressible here and reads `unknown`. That is the safe direction -- the
    record is told its shape is unreadable rather than being passed on it --
    and the fix is to write the block-list shape the *AIX Encoding* section
    documents, not to loosen this reader.
    """
    if key not in frontmatter:
        return "absent", [], None
    value = frontmatter.get(key)
    if not isinstance(value, list):
        return ("malformed", [],
                "`%s:` is present but its value is not a list of entries "
                "(read as %s: %s)"
                % (key, type(value).__name__, clip_text(repr(value), 120)))
    entries = []
    for n, item in enumerate(value, 1):
        if not isinstance(item, dict):
            return ("malformed", [],
                    "`%s:` entry #%d is not a mapping (read as %s: %s); the "
                    "list cannot be read as `by:`/`at:` entries"
                    % (key, n, type(item).__name__, clip_text(repr(item), 120)))
        who = item.get("by")
        if not who or not str(who).strip():
            return ("malformed", [],
                    "`%s:` entry #%d carries no non-empty `by:`; the party it "
                    "records cannot be read, so the list cannot be read"
                    % (key, n))
        entries.append(str(who))
    return "declared", entries, None


class Findings(object):
    """Accumulates every malformation the run met. Ordered, so output is stable."""

    def __init__(self):
        self.rows = []

    def add(self, kind, target, detail, instrument=None):
        self.rows.append({
            "kind": kind,
            "file": target,
            "detail": detail,
            "instrument": instrument,
        })

    def for_instrument(self, ident):
        return [r for r in self.rows if r["instrument"] == ident]

    def sorted_rows(self):
        return sorted(
            self.rows,
            key=lambda r: (r["kind"], natural_key(r["file"]), r["detail"]),
        )


# --------------------------------------------------------------------------
# corpus root discovery -- from the argument, the working directory, or the
# script's own location. NEVER from ambient process settings.
# --------------------------------------------------------------------------


def discover_root(argv):
    if len(argv) > 1 and argv[1].strip():
        return os.path.abspath(argv[1])
    here = os.path.abspath(os.getcwd())
    if os.path.isdir(os.path.join(here, "_orch")):
        return here
    walk = os.path.dirname(os.path.abspath(__file__))
    while True:
        if os.path.isdir(os.path.join(walk, "_orch")):
            return walk
        parent = os.path.dirname(walk)
        if parent == walk:
            return here
        walk = parent


# --------------------------------------------------------------------------
# frontmatter -- a hand-rolled parser for the YAML subset AIX frontmatter uses.
# stdlib only: there is no `yaml` module to lean on and there will not be one.
# Never raises; a shape it cannot read comes back as an error string.
# --------------------------------------------------------------------------

_ITEM = "\x00ITEM"


def _tokens(text):
    """(indent, stripped) pairs, with `- ` items split into a marker + content."""
    out = []
    for raw in text.split("\n"):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        if stripped == "-":
            out.append((indent, _ITEM))
        elif stripped.startswith("- "):
            out.append((indent, _ITEM))
            out.append((indent + 2, stripped[2:].strip()))
        else:
            out.append((indent, stripped))
    return out


def _scalar(raw):
    text = raw.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    low = text.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("null", "~", ""):
        return None
    if re.match(r"^-?\d+$", text):
        try:
            return int(text)
        except ValueError:
            return text
    return text


def _parse(toks, i, indent):
    if i >= len(toks):
        return None, i
    if toks[i][1] == _ITEM:
        items = []
        while i < len(toks) and toks[i][0] == indent and toks[i][1] == _ITEM:
            i += 1
            if i < len(toks) and toks[i][0] > indent:
                value, i = _parse(toks, i, toks[i][0])
                items.append(value)
            else:
                items.append(None)
        return items, i
    mapping = {}
    while i < len(toks):
        ind, txt = toks[i]
        if ind < indent or txt == _ITEM:
            break
        if ind > indent:
            i += 1
            continue
        if ":" not in txt:
            i += 1
            continue
        key, _, val = txt.partition(":")
        key = key.strip()
        val = val.strip()
        if val in (">", ">-", ">+", "|", "|-", "|+"):
            parts = []
            i += 1
            while i < len(toks) and toks[i][0] > indent and toks[i][1] != _ITEM:
                parts.append(toks[i][1])
                i += 1
            mapping[key] = " ".join(parts)
        elif val:
            mapping[key] = _scalar(val)
            i += 1
        else:
            i += 1
            if i < len(toks) and toks[i][0] > indent:
                sub, i = _parse(toks, i, toks[i][0])
                mapping[key] = sub
            else:
                mapping[key] = None
    return mapping, i


def parse_frontmatter(text):
    """Return (dict, body, error). `error` is a string, never an exception."""
    if text is None:
        return None, "", "file could not be read"
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, text, "no opening `---` fence: this is not frontmatter"
    close = None
    for n in range(1, len(lines)):
        if lines[n].strip() == "---":
            close = n
            break
    if close is None:
        return None, text, "opening `---` fence is never closed"
    block = "\n".join(lines[1:close])
    body = "\n".join(lines[close + 1:])
    try:
        data, _ = _parse(_tokens(block), 0, 0)
    except Exception as exc:                      # never crash on a record
        return None, body, "frontmatter did not parse (%s)" % exc.__class__.__name__
    if not isinstance(data, dict) or not data:
        return None, body, "frontmatter is not a mapping"
    return data, body, None


# --------------------------------------------------------------------------
# concept ids and link-target resolution
# --------------------------------------------------------------------------


def concept_index(root):
    """{concept id: path} for every file that declares an AIX `id:`."""
    found = {}
    for sub in CONCEPT_DIRS:
        base = os.path.join(root, sub)
        if not os.path.isdir(base):
            continue
        for name in listdir(base):
            if not name.endswith(".md"):
                continue
            path = os.path.join(base, name)
            text = read_text(path)
            if text is None:
                continue
            head = text.split("\n---", 1)[0]
            match = ID_LINE_RE.search(head)
            if match:
                found.setdefault(match.group(1), path)
    return found


def resolve_link(root, edge, concepts):
    """Resolve a link `to:` target. Returns (paths, mechanism).

    Three mechanisms, tried in order, all published in the output so a reader can
    see WHY a target counted as resolved:
      `concept-id`  some file's frontmatter `id:` equals the target
      `target-glob` the target string itself globs to at least one real file
      `note-path`   a path-shaped token in the edge's `note` globs to real files
    An empty result is not silence: the caller turns it into a finding.
    """
    if not isinstance(edge, dict):
        return [], None
    target = edge.get("to")
    if isinstance(target, str) and target in concepts:
        return [rel(root, concepts[target])], "concept-id"
    if isinstance(target, str) and "/" in target:
        hits = sorted(glob.glob(os.path.join(root, target)))
        if hits:
            return [rel(root, h) for h in hits], "target-glob"
    note = edge.get("note")
    if isinstance(note, str):
        seen = []
        for token in PATHISH_RE.findall(note):
            token = token.rstrip(".,;:")
            if token.startswith(("http", "//")):
                continue
            for hit in sorted(glob.glob(os.path.join(root, token))):
                path = rel(root, hit)
                if path not in seen:
                    seen.append(path)
        if seen:
            return sorted(seen), "note-path"
    return [], None


# --------------------------------------------------------------------------
# Instrument records
# --------------------------------------------------------------------------


def load_records(root, findings):
    """Every `*.instrument.md` in the bounded record directories."""
    records = []
    for sub in RECORD_DIRS:
        base = os.path.join(root, sub)
        if not os.path.isdir(base):
            continue
        for name in listdir(base):
            if not name.endswith(".instrument.md"):
                continue
            path = os.path.join(base, name)
            rpath = rel(root, path)
            data, body, error = parse_frontmatter(read_text(path))
            if error:
                findings.add("record-unparseable", rpath,
                             "Instrument record could not be parsed: %s; "
                             "no field of it is trusted" % error, rpath)
                records.append({
                    "id": UNKNOWN,
                    "record": rpath,
                    "parsed": False,
                    "parse_error": error,
                    "status": UNKNOWN,
                    "dormant_because": UNKNOWN,
                    "frontmatter": None,
                    "body": body or "",
                })
                continue
            ident = data.get("id")
            if not isinstance(ident, str) or not ident.strip():
                ident = UNKNOWN
                findings.add("record-id-absent", rpath,
                             "record carries no `id:`; it cannot be scored by id",
                             rpath)
            records.append({
                "id": ident,
                "record": rpath,
                "parsed": True,
                "parse_error": None,
                "status": data.get("status"),
                "dormant_because": data.get("dormant_because"),
                "frontmatter": data,
                "body": body or "",
            })
    records.sort(key=lambda r: (natural_key(r["id"]), r["record"]))
    return records


def validate_record(root, rec, concepts, findings):
    """Status enum, the strict `dormant_because` enum, and `guards` resolution."""
    rpath = rec["record"]
    ident = rec["record"] if rec["id"] == UNKNOWN else rec["id"]
    rec["key"] = ident
    if not rec["parsed"]:
        rec["guards"] = []
        rec["guards_mechanism"] = None
        rec["fixtures"] = []
        return

    status = rec["status"]
    if not isinstance(status, str) or status not in STATUS_ENUM:
        findings.add("status-not-in-enum", rpath,
                     "`status: %s` is outside the lifecycle enum %s"
                     % (status, list(STATUS_ENUM)), rpath)
        rec["status"] = UNKNOWN

    reason = rec["dormant_because"]
    if reason is None:
        if rec["status"] == "dormant":
            findings.add("dormant-because-absent", rpath,
                         "`status: dormant` with no `dormant_because`; the "
                         "classifier is a strict enum and an absent value is a "
                         "finding, not a silently-skipped row", rpath)
            rec["dormant_because"] = UNKNOWN
    elif not isinstance(reason, str) or reason not in DORMANT_BECAUSE_ENUM:
        findings.add("dormant-because-not-in-enum", rpath,
                     "`dormant_because: %s` is outside the five-value enum %s; "
                     "free text here degrades the design into a comment"
                     % (reason, list(DORMANT_BECAUSE_ENUM)), rpath)
        rec["dormant_because"] = UNKNOWN
    elif rec["status"] not in ("dormant", "blocked", UNKNOWN):
        findings.add("dormant-because-on-non-dormant", rpath,
                     "`dormant_because: %s` carried by a record whose status is "
                     "`%s`; the classifier only applies to a dormant instrument"
                     % (reason, rec["status"]), rpath)

    links = rec["frontmatter"].get("links")
    links = links if isinstance(links, list) else []
    guards = []
    fixtures = []
    mechanism = None
    saw_guards = False
    for edge in links:
        if not isinstance(edge, dict):
            continue
        relation = edge.get("rel")
        if relation == "guards":
            saw_guards = True
            paths, how = resolve_link(root, edge, concepts)
            if not paths:
                findings.add("guards-unresolved", rpath,
                             "`guards` edge to `%s` resolves to nothing - no "
                             "concept id, no glob, no path in its note matches "
                             "any file; the guarded surface is unknown"
                             % edge.get("to"), rpath)
            else:
                guards.extend(paths)
                mechanism = mechanism or how
        elif relation == "contradicts":
            paths, how = resolve_link(root, edge, concepts)
            fixtures.append({
                "to": edge.get("to"),
                "resolves_to": paths,
                "mechanism": how,
                "note": clip_text(edge.get("note") or ""),
            })
            if not paths:
                findings.add("fixture-unresolved", rpath,
                             "`contradicts` edge to `%s` (the negative fixture) "
                             "resolves to nothing; the promotion gate cannot be "
                             "settled from disk" % edge.get("to"), rpath)
    if not saw_guards:
        findings.add("guards-edge-absent", rpath,
                     "record carries no `guards` edge; ADR SC1 requires one and "
                     "without it the wake trigger is not derivable", rpath)
    rec["guards"] = sorted(set(guards))
    rec["guards_mechanism"] = mechanism
    rec["fixtures"] = fixtures


# --------------------------------------------------------------------------
# verdicts -- read for the productive/defective split
# --------------------------------------------------------------------------


def compute_node_verdict(rows):
    """CONTRACT §9.1's table. Returns the computed node verdict."""
    seen = []
    unreadable = 0
    for row in rows:
        if isinstance(row, dict) and isinstance(row.get("verdict"), str):
            seen.append(row["verdict"].strip().upper())
        else:
            unreadable += 1
    if unreadable or not seen:
        return "PARTIAL"
    if any(v == "REFUTED" for v in seen):
        return "REFUTED"
    if all(v == "CONFIRMED" for v in seen):
        return "CONFIRMED"
    return "PARTIAL"


def load_verdicts(root, findings):
    """Every verdict file under `_orch/verify/`, grouped into per-node lineages."""
    verify_dir = os.path.join(root, "_orch", "verify")
    lineages = {}
    for name in listdir(verify_dir):
        if not name.endswith(".json"):
            continue
        match = VERDICT_FILE_RE.match(name)
        if not match:
            continue                      # an audit, not a verdict; not our business
        path = os.path.join(verify_dir, name)
        rpath = rel(root, path)
        text = read_text(path)
        data = None
        error = None
        if text is None:
            error = "file could not be read"
        else:
            try:
                data = json.loads(text)
            except ValueError as exc:
                error = "invalid JSON (%s)" % clip_text(exc, 80)
        if error is not None or not isinstance(data, dict):
            findings.add("verdict-unreadable", rpath,
                         error or "verdict is not a JSON object; its rows cannot "
                                  "be scored")
            continue
        rows = data.get("criteria")
        rows = rows if isinstance(rows, list) else None
        if rows is not None:
            computed = compute_node_verdict(rows)
            asserted = str(data.get("verdict", "")).strip().upper()
            if asserted and asserted != computed:
                findings.add("verdict-shape-mismatch", rpath,
                             "asserted node verdict `%s` disagrees with the "
                             "verdict computed from its %d rows (`%s`); read as "
                             "PARTIAL" % (asserted, len(rows), computed))
        lineages.setdefault(match.group("node"), []).append({
            "path": rpath,
            "seq": int(match.group("seq")) if match.group("seq") else 0,
            "superseded_by": match.group("sup"),
            "data": data,
            "rows": rows,
        })
    for node in lineages:
        lineages[node].sort(key=lambda f: (f["superseded_by"] is not None,
                                           f["seq"], f["path"]))
    return lineages


def load_questions(root):
    """`_orch/inbox/Q-<n>.md`: text, answered-ness, and the nodes it blocks."""
    inbox = os.path.join(root, "_orch", "inbox")
    questions = []
    names = listdir(inbox)
    for name in names:
        match = QUESTION_FILE_RE.match(name)
        if not match:
            continue
        qid = match.group(1)
        text = read_text(os.path.join(inbox, name)) or ""
        blocks = []
        for line in text.split("\n"):
            hit = BLOCKS_RE.match(line)
            if hit:
                blocks += re.findall(r"`([^`]+)`", hit.group(1))
                break
        questions.append({
            "id": qid,
            "path": rel(root, os.path.join(inbox, name)),
            "answered": ("%s.answer.md" % qid) in names,
            "blocks": blocks,
            "text": text,
        })
    return questions


def declared_defect(row, node, questions):
    """Signal (3): does the corpus declare this criterion the defect?"""
    haystacks = []
    if isinstance(row, dict):
        for key in ("probe", "attack", "why_it_failed", "strongest_attack"):
            value = row.get(key)
            if isinstance(value, str):
                haystacks.append(("row.%s" % key, value))
        evidence = row.get("evidence")
        if isinstance(evidence, list):
            haystacks.append(("row.evidence",
                              " ".join(str(e) for e in evidence)))
    for question in questions:
        if node in question["blocks"]:
            haystacks.append((question["path"], question["text"]))
    for where, text in haystacks:
        low = text.lower()
        for phrase in DECLARED_DEFECT_PHRASES:
            if phrase in low:
                return where, phrase
    return None, None


def successor_of(files, index):
    """The next verdict in the lineage after `files[index]`."""
    current = files[index]
    if current["superseded_by"] is not None:
        for candidate in files:
            if candidate["superseded_by"] is None:
                return candidate
        return None
    for candidate in files[index + 1:]:
        if candidate["superseded_by"] is None:
            return candidate
    return None


def build_split(root, lineages, questions, findings):
    """The productive/defective split: one entry per REFUTED, evidence published."""
    entries = []
    for node in sorted(lineages, key=natural_key):
        files = lineages[node]
        for index, current in enumerate(files):
            rows = current["rows"]
            follower = successor_of(files, index)
            if rows is None:
                # single-claim verdict (CONTRACT §9.1 keeps its own shape)
                if str(current["data"].get("verdict", "")).strip().upper() != "REFUTED":
                    continue
                claim = current["data"].get("claim")
                entries.append(classify(
                    root, node, current, follower, None,
                    claim, current["data"], questions, findings,
                    shape="single-claim"))
                continue
            for k, row in enumerate(rows):
                if not isinstance(row, dict):
                    continue
                if str(row.get("verdict", "")).strip().upper() != "REFUTED":
                    continue
                entries.append(classify(
                    root, node, current, follower, k,
                    row.get("criterion"), row, questions, findings,
                    shape="criterion-row"))
    return entries


def classify(root, node, current, follower, k, text, row, questions,
             findings, shape):
    """Apply the four-signal rule to one REFUTED and publish its evidence base."""
    entry = {
        "node": node,
        "verdict_path": current["path"],
        "shape": shape,
        "row_index": None if k is None else k + 1,
        "criterion": clip_text(text, 240),
        "carries_attack_field": isinstance(row, dict) and "attack" in row,
        "successor_verdict_path": follower["path"] if follower else None,
        "examined": [],
        "classification": UNKNOWN,
        "signal": None,
        "why": "",
    }
    if follower is not None:
        if shape == "single-claim":
            other = follower["data"].get("claim")
            other_verdict = str(follower["data"].get("verdict", "")).strip().upper()
            present = follower["rows"] is None
        else:
            rows = follower["rows"]
            present = isinstance(rows, list) and k < len(rows) and isinstance(rows[k], dict)
            other = rows[k].get("criterion") if present else None
            other_verdict = (str(rows[k].get("verdict", "")).strip().upper()
                             if present else None)
        entry["examined"].append(
            "successor `%s`: %s at the same position"
            % (follower["path"],
               "row present" if present else "no comparable row"))
        if present:
            same = (isinstance(other, str) and isinstance(text, str)
                    and " ".join(other.split()) == " ".join(text.split()))
            entry["examined"].append(
                "compared the criterion text verbatim: %s"
                % ("IDENTICAL" if same else "DIFFERENT"))
            entry["examined"].append(
                "successor verdict for that position: %s" % other_verdict)
            if not same:
                entry["classification"] = "test-changing"
                entry["signal"] = "criterion-rewritten"
                entry["successor_criterion"] = clip_text(other, 240)
                entry["why"] = ("the criterion text was rewritten between the two "
                                "verdicts, so what moved was the measurement")
                return entry
            if other_verdict == "CONFIRMED":
                entry["classification"] = "product-changing"
                entry["signal"] = "artefact-fixed-under-a-held-still-criterion"
                entry["why"] = ("the criterion held still verbatim and its verdict "
                                "moved REFUTED -> CONFIRMED, so what moved was the "
                                "artefact under test")
                return entry
    where, phrase = declared_defect(row, node, questions)
    if where:
        entry["examined"].append(
            "searched the row's own probe/attack/evidence and every "
            "`_orch/inbox/Q-*.md` whose `Blocks:` line names `%s`" % node)
        entry["classification"] = "test-changing"
        entry["signal"] = "declared-defect"
        entry["declared_in"] = where
        entry["declared_phrase"] = phrase
        entry["why"] = ("no successor verdict exists, but the corpus declares the "
                        "criterion itself the defect (`%s` in %s), so the recorded "
                        "disposition is to rewrite the measurement" % (phrase, where))
        return entry
    if follower is None:
        entry["examined"].append(
            "no successor verdict exists for `%s` in `_orch/verify/`" % node)
    entry["examined"].append(
        "searched the row's own probe/attack/evidence and every "
        "`_orch/inbox/Q-*.md` whose `Blocks:` line names `%s` for a declaration "
        "that the criterion is the defect: none found" % node)
    entry["why"] = ("nothing on disk records what fix followed this REFUTED; "
                    "the split cannot be decided and this row needs "
                    "re-verification")
    findings.add("split-untraceable", current["path"],
                 "REFUTED %s cannot be split product/test: %s"
                 % ("row %d" % (k + 1) if k is not None else "single-claim verdict",
                    entry["why"]))
    return entry


# --------------------------------------------------------------------------
# yield
# --------------------------------------------------------------------------


def instrument_markers(rec):
    """The literal strings a corpus artefact would use to name this instrument."""
    markers = []
    if isinstance(rec.get("id"), str) and rec["id"] != UNKNOWN:
        markers.append(rec["id"])
        tail = rec["id"].split("-")
        if tail and tail[0] == "check" and len(tail) > 1 and tail[1].isdigit():
            markers += ["check %s" % tail[1], "check-%s" % tail[1],
                        "check%s" % tail[1]]
    base = os.path.basename(rec["record"])
    stem = base[: -len(".instrument.md")] if base.endswith(".instrument.md") else base
    if stem:
        markers.append(stem)
    return sorted(set(m for m in markers if m))


def names_instrument(text, markers):
    low = text.lower()
    return [m for m in markers if m.lower() in low]


def ledger_order(root):
    """{node id: last row number} from `_orch/ledger.csv`, append-only run order.

    Row ORDER is used, never the timestamp value: the ledger is append-only, so
    its row order is the run order, and reading order rather than clock keeps two
    runs over an unchanged corpus byte-identical.
    """
    path = os.path.join(root, "_orch", "ledger.csv")
    order = {}
    text = read_text(path)
    if text is None:
        return order
    for n, line in enumerate(text.split("\n")):
        cells = line.split(",")
        if len(cells) < 2:
            continue
        node = cells[1].strip()
        if node and node != "node":
            order[node] = n
    return order


CLAIMED_YIELD_RE = re.compile(
    r"^\|\s*defects caught,? lifetime\s*\|\s*\**\s*(\d+)\s*\**\s*\|",
    re.IGNORECASE | re.MULTILINE)


def claimed_yield(root, rec, concepts):
    """Every place the corpus ASSERTS a lifetime yield for this instrument.

    Read from the record's own body and from any document its `links` point at:
    a `| defects caught, lifetime | N |` table row. The tool compares each claim
    against the number it derived, and a disagreement is a finding - the document
    does not get to set the answer. Fitting the tool to the document is exactly
    the unmeasured-oracle failure this scorecard exists to avoid.
    """
    claims = []
    for match in CLAIMED_YIELD_RE.finditer(rec.get("body") or ""):
        claims.append({"claimed": int(match.group(1)),
                       "source": rec["record"] + " (the record's own History table)"})
    frontmatter = rec.get("frontmatter") or {}
    links = frontmatter.get("links")
    for edge in (links if isinstance(links, list) else []):
        if not isinstance(edge, dict):
            continue
        target = edge.get("to")
        if not isinstance(target, str) or target not in concepts:
            continue
        text = read_text(concepts[target]) or ""
        for match in CLAIMED_YIELD_RE.finditer(text):
            claims.append({"claimed": int(match.group(1)),
                           "source": rel(root, concepts[target])})
    return claims


def count_runs(root):
    """A run is one directory under `_orch/phases/`. Corpus-derived, no clock."""
    phases_dir = os.path.join(root, "_orch", "phases")
    return sorted(
        [n for n in listdir(phases_dir)
         if os.path.isdir(os.path.join(phases_dir, n))], key=natural_key)


def build_yield(root, records, questions, findings, phases, order,
                concepts, have_inbox, have_nodes):
    """Section 1. Defects caught, re-verifications caused, last time it fired."""
    nodes_dir = os.path.join(root, "_orch", "nodes")
    node_names = listdir(nodes_dir)
    rows = []
    for rec in records:
        markers = instrument_markers(rec)
        entry = {
            "instrument": rec["key"],
            "record": rec["record"],
            "status": rec["status"] if rec["parsed"] else UNKNOWN,
            "markers_searched": markers,
        }
        if not markers:
            entry["defects_caught_lifetime"] = UNKNOWN
            entry["re_verifications_caused"] = UNKNOWN
            entry["last_fired"] = UNKNOWN
            entry["derivation"] = ("the record names no id and no usable filename "
                                   "stem, so no corpus artefact can be attributed "
                                   "to it")
            findings.add("yield-underivable", rec["record"],
                         "no marker string identifies this instrument in the "
                         "corpus; its yield is `unknown`, not zero", rec["record"])
            rows.append(entry)
            continue

        # --- defects caught -------------------------------------------------
        # RULE: a defect is counted when an `_orch/inbox/Q-<n>.md` (a) names this
        # instrument by one of its markers AND (b) names at least one file inside
        # the instrument's resolved `guards` scope - so a question ABOUT the
        # instrument's own construction, naming nothing it guards, is not a catch.
        # A `guards` edge that resolved to nothing makes this `unknown`, not zero.
        caught = []
        if not have_inbox:
            entry["defects_caught_lifetime"] = UNKNOWN
            entry["defects_caught_evidence"] = []
            entry["defects_caught_derivation"] = (
                "`_orch/inbox/` is absent, so no question can be read; "
                "`unknown`, not zero - reporting zero defects caught off an "
                "unreadable corpus would be a false pass")
        elif not rec.get("guards"):
            entry["defects_caught_lifetime"] = UNKNOWN
            entry["defects_caught_evidence"] = []
            entry["defects_caught_derivation"] = (
                "the `guards` edge resolves to nothing, so no question can be "
                "tested for naming the guarded surface; `unknown`, not zero - "
                "a zero here would be a false pass")
        else:
            guard_names = sorted(set(rec["guards"]))
            for question in questions:
                hits = names_instrument(question["text"], markers)
                if not hits:
                    continue
                touched = [g for g in guard_names if g in question["text"]]
                if not touched:
                    continue
                caught.append({
                    "question": question["path"],
                    "answered": question["answered"],
                    "named_by": hits,
                    "guarded_files_named": touched[:4],
                })
            entry["defects_caught_lifetime"] = len(caught)
            entry["defects_caught_evidence"] = caught
            entry["defects_caught_derivation"] = (
                "count of `_orch/inbox/Q-*.md` questions that name this "
                "instrument (markers: %s) AND name at least one file inside its "
                "resolved `guards` scope (%d file(s)); each counted question is "
                "listed with what matched"
                % (", ".join("`%s`" % m for m in markers), len(guard_names)))

        # --- re-verifications caused ---------------------------------------
        # RULE: a node caused a re-verification by this instrument when a file
        # named `invariant*` or `acceptance*` directly inside that node's `work/`
        # quotes one of the instrument's markers.
        firing_nodes = []
        artefacts = []
        for node in node_names:
            work = os.path.join(nodes_dir, node, "work")
            if not os.path.isdir(work):
                continue
            for name in listdir(work):
                if not re.match(r"^(invariant|acceptance)", name):
                    continue
                path = os.path.join(work, name)
                if not os.path.isfile(path):
                    continue
                text = read_text(path)
                if text is None:
                    continue
                if names_instrument(text, markers):
                    artefacts.append(rel(root, path))
                    if node not in firing_nodes:
                        firing_nodes.append(node)
        firing_nodes.sort(key=natural_key)
        entry["re_verifications_caused"] = (
            len(firing_nodes) if have_nodes else UNKNOWN)
        entry["re_verification_nodes"] = firing_nodes
        entry["re_verification_artefacts"] = sorted(artefacts, key=natural_key)
        entry["re_verifications_derivation"] = (
            "distinct nodes with an `invariant*`/`acceptance*` artefact directly "
            "in `_orch/nodes/<node>/work/` that quotes one of this instrument's "
            "markers; %d artefact(s) across %d node(s)"
            % (len(artefacts), len(firing_nodes))
            if have_nodes else
            "`_orch/nodes/` is absent, so no node artefact can be read; "
            "`unknown`, not zero")

        # --- last fired ------------------------------------------------------
        ranked = [(order[n], n) for n in firing_nodes if n in order]
        if ranked:
            latest = max(ranked)[1]
            entry["last_fired"] = latest
            entry["last_fired_basis"] = (
                "of the %d node(s) recorded running this instrument, `%s` is the "
                "one appearing latest in `_orch/ledger.csv` (row %d of an "
                "append-only file, so row ORDER is the run order); a node id, "
                "never a clock reading"
                % (len(firing_nodes), latest, max(ranked)[0]))
        elif firing_nodes:
            entry["last_fired"] = UNKNOWN
            entry["last_fired_basis"] = (
                "%d node(s) record this instrument running, but none of them "
                "appears in `_orch/ledger.csv`, so they cannot be ordered; "
                "`unknown` rather than a guess" % len(firing_nodes))
            findings.add("last-fired-unorderable", rec["record"],
                         "nodes recording this instrument are absent from the "
                         "ledger; `last_fired` is `unknown`", rec["record"])
        else:
            entry["last_fired"] = UNKNOWN
            entry["last_fired_basis"] = (
                "no node work artefact records this instrument running")
            findings.add("instrument-never-recorded-firing", rec["record"],
                         "no `invariant*`/`acceptance*` artefact in any node's "
                         "work directory names this instrument; `last_fired` is "
                         "`unknown`", rec["record"])

        # --- reconcile against what the corpus CLAIMS -----------------------
        claims = claimed_yield(root, rec, concepts)
        entry["claimed_yield_in_corpus"] = claims
        derived = entry["defects_caught_lifetime"]
        disagreeing = [c for c in claims if c["claimed"] != derived]
        entry["yield_agrees_with_corpus_claims"] = (
            UNKNOWN if derived == UNKNOWN
            else (not disagreeing) if claims else None)
        for claim in disagreeing:
            findings.add("yield-disagrees-with-claim", claim["source"],
                         "this tool derives %s lifetime defect(s) caught for `%s` "
                         "from disk, but %s asserts %d. The derived number stands; "
                         "the document is stale. Fitting the tool to the document "
                         "would be the unmeasured-oracle failure this scorecard "
                         "exists to prevent."
                         % (derived, rec["key"], claim["source"],
                            claim["claimed"]), rec["record"])

        entry["runs_in_corpus"] = len(phases)
        rows.append(entry)
    return rows


# --------------------------------------------------------------------------
# wake list, never-woken, promotion
# --------------------------------------------------------------------------


def build_wake_list(root, records, yield_rows, findings, phases):
    """Section 3. Dormant instruments whose trigger fired, GROUPED BY classifier."""
    by_yield = dict((r["instrument"], r) for r in yield_rows)
    groups = {}
    for value in DORMANT_BECAUSE_ENUM:
        rule = TRIGGER_RULE[value]
        if "%d" in rule:
            rule = rule % SAMPLE_EVERY_N_RUNS
        groups[value] = {"trigger_rule": rule, "instruments": []}
    groups[UNKNOWN] = {
        "trigger_rule": "no classifier could be read, so no trigger rule applies; "
                        "every such instrument needs re-verification",
        "instruments": [],
    }

    for rec in records:
        if rec["parsed"] and rec["status"] == "active":
            continue
        if rec["parsed"] and rec["status"] not in ("dormant", "blocked", UNKNOWN):
            continue
        reason = rec.get("dormant_because")
        if not isinstance(reason, str) or reason not in DORMANT_BECAUSE_ENUM:
            reason = UNKNOWN
        row = {
            "instrument": rec["key"],
            "record": rec["record"],
            "status": rec["status"] if rec["parsed"] else UNKNOWN,
            "dormant_because": reason,
            "wake": UNKNOWN,
            "evidence": [],
        }
        yrow = by_yield.get(rec["key"], {})
        if reason == UNKNOWN:
            row["why"] = ("the classifier is absent or outside the enum, so the "
                          "revival trigger is not derivable; `unknown`, and this "
                          "instrument counts as needing re-verification")
        elif reason == "never-fired":
            guards = rec.get("guards") or []
            if not guards:
                row["why"] = ("the `guards` edge resolves to nothing, so the "
                              "guarded artefact class cannot be watched; "
                              "`unknown`, never a quiet `no`")
            else:
                row["wake"] = True
                row["evidence"] = guards[:6]
                row["why"] = ("the guarded artefact class resolves to %d live "
                              "file(s); an event trigger cannot be shown NOT to "
                              "have fired from disk, so this wakes - a false "
                              "alarm is the correct direction of error"
                              % len(guards))
        elif reason == "unsound":
            row["wake"] = False
            row["why"] = ("`unsound` is blocked, not scheduled: it wakes only by "
                          "being repaired AND rejecting a negative fixture it is "
                          "known to fail. Flagged for a human.")
            row["requires_human"] = True
        elif reason == "unsettleable":
            row["wake"] = False
            row["why"] = ("never as-is - the criterion is the defect, not the "
                          "check. Only a rewritten instrument, authorised from "
                          "outside the run. Flagged for a human.")
            row["requires_human"] = True
        elif reason == "low-yield-high-cost":
            last = yrow.get("last_fired", UNKNOWN)
            if last == UNKNOWN:
                row["why"] = ("sampled every %d runs, but no corpus artefact "
                              "records this instrument ever firing, so the "
                              "sample counter has no origin; `unknown`"
                              % SAMPLE_EVERY_N_RUNS)
            else:
                row["wake"] = len(phases) >= SAMPLE_EVERY_N_RUNS
                row["evidence"] = ["%d run(s) recorded under `_orch/phases/`"
                                   % len(phases)]
                row["why"] = ("the only classifier where a timer is correct: "
                              "sample every %d runs; the corpus records %d run(s)"
                              % (SAMPLE_EVERY_N_RUNS, len(phases)))
        elif reason == "superseded":
            superseder = None
            frontmatter = rec.get("frontmatter") or {}
            links = frontmatter.get("links")
            for edge in (links if isinstance(links, list) else []):
                if isinstance(edge, dict) and edge.get("rel") in (
                        "superseded-by", "supersedes", "replaced-by"):
                    superseder = edge.get("to")
                    break
            if superseder is None:
                row["why"] = ("no `superseded-by` edge names the superseder, so "
                              "the dependency trigger cannot be evaluated; "
                              "`unknown`")
                findings.add("superseder-unnamed", rec["record"],
                             "`dormant_because: superseded` with no edge naming "
                             "the superseder; its revival trigger is a dependency "
                             "and the dependency is missing", rec["record"])
            else:
                row["superseder"] = superseder
                row["why"] = ("wakes only if `%s` goes dormant; the superseder is "
                              "named but its own record is not in this corpus, so "
                              "its state is `unknown`" % superseder)
                if any(r["key"] == superseder for r in records):
                    other = [r for r in records if r["key"] == superseder][0]
                    row["wake"] = other["status"] in ("dormant", "blocked")
                    row["why"] = ("wakes only if `%s` goes dormant; that record "
                                  "reads `status: %s`"
                                  % (superseder, other["status"]))
        groups[reason]["instruments"].append(row)
    return groups


def build_never_woken(root, records, yield_rows, findings, phases):
    """Section 4. A FINDING, never a status: a wrong `guards` edge hides a check."""
    by_yield = dict((r["instrument"], r) for r in yield_rows)
    out = []
    for rec in records:
        if rec["parsed"] and rec["status"] == "active":
            continue
        yrow = by_yield.get(rec["key"], {})
        last = yrow.get("last_fired", UNKNOWN)
        nodes = yrow.get("re_verification_nodes") or []
        if last == UNKNOWN:
            detail = ("dormant and NO corpus artefact records it ever firing; "
                      "a wrong `guards` edge would hide it forever, so this is "
                      "reported as a finding and not as a healthy state")
        elif len(nodes) < NEVER_WOKEN_N_RUNS:
            detail = ("dormant and recorded firing in only %d node(s), fewer than "
                      "the N=%d floor; reported as a finding, not a status"
                      % (len(nodes), NEVER_WOKEN_N_RUNS))
        else:
            continue
        row = {
            "instrument": rec["key"],
            "record": rec["record"],
            "status": rec["status"] if rec["parsed"] else UNKNOWN,
            "dormant_because": rec.get("dormant_because", UNKNOWN),
            "last_fired": last,
            "runs_in_corpus": len(phases),
            "n_runs_floor": NEVER_WOKEN_N_RUNS,
            "finding": detail,
        }
        out.append(row)
        findings.add("instrument-never-woken", rec["record"], detail, rec["record"])
    return out


def build_promotion(root, records, findings, questions):
    """Section 5. Operator decision 3: mechanical gate AND authorship bar."""
    out = []
    for rec in records:
        row = {
            "instrument": rec["key"],
            "record": rec["record"],
            "status": rec["status"] if rec["parsed"] else UNKNOWN,
            "gates": {},
            "eligible": UNKNOWN,
            "requires_human": UNKNOWN,
            "evidence": [],
        }
        if not rec["parsed"]:
            row["gates"]["record_parses"] = False
            row["eligible"] = False
            row["requires_human"] = True
            row["why"] = ("the record does not parse, so no gate can be settled; "
                          "not eligible, and a human must look at it")
            out.append(row)
            continue

        # gate 1 -- the mechanical gate: a negative fixture that resolves.
        fixtures = rec.get("fixtures") or []
        resolved = [f for f in fixtures if f["resolves_to"]]
        if not fixtures:
            row["gates"]["negative_fixture_present"] = False
            row["evidence"].append("no `contradicts` edge names a negative fixture")
        elif not resolved:
            row["gates"]["negative_fixture_present"] = UNKNOWN
            row["evidence"].append(
                "%d `contradicts` edge(s) present, none resolving to a real path"
                % len(fixtures))
        else:
            row["gates"]["negative_fixture_present"] = True
            row["evidence"].append(
                "negative fixture(s) resolve: %s"
                % ", ".join("`%s` -> %s" % (f["to"], ", ".join(f["resolves_to"][:2]))
                            for f in resolved))
        # Whether the fixture is REJECTED is a run result, not a frontmatter fact.
        row["gates"]["negative_fixture_rejected"] = UNKNOWN
        row["evidence"].append(
            "whether the fixture is REJECTED is a run result and is not "
            "recorded in frontmatter; this tool does not execute instruments, "
            "so the gate reads `unknown` rather than `true`")

        # gate 2 -- the authorship bar.
        author = None
        generated = rec["frontmatter"].get("generated")
        if isinstance(generated, dict):
            author = generated.get("by")
        # Same three-state read as `repaired:` below. A `verified:` written
        # as a mapping used to yield zero verifiers silently; that is
        # tolerable for the informational gate below it, but NOT for the
        # undeclared-history check further down, which reads this list to
        # find out whether the promoter re-reviewed the record. See
        # `read_party_list`.
        verified_state, verifiers, verified_problem = read_party_list(
            rec["frontmatter"], "verified")
        row["author"] = author or UNKNOWN
        row["verified_by"] = verifiers
        row["verified_state"] = verified_state
        independent = []
        for who in verifiers:
            node = who.split(":", 1)[-1]
            for candidate in sorted(glob.glob(os.path.join(
                    root, "_orch", "verify", "%s-verdict*.json" % node))):
                text = read_text(candidate)
                if text and "authorship_bar" in text:
                    independent.append(rel(root, candidate))
        if independent:
            row["gates"]["independent_review_recorded"] = True
            row["evidence"].append(
                "an independent verdict carrying an `authorship_bar` section "
                "exists: %s" % ", ".join(sorted(set(independent))))
        else:
            row["gates"]["independent_review_recorded"] = UNKNOWN
            row["evidence"].append(
                "no verdict for any node in `verified:` carries an "
                "`authorship_bar` section; whether the promoter is the author or "
                "last repairer cannot be settled from disk")
        # `repaired:` (same shape as `generated:`/`verified:`: `by:` + `at:`)
        # names the parties THIS RECORD ITSELF records as having repaired it,
        # as distinct from `verified:`, which mixes repairers and purely
        # independent re-reviewers with no way to tell them apart from that
        # field alone. See the module header's "THE RECORDED PARTIES".
        # Three states, never two: absent (undeclared history), declared (a
        # readable list of entries), malformed (present but unreadable as
        # such a list). Collapsing malformed into declared-and-empty is the
        # false pass this bar exists to refuse - see `read_repaired`.
        repaired_state, repairers, repaired_problem = read_party_list(
            rec["frontmatter"], "repaired")
        row["repaired_by"] = repairers
        row["repaired_state"] = repaired_state
        # `promoted:` (same shape as `generated:`/`verified:`: `by:` + `at:`)
        # names who promoted the record. Absent stays `unknown` - never
        # `true` - exactly as before this block existed. See the module
        # header's "AUTHORSHIP-BAR IDENTITY RULE" / "THE RECORDED PARTIES"
        # for the comparison rule and for where a repairer is read from.
        promoted = rec["frontmatter"].get("promoted")
        promoter = None
        if isinstance(promoted, dict):
            promoter = promoted.get("by")
        row["promoted_by"] = promoter if promoter else UNKNOWN
        # Every party this record's own frontmatter records as having
        # REPAIRED it: the author, then EVERY `repaired:` entry in list
        # order. Not just the last one - a repairer displaced from the last
        # slot by a later entry is still a recorded party and must still be
        # refused. `verified:` is deliberately NOT in this list any more: it
        # mixes repairers and pure re-reviewers with no way to tell them
        # apart, and comparing against it is exactly the over-refusal this
        # schema change exists to close (handled separately, below, as the
        # undeclared-history case). Fixed order in, fixed order out:
        # deterministic.
        parties = []
        if author:
            parties.append(("author", str(author)))
        for n, who in enumerate(repairers, 1):
            parties.append(("recorded `repaired:` entry #%d" % n, who))
        row["recorded_parties"] = [who for _, who in parties]
        # Informational only; the gate below compares against ALL parties.
        row["last_repairer"] = repairers[-1] if repairers else UNKNOWN
        if not promoter:
            row["gates"]["promoter_not_author_or_repairer"] = UNKNOWN
            row["evidence"].append(
                "no `promoted:` block (with `by:`) is present in frontmatter; "
                "who promoted this record is not recorded, so the authorship "
                "bar is `unknown`, never `true`")
        else:
            collision = None
            undecidable = []
            for role, who in parties:
                verdict = identities_match(promoter, who)
                if verdict is True:
                    collision = (role, who)
                    break
                if verdict == UNKNOWN:
                    undecidable.append((role, who))
            # The undeclared-history case (module header: "THE CASE THE NEW
            # FIELD MAKES POSSIBLE"): no `repaired:` key at all, and the
            # promoter matches a `verified:` entry. That entry may or may not
            # be a repairer - the record never said - so this can never read
            # as a clean `true`.
            undeclared = None
            if collision is None and repaired_state == "absent":
                for n, who in enumerate(verifiers, 1):
                    if identities_match(promoter, who) is True:
                        undeclared = ("recorded `verified:` entry #%d" % n, who)
                        break
            if collision is not None:
                row["gates"]["promoter_not_author_or_repairer"] = False
                detail = (
                    "authorship collision: promoter `%s` IS this record's %s "
                    "(`%s`); operator decision 3's authorship bar refuses a "
                    "promoter who is the record's author or any party its own "
                    "`repaired:` history records"
                    % (promoter, collision[0], collision[1]))
                row["evidence"].append(detail)
                findings.add("authorship-bar-collision", rec["record"], detail,
                             rec["record"])
            elif repaired_state == "malformed":
                # Present-but-unreadable repair history. The record HAS said
                # something about who repaired it and this tool cannot read
                # what; a party named in that unreadable value may well be
                # the promoter. `unknown` plus a finding - a `true` here
                # would be a pass earned from malformed evidence, the same
                # class of false pass the last-entry-only bar produced.
                row["gates"]["promoter_not_author_or_repairer"] = UNKNOWN
                detail = (
                    "promoter `%s` cannot be settled against this record's "
                    "repair history: %s; the parties it records cannot be "
                    "read, so whether the promoter is among them cannot be "
                    "settled from disk; `unknown`, never `true`"
                    % (promoter, repaired_problem))
                row["evidence"].append(detail)
                findings.add("authorship-bar-undecidable", rec["record"],
                             detail, rec["record"])
            elif (repaired_state == "absent"
                  and verified_state == "malformed"):
                # The same false pass, reached through the other field. The
                # undeclared-history check reads `verified:` to find out
                # whether the promoter re-reviewed this record; a
                # `verified:` this dialect cannot read as a list empties
                # that check silently, and a promoter named there - broken
                # shape and all - would clear the gate `true` with no
                # `repaired:` key to clear it. Unreadable there is
                # unreadable here.
                row["gates"]["promoter_not_author_or_repairer"] = UNKNOWN
                detail = (
                    "promoter `%s` cannot be settled: this record declares no "
                    "`repaired:` history at all, and its reviewer list cannot "
                    "be read either - %s; whether the promoter re-reviewed "
                    "this record, and so whether it may also have repaired "
                    "it, cannot be settled from disk; `unknown`, never `true`"
                    % (promoter, verified_problem))
                row["evidence"].append(detail)
                findings.add("authorship-bar-undecidable", rec["record"],
                             detail, rec["record"])
            elif undeclared is not None:
                row["gates"]["promoter_not_author_or_repairer"] = UNKNOWN
                detail = (
                    "promoter `%s` matches this record's %s (`%s`), but the "
                    "record carries no `repaired:` key at all - it has not "
                    "declared its repair history, so whether that party "
                    "repaired the record cannot be settled from disk; "
                    "`unknown`, never `true`"
                    % (promoter, undeclared[0], undeclared[1]))
                row["evidence"].append(detail)
                findings.add("authorship-bar-undecidable", rec["record"],
                             detail, rec["record"])
            elif undecidable:
                row["gates"]["promoter_not_author_or_repairer"] = UNKNOWN
                detail = (
                    "promoter `%s` cannot be settled against %s: the pair "
                    "spans identity schemes this run does not unify (see "
                    "module header); `unknown`, never `true`"
                    % (promoter,
                       "; ".join("%s `%s`" % (role, who)
                                 for role, who in undecidable)))
                row["evidence"].append(detail)
                findings.add("authorship-bar-undecidable", rec["record"],
                             detail, rec["record"])
            else:
                row["gates"]["promoter_not_author_or_repairer"] = True
                row["evidence"].append(
                    "promoter `%s` matches none of this record's %d recorded "
                    "part(y/ies) - author (`%s`) and every `repaired:` entry "
                    "(%s)"
                    % (promoter, len(parties), row["author"],
                       ", ".join("`%s`" % w for w in repairers) or "none"))

        # gate 3 -- `unsound`/`unsettleable` always need a human.
        # Derived from the record body, so a repaired-and-promoted instrument
        # still shows the classifier it is leaving behind.
        tainted = []
        body_lines = rec["body"].split("\n")
        for value in ("unsound", "unsettleable"):
            for n, line in enumerate(body_lines, 1):
                if re.search(r"\b%s\b" % value, line):
                    tainted.append({
                        "classifier": value,
                        "at": "%s body line %d" % (rec["record"], n),
                        "quote": clip_text(line, 140),
                    })
                    break
        current = rec.get("dormant_because")
        if isinstance(current, str) and current in ("unsound", "unsettleable"):
            tainted.append({
                "classifier": current,
                "at": "%s frontmatter `dormant_because`" % rec["record"],
                "quote": "dormant_because: %s" % current,
            })
        if tainted:
            row["gates"]["free_of_unsound_or_unsettleable_history"] = False
            row["requires_human"] = True
            row["unsound_or_unsettleable_history"] = tainted
            row["evidence"].append(
                "operator decision 3: `unsound`/`unsettleable` are flagged for a "
                "human and NEVER auto-promoted; this record's history records "
                "`%s`" % "`, `".join(sorted(set(t["classifier"] for t in tainted))))
        else:
            row["gates"]["free_of_unsound_or_unsettleable_history"] = True
            row["requires_human"] = False

        # Open questions blocking this instrument also bar auto-promotion.
        markers = instrument_markers(rec)
        open_qs = [q["path"] for q in questions
                   if not q["answered"] and names_instrument(q["text"], markers)]
        if open_qs:
            row["gates"]["no_open_question"] = False
            row["open_questions"] = sorted(open_qs)
            row["requires_human"] = True
            row["evidence"].append(
                "unanswered operator question(s) name this instrument: %s"
                % ", ".join(sorted(open_qs)))
        else:
            row["gates"]["no_open_question"] = True

        values = list(row["gates"].values())
        if False in values:
            row["eligible"] = False
            row["why"] = ("at least one promotion gate is false; not eligible")
        elif UNKNOWN in values:
            row["eligible"] = UNKNOWN
            row["why"] = ("no gate is false, but at least one cannot be settled "
                          "from disk; `unknown`, never `eligible for promotion` "
                          "on absent evidence")
            findings.add("promotion-undecidable", rec["record"],
                         "promotion eligibility is `unknown`: %s"
                         % "; ".join(k for k, v in row["gates"].items()
                                     if v == UNKNOWN), rec["record"])
        else:
            row["eligible"] = True
            row["why"] = "every promotion gate is settled true from disk"
        if row["requires_human"] is UNKNOWN:
            row["requires_human"] = False
        out.append(row)
    return out


# --------------------------------------------------------------------------
# assembly
# --------------------------------------------------------------------------


def build(root):
    findings = Findings()
    concepts = concept_index(root)
    records = load_records(root, findings)
    for rec in records:
        validate_record(root, rec, concepts, findings)

    have = {}
    for sub in ("_orch/verify", "_orch/inbox", "_orch/nodes", "_orch/phases"):
        have[sub] = os.path.isdir(os.path.join(root, sub))
        if not have[sub]:
            findings.add("corpus-dir-absent", sub,
                         "no such directory under the corpus root; every value "
                         "derived from it reads `unknown` or empty, never a pass")

    phases = count_runs(root)
    order = ledger_order(root)
    questions = load_questions(root)
    lineages = load_verdicts(root, findings)

    yield_rows = build_yield(root, records, questions, findings, phases, order,
                             concepts, have["_orch/inbox"], have["_orch/nodes"])
    split = build_split(root, lineages, questions, findings)
    wake = build_wake_list(root, records, yield_rows, findings, phases)
    never_woken = build_never_woken(root, records, yield_rows, findings, phases)
    promotion = build_promotion(root, records, findings, questions)

    # health, last, so every finding raised above is visible to it
    health_rows = []
    for rec in records:
        attached = findings.for_instrument(rec["record"])
        if not rec["parsed"]:
            state = UNKNOWN
            why = "the record does not parse; nothing about it is known"
        elif attached:
            state = "needs-re-verification"
            why = ("%d finding(s) attached to this record: %s"
                   % (len(attached), ", ".join(sorted(set(f["kind"]
                                                          for f in attached)))))
        else:
            state = "healthy"
            why = ("record parses, status is in the enum, `dormant_because` is "
                   "consistent with it, `guards` resolves, and no finding is "
                   "attached")
        health_rows.append({
            "instrument": rec["key"],
            "record": rec["record"],
            "status": rec["status"] if rec["parsed"] else UNKNOWN,
            "dormant_because": rec.get("dormant_because"),
            "guards_resolves_to": rec.get("guards") or [],
            "guards_resolution_mechanism": rec.get("guards_mechanism"),
            "health": state,
            "why": why,
        })

    finding_rows = findings.sorted_rows()
    split_counts = {}
    for entry in split:
        split_counts[entry["classification"]] = split_counts.get(
            entry["classification"], 0) + 1

    needs = len([h for h in health_rows if h["health"] != "healthy"])

    return {
        "schema": SCHEMA,
        "root": os.path.abspath(root),
        "rules": {
            "fail_toward": "Where evidence is absent this tool emits `unknown` "
                           "plus a finding and counts the row as "
                           "needs-re-verification. It never emits `eligible for "
                           "promotion`, `active`, `productive` or `healthy` on "
                           "absent evidence.",
            "productive_defective_split": (
                "For each REFUTED row, find the node's successor verdict and "
                "compare the same position. (1) criterion text DIFFERS -> "
                "test-changing. (2) criterion text IDENTICAL and now CONFIRMED -> "
                "product-changing. (3) no successor but the corpus declares the "
                "criterion the defect (phrases %s, in the row's own "
                "probe/attack/evidence or in an `_orch/inbox/Q-*.md` whose "
                "`Blocks:` line names the node) -> test-changing (declared). "
                "(4) otherwise -> unknown plus a finding."
                % ", ".join("`%s`" % p for p in DECLARED_DEFECT_PHRASES)),
            "dormant_because_enum": list(DORMANT_BECAUSE_ENUM),
            "status_enum": list(STATUS_ENUM),
            "attack_field": "CONTRACT §9.1's `attack` key is optional. Present or "
                            "absent, a row is well-formed; neither is a finding.",
            "never_woken_n_runs": NEVER_WOKEN_N_RUNS,
            "sample_every_n_runs": SAMPLE_EVERY_N_RUNS,
            "run_definition": "one directory under `_orch/phases/`; corpus-"
                              "derived, never a clock reading",
            "record_search_paths": list(RECORD_DIRS),
        },
        "counts": {
            "instrument_records": len(records),
            "records_unparseable": len([r for r in records if not r["parsed"]]),
            "healthy": len([h for h in health_rows if h["health"] == "healthy"]),
            "instruments_needing_re_verification": needs,
            "refuted_rows_examined": len(split),
            "split_test_changing": split_counts.get("test-changing", 0),
            "split_product_changing": split_counts.get("product-changing", 0),
            "split_unknown": split_counts.get(UNKNOWN, 0),
            "wake_now": len([i for g in wake.values() for i in g["instruments"]
                             if i["wake"] is True]),
            "never_woken_findings": len(never_woken),
            "eligible_for_promotion": len([p for p in promotion
                                           if p["eligible"] is True]),
            "runs_in_corpus": len(phases),
            "findings": len(finding_rows),
        },
        "instrument_health": health_rows,
        "yield_per_instrument": yield_rows,
        "productive_defective_split": split,
        "wake_list": wake,
        "never_woken_findings": never_woken,
        "promotion_eligibility": promotion,
        "findings": finding_rows,
    }


# --------------------------------------------------------------------------
# the human view -- 60 lines is the hard ceiling
# --------------------------------------------------------------------------


def clip_rows(rows, render):
    out = [render(r) for r in rows[:MAX_LIST_IN_SUMMARY]]
    if len(rows) > MAX_LIST_IN_SUMMARY:
        out.append("- ... and %d more (see instruments.json)"
                   % (len(rows) - MAX_LIST_IN_SUMMARY))
    if not out:
        out.append("- none")
    return out


def render_summary(index):
    counts = index["counts"]
    lines = [
        "# baton instrument scorecard",
        "",
        "Derived from the Instrument records and `_orch/`; delete "
        "`_orch/instruments/` and it rebuilds. No clock, no state written.",
        "Absent evidence reads `unknown` plus a finding, never a pass.",
        "",
        "%d record(s) (%d unparseable) - %d healthy, %d needing "
        "re-verification, %d eligible for promotion. %d REFUTED examined, %d "
        "unsplittable. %d finding(s) over %d run(s)."
        % (counts["instrument_records"], counts["records_unparseable"],
           counts["healthy"], counts["instruments_needing_re_verification"],
           counts["eligible_for_promotion"], counts["refuted_rows_examined"],
           counts["split_unknown"], counts["findings"],
           counts["runs_in_corpus"]),
        "",
        "## 1. Yield per instrument",
    ]
    lines += clip_rows(index["yield_per_instrument"],
                       lambda r: "- `%s` (%s) - %s defect(s) caught, %s "
                                 "re-verification(s), last fired: %s"
                                 % (r["instrument"], r["status"],
                                    r["defects_caught_lifetime"],
                                    r["re_verifications_caused"],
                                    r["last_fired"]))
    lines.append("")
    lines.append("## 2. Productive/defective split (%d REFUTED examined)"
                 % counts["refuted_rows_examined"])
    lines.append("- %d product-changing, %d test-changing, %d unknown"
                 % (counts["split_product_changing"],
                    counts["split_test_changing"], counts["split_unknown"]))
    lines += clip_rows([e for e in index["productive_defective_split"]
                        if e["classification"] != "product-changing"],
                       lambda e: "- %s `%s`%s - %s"
                                 % (e["classification"], e["verdict_path"],
                                    "" if e["row_index"] is None
                                    else " row %d" % e["row_index"],
                                    e["signal"] or "no signal"))
    lines.append("")
    lines.append("## 3. Wake list (by classifier)")
    for value in list(DORMANT_BECAUSE_ENUM) + [UNKNOWN]:
        group = index["wake_list"].get(value, {})
        rows = group.get("instruments", [])
        if not rows:
            continue
        lines.append("- `%s`: %s" % (value, ", ".join(
            "`%s` wake=%s" % (r["instrument"], r["wake"]) for r in rows)))
    if not any(index["wake_list"][v]["instruments"] for v in index["wake_list"]):
        lines.append("- no dormant instrument in this corpus")
    lines.append("")
    lines.append("## 4. Never-woken findings (%d)"
                 % counts["never_woken_findings"])
    lines += clip_rows(index["never_woken_findings"],
                       lambda r: "- `%s` - last fired: %s"
                                 % (r["instrument"], r["last_fired"]))
    lines.append("")
    lines.append("## 5. Promotion eligibility")
    lines += clip_rows(index["promotion_eligibility"],
                       lambda r: "- `%s` eligible=%s human=%s - %s"
                                 % (r["instrument"], r["eligible"],
                                    r["requires_human"], r.get("why", "")))
    lines.append("")
    lines.append("## Findings (%d)" % counts["findings"])
    lines += clip_rows(index["findings"],
                       lambda r: "- %s `%s` - %s"
                                 % (r["kind"], r["file"], clip_text(r["detail"], 110)))
    return lines


def trim_to_ceiling(lines, ceiling=SUMMARY_CEILING):
    if len(lines) <= ceiling:
        return lines
    kept = lines[: ceiling - 1]
    while kept and not kept[-1].strip():
        kept.pop()
    kept.append("_(truncated to the %d-line ceiling; instruments.json is complete)_"
                % ceiling)
    return kept


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------


def main(argv):
    root = discover_root(argv)
    index = build(root)

    out_dir = os.path.join(root, "_orch", "instruments")
    try:
        os.makedirs(out_dir)
    except OSError:
        if not os.path.isdir(out_dir):
            sys.stderr.write("instruments: cannot create %s\n" % out_dir)
            return 0

    payload = json.dumps(index, indent=2, ensure_ascii=False,
                         sort_keys=False) + "\n"
    summary = "\n".join(trim_to_ceiling(render_summary(index))) + "\n"
    try:
        with open(os.path.join(out_dir, "instruments.json"), "w",
                  encoding="utf-8") as handle:
            handle.write(payload)
        with open(os.path.join(out_dir, "summary.md"), "w",
                  encoding="utf-8") as handle:
            handle.write(summary)
    except OSError as exc:
        sys.stderr.write("instruments: cannot write into %s (%s)\n"
                         % (out_dir, exc))
        return 0

    counts = index["counts"]
    sys.stdout.write(
        "instruments: %s\n"
        "  %d record(s), %d unparseable  %d healthy  %d needs-re-verification\n"
        "  split: %d product-changing  %d test-changing  %d unknown "
        "(of %d REFUTED)\n"
        "  %d wake now  %d never-woken finding(s)  %d eligible for promotion\n"
        "  %d finding(s)\n"
        "  wrote %s and %s\n"
        % (os.path.abspath(root), counts["instrument_records"],
           counts["records_unparseable"], counts["healthy"],
           counts["instruments_needing_re_verification"],
           counts["split_product_changing"],
           counts["split_test_changing"], counts["split_unknown"],
           counts["refuted_rows_examined"], counts["wake_now"],
           counts["never_woken_findings"], counts["eligible_for_promotion"],
           counts["findings"],
           rel(root, os.path.join(out_dir, "instruments.json")),
           rel(root, os.path.join(out_dir, "summary.md"))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
