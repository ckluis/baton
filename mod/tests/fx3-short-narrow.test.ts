// claude plugin test — FX3 attempt 4 (run build-20261019T125436Z, phase P4): the agent list (T15) in short panes at a
// docked width, where the tree's rows take two lines (decision P4-FX3-d2), laid out in screen lines (P4-FX3-d3).
//
// Written from the spec (docs/designs/v7.6-tuning.md L276-298 T15: "The agent list uses the pane's full height", "When
// the agents do not fit, the list scrolls", L364-402 the operator's answers on scrolling, Q-68 "the agent list is its own
// scrolling window; the lines above and below it stay drawn", Q-F115-1 A / D-F115-spare-row: while the list scrolls the
// pane keeps one empty bottom row; L112 "Widen the column so it is never cut"; L312-313 and L341-349 the T10 cells and
// the four-step stepper; L620-640 T8E: an agent's model cell carries its effort) and from the attempt-3 verifier's
// refutation (_orch/verify/FX3-verdict.json "behaviour_change", probe _orch/verify/FX3-probe-a3/output.txt section H:
// in 14-16-line panes at a docked width the list stopped scrolling and pushed the hint line, the message field and the
// question rows out; a 20-line pane left two empty rows) BEFORE the fix; nothing is copied from the implementation.
//
// The world: a three-level tree, P1 > sub-orchestrator > twelve workers, each agent with a configured effort, so its
// model cell reads `opus 5.5 · high cfg` or `sonnet 5.5 · medium cfg` (the widest cells of the attempt-2 and attempt-3
// verdicts); the sub-orchestrator and the last worker still run; an open question Q-7; the ✉ of the running worker
// pressed, so the message field is drawn under the list. The pane body is 73 columns (docked in a 165-column terminal,
// LV8, LV10, FX3 screens/A1) and 14, 16 or 20 lines.
//
// The drawing is read through the same model of the terminal's layout as mod/tests/fx3-narrow-73.test.ts (each Text a
// flex item that shrinks in proportion to its width when a row asks for more than the pane, cut with `…`; a plain
// Button whole; a Box by its width, flexShrink and overflow; a `flexWrap: 'wrap'` row laid out line by line). The pane's
// screen lines are the column's children top to bottom, a row Box taking as many lines as it draws. The engine shows the
// first `bodyRows` of them (offset 0, SiteScroll); a line past them is not drawn.
import { expect, mock, test } from 'claude-code/testing'

const SLOW = { timeoutMs: 120000 }
const DOCKED_165 = 73 // fixture: the pane body docked in a 165-column terminal (LV8, LV10; FX3 screens/A1)

// ---- a model of the terminal's drawing (as fx3-narrow-73.test.ts) --------------------------------------------

const wide = (c: string) => c === '✅' || c === '❌'
const cellW = (s: string) => [...s].reduce((n, c) => n + (wide(c) ? 2 : 1), 0)
const textOf = (x: any): string =>
  typeof x === 'string' || typeof x === 'number' ? String(x)
  : x == null || x === false ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : textOf(x.children)
function truncEnd(t: string, w: number): string {
  if (cellW(t) <= w) return t
  if (w <= 0) return ''
  if (w === 1) return '…'
  let out = ''
  for (const c of t) {
    if (cellW(out + c) > w - 1) break
    out += c
  }
  return out + '…'
}
type Leaf = { kind: 'text' | 'button'; text: string; drawn: string; x: number; y: number; h?: number }
/** The lines a Text of the default `wrap` takes `w` cells wide: its words laid out line by line, a word longer than
 * the line broken (Ink's `wrap`, types TextProps.wrap). A `truncate…` Text takes one line, cut. */
function wrapLines(t: string, w: number): number {
  if (w <= 0) return 1
  let lines = 1
  let used = 0
  // spaces where a line breaks are dropped, at its end and at the next one's start (Ink trims them)
  for (const word of t.trim().split(/(\s+)/)) {
    if (!word) continue
    const n = cellW(word)
    if (used + n <= w) {
      used += n
      continue
    }
    if (/^\s+$/.test(word)) {
      used = w // the line breaks here
      continue
    }
    if (used) lines++
    const more = Math.floor(Math.max(0, n - 1) / w) // a word longer than the line is broken
    lines += more
    used = n - more * w
  }
  return lines
}
const wraps = (c: any) => typeof c === 'string' || !/^truncate/.test(String(c?.props?.wrap ?? 'wrap'))
const buttonText = (c: any) => {
  const p = c.props || {}
  const label = (c.children ?? []).length ? textOf(c.children) : String(p.label ?? '')
  return p.plain ? (p.hotkey ? p.hotkey + ': ' : '') + label : '[ ' + label + ' ]'
}
const kidsOf = (n: any): any[] => (n.children ?? []).filter((c: any) => c != null && c !== false)
function leavesOf(box: any): Leaf[] {
  const out: Leaf[] = []
  for (const c of kidsOf(box)) {
    if (typeof c === 'string') out.push({ kind: 'text', text: c, drawn: c, x: 0, y: 0 })
    else if (c.type === 'Button') out.push({ kind: 'button', text: buttonText(c), drawn: buttonText(c), x: 0, y: 0 })
    else if (c.type === 'Box') out.push(...leavesOf(c))
    else out.push({ kind: 'text', text: textOf(c), drawn: textOf(c), x: 0, y: 0 })
  }
  return out
}
function basisOf(c: any, avail: number): number {
  if (typeof c === 'string') return Math.min(cellW(c), avail)
  if (c.type === 'Button') return cellW(buttonText(c))
  if (c.type === 'Box') {
    const w = c.props?.width
    if (typeof w === 'number') return w
    if (typeof w === 'string' && /%$/.test(w)) return (avail * parseFloat(w)) / 100
    return kidsOf(c).reduce((n: number, k: any) => n + basisOf(k, avail), 0)
  }
  return Math.min(cellW(textOf(c)), avail)
}
const shrinkOf = (c: any) => (typeof c === 'string' ? 1 : c.type === 'Button' ? 0 : c.type === 'Box' ? (c.props?.flexShrink ?? 1) : 1)
function layout(kids: any[], width: number, x0: number, y: number, out: Leaf[]) {
  const basis = kids.map((c) => basisOf(c, width))
  const shrink = kids.map(shrinkOf)
  const total = basis.reduce((a, b) => a + b, 0)
  let widths = basis
  if (total > width) {
    const over = total - width
    const scaled = kids.reduce((n, _c, i) => n + shrink[i]! * basis[i]!, 0)
    const f = kids.map((_c, i) => (scaled ? Math.max(0, basis[i]! - (over * shrink[i]! * basis[i]!) / scaled) : basis[i]!))
    let acc = 0
    let prev = 0
    widths = f.map((v) => {
      acc += v
      const r = Math.round(acc)
      const w = Math.max(0, r - prev)
      prev = r
      return w
    })
  }
  let x = x0
  kids.forEach((c, i) => {
    const w = widths[i]!
    if (typeof c !== 'string' && c.type === 'Box') {
      const inner: Leaf[] = []
      layout(kidsOf(c), w, x, y, inner)
      if (c.props?.overflow === 'hidden') {
        for (const l of inner) {
          const room = Math.max(0, x + w - l.x)
          if (cellW(l.drawn) > room) l.drawn = [...l.drawn].slice(0, room).join('')
        }
      }
      out.push(...inner)
    } else if (typeof c !== 'string' && c.type === 'Button') out.push({ kind: 'button', text: buttonText(c), drawn: buttonText(c), x, y })
    else {
      const t = typeof c === 'string' ? c : textOf(c)
      // a Text drawn narrower than its text: cut if it truncates, else wrapped onto more lines
      const h = cellW(t) > w && wraps(c) ? wrapLines(t, w) : 1
      out.push({ kind: 'text', text: t, drawn: truncEnd(t, w), x, y, h })
    }
    x += w
  })
}
/** One row Box as the terminal draws it `width` cells wide; a wrapping row line by line. */
function drawRow(box: any, width: number): Leaf[] {
  const out: Leaf[] = []
  const kids = kidsOf(box)
  if (box.props?.flexWrap !== 'wrap') {
    layout(kids, width, 0, 0, out)
    return out
  }
  const lines: any[][] = [[]]
  let used = 0
  for (const c of kids) {
    const b = basisOf(c, width)
    if (used + b > width && lines[lines.length - 1]!.length) {
      lines.push([])
      used = 0
    }
    lines[lines.length - 1]!.push(c)
    used += b
  }
  lines.forEach((l, y) => layout(l, width, 0, y, out))
  return out
}
const drawnLines = (ls: Leaf[]) => {
  const rows: string[] = []
  for (const l of ls) {
    let s = rows[l.y] ?? ''
    if (cellW(s) < l.x) s += ' '.repeat(l.x - cellW(s))
    rows[l.y] = s + l.drawn
  }
  // a line no leaf is drawn on (one holding only a box no rows tall, a two-line row's break) takes no screen line;
  // a line holding a wrapped Text is as tall as that Text
  const tall: number[] = []
  for (const l of ls) tall[l.y] = Math.max(tall[l.y] ?? 1, l.h ?? 1)
  const out: string[] = []
  rows.forEach((r, y) => {
    if (r === undefined) return
    out.push(r)
    for (let k = 1; k < (tall[y] ?? 1); k++) out.push('')
  })
  return out.length ? out : ['']
}
const undrawn = (box: any) => leavesOf(box).map((l) => l.text).join('')

// ---- the pane as screen lines -----------------------------------------------------------------------------------

/** An element of the pane's column: the screen lines it draws, its own text and, for a row Box, the Box. */
type El = { node: any; text: string; lines: string[]; row: any | null }
function elements(n: any, width: number, out: El[] = []): El[] {
  if (Array.isArray(n)) {
    for (const c of n) elements(c, width, out)
    return out
  }
  if (n == null || n === false) return out
  if (typeof n === 'string') {
    out.push({ node: n, text: n, lines: [n], row: null })
    return out
  }
  if (n.type === 'Box' && n.props?.flexDirection === 'column') {
    for (const c of kidsOf(n)) elements(c, width, out)
    return out
  }
  if (n.type === 'Box') {
    out.push({ node: n, text: undrawn(n), lines: drawnLines(drawRow(n, width)), row: n })
    return out
  }
  const t = n.type === 'Input' ? 'Input ' + String(n.props?.label ?? '') : n.type === 'Button' ? buttonText(n) : textOf(n)
  // a lone Text wider than the pane wraps onto more lines unless it truncates
  const h = n.type === 'Text' && cellW(t) > width && wraps(n) ? wrapLines(t, width) : 1
  out.push({ node: n, text: t, lines: [truncEnd(t, width), ...Array.from({ length: h - 1 }, () => '')], row: null })
  return out
}
const screen = (els: El[]) => els.flatMap((e) => e.lines)
const dump = (els: El[]) => '\n' + screen(els).map((l, i) => String(i).padStart(3) + ' |' + l + '|').join('\n')

/** Where each element starts on the screen (its first line), and whether it is inside the engine's window. */
function placed(els: El[], rows: number) {
  let at = 0
  return els.map((e) => {
    const p = { ...e, at, shown: at + e.lines.length <= rows }
    at += e.lines.length
    return p
  })
}

// ---- the table's columns and a row's drawn cells (as fx3-narrow-73.test.ts) ------------------------------------

type Cell = { name: string; text: string; drawn: string }
function columnsOf(head: any) {
  const seen = new Map<string, number>()
  const cols: { name: string; w: number }[] = []
  for (const h of leavesOf(head).slice(1)) {
    const t = h.text.trim()
    if (!t && cols.length) {
      cols[cols.length - 1]!.w += cellW(h.text)
      continue
    }
    const k = (seen.get(t) ?? 0) + 1
    seen.set(t, k)
    cols.push({ name: k > 1 ? 'roll ' + t : t, w: cellW(h.text) })
  }
  return cols
}
function cellsOf(box: any, cols: { name: string; w: number }[], width: number): Cell[] {
  const ls = drawRow(box, width)
  const lead = ls[0] && (ls[0].kind === 'button' || /^\s+$/.test(ls[0].text)) ? 1 : 0
  const body = ls.slice(lead)
  const out: Cell[] = []
  let at = 0
  for (const c of cols) {
    const parts: Leaf[] = []
    let used = 0
    while (at < body.length && used < c.w && body[at]!.kind === 'text') {
      parts.push(body[at]!)
      used += cellW(body[at]!.text)
      at++
    }
    out.push({ name: c.name, text: parts.map((p) => p.text).join(''), drawn: parts.map((p) => p.drawn).join('') })
  }
  return out
}
const MARKS = /[●◉○✓✗]/g

// ---- the world ------------------------------------------------------------------------------------------------

const OPUS = 'claude-opus-5-5' // fixture
const SONNET = 'claude-sonnet-5-5' // fixture
const MANIFEST = { run_id: 'build-20261102T090000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P1' } // fixture
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; model: string; effort: string; done: boolean }
const N_WORKERS = 12 // fixture: more rows than a 20-line pane holds at two lines a row
const wk = (i: number) => 'wk' + String(i).padStart(2, '0') // fixture labels
// P1 > sub-orchestrator (opus 5.5 · high cfg, running) > wk01 … wk12 (sonnet 5.5 · medium cfg and opus 5.5 · high cfg in
// turn; all returned but wk12, which runs)
const treeOf = (n: number): Agent[] => [
  { id: 's1', description: 'P1 sub-orch probe', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, effort: 'high', done: false },
  ...Array.from({ length: n }, (_, i) => ({
    id: 'w' + (i + 1),
    description: wk(i + 1) + ' worker',
    subagentType: 'baton:worker',
    prompt: 'Do node T' + (i + 1),
    parent: 's1',
    model: i % 2 ? OPUS : SONNET,
    effort: i % 2 ? 'high' : 'medium',
    done: i + 1 < n,
  })),
]
const RUNNING = wk(N_WORKERS)
const LABEL = /\b(wk\d\d|P\d|prime|sub-orch)\b/

async function world($: any, on: any, o: { question?: boolean; workers?: number } = {}) {
  const TREE = treeOf(o.workers ?? N_WORKERS)
  const files: Record<string, string> = {
    '_orch/manifest.json': JSON.stringify(MANIFEST),
    '_orch/plan/graph.yaml': '- id: T1\n  phase: 1\n- id: T2\n  phase: 2\n',
    '_orch/phases/P1/brief.md': 'brief',
  }
  const dirs: Record<string, any[]> = { '_orch/phases': [{ name: 'P1', kind: 'directory' }], '_orch/nodes': [], '_orch/inbox': [] }
  if (o.question) {
    files['_orch/inbox/Q-7.md'] = '# Q-7 — which parser should the run use?\n' // fixture: an open question (no answer file)
    dirs['_orch/inbox'] = [{ name: 'Q-7.md', kind: 'file' }]
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
  on('fs.exists', (_$: any, e: any) => ({ value: !!find(files, e.path) || !!find(dirs, e.path) }))
  const clock = mock.clock(on)
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'baton', title: 'baton', isShown: false, isFocused: false, isPlaced: true }] }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.model', () => ({ value: OPUS }))
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
  const byPrompt = new Map(TREE.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ model: byPrompt.get(e.prompt)?.model ?? OPUS, agentId: byPrompt.get(e.prompt)?.id ?? e.prompt }))
  const byId = new Map(TREE.map((a) => [a.id, a]))
  on('turn.step', async function* (_$: any, e: any) {
    const m = byId.get(e.agentId)?.model ?? OPUS
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: m, input_tokens: 4000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/work', surface: null } as any)
  await clock.advance(2000)
  await clock.settle()
  for (const a of TREE) {
    await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
    // the effort the step carries, with no classic input naming one: a configured effort, drawn `· <effort> cfg` (T8E)
    const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, effort: a.effort } as any)
    for (let x = await g.next(); !x.done; x = await g.next());
  }
  for (const a of [...TREE].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: 'DONE · ok', isAborted: false } as any)
  await clock.advance(61000) // past the mod's own re-read interval, so the pane reads the inbox as it stands
  await clock.settle()
  return clock
}

/** Open the pane at `rows` lines, 73 columns. With `message`, a running agent's ✉ is pressed first (in a pane tall
 * enough to draw it), so its message field is drawn under the list. */
async function paneAt($: any, clock: any, rows: number, o: { message?: boolean } = {}) {
  await $.command.run({ command: 'baton', args: '' } as any)
  await clock.advance(1000)
  await clock.settle()
  const props = (offset = 0, r = rows) => ({ title: 'baton', isFocused: true, bodyColumns: DOCKED_165, placement: 'dock', scroll: { bodyRows: r, offset } })
  if (o.message) {
    const tall = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props(0, 80) as any })
    const msg = (await tall.findAll({ type: 'Button' })).find((b: any) => String(b.props.label ?? '').includes('✉'))
    expect(msg, 'a running row draws its ✉').toBeTruthy()
    await tall.press({ key: msg.key })
    await clock.advance(10)
    await clock.settle()
    await tall.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props() as any })
  await clock.advance(10)
  await clock.settle()
  await ui.redraw(props() as any)
  const read = async () => {
    const els = elements(await ui.drawn(), DOCKED_165)
    return { els, at: placed(els, rows) }
  }
  const pageDown = async () => {
    const { els } = await read()
    await $.ui.scroll({ component: 'Pane', requestId: 'baton', offset: 0, by: rows, bodyRows: rows, contentRows: screen(els).length, origin: { kind: 'person' } } as any)
    await clock.advance(10)
    await clock.settle()
    await ui.redraw(props() as any)
  }
  return { ui, read, pageDown }
}

const isTreeRow = (e: El) => !!e.row && leavesOf(e.row)[0]?.kind === 'button' && /[◆●○✓✗◉]/.test(e.text) && LABEL.test(e.text)
const labelOf = (e: El) => (LABEL.exec(e.text) ?? [])[1]
// Q-66: "dim "↑ <k> more" / "↓ <k> more" lines at the edges" (a more line's hidden-row keys follow it, `more` then `a: `)
const DOWN_MORE = /↓\s*(\d+)\s+more/
const UP_MORE = /↑\s*(\d+)\s+more/
const HINT = /\bb goes back\b/
const QUESTION = /\bQ-7\b/

/** The cut cases of the attempt-2 and attempt-3 verdicts, on every tree row drawn in the pane. */
function cutCases(els: El[], rows: number) {
  const head = els.find((e) => e.row && /\bagent\b/.test(e.text) && /\bmodel\b/.test(e.text) && /\bsteps\b/.test(e.text))
  expect(head, 'the table header is drawn' + dump(els)).toBeTruthy()
  const cols = columnsOf(head!.row)
  const at = placed(els, rows)
  for (const e of at.filter((x) => x.shown && isTreeRow(x))) {
    const cs = cellsOf(e.row, cols, DOCKED_165)
    const say = e.lines.join('\n')
    const get = (n: string) => cs.find((c) => c.name === n)!
    // L112 / T8E: the model cell whole, its effort mark with it, never `…` (attempt 2: `opus 5.5 · hi…c…`)
    if (/wk\d\d|sub-orch/.test(e.text)) expect(get('model').drawn.trim(), say).toMatch(/^(opus|sonnet) 5\.5 · (high|medium) cfg$/)
    expect(get('model').drawn, say).not.toContain('…')
    // L312-313, L348-349: the stepper drawn whole, a phase row's with its four marks (attempt 2: `◉─○──○    …`)
    expect(get('steps').drawn.trim(), say).toBe(get('steps').text.trim())
    if (/[●○◉] P\d\b/.test(e.text)) expect((get('steps').drawn.match(MARKS) ?? []).length, say).toBe(4)
    // L341-345: no cell but the label (after its indent and mark) and state cut; an empty cell blank, never `…`
    for (const c of cs) {
      if (c.name === 'agent' || /^sta/.test(c.name)) continue
      expect(c.drawn.trimEnd(), c.name + ': ' + say).toBe(c.text.trimEnd())
      if (!c.text.trim()) expect(c.drawn, c.name + ': ' + say).not.toContain('…')
    }
  }
}

// The three short panes: 14 lines with the hint line under the list; 16 with the message field too; 20 with the open
// question's row too (each the least lines besides the list plus room for a scrolling window of two-line rows).
const SHORT: [number, { question?: boolean; message?: boolean }][] = [
  [14, {}],
  [16, { message: true }],
  [20, { message: true, question: true }],
]
for (const [rows, o] of SHORT) {
  // R-C10-90 R-C8-03 R-C10-28 · T15 spec L284 "The agent list uses the pane's full height", L285 "When the agents do not
  // fit, the list scrolls", L368 "The list takes the rows that are left"; Q-68 "the lines above and below it stay
  // drawn"; Q-F115-1 A: one empty bottom row while it scrolls. With two-line rows (P4-FX3-d2) at 73 columns.
  test('R-C10-90 R-C8-03 R-C10-28: at 73 columns in a ' + rows + '-line pane the list scrolls, the lines under it stay drawn and the pane is filled less one spare row', SLOW, async ($, on) => {
    const clock = await world($, on, o)
    const p = await paneAt($, clock, rows, o)
    const { els, at } = await p.read()
    const all = screen(els)
    // the pane is filled: its height less the one spare row of a scrolling list, no line pushed out, none left empty
    expect(all.length, rows + '-line pane drew ' + all.length + ' lines:' + dump(els)).toBe(rows - 1)
    // the list scrolls: a ↓ more line, and fewer tree rows drawn than the tree has
    expect(at.some((e) => e.shown && DOWN_MORE.test(e.text)), 'a ↓ more line' + dump(els)).toBe(true)
    const drawnRows = at.filter((e) => e.shown && isTreeRow(e)).map(labelOf)
    expect(drawnRows.length, 'some rows of the list drawn' + dump(els)).toBeGreaterThan(0)
    expect(drawnRows.length, 'not every row of the list drawn' + dump(els)).toBeLessThan(N_WORKERS + 2)
    // the lines under the list stay drawn: the hint line, the message field, the open question's row
    // (the message field, once a ✉ is pressed, stands where the hint line stood)
    if (o.message) expect(at.some((e) => e.shown && e.node?.type === 'Input'), 'the message field is drawn' + dump(els)).toBe(true)
    else expect(at.some((e) => e.shown && HINT.test(e.text)), 'the hint line is drawn' + dump(els)).toBe(true)
    if (o.question) expect(at.some((e) => e.shown && QUESTION.test(e.text)), 'the question row is drawn' + dump(els)).toBe(true)
    // and nothing in a drawn row is cut (the cut cases of the attempt-2 and attempt-3 verdicts)
    cutCases(els, rows)
    await p.ui.unmount()
  })
}

// R-C10-90 R-C10-04 · T15 spec L369 "The engine's PageUp and PageDown scroll it by one window"; Q-63. In the shortest
// pane of the refutation (14 lines, its G10: "after PageDown the list did not scroll").
test('R-C10-90 R-C10-04: at 73 columns in a 14-line pane PageDown moves the list by a window and the lines under it stay drawn', SLOW, async ($, on) => {
  const clock = await world($, on)
  const p = await paneAt($, clock, 14)
  const before = await p.read()
  const first = before.at.filter((e) => e.shown && isTreeRow(e)).map(labelOf)
  await p.pageDown()
  const after = await p.read()
  const second = after.at.filter((e) => e.shown && isTreeRow(e)).map(labelOf)
  expect(second.length, 'rows drawn after PageDown' + dump(after.els)).toBeGreaterThan(0)
  expect(second[0], 'the window moved: before ' + JSON.stringify(first) + dump(after.els)).not.toBe(first[0])
  expect(after.at.some((e) => e.shown && UP_MORE.test(e.text)), 'an ↑ more line' + dump(after.els)).toBe(true)
  expect(screen(after.els).length, dump(after.els)).toBe(13)
  expect(after.at.some((e) => e.shown && HINT.test(e.text)), 'the hint line is drawn' + dump(after.els)).toBe(true)
  cutCases(after.els, 14)
  await p.ui.unmount()
})

// R-C10-90 · T15 Q-64 (a running row scrolled out is drawn in a strip at its edge, the strips a third of the area at
// most), at 73 columns with two-line rows: in a 26-line pane the running wk12, below the window, is drawn in its strip.
test('R-C10-90: at 73 columns in a 26-line pane the running row below the window is drawn pinned in its strip', SLOW, async ($, on) => {
  const clock = await world($, on, { question: true })
  const p = await paneAt($, clock, 26, { message: true })
  const { els, at } = await p.read()
  const shown = at.filter((e) => e.shown && isTreeRow(e)).map(labelOf)
  expect(shown, 'the running row is pinned' + dump(els)).toContain(RUNNING)
  const iRun = at.findIndex((e) => e.shown && isTreeRow(e) && labelOf(e) === RUNNING)
  const iMore = at.findIndex((e) => e.shown && DOWN_MORE.test(e.text))
  expect(iMore, 'a ↓ more line' + dump(els)).toBeGreaterThan(-1)
  expect(iRun, 'the strip stands above its ↓ more line' + dump(els)).toBeLessThan(iMore)
  // and the strip takes its lines from the list's, not from the pane: filled to its height less the spare row
  expect(screen(els).length, dump(els)).toBe(25)
  expect(at.some((e) => e.shown && e.node?.type === 'Input'), 'the message field is drawn' + dump(els)).toBe(true)
  expect(at.some((e) => e.shown && QUESTION.test(e.text)), 'the question row is drawn' + dump(els)).toBe(true)
  await p.ui.unmount()
})

// R-C10-90 · T15 Q-67 (a row scrolled out keeps its direct key on its edge's more line) with every pool letter held
// (spec L389: 22 letters): at 73 columns the ↓ more line, its keys and all, takes one line, so the pane still holds
// exactly its height less the spare row and the lines under the list stay drawn (seen live: a more line with six keys).
test('R-C10-90: at 73 columns with every row letter held the more line takes one line and the pane is filled less one spare row', SLOW, async ($, on) => {
  const clock = await world($, on, { workers: 26 })
  for (const rows of [16, 20]) {
    const p = await paneAt($, clock, rows)
    const { els, at } = await p.read()
    const more = at.find((e) => e.shown && DOWN_MORE.test(e.text))
    expect(more, 'a ↓ more line' + dump(els)).toBeTruthy()
    expect(more!.lines.length, 'the more line is one line' + dump(els)).toBe(1)
    expect(screen(els).length, dump(els)).toBe(rows - 1)
    expect(at.some((e) => e.shown && HINT.test(e.text)), 'the hint line is drawn' + dump(els)).toBe(true)
    await p.ui.unmount()
  }
})

// R-C10-90 · the same T15 rules over every pane height from 17 to 44 lines at 73 columns, with the message field and the
// question row under the list (17: its 12 other lines, the spare row and the least a scrolling window of two-line rows
// takes, one row and its two more lines): the pane never draws more lines than it has, a scrolling list fills it less
// its one spare row, and the lines under it stay drawn; and from the top to the end by PageDown at each height.
test('R-C10-90: at 73 columns in every pane from 17 to 44 lines no line is pushed out and a scrolling list fills the pane', SLOW, async ($, on) => {
  const clock = await world($, on, { question: true })
  const bad: string[] = []
  for (let rows = 17; rows <= 44; rows++) {
    const p = await paneAt($, clock, rows, { message: true })
    for (let page = 0; page < 8; page++) {
      const { els, at } = await p.read()
      const n = screen(els).length
      // rows still below the window (a ↓ more line): the window has rows to fill the pane with (at the list's end
      // it holds only the rows left, with one-line rows as with two)
      const scrolls = at.some((e) => DOWN_MORE.test(e.text))
      const where = rows + ' lines, page ' + page + ': '
      if (n > rows) bad.push(where + n + ' lines drawn' + dump(els))
      else if (scrolls && n !== rows - 1) bad.push(where + 'scrolling, ' + n + ' lines drawn, not ' + (rows - 1) + dump(els))
      if (!at.some((e) => e.shown && e.node?.type === 'Input')) bad.push(where + 'no message field')
      if (!at.some((e) => e.shown && QUESTION.test(e.text))) bad.push(where + 'no question row')
      if (!at.some((e) => DOWN_MORE.test(e.text))) break // the list's end is in the window
      await p.pageDown()
    }
    await p.ui.unmount()
  }
  expect(bad.slice(0, 3)).toEqual([])
})
