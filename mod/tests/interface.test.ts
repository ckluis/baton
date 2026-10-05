// claude plugin test — the /baton pane, the gauge band, the spinner, the -p text.
import { expect, mock, test } from 'claude-code/testing'

const MANIFEST = { run_id: 'build-20261002T120000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P2' }

async function has(ui: any, re: RegExp) {
  if (!(await ui.find({ text: re }))) throw new Error('not drawn: ' + re + ' in ' + JSON.stringify(await ui.drawn()).slice(0, 2000))
}

function world(on: any, opts: { orch?: boolean; surfaces?: string[] } = {}) {
  const orch = opts.orch ?? true
  const files: Record<string, string> = orch
    ? {
        '_orch/manifest.json': JSON.stringify(MANIFEST),
        '_orch/phases/P1/envelope.json': JSON.stringify({ verdict: 'DONE', summary: 'bootstrap and plan' }),
        '_orch/nodes/T1/status.json': JSON.stringify({ verdict: 'DONE' }),
        '_orch/nodes/T2/status.json': JSON.stringify({ verdict: 'BLOCKED' }),
        '_orch/ledger/20261002T120500Z-T1-1.csv': 'ts,node,rung,model,effort,attempt,verdict,seconds,note\n2026-10-02T12:05:00Z,T1,1,claude-opus-5-5,medium,1,DONE,300,"wrote the parser, 4/4"\n',
      }
    : {}
  const dirs: Record<string, any[]> = orch
    ? {
        '_orch/phases': [{ name: 'P1', kind: 'directory' }, { name: 'P2', kind: 'directory' }],
        '_orch/nodes': [{ name: 'T1', kind: 'directory' }, { name: 'T2', kind: 'directory' }, { name: 'T3', kind: 'directory' }],
        '_orch/ledger': [{ name: '20261002T120500Z-T1-1.csv', kind: 'file' }],
      }
    : {}
  const find = (table: Record<string, any>, p: string) => Object.keys(table).find((k) => p === k || p.endsWith('/' + k))
  on('fs.read', (_$: any, e: any) => {
    const k = find(files, e.path)
    return k ? { value: files[k] } : { deny: 'ENOENT' }
  })
  on('fs.list', (_$: any, e: any) => {
    const k = find(dirs, e.path)
    return k ? { value: dirs[k] } : { deny: 'ENOENT' }
  })
  mock.clock(on)
  // Beneath the plugins, the engine's own drawing: one Text carrying the props it was handed.
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.props.suffix ?? e.component)] })
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['terminal'] }))
  on('process.run', (_$: any, e: any) => {
    const a = [...e.argv]
    let out: any = {}
    if (a.includes('stats')) out = { notes: 9, summaries: 7, treeCapacity: 7, levels: 3, pending: 0, ready: 0 }
    if (a.includes('wake')) out = { header: 'h', tiles: [{}, {}], lines: ['#0-7 (8 notes) bootstrap, cast, plan; P1 DONE', '#8 2026-10-02T12:06:00Z [sub] P2: T2 BLOCKED on Q-1'] }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
}

test('/baton opens the pane; Work and Memory draw on terminal and desktop', async ($, on) => {
  world(on)
  const r: any = await $.command.run({ command: 'baton', args: '' } as any)
  expect(r.text ?? '').toBe('')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'baton', surface, component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 140, placement: 'dock', scroll: { bodyRows: 30 } } as any })
    await has(ui, /agent\s+context\s+budget/)
    await has(ui, /◆ prime/)
    await ui.press({ key: 'plan-toggle' })
    await ui.press({ key: 'tab-memory' })
    await has(ui, /9 notes · 7\/7 summaries/)
    await has(ui, /T2 BLOCKED on Q-1/)
    await has(ui, /rulings/)
    await ui.press({ key: 'tab-work' })
    await ui.unmount()
  }
})

test('with no _orch every tab draws, and nothing throws', async ($, on) => {
  world(on, { orch: false })
  await $.command.run({ command: 'baton', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { bodyRows: 10 } } as any })
  await has(ui, /◆ prime/)
  await ui.press({ key: 'tab-memory' })
  await has(ui, /rulings/)
})

test('claude -p (no surface): /baton prints every tab as text', async ($, on) => {
  world(on, { surfaces: [] })
  const r: any = await $.command.run({ command: 'baton', args: '' } as any)
  expect(r.text).toContain('baton run build-20261002T120000Z')
  expect(r.text).toContain('## Work')
  expect(r.text).toContain('## Memory')
  expect(r.text).not.toContain('## Plan')
  expect(r.text).not.toContain('## Ledger')
})

test('the band shows the context gauge and rotations during a run, and nothing otherwise', async ($, on) => {
  world(on)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any) // reads the manifest: the run is active
  await $.session.measure({ context: { tokens: 120000, window: 1000000, percent: 12 }, rateLimits: [], changed: ['context'] } as any)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'baton', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} } as any })
    const g = await ui.find({ type: 'Text', text: /^baton ▕/ })
    expect(g?.text).toMatch(/^baton ▕.*▏ 12% · rotate at 35% · rotations 0/)
    expect(g?.props.color).toBe('green')
    await ui.unmount()
  }
})

test('no run: the band and the spinner are left alone', async ($, on) => {
  world(on, { orch: false })
  await $.tool.call({ tool: 'Read', file_path: 'x' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} } as any })
  expect(await ui.find({ type: 'Text', text: /^baton ▕/ })).toBeUndefined()
})

test('the spinner carries the phase and the node the prime dispatched', async ($, on) => {
  world(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 's1' }))
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  await $.agent.spawn({ prompt: 'p', description: 'P2 phase', subagentType: 'baton:sub-orchestrator' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Spinner', props: { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' } as any })
  expect((await ui.find({ type: 'Text', text: /^engine/ }))?.text).toBe('engine " · baton · P2 · P2 phase…"')
})

test('/baton start writes a prime manifest, refuses a second run, and /baton stop closes it', async ($, on) => {
  const written: Record<string, string> = {}
  on('fs.read', (_$: any, e: any) => {
    const k = Object.keys(written).find((p) => e.path.endsWith(p))
    return k ? { value: written[k] } : { deny: 'ENOENT' }
  })
  on('fs.write', (_$: any, e: any) => {
    written[e.path] = e.text
    return { value: undefined }
  })
  on('fs.exists', () => ({ value: true }))
  on('ui.log', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: [] }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: '', truncated: false, merges: [] }), stderr: '' } }))
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  const bad: any = await $.command.run({ command: 'baton', args: 'start NOPE x' } as any)
  expect(bad.text).toContain('usage: /baton start <MODE> <TARGET>')
  const r: any = await $.command.run({ command: 'baton', args: 'start BUILD ./app the parser' } as any)
  expect(r.text).toContain('started (MODE BUILD, TARGET ./app the parser)')
  expect(r.text).toContain('You are the PRIME orchestrator') // headless: the kickoff rides in the text
  const mf = () => written[Object.keys(written).find((p) => p.endsWith('_orch/manifest.json'))!]
  const m = JSON.parse(mf())
  expect(m).toMatchObject({ mode: 'BUILD', target: './app the parser', prime: true, models: { frontier: 'claude-opus-5-5', cheap: 'claude-sonnet-5-5' } })
  expect(m.run_id).toMatch(/^build-\d{8}T\d{6}Z$/)
  expect(m.baton_base).toBeDefined()
  const denied: any = await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  expect(denied.deny).toContain('is not a prime tool')
  const again: any = await $.command.run({ command: 'baton', args: 'start TEST ./b' } as any)
  expect(again.text).toContain('already active')
  const stop: any = await $.command.run({ command: 'baton', args: 'stop' } as any)
  expect(stop.text).toContain('closed')
  expect(JSON.parse(mf()).closed).toBe(true)
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' } as any)) as any).result).toBe('ran')
})
