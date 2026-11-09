// claude plugin test — FX1: every gating tool.call hook fails closed when it throws, whichever
// `.catch` the engine asks (R-C2-03, R-C2-04, R-C2-05, R-C2-10).
//
// Written before the fix (the red step). Authored from the spec, never from the code:
//   spec L38-39 (docs/designs/v7.6-tuning.md): "**Fail closed** where a failure must not open a door:
//                the prime guard, the command gate, forbidden files and pause."
//   spec L40-41: "**Fail open** where a failure must not block your work: notes, the band, usage
//                and the code index."
//   spec L43:    "Acceptance: every gating hook has a `.catch` matching its decision, and one test
//                per class proves the failure path."
//
// The gap (P3, V1's probe): under engine 2.1.316 a throw in any of baton's tool.call hooks is
// answered by the `.catch` of baton's FIRST tool.call registration only, and that one lets a
// subagent's call through. So each test below makes a hook that is NOT the first tool.call
// registration throw inside its own body, on a worker's call (agentId set), with a natural fault
// (no product code is changed to make it throw): a command no string operation accepts (as
// tests/t2-catch.test.ts's BAD) makes a Bash hook throw when it reads the command. A plugin above
// baton answers tool.check, as a permission layer would, so the call reaches tool.call. Which
// gate reads the command is set by the world: the pause hook reads it only while paused, the
// command gate only during a run, the forbidden-file hook run or no run.
import { expect, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) a test runs 6-10x slower than alone, and tests in the last files left at the default
// timed out under that load (_orch/nodes/XTFL1/work/repro.md, cause.md, proof.md), so every test in this file gets an
// explicit budget. No step or assertion is changed by it.
const LOADED = { timeoutMs: 60000 }

// An active prime run ("during a run").
const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

// A value no string operation accepts: JSON keeps it as a plain object whose toString and valueOf
// are not functions, so String(BAD) throws a TypeError in the hook that reads it.
const BAD = { toString: 1, valueOf: 1 }

// Answers tool.check above baton, so a call whose command no string accepts still reaches tool.call.
const PERMIT = {
  name: 'permit',
  tier: 'prepend' as const,
  register(on: any) {
    on('tool.check', () => ({ decision: 'allow' }))
  },
}

type World = { noRun?: boolean }

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

// The world beneath the plugins: the run's files, the memo CLI, the dialog, the log, and a bottom
// for each call that records what actually ran.
function world(on: any, o: World = {}) {
  const ran: string[] = []
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') && !o.noRun ? { value: ACTIVE } : { deny: 'ENOENT' }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    if (argv.includes('note')) return { value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: '', truncated: false, merges: [] }), stderr: '' } }
    if (argv.includes('recall')) return { value: { exitCode: 0, stdout: JSON.stringify({ pattern: '.', total: 0, notes: [], blocks: [] }), stderr: '' } }
    return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.check', () => ({ decision: 'allow' }))
  // $.ui.ask is a tool.call of AskUserQuestion: nobody answers (dismissed)
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'AskUserQuestion') return { deny: 'dismissed' }
    ran.push(e.tool + ': ' + show(e.command ?? e.description ?? e.query ?? ''))
    return { result: 'ran' }
  })
  return { ran }
}

/** One tool call; a rejection is returned as its message instead of thrown. */
async function call($: any, input: any) {
  try {
    return { r: await $.tool.call(input), thrown: null as string | null }
  } catch (err: any) {
    return { r: undefined as any, thrown: String(err && err.message) }
  }
}

// ------------------------------------------------------------------ fail closed, a worker's call

// Requirement: R-C2-03, R-C2-10.
// Pins: spec L38 "**Fail closed** where a failure must not open a door: the prime guard, the command
// gate, ..." During a run, not paused: the command gate (not baton's first tool.call registration)
// throws inside its own body, reading a worker's command it cannot tell is gated or not.
test("fx1 R-C2-03: during a run the command gate throwing on a worker's command refuses it; nothing runs", { ...LOADED, plugins: [PERMIT] }, async ($, on) => {
  const w = world(on)
  const { r, thrown } = await call($, { tool: 'Bash', command: BAD, agentId: 'w1' })
  expect(thrown).toBeNull()
  // spec L38: fail closed — the call is refused, by the gate's own failure
  expect(String(r && r.deny)).toContain('the command gate failed')
  // refused, so nothing reached the tool
  expect(w.ran.filter((x) => x.startsWith('Bash'))).toEqual([])
})

// Requirement: R-C2-04, R-C2-10.
// Pins: spec L39 "... forbidden files and pause." No run (the forbidden-file check holds run or no
// run): the forbidden-file hook (not baton's first tool.call registration) throws inside its own
// body, reading a worker's command it cannot tell adds a secret file or not.
test("fx1 R-C2-04: the forbidden-file hook throwing on a worker's command refuses it; nothing runs", { ...LOADED, plugins: [PERMIT] }, async ($, on) => {
  const w = world(on, { noRun: true })
  const { r, thrown } = await call($, { tool: 'Bash', command: BAD, agentId: 'w1' })
  expect(thrown).toBeNull()
  // spec L39: fail closed — refused, by the forbidden-file check's own failure
  expect(String(r && r.deny)).toContain('the forbidden-file check failed')
  expect(w.ran.filter((x) => x.startsWith('Bash'))).toEqual([])
})

// Requirement: R-C2-05, R-C2-10.
// Pins: spec L39 "... and pause." The run is paused (/baton pause): the pause hook (not baton's first
// tool.call registration) throws inside its own body, reading a worker's command it cannot tell is
// gated or not. A door that cannot tell is shut.
test("fx1 R-C2-05: while paused the pause hook throwing on a worker's command refuses it; nothing runs", { ...LOADED, plugins: [PERMIT] }, async ($, on) => {
  const w = world(on)
  await $.command.run({ command: 'baton', args: 'pause' } as any)
  const { r, thrown } = await call($, { tool: 'Bash', command: BAD, agentId: 'w1' })
  expect(thrown).toBeNull()
  // spec L39: fail closed — refused, by the pause check's own failure
  expect(String(r && r.deny)).toContain('the pause check failed')
  expect(w.ran.filter((x) => x.startsWith('Bash'))).toEqual([])
})

// ------------------------------------------------------------------ fail closed, the prime's call

// Requirement: R-C2-10.
// Pins: spec L38 "**Fail closed** ...: the prime guard, ..." The prime guard throws inside its own
// body (it cannot read the dispatch's description) on the prime's very first call of a run.
test("fx1 R-C2-10: the prime guard throwing on the prime's first call during a run refuses it", LOADED, async ($, on) => {
  const w = world(on)
  const { r, thrown } = await call($, { tool: 'Agent', prompt: 'p', description: BAD })
  expect(thrown).toBeNull()
  expect(String(r && r.deny)).toContain('the prime guard failed')
  expect(w.ran.filter((x) => x.startsWith('Agent'))).toEqual([])
})

// ------------------------------------------------------------------ fail open, a worker's call

// Requirement: R-C2-10.
// Pins: spec L40 "**Fail open** where a failure must not block your work: ... and the code index";
// spec L43 "every gating hook has a `.catch` matching its decision". The code-index tool throws
// inside its own body (it cannot read the query): it is not denied, and it answers that it failed,
// so the worker carries on without it.
test("fx1 R-C2-10: the code index throwing on a worker's search is not refused; it answers that it failed", LOADED, async ($, on) => {
  const w = world(on)
  const { r, thrown } = await call($, { tool: 'mcp__baton__code_search', query: BAD, agentId: 'w1' })
  // spec L40: a failure must not block your work — not denied by baton
  expect(thrown).toBeNull()
  expect(r && r.deny).toBeUndefined()
  // spec L43: the code index's own fail-open answer, not the call slipping beneath unanswered
  expect(String(r && r.result)).toContain('failed')
  expect(w.ran).toEqual([])
})
