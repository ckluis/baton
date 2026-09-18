#!/usr/bin/env python3
"""baton inbox, GitHub doorbell - questions out to Issues, answers in to files (CONTRACT §10).

    python3 tools/inbox-gh.py open-run      [--state-root _orch] [--repo owner/name]
    python3 tools/inbox-gh.py sync          [--dry-run] ...     at every gate, BEFORE the inbox is read
    python3 tools/inbox-gh.py post-summary  ...                 _orch/index/summary.md onto the run Issue
    python3 tools/inbox-gh.py clock         ...                 §7: server push time bounds every row's ts
    python3 tools/inbox-gh.py status        ...
    python3 tools/inbox-gh.py --selftest                        a fake `gh`, a temp corpus, every path

THE FILE IS THE CONTRACT; THE ISSUE IS THE DOORBELL. `sync` opens one Issue per
`_orch/inbox/Q-<n>.md` that has none, and copies an answer it finds on an open
one into `Q-<n>.answer.md` under a provenance block. The run reads the file, never
the comment, exactly as it does for a second session (§10). An answer is a comment
beginning `/answer`, or the comment that closed the Issue. Who may answer: the
Issue's assignee, anyone in manifest.json's `answerers:`, or - if neither is set -
anyone. An answer from anyone else is written with `unauthorized: true`, is not
applied, and is left open for the next brief to surface.

`_orch/inbox/github.json` is run state: which Issue rang for which question.

Stdlib only; talks to GitHub through `gh` (override with --gh or BATON_GH). Never
writes outside the state root. Every GitHub write is printed before it happens;
--dry-run prints and does nothing.
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
ANSWER_PREFIX = "/answer"
LABELS = {"baton": "5319e7", "baton:run": "0e8a16", "baton:blocked": "d93f0b"}


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
        """Run gh. A write under --dry-run is printed and skipped."""
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
        self.state = load_json(self.state_path, {"repo": repo, "run_issue": None, "questions": {}})
        self.manifest = load_json(os.path.join(root, "manifest.json"), {})

    def save(self):
        if self.gh.dry_run:
            return
        write(self.state_path, json.dumps(self.state, indent=2, sort_keys=True) + "\n")

    # -- run issue ----------------------------------------------------------

    def ensure_labels(self):
        for name, color in LABELS.items():
            self.gh.run(["label", "create", name, "--repo", self.repo, "--color", color,
                         "--force", "--description", "baton run state"], writes=True)

    def open_run(self):
        if self.state.get("run_issue"):
            self.log("run issue already open: %s" % self.state["run_issue"]["url"])
            return 0
        m = self.manifest
        title = "baton run %s · %s · %s" % (m.get("run_id", "?"), m.get("mode", "?"),
                                            os.path.basename(str(m.get("target", "?"))))
        rows = "\n".join("| `%s` | `%s` |" % (k, v) for k, v in sorted(m.items()))
        directive = (read(os.path.join(self.root, "directive.md")) or "")[:1500]
        body = ("| setting | value |\n|---|---|\n%s\n\n"
                "### Directive (first lines)\n\n%s\n\n---\n"
                "Blocked questions open as sub-issues of this one, labelled `baton:blocked`. "
                "The run's index summary is posted here at every gate.\n" % (rows, directive))
        self.ensure_labels()
        self.log("create run issue: %s" % title)
        url = self.gh.run(["issue", "create", "--repo", self.repo, "--title", title,
                           "--body-file", "-", "--label", "baton", "--label", "baton:run"],
                          stdin=body, writes=True).strip()
        if url:
            self.state["run_issue"] = {"number": int(url.rstrip("/").split("/")[-1]), "url": url}
            self.save()
        return 0

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
                qid = m.group(1)
                out.append((qid, "%s.answer.md" % qid in names))
        return out

    def issue_id(self, number):
        data = self.gh.json(["api", "repos/%s/issues/%d" % (self.repo, number)])
        return data.get("id") if isinstance(data, dict) else None

    def create_question(self, qid):
        text = read(os.path.join(self.inbox, qid + ".md")) or ""
        title_m = re.search(r"^#\s+(.+)$", text, re.M)
        title = "%s · %s" % (qid, (title_m.group(1) if title_m else text.strip().split("\n")[0])[:120])
        run = self.state.get("run_issue")
        body = text + ("\n\n---\nRun: #%d\n" % run["number"] if run else "\n\n---\n") + (
            "Answer by commenting `/answer …` on this issue, or close it with a comment. "
            "The run reads the answer at its next gate; the record is "
            "`_orch/inbox/%s.answer.md`.\n" % qid)
        self.log("create issue for %s: %s" % (qid, title))
        url = self.gh.run(["issue", "create", "--repo", self.repo, "--title", title,
                           "--body-file", "-", "--label", "baton", "--label", "baton:blocked"],
                          stdin=body, writes=True).strip()
        if not url:
            return
        number = int(url.rstrip("/").split("/")[-1])
        self.state["questions"][qid] = {"number": number, "url": url, "answered": False}
        if run:
            try:
                sub = self.issue_id(number)
                if sub:
                    self.gh.run(["api", "-X", "POST",
                                 "repos/%s/issues/%d/sub_issues" % (self.repo, run["number"]),
                                 "-F", "sub_issue_id=%d" % sub], writes=True)
            except RuntimeError as exc:
                self.log("  (sub-issue link skipped: %s)" % exc)
        self.save()

    def authorized(self, assignees):
        allowed = set(a.get("login") for a in (assignees or []) if a.get("login"))
        allowed |= set(self.manifest.get("answerers") or [])
        return allowed  # empty set means: anyone

    def find_answer(self, view):
        comments = view.get("comments") or []
        allowed = self.authorized(view.get("assignees"))
        unauthorized = None
        for c in comments:
            body = (c.get("body") or "").strip()
            if not body.startswith(ANSWER_PREFIX):
                continue
            login = ((c.get("author") or {}).get("login")) or "?"
            if allowed and login not in allowed:
                unauthorized = unauthorized or (c, login)
                continue
            return c, login, False
        if (view.get("state") or "").upper() == "CLOSED" and comments:
            c = comments[-1]
            login = ((c.get("author") or {}).get("login")) or "?"
            if not allowed or login in allowed:
                return c, login, False
            unauthorized = unauthorized or (c, login)
        if unauthorized:
            return unauthorized[0], unauthorized[1], True
        return None, None, False

    def write_answer(self, qid, entry, comment, login, unauthorized):
        body = (comment.get("body") or "").strip()
        if body.startswith(ANSWER_PREFIX):
            body = body[len(ANSWER_PREFIX):].strip()
        head = ["---",
                "answered_by: %s" % login,
                "answered_via: github-issue",
                "issue: %s" % entry["url"],
                "comment_url: %s" % (comment.get("url") or entry["url"]),
                "answered_at: %s" % (comment.get("createdAt") or ""),
                "synced_at: %s" % now_utc()]
        if unauthorized:
            head.append("unauthorized: true")
        head.append("---")
        text = "\n".join(head) + "\n\n" + body + "\n"
        path = os.path.join(self.inbox, qid + ".answer.md")
        self.log("%s %s <- %s (%s)" % ("record UNAUTHORIZED answer" if unauthorized else "write",
                                       os.path.relpath(path, self.root), login, entry["url"]))
        if not self.gh.dry_run:
            write(path, text)

    def sync(self):
        created, answered, unauthorized, waiting = 0, 0, 0, 0
        for qid, has_answer in self.questions():
            entry = self.state["questions"].get(qid)
            if has_answer:
                if entry and not entry.get("answered"):
                    entry["answered"] = True
                continue
            if not entry:
                self.create_question(qid)
                created += 1
                continue
            view = self.gh.json(["issue", "view", str(entry["number"]), "--repo", self.repo,
                                 "--json", "state,assignees,comments,url"])
            comment, login, is_unauthorized = self.find_answer(view or {})
            if comment is None:
                waiting += 1
                continue
            self.write_answer(qid, entry, comment, login, is_unauthorized)
            if is_unauthorized:
                unauthorized += 1
                continue
            entry["answered"] = True
            entry["answered_by"] = login
            answered += 1
            if (view.get("state") or "").upper() != "CLOSED":
                self.gh.run(["issue", "close", str(entry["number"]), "--repo", self.repo,
                             "--comment", "Recorded as `_orch/inbox/%s.answer.md` at the gate. "
                                          "Thank you." % qid], writes=True)
        self.save()
        self.log("sync: %d opened, %d answered, %d unauthorized, %d waiting"
                 % (created, answered, unauthorized, waiting))
        return 0

    # -- summary, clock, status ---------------------------------------------

    def post_summary(self):
        run = self.state.get("run_issue")
        path = os.path.join(self.root, "index", "summary.md")
        if not run:
            self.log("no run issue; run open-run first")
            return 1
        if read(path) is None:
            self.log("no %s; run tools/index.py first" % os.path.relpath(path, self.root))
            return 1
        self.log("comment summary.md on #%d" % run["number"])
        self.gh.run(["issue", "comment", str(run["number"]), "--repo", self.repo,
                     "--body-file", path], writes=True)
        return 0

    def clock(self):
        ref = (load_json(os.path.join(self.root, "run-ref.json"), {}) or {}).get("ref")
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
            if p.get("ref") != "refs/heads/" + ref:
                continue
            for c in p.get("commits") or []:
                sha = c.get("sha")
                if sha and (sha not in pushed_at or ev["created_at"] < pushed_at[sha]):
                    pushed_at[sha] = ev["created_at"]
        flagged, unpushed, ok = [], 0, 0
        for n in names:
            text = read(os.path.join(ledger, n)) or ""
            lines = [l for l in text.splitlines() if l.strip()]
            ts = lines[1].split(",")[0].strip() if len(lines) > 1 else ""
            proc = subprocess.run(["git", "-C", self.root, "log", "--diff-filter=A",
                                   "--format=%H", "-n", "1", "--", os.path.join("ledger", n)],
                                  capture_output=True, text=True)
            sha = proc.stdout.strip()
            at = pushed_at.get(sha)
            if not at:
                unpushed += 1
            elif ts > at:
                flagged.append((n, ts, at))
            else:
                ok += 1
        self.log("clock: %d rows bounded by a push, %d not yet pushed or not visible, %d FLAGGED"
                 % (ok, unpushed, len(flagged)))
        for n, ts, at in flagged:
            self.log("  %s: ts %s is later than its push at %s - not measured (§7.1)" % (n, ts, at))
        return 1 if flagged else 0

    def status(self):
        run = self.state.get("run_issue")
        self.log("repo: %s" % self.repo)
        self.log("run issue: %s" % (run["url"] if run else "none"))
        for qid, e in sorted(self.state["questions"].items()):
            self.log("  %s -> #%d %s%s" % (qid, e["number"],
                                            "answered" if e.get("answered") else "open",
                                            " by " + e["answered_by"] if e.get("answered_by") else ""))
        return 0


# --------------------------------------------------------------------------
# selftest
# --------------------------------------------------------------------------

FAKE_GH = r'''#!/usr/bin/env python3
import json, os, sys
a = sys.argv[1:]
with open(os.environ["FAKE_GH_LOG"], "a") as fh: fh.write(json.dumps(a) + "\n")
canned = json.load(open(os.environ["FAKE_GH_ISSUES"]))
def bump():
    p = os.environ["FAKE_GH_COUNTER"]; n = int(open(p).read() or "0") + 1
    open(p, "w").write(str(n)); return n
if a[:2] == ["repo", "view"]: sys.stdout.write("acme/widgets\n")
elif a[:2] == ["label", "create"]: pass
elif a[:2] == ["issue", "create"]: sys.stdout.write("https://github.com/acme/widgets/issues/%d\n" % bump())
elif a[:2] == ["issue", "view"]: sys.stdout.write(json.dumps(canned.get(a[2], {"state": "OPEN", "comments": [], "assignees": []})))
elif a[:2] in (["issue", "close"], ["issue", "comment"]): pass
elif a[0] == "api":
    path = [x for x in a[1:] if x.startswith("repos/")][0]
    if path.endswith("/events"): sys.stdout.write(json.dumps(canned.get("events", [])))
    elif "/sub_issues" in path: pass
    elif "/statuses/" in path: sys.stdout.write("{}")
    else: sys.stdout.write(json.dumps({"id": 1000 + int(path.rstrip("/").split("/")[-1])}))
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
            {"run_id": "r1", "mode": "BUILD", "target": "/x/widgets", "answerers": ["alice"]}))
        write(os.path.join(root, "directive.md"), "# directive\n")
        write(os.path.join(root, "inbox", "Q-01.md"), "# Which retry policy?\n\nA, B or C.\n")
        write(os.path.join(root, "inbox", "Q-02.md"), "# Drop the legacy path?\n")
        write(os.path.join(root, "inbox", "Q-03.md"), "# already answered\n")
        write(os.path.join(root, "inbox", "Q-03.answer.md"), "B\n")
        write(os.path.join(root, "index", "summary.md"), "# baton run index\n")
        gh_path = os.path.join(tmp, "gh")
        write(gh_path, FAKE_GH)
        os.chmod(gh_path, 0o755)
        log_path, counter, issues = (os.path.join(tmp, n) for n in ("gh.log", "counter", "issues.json"))
        write(counter, "0")
        # issue 1 = run, 2 = Q-01, 3 = Q-02 (creation order)
        write(issues, json.dumps({
            "2": {"state": "OPEN", "assignees": [{"login": "alice"}], "url": "https://github.com/acme/widgets/issues/2",
                  "comments": [{"author": {"login": "bob"}, "body": "what about D?", "createdAt": "2026-09-18T09:00:00Z",
                                "url": "https://github.com/acme/widgets/issues/2#issuecomment-1"},
                               {"author": {"login": "alice"}, "body": "/answer Option B, ship it.",
                                "createdAt": "2026-09-18T10:00:00Z",
                                "url": "https://github.com/acme/widgets/issues/2#issuecomment-2"}]},
            "3": {"state": "OPEN", "assignees": [], "url": "https://github.com/acme/widgets/issues/3",
                  "comments": [{"author": {"login": "mallory"}, "body": "/answer do nothing",
                                "createdAt": "2026-09-18T10:30:00Z",
                                "url": "https://github.com/acme/widgets/issues/3#issuecomment-3"}]}}))
        env = dict(os.environ, FAKE_GH_LOG=log_path, FAKE_GH_COUNTER=counter, FAKE_GH_ISSUES=issues)
        os.environ.update(env)
        out = []
        gh = GH(gh_path, False, out.append)
        box = Inbox(root, "acme/widgets", gh, out.append)
        box.open_run()
        case("open-run creates the run issue and records it",
             (box.state.get("run_issue") or {}).get("number") == 1)
        box.open_run()
        case("open-run is idempotent", read(counter) == "1")
        # dry run: nothing created, nothing written
        dry = Inbox(root, "acme/widgets", GH(gh_path, True, out.append), out.append)
        dry.sync()
        case("--dry-run opens no issue and writes no file",
             read(counter) == "1" and not os.path.exists(os.path.join(root, "inbox", "Q-01.answer.md")))
        # first sync: two issues opened for the two unanswered questions
        box = Inbox(root, "acme/widgets", gh, out.append)
        box.sync()
        q = box.state["questions"]
        case("sync opens one issue per unanswered question (2), none for the answered one",
             set(q) == {"Q-01", "Q-02"} and read(counter) == "3")
        # second sync: reads answers back
        box.sync()
        a1 = read(os.path.join(root, "inbox", "Q-01.answer.md")) or ""
        a2 = read(os.path.join(root, "inbox", "Q-02.answer.md")) or ""
        case("an authorized /answer becomes Q-01.answer.md with provenance",
             "answered_by: alice" in a1 and "Option B, ship it." in a1 and
             "comment_url: https://github.com/acme/widgets/issues/2#issuecomment-2" in a1)
        case("the first non-/answer comment is ignored", "what about D" not in a1)
        case("an unauthorized /answer is recorded, flagged, and NOT applied",
             "unauthorized: true" in a2 and q["Q-02"].get("answered") is not True)
        case("Q-01 is marked answered by alice; Q-02 stays open",
             q["Q-01"].get("answered") is True and q["Q-01"].get("answered_by") == "alice")
        calls = [json.loads(l) for l in (read(log_path) or "").splitlines()]
        closes = [c for c in calls if c[:2] == ["issue", "close"]]
        case("exactly one issue is closed (the answered one)", len(closes) == 1 and closes[0][2] == "2")
        box.sync()
        case("a third sync opens nothing new and closes nothing twice",
             read(counter) == "3" and len([c for c in calls if c[:2] == ["issue", "close"]]) == 1)
        case("post-summary comments summary.md on the run issue",
             box.post_summary() == 0 and any(c[:2] == ["issue", "comment"]
                                             for c in [json.loads(l) for l in read(log_path).splitlines()]))
        # clock: a git repo with two rows; one pushed before its ts (fabricated), one after
        subprocess.run(["git", "init", "-q", root], check=True)
        subprocess.run(["git", "-C", root, "config", "user.email", "t@e.st"], check=True)
        subprocess.run(["git", "-C", root, "config", "user.name", "t"], check=True)
        hdr = "ts,node,rung,model,effort,attempt,verdict,seconds,note\n"
        write(os.path.join(root, "ledger", "2026-09-18T100000Z-P1-1.csv"),
              hdr + "2026-09-18T10:00:00Z,P1,1,sonnet,low,1,DONE,1,\n")
        write(os.path.join(root, "ledger", "2026-09-18T130000Z-P2-1.csv"),
              hdr + "2026-09-18T13:00:00Z,P2,1,sonnet,low,1,DONE,1,\n")
        write(os.path.join(root, "run-ref.json"), json.dumps({"ref": "baton/run/r1"}))
        subprocess.run(["git", "-C", root, "add", "-A"], check=True)
        subprocess.run(["git", "-C", root, "commit", "-q", "-m", "rows"], check=True)
        sha = subprocess.run(["git", "-C", root, "rev-parse", "HEAD"], capture_output=True,
                             text=True).stdout.strip()
        canned = json.loads(read(issues))
        canned["events"] = [{"type": "PushEvent", "created_at": "2026-09-18T12:00:00Z",
                             "payload": {"ref": "refs/heads/baton/run/r1", "commits": [{"sha": sha}]}}]
        write(issues, json.dumps(canned))
        rc = box.clock()
        case("clock flags the row whose ts is later than its push, and only that one",
             rc == 1 and any("P2-1" in l and "FLAGGED" not in l and "later than" in l for l in out)
             and not any("P1-1" in l and "later than" in l for l in out))
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
            "repo": None, "gh": os.environ.get("BATON_GH", "gh"), "dry": False}
    rest = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--state-root", "--repo", "--gh") and i + 1 < len(args):
            opts[{"--state-root": "state", "--repo": "repo", "--gh": "gh"}[a]] = args[i + 1]
            i += 2
            continue
        if a == "--dry-run":
            opts["dry"] = True
        else:
            rest.append(a)
        i += 1
    if not rest or rest[0] not in ("open-run", "sync", "post-summary", "clock", "status"):
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
        return {"open-run": box.open_run, "sync": box.sync, "post-summary": box.post_summary,
                "clock": box.clock, "status": box.status}[rest[0]]()
    except RuntimeError as exc:
        log("inbox-gh: %s" % exc)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
