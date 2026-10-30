// claude plugin test — the prime guard, through the hooks module.
// A test's $.tool.call always runs in the main loop (agentId is dropped), so
// these are prime calls; the subagent side is covered by test/guard.test.mjs.
import { expect, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })
const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
const MEMBER = () => JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } }) // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

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

function world(on: any, manifest: string | null) {
  on('fs.read', (_$: any, e: any) =>
    e.path.endsWith('_orch/manifest.json')
      ? manifest === null
        ? { deny: 'ENOENT: no such file' }
        : { value: manifest }
      : { deny: 'ENOENT' },
  )
  on('ui.log', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('process.run', (_$: any, e: any) => { // amended by verifier (XT114): the memo stub now tells the store's mark-record reads from its other calls (C15, spec L413-414, L418, L507, Q-74, Q-86; R-C15-05, R-C15-15, R-C15-116)
    const argv: string[] = [...(e?.argv ?? [])] // amended by verifier (XT114): the call's argv, to find its command (C15, spec L413-414, Q-74; R-C15-05)
    if (argv.includes('marks') || argv.includes('superseded')) return { value: { exitCode: 0, stdout: argv.includes('--json') ? '[]' : 'none', stderr: '' } } // amended by verifier (XT114): no mark and no superseded summary: every note is unmarked, the default, so memory_wake and project_wake skip nothing (C15, spec L413-414, L418, L423, L507, Q-74, Q-84, Q-86; R-C15-05, R-C15-15, R-C15-107, R-C15-116)
    return { value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: 'x', truncated: false, merges: [] }), stderr: '' } } // amended by verifier (XT114): every other memo call answers as before (C15; R-C15-05)
  }) // amended by verifier (XT114): end of the memo stub (C15; R-C15-05)
  on('tool.call', () => ({ result: 'ran' }))
}

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: during a run the prime is denied every reading, running and editing tool, with the route', async ($, on) => {
  world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory, so the guard is armed by membership, not the manifest alone (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  for (const tool of ['Read', 'Grep', 'Glob', 'Bash', 'Edit', 'Write', 'WebFetch', 'NotebookEdit', 'Skill', 'mcp__other__read']) {
    const r: any = await $.tool.call({ tool, file_path: 'src/a.ts', command: 'ls', pattern: 'x' } as any)
    expect(r.deny, tool).toMatch(/dispatch a sub-orchestrator/)
    expect(r.deny).toContain('baton:sub-orchestrator')
  }
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: during a run the prime keeps Agent, AskUserQuestion, SendMessage, ToolSearch and the memory tools', async ($, on) => {
  world(on, MEMBER()) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory, so the guard is armed by membership, not the manifest alone (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  for (const tool of ['Agent', 'AskUserQuestion', 'SendMessage', 'ToolSearch', 'mcp__baton__memory_wake', 'mcp__baton__memory_note', 'mcp__baton__project_wake']) {
    const r: any = await $.tool.call({ tool, text: 'x', pattern: 'x', range: '0-1' } as any)
    expect(r.deny, tool).toBeUndefined()
    expect(String(r.result), tool).not.toContain('error')
  }
  // GV4 (P3-d3): the premise, "during a run": the same session's guard is armed, so a reading tool is refused
  const read: any = await $.tool.call({ tool: 'Read', file_path: 'src/a.ts' } as any)
  expect(read.deny, 'premise: the guard is armed in this session').toMatch(/dispatch a sub-orchestrator/)
})

test('with no run the guard is invisible', async ($, on) => {
  world(on, null)
  const r: any = await $.tool.call({ tool: 'Read', file_path: 'README.md' })
  expect(r.result).toBe('ran')
})

test('a manifest without "prime": true, or a closed run, does not arm the guard', async ($, on) => {
  world(on, JSON.stringify({ run_id: 'v5-run', mode: 'BUILD' }))
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' })) as any).result).toBe('ran')
})

test('a closed prime run does not arm the guard', async ($, on) => {
  world(on, JSON.stringify({ run_id: 'x', prime: true, closed: true }))
  expect(((await $.tool.call({ tool: 'Bash', command: 'ls' })) as any).result).toBe('ran')
})

test('a malformed manifest does not arm the guard', async ($, on) => {
  world(on, '{ prime: true,')
  expect(((await $.tool.call({ tool: 'Read', file_path: 'x' })) as any).result).toBe('ran')
})
