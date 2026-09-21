#!/usr/bin/env sh
# node-pr.sh — a product-writing node lands as ONE commit on the run's branch (CONTRACT §4, §6.2).
#
#   tools/node-pr.sh branch <node>                  worktree at _orch/wt/<node> from the run branch's head
#   tools/node-pr.sh land   <node>                  commit the node's changes as one commit on the run
#                                                   branch (trailers Baton-Node, Baton-Run), push, check
#                                                   that commit out under _orch/nodes/<node>/work/tree,
#                                                   write landed.json, retire wt/
#   tools/node-pr.sh status <node> <CONFIRMED|REFUTED|PARTIAL> [--url <permalink>]
#                                                   the computed verdict as commit status baton/verify
#                                                   on the landed commit — the pull request's checks
#
# The run branch is the pull request; the commit is the landing. A reviewer reads one pull
# request with one commit per node, each carrying its node id and, once verified, its
# verdict as a check. No branch or pull request per node. This script never merges.

set -eu
gh=${BATON_GH:-gh}
cmd=${1:-}; [ $# -gt 0 ] && shift
die() { echo "node-pr: $*" >&2; exit 1; }
root=$(git rev-parse --show-toplevel 2>/dev/null) || die "run me inside the target repository"
orch="$root/_orch"
[ -f "$orch/run-ref.json" ] || die "_orch/run-ref.json missing — TEAM runs start with publish-run.sh init"
rj() { sed -n "s/^[[:space:]]*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$orch/run-ref.json" | head -1; }
run_id=$(rj run_id); run_branch=$(rj run_branch); remote=$(rj remote); repo=$(rj repo); host=$(rj host)
node=${1:-}; [ -n "$node" ] || { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }; shift
wt="$orch/wt/$node"
wt_branch="baton-wt/$run_id/$node"      # local only, never pushed; deleted at land
landing="$orch/nodes/$node/work/tree"

case "$cmd" in
branch)
  [ -d "$wt" ] && die "$wt already exists"
  mkdir -p "$orch/wt"
  git -C "$root" worktree add -q "$wt" -b "$wt_branch" "$run_branch"
  echo "branch: $wt on $wt_branch from $run_branch @ $(git -C "$root" rev-parse --short "$run_branch")"
  ;;

land)
  [ -d "$wt" ] || die "no worktree at $wt — was branch run?"
  title=$(sed -n 's/^# \{0,1\}\(.*\)$/\1/p' "$orch/nodes/$node/handoff.md" 2>/dev/null | head -1)
  [ -n "$title" ] || title="work as landed"
  git -C "$wt" add -A
  if git -C "$wt" diff --cached --quiet; then
    echo "land: $node changed nothing in the product tree"
    sha=$(git -C "$root" rev-parse "$run_branch")
  else
    git -C "$wt" commit -q -m "baton $node: $title" -m "Baton-Node: $node" -m "Baton-Run: $run_id"
    # one commit on the run branch: rebase onto its head (another node may have landed since), then fast-forward it
    git -C "$wt" rebase -q "$run_branch" 2>/dev/null || die "rebase onto $run_branch conflicted — resolve in $wt, then run land again"
    sha=$(git -C "$wt" rev-parse HEAD)
    git -C "$root" branch -f "$run_branch" "$sha"
    git -C "$root" push -q "$remote" "$run_branch" 2>/dev/null || git -C "$root" push "$remote" "$run_branch"
  fi
  mkdir -p "$(dirname "$landing")"
  [ -d "$landing" ] && git -C "$root" worktree remove --force "$landing" 2>/dev/null || true
  git -C "$root" worktree add -q --detach "$landing" "$sha"
  printf '{\n  "node": "%s",\n  "branch": "%s",\n  "sha": "%s",\n  "tree": "%s",\n  "permalink": "https://%s/%s/commit/%s"\n}\n' \
    "$node" "$run_branch" "$sha" "_orch/nodes/$node/work/tree" "$host" "$repo" "$sha" > "$orch/nodes/$node/landed.json"
  git -C "$root" worktree remove --force "$wt"
  git -C "$root" branch -D "$wt_branch" >/dev/null 2>&1 || true
  echo "land: $node → $run_branch @ $(echo "$sha" | cut -c1-7); checked out at _orch/nodes/$node/work/tree; wt/ retired"
  ;;

status)
  verdict=${1:-}; [ -n "$verdict" ] || die "status <node> <CONFIRMED|REFUTED|PARTIAL>"; shift
  url=""
  [ "${1:-}" = "--url" ] && url=$2
  case "$verdict" in
    CONFIRMED) state=success ;; REFUTED) state=failure ;; PARTIAL) state=pending ;;
    *) die "verdict must be CONFIRMED, REFUTED or PARTIAL (§9.1)" ;;
  esac
  sha=$(sed -n 's/.*"sha": *"\([^"]*\)".*/\1/p' "$orch/nodes/$node/landed.json" 2>/dev/null | head -1)
  [ -n "$sha" ] || die "no landed.json for $node — run land first"
  [ -n "$url" ] || url="https://$host/$repo/blob/$(git -C "$orch" rev-parse HEAD)/verify/$node-verdict.json"
  "$gh" api -X POST "repos/$repo/statuses/$sha" -f state="$state" -f context=baton/verify \
    -f description="$node: $verdict (§9.1, computed per criterion)" -f target_url="$url" >/dev/null
  echo "status: $run_branch @ $(echo "$sha" | cut -c1-7) baton/verify = $state ($verdict) -> $url"
  ;;

*)
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
  ;;
esac
