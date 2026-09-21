#!/usr/bin/env python3
"""baton lists - the four append-only lists as directories of rows (CONTRACT §6.3).

    python3 tools/lists.py derive [--state-root _orch]    write each list file from its rows
    python3 tools/lists.py check  [--state-root _orch]    exit 1 if a list file != its rows
    python3 tools/lists.py split  <list> [--state-root]   once: file -> directory of rows
    python3 tools/lists.py --selftest                     fixtures, then the real corpus if present

The four lists, and the shape of a row in each:

    ledger          ledger/*.csv          -> ledger.csv          header line + one row
    lint-feedback   lint-feedback/*.yaml  -> lint-feedback.yaml  one `  - ` item under `entries:`
    ux-debt         ux-debt/*.yaml        -> ux-debt.yaml        same shape
    decisions       plan/decisions/*.md   -> plan/decisions.md   one `## ` section

THE DIRECTORY IS THE RECORD, THE FILE IS THE VIEW - the mirror image of
tools/index.py, and for the same reason: a file two layers append to is the only
place the layout ever let two writers collide (CONTRACT §7.2, ledger-clock.md).
A layer that has a row to add writes one new file and touches nothing else.
`derive` is the only thing that writes a list file, and it writes it from the
rows in sorted filename order, so the output is byte-for-byte reproducible.
`00-header.*` is reserved: the text a file carried before its first row (a yaml
header ending in `entries:`, a markdown preamble) lives there and sorts first.

`split` is the one-time migration for a run that began with the files: it keeps
the file's order by prefixing each row's name with its sequence, so `derive`
reproduces the original to the byte. Verified by --selftest on this
framework's own run.

Stdlib only. Never writes outside the state root. Never crashes on a corpus it
cannot parse: a row it cannot read is reported and skipped.
"""

import csv
import os
import re
import shutil
import sys
import tempfile

LISTS = {
    "ledger":        ("ledger",         "ledger.csv",         "csv"),
    "lint-feedback": ("lint-feedback",  "lint-feedback.yaml", "yaml"),
    "ux-debt":       ("ux-debt",        "ux-debt.yaml",       "yaml"),
    "decisions":     ("plan/decisions", "plan/decisions.md",  "md"),
}
HEADER_STEM = "00-header"
ITEM_RE = re.compile(r"^  - ")
SECTION_RE = re.compile(r"^## ")
YAML_HEADER_END_RE = re.compile(r"^entries:\s*$")


def read(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace", newline="") as fh:
            return fh.read()
    except OSError:
        return None


def write(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]", "", str(s)).strip("-.") or "x"


def nl(text):
    return text if text.endswith("\n") else text + "\n"


def row_files(dirpath, ext):
    try:
        names = sorted(os.listdir(dirpath))
    except OSError:
        return []
    return [n for n in names if n.endswith(ext) and not n.startswith(".")]


# --------------------------------------------------------------------------
# derive: rows -> file text
# --------------------------------------------------------------------------


def derive_text(kind, dirpath, problems):
    """The list file's text from its directory, or None if the directory is absent."""
    if not os.path.isdir(dirpath):
        return None
    ext = {"csv": ".csv", "yaml": ".yaml", "md": ".md"}[kind]
    names = row_files(dirpath, ext)
    header_name = HEADER_STEM + ext
    if kind == "csv":
        rows = [n for n in names if n != header_name]
        if not rows:
            return ""
        header = None
        body = []
        for n in rows:
            text = read(os.path.join(dirpath, n))
            if text is None or not text.strip():
                problems.append("%s: unreadable or empty row file" % n)
                continue
            lines = text.splitlines(True)
            first = lines[0].rstrip("\r\n")
            if header is None:
                header = first
            elif first != header:
                problems.append("%s: header %r differs from %r" % (n, first, header))
                continue
            body.extend(nl(line) for line in lines[1:] if line.strip())
        return (header + "\n" if header is not None else "") + "".join(body)
    header = read(os.path.join(dirpath, header_name)) if header_name in names else None
    if header is None:
        header = "entries:\n" if kind == "yaml" else ""
    parts = [nl(header)] if header else []
    for n in names:
        if n == header_name:
            continue
        text = read(os.path.join(dirpath, n))
        if text is None:
            problems.append("%s: unreadable row file" % n)
            continue
        parts.append(nl(text))
    return "".join(parts)


def count_rows(kind, text):
    if kind == "csv":
        return max(0, len([l for l in text.splitlines() if l.strip()]) - 1)
    if kind == "yaml":
        return len([l for l in text.splitlines() if ITEM_RE.match(l)])
    return len([l for l in text.splitlines() if SECTION_RE.match(l)])


def derive(root, write_files=True):
    """Returns (written, skipped, problems). Never loses a row: a list file that
    holds rows its directory does not - a run that began before §6.3 and was not
    `split` - is left alone and reported, because overwriting it would be the
    derivation destroying the record it is supposed to view."""
    written, skipped, problems = [], [], []
    for name, (d, f, kind) in LISTS.items():
        dirpath = os.path.join(root, d)
        text = derive_text(kind, dirpath, problems)
        if text is None:
            skipped.append(name)
            continue
        target = os.path.join(root, f)
        on_disk = read(target)
        if on_disk is not None and count_rows(kind, on_disk) > count_rows(kind, text):
            problems.append("%s: %s holds %d rows but %s/ holds %d - REFUSING to overwrite; "
                            "run `lists.py split %s` first (a run that began before §6.3)"
                            % (name, f, count_rows(kind, on_disk), d, count_rows(kind, text), name))
            continue
        if write_files and on_disk != text:
            write(target, text)
        written.append((name, target, text))
    return written, skipped, problems


def check(root):
    """Every list whose directory exists must have a file equal to its rows."""
    problems = []
    for name, (d, f, kind) in LISTS.items():
        dirpath = os.path.join(root, d)
        text = derive_text(kind, dirpath, problems)
        if text is None:
            continue
        on_disk = read(os.path.join(root, f))
        if on_disk is None:
            problems.append("%s: %s has rows but %s does not exist - run derive" % (name, d, f))
        elif on_disk != text:
            problems.append("%s: %s differs from its rows in %s/ - run derive, or "
                            "find who wrote the file" % (name, f, d))
    return problems


# --------------------------------------------------------------------------
# split: file -> rows (one-time)
# --------------------------------------------------------------------------


def split(name, root):
    """Turn a list file into its directory. Refuses if the directory exists."""
    d, f, kind = LISTS[name]
    dirpath, filepath = os.path.join(root, d), os.path.join(root, f)
    if os.path.isdir(dirpath):
        return None, "%s/ already exists; split is a one-time step" % d
    text = read(filepath)
    if text is None:
        return None, "%s does not exist; nothing to split" % f
    ext = {"csv": ".csv", "yaml": ".yaml", "md": ".md"}[kind]
    rows = []  # (stem, text)
    if kind == "csv":
        lines = text.splitlines(True)
        if not lines:
            return None, "%s is empty" % f
        header = lines[0].rstrip("\r\n")
        data = [l for l in lines[1:] if l.strip()]
        parsed = list(csv.reader([l.rstrip("\r\n") for l in data]))
        if len(parsed) != len(data):
            return None, ("%s: a field spans lines; split by hand or repair the row" % f)
        cols = [c.strip() for c in header.split(",")]
        ix = {c: i for i, c in enumerate(cols)}
        for seq, (line, fields) in enumerate(zip(data, parsed), start=1):
            def col(c, default):
                i = ix.get(c, default)
                return fields[i] if i < len(fields) else ""
            stem = "%04d-%s-%s-%s" % (seq, safe(col("ts", 0)).replace(":", ""),
                                      safe(col("node", 1)), safe(col("attempt", 5)))
            rows.append((stem, header + "\n" + nl(line)))
    elif kind == "yaml":
        lines = text.splitlines(True)
        end = next((i for i, l in enumerate(lines) if YAML_HEADER_END_RE.match(l)), None)
        if end is None:
            return None, "%s: no `entries:` line; not the shape §6.3 splits" % f
        header = "".join(lines[:end + 1])
        starts = [i for i in range(end + 1, len(lines)) if ITEM_RE.match(lines[i])]
        if not starts:
            return None, "%s: no `  - ` items under entries:" % f
        if any(l.strip() for l in lines[end + 1:starts[0]]):
            return None, "%s: text between `entries:` and the first item" % f
        rows.append((HEADER_STEM, header + "".join(lines[end + 1:starts[0]])))
        bounds = starts + [len(lines)]
        for seq, (a, b) in enumerate(zip(bounds, bounds[1:]), start=1):
            chunk = "".join(lines[a:b])
            node = re.search(r"^\s+node:\s*(\S+)", chunk, re.M)
            idx = re.search(r"^\s+criterion_index:\s*(\S+)", chunk, re.M)
            stem = "%04d-%s-%s" % (seq, safe(node.group(1)) if node else "row",
                                   safe(idx.group(1)) if idx else seq)
            rows.append((stem, chunk))
    else:
        lines = text.splitlines(True)
        starts = [i for i, l in enumerate(lines) if SECTION_RE.match(l)]
        if not starts:
            return None, "%s: no `## ` sections" % f
        preamble = "".join(lines[:starts[0]])
        if preamble:
            rows.append((HEADER_STEM, preamble))
        bounds = starts + [len(lines)]
        for seq, (a, b) in enumerate(zip(bounds, bounds[1:]), start=1):
            chunk = "".join(lines[a:b])
            slug = safe(re.sub(r"[^A-Za-z0-9]+", "-", lines[a][3:].strip().lower()))[:48]
            rows.append(("%04d-%s" % (seq, slug or "section"), chunk))
    seen = set()
    os.makedirs(dirpath)
    for stem, body in rows:
        base, k = stem, 2
        while stem in seen:
            stem = "%s-%d" % (base, k)
            k += 1
        seen.add(stem)
        write(os.path.join(dirpath, stem + ext), body)
    return len(rows) - (1 if any(s == HEADER_STEM for s, _ in rows) else 0), None


# --------------------------------------------------------------------------
# selftest: fixtures, then the real corpus
# --------------------------------------------------------------------------

FIXTURES = {
    "ledger": ("ledger.csv",
               "ts,node,rung,model,effort,attempt,verdict,seconds,note\n"
               "2026-09-01T10:00:00Z,CAST,1,sonnet,medium,1,DONE,12,\n"
               "2026-09-01T10:05:00Z,P1,2,sonnet,high,1,DONE-WITH-CAVEATS,300,\"two, with a comma\"\n"
               "2026-09-01T10:05:00Z,P1,3,opus,high,2,DONE,40,attempt 2\n"),
    "lint-feedback": ("lint-feedback.yaml",
                      "# lint-feedback.yaml - a header comment\n\nentries:\n"
                      "  - node: P9\n    criterion_index: 1\n    shape: false-premise\n"
                      "  - node: P9\n    criterion_index: 2\n    shape: superseded-form\n"),
    "decisions": ("plan/decisions.md",
                  "# DECISIONS - run x\n\nThe preamble.\n\n## D-1 First default\n\nBody one.\n\n"
                  "## D-2 Second default\n\nBody two.\n"),
}


def selftest(argv_root):
    results = []

    def case(label, ok):
        results.append((label, ok))

    tmp = tempfile.mkdtemp(prefix="baton-lists-")
    try:
        # fixtures round-trip to the byte, check catches tampering, split refuses twice
        for name, (rel, text) in FIXTURES.items():
            root = os.path.join(tmp, "fx-" + name)
            write(os.path.join(root, rel), text)
            n, err = split(name, root)
            case("%s: split (%s rows)" % (name, n), err is None and n == 3 if name == "ledger" else err is None)
            os.remove(os.path.join(root, rel))
            derive(root)
            case("%s: derive reproduces the file byte-for-byte" % name,
                 read(os.path.join(root, rel)) == text)
            case("%s: check passes on a fresh derive" % name, not check(root))
            write(os.path.join(root, rel), text + "tampered\n")
            case("%s: check REFUSES a file that drifted from its rows" % name, bool(check(root)))
            _n, err = split(name, root)
            case("%s: split refuses a second time" % name, err is not None)
        # a row appended as a file shows up in the derived view, in order
        root = os.path.join(tmp, "fx-ledger")
        write(os.path.join(root, "ledger", "2026-09-01T110000Z-P2-1.csv"),
              "ts,node,rung,model,effort,attempt,verdict,seconds,note\n"
              "2026-09-01T11:00:00Z,P2,1,sonnet,medium,1,DONE,5,live row\n")
        derive(root)
        case("ledger: a live row file lands last in the derived file",
             read(os.path.join(root, "ledger.csv")).rstrip("\n").endswith("live row"))
        # a v3 run resumed under v4 without `split`: the file has rows the directory lacks
        root = os.path.join(tmp, "fx-unsplit")
        write(os.path.join(root, "ledger.csv"), FIXTURES["ledger"][1])
        write(os.path.join(root, "ledger", "2026-09-02T000000Z-P9-1.csv"),
              "ts,node,rung,model,effort,attempt,verdict,seconds,note\n"
              "2026-09-02T00:00:00Z,P9,1,sonnet,low,1,DONE,1,new\n")
        _w, _s, probs = derive(root)
        case("derive REFUSES to overwrite a file holding rows its directory lacks (unsplit v3 run)",
             any("REFUSING" in p for p in probs) and read(os.path.join(root, "ledger.csv")) == FIXTURES["ledger"][1])
        # the real corpus, when present
        real = [("ledger", "ledger.csv", os.path.join(argv_root, "_orch")),
                ("lint-feedback", "lint-feedback.yaml", os.path.join(argv_root, "_orch-replay")),
                ("decisions", "plan/decisions.md", os.path.join(argv_root, "_orch"))]
        for name, rel, src_root in real:
            src = os.path.join(src_root, rel)
            text = read(src)
            if text is None:
                continue
            root = os.path.join(tmp, "real-" + name)
            write(os.path.join(root, rel), text)
            n, err = split(name, root)
            os.remove(os.path.join(root, rel))
            derive(root)
            same = read(os.path.join(root, rel)) == text
            case("real %s (%s): split %s rows, derive is byte-identical"
                 % (name, os.path.relpath(src, argv_root), n), err is None and same)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("Each line below must PASS. A derive that is not byte-for-byte is not a view.\n")
    bad = 0
    for label, ok in results:
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
        bad += 0 if ok else 1
    print("\n%d/%d passed." % (len(results) - bad, len(results)))
    return 1 if bad else 0


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------


def parse(argv):
    state, rest = "_orch", []
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--state-root" and i + 1 < len(argv):
            state = argv[i + 1]
            i += 2
            continue
        if a.startswith("--state-root="):
            state = a.split("=", 1)[1]
            i += 1
            continue
        rest.append(a)
        i += 1
    return os.environ.get("BATON_STATE_ROOT", "").strip() or state, rest


def main(argv):
    state, rest = parse(argv)
    here = os.getcwd()
    if "--selftest" in rest:
        return selftest(here)
    if not rest or rest[0] not in ("derive", "check", "split"):
        sys.stdout.write(__doc__)
        return 2
    root = state if os.path.isabs(state) else os.path.join(here, state)
    if rest[0] == "derive":
        written, skipped, problems = derive(root)
        for name, target, text in written:
            print("derived %s (%d bytes)" % (os.path.relpath(target, here), len(text.encode("utf-8"))))
        if skipped:
            print("no directory yet, left alone: %s" % ", ".join(skipped))
        for p in problems:
            print("  warn: " + p)
        return 0
    if rest[0] == "check":
        problems = check(root)
        if problems:
            print("REFUSED - %d list(s) out of step with their rows:" % len(problems))
            for p in problems:
                print("  " + p)
            return 1
        print("every list file equals its rows.")
        return 0
    if len(rest) < 2 or rest[1] not in LISTS:
        print("split <%s>" % "|".join(LISTS))
        return 2
    n, err = split(rest[1], root)
    if err:
        print("refused: " + err)
        return 1
    d = LISTS[rest[1]][0]
    print("split %s into %s/ (%d rows). Now: python3 tools/lists.py derive" % (rest[1], d, n))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
