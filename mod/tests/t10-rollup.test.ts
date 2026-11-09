// claude plugin test — T10 and its amendment, part R (node T110R, cluster C10): the two column groups
// of the agent tree, `this agent` and `roll-up`.
// Written from the spec (docs/designs/v7.6-tuning.md L300-362, which wins over L248-275 where they
// conflict) and the operator's answers BEFORE the implementation (the split red step of F110).
// Requirement ids are the rows of _orch/plan/traceability.yaml (cluster C10). Expected values come from
// the spec, _orch/inbox/Q-57.answer.md, Q-53.answer.md, Q-11.answer.md, the decided defaults
// _orch/plan/decisions/D-T10-group-cells.md, D-T10-rollup-inclusive.md, D-T10-phase-row-cells.md and
// D-T10R-group-columns.md, and this file's own fixture; none is copied from the implementation.
// Hazard H28: C8, C9, C10 and C11 all change agent rows, so these tests never compare a whole row
// string; they read one cell of one row, or the header's labels.
import { expect, mock, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }

// ---- fixture -------------------------------------------------------------------------------------
// A plan of three phases (spec L309: "the phases P1..P5 in plan order"): P1 done, P2 running and
// dispatched twice (spec L317-318, Q-53: "Re-dispatched sub-orchestrators nest as siblings under their
// phase row, newest last"), P3 not started (spec L316: "A phase that has not started is a phase row
// with no children").
const GRAPH = [['T101', 1], ['T201', 2], ['T202', 2], ['T301', 3]].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join('')
const MANIFEST = { run_id: 'build-20261002T120000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P2' }
const MODEL = 'claude-opus-5-5' // fixture: the model that serves every request

// Prices set through the mod's `prices` option (userConfig), so every cost below is the fixture's own:
// $10 per million tokens for input, output and cache reads. A cache write is priced at 1.25x input
// (_orch/plan/decisions.md, Q-28 H8: "Cache writes stay at the 5m price (1.25x input), as today").
const PRICE = { input: 10, output: 10, cacheRead: 10 } // fixture
const OPTIONS = { prices: JSON.stringify({ [MODEL]: PRICE }) } // the option is a JSON string
const costOf = (u: Usage) => ((u.input + u.output + u.cacheRead) * PRICE.input + u.cacheWrite * PRICE.input * 1.25) / 1e6

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }
const tokensOf = (u: Usage) => u.input + u.output + u.cacheRead + u.cacheWrite // D-T10-group-cells: "tokens (the sum of the token kinds)"

// The agents. Their labels hold no node id and no P<n> token, so a label found on a row names that row;
// they are short, so the agent cell (28 wide today) does not cut them even a level deeper in the tree.
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; usage: Usage }
const S1: Agent = { id: 's1', description: 'plan parser', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', usage: { input: 6000, output: 2000, cacheRead: 2000, cacheWrite: 0 } }
const S2A: Agent = { id: 's2a', description: 'build export', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 from _orch/phases/P2/brief.md', usage: { input: 20000, output: 10000, cacheRead: 6000, cacheWrite: 4000 } }
const W1: Agent = { id: 'w1', description: 'wk one', subagentType: 'baton:worker', prompt: 'Do the parser node', parent: 's2a', usage: { input: 60000, output: 20000, cacheRead: 32000, cacheWrite: 8000 } }
const V1: Agent = { id: 'v1', description: 'vf one', subagentType: 'baton:verifier', prompt: 'Verify the parser node', parent: 's2a', usage: { input: 16000, output: 4000, cacheRead: 6000, cacheWrite: 4000 } }
const S2B: Agent = { id: 's2b', description: 'export redo', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 again from _orch/phases/P2/brief.md', usage: { input: 30000, output: 10000, cacheRead: 6000, cacheWrite: 4000 } }
const W2: Agent = { id: 'w2', description: 'wk two', subagentType: 'baton:worker', prompt: 'Do the export node', parent: 's2b', usage: { input: 36000, output: 12000, cacheRead: 8000, cacheWrite: 4000 } }
const AGENTS = [S1, S2A, W1, V1, S2B, W2] // spawn order: S2B after S2A (newest last, Q-53)
const PRIME_USAGE: Usage = { input: 8000, output: 2000, cacheRead: 0, cacheWrite: 0 } // fixture: the prime's own requests

// Spec L341-342: `roll-up` is "the tokens and cost of the row's subtree, the row itself included";
// D-T10-rollup-inclusive: "a row's roll-up is the total over its whole subtree, the row itself included".
const sum = (xs: Agent[], f: (u: Usage) => number) => xs.reduce((n, a) => n + f(a.usage), 0)
const S2A_TREE = [S2A, W1, V1] // fixture: S2A with its worker and verifier
const P2_TREE = [S2A, W1, V1, S2B, W2] // fixture: both of P2's sub-orchestrator subtrees (Q-53)

async function world($: any, on: any, opts: { surfaces?: string[] } = {}) {
  const files: Record<string, string> = {
    '_orch/manifest.json': JSON.stringify(MANIFEST),
    '_orch/plan/graph.yaml': GRAPH,
    '_orch/phases/P1/envelope.json': JSON.stringify({ verdict: 'DONE', summary: 'plan' }),
    '_orch/phases/P1/brief.md': 'brief',
    '_orch/phases/P2/brief.md': 'brief',
    '_orch/nodes/T101/status.json': JSON.stringify({ verdict: 'DONE' }),
  }
  const dirs: Record<string, any[]> = {
    '_orch/phases': [{ name: 'P1', kind: 'directory' }, { name: 'P2', kind: 'directory' }],
    '_orch/nodes': ['T101', 'T201', 'T202'].map((name) => ({ name, kind: 'directory' })),
  }
  const find = (t: Record<string, any>, p: string) => Object.keys(t).find((k) => p === k || p.endsWith('/' + k))
  on('fs.read', (_$: any, e: any) => {
    const k = find(files, e.path)
    return k ? { value: files[k] } : { deny: 'ENOENT' }
  })
  on('fs.list', (_$: any, e: any) => {
    const k = find(dirs, e.path)
    return k ? { value: dirs[k] } : { deny: 'ENOENT' }
  })
  on('fs.write', () => ({ value: undefined }))
  on('fs.exists', (_$: any, e: any) => ({ value: !!find(files, e.path) }))
  const clock = mock.clock(on)
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'baton', title: 'baton', isShown: false, isFocused: false, isPlaced: true }] }))
  on('ui.render', ($$: any, e: any) => {
    const { Text } = $$.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.model', () => ({ value: MODEL }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('classic.SessionStart', () => ({}))
  mock.env(on, {})
  on('process.run', (_$: any, e: any) => {
    const a = [...e.argv]
    if (a[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    return { value: { exitCode: 0, stdout: JSON.stringify(a[0] === 'gh' ? [] : {}), stderr: '' } }
  })
  const byPrompt = new Map(AGENTS.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ model: MODEL, agentId: byPrompt.get(e.prompt)?.id ?? e.prompt }))
  // A model request: the step's result carries the usage of the agent that made it (none: the prime).
  const usageOf = new Map<string, Usage>(AGENTS.map((a) => [a.id, a.usage]))
  on('turn.step', async function* (_$: any, e: any) {
    const u = (e.agentId ? usageOf.get(e.agentId) : PRIME_USAGE) ?? PRIME_USAGE
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: u.cacheRead, cache_creation_input_tokens: u.cacheWrite } }
  })
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  await $.session.start({ cwd: '/work', surface: null } as any)
  await clock.advance(2000)
  await clock.settle()
  const step = async (agentId: string | undefined, turnId: string) => {
    const g = $.turn.step({ ...(agentId ? { agentId } : {}), turnId, index: 0, model: MODEL, messageCount: 1 } as any)
    for (let x = await g.next(); !x.done; x = await g.next());
  }
  await step(undefined, 't-prime')
  for (const a of AGENTS) {
    await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
    await step(a.id, 't-' + a.id)
  }
  await clock.advance(10)
  await clock.settle()
  return { clock }
}

const WIDE = 200 // fixture: a pane wide enough for every column
// The narrowest pane width these tests render (spec L347: "Neither column group is ever dropped at a
// narrow width"): 60 columns, the narrowest width any existing test of the pane draws the table at.
const NARROW = 60

async function mount($: any, cols = WIDE) {
  await $.command.run({ command: 'baton', args: '' } as any)
  return await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: cols, placement: 'dock', scroll: { bodyRows: 80 } } as any })
}

// ---- reading the table ---------------------------------------------------------------------------
// How these tests read the agent table (logged as _orch/plan/decisions/D-T10R-group-columns.md):
// - the group line is the drawn line that holds both group labels, `this agent` before `roll-up`
//   (the operator's order: "(this agent | roll-up)", Q-57);
// - the column-name line is the header line that names the `agent` column and the `cost` column;
//   as the table draws its header today, it is one Text per column, padded to the column's width;
// - each group has two cells, `tokens` and `cost` (D-T10-group-cells), so the first column named
//   `tokens` and the first named `cost` are the `this agent` cells, and the second of each are the
//   `roll-up` cells;
// - a row's cell is the row's text over that column's span, after the leading `›` (or its pad).

const textOf = (x: any): string =>
  typeof x === 'string' ? x
  : x == null ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : x.type === 'Button' || x.type === 'Link' ? String(x.props?.label ?? '') + textOf(x.children)
  : x.type === 'Box' && x.props?.columnGap ? (x.children ?? []).map(textOf).join(' '.repeat(Number(x.props.columnGap) || 1))
  : textOf(x.children)

/** Every outermost row Box, top to bottom. */
function rowBoxes(n: any, out: any[] = []): any[] {
  if (Array.isArray(n)) {
    n.forEach((c) => rowBoxes(c, out))
    return out
  }
  if (!n || typeof n !== 'object') return out
  if (n.type === 'Box' && n.props?.flexDirection === 'row') {
    out.push(n)
    return out
  }
  for (const c of n.children ?? []) rowBoxes(c, out)
  return out
}

/** A row's children after its leading `›` button (or the pad drawn in its place). */
function body(box: any): any[] {
  const kids = (box.children ?? []).filter((c: any) => c != null && c !== false)
  const first = kids[0]
  const lead = first && (first.type === 'Button' || (first.type === 'Text' && /^\s{0,2}$/.test(textOf(first)) && textOf(first).length > 0))
  return lead ? kids.slice(1) : kids
}
const bodyText = (box: any) => body(box).map(textOf).join('')

type Col = { title: string; start: number; end: number }
type Table = { group: string | null; cols: Col[]; rows: { box: any; text: string }[]; dump: string }

function table(tree: any): Table {
  const boxes = rowBoxes(tree)
  const all = boxes.map((b) => textOf(b))
  const dump = '\n' + all.map((t, i) => String(i).padStart(3) + '  ' + t).join('\n')
  const h = boxes.findIndex((b) => /\bagent\b/.test(bodyText(b)) && /\bcost\b/.test(bodyText(b)) && !/›/.test(textOf(b)))
  if (h < 0) throw new Error('no agent table header (a line naming the `agent` and `cost` columns) is drawn' + dump)
  const cols: Col[] = []
  let at = 0
  for (const c of body(boxes[h])) {
    const t = textOf(c)
    if (t.trim()) cols.push({ title: t.trim(), start: at, end: at + t.length })
    at += t.length
  }
  const gi = all.findIndex((t) => /this agent[\s\S]*roll-up/.test(t))
  const rows: { box: any; text: string }[] = []
  for (let i = h + 1; i < boxes.length; i++) {
    const t = textOf(boxes[i])
    if (/\bb goes back\b/.test(t)) break // the hint line under the agent table (T9's `b goes back`)
    rows.push({ box: boxes[i], text: bodyText(boxes[i]) })
  }
  return { group: gi >= 0 ? all[gi]! : null, cols, rows, dump }
}

type Cell = 'tokens' | 'cost'
/** The column of a group's cell: `this agent` is the first of its title, `roll-up` the second. */
function column(t: Table, group: 'this agent' | 'roll-up', cell: Cell): Col | null {
  const named = t.cols.filter((c) => c.title === cell)
  return named[group === 'this agent' ? 0 : 1] ?? null
}
const labelOf = (t: Table, r: { text: string }) => r.text.slice(0, t.cols[0] ? t.cols[0].end : 30)
function rowOf(t: Table, name: string) {
  const r = t.rows.find((x) => labelOf(t, x).includes(name))
  if (!r) throw new Error('no row labelled ' + JSON.stringify(name) + ' in the agent table' + t.dump)
  return r
}
// D-T10-phase-row-cells: "a phase row's label reads `P<n>`"; marks and tree lines may come before it.
const PHASE_LABEL = (n: number) => new RegExp('^[\\s›○●◉✓✗◆│├└─]*P' + n + '\\b')
function phaseRowOf(t: Table, n: number) {
  const r = t.rows.find((x) => PHASE_LABEL(n).test(labelOf(t, x)))
  if (!r) throw new Error('no P' + n + ' phase row in the agent table' + t.dump)
  return r
}
/** What a row draws in a group's cell: null when the table has no such cell. */
function cellOf(t: Table, r: { text: string }, group: 'this agent' | 'roll-up', cell: Cell): string | null {
  const c = column(t, group, cell)
  return c ? r.text.slice(c.start, c.end).trim() : null
}
const say = (t: Table, what: string) => what + '\n header columns: ' + JSON.stringify(t.cols.map((c) => c.title)) + t.dump

/** A drawn token count as a number: `40000`, `40,000`, `40k`, `1.2M`. */
function tokensNum(s: string): number {
  const m = /^([\d.,]+)\s*([kKmM]?)$/.exec(s.trim())
  if (!m) return NaN
  const v = Number(m[1]!.replace(/,/g, ''))
  return m[2]!.toLowerCase() === 'k' ? v * 1e3 : m[2]!.toLowerCase() === 'm' ? v * 1e6 : v
}
/** A drawn cost as a number of dollars: `$1.94`, `$12.3`. */
function usdNum(s: string): number {
  const m = /^\$([\d.,]+)$/.exec(s.trim())
  return m ? Number(m[1]!.replace(/,/g, '')) : NaN
}
const CENT = 0.0051 // a cost is drawn to the cent (or coarser above $10): half a cent of rounding allowed

// ---- the header ----------------------------------------------------------------------------------

// R-C10-64 · R-C10-65
// Spec L341: "Every row shows two column groups: `this agent` (the row's own tokens and cost)"
// _orch/inbox/Q-57.answer.md: "every row shows two column groups, this agent's own tokens/cost | the roll-up of its subtree"
// D-T10-group-cells: "under the header labels `this agent` and `roll-up`".
test('t10-rollup: the agent table header labels a column group `this agent`', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const above = t.dump.split('\n').filter((l) => /\bthis agent\b/.test(l))
  expect(above.length, say(t, 'no header line labels a column group `this agent`')).toBeGreaterThan(0) // origin: spec L341, the label `this agent`
})

// R-C10-64 · R-C10-66
// Spec L341-342: "and `roll-up` (the tokens and cost of the row's subtree, the row itself included)"
// _orch/inbox/Q-57.answer.md: operator, "the whole tree should be (this agent | roll-up)".
test('t10-rollup: the agent table header labels a second column group `roll-up`, after `this agent`', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  // origin: spec L341 and Q-57, the label `roll-up`, drawn after `this agent` ("(this agent | roll-up)")
  expect(t.group, say(t, 'no header line labels a group `roll-up` after the group `this agent`')).not.toBeNull()
})

// ---- this agent ----------------------------------------------------------------------------------

// R-C10-65 · R-C10-85
// Spec L341: "`this agent` (the row's own tokens and cost)"
// D-T10-group-cells: "each group has two cells, tokens (the sum of the token kinds) and cost".
test("t10-rollup: an agent row's `this agent` tokens cell shows its own tokens, the sum of its token kinds", { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const a of [W1, S2A]) {
    const cell = cellOf(t, rowOf(t, a.description), 'this agent', 'tokens')
    expect(cell, say(t, a.description + ': no `this agent` tokens cell is drawn')).not.toBeNull()
    // origin: the fixture's usage of this agent, summed over input, output, cache read and cache write (D-T10-group-cells)
    expect(tokensNum(cell!), say(t, a.description + ': `this agent` tokens cell reads ' + JSON.stringify(cell))).toBe(tokensOf(a.usage))
  }
})

// R-C10-65 · R-C10-85 · guard under _orch/inbox/OQ7.answer.md (passes at da5910c)
// Spec L341: "`this agent` (the row's own tokens and cost)"
// _orch/inbox/Q-57.answer.md: "this agent's own tokens/cost".
test("guard: an agent row's `this agent` cost cell shows its own cost", { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const a of [W1, S2A]) {
    const cell = cellOf(t, rowOf(t, a.description), 'this agent', 'cost')
    expect(cell, say(t, a.description + ': no `this agent` cost cell is drawn')).not.toBeNull()
    // origin: the fixture's usage of this agent at the fixture's prices (cache writes at 1.25x input, decisions.md Q-28)
    expect(Math.abs(usdNum(cell!) - costOf(a.usage)), say(t, a.description + ': `this agent` cost cell reads ' + JSON.stringify(cell) + ', want $' + costOf(a.usage).toFixed(2))).toBeLessThan(CENT)
  }
})

// ---- roll-up of an agent -------------------------------------------------------------------------

// R-C10-66 · R-C10-64
// Spec L341-342: "`roll-up` (the tokens and cost of the row's subtree, the row itself included)"
// D-T10-rollup-inclusive: "a row's roll-up is the total over its whole subtree, the row itself included".
test("t10-rollup: a sub-orchestrator's `roll-up` tokens cell sums its own tokens and every descendant's", { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const cell = cellOf(t, rowOf(t, S2A.description), 'roll-up', 'tokens')
  expect(cell, say(t, S2A.description + ': no `roll-up` tokens cell is drawn')).not.toBeNull()
  // origin: the fixture, S2A + its worker W1 + its verifier V1, each the sum of its token kinds (D-T10-rollup-inclusive)
  expect(tokensNum(cell!), say(t, S2A.description + ': `roll-up` tokens cell reads ' + JSON.stringify(cell))).toBe(sum(S2A_TREE, tokensOf))
})

// R-C10-66 · R-C10-64
// Spec L341-342: "the tokens and cost of the row's subtree, the row itself included"
// _orch/inbox/Q-57.answer.md: "the roll-up of its subtree".
test("t10-rollup: a sub-orchestrator's `roll-up` cost cell sums its own cost and every descendant's", { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const cell = cellOf(t, rowOf(t, S2A.description), 'roll-up', 'cost')
  expect(cell, say(t, S2A.description + ': no `roll-up` cost cell is drawn')).not.toBeNull()
  const want = sum(S2A_TREE, costOf) // origin: the fixture, S2A + W1 + V1 at the fixture's prices (D-T10-rollup-inclusive)
  expect(Math.abs(usdNum(cell!) - want), say(t, S2A.description + ': `roll-up` cost cell reads ' + JSON.stringify(cell) + ', want $' + want.toFixed(2))).toBeLessThan(CENT)
})

// R-C10-67 · R-C10-86
// Spec L344: "A row with no children leaves its roll-up group empty."
// _orch/inbox/Q-57.answer.md: operator, "agents without a rollup have an empty column".
test('t10-rollup: an agent row with no child rows draws nothing in either `roll-up` cell', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const a of [W1, V1, W2]) {
    for (const c of ['tokens', 'cost'] as const) {
      const cell = cellOf(t, rowOf(t, a.description), 'roll-up', c)
      // origin: Q-57, "an empty column": the `roll-up` cell is drawn, with nothing in it
      expect(cell, say(t, a.description + ' (no children): the table draws no `roll-up` ' + c + ' cell to leave empty')).toBe('')
    }
  }
})

// ---- phase rows ----------------------------------------------------------------------------------

// R-C10-68 · R-C10-87
// Spec L344: "A phase row is not an agent, so its this-agent group is empty"
// _orch/inbox/Q-57.answer.md: "A phase row is not an agent: its this-agent group is empty".
test('t10-rollup: a phase row draws nothing in either `this agent` cell', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const n of [1, 2]) {
    for (const c of ['tokens', 'cost'] as const) {
      const cell = cellOf(t, phaseRowOf(t, n), 'this agent', c)
      // origin: spec L344 and Q-57, a phase row's `this agent` cell is drawn and empty
      expect(cell, say(t, 'P' + n + ': its `this agent` ' + c + ' cell is not drawn empty')).toBe('')
    }
  }
})

// R-C10-69 · R-C10-66
// Spec L345: "and its roll-up group is filled." Spec L317-318: "A phase dispatched more than once has
// each of its sub-orchestrators as a child of its phase row." Q-53: "Re-dispatched sub-orchestrators
// nest as siblings under their phase row, newest last."
test("t10-rollup: a phase row with two sub-orchestrators shows in its `roll-up` tokens cell the sum over both subtrees", { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const cell = cellOf(t, phaseRowOf(t, 2), 'roll-up', 'tokens')
  expect(cell, say(t, 'P2: no `roll-up` tokens cell is drawn')).not.toBeNull()
  // origin: the fixture, S2A's subtree (S2A, W1, V1) + S2B's subtree (S2B, W2) (Q-53, D-T10-rollup-inclusive)
  expect(tokensNum(cell!), say(t, 'P2: `roll-up` tokens cell reads ' + JSON.stringify(cell))).toBe(sum(P2_TREE, tokensOf))
})

// R-C10-69 · R-C10-66
// Spec L345: "and its roll-up group is filled." Q-57: "its this-agent group is empty and its roll-up is filled".
test("t10-rollup: a phase row with two sub-orchestrators shows in its `roll-up` cost cell the sum over both subtrees", { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const cell = cellOf(t, phaseRowOf(t, 2), 'roll-up', 'cost')
  expect(cell, say(t, 'P2: no `roll-up` cost cell is drawn')).not.toBeNull()
  const want = sum(P2_TREE, costOf) // origin: the fixture, both P2 subtrees at the fixture's prices (Q-53, D-T10-rollup-inclusive)
  expect(Math.abs(usdNum(cell!) - want), say(t, 'P2: `roll-up` cost cell reads ' + JSON.stringify(cell) + ', want $' + want.toFixed(2))).toBeLessThan(CENT)
})

// R-C10-70
// Spec L345-346: "A pending phase row has no children, so both of its groups are empty."
// Spec L316: "A phase that has not started is a phase row with no children."
test('t10-rollup: a pending phase row draws nothing in either `roll-up` cell', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const c of ['tokens', 'cost'] as const) {
    const cell = cellOf(t, phaseRowOf(t, 3), 'roll-up', c)
    // origin: spec L345-346, the pending P3's `roll-up` cell is drawn and empty
    expect(cell, say(t, 'P3 (pending): its `roll-up` ' + c + ' cell is not drawn empty')).toBe('')
  }
})

// ---- narrow panes --------------------------------------------------------------------------------

// R-C10-71 · R-C10-88
// Spec L347: "Neither column group is ever dropped at a narrow width (Q-57, read with Q-11)."
// _orch/inbox/Q-57.answer.md: "Per Q-11 these columns never drop."
test('t10-rollup: at the narrowest pane width every row still draws its `this agent` group', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($, NARROW)
  const t = table(await ui.drawn())
  for (const c of ['tokens', 'cost'] as const) expect(column(t, 'this agent', c), say(t, 'at ' + NARROW + ' columns the `this agent` ' + c + ' cell is dropped')).not.toBeNull() // origin: spec L347, never dropped
  // origin: the fixture, every agent made requests, so each agent row's own cells are filled (spec L341)
  for (const a of [S1, S2A, W1, V1, S2B, W2]) {
    for (const c of ['tokens', 'cost'] as const) expect(cellOf(t, rowOf(t, a.description), 'this agent', c) || '', say(t, a.description + ': at ' + NARROW + ' columns its `this agent` ' + c + ' cell draws nothing')).not.toBe('')
  }
})

// R-C10-71 · R-C10-88
// Spec L347: "Neither column group is ever dropped at a narrow width (Q-57, read with Q-11)."
test('t10-rollup: at the narrowest pane width every row still draws its `roll-up` group', { ...LOADED, options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($, NARROW)
  const t = table(await ui.drawn())
  for (const c of ['tokens', 'cost'] as const) expect(column(t, 'roll-up', c), say(t, 'at ' + NARROW + ' columns the `roll-up` ' + c + ' cell is dropped')).not.toBeNull() // origin: spec L347, never dropped
  // origin: the fixture, the rows with children (spec L344: "its roll-up group is filled" on a phase row)
  const parents = [rowOf(t, S2A.description), rowOf(t, S2B.description), phaseRowOf(t, 1), phaseRowOf(t, 2)]
  for (const r of parents) {
    for (const c of ['tokens', 'cost'] as const) expect(cellOf(t, r, 'roll-up', c) || '', say(t, labelOf(t, r).trim() + ': at ' + NARROW + ' columns its `roll-up` ' + c + ' cell draws nothing')).not.toBe('')
  }
})
