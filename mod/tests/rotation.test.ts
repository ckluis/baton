// claude plugin test — rotation: measure → handoff note → compact → wake.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 'build-1', mode: 'BUILD', target: '.', prime: true })

function world(on: any, manifest: string | null = ACTIVE) {
  const notes: { tag: string; text: string }[] = []
  const compacts: any[] = []
  const forks: any[] = []
  const logs: string[] = []
  on('fs.read', (_$: any, e: any) =>
    e.path.endsWith('_orch/manifest.json') && manifest ? { value: manifest } : { deny: 'ENOENT' },
  )
  on('ui.log', (_$: any, e: any) => {
    logs.push(String(e.text ?? JSON.stringify(e)))
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('model.fork', (_$: any, e: any) => {
    forks.push(e)
    return { value: { isAnswered: true, text: 'P3 running; waiting on F2-verify; next: gate P3', usage: {} } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv.includes('note')) notes.push({ tag: argv[argv.indexOf('--tag') + 1], text: e.init?.stdin })
    return { value: { exitCode: 0, stdout: JSON.stringify({ index: notes.length - 1, text: '', truncated: false, merges: [] }), stderr: '' } }
  })
  on('session.compact', (_$: any, e: any) => {
    compacts.push(e)
    return { messages: [MSG] }
  })
  mock.store(on)
  on('tool.call', () => ({ result: 'ran' }))
  return { notes, compacts, forks, logs }
}

const MSG = { role: 'user', text: 'summary of the run so far', toolUses: [] }

const measure = (percent: number) => ({ context: { tokens: percent * 10000, window: 1000000, percent }, rateLimits: [], changed: ['context'] })

test('crossing rotateAtPercent during a run: handoff note, then a compaction with baton instructions', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  await $.session.measure(measure(20) as any)
  await clock.advance(1000)
  expect(w.compacts).toHaveLength(0)
  await $.session.measure(measure(36) as any)
  await clock.advance(1000)
  await clock.settle()
  expect(w.forks).toHaveLength(1)
  expect(w.notes.at(-1)).toEqual({ tag: 'handoff', text: 'handoff (36%): P3 running; waiting on F2-verify; next: gate P3' })
  expect(w.compacts).toHaveLength(1)
  expect(w.compacts[0].instructions).toContain('memory_wake')
  // still above the threshold: no second rotation until it falls back under
  await $.session.measure(measure(37) as any)
  await clock.advance(1000)
  expect(w.compacts).toHaveLength(1)
})

test('rotateAtPercent comes from userConfig', { options: { rotateAtPercent: 60 } }, async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  await $.session.measure(measure(50) as any)
  await clock.advance(1000)
  expect(w.compacts).toHaveLength(0)
  await $.session.measure(measure(61) as any)
  await clock.advance(1000)
  await clock.settle()
  expect(w.compacts).toHaveLength(1)
})

test('no run, no rotation', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, null)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  await $.session.measure(measure(90) as any)
  await clock.advance(1000)
  expect(w.compacts).toHaveLength(0)
})

test('after a rotation the compact SessionStart tells the prime to call memory_wake, once', async ($, on) => {
  const w = world(on)
  on('classic.SessionStart', () => ({}))
  await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [MSG] } as any)
  const r: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(r.additionalContext.join(' ')).toContain('mcp__baton__memory_wake')
  expect(r.additionalContext.join(' ')).toContain('rotation #1')
  const again: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(again.additionalContext ?? []).toHaveLength(0)
})

test('if no SessionStart carried the wake, the prime\'s next tool call does', async ($, on) => {
  world(on)
  await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [MSG] } as any)
  const r: any = await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  expect((r.context ?? []).join(' ')).toContain('memory_wake')
  const r2: any = await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  expect(r2.context ?? []).toHaveLength(0)
})

test('/baton rotate: handoff note, then the engine\'s own /compact queued; its compaction counts and arms the wake', async ($, on) => {
  const w = world(on)
  const submits: any[] = []
  on('prompt.submit', (_$: any, e: any) => {
    submits.push(e)
    return { text: e.text }
  })
  on('command.run', () => ({ text: 'core' }))
  on('classic.SessionStart', () => ({}))
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('/compact queued (rotation #1)')
  expect(w.notes.at(-1)!.tag).toBe('handoff')
  expect(submits).toHaveLength(1)
  expect(submits[0].text).toStartWith('/compact This is a baton prime rotation.')
  // the engine runs the queued /compact: a manual compaction
  const notesBefore = w.notes.length
  await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [MSG] } as any)
  expect(w.notes.length).toBe(notesBefore) // no second note: the handoff was written
  const s: any = await $.command.run({ command: 'baton', args: 'status' } as any)
  expect(s.text).toContain('rotations 1 (last')
  expect(s.text).toContain('baton rotate')
  const wake: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(wake.additionalContext.join(' ')).toContain('mcp__baton__memory_wake')
})

test('/baton rotate outside a run says so', async ($, on) => {
  world(on, null)
  on('command.run', () => ({ text: 'core' }))
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('no baton run is active')
})

test('BATON_AUTOROTATE=0: the threshold never rotates, /baton rotate still does', async ($, on) => {
  const clock = mock.clock(on)
  mock.env(on, { BATON_AUTOROTATE: '0' })
  const w = world(on)
  on('session.version', () => ({ value: { version: '2.1.287', base: '2.1.287' } }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('command.run', () => ({ text: 'core' }))
  await $.session.start({ cwd: '/work', surface: null } as any)
  await $.session.measure(measure(20) as any)
  await $.session.measure(measure(95) as any)
  await clock.advance(5000)
  expect(w.compacts).toHaveLength(0)
  const s: any = await $.command.run({ command: 'baton', args: 'status' } as any)
  expect(s.text).toContain('auto-rotation off')
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('/compact queued')
})
