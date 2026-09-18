#!/usr/bin/env sh
# test-team.sh — every TEAM-mode tool, proven without touching GitHub.
#
#   tools/test-team.sh
#
# Runs the Python selftests (lists.py, inbox-gh.py), then an end-to-end run of
# publish-run.sh and node-pr.sh against a throwaway target repository with a
# throwaway bare origin and a fake `gh` (BATON_GH). Exit 1 on any failure.
# Nothing here needs a network, a token, or gitleaks.

set -u
here=$(cd "$(dirname "$0")" && pwd)
fails=0
ok()   { echo "  PASS  $*"; }
bad()  { echo "  FAIL  $*"; fails=$((fails+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "== lists.py --selftest"
python3 "$here/lists.py" --selftest | tail -1 | grep -q "^[0-9]*/[0-9]* passed" \
  && python3 "$here/lists.py" --selftest >/dev/null && ok "lists.py selftest" || bad "lists.py selftest"

echo "== inbox-gh.py --selftest"
python3 "$here/inbox-gh.py" --selftest >/dev/null && ok "inbox-gh.py selftest" || bad "inbox-gh.py selftest"

echo "== github-setup.sh dry run emits valid JSON"
tmp=$(mktemp -d)
cat > "$tmp/gh" <<'EOF'
#!/usr/bin/env sh
# fake gh for the shell tools: private repo, releases and PRs succeed
case "$1 $2" in
  "repo view") if echo "$*" | grep -q visibility; then echo PRIVATE; else echo acme/widgets; fi ;;
  "release create") exit 0 ;;
  "pr create") echo "https://github.com/acme/widgets/pull/7" ;;
  "api "*) if echo "$*" | grep -q statuses; then echo '{}'; else echo '[]'; fi ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$tmp/gh"
export BATON_GH="$tmp/gh"
"$here/github-setup.sh" --repo acme/widgets | awk '/^{/{p=1} p{print} /^}/{exit}' | python3 -m json.tool >/dev/null 2>&1 \
  && ok "ruleset JSON parses" || bad "ruleset JSON parses"

echo "== publish-run.sh + node-pr.sh end to end (temp repos, fake gh)"
git init -q "$tmp/origin.git" --bare
git init -q "$tmp/target"
cd "$tmp/target"
git config user.email t@e.st; git config user.name t
printf '_orch/\n' > .gitignore
echo hello > README.md
git add -A && git commit -q -m init
git remote add origin "$tmp/origin.git"
git push -q -u origin HEAD 2>/dev/null
git symbolic-ref refs/remotes/origin/HEAD "refs/remotes/origin/$(git branch --show-current)"

# the router's step 2 writes files before init: init must adopt them
mkdir -p _orch/inbox _orch/brief _orch/ledger
echo '{"run_id":"t1"}' > _orch/manifest.json
printf 'ts,node,rung,model,effort,attempt,verdict,seconds,note\n2026-09-18T10:00:00Z,CAST,1,sonnet,low,1,DONE,3,\n' > _orch/ledger/2026-09-18T100000Z-CAST-1.csv
echo '<h1>brief</h1>' > _orch/brief/blocked-1.html
"$here/publish-run.sh" init t1 >/dev/null 2>"$tmp/err" && ok "init adopts an existing _orch/" || { bad "init adopts an existing _orch/"; cat "$tmp/err"; }
check "init made _orch/ a worktree of baton/run/t1" "[ -f _orch/.git ] && git -C _orch branch --show-current | grep -q '^baton/run/t1$'"
check "init preserved the run's files" "[ -f _orch/manifest.json ] && [ -f _orch/ledger/2026-09-18T100000Z-CAST-1.csv ]"

"$here/publish-run.sh" publish --unscanned >"$tmp/pub.out" 2>&1 && ok "publish commits and pushes" || { bad "publish commits and pushes"; cat "$tmp/pub.out"; }
check "publish derived ledger.csv from ledger/ (§6.3)" "[ -f _orch/ledger.csv ] && grep -q CAST _orch/ledger.csv"
check "the run ref exists on origin" "git -C $tmp/origin.git branch | grep -q 'baton/run/t1'"
check "the pushed tree carries the ledger row and ignores index/" "git -C $tmp/origin.git ls-tree -r --name-only baton/run/t1 | grep -q 'ledger/2026-09-18T100000Z-CAST-1.csv' && ! git -C $tmp/origin.git ls-tree -r --name-only baton/run/t1 | grep -q '^index/'"
check "publish printed a permalink base" "grep -q '/blob/' $tmp/pub.out"
"$here/publish-run.sh" publish --unscanned >"$tmp/pub2.out" 2>&1
check "a second publish with no change is a no-op" "grep -q 'nothing new' $tmp/pub2.out"
check "status reports the ref" "'$here/publish-run.sh' status | grep -q 'baton/run/t1'"

"$here/publish-run.sh" pages >"$tmp/pages.out" 2>&1 && ok "pages publishes the briefs" || { bad "pages publishes the briefs"; cat "$tmp/pages.out"; }
check "gh-pages holds runs/t1/blocked-1.html" "git -C $tmp/origin.git ls-tree -r --name-only gh-pages | grep -q 'runs/t1/blocked-1.html'"

# a product-writing node: branch, work, land, pr, status
"$here/node-pr.sh" branch P1 >/dev/null 2>"$tmp/err" && ok "node-pr branch creates the node's worktree" || { bad "node-pr branch"; cat "$tmp/err"; }
echo "changed" >> _orch/wt/P1/README.md
mkdir -p _orch/nodes/P1 && echo '# P1 handoff' > _orch/nodes/P1/handoff.md
"$here/node-pr.sh" land P1 >"$tmp/land.out" 2>&1 && ok "node-pr land commits, pushes, checks out under work/tree" || { bad "node-pr land"; cat "$tmp/land.out"; }
check "landed.json records branch and sha" "grep -q 'baton/node/t1/P1' _orch/nodes/P1/landed.json && grep -q '\"sha\"' _orch/nodes/P1/landed.json"
check "the landing is a checkout with the node's change" "grep -q changed _orch/nodes/P1/work/tree/README.md"
check "the node branch is on origin" "git -C $tmp/origin.git branch | grep -q 'baton/node/t1/P1'"
check "wt/ was retired" "[ ! -d _orch/wt/P1 ]"
"$here/node-pr.sh" pr P1 >"$tmp/pr.out" 2>&1 && ok "node-pr pr opens a draft PR (fake gh)" || { bad "node-pr pr"; cat "$tmp/pr.out"; }
check "pr.json records the URL" "grep -q 'pull/7' _orch/nodes/P1/pr.json"
"$here/node-pr.sh" status P1 REFUTED --url https://example/verdict >"$tmp/st.out" 2>&1 && ok "node-pr status posts baton/verify" || { bad "node-pr status"; cat "$tmp/st.out"; }
check "status maps REFUTED to failure" "grep -q 'failure' $tmp/st.out"
"$here/publish-run.sh" publish --unscanned >/dev/null 2>&1
check "publish ignores work/tree (a checkout, not evidence) and records landed.json" "! git -C $tmp/origin.git ls-tree -r --name-only baton/run/t1 | grep -q 'work/tree/' && git -C $tmp/origin.git ls-tree -r --name-only baton/run/t1 | grep -q 'nodes/P1/landed.json'"

"$here/publish-run.sh" dispose t1 >"$tmp/disp.out" 2>&1 && ok "dispose archives and removes the ref" || { bad "dispose"; cat "$tmp/disp.out"; }
check "dispose wrote the tarball" "ls $tmp/target/baton-run-t1.tar.gz >/dev/null 2>&1"
check "dispose deleted the ref on origin" "! git -C $tmp/origin.git branch | grep -q 'baton/run/t1$'"
check "dispose removed the worktree" "[ ! -d _orch ]"

cd / && rm -rf "$tmp"
echo
if [ $fails -eq 0 ]; then echo "team tools: all checks passed."; exit 0; fi
echo "team tools: $fails check(s) FAILED."; exit 1
