// claude plugin test — operator prompts, rulings, and the prime's own replies become memory.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })
const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
const MEMBER = () => JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } }) // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

type Call = { argv: string[]; stdin?: string }

function world(on: any, opts: { manifest?: string | null; model?: string | null; rulings?: any[]; member?: boolean } = {}) { // amended by verifier (XT17): member: the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const calls: Call[] = []
  const logs: string[] = []
  const manifest = opts.member ? MEMBER() : opts.manifest === undefined ? ACTIVE : opts.manifest // amended by verifier (XT17): the run's own session reads a manifest naming it (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') && manifest ? { value: manifest } : { deny: 'ENOENT' }))
  on('ui.log', (_$: any, e: any) => {
    logs.push(String(e.text ?? ''))
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: [] }))
  on('model.complete', () =>
    opts.model === null ? { value: { isAnswered: false, text: '', usage: {} } } : { value: { isAnswered: true, text: opts.model ?? 'NONE', usage: {} } },
  )
  let n = 0
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    calls.push({ argv, stdin: e.init?.stdin })
    let stdout = 'wake output'
    if (argv.includes('note')) stdout = JSON.stringify({ index: n++, text: e.init?.stdin ?? '', truncated: false, merges: [] })
    else if (argv.includes('recall')) stdout = JSON.stringify({ pattern: '.', total: 0, notes: opts.rulings ?? [], blocks: [] })
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  const notes = () => calls.filter((c) => c.argv.includes('note')).map((c) => ({ argv: c.argv, tag: c.argv[c.argv.indexOf('--tag') + 1], text: c.stdin }))
  const reset = () => { calls.length = 0; n = 0 } // amended by verifier (XT17): forget what the session's start recorded (its pick-up note), so each test counts from its own first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  return { calls, logs, notes, reset } // amended by verifier (XT17): reset, above (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
}

/** The run's own session: its id, and what session.start and SessionStart need beneath the mod. */ // amended by verifier (XT17): membership is recorded at session.start and keyed to session.id (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
function member(on: any) { // amended by verifier (XT17): a session.id mock, a manifest write sink and a session.start in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.id', () => ({ value: SID })) // amended by verifier (XT17): membership is keyed to $.session.id() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd })) // amended by verifier (XT17): session.start records membership (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('classic.SessionStart', () => ({})) // amended by verifier (XT17): the startup SessionStart that follows session.start (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } })) // amended by verifier (XT17): what session.start reads beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } })) // amended by verifier (XT17): what session.start registers beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('command.register', () => ({ value: undefined })) // amended by verifier (XT17): what session.start registers beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('fs.write', () => ({ value: undefined })) // amended by verifier (XT17): a sink for the manifest's prime_session writes (Q-7) (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
} // amended by verifier (XT17): end of member() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

/** The engine starting this session in the run's directory (/work): session.start, then the startup SessionStart. */ // amended by verifier (XT17): membership is recorded at session.start, never re-derived from the current directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
async function begin($: any) { // amended by verifier (XT17): the session starts in the run's directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false } as any) // amended by verifier (XT17): session.start in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
} // amended by verifier (XT17): end of begin() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: an operator prompt during a run is a run note; a standing rule in it becomes a ruling', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { member: true, model: 'RULING: Never merge a PR yourself; the operator merges.' }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.prompt.submit({ text: 'ship it, and from now on never merge my PRs' } as any)
  await clock.advance(10)
  await clock.settle()
  const [op, rule] = w.notes()
  expect(op!.tag).toBe('operator') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(op!.argv).toContain('/work/_orch/memory') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(op!.text).toBe('ship it, and from now on never merge my PRs') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(rule!.tag).toBe('ruling') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(rule!.argv.slice(2, 6)).toEqual(['--dir', '/work/.baton/memory', '--ns', 'rulings']) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(rule!.text).toBe('Never merge a PR yourself; the operator merges.') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a one-off prompt is noted but records no ruling', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { member: true, model: 'NONE' }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.prompt.submit({ text: 'what is P3 waiting on?' } as any)
  await clock.advance(10)
  await clock.settle()
  expect(w.notes().map((x) => x.tag)).toEqual(['operator'])
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: no model answer: the marker fallback records the message itself', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { member: true, model: null }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.prompt.submit({ text: 'always run the gate in the foreground' } as any)
  await clock.advance(10)
  await clock.settle()
  expect(w.notes().map((x) => [x.tag, x.text])).toEqual([
    ['operator', 'always run the gate in the foreground'],
    ['ruling', 'always run the gate in the foreground'],
  ])
})

test('slash commands and prompts outside a run are not noted', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { manifest: null, model: 'RULING: x x x x x x' })
  await $.prompt.submit({ text: 'never do X' } as any)
  await $.prompt.submit({ text: '/baton status' } as any)
  await clock.advance(10)
  await clock.settle()
  expect(w.notes()).toHaveLength(0)
})

test("an agent's message during a run is not the operator's: no note, no ruling", async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  await $.prompt.submit({ text: 'from now on never merge', origin: { kind: 'peer-send-message' } } as any)
  await clock.advance(10)
  await clock.settle()
  expect(w.notes()).toEqual([])
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: memory_wake leads with the newest rulings, newest first', async ($, on) => {
  world(on, {
    member: true, // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
    rulings: [
      { index: 0, ts: '2026-10-01T00:00:00Z', tag: 'ruling', text: 'use haiku for sweeps' },
      { index: 1, ts: '2026-10-03T00:00:00Z', tag: 'ruling', text: 'use sonnet for sweeps' },
    ],
  })
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const r: any = await $.tool.call({ tool: 'mcp__baton__memory_wake' } as any)
  expect(r.result).toStartWith('Standing rulings from the operator, newest first')
  expect(r.result.indexOf('use sonnet')).toBeLessThan(r.result.indexOf('use haiku'))
  expect(r.result).toEndWith('wake output')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test("guard: the prime's reply: its first line is a run note; a subagent's is not", async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.turn.complete({ answer: '\nDispatched P3 sub-orchestrator — waits on Q-2\nmore', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await $.turn.complete({ agentId: 'x1', answer: 'not mine', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  await $.turn.complete({ answer: 'interrupted', durationMs: 5, isAborted: true, turnId: 't3', reason: 'answer' } as any)
  expect(w.notes().map((x) => [x.tag, x.text])).toEqual([['prime-reply', 'Dispatched P3 sub-orchestrator — waits on Q-2']])
})

test('/baton rule records by hand; /baton rulings lists', async ($, on) => {
  const w = world(on, { rulings: [{ index: 0, ts: '2026-10-04T00:00:00Z', tag: 'ruling-hand', text: 'PRs target main' }] })
  const r: any = await $.command.run({ command: 'baton', args: 'rule PRs target main' } as any)
  expect(r.text).toBe('baton: ruling noted #0')
  expect(w.notes()[0]!.tag).toBe('ruling-hand') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  const l: any = await $.command.run({ command: 'baton', args: 'rulings' } as any)
  expect(l.text).toContain('#0 2026-10-04 PRs target main')
})
