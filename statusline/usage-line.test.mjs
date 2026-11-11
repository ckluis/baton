// Tests for the baton 8.0.0 usage line. Run: node --test statusline/
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  STEPS, VERSION, bar, buildParts, cachePath, clock, dayClock, drawStep, fetchFable, fit, fablePart,
  lineWidth, maybeRefresh, parseUsage, readCache, systemZone, visibleWidth, zoneName,
} from './usage-line.mjs'

// The status line input Claude Code 2.1.322 sent on 2026-11-11 (trimmed to the fields used).
const NOW = Date.parse('2026-11-11T16:07:00Z')
const INPUT = {
  version: '2.1.322',
  context_window: { used_percentage: 5, context_window_size: 1000000 },
  rate_limits: {
    five_hour: { used_percentage: 7, resets_at: 1794425400 }, // 2026-11-11T19:30:00Z
    seven_day: { used_percentage: 52, resets_at: 1794830400 }, // 2026-11-16T12:00:00Z
  },
}
// The get_usage answer Claude Code 2.1.322 gave the same day (trimmed to the fields used).
const USAGE = {
  subscription_type: 'max',
  rate_limits_available: true,
  rate_limits: {
    five_hour: { utilization: 8, resets_at: '2026-11-11T19:30:00.423652+00:00' },
    seven_day: { utilization: 53, resets_at: '2026-11-16T12:00:00.423674+00:00' },
    cedar_ember: null,
    limits: [
      { kind: 'session', group: 'session', percent: 8, resets_at: '2026-11-11T19:30:00.423652+00:00', scope: null },
      { kind: 'weekly_all', group: 'weekly', percent: 53, resets_at: '2026-11-16T12:00:00.423674+00:00', scope: null },
      { kind: 'weekly_scoped', group: 'weekly', percent: 0, resets_at: '2026-11-16T12:00:00+00:00', scope: { model: { id: null, display_name: 'Fable' }, surface: null } },
    ],
    model_scoped: [{ display_name: 'Fable', utilization: 0, resets_at: '2026-11-16T12:00:00+00:00' }],
  },
}
const FABLE = { at: NOW - 60_000, ok: true, plan: true, fable: { pct: 31, resetsAt: '2026-11-16T12:00:00+00:00' } }
const NY = 'America/New_York'
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')
const line = (input, cache, width = 200, tz = NY, now = NOW) => fit(buildParts(input, cache, now, tz), width)

// ------------------------------------------------------------------ every field

test('version is 8.0.0', () => assert.equal(VERSION, '8.0.0'))

test('every field, at full width', () => {
  assert.equal(line(INPUT, FABLE), '5h ▕░░░░░▏ 7% resets 14:30 EST · fable ▕██░░░▏ 31% · wk ▕███░░▏ 52% resets Mon 07:00 EST · ctx ▕░░░░░▏ 5%')
})

test('the order is 5h, fable, wk, ctx', () => {
  assert.deepEqual(buildParts(INPUT, FABLE, NOW, NY).map((p) => p.key), ['5h', 'fable', 'wk', 'ctx'])
})

test('percents are rounded whole numbers', () => {
  const input = { ...INPUT, context_window: { used_percentage: 12.6 }, rate_limits: { five_hour: { used_percentage: 33.4, resets_at: 1794425400 } } }
  const s = line(input, FABLE)
  assert.match(s, /^5h ▕██░░░▏ 33% /)
  assert.match(s, /ctx ▕█░░░░▏ 13%$/)
})

test('bars: 0, half, full, and past 100 stays full', () => {
  assert.equal(bar(0), '▕░░░░░▏')
  assert.equal(bar(50), '▕███░░▏')
  assert.equal(bar(100), '▕█████▏')
  assert.equal(bar(140), '▕█████▏')
})

test('colors: green, yellow from 60, red from 85; colors take no width', () => {
  const input = { ...INPUT, rate_limits: { five_hour: { used_percentage: 61, resets_at: 1794425400 }, seven_day: { used_percentage: 90, resets_at: 1794830400 } } }
  const colored = fit(buildParts(input, FABLE, NOW, NY), 200, true)
  assert.match(colored, /5h \x1b\[33m▕███░░▏ 61%\x1b\[0m/)
  assert.match(colored, /wk \x1b\[31m▕█████▏ 90%\x1b\[0m/)
  assert.match(colored, /ctx \x1b\[32m/)
  assert.equal(visibleWidth(colored), plain(colored).length)
})

// ------------------------------------------------------------------ n/a, never a made-up number

test('before the first reply: no rate_limits and no context', () => {
  assert.equal(line({}, FABLE), '5h n/a (no data yet) · fable ▕██░░░▏ 31% · wk n/a (no data yet) · ctx n/a (no messages yet)')
  assert.equal(line(null, FABLE), '5h n/a (no data yet) · fable ▕██░░░▏ 31% · wk n/a (no data yet) · ctx n/a (no messages yet)')
  assert.match(line({ context_window: { used_percentage: null } }, FABLE), /ctx n\/a \(no messages yet\)$/)
})

test('a window Claude Code does not report', () => {
  const input = { ...INPUT, rate_limits: { five_hour: INPUT.rate_limits.five_hour } }
  assert.match(line(input, FABLE), /wk n\/a \(not reported\)/)
})

test('a window with a bad number', () => {
  const input = { ...INPUT, rate_limits: { ...INPUT.rate_limits, five_hour: { used_percentage: 'x', resets_at: 1794425400 } } }
  assert.match(line(input, FABLE), /^5h n\/a \(bad data\)/)
})

test('a reset time already past is left out, the percent stays', () => {
  const s = line(INPUT, FABLE, 200, NY, Date.parse('2026-11-11T20:00:00Z'))
  assert.match(s, /^5h ▕░░░░░▏ 7% · fable/)
})

test('fable: every reason it can be n/a', () => {
  const reason = (cache, now = NOW) => fablePart(cache, now).reason
  assert.equal(reason(null), 'checking')
  assert.equal(reason({ at: NOW, ok: false, error: 'timed out' }), 'no data')
  assert.equal(reason({ at: NOW, ok: true, plan: false, fable: null }), 'no plan limits')
  assert.equal(reason({ at: NOW, ok: true, plan: true, fable: null }), 'no Fable limit')
  assert.equal(reason({ ...FABLE, at: NOW - 31 * 60_000 }), 'stale')
  assert.equal(reason(FABLE, Date.parse('2026-11-16T12:00:01Z')), 'stale')
  assert.equal(reason({ ...FABLE, fable: { pct: null } }), 'no data')
  assert.equal(fablePart(FABLE, NOW).pct, 31)
})

// ------------------------------------------------------------------ time zones

test('two zones besides New York, with their own short names', () => {
  assert.equal(clock(Date.parse('2026-11-11T19:30:00Z'), 'Europe/Berlin'), '20:30 CET')
  assert.equal(clock(Date.parse('2026-11-11T19:30:00Z'), 'Asia/Tokyo'), '04:30 GMT+9')
  assert.equal(dayClock(Date.parse('2026-11-16T12:00:00Z'), 'Asia/Tokyo'), 'Mon 21:00 GMT+9')
  assert.equal(dayClock(Date.parse('2026-11-16T12:00:00Z'), 'America/Los_Angeles'), 'Mon 04:00 PST')
  assert.equal(clock(Date.parse('2026-07-01T12:00:00Z'), 'Europe/London'), '13:00 BST')
  assert.equal(clock(Date.parse('2026-01-01T12:00:00Z'), 'Australia/Sydney'), '23:00 AEDT')
})

test('the weekly reset can land on another day in another zone', () => {
  const t = Date.parse('2026-11-15T23:30:00Z') // Sunday in New York, Monday in Tokyo
  assert.equal(dayClock(t, NY), 'Sun 18:30 EST')
  assert.equal(dayClock(t, 'Asia/Tokyo'), 'Mon 08:30 GMT+9')
})

test('daylight saving ends: 01:30 happens twice in New York on 2026-11-01', () => {
  assert.equal(clock(Date.parse('2026-11-01T05:30:00Z'), NY), '01:30 EDT')
  assert.equal(clock(Date.parse('2026-11-01T06:30:00Z'), NY), '01:30 EST')
  assert.equal(zoneName(Date.parse('2026-10-31T12:00:00Z'), NY), 'EDT')
  assert.equal(zoneName(Date.parse('2026-11-02T12:00:00Z'), NY), 'EST')
})

test('daylight saving starts: a reset across the change shows the new name', () => {
  // 2026-03-08 02:00 EST jumps to 03:00 EDT. "Now" is before, the reset after.
  const before = Date.parse('2026-03-08T06:00:00Z') // 01:00 EST
  const reset = Date.parse('2026-03-08T08:00:00Z') // 04:00 EDT
  const input = { rate_limits: { five_hour: { used_percentage: 10, resets_at: reset / 1000 } }, context_window: { used_percentage: 1 } }
  assert.match(fit(buildParts(input, FABLE, before, NY), 200), /^5h ▕█░░░░▏ 10% resets 04:00 EDT/)
  assert.equal(clock(before, NY), '01:00 EST')
})

test('the zone is read when the line is drawn, not fixed', () => {
  const old = process.env.TZ
  try {
    process.env.TZ = 'Asia/Tokyo'
    assert.equal(systemZone(), 'Asia/Tokyo')
    assert.match(fit(buildParts(INPUT, FABLE, NOW), 200), /resets 04:30 GMT\+9/)
    process.env.TZ = 'Europe/Berlin'
    assert.match(fit(buildParts(INPUT, FABLE, NOW), 200), /resets 20:30 CET/)
  } finally {
    if (old === undefined) delete process.env.TZ
    else process.env.TZ = old
  }
})

test('no time is ever drawn in UTC Z form', () => {
  for (const tz of [NY, 'Asia/Tokyo', 'Europe/Berlin', 'UTC']) assert.doesNotMatch(line(INPUT, FABLE, 200, tz), /\d\dZ\b/)
  assert.equal(clock(Date.parse('2026-11-11T19:30:00Z'), 'UTC'), '19:30 UTC')
})

// ------------------------------------------------------------------ widths

const WIDTHS = [40, 45, 80, 120, 200]

test('widths 40, 45, 80, 120, 200: never past the edge, 5h and ctx always there', () => {
  const cases = [
    ['all known', INPUT, FABLE],
    ['all n/a', {}, null],
    ['high numbers', { rate_limits: { five_hour: { used_percentage: 100, resets_at: 1794425400 }, seven_day: { used_percentage: 100, resets_at: 1794830400 } }, context_window: { used_percentage: 100 } }, { ...FABLE, fable: { pct: 100, resetsAt: FABLE.fable.resetsAt } }],
  ]
  for (const cols of WIDTHS) {
    const w = lineWidth({ COLUMNS: String(cols) })
    assert.equal(w, cols - 1)
    for (const [name, input, cache] of cases) {
      for (const color of [false, true]) {
        const s = fit(buildParts(input, cache, NOW, NY), w, color)
        assert.ok(visibleWidth(s) <= w, `${name} at ${cols}: ${visibleWidth(s)} > ${w}: ${s}`)
        assert.match(plain(s), /^5h /, `${name} at ${cols}`)
        assert.match(plain(s), / · ctx /, `${name} at ${cols}`)
      }
    }
  }
})

test('what each width shows, for the real reading', () => {
  const at = (cols) => line(INPUT, FABLE, lineWidth({ COLUMNS: String(cols) }))
  assert.equal(at(200), '5h ▕░░░░░▏ 7% resets 14:30 EST · fable ▕██░░░▏ 31% · wk ▕███░░▏ 52% resets Mon 07:00 EST · ctx ▕░░░░░▏ 5%')
  assert.equal(at(120), at(200))
  assert.equal(at(80), '5h 7% resets 14:30 EST · fable 31% · wk 52% resets Mon 07:00 EST · ctx 5%')
  assert.equal(at(45), '5h 7% · fable 31% · wk 52% · ctx 5%')
  assert.equal(at(40), '5h 7% · fable 31% · wk 52% · ctx 5%')
})

test('the drop order is bars, then reset times, then Fable, then weekly, then reasons', () => {
  const parts = buildParts({}, null, NOW, NY)
  assert.equal(drawStep(parts, STEPS[3]), '5h n/a (no data yet) · wk n/a (no data yet) · ctx n/a (no messages yet)')
  assert.equal(drawStep(parts, STEPS[4]), '5h n/a (no data yet) · ctx n/a (no messages yet)')
  assert.equal(drawStep(parts, STEPS[5]), '5h n/a · ctx n/a')
  assert.equal(fit(parts, 39), '5h n/a · ctx n/a')
  const full = buildParts(INPUT, FABLE, NOW, NY)
  assert.equal(fit(full, 30), '5h 7% · wk 52% · ctx 5%')
  assert.equal(fit(full, 20), '5h 7% · ctx 5%')
})

test('a screen narrower than 5h + ctx is cut with "…", never past the edge', () => {
  const s = fit(buildParts(INPUT, FABLE, NOW, NY), 10)
  assert.equal(s, '5h 7% · c…')
  assert.equal(visibleWidth(s), 10)
})

test('width falls back to 80 columns when COLUMNS is missing', () => {
  assert.equal(lineWidth({}), 79)
  assert.equal(lineWidth({ COLUMNS: 'abc' }), 79)
  assert.equal(lineWidth({ COLUMNS: '120', BATON_USAGE_COLUMNS: '60' }), 59)
})

// ------------------------------------------------------------------ the Fable answer

test('parseUsage reads Fable from the real get_usage answer', () => {
  assert.deepEqual(parseUsage(USAGE, 5), { at: 5, ok: true, plan: true, fable: { pct: 0, resetsAt: '2026-11-16T12:00:00+00:00' } })
})

test('parseUsage falls back to model_scoped, and says when there is no Fable or no plan', () => {
  const noRows = { ...USAGE, rate_limits: { ...USAGE.rate_limits, limits: null, model_scoped: [{ display_name: 'Fable', utilization: 12, resets_at: 'x' }] } }
  assert.equal(parseUsage(noRows, 1).fable.pct, 12)
  const none = { ...USAGE, rate_limits: { ...USAGE.rate_limits, limits: [USAGE.rate_limits.limits[0]], model_scoped: [] } }
  assert.equal(parseUsage(none, 1).fable, null)
  assert.deepEqual(parseUsage({ rate_limits_available: false, rate_limits: null }, 1), { at: 1, ok: true, plan: false, fable: null })
  assert.equal(parseUsage(null, 1).ok, false)
  assert.equal(parseUsage({ rate_limits_available: true, rate_limits: null }, 1).ok, false)
})

function scratch() {
  return mkdtempSync(join(tmpdir(), 'baton-usage-test-'))
}

test('a background fetch starts only when the saved answer is old and none is running', () => {
  const dir = scratch()
  try {
    const path = join(dir, 'fable.json')
    const started = []
    const start = (p) => started.push(p)
    assert.equal(maybeRefresh(path, { ...FABLE, at: NOW - 60_000 }, NOW, start), false) // fresh
    assert.equal(maybeRefresh(path, null, NOW, start), true) // nothing saved
    assert.equal(maybeRefresh(path, null, NOW, start), false) // one already running
    const old = (NOW - 120_000) / 1000
    utimesSync(path + '.lock', old, old) // that one died long ago
    assert.equal(maybeRefresh(path, { ...FABLE, at: NOW - 6 * 60_000 }, NOW, start), true)
    assert.deepEqual(started, [path, path])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function fakeClaude(dir, body) {
  const path = join(dir, 'claude')
  writeFileSync(path, '#!/usr/bin/env node\n' + body)
  chmodSync(path, 0o755)
  return path
}

test('fetchFable asks get_usage, saves the Fable answer, and passes the light flags', async () => {
  const dir = scratch()
  try {
    const out = join(dir, 'fable.json')
    const claude = fakeClaude(dir, `
      const fs = require('fs')
      fs.writeFileSync(${JSON.stringify(join(dir, 'args.json'))}, JSON.stringify(process.argv.slice(2)))
      process.stdout.write('{"type":"system","subtype":"init"}\\n')
      process.stdin.once('data', (d) => {
        const req = JSON.parse(String(d).split('\\n')[0])
        fs.writeFileSync(${JSON.stringify(join(dir, 'req.json'))}, JSON.stringify(req))
        const answer = ${JSON.stringify(USAGE)}
        process.stdout.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: req.request_id, response: answer } }) + '\\n')
      })
      setTimeout(() => {}, 30000)
    `)
    const r = await fetchFable(out, claude)
    assert.equal(r.ok, true)
    assert.deepEqual(r.fable, { pct: 0, resetsAt: '2026-11-16T12:00:00+00:00' })
    assert.deepEqual(readCache(out), r)
    const req = JSON.parse(readFileSync(join(dir, 'req.json'), 'utf8'))
    assert.equal(req.type, 'control_request')
    assert.deepEqual(req.request, { subtype: 'get_usage', skip_behaviors: true })
    const args = JSON.parse(readFileSync(join(dir, 'args.json'), 'utf8'))
    for (const flag of ['-p', '--safe-mode', '--no-session-persistence']) assert.ok(args.includes(flag), flag)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('fetchFable saves a failure (never a number) when claude gives no answer or is missing', async () => {
  const dir = scratch()
  try {
    const out = join(dir, 'fable.json')
    const quits = fakeClaude(dir, 'process.exit(0)')
    assert.deepEqual({ ...(await fetchFable(out, quits)), at: 0 }, { at: 0, ok: false, error: 'claude exited without an answer' })
    const refused = fakeClaude(dir, `process.stdin.once('data', (d) => { const r = JSON.parse(String(d)); process.stdout.write(JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: r.request_id, error: 'nope' } }) + '\\n') }); setTimeout(() => {}, 30000)`)
    assert.equal((await fetchFable(out, refused)).error, 'nope')
    const missing = await fetchFable(out, join(dir, 'no-such-claude'))
    assert.equal(missing.ok, false)
    assert.equal(fablePart(readCache(out), Date.now()).reason, 'no data')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the cache lives under ~/.cache unless told otherwise', () => {
  assert.equal(cachePath({ BATON_USAGE_CACHE: '/x/y.json' }), '/x/y.json')
  assert.equal(cachePath({ XDG_CACHE_HOME: '/c' }), '/c/baton-usage/fable.json')
  assert.match(cachePath({}), /\/\.cache\/baton-usage\/fable\.json$/)
  assert.equal(readCache('/no/such/file.json'), null)
  assert.equal(existsSync('/no/such/file.json'), false)
})
