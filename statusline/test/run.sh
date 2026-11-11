#!/bin/sh
# Tests for usage-line.sh. Run from anywhere: sh statusline/test/run.sh
# The cases in cases.json are shared with run.ps1, so both scripts draw the same lines.
here=$(cd "$(dirname "$0")" && pwd)
script="$here/../usage-line.sh"
cases="$here/cases.json"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/baton-usage-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf 'ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/      /'; }
chmod +x "$here/fake-claude.sh"

# Draw one line: $1 input (raw text), $2 cache (raw text or empty for none), $3 now, $4 tz,
# $5 columns (or empty), $6 color (true/false).
draw() {
  rm -f "$tmp/cache.json"
  [ -n "$2" ] && printf '%s' "$2" >"$tmp/cache.json"
  if [ "$6" = true ]; then nc=''; else nc=1; fi
  if [ -n "$5" ]; then
    printf '%s' "$1" | env -u COLUMNS TZ="$4" COLUMNS="$5" NO_COLOR="$nc" BATON_USAGE_NOW="$3" \
      BATON_USAGE_CACHE="$tmp/cache.json" BATON_USAGE_NO_FETCH=1 ${SH:-sh} "$script"
  else
    printf '%s' "$1" | env -u COLUMNS -u BATON_USAGE_COLUMNS TZ="$4" NO_COLOR="$nc" BATON_USAGE_NOW="$3" \
      BATON_USAGE_CACHE="$tmp/cache.json" BATON_USAGE_NO_FETCH=1 ${SH:-sh} "$script"
  fi
}

# NO_COLOR="" must mean color on; the script checks for a non-empty value.
[ "$(sh "$script" --version)" = 8.0.0 ] && ok "version is 8.0.0" || bad "version is 8.0.0"

# ------------------------------------------------------------------ the shared cases
n=$(jq '.cases | length' "$cases")
i=0
while [ "$i" -lt "$n" ]; do
  jq -r --argjson i "$i" '.cases[$i] | [
      .name,
      (if (.input | type) == "string" then .input else (.input | tojson) end),
      (if .cache == null then "" elif (.cache | type) == "string" then .cache else (.cache | tojson) end),
      (.now | tostring), .tz, (if .cols == null then "" else (.cols | tostring) end), (.color | tostring),
      (.expect_sh // .expect)
    ] | map("x" + @base64) | join(" ")' "$cases" >"$tmp/case"
  read -r b_name b_in b_cache b_now b_tz b_cols b_color b_expect <"$tmp/case"
  d() { printf '%s' "${1#x}" | base64 -d 2>/dev/null || printf '%s' "${1#x}" | base64 -D; }
  name=$(d "$b_name") expect=$(d "$b_expect")
  got=$(draw "$(d "$b_in")" "$(d "$b_cache")" "$(d "$b_now")" "$(d "$b_tz")" "$(d "$b_cols")" "$(d "$b_color")")
  if [ "$got" = "$expect" ]; then ok "$name"; else bad "$name" "want: $expect
got:  $got"; fi
  i=$((i + 1))
done

# ------------------------------------------------------------------ never past the edge
visible() { printf '%s' "$1" | jq -Rrs 'gsub("\u001b\\[[0-9;]*m"; "") | rtrimstr("\n") | length'; }
plain() { printf '%s' "$1" | sed 's/\x1b\[[0-9;]*m//g'; }
jq -r '.width_checks as $w | $w.widths[] as $cols | $w.readings[] as $r | ["true", "false"][] as $color
  | [$r.name, ($r.input | tojson), (if $r.cache == null then "" else ($r.cache | tojson) end), ($w.now | tostring), $w.tz, ($cols | tostring), $color]
  | map("x" + @base64) | join(" ")' "$cases" >"$tmp/widths"
width_fail=0 width_n=0
while read -r b_name b_in b_cache b_now b_tz b_cols b_color; do
  d() { printf '%s' "${1#x}" | base64 -d 2>/dev/null || printf '%s' "${1#x}" | base64 -D; }
  cols=$(d "$b_cols")
  got=$(draw "$(d "$b_in")" "$(d "$b_cache")" "$(d "$b_now")" "$(d "$b_tz")" "$cols" "$(d "$b_color")")
  w=$(visible "$got")
  width_n=$((width_n + 1))
  p=$(plain "$got")
  case $p in "5h "*" · ctx "*) shape=ok ;; *) shape=bad ;; esac
  if [ "$w" -gt $((cols - 1)) ] || [ "$shape" != ok ]; then
    width_fail=1
    bad "$(d "$b_name") at $cols columns, color $(d "$b_color")" "$w columns: $got"
  fi
done <"$tmp/widths"
[ "$width_fail" = 0 ] && ok "widths 40, 45, 80, 120, 200: $width_n lines, none past the edge, 5h and ctx in each"

# ------------------------------------------------------------------ the Fable fetch
fetch() { # $1 mode, $2 claude command
  rm -rf "$tmp/fetch" && mkdir -p "$tmp/fetch"
  FAKE_DIR="$tmp/fetch" FAKE_MODE="$1" BATON_CLAUDE="$2" sh "$script" --fetch-fable "$tmp/fetch/fable.json"
  jq -c 'del(.at)' "$tmp/fetch/fable.json" 2>/dev/null
}
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "want: $3
got:  $2"; fi; }

check "fetch: saves the Fable window from the real answer" "$(fetch answer "$here/fake-claude.sh")" '{"ok":true,"plan":true,"fable":{"pct":0,"resetsAt":1794830400}}'
check "fetch: sends one get_usage request, skipping the transcript scan" "$(jq -c . "$tmp/fetch/request")" '{"type":"control_request","request_id":"baton-usage","request":{"subtype":"get_usage","skip_behaviors":true}}'
args=$(tr '\n' ' ' <"$tmp/fetch/args")
case $args in *"-p "*"--safe-mode "*"--no-session-persistence "*) ok "fetch: runs claude -p with --safe-mode and --no-session-persistence" ;; *) bad "fetch: flags" "$args" ;; esac
[ -z "$(find "$tmp/fetch" -name '*.answer.*' -o -name '*.done.*' -o -name '*.tmp.*')" ] && ok "fetch: leaves no temporary files" || bad "fetch: leaves no temporary files"
check "fetch: no plan limits" "$(fetch noplan "$here/fake-claude.sh")" '{"ok":true,"plan":false,"fable":null}'
check "fetch: a refused request is saved as a failure" "$(fetch refuse "$here/fake-claude.sh")" '{"ok":false,"error":"nope"}'
check "fetch: claude ending without an answer" "$(fetch exit "$here/fake-claude.sh")" '{"ok":false,"error":"no answer from claude"}'
start=$(date +%s)
check "fetch: claude missing" "$(fetch answer "$tmp/no-such-claude")" '{"ok":false,"error":"no answer from claude"}'
[ $(($(date +%s) - start)) -lt 10 ] && ok "fetch: a missing claude fails at once, not after the timeout" || bad "fetch: a missing claude took $(($(date +%s) - start))s"

# The line starts a fetch in the background when nothing is saved, then stops asking.
rm -rf "$tmp/bg" && mkdir -p "$tmp/bg"
first=$(printf '%s' '{}' | env FAKE_DIR="$tmp/bg" BATON_CLAUDE="$here/fake-claude.sh" BATON_USAGE_CACHE="$tmp/bg/fable.json" NO_COLOR=1 COLUMNS=200 sh "$script")
case $first in *"fable n/a (checking)"*) ok "background: the first draw says checking" ;; *) bad "background: first draw" "$first" ;; esac
k=0
while [ ! -s "$tmp/bg/fable.json" ] && [ "$k" -lt 20 ]; do sleep 1; k=$((k + 1)); done
k=0
while [ -d "$tmp/bg/fable.json.lock" ] && [ "$k" -lt 10 ]; do sleep 1; k=$((k + 1)); done
second=$(printf '%s' '{}' | env FAKE_DIR="$tmp/bg" BATON_CLAUDE="$here/fake-claude.sh" BATON_USAGE_CACHE="$tmp/bg/fable.json" NO_COLOR=1 COLUMNS=200 sh "$script")
case $second in *"fable ▕░░░░░▏ 0%"*) ok "background: the next draw shows Fable" ;; *) bad "background: next draw" "$second" ;; esac
[ ! -d "$tmp/bg/fable.json.lock" ] && ok "background: the lock is gone when the fetch ends" || bad "background: lock left behind"
rm -f "$tmp/bg/args"
printf '%s' '{}' | env FAKE_DIR="$tmp/bg" BATON_CLAUDE="$here/fake-claude.sh" BATON_USAGE_CACHE="$tmp/bg/fable.json" NO_COLOR=1 sh "$script" >/dev/null
sleep 1
[ ! -e "$tmp/bg/args" ] && ok "background: a fresh answer starts no new fetch" || bad "background: fetched again with a fresh answer"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" = 0 ]
