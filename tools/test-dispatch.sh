#!/usr/bin/env sh
# test-dispatch.sh — per-node effort, end to end, without a model or a network.
#
#   tools/test-dispatch.sh
#
# Runs the selftests of dispatch.py and tiers.py, then dispatches three spawns
# through dispatch.py against a fake `claude` (BATON_CLAUDE), derives the ledger,
# and indexes the run. What it proves: a node's declared `effort:` reaches the
# spawn, a spawn that ran at another effort is an `effort-mismatch` finding, a
# reroute is recorded as `served:`, and the histogram counts rung/effort.
# Exit 1 on any failure.

set -u
here=$(cd "$(dirname "$0")" && pwd)
fails=0
ok()   { echo "  PASS  $*"; }
bad()  { echo "  FAIL  $*"; fails=$((fails+1)); }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

echo "== python selftests"
python3 "$here/dispatch.py" --selftest >/dev/null && ok "dispatch.py selftest" || bad "dispatch.py selftest"
python3 "$here/tiers.py" --selftest >/dev/null && ok "tiers.py selftest" || bad "tiers.py selftest"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/_orch/plan"
cat > "$tmp/_orch/plan/graph.yaml" <<'G'
- id: B1
  rung: 1
  effort: high
- id: V1
  rung: 1
  effort: medium
- id: R1
  rung: 1
G
cat > "$tmp/claude" <<'F'
#!/usr/bin/env sh
# fake claude: one assistant message from the model asked for (or a reroute), one result
m=$(echo "$@" | sed 's/.*--model \([^ ]*\).*/\1/')
[ "${FAKE_REROUTE:-}" ] && m=claude-opus-4-8
echo "{\"type\":\"assistant\",\"message\":{\"model\":\"$m\"}}"
echo '{"type":"result","is_error":false,"total_cost_usd":0.1}'
echo "$@" >> "$FAKE_LOG"
F
chmod +x "$tmp/claude"
echo x > "$tmp/p.md"
export BATON_CLAUDE="$tmp/claude" FAKE_LOG="$tmp/argv.log"
d() { python3 "$here/dispatch.py" --model claude-opus-5-5 --prompt "$tmp/p.md" --cwd "$tmp" --state-root "$tmp/_orch" "$@" >/dev/null; }

echo "== dispatch"
d --node B1 --effort medium            # ran below what the graph declares
d --node V1                            # effort from the graph
FAKE_REROUTE=1 d --node R1             # no effort declared, and served by another model
check "V1 was spawned at its declared medium" "grep -q -- '--effort medium' '$tmp/argv.log'"
check "R1 with no effort: ran at high" "grep -q ',R1,1,claude-opus-5-5,high,' $tmp/_orch/ledger/*-R1-1.csv"
check "R1's reroute is in its note, its model column unchanged" "grep -q 'served: claude-opus-4-8' $tmp/_orch/ledger/*-R1-1.csv"

echo "== derive and index"
(cd "$tmp" && python3 "$here/lists.py" derive >/dev/null)
(cd "$tmp" && python3 "$here/index.py" --state-root _orch >/dev/null)
s="$tmp/_orch/index/summary.md"
check "B1's mismatch is a finding" "grep -q 'effort-mismatch .*B1 attempt 1' '$s'"
check "V1 and R1 raise no mismatch" "[ \$(grep -c 'effort-mismatch' '$s') -eq 1 ]"
check "the histogram counts rung/effort" "grep -q 'by rung/effort: 1/high: 1, 1/medium: 2' '$s'"
check "tiers.py check accepts the graph" "python3 '$here/tiers.py' check --state-root '$tmp/_orch' >/dev/null"

echo
[ $fails -eq 0 ] && echo "all passed" || echo "$fails failed"
[ $fails -eq 0 ]
