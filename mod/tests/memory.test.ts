// claude plugin test — the memory tools, the automatic notes, background merges.
// The memo CLI is stubbed at process.run (a plugin test has no processes);
// the CLI itself is covered by node --test mod/test.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

type Call = { argv: string[]; stdin?: string }

function world(on: any, opts: { pending?: any[] } = {}) {
  const calls: Call[] = []
  const registered: string[] = []
  const models: any[] = []
  let notes = 0
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: ACTIVE } : { deny: 'ENOENT' }))
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
    const cmd = argv.find((a: string) => ['note', 'wake', 'zoom', 'recall', 'pending', 'merge', 'stats'].includes(a))
    let stdout = ''
    if (cmd === 'note') {
      const index = notes++
      const merges = index % 2 === 1 ? [{ level: 1, index: (index - 1) / 2 }] : []
      stdout = JSON.stringify({ index, text: e.init?.stdin ?? '', truncated: false, merges })
    } else if (cmd === 'pending') {
      stdout = JSON.stringify(pending)
      pending = []
    } else if (cmd === 'merge') stdout = JSON.stringify({ merged: 1, pending: 0 })
    else stdout = cmd + ' output'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return { calls, registered, models }
}

test('session.start registers the memory tools when a run is active', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work', surface: null } as any)
  expect(w.registered).toEqual(['memory_wake', 'memory_note', 'memory_zoom', 'memory_recall', 'project_wake', 'project_note', 'project_recall'])
})

test('memory_note appends to the run memory under _orch/memory, tagged prime, text on stdin', async ($, on) => {
  const w = world(on)
  const r: any = await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'P2 parked: waits on Q-3' } as any)
  expect(r.result).toBe('noted #0')
  const c = w.calls[0]
  expect(c.argv[0]).toBe('node')
  expect(c.argv[1]).toEndWith('/bin/memo.mjs')
  expect(c.argv.slice(2)).toEqual(['--dir', '/work/_orch/memory', '--json', 'note', '--tag', 'prime', '-'])
  expect(c.stdin).toBe('P2 parked: waits on Q-3')
})

test('memory_wake uses the configured budget; zoom and recall pass their argument after --', async ($, on) => {
  const w = world(on)
  // no rulings recorded (the stub's recall is not JSON): the wake is the run memory alone
  expect(((await $.tool.call({ tool: 'mcp__baton__memory_wake' } as any)) as any).result).toBe('wake output')
  expect(w.calls.find((c) => c.argv.includes('wake'))!.argv.slice(2)).toEqual(['--dir', '/work/_orch/memory', 'wake', '--budget', '96'])
  await $.tool.call({ tool: 'mcp__baton__memory_zoom', range: '10-20' } as any)
  expect(w.calls.at(-1)!.argv.slice(-2)).toEqual(['--', '10-20'])
  await $.tool.call({ tool: 'mcp__baton__memory_recall', pattern: '--evil' } as any)
  expect(w.calls.at(-1)!.argv.slice(-2)).toEqual(['--', '--evil'])
})

test('wakeBudgetLines from userConfig reaches memory_wake', { options: { wakeBudgetLines: 40 } }, async ($, on) => {
  const w = world(on)
  await $.tool.call({ tool: 'mcp__baton__memory_wake' } as any)
  expect(w.calls.find((c) => c.argv.includes('wake'))!.argv.slice(-1)).toEqual(['40'])
})

test('project memory: memoryDir from config, a namespace', { options: { memoryDir: 'mem/proj' } }, async ($, on) => {
  const w = world(on)
  await $.tool.call({ tool: 'mcp__baton__project_note', text: 'never push to main', namespace: 'rulings' } as any)
  expect(w.calls[0].argv.slice(2, 6)).toEqual(['--dir', '/work/mem/proj', '--ns', 'rulings'])
  expect(w.calls[0].argv).toContain('prime')
  await $.tool.call({ tool: 'mcp__baton__project_wake', namespace: '../../etc' } as any)
  expect(w.calls[1].argv.slice(2, 6)).toEqual(['--dir', '/work/mem/proj', '--ns', '....etc'])
})

test('a subagent the prime dispatched returns: its first line becomes one run note', async ($, on) => {
  const w = world(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'sub1' }))
  await $.agent.spawn({ prompt: 'run phase 2', description: 'P2', subagentType: 'baton:sub-orchestrator' } as any)
  await $.turn.complete({ agentId: 'sub1', answer: '\n## P2 DONE+CONFIRMED 4/4 nodes; _orch/phases/P2/envelope.json\nmore detail', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const note = w.calls.find((c) => c.argv.includes('note'))!
  expect(note.argv).toContain('sub')
  expect(note.stdin).toBe('P2: P2 DONE+CONFIRMED 4/4 nodes; _orch/phases/P2/envelope.json')
})

test('a nested spawn (inside a sub-orchestrator) is not noted', async ($, on) => {
  const w = world(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'w1' }))
  await $.agent.spawn({ prompt: 'x', description: 'worker', subagentType: 'baton:worker', parentAgentId: 'sub1' } as any)
  await $.turn.complete({ agentId: 'w1', answer: 'done', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  expect(w.calls.filter((c) => c.argv.includes('note'))).toHaveLength(0)
})

test('a note that completes a block starts a background merge on the cheap model', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { pending: [{ level: 1, index: 0, lo: 0, hi: 1, ready: true, texts: ['a', 'b'] }] })
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
