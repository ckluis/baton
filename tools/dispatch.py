#!/usr/bin/env python3
"""baton dispatch - run one spawn through Claude Code and write its ledger row.

    python3 tools/dispatch.py --node P07 --model claude-opus-5-5 --prompt p.md --cwd work/
        [--attempt 1] [--effort graph|low|medium|high|xhigh|max|default]
        [--rung graph|0|1] [--state-root _orch] [--envelope PATH] [--note TEXT]
        [-- extra claude flags...]
    python3 tools/dispatch.py --selftest

One call is one spawn and one §7 ledger row, written at envelope receipt:

- **effort and rung come from the graph by default** (CONTRACT §1.1). `--effort graph`
  reads the node's `effort:` from <state>/plan/graph.yaml; a frontier node that
  names none runs at `high`, and a rung-0 node at the harness default. An explicit
  `--effort` overrides, and the row records what actually ran, so `tools/index.py`
  can report a spawn that ran at an effort its node did not declare.
- **seconds are measured** by this process's clock (§7.1): `started_at` is written
  before the spawn and subtracted after it.
- **the served model is read from the stream** (§7): every assistant message's
  `model` is counted. Any model other than the one asked for, a harness
  placeholder such as `<synthetic>` included, goes into the row's `note` as
  `served: <model>`; the `model` column stays what was asked for.

Everything the spawn produced stays under <state>/spawns/<node>-a<attempt>/:
transcript.jsonl, stderr.txt, served.txt, result.json, started_at. The row is
<state>/ledger/<ts>-<node>-<attempt>.csv (§6.3). `BATON_CLAUDE` names the
executable (default `claude`); the selftest points it at a fake. Stdlib only.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HEADER = "ts,node,rung,model,effort,attempt,verdict,seconds,note"
EFFORTS = ("low", "medium", "high", "xhigh", "max")
NODE_RE = re.compile(r"^-\s+id:\s*(\S+)")
KEY_RE = re.compile(r"^  ([a-z_]+):\s*[\"']?([^\s\"'#]*)")


def unwrap_nodes(text):
    """CONTRACT §4's graph is a flat `- id:` list. A graph written as a mapping -
    `nodes:` over an indented list, which valid YAML allows and planners write -
    is the same graph one level down: lift it back so every parser reads one
    shape. Text with no top-level `nodes:` key is returned unchanged."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if re.match(r"^nodes:\s*(#.*)?$", line):
            body = []
            for rest in lines[i + 1:]:
                if rest.strip() and not rest.startswith((" ", "\t")):
                    break
                body.append(rest)
            dashes = [len(b) - len(b.lstrip()) for b in body if b.lstrip().startswith("- ")]
            cut = min(dashes) if dashes else 0
            return "\n".join(b[cut:] if b.strip() else b for b in body)
    return text


def graph_node(state, node):
    """{'rung': int|None, 'effort': str|None} for one node of <state>/plan/graph.yaml."""
    path = os.path.join(state, "plan", "graph.yaml")
    out, current = {"rung": None, "effort": None}, None
    try:
        lines = unwrap_nodes(open(path, encoding="utf-8", errors="replace").read()).splitlines()
    except OSError:
        return out
    for line in lines:
        m = NODE_RE.match(line)
        if m:
            current = m.group(1).strip("\"'")
            continue
        if current != node:
            continue
        k = KEY_RE.match(line)
        if k and k.group(1) == "rung":
            try:
                out["rung"] = int(k.group(2))
            except ValueError:
                pass
        elif k and k.group(1) == "effort":
            out["effort"] = k.group(2) or None
    return out


def resolve(state, node, rung, effort):
    """The rung and effort this spawn runs at, per CONTRACT §1.1."""
    g = graph_node(state, node)
    if rung == "graph":
        rung = g["rung"] if g["rung"] is not None else 1
    rung = int(rung)
    if effort == "graph":
        effort = g["effort"] or ("default" if rung == 0 else "high")
    if effort not in EFFORTS + ("default",):
        raise SystemExit("dispatch: effort %r is not one of %s or default" % (effort, ", ".join(EFFORTS)))
    return rung, effort


def served(transcript, asked):
    """(counts by assistant model, the models other than `asked`, result event or {})."""
    counts, result = {}, {}
    try:
        lines = open(transcript, encoding="utf-8", errors="replace").read().splitlines()
    except OSError:
        lines = []
    for line in lines:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get("type") == "assistant":
            m = (ev.get("message") or {}).get("model")
            if m:
                counts[m] = counts.get(m, 0) + 1
        elif ev.get("type") == "result":
            result = ev
    return counts, sorted(m for m in counts if m != asked), result


def verdict_of(envelope, rc):
    if rc != 0:
        return "SPAWN-FAILED"
    try:
        return json.load(open(envelope)).get("verdict") or "NO-VERDICT"
    except (OSError, ValueError):
        return "NO-ENVELOPE"


def dispatch(a):
    state = os.path.abspath(a["state"])
    rung, effort = resolve(state, a["node"], a["rung"], a["effort"])
    d = os.path.join(state, "spawns", "%s-a%s" % (a["node"], a["attempt"]))
    os.makedirs(d, exist_ok=True)
    os.makedirs(os.path.join(state, "ledger"), exist_ok=True)
    prompt = open(a["prompt"], encoding="utf-8").read()
    cmd = [os.environ.get("BATON_CLAUDE", "claude"), "-p", prompt, "--model", a["model"]]
    if effort != "default":
        cmd += ["--effort", effort]
    cmd += ["--output-format", "stream-json", "--verbose", "--no-session-persistence"] + a["extra"]

    start = int(time.time())
    open(os.path.join(d, "started_at"), "w").write("%d\n" % start)
    with open(os.path.join(d, "transcript.jsonl"), "w") as out, open(os.path.join(d, "stderr.txt"), "w") as err:
        rc = subprocess.call(cmd, cwd=a["cwd"], stdout=out, stderr=err)
    seconds = int(time.time()) - start

    counts, other, result = served(os.path.join(d, "transcript.jsonl"), a["model"])
    open(os.path.join(d, "served.txt"), "w").write(" ".join("%s=%d" % kv for kv in sorted(counts.items())) + "\n")
    json.dump({k: result.get(k) for k in ("subtype", "is_error", "num_turns", "total_cost_usd", "usage", "modelUsage")},
              open(os.path.join(d, "result.json"), "w"))

    envelope = a["envelope"] or os.path.join(state, "nodes", a["node"], "status.json")
    verdict = verdict_of(envelope, rc)
    note = [a["note"]] if a["note"] else []
    if other:
        note.append("served: " + "|".join(other))
    if rc != 0:
        note.append("exit %d" % rc)
    if result.get("total_cost_usd") is not None:
        note.append("cost %.4f" % result["total_cost_usd"])
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    row = [ts, a["node"], str(rung), a["model"], effort, str(a["attempt"]), verdict, str(seconds),
           "; ".join(note).replace(",", ";")]
    name = "%s-%s-%s.csv" % (time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()), a["node"], a["attempt"])
    open(os.path.join(state, "ledger", name), "w").write(HEADER + "\n" + ",".join(row) + "\n")
    if not a.get("quiet"):
        print(",".join(row))
    return 0 if rc == 0 else 3


def parse(argv):
    a = {"attempt": 1, "effort": "graph", "rung": "graph", "state": "_orch", "envelope": None,
         "note": "", "extra": [], "node": None, "model": None, "prompt": None, "cwd": "."}
    i = 0
    while i < len(argv):
        k = argv[i]
        if k == "--":
            a["extra"] = argv[i + 1:]
            break
        if not k.startswith("--") or i + 1 >= len(argv):
            raise SystemExit(__doc__)
        key = {"state-root": "state"}.get(k[2:], k[2:])
        if key not in a:
            raise SystemExit("dispatch: unknown flag %s\n%s" % (k, __doc__))
        a[key] = argv[i + 1]
        i += 2
    if not (a["node"] and a["model"] and a["prompt"]):
        raise SystemExit(__doc__)
    return a


FAKE = r'''#!/usr/bin/env python3
import json, os, sys
argv = sys.argv[1:]
open(os.environ["FAKE_LOG"], "a").write(json.dumps(argv) + "\n")
mode, model = os.environ.get("FAKE_MODE", "ok"), argv[argv.index("--model") + 1]
env = os.environ.get("FAKE_ENVELOPE")
def emit(ev): print(json.dumps(ev))
if mode == "limit":
    emit({"type": "assistant", "message": {"model": "<synthetic>"}})
    emit({"type": "result", "is_error": True, "total_cost_usd": 0})
    sys.exit(1)
emit({"type": "assistant", "message": {"model": model}})
if mode == "reroute":
    emit({"type": "assistant", "message": {"model": "claude-opus-4-8"}})
emit({"type": "result", "is_error": False, "total_cost_usd": 0.25, "num_turns": 2})
if env:
    json.dump({"verdict": "DONE"}, open(env, "w"))
'''


def selftest():
    results = []
    tmp = tempfile.mkdtemp(prefix="baton-dispatch-")
    try:
        state = os.path.join(tmp, "_orch")
        os.makedirs(os.path.join(state, "plan"))
        open(os.path.join(state, "plan", "graph.yaml"), "w").write(
            "- id: B1\n  rung: 1\n  effort: high\n- id: V1\n  rung: 1\n  effort: medium\n"
            "- id: C1\n  rung: 0\n- id: X1\n  rung: 1\n")
        fake = os.path.join(tmp, "claude")
        open(fake, "w").write(FAKE)
        os.chmod(fake, 0o755)
        log = os.path.join(tmp, "argv.log")
        prompt = os.path.join(tmp, "p.md")
        open(prompt, "w").write("do the thing")
        os.environ.update(BATON_CLAUDE=fake, FAKE_LOG=log)

        def run(node, mode="ok", **kw):
            os.environ["FAKE_MODE"] = mode
            env = os.path.join(state, "nodes", node, "status.json")
            os.makedirs(os.path.dirname(env), exist_ok=True)
            os.environ["FAKE_ENVELOPE"] = env
            a = parse(["--node", node, "--model", "claude-opus-5-5", "--prompt", prompt,
                       "--cwd", tmp, "--state-root", state] + sum(([("--" + k), v] for k, v in kw.items()), []))
            a["quiet"] = True
            dispatch(a)
            row = open(os.path.join(state, "ledger", sorted(n for n in os.listdir(os.path.join(state, "ledger"))
                                                            if ("-%s-" % node) in n)[-1])).read().splitlines()
            argv = json.loads(open(log).read().splitlines()[-1])
            return row, dict(zip(row[0].split(","), row[1].split(","))), argv

        row, r, argv = run("B1")
        results.append(("the row file carries the §7 header and one row", row[0] == HEADER and len(row) == 2))
        results.append(("a node's declared effort reaches the spawn", argv[argv.index("--effort") + 1] == "high" and r["effort"] == "high"))
        results.append(("the verdict comes from the envelope", r["verdict"] == "DONE"))
        results.append(("seconds are a measured integer", r["seconds"].isdigit()))
        results.append(("a spawn served as asked leaves no served: note", "served:" not in r["note"]))
        _, r, argv = run("V1")
        results.append(("a medium node runs at medium", argv[argv.index("--effort") + 1] == "medium" and r["effort"] == "medium"))
        _, r, argv = run("X1")
        results.append(("a frontier node with no effort runs at high", r["effort"] == "high" and r["rung"] == "1"))
        _, r, argv = run("C1")
        results.append(("a rung-0 node passes no --effort and records `default`", "--effort" not in argv and r["effort"] == "default" and r["rung"] == "0"))
        _, r, argv = run("B1", effort="medium", attempt="2")
        results.append(("an explicit --effort overrides and is what the row records", r["effort"] == "medium"))
        _, r, _ = run("V1", mode="reroute", attempt="2")
        results.append(("a reroute is recorded as served: <model>, the model column unchanged",
                        "served: claude-opus-4-8" in r["note"] and r["model"] == "claude-opus-5-5"))
        _, r, _ = run("X1", mode="limit", attempt="2")
        results.append(("a session-limit placeholder is recorded as served: <synthetic>, and the spawn as failed",
                        "served: <synthetic>" in r["note"] and r["verdict"] == "SPAWN-FAILED" and "exit 1" in r["note"]))
        results.append(("the spawn's transcript and result stay beside the row",
                        os.path.isfile(os.path.join(state, "spawns", "X1-a2", "transcript.jsonl"))
                        and os.path.isfile(os.path.join(state, "spawns", "X1-a2", "result.json"))))
        open(os.path.join(state, "plan", "graph.yaml"), "w").write(
            "nodes:\n  - id: N1\n    rung: 1\n    effort: medium\n  - id: N0\n    rung: 0\n")
        results.append(("a `nodes:` mapping graph is read the same as a flat list",
                        resolve(state, "N1", "graph", "graph") == (1, "medium")
                        and resolve(state, "N0", "graph", "graph") == (0, "default")))
        try:
            parse(["--node", "B1", "--model", "m", "--prompt", prompt, "--effort", "hgih", "--state-root", state])
            resolve(state, "B1", "graph", "hgih")
            results.append(("a misspelt effort is refused", False))
        except SystemExit:
            results.append(("a misspelt effort is refused", True))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("Each line below must PASS. A dispatcher that records what it meant rather than what ran has failed.\n")
    bad = 0
    for label, ok in results:
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
        bad += 0 if ok else 1
    print("\n%d/%d passed." % (len(results) - bad, len(results)))
    return 1 if bad else 0


def main(argv):
    if "--selftest" in argv:
        return selftest()
    return dispatch(parse(argv[1:]))


if __name__ == "__main__":
    sys.exit(main(sys.argv))
