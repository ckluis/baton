#!/usr/bin/env python3
"""Map every numbered rule in the contracts to every place that repeats it.

WHY THIS EXISTS

Amending a rule in the contract does not amend the four other places that state
the same rule in their own words - the role prompts an agent actually walks, the
mode files, and the Python in tools/ that implements it.  Three consecutive
adversarial reviews of one change failed on exactly that, each at a different
layer: the second missed three prose sites, the third missed two generators.
Greps miss it because a site restating a rule rarely cites it, and an ad-hoc
grep can match the right word in the wrong sense - one such sweep passed
`baton.md`'s phase gate because the line contains "accepted with caveats", a
different concept that happens to share a word.

So this tool does not judge compliance.  It enumerates the surface: for a rule,
every site that CITES it, every site that RESTATES it without citing, and every
site that IMPLEMENTS it in code.  Deciding whether each one needs the amendment
is a reading job.  Handing a human the complete list of places to read is the
job software can actually do, and the job nothing here was doing.

WHAT IT IS NOT

Not authoritative.  Delete `_orch/rules/` and it rebuilds.  Not a gate: it
exits 0 whatever it finds, because "this rule is restated in nine places" is a
fact about the contract, not a defect.  `--touched` is the mode with an opinion,
and even it only reports.

USAGE

    python3 tools/rules.py                 build the index
    python3 tools/rules.py --rule 4.1      the propagation surface for one rule
    python3 tools/rules.py --touched main  rules whose text changed vs a ref,
                                           each with its full surface
    python3 tools/rules.py --selftest      rediscover the five real defects that
                                           justified this tool; exits 1 on a miss
"""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "_orch", "rules")

CONTRACTS = ["prompt/CONTRACT.md", "personas/CONTRACT.md"]
SCAN_DIRS = ["prompt", "personas", "tools"]
SCAN_EXT = (".md", ".py", ".sh")

HEADING_RE = re.compile(r"^(#{2,3})\s+(\d+(?:\.\d+[a-z]?)*)\.?\s+(.*?)\s*$")
CITE_RE = re.compile(r"§\s?(\d+(?:\.\d+[a-z]?)*)")
TERM_RE = re.compile(r"`([A-Za-z_][A-Za-z0-9_.:+/-]{1,40})`")

# Terms so common across the contracts that co-occurrence proves nothing.
STOPTERMS = {
    "nodes", "run", "prime", "agent", "file", "path",
    "true", "false", "null", "yes", "no", "id", "why", "at", "by",
}

# A rule's vocabulary is not only its backticked prose.  Schemas, CSV headers and
# filenames inside fenced blocks are the terms an implementer actually uses - the
# ledger rule names its columns in a fence and nowhere else, which is why an
# earlier draft could not connect it to the generator that reads those columns.
FENCE_RE = re.compile(r"```[a-z]*\n(.*?)```", re.S)
IDENT_RE = re.compile(r"\b([a-z_][a-z0-9_]{2,24})\b")
FILENAME_RE = re.compile(r"\b([A-Za-z0-9_.-]+\.(?:csv|json|ya?ml|md|py|sh))\b")


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8", errors="replace") as fh:
        return fh.read()


def corpus_files():
    out = []
    for d in SCAN_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, _dirnames, filenames in os.walk(base):
            for fn in sorted(filenames):
                if fn.endswith(SCAN_EXT):
                    out.append(os.path.relpath(os.path.join(dirpath, fn), ROOT))
    return sorted(out)


def parse_rules():
    """Every numbered section of every contract, with its body and its terms."""
    rules = {}
    for path in CONTRACTS:
        try:
            lines = read(path).split("\n")
        except OSError:
            continue
        open_rule = None
        for n, line in enumerate(lines, 1):
            m = HEADING_RE.match(line)
            if m:
                if open_rule:
                    open_rule["end"] = n - 1
                rid = m.group(2)
                open_rule = {
                    "id": rid, "title": m.group(3), "file": path,
                    "qid": ("personas:" if "personas" in path else "prompt:") + rid,
                    "start": n, "end": len(lines), "body": [],
                }
                # A later contract may reuse a number; keep both, keyed by file.
                rules.setdefault(rid, []).append(open_rule)
            elif open_rule is not None:
                open_rule["body"].append(line)
    flat = []
    for rid, entries in rules.items():
        for e in entries:
            text = "\n".join(e["body"])
            terms = {t for t in TERM_RE.findall(text) if t.lower() not in STOPTERMS}
            for fence in FENCE_RE.findall(text):
                head = "\n".join(fence.strip().split("\n")[:3])
                terms |= {t for t in IDENT_RE.findall(head)
                          if t not in STOPTERMS}
            terms |= set(FILENAME_RE.findall(text))
            e["terms"] = sorted(terms)
            e["text"] = text
            flat.append(e)
    return flat


def distinctive(rules):
    """Every term the rule governs, common ones emphatically included.

    An earlier draft kept only terms used by three rules or fewer, on the
    theory that rare terms carry signal.  That was backwards and it would
    have made this tool miss the defect it exists to catch: `DONE` and
    `CONFIRMED` appear across many rules, which is exactly *why* they are the
    propagation hazard - a dozen sites restate them and an amendment reaches
    one.  Frequency is the signal.  What is dropped is only structural
    vocabulary that means nothing on its own (see STOPTERMS).
    """
    for r in rules:
        r["distinctive"] = sorted(r["terms"])
    return rules


def scan(rules):
    """For every rule: who cites it, who restates it, who implements it."""
    files = corpus_files()
    contents = {}
    for f in files:
        try:
            contents[f] = read(f)
        except OSError:
            continue

    by_id = {}
    for r in rules:
        by_id.setdefault(r["id"], []).append(r)

    dupe = {}
    for r in rules:
        dupe[r["id"]] = dupe.get(r["id"], 0) + 1
    for r in rules:
        r["ambiguous"] = dupe[r["id"]] > 1
        r["cited_by"], r["restated_by"], r["implemented_by"] = [], [], []

    for f, text in contents.items():
        lines = text.split("\n")
        cited_here = {m for m in CITE_RE.findall(text)}
        is_code = f.endswith((".py", ".sh"))
        for r in rules:
            hits = []
            for n, line in enumerate(lines, 1):
                # A rule restates itself trivially; skip only its own span.
                # Sibling sections of the SAME contract are the point: two of the
                # four sites one review found unamended were other sections of the
                # very file being edited.
                if f == r["file"] and r["start"] <= n <= r["end"]:
                    continue
                found = [t for t in r["distinctive"] if t in line]
                if len(found) >= 2:
                    hits.append({"line": n, "terms": found[:4],
                                 "text": line.strip()[:120]})
            if not hits:
                # A rule's vocabulary can be spread across a file rather than
                # concentrated on one line - a generator implementing the ledger
                # rule touches `rung`, `seconds` and `ledger.csv` hundreds of lines
                # apart.  Three distinct terms anywhere in one file is still that
                # file participating in the rule.
                spread = [t for t in r["distinctive"] if t in text]
                if len(spread) >= 3:
                    first = None
                    for n, line in enumerate(lines, 1):
                        if any(t in line for t in spread):
                            first = {"line": n, "terms": spread[:4],
                                     "text": line.strip()[:120]}
                            break
                    if first:
                        hits.append(first)
            if r["id"] in cited_here and not r.get("ambiguous") and f != r["file"]:
                r["cited_by"].append({"file": f, "lines": [
                    n for n, l in enumerate(lines, 1) if ("§%s" % r["id"]) in l][:6]})
            if hits:
                bucket = r["implemented_by"] if is_code else r["restated_by"]
                # cited AND restated is still a site an amendment must visit
                bucket.append({"file": f, "hits": hits[:6],
                               "cites_the_rule": r["id"] in cited_here})
    return rules


def build():
    rules = scan(distinctive(parse_rules()))
    os.makedirs(OUT_DIR, exist_ok=True)
    payload = [{k: r[k] for k in
                ("id", "qid", "title", "file", "start", "end", "distinctive",
                 "cited_by", "restated_by", "implemented_by")} for r in rules]
    def sortkey(r):
        parts = []
        for p in re.split(r"[.]", r["id"]):
            m = re.match(r"(\d+)([a-z]*)", p)
            parts.append((int(m.group(1)), m.group(2)) if m else (0, p))
        return (parts, r["file"])
    payload.sort(key=sortkey)
    with open(os.path.join(OUT_DIR, "rules.json"), "w", encoding="utf-8") as fh:
        json.dump({"rules": payload}, fh, indent=1, sort_keys=True)
        fh.write("\n")
    write_summary(payload)
    return payload


def surface(r):
    return len(r["restated_by"]) + len(r["implemented_by"])


def write_summary(payload):
    L = ["# Contract rule surface", "",
         "Derived from the contracts; delete `_orch/rules/` and it rebuilds.",
         "A *restatement* is a site that states a rule in its own words. Whether it",
         "needs a given amendment is a reading job — this only guarantees the list",
         "is complete.", ""]
    widest = sorted(payload, key=lambda r: -surface(r))[:12]
    L.append("## Rules with the largest propagation surface")
    L.append("")
    L.append("| rule | title | restated in | implemented in |")
    L.append("|---|---|---|---|")
    for r in widest:
        if not surface(r):
            continue
        L.append("| §%s | %s | %d | %d |" % (
            r["id"], r["title"][:46], len(r["restated_by"]), len(r["implemented_by"])))
    code = [r for r in payload if r["implemented_by"]]
    L += ["", "## Rules with code that implements them", "",
          "An amendment to any of these is also a code change.", ""]
    for r in code:
        files = sorted({h["file"] for h in r["implemented_by"]})
        L.append("- **§%s** %s — `%s`" % (r["id"], r["title"][:44], "`, `".join(files)))
    L += ["", "%d rules, %d with a restatement, %d with code." % (
        len(payload), sum(1 for r in payload if r["restated_by"]), len(code)), ""]
    with open(os.path.join(OUT_DIR, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


def show_rule(payload, rid):
    want = rid.split(":", 1)
    hits = [r for r in payload if r["id"] == want[-1]
            and (len(want) == 1 or want[0] in r["file"])]
    if not hits:
        print("no rule §%s" % rid)
        return 0
    for r in hits:
        print("§%s  %s" % (r["id"], r["title"]))
        print("  defined   %s:%d-%d" % (r["file"], r["start"], r["end"]))
        print("  terms     %s" % ", ".join("`%s`" % t for t in r["distinctive"][:8]))
        for label, key in (("cites", "cited_by"), ("RESTATES", "restated_by"),
                           ("IMPLEMENTS", "implemented_by")):
            for e in r[key]:
                if key == "cited_by":
                    print("  %-10s %s:%s" % (label, e["file"],
                                             ",".join(str(x) for x in e["lines"])))
                else:
                    mark = "" if e["cites_the_rule"] else "   <- does not cite it"
                    print("  %-10s %s%s" % (label, e["file"], mark))
                    for h in e["hits"][:3]:
                        print("             :%d  %s" % (h["line"], h["text"]))
    return 0


def touched(payload, ref):
    """Rules whose text changed against a ref — and everywhere else to look."""
    changed = set()
    for path in CONTRACTS:
        try:
            diff = subprocess.run(
                ["git", "diff", "-U0", ref, "--", path],
                cwd=ROOT, capture_output=True, text=True, timeout=60).stdout
        except Exception:
            continue
        for m in re.finditer(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@", diff, re.M):
            start = int(m.group(1)); count = int(m.group(2) or 1)
            for r in payload:
                if r["file"] != path:
                    continue
                if start <= r["end"] and (start + count) >= r["start"]:
                    changed.add((r["id"], r["file"]))
    if not changed:
        print("no contract rule changed against %s" % ref)
        return 0
    print("%d rule(s) changed against %s.\n" % (len(changed), ref))
    print("Every site below states or implements one of them. An amendment that")
    print("does not visit each one leaves the contract disagreeing with itself.\n")
    for rid, f in sorted(changed):
        for r in payload:
            if r["id"] == rid and r["file"] == f:
                sites = ([("restates", e) for e in r["restated_by"]] +
                         [("implements", e) for e in r["implemented_by"]])
                print("§%s  %s" % (rid, r["title"]))
                if not sites:
                    print("    (no other site states this rule)")
                for kind, e in sites:
                    mark = "" if e["cites_the_rule"] else "  <- silent, does not cite it"
                    print("    %-11s %s%s" % (kind, e["file"], mark))
                print("")
    return 0



# The defects this tool exists to catch, taken from three consecutive adversarial
# reviews of one contract change and from one broken hand-rolled sweep.  Each entry
# is (rule, site that had to be found).  A tool that cannot rediscover the failures
# that justified building it has not been tested - it has been run.
KNOWN_MISSES = [
    ("prompt:4.1", "prompt/CONTRACT.md",
     "review 2: fanout closure and the phase gate, siblings in the edited file"),
    ("prompt:4.1", "prompt/roles/phase-runner.md",
     "review 2: terminal states and the resume test"),
    ("prompt:4.1", "prompt/baton.md",
     "the prime's gate - a hand-rolled sweep passed this line by matching "
     "'accepted with caveats', a different concept sharing a word"),
    ("prompt:4.1", "tools/index.py",
     "review 3: the resume oracle prints DONE-without-CONFIRMED and never knew"),
    ("prompt:7", "tools/index.py",
     "review 3: the rung histogram counts every ledger row"),
]


def selftest(payload):
    by = {}
    for r in payload:
        by[r["qid"]] = r
    bad = 0
    print("Rediscovering the failures that justified this tool.\n")
    for qid, want, why in KNOWN_MISSES:
        r = by.get(qid)
        sites = set()
        if r:
            for e in r["restated_by"] + r["implemented_by"]:
                sites.add(e["file"])
        ok = want in sites
        print("  %s  %-9s %-30s %s" % ("PASS" if ok else "FAIL", qid, want, why[:58]))
        if not ok:
            bad += 1
    print("\n%d/%d rediscovered." % (len(KNOWN_MISSES) - bad, len(KNOWN_MISSES)))
    if bad:
        print("A failure here means the index no longer covers a defect it was built for.")
    return 1 if bad else 0


def main(argv):
    payload = build()
    if len(argv) >= 3 and argv[1] == "--rule":
        return show_rule(payload, argv[2].lstrip("§"))
    if len(argv) >= 3 and argv[1] == "--touched":
        return touched(payload, argv[2])
    if len(argv) >= 2 and argv[1] == "--selftest":
        return selftest(payload)
    print("rules: %d indexed  |  %d restated elsewhere  |  %d with code" % (
        len(payload),
        sum(1 for r in payload if r["restated_by"]),
        sum(1 for r in payload if r["implemented_by"])))
    print("  wrote _orch/rules/rules.json and _orch/rules/summary.md")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
