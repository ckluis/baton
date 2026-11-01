// claude plugin test — T12: the memory explorer is a table (C12).
//
// Written from the spec (docs/designs/v7.6-tuning.md L157-167) and the operator's answers BEFORE the
// implementation (node T112, the red step of F112). Requirement ids are the rows of
// _orch/plan/traceability.yaml, cluster C12: R-C12-01 "The memory explorer shows notes as a table with aligned
// columns:", R-C12-02 "id, time, source, text, and the rest it already shows.", R-C12-03 "A summary's children (its
// sub-memories) can be drilled into", R-C12-04 "and back out of.", R-C12-05 "Drilling works from the keyboard, as in
// T9.", R-C12-06 "Acceptance: a plugin test for column alignment", R-C12-07 "and one for drill-in and drill-out,".
// Expected values come from the spec, the inbox answers (OQ6, OQ7), the decided defaults Q-23 (H27) and Q-32 (H24)
// in _orch/plan/decisions.md, T19's work/key-scheme.md, E1's probes §k, and T112's work/missing-drill.md; none is
// copied from the implementation.
//
// Tests named `guard: ...` are preservation guards (OQ7: "`+` drill-in and `b` drill-out in Memory) gets guard
// tests, named `guard:…`, that pass now and at every later commit"), classed in T112's work/guard-evidence.md.
// Every other test must fail at the run tip da5910c, by its own assertion.
//
// Ownership (hazard H28; C15 owns the marks): these tests read the Memory view only: its note and summary rows, the
// `+` and `b` controls and the accent of the drill keys. They give `c`, `v` and `u` no action (C15's mark keys,
// inbox/Q-83.answer.md, plan/decisions/D-T14-mark-letters.md) and assert nothing about a mark column.
//
// The world: the engine beneath the mod answers from memory, as mod/tests/interface.test.ts does. The memo CLI is
// stubbed at process.run (a plugin test has no processes) and answers in the shape bin/memo.mjs gives with --json
// (`{ header, tiles: [{ level, index, lo, hi }], lines }`, lines as lib/memcore.mjs noteLine/blockLine write them).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const SID = '5b2d9e10-7c4a-4f1e-8a3b-2c1d0e9f8a7b' // fixture: this session's id
const NOW = Date.parse('2026-10-19T12:00:00Z') // fixture: the clock; every note below is from this same day
// Q-32's decided default (_orch/plan/decisions.md § Q-32, H24): ↑/↓, Enter and `+` are drawn "in the same accent
// style as `1`, `2` and `r` (`#99CCFF`, E1 §k)".
const ACCENT = '#99CCFF'

// ------------------------------------------------------------------ the fixture memory (11 notes, 0..10)

const TAGS = ['prime', 'sub', 'operator', 'handoff', 'prime', 'sub', 'operator', 'prime', 'sub', 'operator', 'handoff'] // fixture: sources of different widths
const ts = (i: number) => '2026-10-19T11:' + String(10 + i).padStart(2, '0') + ':00Z' // fixture: one minute apart, same day as NOW
const textOf = (i: number) => 'fixture note ' + i + ': step ' + 'abcdefghijk'[i] // fixture: unique per note
const noteLine = (i: number) => '#' + i + ' ' + ts(i) + ' [' + TAGS[i] + '] ' + textOf(i) // bin/memo.mjs line shape (lib/memcore.mjs noteLine)
const SUMMARY: Record<string, string> = { '2:0': 'summary of notes 0 to 3', '1:0': 'summary of notes 0 and 1', '1:1': 'summary of notes 2 and 3', '1:2': 'summary of notes 4 and 5', '1:3': 'summary of notes 6 and 7' } // fixture
type Tile = { level: number; index: number; lo: number; hi: number }
const lineOf = (t: Tile) => (t.level === 0 ? noteLine(t.lo) : '#' + t.lo + '-' + (t.hi - 1) + ' (' + (t.hi - t.lo) + ' notes) ' + SUMMARY[t.level + ':' + t.index]) // memo's blockLine shape
const note = (i: number): Tile => ({ level: 0, index: i, lo: i, hi: i + 1 })
// The wake view: an L2 summary of #0-3, two L1 summaries, then notes #8, #9 and #10 (ids of two widths).
const WAKE: Tile[] = [{ level: 2, index: 0, lo: 0, hi: 4 }, { level: 1, index: 2, lo: 4, hi: 6 }, { level: 1, index: 3, lo: 6, hi: 8 }, note(8), note(9), note(10)]
/** memo zoom: #0-3 opens into its two L1 summaries; an L1 range opens into its notes. */
function zoomTiles(range: string): Tile[] {
  const [lo, hi] = range.split('-').map(Number)
  if (lo === 0 && hi === 3) return [{ level: 1, index: 0, lo: 0, hi: 2 }, { level: 1, index: 1, lo: 2, hi: 4 }]
  const out: Tile[] = []
  for (let i = lo; i <= hi; i++) out.push(note(i))
  return out
}

function world(on: any) {
  const clock = mock.clock(on, { now: NOW })
  const files = new Map<string, string>()
  const m = { run_id: 'build-20261019T125436Z', mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(NOW - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(NOW).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  const rel = (p: string) => {
    const s = String(p)
    if (s === '_orch' || s.endsWith('/_orch')) return '_orch'
    if (s.startsWith('_orch/')) return s
    const i = s.lastIndexOf('/_orch/')
    return i >= 0 ? s.slice(i + 1) : s
  }
  on('fs.read', (_$: any, e: any) => {
    const v = files.get(rel(e.path))
    return v === undefined ? { deny: 'no such file' } : { value: v }
  })
  on('fs.write', (_$: any, e: any) => {
    files.set(rel(e.path), e.text)
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => ({ value: files.has(rel(e.path)) }))
  on('fs.list', () => ({ deny: 'no such directory' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine ' + JSON.stringify(e.component)] })
  })
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
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
  const zooms: string[] = []
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv].map(String)
    let out: any = {}
    if (argv.includes('stats')) out = { notes: 11, summaries: 5, treeCapacity: 7, levels: 3, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('zoom')) {
      const range = argv[argv.length - 1]
      zooms.push(range)
      const tiles = zoomTiles(range)
      out = { header: 'notes #' + range + ' of 11', tiles, lines: tiles.map(lineOf) }
    } else if (argv.includes('wake')) out = { header: 'memory: 11 notes', tiles: WAKE, lines: WAKE.map(lineOf) }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  async function settle(ms: number) {
    await clock.advance(ms)
    await clock.settle()
  }
  /** Start the session, open the pane, and switch to the Memory tab (`2`, E1 §k). */
  async function memory($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    const ui: any = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } } as any })
    await ui.press({ key: 'tab-memory' })
    await settle(1000)
    return ui
  }
  return { settle, memory, zooms }
}

// ------------------------------------------------------------------ reading the drawn tree

const kids = (n: any): any[] => (n && typeof n === 'object' ? (Array.isArray(n) ? n : n.children || []) : [])
const num = (v: any) => (typeof v === 'number' ? v : v === undefined || v === null ? 0 : 1) // a step name ('xs') is one cell on the terminal
const width = (s: string) => Array.from(s).length // one cell per code point: the terminal draws these glyphs one cell wide

/**
 * A model of how the terminal lays a drawn element out as cells (T112's, written from the element docs in
 * mod/.claude-plugin/types: a row Box sets its children side by side with `columnGap` (or `gap`) cells between them,
 * a numeric `width`/`minWidth` pads a child to that many cells, a column Box stacks its children; a plain Button is
 * drawn "without chrome: the hotkey in the accent color, a colon, the label", otherwise as `[ label ]`).
 * It reads only the layout props, never a whole row of another cluster.
 */
function cells(n: any): string {
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(cells).join('')
  const p = n.props || {}
  let s: string
  if (n.type === 'Button') {
    const inner = kids(n).length ? kids(n).map(cells).join('') : String(p.label ?? '')
    s = p.plain ? (p.hotkey ? p.hotkey + ': ' : '') + inner : '[ ' + inner + ' ]'
  } else if (n.type === 'Box') {
    const parts = kids(n).map((c: any) => {
      const t = cells(c)
      const w = c && c.props ? (typeof c.props.width === 'number' ? c.props.width : typeof c.props.minWidth === 'number' ? c.props.minWidth : 0) : 0
      return w && width(t) < w && !t.includes('\n') ? t + ' '.repeat(w - width(t)) : t
    })
    const dir = p.flexDirection ?? 'row' // Ink's Box lays out in a row unless told otherwise
    s = dir.startsWith('column') ? parts.join('\n') : parts.join(' '.repeat(num(p.columnGap ?? p.gap)))
  } else if (n.type === 'Input' || n.type === 'Select') s = ''
  else s = kids(n).map(cells).join('')
  return s
}

/** Every element of the tree, in document order. */
function all(tree: any): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    out.push(n)
    kids(n).forEach(walk)
  }
  walk(tree)
  return out
}

const idRe = (id: string) => new RegExp('#' + id + '(?![0-9-])') // `#9` is not `#90` nor `#9-…`

/** The smallest drawn element holding note `i`'s id and its text: that note's row, and the line it lays out as. */
function noteRow(tree: any, i: number): { el: any; line: string } | undefined {
  let best: { el: any; line: string } | undefined
  for (const el of all(tree)) {
    if (el.type === 'Input' || el.type === 'Select') continue
    for (const line of cells(el).split('\n')) {
      if (!line.includes(textOf(i)) || !idRe(String(i)).test(line)) continue
      if (!best || width(line) < width(best.line)) best = { el, line }
    }
  }
  return best
}

/** The cell offsets where note `i`'s id, time, source and text columns start in its row's line. */
function columnsOf(line: string, i: number) {
  const id = line.search(idRe(String(i)))
  const afterId = id + ('#' + i).length
  const time = afterId + line.slice(afterId).search(/[0-9]/) // the time cell opens with a digit (HH:MM, or the date before it)
  const source = line.indexOf(TAGS[i], time)
  const text = line.indexOf(textOf(i), source)
  const at = (k: number) => width(line.slice(0, k))
  return { id: at(id), time: at(time), source: at(source), text: at(text) }
}

/** The smallest drawn row (a row Box) holding `re`, with the Buttons inside it. */
function rowWith(tree: any, re: RegExp) {
  let best: any
  for (const el of all(tree)) {
    if (el.type !== 'Box' || String(el.props?.flexDirection ?? 'row').startsWith('column')) continue
    const t = cells(el)
    if (!re.test(t) || t.includes('\n')) continue
    if (!best || width(t) < width(cells(best))) best = el
  }
  return best ? { el: best, buttons: all(best).filter((x) => x.type === 'Button') } : undefined
}

const labelOf = (b: any) => String(b.props?.label ?? cells(kids(b)) ?? '')
const keyOf = (b: any) => String(b.key ?? b.props?.key ?? labelOf(b))
/** The drill control of a summary row: its `+` Button (register.js ~1572-1577 at da5910c, E1 §k "memory summary (`+`)"). */
const plusOf = (r: any) => r && r.buttons.find((b: any) => labelOf(b).trim() === '+')
async function hotkey(ui: any, k: string) {
  return (await ui.findAll({ type: 'Button' })).find((b: any) => b.props?.hotkey === k)
}
async function shown(ui: any) {
  return cells(await ui.drawn())
}
/** Every Text drawn in the accent, not dim, whose own text (trimmed) is one of `glyphs`. */
async function accent(ui: any, glyphs: string[]) {
  return (await ui.findAll({ type: 'Text' })).filter((t: any) => glyphs.includes(String(t.text ?? cells(kids(t))).trim()) && t.props?.color === ACCENT && !t.props?.dimColor)
}

// ================================================================== guards (OQ7; work/guard-evidence.md)

test('guard: GE1 the table keeps every field the explorer showed before: +, id, time, source, text', async ($, on) => {
  // Requirement R-C12-02 (traceability.yaml): "id, time, source, text, and the rest it already shows." (spec L161)
  // Q-23's decided default (plan/decisions.md § Q-23, H27): "The columns are `+`/blank, id (`#n`, or `#lo-hi` for a
  // summary), time (HH:MM, with the date when it is not today), source (the tag), and text."
  // OQ7 (inbox/OQ7.answer.md): behaviour that already works gets a guard test. E1 §k k-09-memory.txt line 12
  // "+ #0-31 (32 notes) fixture note 1: …" and line 30 "#196 2026-10-19T14:29:23Z [probe] fixture note 197: …".
  const w = world(on)
  const ui = await w.memory($)
  const tree = await ui.drawn()
  // a summary row: its `+` and its `#lo-hi` id, and its summary text
  const sum = rowWith(tree, /#0-3(?![0-9])/)
  expect(!!sum, 'fixture: the summary #0-3 is drawn in a row').toBe(true) // fixture WAKE: an L2 summary of #0-3
  expect(!!plusOf(sum), 'the summary row keeps its +').toBe(true) // Q-23: "`+`/blank" column; E1 §k line 12 "+ #0-31"
  expect(cells(sum!.el)).toContain(SUMMARY['2:0']) // Q-23: the text column; fixture summary text
  // each note row: id, time, source and text
  for (const i of [8, 9, 10]) {
    const r = noteRow(tree, i)
    expect(!!r, 'note #' + i + ' is drawn with its id and text').toBe(true) // Q-23: id `#n` and text; fixture notes #8-#10
    const d = new Date(ts(i))
    const utc = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0')
    const local = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    expect(r!.line.includes(utc) || r!.line.includes(local), 'note #' + i + ' shows its time HH:MM').toBe(true) // Q-23: "time (HH:MM …)"; E1 k-09 shows the time inside the ISO stamp
    expect(r!.line).toContain(TAGS[i]) // Q-23: "source (the tag)"; E1 k-09 "[probe]"
  }
  // a note row has no `+` (Q-23: "`+`/blank")
  const n8 = rowWith(tree, new RegExp(textOf(8)))
  expect(!!n8, 'note #8 is drawn as a row of its own').toBe(true) // amended by GV4: without its row the next check ran on nothing (P2 gate item 4: no guard passes with zero assertions); fixture note #8
  expect(!!plusOf(n8), 'note #8 has no +').toBe(false) // Q-23: a note's first column is blank; register.js gives + only to level > 0 (E1 §k k-09 line 30: no +)
})

test('guard: GE2 a summary is drilled into from the keyboard by its + (focus and Enter)', async ($, on) => {
  // Requirement R-C12-03 (traceability.yaml): "A summary's children (its sub-memories) can be drilled into" (spec L163)
  // Requirement R-C12-05 (traceability.yaml): "Drilling works from the keyboard, as in T9." (spec L164)
  // OQ7 (inbox/OQ7.answer.md): "`+` drill-in … in Memory) gets guard tests". E1 §k: "| memory summary (`+`) | yes, ↓
  // lands on each `+` | yes, Enter on `+ #128-143` drills: "notes #128-143 (16 blocks)" |" (register.js ~1572-1577).
  const w = world(on)
  const ui = await w.memory($)
  const plus = plusOf(rowWith(await ui.drawn(), /#6-7(?![0-9])/))
  expect(!!plus, 'fixture: the summary #6-7 has a + Button').toBe(true) // fixture WAKE: an L1 summary of #6-7
  await ui.press({ key: keyOf(plus) }) // Enter on the focused + (the kit's press is the focused control's Enter)
  await w.settle(1000)
  expect(w.zooms).toContain('6-7') // E1 §k: the drill opens "notes #128-143", the summary's own range; Q-23: down to level-0 notes
  const t = await shown(ui)
  expect(t).toContain(textOf(6)) // fixture: the summary's children are notes #6 and #7
  expect(t).toContain(textOf(7)) // fixture: #7 is the other child of #6-7 (E1 k-10: the drilled view lists every note of the range)
  expect(t.includes(textOf(9))).toBe(false) // the wake view's other notes are no longer listed (E1 k-10: only #128-#143 shown)
})

test('guard: GE3 the drilled view goes back to its parent by b, one level at a time, and b is shown as 1 is', async ($, on) => {
  // Requirement R-C12-04 (traceability.yaml): "and back out of." (spec L163)
  // Requirement R-C12-05 (traceability.yaml): "Drilling works from the keyboard, as in T9." (spec L164)
  // OQ7 (inbox/OQ7.answer.md): "`b` drill-out in Memory) gets guard tests". E1 §k: "In Memory, `b` leaves a drill: the
  // view went back to "wake view (41 blocks …)" (k-11-mem-after-b.txt)" and line 13 "11 [s3:│b][s4:: back  Search: ]
  // ← Memory, once drilled: b highlighted" (register.js ~1555, 1271). Q-23: "`b` pops one level of `browse.stack`".
  const w = world(on)
  const ui = await w.memory($)
  // two levels down: #0-3 (L2) → #0-1 (L1) → notes #0 and #1
  await ui.press({ key: keyOf(plusOf(rowWith(await ui.drawn(), /#0-3(?![0-9])/))) })
  await w.settle(1000)
  const l1 = plusOf(rowWith(await ui.drawn(), /#0-1(?![0-9])/))
  expect(!!l1, 'drilled into #0-3: its child summary #0-1 has a +').toBe(true) // fixture zoom 0-3: two L1 summaries
  await ui.press({ key: keyOf(l1) })
  await w.settle(1000)
  expect(await shown(ui)).toContain(textOf(0)) // fixture: #0-1 opens into notes #0 and #1
  const one = await hotkey(ui, '1')
  const back = await hotkey(ui, 'b')
  expect(back ? { hotkey: back.props.hotkey, plain: back.props.plain } : null).toEqual({ hotkey: 'b', plain: one?.props?.plain }) // E1 §k line 13: b drawn as 1 is (plain, the hotkey in the accent)
  await ui.press({ key: keyOf(back) })
  await w.settle(1000)
  let t = await shown(ui)
  expect(t).toContain(SUMMARY['1:1']) // back one level: the parent #0-3's children, #0-1 and #2-3, are listed again
  expect(t.includes(textOf(0))).toBe(false) // the notes of #0-1 are gone
  expect(t.includes(textOf(9))).toBe(false) // not yet the wake view: b popped one level only (Q-23)
  await ui.press({ key: keyOf(await hotkey(ui, 'b')) })
  await w.settle(1000)
  t = await shown(ui)
  expect(t).toContain(SUMMARY['2:0']) // back at the wake view (E1 k-11: "wake view …")
  expect(t).toContain(textOf(9)) // fixture WAKE: note #9 is listed again in the wake view (E1 k-11)
})

// ================================================================== R-C12-01: column alignment

test('table: the notes are a table whose id, time, source and text columns start at the same offset on every row', async ($, on) => {
  // Requirement R-C12-01 (traceability.yaml): "The memory explorer shows notes as a table with aligned columns:" (spec L161)
  // Requirement R-C12-06 (traceability.yaml): "Acceptance: a plugin test for column alignment" (spec L165)
  // Q-23's decided default (plan/decisions.md § Q-23, H27): "Widths come from the widest value shown."
  // E1 k-09-memory.txt lines 33-34 (da5910c): "#199 … [probe] fixture note 200" and "#200 … [handoff] a new session"
  // put the text at different offsets.
  const w = world(on)
  const ui = await w.memory($)
  const tree = await ui.drawn()
  const cols: Record<number, ReturnType<typeof columnsOf>> = {}
  for (const i of [8, 9, 10]) {
    const r = noteRow(tree, i)
    expect(!!r, 'fixture: note #' + i + ' is drawn').toBe(true) // fixture WAKE: notes #8, #9, #10
    cols[i] = columnsOf(r!.line, i)
  }
  // fixture: #9 and #10 differ in id width; prime / operator / handoff differ in source width (TAGS)
  for (const c of ['id', 'time', 'source', 'text'] as const) {
    expect([8, 9, 10].map((i) => cols[i][c]), c + ' column starts at one offset on every note row').toEqual([cols[8][c], cols[8][c], cols[8][c]]) // R-C12-01: aligned columns
  }
})

test('table: in a drilled view the note rows are aligned too', async ($, on) => {
  // Requirement R-C12-01 (traceability.yaml): "The memory explorer shows notes as a table with aligned columns:" (spec L161)
  // Requirement R-C12-06 (traceability.yaml): "Acceptance: a plugin test for column alignment" (spec L165)
  // E1 k-10-mem-drill-enter.txt (da5910c): the drilled view lists its notes as the same `#n ts [tag] text` lines.
  const w = world(on)
  const ui = await w.memory($)
  await ui.press({ key: keyOf(plusOf(rowWith(await ui.drawn(), /#6-7(?![0-9])/))) })
  await w.settle(1000)
  const tree = await ui.drawn()
  const c6 = columnsOf(noteRow(tree, 6)!.line, 6)
  const c7 = columnsOf(noteRow(tree, 7)!.line, 7)
  expect(c7).toEqual(c6) // R-C12-01: fixture #6 (operator) and #7 (prime) differ in source width, so only a table aligns their text
})

// ================================================================== OQ6 part 1: the drill keys are shown (work/missing-drill.md)

test('missing #1: the Memory view shows + the way 1, 2 and r are shown (the accent)', async ($, on) => {
  // Requirement R-C12-05 (traceability.yaml): "Drilling works from the keyboard, as in T9." (spec L164)
  // OQ6 part 1 (inbox/OQ6.answer.md): "show the keys (↑/↓, Enter, `b`, `+`) the way `1`, `2` and `r` are shown".
  // E1 §k line 12: "12 [s4:+ #0-31 (32 notes) …] ← Memory: + drawn plain, not highlighted".
  const w = world(on)
  const ui = await w.memory($)
  expect(!!plusOf(rowWith(await ui.drawn(), /#0-3(?![0-9])/)), 'fixture: the summary #0-3 has a +').toBe(true) // fixture WAKE
  expect((await accent(ui, ['+'])).length > 0, 'item 1: + in the accent #99CCFF').toBe(true) // Q-32: + drawn in the accent #99CCFF, next to the summary it acts on
})

test('missing #2: the Memory view shows Enter, the key that drills, the way 1, 2 and r are shown (the accent)', async ($, on) => {
  // Requirement R-C12-05 (traceability.yaml): "Drilling works from the keyboard, as in T9." (spec L164)
  // OQ6 part 1 (inbox/OQ6.answer.md): "show the keys (↑/↓, Enter, `b`, `+`) the way `1`, `2` and `r` are shown".
  // E1 k-09-memory.txt (da5910c): no `Enter` is drawn in the Memory view; T112 probe-da5910c.md P-2.
  const w = world(on)
  const ui = await w.memory($)
  expect(!!plusOf(rowWith(await ui.drawn(), /#0-3(?![0-9])/)), 'fixture: the summary #0-3 has a +').toBe(true) // fixture WAKE
  expect((await accent(ui, ['Enter', '⏎'])).length > 0, 'item 2: Enter in the accent #99CCFF').toBe(true) // Q-32: Enter drawn in the accent #99CCFF, "next to the › and + they act on"
})
