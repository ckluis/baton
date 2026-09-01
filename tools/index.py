#!/usr/bin/env python3
"""baton run index - answers the five resume questions off disk, in one command.

    python3 tools/index.py            # run from the repo root
    python3 tools/index.py <root>     # or point it at another corpus root

It reads `_orch/nodes/*/status.json`, `_orch/verify/*.json`, `_orch/ledger.csv`,
`_orch/plan/graph.yaml` and `_orch/inbox/`, and writes exactly two files, both
under `_orch/index/`:

    _orch/index/index.json   the machine view
    _orch/index/summary.md   the human view, 60 lines or fewer

The five questions, one section each in both outputs:

    1. `pending`               what has not run yet
    2. `done_unconfirmed`      what is DONE with no CONFIRMED verdict - the rows
                               a resume must re-verify (CONTRACT §4.1: DONE
                               alone is a guess with a filename)
    3. `blocked`               what is parked on an operator decision
    4. `unanswered_questions`  `_orch/inbox/Q-<n>.md` with no `Q-<n>.answer.md`
    5. `rung_histogram`        rows per rung from `_orch/ledger.csv` (CONTRACT §7)

DERIVED, NEVER AUTHORITATIVE.  Everything here is recomputed from the files under
`_orch/` on every run.  `_orch/index/` is a cache and nothing else: deleting it
loses nothing, and the next run rebuilds it byte for byte.  The files under
`_orch/` stay the source of truth, and this tool never writes outside
`_orch/index/` - not a `status.json`, not a verdict, not the ledger.  A tool that
mutates run state while diagnosing it is a liability.

NO CLOCK.  No field is a wall-clock reading; every field is derived from the
corpus, so two runs over an unchanged corpus are byte-identical under `cmp`.
That is deliberate: a `generated_at` field would make the tool's own output churn
and defeat the comparison.

NEVER CRASHES.  Truncated JSON, an absent `status.json`, a node directory holding
only `started_at`, a verdict whose rows disagree with its node verdict - each is a
row in `findings`, never a traceback.  The script exits 0 on a corpus it cannot
fully parse, because a resume needs the partial answer more than it needs the
error.

VERIFIER SPAWN DIRECTORIES.  A directory under `_orch/nodes/` whose name ends in
`-verify` optionally followed by digits - `P10-verify`, `F1.4-verify2`,
`P76-verify5` - is a verifier's own spawn directory, not a plan node.  The rule
this script uses: such directories are EXCLUDED from the plan-node classification
entirely (they never appear in `pending`, `terminal`, `done_unconfirmed`,
`blocked` or `other_verdicts`) and are counted on their own under
`counts.verifier_spawns`, with the list in `verifier_spawns`.  The reason is that
a verifier killed before writing its envelope is not pending plan work - what is
actually pending is the verdict for the node it was checking, and that node
already shows up in `done_unconfirmed`.  Counting the spawn as well would report
the same gap twice.  Their `handoff.md` files are still read, as one source of
the done-criterion count that a verdict's row count is checked against.

WHAT A VERDICT FILE IS.  `_orch/verify/<node>-verdict.json` is the sweep verdict
for `<node>`.  `<node>-verdict-<n>.json` is the n-th re-verification and the
highest `<n>` present wins; `<node>-verdict.superseded-by-<x>.json` is retired
history and is ignored for classification.  A file that is not named
`*-verdict*.json` - `P11-audit-test-honesty.md`, `F1-quota-audit.json` - is an
audit, not a verdict, and is listed under `non_verdict_files` without comment.
A verdict carrying a `criteria` list is a sweep verdict (CONTRACT §9.1) and is the
only kind that can make a node terminal; one without a `criteria` list is a
single-claim verdict from a seated persona or a requirement row, which CONTRACT
§9.1 keeps in its own shape, so it is recorded under `single_claim_verdicts` and
never confirms a node on its own.

VERDICT SHAPE (CONTRACT §9.1).  A sweep verdict's node verdict is computed from
its rows - all CONFIRMED -> CONFIRMED, any REFUTED -> REFUTED, any UNTESTED and
none REFUTED -> PARTIAL.  A verdict whose asserted node verdict disagrees with
that computation, or whose row count matches no done-criterion count in the
node's own handoff or its verifier spawn's handoff, is malformed: it reads as
PARTIAL, it does not confirm, and the mismatch is reported in `findings` naming
the file.

This script imports only the Python standard library, takes no ambient
configuration of any kind, and is standalone: nothing in baton has to be running
for it to work.
"""

import csv
import json
import os
import re
import sys

# --------------------------------------------------------------------------
# constants
# --------------------------------------------------------------------------

SCHEMA = "baton-index/1"

DONE_VERDICTS = ("DONE", "DONE-WITH-CAVEATS")
ROW_VERDICTS = ("CONFIRMED", "REFUTED", "UNTESTED")

VERIFIER_DIR_RE = re.compile(r"-verify\d*$")
VERDICT_FILE_RE = re.compile(
    r"^(?P<node>.+)-verdict(?:-(?P<seq>\d+))?"
    r"(?:\.superseded-by-(?P<sup>[^.]+))?\.json$"
)
QUESTION_FILE_RE = re.compile(r"^(Q-[^.]+)\.md$")
CRITERIA_HEADING_RE = re.compile(
    r"^\s{0,3}#{2,4}\s+(?:child\s+|parent\s+)?done[-\s]criteri", re.IGNORECASE
)
ANY_HEADING_RE = re.compile(r"^\s{0,3}#{1,4}\s")
NUMBERED_ITEM_RE = re.compile(r"^\d+\.\s")
GRAPH_ID_RE = re.compile(r"^-\s+id:\s*(\S+)\s*$")
GRAPH_KEY_RE = re.compile(r"^\s+(phase|title|rung|kind):\s*(.*?)\s*$")
FRONTMATTER_STATUS_RE = re.compile(r"^status:\s*(.*?)\s*$")

MAX_LIST_IN_SUMMARY = 8

# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------


def natural_key(text):
    """Sort key that orders F1.2 before F1.10 and is stable for any string."""
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
    """Path relative to the corpus root, with forward slashes, for the output."""
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


class Findings(object):
    """Accumulates every malformation the run met. Ordered, so output is stable."""

    def __init__(self):
        self.rows = []

    def add(self, kind, target, detail):
        self.rows.append({"kind": kind, "file": target, "detail": detail})

    def sorted_rows(self):
        return sorted(
            self.rows,
            key=lambda r: (r["kind"], natural_key(r["file"]), r["detail"]),
        )


# --------------------------------------------------------------------------
# corpus root discovery -- from the argument, the working directory, or the
# script's own location. Never from ambient settings.
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
# graph.yaml -- only the subset we need, hand-parsed, never fatal
# --------------------------------------------------------------------------


def load_graph(path, findings, root):
    """Return {node_id: {phase, title, rung, kind}} from the flat `- id:` list."""
    nodes = {}
    text = read_text(path)
    if text is None:
        findings.add(
            "graph-absent",
            rel(root, path),
            "no graph.yaml; plan nodes that never got a directory cannot be listed",
        )
        return nodes
    current = None
    for line in text.split("\n"):
        match = GRAPH_ID_RE.match(line)
        if match:
            current = match.group(1).strip().strip("\"'")
            nodes.setdefault(current, {"phase": None, "title": None,
                                       "rung": None, "kind": None})
            continue
        if current is None:
            continue
        if line and not line.startswith((" ", "\t")):
            current = None
            continue
        keyed = GRAPH_KEY_RE.match(line)
        if not keyed:
            continue
        key, raw = keyed.group(1), keyed.group(2).strip().strip("\"'")
        if key in ("phase", "rung"):
            try:
                nodes[current][key] = int(raw)
            except ValueError:
                nodes[current][key] = raw or None
        else:
            nodes[current][key] = raw or None
    if not nodes:
        findings.add(
            "graph-unparsed",
            rel(root, path),
            "graph.yaml carried no `- id:` entries this parser could read",
        )
    return nodes


# --------------------------------------------------------------------------
# done-criterion counts, used only to check a verdict's row count
# --------------------------------------------------------------------------


def criterion_counts(handoff_path):
    """Every done-criteria block's item count in one handoff. [] when unknown."""
    text = read_text(handoff_path)
    if text is None:
        return []
    lines = text.split("\n")
    counts = []
    for i, line in enumerate(lines):
        if not CRITERIA_HEADING_RE.match(line):
            continue
        count = 0
        for follow in lines[i + 1:]:
            if ANY_HEADING_RE.match(follow):
                break
            if NUMBERED_ITEM_RE.match(follow):
                count += 1
        if count:
            counts.append(count)
    return counts


def expected_counts(nodes_dir, node_id):
    """Criterion counts from the node's handoff and its verifier spawn's handoff.

    A verifier is briefed by its own handoff, which regularly restates or regroups
    the node's criteria, so either count is a legitimate row count for a verdict.
    """
    found = list(criterion_counts(os.path.join(nodes_dir, node_id, "handoff.md")))
    sibling = re.compile(r"^" + re.escape(node_id) + r"(?:-verify\d*|V\d*)$")
    for name in listdir(nodes_dir):
        if name != node_id and sibling.match(name):
            found.extend(criterion_counts(os.path.join(nodes_dir, name, "handoff.md")))
    return sorted(set(found))


# --------------------------------------------------------------------------
# verdicts
# --------------------------------------------------------------------------


def compute_node_verdict(rows):
    """CONTRACT §9.1's table. Returns (computed, row_verdicts, unreadable_rows)."""
    seen = []
    unreadable = 0
    for row in rows:
        if isinstance(row, dict) and isinstance(row.get("verdict"), str):
            seen.append(row["verdict"].strip().upper())
        else:
            unreadable += 1
    if unreadable or not seen:
        return "PARTIAL", seen, unreadable
    if any(v == "REFUTED" for v in seen):
        return "REFUTED", seen, unreadable
    if all(v == "CONFIRMED" for v in seen):
        return "CONFIRMED", seen, unreadable
    return "PARTIAL", seen, unreadable


def load_verdicts(verify_dir, nodes_dir, findings, root):
    """Read `_orch/verify/`. Returns (per-node sweep records, extras dict)."""
    sweep = {}
    single_claim = []
    superseded = []
    non_verdict = []
    for name in listdir(verify_dir):
        path = os.path.join(verify_dir, name)
        if not os.path.isfile(path):
            continue
        match = VERDICT_FILE_RE.match(name)
        if not match:
            non_verdict.append(rel(root, path))
            continue
        node_id = match.group("node")
        seq = int(match.group("seq")) if match.group("seq") else 1
        if match.group("sup"):
            superseded.append({"node": node_id, "file": rel(root, path),
                               "superseded_by": match.group("sup")})
            continue
        text = read_text(path)
        if text is None:
            findings.add("verdict-unreadable", rel(root, path),
                         "verdict file could not be read from disk")
            continue
        try:
            data = json.loads(text)
        except ValueError as exc:
            findings.add("verdict-unparseable", rel(root, path),
                         "not valid JSON (%s); reads as PARTIAL" % str(exc)[:120])
            sweep.setdefault(node_id, []).append(
                {"file": rel(root, path), "seq": seq, "effective": "PARTIAL",
                 "asserted": None, "rows": None, "malformed": True,
                 "malformation": "file is not valid JSON"})
            continue
        if not isinstance(data, dict):
            findings.add("verdict-shape", rel(root, path),
                         "top level is %s, not an object; reads as PARTIAL"
                         % type(data).__name__)
            sweep.setdefault(node_id, []).append(
                {"file": rel(root, path), "seq": seq, "effective": "PARTIAL",
                 "asserted": None, "rows": None, "malformed": True,
                 "malformation": "top level is not a JSON object"})
            continue
        asserted = data.get("verdict")
        asserted = asserted.strip().upper() if isinstance(asserted, str) else None
        criteria = data.get("criteria")
        if not isinstance(criteria, list):
            single_claim.append({"node": node_id, "file": rel(root, path),
                                 "verdict": asserted,
                                 "note": "no `criteria` list: single-claim verdict "
                                         "(CONTRACT §9.1), never confirms a node"})
            continue
        computed, _row_verdicts, unreadable = compute_node_verdict(criteria)
        problems = []
        if unreadable:
            problems.append("%d of %d rows carry no readable `verdict`"
                            % (unreadable, len(criteria)))
        if asserted != computed:
            problems.append("node verdict is %r but the %d rows compute to %r"
                            % (asserted, len(criteria), computed))
        allowed = expected_counts(nodes_dir, node_id)
        if allowed and len(criteria) not in allowed:
            problems.append("%d rows, but the handoff states %s done-criteria"
                            % (len(criteria),
                               " or ".join(str(a) for a in allowed)))
        record = {"file": rel(root, path), "seq": seq, "asserted": asserted,
                  "computed": computed, "rows": len(criteria),
                  "criteria_counts_in_handoff": allowed,
                  "malformed": bool(problems),
                  "malformation": "; ".join(problems) or None,
                  "effective": "PARTIAL" if problems else computed}
        if problems:
            findings.add("verdict-malformed", rel(root, path),
                         "%s; malformed, so it reads as PARTIAL (CONTRACT §9.1)"
                         % "; ".join(problems))
        sweep.setdefault(node_id, []).append(record)
    for node_id in sweep:
        sweep[node_id].sort(key=lambda r: (r["seq"], r["file"]))
    extras = {"single_claim_verdicts": sorted(
                  single_claim, key=lambda r: natural_key(r["file"])),
              "superseded_verdicts": sorted(
                  superseded, key=lambda r: natural_key(r["file"])),
              "non_verdict_files": sorted(non_verdict, key=natural_key)}
    return sweep, extras


def effective_verdict(records):
    """The winning sweep verdict for a node: the highest re-verification present."""
    if not records:
        return None
    return records[-1]


# --------------------------------------------------------------------------
# statuses
# --------------------------------------------------------------------------


def load_status(node_dir, node_id, findings, root):
    """Returns (verdict, status_dict, pending_reason). CONTRACT §2."""
    path = os.path.join(node_dir, "status.json")
    if not os.path.isfile(path):
        return None, None, "no status.json"
    text = read_text(path)
    if text is None:
        findings.add("status-unreadable", rel(root, path),
                     "status.json could not be read; node reads as pending")
        return None, None, "status.json could not be read"
    try:
        data = json.loads(text)
    except ValueError as exc:
        findings.add("status-unparseable", rel(root, path),
                     "status.json is not valid JSON (%s); node reads as pending"
                     % str(exc)[:120])
        return None, None, "status.json is not valid JSON"
    if not isinstance(data, dict):
        findings.add("status-shape", rel(root, path),
                     "status.json top level is %s, not an object; reads as pending"
                     % type(data).__name__)
        return None, None, "status.json is not a JSON object"
    verdict = data.get("verdict")
    if not isinstance(verdict, str) or not verdict.strip():
        findings.add("status-no-verdict", rel(root, path),
                     "status.json carries no `verdict` field; node reads as pending")
        return None, data, "status.json carries no `verdict`"
    if isinstance(data.get("node"), str) and data["node"].strip() != node_id:
        findings.add("status-node-mismatch", rel(root, path),
                     "envelope names node %r but sits in %s/"
                     % (data["node"].strip(), node_id))
    return verdict.strip().upper(), data, None


def first_sentence(text, limit=160):
    if not isinstance(text, str):
        return None
    flat = " ".join(text.split())
    if not flat:
        return None
    cut = flat.split(". ")[0].rstrip(".")
    if len(cut) > limit:
        cut = cut[:limit - 1].rstrip() + "…"
    return cut


# --------------------------------------------------------------------------
# inbox
# --------------------------------------------------------------------------


def load_inbox(inbox_dir, findings, root):
    unanswered = []
    answered = []
    names = set(listdir(inbox_dir))
    for name in sorted(names, key=natural_key):
        match = QUESTION_FILE_RE.match(name)
        if not match:
            continue
        qid = match.group(1)
        path = os.path.join(inbox_dir, name)
        answer_name = "%s.answer.md" % qid
        has_answer = answer_name in names
        text = read_text(path)
        declared = None
        if text is not None:
            lines = text.split("\n")
            if lines and lines[0].strip() == "---":
                for line in lines[1:]:
                    if line.strip() == "---":
                        break
                    hit = FRONTMATTER_STATUS_RE.match(line)
                    if hit:
                        declared = hit.group(1).strip().strip("\"'") or None
                        break
        else:
            findings.add("question-unreadable", rel(root, path),
                         "inbox question could not be read")
        row = {"id": qid, "file": rel(root, path),
               "answer_file": rel(root, os.path.join(inbox_dir, answer_name))
                              if has_answer else None,
               "frontmatter_status": declared}
        if declared:
            lowered = declared.lower()
            if lowered in ("answered", "closed", "resolved") and not has_answer:
                findings.add(
                    "question-signal-disagreement", rel(root, path),
                    "frontmatter says status: %s but no %s exists; counted as "
                    "unanswered on the file evidence" % (declared, answer_name))
            elif lowered in ("open", "unanswered", "parked") and has_answer:
                findings.add(
                    "question-signal-disagreement", rel(root, path),
                    "frontmatter says status: %s but %s exists; counted as "
                    "answered on the file evidence" % (declared, answer_name))
        if has_answer:
            answered.append(row)
        else:
            unanswered.append(row)
    return unanswered, answered


# --------------------------------------------------------------------------
# ledger
# --------------------------------------------------------------------------


def load_ledger(path, findings, root):
    """Rung histogram from the `rung` column. Survives short and malformed rows."""
    histogram = {}
    total = 0
    skipped = 0
    text = read_text(path)
    if text is None:
        findings.add("ledger-absent", rel(root, path),
                     "no ledger.csv; the rung histogram is empty")
        return {"by_rung": {}, "rows_counted": 0, "rows_unparsed": 0,
                "source": rel(root, path)}
    try:
        rows = list(csv.reader(text.splitlines()))
    except (csv.Error, ValueError) as exc:
        findings.add("ledger-unparseable", rel(root, path),
                     "ledger.csv could not be parsed as CSV (%s)" % str(exc)[:120])
        return {"by_rung": {}, "rows_counted": 0, "rows_unparsed": 0,
                "source": rel(root, path)}
    if not rows:
        return {"by_rung": {}, "rows_counted": 0, "rows_unparsed": 0,
                "source": rel(root, path)}
    header = [c.strip() for c in rows[0]]
    try:
        column = header.index("rung")
    except ValueError:
        column = 2
        findings.add("ledger-header", rel(root, path),
                     "header row names no `rung` column; fell back to column 3")
    for number, row in enumerate(rows[1:], start=2):
        if not row or not any(c.strip() for c in row):
            continue
        if len(row) <= column:
            skipped += 1
            findings.add("ledger-short-row", "%s:%d" % (rel(root, path), number),
                         "row has %d field(s), fewer than the %d the rung column "
                         "needs; skipped, not counted" % (len(row), column + 1))
            continue
        value = row[column].strip()
        if not value:
            value = "(blank)"
        histogram[value] = histogram.get(value, 0) + 1
        total += 1
    ordered = {}
    for key in sorted(histogram, key=natural_key):
        ordered[key] = histogram[key]
    return {"by_rung": ordered, "rows_counted": total, "rows_unparsed": skipped,
            "source": rel(root, path)}


# --------------------------------------------------------------------------
# the index itself
# --------------------------------------------------------------------------


def build_index(root):
    findings = Findings()
    orch = os.path.join(root, "_orch")
    nodes_dir = os.path.join(orch, "nodes")
    verify_dir = os.path.join(orch, "verify")
    inbox_dir = os.path.join(orch, "inbox")

    if not os.path.isdir(orch):
        findings.add("corpus-absent", rel(root, orch),
                     "no `_orch/` under the corpus root; every section is empty")

    graph = load_graph(os.path.join(orch, "plan", "graph.yaml"), findings, root)
    sweep, extras = load_verdicts(verify_dir, nodes_dir, findings, root)
    unanswered, answered = load_inbox(inbox_dir, findings, root)
    ledger = load_ledger(os.path.join(orch, "ledger.csv"), findings, root)

    pending, terminal, done_unconfirmed, blocked = [], [], [], []
    other = {}
    verifier_spawns = []
    seen_dirs = []

    for name in listdir(nodes_dir):
        node_path = os.path.join(nodes_dir, name)
        if not os.path.isdir(node_path):
            continue
        seen_dirs.append(name)
        if VERIFIER_DIR_RE.search(name):
            verifier_spawns.append(name)
            continue

        meta = graph.get(name, {})
        base = {"node": name}
        if meta.get("phase") is not None:
            base["phase"] = meta["phase"]
        if meta.get("title"):
            base["title"] = meta["title"]

        verdict, status, why_pending = load_status(node_path, name, findings, root)
        if verdict is None:
            row = dict(base)
            row["reason"] = why_pending
            row["has_started_at"] = os.path.isfile(
                os.path.join(node_path, "started_at"))
            pending.append(row)
            continue

        if verdict in DONE_VERDICTS:
            winner = effective_verdict(sweep.get(name, []))
            row = dict(base)
            row["status"] = verdict
            if winner is not None and winner["effective"] == "CONFIRMED":
                row["verdict"] = "CONFIRMED"
                row["verdict_file"] = winner["file"]
                terminal.append(row)
            else:
                if winner is None:
                    row["verdict"] = None
                    row["verdict_file"] = None
                    row["why"] = ("no sweep verdict file under _orch/verify/ - "
                                  "DONE alone is not terminal (CONTRACT §4.1)")
                else:
                    row["verdict"] = winner["effective"]
                    row["verdict_file"] = winner["file"]
                    if winner["malformed"]:
                        row["why"] = ("its only current verdict is malformed and "
                                      "reads as PARTIAL: %s" % winner["malformation"])
                    else:
                        row["why"] = ("its current verdict reads %s, not CONFIRMED"
                                      % winner["effective"])
                claims = extras["single_claim_verdicts"]
                if any(c["node"] == name for c in claims):
                    row["note"] = ("a single-claim verdict exists for this node; "
                                   "CONTRACT §9.1 does not let it stand in for a "
                                   "sweep")
                done_unconfirmed.append(row)
            continue

        if verdict == "BLOCKED":
            row = dict(base)
            row["status"] = verdict
            row["summary"] = first_sentence(
                (status or {}).get("summary")) if status else None
            blocked.append(row)
            continue

        row = dict(base)
        row["status"] = verdict
        row["summary"] = first_sentence((status or {}).get("summary")) if status else None
        other.setdefault(verdict, []).append(row)

    known = set(seen_dirs)
    for node_id in sorted(graph, key=natural_key):
        if node_id in known:
            continue
        meta = graph[node_id]
        row = {"node": node_id, "reason": "declared in graph.yaml, no node directory"}
        if meta.get("phase") is not None:
            row["phase"] = meta["phase"]
        if meta.get("title"):
            row["title"] = meta["title"]
        row["has_started_at"] = False
        pending.append(row)

    for bucket in (pending, terminal, done_unconfirmed, blocked):
        bucket.sort(key=lambda r: natural_key(r["node"]))
    ordered_other = {}
    for key in sorted(other, key=natural_key):
        ordered_other[key] = sorted(other[key], key=lambda r: natural_key(r["node"]))

    verdict_files = sum(len(v) for v in sweep.values())
    finding_rows = findings.sorted_rows()

    index = {
        "schema": SCHEMA,
        "corpus_root": os.path.abspath(root),
        "counts": {
            "node_directories": len(seen_dirs),
            "plan_nodes": len(seen_dirs) - len(verifier_spawns),
            "verifier_spawns": len(verifier_spawns),
            "graph_nodes": len(graph),
            "pending": len(pending),
            "terminal": len(terminal),
            "done_unconfirmed": len(done_unconfirmed),
            "blocked": len(blocked),
            "other": sum(len(v) for v in ordered_other.values()),
            "sweep_verdict_files": verdict_files,
            "single_claim_verdicts": len(extras["single_claim_verdicts"]),
            "superseded_verdicts": len(extras["superseded_verdicts"]),
            "non_verdict_files": len(extras["non_verdict_files"]),
            "questions_unanswered": len(unanswered),
            "questions_answered": len(answered),
            "ledger_rows": ledger["rows_counted"],
            "findings": len(finding_rows),
        },
        "pending": pending,
        "done_unconfirmed": done_unconfirmed,
        "blocked": blocked,
        "unanswered_questions": unanswered,
        "rung_histogram": ledger,
        "terminal": terminal,
        "other_verdicts": ordered_other,
        "answered_questions": answered,
        "verifier_spawns": sorted(verifier_spawns, key=natural_key),
        "single_claim_verdicts": extras["single_claim_verdicts"],
        "superseded_verdicts": extras["superseded_verdicts"],
        "non_verdict_files": extras["non_verdict_files"],
        "findings": finding_rows,
    }
    return index


# --------------------------------------------------------------------------
# the human view -- 60 lines is the hard ceiling
# --------------------------------------------------------------------------


def clip(rows, render):
    out = [render(r) for r in rows[:MAX_LIST_IN_SUMMARY]]
    if len(rows) > MAX_LIST_IN_SUMMARY:
        out.append("- ... and %d more (see index.json)"
                   % (len(rows) - MAX_LIST_IN_SUMMARY))
    if not out:
        out.append("- none")
    return out


def render_summary(index):
    counts = index["counts"]
    lines = ["# baton run index",
             "",
             "Derived from `_orch/`; delete `_orch/index/` and it rebuilds. "
             "No clock, no state written.",
             "",
             "%d node dirs (%d plan, %d verifier spawns) - %d terminal, %d pending, "
             "%d DONE-unconfirmed, %d blocked, %d findings."
             % (counts["node_directories"], counts["plan_nodes"],
                counts["verifier_spawns"], counts["terminal"], counts["pending"],
                counts["done_unconfirmed"], counts["blocked"], counts["findings"]),
             ""]

    lines.append("## DONE without CONFIRMED (%d) - resume re-verifies these"
                 % counts["done_unconfirmed"])
    lines += clip(index["done_unconfirmed"],
                  lambda r: "- `%s` %s - %s" % (r["node"], r.get("status", ""),
                                                r.get("why", "")))
    lines.append("")

    lines.append("## Pending (%d)" % counts["pending"])
    lines += clip(index["pending"],
                  lambda r: "- `%s` - %s" % (r["node"], r.get("reason", "")))
    lines.append("")

    lines.append("## Blocked (%d)" % counts["blocked"])
    lines += clip(index["blocked"],
                  lambda r: "- `%s` - %s" % (r["node"], r.get("summary") or "no summary"))
    lines.append("")

    lines.append("## Unanswered questions (%d)" % counts["questions_unanswered"])
    lines += clip(index["unanswered_questions"],
                  lambda r: "- `%s` - no answer file; frontmatter status: %s"
                            % (r["id"], r.get("frontmatter_status") or "(none)"))
    lines.append("")

    hist = index["rung_histogram"]
    cells = ", ".join("rung %s: %d" % (k, v) for k, v in hist["by_rung"].items())
    lines.append("## Rung histogram (%d ledger rows)" % hist["rows_counted"])
    lines.append("- %s" % (cells or "no rows"))
    if hist["rows_unparsed"]:
        lines.append("- %d row(s) too short to carry a rung; skipped"
                     % hist["rows_unparsed"])
    lines.append("")

    other = index["other_verdicts"]
    if other:
        lines.append("## Other verdicts")
        for key in other:
            lines.append("- %s: %s" % (key, ", ".join(
                "`%s`" % r["node"] for r in other[key][:MAX_LIST_IN_SUMMARY])))
        lines.append("")

    lines.append("## Findings (%d)" % counts["findings"])
    lines += clip(index["findings"],
                  lambda r: "- %s `%s` - %s" % (r["kind"], r["file"], r["detail"]))
    return lines


def trim_to_ceiling(lines, ceiling=60):
    """The markdown has a hard 60-line ceiling; drop from the tail if we near it."""
    if len(lines) <= ceiling:
        return lines
    kept = lines[:ceiling - 1]
    while kept and not kept[-1].strip():
        kept.pop()
    kept.append("_(truncated to the %d-line ceiling; index.json is complete)_"
                % ceiling)
    return kept


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------


def main(argv):
    root = discover_root(argv)
    index = build_index(root)

    out_dir = os.path.join(root, "_orch", "index")
    try:
        os.makedirs(out_dir)
    except OSError:
        if not os.path.isdir(out_dir):
            sys.stderr.write("index: cannot create %s\n" % out_dir)
            return 0

    payload = json.dumps(index, indent=2, ensure_ascii=False,
                         sort_keys=False) + "\n"
    summary = "\n".join(trim_to_ceiling(render_summary(index))) + "\n"
    try:
        with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as fh:
            fh.write(payload)
        with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as fh:
            fh.write(summary)
    except OSError as exc:
        sys.stderr.write("index: cannot write into %s (%s)\n" % (out_dir, exc))
        return 0

    counts = index["counts"]
    sys.stdout.write(
        "index: %s\n  %d pending  %d DONE-unconfirmed  %d blocked  "
        "%d unanswered questions  %d findings\n  wrote %s and %s\n"
        % (os.path.abspath(root), counts["pending"], counts["done_unconfirmed"],
           counts["blocked"], counts["questions_unanswered"], counts["findings"],
           rel(root, os.path.join(out_dir, "index.json")),
           rel(root, os.path.join(out_dir, "summary.md"))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
