// claude plugin test — T2, failure handling on blocking hooks (docs/designs/v7.6-tuning.md L34-45).
//
// Written before the implementation (the red step for F12). Each test makes one gating hook's own
// work fail with a malformed record or a failed snapshot, then checks what the call does. Which
// way each hook fails comes from K2's table (_orch/nodes/K2/work/hook-decisions.md), never from
// the code:
//   spec L38-39: "**Fail closed** where a failure must not open a door: the prime guard,
//                 the command gate, forbidden files and pause."
//   spec L40-41: "**Fail open** where a failure must not block your work: notes, the band, usage
//                 and the code index."
//   spec L43:    "Acceptance: every gating hook has a `.catch` matching its decision, and one test
//                 per class proves the failure path."
//   _orch/inbox/Q-1.answer.md: "A: the phase gate, rulings, checkpoints and spawn fail closed."
//   (Q-1 option 1, which that answer picks: "Fail closed during a run: ... Fail open: everything else")
//
// When a gating hook with no `.catch` throws, the engine skips it and the call goes on
// (_orch/nodes/E1/work/probes.md §h). So fail-closed tests are red until a `.catch` refuses.
// For fail-open, "the call goes on" is already true today. What the spec adds is the hook's
// own `.catch` answering. The engine records that as trace outcome 'caught'
// (types: TraceOutcome "`caught`: it threw or its budget ran out, and its `.catch` handler's
// result stands"). An observer plugin one tier above reads it from `next.trace`.
import { expect, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) a test runs 6-10x slower than alone, and tests in the last files left at the default
// timed out under that load (_orch/nodes/XTFL1/work/repro.md, cause.md, proof.md), so every test in this file gets an
// explicit budget. No step or assertion is changed by it.
const LOADED = { timeoutMs: 60000 }

// An active prime run (the "during a run" of Q-1 option 1).
const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

// A value no string operation accepts: JSON keeps it as a plain object whose toString and valueOf
// are not functions, so `'' + BAD` and `BAD / 1` throw a TypeError in the hook that reads it.
const BAD = { toString: 1, valueOf: 1 }

// Loads above baton (tier prepend; baton loads in user) and logs what settled beneath it.
const OBSERVER = {
  name: 'observer',
  tier: 'prepend' as const,
  register(on: any) {
    on('agent.spawn', async ($: any, e: any, next: any) => {
      const r = await next(e)
      $.ui.log('TRACE agent.spawn ' + JSON.stringify(next.trace.map((t: any) => ({ plugin: t.plugin, outcome: t.outcome }))))
      return r
    })
    on('classic.SessionStart', async ($: any, e: any, next: any) => {
      const r = await next(e)
      $.ui.log('TRACE classic.SessionStart ' + JSON.stringify(next.trace.map((t: any) => ({ plugin: t.plugin, outcome: t.outcome }))))
      return r
    })
  },
}

type World = {
  manifest?: string
  answers?: string[]
  rulings?: unknown[]
  lessons?: unknown[]
  spend?: string
  snapshotFails?: boolean
}

// The world beneath the plugins, after tests/approvals.test.ts's: the run's files, the memo CLI,
// the dialog, and a bottom for each call that records what actually ran.
function world(on: any, o: World = {}) {
  const logs: string[] = []
  const ran: string[] = []
  const spawned: string[] = []
  const answers = [...(o.answers ?? [])]
  on('fs.read', (_$: any, e: any) => {
    if (e.path.endsWith('_orch/manifest.json')) return { value: o.manifest ?? ACTIVE }
    if (e.path.endsWith('_orch/spend.json') && o.spend) return { value: o.spend }
    return { deny: 'ENOENT' }
  })
  on('ui.log', (_$: any, e: any) => {
    logs.push(String(e.text ?? ''))
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    // the checkpoint's snapshot runs as `sh -c <script>`
    if (argv[0] === 'sh' && o.snapshotFails) return { value: { exitCode: 1, stdout: '', stderr: 'fatal: not a git repository' } }
    if (argv.includes('note')) return { value: { exitCode: 0, stdout: JSON.stringify({ index: 0, text: '', truncated: false, merges: [] }), stderr: '' } }
    if (argv.includes('recall')) {
      // the project memory's namespaces: `--ns rulings` holds the rulings, `--ns lessons` the lessons
      const ns = argv.includes('--ns') ? argv[argv.indexOf('--ns') + 1] : null
      const notes = ns === 'rulings' ? o.rulings : ns === 'lessons' ? o.lessons : undefined
      return { value: { exitCode: 0, stdout: JSON.stringify({ pattern: '.', total: 0, notes: notes ?? [], blocks: [] }), stderr: '' } }
    }
    return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => {
    spawned.push(String(e.description ?? ''))
    return { model: e.model ?? 'claude-opus-5-5', agentId: e.prompt }
  })
  on('turn.complete', () => ({ text: '' }))
  on('classic.SessionStart', () => ({}))
  on('tool.check', () => ({ decision: 'allow' }))
  // $.ui.ask is a tool.call of AskUserQuestion; answer it as the dialog would
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') {
      ran.push(e.tool + ': ' + String(e.command ?? e.description ?? ''))
      return { result: 'ran' }
    }
    const q = e.questions[0]
    const a = answers.shift()
    if (a === undefined) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [q.question]: a } } }
  })
  // What the observer saw beneath it for one event: baton's link in the chain.
  const batonOutcome = (event: string) => {
    const line = logs.filter((l) => l.startsWith('TRACE ' + event + ' ')).at(-1)
    if (!line) return 'no trace for ' + event
    const links = JSON.parse(line.slice(('TRACE ' + event + ' ').length)) as { plugin: string; outcome: string }[]
    return links.find((l) => l.plugin === 'baton')?.outcome ?? 'baton not in the chain'
  }
  return { logs, ran, spawned, batonOutcome }
}

// ------------------------------------------------------------------ fail closed

// Requirement: R-C2-02, R-C2-10, R-C2-11 (_orch/plan/traceability.yaml).
// Pins: spec L38 "**Fail closed** where a failure must not open a door"; _orch/inbox/Q-1.answer.md
// "A: the phase gate, rulings, checkpoints and spawn fail closed." — Q-1 option 1: "checkpoints
// (:2545: refuse the rm/reset when the snapshot failed)"; K2 row 6, fail-closed.
test('fail-closed: during a run, an rm -r whose checkpoint snapshot failed is refused and never runs', LOADED, async ($, on) => {
  // the command gate asks first; the operator approves, so only the checkpoint stands in the way
  const w = world(on, { answers: ['Approve'], snapshotFails: true })
  const r: any = await $.tool.call({ tool: 'Bash', command: 'rm -rf build', agentId: 'w1' } as any)
  // Q-1 option 1: "refuse the rm/reset when the snapshot failed" — the call is refused
  expect(typeof r.deny).toBe('string')
  // Q-1 option 1: refused, so the rm itself never reached the tool
  expect(w.ran.filter((x) => x.includes('rm -rf build'))).toEqual([])
})

// Requirement: R-C2-02, R-C2-10, R-C2-11 (_orch/plan/traceability.yaml).
// Pins: spec L38 "**Fail closed** where a failure must not open a door"; _orch/inbox/Q-1.answer.md
// "A: the phase gate, rulings, checkpoints and spawn fail closed." — Q-1 option 1: "Fail closed during
// a run: the phase gate (:2555)"; K2 row 7, fail-closed.
// The failure: a DONE phase waits for the operator's check, and the standing ruling the gate shows
// in its question is a malformed record (its text is not a string), so the gate cannot build the
// question. The operator would approve if asked, so only a refusal for the failure passes.
test("fail-closed: during a run, the phase gate failing refuses the prime's next dispatch", LOADED, async ($, on) => {
  const w = world(on, {
    answers: ['Approve'],
    rulings: [{ index: 0, ts: '2026-10-19T00:00:00Z', tag: 'ruling', text: BAD }],
  })
  await $.agent.spawn({ prompt: 's1', description: 'P3', subagentType: 'baton:sub-orchestrator' } as any)
  await $.turn.complete({ agentId: 's1', answer: 'P3 DONE+CONFIRMED 4/4', durationMs: 1, isAborted: false, turnId: 'x', reason: 'answer' } as any)
  const r: any = await $.tool.call({ tool: 'Agent', prompt: 'P4', description: 'P4' } as any)
  // Q-1 option 1: the phase gate fails closed during a run — the dispatch is refused
  expect(typeof r.deny).toBe('string')
  // Q-1 option 1: refused, so the Agent call never reached the tool
  expect(w.ran.filter((x) => x.startsWith('Agent'))).toEqual([])
})

// Requirement: R-C2-02, R-C2-10, R-C2-11 (_orch/plan/traceability.yaml).
// Pins: spec L38 "**Fail closed** where a failure must not open a door"; _orch/inbox/Q-1.answer.md
// "A: the phase gate, rulings, checkpoints and spawn fail closed." — Q-1 option 1: "enforced rulings
// (:2650)"; K2 row 13, fail-closed.
// The failure: an enforced ruling matches the command, but the ruling's record is malformed (its
// text is not a string), so the hook throws while writing the refusal.
test('fail-closed: during a run, the enforced-rulings hook failing refuses the Bash call', LOADED, async ($, on) => {
  world(on, {
    rulings: [
      { index: 0, ts: '2026-10-19T00:00:00Z', tag: 'ruling', text: BAD },
      { index: 1, ts: '2026-10-19T00:00:00Z', tag: 'enforce', text: 'enforce #0 /git push/' },
    ],
  })
  const r: any = await $.tool.check({ tool: 'Bash', input: { command: 'git push origin main' } } as any)
  // Q-1 option 1: enforced rulings fail closed during a run — the check denies (beneath, it allowed)
  expect(r.decision).toBe('deny')
})

// Requirement: R-C2-02, R-C2-05, R-C2-10, R-C2-11 (_orch/plan/traceability.yaml).
// Pins: spec L38-39 "**Fail closed** where a failure must not open a door: ... and pause.";
// _orch/inbox/Q-1.answer.md "A: the phase gate, rulings, checkpoints and spawn fail closed." — Q-1
// option 1: "`agent.spawn` when pause is on or the budget is spent"; K2 row 19 and its branch row
// "spent-budget refusal", fail-closed.
// The failure: a goal budget is set, and the run's saved spend is a malformed record (its fresh-token
// count is not a number), so the budget check throws before it can say whether the budget is spent.
test("fail-closed: during a run, agent.spawn's budget check failing refuses the review round", { ...LOADED, options: { tokensPerGoal: 1000 } as any }, async ($, on) => {
  const w = world(on, { spend: JSON.stringify({ run_id: 't', total: { fresh: BAD } }) })
  let r: any
  let thrown: string | null = null
  try {
    r = await $.agent.spawn({ prompt: 'review the PR', description: 'review round 2', subagentType: 'baton:pr-reviewer' } as any)
  } catch (err: any) {
    // the Agent tool's error, when a spawn is refused (types: agent.spawn `deny`)
    thrown = String(err && err.message)
  }
  // Q-1 option 1: spawn fails closed during a run — refused, by a deny or the error it becomes
  expect(typeof (r && r.deny) === 'string' || thrown !== null).toBe(true)
  // Q-1 option 1: refused, so nothing was spawned beneath
  expect(w.spawned).toEqual([])
})

// ------------------------------------------------------------------ fail open

// Requirement: R-C2-06, R-C2-10, R-C2-11 (_orch/plan/traceability.yaml).
// Pins: spec L40 "**Fail open** where a failure must not block your work"; spec L43 "every gating
// hook has a `.catch` matching its decision"; Q-1 option 1: "Fail open: everything else (... both
// SessionStart hooks ...)"; K2 row 15, fail-open.
// The failure: the run's manifest is a malformed record (its run_id is not a string), so the hook
// that hands a new session the prime's wake throws while writing it.
test('fail-open: during a run, the SessionStart wake hook failing lets the session start, answered by its own .catch', { ...LOADED, plugins: [OBSERVER] }, async ($, on) => {
  const w = world(on, { manifest: JSON.stringify({ run_id: BAD, mode: 'BUILD', prime: true }) })
  const r: any = await $.classic.SessionStart({ source: 'startup' } as any)
  // spec L40: a failure must not block your work — the session starts (nothing stops it)
  expect(r && r.continue).not.toBe(false)
  // spec L43: the hook's own `.catch` answers (TraceOutcome 'caught'), not the engine's skip
  expect(w.batonOutcome('classic.SessionStart')).toBe('caught')
})

// Requirement: R-C2-06, R-C2-10, R-C2-11 (_orch/plan/traceability.yaml).
// Pins: spec L40 "**Fail open** where a failure must not block your work"; spec L43 "every gating
// hook has a `.catch` matching its decision"; Q-1 option 1: "Fail open: everything else (...
// agent.spawn's binding and lessons)"; K2 agent.spawn branch row "lessons injection", fail-open.
// The failure: the lessons memory holds a malformed record (a null note), so matching lessons to
// the worker's prompt throws.
test("fail-open: during a run, agent.spawn's lessons failing lets the worker spawn, answered by its own .catch", { ...LOADED, plugins: [OBSERVER] }, async ($, on) => {
  const w = world(on, { lessons: [null] })
  const r: any = await $.agent.spawn({ prompt: 'Add totals to src/cart.ts', description: 'T9 cart totals', subagentType: 'baton:worker' } as any)
  // spec L40: a failure must not block your work — the spawn is not refused
  expect(r.deny).toBeUndefined()
  // spec L40: the worker was spawned beneath
  expect(w.spawned).toEqual(['T9 cart totals'])
  // spec L43: the hook's own `.catch` answers (TraceOutcome 'caught'), not the engine's skip
  expect(w.batonOutcome('agent.spawn')).toBe('caught')
})
