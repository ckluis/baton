// claude plugin test — T4: `memory_note` takes a tag (red tests, written before the implementation).
// Spec: docs/designs/v7.6-tuning.md L57-61, "### T4 · `memory_note` takes a tag":
//   "The prime had to prefix "decision" by hand. Add an optional `tag`, sanitized as notes already
//    are, and default it to the caller's role."
// Requirements: R-C4-01, R-C4-02, R-C4-03 in _orch/plan/traceability.yaml.
// Binding inputs: _orch/inbox/Q-3.answer.md (reserved tags refused) and
// _orch/plan/decisions.md § "Q-26 H11" (the caller's role), with the sanitising rule
// named for H11 in _orch/plan/spec-questions.md L31 / § Q-3: `cleanTag` keeps
// `[A-Za-z0-9:_.-]`, 16 bytes.
// The memo CLI is stubbed at process.run (a plugin test has no processes), so "stored under a
// tag" is the `--tag <tag>` the mod hands the CLI's `note` command.
import { expect, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

type Call = { argv: string[]; stdin?: string }

function world(on: any) {
  const calls: Call[] = []
  const schemas: Record<string, any> = {}
  let notes = 0
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: ACTIVE } : { deny: 'ENOENT' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.version', () => ({ value: { version: '2.1.287', base: '2.1.287' } }))
  on('tool.register', (_$: any, e: any) => {
    schemas[e.name] = e.inputSchema
    return { value: { tool: 'mcp__baton__' + e.name } }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: 'merged', usage: {} } }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    calls.push({ argv, stdin: e.init?.stdin })
    let stdout = ''
    if (argv.includes('note')) stdout = JSON.stringify({ index: notes++, text: e.init?.stdin ?? '', truncated: false, merges: [] })
    else if (argv.includes('pending')) stdout = '[]'
    else stdout = 'output'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  // each spawn is handed the agentId named in its prompt
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: e.prompt }))
  on('tool.call', () => ({ result: 'ran' }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  const noteCalls = () => calls.filter((c) => c.argv.includes('note'))
  const tagOf = (c: Call) => c.argv[c.argv.indexOf('--tag') + 1]
  return { calls, schemas, noteCalls, tagOf }
}

// R-C4-01 — spec L59: "Add an optional `tag`,"
test('T4: memory_note declares an optional string tag', async ($, on) => {
  const w = world(on)
  await $.session.start({ cwd: '/work', surface: null } as any)
  const schema = w.schemas['memory_note']
  // origin: spec L59 "Add an optional `tag`" — a `tag` property of type string
  expect(schema.properties.tag?.type).toBe('string')
  // origin: spec L59 "optional" — `tag` is not in `required`
  expect(schema.required ?? []).not.toContain('tag')
  // origin: the existing contract, kept — `text` stays required (mod/tests/memory.test.ts calls memory_note with text)
  expect(schema.required).toContain('text')
})

// R-C4-01 — spec L58-59: "The prime had to prefix "decision" by hand. Add an optional `tag`,"
test('T4: a note written with a tag is stored under that tag', async ($, on) => {
  const w = world(on)
  const r: any = await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'chose option 1 for Q-3', tag: 'decision' } as any)
  // origin: the note is written, as memory_note's existing result says (mod/tests/memory.test.ts "noted #0")
  expect(r.result).toStartWith('noted #')
  const notes = w.noteCalls()
  // origin: spec L59 — one note per call
  expect(notes).toHaveLength(1)
  // origin: spec L58 "prefix "decision" by hand" — the tag the caller gave, `decision`, is the note's tag
  expect(w.tagOf(notes[0])).toBe('decision')
  // origin: spec L58 — the tag is no longer prefixed into the text: the text is stored as given
  expect(notes[0].stdin).toBe('chose option 1 for Q-3')
})

// R-C4-02 — spec L59: "sanitized as notes already are,"
// The rule (spec-questions.md L31, H11 / § Q-3): `cleanTag` keeps `[A-Za-z0-9:_.-]` and cuts to 16 bytes.
// It is applied before the tag is stored, since Q-3 refuses "a sanitized tag" that equals a reserved one.
test('T4: a tag is sanitised as note tags already are: [A-Za-z0-9:_.-] kept, cut to 16 bytes', async ($, on) => {
  const w = world(on)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'one', tag: 'de cision!' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'two', tag: 'design/decision: T4 tag' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'three', tag: 'Q-3:v7.6_ok' } as any)
  const tags = w.noteCalls().map(w.tagOf)
  // origin: H11 rule, characters outside [A-Za-z0-9:_.-] dropped — 'de cision!' → 'decision'
  expect(tags[0]).toBe('decision')
  // origin: H11 rule, dropped then cut to 16 bytes — 'design/decision: T4 tag' → 'designdecision:T4tag' → 'designdecision:T'
  expect(tags[1]).toBe('designdecision:T')
  // origin: H11 rule, every kept class (letters, digits, ':', '_', '.', '-') passes unchanged
  expect(tags[2]).toBe('Q-3:v7.6_ok')
})

// R-C4-03 — spec L60: "and default it to the caller's role."
// Roles: decisions.md § "Q-26 H11": "The prime (a call with no `agentId`) is `prime`. A subagent is
// its spawn type minus `baton:`, with `sub-orchestrator` → `sub`, as `noteReturn` does. A subagent the
// mod did not see spawned is `agent`."
test("T4: a note without a tag is stored under the caller's role", async ($, on) => {
  const w = world(on)
  await $.agent.spawn({ prompt: 's1', description: 'P2', subagentType: 'baton:sub-orchestrator' } as any)
  await $.agent.spawn({ prompt: 'w1', description: 'T14', subagentType: 'baton:worker', parentAgentId: 's1' } as any)
  await $.agent.spawn({ prompt: 'v1', description: 'XT14', subagentType: 'baton:verifier', parentAgentId: 's1' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'from the prime' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'from the sub', agentId: 's1' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'from the worker', agentId: 'w1' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'from the verifier', agentId: 'v1' } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'from a stranger', agentId: 'zz9' } as any)
  const byText = Object.fromEntries(w.noteCalls().map((c) => [c.stdin, w.tagOf(c)]))
  // origin: Q-26 H11 "The prime (a call with no `agentId`) is `prime`"
  expect(byText['from the prime']).toBe('prime')
  // origin: Q-26 H11 "with `sub-orchestrator` → `sub`"
  expect(byText['from the sub']).toBe('sub')
  // origin: Q-26 H11 "A subagent is its spawn type minus `baton:`" — baton:worker → worker
  expect(byText['from the worker']).toBe('worker')
  // origin: Q-26 H11 "A subagent is its spawn type minus `baton:`" — baton:verifier → verifier
  expect(byText['from the verifier']).toBe('verifier')
  // origin: Q-26 H11 "A subagent the mod did not see spawned is `agent`"
  expect(byText['from a stranger']).toBe('agent')
})

// R-C4-01, R-C4-02 (with R-C7-10) — Q-3.answer.md: "A: refuse reserved tags with an error."
// Q-3.md option 1: "a `tag` equal to a reserved tag (operator, prime-reply, ruling, ruling-hand, handoff,
// approval, budget, sub, prime, or `L` followed by digits) returns an error naming the reserved set,
// and no note is written."
// origin of the list: Q-3.md option 1, verbatim
const RESERVED = ['operator', 'prime-reply', 'ruling', 'ruling-hand', 'handoff', 'approval', 'budget', 'sub', 'prime']
// origin: Q-3.md option 1 "`L` followed by digits" — two instances of that form
const RESERVED_L = ['L3', 'L12']

test('T4: memory_note with a reserved tag returns an error naming the reserved set', async ($, on) => {
  world(on)
  for (const tag of [...RESERVED, ...RESERVED_L]) {
    const r: any = await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'forged ' + tag, tag } as any)
    const out = String(r.result ?? r.deny ?? '')
    // origin: Q-3 "returns an error" — not the success line memory_note gives today ("noted #n")
    expect(out).not.toStartWith('noted')
    // origin: Q-3 "a reserved tag" — the error says the tag is reserved
    expect(out.toLowerCase()).toContain('reserved')
    // origin: Q-3 "naming the reserved set" — every reserved name appears in the error
    for (const name of RESERVED) expect(out).toContain(name)
    // origin: Q-3 "or `L` followed by digits" — the L-form is named too (as L<k>, L<n>, L\d+, L[0-9]… or in words)
    expect(out).toMatch(/\bL(<[A-Za-z]+>|\\d|\[0-9\]|\d| followed by digits)/)
  }
})

test('T4: memory_note with a reserved tag writes no note', async ($, on) => {
  const w = world(on)
  for (const tag of [...RESERVED, ...RESERVED_L]) {
    await $.tool.call({ tool: 'mcp__baton__memory_note', text: 'forged ' + tag, tag } as any)
  }
  // origin: Q-3 "and no note is written" — the memo CLI's `note` command never runs
  expect(w.noteCalls()).toHaveLength(0)
})
