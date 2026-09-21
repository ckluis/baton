#!/usr/bin/env sh
# test-team.sh — every TEAM-mode tool, proven without touching GitHub.
#
#   tools/test-team.sh
#
# Runs the Python selftests (lists.py, inbox-gh.py, tiers.py), then an end-to-end
# run of publish-run.sh, node-pr.sh and inbox-gh.py against a throwaway target
# repository with a throwaway bare origin and a fake `gh` (BATON_GH). Exit 1 on
# any failure. Nothing here needs a network, a token, or gitleaks.
#
# What it proves a run leaves behind: one branch (baton/<id>) with one commit per
# product node, one hidden ref (refs/baton/run/<id>) carrying the record, one
# thread. No branch per node, no issue per question, no label, no page, no release.

set -u
here=$(cd "$(dirname "$0")" && pwd)
fails=0
ok()   { echo "  PASS  $*"; }
bad()  { echo "  FAIL  $*"; fails=$((fails+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "== python selftests"
python3 "$here/lists.py" --selftest >/dev/null && ok "lists.py selftest" || bad "lists.py selftest"
python3 "$here/inbox-gh.py" --selftest >/dev/null && ok "inbox-gh.py selftest" || bad "inbox-gh.py selftest"
python3 "$here/tiers.py" --selftest >/dev/null && ok "tiers.py selftest" || bad "tiers.py selftest"

tmp=$(mktemp -d)
cat > "$tmp/gh" <<'EOF'
#!/usr/bin/env sh
# fake gh for the shell tools: private repo; a pull request opens; comments and statuses succeed
log=${FAKE_GH_LOG:-/dev/null}; echo "$*" >> "$log"
case "$1 $2" in
  "repo view") if echo "$*" | grep -q visibility; then echo PRIVATE; else echo acme/widgets; fi ;;
  "pr create") echo "https://github.com/acme/widgets/pull/7" ;;
  "api "*) case "$*" in
             *statuses*) echo '{}' ;;
             *-X*POST*comments*) echo '{"id":101,"html_url":"https://github.com/acme/widgets/pull/7#issuecomment-101"}' ;;
             *comments*|*events*) echo '[]' ;;
             *) echo '{"assignees":[]}' ;;
           esac ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$tmp/gh"
export BATON_GH="$tmp/gh" FAKE_GH_LOG="$tmp/gh.log"

echo "== github-setup.sh dry run emits valid JSON"
"$here/github-setup.sh" --repo acme/widgets | awk '/^{/{p=1} p{print} /^}/{exit}' | python3 -m json.tool >/dev/null 2>&1 \
  && ok "ruleset JSON parses" || bad "ruleset JSON parses"

echo "== end to end (temp repos, fake gh)"
git init -q "$tmp/origin.git" --bare
git init -q "$tmp/target"
cd "$tmp/target"
git config user.email t@e.st; git config user.name t
printf '_orch/\n' > .gitignore
echo hello > README.md
git add -A && git commit -q -m init
git remote add origin "$tmp/origin.git"
git push -q -u origin HEAD 2>/dev/null
default=$(git branch --show-current)
git symbolic-ref refs/remotes/origin/HEAD "refs/remotes/origin/$default"

# the router's step 2 writes files before init: init must adopt them
mkdir -p _orch/inbox _orch/brief _orch/ledger _orch/index
echo '{"run_id":"t1","mode":"BUILD","target":"widgets"}' > _orch/manifest.json
echo '# directive' > _orch/directive.md
printf 'ts,node,rung,model,effort,attempt,verdict,seconds,note\n2026-09-21T10:00:00Z,CAST,1,x,high,1,DONE,3,\n' > _orch/ledger/2026-09-21T100000Z-CAST-1.csv
echo '# baton run index' > _orch/index/summary.md
echo '## Decision 1' > _orch/brief/P1.md
"$here/publish-run.sh" init t1 >/dev/null 2>"$tmp/err" && ok "init adopts an existing _orch/" || { bad "init adopts an existing _orch/"; cat "$tmp/err"; }
check "init made _orch/ a worktree of the LOCAL branch baton/run/t1" "[ -f _orch/.git ] && git -C _orch branch --show-current | grep -q '^baton/run/t1$'"
check "init preserved the run's files" "[ -f _orch/manifest.json ] && [ -f _orch/ledger/2026-09-21T100000Z-CAST-1.csv ]"
check "init created the run branch baton/t1 on origin, one empty commit ahead of $default" "git -C $tmp/origin.git rev-parse --verify --quiet refs/heads/baton/t1 >/dev/null && [ \$(git rev-list --count origin/$default..baton/t1) -eq 1 ]"
check "the run branch's commit carries the Baton-Run trailer" "git log -1 --format=%B baton/t1 | grep -q 'Baton-Run: t1'"
check "no local branch is named after the hidden ref's remote name" "! git -C $tmp/origin.git rev-parse --verify --quiet refs/heads/baton/run/t1 >/dev/null"

"$here/publish-run.sh" publish --unscanned >"$tmp/pub.out" 2>&1 && ok "publish commits and pushes the hidden ref" || { bad "publish"; cat "$tmp/pub.out"; }
check "origin holds refs/baton/run/t1 and lists NO branch for it" "git -C $tmp/origin.git rev-parse --verify --quiet refs/baton/run/t1 >/dev/null && ! git -C $tmp/origin.git branch | grep -q 'baton/run/t1'"
check "the hidden ref's tree carries the ledger row and ignores index/" "git -C $tmp/origin.git ls-tree -r --name-only refs/baton/run/t1 | grep -q 'ledger/2026-09-21T100000Z-CAST-1.csv' && ! git -C $tmp/origin.git ls-tree -r --name-only refs/baton/run/t1 | grep -q '^index/'"
check "publish derived ledger.csv (§6.3) and printed a permalink base" "[ -f _orch/ledger.csv ] && grep -q '/blob/' $tmp/pub.out"
"$here/publish-run.sh" publish --unscanned >"$tmp/pub2.out" 2>&1
check "a second publish with no change is a no-op" "grep -q 'nothing new' $tmp/pub2.out"
check "status reports the record and the thread branch" "'$here/publish-run.sh' status | grep -q 'refs/baton/run/t1' && '$here/publish-run.sh' status | grep -q 'baton/t1'"

python3 "$here/inbox-gh.py" open-run --repo acme/widgets >"$tmp/open.out" 2>&1 && ok "open-run opens the draft pull request (fake gh)" || { bad "open-run"; cat "$tmp/open.out"; }
check "github.json records the thread as pull request #7" "grep -q '\"kind\": \"pr\"' _orch/inbox/github.json && grep -q '\"number\": 7' _orch/inbox/github.json"
echo '# Which retry policy?' > _orch/inbox/Q-01.md
python3 "$here/inbox-gh.py" sync --repo acme/widgets >"$tmp/sync.out" 2>&1 && ok "sync posts the question as a comment on the thread" || { bad "sync"; cat "$tmp/sync.out"; }
check "the question is a comment, not an issue" "grep -q 'issues/7/comments' $tmp/gh.log && ! grep -q 'issue create' $tmp/gh.log && ! grep -q 'label create' $tmp/gh.log"
python3 "$here/inbox-gh.py" post-gate --gate P1 --repo acme/widgets >"$tmp/gate.out" 2>&1 && ok "post-gate posts the summary and the gate's deck as one comment" || { bad "post-gate"; cat "$tmp/gate.out"; }
check "the gate comment named the deck's markdown twin" "grep -q 'P1.md' $tmp/gate.out"

# a product-writing node: one commit on the run branch
"$here/node-pr.sh" branch P1 >/dev/null 2>"$tmp/err" && ok "node-pr branch creates the node's worktree from the run branch" || { bad "node-pr branch"; cat "$tmp/err"; }
echo "changed" >> _orch/wt/P1/README.md
mkdir -p _orch/nodes/P1 && echo '# Pin the retry semantics' > _orch/nodes/P1/handoff.md
"$here/node-pr.sh" land P1 >"$tmp/land.out" 2>&1 && ok "node-pr land commits once onto the run branch and pushes" || { bad "node-pr land"; cat "$tmp/land.out"; }
check "origin's baton/t1 gained exactly one commit, with the node's title and trailer" "[ \$(git -C $tmp/origin.git rev-list --count $default..refs/heads/baton/t1) -eq 2 ] && git -C $tmp/origin.git log -1 --format=%B refs/heads/baton/t1 | grep -q 'Baton-Node: P1' && git -C $tmp/origin.git log -1 --format=%s refs/heads/baton/t1 | grep -q 'Pin the retry semantics'"
check "landed.json records the run branch and the commit" "grep -q '\"branch\": \"baton/t1\"' _orch/nodes/P1/landed.json && grep -q '\"sha\"' _orch/nodes/P1/landed.json"
check "the landing is a checkout with the node's change" "grep -q changed _orch/nodes/P1/work/tree/README.md"
check "no branch per node exists anywhere" "! git -C $tmp/origin.git branch | grep -q 'P1' && ! git branch | grep -q 'baton-wt'"
check "wt/ was retired" "[ ! -d _orch/wt/P1 ]"
"$here/node-pr.sh" status P1 REFUTED --url https://example/verdict >"$tmp/st.out" 2>&1 && ok "node-pr status posts baton/verify on the landed commit" || { bad "node-pr status"; cat "$tmp/st.out"; }
check "status maps REFUTED to failure" "grep -q 'failure' $tmp/st.out"
# a second node lands after the first: still one branch, still one commit each
"$here/node-pr.sh" branch P2 >/dev/null 2>&1 && echo "again" >> _orch/wt/P2/README.md && "$here/node-pr.sh" land P2 >/dev/null 2>&1
check "a second node lands as the next commit on the same branch" "[ \$(git -C $tmp/origin.git rev-list --count $default..refs/heads/baton/t1) -eq 3 ]"
"$here/publish-run.sh" publish --unscanned >/dev/null 2>&1
check "the record ignores work/tree (a checkout) and carries landed.json" "! git -C $tmp/origin.git ls-tree -r --name-only refs/baton/run/t1 | grep -q 'work/tree/' && git -C $tmp/origin.git ls-tree -r --name-only refs/baton/run/t1 | grep -q 'nodes/P1/landed.json'"

"$here/publish-run.sh" dispose t1 >"$tmp/disp.out" 2>&1 && ok "dispose removes the hidden ref and the worktree" || { bad "dispose"; cat "$tmp/disp.out"; }
check "dispose deleted refs/baton/run/t1 on origin" "! git -C $tmp/origin.git rev-parse --verify --quiet refs/baton/run/t1 >/dev/null"
check "dispose kept the run branch (the pull request's record)" "git -C $tmp/origin.git rev-parse --verify --quiet refs/heads/baton/t1 >/dev/null"
check "dispose removed the worktree" "[ ! -d _orch ]"
check "GitHub footprint: 1 branch, 1 thread, 0 issues, 0 labels, 0 pages, 0 releases" "[ \$(git -C $tmp/origin.git branch | grep -c baton) -eq 1 ] && ! grep -q 'issue create\|label create\|release create\|pages' $tmp/gh.log"

cd / && rm -rf "$tmp"
echo
if [ $fails -eq 0 ]; then echo "team tools: all checks passed."; exit 0; fi
echo "team tools: $fails check(s) FAILED."; exit 1
