// claude plugin test — T8: show the exact model on every agent (the pane, the detail view, the /baton text).
//
// Written from the spec (docs/designs/v7.6-tuning.md L104-125) and the operator's answers BEFORE the
// implementation (node T18, the red step of F18). Requirement ids are the rows of _orch/plan/traceability.yaml
// (cluster C8). Expected values come from the spec, the decided defaults in _orch/plan/decisions.md (Q-21, Q-22)
// and T18's work/model-ids.txt; none is copied from the implementation.
//
// The world: the engine beneath the mod answers from memory. A model request is a turn.step whose result's
// usage.model is the model that SERVED it (types: TurnUsage.model); agent.spawn's `model` is what was requested
// (an alias or a full id, types: AgentSpawnInput.model) and the binding may replace it during a run.
// Run membership is set the way T17's tests set it (refs/baton/build-20261019T125436Z/T17,
// mod/tests/t7-membership.test.ts): the session starts in the run's directory, whose _orch/manifest.json is a
// prime manifest naming this session's id in `prime_session` with a fresh heartbeat; outside a run there is no
// manifest at all. T18 work/membership-fixture.md records this.
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const OUT = '/proj/elsewhere' // fixture: a directory with no run
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
const SESSION_MODEL = 'claude-opus-5-5' // fixture: what $.session.model() answers (Q-22: "The prime is compared against `$.session.model()`")
const DATED_HAIKU = 'claude-haiku-4-5-20251001' // spec L109: the model the `haiku` alias served in onCrack round 4
const UNKNOWN = 'claude-nova-9-9-20990101' // Q-21: "a made-up id such as `claude-nova-9-9-20990101`, which is shown in full"
const SLOW = { timeoutMs: 20000 }

type Opts = { inRun: boolean; surfaces?: string[] }

function world(on: any, o: Opts) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const dir = o.inRun ? RUN : OUT
  const files = new Map<string, string>()
  if (o.inRun) {
    // T17's fixture (t7-membership.test.ts `world`): a prime manifest whose prime_session is this session, heard just now.
    const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
    files.set(RUN + '/_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  }
  const abs = (p: string) => (p.startsWith('/') ? p : dir + '/' + p)
  const state = { surfaces: o.surfaces ?? ['terminal'] }
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
  on('fs.list', () => ({ deny: 'ENOENT' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: dir }))
  on('session.root', () => ({ value: dir }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: SESSION_MODEL }))
  on('session.surfaces', () => ({ value: state.surfaces }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let stdout = '{}'
    if (argv.includes('recall')) stdout = JSON.stringify({ pattern: '.', total: 0, notes: [], blocks: [] })
    else if (argv.includes('wake')) stdout = JSON.stringify({ header: 'h', tiles: [], lines: [] })
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  // Core starts the agent on what it was asked for (or bound to): its result's model is that id (types: AgentSpawnResult.model).
  const ids = new Map<string, string>()
  on('agent.spawn', (_$: any, e: any) => ({ agentId: ids.get(e.description) ?? 'a-' + e.description, model: e.model ?? 'inherited' }))
  // A model request: the step's result names the model that served it (usage.model).
  const served = new Map<string, string>()
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: served.get(e.agentId ?? '') ?? e.model, input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 9000, cache_creation_input_tokens: 100 } }
  })
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  async function begin($: any) {
    await $.session.start({ cwd: dir, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: dir } as any)
    await clock.advance(2000)
    await clock.settle()
  }
  /** Spawn an agent (requested `model`, maybe none) and have one request of it served by `servedBy`. */
  async function agent($: any, a: { id: string; description: string; subagentType: string; model?: string; servedBy: string }) {
    ids.set(a.description, a.id)
    served.set(a.id, a.servedBy)
    await $.agent.spawn({ prompt: 'do the work', description: a.description, subagentType: a.subagentType, ...(a.model ? { model: a.model } : {}) } as any)
    const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model ?? 'inherited', messageCount: 1 } as any)
    for (let x = await g.next(); !x.done; x = await g.next());
    await clock.advance(10)
    await clock.settle()
  }
  async function pane($: any) {
    await $.command.run({ command: 'baton', args: '' } as any)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 60 } } as any })
  }
  /** The /baton text, as `claude -p` prints it (no surface). */
  async function batonText($: any) {
    state.surfaces = []
    const r: any = await $.command.run({ command: 'baton', args: '' } as any)
    state.surfaces = o.surfaces ?? ['terminal']
    return String(r.text ?? '')
  }
  return { clock, begin, agent, pane, batonText }
}

/** Every drawn row (a Box laid out as a row): its Text nodes, its buttons, and its text (buttons' labels left out). */
function rows(tree: any) {
  const out: { texts: any[]; buttons: any[]; text: string }[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Box' && n.props && n.props.flexDirection === 'row') {
      const texts: any[] = []
      const buttons: any[] = []
      const inner = (c: any) => {
        if (!c || typeof c !== 'object') return
        if (Array.isArray(c)) return c.forEach(inner)
        if (c.type === 'Text') texts.push(c)
        if (c.type === 'Button') buttons.push(c)
        ;(c.children || []).forEach(inner)
      }
      ;(n.children || []).forEach(inner)
      out.push({ texts, buttons, text: texts.map(textOf).join('') })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}
const textOf = (t: any): string => (t.children || []).map((c: any) => (typeof c === 'string' ? c : c && c.type === 'Text' ? textOf(c) : '')).join('')
const rowWith = async (ui: any, label: string) => {
  const r = rows(await ui.drawn()).find((x) => x.text.includes(label))
  if (!r) throw new Error('no drawn row holds ' + JSON.stringify(label) + ': ' + JSON.stringify(rows(await ui.drawn()).map((x) => x.text)))
  return r
}
/** The cell of a row that holds the model: the Text whose text names the family. */
const modelCell = (r: { texts: any[] }, family: RegExp) => r.texts.find((t) => family.test(textOf(t)))

// ------------------------------------------------------------------ an unknown model id

// R-C8-12 · spec L122: "plus an unknown ID shown in full." · Q-21 (decisions.md L254-260): "The unknown case is a made-up
// id such as `claude-nova-9-9-20990101`, which is shown in full."
test('an unknown model id is shown in full in the model cell of its agent row', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'n1', description: 'T8-nova', subagentType: 'Explore', model: UNKNOWN, servedBy: UNKNOWN })
  const ui = await w.pane($)
  const r = await rowWith(ui, 'T8-nova')
  expect(r.text).toContain(UNKNOWN) // Q-21 "shown in full": every character of the unknown id
  expect(r.text).not.toContain('claude-nova…') // spec L112 "never cut"
})

// ------------------------------------------------------------------ the prime's row and the session's row

// R-C8-05, R-C8-14 · spec L114: "The prime's row shows the session's own model, not a blank." · spec L123: "and a
// prime-row test," · Q-22 (decisions.md L261-267): "The prime is compared against `$.session.model()`" (the session's own model).
test("the prime's row shows the session's own model, not a blank", SLOW, async ($, on) => {
  const w = world(on, { inRun: true })
  await w.begin($)
  const ui = await w.pane($)
  const prime = await rowWith(ui, '◆ prime') // in a run the main session's row is the prime's (spec L114-115)
  expect(prime.text).toContain('opus 5.5') // spec L111 and L124 "the pane reads `opus 5.5` for the prime": $.session.model() is claude-opus-5-5 (fixture)
})

// R-C8-06, R-C8-14 · spec L114-115: "Outside a run the main session's row is labelled `session`, not `◆ prime`. On
// 2026-10-19 a monitor session's pane showed "◆ prime", which read as a second prime."
test("outside a run the main session's row is labelled session, not ◆ prime", SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  const ui = await w.pane($)
  const drawn = rows(await ui.drawn())
  expect(drawn.some((r) => r.text.includes('◆ prime'))).toBe(false) // spec L115 "not `◆ prime`"
  expect(drawn.some((r) => /^[^A-Za-z0-9]*session\b/.test(r.text.trimStart()))).toBe(true) // spec L114 "labelled `session`": a row whose label is `session` (after its glyph, if any)
})

// ------------------------------------------------------------------ the served model, and a mismatch

// R-C8-01, R-C8-13 · spec L111: "the family and version of the model that **served** each agent" · spec L109: "the `haiku`
// alias served `claude-haiku-4-5-20251001` ... and the pane would have said `haiku`." · spec L117: "(an alias resolving to an
// older version, a binding that didn't apply)"
test('an agent requested as an alias shows the served model, family and version', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'h1', description: 'T8-alias', subagentType: 'Explore', model: 'haiku', servedBy: DATED_HAIKU })
  const ui = await w.pane($)
  const r = await rowWith(ui, 'T8-alias')
  expect(r.text).toContain('haiku 4.5') // spec L112 "`haiku 4.5`": the served claude-haiku-4-5-20251001 (spec L109)
})

// R-C8-01, R-C8-13 · spec L117: "a binding that didn't apply" · Q-22 (decisions.md L261-267): "If the binding changed the model
// at `agent.spawn` (register.js:3152-3156), compare served to bound."
test('an agent bound to one model and served another shows the served model, family and version', SLOW, async ($, on) => {
  const w = world(on, { inRun: true })
  await w.begin($)
  await w.agent($, { id: 'b1', description: 'T8-bound', subagentType: 'baton:worker', servedBy: DATED_HAIKU })
  const ui = await w.pane($)
  const r = await rowWith(ui, 'T8-bound')
  expect(r.text).toContain('haiku 4.5') // spec L112 "`haiku 4.5`": what served (spec L111 "**served**")
})

// R-C8-07, R-C8-13 · spec L116-117: "When the served model differs from the one requested or bound (an alias resolving to an
// older version, a binding that didn't apply), the cell turns red." · Q-22: "Otherwise compare served to requested: a full id
// is compared ignoring a date suffix" and "If the binding changed the model ... compare served to bound."
test('when the served model differs from the requested one, the model cell is red', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'm1', description: 'T8-mismatch', subagentType: 'Explore', model: 'claude-sonnet-5-5', servedBy: DATED_HAIKU })
  await w.agent($, { id: 'k1', description: 'T8-matched', subagentType: 'Explore', model: 'claude-haiku-4-5', servedBy: DATED_HAIKU })
  const ui = await w.pane($)
  const bad = modelCell(await rowWith(ui, 'T8-mismatch'), /haiku/)
  expect(bad, 'the mismatched row has a model cell naming the served family').toBeTruthy() // spec L111: the cell names the served model's family (haiku, fixture)
  expect(bad.props && bad.props.color).toBe('red') // spec L117 "the cell turns red": sonnet 5.5 requested, haiku 4.5 served (fixture)
  const good = modelCell(await rowWith(ui, 'T8-matched'), /haiku/)
  expect(good && good.props && good.props.color).not.toBe('red') // Q-22 "a full id is compared ignoring a date suffix": claude-haiku-4-5 vs its dated id is no mismatch
})

// R-C8-07, R-C8-13 · spec L117: "a binding that didn't apply" · Q-22: "If the binding changed the model at `agent.spawn`
// (register.js:3152-3156), compare served to bound."
test('when the served model differs from the bound one, the model cell is red', SLOW, async ($, on) => {
  const w = world(on, { inRun: true })
  await w.begin($)
  await w.agent($, { id: 'b2', description: 'T8-boundred', subagentType: 'baton:worker', servedBy: DATED_HAIKU })
  const ui = await w.pane($)
  const cell = modelCell(await rowWith(ui, 'T8-boundred'), /haiku/)
  expect(cell, 'the row has a model cell naming the served family').toBeTruthy() // spec L111: the cell names the served model's family (haiku, fixture)
  expect(cell.props && cell.props.color).toBe('red') // spec L117 "the cell turns red": a worker is bound to claude-opus-5-5 in a run (binding.mjs FRONTIER), haiku served
})

// R-C8-08 · spec L117-118: "The agent's detail view (Enter) and the `/baton` text then show the requested and served full IDs."
test("on a mismatch the agent's detail view shows the requested and the served full IDs", SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'm2', description: 'T8-detail', subagentType: 'Explore', model: 'claude-sonnet-5-5', servedBy: DATED_HAIKU })
  const ui = await w.pane($)
  const r = await rowWith(ui, 'T8-detail')
  expect(r.buttons.length, 'the row can be opened').toBeGreaterThan(0) // spec L118 "(Enter)": the row's own open control
  await ui.press({ key: r.buttons[0].props.key })
  await w.clock.advance(10)
  await w.clock.settle()
  const view = rows(await ui.drawn()).map((x) => x.text).join('\n')
  expect(view).toContain('claude-sonnet-5-5') // spec L118 "the requested ... full IDs": what was requested (fixture)
  expect(view).toContain(DATED_HAIKU) // spec L118 "and served full IDs": what served (fixture)
})

// R-C8-09 · spec L117-118: "The agent's detail view (Enter) and the `/baton` text then show the requested and served full IDs."
test('on a mismatch the /baton text shows the requested and the served full IDs', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'm3', description: 'T8-text', subagentType: 'Explore', model: 'claude-sonnet-5-5', servedBy: DATED_HAIKU })
  const text = await w.batonText($)
  expect(text).toContain('claude-sonnet-5-5') // spec L118 "the requested ... full IDs": what was requested (fixture)
  expect(text).toContain(DATED_HAIKU) // spec L118 "and served full IDs": what served (fixture)
})
