// claude plugin test — RV2 (PR #57 review round 1, finding [med]): the model-request hook does not wait on
// reading the prime's transcript.
//
// Review: /Users/clank/Desktop/projects/baton/_orch/nodes/S3/work/pr57-review-r1.md (second bullet): during a run
// the turn.step hook awaited saveSpend, which (at most every 5 s) read and parsed the prime's whole transcript
// (FX7, c00efaa) before the hook returned. T6's latency figures (R-C6 rows, spec
// /Users/clank/Desktop/projects/baton/docs/designs/v7.6-tuning.md T6) were measured at f3b6c85 with no run active,
// so that cost landed on a path T6 never measured. The reviewer's fix: move the transcript read off the hook path.
// The 1-hour crediting itself (FX7, R-C3-13, spec L56) must still reach _orch/spend.json.
//
// Written before the fix (node RV2, run build-20261019T125436Z). Every file here is a fixture of this test.
import { expect, mock, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }

declare function setTimeout(fn: (...args: any[]) => void, ms?: number): unknown // type-only (XTB1): lib es2023 declares no timers

const RUN = '/proj/run' // fixture
const RUN_ID = 'build-20261106T120000Z' // fixture
const SID = '7a1b2c3d-2222-4222-8333-944455556666' // fixture: this session's id
const TRANSCRIPT = '/Users/fixture/.claude/projects/-proj-run/' + SID + '.jsonl'
const OPUS = 'claude-opus-5-5'
// Opus 5.5 cache writes per token (pricing page, as fx7-transcript.test.ts): 5-minute $5, 1-hour $8 per MTok.
const OPUS_W5M = 5e-6
const OPUS_W1H = 8e-6

type U = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
const writesOf = (n: number): U => ({ model: OPUS, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: n })

/** An active run whose prime's transcript can be made to never answer a read (`hang`). */
function world(on: any) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const writes: { path: string; text: string }[] = []
  const state = { hang: false, transcriptReads: 0 }
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/x.md', prime: true, started_at: new Date(t0 - 60000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  const rel = (p: string) => {
    const s = String(p)
    if (s.startsWith('_orch/')) return s
    const i = s.lastIndexOf('/_orch/')
    return i >= 0 ? s.slice(i + 1) : s
  }
  on('fs.read', (_$: any, e: any) => {
    if (String(e.path) === TRANSCRIPT) {
      state.transcriptReads++
      if (state.hang) return new Promise(() => {}) // the read never resolves
    }
    const v = files.get(rel(e.path))
    return v === undefined ? { deny: 'no such file' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(rel(e.path), e.text)
    writes.push({ path: rel(e.path), text: e.text })
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => ({ value: files.has(rel(e.path)) }))
  on('fs.stat', () => ({ deny: 'no such file' }))
  on('fs.list', () => ({ deny: 'no such directory' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: OPUS }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.317', base: '2.1.317' } }))
  on('session.usage', () => ({ value: { startedAt: t0, rateLimits: [], cost: { usd: 0 } } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.Stop', () => ({}))
  on('session.send', () => ({ isDelivered: true }))
  on('env.get', () => ({ value: undefined }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'NONE', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv].map(String)
    let out: any = {}
    if (argv.includes('note')) out = { index: 1, text: '', truncated: false, merges: [] }
    else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = { header: 'h', tiles: [], lines: [] }
    if (argv[0] === 'gh') out = []
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  const steps = new Map<string, U>()
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: steps.get(e.turnId) ?? null }
  })
  const spend = () => {
    const w = writes.filter((x) => x.path === '_orch/spend.json').at(-1)
    return w ? JSON.parse(w.text) : null
  }
  return { clock, steps, spend, files, writes, state }
}

/** The session starts with its transcript path known (a classic SessionStart input), as FX7's tests start it. */
async function start($: any, w: any) {
  await $.classic.SessionStart({ source: 'startup', cwd: RUN, session_id: SID, transcript_path: TRANSCRIPT, hook_event_name: 'SessionStart' } as any)
  await $.session.start({ cwd: RUN, surface: null } as any)
  await w.clock.advance(2000)
  await w.clock.settle()
}

/** One prime model request through the turn.step hook; resolves when the hook has returned its result. */
async function step($: any, w: any, turnId: string, u: U) {
  w.steps.set(turnId, u)
  const g = $.turn.step({ turnId, index: 0, model: u.model, messageCount: 1 } as any)
  let last: any
  for (let x = await g.next(); ; x = await g.next()) {
    if (x.done) {
      last = x.value
      break
    }
  }
  return last
}

// One assistant row of a transcript as Claude Code stores it (as fx7-transcript.test.ts).
function row(id: string, at: number, w1h: number, w5m: number) {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    sessionId: SID,
    timestamp: new Date(at).toISOString(),
    uuid: id + '-0',
    message: { id, role: 'assistant', model: OPUS, content: [{ type: 'text', text: 'block' }], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: w1h + w5m, cache_creation: { ephemeral_1h_input_tokens: w1h, ephemeral_5m_input_tokens: w5m } } },
  })
}

const nano = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e9) : null)
const realWait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Review finding [med] (pr57-review-r1.md, register.js:3775 via :5129); T6 / R-C6 rows (model-request latency was
// measured with no run active): during an active run, a prime request whose cache writes would make the mod read the
// transcript must not wait on that read. Here the read never resolves; the hook must still return its result.
test('rv2 T6 (R-C6, review [med]): during a run the model-request hook returns its result while the transcript read never resolves', LOADED, async ($, on) => {
  const w = world(on)
  w.files.set(TRANSCRIPT, '')
  await start($, w)
  w.state.hang = true
  let returned: any = 'not yet'
  const p = step($, w, 'p1', writesOf(1_000_000)).then((r) => (returned = r))
  // 1 s of real time: far beyond a hook that does not wait on the stalled read (T6 budget: 25 ms p95)
  await Promise.race([p, realWait(1000)])
  // expected: the hook returned the step's own result (not still waiting)
  expect(returned).not.toBe('not yet')
  expect(returned && returned.turnId).toBe('p1')
  // expected: spend.json was still written by the request (the metering itself is unchanged)
  expect(w.spend()).not.toBe(null)
})

// R-C3-13 (spec L56; FX7's behaviour): the prime's 1-hour cache writes still reach spend.json at the 1-hour rate,
// from a model request alone (no turn end), once the hook has returned and the crediting off its path has run.
test("rv2 R-C3-13: after the model-request hook returns, spend.json still gets the prime's 1-hour cache credit from the transcript", LOADED, async ($, on) => {
  const w = world(on)
  w.files.set(TRANSCRIPT, '')
  await start($, w)
  w.files.set(TRANSCRIPT, row('msg_p1', Date.now(), 600_000, 400_000) + '\n')
  const r = await step($, w, 'p1', writesOf(1_000_000))
  expect(r && r.turnId).toBe('p1')
  await w.clock.advance(100)
  await w.clock.settle()
  // expected: the transcript was read (the crediting ran)
  expect(w.state.transcriptReads).toBeGreaterThanOrEqual(1)
  // expected: $6.80 = 600k at $8 and 400k at $5 per MTok (all at the 5-minute rate would be $5.00)
  expect(nano(w.spend()?.total?.byModel?.[OPUS]?.usd)).toBe(nano(600_000 * OPUS_W1H + 400_000 * OPUS_W5M))
})
