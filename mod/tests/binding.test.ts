// claude plugin test — agent.spawn binds each role's model during a run.
import { expect, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) a test runs 6-10x slower than alone; the tests here take up to 0.5 s alone, at risk
// of the default under that load (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an
// explicit budget. No step or assertion is changed by it.
const LOADED = { timeoutMs: 60000 }

const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

function world(on: any, active: boolean, isMember = false) { // amended by verifier (XT17): isMember: the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const spawned: any[] = []
  on('fs.read', (_$: any, e: any) =>
    active && e.path.endsWith('_orch/manifest.json') ? { value: JSON.stringify(isMember ? { run_id: 'r', prime: true, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } } : { run_id: 'r', prime: true }) } : { deny: 'ENOENT' }, // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  )
  on('ui.log', () => ({ value: undefined }))
  on('agent.spawn', (_$: any, e: any) => {
    spawned.push(e)
    return { model: e.model ?? 'inherited', agentId: 'a' + spawned.length }
  })
  return spawned
}

/** The run's own session: its id, its directory, and what session.start and SessionStart need beneath the mod. */ // amended by verifier (XT17): membership is recorded at session.start and keyed to session.id (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
function member(on: any) { // amended by verifier (XT17): a session.id mock, a manifest write sink and a session.start in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.id', () => ({ value: SID })) // amended by verifier (XT17): membership is keyed to $.session.id() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.cwd', () => ({ value: '/work' })) // amended by verifier (XT17): the run's directory, where the session starts (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.root', () => ({ value: '/work' })) // amended by verifier (XT17): the run's directory, where the session starts (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd })) // amended by verifier (XT17): session.start records membership (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('classic.SessionStart', () => ({})) // amended by verifier (XT17): the startup SessionStart that follows session.start (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } })) // amended by verifier (XT17): what session.start reads beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } })) // amended by verifier (XT17): what session.start registers beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('command.register', () => ({ value: undefined })) // amended by verifier (XT17): what session.start registers beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('ui.invalidate', () => ({ value: undefined })) // amended by verifier (XT17): what session.start's tickers call beneath the mod (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('process.run', () => ({ value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: '', truncated: false, merges: [] }), stderr: '' } })) // amended by verifier (XT17): the memo CLI, for the start's pick-up note (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('fs.write', () => ({ value: undefined })) // amended by verifier (XT17): a sink for the manifest's prime_session writes (Q-7) (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
} // amended by verifier (XT17): end of member() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

/** The engine starting this session in the run's directory (/work): session.start, then the startup SessionStart. */ // amended by verifier (XT17): membership is recorded at session.start, never re-derived from the current directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
async function begin($: any) { // amended by verifier (XT17): the session starts in the run's directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.session.start({ cwd: '/work', surface: null, isInteractive: false } as any) // amended by verifier (XT17): session.start in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.classic.SessionStart({ source: 'startup', cwd: '/work' } as any) // amended by verifier (XT17): the startup SessionStart in the run directory (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
} // amended by verifier (XT17): end of begin() (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: during a run: roles run on Opus 5.5, -cheap on Sonnet 5.5, whatever was asked', LOADED, async ($, on) => {
  const spawned = world(on, true, true) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await $.agent.spawn({ prompt: 'p', subagentType: 'baton:sub-orchestrator', model: 'haiku' } as any)
  await $.agent.spawn({ prompt: 'p', subagentType: 'baton:verifier' } as any)
  await $.agent.spawn({ prompt: 'p', subagentType: 'baton:worker-cheap', model: 'opus' } as any)
  await $.agent.spawn({ prompt: 'p', subagentType: 'general-purpose', name: 'grep-cheap' } as any)
  expect(spawned.map((s) => s.model)).toEqual(['claude-opus-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'])
})

test('outside a run the spawn is untouched', LOADED, async ($, on) => {
  const spawned = world(on, false)
  await $.agent.spawn({ prompt: 'p', subagentType: 'Explore', model: 'haiku' } as any)
  expect(spawned[0].model).toBe('haiku')
})
