#!/bin/sh
# baton 8.0.0: one usage line for Claude Code's status line (macOS, Linux, WSL).
#
#   5h ▕█░░░░▏ 7% resets 14:30 EST · fable ▕░░░░░▏ 0% · wk ▕███░░▏ 52% resets Mon 07:00 EST · ctx ▕░░░░░▏ 5%
#
# Needs only sh, jq and date. macOS 15 and later ship jq at /usr/bin/jq; on Linux it is one
# package (apt install jq, dnf install jq, apk add jq). Windows uses usage-line.ps1 instead.
#
# Where each number comes from (Claude Code 2.1.322):
#   5h    stdin rate_limits.five_hour   { used_percentage 0-100, resets_at epoch seconds }
#   wk    stdin rate_limits.seven_day   { used_percentage 0-100, resets_at epoch seconds }
#   ctx   stdin context_window.used_percentage (0-100, null before the first reply)
#   fable not on stdin. Claude Code's SDK usage request (`get_usage`, which its SDK names
#         usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET) returns the per-model weekly
#         window. This script asks for it in the background (--fetch-fable) at most every
#         5 minutes and saves the answer; the line reads the saved answer. No tokens are spent.
# A number that is not known shows `n/a (reason)`, never a guess.
# Times use `date`, so they are in the system's own zone with its own short name, read at every
# draw, and right across daylight-saving changes. (jq's strflocaltime gets the name wrong there.)
#
# Settings for tests and odd setups: BATON_USAGE_CACHE (the saved answer's path),
# BATON_USAGE_COLUMNS (width), BATON_USAGE_NOW (epoch seconds), BATON_USAGE_NO_FETCH=1,
# BATON_CLAUDE (the claude command), NO_COLOR.

VERSION=8.0.0
FETCH_EVERY=300 # ask for Fable again after 5 minutes
STALE_AFTER=1800 # a Fable answer older than 30 minutes shows n/a (stale)
LOCK_MINUTES=2 # a fetch lock older than this is from a fetch that died
FETCH_TIMEOUT=60 # seconds a fetch may take

cache_path() {
  if [ -n "${BATON_USAGE_CACHE:-}" ]; then
    printf '%s\n' "$BATON_USAGE_CACHE"
  else
    printf '%s\n' "${XDG_CACHE_HOME:-$HOME/.cache}/baton-usage/fable.json"
  fi
}

# An epoch in the local zone. GNU and busybox date take -d @EPOCH; macOS and BSD take -r EPOCH.
fmt_time() {
  LC_ALL=C date -d "@$1" "+$2" 2>/dev/null || LC_ALL=C date -r "$1" "+$2" 2>/dev/null
}

is_int() {
  case $1 in '' | *[!0-9]*) return 1 ;; *) return 0 ;; esac
}

# ------------------------------------------------------------------ the saved Fable answer

# What Claude Code's get_usage answer says about Fable: the server's limits[] rows first
# (percent 0-100), model_scoped[] second. resetsAt is kept as epoch seconds.
PARSE_ANSWER='
def epoch: try (sub("\\.[0-9]+"; "") | sub("(\\+00:00|\\+0000)$"; "Z") | fromdateiso8601) catch null;
def isfable: (. // "") | tostring | test("fable"; "i");
.response as $r
| if ($r | type) != "object" then {at: $at, ok: false, error: "empty answer"}
  elif $r.subtype != "success" then {at: $at, ok: false, error: (($r.error // "usage request refused") | tostring)}
  else $r.response as $u
  | if ($u | type) != "object" then {at: $at, ok: false, error: "empty answer"}
    elif $u.rate_limits_available == false then {at: $at, ok: true, plan: false, fable: null}
    elif ($u.rate_limits | type) != "object" then {at: $at, ok: false, error: "no rate_limits"}
    else
      ([$u.rate_limits.limits[]? | select(type == "object" and .kind == "weekly_scoped" and (.scope.model.display_name | isfable) and (.percent | type) == "number")][0]) as $row
      | ([$u.rate_limits.model_scoped[]? | select(type == "object" and (.display_name | isfable) and (.utilization | type) == "number")][0]) as $ms
      | if $row then {at: $at, ok: true, plan: true, fable: {pct: $row.percent, resetsAt: ($row.resets_at | epoch)}}
        elif $ms then {at: $at, ok: true, plan: true, fable: {pct: $ms.utilization, resetsAt: ($ms.resets_at | epoch)}}
        else {at: $at, ok: true, plan: true, fable: null} end
    end
  end'

# Ask a headless Claude Code for its usage answer once and save what it says about Fable.
# --safe-mode loads no plugins, hooks or MCP servers but keeps the login;
# --no-session-persistence leaves no saved chat behind. No model is called.
fetch_fable() {
  cache=$1
  dir=$(dirname "$cache")
  mkdir -p "$dir" || return 1
  answer="$cache.answer.$$"
  done_mark="$cache.done.$$"
  rm -f "$answer" "$done_mark"
  : >"$answer"
  claude=${BATON_CLAUDE:-claude}
  req='{"type":"control_request","request_id":"baton-usage","request":{"subtype":"get_usage","skip_behaviors":true}}'
  # stdin stays open until the answer arrives (or claude ends, or time runs out); closing it
  # then lets claude exit.
  {
    printf '%s\n' "$req"
    n=0
    while [ ! -s "$answer" ] && [ ! -e "$done_mark" ] && [ "$n" -lt "$FETCH_TIMEOUT" ]; do
      sleep 1
      n=$((n + 1))
    done
  } | "$claude" -p --input-format stream-json --output-format stream-json --verbose --safe-mode --no-session-persistence 2>/dev/null \
    | {
      jq -c --unbuffered 'select(type == "object" and .type == "control_response" and .response.request_id == "baton-usage")' 2>/dev/null | head -n 1 >"$answer"
      : >"$done_mark"
    }
  at=$(date +%s)
  if [ -s "$answer" ]; then
    result=$(jq -c --argjson at "$at" "$PARSE_ANSWER" "$answer" 2>/dev/null)
  else
    result=''
  fi
  [ -n "$result" ] || result="{\"at\":$at,\"ok\":false,\"error\":\"no answer from claude\"}"
  printf '%s\n' "$result" >"$cache.tmp.$$" && mv -f "$cache.tmp.$$" "$cache"
  rm -f "$answer" "$done_mark"
}

# Start a background fetch when the saved answer is old and no fetch is running.
maybe_refresh() {
  cache=$1 now=$2 cache_at=$3
  [ "${BATON_USAGE_NO_FETCH:-}" = 1 ] && return 0
  if is_int "$cache_at" && [ $((now - cache_at)) -lt "$FETCH_EVERY" ]; then return 0; fi
  lock="$cache.lock"
  mkdir -p "$(dirname "$cache")" 2>/dev/null || return 0
  if [ -d "$lock" ]; then
    [ -n "$(find "$lock" -prune -mmin +"$LOCK_MINUTES" 2>/dev/null)" ] || return 0
    rmdir "$lock" 2>/dev/null
  fi
  mkdir "$lock" 2>/dev/null || return 0
  nohup sh "$0" --fetch-fable "$cache" >/dev/null 2>&1 &
}

# ------------------------------------------------------------------ the line

# How far the line is cut down to fit, least important first. Each step keeps what the step
# before it dropped. 5h and ctx are never dropped.
#   0 everything · 1 no bars · 2 no reset times · 3 no Fable · 4 no weekly · 5 n/a without its
#   reason · then the line is cut at the edge with "…" (only a 5h + ctx line wider than the screen)
DRAW='
def num: type == "number";
def rnd: if . < 0 then 0 else (. + 0.5 | floor) end;
def mk($k; $p; $why; $reset):
  if ($p | num) then {key: $k, pct: ($p | rnd), reason: null, reset: $reset}
  else {key: $k, pct: null, reason: $why, reset: null} end;
def zone:
  if test("^[+-][0-9]{2}([0-9]{2})?$")
  then .[0:1] as $s | (.[1:3] | tonumber | tostring) as $h | .[3:5] as $m
    | "GMT" + $s + $h + (if $m == "" or $m == "00" then "" else ":" + $m end)
  else . end;
def when: if . == "" then null else (split(" ") | .[:-1] + [(.[-1] | zone)] | join(" ")) end;
def win($k; $rl; $w; $reset):
  if ($rl | type) != "object" then mk($k; null; "no data yet"; null)
  elif ($w | type) != "object" then mk($k; null; "not reported"; null)
  elif ($w.used_percentage | num | not) then mk($k; null; "bad data"; null)
  else mk($k; $w.used_percentage; null; ($reset | when)) end;
def fable($c):
  if ($c | type) != "object" then mk("fable"; null; "checking"; null)
  elif $c.ok != true then mk("fable"; null; "no data"; null)
  elif $c.plan == false then mk("fable"; null; "no plan limits"; null)
  elif ($c.fable | type) != "object" then mk("fable"; null; "no Fable limit"; null)
  elif ($c.at | num | not) or ($now - $c.at > $stale) then mk("fable"; null; "stale"; null)
  elif ($c.fable.resetsAt | num) and $c.fable.resetsAt <= $now then mk("fable"; null; "stale"; null)
  else mk("fable"; $c.fable.pct; "no data"; null) end;
def bar:
  (if . > 100 then 100 else . end) as $p | (($p / 100 * 5 + 0.5) | floor) as $f
  | "▕" + ([range($f)] | map("█") | join("")) + ([range(5 - $f)] | map("░") | join("")) + "▏";
def tone: if . >= 85 then "31" elif . >= 60 then "33" else "32" end;
def paint($code; $s): if $color then "\u001b[" + $code + "m" + $s + "\u001b[0m" else $s end;
def draw($step):
  if .pct == null then .key + " " + paint("2"; if $step.reasons then "n/a (" + .reason + ")" else "n/a" end)
  else .key + " " + paint(.pct | tone; (if $step.bars then (.pct | bar) + " " else "" end) + (.pct | tostring) + "%")
    + (if $step.resets and .reset != null then " resets " + .reset else "" end) end;
def visible: gsub("\u001b\\[[0-9;]*m"; "") | length;
def steps: [
  {bars: true, resets: true, drop: [], reasons: true},
  {bars: false, resets: true, drop: [], reasons: true},
  {bars: false, resets: false, drop: [], reasons: true},
  {bars: false, resets: false, drop: ["fable"], reasons: true},
  {bars: false, resets: false, drop: ["fable", "wk"], reasons: true},
  {bars: false, resets: false, drop: ["fable", "wk"], reasons: false}];
def line($parts; $step): [$parts[] | select(.key as $k | $step.drop | index($k) | not) | draw($step)] | join(" · ");

(try ($in | fromjson) catch null) as $input
| (try ($cache | fromjson) catch null) as $c
| (if ($input | type) == "object" then $input else {} end) as $i
| [ win("5h"; $i.rate_limits; $i.rate_limits.five_hour?; $t5),
    fable($c),
    win("wk"; $i.rate_limits; $i.rate_limits.seven_day?; $tw),
    (if ($i.context_window.used_percentage? | num) then mk("ctx"; $i.context_window.used_percentage; null; null)
     else mk("ctx"; null; "no messages yet"; null) end) ] as $parts
| ([steps[] | line($parts; .) | select(visible <= $width)][0]) as $fits
| if $fits != null then $fits
  else (line($parts; steps[-1]) | gsub("\u001b\\[[0-9;]*m"; "")) as $s
    | if ($s | length) <= $width then $s else $s[0:($width - 1)] + "…" end
  end'

main() {
  input=$(cat)
  cache=$(cache_path)
  now=${BATON_USAGE_NOW:-$(date +%s)}
  cache_txt=$(cat "$cache" 2>/dev/null)

  # The two reset times and the saved answer's age, then the times drawn by date.
  set -- $(jq -rn --arg in "$input" --arg c "$cache_txt" '
    def int: if type == "number" then floor | tostring else "-" end;
    (try ($in | fromjson) catch null) as $i | (try ($c | fromjson) catch null) as $c
    | [($i.rate_limits.five_hour.resets_at? | int), ($i.rate_limits.seven_day.resets_at? | int), ($c.at? | int)]
    | join(" ")' 2>/dev/null)
  r5=${1:--} rw=${2:--} cache_at=${3:--}
  t5='' tw=''
  if is_int "$r5" && [ "$r5" -gt "$now" ]; then t5=$(fmt_time "$r5" '%H:%M %Z'); fi
  if is_int "$rw" && [ "$rw" -gt "$now" ]; then tw=$(fmt_time "$rw" '%a %H:%M %Z'); fi

  maybe_refresh "$cache" "$now" "$cache_at"

  # The columns the line may use: Claude Code passes the terminal width as COLUMNS; the last
  # column stays free, because writing into it makes some terminals wrap.
  cols=${BATON_USAGE_COLUMNS:-${COLUMNS:-}}
  if is_int "$cols" && [ "$cols" -gt 1 ]; then width=$((cols - 1)); else width=79; fi
  if [ -n "${NO_COLOR:-}" ]; then color=false; else color=true; fi

  jq -rn --arg in "$input" --arg cache "$cache_txt" --arg t5 "$t5" --arg tw "$tw" \
    --argjson now "$now" --argjson stale "$STALE_AFTER" --argjson width "$width" --argjson color "$color" \
    "$DRAW" 2>/dev/null || printf '%s\n' "baton: jq is missing or failed (see README)"
}

case ${1:-} in
--version) printf '%s\n' "$VERSION" ;;
--fetch-fable)
  cache=${2:-$(cache_path)}
  fetch_fable "$cache"
  rmdir "$cache.lock" 2>/dev/null
  ;;
*) main ;;
esac
