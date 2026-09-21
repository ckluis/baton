#!/usr/bin/env sh
# publish-run.sh — the run's record on a hidden ref; the run's product on one branch (CONTRACT §6.1).
#
#   tools/publish-run.sh init <run-id> [--remote <name|url>] [--base <branch>] [--allow-public]
#       _orch/ becomes a worktree of a LOCAL orphan branch, baton/run/<run-id>, that is never
#       pushed as a branch: `publish` pushes it to refs/baton/run/<run-id> — a ref GitHub lists
#       nowhere, fetchable and permalinkable by anyone with the repo. Adopts an _orch/ that
#       already exists. Also creates the run branch, baton/<run-id>, from the base with one
#       empty commit and pushes it: that is the pull request's branch, and one commit per
#       product node lands on it (node-pr.sh). Refuses a PUBLIC target unless --remote names
#       a private repository (RUNS_REPO) or --allow-public is passed.
#   tools/publish-run.sh publish [--node <id>] [--message <text>] [--unscanned]
#       secret scan, derive the lists, commit everything received, push the hidden ref.
#       Prints the sha and the permalink base every citation gains.
#   tools/publish-run.sh dispose <run-id> [--keep-ref] [--archive]
#       delete the hidden ref and the local worktree; the run branch and its pull request stay.
#   tools/publish-run.sh status
#
# What a run leaves on GitHub: one pull request, one branch with a commit per product node,
# one ref nobody sees. `index/`, `wt/` and `**/work/tree/` are ignored inside the record —
# derived, or a checkout of something the record already holds.
#
# Needs git >= 2.42 (`worktree add --orphan`) and, for the visibility check, `gh`. Set
# BATON_GH to substitute a `gh` (the tests do).

set -eu
here=$(cd "$(dirname "$0")" && pwd)
gh=${BATON_GH:-gh}
cmd=${1:-}; [ $# -gt 0 ] && shift

die() { echo "publish-run: $*" >&2; exit 1; }
root=$(git rev-parse --show-toplevel 2>/dev/null) || die "run me inside the target repository"
orch="$root/_orch"

remote_of() { url=$(git -C "$root" remote get-url "$1" 2>/dev/null) || return 1; echo "$url" | sed -E 's#^(git@|https?://)([^/:]+)[:/]##; s#\.git$##'; }
host_of()   { url=$(git -C "$root" remote get-url "$1" 2>/dev/null) || return 1; echo "$url" | sed -E 's#^(git@|https?://)([^/:]+)[:/].*#\2#'; }
rj() { sed -n "s/^[[:space:]]*\"$1\": *\"\([^\"]*\)\".*/\1/p" "$orch/run-ref.json" | head -1; }
need_ref() { [ -f "$orch/run-ref.json" ] || die "_orch/run-ref.json missing — run init first"; }

case "$cmd" in
init)
  run_id=${1:-}; [ -n "$run_id" ] || die "init <run-id>"; shift
  remote=origin; allow_public=""; base=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --remote) remote=$2; shift 2 ;;
      --base) base=$2; shift 2 ;;
      --allow-public) allow_public=1; shift ;;
      *) die "init: unknown option $1" ;;
    esac
  done
  hidden="refs/baton/run/$run_id"; local_branch="baton/run/$run_id"; run_branch="baton/$run_id"
  git worktree add --help 2>/dev/null | grep -q -- '--orphan' || die "git >= 2.42 is needed for worktree add --orphan (have $(git --version))"
  [ -f "$orch/.git" ] && die "_orch/ is already a worktree ($(rj ref 2>/dev/null || echo '?')); nothing to do"
  case "$remote" in
    *://*|git@*) git -C "$root" remote get-url baton-runs >/dev/null 2>&1 || git -C "$root" remote add baton-runs "$remote"; remote=baton-runs ;;
  esac
  repo=$(remote_of "$remote") || die "remote '$remote' does not exist"
  if [ -z "$allow_public" ] && [ "$remote" = origin ] && command -v "$gh" >/dev/null 2>&1; then
    vis=$("$gh" repo view "$repo" --json visibility -q .visibility 2>/dev/null || echo UNKNOWN)
    case "$vis" in PUBLIC|public) die "$repo is PUBLIC. A run's questions and evidence must not be public by default: pass --remote <private owner/name url> (RUNS_REPO), or --allow-public if you mean it." ;; esac
  fi
  git -C "$root" show-ref --verify --quiet "refs/heads/$local_branch" && die "local branch $local_branch already exists; resume it with: git worktree add _orch $local_branch"
  # the run branch: the base's tree plus one empty commit, so a pull request can open before any node lands
  [ -n "$base" ] || base=$(git -C "$root" symbolic-ref --short "refs/remotes/$remote/HEAD" 2>/dev/null | sed "s#^$remote/##") || base=main
  [ -n "$base" ] || base=main
  base_sha=$(git -C "$root" rev-parse --verify --quiet "$remote/$base" || git -C "$root" rev-parse --verify --quiet "$base") || die "cannot resolve base branch '$base'"
  if ! git -C "$root" show-ref --verify --quiet "refs/heads/$run_branch"; then
    c=$(git -C "$root" commit-tree "$base_sha^{tree}" -p "$base_sha" -m "baton run $run_id: opened" -m "Baton-Run: $run_id")
    git -C "$root" branch "$run_branch" "$c"
  fi
  git -C "$root" push -q "$remote" "$run_branch" 2>/dev/null || git -C "$root" push "$remote" "$run_branch"
  # the record: an orphan worktree at _orch/
  if [ -d "$orch" ]; then
    git -C "$root" worktree add --orphan -b "$local_branch" "$root/.baton-adopt" >/dev/null
    cp -R "$orch/." "$root/.baton-adopt/"
    rm -rf "$orch"
    git -C "$root" worktree move "$root/.baton-adopt" "$orch"
  else
    git -C "$root" worktree add --orphan -b "$local_branch" "$orch" >/dev/null
  fi
  printf 'index/\nwt/\n**/work/tree/\n' > "$orch/.gitignore"
  printf '{\n  "run_id": "%s",\n  "ref": "%s",\n  "local_branch": "%s",\n  "run_branch": "%s",\n  "base": "%s",\n  "remote": "%s",\n  "repo": "%s",\n  "host": "%s"\n}\n' \
    "$run_id" "$hidden" "$local_branch" "$run_branch" "$base" "$remote" "$repo" "$(host_of "$remote")" > "$orch/run-ref.json"
  echo "init: _orch/ is a worktree of $local_branch; publish pushes it to $hidden (hidden)"
  echo "      run branch $run_branch pushed from $base — open the thread with: python3 tools/inbox-gh.py open-run"
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
  ref=$(rj ref); remote=$(rj remote); repo=$(rj repo); host=$(rj host)
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
  git -C "$orch" push -q "$remote" "HEAD:$ref" 2>/dev/null || git -C "$orch" push "$remote" "HEAD:$ref"
  sha=$(git -C "$orch" rev-parse HEAD)
  echo "publish: $ref @ $sha"
  echo "         https://$host/$repo/blob/$sha/"
  ;;

dispose)
  run_id=${1:-}; [ -n "$run_id" ] || die "dispose <run-id>"; shift
  keep=""; archive=""
  while [ $# -gt 0 ]; do case "$1" in --keep-ref) keep=1 ;; --archive) archive=1 ;; *) die "dispose: unknown option $1" ;; esac; shift; done
  need_ref
  ref=$(rj ref); remote=$(rj remote); local_branch=$(rj local_branch)
  [ "$ref" = "refs/baton/run/$run_id" ] || die "_orch/ holds $ref, not refs/baton/run/$run_id"
  git -C "$orch" diff --quiet && git -C "$orch" diff --cached --quiet || die "unpublished changes in _orch/ — publish first"
  if [ -n "$archive" ]; then
    tar czf "$root/baton-run-$run_id.tar.gz" -C "$root" --exclude='_orch/index' --exclude='_orch/wt' --exclude='_orch/.git' _orch
    echo "dispose: archived to baton-run-$run_id.tar.gz"
  fi
  git -C "$root" worktree list --porcelain | sed -n 's/^worktree //p' | while read -r wtp; do
    case "$wtp" in "$orch"/*) git -C "$root" worktree remove --force "$wtp" 2>/dev/null || true ;; esac
  done
  git -C "$root" worktree remove --force "$orch"
  git -C "$root" branch -D "$local_branch" >/dev/null 2>&1 || true
  if [ -z "$keep" ]; then
    git -C "$root" push -q "$remote" ":$ref" 2>/dev/null || echo "dispose: could not delete $ref on $remote"
    echo "dispose: $ref removed; the pull request and its branch remain the record a person can read"
  else
    echo "dispose: kept $ref (--keep-ref)"
  fi
  ;;

status)
  need_ref
  ref=$(rj ref); remote=$(rj remote); run_branch=$(rj run_branch)
  echo "record:   $ref on $remote ($(rj repo))"
  echo "thread:   branch $run_branch — $(git -C "$root" rev-list --count "$(rj base)..$run_branch" 2>/dev/null || echo '?') commit(s) since $(rj base)"
  echo "head:     $(git -C "$orch" rev-parse --short HEAD 2>/dev/null || echo none)"
  echo "dirty:    $(git -C "$orch" status --porcelain | wc -l | tr -d ' ') path(s) not yet committed"
  pushed=$(git -C "$root" ls-remote "$remote" "$ref" 2>/dev/null | cut -f1)
  if [ -n "$pushed" ]; then
    echo "pushed:   $(echo "$pushed" | cut -c1-7) — $(git -C "$orch" rev-list --count "$pushed..HEAD" 2>/dev/null || echo '?') commit(s) not yet pushed"
  else
    echo "pushed:   never"
  fi
  ;;

*)
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
  ;;
esac
