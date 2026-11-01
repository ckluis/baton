// claude plugin test — rotation: measure → handoff note → compact → wake.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 'build-1', mode: 'BUILD', target: '.', prime: true })
const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
const MEMBER = () => JSON.stringify({ run_id: 'build-1', mode: 'BUILD', target: '.', prime: true, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } }) // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)

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

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: crossing rotateAtPercent during a run: handoff note, then a compaction with baton instructions', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  startable(on, []) // amended by verifier (XT17): what session.start needs beneath the mod, headless as before (no surface) (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  w.notes.length = 0 // amended by verifier (XT17): forget the start's pick-up note, so the test counts from its own first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
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

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: rotateAtPercent comes from userConfig', { options: { rotateAtPercent: 60 } }, async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  startable(on, []) // amended by verifier (XT17): what session.start needs beneath the mod, headless as before (no surface) (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
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

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: after a rotation the compact SessionStart tells the prime to call memory_wake, once', async ($, on) => {
  const w = world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  startable(on, []) // amended by verifier (XT17): what session.start needs beneath the mod; it also mocks classic.SessionStart, which this test mocked itself before (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [MSG] } as any)
  const r: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(r.additionalContext.join(' ')).toContain('mcp__baton__memory_wake')
  expect(r.additionalContext.join(' ')).toContain('rotation #1')
  const again: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(again.additionalContext ?? []).toHaveLength(0)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: if no SessionStart carried the wake, the prime\'s next tool call does', async ($, on) => {
  world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  startable(on, []) // amended by verifier (XT17): what session.start needs beneath the mod, headless as before (no surface) (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.compact({ trigger: 'manual', instructions: 'x', messages: [MSG] } as any)
  const r: any = await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  expect((r.context ?? []).join(' ')).toContain('memory_wake')
  const r2: any = await $.tool.call({ tool: 'Agent', prompt: 'p', description: 'd' } as any)
  expect(r2.context ?? []).toHaveLength(0)
})

function startable(on: any, surfaces: string[]) {
  on('session.version', () => ({ value: { version: '2.1.287', base: '2.1.287' } }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('command.run', () => ({ text: 'core' }))
  on('classic.SessionStart', () => ({}))
}

/** The run's own session: its id, and a sink for the manifest writes (startable() mocks the rest of session.start). */ // amended by verifier (XT17): membership is recorded at session.start and keyed to session.id (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
function member(on: any) { // amended by verifier (XT17): a session.id mock and a manifest write sink (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  on('session.id', () => ({ value: SID })) // amended by verifier (XT17): membership is keyed to $.session.id() (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  on('fs.write', () => ({ value: undefined })) // amended by verifier (XT17): a sink for the manifest's prime_session writes (Q-7) (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
} // amended by verifier (XT17): end of member() (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)

/** The engine starting this session in the run's directory (/work): session.start, then the startup SessionStart. */ // amended by verifier (XT17): membership is recorded at session.start, never re-derived from the current directory (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
async function begin($: any) { // amended by verifier (XT17): the session starts in the run's directory before its first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false } as any) // amended by verifier (XT17): session.start in the run directory (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart in the run directory (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
} // amended by verifier (XT17): end of begin() (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: /baton rotate, interactive: handoff note, then the session.start ticker compacts once the command returns', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  startable(on, ['terminal'])
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.start({ cwd: '/work', surface: 'terminal' } as any)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart that follows session.start in the run directory (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  w.notes.length = 0 // amended by verifier (XT17): forget the start's pick-up note, so the test counts from its own first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('compacting as soon as this command returns (rotation #1)')
  expect(w.notes.at(-1)!.tag).toBe('handoff')
  await clock.advance(400)
  await clock.settle()
  expect(w.compacts).toHaveLength(1)
  expect(w.compacts[0].instructions).toContain('baton prime rotation')
  const s: any = await $.command.run({ command: 'baton', args: 'status' } as any)
  expect(s.text).toContain('rotations 1')
  const wake: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(wake.additionalContext.join(' ')).toContain('mcp__baton__memory_wake')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: /baton rotate, headless: handoff note and the wake armed; the /compact the driver sends is the rotation', async ($, on) => {
  const w = world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  startable(on, [])
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.start({ cwd: '/work', surface: null } as any)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart that follows session.start in the run directory (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  w.notes.length = 0 // amended by verifier (XT17): forget the start's pick-up note, so the test counts from its own first call (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('send /compact next')
  expect(w.notes.at(-1)!.tag).toBe('handoff')
  const notes = w.notes.length
  await $.session.compact({ trigger: 'manual', instructions: '', messages: [MSG] } as any)
  expect(w.notes.length).toBe(notes) // the handoff is the note; no second one
  const s: any = await $.command.run({ command: 'baton', args: 'status' } as any)
  expect(s.text).toContain('rotations 1')
  expect(s.text).toContain('baton rotate + /compact')
  const wake: any = await $.classic.SessionStart({ source: 'compact' } as any)
  expect(wake.additionalContext.join(' ')).toContain('mcp__baton__memory_wake')
})

test('/baton rotate outside a run says so', async ($, on) => {
  world(on, null)
  on('command.run', () => ({ text: 'core' }))
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('no baton run is active')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: BATON_AUTOROTATE=0: the threshold never rotates, /baton rotate still does', async ($, on) => {
  const clock = mock.clock(on)
  const env: Record<string, string> = { BATON_AUTOROTATE: '0' } // verifier r4 (P3-d4): kept, so the premise check below can lift it
  on('env.get', (_$: any, e: any) => ({ value: env[e.name] })) // verifier r4 (P3-d4): read live (mock.env keeps its own copy)
  const w = world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  startable(on, ['terminal'])
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.start({ cwd: '/work', surface: null } as any)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart that follows session.start in the run directory (spec L91-94, L96, Q-7; R-C7-01, R-C7-02, R-C7-04, R-C7-09)
  await $.session.measure(measure(20) as any)
  await $.session.measure(measure(95) as any)
  await clock.advance(5000)
  expect(w.compacts).toHaveLength(0)
  const s: any = await $.command.run({ command: 'baton', args: 'status' } as any)
  expect(s.text).toContain('auto-rotation off')
  expect(s.text, 'verifier r3 (P3-d3): premise, the measured 95% crossed the threshold').toContain('context 95%')
  const r: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(r.text).toContain('rotation #1')
  await clock.advance(400)
  await clock.settle()
  expect(w.compacts).toHaveLength(1)
  // verifier r4 (P3-d4): the premise, that the measured threshold rotates in this world: with BATON_AUTOROTATE lifted,
  // the same crossing compacts, so "never rotates" above is the variable's doing, not a dead threshold
  env.BATON_AUTOROTATE = '1'
  await $.session.start({ cwd: '/work', surface: null } as any)
  await $.session.measure(measure(20) as any)
  await $.session.measure(measure(95) as any)
  await clock.advance(5000)
  await clock.settle()
  expect(w.compacts, 'verifier r4 (P3-d4): premise, the threshold rotates once BATON_AUTOROTATE is lifted').toHaveLength(2)
})
