#!/usr/bin/env sh
# node-pr.sh — a product-writing node as a branch, a draft PR, and a check (CONTRACT §4, §6.2).
#
#   tools/node-pr.sh branch <node> [--base <ref>]   worktree at _orch/wt/<node> on baton/node/<run-id>/<node>
#   tools/node-pr.sh land   <node>                  commit + push the node's tree, check it out under
#                                                   _orch/nodes/<node>/work/tree, write landed.json, retire wt/
#   tools/node-pr.sh pr     <node> [--title <t>]    push and open a draft pull request (once)
#   tools/node-pr.sh status <node> <CONFIRMED|REFUTED|PARTIAL> [--url <permalink>]
#                                                   the computed verdict as commit status baton/verify
#
# The branch is the landing: nothing can die with the worktree because the branch
# holds the tree. The checkout under work/tree keeps every `outputs` path local
# (§6.1). The merge node the plan names is the pull request's merge — this script
# never merges anything.

set -eu
gh=${BATON_GH:-gh}
cmd=${1:-}; [ $# -gt 0 ] && shift
die() { echo "node-pr: $*" >&2; exit 1; }
root=$(git rev-parse --show-toplevel 2>/dev/null) || die "run me inside the target repository"
orch="$root/_orch"
[ -f "$orch/run-ref.json" ] || die "_orch/run-ref.json missing — TEAM runs start with publish-run.sh init"
rj() { sed -n "s/^[[:space:]]*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$orch/run-ref.json" | head -1; }
run_ref=$(rj ref); run_id=$(rj run_id); remote=$(rj remote); repo=$(rj repo); host=$(rj host)
node=${1:-}; [ -n "$node" ] || { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }; shift
branch="baton/node/$run_id/$node"   # beside the run ref, never under it: a ref cannot nest under another ref
wt="$orch/wt/$node"
landing="$orch/nodes/$node/work/tree"

case "$cmd" in
branch)
  base=HEAD
  [ "${1:-}" = "--base" ] && base=$2
  [ -d "$wt" ] && die "$wt already exists"
  mkdir -p "$orch/wt"
  git -C "$root" worktree add -q "$wt" -b "$branch" "$base"
  echo "branch: $branch at $wt (from $(git -C "$root" rev-parse --short "$base"))"
  ;;

land)
  [ -d "$wt" ] || die "no worktree at $wt — was branch run?"
  git -C "$wt" add -A
  git -C "$wt" diff --cached --quiet || git -C "$wt" commit -q -m "baton $node: work as landed"
  sha=$(git -C "$wt" rev-parse HEAD)
  git -C "$wt" push -q -u "$remote" "$branch" 2>/dev/null || git -C "$wt" push -u "$remote" "$branch"
  mkdir -p "$(dirname "$landing")"
  [ -d "$landing" ] && git -C "$root" worktree remove --force "$landing" 2>/dev/null || true
  git -C "$root" worktree add -q --detach "$landing" "$sha"
  printf '{\n  "node": "%s",\n  "branch": "%s",\n  "sha": "%s",\n  "tree": "%s",\n  "permalink": "https://%s/%s/tree/%s"\n}\n' \
    "$node" "$branch" "$sha" "_orch/nodes/$node/work/tree" "$host" "$repo" "$sha" > "$orch/nodes/$node/landed.json"
  git -C "$root" worktree remove --force "$wt"
  echo "land: $branch @ $sha — checked out at _orch/nodes/$node/work/tree, wt/ retired"
  ;;

pr)
  title="baton $node"
  [ "${1:-}" = "--title" ] && title=$2
  if [ -f "$orch/nodes/$node/pr.json" ]; then echo "pr: already open: $(sed -n 's/.*"url": *"\([^"]*\)".*/\1/p' "$orch/nodes/$node/pr.json")"; exit 0; fi
  git -C "$root" rev-parse --verify --quiet "$branch" >/dev/null || die "no branch $branch"
  git -C "$root" push -q -u "$remote" "$branch" 2>/dev/null || true
  base=$(git -C "$root" symbolic-ref --short refs/remotes/$remote/HEAD 2>/dev/null | sed "s#^$remote/##") || base=main
  [ -n "$base" ] || base=main
  handoff="$orch/nodes/$node/handoff.md"
  body="Opened by baton for node \`$node\` of run \`$run_id\` (ref \`$run_ref\`).

The node's verdict lands on this branch as the commit status \`baton/verify\`; its link opens the per-criterion rows that decided it. Merge only through the merge node the plan names.

$( [ -f "$handoff" ] && sed -n '1,40p' "$handoff" )"
  url=$(printf '%s' "$body" | "$gh" pr create --repo "$repo" --draft --head "$branch" --base "$base" --title "$title" --body-file -)
  printf '{\n  "node": "%s",\n  "branch": "%s",\n  "url": "%s"\n}\n' "$node" "$branch" "$url" > "$orch/nodes/$node/pr.json"
  echo "pr: $url"
  ;;

status)
  verdict=${1:-}; [ -n "$verdict" ] || die "status <node> <CONFIRMED|REFUTED|PARTIAL>"; shift
  url=""
  [ "${1:-}" = "--url" ] && url=$2
  case "$verdict" in
    CONFIRMED) state=success ;;
    REFUTED) state=failure ;;
    PARTIAL) state=pending ;;
    *) die "verdict must be CONFIRMED, REFUTED or PARTIAL (§9.1)" ;;
  esac
  sha=$(sed -n 's/.*"sha": *"\([^"]*\)".*/\1/p' "$orch/nodes/$node/landed.json" 2>/dev/null | head -1)
  [ -n "$sha" ] || sha=$(git -C "$root" rev-parse --verify --quiet "$branch") || die "no landed sha and no branch for $node"
  [ -n "$url" ] || url="https://$host/$repo/blob/$(git -C "$orch" rev-parse HEAD)/verify/$node-verdict.json"
  "$gh" api -X POST "repos/$repo/statuses/$sha" -f state="$state" -f context=baton/verify \
    -f description="$verdict (§9.1, computed per criterion)" -f target_url="$url" >/dev/null
  echo "status: $branch @ $(echo "$sha" | cut -c1-7) baton/verify = $state ($verdict) -> $url"
  ;;

*)
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
  ;;
esac
