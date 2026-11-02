// claude plugin test — FX7: _orch/spend.json shows a cost for every model that served (R-C3-13).
//
// Written from the spec BEFORE the fix (node FX7, run build-20261019T125436Z, phase P4):
// - R-C3-13, spec docs/designs/v7.6-tuning.md L56: "Acceptance: a live run's band and `_orch/spend.json` show a cost
//   for every model that served." LV6 (/Users/clank/Desktop/projects/baton/_orch/nodes/LV6/work/result.md §1) found
//   spend.json with token counts only, no cost figure, and without claude-haiku-5-5, which served the engine's own
//   session-title request (a request no turn.step sees).
// - Prices: the pricing page (https://platform.claude.com/docs/en/about-claude/pricing, read 2026-11-02, as spec L50-51
//   asks): Opus 5.5 $4 input, $5 5m cache write, $8 1h cache write, $0.20 cache hit, $20 output per MTok; Sonnet 5.5
//   $2 / $2.50 / $4 / $0.10 / $10; Haiku 5.5 (prompts up to 100,000 tokens) $0.10 / $0.125 / $0.20 / $0.01 / $0.50.
//   "5-minute cache write 1.25x base input price", "1-hour cache write 2x base input price".
// - A request's cache writes by duration come in the API's usage as `cache_creation.ephemeral_5m_input_tokens` and
//   `cache_creation.ephemeral_1h_input_tokens` beside `cache_creation_input_tokens`.
// The cost figure is read as each model's `usd` under spend.json's `total.byModel` (decision P4-FX7-d1).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture
const RUN_ID = 'build-20261102T120000Z' // fixture
const SID = '3c2b1a00-1111-4222-8333-944455556666' // fixture: this session's id, the manifest's prime_session

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-5-5'
// $ per token, from the pricing page (above).
const P = {
  [OPUS]: { input: 4e-6, output: 20e-6, w5m: 5e-6, w1h: 8e-6, read: 0.2e-6 },
  [SONNET]: { input: 2e-6, output: 10e-6, w5m: 2.5e-6, w1h: 4e-6, read: 0.1e-6 },
  [HAIKU]: { input: 0.1e-6, output: 0.5e-6, w5m: 0.125e-6, w1h: 0.2e-6, read: 0.01e-6 },
}

type U = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } }
const usage = (model: string, input: number, output: number, extra: Partial<U> = {}): U => ({ model, input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...extra })

function world(on: any, o: { engineUsd?: () => number | undefined } = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const writes: { path: string; text: string }[] = []
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/x.md', prime: true, started_at: new Date(t0 - 60000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  const rel = (p: string) => {
    const s = String(p)
    if (s.startsWith('_orch/')) return s
    const i = s.lastIndexOf('/_orch/')
    return i >= 0 ? s.slice(i + 1) : s
  }
  on('fs.read', (_$: any, e: any) => {
    const v = files.get(rel(e.path))
    return v === undefined ? { deny: 'no such file' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(rel(e.path), e.text)
    writes.push({ path: rel(e.path), text: e.text })
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => ({ value: files.has(rel(e.path)) }))
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
  on('session.version', () => ({ value: { version: '2.1.316', base: '2.1.316' } }))
  // The engine's own ledger (/cost): every priced API response of the session, the mod's metered ones and its own.
  on('session.usage', () => {
    const usd = o.engineUsd ? o.engineUsd() : undefined
    return { value: { startedAt: t0, rateLimits: [], ...(usd === undefined ? {} : { cost: { usd } }) } }
  })
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('session.send', () => ({ isDelivered: true }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'NONE', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? SONNET, agentId: e.description }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
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
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: steps.get(e.turnId) ?? null }
  })
  const spend = () => {
    const w = writes.filter((x) => x.path === '_orch/spend.json').at(-1)
    return w ? JSON.parse(w.text) : null
  }
  return { clock, steps, spend }
}

async function start($: any, w: any) {
  await $.session.start({ cwd: RUN, surface: null } as any)
  await w.clock.advance(2000)
  await w.clock.settle()
}

async function step($: any, w: any, turnId: string, u: U, agentId?: string) {
  w.steps.set(turnId, u)
  const g = $.turn.step({ ...(agentId ? { agentId } : {}), turnId, index: 0, model: u.model, messageCount: 1 } as any)
  for (let x = await g.next(); !x.done; x = await g.next());
}

async function endTurn($: any, w: any) {
  await $.turn.complete({ answer: 'P1 dispatched', durationMs: 5, isAborted: false, turnId: 'end', reason: 'answer' } as any)
  await w.clock.advance(10)
  await w.clock.settle()
}

const usdOf = (s: any, model: string) => s?.total?.byModel?.[model]?.usd
// A cost figure, compared to the nano-dollar: null when spend.json holds no number there.
const nano = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e9) : null)

// R-C3-13 (spec L56): three models served the run, each through a request the mod meters; spend.json shows each one's cost.
test('fx7-spend R-C3-13: spend.json has a cost figure for each of opus, sonnet and haiku after each served a request', async ($, on) => {
  const w = world(on)
  await start($, w)
  await step($, w, 'p1', usage(OPUS, 1000, 2000))
  await $.agent.spawn({ prompt: 'cheap node', description: 'cheap-1', subagentType: 'baton:worker-cheap' } as any)
  await step($, w, 'c1', usage(SONNET, 3000, 4000), 'cheap-1')
  await $.agent.spawn({ prompt: 'mech node', description: 'mech-1', subagentType: 'baton:worker-cheap' } as any)
  await step($, w, 'h1', usage(HAIKU, 5000, 6000), 'mech-1')
  await endTurn($, w)
  const s = w.spend()
  expect(s).not.toBe(null)
  expect(nano(usdOf(s, OPUS))).toBe(nano(1000 * P[OPUS].input + 2000 * P[OPUS].output))
  expect(nano(usdOf(s, SONNET))).toBe(nano(3000 * P[SONNET].input + 4000 * P[SONNET].output))
  expect(nano(usdOf(s, HAIKU))).toBe(nano(5000 * P[HAIKU].input + 6000 * P[HAIKU].output))
})

// R-C3-13 (spec L56, LV6 §1 finding 1): haiku served the engine's own session-title request, which no turn.step sees.
// The engine's ledger (session.usage().cost, what /cost totals) counts it, as one figure with no model (SessionCost is
// { usd } at 2.1.316, and FX7's live probe saw no more). So spend.json shows the engine's total, which covers every
// model that served, and the part of it no turn.step metered. (First written to expect the figure under haiku's own
// entry; changed after the live run showed the engine's own requests also run on opus, so that guess would be wrong:
// /Users/clank/Desktop/projects/baton/_orch/nodes/FX7/work/result.md, R-C3-13 "Not fixable".)
test('fx7-spend R-C3-13: a request the engine made on its own (no turn.step) is costed in spend.json as the engine total minus what was metered', async ($, on) => {
  const opus = 1000 * P[OPUS].input + 2000 * P[OPUS].output
  const title = 1300 * P[HAIKU].input + 18 * P[HAIKU].output // LV6's title request: 1.3k input, 18 output
  let engine = 0
  const w = world(on, { engineUsd: () => engine })
  await start($, w)
  engine = title // the title request answers before the first step
  await step($, w, 'p1', usage(OPUS, 1000, 2000))
  engine = title + opus
  await endTurn($, w)
  const s = w.spend()
  expect(nano(usdOf(s, OPUS))).toBe(nano(opus))
  expect(nano(s?.engine?.usd)).toBe(nano(title + opus))
  expect(nano(s?.engine?.unmeteredUsd)).toBe(nano(title))
})

// R-C3-13 (LV6 §1 finding 3, the CHANGELOG at 41670d5): a 1-hour cache write is 2x input, not the 5-minute 1.25x.
test('fx7-spend R-C3-13: spend.json prices a 1-hour cache write at the 1-hour rate, not the 5-minute one', async ($, on) => {
  const w = world(on)
  await start($, w)
  await step($, w, 'p1', usage(OPUS, 0, 0, { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000_000 } }))
  await endTurn($, w)
  const s = w.spend()
  expect(nano(usdOf(s, OPUS))).toBe(nano(1_000_000 * P[OPUS].w1h)) // $8, where the 5-minute rate would give $5
})

// R-C3-13: one request with writes of both durations prices each part at its own rate.
test('fx7-spend R-C3-13: a request with 5-minute and 1-hour cache writes prices each part at its own rate', async ($, on) => {
  const w = world(on)
  await start($, w)
  await step($, w, 'c1', usage(SONNET, 0, 0, { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_5m_input_tokens: 600_000, ephemeral_1h_input_tokens: 400_000 } }))
  await endTurn($, w)
  const s = w.spend()
  expect(nano(usdOf(s, SONNET))).toBe(nano(600_000 * P[SONNET].w5m + 400_000 * P[SONNET].w1h))
})
