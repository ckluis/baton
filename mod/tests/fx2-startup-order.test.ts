// claude plugin test — FX2: a second session in the run folder, in the engine's own start order.
//
// Written from the spec (docs/designs/v7.6-tuning.md T7, L88-102) and the operator's answers
// (Q-8, Q-29 via plan/decisions.md, Q-80) BEFORE the fix (run build-20261019T125436Z, phase P4,
// node FX2). Requirement ids are the rows of _orch/nodes/T20/work/coverage-of-spec.md.
//
// Why this file: t7-membership.test.ts raises session.start before the classic SessionStart. The
// live check LV7 (Claude Code 2.1.316) saw the opposite order: `classic.SessionStart settled` at
// 20:37:05.385Z, `session.start: raised` at 20:37:05.395Z. Every test here raises the startup
// SessionStart FIRST and session.start after it, as 2.1.316 does.
//
// The world is t7-membership.test.ts's (the run in RUN with its manifest; run notes are memo
// `note` calls whose --dir is RUN/_orch/memory), cut to what these tests need, plus a record of
// every $.tool.register name.
import { expect, mock, test } from 'claude-code/testing'

const PROJ = '/proj'
const RUN = '/proj/run' // the run's directory (fixture)
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const MANIFEST_PATH = RUN + '/_orch/manifest.json'
const RUN_MEMORY = RUN + '/_orch/memory' // the run's memory (manifest `memory.run`)
const PRIME = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: the manifest's live prime
const SECOND = 'b93f2d17-8e6a-4f05-a2c4-6d7e8f901234' // fixture: a second session's id

// Q-29: "baton: run <id> has a live prime in another session (<id prefix>, heard <n>s ago); this session is not armed"
const WHY = /baton: run (\S+) has a live prime in another session \(([^,()\s]+), heard (\d+)s ago\); this session is not armed/
// What a session that picks the run up is told (register.js startup hook): it is the prime and must wake.
const TOLD_PRIME = /this session is the prime of run|memory_wake/

type Answer = 'yes' | 'no' | 'dismiss'
type Opts = { id: string; interactive: boolean; seed: null | { id: string; ageS: number }; answers?: Answer[]; surfacesLate?: boolean }

function world(on: any, o: Opts) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const iso = (ms: number) => new Date(ms).toISOString()
  const s = { cwd: RUN, id: o.id }
  const files = new Map<string, string>()
  const m: any = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: iso(t0 - 3600000), memory: { run: '_orch/memory' } }
  m.prime_session = o.seed === null ? null : { id: o.seed.id, heartbeat_at: iso(t0 - o.seed.ageS * 1000) }
  files.set(MANIFEST_PATH, JSON.stringify(m, null, 2) + '\n')
  const abs = (p: string) => {
    if (p === PROJ || p.startsWith(PROJ + '/')) return p
    if (p.startsWith('_orch/')) return s.cwd + '/' + p
    const i = p.lastIndexOf('/_orch/')
    return i >= 0 ? s.cwd + p.slice(i) : p
  }
  const logs: string[] = []
  const registered: string[] = []
  const calls: { argv: string[]; stdin?: string }[] = []
  const asked: { q: string; registeredAtAsk: string[]; runNotesAtAsk: number }[] = []
  const answers = [...(o.answers ?? [])]
  const manifest = (): any => JSON.parse(files.get(MANIFEST_PATH)!)
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
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: s.cwd }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: s.id }))
  let bound = false // surfacesLate: the terminal surface shows only once session.start has run
  on('session.surfaces', () => ({ value: o.interactive && (bound || !o.surfacesLate) ? ['terminal'] : [] }))
  on('session.version', () => ({ value: { version: '2.1.316', base: '2.1.316' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => {
    bound = true
    return { cwd: e.cwd }
  })
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }))
  on('classic.SessionStart', () => ({}))
  on('tool.register', (_$: any, e: any) => {
    registered.push(String(e.name))
    return { value: { tool: 'mcp__baton__' + e.name } }
  })
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: 'NONE', usage: {} } }))
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
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options: string[] = q.options.map((x: any) => x.label)
    asked.push({ q: q.question, registeredAtAsk: [...registered], runNotesAtAsk: runNotes().length })
    const a = answers.shift()
    if (a === undefined || a === 'dismiss') return { deny: 'dismissed' }
    const pick = a === 'yes' ? options.find((l) => /take over/i.test(l)) ?? options[0] : options.find((l) => /stay|unarmed/i.test(l)) ?? options[options.length - 1]
    return { result: { questions: e.questions, answers: { [q.question]: pick } } }
  })
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  /** The engine starting this session as 2.1.316 does: the startup SessionStart, THEN session.start. */
  async function begin316($: any, source: 'startup' | 'resume' = 'startup') {
    const r: any = await $.classic.SessionStart({ source, cwd: RUN, session_id: o.id } as any)
    await $.session.start({ cwd: RUN, surface: o.interactive ? 'terminal' : null, isInteractive: o.interactive } as any)
    await clock.advance(2000)
    await clock.settle()
    return r
  }
  const bash = async ($: any): Promise<any> => $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  const memoryTools = (names: string[]) => names.filter((x) => /^(memory|project)_/.test(x))
  return { clock, logs, registered, asked, manifest, notes, runNotes, begin316, bash, memoryTools }
}

const SLOW = { timeoutMs: 20000 }

// R-C7-05 · spec L94-95: "A second live session started in the run's directory must not silently become a
// second prime" · LV7 §7: in the 2.1.316 order the startup hook told the headless second session it IS the prime.
test('R-C7-05: a headless second session, SessionStart before session.start, is not told it is the prime and gets no memory tools', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  const start = await w.begin316($)
  expect(JSON.stringify(start ?? {})).not.toMatch(TOLD_PRIME) // spec L94 "must not silently become a second prime"
  expect(w.memoryTools(w.registered)).toEqual([]) // LV7 Seen in passing 1: not given the run's memory tools
  const r = await w.bash($)
  expect(r.deny).toBeUndefined() // spec L101 "not armed"
  expect(w.manifest().prime_session.id).toBe(PRIME) // the live prime keeps the manifest (fixture)
})

// R-C7-05 · spec L95: "ask (interactive)" — until it answers it is not the prime (LV7 B1, B2 before answering).
test('R-C7-05: an interactive second session, SessionStart before session.start, is not told it is the prime before it answers', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['no'] })
  const start = await w.begin316($)
  expect(JSON.stringify(start ?? {})).not.toMatch(TOLD_PRIME) // spec L94: not told it is the prime at startup
  expect(w.asked.length).toBe(1) // spec L95 "ask (interactive)": asked once
  expect(w.memoryTools(w.asked[0]!.registeredAtAsk)).toEqual([]) // no run memory tools before the answer
  expect(w.memoryTools(w.registered)).toEqual([]) // nor after "no"
})

// R-C7-10 · spec L97: "Only the run's own session writes run notes" · LV7 Seen in passing 1: every second session
// wrote "[handoff] a new session picked the run up (startup)".
test('R-C7-10: a headless second session, SessionStart before session.start, writes no run note at all', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  await w.begin316($)
  expect(w.runNotes()).toEqual([]) // spec L97: nothing in the run's memory, no [handoff] or any other tag
  expect(w.notes().filter((x) => x.tag === 'handoff')).toEqual([]) // and no handoff note anywhere
})

// R-C7-10 · spec L97: "Only the run's own session writes run notes" (LV7 B1: declined, still wrote #4).
test('R-C7-10: an interactive second session that declines, SessionStart before session.start, writes no run note at all', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['no'] })
  await w.begin316($)
  expect(w.asked.length).toBe(1) // precondition: it was asked and said no
  expect(w.asked[0]!.runNotesAtAsk).toBe(0) // no run note before the answer (LV7 B2 before answering, #7)
  expect(w.runNotes()).toEqual([]) // spec L97: nothing in the run's memory after the decline
})

// R-C7-08 · spec L95: "or stay unarmed and say why." · Q-29: "Headless, the same text goes into the session's output."
test('R-C7-08: a headless second session, SessionStart before session.start, says why in its own SessionStart output', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  const start = await w.begin316($)
  const line = JSON.stringify(start ?? {}).match(WHY) // the hook's output only: the debug/ui log is not counted
  expect(line, 'the Q-29 wording in the SessionStart output').toBeTruthy()
  expect(line![1]).toBe(RUN_ID) // Q-29 "run <id>"
  expect(PRIME.startsWith(line![2]!)).toBe(true) // Q-29 "<id prefix>"
})

// R-C7-16 · spec L101: "A second session while the prime is live: not armed, and told why." · verdict attack:
// "the headless test passes only because allTold() includes ui.log lines" — this one reads the output alone.
test('R-C7-16: a headless second session is told why in its output, not only in the log, and not told the opposite', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: false, seed: { id: PRIME, ageS: 30 } })
  const start = await w.begin316($)
  const out = JSON.stringify(start ?? {})
  expect(out).toMatch(WHY) // told why, in the output
  expect(out).not.toMatch(TOLD_PRIME) // and not told it is the prime
})

// R-C7-12 · spec L99-102: "plus one live check through cmux ... A second session while the prime is live: not armed,
// and told why." · LV7's three live cases (B1 declined, H headless, B2 before answering), each in the 2.1.316 order.
test('R-C7-12: the live cases B1 declined, H headless and B2 before answering, in the 2.1.316 order, are not told they are the prime', SLOW, async ($, on) => {
  // B1 before it declines and B2 before it answers are the same moment: an interactive start with the question
  // still open. H (headless) is the next test. No answer is given here (the kit dismisses the question).
  const w = world(on, { id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: [] })
  const start = await w.begin316($)
  expect(JSON.stringify(start ?? {})).not.toMatch(TOLD_PRIME) // B1/B2: not told it is the prime
  expect(w.asked[0]?.runNotesAtAsk ?? 0).toBe(0) // B2 before answering: no run note
  expect(w.memoryTools(w.asked[0]?.registeredAtAsk ?? w.registered)).toEqual([]) // nor the memory tools
  expect(w.runNotes()).toEqual([]) // the run memory is unchanged by it
})

// R-C7-12 · the H case of LV7 (§6-§7) in the 2.1.316 order: not armed, its output says why, the run memory unchanged.
test('R-C7-12: the live case H (headless) in the 2.1.316 order says why in its output and leaves the run memory unchanged', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: false, seed: { id: PRIME, ageS: 27 } })
  const start = await w.begin316($)
  expect(JSON.stringify(start ?? {})).toMatch(WHY) // LV7 §7: its output says why
  expect(JSON.stringify(start ?? {})).not.toMatch(TOLD_PRIME) // and not the opposite
  expect(w.runNotes()).toEqual([]) // LV7 Seen in passing 1: no #6 [handoff] note
  expect((await w.bash($)).deny).toBeUndefined() // LV7 §6: not armed
})

// R-C7-09 (preservation, not one of FX2's red rows) · spec L96: "A session that replaces an ended prime (rotation,
// restart) picks the run up as it does today." — the fix must keep this in the 2.1.316 order.
test('R-C7-09: a restart in the 2.1.316 order picks the run up, is told to wake and is armed', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: false, seed: null })
  const start = await w.begin316($)
  expect(JSON.stringify(start ?? {})).toContain('memory_wake') // "as it does today": told to wake
  expect((await w.bash($)).deny).toContain('is not a prime tool') // armed
  expect(w.manifest().prime_session?.id).toBe(SECOND) // the manifest records this session as the prime
  expect(w.memoryTools(w.registered).length).toBeGreaterThan(0) // and it has the memory tools
})

// R-C7-06 (preservation) · Q-8: "Take over: yes makes this session the prime and writes its id to the manifest."
// In the 2.1.316 order it is asked exactly once.
test('R-C7-06: an interactive second session that says yes in the 2.1.316 order is asked once and becomes the prime', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: true, seed: { id: PRIME, ageS: 30 }, answers: ['yes'] })
  await w.begin316($)
  expect(w.asked.length).toBe(1) // asked once, not once per start event
  expect(w.manifest().prime_session.id).toBe(SECOND) // Q-8: writes its id
  expect((await w.bash($)).deny).toContain('is not a prime tool') // Q-8: armed
})

// R-C7-06 (written with the fix, not a red row) · spec L95: "ask (interactive)". If the startup SessionStart cannot
// yet see the terminal surface, it leaves the session unarmed; session.start, which carries isInteractive, asks then.
test('R-C7-06: an interactive second session whose surface shows only at session.start is still asked, once', SLOW, async ($, on) => {
  const w = world(on, { id: SECOND, interactive: true, surfacesLate: true, seed: { id: PRIME, ageS: 30 }, answers: ['no'] })
  const start = await w.begin316($)
  expect(JSON.stringify(start ?? {})).not.toMatch(TOLD_PRIME) // not told it is the prime
  expect(w.asked.length).toBe(1) // spec L95 "ask (interactive)": asked, once
  expect(w.manifest().prime_session.id).toBe(PRIME) // "no": the live prime keeps the manifest
  expect(w.runNotes()).toEqual([]) // and no run note
})
