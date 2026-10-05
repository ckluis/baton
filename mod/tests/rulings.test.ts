// claude plugin test — operator prompts, rulings, and the prime's own replies become memory.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

type Call = { argv: string[]; stdin?: string }

function world(on: any, opts: { manifest?: string | null; model?: string | null; rulings?: any[] } = {}) {
  const calls: Call[] = []
  const logs: string[] = []
  const manifest = opts.manifest === undefined ? ACTIVE : opts.manifest
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
  return { calls, logs, notes }
}

test('an operator prompt during a run is a run note; a standing rule in it becomes a ruling', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { model: 'RULING: Never merge a PR yourself; the operator merges.' })
  await $.prompt.submit({ text: 'ship it, and from now on never merge my PRs' } as any)
  await clock.advance(10)
  await clock.settle()
  const [op, rule] = w.notes()
  expect(op.tag).toBe('operator')
  expect(op.argv).toContain('/work/_orch/memory')
  expect(op.text).toBe('ship it, and from now on never merge my PRs')
  expect(rule.tag).toBe('ruling')
  expect(rule.argv.slice(2, 6)).toEqual(['--dir', '/work/.baton/memory', '--ns', 'rulings'])
  expect(rule.text).toBe('Never merge a PR yourself; the operator merges.')
})

test('a one-off prompt is noted but records no ruling', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { model: 'NONE' })
  await $.prompt.submit({ text: 'what is P3 waiting on?' } as any)
  await clock.advance(10)
  await clock.settle()
  expect(w.notes().map((x) => x.tag)).toEqual(['operator'])
})

test('no model answer: the marker fallback records the message itself', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, { model: null })
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

test('memory_wake leads with the newest rulings, newest first', async ($, on) => {
  world(on, {
    rulings: [
      { index: 0, ts: '2026-10-01T00:00:00Z', tag: 'ruling', text: 'use haiku for sweeps' },
      { index: 1, ts: '2026-10-03T00:00:00Z', tag: 'ruling', text: 'use sonnet for sweeps' },
    ],
  })
  const r: any = await $.tool.call({ tool: 'mcp__baton__memory_wake' } as any)
  expect(r.result).toStartWith('Standing rulings from the operator, newest first')
  expect(r.result.indexOf('use sonnet')).toBeLessThan(r.result.indexOf('use haiku'))
  expect(r.result).toEndWith('wake output')
})

test("the prime's reply: its first line is a run note; a subagent's is not", async ($, on) => {
  const w = world(on)
  await $.turn.complete({ answer: '\nDispatched P3 sub-orchestrator — waits on Q-2\nmore', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await $.turn.complete({ agentId: 'x1', answer: 'not mine', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' } as any)
  await $.turn.complete({ answer: 'interrupted', durationMs: 5, isAborted: true, turnId: 't3', reason: 'answer' } as any)
  expect(w.notes().map((x) => [x.tag, x.text])).toEqual([['prime-reply', 'Dispatched P3 sub-orchestrator — waits on Q-2']])
})

test('/baton rule records by hand; /baton rulings lists', async ($, on) => {
  const w = world(on, { rulings: [{ index: 0, ts: '2026-10-04T00:00:00Z', tag: 'ruling-hand', text: 'PRs target main' }] })
  const r: any = await $.command.run({ command: 'baton', args: 'rule PRs target main' } as any)
  expect(r.text).toBe('baton: ruling noted #0')
  expect(w.notes()[0].tag).toBe('ruling-hand')
  const l: any = await $.command.run({ command: 'baton', args: 'rulings' } as any)
  expect(l.text).toContain('#0 2026-10-04 PRs target main')
})
