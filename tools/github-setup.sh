#!/usr/bin/env sh
# github-setup.sh — the one-time repository configuration TEAM mode relies on.
#
#   tools/github-setup.sh [--repo owner/name] [--apply] [--restrict-creation]
#
# Prints the two API calls it would make; --apply makes them:
#
#   1. a ruleset on refs/heads/baton/** — block force pushes, restrict deletions
#      (and, with --restrict-creation, restrict creations so only bypass actors can
#      open a run ref — how a reader knows a run is genuine). A force-push or a
#      delete is the new way to destroy evidence; this makes both impossible for
#      everyone, by pattern, without a rule that asks an agent to behave.
#   2. GitHub Pages from the gh-pages branch — where publish-run.sh pages puts
#      every run's briefs.
#
# Everything here is configuration, not code. Re-running is safe: an existing
# ruleset with the same name is updated, Pages that already exists is left alone.

set -eu
gh=${BATON_GH:-gh}
repo=""; apply=""; creation=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo=$2; shift 2 ;;
    --apply) apply=1; shift ;;
    --restrict-creation) creation=1; shift ;;
    *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  esac
done
[ -n "$repo" ] || repo=$("$gh" repo view --json nameWithOwner -q .nameWithOwner)

rules='{"type":"deletion"},{"type":"non_fast_forward"}'
[ -n "$creation" ] && rules="$rules"',{"type":"creation"}'
ruleset=$(cat <<EOF
{
  "name": "baton run refs",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/baton/**"], "exclude": [] } },
  "rules": [ $rules ],
  "bypass_actors": []
}
EOF
)
pages='{ "source": { "branch": "gh-pages", "path": "/" } }'

echo "== 1. ruleset on refs/heads/baton/** ($repo)"
echo "$ruleset"
echo "== 2. pages from gh-pages ($repo)"
echo "$pages"
if [ -z "$apply" ]; then
  echo
  echo "dry run. Add --apply to make these calls."
  exit 0
fi

existing=$("$gh" api "repos/$repo/rulesets" --jq '.[] | select(.name=="baton run refs") | .id' 2>/dev/null | head -1 || true)
if [ -n "$existing" ]; then
  printf '%s' "$ruleset" | "$gh" api -X PUT "repos/$repo/rulesets/$existing" --input - >/dev/null
  echo "ruleset updated (id $existing)"
else
  printf '%s' "$ruleset" | "$gh" api -X POST "repos/$repo/rulesets" --input - >/dev/null
  echo "ruleset created"
fi
if "$gh" api "repos/$repo/pages" >/dev/null 2>&1; then
  echo "pages already configured; left alone"
else
  printf '%s' "$pages" | "$gh" api -X POST "repos/$repo/pages" --input - >/dev/null && echo "pages enabled from gh-pages" \
    || echo "pages: could not enable (push a gh-pages branch first with publish-run.sh pages, then re-run)"
fi
