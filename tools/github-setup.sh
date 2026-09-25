#!/usr/bin/env sh
# github-setup.sh — the one repository setting TEAM mode relies on.
#
#   tools/github-setup.sh [--repo owner/name] [--apply]
#
# Prints the one API call it would make; --apply makes it: a ruleset on
# refs/heads/baton/** — the run branches, each a pull request with one commit per
# node — that blocks force pushes and restricts deletions. A force-push or a
# delete on a run branch would rewrite the commits a pull request's checks and
# verdicts point at; this makes both impossible for everyone, by pattern.
#
# The run's full record lives on refs/baton/run/<id>, a namespace rulesets do not
# cover and GitHub does not list; it is protected by ordinary push permission and
# by being cheap to re-push from any checkout that has it. Nothing else is
# configured: no labels, no Pages, no environments.
#
# Re-running is safe: an existing ruleset with the same name is updated.

set -eu
gh=${BATON_GH:-gh}
repo=""; apply=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo=$2; shift 2 ;;
    --apply) apply=1; shift ;;
    *) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
  esac
done
[ -n "$repo" ] || repo=$("$gh" repo view --json nameWithOwner -q .nameWithOwner)

ruleset=$(cat <<EOF
{
  "name": "baton run branches",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/baton/**"], "exclude": [] } },
  "rules": [ {"type":"deletion"}, {"type":"non_fast_forward"} ],
  "bypass_actors": []
}
EOF
)

echo "== ruleset on refs/heads/baton/** ($repo)"
echo "$ruleset"
if [ -z "$apply" ]; then
  echo
  echo "dry run. Add --apply to make this call."
  exit 0
fi
existing=$("$gh" api "repos/$repo/rulesets" --jq '.[] | select(.name=="baton run branches") | .id' 2>/dev/null | head -1 || true)
if [ -n "$existing" ]; then
  printf '%s' "$ruleset" | "$gh" api -X PUT "repos/$repo/rulesets/$existing" --input - >/dev/null
  echo "ruleset updated (id $existing)"
else
  printf '%s' "$ruleset" | "$gh" api -X POST "repos/$repo/rulesets" --input - >/dev/null
  echo "ruleset created"
fi
