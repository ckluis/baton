// claude plugin test — T1, the API drift audit (cluster C1): the mismatches that change what the mod does.
//
// Written from the spec (docs/designs/v7.6-tuning.md L23-33), the operator's answers and A1's audit BEFORE the fix
// (node T11, the split red step of F11). The spec, L32: "Each mismatch gets a failing test first, then the fix."
// Requirement ids are rows of _orch/plan/traceability.yaml, cluster C1: R-C1-13 "Each mismatch gets a failing test
// first," (L32), R-C1-14 "then the fix." (L32), R-C1-05 "result shape in `mod/hooks/register.js`" (L25), R-C1-04
// "option" (L25), R-C1-06 "against the engine's current types." (L26).
// The mismatches are A1's confirmed record _orch/nodes/A1/work/mismatches.yaml (types: Claude Code 2.1.304; the
// declarations cited there are quoted next to each test). The node-row answers are inbox/Q-16.answer.md ("C1/F11 owns
// the 'dir' fix") and inbox/Q-17.answer.md ("the same owner (C1) fixes the node-row Enter crash"; Q-17.md option 1:
// "Enter on a node row opens its view with done-criteria and red/green/blue").
// The ui.Text/ui.Link {key} mismatches and the prompt.submit field are pinned in mod/test/t1-drift-source.test.mjs.
// S0543, S0545 and S0708 hold at the run tip (probes: _orch/nodes/T11/work/false-premise.md) and have no red here.
//
// The world: the engine beneath the mod answers from memory (as mod/tests/interface.test.ts does), in the shapes the
// engine's types declare. No expected value is copied from the implementation.
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id
const ENGINE = 'engine-drawn' // fixture: what the bottom ui.render hook draws, i.e. the engine's own drawing ("An invalid tree, or a throw while drawn, draws the engine's", index.d.ts 'ui.render')
// FsEntry.kind, mod/.claude-plugin/types/claude-code/index.d.ts:5093 `kind: 'file' | 'dir' | 'other';` (mismatches.yaml S0489, S0494)
const DIR = 'dir'

// A node's handoff in the shape rule 3 gives one (this node's own _orch/nodes/T11/handoff.md: a `## Done-criteria`
// section of numbered criteria).
const CRIT_1 = 'The export writes report.csv with one row per order.' // fixture: T5's first done-criterion
const CRIT_2 = 'The totals row comes last.' // fixture: T5's second done-criterion
const HANDOFF = ['# HANDOFF — T5', '', '## Purpose', '', 'Export the report.', '', '## Done-criteria', '', '1. ' + CRIT_1, '2. ' + CRIT_2, ''].join('\n') // fixture
const RED = 'red: node --test test/export.test.mjs fails 2/2 at 1a2b3c4' // fixture: T5's work/red.txt
const GREEN = 'green: node --test test/export.test.mjs passes 2/2 at 5d6e7f8' // fixture: T5's work/green.txt
const BLUE = 'blue: tidy, still 2/2 at 9a8b7c6' // fixture: T5's work/blue.txt
// Rule 2's envelope (rules/rule-2-the-status-envelope.md).
const env = (node: string, verdict: string, summary: string) => ({ node, rung: 1, model: 'claude-opus-5-5', effort: 'medium', attempt: 1, verdict, outputs: [], summary, evidence: [], risk: 'none', caveats: [], escalation_reason: null, handback: null })
const T5 = env('T5', 'DONE', 'The export writes the report.') // fixture
const T6 = env('T6', 'DONE', 'The import reads the report.') // fixture

type Opts = {
  run?: boolean // an active run (an _orch/manifest.json); default true
  nodes?: Record<string, any> // node id -> envelope (status.json)
  work?: Record<string, Record<string, string>> // node id -> work file -> text
  phases?: number[] // the _orch/phases/P<n> directories
  graph?: string // graph.yaml
  inbox?: Record<string, string> // inbox file -> text
  env?: Record<string, string> // the process environment
  verdicts?: Record<string, any> // node id -> _orch/verify/<id>-verdict.json
}

function world(on: any, opts: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const nodes = opts.nodes ?? {}
  if (opts.run !== false) {
    const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
    files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
    files.set('_orch/plan/graph.yaml', opts.graph ?? '- id: N1\n  phase: 1\n' + Object.keys(nodes).map((id) => '- id: ' + id + '\n  phase: 2\n').join('') + '- id: N3\n  phase: 3\n')
    const phases = opts.phases ?? [1, 2, 3]
    dirs.set('_orch/phases', phases.map((n) => ({ name: 'P' + n, kind: DIR })))
    for (const n of phases) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
    dirs.set('_orch/nodes', Object.keys(nodes).map((id) => ({ name: id, kind: DIR })))
    for (const [id, st] of Object.entries(nodes)) {
      const work = opts.work?.[id] ?? {}
      dirs.set('_orch/nodes/' + id, [{ name: 'handoff.md', kind: 'file' }, { name: 'status.json', kind: 'file' }, ...(Object.keys(work).length ? [{ name: 'work', kind: DIR }] : [])])
      files.set('_orch/nodes/' + id + '/handoff.md', id === 'T5' ? HANDOFF : '# HANDOFF — ' + id + '\n\n## Done-criteria\n\n1. It works.\n')
      files.set('_orch/nodes/' + id + '/status.json', JSON.stringify(st, null, 2) + '\n')
      if (Object.keys(work).length) dirs.set('_orch/nodes/' + id + '/work', Object.keys(work).map((f) => ({ name: f, kind: 'file' })))
      for (const [f, text] of Object.entries(work)) files.set('_orch/nodes/' + id + '/work/' + f, text)
    }
    for (const [f, text] of Object.entries(opts.inbox ?? {})) files.set('_orch/inbox/' + f, text)
    for (const [id, vd] of Object.entries(opts.verdicts ?? {})) files.set('_orch/verify/' + id + '-verdict.json', JSON.stringify(vd, null, 2) + '\n')
  }
  const inboxList = () => [...files.keys()].filter((k) => k.startsWith('_orch/inbox/')).map((k) => ({ name: k.slice('_orch/inbox/'.length), kind: 'file' }))
  const rel = (p: string) => {
    const s = String(p)
    if (s === '_orch' || s.endsWith('/_orch')) return '_orch'
    if (s.startsWith('_orch/') || s.startsWith('.baton/')) return s
    const i = s.lastIndexOf('/_orch/')
    if (i >= 0) return s.slice(i + 1)
    const j = s.lastIndexOf('/.baton/')
    return j >= 0 ? s.slice(j + 1) : s
  }
  const logs: string[] = []
  const notified: { text: string; title?: string }[] = []
  on('fs.read', (_$: any, e: any) => {
    const v = files.get(rel(e.path))
    return v === undefined ? { deny: 'no such file' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(rel(e.path), e.text)
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => {
    const p = rel(e.path)
    return { value: files.has(p) || dirs.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('fs.list', (_$: any, e: any) => {
    const p = rel(e.path)
    if (p === '_orch/inbox') return { value: inboxList() }
    const v = dirs.get(p)
    return v ? { value: v } : { deny: 'no such directory' }
  })
  on('ui.log', (_$: any, e: any) => {
    logs.push(JSON.stringify(e))
    return { value: undefined }
  })
  // $.ui.notify, index.d.ts 'ui.notify': "Raises a native notification of `text` through the person's own notification
  // channel"; UiNotifyResult `{ isSent: true, channel }`.
  on('ui.notify', (_$: any, e: any) => {
    notified.push({ text: String(e.text), title: e.title })
    return { value: { isSent: true, channel: 'terminal' } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ children: [ENGINE + ' ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.304', base: '2.1.304' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.Stop', () => ({}))
  on('classic.Notification', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  const toolResults: Record<string, any> = {}
  on('tool.call', (_$: any, e: any) => {
    if (e.tool in toolResults) return { result: toolResults[e.tool] }
    return { result: 'ran' }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv.includes('note')) out = { index: 0, text: '', truncated: false, merges: [] }
    else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = { header: 'h', tiles: [], lines: [] }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ agentId: 'a-' + String(e.description).replace(/\W+/g, '-'), model: 'claude-opus-5-5' }))
  mock.store(on)
  mock.env(on, opts.env ?? {})
  mock.session(on)

  async function settle(ms: number) {
    await clock.advance(ms)
    await clock.settle()
  }
  async function start($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
  }
  /** Start the session and open the pane on `surface`. */
  async function pane($: any, surface = 'terminal') {
    await start($)
    await settle(61000) // past the mod's own re-read interval, so the pane reads the record as it now stands
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface, component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } } as any })
  }
  return { settle, start, pane, files, logs, notified, toolResults }
}

// ------------------------------------------------------------------ reading the drawn tree

type Row = { text: string; buttons: any[] }

const strings = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(strings).join('')
  if (n.type === 'Button') return ''
  return (n.children || []).map(strings).join('')
}
const flat = (x: string) => x.replace(/\s+/g, ' ')

function rowBoxes(tree: any): Row[] {
  const out: Row[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Box' && n.props && n.props.flexDirection === 'row') {
      const buttons: any[] = []
      const inner = (c: any) => {
        if (!c || typeof c !== 'object') return
        if (Array.isArray(c)) return c.forEach(inner)
        if (c.type === 'Button') buttons.push(c)
        ;(c.children || []).forEach(inner)
      }
      ;(n.children || []).forEach(inner)
      out.push({ text: strings(n), buttons })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}
const labelOf = (b: any) => String((b.props && b.props.label) ?? strings(b.children) ?? '')
const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? labelOf(b))
const idRe = (id: string) => new RegExp('(^|[^A-Za-z0-9])' + id + '([^0-9]|$)')
const NOT_NODE = /Q-\d|(^|[^A-Za-z0-9])P\d([^0-9]|$)/ // a `?` row or a phase row may name a node; neither is the node's row
function rowOf(tree: any, re: RegExp, not?: RegExp): Row | undefined {
  const hits = rowBoxes(tree).filter((r) => re.test(r.text) && !(not && not.test(r.text)) && r.buttons.length > 0)
  hits.sort((a, b) => a.buttons.length - b.buttons.length)
  return hits[0]
}
async function keyButton(ui: any, k: string) {
  return (await ui.findAll({ type: 'Button' })).find((b: any) => b.props.hotkey === k)
}
async function shownText(ui: any) {
  return flat(strings(await ui.drawn()))
}
/** A node's row, the node rows shown (spec L264: "`p` still shows or hides the node rows under a phase's row"). */
async function nodeRow(ui: any, id: string): Promise<Row | undefined> {
  const r = rowOf(await ui.drawn(), idRe(id), NOT_NODE)
  if (r) return r
  const p = await keyButton(ui, 'p')
  if (p) await ui.press({ key: keyOf(p) })
  return rowOf(await ui.drawn(), idRe(id), NOT_NODE)
}
/** A phase's row: its `›` opens the phase (E1 §k: "Enter on focus | :1241 phase ›"). */
const phaseRow = async (ui: any, id: string) => rowOf(await ui.drawn(), new RegExp('(^|\\s)' + id + '(\\s|$)'))
/** Focus a row's `›` and press Enter (E1 §k: Enter presses the focused element). */
async function enter(ui: any, r: Row | undefined) {
  const b = r && (r.buttons.find((x) => labelOf(x).includes('›')) ?? r.buttons[0])
  if (b) await ui.press({ key: keyOf(b) })
}
const engineDrawn = (t: string) => t.includes(ENGINE)

// ================================================================== S0489 · node directories are read (c16)

test('S0489 (c16): with _orch/nodes/<id>/ listed as the declared kind \'dir\', observe reads the nodes and their rows are drawn', async ($, on) => {
  // R-C1-05 "result shape in `mod/hooks/register.js`" (L25), R-C1-06 "against the engine's current types." (L26),
  // R-C1-13 "Each mismatch gets a failing test first," (L32). mismatches.yaml S0489 (register.js:2185): declared
  // index.d.ts:5093 `kind: 'file' | 'dir' | 'other';`, "x.kind === 'directory' is never true, so the filter drops every
  // directory". inbox/Q-16.answer.md: "C1/F11 owns the 'dir' fix".
  const w = world(on, { nodes: { T5, T6 } })
  const ui: any = await w.pane($)
  const rows = { T5: !!(await nodeRow(ui, 'T5')), T6: !!(await nodeRow(ui, 'T6')) }
  expect(rows).toEqual({ T5: true, T6: true }) // fixture: the two node directories listed under _orch/nodes, each a row (Q-16.md: "node rows are drawn")
})

// ================================================================== S0494 · phase directories are read

test('S0494: a phase directory _orch/phases/P4 listed as the declared kind \'dir\' gets a phase row', async ($, on) => {
  // R-C1-05 (L25), R-C1-06 (L26), R-C1-13 (L32). mismatches.yaml S0494 (register.js:2209): declared index.d.ts:5093
  // `kind: 'file' | 'dir' | 'other';`, "x.kind === 'directory' is never true, so the filter drops every directory".
  // Fixture: graph.yaml names phases 1-3 only; P4 exists only as a directory of _orch/phases.
  const w = world(on, { nodes: { T5 }, phases: [1, 2, 3, 4] })
  const ui: any = await w.pane($)
  const r = await phaseRow(ui, 'P4')
  expect(r ? 'P4 row' : 'no P4 row').toBe('P4 row') // fixture: _orch/phases/P4 (kind 'dir', index.d.ts:5093) is a phase of the run
})

// ================================================================== Q-17 · Enter on a node row (c17, c18)

const T5_WORK = { 'red.txt': RED, 'green.txt': GREEN, 'blue.txt': BLUE } // fixture: T5's red, green and blue records
// fixture: T5's verdict file, its rows naming each criterion by number rather than quoting it under `criterion`. Rule 9.1
// (rules/rule-9-1-a-verdict-is-per-criterion-and-the-node.md) asks for "one row per done-criterion ..., each quoting its
// criterion verbatim" and names no field for the quote; Q-17.md: the crash "may depend on the fixture's verdict file", and
// E1 (probes.md, "Side effect") found its fixture's T17-verdict.json in a vocabulary the mod does not read.
const T5_VERDICT = { node: 'T5', attempt: 1, criteria: [{ n: 1, verdict: 'CONFIRMED', probe: 'ran the export' }, { n: 2, verdict: 'CONFIRMED', probe: 'read the last row' }], verdict: 'VERIFIED' }

test('Q-17 (c17): Enter on a node row opens its view, with its done-criteria and its red/green/blue, and the pane is not blanked', async ($, on) => {
  // R-C1-14 "then the fix." (L32); inbox/Q-17.answer.md: "the same owner (C1) fixes the node-row Enter crash"; Q-17.md
  // option 1: "that cluster adds a red test (Enter on a node row opens its view with done-criteria and red/green/blue)
  // and fixes the undefined segment". E1 §k (Q-17.md): "Enter on a node row blanks the pane".
  const w = world(on, { nodes: { T5 }, work: { T5: T5_WORK }, verdicts: { T5: T5_VERDICT } })
  const ui: any = await w.pane($)
  const row = await nodeRow(ui, 'T5')
  await enter(ui, row)
  const t = await shownText(ui)
  expect({
    row: !!row, // the node row, to press Enter on (Q-16.answer.md)
    blanked: engineDrawn(t), // "the pane is not blanked" (Q-17.md): not the engine's own drawing
    criteria: t.includes(CRIT_1) && t.includes(CRIT_2), // fixture HANDOFF's done-criteria (Q-17.md option 1: "with done-criteria")
    rgb: t.includes(RED) && t.includes(GREEN) && t.includes(BLUE), // fixture T5_WORK (Q-17.md option 1: "and red/green/blue")
  }).toEqual({ row: true, blanked: false, criteria: true, rgb: true })
})

test('Q-17 (c18): Enter on a node row raises no \'ui.render hook skipped\' error', async ($, on) => {
  // R-C1-14 (L32); inbox/Q-17.answer.md; Q-17.md: "Enter on a node row blanks the pane: `ui.render hook skipped: threw
  // TypeError: undefined is not an object (evaluating 'x.tone')`". A throw while drawn "draws the engine's"
  // (index.d.ts 'ui.render'), and the engine's drawing is the bottom hook's ENGINE text here.
  const w = world(on, { nodes: { T5 }, work: { T5: T5_WORK }, verdicts: { T5: T5_VERDICT } })
  const ui: any = await w.pane($)
  const row = await nodeRow(ui, 'T5')
  await enter(ui, row)
  let drawn = ''
  let threw = ''
  try {
    drawn = await shownText(ui)
  } catch (err: any) {
    threw = String(err && err.message ? err.message : err)
  }
  const skipped = [...w.logs, threw].filter((l) => /hook skipped|threw|TypeError/.test(l)) // Q-17.md's error text
  expect({ row: !!row, mine: !!drawn && !engineDrawn(drawn), skipped }).toEqual({ row: true, mine: true, skipped: [] }) // Q-17.md: no "ui.render hook skipped"
})

// ================================================================== S0598, X3 · the Bash result is the declared record

const LONG = Array.from({ length: 1200 }, (_, i) => 'line ' + (i + 1)).join('\n') // fixture: 1200 lines, over quietOutputLines (400, mod/README.md "Quiet output")

test('X3: a long Bash result, as the declared record { stdout, stderr, interrupted }, is quieted and its whole output saved to a file', async ($, on) => {
  // R-C1-05 (L25), R-C1-06 (L26). mismatches.yaml X3 (register.js:2622): declared claude-code-tools/index.d.ts:4440
  // `Bash: {` (stdout, stderr, interrupted, …); "the guard half of S-row mismatch on(tool.call) return {result} at
  // register.js:2638: by the declaration the quiet-output path never runs". What the path does: mod/README.md "Quiet
  // output": "A shell result over `quietOutputLines` (400) is cut ...; the whole output is saved to `_orch/out/` (or
  // `.baton/out/` outside a run) and its path ends the result."
  const w = world(on, { run: false })
  w.toolResults.Bash = { stdout: LONG, stderr: '', interrupted: false } // the declared Bash result record (claude-code-tools/index.d.ts:4440)
  await w.start($)
  await $.tool.call({ tool: 'Bash', command: 'make test', agentId: 'w1' } as any)
  const saved = [...w.files.entries()].filter(([k, v]) => k.startsWith('.baton/out/') && k.endsWith('.log') && String(v).includes('line 1200'))
  expect(saved.length).toBe(1) // README "Quiet output": "the whole output is saved to ... `.baton/out/` outside a run"
})

test('S0598: the quiet-output hook returns the declared Bash result record, its stdout cut, not a string', async ($, on) => {
  // R-C1-04 "option" (L25), R-C1-06 (L26). mismatches.yaml S0598 (register.js:2638): index.d.ts:13559
  // `result: ToolResultOf<Name>;`; "the handler returns { ...r, result: q } with q a string, but under the Bash matcher
  // result is ToolResultOf<'Bash'>, the BuiltinToolResults Bash record { stdout, stderr, interrupted, … }".
  const w = world(on, { run: false })
  w.toolResults.Bash = { stdout: LONG, stderr: '', interrupted: false } // the declared Bash result record (claude-code-tools/index.d.ts:4440)
  await w.start($)
  const r: any = await $.tool.call({ tool: 'Bash', command: 'make test', agentId: 'w1' } as any)
  const res = r && r.result
  const shape = { record: !!res && typeof res === 'object', stdout: typeof (res && res.stdout), interrupted: typeof (res && res.interrupted) }
  const lines = res && typeof res.stdout === 'string' ? res.stdout.split('\n').length : 0
  expect({ ...shape, cut: lines > 0 && lines < 1200 }).toEqual({ record: true, stdout: 'string', interrupted: 'boolean', cut: true }) // the declared record (claude-code-tools/index.d.ts:4440), cut (README "Quiet output": first 40, failures, last 40)
})

// ================================================================== X1 · the Read result is the declared record

test('X1: a Read of a whole source file over readHintLines, as the declared record, carries the pointer to code_fetch', async ($, on) => {
  // R-C1-05 (L25), R-C1-06 (L26). mismatches.yaml X1 (register.js:2605): declared index.d.ts:13559 `result:
  // ToolResultOf<Name>;`, for Read claude-code-tools/index.d.ts:5032 `Read: {` (type: 'text', file: { filePath,
  // content, numLines, … }); "by the declaration r.result is never a string, so the big-read hint never fires".
  // What the hint is: mod/README.md: "A Read of a whole source file over `readHintLines` (300) runs as asked and
  // carries a pointer to `code_fetch`."
  const w = world(on, { run: false })
  const content = Array.from({ length: 900 }, (_, i) => 'export const v' + i + ' = ' + i).join('\n') // fixture: 900 lines, over readHintLines (300, README)
  w.toolResults.Read = { type: 'text', file: { filePath: RUN + '/src/big.js', content, numLines: 900, startLine: 1, totalLines: 900 } } // the declared Read record (claude-code-tools/index.d.ts:5032)
  await w.start($)
  const r: any = await $.tool.call({ tool: 'Read', file_path: RUN + '/src/big.js', agentId: 'w1' } as any)
  const ctx = ((r && r.context) || []).join('\n')
  expect(/code_fetch/.test(ctx)).toBe(true) // README: "carries a pointer to `code_fetch`"
})

// ================================================================== X2 · the desktop notification at Stop

const Q9 = '# Q-9 · May the export drop the legacy column?\n\n**Question.** May it?\n' // fixture: an open question (README "Notifications": "a new question")

test('X2: classic.Stop returns only the fields its declared result has (no terminalSequence)', async ($, on) => {
  // R-C1-04 "option" (L25), R-C1-06 (L26). mismatches.yaml X2 (register.js:621-625): index.d.ts:1422 `export type
  // ClassicResultOf = {` — Pick<ClassicResult, 'block' | 'preventContinuation' | 'stopReason' | per-event fields>;
  // "terminalSequence appears nowhere in the generated types". Stop's per-event fields: index.d.ts ClassicResultFields
  // `Stop: 'additionalContext';`.
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-9.md': Q9 } })
  await w.pane($)
  const r: any = await $.classic.Stop({ stopHookActive: false } as any)
  const extra = Object.keys(r || {}).filter((k) => !['block', 'preventContinuation', 'stopReason', 'additionalContext'].includes(k))
  expect(extra).toEqual([]) // ClassicResultOf['classic.Stop'] keys (index.d.ts:1419-1421, ClassicResultFields.Stop)
})

test('X2: a notice waiting at Stop reaches the person as a native notification', async ($, on) => {
  // R-C1-06 (L26). mismatches.yaml X2: "the engine may drop it, so the desktop notification would never be emitted".
  // What is emitted: mod/README.md "Notifications": "a new question ...: a toast at once and a desktop notification ...
  // at the next Stop or Notification, once each." The declared way to raise one: index.d.ts `notify: (text: string,
  // options?: NotifyOptions) => Promise<UiNotifyResult>;` ("Raises a native notification of `text`").
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-9.md': Q9 } })
  await w.pane($)
  await $.classic.Stop({ stopHookActive: false } as any)
  await w.settle(100)
  expect(w.notified.some((n) => /question/.test(n.text))).toBe(true) // README "Notifications": "a new question" notifies
})
