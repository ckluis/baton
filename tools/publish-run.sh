#!/usr/bin/env sh
# publish-run.sh — the run's state on a git ref (CONTRACT §6.1), under TEAM.
#
#   tools/publish-run.sh init <run-id> [--remote <name|url>] [--allow-public]
#       make _orch/ a worktree of baton/run/<run-id>; adopts an _orch/ that
#       already exists. Refuses a PUBLIC target unless --remote names a private
#       repository (RUNS_REPO) or --allow-public is passed.
#   tools/publish-run.sh publish [--node <id>] [--message <text>] [--unscanned]
#       secret scan, derive the lists, commit everything received, push.
#       Prints the sha and the permalink base every citation gains.
#   tools/publish-run.sh pages
#       copy _orch/brief/*.html to gh-pages:runs/<run-id>/ and push.
#   tools/publish-run.sh dispose <run-id> [--keep-ref]
#       archive to a release, delete the ref, remove the worktree.
#   tools/publish-run.sh status
#
# The runner's disk stays the working copy; the ref is the record once pushed.
# Nothing here reads the ref back into a run — only a resume does, with a fetch.
# `index/`, `wt/` and `**/work/tree/` are ignored inside the ref: derived, or a
# checkout of something the ref already records.
#
# Needs git >= 2.42 (`worktree add --orphan`) and, for the visibility check and
# releases, `gh`. Set BATON_GH to substitute a `gh` (the tests do).

set -eu
here=$(cd "$(dirname "$0")" && pwd)
gh=${BATON_GH:-gh}
cmd=${1:-}; [ $# -gt 0 ] && shift

die() { echo "publish-run: $*" >&2; exit 1; }
root=$(git rev-parse --show-toplevel 2>/dev/null) || die "run me inside the target repository"
orch="$root/_orch"

remote_of() { # remote name -> owner/repo, from its URL
  url=$(git -C "$root" remote get-url "$1" 2>/dev/null) || return 1
  echo "$url" | sed -E 's#^(git@|https?://)([^/:]+)[:/]##; s#\.git$##'
}
host_of() {
  url=$(git -C "$root" remote get-url "$1" 2>/dev/null) || return 1
  echo "$url" | sed -E 's#^(git@|https?://)([^/:]+)[:/].*#\2#'
}
run_ref_json() { # key -> value from _orch/run-ref.json (tiny, no jq)
  sed -n "s/^[[:space:]]*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$orch/run-ref.json" | head -1
}
need_ref() { [ -f "$orch/run-ref.json" ] || die "_orch/run-ref.json missing — run init first"; }

case "$cmd" in
init)
  run_id=${1:-}; [ -n "$run_id" ] || die "init <run-id>"; shift
  remote=origin; allow_public=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --remote) remote=$2; shift 2 ;;
      --allow-public) allow_public=1; shift ;;
      *) die "init: unknown option $1" ;;
    esac
  done
  ref="baton/run/$run_id"   # node branches live beside it as baton/node/<run-id>/<node> — a ref cannot nest under another ref
  git worktree add --help 2>/dev/null | grep -q -- '--orphan' || die "git >= 2.42 is needed for worktree add --orphan (have $(git --version))"
  if [ -f "$orch/.git" ]; then die "_orch/ is already a worktree ($(run_ref_json ref 2>/dev/null || echo '?')); nothing to do"; fi
  # a URL remote is the RUNS_REPO case: register it under a stable name
  case "$remote" in
    *://*|git@*) git -C "$root" remote get-url baton-runs >/dev/null 2>&1 || git -C "$root" remote add baton-runs "$remote"; remote=baton-runs ;;
  esac
  repo=$(remote_of "$remote") || die "remote '$remote' does not exist"
  if [ -z "$allow_public" ] && [ "$remote" = origin ] && command -v "$gh" >/dev/null 2>&1; then
    vis=$("$gh" repo view "$repo" --json visibility -q .visibility 2>/dev/null || echo UNKNOWN)
    case "$vis" in
      PUBLIC|public) die "$repo is PUBLIC. A run's questions and evidence must not be public by default: pass --remote <private owner/name url> (RUNS_REPO), or --allow-public if you mean it." ;;
    esac
  fi
  git -C "$root" show-ref --verify --quiet "refs/heads/$ref" && die "branch $ref already exists; resume it with: git worktree add _orch $ref"
  if [ -d "$orch" ]; then
    # adopt: the run started before init (the router's step 2 wrote files first)
    git -C "$root" worktree add --orphan -b "$ref" "$root/.baton-adopt" >/dev/null
    cp -R "$orch/." "$root/.baton-adopt/"
    rm -rf "$orch"
    git -C "$root" worktree move "$root/.baton-adopt" "$orch"
  else
    git -C "$root" worktree add --orphan -b "$ref" "$orch" >/dev/null
  fi
  printf 'index/\nwt/\n**/work/tree/\n' > "$orch/.gitignore"
  printf '{\n  "run_id": "%s",\n  "ref": "%s",\n  "remote": "%s",\n  "repo": "%s",\n  "host": "%s"\n}\n' \
    "$run_id" "$ref" "$remote" "$repo" "$(host_of "$remote")" > "$orch/run-ref.json"
  echo "init: _orch/ is a worktree of $ref (remote $remote -> $repo)"
  echo "      publish with: tools/publish-run.sh publish"
  ;;

publish)
  need_ref
  node=""; msg=""; unscanned=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --node) node=$2; shift 2 ;;
      --message) msg=$2; shift 2 ;;
      --unscanned) unscanned=1; shift ;;
      *) die "publish: unknown option $1" ;;
    esac
  done
  ref=$(run_ref_json ref); remote=$(run_ref_json remote); repo=$(run_ref_json repo); host=$(run_ref_json host)
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks detect --no-git --source "$orch" --redact --exit-code 1 >/dev/null 2>&1 \
      || die "gitleaks found a secret under _orch/ — the push carries work/ logs; fix it, do not pass --unscanned"
  elif [ -z "$unscanned" ]; then
    die "gitleaks is not installed and the push would carry work/ logs. Install it (brew install gitleaks) or pass --unscanned if this corpus holds no secrets."
  fi
  python3 "$here/lists.py" derive --state-root "$orch" >/dev/null 2>&1 || true
  git -C "$orch" add -A
  if git -C "$orch" diff --cached --quiet; then
    echo "publish: nothing new since $(git -C "$orch" rev-parse --short HEAD 2>/dev/null || echo 'the start')"
  else
    [ -n "$msg" ] || msg=$( [ -n "$node" ] && echo "node $node received" || echo "gate" )
    git -C "$orch" commit -q -m "$msg"
  fi
  git -C "$orch" push -q -u "$remote" "$ref" 2>/dev/null || git -C "$orch" push -u "$remote" "$ref"
  sha=$(git -C "$orch" rev-parse HEAD)
  echo "publish: $ref @ $sha"
  echo "         https://$host/$repo/blob/$sha/"
  ;;

pages)
  need_ref
  run_id=$(run_ref_json run_id); remote=$(run_ref_json remote); repo=$(run_ref_json repo); host=$(run_ref_json host)
  ls "$orch"/brief/*.html >/dev/null 2>&1 || die "no _orch/brief/*.html to publish"
  pages="$root/.baton-pages"
  if [ ! -d "$pages" ]; then
    if git -C "$root" fetch -q "$remote" gh-pages 2>/dev/null; then
      git -C "$root" worktree add -q "$pages" -B gh-pages "$remote/gh-pages" >/dev/null
    else
      git -C "$root" worktree add --orphan -b gh-pages "$pages" >/dev/null
      printf '<!doctype html><meta charset="utf-8"><title>baton runs</title><h1>baton runs</h1><ul id="runs"></ul>\n' > "$pages/index.html"
    fi
  fi
  mkdir -p "$pages/runs/$run_id"
  cp "$orch"/brief/*.html "$pages/runs/$run_id/"
  # one line per run in the site index, idempotent
  grep -q "runs/$run_id/" "$pages/index.html" 2>/dev/null || \
    sed -i.bak "s#<ul id=\"runs\">#<ul id=\"runs\"><li><a href=\"runs/$run_id/\">$run_id</a></li>#" "$pages/index.html" && rm -f "$pages/index.html.bak"
  git -C "$pages" add -A
  git -C "$pages" diff --cached --quiet || git -C "$pages" commit -q -m "baton run $run_id: briefs"
  git -C "$pages" push -q -u "$remote" gh-pages 2>/dev/null || git -C "$pages" push -u "$remote" gh-pages
  owner=${repo%%/*}; name=${repo#*/}
  echo "pages: https://$owner.github.io/$name/runs/$run_id/"
  ;;

dispose)
  run_id=${1:-}; [ -n "$run_id" ] || die "dispose <run-id>"; shift
  keep=""
  [ "${1:-}" = "--keep-ref" ] && keep=1
  need_ref
  ref=$(run_ref_json ref); remote=$(run_ref_json remote); repo=$(run_ref_json repo)
  [ "$ref" = "baton/run/$run_id" ] || die "_orch/ holds $ref, not baton/run/$run_id"
  git -C "$orch" diff --quiet && git -C "$orch" diff --cached --quiet || die "unpublished changes in _orch/ — publish first"
  sha=$(git -C "$orch" rev-parse HEAD)
  # landings (§6.2) are nested worktrees under _orch/; retire them before the parent
  git -C "$root" worktree list --porcelain | sed -n 's/^worktree //p' | while read -r wtp; do
    case "$wtp" in "$orch"/*) git -C "$root" worktree remove --force "$wtp" 2>/dev/null || true ;; esac
  done
  tarball="$root/baton-run-$run_id.tar.gz"
  tar czf "$tarball" -C "$root" --exclude='_orch/index' --exclude='_orch/wt' --exclude='_orch/.git' _orch
  if command -v "$gh" >/dev/null 2>&1; then
    "$gh" release create "run-$run_id" "$tarball" --repo "$repo" --target "$sha" \
      --title "baton run $run_id" --notes "Archived _orch/ of $ref at $sha. Every permalink under /blob/$sha/ keeps resolving because this release pins the sha." >/dev/null \
      && echo "dispose: release run-$run_id holds $(basename "$tarball")" \
      || echo "dispose: release creation failed; the tarball is at $tarball"
  else
    echo "dispose: gh not found; the tarball is at $tarball (no release created)"
  fi
  if [ -z "$keep" ]; then
    git -C "$root" worktree remove --force "$orch"
    git -C "$root" push -q "$remote" ":refs/heads/$ref" 2>/dev/null || echo "dispose: could not delete $ref on $remote (a ruleset may restrict deletions — that is the point; delete it by hand if you must)"
    git -C "$root" branch -D "$ref" >/dev/null 2>&1 || true
    echo "dispose: $ref removed; the release is the surviving copy"
  else
    echo "dispose: kept $ref (--keep-ref)"
  fi
  ;;

status)
  need_ref
  ref=$(run_ref_json ref); remote=$(run_ref_json remote)
  echo "ref:     $ref"
  echo "remote:  $remote ($(run_ref_json repo))"
  echo "head:    $(git -C "$orch" rev-parse --short HEAD 2>/dev/null || echo none)"
  echo "dirty:   $(git -C "$orch" status --porcelain | wc -l | tr -d ' ') path(s) not yet committed"
  if git -C "$orch" rev-parse --verify --quiet "$remote/$ref" >/dev/null 2>&1; then
    echo "ahead:   $(git -C "$orch" rev-list --count "$remote/$ref..HEAD") commit(s) not yet pushed"
  else
    echo "ahead:   never pushed"
  fi
  ;;

*)
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
  ;;
esac
