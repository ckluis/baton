// claude plugin test — TC1 (run build-20261019T125436Z, phase P7): the agent view's last tool calls are an aligned
// terminal table.
//
// Written from the operator's note (_orch/inbox/operator-notes-20261106.md note 1.2), the phase brief
// (_orch/phases/P7/brief.md: the dock widths 49, 60, 75 and 90, plus 40 and 120) and the handoff's done-criterion 1
// BEFORE the change; nothing here is copied from the implementation. Before TC1 the block was free text: the time,
// the tool padded to 13, then the call's detail unbounded, so a long detail ran past the pane and the block was ragged.
//
// What is asserted, at every width: under the `last tool calls` heading a header row, then one row per call, oldest
// first; the columns start at the same cell on every row (a column is told by its header title); no row is wider
// than the pane body, and the terminal has nothing to shrink (every Text is drawn whole, none wraps); a long target
// is cut at its end with `…`, a short one is whole; the columns are the time, the tool, the target (path, command,
// pattern) and the result (ok / error, with its size where the pane is wide enough). Narrow, the time goes first;
// the tool and the target always show.
//
// The drawing model (a row's Texts laid out as the terminal does, each shrinking in proportion to its width when the
// row asks for more than the pane) is fx3-drawn-width.test.ts's; it is restated here so this file stands alone.
import { expect, mock, test } from 'claude-code/testing'

const SLOW = { timeoutMs: 30000 }
const WIDTHS = [49, 60, 75, 90, 40, 120] // _orch/phases/P7/brief.md: docked 49 60 75 90, plus 40 and 120
const MODEL = 'claude-opus-5-5' // fixture
const NOW = Date.parse('2026-11-06T09:00:00Z') // fixture: the clock the calls are stamped by

// ---- the drawing model --------------------------------------------------------------------------------------

const cellW = (s: string) => [...s].length
const textOf = (x: any): string =>
  typeof x === 'string' || typeof x === 'number' ? String(x)
  : x == null || x === false ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : textOf(x.children)
function truncEnd(t: string, w: number): string {
  if (cellW(t) <= w) return t
  if (w <= 0) return ''
  if (w === 1) return '…'
  return [...t].slice(0, w - 1).join('') + '…'
}
const kidsOf = (n: any): any[] => (n.children ?? []).filter((c: any) => c != null && c !== false)
type Leaf = { text: string; drawn: string; x: number; wrap: string | undefined }
/** A row Box drawn `width` cells wide: each Text asks for its text, and gives up room in proportion when the row is over. */
function drawRow(box: any, width: number): Leaf[] {
  const kids = kidsOf(box)
  const basis = kids.map((c) => Math.min(cellW(textOf(c)), width))
  const total = basis.reduce((a, b) => a + b, 0)
  let widths = basis
  if (total > width) {
    const over = total - width
    let acc = 0
    let prev = 0
    widths = basis.map((b) => {
      acc += Math.max(0, b - (over * b) / total)
      const r = Math.round(acc)
      const w = Math.max(0, r - prev)
      prev = r
      return w
    })
  }
  const out: Leaf[] = []
  let x = 0
  kids.forEach((c, i) => {
    const t = textOf(c)
    out.push({ text: t, drawn: truncEnd(t, widths[i]!), x, wrap: typeof c === 'string' ? undefined : c.props?.wrap })
    x += widths[i]!
  })
  return out
}
const drawnLine = (ls: Leaf[]) => ls.map((l) => l.drawn).join('')
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

// ---- the world: a run with one worker that made ten tool calls ----------------------------------------------

const MANIFEST = { run_id: 'build-20261106T090000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P1' } // fixture
const W1 = { id: 'w1', description: 'T1 table probe', subagentType: 'baton:worker', prompt: 'Do node T1' } // fixture
const LONG_CMD = 'node --test mod/test/alpha.test.mjs mod/test/beta.test.mjs mod/test/gamma.test.mjs mod/test/delta.test.mjs && echo every suite passed' // fixture: a long Bash command (124 chars)
const LONG_PATH = '/work/packages/frontend/src/components/dashboard/widgets/charts/time-series/AxisLabelFormatter.ts' // fixture: a long path (99 chars)
const LONG_URL = 'https://example.com/docs/reference/configuration/settings/advanced/environment-variables' // fixture
type Call = { input: Record<string, string>; tool: string; target: string; fails?: boolean; out?: string }
// Ten calls, short and very long, Bash commands, file paths, a pattern, a failed call; `target` is what the row
// names (the path, the command, the pattern), `out` what the tool answered.
const CALLS: Call[] = [
  { input: { tool: 'Read', file_path: '/work/src/app.ts' }, tool: 'Read', target: '/work/src/app.ts', out: 'x'.repeat(812) },
  { input: { tool: 'Bash', command: 'npm test' }, tool: 'Bash', target: 'npm test', out: 'all passed' },
  { input: { tool: 'Grep', pattern: 'addItem', path: 'src' }, tool: 'Grep', target: 'addItem in src', out: 'src/a.ts' },
  { input: { tool: 'Bash', command: LONG_CMD }, tool: 'Bash', target: LONG_CMD, out: 'every suite passed' },
  { input: { tool: 'Edit', file_path: LONG_PATH }, tool: 'Edit', target: LONG_PATH, out: 'edited' },
  { input: { tool: 'Bash', command: 'npm run build' }, tool: 'Bash', target: 'npm run build', fails: true, out: 'Exit code 1' },
  { input: { tool: 'Glob', pattern: '**/*.test.ts' }, tool: 'Glob', target: '**/*.test.ts', out: 'a.test.ts' },
  { input: { tool: 'Write', file_path: '/work/src/short.ts' }, tool: 'Write', target: '/work/src/short.ts', out: 'written' },
  { input: { tool: 'WebFetch', url: LONG_URL }, tool: 'WebFetch', target: LONG_URL, out: 'y'.repeat(14200) },
  { input: { tool: 'Bash', command: 'ls' }, tool: 'Bash', target: 'ls', out: 'src' },
]

async function world($: any, on: any) {
  const files: Record<string, string> = {
    '_orch/manifest.json': JSON.stringify(MANIFEST),
    '_orch/plan/graph.yaml': '- id: T1\n  phase: 1\n',
    '_orch/phases/P1/brief.md': 'brief',
  }
  const dirs: Record<string, any[]> = { '_orch/phases': [{ name: 'P1', kind: 'directory' }], '_orch/nodes': [] }
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
  const clock = mock.clock(on, { now: NOW })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'baton', title: 'baton', isShown: false, isFocused: false, isPlaced: true }] }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.model', () => ({ value: MODEL }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.319', base: '2.1.319' } }))
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
  on('agent.spawn', () => ({ model: MODEL, agentId: W1.id }))
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, input_tokens: 4000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  on('command.run', () => ({ text: 'core' }))
  // core: each call answers as the fixture says; the failed one as core reports an error (isError, its text)
  on('tool.call', (_$: any, e: any) => {
    const c = CALLS.find((x) => Object.entries(x.input).every(([k, v]) => e[k] === v))
    if (c && c.fails) return { isError: true, result: c.out, text: c.out }
    return { result: c ? c.out : 'ran', text: c ? c.out : 'ran' }
  })
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/work', surface: null } as any)
  await clock.advance(2000)
  await clock.settle()
  await $.agent.spawn({ prompt: W1.prompt, description: W1.description, subagentType: W1.subagentType } as any)
  const g = $.turn.step({ agentId: W1.id, turnId: 't-w1', index: 0, model: MODEL, messageCount: 1 } as any)
  for (let x = await g.next(); !x.done; x = await g.next());
  for (const c of CALLS) {
    await clock.advance(7000)
    await $.tool.call({ ...c.input, agentId: W1.id } as any)
  }
  await $.turn.complete({ agentId: W1.id, answer: 'DONE · ok', isAborted: false } as any)
  await clock.advance(10)
  await clock.settle()
  return { clock }
}

/** The agent's view at `width`: the rows under `last tool calls`, as drawn. */
async function callsAt($: any, width: number) {
  await $.command.run({ command: 'baton', args: 'show T1 table probe' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: width, placement: width > 100 ? 'inline' : 'dock', scroll: { bodyRows: 80 } } as any })
  const tree = await ui.drawn()
  await ui.unmount()
  const boxes = rowBoxes(tree)
  const at = boxes.findIndex((b) => textOf(b).trim() === 'last tool calls')
  if (at < 0) throw new Error('width ' + width + ': no `last tool calls` heading in ' + JSON.stringify(boxes.map(textOf)))
  const rows = boxes.slice(at + 1, at + 2 + CALLS.length).map((b) => {
    const leaves = drawRow(b, width)
    return { text: textOf(b), leaves, line: drawnLine(leaves) }
  })
  return rows
}

/** The header's columns: each title and the cell it starts at. */
function columnsOf(header: string) {
  const out: { name: string; at: number }[] = []
  const re = /\S+/g
  for (let m = re.exec(header); m; m = re.exec(header)) out.push({ name: m[0], at: m.index })
  return out
}
/** A row's cells over the header's columns: from each column's start to the next's, trimmed. */
function cellsOf(line: string, cols: { name: string; at: number }[]) {
  const cs = [...line]
  const out: Record<string, string> = {}
  cols.forEach((c, i) => (out[c.name] = cs.slice(c.at, i + 1 < cols.length ? cols[i + 1]!.at : cs.length).join('').trim()))
  return out
}

for (const w of WIDTHS) {
  test('TC1: the last tool calls are a header row and one row per call, the columns aligned, at ' + w + ' columns', SLOW, async ($, on) => {
    await world($, on)
    const rows = await callsAt($, w)
    const [head, ...body] = rows
    const cols = columnsOf(head!.line)
    const names = cols.map((c) => c.name)
    expect(names, 'width ' + w + ' header: ' + head!.line).toContain('tool')
    expect(names, 'width ' + w + ' header: ' + head!.line).toContain('target')
    expect(names, 'width ' + w + ' header: ' + head!.line).toContain('result')
    if (w >= 49) expect(names, 'width ' + w + ' header: ' + head!.line).toContain('time') // the docked widths and up keep the time
    expect(names.indexOf('tool') < names.indexOf('target') && names.indexOf('target') < names.indexOf('result'), head!.line).toBe(true) // tool, target, result, in that order
    if (names.includes('time')) expect(names[0], head!.line).toBe('time')
    expect(body.length, 'one row per call').toBe(CALLS.length)
    body.forEach((r, i) => {
      const line = r.line
      // aligned: every column starts at its header title's cell, two blank cells before it
      for (const c of cols) {
        expect([...line][c.at] ?? '', 'width ' + w + ' row ' + i + ' column ' + c.name + ' starts at ' + c.at + ':\n' + head!.line + '\n' + line).not.toBe(' ')
        if (c.at >= 2) expect([...line].slice(c.at - 2, c.at).join(''), 'width ' + w + ' row ' + i + ' before ' + c.name + ':\n' + head!.line + '\n' + line).toBe('  ')
      }
      const cell = cellsOf(line, cols)
      expect(cell.tool, 'width ' + w + ' row ' + i + ': ' + line).toBe(CALLS[i]!.tool)
      if (names.includes('time')) expect(cell.time, line).toMatch(/^\d\d:\d\d(:\d\d)?$/)
      expect(cell.result, 'width ' + w + ' row ' + i + ': ' + line).toMatch(CALLS[i]!.fails ? /^error\b/ : /^ok\b/)
    })
    // the rows are in the order the calls were made: the time column never goes back
    if (names.includes('time')) {
      const times = body.map((r) => cellsOf(r.line, cols).time!)
      for (let i = 1; i < times.length; i++) expect(times[i]! >= times[i - 1]!, times.join(' ')).toBe(true)
    }
  })

  test('TC1: no tool-call row is wider than the pane, nothing is shrunk or wrapped, and long text is cut at its end with …, at ' + w + ' columns', SLOW, async ($, on) => {
    await world($, on)
    const rows = await callsAt($, w)
    for (const r of rows) {
      expect(cellW(r.text), 'width ' + w + ' asks for more than the pane: ' + r.text).toBeLessThanOrEqual(w)
      for (const l of r.leaves) {
        expect(l.drawn, 'width ' + w + ' the terminal shrank a cell: ' + r.line).toBe(l.text)
        expect(l.wrap, 'width ' + w + ' a cell wraps: ' + r.line).not.toBe('wrap')
      }
    }
    const [head, ...body] = rows
    const cols = columnsOf(head!.line)
    body.forEach((r, i) => {
      const t = cellsOf(r.line, cols).target!
      const want = CALLS[i]!.target
      if (t.endsWith('…')) {
        expect(want.startsWith(t.slice(0, -1)), 'width ' + w + ' row ' + i + ' cut, not at its end: ' + t).toBe(true)
        expect(t.length, 'width ' + w + ' row ' + i + ': ' + t).toBeGreaterThan(4)
      } else expect(t, 'width ' + w + ' row ' + i + ': ' + r.line).toBe(want)
    })
    // the long command and the long path never fit, at any of these widths: they are cut, the short ones whole
    for (const i of [3, 4]) expect(cellsOf(body[i]!.line, cols).target, 'width ' + w + ': ' + body[i]!.line).toMatch(/…$/)
    for (const i of [1, 9]) expect(cellsOf(body[i]!.line, cols).target, 'width ' + w + ': ' + body[i]!.line).toBe(CALLS[i]!.target)
  })
}

test('TC1: where the pane has room, the result carries its size, and the time is to the second', SLOW, async ($, on) => {
  await world($, on)
  for (const w of [75, 90, 120]) {
    const rows = await callsAt($, w)
    const [head, ...body] = rows
    const cols = columnsOf(head!.line)
    expect(cellsOf(body[0]!.line, cols).result, 'width ' + w + ': ' + body[0]!.line).toBe('ok 812') // the Read answered 812 characters
    expect(cellsOf(body[8]!.line, cols).result, 'width ' + w + ': ' + body[8]!.line).toBe('ok 14k') // the WebFetch 14,200
    expect(cellsOf(body[5]!.line, cols).result, 'width ' + w + ': ' + body[5]!.line).toMatch(/^error/) // the failed build
    expect(cellsOf(body[0]!.line, cols).time, body[0]!.line).toMatch(/^\d\d:\d\d:\d\d$/)
  }
})
