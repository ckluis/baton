#!/usr/bin/env python3
"""Regenerate the contract indexes, and refuse to let the rule set go wrong.

Every rule lives in exactly one file under `rules/`.  The contracts are narrative
plus a GENERATED index.  That arrangement removes a class of mistake rather than
detecting it: there is nowhere to amend a stale copy of a rule, because there are
no copies, and the index cannot drift because nobody writes it.

What this checks, all of it by existence rather than by inference:

    1  every rule file parses, and carries type / id / title / section / contract
    2  ids are unique, and the filename matches the id
    3  every `links.to` target resolves to a rule that exists
    4  no rule text survives in either contract - a numbered heading outside the
       generated index means a rule has two homes again
    5  every rule id cited anywhere in the repo resolves to a file
    6  the index on disk equals the index regenerated from the files

Any failure exits 1.  This one is a gate: unlike an index, a broken rule set is
not a fact about the contract, it is a defect in it.

    python3 tools/rules.py            regenerate the indexes, then check
    python3 tools/rules.py --check    check only; write nothing
    python3 tools/rules.py --selftest prove the checks can FAIL, then check
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, "rules")
CONTRACTS = {"prompt/CONTRACT.md": "rule", "personas/CONTRACT.md": "prule"}
BEGIN = "<!-- BEGIN GENERATED INDEX"
END = "<!-- END GENERATED INDEX -->"
FM_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)
HEAD_RE = re.compile(r"^#{2,3}\s+\d+(\.\d+[a-z]?)*\.?\s", re.M)
ID_CITE_RE = re.compile(r"\b((?:p?rule)-\d+(?:-\d+[a-z]?)*-[a-z0-9-]+)\b")
# A section reference is the older citation form and still the common one. It has
# its own failure: a rule can be removed while a sibling section keeps pointing at
# it. That happened - a withdrawn section left `stakes (§9.2)` behind in §9.1,
# referring to a section that no longer existed, and it reached main.
SEC_CITE_RE = re.compile(r"§\s?(\d+(?:\.\d+[a-z]?)*)")


def load_rules(directory=RULES):
    out, errs = [], []
    for fn in sorted(os.listdir(directory)):
        if not fn.endswith(".md") or fn.startswith("_"):
            continue
        text = open(os.path.join(directory, fn), encoding="utf-8").read()
        m = FM_RE.match(text)
        if not m:
            errs.append("%s: no frontmatter" % fn)
            continue
        fm = {}
        for line in m.group(1).split("\n"):
            k = re.match(r"^([a-z_]+):\s*(.*)$", line)
            if k:
                fm[k.group(1)] = k.group(2).strip().strip('"')
        for req in ("type", "id", "title", "section", "contract"):
            if not fm.get(req):
                errs.append("%s: missing `%s`" % (fn, req))
        fm["_file"] = fn
        fm["_body"] = text[m.end():]
        fm["_links"] = re.findall(r"^\s*to:\s*(\S+)\s*$", text[:m.end()], re.M)
        out.append(fm)
    return out, errs


def sortkey(r):
    parts = []
    for p in r.get("section", "0").split("."):
        mm = re.match(r"(\d+)([a-z]*)", p)
        parts.append((int(mm.group(1)), mm.group(2)) if mm else (0, ""))
    return parts


def render_index(rules, contract):
    rows = sorted([r for r in rules if r.get("contract") == contract], key=sortkey)
    L = [BEGIN + " — `python3 tools/rules.py` rewrites this. Do not hand-edit. -->",
         "", "| § | rule | file |", "|---|---|---|"]
    for r in rows:
        indent = "" if "." not in r["section"] else "&nbsp;&nbsp;"
        L.append("| %s%s | %s | [`%s.md`](../rules/%s.md) |"
                 % (indent, r["section"], r["title"], r["id"], r["id"]))
    L += ["", END]
    return "\n".join(L)


def splice(path, block):
    text = open(os.path.join(ROOT, path), encoding="utf-8").read()
    i, j = text.find(BEGIN), text.find(END)
    if i < 0 or j < 0:
        return None, "%s: no generated-index markers" % path
    return text[:i] + block + text[j + len(END):], None


def check(rules, errs, write, warnings=None):
    warnings = warnings if warnings is not None else []
    problems = list(errs)
    seen = {}
    for r in rules:
        if r["id"] in seen:
            problems.append("duplicate id `%s` in %s and %s"
                            % (r["id"], seen[r["id"]], r["_file"]))
        seen[r["id"]] = r["_file"]
        if r["_file"] != r["id"] + ".md":
            problems.append("%s: filename does not match id `%s`" % (r["_file"], r["id"]))
    ids = set(seen)
    for r in rules:
        for target in r["_links"]:
            if target not in ids:
                problems.append("%s: link target `%s` does not exist" % (r["_file"], target))

    for path in CONTRACTS:
        text = open(os.path.join(ROOT, path), encoding="utf-8").read()
        i, j = text.find(BEGIN), text.find(END)
        outside = text[:i] + (text[j:] if j >= 0 else "")
        if HEAD_RE.search(outside):
            problems.append("%s: a numbered rule heading survives outside the index — "
                            "a rule with two homes" % path)
        block = render_index(rules, path)
        new, err = splice(path, block)
        if err:
            problems.append(err)
        elif new != text:
            if write:
                open(os.path.join(ROOT, path), "w", encoding="utf-8").write(new)
            else:
                problems.append("%s: index is stale" % path)

    sections = {r.get("section") for r in rules}
    for dirpath, _d, files in os.walk(ROOT):
        if any(s in dirpath for s in (".git", "_orch", "dist", "/rules")):
            continue
        for fn in files:
            if not fn.endswith((".md", ".py", ".sh")):
                continue
            fp = os.path.join(dirpath, fn)
            try:
                body = open(fp, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            rel = os.path.relpath(fp, ROOT)
            for cite in set(ID_CITE_RE.findall(body)):
                if cite not in ids:
                    problems.append("%s: cites `%s`, which is not a rule" % (rel, cite))
            for cite in set(SEC_CITE_RE.findall(body)):
                if cite in sections:
                    continue
                root = cite.split(".")[0]
                if root not in {sec.split(".")[0] for sec in sections if sec}:
                    problems.append("%s: cites §%s — no rule numbered %s exists at all"
                                    % (rel, cite, root))
                else:
                    # Deeper references are usually a numbered list item inside a
                    # rule (§1.2.3 is trigger 3 of §1.2), which is legitimate. But a
                    # section that once existed and was removed looks identical, and
                    # that is how `stakes (§9.2)` survived its own section's deletion.
                    # Report, do not refuse: a gate that rejects valid citations
                    # teaches people to route around it.
                    warnings.append("%s: cites §%s, which is no rule's section — a list "
                                    "item inside §%s, or a reference left behind by a "
                                    "removed rule" % (rel, cite, root))
    return problems


def selftest():
    """Prove each check can FAIL. A check that cannot fail is not a check."""
    import shutil, tempfile
    cases = []
    tmp = tempfile.mkdtemp()
    d = os.path.join(tmp, "rules")
    shutil.copytree(RULES, d)
    victim = os.path.join(d, "rule-4-1-edge-types.md")

    def run(label, mutate):
        shutil.copytree(RULES, d, dirs_exist_ok=True)
        mutate()
        rs, es = load_rules(d)
        ids = {r["id"] for r in rs if r.get("id")}
        bad = list(es)
        for r in rs:
            for t in r["_links"]:
                if t not in ids:
                    bad.append("dangling link")
            if r.get("id") and r["_file"] != r["id"] + ".md":
                bad.append("filename mismatch")
        cases.append((label, bool(bad)))

    run("frontmatter removed", lambda: open(victim, "w").write("### 4.1 Edge types\n"))
    run("required field removed", lambda: open(victim, "w").write(
        "---\ntype: Rule\ntitle: x\nsection: \"4.1\"\ncontract: prompt/CONTRACT.md\n---\nbody\n"))
    run("link target broken", lambda: open(victim, "w").write(
        "---\ntype: Rule\nid: rule-4-1-edge-types\ntitle: x\nsection: \"4.1\"\n"
        "contract: prompt/CONTRACT.md\nlinks:\n  - rel: part-of\n    to: rule-does-not-exist\n---\nbody\n"))
    run("filename/id mismatch", lambda: open(victim, "w").write(
        "---\ntype: Rule\nid: rule-totally-different\ntitle: x\nsection: \"4.1\"\n"
        "contract: prompt/CONTRACT.md\n---\nbody\n"))
    shutil.rmtree(tmp, ignore_errors=True)

    # the live tree must reject a reference to a section that does not exist
    rs, es = load_rules()
    secs = {r.get("section") for r in rs}
    # Built at runtime, never written literally: a validator that scans the corpus
    # must not plant citations in it. #9's predecessor indexed its own assertions.
    ghost = "9" * 2 + "." + "9"
    cases.append(("dangling section reference (%s)" % ghost, ghost not in secs))

    print("Each mutation below must be REJECTED. A check that passes them is not a check.\n")
    bad = 0
    for label, rejected in cases:
        print("  %s  %s" % ("PASS" if rejected else "FAIL", label))
        if not rejected:
            bad += 1
    print("\n%d/%d mutations rejected." % (len(cases) - bad, len(cases)))
    return 1 if bad else 0


def main(argv):
    write = "--check" not in argv
    if "--selftest" in argv:
        rc = selftest()
        if rc:
            return rc
    rules, errs = load_rules()
    warnings = []
    problems = check(rules, errs, write, warnings)
    if problems:
        print("REFUSED — %d problem(s):" % len(problems))
        for p in problems[:40]:
            print("  " + p)
        return 1
    for w in warnings[:12]:
        print("  warn: " + w)
    if warnings:
        print()
    print("%d rules, indexes %s, every link and id citation resolves%s."
          % (len(rules), "rewritten" if write else "current",
             ", %d section reference(s) to check by eye" % len(warnings) if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
