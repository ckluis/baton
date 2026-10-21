// claude plugin test — T8 amendment: reasoning effort in every agent row's model cell (cluster C8E).
//
// Written from the spec (docs/designs/v7.6-tuning.md L611-642), the engine probe it names
// (_orch/nodes/PLAN/work/effort-probe.md) and the planner's display details (_orch/plan/decisions/D-T8E-*.md)
// BEFORE the implementation (node T118E, the red step of F118E). Requirement ids are the rows R-C8E-* of
// _orch/plan/traceability.yaml. Expected values come from the spec, those decisions and the inbox answers
// (Q-10, Q-11); none is copied from the implementation.
//
// The world, as effort-probe.md names it:
//   served effort     = `effort.level` of a classic hook input (here `classic.PostToolUse`) carrying the agent's
//                       `agent_id`; without an `agent_id` it is the main loop's (the prime's or the `session` row).
//   configured effort = `effort` of the agent's `turn.step` request (`agentId`; absent on main).
// Run membership is set the way the landed C8 tests set it (refs/baton/build-20261019T125436Z/T18,
// mod/tests/t8-model-pane.test.ts `world`): in a run the session starts in the run's directory, whose
// _orch/manifest.json is a prime manifest naming this session's id in `prime_session` with a fresh heartbeat;
// outside a run there is no manifest at all.
//
// Every assertion is on the model cell (or the model column's width), never on a whole rendered row string:
// C8, C9, C10 and C11 all change agent rows (hazard H28). The model cell is located from the drawn header: the
// header's `model` Text is the column's width plus the gap after it, and the row's cell is the run of Texts that
// starts at the Text naming the model's family and fills that width.
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const OUT = '/proj/elsewhere' // fixture: a directory with no run
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
const OPUS = 'claude-opus-5-5' // spec L620: "A served `high` on `claude-opus-5-5`"; also the session's model (fixture)
const SONNET = 'claude-sonnet-5-5' // fixture: a requested model that differs from the served OPUS (T8's model mismatch)
const DATED_HAIKU = 'claude-haiku-4-5-20251001' // fixture: a narrower row's model (T8 spec L109)
const GAP = 2 // harness fact, not an expected value: the two spaces after the model header title (table.mjs header layout)
const SLOW = { timeoutMs: 30000 }
const len = (s: string) => [...s].length

type Opts = { inRun: boolean }

function world(on: any, o: Opts) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const dir = o.inRun ? RUN : OUT
  const files = new Map<string, string>()
  if (o.inRun) {
    // T18's fixture (t8-model-pane.test.ts `world`, after T17's): a prime manifest whose prime_session is this session, heard just now.
    const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
    files.set(RUN + '/_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  }
  const abs = (p: string) => (p.startsWith('/') ? p : dir + '/' + p)
  const state = { surfaces: ['terminal'] as string[] }
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
  on('session.model', () => ({ value: OPUS }))
  on('session.surfaces', () => ({ value: state.surfaces }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  // The settings hooks beneath the mod (core) answer a PostToolUse with nothing to add.
  on('classic.PostToolUse', () => ({}))
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
  // Core starts the agent on what it was asked for: its result's model is that id (types: AgentSpawnResult.model).
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

  let steps = 0
  let uses = 0
  const settle = async () => {
    await clock.advance(10)
    await clock.settle()
  }
  async function begin($: any) {
    await $.session.start({ cwd: dir, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: dir } as any)
    await clock.advance(2000)
    await clock.settle()
  }
  /** One model request of `agentId` (none: main), carrying a configured `effort` when given (effort-probe.md §2). */
  async function step($: any, agentId: string | undefined, model: string, effort?: string | number) {
    const g = $.turn.step({ ...(agentId ? { agentId } : {}), turnId: 't-' + (agentId ?? 'main') + '-' + steps, index: steps++, model, messageCount: 1, ...(effort !== undefined ? { effort } : {}) } as any)
    for (let x = await g.next(); !x.done; x = await g.next());
    await settle()
  }
  /** Spawn an agent requested as `model` and have one request of it served by `servedBy` (configured `effort` if given). */
  async function agent($: any, a: { id: string; description: string; model: string; servedBy: string; effort?: string | number }) {
    ids.set(a.description, a.id)
    served.set(a.id, a.servedBy)
    await $.agent.spawn({ prompt: 'do the work', description: a.description, subagentType: 'Explore', model: a.model } as any)
    await step($, a.id, a.model, a.effort)
  }
  /** A classic hook input in a tool-use context: `agent_id` when from a subagent (none: main), the served `effort.level` (effort-probe.md §1). */
  async function served$($: any, agentId: string | undefined, level?: string) {
    const n = uses++
    await $.classic.PostToolUse({ session_id: SID, transcript_path: dir + '/transcript.jsonl', cwd: dir, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: { stdout: '' }, tool_use_id: 'tu-' + n, ...(agentId ? { agent_id: agentId } : {}), ...(level ? { effort: { level } } : {}) } as any)
    await settle()
  }
  async function pane($: any, bodyColumns = 160) {
    await $.command.run({ command: 'baton', args: '' } as any)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns, placement: 'dock', scroll: { bodyRows: 60 } } as any })
  }
  /** The /baton text, as `claude -p` prints it (no surface). */
  async function batonText($: any) {
    state.surfaces = []
    const r: any = await $.command.run({ command: 'baton', args: '' } as any)
    state.surfaces = ['terminal']
    return String(r.text ?? '')
  }
  return { clock, begin, step, agent, served: served$, pane, batonText }
}

// ------------------------------------------------------------------ reading the drawn pane

const textOf = (t: any): string => (t.children || []).map((c: any) => (typeof c === 'string' ? c : c && c.type === 'Text' ? textOf(c) : '')).join('')

/** Every drawn row (a Box laid out as a row): its top-level Text nodes (a Text's own nested Texts stay inside it) and its text. */
function rows(tree: any) {
  const out: { texts: any[]; text: string }[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Box' && n.props && n.props.flexDirection === 'row') {
      const texts: any[] = []
      const inner = (c: any) => {
        if (!c || typeof c !== 'object') return
        if (Array.isArray(c)) return c.forEach(inner)
        if (c.type === 'Text') return void texts.push(c)
        ;(c.children || []).forEach(inner)
      }
      ;(n.children || []).forEach(inner)
      out.push({ texts, text: texts.map(textOf).join('') })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}

/** A drawn Text as its runs of characters, each with the colour and dimness it is drawn in (nested Texts inherit). */
function runs(t: any, up: { color?: string; dim?: boolean } = {}): { text: string; color?: string; dim: boolean }[] {
  const p = t.props || {}
  const own = { color: p.color ?? up.color, dim: p.dimColor ?? up.dim ?? false }
  const out: { text: string; color?: string; dim: boolean }[] = []
  for (const c of t.children || []) {
    if (typeof c === 'string') out.push({ text: c, color: own.color, dim: !!own.dim })
    else if (c && c.type === 'Text') out.push(...runs(c, own))
  }
  return out
}

/** The model column's drawn width: the header's `model` Text, less the gap after it. */
function modelWidth(tree: any) {
  for (const r of rows(tree)) {
    const h = r.texts.find((t) => textOf(t).trim() === 'model')
    if (h) return len(textOf(h)) - GAP
  }
  throw new Error('no drawn header holds a model column: ' + JSON.stringify(rows(tree).map((x) => x.text)))
}

const FAMILY = /^(opus|sonnet|haiku|fable)\b/ // spec L111 (T8): the cell names the model's family first

/** The model cell of the row whose text holds `label`: its text (right padding dropped) and its runs. */
async function cellOf(ui: any, label: string | RegExp) {
  const tree = await ui.drawn()
  const w = modelWidth(tree)
  const all = rows(tree)
  const row = all.find((x) => (typeof label === 'string' ? x.text.includes(label) : label.test(x.text.trimStart())))
  if (!row) throw new Error('no drawn row holds ' + String(label) + ': ' + JSON.stringify(all.map((x) => x.text)))
  const i = row.texts.findIndex((t) => FAMILY.test(textOf(t)))
  if (i < 0) throw new Error('row ' + String(label) + ' has no Text naming a model family: ' + JSON.stringify(row.text))
  const parts: any[] = []
  let used = 0
  for (let k = i; k < row.texts.length && used < w; k++) {
    parts.push(row.texts[k])
    used += len(textOf(row.texts[k]))
  }
  const rs = parts.flatMap((t) => runs(t))
  return { text: rs.map((r) => r.text).join('').trimEnd(), runs: rs, width: w }
}

const PRIME = '◆ prime' // T8 spec L114-115: in a run the main session's row is the prime's
const SESSION = /^[^A-Za-z0-9]*session\b/ // T8 spec L114: outside a run the main session's row is labelled `session`

// ------------------------------------------------------------------ a served effort

// R-C8E-01, R-C8E-02, R-C8E-04 · spec L619-622: "Every agent row's model cell shows the agent's reasoning effort after its
// exact model, joined by ` · `. A served `high` on `claude-opus-5-5` reads `opus 5.5 · high`." · "The served effort is the
// `effort.level` of the latest classic hook input that carries the agent's `agent_id`." · D-T8E-separator, D-T8E-effort-sources.
test("an agent served high shows opus 5.5 · high in its model cell", SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 's1', description: 'T8E-served', model: OPUS, servedBy: OPUS })
  await w.served($, 's1', 'high') // effort-probe.md §1: classic input with the agent's agent_id, effort { level }
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-served')
  expect(c.text).toBe('opus 5.5 · high') // spec L620 "reads `opus 5.5 · high`" (D-T8E-separator: space, U+00B7, space)
})

// R-C8E-03, R-C8E-05 · spec L620-623: "The prime's row and the `session` row follow the same rule." · "For the prime's or the
// `session` row, it is the latest such input without an `agent_id`."
test("the prime's row, given a classic input without an agent_id carrying high, shows opus 5.5 · high", SLOW, async ($, on) => {
  const w = world(on, { inRun: true })
  await w.begin($)
  await w.served($, undefined, 'high') // effort-probe.md §1: no agent_id is the main loop, the prime's row in a run
  const ui = await w.pane($)
  const c = await cellOf(ui, PRIME)
  expect(c.text).toBe('opus 5.5 · high') // spec L620 "reads `opus 5.5 · high`"; the session model is claude-opus-5-5 (fixture)
})

// R-C8E-03, R-C8E-05 · spec L620-623: "The prime's row and the `session` row follow the same rule." · "For the prime's or the
// `session` row, it is the latest such input without an `agent_id`."
test("outside a run the session row, given a classic input without an agent_id carrying high, shows opus 5.5 · high", SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.served($, undefined, 'high') // effort-probe.md §1: no agent_id is the main loop, the `session` row outside a run
  const ui = await w.pane($)
  const c = await cellOf(ui, SESSION)
  expect(c.text).toBe('opus 5.5 · high') // spec L620 "reads `opus 5.5 · high`"; the session model is claude-opus-5-5 (fixture)
})

// ------------------------------------------------------------------ a configured-only effort, marked cfg

// R-C8E-06, R-C8E-07, R-C8E-08 · spec L626-630: "The configured effort is the `effort` of the agent's latest `turn.step`
// request" · "When only the configured effort is known, the cell shows it followed by a dim `cfg`: `opus 5.5 · high cfg`. A
// configured effort is never shown as served" · D-T8E-cfg-marker · verdict PLAN r22 P2-1 (optional c4 addition): the prime's
// own served high must not reach this agent's row.
test('an agent whose turn.step carries high and no classic input an effort shows opus 5.5 · high cfg', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.served($, undefined, 'high') // the main loop's served effort (no agent_id): never this agent's (spec L622-623)
  await w.agent($, { id: 'c1', description: 'T8E-cfg', model: OPUS, servedBy: OPUS, effort: 'high' }) // effort-probe.md §2: turn.step effort
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-cfg')
  expect(c.text).toBe('opus 5.5 · high cfg') // spec L629-630 "`opus 5.5 · high cfg`" (D-T8E-cfg-marker)
})

// R-C8E-07 · spec L629: "the cell shows it followed by a dim `cfg`" · D-T8E-cfg-marker: "Only `cfg` is dim. The model and the
// effort keep the cell's colour."
test('in a configured-only cell the cfg text is dim and the model and effort text are not', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'c2', description: 'T8E-dim', model: OPUS, servedBy: OPUS, effort: 'high' })
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-dim')
  const cfg = c.runs.filter((r) => /cfg/.test(r.text))
  expect(cfg.length, 'the cell draws a cfg mark').toBeGreaterThan(0) // spec L629 "followed by a dim `cfg`"
  expect(cfg.every((r) => r.dim && r.text.trim() === 'cfg')).toBe(true) // D-T8E-cfg-marker "Only `cfg` is dim": cfg in a dim run of its own
  const rest = c.runs.filter((r) => /opus|5\.5|high/.test(r.text))
  expect(rest.length).toBeGreaterThan(0) // spec L629 "`opus 5.5 · high cfg`": the model and effort are drawn
  expect(rest.some((r) => r.dim)).toBe(false) // D-T8E-cfg-marker "The model and the effort keep the cell's colour" (not dim)
})

// R-C8E-04, R-C8E-09 · spec L630-631: "an effort without `cfg` appears only once a served effort has been seen for that agent."
test('once a classic input with the agent_id carries high, the configured-only cell drops cfg', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'c3', description: 'T8E-seen', model: OPUS, servedBy: OPUS, effort: 'high' })
  await w.served($, 'c3', 'high') // effort-probe.md §1: now a served effort has been seen for c3
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-seen')
  expect(c.text).toBe('opus 5.5 · high') // spec L630-631 "an effort without `cfg` appears only once a served effort has been seen"
})

// ------------------------------------------------------------------ no effort

// R-C8E-10 · spec L632-633: "When neither effort is known (a model without effort support), the cell shows the model alone,
// with no ` · `." · D-T8E-no-effort: "The cell shows the model alone, exactly as T8 draws it". OQ7 preservation guard
// (_orch/inbox/OQ7.answer.md): holds at the run tip, which records no effort (effort-probe.md §5).
test('guard: an agent with no effort on its turn.step or classic inputs shows its model alone, with no ·', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'n1', description: 'T8E-none', model: OPUS, servedBy: OPUS }) // turn.step without effort
  await w.served($, 'n1') // a classic input with the agent_id and no effort (effort-probe.md §1: "absent ... for models without effort support")
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-none')
  expect(c.text).not.toContain(' · ') // spec L633 "with no ` · `"
  expect(c.text).toBe('opus 5.5') // spec L632 "the cell shows the model alone"; T8 spec L111 "`opus 5.5`"
})

// ------------------------------------------------------------------ an integer budget

// R-C8E-11 · spec L634: "An effort given as an integer budget shows as its digits: `opus 5.5 · 8000`." · D-T8E-integer-budget:
// "a configured-only `8000` reads `opus 5.5 · 8000 cfg`" (turn.step effort is `string | number`, effort-probe.md §2).
test('an agent whose turn.step carries the integer 8000 shows opus 5.5 · 8000 cfg', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'i1', description: 'T8E-budget', model: OPUS, servedBy: OPUS, effort: 8000 })
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-budget')
  expect(c.text).toBe('opus 5.5 · 8000 cfg') // spec L634 "shows as its digits"; D-T8E-integer-budget "`opus 5.5 · 8000 cfg`"
})

// ------------------------------------------------------------------ a mismatch in red

// R-C8E-12 · spec L635-636: "When the served effort differs from the configured one, the cell turns red, like T8's model
// mismatch." · D-T8E-mismatch-colour: "The whole model cell turns red".
test('configured high and served medium turn the model cell red', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'r1', description: 'T8E-downgrade', model: OPUS, servedBy: OPUS, effort: 'high' }) // configured high
  await w.served($, 'r1', 'medium') // served medium: a silent downgrade (effort-probe.md §1)
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-downgrade')
  const model = c.runs.filter((r) => /opus/.test(r.text))
  expect(model.length).toBeGreaterThan(0) // T8 spec L111: the cell names the served family (opus, fixture)
  expect(model.every((r) => r.color === 'red')).toBe(true) // spec L635 "the cell turns red" (D-T8E-mismatch-colour: the whole cell)
})

// R-C8E-13 · spec L636: "Equal efforts leave the cell's colour as T8 sets it." · D-T8E-mismatch-colour. OQ7 preservation guard
// (_orch/inbox/OQ7.answer.md): holds at the run tip, which records no effort.
test('guard: configured and served both high leave the model cell not red', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'r2', description: 'T8E-equal', model: OPUS, servedBy: OPUS, effort: 'high' }) // configured high; served model = requested
  await w.served($, 'r2', 'high') // served high
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-equal')
  expect(c.runs.some((r) => r.text.trim() && r.color === 'red')).toBe(false) // spec L636 "Equal efforts leave the cell's colour as T8 sets it": T8 sets no red (served = requested)
})

// R-C8E-14 · spec L636-637: "A served effort with no configured one to compare against is not a mismatch." · D-T8E-mismatch-colour.
// OQ7 preservation guard (_orch/inbox/OQ7.answer.md): holds at the run tip, which records no effort.
test('guard: a served medium with no configured effort leaves the model cell not red', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'r3', description: 'T8E-alone', model: OPUS, servedBy: OPUS }) // no configured effort; served model = requested
  await w.served($, 'r3', 'medium')
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-alone')
  expect(c.runs.some((r) => r.text.trim() && r.color === 'red')).toBe(false) // spec L636-637 "is not a mismatch"
})

// R-C8E-13 · spec L635-636: "like T8's model mismatch. Equal efforts leave the cell's colour as T8 sets it." · D-T8E-mismatch-colour:
// "Equal efforts leave the cell's colour as T8 sets it, so a model mismatch still shows red." OQ7 preservation guard
// (_orch/inbox/OQ7.answer.md): T8's model-mismatch red, landed by F18, holds at the run tip.
test('guard: a model mismatch with equal efforts keeps the model cell red', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'r4', description: 'T8E-modelred', model: SONNET, servedBy: OPUS, effort: 'high' }) // sonnet 5.5 requested, opus 5.5 served; configured high
  await w.served($, 'r4', 'high') // served high: efforts equal
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-modelred')
  const model = c.runs.filter((r) => /opus/.test(r.text))
  expect(model.length).toBeGreaterThan(0) // T8 spec L111: the cell names the served family (opus, fixture)
  expect(model.every((r) => r.color === 'red')).toBe(true) // T8 spec L116-117 "the cell turns red"; spec L636 equal efforts leave it
})

// ------------------------------------------------------------------ the /baton text

// R-C8E-15 · spec L638: "The `/baton` text shows the same cell text, `cfg` included." · D-T8E-text-form.
test('the /baton text shows opus 5.5 · high cfg for the configured-only agent', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'c4', description: 'T8E-text', model: OPUS, servedBy: OPUS, effort: 'high' })
  const text = await w.batonText($)
  const line = text.split('\n').find((l) => l.includes('T8E-text'))
  expect(line, 'the /baton text has a line for the agent').toBeTruthy() // T8: the /baton text draws every agent row
  expect(line).toContain('opus 5.5 · high cfg') // spec L638 "the same cell text, `cfg` included" (D-T8E-text-form: plain text)
})

// ------------------------------------------------------------------ the model column

// R-C8E-16 · spec L639: "The model column keeps Q-10: it sizes to its widest cell, effort and `cfg` included," · Q-10
// (_orch/inbox/Q-10.answer.md): the column sizes to its widest value.
test('the model column is as wide as its widest cell, opus 5.5 · high cfg, 19 characters', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'w1', description: 'T8E-wide', model: OPUS, servedBy: OPUS, effort: 'high' }) // `opus 5.5 · high cfg`
  await w.agent($, { id: 'w2', description: 'T8E-narrow', model: DATED_HAIKU, servedBy: DATED_HAIKU }) // `haiku 4.5`, narrower
  const ui = await w.pane($)
  expect(modelWidth(await ui.drawn())).toBe(19) // spec L629 "`opus 5.5 · high cfg`" is 19 characters; spec L639 "sizes to its widest cell"
})

// R-C8E-18, R-C8E-19 · spec L639-640: "It keeps Q-11: it never drops at any pane width. The cell is never cut." · Q-11
// (_orch/inbox/Q-11.answer.md) · D-T8E-width-range: "every pane width from 1 to 400 columns".
test('at every pane width from 1 to 400 the served-high model cell holds opus 5.5 · high whole', { timeoutMs: 180000 }, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'p1', description: 'T8E-width', model: OPUS, servedBy: OPUS })
  await w.served($, 'p1', 'high')
  const ui = await w.pane($, 400)
  const bad: string[] = []
  for (let cols = 1; cols <= 400; cols++) {
    await ui.redraw({ title: 'baton', isFocused: true, bodyColumns: cols, placement: 'dock', scroll: { bodyRows: 60 } } as any)
    const c = await cellOf(ui, 'T8E-width')
    if (c.text !== 'opus 5.5 · high') bad.push(cols + ': ' + JSON.stringify(c.text))
  }
  expect(bad).toEqual([]) // spec L620 "`opus 5.5 · high`" at every width (L640 "never drops", "never cut"; D-T8E-width-range 1..400)
})

// ------------------------------------------------------------------ the latest value wins, keyed by its agent

// R-C8E-04 · spec L622: "The served effort is the `effort.level` of the latest classic hook input that carries the agent's
// `agent_id`." · D-T8E-effort-sources: "The latest value of each wins."
test('a later classic input carrying medium replaces high: the cell shows opus 5.5 · medium', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'l1', description: 'T8E-latest', model: OPUS, servedBy: OPUS })
  await w.served($, 'l1', 'high')
  await w.served($, 'l1', 'medium') // the latest served effort
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-latest')
  expect(c.text).toBe('opus 5.5 · medium') // spec L622 "the latest classic hook input": a silent downgrade mid-run shows
})

// R-C8E-06 · spec L626: "The configured effort is the `effort` of the agent's latest `turn.step` request" · D-T8E-effort-sources.
test('a later turn.step carrying low replaces high: the cell shows opus 5.5 · low cfg', SLOW, async ($, on) => {
  const w = world(on, { inRun: false })
  await w.begin($)
  await w.agent($, { id: 'l2', description: 'T8E-cfglatest', model: OPUS, servedBy: OPUS, effort: 'high' })
  await w.step($, 'l2', OPUS, 'low') // the latest configured effort
  const ui = await w.pane($)
  const c = await cellOf(ui, 'T8E-cfglatest')
  expect(c.text).toBe('opus 5.5 · low cfg') // spec L626 "the agent's latest `turn.step` request"; L629 "followed by a dim `cfg`"
})

// R-C8E-04 · spec L622: "the latest classic hook input that carries the agent's `agent_id`": an effort is keyed by its agent.
// Verdict PLAN r22 P2-1: run in both orders and assert each agent's own cell each time, so a mutant that keeps one served
// effort for every subagent fails in one order or the other (work/mutants.txt).
for (const order of [['A', 'B'], ['B', 'A']] as const) {
  test(`two agents keep their own served efforts (${order[0]}'s input first, then ${order[1]}'s)`, SLOW, async ($, on) => {
    const w = world(on, { inRun: false })
    await w.begin($)
    await w.agent($, { id: 'ka', description: 'T8E-agentA', model: OPUS, servedBy: OPUS })
    await w.agent($, { id: 'kb', description: 'T8E-agentB', model: OPUS, servedBy: OPUS })
    const level = { A: 'high', B: 'low' } as const // fixture: A's input carries high, B's carries low (criterion 17)
    for (const who of order) await w.served($, who === 'A' ? 'ka' : 'kb', level[who])
    const ui = await w.pane($)
    const a = await cellOf(ui, 'T8E-agentA')
    const b = await cellOf(ui, 'T8E-agentB')
    expect(b.text).toBe('opus 5.5 · low') // spec L622 B's own agent_id input carried low
    expect(b.text).not.toContain('high') // spec L622: A's effort is A's, never B's
    expect(a.text).toBe('opus 5.5 · high') // spec L622 A's own agent_id input carried high (verdict PLAN r22 P2-1)
  })
}

// R-C8E-05 · spec L622-623: "For the prime's or the `session` row, it is the latest such input without an `agent_id`."
test("a subagent's classic input never sets the prime's effort", SLOW, async ($, on) => {
  const w = world(on, { inRun: true })
  await w.begin($)
  await w.served($, undefined, 'high') // the main loop: no agent_id
  await w.agent($, { id: 'q1', description: 'T8E-sub', model: OPUS, servedBy: OPUS })
  await w.served($, 'q1', 'low') // a later input with a subagent's agent_id
  const ui = await w.pane($)
  const c = await cellOf(ui, PRIME)
  expect(c.text).toBe('opus 5.5 · high') // spec L623 "the latest such input without an `agent_id`": the subagent's low is not the prime's
})
