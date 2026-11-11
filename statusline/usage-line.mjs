#!/usr/bin/env node
// baton 8.0.0: one usage line for Claude Code's status line.
//
//   5h ▕█░░░░▏ 7% resets 14:30 EST · fable ▕░░░░░▏ 0% · wk ▕███░░▏ 52% resets Mon 07:00 EST · ctx ▕░░░░░▏ 5%
//
// Claude Code runs this file as its `statusLine` command and sends it JSON on stdin.
// Where each number comes from (Claude Code 2.1.322):
//   5h    stdin rate_limits.five_hour   { used_percentage 0-100, resets_at epoch seconds }
//   wk    stdin rate_limits.seven_day   { used_percentage 0-100, resets_at epoch seconds }
//   ctx   stdin context_window.used_percentage (0-100, null before the first reply)
//   fable not on stdin. Claude Code's SDK usage request (`get_usage`, which its SDK names
//         usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET) returns the per-model weekly
//         window. This file asks for it in the background (`--fetch-fable`) at most every
//         FETCH_EVERY_MS, saves the answer, and the line reads the saved answer. It costs no tokens.
// A number that is not known shows `n/a (reason)`, never a guess.
// Times are drawn in the system's own time zone, read each time the line is drawn.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VERSION = '8.0.0'

export const FETCH_EVERY_MS = 5 * 60_000 // ask for Fable again after 5 minutes
export const STALE_AFTER_MS = 30 * 60_000 // a Fable answer older than this shows n/a (stale)
const LOCK_MS = 90_000 // one background fetch at a time
const FETCH_TIMEOUT_MS = 60_000

// ------------------------------------------------------------------ time

/** The system's time zone, read now (so a changed zone shows on the next draw). */
export function systemZone() {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

const ABBR_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-IN']

/**
 * The zone's short name at that moment: EST or EDT, CET or CEST, BST, AEDT, IST.
 * en-US alone knows only American names, so a few English locales are tried and the first
 * real abbreviation wins; a zone none of them names (Asia/Tokyo) keeps the offset, "GMT+9".
 */
export function zoneName(ms, tz) {
  const d = new Date(ms)
  let first = null
  for (const loc of ABBR_LOCALES) {
    const part = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')
    const name = part ? part.value : ''
    if (first == null) first = name
    if (/^[A-Z]{2,5}$/.test(name)) return name
  }
  return first || tz
}

function fields(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(ms))
  const get = (t) => (parts.find((p) => p.type === t) || {}).value
  return { hm: get('hour') + ':' + get('minute'), day: get('weekday') }
}

/** "14:30 EST": for the 5-hour reset. */
export function clock(ms, tz) {
  return fields(ms, tz).hm + ' ' + zoneName(ms, tz)
}

/** "Mon 07:00 EST": for the weekly reset. */
export function dayClock(ms, tz) {
  const f = fields(ms, tz)
  return f.day + ' ' + f.hm + ' ' + zoneName(ms, tz)
}

// ------------------------------------------------------------------ fields

const isPct = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * One part of the line: { key, label, pct, reason, reset }. pct is null when unknown, and then
 * reason says why. reset is the drawn reset time or null.
 */
function part(key, label, pct, reason, reset = null) {
  return { key, label, pct: isPct(pct) ? Math.max(0, Math.round(pct)) : null, reason: isPct(pct) ? null : reason, reset }
}

function windowPart(key, label, rl, w, now, tz, fmt) {
  if (!rl) return part(key, label, null, 'no data yet')
  if (!w) return part(key, label, null, 'not reported')
  if (!isPct(w.used_percentage)) return part(key, label, null, 'bad data')
  const at = Number(w.resets_at) * 1000
  const reset = Number.isFinite(at) && at > now ? fmt(at, tz) : null
  return part(key, label, w.used_percentage, null, reset)
}

/**
 * What Claude Code's saved usage answer says about Fable, or a reason it says nothing.
 * cache: { at, ok, plan, fable: { pct, resetsAt } | null, error }
 */
export function fablePart(cache, now) {
  if (!cache) return part('fable', 'fable', null, 'checking')
  if (!cache.ok) return part('fable', 'fable', null, 'no data')
  if (cache.plan === false) return part('fable', 'fable', null, 'no plan limits')
  if (!cache.fable) return part('fable', 'fable', null, 'no Fable limit')
  if (!isPct(cache.at) || now - cache.at > STALE_AFTER_MS) return part('fable', 'fable', null, 'stale')
  const resetsAt = Date.parse(cache.fable.resetsAt)
  if (Number.isFinite(resetsAt) && resetsAt <= now) return part('fable', 'fable', null, 'stale')
  return part('fable', 'fable', cache.fable.pct, 'no data')
}

/** Every part of the line, in display order, from the status line's input and the saved Fable answer. */
export function buildParts(input, fableCache, now = Date.now(), tz = systemZone()) {
  const rl = input && input.rate_limits
  const cw = input && input.context_window
  return [
    windowPart('5h', '5h', rl, rl && rl.five_hour, now, tz, clock),
    fablePart(fableCache, now),
    windowPart('wk', 'wk', rl, rl && rl.seven_day, now, tz, dayClock),
    cw && isPct(cw.used_percentage) ? part('ctx', 'ctx', cw.used_percentage) : part('ctx', 'ctx', null, 'no messages yet'),
  ]
}

// ------------------------------------------------------------------ drawing

const BAR = 5

export function bar(pct) {
  const fill = Math.max(0, Math.min(BAR, Math.round((Math.min(100, pct) / 100) * BAR)))
  return '▕' + '█'.repeat(fill) + '░'.repeat(BAR - fill) + '▏'
}

const COLOR = { green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m', off: '\x1b[0m' }

/** green, yellow from 60%, red from 85%: the same steps the v7 strip used. */
export function tone(pct) {
  return pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green'
}

/** The width a terminal gives the text: colors take none, every other character one. */
export function visibleWidth(s) {
  return [...s.replace(/\x1b\[[0-9;]*m/g, '')].length
}

/**
 * How far a line is cut down to fit, least important first. Each step keeps everything the
 * step before it dropped. 5h and ctx are never dropped.
 *   0  everything
 *   1  no bars
 *   2  no reset times
 *   3  no Fable
 *   4  no weekly
 *   5  n/a without its reason
 *   then the line is cut at the edge with "…" (only a 5h + ctx line wider than the screen gets here)
 */
export const STEPS = [
  { bars: true, resets: true, drop: [], reasons: true },
  { bars: false, resets: true, drop: [], reasons: true },
  { bars: false, resets: false, drop: [], reasons: true },
  { bars: false, resets: false, drop: ['fable'], reasons: true },
  { bars: false, resets: false, drop: ['fable', 'wk'], reasons: true },
  { bars: false, resets: false, drop: ['fable', 'wk'], reasons: false },
]

function drawPart(p, step, color) {
  const paint = (name, s) => (color ? COLOR[name] + s + COLOR.off : s)
  if (p.pct == null) return p.label + ' ' + paint('dim', step.reasons ? 'n/a (' + p.reason + ')' : 'n/a')
  const gauge = (step.bars ? bar(p.pct) + ' ' : '') + p.pct + '%'
  return p.label + ' ' + paint(tone(p.pct), gauge) + (step.resets && p.reset ? ' resets ' + p.reset : '')
}

export function drawStep(parts, step, color = false) {
  return parts.filter((p) => !step.drop.includes(p.key)).map((p) => drawPart(p, step, color)).join(' · ')
}

/** Cut plain text to `width` characters, ending in "…". */
function clip(s, width) {
  const chars = [...s]
  return chars.length <= width ? s : chars.slice(0, Math.max(0, width - 1)).join('') + '…'
}

/** The fullest line that fits `width` columns. */
export function fit(parts, width, color = false) {
  for (const step of STEPS) {
    const line = drawStep(parts, step, color)
    if (visibleWidth(line) <= width) return line
  }
  return clip(drawStep(parts, STEPS[STEPS.length - 1], false), width)
}

/**
 * The columns the line may use. Claude Code passes the terminal's width as COLUMNS; the last
 * column is left free, because writing into it makes some terminals wrap.
 */
export function lineWidth(env = process.env) {
  const cols = Number(env.BATON_USAGE_COLUMNS || env.COLUMNS)
  return Number.isFinite(cols) && cols > 1 ? Math.floor(cols) - 1 : 79
}

// ------------------------------------------------------------------ the saved Fable answer

export function cachePath(env = process.env) {
  if (env.BATON_USAGE_CACHE) return env.BATON_USAGE_CACHE
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache')
  return join(base, 'baton-usage', 'fable.json')
}

export function readCache(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = path + '.' + process.pid + '.tmp'
  writeFileSync(tmp, JSON.stringify(value))
  renameSync(tmp, path)
}

/**
 * The Fable window from Claude Code's `get_usage` answer. It reads limits[] (the server's rows,
 * percent 0-100) first and model_scoped[] second; both name the model in a display label.
 */
export function parseUsage(answer, at = Date.now()) {
  if (!answer || typeof answer !== 'object') return { at, ok: false, error: 'empty answer' }
  if (answer.rate_limits_available === false) return { at, ok: true, plan: false, fable: null }
  const rl = answer.rate_limits
  if (!rl) return { at, ok: false, error: 'no rate_limits' }
  const isFable = (name) => /fable/i.test(String(name || ''))
  const row = (rl.limits || []).find((l) => l && l.kind === 'weekly_scoped' && l.scope && l.scope.model && isFable(l.scope.model.display_name))
  if (row && isPct(row.percent)) return { at, ok: true, plan: true, fable: { pct: row.percent, resetsAt: row.resets_at || null } }
  const ms = (rl.model_scoped || []).find((m) => m && isFable(m.display_name))
  if (ms && isPct(ms.utilization)) return { at, ok: true, plan: true, fable: { pct: ms.utilization, resetsAt: ms.resets_at || null } }
  return { at, ok: true, plan: true, fable: null }
}

function lockPath(path) {
  return path + '.lock'
}

function lockHeld(path, now) {
  try {
    return now - statSync(lockPath(path)).mtimeMs < LOCK_MS
  } catch {
    return false
  }
}

/** Start a background fetch when the saved answer is old and no fetch is running. */
export function maybeRefresh(path, cache, now = Date.now(), start = startFetch) {
  if (cache && isPct(cache.at) && now - cache.at < FETCH_EVERY_MS) return false
  if (lockHeld(path, now)) return false
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(lockPath(path), String(process.pid))
  } catch {
    return false
  }
  start(path)
  return true
}

function startFetch(path) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--fetch-fable'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, BATON_USAGE_CACHE: path },
  })
  child.unref()
}

/**
 * Ask a headless Claude Code for its usage answer once and save what it says about Fable.
 * --safe-mode loads no plugins, hooks or MCP servers but keeps the login;
 * --no-session-persistence leaves no saved chat behind. No model is called.
 */
export function fetchFable(path, claude = process.env.BATON_CLAUDE || 'claude') {
  return new Promise((resolve) => {
    const id = 'baton-usage-' + process.pid
    let buf = ''
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        child.stdin.end()
        child.kill()
      } catch {}
      try {
        writeJson(path, result)
      } catch {}
      resolve(result)
    }
    const child = spawn(claude, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--safe-mode', '--no-session-persistence'], { stdio: ['pipe', 'pipe', 'ignore'] })
    const timer = setTimeout(() => finish({ at: Date.now(), ok: false, error: 'timed out' }), FETCH_TIMEOUT_MS)
    child.on('error', (e) => finish({ at: Date.now(), ok: false, error: String(e.message || e) }))
    child.on('exit', () => finish({ at: Date.now(), ok: false, error: 'claude exited without an answer' }))
    child.stdout.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        let msg
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        const r = msg && msg.type === 'control_response' && msg.response
        if (!r || r.request_id !== id) continue
        if (r.subtype !== 'success') return finish({ at: Date.now(), ok: false, error: String(r.error || 'usage request refused') })
        return finish(parseUsage(r.response, Date.now()))
      }
    })
    child.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: 'get_usage', skip_behaviors: true } }) + '\n')
  })
}

// ------------------------------------------------------------------ main

async function readStdin() {
  let s = ''
  for await (const chunk of process.stdin) s += chunk
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

async function main() {
  const path = cachePath()
  if (process.argv.includes('--fetch-fable')) {
    await fetchFable(path)
    try {
      unlinkSync(lockPath(path))
    } catch {}
    return
  }
  if (process.argv.includes('--version')) return void process.stdout.write(VERSION + '\n')
  const input = await readStdin()
  const now = Date.now()
  const cache = readCache(path)
  maybeRefresh(path, cache, now)
  const color = !process.env.NO_COLOR
  process.stdout.write(fit(buildParts(input, cache, now), lineWidth(), color) + '\n')
}

const self = (() => {
  try {
    return realpathSync(process.argv[1] || '') === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (self) main()
