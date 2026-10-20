// claude plugin test — T7: run membership follows the session, not the current directory.
//
// Written from the spec (docs/designs/v7.6-tuning.md L84-103) and the operator's answers
// (_orch/inbox/Q-7, Q-8, Q-29 via plan/decisions.md, Q-80, OQ7) BEFORE the implementation
// (node T17, the red step of F17). Requirement ids are the rows of _orch/plan/traceability.yaml.
//
// The world: the run lives in RUN (/proj/run, its _orch/manifest.json there); OUT (/proj) is a
// directory outside it. A `cd` changes what $.session.cwd() answers and raises CwdChanged, as the
// engine does. A relative $.fs path resolves against the session's CURRENT directory, as it does
// in a live session (the kit itself resolves it against the plugin folder, so the fs hooks below
// re-root it at the current directory). Run notes are memo `note` calls (the memo CLI is stubbed
// at process.run, as in memory.test.ts); a run note is one whose --dir is RUN/_orch/memory.
//
// Tests named `guard: ...` pin behaviour that already works at da5910c (restart, rotation,
// compaction, resume). They are preservation guards, exempt from red, approved by
// _orch/inbox/OQ7.answer.md ("Each one is logged as a deviation from the red-first rule
// (spec L19-20, L100), with this file as the approval").
import { expect, mock, test } from 'claude-code/testing'

const PROJ = '/proj'
const RUN = '/proj/run' // the run's directory (fixture)
const OUT = '/proj' // a directory outside the run (fixture; the live case was ~/Desktop/projects, spec L88)
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const MANIFEST_PATH = RUN + '/_orch/manifest.json'
const RUN_MEMORY = RUN + '/_orch/memory' // the run's memory (manifest `memory.run`, _orch/manifest.json)
const PRIME = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: the manifest's prime session id
const SECOND = 'b93f2d17-8e6a-4f05-a2c4-6d7e8f901234' // fixture: a second session's id
const AFTER_CLEAR = 'c4d5e6f7-0a1b-4c2d-8e3f-405162738495' // fixture: the prime's id after a /clear
const RULE_TEXT = 'ship it, and from now on never merge my PRs' // fixture: an operator prompt that states a rule
const TICK_MS = 30000 // Q-7: "The prime refreshes `heartbeat_at` on the 30 s usage tick"

// Q-29 (plan/decisions.md, the G1 answer to H14): the words an unarmed second session says.
// "baton: run <id> has a live prime in another session (<id prefix>, heard <n>s ago); this session is not armed"
const WHY = /baton: run (\S+) has a live prime in another session \(([^,()\s]+), heard (\d+)s ago\); this session is not armed/

type Answer = 'yes' | 'no' | 'dismiss'
type Seed = 'none' | null | { id: string; ageS: number }

type Opts = {
  start: string // the directory the session starts in
  id: string // $.session.id()
  interactive: boolean // SessionStartInput.isInteractive (Q-29)
  seed?: Seed // the manifest's prime_session: 'none' = no manifest at all, null = cleared, absent key when undefined
  noPrimeKey?: boolean // the manifest has no prime_session key at all (a legacy manifest, Q-7)
  answers?: Answer[]
}

const MSG = { role: 'user', text: 'summary of the run so far', toolUses: [] }

/** Every hook beneath the mod, answering from memory. */
function world(on: any, o: Opts) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 }) // the mocked clock and the wall clock start together
  const iso = (ms: number) => new Date(ms).toISOString() // D-T17-heartbeat-format: an ISO string, like the manifest's started_at
  const s = { cwd: o.start, id: o.id }
  const files = new Map<string, string>()
  if (o.seed !== 'none') {
    const m: any = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: iso(t0 - 3600000), memory: { run: '_orch/memory' } }
    if (!o.noPrimeKey) m.prime_session = o.seed === null || o.seed === undefined ? null : { id: o.seed.id, heartbeat_at: iso(t0 - o.seed.ageS * 1000) }
    files.set(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n')
  }
  // A path under /proj is absolute; anything else was relative, so it lands under the current directory.
  const abs = (p: string) => {
    if (p === PROJ || p.startsWith(PROJ + '/')) return p
    if (p.startsWith('_orch/')) return s.cwd + '/' + p
    const i = p.lastIndexOf('/_orch/')
    return i >= 0 ? s.cwd + p.slice(i) : p
  }
  const logs: string[] = []
  const told: string[] = []
  const calls: { argv: string[]; stdin?: string }[] = []
  const asked: { q: string; options: string[]; primeAtAsk: string | null; runNotesAtAsk: number }[] = []
  const answers = [...(o.answers ?? [])]
  const manifest = (): any => {
    const t = files.get(MANIFEST_PATH)
    return t === undefined ? null : JSON.parse(t)
  }
  const notes = () =>
    calls
      .filter((c) => c.argv.includes('note'))
      .map((c) => ({ tag: c.argv[c.argv.indexOf('--tag') + 1], dir: c.argv[c.argv.indexOf('--dir') + 1], text: c.stdin }))
  const runNotes = () => notes().filter((n) => n.dir === RUN_MEMORY)

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
    const t = String(e.text ?? JSON.stringify(e))
    logs.push(t)
    told.push(t)
    return { value: undefined }
  })
  on('ui.notify', (_$: any, e: any) => {
    told.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('ui.status', (_$: any, e: any) => {
    told.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  // Beneath the plugins, the engine's own drawing: one Text naming the component (as interface.test.ts draws it).
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: s.cwd }))
  on('session.root', () => ({ value: o.start }))
  on('session.id', () => ({ value: s.id }))
  on('session.surfaces', () => ({ value: o.interactive ? ['terminal'] : [] }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('session.compact', () => ({ messages: [MSG] }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('classic.SessionStart', () => ({}))
  on('classic.CwdChanged', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'RULING: Never merge a PR yourself; the operator merges.', usage: {} } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: 'P3 running; waiting on F2-verify; next: gate P3', usage: {} } }))
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
  // $.ui.ask is a tool.call of AskUserQuestion (as approvals.test.ts answers it). No answer left = dismissed.
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options: string[] = q.options.map((x: any) => x.label)
    asked.push({ q: q.question, options, primeAtAsk: manifest()?.prime_session?.id ?? null, runNotesAtAsk: runNotes().length })
    const a = answers.shift()
    if (a === undefined || a === 'dismiss') return { deny: 'dismissed' }
    // D-T17-ask-labels: "yes" is the option that says yes / take over (else the first); "no" says no / stay (else the last).
    const pick = a === 'yes' ? options.find((l) => /\byes\b|take over|takeover/i.test(l)) ?? options[0] : options.find((l) => /\bno\b|stay|decline|unarmed/i.test(l)) ?? options[options.length - 1]
    return { result: { questions: e.questions, answers: { [q.question]: pick } } }
  })
  mock.store(on)
  mock.env(on, {})
  const session = mock.session(on)

  /** The engine starting this session: session.start, then the classic SessionStart, then a moment of ticks. */
  async function begin($: any, source: 'startup' | 'resume' = 'startup') {
    await $.session.start({ cwd: o.start, surface: o.interactive ? 'terminal' : null, isInteractive: o.interactive } as any)
    const r: any = await $.classic.SessionStart({ source, cwd: o.start } as any)
    told.push(JSON.stringify(r ?? {}))
    await clock.advance(2000)
    await clock.settle()
    return r
  }
  /** The session's shell runs `cd dir`. The mod caches its manifest read for 1.5 s of wall time,
   *  and a session's next call comes later than that, so the test waits it out in real time. */
  async function cd($: any, dir: string) {
    const old = s.cwd
    s.cwd = dir
    await $.classic.CwdChanged({ old_cwd: old, new_cwd: dir } as any)
    await later()
  }
  const bash = async ($: any): Promise<any> => $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  /** What this session says on its band. */
  async function band($: any) {
    const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 200, scroll: {} } as any })
    return (await ui.findAll({ type: 'Text' })).map((x: any) => x.text).join(' | ')
  }
  /** Everything the session was told: log lines, notices, SessionStart output, appended rows. */
  const allTold = () => [...told, ...session.appended().map((r: any) => JSON.stringify(r))].join('\n')
  /** Overwrite the manifest's prime_session, as another session writing the file does. */
  const setPrime = (v: any) => {
    const m = manifest()
    m.prime_session = v
    files.set(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n')
  }
  const hb = (v: any) => (typeof v === 'number' ? v : Date.parse(String(v)))
  return { clock, t0, iso, s, files, logs, asked, manifest, notes, runNotes, begin, cd, bash, band, allTold, setPrime, hb }
}

const later = () => new Promise((r) => setTimeout(r, 1600))
const SLOW = { timeoutMs: 20000 }

/** A run note from each source a session writes them from: the operator's prompt (and the ruling in it), the prime's reply, memory_note. */
async function talk($: any, w: ReturnType<typeof world>) {
  await $.prompt.submit({ text: RULE_TEXT } as any)
  await $.turn.complete({ answer: 'Dispatched P3 sub-orchestrator — waits on Q-2', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'P2 parked: waits on Q-3' } as any)
  await w.clock.advance(10)
  await w.clock.settle()
}

// ------------------------------------------------------------------ cd into a run's directory mid-session

// R-C7-13, R-C7-01, R-C7-03 · spec L100: "`cd` into a run's directory mid-session: no guard,"
// spec L91-92: "A session belongs to a run only if it started, resumed or compacted with its working directory
// in the run's directory. Record that at `session.start` and never re-derive it from the current directory."
test('a session that started outside the run and cds into it arms no guard', SLOW, async ($, on) => {
  const w = world(on, { start: OUT, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  await w.cd($, RUN)
  const r = await w.bash($)
  expect(r.deny).toBeUndefined() // spec L100 "no guard": the call is not refused
  expect(r.result).toBe('ran') // the test's own tool.call answer: the call ran
})

// R-C7-14, R-C7-10 · spec L100: "no notes." · spec L97: "Only the run's own session writes run notes (`prime-reply`, `operator`, rulings)."
// Q-80: a refused memory_note "writes nothing" (its error text is C15's, not asserted here: criterion 45).
test('a session that started outside the run and cds into it writes no run notes', SLOW, async ($, on) => {
  const w = world(on, { start: OUT, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  await w.cd($, RUN)
  await talk($, w)
  expect(w.runNotes()).toEqual([]) // spec L100 "no notes": nothing in the run's memory
  expect(w.notes().filter((x) => ['operator', 'prime-reply', 'ruling', 'prime'].includes(x.tag))).toEqual([]) // spec L97: no prime-reply, operator or ruling note anywhere
})

// ------------------------------------------------------------------ a second session while the prime is live

// R-C7-05, R-C7-06 · spec L94-95: "A second live session started in the run's directory must not silently become a
// second prime: ask (interactive)," · Q-29: interactive is SessionStartInput.isInteractive; the ask is $.ui.ask.
test('an interactive second session in the run directory, prime live: it is asked before anything arms', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['no'] })
  await w.begin($)
  await w.bash($)
  expect(w.asked.length).toBe(1) // spec L95 "ask (interactive)": one question
  expect(w.asked[0].primeAtAsk).toBe(PRIME) // asked before anything changed: the manifest still names the live prime (fixture)
  expect(w.asked[0].runNotesAtAsk).toBe(0) // and before this session wrote any run note (spec L97)
})

// R-C7-07, R-C7-15 · spec L95: "or stay unarmed" · Q-8: "No, or a dismissed dialog, leaves this session unarmed"
test('an interactive second session that declines stays unarmed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['no'] })
  await w.begin($)
  const r = await w.bash($)
  expect(w.asked.length).toBe(1) // spec L95: it was asked (precondition)
  expect(r.deny).toBeUndefined() // Q-8 "leaves this session unarmed": not refused
  expect(r.result).toBe('ran') // the test's own tool.call answer
  expect(w.manifest().prime_session.id).toBe(PRIME) // Q-8: no takeover on no; the manifest keeps the live prime (fixture)
})

// R-C7-08, R-C7-16 · spec L95: "and say why." · spec L101: "not armed, and told why." · Q-8: "...leaves this session unarmed and it says why."
// Q-29: "says why in a `$.ui.log` line and on the band: `baton: run <id> has a live prime in another session (<id prefix>, heard <n>s ago); this session is not armed`"
test('an interactive second session that declines is told why it is not armed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['no'] })
  await w.begin($)
  const line = w.logs.map((l) => l.match(WHY)).find(Boolean)
  expect(line, 'a $.ui.log line in the Q-29 wording').toBeTruthy() // Q-29: a $.ui.log line
  expect(line![1]).toBe(RUN_ID) // Q-29 "run <id>": the fixture's run id
  expect(line![2].length).toBeGreaterThan(0) // Q-29 "<id prefix>"
  expect(PRIME.startsWith(line![2])).toBe(true) // Q-29 "<id prefix>": a prefix of the live prime's id (fixture)
  expect(Number(line![3])).toBeGreaterThanOrEqual(29) // Q-29 "heard <n>s ago": the seeded heartbeat is 30 s old (fixture)
  expect(Number(line![3])).toBeLessThanOrEqual(45) // the same, allowing for the test's own seconds
  expect(await w.band($)).toContain('this session is not armed') // Q-29 "and on the band"
})

// R-C7-05, R-C7-07, R-C7-15 · spec L95: "or stay unarmed" · spec L101: "A second session while the prime is live: not armed,"
test('a non-interactive second session in the run directory, prime live, is not armed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  await w.begin($)
  const r = await w.bash($)
  expect(w.asked.length).toBe(0) // spec L95: only an interactive session is asked (Q-29: isInteractive false)
  expect(r.deny).toBeUndefined() // spec L101 "not armed"
  expect(r.result).toBe('ran') // the test's own tool.call answer
  expect(w.manifest().prime_session.id).toBe(PRIME) // spec L94 "must not silently become a second prime": the manifest keeps the prime (fixture)
})

// R-C7-08, R-C7-16 · spec L101: "and told why." · Q-29: "Headless, the same text goes into the session's output."
test('a non-interactive second session is told why it is not armed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  await w.begin($)
  const line = w.allTold().match(WHY)
  expect(line, 'the Q-29 wording in the session output').toBeTruthy() // Q-29: the same text, headless
  expect(line![1]).toBe(RUN_ID) // Q-29 "run <id>": the fixture's run id
  expect(PRIME.startsWith(line![2])).toBe(true) // Q-29 "<id prefix>": a prefix of the live prime's id (fixture)
  expect(Number(line![3])).toBeGreaterThanOrEqual(29) // Q-29 "heard <n>s ago": the seeded heartbeat is 30 s old (fixture)
  expect(Number(line![3])).toBeLessThanOrEqual(45) // the same, allowing for the test's own seconds
})

// R-C7-05, R-C7-07 · Q-8: "No, or a dismissed dialog, leaves this session unarmed"
test('an interactive second session whose question is dismissed stays unarmed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['dismiss'] })
  await w.begin($)
  const r = await w.bash($)
  expect(w.asked.length).toBe(1) // spec L95 "ask (interactive)" (precondition: there was a question to dismiss)
  expect(r.deny).toBeUndefined() // Q-8: a dismissed dialog leaves it unarmed
  expect(r.result).toBe('ran') // the test's own tool.call answer
  expect(w.manifest().prime_session.id).toBe(PRIME) // Q-8: no takeover; the manifest keeps the live prime (fixture)
})

// R-C7-08, R-C7-16 · Q-8: "No, or a dismissed dialog, leaves this session unarmed and it says why."
// Q-29: "says why in a `$.ui.log` line"
test('an interactive second session whose question is dismissed is told why it is not armed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['dismiss'] })
  await w.begin($)
  const line = w.logs.map((l) => l.match(WHY)).find(Boolean)
  expect(line, 'a $.ui.log line in the Q-29 wording').toBeTruthy() // Q-29: a $.ui.log line
  expect(line![1]).toBe(RUN_ID) // Q-29 "run <id>": the fixture's run id
  expect(PRIME.startsWith(line![2])).toBe(true) // Q-29 "<id prefix>": a prefix of the live prime's id (fixture)
})

// R-C7-05, R-C7-06 · Q-8: "Take over: yes makes this session the prime and writes its id to the manifest."
test('an interactive second session that says yes becomes the prime and writes its id', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['yes'] })
  await w.begin($)
  const r = await w.bash($)
  expect(w.asked.length).toBe(1) // spec L95 "ask (interactive)"
  expect(w.manifest().prime_session.id).toBe(SECOND) // Q-8 "writes its id to the manifest": this session's id (fixture)
  expect(r.deny).toContain('is not a prime tool') // Q-8 "makes this session the prime": the guard is armed (the refusal the prime gets: guard.test.ts, unchanged by T7)
})

// R-C7-05 · Q-8: "The old prime sees a different id at its next tick, disarms, and says why in its band."
test('after a takeover the old prime sees a different id at its next tick and disarms', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: true, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  expect((await w.bash($)).deny).toContain('is not a prime tool') // precondition: the recorded prime is armed (guard.test.ts refusal)
  w.setPrime({ id: SECOND, heartbeat_at: w.iso(Date.now()) }) // Q-8: the second session wrote its id
  await w.clock.advance(TICK_MS) // Q-7: the 30 s usage tick
  await w.clock.settle()
  await later()
  const r = await w.bash($)
  expect(r.deny).toBeUndefined() // Q-8 "disarms": not refused
  expect(r.result).toBe('ran') // the test's own tool.call answer
})

// R-C7-05, R-C7-08 · Q-8: "...disarms, and says why in its band."
test('the disarmed old prime says why in its band', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: true, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  w.setPrime({ id: SECOND, heartbeat_at: w.iso(Date.now()) }) // Q-8: the second session wrote its id
  await w.clock.advance(TICK_MS) // Q-7: the 30 s usage tick
  await w.clock.settle()
  await later()
  // Q-8 "says why in its band"; the words are F17's (D-T17-disarm-band-words: they say it is disarmed / not armed / taken over)
  expect(await w.band($)).toMatch(/disarm|not armed|took over|taken over/i)
})

// ------------------------------------------------------------------ the manifest's prime session

// R-C7-04 · spec L94: "The manifest records the prime's session id."
test('/baton start records the prime session id in the manifest', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: 'none' })
  await w.begin($)
  const r: any = await $.command.run({ command: 'baton', args: 'start BUILD ./app' } as any)
  expect(String(r.text)).toContain('started') // precondition: the run started (interface.test.ts)
  expect(w.manifest().prime_session?.id).toBe(PRIME) // spec L94: the prime's session id ($.session.id(), fixture)
})

// R-C7-04 · Q-7: "the manifest gains `prime_session: {id, heartbeat_at}`"
test('when a run starts the manifest gains prime_session {id, heartbeat_at}', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: 'none' })
  await w.begin($)
  await $.command.run({ command: 'baton', args: 'start BUILD ./app' } as any)
  const ps = w.manifest().prime_session
  expect(ps).toBeTruthy() // Q-7: prime_session exists
  expect(ps.id).toBe(PRIME) // Q-7 `id`: this session's id (fixture)
  expect(Number.isFinite(w.hb(ps.heartbeat_at))).toBe(true) // Q-7 `heartbeat_at`: a time
  expect(Math.abs(w.hb(ps.heartbeat_at) - w.t0)).toBeLessThan(60000) // Q-7: written now, at the start (within the test's minute)
})

// R-C7-04, R-C7-05 · Q-7: "The prime refreshes `heartbeat_at` on the 30 s usage tick"
test('the prime refreshes prime_session.heartbeat_at on the 30 s usage tick', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 60 } })
  await w.begin($)
  expect(w.manifest().prime_session?.id).toBe(PRIME) // precondition: this session is the recorded prime (fixture)
  const old = w.t0 - 60000 // fixture: a heartbeat 60 s old
  w.setPrime({ id: PRIME, heartbeat_at: w.iso(old) })
  await w.clock.advance(TICK_MS) // Q-7: the 30 s usage tick
  await w.clock.settle()
  expect(w.hb(w.manifest().prime_session.heartbeat_at)).toBeGreaterThan(old) // Q-7 "refreshes": newer than before the tick
  expect(w.manifest().prime_session.id).toBe(PRIME) // the id is unchanged (fixture)
})

// R-C7-04, R-C7-09 · Q-7: "...and clears it at `session.end`."
test('the prime clears prime_session at session.end', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  expect(w.manifest().prime_session?.id).toBe(PRIME) // precondition: this session is the recorded prime (fixture)
  await $.session.end({ reason: 'prompt_input_exit', sessionId: PRIME, resume: {} } as any)
  expect(w.manifest().prime_session ?? null).toBeNull() // Q-7 "clears it": no prime_session left
})

// R-C7-05, R-C7-15 · Q-7: "A prime is live if the heartbeat is under 90 s old."
test('a second session started while heartbeat_at is under 90 s old treats the prime as live', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 60 } })
  await w.begin($)
  const r = await w.bash($)
  expect(r.deny).toBeUndefined() // Q-7: live prime (60 s < 90 s, fixture), so this session is not armed (spec L101)
  expect(r.result).toBe('ran') // the test's own tool.call answer
  expect(w.manifest().prime_session.id).toBe(PRIME) // Q-7: the live prime keeps the manifest (fixture)
  expect(w.allTold()).toMatch(WHY) // Q-29: and it says why
})

// R-C7-09, R-C7-04 · Q-7: live means "under 90 s old", so 90 s or older is an ended prime, which spec L96 says is picked up:
// "A session that replaces an ended prime (rotation, restart) picks the run up as it does today."
test('a session started while heartbeat_at is 90 s old or older picks the run up and is armed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 90 } })
  const start = await w.begin($)
  const r = await w.bash($)
  expect(r.deny).toContain('is not a prime tool') // spec L96 "picks the run up": armed (guard.test.ts refusal)
  expect(JSON.stringify(start)).toContain('memory_wake') // "as it does today": told to wake from the memory (rotation.test.ts)
  expect(w.manifest().prime_session?.id).toBe(SECOND) // spec L94 "The manifest records the prime's session id": now this one (fixture)
  expect(w.allTold()).not.toMatch(WHY) // not told it has a live prime (Q-29 wording)
})

// R-C7-04, R-C7-09 · Q-7: "A manifest with no `prime_session` is claimed by the first session that starts in the directory,
// as today, and it writes its id."
test('a manifest with no prime_session is claimed by the first session that starts there, which writes its id', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, noPrimeKey: true })
  await w.begin($)
  const r = await w.bash($)
  expect(r.deny).toContain('is not a prime tool') // Q-7 "claimed ... as today": armed (guard.test.ts refusal)
  expect(w.manifest().prime_session?.id).toBe(PRIME) // Q-7 "it writes its id" (fixture)
  expect(Number.isFinite(w.hb(w.manifest().prime_session.heartbeat_at))).toBe(true) // Q-7 `prime_session: {id, heartbeat_at}`
})

// R-C7-04 · Q-7: "After a `/clear`, the in-process member updates the id at its next tick."
// types index.d.ts SessionEndInput: "`clear` is how a hook sees a `/clear`: ... the process goes on under a new session id"
test('after a /clear the prime updates prime_session.id at its next tick', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  expect(w.manifest().prime_session?.id).toBe(PRIME) // precondition: this session is the recorded prime (fixture)
  await $.session.end({ reason: 'clear', sessionId: PRIME, resume: {} } as any)
  w.s.id = AFTER_CLEAR // the process goes on under a new id (fixture)
  await $.classic.SessionStart({ source: 'clear', session_id: AFTER_CLEAR, cwd: RUN } as any)
  await w.clock.advance(TICK_MS) // Q-7: "at its next tick"
  await w.clock.settle()
  expect(w.manifest().prime_session?.id).toBe(AFTER_CLEAR) // Q-7 "updates the id": the new id (fixture)
  expect((await w.bash($)).deny).toContain('is not a prime tool') // still the prime: armed (guard.test.ts refusal)
})

// ------------------------------------------------------------------ the run member that leaves the directory

// R-C7-01, R-C7-03 · spec L92: "Record that at `session.start` and never re-derive it from the current directory."
test('a run member that cds out of the run directory keeps an armed guard', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  const before = await w.bash($)
  expect(before.deny).toContain('is not a prime tool') // precondition: armed in the run directory (guard.test.ts refusal)
  await w.cd($, OUT)
  const after = await w.bash($)
  expect(after.deny).toBe(before.deny) // spec L92 "never re-derive it": refused after the cd as before it
})

// R-C7-01, R-C7-03, R-C7-10 · spec L92 "never re-derive it from the current directory." · spec L97 "Only the run's own session writes run notes"
test('a run member that cds out of the run directory writes its run notes after the cd', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  await w.cd($, OUT)
  await $.prompt.submit({ text: 'what is P3 waiting on?' } as any)
  await $.turn.complete({ answer: 'P3 waits on Q-2', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await w.clock.advance(10)
  await w.clock.settle()
  const tags = w.runNotes().map((x) => x.tag)
  expect(tags).toContain('operator') // spec L97 `operator`: the operator's prompt, in the run's memory (RUN/_orch/memory)
  expect(tags).toContain('prime-reply') // spec L97 `prime-reply`: the prime's reply, in the run's memory
})

// ------------------------------------------------------------------ only the run's own session writes run notes

// R-C7-10 · spec L97: "Only the run's own session writes run notes (`prime-reply`, `operator`, rulings)."
// spec L89-90: "Its replies were also noted in this run's memory as `[prime-reply]`"
test('a session that is not the run\'s own writes no prime-reply note', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  await w.begin($)
  await talk($, w)
  expect(w.notes().filter((x) => x.tag === 'prime-reply')).toEqual([]) // spec L97: no `prime-reply` note
})

// R-C7-10 · spec L97: "Only the run's own session writes run notes (`prime-reply`, `operator`, rulings)."
test('a session that is not the run\'s own writes no operator note', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  await w.begin($)
  await talk($, w)
  expect(w.notes().filter((x) => x.tag === 'operator')).toEqual([]) // spec L97: no `operator` note
  expect(w.runNotes()).toEqual([]) // Q-80: "The run's memory records nothing from that session."
})

// R-C7-10 · spec L97: "Only the run's own session writes run notes (`prime-reply`, `operator`, rulings)."
test('a session that is not the run\'s own writes no ruling note', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  await w.begin($)
  await talk($, w)
  expect(w.notes().filter((x) => /^ruling/.test(x.tag))).toEqual([]) // spec L97 "rulings": no ruling note
})

// ------------------------------------------------------------------ guards (OQ7): behaviour that works at da5910c

// R-C7-09, R-C7-17 · spec L96 "A session that replaces an ended prime (rotation, restart) picks the run up as it does today."
// spec L102 "A restart: picks the run up." · guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100).
test('guard: a session that replaces an ended prime by restart picks the run up and is armed', SLOW, async ($, on) => {
  // The ended prime cleared its prime_session at session.end (Q-7); a new process starts in the run directory.
  const w = world(on, { start: RUN, id: SECOND, interactive: false, seed: null })
  const start = await w.begin($, 'startup')
  expect(JSON.stringify(start)).toContain('memory_wake') // "as it does today": told to wake from the memory (rotation.test.ts)
  expect((await w.bash($)).deny).toContain('is not a prime tool') // "picks the run up": armed (guard.test.ts refusal)
})

// R-C7-09 · spec L96 "A session that replaces an ended prime (rotation, restart) picks the run up as it does today."
// A rotation (/baton rotate, then the /compact) ends the prime's context; the compacted session carries on.
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100).
test('guard: a session that replaces an ended prime by rotation picks the run up and is armed', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  const rot: any = await $.command.run({ command: 'baton', args: 'rotate' } as any)
  expect(String(rot.text)).toContain('/compact') // precondition: the headless rotation asks for the /compact (rotation.test.ts)
  await $.session.compact({ trigger: 'manual', instructions: '', messages: [MSG] } as any)
  const wake: any = await $.classic.SessionStart({ source: 'compact', cwd: RUN } as any)
  expect(JSON.stringify(wake)).toContain('memory_wake') // "as it does today": the wake (rotation.test.ts)
  expect((await w.bash($)).deny).toContain('is not a prime tool') // "picks the run up": armed (guard.test.ts refusal)
})

// R-C7-01 · spec L91 "A session belongs to a run only if it started, resumed or compacted with its working directory
// in the run's directory." · guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100).
test('guard: a session that compacts with its start directory in the run picks the run up', SLOW, async ($, on) => {
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: { id: PRIME, ageS: 10 } })
  await w.begin($)
  await $.session.compact({ trigger: 'auto', instructions: '', messages: [MSG] } as any)
  const wake: any = await $.classic.SessionStart({ source: 'compact', cwd: RUN } as any)
  expect(JSON.stringify(wake)).toContain('memory_wake') // "picks the run up": the wake (rotation.test.ts)
  expect((await w.bash($)).deny).toContain('is not a prime tool') // and armed (guard.test.ts refusal)
})

// R-C7-01, R-C7-09 · spec L91 "...started, resumed or compacted with its working directory in the run's directory."
// guard per _orch/inbox/OQ7.answer.md (deviation from spec L19-20, L100).
test('guard: a session resumed with its start directory in the run picks the run up', SLOW, async ($, on) => {
  // `claude --resume` of the prime that ended (and cleared prime_session, Q-7): the id is the prime's.
  const w = world(on, { start: RUN, id: PRIME, interactive: false, seed: null })
  const start = await w.begin($, 'resume')
  expect(JSON.stringify(start)).toContain('memory_wake') // "picks the run up": told to wake (rotation.test.ts)
  expect((await w.bash($)).deny).toContain('is not a prime tool') // and armed (guard.test.ts refusal)
})
