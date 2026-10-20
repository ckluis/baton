// claude plugin test — the command gate, the phase gate, enforced rulings, the agent tree.
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })
const SID = 'e2f1a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b' // amended by verifier (XT17): fixture: this session's id, which the manifest records as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
const MEMBER = () => JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true, prime_session: { id: SID, heartbeat_at: new Date().toISOString() } }) // amended by verifier (XT17): the manifest records the prime's session id, this session's (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)

function world(on: any, opts: { answers?: any[]; surfaces?: string[]; rulings?: any[]; member?: boolean } = {}) { // amended by verifier (XT17): member: the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const asked: { q: string; options: string[] }[] = []
  const notes: { tag: string; text: string }[] = []
  const answers = [...(opts.answers ?? [])]
  const manifest = opts.member ? MEMBER() : ACTIVE // amended by verifier (XT17): the run's own session reads a manifest naming it (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: manifest } : { deny: 'ENOENT' })) // amended by verifier (XT17): the manifest chosen above (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['terminal'] }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv.includes('note')) {
      notes.push({ tag: argv[argv.indexOf('--tag') + 1], text: e.init?.stdin })
      return { value: { exitCode: 0, stdout: JSON.stringify({ index: notes.length - 1, text: '', truncated: false, merges: [] }), stderr: '' } }
    }
    if (argv.includes('recall')) return { value: { exitCode: 0, stdout: JSON.stringify({ pattern: '.', total: 0, notes: opts.rulings ?? [], blocks: [] }), stderr: '' } }
    return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }))
  on('turn.complete', () => ({ text: '' }))
  // $.ui.ask is a tool.call of AskUserQuestion; answer it as the dialog would
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options = q.options.map((o: any) => o.label)
    asked.push({ q: q.question, options })
    const a = answers.shift()
    if (a === undefined) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [q.question]: typeof a === 'function' ? a(options) : a } } }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  return { asked, notes }
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

async function tree($: any) {
  await $.agent.spawn({ prompt: 's1', description: 'P3', subagentType: 'baton:sub-orchestrator' } as any)
  await $.agent.spawn({ prompt: 'w1', description: 'T7', subagentType: 'baton:worker-cheap', parentAgentId: 's1' } as any)
}

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a worker two levels down asks before git push; Approve runs it and notes the approval', async ($, on) => {
  const w = world(on, { member: true, answers: ['Approve'] }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  w.notes.length = 0 // amended by verifier (XT17): forget the start's pick-up note, so the test counts from its own first call (spec L91-94, L97, Q-7, Q-80; R-C7-01, R-C7-02, R-C7-04, R-C7-10)
  await tree($)
  const r: any = await $.tool.call({ tool: 'Bash', command: 'git push origin v7', agentId: 'w1' } as any)
  expect(r.result).toBe('ran')
  // the worker never sees the dialog, so its result says the operator approved
  expect(r.context).toContain('baton: the operator approved this "git push" command before it ran.')
  expect(w.asked[0]!.q).toContain('prime › P3 › T7 wants to git push') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(w.notes.at(-1)!.tag).toBe('approval')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a typed answer refuses with that reason; approve-for-run skips later asks of the same gate', async ($, on) => {
  const w = world(on, { member: true, answers: ['use a branch, not main', (o: string[]) => o[1]] }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await tree($)
  const no: any = await $.tool.call({ tool: 'Bash', command: 'git push origin main', agentId: 'w1' } as any)
  expect(no.deny).toContain('use a branch, not main')
  const first: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf build', agentId: 'w1' } as any)
  expect(first.context.some((l: string) => /approved this .* for the rest of the run\.$/.test(l))).toBe(true)
  const again: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf dist', agentId: 'w1' } as any)
  // a discarding command runs after a checkpoint; the restore line rides in the context, not the result
  expect(again.result).toBe('ran')
  expect(again.context.some((l: string) => /^baton checkpoint \S+ taken first: \/baton restore /.test(l))).toBe(true)
  expect(w.asked).toHaveLength(2)
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: nobody to ask (claude -p): a gated command is refused, an ordinary one is not', async ($, on) => {
  world(on, { member: true, surfaces: [] }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await tree($)
  expect(((await $.tool.call({ tool: 'Bash', command: 'gh pr merge 41', agentId: 'w1' } as any)) as any).deny).toContain('nobody can be asked')
  expect(((await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'w1' } as any)) as any).result).toBe('ran')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: a sub-orchestrator reporting DONE holds the next dispatch until the operator answers', async ($, on) => {
  const w = world(on, { member: true, answers: ['the criteria are vacuous'] }) // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await tree($)
  await $.turn.complete({ agentId: 's1', answer: 'P3 DONE+CONFIRMED 4/4', durationMs: 1, isAborted: false, turnId: 'x', reason: 'answer' } as any)
  const r: any = await $.tool.call({ tool: 'Agent', prompt: 'P4', description: 'P4' } as any)
  expect(r.deny).toContain('sent back P3 — "the criteria are vacuous"')
  expect(w.asked[0]!.q).toContain('P3 reports:') // amended by verifier (XT11): type-only fix for tsc -p mod, no expectation changed (inbox/Q-9.answer.md; R-C1-06)
  expect(((await $.tool.call({ tool: 'Agent', prompt: 'P3b', description: 'P3' } as any)) as any).result).toBe('ran')
})

// amended by verifier (XT17): renamed guard: — it passes at da5910c with the XT17 amendment applied (work/red.txt da5910c: run, 46/46 pass), so it is a preservation guard, exempt from red (C7, spec L91-97; /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md)
test('guard: an enforced ruling refuses a matching command at tool.check; others keep their decision', async ($, on) => {
  world(on, {
    member: true, // amended by verifier (XT17): the manifest names this session as prime_session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
    rulings: [
      { index: 0, ts: '2026-10-04T00:00:00Z', tag: 'ruling', text: 'never push to main' },
      { index: 1, ts: '2026-10-04T00:00:00Z', tag: 'enforce', text: 'enforce #0 /git push.*\\bmain\\b/' },
    ],
  })
  member(on) // amended by verifier (XT17): the run's own session (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  await begin($) // amended by verifier (XT17): started in the run directory before its first call (spec L91-94, Q-7; R-C7-01, R-C7-02, R-C7-04)
  const r: any = await $.tool.check({ tool: 'Bash', input: { command: 'git push origin main' } } as any)
  expect(r).toEqual({ decision: 'deny', reason: 'baton ruling #0 (enforced): never push to main' })
  expect(((await $.tool.check({ tool: 'Bash', input: { command: 'git push origin v7' } } as any)) as any).decision).toBe('allow')
})
