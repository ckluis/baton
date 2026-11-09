// claude plugin test — FX7 attempt 3: the prime's 1-hour cache writes are priced from the session's own transcript,
// and no code path of the mod opens ~/.claude.json (R-C3-13; operator answer Q-FX7-1 = B).
//
// Written from the spec and the operator's answer BEFORE the fix (node FX7 attempt 3, run build-20261019T125436Z):
// - R-C3-13, spec docs/designs/v7.6-tuning.md L56: "a live run's band and `_orch/spend.json` show a cost for every
//   model that served". LV6 §1 finding 3 and the CHANGELOG at 41670d5: spend.json prices a 1-hour cache write as a
//   5-minute one. turn.step's usage carries the four counts and the model only (FX7 attempt 1's probe, types
//   TurnUsage at 2.1.316), so the prime's 1-hour writes are only told apart in the session's own transcript
//   (`transcript_path` in every classic hook input), whose assistant rows carry the API's
//   `usage.cache_creation.ephemeral_1h_input_tokens` / `ephemeral_5m_input_tokens`. One API response is stored as
//   several rows (one per content block) with the same `message.id`.
// - Operator answer /Users/clank/Desktop/projects/baton/_orch/inbox/Q-FX7-1.answer.md: "the baton mod must NOT read
//   ~/.claude.json, not even this project's entry ... Add a test that the mod never opens ~/.claude.json." The
//   transcript "may still be read, read-only, to price the prime's 1-hour cache writes."
// - Prices (pricing page, read 2026-11-02): Opus 5.5 $4 input; 5-minute write 1.25x = $5, 1-hour write 2x = $8 per MTok.
import { expect, mock, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }

const RUN = '/proj/run' // fixture
const RUN_ID = 'build-20261102T130000Z' // fixture
const SID = '7a1b2c3d-1111-4222-8333-944455556666' // fixture: this session's id, the manifest's prime_session
const HOME = '/Users/fixture' // fixture home directory
const TRANSCRIPT = HOME + '/.claude/projects/-proj-run/' + SID + '.jsonl'

const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'
const HAIKU = 'claude-haiku-5-5'
const OPUS_W5M = 5e-6
const OPUS_W1H = 8e-6

type U = { model: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }
const usage = (model: string, input: number, output: number, writes = 0): U => ({ model, input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: writes })

function world(on: any) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const writes: { path: string; text: string }[] = []
  const touched: string[] = [] // every path the mod read, listed, stat'ed or tested, and every process argv
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/x.md', prime: true, started_at: new Date(t0 - 60000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  const rel = (p: string) => {
    const s = String(p)
    if (s.startsWith('_orch/')) return s
    const i = s.lastIndexOf('/_orch/')
    return i >= 0 ? s.slice(i + 1) : s
  }
  on('fs.read', (_$: any, e: any) => {
    touched.push(String(e.path))
    const v = files.get(rel(e.path))
    return v === undefined ? { deny: 'no such file' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(rel(e.path), e.text)
    writes.push({ path: rel(e.path), text: e.text })
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => {
    touched.push(String(e.path))
    return { value: files.has(rel(e.path)) }
  })
  on('fs.stat', (_$: any, e: any) => {
    touched.push(String(e.path))
    return { deny: 'no such file' }
  })
  on('fs.list', (_$: any, e: any) => {
    touched.push(String(e && e.path))
    return { deny: 'no such directory' }
  })
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
  on('session.usage', () => ({ value: { startedAt: t0, rateLimits: [], cost: { usd: 0 } } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.Stop', () => ({}))
  on('session.send', () => ({ isDelivered: true }))
  on('env.get', (_$: any, e: any) => ({ value: e && e.name === 'HOME' ? HOME : undefined }))
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
    const argv = [...e.argv].map(String)
    touched.push(...argv)
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
  return { clock, steps, spend, files, writes, touched }
}

// The classic SessionStart input, base fields included (2.1.316 runs it before session.start, FX2).
async function start($: any, w: any) {
  await $.classic.SessionStart({ source: 'startup', cwd: RUN, session_id: SID, transcript_path: TRANSCRIPT, hook_event_name: 'SessionStart' } as any)
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
  await $.classic.Stop({ session_id: SID, transcript_path: TRANSCRIPT, cwd: RUN, hook_event_name: 'Stop', stop_hook_active: false } as any)
  await $.turn.complete({ answer: 'P1 dispatched', durationMs: 5, isAborted: false, turnId: 'end', reason: 'answer' } as any)
  await w.clock.advance(10)
  await w.clock.settle()
}

// One assistant row of a transcript as Claude Code 2.1.316 stores it (seen in FX7's live transcripts).
function row(id: string, at: number, w1h: number, w5m: number, model = OPUS, block = 0) {
  return JSON.stringify({
    type: 'assistant',
    isSidechain: false,
    sessionId: SID,
    timestamp: new Date(at).toISOString(),
    uuid: id + '-' + block,
    message: { id, role: 'assistant', model, content: [{ type: 'text', text: 'block ' + block }], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: w1h + w5m, cache_creation: { ephemeral_1h_input_tokens: w1h, ephemeral_5m_input_tokens: w5m } } },
  })
}

const usdOf = (s: any, model: string) => s?.total?.byModel?.[model]?.usd
const nano = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e9) : null)

// R-C3-13 (spec L56; LV6 §1 finding 3; the CHANGELOG at 41670d5): the prime's request wrote 600k tokens to a 1-hour
// cache and 400k to a 5-minute one. turn.step tells the mod only "1,000,000 cache writes"; the transcript tells
// which were 1-hour. Its rows from before this process (a resumed session) are not this process's to price, a
// response stored as two rows is one response, and the transcript is only read.
test("fx7-transcript R-C3-13: the prime's 1-hour cache writes are priced at 2x from the session's own transcript, which is never written", LOADED, async ($, on) => {
  const w = world(on)
  const before = Date.now() - 3_600_000 // a row from an earlier process of this session (resume)
  const lines = [row('msg_earlier', before, 900_000, 0), JSON.stringify({ type: 'user', isSidechain: false, timestamp: new Date(before + 1000).toISOString(), message: { role: 'user', content: 'go' } })]
  w.files.set(TRANSCRIPT, lines.join('\n') + '\n')
  await start($, w)
  const now = Date.now()
  lines.push(row('msg_p1', now, 600_000, 400_000, OPUS, 0), row('msg_p1', now, 600_000, 400_000, OPUS, 1))
  const text = lines.join('\n') + '\n'
  w.files.set(TRANSCRIPT, text)
  await step($, w, 'p1', usage(OPUS, 0, 0, 1_000_000))
  await endTurn($, w)
  const s = w.spend()
  expect(s).not.toBe(null)
  // $6.80: 600k at $8 and 400k at $5. All at the 5-minute rate would be $5.00; the earlier row or the
  // duplicated row counted would reach the cap of 1,000,000 1-hour writes, $8.00.
  expect(nano(usdOf(s, OPUS))).toBe(nano(600_000 * OPUS_W1H + 400_000 * OPUS_W5M))
  expect(w.writes.filter((x) => x.path === TRANSCRIPT || x.path.endsWith('.jsonl'))).toEqual([])
  expect(w.files.get(TRANSCRIPT)).toBe(text)
})

// R-C3-13 (spec L56), seen live in FX7 attempt 3 (session f24b82ba-8339-4acf-8e40-342d745d4a42): the turn's last
// response reached the transcript after the turn's end had written spend.json, so its 398 1-hour writes stayed at the
// 5-minute rate and spend.json's opus figure fell $0.0012 short of /cost's. A row that arrives after the reading is
// priced at a reading a moment later, with nothing else happening.
test("fx7-transcript R-C3-13: a prime response that reaches the transcript after the turn's end is still priced at the 1-hour rate", LOADED, async ($, on) => {
  const w = world(on)
  w.files.set(TRANSCRIPT, '')
  await start($, w)
  await step($, w, 'p1', usage(OPUS, 0, 0, 1_000_000))
  await endTurn($, w) // the transcript does not hold the response yet
  w.files.set(TRANSCRIPT, row('msg_p1', Date.now(), 600_000, 400_000) + '\n')
  await w.clock.advance(5_000)
  await w.clock.settle()
  expect(nano(usdOf(w.spend(), OPUS))).toBe(nano(600_000 * OPUS_W1H + 400_000 * OPUS_W5M))
})

// Operator answer Q-FX7-1 = B (R-C3-13): the mod never opens ~/.claude.json. Every read, stat, list, exists and
// process argv over a session's start, three models' requests, a turn's end and two minutes of timers is recorded;
// none names that file.
test('fx7-transcript R-C3-13 (Q-FX7-1 B): no code path of the mod opens ~/.claude.json while it meters and writes spend', LOADED, async ($, on) => {
  const w = world(on)
  w.files.set(TRANSCRIPT, row('msg_p0', Date.now(), 1000, 0) + '\n')
  await start($, w)
  await step($, w, 'p1', usage(OPUS, 1000, 2000, 1000))
  await $.agent.spawn({ prompt: 'cheap node', description: 'cheap-1', subagentType: 'baton:worker-cheap' } as any)
  await step($, w, 'c1', usage(SONNET, 3000, 4000), 'cheap-1')
  await $.agent.spawn({ prompt: 'mech node', description: 'mech-1', subagentType: 'baton:worker-cheap' } as any)
  await step($, w, 'h1', usage(HAIKU, 5000, 6000), 'mech-1')
  await endTurn($, w)
  for (let i = 0; i < 12; i++) {
    await w.clock.advance(10_000)
    await w.clock.settle()
  }
  await endTurn($, w)
  expect(w.spend()).not.toBe(null)
  expect(w.touched.some((p) => p.includes('_orch/'))).toBe(true) // the record works: the manifest was read
  expect(w.touched.filter((p) => /(^|[\/\\])\.claude\.json$/.test(p))).toEqual([])
})
