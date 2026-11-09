// claude plugin test — the memory tools, the automatic notes, background merges.
// The memo CLI is stubbed at process.run (a plugin test has no processes);
// the CLI itself is covered by node --test mod/test.
import { expect, mock, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) a test runs 6-10x slower than alone, and tests in the last files left at the default
// timed out under that load (_orch/nodes/XTFL1/work/repro.md, cause.md, proof.md), so every test in this file gets an
// explicit budget. No step or assertion is changed by it.
const LOADED = { timeoutMs: 60000 }

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })
const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
const MEMBER = () => JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } }) // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

type Call = { argv: string[]; stdin?: string }

function world(on: any, opts: { pending?: any[]; member?: boolean } = {}) { // amended by verifier (XT17): member: the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const calls: Call[] = []
  const registered: string[] = []
  const models: any[] = []
  let notes = 0
  const manifest = opts.member ? MEMBER() : ACTIVE // amended by verifier (XT17): the run's own session reads a manifest naming it (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: manifest } : { deny: 'ENOENT' })) // amended by verifier (XT17): the manifest chosen above (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.version', () => ({ value: { version: '2.1.287', base: '2.1.287' } }))
  on('tool.register', (_$: any, e: any) => {
    registered.push(e.name)
    return { value: { tool: 'mcp__baton__' + e.name } }
  })
  on('model.complete', (_$: any, e: any) => {
    models.push(e)
    return { value: { isAnswered: true, text: 'merged: ' + e.prompt.split('\n').length + ' lines', usage: {} } }
  })
  let pending = opts.pending ?? []
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    calls.push({ argv, stdin: e.init?.stdin })
    const cmd = argv.find((a: string) => ['note', 'wake', 'zoom', 'recall', 'pending', 'merge', 'stats', 'marks', 'superseded'].includes(a)) // amended by verifier (XT114): the store now also answers its mark records and its superseded log (C15, spec L413-414, L420-423, Q-74, Q-84; R-C15-05, R-C15-77, R-C15-107)
    let stdout = ''
    if (cmd === 'note') {
      const index = notes++
      const merges = index % 2 === 1 ? [{ level: 1, index: (index - 1) / 2 }] : []
      stdout = JSON.stringify({ index, text: e.init?.stdin ?? '', truncated: false, merges })
    } else if (cmd === 'pending') {
      stdout = JSON.stringify(pending)
      pending = []
    } else if (cmd === 'merge') stdout = JSON.stringify({ merged: 1, pending: 0 })
    else if (cmd === 'marks') stdout = argv.includes('--json') ? '[]' : 'no marks' // amended by verifier (XT114): this fixture's store holds no mark: every note is unmarked, the default (C15, spec L413-414, Q-74; R-C15-05, R-C15-77)
    else if (cmd === 'superseded') stdout = argv.includes('--json') ? '[]' : 'none' // amended by verifier (XT114): nothing was rebuilt, so the superseded log is empty (C15, spec L423, Q-84; R-C15-107)
    else stdout = cmd + ' output'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  const reset = () => { calls.length = 0; notes = 0 } // amended by verifier (XT17): forget what the session's start recorded (its pick-up note), so each test counts from its own first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  return { calls, registered, models, reset } // amended by verifier (XT17): reset, above (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
}

/** The run's own session: its id, and what SessionStart needs beneath the mod (world() mocks session.start). */ // amended by verifier (XT17): membership is recorded at session.start and keyed to session.id (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
function member(on: any) { // amended by verifier (XT17): a session.id mock and a manifest write sink (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.id', () => ({ value: SID })) // amended by verifier (XT17): membership is keyed to $.session.id() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('classic.SessionStart', () => ({})) // amended by verifier (XT17): the startup SessionStart that follows session.start (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('command.register', () => ({ value: undefined })) // amended by verifier (XT17): what session.start registers beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('fs.write', () => ({ value: undefined })) // amended by verifier (XT17): a sink for the manifest's prime_session writes (Q-7) (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
} // amended by verifier (XT17): end of member() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

/** The engine starting this session in the run's directory (/work): session.start, then the startup SessionStart. */ // amended by verifier (XT17): membership is recorded at session.start, never re-derived from the current directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
async function begin($: any) { // amended by verifier (XT17): the session starts in the run's directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false } as any) // amended by verifier (XT17): session.start in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
} // amended by verifier (XT17): end of begin() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
// amended by verifier (XT114): the guard: prefix is dropped: with memory_mark and project_mark required it fails at da5910c, so it is no longer a preservation guard but red for F114 (C15, spec L419, L510; R-C15-12, R-C15-121; D-T14-tool-names, D-T14-project-mark; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('session.start registers the memory tools when a run is active', LOADED, async ($, on) => { // amended by verifier (XT114): name without guard: (see the line above; C15, spec L419, L510; R-C15-12, R-C15-121)
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (Q-7 claim) (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): session.start in the run dir with a session.id mock (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.session.start({ cwd: '/work', surface: null } as any)
  const MARK_TOOLS = ['memory_mark', 'project_mark'] // amended by verifier (XT114): T14 adds the prime's mark tools, memory_mark and project_mark (C15, spec L419, L510; D-T14-tool-names, D-T14-project-mark; R-C15-12, R-C15-121)
  expect(w.registered.filter((n) => !MARK_TOOLS.includes(n))).toEqual(['code_search', 'code_fetch', 'code_refs', 'code_explore', 'memory_wake', 'memory_note', 'memory_zoom', 'memory_recall', 'project_wake', 'project_note', 'project_recall']) // amended by verifier (XT114): the earlier tools keep their order; where the two new ones go is F114's (C15, spec L419, L510; R-C15-12, R-C15-121)
  for (const t of MARK_TOOLS) expect(w.registered.filter((n) => n === t), t).toHaveLength(1) // amended by verifier (XT114): each mark tool is registered once (C15, spec L419, L510; D-T14-tool-names, D-T14-project-mark; R-C15-12, R-C15-121)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: memory_note appends to the run memory under _orch/memory, tagged prime, text on stdin', LOADED, async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  const r: any = await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'P2 parked: waits on Q-3' } as any)
  expect(r.result).toBe('noted #0')
  const c = w.calls[0]
  expect(c!.argv[0]).toBe('node') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(c!.argv[1]).toEndWith('/bin/memo.mjs') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(c!.argv.slice(2)).toEqual(['--dir', '/work/_orch/memory', '--json', 'note', '--tag', 'prime', '-']) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(c!.stdin).toBe('P2 parked: waits on Q-3') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: memory_wake uses the configured budget; zoom and recall pass their argument after --', LOADED, async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  // no rulings recorded (the stub's recall is not JSON): the wake is the run memory alone
  expect(((await $.tool.call({ tool: 'mcp__baton__memory_wake' } as any)) as any).result).toBe('wake output')
  expect(w.calls.find((c) => c.argv.includes('wake'))!.argv.slice(2)).toEqual(['--dir', '/work/_orch/memory', 'wake', '--budget', '96'])
  await $.tool.call({ tool: 'mcp__baton__memory_zoom', range: '10-20' } as any)
  expect(w.calls.filter((c) => c.argv.includes('zoom')).at(-1)!.argv.slice(-2)).toEqual(['--', '10-20']) // amended by verifier (XT114): the zoom call itself, found by its command: zoom now skips ❌ notes, so it may read the mark records in a call of its own before or after (C15, spec L418-419, Q-77; R-C15-110)
  await $.tool.call({ tool: 'mcp__baton__memory_recall', pattern: '--evil' } as any)
  expect(w.calls.filter((c) => c.argv.includes('recall')).at(-1)!.argv.slice(-2)).toEqual(['--', '--evil']) // amended by verifier (XT114): the recall call itself, found by its command: recall now skips ❌ notes, so it may read the mark records in a call of its own before or after (C15, spec L421; R-C15-16)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: wakeBudgetLines from userConfig reaches memory_wake', { ...LOADED, options: { wakeBudgetLines: 40 } }, async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.tool.call({ tool: 'mcp__baton__memory_wake' } as any)
  expect(w.calls.find((c) => c.argv.includes('wake'))!.argv.slice(-1)).toEqual(['40'])
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: project memory: memoryDir from config, a namespace', { ...LOADED, options: { memoryDir: 'mem/proj' } }, async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.tool.call({ tool: 'mcp__baton__project_note', text: 'never push to main', namespace: 'rulings' } as any)
  expect(w.calls[0]!.argv.slice(2, 6)).toEqual(['--dir', '/work/mem/proj', '--ns', 'rulings']) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(w.calls[0]!.argv).toContain('prime') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  await $.tool.call({ tool: 'mcp__baton__project_wake', namespace: '../../etc' } as any)
  expect(w.calls.find((c) => c.argv.includes('wake'))!.argv.slice(2, 6)).toEqual(['--dir', '/work/mem/proj', '--ns', '....etc']) // amended by verifier (XT114): project_wake's wake call, found by its command, not by its index: project_wake now skips ❌ notes, so it may read the namespace's mark records in a call of its own first (C15, spec L507, Q-86; R-C15-116). Earlier: XT11 type-only fix (inbox/Q-9.answer.md; R-C1-06)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a subagent the prime dispatched returns: its first line becomes one run note', LOADED, async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'sub1' }))
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.agent.spawn({ prompt: 'run phase 2', description: 'P2', subagentType: 'baton:sub-orchestrator' } as any)
  await $.turn.complete({ agentId: 'sub1', answer: '\n## P2 DONE+CONFIRMED 4/4 nodes; _orch/phases/P2/envelope.json\nmore detail', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const note = w.calls.find((c) => c.argv.includes('note'))!
  expect(note.argv).toContain('sub')
  expect(note.stdin).toBe('P2: P2 DONE+CONFIRMED 4/4 nodes; _orch/phases/P2/envelope.json')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a nested spawn (inside a sub-orchestrator) is not noted', LOADED, async ($, on) => {
  const w = world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  const ids = ['sub1', 'w1'] // GV4 (P3-d3): the sub-orchestrator the prime dispatched, then the worker nested inside it
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: ids.shift() }))
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.agent.spawn({ prompt: 'run phase 2', description: 'P2', subagentType: 'baton:sub-orchestrator' } as any) // GV4 (P3-d3): the nesting parent, a spawn by the prime
  await $.agent.spawn({ prompt: 'x', description: 'worker', subagentType: 'baton:worker', parentAgentId: 'sub1' } as any)
  await $.turn.complete({ agentId: 'w1', answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const nested = w.calls.filter((c) => c.argv.includes('note')).length
  // GV4 (P3-d3): the premise, that returns are noted in this session: the prime's own dispatch, returning, is noted once
  await $.turn.complete({ agentId: 'sub1', answer: 'P2 DONE', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  const after = w.calls.filter((c) => c.argv.includes('note')).length
  expect({ nested, after }).toEqual({ nested: 0, after: 1 })
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a note that completes a block starts a background merge on the cheap model', LOADED, async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { member: true, pending: [{ level: 1, index: 0, lo: 0, hi: 1, ready: true, texts: ['a', 'b'] }] }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.reset() // amended by verifier (XT17): count from the test's own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'first' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'second' } as any)
  await clock.advance(10)
  await clock.settle()
  expect(w.models.length).toBe(1)
  expect(w.models[0].model).toBe('claude-sonnet-5-5')
  expect(w.models[0].system).toContain('280 bytes')
  const merge = w.calls.find((c) => c.argv.includes('merge'))!
  expect(merge.argv).toContain('--summarize')
  expect(JSON.parse(merge.stdin!.trim())).toEqual({ level: 1, index: 0, summary: 'merged: 3 lines' })
})
