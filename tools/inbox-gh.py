#!/usr/bin/env python3
"""baton inbox, GitHub doorbell - one thread, comments out, answers in (CONTRACT §10).

    python3 tools/inbox-gh.py open-run    [--state-root _orch] [--repo owner/name]
    python3 tools/inbox-gh.py sync        [--dry-run] ...     at every gate, BEFORE the inbox is read
    python3 tools/inbox-gh.py post-gate   [--gate <name>] ... the index summary + the gate's deck, as one comment
    python3 tools/inbox-gh.py clock       ...                 §7: the server's push time bounds every row's ts
    python3 tools/inbox-gh.py status      ...
    python3 tools/inbox-gh.py --selftest                      a fake `gh`, a temp corpus, every path

THE FILE IS THE CONTRACT; THE THREAD IS THE DOORBELL. A run has one thread: the
draft pull request on its branch (publish-run.sh init made the branch), or an
Issue when a pull request cannot be opened. `open-run` opens it. `sync` posts one
comment per `_orch/inbox/Q-<n>.md` that has none, and copies an answer it finds
into `Q-<n>.answer.md` under a provenance block. An answer is any comment on the
thread beginning `/answer Q-<n>`. Who may answer: the thread's assignees, anyone
in manifest.json's `answerers:`, or - if neither is set - anyone. An answer from
anyone else is written with `unauthorized: true`, is not applied, and is surfaced
in the next brief. `post-gate` is the run's only other output on the thread: one
comment per gate carrying `_orch/index/summary.md` and, when the gate wrote one,
the deck's markdown twin (`_orch/brief/<gate>.md`).

`_orch/inbox/github.json` is run state: the thread, and which comment carries
which question. Nothing else is created on GitHub: no labels, no Issues per
question, no pages, no releases.

Stdlib only; talks to GitHub through `gh` (override with --gh or BATON_GH). Every
write is printed before it happens; --dry-run prints and does nothing.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import shutil
import datetime

QUESTION_RE = re.compile(r"^(Q-[^.]+)\.md$")
ANSWER_RE = re.compile(r"^\s*/answer\s+(Q-[A-Za-z0-9._-]+)\s*[:\-—]?\s*(.*)$", re.S | re.I)


def now_utc():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return None


def write(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def load_json(path, default):
    text = read(path)
    if text is None:
        return default
    try:
        return json.loads(text)
    except ValueError:
        return default


class GH(object):
    def __init__(self, binary, dry_run, log):
        self.binary, self.dry_run, self.log = binary, dry_run, log

    def run(self, args, stdin=None, writes=False):
        if writes and self.dry_run:
            self.log("dry-run: gh " + " ".join(args))
            return ""
        proc = subprocess.run([self.binary] + args, input=stdin, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError("gh %s failed: %s" % (" ".join(args[:3]), proc.stderr.strip()[:300]))
        return proc.stdout

    def json(self, args, stdin=None, writes=False):
        out = self.run(args, stdin, writes)
        return json.loads(out) if out.strip() else None


class Inbox(object):
    def __init__(self, root, repo, gh, log):
        self.root, self.repo, self.gh, self.log = root, repo, gh, log
        self.inbox = os.path.join(root, "inbox")
        self.state_path = os.path.join(self.inbox, "github.json")
        self.state = load_json(self.state_path, {"repo": repo, "thread": None, "questions": {}})
        self.manifest = load_json(os.path.join(root, "manifest.json"), {})
        self.run_ref = load_json(os.path.join(root, "run-ref.json"), {}) or {}

    def save(self):
        if self.gh.dry_run:
            return
        write(self.state_path, json.dumps(self.state, indent=2, sort_keys=True) + "\n")

    # -- the thread ---------------------------------------------------------

    def thread_body(self):
        m = self.manifest
        rows = "\n".join("| `%s` | `%s` |" % (k, v) for k, v in sorted(m.items()))
        directive = (read(os.path.join(self.root, "directive.md")) or "")[:1500]
        return ("Opened by baton. One commit per node lands on this branch; each node's computed "
                "verdict is the check `baton/verify` on its commit. Blocked questions arrive here as "
                "comments — reply `/answer Q-<n> …` to any of them. Every gate posts the run's index "
                "summary and its decisions. The full record — every envelope, verdict and ledger row — "
                "is on `%s`; every gate comment links into it.\n\n"
                "| setting | value |\n|---|---|\n%s\n\n### Directive (first lines)\n\n%s\n"
                % (self.run_ref.get("ref", "the run ref"), rows, directive))

    def open_run(self):
        if self.state.get("thread"):
            self.log("thread already open: %s" % self.state["thread"]["url"])
            return 0
        m = self.manifest
        title = "baton run %s · %s · %s" % (m.get("run_id", "?"), m.get("mode", "?"),
                                            os.path.basename(str(m.get("target", "?"))))
        body = self.thread_body()
        branch, base = self.run_ref.get("run_branch"), self.run_ref.get("base") or "main"
        url, kind = "", None
        if branch:
            self.log("open draft pull request from %s: %s" % (branch, title))
            try:
                url = self.gh.run(["pr", "create", "--repo", self.repo, "--draft", "--head", branch,
                                   "--base", base, "--title", title, "--body-file", "-"],
                                  stdin=body, writes=True).strip()
                kind = "pr"
            except RuntimeError as exc:
                self.log("  pull request refused (%s); opening an issue instead" % str(exc)[:120])
        if not url and not self.gh.dry_run:
            self.log("open issue: %s" % title)
            url = self.gh.run(["issue", "create", "--repo", self.repo, "--title", title,
                               "--body-file", "-"], stdin=body, writes=True).strip()
            kind = "issue"
        if url:
            self.state["thread"] = {"kind": kind, "number": int(url.rstrip("/").split("/")[-1]), "url": url}
            self.save()
        return 0

    def need_thread(self):
        t = self.state.get("thread")
        if not t:
            self.log("no thread; run open-run first")
        return t

    # -- questions ----------------------------------------------------------

    def questions(self):
        try:
            names = sorted(os.listdir(self.inbox))
        except OSError:
            return []
        out = []
        for n in names:
            m = QUESTION_RE.match(n)
            if m and not n.endswith(".answer.md"):
                out.append((m.group(1), "%s.answer.md" % m.group(1) in names))
        return out

    def comment(self, number, body):
        data = self.gh.json(["api", "-X", "POST", "repos/%s/issues/%d/comments" % (self.repo, number),
                             "-f", "body=@-"], stdin=body, writes=True)
        return data or {}

    def post_question(self, qid, number):
        text = read(os.path.join(self.inbox, qid + ".md")) or ""
        title_m = re.search(r"^#\s+(.+)$", text, re.M)
        title = (title_m.group(1) if title_m else text.strip().split("\n")[0])[:120]
        body = ("### %s — %s\n\n%s\n\n---\nReply on this thread with `/answer %s …`. The run reads it at "
                "its next gate; the record is `_orch/inbox/%s.answer.md`.\n" % (qid, title, text.strip(), qid, qid))
        self.log("post question %s on #%d: %s" % (qid, number, title))
        data = self.comment(number, body)
        if data.get("id") or self.gh.dry_run:
            self.state["questions"][qid] = {"comment_id": data.get("id"), "url": data.get("html_url"),
                                            "answered": False}
            self.save()

    def authorized(self, assignees):
        allowed = set(a.get("login") for a in (assignees or []) if a.get("login"))
        allowed |= set(self.manifest.get("answerers") or [])
        return allowed  # empty: anyone

    def write_answer(self, qid, comment, login, body, unauthorized):
        head = ["---", "answered_by: %s" % login, "answered_via: github-thread",
                "thread: %s" % self.state["thread"]["url"],
                "comment_url: %s" % (comment.get("html_url") or ""),
                "answered_at: %s" % (comment.get("created_at") or ""),
                "synced_at: %s" % now_utc()]
        if unauthorized:
            head.append("unauthorized: true")
        head.append("---")
        path = os.path.join(self.inbox, qid + ".answer.md")
        self.log("%s %s <- %s" % ("record UNAUTHORIZED answer" if unauthorized else "write",
                                  os.path.relpath(path, self.root), login))
        if not self.gh.dry_run:
            write(path, "\n".join(head) + "\n\n" + body.strip() + "\n")

    def sync(self):
        t = self.need_thread()
        if not t:
            return 1
        number = t["number"]
        posted, answered, unauthorized, waiting = 0, 0, 0, 0
        for qid, has_answer in self.questions():
            entry = self.state["questions"].get(qid)
            if has_answer:
                if entry and not entry.get("answered"):
                    entry["answered"] = True
                continue
            if not entry:
                self.post_question(qid, number)
                posted += 1
        open_qids = [q for q, a in self.questions() if not a and self.state["questions"].get(q)]
        if open_qids:
            meta = self.gh.json(["api", "repos/%s/issues/%d" % (self.repo, number)]) or {}
            allowed = self.authorized(meta.get("assignees"))
            comments = self.gh.json(["api", "repos/%s/issues/%d/comments" % (self.repo, number),
                                     "--paginate"]) or []
            if isinstance(comments, dict):
                comments = [comments]
            for qid in open_qids:
                entry = self.state["questions"][qid]
                found, unauth_hit = None, None
                for c in comments:
                    m = ANSWER_RE.match(c.get("body") or "")
                    if not m or m.group(1).lower() != qid.lower():
                        continue
                    login = ((c.get("user") or {}).get("login")) or "?"
                    if allowed and login not in allowed:
                        unauth_hit = unauth_hit or (c, login, m.group(2))
                        continue
                    found = (c, login, m.group(2))
                    break
                if found:
                    c, login, body = found
                    self.write_answer(qid, c, login, body, False)
                    entry["answered"], entry["answered_by"] = True, login
                    answered += 1
                elif unauth_hit:
                    c, login, body = unauth_hit
                    self.write_answer(qid, c, login, body, True)
                    unauthorized += 1
                else:
                    waiting += 1
        self.save()
        self.log("sync: %d posted, %d answered, %d unauthorized, %d waiting" % (posted, answered, unauthorized, waiting))
        return 0

    # -- gates, clock, status -----------------------------------------------

    def post_gate(self, gate=None):
        t = self.need_thread()
        if not t:
            return 1
        summary = read(os.path.join(self.root, "index", "summary.md"))
        if summary is None:
            self.log("no _orch/index/summary.md; run tools/index.py first")
            return 1
        gate = gate or str(self.manifest.get("phase") or "gate")
        parts = ["## Gate · %s\n" % gate, summary.strip()]
        deck = None
        for cand in ("%s.md" % gate, "blocked-%s.md" % gate, "final.md" if gate == "final" else None):
            if cand and read(os.path.join(self.root, "brief", cand)) is not None:
                deck = cand
                break
        if deck:
            parts += ["\n---\n", read(os.path.join(self.root, "brief", deck)).strip()]
        self.log("post gate comment on #%d (%s%s)" % (t["number"], gate, " + " + deck if deck else ""))
        self.comment(t["number"], "\n".join(parts) + "\n")
        return 0

    def clock(self):
        ref = self.run_ref.get("ref")
        if not ref:
            self.log("no run-ref.json; the run is not published (§6.1)")
            return 1
        ledger = os.path.join(self.root, "ledger")
        try:
            names = sorted(n for n in os.listdir(ledger) if n.endswith(".csv"))
        except OSError:
            self.log("no ledger/ directory (§6.3)")
            return 1
        pushed_at = {}
        events = self.gh.json(["api", "repos/%s/events" % self.repo, "--paginate"]) or []
        if isinstance(events, dict):
            events = [events]
        for ev in events:
            if ev.get("type") != "PushEvent":
                continue
            p = ev.get("payload") or {}
            if p.get("ref") != ref:
                continue
            for c in p.get("commits") or []:
                sha = c.get("sha")
                if sha and (sha not in pushed_at or ev["created_at"] < pushed_at[sha]):
                    pushed_at[sha] = ev["created_at"]
        flagged, unpushed, ok = [], 0, 0
        for n in names:
            lines = [l for l in (read(os.path.join(ledger, n)) or "").splitlines() if l.strip()]
            ts = lines[1].split(",")[0].strip() if len(lines) > 1 else ""
            proc = subprocess.run(["git", "-C", self.root, "log", "--diff-filter=A", "--format=%H",
                                   "-n", "1", "--", os.path.join("ledger", n)], capture_output=True, text=True)
            at = pushed_at.get(proc.stdout.strip())
            if not at:
                unpushed += 1
            elif ts > at:
                flagged.append((n, ts, at))
            else:
                ok += 1
        self.log("clock: %d rows bounded by a push, %d not yet pushed or not visible, %d FLAGGED" % (ok, unpushed, len(flagged)))
        for n, ts, at in flagged:
            self.log("  %s: ts %s is later than its push at %s - not measured (§7.1)" % (n, ts, at))
        return 1 if flagged else 0

    def status(self):
        t = self.state.get("thread")
        self.log("repo:   %s" % self.repo)
        self.log("thread: %s" % ("%s #%d %s" % (t["kind"], t["number"], t["url"]) if t else "none"))
        for qid, e in sorted(self.state["questions"].items()):
            self.log("  %s -> comment %s %s%s" % (qid, e.get("comment_id"), "answered" if e.get("answered") else "open",
                                                   " by " + e["answered_by"] if e.get("answered_by") else ""))
        return 0


# --------------------------------------------------------------------------
# selftest
# --------------------------------------------------------------------------

FAKE_GH = r'''#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
with open(os.environ["FAKE_GH_LOG"], "a") as fh: fh.write(json.dumps(a) + "\n")
canned = json.load(open(os.environ["FAKE_GH_CANNED"]))
def bump():
    p = os.environ["FAKE_GH_COUNTER"]; n = int(open(p).read() or "0") + 1
    open(p, "w").write(str(n)); return n
if a[:2] == ["repo", "view"]: sys.stdout.write("acme/widgets\n")
elif a[:2] == ["pr", "create"]:
    if os.environ.get("FAKE_GH_PR_FAIL"): sys.stderr.write("no commits between main and baton/r1\n"); sys.exit(1)
    sys.stdout.write("https://github.com/acme/widgets/pull/7\n")
elif a[:2] == ["issue", "create"]: sys.stdout.write("https://github.com/acme/widgets/issues/9\n")
elif a[0] == "api":
    path = [x for x in a[1:] if x.startswith("repos/")][0]
    if "-X" in a and "POST" in a and path.endswith("/comments"):
        n = bump(); sys.stdout.write(json.dumps({"id": 100 + n, "html_url": "https://github.com/acme/widgets/pull/7#issuecomment-%d" % (100 + n)}))
    elif path.endswith("/comments"): sys.stdout.write(json.dumps(canned.get("comments", [])))
    elif path.endswith("/events"): sys.stdout.write(json.dumps(canned.get("events", [])))
    elif "/statuses/" in path: sys.stdout.write("{}")
    else: sys.stdout.write(json.dumps({"assignees": canned.get("assignees", [])}))
else: sys.stderr.write("fake gh: unknown %r\n" % a); sys.exit(2)
'''


def selftest():
    results = []

    def case(label, ok):
        results.append((label, ok))

    tmp = tempfile.mkdtemp(prefix="baton-inbox-")
    try:
        root = os.path.join(tmp, "_orch")
        write(os.path.join(root, "manifest.json"), json.dumps(
            {"run_id": "r1", "mode": "BUILD", "target": "/x/widgets", "answerers": ["alice"], "phase": "P3"}))
        write(os.path.join(root, "run-ref.json"), json.dumps(
            {"ref": "refs/baton/run/r1", "run_branch": "baton/r1", "base": "main"}))
        write(os.path.join(root, "directive.md"), "# directive\n")
        write(os.path.join(root, "inbox", "Q-01.md"), "# Which retry policy?\n\nA, B or C.\n")
        write(os.path.join(root, "inbox", "Q-02.md"), "# Drop the legacy path?\n")
        write(os.path.join(root, "inbox", "Q-03.md"), "# already answered\n")
        write(os.path.join(root, "inbox", "Q-03.answer.md"), "B\n")
        write(os.path.join(root, "index", "summary.md"), "# baton run index\n\n3 nodes.\n")
        write(os.path.join(root, "brief", "P3.md"), "## Decision 1\n\nA, B, C.\n")
        gh_path = os.path.join(tmp, "gh")
        write(gh_path, FAKE_GH)
        os.chmod(gh_path, 0o755)
        log_path, counter, canned = (os.path.join(tmp, n) for n in ("gh.log", "counter", "canned.json"))
        write(counter, "0")
        write(canned, json.dumps({"assignees": [], "comments": []}))
        os.environ.update(FAKE_GH_LOG=log_path, FAKE_GH_COUNTER=counter, FAKE_GH_CANNED=canned)
        os.environ.pop("FAKE_GH_PR_FAIL", None)
        out = []
        gh = GH(gh_path, False, out.append)
        box = Inbox(root, "acme/widgets", gh, out.append)
        box.open_run()
        case("open-run opens a draft pull request on the run branch and records it as the thread",
             (box.state.get("thread") or {}).get("kind") == "pr" and box.state["thread"]["number"] == 7)
        box.open_run()
        calls = lambda: [json.loads(l) for l in (read(log_path) or "").splitlines()]
        case("open-run is idempotent", len([c for c in calls() if c[:2] == ["pr", "create"]]) == 1)
        # fallback: a pull request that cannot be opened becomes an issue
        os.environ["FAKE_GH_PR_FAIL"] = "1"
        fb = Inbox(os.path.join(tmp, "_orch2"), "acme/widgets", gh, out.append)
        write(os.path.join(tmp, "_orch2", "manifest.json"), "{}")
        write(os.path.join(tmp, "_orch2", "run-ref.json"), json.dumps({"run_branch": "baton/r2", "base": "main"}))
        fb = Inbox(os.path.join(tmp, "_orch2"), "acme/widgets", gh, out.append)
        fb.open_run()
        case("when a pull request cannot be opened, the thread is an issue",
             (fb.state.get("thread") or {}).get("kind") == "issue")
        os.environ.pop("FAKE_GH_PR_FAIL", None)
        # dry run posts nothing
        dry = Inbox(root, "acme/widgets", GH(gh_path, True, out.append), out.append)
        dry.sync()
        case("--dry-run posts no comment and writes no file",
             read(counter) == "0" and not os.path.exists(os.path.join(root, "inbox", "Q-01.answer.md")))
        # first sync: two comments, one per unanswered question, none for the answered one
        box = Inbox(root, "acme/widgets", gh, out.append)
        box.sync()
        q = box.state["questions"]
        case("sync posts one comment per unanswered question (2), none for the answered one",
             set(q) == {"Q-01", "Q-02"} and read(counter) == "2")
        # answers arrive on the thread
        write(canned, json.dumps({"assignees": [], "comments": [
            {"id": 1, "user": {"login": "bob"}, "body": "what about D?", "created_at": "2026-09-21T09:00:00Z",
             "html_url": "https://github.com/acme/widgets/pull/7#issuecomment-1"},
            {"id": 2, "user": {"login": "alice"}, "body": "/answer Q-01 Option B, ship it.",
             "created_at": "2026-09-21T10:00:00Z", "html_url": "https://github.com/acme/widgets/pull/7#issuecomment-2"},
            {"id": 3, "user": {"login": "mallory"}, "body": "/answer Q-02: do nothing",
             "created_at": "2026-09-21T10:30:00Z", "html_url": "https://github.com/acme/widgets/pull/7#issuecomment-3"}]}))
        box.sync()
        a1 = read(os.path.join(root, "inbox", "Q-01.answer.md")) or ""
        a2 = read(os.path.join(root, "inbox", "Q-02.answer.md")) or ""
        case("an authorized /answer Q-01 becomes Q-01.answer.md with provenance",
             "answered_by: alice" in a1 and "Option B, ship it." in a1 and "issuecomment-2" in a1)
        case("a comment that is not an /answer is ignored", "what about D" not in a1)
        case("an unauthorized /answer is recorded, flagged, and NOT applied",
             "unauthorized: true" in a2 and q["Q-02"].get("answered") is not True)
        case("Q-01 is marked answered by alice", q["Q-01"].get("answered") is True and q["Q-01"].get("answered_by") == "alice")
        box.sync()
        case("a third sync posts nothing new", read(counter) == "2")
        case("no issue, label, close or page was ever created for a question",
             not any(c[:2] in (["issue", "create"], ["label", "create"], ["issue", "close"]) for c in calls()[3:]))
        n_before = int(read(counter))
        rc = box.post_gate("P3")
        case("post-gate posts one comment carrying the summary and the gate's deck",
             rc == 0 and int(read(counter)) == n_before + 1 and any("post gate comment" in l and "P3.md" in l for l in out))
        # clock: a git repo with two rows; one pushed before its ts (fabricated), one after
        subprocess.run(["git", "init", "-q", root], check=True)
        subprocess.run(["git", "-C", root, "config", "user.email", "t@e.st"], check=True)
        subprocess.run(["git", "-C", root, "config", "user.name", "t"], check=True)
        hdr = "ts,node,rung,model,effort,attempt,verdict,seconds,note\n"
        write(os.path.join(root, "ledger", "2026-09-21T100000Z-P1-1.csv"), hdr + "2026-09-21T10:00:00Z,P1,1,x,high,1,DONE,1,\n")
        write(os.path.join(root, "ledger", "2026-09-21T130000Z-P2-1.csv"), hdr + "2026-09-21T13:00:00Z,P2,1,x,high,1,DONE,1,\n")
        subprocess.run(["git", "-C", root, "add", "-A"], check=True)
        subprocess.run(["git", "-C", root, "commit", "-q", "-m", "rows"], check=True)
        sha = subprocess.run(["git", "-C", root, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
        c = json.loads(read(canned))
        c["events"] = [{"type": "PushEvent", "created_at": "2026-09-21T12:00:00Z",
                        "payload": {"ref": "refs/baton/run/r1", "commits": [{"sha": sha}]}}]
        write(canned, json.dumps(c))
        rc = box.clock()
        case("clock flags the row whose ts is later than its push on the hidden ref, and only that one",
             rc == 1 and any("P2-1" in l and "later than" in l for l in out) and not any("P1-1" in l and "later than" in l for l in out))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("Each line below must PASS. A doorbell that writes the wrong file is a defect in the contract.\n")
    bad = 0
    for label, ok in results:
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
        bad += 0 if ok else 1
    print("\n%d/%d passed." % (len(results) - bad, len(results)))
    return 1 if bad else 0


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------


def main(argv):
    if "--selftest" in argv:
        return selftest()
    args = list(argv[1:])
    opts = {"state": os.environ.get("BATON_STATE_ROOT", "").strip() or "_orch",
            "repo": None, "gh": os.environ.get("BATON_GH", "gh"), "dry": False, "gate": None}
    rest = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--state-root", "--repo", "--gh", "--gate") and i + 1 < len(args):
            opts[{"--state-root": "state", "--repo": "repo", "--gh": "gh", "--gate": "gate"}[a]] = args[i + 1]
            i += 2
            continue
        if a == "--dry-run":
            opts["dry"] = True
        else:
            rest.append(a)
        i += 1
    cmds = ("open-run", "sync", "post-gate", "post-summary", "clock", "status")
    if not rest or rest[0] not in cmds:
        sys.stdout.write(__doc__)
        return 2
    root = opts["state"] if os.path.isabs(opts["state"]) else os.path.join(os.getcwd(), opts["state"])
    log = lambda s: sys.stdout.write(s + "\n")
    gh = GH(opts["gh"], opts["dry"], log)
    repo = opts["repo"] or (load_json(os.path.join(root, "run-ref.json"), {}) or {}).get("repo")
    if not repo:
        try:
            repo = gh.run(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).strip()
        except RuntimeError as exc:
            log("cannot determine the repository: %s (pass --repo owner/name)" % exc)
            return 1
    box = Inbox(root, repo, gh, log)
    try:
        if rest[0] in ("post-gate", "post-summary"):
            return box.post_gate(opts["gate"])
        return {"open-run": box.open_run, "sync": box.sync, "clock": box.clock, "status": box.status}[rest[0]]()
    except RuntimeError as exc:
        log("inbox-gh: %s" % exc)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
