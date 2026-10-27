// claude plugin test — T14 (C15), part E: the membership refusal of `memory_note` (Q-80).
//
// Written from the spec (docs/designs/v7.6-tuning.md L435-436, L528-530; T7 at L84-103) and the
// operator's answer Q-80 (_orch/inbox/Q-80.answer.md, quoted in _orch/nodes/T114A/work/t14-answers.md)
// BEFORE the implementation (node T114E, the red step of F114). Requirement ids are the rows of
// _orch/plan/traceability.yaml (R-C15-26, R-C15-140..144). No test here is a guard.
//
// Q-80 (binding): "A (recommended): An error from the tool: a refused `memory_note` returns an error
// result (`refused: this session is not in run <id> (T7)`) and writes nothing. A hook that would have
// noted on its own writes nothing and logs one line to the session's log (`$.ui.log`). The run's
// memory records nothing from that session."
//
// The world (fixtures only, after T17's t7-membership.test.ts): the run lives in RUN (/proj/run, its
// _orch/manifest.json there); OUT (/proj) is outside it. A session is "not the run's own" in the two
// ways T7 names (spec L88-89, L94-95): it started in OUT and cds into RUN, or it is a second session
// started in RUN while the prime recorded in the manifest is live. Notes are memo `note` calls (the
// memo CLI is stubbed at process.run, as in memory.test.ts); nothing here reads or writes a real
// memory store (Q-85: every memory a test uses is a fixture it builds).
import { expect, mock, test } from 'claude-code/testing'

const PROJ = '/proj'
const RUN = '/proj/run' // fixture: the run's directory
const OUT = '/proj' // fixture: a directory outside the run (the live case was ~/Desktop/projects, spec L86)
const RUN_ID = 'build-20991231T000000Z' // fixture: the run's id, as the manifest's run_id
const MANIFEST_PATH = RUN + '/_orch/manifest.json'
const PRIME = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: the manifest's live prime session id
const OTHER = 'b93f2d17-8e6a-4f05-a2c4-6d7e8f901234' // fixture: the session under test, not the run's own

// Q-80 / spec L528: the refusal's words, with the run's id (fixture RUN_ID) in place of <id>.
const REFUSED = 'refused: this session is not in run ' + RUN_ID + ' (T7)'

type Opts = { start: string; interactive: boolean }

/** Every hook beneath the mod, answering from memory. */
function world(on: any, o: Opts) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const s = { cwd: o.start, id: OTHER }
  const files = new Map<string, string>()
  // fixture manifest: a prime run whose prime (PRIME) beat 30 s ago, live under Q-7's 90 s
  files.set(
    MANIFEST_PATH,
    JSON.stringify({ run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/x.md', prime: true, started_at: iso(t0 - 3600000), memory: { run: '_orch/memory' }, prime_session: { id: PRIME, heartbeat_at: iso(t0 - 30000) } }, null, 2) + '\n',
  )
  // A path under /proj is absolute; a relative one lands under the session's current directory.
  const abs = (p: string) => {
    if (p === PROJ || p.startsWith(PROJ + '/')) return p
    if (p.startsWith('_orch/')) return s.cwd + '/' + p
    const i = p.lastIndexOf('/_orch/')
    return i >= 0 ? s.cwd + p.slice(i) : p
  }
  const logs: string[] = []
  const calls: { argv: string[]; stdin?: string }[] = []
  /** Every note written anywhere (memo `note` calls), whatever its --dir. */
  const notes = () =>
    calls
      .filter((c) => c.argv.includes('note'))
      .map((c) => ({ tag: c.argv[c.argv.indexOf('--tag') + 1], dir: c.argv[c.argv.indexOf('--dir') + 1], text: c.stdin }))

  on('fs.read', (_$: any, e: any) => {
    const v = files.get(abs(e.path))
    return v === undefined ? { deny: 'ENOENT: no such file or directory' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(abs(e.path), e.text)
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => {
    const p = abs(e.path)
    return { value: files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('ui.log', (_$: any, e: any) => {
    logs.push(String(e.text ?? JSON.stringify(e)))
    return { value: undefined }
  })
  on('ui.notify', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine'] })
  })
  on('session.cwd', () => ({ value: s.cwd }))
  on('session.root', () => ({ value: o.start }))
  on('session.id', () => ({ value: s.id }))
  on('session.surfaces', () => ({ value: o.interactive ? ['terminal'] : [] }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.compact', () => ({ messages: [] }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('classic.SessionStart', () => ({}))
  on('classic.CwdChanged', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'NONE', usage: {} } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'P3 running', usage: {} } }))
  let n = 0
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    calls.push({ argv, stdin: e.init?.stdin })
    let stdout = '{}'
    if (argv.includes('note')) stdout = JSON.stringify({ index: n++, text: e.init?.stdin ?? '', truncated: false, merges: [] })
    else if (argv.includes('recall')) stdout = JSON.stringify({ pattern: '.', total: 0, notes: [], blocks: [] })
    else if (argv.includes('wake')) stdout = 'wake output'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  // A dialog (an interactive second session's question, Q-8) is dismissed: the session stays unarmed.
  on('tool.call', (_$: any, e: any) => (e.tool === 'AskUserQuestion' ? { deny: 'dismissed' } : { result: 'ran' }))
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  async function begin($: any) {
    await $.session.start({ cwd: o.start, surface: o.interactive ? 'terminal' : null, isInteractive: o.interactive } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: o.start } as any)
    await clock.advance(2000)
    await clock.settle()
  }
  /** The session's shell runs `cd dir`; the mod caches its manifest read for 1.5 s of wall time, so wait it out. */
  async function cd($: any, dir: string) {
    const old = s.cwd
    s.cwd = dir
    await $.classic.CwdChanged({ old_cwd: old, new_cwd: dir } as any)
    await later()
  }
  async function settle() {
    await clock.advance(10)
    await clock.settle()
  }
  return { logs, notes, begin, cd, settle }
}

const later = () => new Promise((r) => setTimeout(r, 1600))
const SLOW = { timeoutMs: 20000 }

/** The two sessions T7 says are not the run's own, each brought to the point where it would note. */
const OUTSIDERS: [string, Opts, boolean][] = [
  ['a session that started outside the run and cd-ed into it', { start: OUT, interactive: true }, true], // spec L86-89, L100
  ['a second session started in the run while the prime is live', { start: RUN, interactive: false }, false], // spec L94-95, L101
]

async function outsider($: any, on: any, o: Opts, cdIn: boolean) {
  const w = world(on, o)
  await w.begin($)
  if (cdIn) await w.cd($, RUN)
  return w
}

/** The text of an error result: a deny (the model receives it as an error result) or an isError result. */
function errorText(r: any): string | undefined {
  if (r && typeof r.deny === 'string') return r.deny
  if (r && r.isError === true) return String(r.text ?? r.result ?? '')
  return undefined
}

// ------------------------------------------------------------------ criterion 1: memory_note appends no note

for (const [who, o, cdIn] of OUTSIDERS) {
  // R-C15-26, R-C15-141, R-C15-144 · spec L435-436: "A note from a session outside the run is refused when it is written."
  // spec L528-529: "A refused `memory_note` returns an error result, ..., and writes nothing (Q-80)."
  // spec L530 / Q-80: "The run's memory records nothing from that session."
  test('memory_note from ' + who + ' appends no note', SLOW, async ($, on) => {
    const w = await outsider($, on, o, cdIn)
    const before = w.notes().length // what the session noted before this call is T7's (C7), not this test's
    await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'P2 parked: waits on Q-3' } as any)
    await w.settle()
    expect(w.notes().slice(before)).toEqual([]) // Q-80 "writes nothing": the call adds no memo note, in the run's memory or anywhere
  })
}

// ------------------------------------------------------------------ criterion 2: the refusal's error result

for (const [who, o, cdIn] of OUTSIDERS) {
  // R-C15-140 · spec L528: "A refused `memory_note` returns an error result, `refused: this session is not in run <id> (T7)`,"
  // Q-80: "a refused `memory_note` returns an error result (`refused: this session is not in run <id> (T7)`)"
  test('memory_note from ' + who + ' returns the refusal as an error result naming the run', SLOW, async ($, on) => {
    const w = await outsider($, on, o, cdIn)
    const r: any = await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'P2 parked: waits on Q-3' } as any)
    await w.settle()
    const err = errorText(r)
    expect(err, 'an error result (deny or isError), not an answered `noted #n`').toBeDefined() // Q-80 "returns an error result"
    expect(err).toContain(REFUSED) // Q-80 / spec L528 words, <id> = the fixture manifest's run_id
  })
}

// ------------------------------------------------------------------ criteria 3 and 4: a hook that would have noted on its own

// The hooks that note on their own: spec L89-90 "Its replies were also noted in this run's memory as `[prime-reply]`",
// spec L97 "Only the run's own session writes run notes (`prime-reply`, `operator`, rulings)". Each is driven alone,
// so the log lines counted are that hook's own.
const HOOKS: [string, ($: any) => Promise<unknown>][] = [
  ['the reply hook (prime-reply)', ($) => $.turn.complete({ answer: 'Dispatched P3 sub-orchestrator — waits on Q-2', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)],
  ['the operator-prompt hook (operator)', ($) => $.prompt.submit({ text: 'ship it, and from now on never merge my PRs' } as any)],
]

for (const [hook, fire] of HOOKS) {
  // R-C15-142, R-C15-144 · spec L529: "A hook that would have noted on its own writes nothing"
  // Q-80: "A hook that would have noted on its own writes nothing ... The run's memory records nothing from that session."
  test(hook + ' in a session that cd-ed into the run appends no note', SLOW, async ($, on) => {
    const w = await outsider($, on, OUTSIDERS[0][1], true)
    const before = w.notes().length // notes before the hook are not this test's
    await fire($)
    await w.settle()
    expect(w.notes().slice(before)).toEqual([]) // Q-80 "writes nothing": the hook adds no memo note at all
  })

  // R-C15-143 · spec L529: "and logs one line to the session's log (`$.ui.log`)."
  // Q-80: "A hook that would have noted on its own writes nothing and logs one line to the session's log (`$.ui.log`)."
  test(hook + ' in a session that cd-ed into the run logs one line through $.ui.log', SLOW, async ($, on) => {
    const w = await outsider($, on, OUTSIDERS[0][1], true)
    const before = w.logs.length
    await fire($)
    await w.settle()
    const added = w.logs.slice(before)
    expect(added.length).toBe(1) // Q-80 "logs one line": exactly one $.ui.log call from that hook
    expect(added[0]).not.toContain('\n') // Q-80 "one line": a single line
  })
}
