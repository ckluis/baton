// claude plugin test — T10 and its amendment, part T (node T110, cluster C10): the one tree (prime,
// phase rows, sub-orchestrators, their agents), the phase rows' own cells, and the views they open.
// Written from the spec (docs/designs/v7.6-tuning.md L300-362, which wins over L248-275 where they
// conflict; L137-147) and the operator's answers BEFORE the implementation (the split red step of F110).
// Requirement ids are the rows of _orch/plan/traceability.yaml (cluster C10). Expected values come from
// the spec, _orch/inbox/Q-52 … Q-59, Q-12, Q-67 answers, the decided defaults _orch/plan/decisions/
// D-P1-tree-unphased.md, D-T10-phase-row-cells.md, Q-61.md, Q-62.md, D-T10-rollup-inclusive.md,
// D-T15-letters-pool (decisions.md), and this file's own fixture; none is copied from the implementation.
// Hazard H28: C8, C9, C10 and C11 all change agent rows, so these tests never compare a whole row
// string; they read one row's place in the tree (its parent), one cell, its mark, its key, or the view
// it opens.
// Tests named `guard: …` are preservation guards (_orch/inbox/OQ7.answer.md): the behaviour already
// holds at da5910c; see _orch/nodes/T110/work/guard-evidence.md.
import { expect, mock, test } from 'claude-code/testing'

// ---- fixture -------------------------------------------------------------------------------------
// A plan of three phases (spec L309: "the phases P1..P5 in plan order"): P1 done, P2 running and
// dispatched twice (spec L317-318), P3 not started (spec L316). `withP0` adds a phase P0 (spec L323).
const NODES: [string, number][] = [['T101', 1], ['T201', 2], ['T202', 2], ['T301', 3]] // fixture
const P0_NODES: [string, number][] = [['T001', 0]] // fixture: the plan's phase P0, for spec L323
const graphOf = (ns: [string, number][]) => ns.map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join('')
const MANIFEST = { run_id: 'build-20261002T120000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P2' }
const MODEL = 'claude-opus-5-5' // fixture

// Prices through the mod's `prices` option: $10 per million tokens of every kind used here.
const PRICE = { input: 10, output: 10, cacheRead: 10 } // fixture
const OPTIONS = { prices: JSON.stringify({ [MODEL]: PRICE }) }

// Every agent's usage is input and output only (no cache reads or writes), so its tokens are one
// number however a view counts them (fresh tokens, or the sum of the kinds, D-T10-group-cells).
type Usage = { input: number; output: number }
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; usage: Usage }
// Labels hold no node id, and a `P<n>` token only where a test needs it, never first, so a phase
// row (label `P<n>`, D-T10-phase-row-cells) is never confused with an agent row.
// S1: P1's sub-orchestrator, matched by its spawn prompt (spec L320, Q-58).
const S1: Agent = { id: 's1', description: 'plan parser', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', usage: { input: 6000, output: 2000 } }
// WX: a worker whose label names P2, spawned by S1 (criterion 13: only sub-orchestrators are matched).
const WX: Agent = { id: 'wx', description: 'helper for P2', subagentType: 'baton:worker', prompt: 'Help the parser', parent: 's1', usage: { input: 1000, output: 1000 } }
// S2A: P2's first sub-orchestrator, matched by its spawn prompt only; its label names no phase.
const S2A: Agent = { id: 's2a', description: 'build export', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 from _orch/phases/P2/brief.md', usage: { input: 20000, output: 10000 } }
const W1: Agent = { id: 'w1', description: 'wk one', subagentType: 'baton:worker', prompt: 'Do the export node', parent: 's2a', usage: { input: 60000, output: 20000 } }
const V1: Agent = { id: 'v1', description: 'vf one', subagentType: 'baton:verifier', prompt: 'Verify the export node', parent: 's2a', usage: { input: 16000, output: 4000 } }
// S2B: P2's second sub-orchestrator (a re-dispatch, spawned after S2A), matched by its label's `P2` token only.
const S2B: Agent = { id: 's2b', description: 'export redo P2', subagentType: 'baton:sub-orchestrator', prompt: 'Redo the export', usage: { input: 30000, output: 10000 } }
const W2: Agent = { id: 'w2', description: 'wk two', subagentType: 'baton:worker', prompt: 'Do the redo node', parent: 's2b', usage: { input: 36000, output: 12000 } }
// U: a sub-orchestrator tied to no phase (a gate's), its label, description and prompt name no phase.
const U: Agent = { id: 'u', description: 'gate briefer', subagentType: 'baton:sub-orchestrator', prompt: 'Brief gate G1', usage: { input: 2000, output: 1000 } }
const AGENTS = [S1, WX, S2A, W1, V1, S2B, W2, U] // spawn order

const tokensOf = (u: Usage) => u.input + u.output
const costOf = (u: Usage) => ((u.input + u.output) * PRICE.input) / 1e6
const sum = (xs: Agent[], f: (u: Usage) => number) => xs.reduce((n, a) => n + f(a.usage), 0)
// The phase's spend is its subtree's: every sub-orchestrator matched to P2 and their agents
// (spec L317-322 and L344-345: "its roll-up group is filled"; D-T10-rollup-inclusive: "a phase row's
// roll-up is the total of every sub-orchestrator subtree under it"). WX works under S1, not P2 (Q-58).
const P2_TREE = [S2A, W1, V1, S2B, W2] // fixture

async function world($: any, on: any, opts: { withP0?: boolean; agents?: Agent[] } = {}) {
  const nodes = opts.withP0 ? [...P0_NODES, ...NODES] : NODES
  const files: Record<string, string> = {
    '_orch/manifest.json': JSON.stringify(MANIFEST),
    '_orch/plan/graph.yaml': graphOf(nodes),
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
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.model', () => ({ value: MODEL }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
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
  const agents = opts.agents ?? AGENTS
  const byPrompt = new Map(agents.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ model: MODEL, agentId: byPrompt.get(e.prompt)?.id ?? e.prompt }))
  const usageOf = new Map<string, Usage>(agents.map((a) => [a.id, a.usage]))
  on('turn.step', async function* (_$: any, e: any) {
    const u = (e.agentId ? usageOf.get(e.agentId) : null) ?? { input: 1000, output: 1000 }
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
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
  for (const a of agents) {
    await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
    await step(a.id, 't-' + a.id)
  }
  await clock.advance(10)
  await clock.settle()
  return { clock }
}

async function mount($: any) {
  await $.command.run({ command: 'baton', args: '' } as any)
  return await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { bodyRows: 80 } } as any })
}

// ---- reading what is drawn -----------------------------------------------------------------------
// The agent table is read as tests/t10-rollup.test.ts reads it (D-T10R-group-columns): the header is
// the row naming the `agent` and `cost` columns, one Text per column; a row's cell is its text over a
// column's span after the leading `›`. A row's place in the tree is read from its label cell's indent:
// the column at which its first mark or word starts, after spaces and tree lines. A row's parent is the
// nearest row above it that starts further left (spec L309-311: the tree's nesting).

const textOf = (x: any): string =>
  typeof x === 'string' ? x
  : x == null ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : x.type === 'Button' || x.type === 'Link' ? String(x.props?.label ?? '') + textOf(x.children)
  : x.type === 'Box' && x.props?.columnGap ? (x.children ?? []).map(textOf).join(' '.repeat(Number(x.props.columnGap) || 1))
  : textOf(x.children)

function walk(n: any, f: (x: any) => void) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, f))
  if (!n || typeof n !== 'object') return
  f(n)
  for (const c of n.children ?? []) walk(c, f)
}

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

/** Every drawn line's text, top to bottom (a column Box stacks its children; anything else is one line). */
function lines(n: any, out: string[] = []): string[] {
  if (Array.isArray(n)) {
    n.forEach((c) => lines(c, out))
    return out
  }
  if (n && n.type === 'Box' && n.props?.flexDirection === 'column') {
    for (const c of n.children ?? []) lines(c, out)
    return out
  }
  if (n != null && n !== false) out.push(textOf(n))
  return out
}
const dumpOf = (tree: any) => '\n' + lines(tree).map((t, i) => String(i).padStart(3) + '  ' + t).join('\n')

type Col = { title: string; start: number; end: number }
type Row = { box: any; text: string; label: string; indent: number }
type Table = { cols: Col[]; rows: Row[]; dump: string }

const TREE_LINES = /[^\s│├└─]/ // the first char that is not a space or a tree line
function table(tree: any): Table {
  const boxes = rowBoxes(tree)
  const dump = dumpOf(tree)
  const h = boxes.findIndex((b) => /\bagent\b/.test(bodyText(b)) && /\bcost\b/.test(bodyText(b)) && !/›/.test(textOf(b)))
  if (h < 0) throw new Error('no agent table header (a line naming the `agent` and `cost` columns) is drawn' + dump)
  const cols: Col[] = []
  let at = 0
  for (const c of body(boxes[h])) {
    const t = textOf(c)
    if (t.trim()) cols.push({ title: t.trim(), start: at, end: at + t.length })
    at += t.length
  }
  const labelEnd = cols[0] ? cols[0].end : 30
  const rows: Row[] = []
  for (let i = h + 1; i < boxes.length; i++) {
    const all = textOf(boxes[i])
    if (/\bb goes back\b/.test(all)) break // the hint line under the agent table (T9's `b goes back`)
    const text = bodyText(boxes[i])
    const label = text.slice(0, labelEnd)
    rows.push({ box: boxes[i], text, label, indent: label.search(TREE_LINES) })
  }
  return { cols, rows, dump }
}

// D-T10-phase-row-cells: "a phase row's label reads `P<n>`"; a mark and tree lines may come before it.
const PHASE_LABEL = (n: number) => new RegExp('^[\\s›○●◉✓✗◆│├└─]*P' + n + '\\b')
const isPrime = (r: Row) => /◆\s*prime\b/.test(r.label) // the prime's row, as tests/t10-lines.test.ts finds it
const idxPhase = (t: Table, n: number) => t.rows.findIndex((r) => PHASE_LABEL(n).test(r.label))
const idxAgent = (t: Table, a: Agent) => t.rows.findIndex((r) => r.label.includes(a.description))
const idxPrime = (t: Table) => t.rows.findIndex(isPrime)
/** The row a row is drawn one level under: the nearest row above it that starts further left. */
function parentOf(t: Table, i: number): number {
  if (i < 0) return -1
  const me = t.rows[i]!.indent
  for (let j = i - 1; j >= 0; j--) if (t.rows[j]!.indent >= 0 && t.rows[j]!.indent < me) return j
  return -1
}
/** The rows drawn under row i: every row after it that starts further right, up to the next that does not. */
function subtreeOf(t: Table, i: number): number[] {
  const out: number[] = []
  for (let j = i + 1; j < t.rows.length && t.rows[j]!.indent > t.rows[i]!.indent; j++) out.push(j)
  return out
}
const nameOf = (t: Table, i: number) => (i < 0 ? '(no row: drawn at the top level)' : JSON.stringify(t.rows[i]!.label.trim()))
const say = (t: Table, what: string) => what + '\n header columns: ' + JSON.stringify(t.cols.map((c) => c.title)) + t.dump

function need(t: Table, i: number, what: string) {
  if (i < 0) throw new Error('no ' + what + ' row is drawn after the agent table header' + t.dump)
  return i
}

/** A cell of a row: its text over the column titled `title`, trimmed; null when no such column. */
function cellOf(t: Table, r: Row, title: string): string | null {
  const c = t.cols.find((x) => x.title === title)
  return c ? r.text.slice(c.start, c.end).trim() : null
}

/** The `›` button that leads a row (Enter on it under the focus raises the same press, Button docs). */
function openButton(box: any): any {
  const kids = (box.children ?? []).filter((c: any) => c != null && c !== false)
  const b = kids.find((c: any) => c.type === 'Button' && String(c.props?.label ?? '').includes('›'))
  return b ?? null
}
async function openRow(ui: any, t: Table, i: number, what: string) {
  const b = openButton(t.rows[i]!.box)
  if (!b || !b.props?.key) throw new Error(what + ': its row draws no `›` to press' + t.dump)
  await ui.press({ key: b.props.key })
  return lines(await ui.drawn())
}

/** Runs of step marks joined by `─` (a stepper, with or without its step names). */
function stepRuns(s: string): number[] {
  const re = /[●◉○✗](?:[^●◉○✗─]*─[^●◉○✗─]*[●◉○✗])*/g
  return (s.match(re) ?? []).map((m) => (m.match(/[●◉○✗]/g) ?? []).length)
}

/** Token figures drawn in a text: `218k`, `218,000`, `1.2M`. */
function tokenFigures(s: string): number[] {
  const out: number[] = []
  for (const m of s.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([kKmM])\b/g)) out.push(Number(m[1]!.replace(/,/g, '')) * (m[2]!.toLowerCase() === 'k' ? 1e3 : 1e6))
  for (const m of s.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g)) out.push(Number(m[1]!.replace(/,/g, '')))
  return out
}
const usdFigures = (s: string) => [...s.matchAll(/\$(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1]!.replace(/,/g, '')))

async function pressP(ui: any) {
  let key: string | null = null
  walk(await ui.drawn(), (x) => {
    if (!key && x.props && x.props.hotkey === 'p') key = x.props.key
  })
  if (!key) throw new Error('no element with hotkey p is drawn')
  await ui.press({ key })
}

// ---- the tree: phase rows under the prime ---------------------------------------------------------

// R-C10-29 · R-C10-30 · R-C10-80
// Spec L309: "The pane draws one tree: the prime, then the phases P1..P5 in plan order as rows of their own,"
// _orch/inbox/Q-52.answer.md: "phases are their own level under the prime, in plan order".
test('t10-phases: the rows labelled P1, P2 and P3 are drawn one level under the prime\'s row', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const prime = need(t, idxPrime(t), 'prime')
  for (const n of [1, 2, 3]) {
    const i = need(t, idxPhase(t, n), 'P' + n) // origin: the fixture's graph.yaml has phases 1, 2 and 3
    // origin: spec L309 and Q-52, a phase row's parent is the prime's row
    expect(parentOf(t, i), say(t, 'P' + n + ' is drawn under ' + nameOf(t, parentOf(t, i)) + ', not under the prime')).toBe(prime)
  }
})

// R-C10-30 · R-C10-80
// Spec L309: "the phases P1..P5 in plan order as rows of their own"; Q-52: "in plan order".
test('t10-phases: the phase rows under the prime are drawn in plan order, P1 before P2 before P3', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const prime = idxPrime(t)
  // "those phase rows": the phase rows drawn one level under the prime
  const under = (n: number) => t.rows.findIndex((r, i) => PHASE_LABEL(n).test(r.label) && prime >= 0 && parentOf(t, i) === prime)
  const at = [1, 2, 3].map(under)
  expect(at.every((i) => i >= 0), say(t, 'the phase rows under the prime: ' + JSON.stringify(at))).toBe(true) // origin: the fixture's three phases, spec L309
  expect(at[0]! < at[1]! && at[1]! < at[2]!, say(t, 'phase rows out of plan order: ' + JSON.stringify(at))).toBe(true) // origin: spec L309, plan order P1, P2, P3
})

// ---- the tree: sub-orchestrators under their phase rows -------------------------------------------

// R-C10-39 · R-C10-31 · R-C10-41
// Spec L319-320: "A sub-orchestrator is a child of phase P<n> when its role is sub-orchestrator and its
// label or description has the token `P<n>`," _orch/inbox/Q-58.answer.md: "the Q-14 role+label rule
// assigns a sub-orchestrator to its phase"; Q-14 option 1: "Owner from the label match (`P<n>` in the name or description)".
test('t10-phases: a sub-orchestrator whose label names P2 is drawn one level under the row labelled P2', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const s = need(t, idxAgent(t, S2B), S2B.description) // origin: the fixture, S2B's label `export redo P2`
  // origin: spec L319 and Q-58, its parent is the phase row P2
  expect(parentOf(t, s), say(t, S2B.description + ' is drawn under ' + nameOf(t, parentOf(t, s)))).toBe(idxPhase(t, 2))
  expect(PHASE_LABEL(2).test(t.rows[parentOf(t, s)]?.label ?? ''), say(t, S2B.description + ': its parent row is not labelled P2')).toBe(true) // origin: spec L319, phase P2
})

// R-C10-40 · R-C10-31
// Spec L320: "or its spawn prompt names `_orch/phases/P<n>/` (Q-58, the Q-14 rule)."
// Q-14 option 1: "or from the phase brief's path in the spawn prompt (`_orch/phases/P<n>/`)".
test('t10-phases: a sub-orchestrator whose spawn prompt names _orch/phases/P2/ and whose label names no phase is drawn one level under P2', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const s = need(t, idxAgent(t, S2A), S2A.description) // origin: the fixture, S2A's prompt names _orch/phases/P2/
  const p = parentOf(t, s)
  // origin: spec L320 and Q-58, its parent is the phase row P2
  expect(PHASE_LABEL(2).test(p >= 0 ? t.rows[p]!.label : ''), say(t, S2A.description + ' is drawn under ' + nameOf(t, p) + ', not under P2')).toBe(true)
})

// R-C10-39 · R-C10-32
// Spec L319: "A sub-orchestrator is a child of phase P<n> when its role is sub-orchestrator" — only
// sub-orchestrators are matched (Q-58); spec L311: "then under each sub-orchestrator its workers and verifiers".
// GUARD (preservation, not red): at da5910c a worker is already drawn under the agent that spawned it,
// and no phase row has children (work/probe-da5910c.md P-1; _orch/inbox/OQ7.answer.md).
test('guard: a worker whose label names P2, spawned by the P1 sub-orchestrator, is drawn under that sub-orchestrator, not under P2', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const w = need(t, idxAgent(t, WX), WX.description) // origin: the fixture, WX `helper for P2`, spawned by S1
  const s1 = need(t, idxAgent(t, S1), S1.description)
  expect(parentOf(t, w), say(t, WX.description + ' is drawn under ' + nameOf(t, parentOf(t, w)))).toBe(s1) // origin: the fixture's parent link, spec L311
  const p2 = need(t, idxPhase(t, 2), 'P2') // amended by GV4: the P2 row must be drawn, so the next check always runs (P2 gate item 4: no guard passes with zero assertions); the fixture's P2 has sub-orchestrator S2A
  expect(subtreeOf(t, p2).includes(need(t, idxAgent(t, S2A), S2A.description)), say(t, 'premise: the P2 row has its sub-orchestrator ' + S2A.description + ' drawn under it')).toBe(true) // GV4 sweep (P3-d4): without a subtree under P2, "not under P2" held by default
  // origin: Q-58, a worker is never matched to a phase: it is not in the P2 row's subtree
  expect(subtreeOf(t, p2).includes(w), say(t, WX.description + ' is drawn under P2')).toBe(false)
})

// R-C10-32 · R-C10-80
// Spec L310-311: "then under each phase row the sub-orchestrator(s) that ran it, then under each
// sub-orchestrator its workers and verifiers"; Q-52: "-> their workers and verifiers".
// GUARD (preservation, not red): already holds at da5910c (work/probe-da5910c.md P-2; OQ7).
test("guard: a sub-orchestrator's worker and verifier are drawn one level under its row", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const s = need(t, idxAgent(t, S2A), S2A.description)
  for (const a of [W1, V1]) {
    const i = need(t, idxAgent(t, a), a.description) // origin: the fixture, W1 and V1 spawned by S2A
    expect(parentOf(t, i), say(t, a.description + ' is drawn under ' + nameOf(t, parentOf(t, i)))).toBe(s) // origin: spec L311
  }
})

// R-C10-33
// Spec L311-313: "This supersedes L259-260: a phase row is not its sub-orchestrator's row, and the two are separate rows."
// Q-52: "prime -> P1..P5 in plan order -> the sub-orchestrator(s) that ran each phase".
// GUARD (preservation, not red): at da5910c the P2 row and the sub-orchestrator's row are already two
// rows (work/probe-da5910c.md P-3; OQ7).
test("guard: the row labelled P2 and the row of its sub-orchestrator are two distinct rows", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = need(t, idxPhase(t, 2), 'P2')
  const s = need(t, idxAgent(t, S2A), S2A.description)
  expect(p2, say(t, 'the P2 row is the sub-orchestrator\'s row')).not.toBe(s) // origin: spec L312, "the two are separate rows"
  expect(PHASE_LABEL(2).test(t.rows[s]!.label), say(t, S2A.description + "'s row is labelled P2")).toBe(false) // origin: spec L312, it is not the phase row
})

// R-C10-37 · R-C10-81
// Spec L317-318: "A phase dispatched more than once has each of its sub-orchestrators as a child of its phase row."
// _orch/inbox/Q-53.answer.md: "Re-dispatched sub-orchestrators nest as siblings under their phase row, newest last."
test('t10-phases: with two sub-orchestrators matched to P2, both are drawn one level under the row labelled P2', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const a of [S2A, S2B]) {
    const i = need(t, idxAgent(t, a), a.description) // origin: the fixture, S2A (by prompt) and S2B (by label) both match P2
    const p = parentOf(t, i)
    expect(PHASE_LABEL(2).test(p >= 0 ? t.rows[p]!.label : ''), say(t, a.description + ' is drawn under ' + nameOf(t, p) + ', not under P2')).toBe(true) // origin: spec L317, Q-53
  }
})

// R-C10-38 · R-C10-81
// Spec L318: "They are siblings in spawn order, newest last (Q-53)."
test('t10-phases: the two sub-orchestrator rows under P2 are drawn in spawn order, the newest last', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = idxPhase(t, 2)
  const a = idxAgent(t, S2A)
  const b = idxAgent(t, S2B)
  // "those two sub-orchestrator rows": the ones drawn one level under P2
  const under = [a, b].map((i) => p2 >= 0 && i >= 0 && parentOf(t, i) === p2)
  expect(under, say(t, 'S2A and S2B under P2: ' + JSON.stringify(under))).toEqual([true, true]) // origin: Q-53, siblings under their phase row
  expect(a, say(t, 'the newest sub-orchestrator is not drawn last')).toBeLessThan(b) // origin: Q-53 "newest last"; the fixture spawns S2A before S2B
})

// ---- phase rows: what they carry ------------------------------------------------------------------

// R-C10-35 · R-C10-83 · R-C10-11
// Spec L314-315: "A phase row is labelled `P<n>` and carries the phase's steps (briefed, dispatched,
// verified, approved). L261 stands, on the phase row."
// GUARD (preservation, not red): at da5910c the P2 row already draws the phase's four-step stepper
// (work/probe-da5910c.md P-4; OQ7).
test("guard: a phase row shows the phase's stepper of four steps", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = need(t, idxPhase(t, 2), 'P2')
  const rest = t.rows[p2]!.text.replace(/^[\s│├└─]*[●◉○✗✓◆]\s*(?=P\d)/, '') // the row's own mark is not a step
  // origin: spec L314, four steps: briefed, dispatched, verified, approved
  expect(stepRuns(rest), say(t, 'P2 draws no stepper of four steps')).toContain(4)
})

// R-C10-36 · R-C10-82
// Spec L316: "A phase that has not started is a phase row with no children."
// GUARD (preservation, not red): at da5910c the plan draws a P3 row (work/probe-da5910c.md P-5; OQ7).
test('guard: a phase that no agent matches is drawn as a row labelled with its id', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  expect(idxPhase(t, 3), say(t, 'no P3 row is drawn')).toBeGreaterThanOrEqual(0) // origin: the fixture's graph.yaml phase 3, which no agent matches
})

// R-C10-36 · R-C10-82
// Q-52.answer.md: "a pending phase is a phase row with no children"; spec L316.
// GUARD (preservation, not red): at da5910c no row is drawn under P3 (work/probe-da5910c.md P-6; OQ7).
test('guard: the pending phase row has no child rows', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p3 = need(t, idxPhase(t, 3), 'P3')
  // GV4 sweep (P3-d4): the premise, that a phase row draws child rows at all: P2's sub-orchestrator S2A is drawn under P2
  expect(subtreeOf(t, need(t, idxPhase(t, 2), 'P2')).includes(need(t, idxAgent(t, S2A), S2A.description)), say(t, 'premise: ' + S2A.description + ' is drawn under P2')).toBe(true)
  // origin: Q-52, "no children": no row after P3 starts further right than it
  expect(subtreeOf(t, p3).map((i) => t.rows[i]!.label.trim()), say(t, 'rows drawn under the pending P3')).toEqual([])
})

// R-C10-75
// Spec L348-349: "A pending phase row is dim, marked `○`, with `pending` in its state cell"
// _orch/plan/decisions/Q-62.md: "`pending` in the state cell".
test('t10-phases: the pending phase row shows `pending` in its state cell', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p3 = need(t, idxPhase(t, 3), 'P3')
  const c = t.cols.find((x) => x.title === 'state')
  expect(c, say(t, 'no `state` column')).toBeDefined() // origin: the agent table's state column (Q-62, "the state cell")
  // origin: spec L349 and Q-62, the word `pending`
  expect(t.rows[p3]!.text.slice(c!.start).trim(), say(t, 'P3 state cell')).toMatch(/^pending\b/)
})

// R-C10-73
// Spec L348: "A pending phase row is dim," Q-62: "A dim row".
test('t10-phases: the pending phase row is drawn dim', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p3 = need(t, idxPhase(t, 3), 'P3')
  const texts: any[] = []
  walk(body(t.rows[p3]!.box), (x) => {
    if (x.type === 'Text' && (x.children ?? []).some((c: any) => typeof c === 'string' && c.trim())) texts.push(x)
  })
  const bright = texts.filter((x) => x.props?.dimColor !== true).map(textOf)
  expect(texts.length, say(t, 'P3 draws no text')).toBeGreaterThan(0) // origin: Q-62, the row draws its mark and label `P3`
  expect(bright, say(t, 'P3 texts not dim')).toEqual([]) // origin: spec L348 and Q-62, "A dim row": every text of the row dim
})

// R-C10-74
// Spec L348: "marked `○`," Q-62: "A dim row with the mark `○`, the label `P<n>`".
test('t10-phases: the pending phase row is marked ○ before its label', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p3 = need(t, idxPhase(t, 3), 'P3')
  // origin: spec L348 and Q-62, the mark `○`, drawn where an agent row draws its mark, before the label
  expect(t.rows[p3]!.label, say(t, 'P3 label cell')).toMatch(/○\s*P3\b/)
})

// R-C10-77
// Spec L349-350: "A phase row's model and context cells are empty."
// D-T10-phase-row-cells: "Its model and context cells are empty ... its cells are empty rather than `—`".
test("t10-phases: a phase row's model cell is empty", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const n of [1, 2, 3]) {
    const r = t.rows[need(t, idxPhase(t, n), 'P' + n)]
    const c = cellOf(t, r!, 'model')
    expect(c, say(t, 'no `model` column')).not.toBeNull() // origin: the agent table's model column (D-T10-phase-row-cells)
    expect(c, say(t, 'P' + n + ' model cell')).toBe('') // origin: spec L349 and D-T10-phase-row-cells, empty
  }
})

// R-C10-77
// Spec L349-350: "A phase row's model and context cells are empty." D-T10-phase-row-cells.
test("t10-phases: a phase row's context cell is empty", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const n of [1, 2, 3]) {
    const r = t.rows[need(t, idxPhase(t, n), 'P' + n)]
    const c = cellOf(t, r!, 'context')
    expect(c, say(t, 'no `context` column')).not.toBeNull() // origin: the agent table's context column (D-T10-phase-row-cells)
    expect(c, say(t, 'P' + n + ' context cell')).toBe('') // origin: spec L349 and D-T10-phase-row-cells, empty
  }
})

// R-C10-34 · R-C10-09
// Spec L348: "A phase row's label reads `P<n>`." D-T10-phase-row-cells: "a phase row's label reads `P<n>`";
// _orch/plan/decisions/Q-61.md (adapted to the tree): "A pending row reads `P<n>` alone."
test("t10-phases: a phase row's label cell reads P<n>", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  for (const n of [1, 2, 3]) {
    const r = t.rows[need(t, idxPhase(t, n), 'P' + n)]
    const label = r!.label.replace(/^[\s›○●◉✓✗◆│├└─]*/, '').trim() // its mark and tree lines set aside
    // origin: D-T10-phase-row-cells, the label `P<n>` (a direct key letter may stand before it, Q-12)
    expect(label, say(t, 'P' + n + ' label cell reads ' + JSON.stringify(label))).toMatch(new RegExp('^(?:[a-z0-9]:?\\s+)?P' + n + '$'))
  }
})

// R-C10-72
// Spec L348-349: "A sub-orchestrator's row keeps its own dispatch label, as every agent row does."
// D-T10-phase-row-cells: "A sub-orchestrator's row under it keeps its own dispatch label and role".
test("t10-phases: a sub-orchestrator's row under a phase row keeps its own dispatch label", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = idxPhase(t, 2)
  // the row of S2A drawn one level under P2, found by its place in the tree, not by its label
  const kids = t.rows.map((_, i) => i).filter((i) => p2 >= 0 && parentOf(t, i) === p2)
  const labels = kids.map((i) => t.rows[i]!.label)
  // origin: the fixture, S2A's dispatch label `build export` (spec L349, kept as given)
  expect(labels.some((l) => l.includes(S2A.description)), say(t, 'rows under P2: ' + JSON.stringify(labels))).toBe(true)
})

// ---- agents tied to no phase (D-P1-tree-unphased) --------------------------------------------------

// R-C10-42 · R-C10-44
// Spec L322-325: "An agent tied to no phase (the bootstrap, a gate's or the final report's
// sub-orchestrator, a helper) goes under a P0 row when the plan has one. Otherwise it goes directly
// under the prime, after the phase rows." D-P1-tree-unphased: "otherwise directly under the prime, after the phase rows."
test('t10-phases: with no P0, a sub-orchestrator tied to no phase is drawn one level under the prime, after the last phase row', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const u = need(t, idxAgent(t, U), U.description) // origin: the fixture, U names no phase anywhere
  const prime = need(t, idxPrime(t), 'prime')
  expect(parentOf(t, u), say(t, U.description + ' is drawn under ' + nameOf(t, parentOf(t, u)))).toBe(prime) // origin: spec L324, "directly under the prime"
  const last = Math.max(...[1, 2, 3].map((n) => idxPhase(t, n))) // origin: the fixture's phases P1..P3
  expect(u, say(t, U.description + ' is drawn before the last phase row')).toBeGreaterThan(last) // origin: spec L324, "after the phase rows"
})

// R-C10-42 · R-C10-43
// Spec L323: "goes under a P0 row when the plan has one." D-P1-tree-unphased: "go under a P0 row when P0 exists".
test('t10-phases: with a phase P0 in the plan, a sub-orchestrator tied to no phase is drawn one level under the row labelled P0', { options: OPTIONS }, async ($, on) => {
  await world($, on, { withP0: true })
  const ui = await mount($)
  const t = table(await ui.drawn())
  const u = need(t, idxAgent(t, U), U.description)
  const p = parentOf(t, u)
  // origin: the fixture's graph.yaml phase 0, and D-P1-tree-unphased, its parent is the P0 row
  expect(PHASE_LABEL(0).test(p >= 0 ? t.rows[p]!.label : ''), say(t, U.description + ' is drawn under ' + nameOf(t, p) + ', not under P0')).toBe(true)
})

// ---- opening rows (Q-54) ---------------------------------------------------------------------------

// R-C10-45 · R-C10-47 · R-C10-84
// Spec L326-327: "Opening a phase row opens the phase view: its steps, its nodes with their states, and its spend (Q-54)."
// _orch/inbox/Q-54.answer.md: "A, adapted to the tree: opening the phase row opens the phase view."
test("t10-phases: Enter on the › of a phase row under the prime opens the phase view, listing that phase's nodes with their states", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const prime = idxPrime(t)
  const p1 = t.rows.findIndex((r, i) => PHASE_LABEL(1).test(r.label) && prime >= 0 && parentOf(t, i) === prime)
  expect(p1, say(t, 'no P1 row drawn one level under the prime')).toBeGreaterThanOrEqual(0) // origin: spec L309, the phase row under the prime
  const view = await openRow(ui, t, p1, 'P1')
  const line = view.find((l) => /\bT101\b/.test(l)) // origin: the fixture, P1's node T101
  expect(line, 'the view lists no T101:' + view.join('\n')).toBeDefined()
  expect(stepRuns(line!.replace(/^.*?\bT101\b/, '')).length, 'T101 has no state drawn: ' + line).toBeGreaterThan(0) // origin: Q-54, "its nodes with their states"
  expect(view.some((l) => /\bT201\b/.test(l)), 'the view lists another phase\'s node').toBe(false) // origin: the fixture, T201 is P2's
})

// R-C10-46
// Spec L326-327: "Opening a phase row opens the phase view: its steps,"
test("t10-phases: the phase view opened from the phase row shows the phase's steps", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const prime = idxPrime(t)
  const p1 = t.rows.findIndex((r, i) => PHASE_LABEL(1).test(r.label) && prime >= 0 && parentOf(t, i) === prime)
  expect(p1, say(t, 'no P1 row drawn one level under the prime')).toBeGreaterThanOrEqual(0) // origin: spec L309
  const view = await openRow(ui, t, p1, 'P1')
  // origin: spec L314 and L327, the phase's four steps (briefed, dispatched, verified, approved), on a line of its own (not a node's)
  expect(view.some((l) => !/\bT\d{3}\b/.test(l) && stepRuns(l).includes(4)), 'the view shows no four-step stepper:\n' + view.join('\n')).toBe(true)
})

// R-C10-48
// Spec L327: "and its spend (Q-54)." Spec L344-345: a phase row's roll-up "is filled";
// D-T10-rollup-inclusive: "a phase row's roll-up is the total of every sub-orchestrator subtree under it".
test("t10-phases: the phase view shows the phase's tokens, the total over its sub-orchestrators' subtrees", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = need(t, idxPhase(t, 2), 'P2')
  const view = await openRow(ui, t, p2, 'P2')
  const want = sum(P2_TREE, tokensOf) // origin: the fixture, S2A + W1 + V1 + S2B + W2 (WX works under S1, Q-58)
  const got = tokenFigures(view.join('\n'))
  expect(got.some((v) => Math.abs(v - want) <= want * 0.005), 'P2 view token figures ' + JSON.stringify(got) + ', want ' + want + ':\n' + view.join('\n')) // origin: P2_TREE's tokens, half a percent of rounding allowed (a drawn `218k`)
  .toBe(true)
})

// R-C10-48
// Spec L327: "and its spend (Q-54)."
test("t10-phases: the phase view shows the phase's cost, the total over its sub-orchestrators' subtrees", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = need(t, idxPhase(t, 2), 'P2')
  const view = await openRow(ui, t, p2, 'P2')
  const want = sum(P2_TREE, costOf) // origin: the fixture's subtree at the fixture's prices ($2.18)
  const got = usdFigures(view.join('\n'))
  expect(got.some((v) => Math.abs(v - want) < 0.0051), 'P2 view costs ' + JSON.stringify(got) + ', want $' + want.toFixed(2) + ':\n' + view.join('\n')).toBe(true) // origin: P2_TREE's cost, to the cent
})

// R-C10-49
// Spec L327-328: "Opening a sub-orchestrator's row opens the agent view, as for any agent row."
// _orch/inbox/Q-54.answer.md: "opening the phase row opens the phase view" (and not the sub-orchestrator's row).
test("t10-phases: Enter on the › of a sub-orchestrator's row under a phase row opens the agent view", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const s = idxAgent(t, S2A)
  const p = parentOf(t, s)
  expect(PHASE_LABEL(2).test(p >= 0 ? t.rows[p]!.label : ''), say(t, S2A.description + ' is not drawn under a phase row')).toBe(true) // origin: spec L310, under its phase row
  const view = await openRow(ui, t, s, S2A.description)
  const all = view.join('\n')
  expect(all, 'the agent view does not name the agent').toContain(S2A.description) // origin: the fixture's label
  expect(/\bagent\b.*\bcost\b/.test(all) && /›/.test(all), 'the agent table is still drawn: no view opened').toBe(false) // origin: Q-54, a view in place of the table
  expect(/\bT20[12]\b/.test(all), 'a phase view opened (P2\'s nodes listed)').toBe(false) // origin: the fixture, P2's nodes belong to the phase view
})

// R-C10-45 · R-C10-84
// Spec L326: "Opening a phase row opens the phase view"; Q-62: a pending row "keeps its `›` (Q-54)";
// spec L139-140: "Every navigable row (agent, plan, phase) can be opened from the keyboard, by its own
// key or by a focus-and-Enter scheme." Enter under the focus raises the Button's press (Button docs).
// GUARD (preservation, not red): at da5910c the P3 row's `›` already opens P3's view (work/probe-da5910c.md P-7; OQ7).
test('guard: a pending phase row opens the phase view by focus and Enter', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p3 = need(t, idxPhase(t, 3), 'P3')
  const view = await openRow(ui, t, p3, 'P3')
  const all = view.join('\n')
  expect(/\bagent\b.*\bcost\b/.test(all) && /›/.test(all), 'the agent table is still drawn: no view opened:\n' + all).toBe(false) // origin: Q-54, a view in place of the table
  expect(view.some((l) => /\bP3\b/.test(l)), 'the view does not name P3:\n' + all).toBe(true) // origin: the fixture's pending phase P3
  // origin: spec L327, the phase view shows "its steps": the phase's four steps (spec L314)
  expect(view.some((l) => !/\bT\d{3}\b/.test(l) && stepRuns(l).includes(4)), 'the view shows no four-step stepper:\n' + all).toBe(true)
  expect(/\bT20[12]\b/.test(all), 'the view lists P2\'s nodes').toBe(false) // origin: the fixture, T201 and T202 are P2's
})

// R-C10-18
// Spec L265: "T11's steps on every row and T9's keys stay." Spec L386-388: "Letters are first given top
// to bottom in tree order (Q-12, Q-60): the prime, the phase rows (pending ones included), then
// sub-orchestrator and agent rows." Q-12 option 1: the pool `a c d e f g h i j k l m n o q s t u v w y z`.
// _orch/inbox/Q-67.answer.md: "hotkey letters are fixed per row for as long as the row exists".
// Q-60 (spec-questions.md): "every shown row of the tree, in tree order ..., pending rows included,
// takes the next letter ... top to bottom". Node rows get none (p is off here).
test('t10-phases: when the pane first draws, the pending phase row takes the Q-12 pool letter of its place in tree order', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p3 = need(t, idxPhase(t, 3), 'P3')
  const keys: string[] = []
  walk(t.rows[p3]!.box, (x) => {
    if (x.props && typeof x.props.hotkey === 'string') keys.push(x.props.hotkey)
  })
  const POOL = 'a c d e f g h i j k l m n o q s t u v w y z'.split(' ') // origin: Q-12 option 1
  // origin: the fixture's tree per spec L309-325: prime, P1, S1, WX, P2, S2A, W1, V1, S2B, W2 come
  // before P3 (10 rows), so P3 is the 11th row and takes the 11th letter
  const want = POOL[10]
  expect(keys, say(t, 'P3 row keys ' + JSON.stringify(keys) + ', want ' + want)).toContain(want) // origin: Q-12 pool, Q-60 tree order, the fixture's 11th row
})

// ---- guards: what already works at da5910c ---------------------------------------------------------

// R-C10-60 · R-C10-15
// Spec L264: "`p` still shows or hides the node rows under a phase's row." Spec L338: "`p` shows or
// hides the node rows under every phase row at once (Q-59 ...)."
// GUARD (preservation, not red): `p` toggles the node rows at da5910c (register.js ~1233;
// work/probe-da5910c.md P-8; _orch/inbox/OQ7.answer.md). No tree placement is asserted.
test('guard: p shows the node rows of the phases, and p again hides them', { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const has = async (id: string) => lines(await ui.drawn()).some((l) => new RegExp('\\b' + id + '\\b').test(l))
  // origin: the fixture's nodes T101 (P1) and T201 (P2): hidden, shown, hidden (spec L264)
  expect([await has('T101'), await has('T201')]).toEqual([false, false])
  await pressP(ui)
  expect([await has('T101'), await has('T201')]).toEqual([true, true]) // origin: spec L264, `p` shows them
  await pressP(ui)
  expect([await has('T101'), await has('T201')]).toEqual([false, false]) // origin: spec L264, `p` again hides them
})

// R-C10-45
// Spec L326: "Opening a phase row opens the phase view". GUARD (preservation, not red): at da5910c
// Enter on a phase row's `›` opens the phase view (register.js ~1241; work/probe-da5910c.md P-9; OQ7).
// No tree placement is asserted: the P2 row wherever it is drawn.
test("guard: Enter on a phase row's › opens the phase view", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const p2 = need(t, idxPhase(t, 2), 'P2')
  const view = await openRow(ui, t, p2, 'P2')
  // origin: the fixture, P2's nodes T201 and T202 (Q-54, "its nodes"), and not P1's T101
  expect(['T201', 'T202', 'T101'].map((id) => view.some((l) => new RegExp('\\b' + id + '\\b').test(l))), view.join('\n')).toEqual([true, true, false])
})

// R-C10-49
// Spec L327-328: "Opening a sub-orchestrator's row opens the agent view, as for any agent row."
// GUARD (preservation, not red): at da5910c Enter on an agent row's `›` opens the agent view
// (register.js ~1463; work/probe-da5910c.md P-10; OQ7).
test("guard: Enter on an agent row's › opens the agent view", { options: OPTIONS }, async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const t = table(await ui.drawn())
  const w = need(t, idxAgent(t, W1), W1.description)
  const view = await openRow(ui, t, w, W1.description)
  const all = view.join('\n')
  expect(all).toContain(W1.description) // origin: the fixture's label
  expect(/\bagent\b.*\bcost\b/.test(all) && /›/.test(all), 'the agent table is still drawn: no view opened').toBe(false) // origin: a view in place of the table
  expect(/\bT20[12]\b/.test(all), 'a phase view opened').toBe(false) // origin: the fixture, P2's nodes belong to the phase view
})
