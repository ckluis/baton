#!/bin/sh
# A stand-in for `claude -p --input-format stream-json ...` in the Fable fetch tests.
# FAKE_MODE: answer (the real 2026-11-11 answer), noplan, refuse, exit.
# Saves its arguments to $FAKE_DIR/args and the request it got to $FAKE_DIR/request.
dir=${FAKE_DIR:?}
printf '%s\n' "$@" >"$dir/args"
[ "${FAKE_MODE:-answer}" = exit ] && exit 0
printf '%s\n' '{"type":"system","subtype":"init"}'
IFS= read -r req
printf '%s\n' "$req" >"$dir/request"
here=$(dirname "$0")
case ${FAKE_MODE:-answer} in
answer) body=$(cat "$here/usage-answer.json") ;;
noplan) body='{"subscription_type":null,"rate_limits_available":false,"rate_limits":null}' ;;
esac
# A reply to some other request first: the fetch must ignore it.
printf '%s\n' '{"type":"control_response","response":{"subtype":"success","request_id":"other","response":{}}}'
if [ "$FAKE_MODE" = refuse ]; then
  printf '%s\n' '{"type":"control_response","response":{"subtype":"error","request_id":"baton-usage","error":"nope"}}'
else
  printf '{"type":"control_response","response":{"subtype":"success","request_id":"baton-usage","response":%s}}\n' "$body"
fi
cat >/dev/null # like claude, stay until stdin closes
