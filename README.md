# baton

**v8.0.0** · One line above the prompt: how much of your Claude plan is left.

```
5h ▕░░░░░▏ 7% resets 14:30 EST · fable ▕██░░░▏ 31% · wk ▕███░░▏ 52% resets Mon 07:00 EST · ctx ▕░░░░░▏ 5%
```

baton is now a Claude Code **status line**: one Node file, no packages, no plugin, no mod.
Everything else baton used to be (the prime and its agents, the memory, the views, the run
commands, the command gate) is gone. The story of why is on
[the page](https://ckluis.github.io/baton/) and in the [changelog](CHANGELOG.md).

## What each part means

| Part | What it is | Where the number comes from |
|---|---|---|
| `5h` | Your 5-hour limit, and when it resets | `rate_limits.five_hour` in the JSON Claude Code sends the status line |
| `fable` | Your separate weekly Fable limit | Claude Code's usage request (`get_usage`), asked in the background every 5 minutes |
| `wk` | Your weekly limit, and the day and time it resets | `rate_limits.seven_day` in the status line JSON |
| `ctx` | How full this chat's context window is | `context_window.used_percentage` in the status line JSON |

- **Colors:** green, then yellow from 60%, red from 85%. Set `NO_COLOR=1` for none.
- **Times** are in your computer's own time zone, read each time the line is drawn, with the
  zone's short name (`EST`, `CET`, `BST`, `AEDT`; a zone with no common short name shows its
  offset, `GMT+9`). Daylight-saving changes show up on their own.
- **Unknown numbers** show `n/a` and a short reason, never a guess:

  | Shows | Means |
  |---|---|
  | `n/a (no data yet)` | No reply yet this session, or you are not on a Claude subscription |
  | `n/a (not reported)` | Claude Code did not send this window |
  | `n/a (no messages yet)` | The context is not measured until the first message |
  | `n/a (checking)` | The first Fable check is still running (about a second) |
  | `n/a (no data)` | The Fable check failed; it tries again in 5 minutes |
  | `n/a (no Fable limit)` | Your plan has no separate Fable limit |
  | `n/a (no plan limits)` | API key, Bedrock or Vertex: plan limits do not apply |
  | `n/a (stale)` | The last Fable answer is over 30 minutes old, or its window has reset |

- **Narrow windows:** the line always fits, from 40 to 200 columns and beyond. When it does
  not fit, it drops, in this order: the bars, then the reset times, then `fable`, then `wk`, then
  the `n/a` reasons. `5h` and `ctx` always stay.

## About the Fable number

The status line JSON has no Fable window. Claude Code knows it (the `/usage` screen shows it),
and hands it out through its SDK usage request. Its SDK calls that request
`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`, so it may change. To get it, the
line starts `claude -p --safe-mode --no-session-persistence` in the background at most every 5
minutes, sends that one request, saves the answer to `~/.cache/baton-usage/fable.json`, and
stops. It calls no model and spends no tokens. If the request ever stops working, `fable` shows
`n/a (no data)` and the rest of the line carries on.

## Install

You need Node 18 or later and Claude Code 2.1.80 or later (rate limits reached the status line
in 2.1.80).

1. **From a clone** (`git clone https://github.com/ckluis/baton`), or **just the file**:

   ```bash
   curl -fsSL -o ~/.claude/baton-usage-line.mjs https://raw.githubusercontent.com/ckluis/baton/main/statusline/usage-line.mjs
   ```

2. Add this to `~/.claude/settings.json` (use the path where the file is):

   ```json
   "statusLine": {
     "type": "command",
     "command": "node ~/.claude/baton-usage-line.mjs",
     "refreshInterval": 60
   }
   ```

   `refreshInterval` redraws the line once a minute, so it stays current while you are idle.

3. Start a new Claude Code session. The line shows above the prompt.

### Coming from baton v7

v8 replaces the plugin. Close the sessions that still use baton, then:

```bash
claude plugin uninstall baton@baton
claude plugin marketplace remove baton
```

A finished run's `_orch/` and `.baton/` folders are yours to keep or delete; v8 never reads them.

## Test

```bash
npm test          # or: node --test statusline/usage-line.test.mjs
```

The tests cover every part, every `n/a` reason, six time zones plus both daylight-saving
changes, widths 40, 45, 80, 120 and 200, and the Fable request against a fake `claude`.

## License

MIT. See [LICENSE](LICENSE).
