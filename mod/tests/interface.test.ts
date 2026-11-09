// claude plugin test — the /baton pane, the gauge band, the spinner, the -p text.
import { expect, mock, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }

const MANIFEST = { run_id: 'build-20261002T120000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P2' }
const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

async function has(ui: any, re: RegExp) {
  if (!(await ui.find({ text: re }))) throw new Error('not drawn: ' + re + ' in ' + JSON.stringify(await ui.drawn()).slice(0, 2000))
}

function world(on: any, opts: { orch?: boolean; surfaces?: string[]; placed?: boolean; member?: boolean } = {}) { // amended by verifier (XT17): member: the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const orch = opts.orch ?? true
  const files: Record<string, string> = orch
    ? {
        '_orch/manifest.json': JSON.stringify(opts.member ? { ...MANIFEST, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } } : MANIFEST), // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
        '_orch/phases/P1/envelope.json': JSON.stringify({ verdict: 'DONE', summary: 'bootstrap and plan' }),
        '_orch/nodes/T1/status.json': JSON.stringify({ verdict: 'DONE' }),
        '_orch/nodes/T2/status.json': JSON.stringify({ verdict: 'BLOCKED' }),
        '_orch/ledger/20261002T120500Z-T1-1.csv': 'ts,node,rung,model,effort,attempt,verdict,seconds,note\n2026-10-02T12:05:00Z,T1,1,claude-opus-5-5,medium,1,DONE,300,"wrote the parser, 4/4"\n',
      }
    : {}
  const dirs: Record<string, any[]> = orch
    ? {
        // amended by verifier (XT11): directories are listed as the declared kind 'dir', index.d.ts:5093 `kind: 'file' | 'dir' | 'other'` (mismatches S0489, S0494; R-C1-05, R-C1-06)
        '_orch/phases': [{ name: 'P1', kind: 'dir' }, { name: 'P2', kind: 'dir' }],
        '_orch/nodes': [{ name: 'T1', kind: 'dir' }, { name: 'T2', kind: 'dir' }, { name: 'T3', kind: 'dir' }],
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
  const clock = mock.clock(on)
  // Beneath the plugins, the engine's own drawing: one Text carrying the props it was handed.
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.props.suffix ?? e.component)] })
  })
  const logs: string[] = []
  on('ui.log', (_$: any, e: any) => { logs.push(String(e.text ?? '')); return { value: undefined } })
  const opens: any[] = []
  on('ui.open', (_$: any, e: any) => { opens.push(e); return { value: { isPlaced: opts.placed ?? true } } })
  on('ui.panes', () => ({ value: [{ id: 'baton', title: 'baton', isShown: false, isFocused: false, isPlaced: opts.placed ?? true }] }))
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
  return { clock, logs, opens }
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

// amended by verifier (XT11): renamed guard: — its world() fixture now lists directories as the declared kind 'dir' (S0489, S0494; R-C1-05, R-C1-06) and it passes at da5910c, so it is a preservation guard (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: /baton opens the pane; Work and Memory draw on terminal and desktop', LOADED, async ($, on) => {
  const { opens } = world(on) // GV4 sweep (P3-d4): the panes the command opens
  const r: any = await $.command.run({ command: 'baton', args: '' } as any)
  expect(r.text ?? '').toBe('')
  expect(opens.some((o: any) => o.id === 'baton' && o.focus === true), 'premise: /baton opened the pane, focused').toBe(true) // GV4 sweep (P3-d4): the test mounts the Pane itself, so without this "opens" held by default
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'baton', surface, component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 140, placement: 'dock', scroll: { bodyRows: 30 } } as any })
    await has(ui, /agent\s+context\s+(?:\S+\s+)*?budget/) // amended by verifier (XT110): the column-name line keeps agent, context, budget in that order, whatever column cells (the `this agent` and `roll-up` groups) sit between context and budget; stays a guard: (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md) (spec L341-347, Q-57, D-T10R-group-columns; R-C10-64, R-C10-65, R-C10-66)
    await has(ui, /◆ prime/)
    let pKey: string | null = null // amended by verifier (XT110): the plan heading and its `plan-toggle` button go (spec L257, L330), so `p` is found by its hotkey, not by that key; stays a guard: (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md) (spec L264, L336-338, Q-59; R-C10-06, R-C10-07, R-C10-15, R-C10-60)
    const findP = (n: any): void => { if (Array.isArray(n)) return n.forEach(findP); if (!n || typeof n !== 'object') return; if (!pKey && n.props && n.props.hotkey === 'p') pKey = n.props.key; for (const c of n.children ?? []) findP(c) } // amended by verifier (XT110): walks the drawn tree for the element whose hotkey is p (spec L264, L336-338, Q-59; R-C10-06, R-C10-07, R-C10-15, R-C10-60)
    findP(await ui.drawn()) // amended by verifier (XT110): the drawn Work tab (spec L264, L336-338, Q-59; R-C10-06, R-C10-07, R-C10-15, R-C10-60)
    if (!pKey) throw new Error('no element with hotkey p is drawn in ' + JSON.stringify(await ui.drawn()).slice(0, 2000)) // amended by verifier (XT110): p is still drawn as a key (spec L264, L336-338, Q-59; R-C10-06, R-C10-07, R-C10-15, R-C10-60)
    await ui.press({ key: pKey }) // amended by verifier (XT110): press p by its hotkey, the plan-toggle key being gone (spec L257, L264; R-C10-06, R-C10-07, R-C10-15, R-C10-60)
    await ui.press({ key: 'tab-memory' })
    await has(ui, /9 notes · 7\/7 summaries/)
    await has(ui, /T2 BLOCKED on Q-1/)
    await has(ui, /rulings/)
    await ui.press({ key: 'tab-work' })
    await ui.unmount()
  }
})

test('with no _orch every tab draws, and nothing throws', LOADED, async ($, on) => {
  world(on, { orch: false })
  await $.command.run({ command: 'baton', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { bodyRows: 10 } } as any })
  await has(ui, /^[^A-Za-z0-9]*session\b/) // amended by verifier (XT18): outside a run the main session's row is labelled `session` (spec L114-115; R-C8-06)
  expect(JSON.stringify(await ui.drawn())).not.toContain('◆ prime') // amended by verifier (XT18): outside a run no row reads `◆ prime` (spec L114-115; R-C8-06)
  await ui.press({ key: 'tab-memory' })
  await has(ui, /rulings/)
})

// amended by verifier (XT11): renamed guard: — its world() fixture now lists directories as the declared kind 'dir' (S0489, S0494; R-C1-05, R-C1-06) and it passes at da5910c, so it is a preservation guard (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: claude -p (no surface): /baton prints every tab as text', LOADED, async ($, on) => {
  world(on, { surfaces: [] })
  const r: any = await $.command.run({ command: 'baton', args: '' } as any)
  expect(r.text).toContain('baton run build-20261002T120000Z')
  expect(r.text).toContain('## Work')
  expect(r.text).toContain('## Memory')
  expect(r.text).not.toContain('## Plan')
  expect(r.text).not.toContain('## Ledger')
})

// amended by verifier (XT11): renamed guard: — its world() fixture now lists directories as the declared kind 'dir' (S0489, S0494; R-C1-05, R-C1-06) and it passes at da5910c, so it is a preservation guard (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: the band shows the context against the rotation threshold during a run', LOADED, async ($, on) => {
  world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call, so the run is active by membership, not the manifest alone (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any) // reads the manifest: the run is active
  await $.session.measure({ context: { tokens: 120000, window: 1000000, percent: 12 }, rateLimits: [], changed: ['context'] } as any)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'baton', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} } as any })
    const g = await ui.find({ type: 'Text', text: /^ctx / })
    expect(g?.text).toMatch(/^ctx .*12%\/35%$/)
    expect(g?.props.color).toBe('green')
    await ui.unmount()
  }
})

// amended by verifier (XT11): renamed guard: — its world() fixture now lists directories as the declared kind 'dir' (S0489, S0494; R-C1-05, R-C1-06) and it passes at da5910c, so it is a preservation guard (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a pane too narrow to place by itself: the band says /baton opens it, and stops once it is placed', LOADED, async ($, on) => {
  const { clock, opens } = world(on, { placed: false })
  mock.store(on, { layout: 'panel' }) // amended by verifier (CS2, D-P7-7): the panel layout, where the pane still opens by itself; the strip, the default, never auto-opens (Q-CS2-1 A)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.version', () => ({ value: { version: '2.1.302', base: '2.1.302' } }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined } as any)) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  on('classic.SessionStart', () => ({}))
  mock.env(on, {})
  await $.session.start({ cwd: '/work', surface: null } as any)
  await clock.advance(1000)
  await clock.settle()
  // opened by itself, unfocused (focus: false is refused by the engine; it must be left out)
  // amended by verifier (XTPW1): the first open also asks for the ceiling width, columns: 999 = PANE_COLUMNS in hooks/register.js, which Claude Code caps at its dock limit (PW1 "fit baton to the limit"; /Users/clank/Desktop/projects/baton/_orch/inbox/Q-PW1-1.answer.md)
  expect(opens).toEqual([{ id: 'baton', title: 'baton', closeOnEscape: true, columns: 999 }])
  const band = async () => {
    const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 86, scroll: {} } as any })
    const t = await ui.find({ type: 'Text', text: /^\/baton opens the pane$/ })
    await ui.unmount()
    return t
  }
  expect((await band())?.text).toBe('/baton opens the pane')
  await $.command.run({ command: 'baton', args: '' } as any)
  expect(await band()).toBeUndefined()
})

test('no run: the band and the spinner are left alone', LOADED, async ($, on) => {
  world(on, { orch: false })
  await $.tool.call({ tool: 'Read', file_path: 'x' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: {} } as any })
  expect(await ui.find({ type: 'Text', text: /\/35%$/ })).toBeUndefined()
})

// amended by verifier (XT11): renamed guard: — its world() fixture now lists directories as the declared kind 'dir' (S0489, S0494; R-C1-05, R-C1-06) and it passes at da5910c, so it is a preservation guard (/Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: the spinner carries the phase and the node the prime dispatched', LOADED, async ($, on) => {
  world(on, { member: true }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 's1' }))
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call, so the run is active by membership, not the manifest alone (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  await $.agent.spawn({ prompt: 'p', description: 'P2 phase', subagentType: 'baton:sub-orchestrator' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Spinner', props: { word: 'Thinking', message: null, suffix: '…', mode: 'thinking' } as any })
  expect((await ui.find({ type: 'Text', text: /^engine/ }))?.text).toBe('engine " · baton · P2 · P2 phase…"')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: /baton start writes a prime manifest, refuses a second run, and /baton stop closes it', LOADED, async ($, on) => {
  const written: Record<string, string> = {}
  on('fs.read', (_$: any, e: any) => {
    const k = Object.keys(written).find((p) => e.path.endsWith(p))
    return k ? { value: written[k]! } : { deny: 'ENOENT' } // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
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
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: '', truncated: false, merges: [] }), stderr: '' } } as any)) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('session.id', () => ({ value: SID })) // amended by verifier (XT17): /baton start records this session's id as the manifest's prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const bad: any = await $.command.run({ command: 'baton', args: 'start NOPE x' } as any)
  expect(bad.text).toContain('usage: /baton start <MODE> <TARGET>')
  const r: any = await $.command.run({ command: 'baton', args: 'start BUILD ./app the parser' } as any)
  expect(r.text).toContain('started (MODE BUILD, TARGET ./app the parser)')
  expect(r.text).toContain('You are the PRIME orchestrator') // headless: the kickoff rides in the text
  const mf = () => written[Object.keys(written).find((p) => p.endsWith('_orch/manifest.json'))!]
  const m = JSON.parse(mf()!) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(m).toMatchObject({ mode: 'BUILD', target: './app the parser', prime: true, models: { frontier: 'claude-opus-5-5', cheap: 'claude-sonnet-5-5' } })
  expect(m.run_id).toMatch(/^build-\d{8}T\d{6}Z$/)
  expect(m.baton_base).toBeDefined()
  const denied: any = await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  expect(denied.deny).toContain('is not a prime tool')
  const again: any = await $.command.run({ command: 'baton', args: 'start TEST ./b' } as any)
  expect(again.text).toContain('already active')
  const stop: any = await $.command.run({ command: 'baton', args: 'stop' } as any)
  expect(stop.text).toContain('closed')
  expect(JSON.parse(mf()!).closed).toBe(true) // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' } as any)) as any).result).toBe('ran')
})
