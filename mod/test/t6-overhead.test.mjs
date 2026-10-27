// node --test — T6, the mod's overhead held to its budget (red tests for F16).
//
// Requirement R-C6-05 (/Users/clank/Desktop/projects/baton/_orch/plan/traceability.yaml), spec
// docs/designs/v7.6-tuning.md L80: "Set a budget from the baseline and fix whatever is over it."
// Budget: /Users/clank/Desktop/projects/baton/_orch/inbox/Q-6.answer.md ("A: no-mod baseline; the mod may
// add at most max(25ms, 10%) at p95"), valued in /Users/clank/Desktop/projects/baton/_orch/nodes/M6A/work/budget.md
// as "tool_call_added_p95 ≤ 25 ms per tool call" and "idle_cpu ≤ 1% of one core averaged over 5 minutes".
// The mechanisms over it are the two entries of /Users/clank/Desktop/projects/baton/_orch/nodes/M6A/work/over-budget.yaml.
//
// Each test pins its entry's cost driver (a count of processes spawned or waited on), not wall time.
// The real hooks module runs under a fake runtime (as test/fixtures/hooks-smoke.mjs does): the clock is
// fake (node:test mock timers move Date; the runtime's $.clock timers are fired by the test), process.run
// is a fake that records each spawn and can hold it open, and nothing real is spawned or waited for.
// The bench's session had no run active (M6A work/bench/README.md "No run active."), so neither has this one.
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = '/t6-scratch' // never touched: every fs call is answered by the fake below

let loads = 0
/** A fresh copy of the hooks module (its caches start empty) under a fake runtime. */
async function session({ hold = () => false } = {}) {
  const { register } = await import(MOD + '/hooks/register.js?t6=' + ++loads)
  const hooks = {}
  register((ev, a, b) => {
    const [m, f] = typeof a === 'function' ? [null, a] : [a, b]
    ;(hooks[ev] ??= []).push({ m, f })
    return { catch() {} }
  })
  const match = (m, e) => !m || Object.entries(m).every(([k, v]) => (v instanceof RegExp ? v.test(e[k]) : e[k] === v))
  const terminal = { 'tool.check': () => ({ decision: 'allow' }), 'tool.call': () => ({ result: 'ran' }) }
  let $
  const fire = (ev, e) => {
    const hs = hooks[ev] ?? []
    const go = async (i, x) => {
      for (; i < hs.length; i++) if (match(hs[i].m, x)) return hs[i].f($, x, (y) => go(i + 1, y))
      return terminal[ev] ? terminal[ev](x) : x
    }
    return go(0, e)
  }
  // The runtime's timers, fired by advance() in due order.
  let now = 0
  const timers = []
  const schedule = (ms, f, every) => {
    const t = { due: now + ms, ms, f, every, live: true, cancel() { t.live = false } }
    timers.push(t)
    return t
  }
  const spawns = []
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
    session: { cwd: async () => W, root: async () => W, surfaces: async () => ['terminal'], version: async () => ({ base: '2.1.302' }), usage: async () => ({}), send: async () => ({ isDelivered: true }) },
    process: {
      run: (argv, o) => {
        const s = { argv: [...argv], settled: false, release: () => {} }
        spawns.push(s)
        const value = { exitCode: 0, stdout: JSON.stringify(out(s.argv)), stderr: '' }
        if (!hold(s.argv)) {
          s.settled = true
          return Promise.resolve(value)
        }
        return new Promise((resolve) => {
          s.release = () => {
            s.settled = true
            resolve(value)
          }
        })
      },
    },
    model: { complete: async () => ({ isAnswered: true, text: 'NONE' }) },
    clock: { after: (ms, f) => schedule(ms, f, false), every: (ms, f) => schedule(ms, f, true) },
    ui: { log: () => {}, invalidate: () => {}, toast: () => {}, open: async () => ({ isPlaced: true }), panes: async () => [], ask: async () => { throw new Error('dismissed') }, resolve: () => new Proxy({}, { get: (_, type) => (props) => ({ type, props }) }) },
    prompt: { submit: async () => ({}) },
    tool: { register: async () => ({}) },
    command: { register: async () => ({}) },
    store: { get: async () => null, set: async () => {} },
  }
  const flush = async () => {
    for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r))
  }
  const releaseAll = async () => {
    for (let k = 0; k < 10; k++) {
      const open = spawns.filter((s) => !s.settled)
      if (!open.length) return
      for (const s of open) s.release()
      await flush()
    }
  }
  /** Await p, releasing every held spawn until it settles (for work that is not under test). */
  const settle = async (p) => {
    let done = false
    const q = Promise.resolve(p).then((v) => ((done = true), v), (e) => ((done = true), undefined))
    for (let k = 0; k < 1000 && !done; k++) {
      await flush()
      await releaseAll()
    }
    return q
  }
  /** Move the session's clock (Date and the runtime's timers) by ms, firing what falls due. */
  const advance = async (ms) => {
    const end = now + ms
    for (;;) {
      const due = timers.filter((t) => t.live && t.due <= end).sort((a, b) => a.due - b.due)[0]
      if (!due) break
      mock.timers.tick(due.due - now)
      now = due.due
      if (due.every) due.due += due.ms
      else due.live = false
      let r
      try {
        r = due.f()
      } catch {}
      await settle(r)
    }
    mock.timers.tick(end - now)
    now = end
    await flush()
  }
  return { fire, spawns, advance, flush, releaseAll, settle }
}

const isMemo = (argv) => argv.some((a) => a.endsWith('/bin/memo.mjs'))

// R-C6-05 · over-budget.yaml entry 1 (mechanism: hook): "tool.check (Bash) enforced-rulings lookup, register.js:2650
// -> loadRulings (:1724) -> memoRun spawns `node bin/memo.mjs ... --ns rulings --json recall --limit 2000 -- .`",
// measured 65.0 ms added p95 against the 25 ms budget (/Users/clank/Desktop/projects/baton/_orch/inbox/Q-6.answer.md;
// budget.md "tool_call_added_p95 ≤ 25 ms per tool call").
// Cost driver: the number of Bash tool calls whose tool.check waits on a spawned process.
test('T6 hook: a Bash tool.check waits on no spawned process, even when the last call was 10 s ago', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 20, 12) })
  try {
    const s = await session({ hold: () => true })
    await s.settle(s.fire('session.start', { cwd: W }))
    await s.advance(10000) // session start's own timers (index, doctor, update check, pane) run and finish
    // 20 Bash calls, each 10 s after the last: a gap longer than the memo life over-budget.yaml names as the
    // cause ("RULINGS_TTL_MS = 3000 (:1721) is shorter than the gap between most Bash calls"), as 54 of the
    // bench's 120 Bash calls met it.
    const CALLS = 20
    let waited = 0
    for (let i = 0; i < CALLS; i++) {
      await s.advance(10000)
      await s.releaseAll()
      let done = false
      const p = s.fire('tool.check', { tool: 'Bash', input: { command: 'ls -la' } }).then((r) => ((done = true), r))
      await s.flush() // every spawn is held open: a call that waits on one cannot finish here
      if (!done) waited++
      // 'allow' is the decision this fake's permission layer gives (terminal['tool.check'] above); no ruling exists
      assert.equal((await s.settle(p)).decision, 'allow')
    }
    // One spawn on the call's path is over the whole budget by itself: over-budget.yaml
    // tool_check_spawning_median_ms 69.1 > 25 ms (budget.md). The budget is a p95 (Q-6 "at p95"), so at most
    // 5% of calls may wait on one: floor(5% of 20) = 1.
    const ALLOWED = Math.floor(CALLS * 0.05) // = 1, from Q-6 "at p95" and budget.md's 25 ms
    assert.ok(waited <= ALLOWED, `${waited} of ${CALLS} Bash tool.checks waited on a spawned process; the 25 ms p95 budget (Q-6, budget.md) allows ${ALLOWED}`)
  } finally {
    mock.timers.reset()
  }
})

// R-C6-05 · over-budget.yaml entry 2 (mechanism: timer): "pane refresh every 5 s, register.js:330/:2909 -> refreshPane
// (:1056) -> loadRulings (:1090) spawns the same memo recall on every tick (3 s TTL < 5 s period); plus memo stats +
// wake every 60 s", measured 1.03% of one core added against the 1% budget
// (/Users/clank/Desktop/projects/baton/_orch/inbox/Q-6.answer.md; budget.md "idle_cpu ≤ 1% of one core averaged over 5 minutes").
// Cost driver: the processes the mod spawns in 300 s of idle, the pane open as it opens by itself.
test('T6 timer: 300 s idle with the pane open spawns few enough processes to stay under 1% of one core', async () => {
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 20, 12) })
  try {
    const s = await session()
    await s.settle(s.fire('session.start', { cwd: W }))
    // M6A's bench waits 40 s after the turn before it samples (work/bench/README.md, arm.sh).
    await s.advance(40000)
    const before = s.spawns.length
    await s.advance(300000) // the 5-minute window of budget.md's idle_cpu (Q-6)
    const window = s.spawns.slice(before)
    // The budget, every input named:
    //   1% of one core over 300 s = 3000 ms of CPU (budget.md idle_cpu, Q-6).
    //   Spent at idle by what is not a spawn (over-budget.yaml entry 2): ui_render_hook_ms_per_300s max 152.8 ms
    //   + classic_notification_hook_ms max 404.0 ms = 556.8 ms.
    //   One spawn costs memo_recall_spawn_cpu_ms = 50 ms of CPU (over-budget.yaml entry 1).
    //   Spawns allowed = floor((3000 - 556.8) / 50) = 48. (da5910c: spawns_per_300s_idle 60 + 5 + 5 = 70.)
    const ALLOWED = Math.floor((3000 - (152.8 + 404.0)) / 50) // = 48, from budget.md and over-budget.yaml
    const memo = window.filter((x) => isMemo(x.argv)).length
    assert.ok(window.length <= ALLOWED, `${window.length} processes spawned in 300 s idle (${memo} memo); the 1% idle budget (Q-6, budget.md) allows ${ALLOWED}`)
  } finally {
    mock.timers.reset()
  }
})
