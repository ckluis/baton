// node --test — FX7: idle CPU within its budget (R-C6-05).
//
// Requirement R-C6-05, spec docs/designs/v7.6-tuning.md L80: "Set a budget from the baseline and fix whatever is
// over it." The budget is idle_cpu <= 1% of one core averaged over 5 minutes
// (/Users/clank/Desktop/projects/baton/_orch/nodes/M6A/work/budget.md, Q-6 option A). At the run tip M6B measured
// 1.094 % added (/Users/clank/Desktop/projects/baton/_orch/nodes/M6B/work/t6-numbers.md), and its idle-hooks data put
// the mod's own hook time at 0.57-0.82 s per 300 s and the memo spawns at about 0.75 s: the rest of the 3.3 s is
// spent by the engine each time the mod wakes it (a clock callback is a worker hop) or asks it to redraw
// (ui.invalidate: a layout and a terminal diff), neither of which the hook timings count.
//
// So these tests pin those two drivers over a 300 s idle window with the pane open and nothing changing: how many
// times the mod's timers fire, and how many redraws it asks for. The CPU itself is measured live (FX7 work/idle/).
// The harness is test/t6-overhead.test.mjs's (copied, not imported), with a count of timer fires and of invalidates.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = '/fx7-scratch' // never touched: every fs call is answered by the fake below

let loads = 0
async function session() {
  const { register } = await import(MOD + '/hooks/register.js?fx7=' + ++loads)
  const hooks = {}
  register((ev, a, b) => {
    const [m, f] = typeof a === 'function' ? [null, a] : [a, b]
    ;(hooks[ev] ??= []).push({ m, f })
    return { catch() {} }
  })
  const match = (m, e) => !m || Object.entries(m).every(([k, v]) => (v instanceof RegExp ? v.test(e[k]) : e[k] === v))
  let $
  const fire = (ev, e) => {
    const hs = hooks[ev] ?? []
    const go = async (i, x) => {
      for (; i < hs.length; i++) if (match(hs[i].m, x)) return hs[i].f($, x, (y) => go(i + 1, y))
      return x
    }
    return go(0, e)
  }
  let now = 0
  const timers = []
  const counts = { fires: 0, invalidates: 0, spawns: 0 }
  const schedule = (ms, f, every) => {
    const t = { due: now + ms, ms, f, every, live: true, cancel() { t.live = false } }
    timers.push(t)
    return t
  }
  const out = (argv) => {
    if (argv.includes('recall')) return { pattern: '.', total: 0, notes: [], blocks: [] }
    if (argv.includes('stats')) return { notes: 3, summaries: 1, treeCapacity: 7, levels: 1, pending: 0, ready: 0 }
    if (argv.includes('wake') || argv.includes('zoom')) return { header: 'h', tiles: [], lines: [] }
    return {}
  }
  const ENOENT = async () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }
  $ = {
    plugin: { root: MOD },
    env: { get: async () => undefined },
    fs: { read: ENOENT, write: async () => {}, exists: async () => false, list: ENOENT },
    session: { cwd: async () => W, root: async () => W, surfaces: async () => ['terminal'], version: async () => ({ base: '2.1.316' }), usage: async () => ({ rateLimits: [] }), send: async () => ({ isDelivered: true }) },
    process: {
      run: async (argv) => {
        counts.spawns++
        return { exitCode: 0, stdout: JSON.stringify(out([...argv])), stderr: '' }
      },
    },
    model: { complete: async () => ({ isAnswered: true, text: 'NONE' }) },
    clock: { after: (ms, f) => schedule(ms, f, false), every: (ms, f) => schedule(ms, f, true) },
    ui: { log: () => {}, invalidate: () => void counts.invalidates++, toast: () => {}, open: async () => ({ isPlaced: true }), panes: async () => [], ask: async () => { throw new Error('dismissed') }, resolve: () => new Proxy({}, { get: (_, type) => (props) => ({ type, props }) }) },
    prompt: { submit: async () => ({}) },
    tool: { register: async () => ({}) },
    command: { register: async () => ({}) },
    store: { get: async () => null, set: async () => {} },
  }
  const flush = async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r))
  }
  const advance = async (ms) => {
    const end = now + ms
    for (;;) {
      const due = timers.filter((t) => t.live && t.due <= end).sort((a, b) => a.due - b.due)[0]
      if (!due) break
      mock.timers.tick(due.due - now)
      now = due.due
      if (due.every) due.due += due.ms
      else due.live = false
      counts.fires++
      try {
        await due.f()
      } catch {}
      await flush()
    }
    mock.timers.tick(end - now)
    now = end
    await flush()
  }
  return { fire, advance, flush, counts }
}

async function idleWindow() {
  const s = await session()
  await s.fire('session.start', { cwd: W })
  await s.flush()
  // M6A's bench waits 40 s after the turn before it samples (work/bench/README.md, arm.sh).
  await s.advance(40000)
  const at = { ...s.counts }
  await s.advance(300000) // the 5-minute window of budget.md's idle_cpu
  return { fires: s.counts.fires - at.fires, invalidates: s.counts.invalidates - at.invalidates, spawns: s.counts.spawns - at.spawns }
}

// R-C6-05: every wake of the mod costs the engine a worker hop. The pane's own refresh (every 5 s, 60 a window), the
// usage tick (every 30 s, 10) and the PR poll (at least 30 s, at most 10) are what the pane and the band need; a
// timer that fires many times more often than that, with nothing to do, is the over-budget cost.
test('FX7 R-C6-05: 300 s idle with the pane open wakes the mod no more often than the pane, usage and PR timers need', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 2, 12) })
  try {
    const w = await idleWindow()
    const ALLOWED = 60 + 10 + 10 // the 5 s pane refresh, the 30 s usage tick, the PR poll at its 30 s floor
    assert.ok(w.fires <= ALLOWED, `${w.fires} timer callbacks fired in 300 s idle; the pane, usage and PR timers need ${ALLOWED}`)
  } finally {
    mock.timers.reset()
  }
})

// R-C6-05: a redraw is a layout and a terminal diff in the engine. Over 300 s of idle nothing the pane or the band
// shows changes, so nothing needs redrawing.
test('FX7 R-C6-05: 300 s idle with the pane open and nothing changing asks the engine for no redraw', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 2, 12) })
  try {
    const w = await idleWindow()
    assert.ok(w.invalidates <= 1, `${w.invalidates} redraws asked for in 300 s idle with nothing changed; at most 1 is allowed`)
  } finally {
    mock.timers.reset()
  }
})
