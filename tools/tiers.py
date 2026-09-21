#!/usr/bin/env python3
"""baton tiers - v4 rungs become v5 tiers (CONTRACT §1): remap the values, keep the name.

    python3 tools/tiers.py remap  [--framework] [--state-root _orch]
    python3 tools/tiers.py check  [--framework] [--state-root _orch]
    python3 tools/tiers.py --selftest

The field is still called `rung` everywhere - graphs, envelopes, persona cards,
the ledger - so nothing that reads it changes. Its values are now 0 (cheap),
1 (frontier) or n/a (an event row). v4 wrote 0-6; the mapping is 0 -> 0 and
1-6 -> 1, because everything that was not mechanical is frontier work now.

    --framework    prompt/modes/*.md and personas/*/*.md  (a checkout of baton)
    --state-root   a run's plan/graph.yaml and nodes/*/handoff.md
                   (a v4 run resumes under v5 untouched; remap is optional there,
                   and the ledger is history - it is never rewritten)

`check` exits 1 on any `rung:` value above 1 in what it looks at. Stdlib only;
edits only the files it names; prints every change.
"""

import os
import re
import sys
import tempfile
import shutil

RUNG_RE = re.compile(r"^(\s*rung:\s*)(\d+)(\s*(?:#.*)?)$")
LEDGER_NAMES = ("ledger.csv", "ledger")


def files_framework(root):
    out = []
    for sub in ("prompt/modes",):
        d = os.path.join(root, sub)
        out += [os.path.join(d, n) for n in sorted(os.listdir(d)) if n.endswith(".md")] if os.path.isdir(d) else []
    pd = os.path.join(root, "personas")
    if os.path.isdir(pd):
        for kind in sorted(os.listdir(pd)):
            kd = os.path.join(pd, kind)
            if os.path.isdir(kd):
                out += [os.path.join(kd, n) for n in sorted(os.listdir(kd)) if n.endswith(".md")]
    return out


def files_state(state):
    out = []
    g = os.path.join(state, "plan", "graph.yaml")
    if os.path.isfile(g):
        out.append(g)
    nd = os.path.join(state, "nodes")
    if os.path.isdir(nd):
        for n in sorted(os.listdir(nd)):
            h = os.path.join(nd, n, "handoff.md")
            if os.path.isfile(h):
                out.append(h)
    return out


def scan(path):
    """Yield (lineno, old_value, new_value) for every rung: field in the file."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines(True)
    except OSError:
        return []
    hits = []
    for i, line in enumerate(lines, 1):
        m = RUNG_RE.match(line.rstrip("\r\n"))
        if m:
            v = int(m.group(2))
            hits.append((i, v, 0 if v == 0 else 1))
    return hits


def remap_file(path):
    with open(path, encoding="utf-8", errors="replace", newline="") as fh:
        text = fh.read()
    changed = 0
    out = []
    for line in text.splitlines(True):
        body = line.rstrip("\r\n")
        eol = line[len(body):]
        m = RUNG_RE.match(body)
        if m and int(m.group(2)) > 1:
            body = "%s1%s" % (m.group(1), m.group(3))
            changed += 1
        out.append(body + eol)
    if changed:
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write("".join(out))
    return changed


def run(cmd, paths, here):
    total_files, total_changes, problems = 0, 0, []
    for p in paths:
        hits = scan(p)
        above = [(ln, v) for ln, v, _ in hits if v > 1]
        if cmd == "check":
            for ln, v in above:
                problems.append("%s:%d: rung: %d - above 1; run `tools/tiers.py remap`" % (os.path.relpath(p, here), ln, v))
        elif above:
            n = remap_file(p)
            total_files += 1
            total_changes += n
            print("remapped %s (%d value%s)" % (os.path.relpath(p, here), n, "" if n == 1 else "s"))
    return total_files, total_changes, problems


def selftest():
    results = []
    tmp = tempfile.mkdtemp(prefix="baton-tiers-")
    try:
        fw = os.path.join(tmp, "fw")
        os.makedirs(os.path.join(fw, "prompt", "modes"))
        os.makedirs(os.path.join(fw, "personas", "lenses"))
        mode = os.path.join(fw, "prompt", "modes", "TEST.md")
        with open(mode, "w") as fh:
            fh.write("- id: T01\n  rung: 0\n- id: T02\n  rung: 3   # judgment\n  stop:\n    max_rungs: 40\n- id: T03\n  rung: 1\n")
        card = os.path.join(fw, "personas", "lenses", "x.md")
        with open(card, "w") as fh:
            fh.write("---\nname: x\nrung: 2\n---\nbody mentions rung: 5 in prose\n")
        st = os.path.join(tmp, "_orch")
        os.makedirs(os.path.join(st, "plan"))
        os.makedirs(os.path.join(st, "nodes", "P1"))
        with open(os.path.join(st, "plan", "graph.yaml"), "w") as fh:
            fh.write("- id: P1\n  rung: 4\n")
        with open(os.path.join(st, "ledger.csv"), "w") as fh:
            fh.write("ts,node,rung,model,effort,attempt,verdict,seconds,note\n2026-01-01T00:00:00Z,P1,4,opus,high,1,DONE,1,\n")
        _f, _c, probs = run("check", files_framework(fw), tmp)
        results.append(("check refuses rung values above 1 before remap", len(probs) == 2))
        f, c, _p = run("remap", files_framework(fw), tmp)
        results.append(("remap changes exactly the values above 1 (2 files, 2 values)", (f, c) == (2, 2)))
        text = open(mode).read()
        results.append(("0 stays 0, 1 stays 1, 3 becomes 1, the comment survives",
                        "rung: 0\n" in text and "rung: 1   # judgment" in text and text.count("rung: 1") == 2))
        results.append(("max_rungs is not a rung field and is untouched", "max_rungs: 40" in text))
        results.append(("prose inside a body is untouched", "prose" in open(card).read() and "rung: 5 in prose" in open(card).read()))
        results.append(("check passes after remap", not run("check", files_framework(fw), tmp)[2]))
        f, c, _p = run("remap", files_state(st), tmp)
        results.append(("a run's graph.yaml remaps", c == 1 and "rung: 1" in open(os.path.join(st, "plan", "graph.yaml")).read()))
        results.append(("the ledger is history and is never rewritten",
                        ",4,opus,high," in open(os.path.join(st, "ledger.csv")).read()))
        results.append(("remap is idempotent", run("remap", files_framework(fw) + files_state(st), tmp)[1] == 0))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("Each line below must PASS. A remap that touches a value it should not is a defect in the contract.\n")
    bad = 0
    for label, ok in results:
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
        bad += 0 if ok else 1
    print("\n%d/%d passed." % (len(results) - bad, len(results)))
    return 1 if bad else 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    args = list(argv[1:])
    here = os.getcwd()
    framework, state = False, None
    rest = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--framework":
            framework = True
        elif a == "--state-root" and i + 1 < len(args):
            state = args[i + 1]
            i += 1
        elif a.startswith("--state-root="):
            state = a.split("=", 1)[1]
        else:
            rest.append(a)
        i += 1
    if not rest or rest[0] not in ("remap", "check"):
        sys.stdout.write(__doc__)
        return 2
    if not framework and state is None:
        framework = True
    paths = []
    if framework:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        paths += files_framework(root)
    if state is not None:
        paths += files_state(state if os.path.isabs(state) else os.path.join(here, state))
    f, c, problems = run(rest[0], paths, here)
    if rest[0] == "check":
        if problems:
            print("REFUSED - %d rung value(s) above 1:" % len(problems))
            for p in problems[:40]:
                print("  " + p)
            return 1
        print("every rung value in %d file(s) is 0 or 1 (CONTRACT §1)." % len(paths))
        return 0
    print("remap: %d file(s), %d value(s) changed; %d file(s) looked at." % (f, c, len(paths)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
