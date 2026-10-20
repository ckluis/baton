// claude plugin test — T14 memory marks, part B (node T114B, the split-out red step of F114): the memory explorer.
// The mark column, the filters `3` and `4`, the mark keys `c`, `v` and `u`, the `reason:` dialog and its hint lines.
//
// Written from the spec (docs/designs/v7.6-tuning.md L403-457 and the operator answers L458-564), the operator's
// answers (_orch/inbox/Q-71, Q-72, Q-73, Q-74, Q-75, Q-83 .answer.md, quoted by T114A's work/t14-answers.md) and the
// planner's display decisions (_orch/plan/decisions/D-T14-mark-glyphs, D-T14-mark-column, D-T14-filter-keys,
// D-T14-mark-letters, D-T14-mark-messages, D-T14-mark-history, Q-90) BEFORE the implementation exists. Requirement
// ids are the rows of _orch/plan/traceability.yaml, cluster C15. F114 may not edit these tests.
//
// Ownership (hazard H28): C8-C11 change agent rows and C12 owns the table's other columns, so these tests read only
// what C15 owns: the mark glyph cell of a row and where it starts, the `id`/`mark` header cells, the key-line Buttons
// `c`, `v`, `u`, `3`, `4`, which rows a filter leaves drawn, the hint-line message, the `reason:` dialog, the mark
// records in the store, and the mark history in a note's view. They never compare a whole row string.
//
// The store is a fixture. A plugin test runs no process, so the memo CLI the mod drives through $.process.run
// (mod/bin/memo.mjs) is answered by `fakeMemo` below, from memory, in the shape bin/memo.mjs gives with --json
// (`{ header, tiles: [{ level, index, lo, hi }], lines }`, as T112's t12-memtable.test.ts answers it). It never
// marks, hides or filters anything by itself. It takes the four storage commands T114A's fixture memo defines
// (_orch/nodes/T114A/work/t14-answers.md "How T114A's tests drive the store"), which the real memo must take too:
//   mark <id> ok|void|clear --who operator|prime [--session <id>] [--reason <text> | -]   appends one mark record
//   marks [<id>]     every mark record (of that id), oldest first (JSON with --json)
//   rebuild <lo>-<hi> --reason <text> -     and   superseded       (answered so a ❌ rebuild can run)
// No test reads or writes a real memory: every path is under the fixture root /proj (_orch/inbox/Q-85.answer.md:
// the run's own bad records are the operator's to mark, after T14 ships).
//
// How the person is played (types claude-code/index.d.ts: ButtonProps.hotkey, UiFocusInput, $.ui.ask):
//   - a letter or digit key presses the drawn Button carrying it as its `hotkey`; with none drawn the key does nothing;
//   - focusing a row moves the Pane's focus ring (`$.ui.focus`, origin person) onto the first Button drawn in that row
//     (a summary row's `+` today); a row that draws no Button cannot take the ring;
//   - Enter presses the focused element; a row's view is opened by Enter on the row's open control, the Button in the
//     row that is not its `+` drill (the pane's rows open by Enter on a control: E1 §k "Enter opens it");
//   - $.ui.ask is a tool.call of AskUserQuestion (as mod/tests/approvals.test.ts answers it): the answer is the typed
//     text ("resolves to ... the text typed under Other"), and a dismissed dialog is `{ deny }` ("Rejects when
//     dismissed").
//
// One test is named `guard: ...`: a preservation guard (OQ7, _orch/inbox/OQ7.answer.md), exempt from red, logged in
// _orch/nodes/T114B/work/guard-evidence.md as a deviation from spec L19-20 and L100. Every other test must fail at
// the run tip da5910c by its own assertion.
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_MEMORY = RUN + '/_orch/memory' // fixture: the run's memory directory (manifest memory.run)
const SID = '5b2d9e10-7c4a-4f1e-8a3b-2c1d0e9f8a7b' // fixture: this session's id, the manifest's prime session
const NOW = Date.parse('2026-10-19T12:00:00Z') // fixture: the clock; every note below is from this same day
const SLOW = { timeoutMs: 30000 }

// ------------------------------------------------------------------ the fixture memory (11 notes, 0..10)
// As T112's fixture: an L2 summary of #0-3 (L1 #0-1, #2-3 under it), L1 #4-5 and #6-7, then notes #8, #9, #10.

const TAGS = ['prime', 'sub', 'operator', 'handoff', 'prime', 'sub', 'operator', 'prime', 'sub', 'operator', 'handoff'] // fixture: sources of different widths
const ts = (i: number) => '2026-10-19T11:' + String(10 + i).padStart(2, '0') + ':00Z' // fixture: one minute apart
const textOf = (i: number) => 'fixture note ' + i + ': step ' + 'abcdefghijk'[i] // fixture: unique per note
const noteLine = (i: number) => '#' + i + ' ' + ts(i) + ' [' + TAGS[i] + '] ' + textOf(i) // bin/memo.mjs line shape (lib/memcore.mjs noteLine)
const SUMMARY: Record<string, string> = { '2:0': 'summary of notes 0 to 3', '1:0': 'summary of notes 0 and 1', '1:1': 'summary of notes 2 and 3', '1:2': 'summary of notes 4 and 5', '1:3': 'summary of notes 6 and 7' } // fixture
type Tile = { level: number; index: number; lo: number; hi: number }
const lineOf = (t: Tile, sums: Map<string, string>) => (t.level === 0 ? noteLine(t.lo) : '#' + t.lo + '-' + (t.hi - 1) + ' (' + (t.hi - t.lo) + ' notes) ' + (sums.get(t.level + ':' + t.index) ?? '(not merged yet)')) // memo's blockLine shape
const note = (i: number): Tile => ({ level: 0, index: i, lo: i, hi: i + 1 })
const WAKE: Tile[] = [{ level: 2, index: 0, lo: 0, hi: 4 }, { level: 1, index: 2, lo: 4, hi: 6 }, { level: 1, index: 3, lo: 6, hi: 8 }, note(8), note(9), note(10)] // fixture wake view
function zoomTiles(range: string): Tile[] {
  const [lo, hi] = range.replace(/^#/, '').split('-').map(Number)
  if (lo === 0 && hi === 3) return [{ level: 1, index: 0, lo: 0, hi: 2 }, { level: 1, index: 1, lo: 2, hi: 4 }]
  const out: Tile[] = []
  for (let i = lo; i <= hi; i++) out.push(note(i))
  return out
}
// The rows of the wake view, found by their own text (never by a whole row string).
const ROWS: Record<string, string> = { '0-3': SUMMARY['2:0'], '4-5': SUMMARY['1:2'], '6-7': SUMMARY['1:3'], '8': textOf(8), '9': textOf(9), '10': textOf(10) } // fixture WAKE

type Mark = { id: string; mark: string; reason: string; who: string; session?: string; ts: string }
const rec = (id: string, m: string, who: string, reason: string, at: string): Mark => ({ id, mark: m, reason, who, ...(who === 'prime' ? { session: SID } : {}), ts: at }) // a seeded mark record (T114A's record shape)

// ------------------------------------------------------------------ the fixture memo CLI

const VALUE_FLAGS = new Set(['dir', 'root', 'ns', 'tag', 'budget', 'limit', 'max', 'memory-dir', 'who', 'session', 'reason', 'level', 'index', 'id', 'mark'])
function parseArgv(argv: string[]) {
  const flags: Record<string, any> = {}
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2)
      if (eq > 0) flags[k] = a.slice(eq + 1)
      else if (VALUE_FLAGS.has(k)) flags[k] = argv[++i]
      else flags[k] = true
    } else rest.push(a)
  }
  return { flags, rest }
}
const normId = (s: any) => String(s ?? '').trim().replace(/^#/, '')

type Store = { marks: Mark[]; sums: Map<string, string> }
function fakeMemo(st: Store, zooms: string[]) {
  return (argv: string[], stdin?: string) => {
    const { flags, rest } = parseArgv(argv.slice(2))
    const cmd = rest.shift()
    const json = !!flags.json
    const ok = (obj: any, text: string) => ({ exitCode: 0, stdout: (json ? JSON.stringify(obj) : text) + '\n', stderr: '' })
    switch (cmd) {
      case 'stats':
        return ok({ notes: 11, summaries: st.sums.size, treeCapacity: 10, levels: 3, pending: 0, ready: 0 }, '11 notes')
      case 'wake': {
        const lines = WAKE.map((t) => lineOf(t, st.sums))
        return ok({ header: 'memory: 11 notes', tiles: WAKE, lines }, lines.join('\n'))
      }
      case 'zoom': {
        const range = rest.join('').trim()
        zooms.push(range)
        const tiles = zoomTiles(range)
        const lines = tiles.map((t) => lineOf(t, st.sums))
        return ok({ header: 'notes #' + range + ' of 11', tiles, lines }, lines.join('\n'))
      }
      case 'recall':
        return ok({ pattern: '.', total: 0, notes: [], blocks: [] }, 'recall: 0 note(s)')
      case 'pending':
        return ok([], 'no merges pending')
      case 'merge':
        return ok({ merged: 0, pending: 0 }, 'merged 0')
      case 'note':
        return ok({ index: 11, text: '', truncated: false, merges: [] }, 'noted #11')
      case 'mark': {
        const id = normId(flags.id ?? rest[0])
        const m = String(flags.mark ?? rest[1] ?? '')
        if (!id || !['ok', 'void', 'clear'].includes(m)) return { exitCode: 1, stdout: '', stderr: 'memo: mark <id> ok|void|clear\n' }
        const reason = (flags.reason !== undefined ? String(flags.reason) : rest.includes('-') || stdin !== undefined ? String(stdin ?? '') : '').trim()
        const r: Mark = { id, mark: m, reason, who: String(flags.who ?? ''), ts: new Date(Date.now()).toISOString() }
        if (flags.session !== undefined) r.session = String(flags.session)
        st.marks.push(r)
        return ok(r, 'marked #' + id + ' ' + m)
      }
      case 'marks': {
        const id = rest[0] !== undefined ? normId(rest[0]) : null
        const list = st.marks.filter((m) => id === null || m.id === id)
        return ok(list, list.map((m) => '#' + m.id + ' ' + m.mark + ' ' + m.who + ' ' + m.reason).join('\n') || 'no marks')
      }
      case 'rebuild': {
        const m = /^#?(\d+)-(\d+)$/.exec(String(rest[0] ?? ''))
        if (!m) return { exitCode: 1, stdout: '', stderr: 'memo: rebuild <lo>-<hi>\n' }
        const lo = Number(m[1])
        const size = Number(m[2]) - lo + 1
        const level = Math.round(Math.log2(size))
        const key = level + ':' + lo / size
        const old = st.sums.get(key)
        if (old !== undefined && String(stdin ?? '').trim()) st.sums.set(key, String(stdin).trim())
        return ok({ level, index: lo / size, lo, hi: lo + size - 1, old, text: st.sums.get(key) }, 'rebuilt')
      }
      case 'superseded':
        return ok([], 'none')
      default:
        return { exitCode: 2, stdout: '', stderr: 'memo: unknown command "' + cmd + '"\n' }
    }
  }
}

// ------------------------------------------------------------------ the world beneath the mod

type Answer = string | undefined | ((options: string[]) => string | undefined)
type Opts = { marks?: Mark[]; answers?: Answer[] }
const DEFAULT_REASON = 'checked by the operator in the fixture' // fixture: what the dialog is answered with when a test gives no answer

function world(on: any, o: Opts = {}) {
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
  const eng: { focused: string | undefined } = { focused: undefined }
  on('ui.focus', (_$: any, e: any) => {
    eng.focused = e.element // the ring lands where the hooks above left it (UiFocusInput.element)
    return {}
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
  // A ❌ queues a rebuild (Q-76) on the cheap model: the fixture's summarizer answers at once.
  on('model.complete', () => ({ value: { isAnswered: true, text: 'rebuilt fixture summary', usage: {} } }))
  // The dialog: $.ui.ask is a tool.call of AskUserQuestion (as mod/tests/approvals.test.ts answers it).
  const answers = [...(o.answers ?? [])]
  const asked: { question: string; options: string[]; multiSelect: boolean }[] = []
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options = (q.options || []).map((x: any) => String(x.label))
    asked.push({ question: String(q.question), options, multiSelect: !!q.multiSelect })
    let a: Answer = answers.length ? answers.shift() : DEFAULT_REASON
    if (typeof a === 'function') a = a(options)
    if (a === undefined) return { deny: 'dismissed' } // "Rejects when dismissed" (types $.ui.ask)
    return { result: { questions: e.questions, answers: { [q.question]: a } } }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  const st: Store = { marks: (o.marks ?? []).map((x) => ({ ...x })), sums: new Map(Object.entries(SUMMARY)) }
  const zooms: string[] = []
  const memo = fakeMemo(st, zooms)
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv].map(String)
    if (!String(argv[1] ?? '').endsWith('/bin/memo.mjs')) return { value: { exitCode: 0, stdout: '{}', stderr: '' } }
    return { value: memo(argv, e.init?.stdin) }
  })
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  async function settle(ms = 1000) {
    await clock.advance(ms)
    await clock.settle()
  }
  /** Start the session, open the pane (/baton) and mount it, as T112's world does. */
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    const ui: any = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } } as any })
    return ui
  }
  /** ... and switch to the Memory tab (`2`, E1 §k). */
  async function memory($: any) {
    const ui = await pane($)
    await ui.press({ key: 'tab-memory' })
    await settle(1000)
    return ui
  }
  const marksOf = (id: string) => st.marks.filter((x) => x.id === id)
  return { settle, pane, memory, marksOf, st, asked, eng, zooms }
}
type World = ReturnType<typeof world>

// ------------------------------------------------------------------ reading the drawn tree (T112's layout model)

const kids = (n: any): any[] => (n && typeof n === 'object' ? (Array.isArray(n) ? n : n.children || []) : [])
const num = (v: any) => (typeof v === 'number' ? v : v === undefined || v === null ? 0 : 1)
const width = (s: string) => Array.from(s).length // one cell per code point (✅ U+2705 and ❌ U+274C are one code point each)

/** How the terminal lays a drawn element out as cells (T112's model, from the element docs in the types). */
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
    const dir = p.flexDirection ?? 'row'
    s = dir.startsWith('column') ? parts.join('\n') : parts.join(' '.repeat(num(p.columnGap ?? p.gap)))
  } else if (n.type === 'Input' || n.type === 'Select') s = ''
  else s = kids(n).map(cells).join('')
  return s
}
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
const labelOf = (b: any) => String(b.props?.label ?? cells(kids(b)) ?? '').trim()
const keyOf = (b: any) => String(b.key ?? b.props?.key ?? labelOf(b))

/** The smallest drawn one-line row Box holding `text`: a table row, with the Buttons inside it and its line. */
function rowWith(tree: any, text: string) {
  let best: any
  for (const el of all(tree)) {
    if (el.type !== 'Box' || String(el.props?.flexDirection ?? 'row').startsWith('column')) continue
    const t = cells(el)
    if (!t.includes(text) || t.includes('\n')) continue
    if (!best || width(t) < width(cells(best))) best = el
  }
  return best ? { el: best, line: cells(best), buttons: all(best).filter((x) => x.type === 'Button') } : undefined
}
/** The line a row lays out as within the table (the row's own Box, so every row starts at the table's left edge). */
const rowLine = (tree: any, id: string) => rowWith(tree, ROWS[id])?.line
/** The mark glyph a row draws in its mark cell: '✅', '❌' or '' (D-T14-mark-glyphs). */
function glyphOf(line: string | undefined) {
  if (!line) return undefined
  const g = Array.from(line).filter((c) => c === '✅' || c === '❌')
  return g.join('')
}
/** The cell offset where a row's mark glyph starts, or -1. */
function glyphAt(line: string | undefined) {
  if (!line) return -1
  const cs = Array.from(line)
  return cs.findIndex((c) => c === '✅' || c === '❌')
}
const drawnText = async (ui: any) => cells(await ui.drawn())
/** Which wake rows are drawn (a row is drawn when its own text is). */
async function rowsDrawn(ui: any) {
  const t = await drawnText(ui)
  const out: Record<string, boolean> = {}
  for (const id of Object.keys(ROWS)) out[id] = t.includes(ROWS[id])
  return out
}

// ------------------------------------------------------------------ playing the person

/** A key the person presses: the drawn Button carrying it as `hotkey` (ButtonProps.hotkey); with none, nothing. */
async function key(ui: any, w: World, k: string) {
  const b = (await ui.findAll({ type: 'Button' })).find((x: any) => x.props?.hotkey === k)
  if (b) await ui.press({ key: keyOf(b) })
  await w.settle()
  return !!b
}
/** The person moves the Pane's focus ring onto `element` (an arrow step or a click: origin person). */
async function focusOn($: any, w: World, element: string) {
  await $.ui.focus({ component: 'Pane', requestId: 'baton', plugin: 'baton', element, origin: { kind: 'person' } } as any)
  await w.settle(10)
}
/** Focus a table row: the ring onto the first Button drawn in that row; a row with no Button cannot take it. */
async function focusRow($: any, ui: any, w: World, id: string) {
  const r = rowWith(await ui.drawn(), ROWS[id])
  const b = r?.buttons[0]
  if (b) await focusOn($, w, keyOf(b))
  return !!b
}
/** Focus, then Enter on, the drawn Button labelled `label` (a key-line button). */
async function focusAndEnter($: any, ui: any, w: World, label: string) {
  const b = (await ui.findAll({ type: 'Button' })).find((x: any) => labelOf(x) === label)
  if (b) {
    await focusOn($, w, keyOf(b))
    await ui.press({ key: keyOf(b) })
  }
  await w.settle()
  return !!b
}
/** Open a row's view: focus and Enter on the row's open control (its Button that is not the `+` drill). */
async function openRow($: any, ui: any, w: World, id: string) {
  const r = rowWith(await ui.drawn(), ROWS[id])
  const b = r?.buttons.find((x: any) => labelOf(x) !== '+')
  if (b) {
    await focusOn($, w, keyOf(b))
    await ui.press({ key: keyOf(b) })
  }
  await w.settle()
  return !!b
}
/** The summary row's `+` drill (register.js ~1572 at da5910c; T112 GE2). */
async function drill(ui: any, w: World, id: string) {
  const r = rowWith(await ui.drawn(), ROWS[id])
  const b = r?.buttons.find((x: any) => labelOf(x) === '+')
  if (b) await ui.press({ key: keyOf(b) })
  await w.settle()
  return !!b
}
const marksMap = (w: World) => w.st.marks.map((x) => ({ id: x.id, mark: x.mark }))

// ================================================================== the mark column (L424-425)

// R-C15-20 · spec L425 "The memory explorer shows ✅ and ❌ in a column of their own in T12's table."
// D-T14-mark-column: "the mark column is headed `mark` and sits directly after the `id` column, before `time`".
test('c7 the table has a column headed mark directly after the id column', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  const lines = (await drawnText(ui)).split('\n')
  const header = lines.find((l) => /(^|\s)id\s+mark(\s|$)/.test(l)) // D-T14-mark-column: `id`, then `mark`, nothing between
  expect(header !== undefined, 'a header line where `mark` is the next column after `id`').toBe(true) // D-T14-mark-column "directly after the `id` column"
})

// R-C15-20 · spec L425 "shows ✅ and ❌ in a column of their own" · D-T14-mark-glyphs: "a confirmed note or summary
// draws `✅` in the mark column".
test('c8 a confirmed row\'s mark cell draws ✅', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('8', 'ok', 'operator', 'checked', '2026-10-19T11:30:00Z')] }) // fixture: #8 is ✅
  const ui = await w.memory($)
  const line = rowLine(await ui.drawn(), '8')
  expect(!!line, 'fixture: note #8 is drawn').toBe(true) // fixture WAKE: note #8
  expect(glyphOf(line)).toBe('✅') // D-T14-mark-glyphs: confirmed draws `✅`
})

// R-C15-20 · spec L425 · D-T14-mark-glyphs: "a void one draws `❌`".
test('c9 a void row\'s mark cell draws ❌', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('10', 'void', 'operator', 'a stray session wrote it', '2026-10-19T11:30:00Z')] }) // fixture: #10 is ❌
  const ui = await w.memory($)
  const line = rowLine(await ui.drawn(), '10')
  expect(!!line, 'fixture: note #10 is drawn').toBe(true) // fixture WAKE: note #10
  expect(glyphOf(line)).toBe('❌') // D-T14-mark-glyphs: void draws `❌`
})

// R-C15-20 · spec L414 "Unmarked is the default, and means neither confirmed nor void." · D-T14-mark-glyphs: "an
// unmarked one draws nothing (blank cell)".
test('c10 an unmarked row\'s mark cell is blank', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('8', 'ok', 'operator', 'checked', '2026-10-19T11:30:00Z')] }) // fixture: #8 ✅, #9 unmarked
  const ui = await w.memory($)
  const tree = await ui.drawn()
  const at = glyphAt(rowLine(tree, '8')) // where the mark column is: the ✅ of the marked row
  const l9 = rowLine(tree, '9')
  expect(!!l9, 'fixture: note #9 is drawn').toBe(true) // fixture WAKE: note #9
  const blank = at >= 0 && glyphOf(l9) === '' && /^\s{2}$/.test(Array.from(l9!).slice(at, at + 2).join('')) // D-T14-mark-glyphs: "blank cell", "two cells wide"
  expect(blank, 'note #9 draws a blank two-cell mark cell where #8 draws its ✅').toBe(true) // L414 unmarked; D-T14-mark-glyphs blank cell
})

// R-C15-20 · spec L425 "in a column of their own in T12's table" (T12's alignment, L161 "aligned columns") ·
// D-T14-mark-column "sits directly after the `id` column".
test('c11 the mark column starts at the same cell offset on every row', SLOW, async ($, on) => {
  const w = world(on, {
    marks: [
      rec('8', 'ok', 'operator', 'checked', '2026-10-19T11:30:00Z'), // fixture: a one-digit note id
      rec('10', 'void', 'operator', 'stray', '2026-10-19T11:31:00Z'), // fixture: a two-digit note id
      rec('4-5', 'ok', 'operator', 'summary checked', '2026-10-19T11:32:00Z'), // fixture: a summary row (with its +)
    ],
  })
  const ui = await w.memory($)
  const tree = await ui.drawn()
  const offs = ['8', '10', '4-5'].map((id) => glyphAt(rowLine(tree, id)))
  expect({ offsets: offs, found: offs.every((x) => x >= 0) }).toEqual({ offsets: [offs[0], offs[0], offs[0]], found: true }) // L425 + T12 L161: one offset on every row
})

// R-C15-19 · spec L424 "A summary built only from ✅ notes shows ✅." · D-T14-mark-glyphs: "A summary built only
// from ✅ notes draws `✅`".
test('c6 a summary built only from ✅ notes shows ✅ in the mark column', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('4', 'ok', 'operator', 'checked', '2026-10-19T11:30:00Z'), rec('5', 'ok', 'operator', 'checked', '2026-10-19T11:31:00Z')] }) // fixture: both children of L1 #4-5 are ✅; the summary itself is unmarked
  const ui = await w.memory($)
  const line = rowLine(await ui.drawn(), '4-5')
  expect(!!line, 'fixture: the summary #4-5 is drawn').toBe(true) // fixture WAKE: L1 #4-5
  expect(glyphOf(line)).toBe('✅') // L424; D-T14-mark-glyphs
})

// ================================================================== the filters 3 and 4 (L426-427)

// The filter fixture: ✅ rows #8 and #4-5, ❌ rows #10 and #6-7, unmarked #9 and #0-3.
const FILTER_MARKS = [
  rec('8', 'ok', 'operator', 'checked', '2026-10-19T11:30:00Z'),
  rec('4-5', 'ok', 'operator', 'checked', '2026-10-19T11:31:00Z'),
  rec('10', 'void', 'operator', 'stray', '2026-10-19T11:32:00Z'),
  rec('6-7', 'void', 'operator', 'built from a stray note', '2026-10-19T11:33:00Z'),
] // fixture
const ONLY_OK = { '0-3': false, '4-5': true, '6-7': false, '8': true, '9': false, '10': false } // "confirmed only": the ✅ rows of FILTER_MARKS
const ONLY_VOID = { '0-3': false, '4-5': false, '6-7': true, '8': false, '9': false, '10': true } // "void only": the ❌ rows of FILTER_MARKS
const EVERY = { '0-3': true, '4-5': true, '6-7': true, '8': true, '9': true, '10': true } // every row of the wake view

// R-C15-22 · spec L426-427 "can filter ... to "confirmed only"" · D-T14-filter-keys: "`3` shows confirmed only".
test('c12 3 in the Memory view draws only the ✅ rows', SLOW, async ($, on) => {
  const w = world(on, { marks: FILTER_MARKS })
  const ui = await w.memory($)
  expect(await rowsDrawn(ui), 'fixture: every row is drawn before the filter').toEqual(EVERY) // fixture WAKE
  await key(ui, w, '3')
  expect(await rowsDrawn(ui)).toEqual(ONLY_OK) // D-T14-filter-keys: `3` confirmed only
})

// R-C15-21 · spec L426 "The memory explorer can filter to "void only"" · D-T14-filter-keys: "`4` shows void only".
test('c13 4 in the Memory view draws only the ❌ rows', SLOW, async ($, on) => {
  const w = world(on, { marks: FILTER_MARKS })
  const ui = await w.memory($)
  await key(ui, w, '4')
  expect(await rowsDrawn(ui)).toEqual(ONLY_VOID) // D-T14-filter-keys: `4` void only
})

// R-C15-21, R-C15-22 · D-T14-filter-keys: "Pressing the active filter's key again shows every note."
test('c14 pressing the active filter\'s key again draws every row', SLOW, async ($, on) => {
  const w = world(on, { marks: FILTER_MARKS })
  const ui = await w.memory($)
  await key(ui, w, '3')
  const first = await rowsDrawn(ui)
  await key(ui, w, '3')
  const second = await rowsDrawn(ui)
  expect({ first, second }).toEqual({ first: ONLY_OK, second: EVERY }) // D-T14-filter-keys: the active key toggles its filter off, "shows every note"
})

// R-C15-21, R-C15-07 · spec L415-416 "by focus-and-Enter" · D-T14-filter-keys: "drawn ... as `3: confirmed only` and
// `4: void only` ... each is a focusable button (focus-and-Enter does the same)".
test('c15 focus and Enter on the 4: void only button draws only the ❌ rows', SLOW, async ($, on) => {
  const w = world(on, { marks: FILTER_MARKS })
  const ui = await w.memory($)
  await focusAndEnter($, ui, w, 'void only') // D-T14-filter-keys label `void only`
  expect(await rowsDrawn(ui)).toEqual(ONLY_VOID) // D-T14-filter-keys: as `4` does
})

// R-C15-09 · spec L416-417 "These keys are shown the way `1`, `2` and `r` are shown." · D-T14-filter-keys: "drawn
// on the Memory view's key line ... as `3: confirmed only` and `4: void only`, highlighted the way `1`, `2` and `r`
// are". The tab Buttons are plain hotkey Buttons (register.js:2935; T19 key-scheme §4).
test('c16 the Memory view\'s key line draws 3 and 4 the way 1, 2 and r are drawn', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  const bs = await ui.findAll({ type: 'Button' })
  const one = bs.find((b: any) => b.props?.hotkey === '1')
  expect(!!one, 'fixture: the 1 tab Button is drawn').toBe(true) // E1 §k: `1` Work tab
  const drawn = (k: string) => {
    const b = bs.find((x: any) => x.props?.hotkey === k)
    return b ? { hotkey: k, plain: b.props?.plain, label: labelOf(b) } : null
  }
  expect([drawn('3'), drawn('4')]).toEqual([
    { hotkey: '3', plain: one.props?.plain, label: 'confirmed only' }, // D-T14-filter-keys `3: confirmed only`, plain as `1`
    { hotkey: '4', plain: one.props?.plain, label: 'void only' }, // D-T14-filter-keys `4: void only`, plain as `1`
  ])
})

// ================================================================== the mark keys c, v, u (Q-71, Q-83)

// R-C15-55, R-C15-87, R-C15-06, R-C15-08 · Q-71 "in the table a mark key acts on the focused row (a note or a
// summary)" · spec L465, L483 "`c` marks ✅" · D-T14-mark-letters.
test('c17 with a note row focused in the table, c marks that note ✅', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'c')
  expect(w.marksOf('9').map((x) => x.mark)).toEqual(['ok']) // L483 `c` marks ✅ (`ok`, D-T14-tool-names)
})

// R-C15-55, R-C15-88 · Q-71 "acts on the focused row" · spec L483 "`v` marks ❌" · D-T14-mark-letters.
test('c18 with a note row focused in the table, v marks that note ❌', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.mark)).toEqual(['void']) // L483 `v` marks ❌ (`void`, D-T14-tool-names)
})

// R-C15-55 · Q-71 "a mark key acts on the focused row (a note or a summary)" · spec L465-466.
test('c19 with a summary row focused in the table, v marks that summary ❌', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '6-7')
  await key(ui, w, 'v')
  expect(w.marksOf('6-7').map((x) => x.mark)).toEqual(['void']) // Q-71: the focused summary #6-7 (fixture L1 #6-7)
})

// R-C15-56 · Q-71 "in an opened note's or summary's view it acts on that note or summary" · spec L465-466.
test('c20 in an opened note\'s view, v marks that note ❌', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await openRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.mark)).toEqual(['void']) // Q-71: the opened note #9
})

// R-C15-56 · Q-71 "in an opened note's or summary's view it acts on that note or summary".
test('c21 in an opened summary\'s view, c marks that summary ✅', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await openRow($, ui, w, '4-5')
  await key(ui, w, 'c')
  expect(w.marksOf('4-5').map((x) => x.mark)).toEqual(['ok']) // Q-71: the opened summary #4-5 (fixture L1 #4-5)
})

// R-C15-57 · Q-71 "With no row focused in the table the keys do nothing" · spec L466-467.
test('c22 v with no row focused, then v with one note row focused, leaves exactly one note marked ❌, the focused one', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await key(ui, w, 'v') // no row focused: nothing (Q-71)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(marksMap(w)).toEqual([{ id: '9', mark: 'void' }]) // Q-71: one mark, on the focused #9
})

// R-C15-58 · Q-71 "and say why on the hint line" · D-T14-mark-messages: "No row focused in the table (Q-71): the hint
// line reads `focus a note or summary row to mark it`".
test('c23 with no row focused in the table, after v the hint line reads focus a note or summary row to mark it', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await key(ui, w, 'v')
  expect(await drawnText(ui)).toContain('focus a note or summary row to mark it') // D-T14-mark-messages
})

// R-C15-79, R-C15-89 · Q-74 "`clear` (key and tool value) returns it to unmarked" · spec L478-479, L483 "`u`
// clears" · D-T14-mark-letters "`u` clears the mark (Q-74's `clear`)".
test('c24 with a note marked ❌ and focused, u returns it to unmarked', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('9', 'void', 'operator', 'stray', '2026-10-19T11:30:00Z')] }) // fixture: #9 ❌
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'u')
  const now = { current: w.marksOf('9').at(-1)?.mark, glyph: glyphOf(rowLine(await ui.drawn(), '9')) }
  expect(now).toEqual({ current: 'clear', glyph: '' }) // Q-74: the newest record is `clear`, so the note is unmarked; D-T14-mark-glyphs: blank
})

// R-C15-90, R-C15-91 · spec L483-484 "They are bound in the Memory view only, where no other key uses them" ·
// D-T14-mark-letters "They are bound in the Memory view only."
test('c25 c in the Work view, then c in the Memory view on a focused note, leaves exactly one mark record, the Memory one', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.pane($)
  await ui.press({ key: 'tab-work' })
  await w.settle()
  await key(ui, w, 'c') // the Work view: `c` is not a mark key there
  await ui.press({ key: 'tab-memory' })
  await w.settle()
  await focusRow($, ui, w, '9')
  await key(ui, w, 'c')
  expect(marksMap(w)).toEqual([{ id: '9', mark: 'ok' }]) // D-T14-mark-letters: bound in the Memory view only
})

// R-C15-92, R-C15-07 · spec L484 "and focus-and-Enter on each drawn key does the same" · D-T14-mark-letters "each is
// a focusable button, so focus-and-Enter on it does the same as the key".
test('c26 focus and Enter on the v: ❌ void button marks the focused note ❌, as v does', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await focusAndEnter($, ui, w, '❌ void') // D-T14-mark-letters label `v: ❌ void`
  expect(w.marksOf('9').map((x) => x.mark)).toEqual(['void']) // as `v` does
})

// R-C15-92 · D-T14-mark-letters "drawn ... as `c: ✅ confirm` ... focus-and-Enter on it does the same as the key".
test('c27 focus and Enter on the c: ✅ confirm button marks the focused note ✅, as c does', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await focusAndEnter($, ui, w, '✅ confirm') // D-T14-mark-letters label `c: ✅ confirm`
  expect(w.marksOf('9').map((x) => x.mark)).toEqual(['ok']) // as `c` does
})

// R-C15-09, R-C15-85, R-C15-86, R-C15-10, R-C15-11 · spec L416-417 "These keys are shown the way `1`, `2` and `r`
// are shown." · L482 "one key per action, and each is a lowercase letter" · D-T14-mark-letters "drawn on the Memory
// view's key line as `c: ✅ confirm`, `v: ❌ void` and `u: clear`, highlighted the way `1`, `2` and `r` are"
// (no collision: work/key-source.md).
test('c28 the Memory view\'s key line draws c, v and u the way 1, 2 and r are drawn', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  const bs = await ui.findAll({ type: 'Button' })
  const one = bs.find((b: any) => b.props?.hotkey === '1')
  expect(!!one, 'fixture: the 1 tab Button is drawn').toBe(true) // E1 §k: `1` Work tab
  const drawn = (k: string) => {
    const b = bs.find((x: any) => x.props?.hotkey === k)
    return b ? { hotkey: k, plain: b.props?.plain, label: labelOf(b) } : null
  }
  expect([drawn('c'), drawn('v'), drawn('u')]).toEqual([
    { hotkey: 'c', plain: one.props?.plain, label: '✅ confirm' }, // D-T14-mark-letters `c: ✅ confirm`
    { hotkey: 'v', plain: one.props?.plain, label: '❌ void' }, // D-T14-mark-letters `v: ❌ void`
    { hotkey: 'u', plain: one.props?.plain, label: 'clear' }, // D-T14-mark-letters `u: clear`
  ])
})

// R-C15-04, R-C15-67 · Q-73 "a mark from the pane records `operator`" · spec L471-472 "A mark made from the pane
// records `operator`."
test('c5 a mark made from the pane records operator as who marked it', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.who)).toEqual(['operator']) // Q-73: `operator`
})

// ================================================================== the reason dialog (Q-72)

// R-C15-59 · Q-72 "the mark key opens `$.ui.ask` with the prompt `reason:`" · spec L468.
test('c29 v on a focused note opens a $.ui.ask dialog whose prompt is reason:', SLOW, async ($, on) => {
  const w = world(on)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.asked.map((a) => a.question)).toEqual(['reason:']) // Q-72: the prompt `reason:`
})

// R-C15-60 · Q-72 "and a free-text field" · spec L468 · types $.ui.ask: "resolves to ... the text typed under
// "Other"" (the dialog's free text).
test('c30 the reason dialog takes free text: a typed answer that is none of its labels makes the mark', SLOW, async ($, on) => {
  const typed = 'free text typed under Other 7f3a' // fixture: no dialog label can be this
  const w = world(on, { answers: [(labels) => (labels.includes(typed) ? undefined : typed)] })
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.mark)).toEqual(['void']) // Q-72: a free-text field; the typed text is accepted
})

// R-C15-60, R-C15-61 · Q-72 "The reason is required" · spec L412-413 "A mark records a one-line reason".
test('c31 the reason typed in the dialog is the reason the mark records', SLOW, async ($, on) => {
  const w = world(on, { answers: ['a stray monitor session wrote it'] }) // fixture: the typed reason
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.reason)).toEqual(['a stray monitor session wrote it']) // Q-72: the typed reason
})

// R-C15-62 · Q-72 "made one line (newlines become spaces)" · spec L469 "Its newlines become spaces".
test('c32 a reason typed with a newline is recorded with a space in its place', SLOW, async ($, on) => {
  const w = world(on, { answers: ['first line\nsecond line'] }) // fixture: a two-line reason
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.reason)).toEqual(['first line second line']) // Q-72: the newline becomes a space
})

// R-C15-63 · Q-72 "and cut to 280 bytes" · spec L469 "and it is cut to 280 bytes".
test('c33 a reason longer than 280 bytes is recorded cut to 280 bytes', SLOW, async ($, on) => {
  const w = world(on, { answers: ['ü'.repeat(150)] }) // fixture: 150 two-byte characters, 300 bytes (150 characters: a cut by characters keeps all of them)
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(w.marksOf('9').map((x) => x.reason)).toEqual(['ü'.repeat(140)]) // Q-72: 280 bytes = 140 two-byte characters
})

// R-C15-64 · Q-72 "A dismissed dialog ... makes no mark" · spec L469-470.
test('c34 after a dismissed reason dialog and then a mark made with a reason, the note\'s mark log holds exactly one record', SLOW, async ($, on) => {
  const w = world(on, { answers: [undefined, 'checked twice'] }) // fixture: dismissed, then a reason
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v') // dismissed
  await key(ui, w, 'v') // with a reason
  expect(w.marksOf('9').length).toBe(1) // Q-72: the dismissed dialog made no mark
})

// R-C15-64, R-C15-61 · Q-72 "The reason is required ... an empty reason makes no mark".
test('c35 after a mark given an empty reason and then a mark made with a reason, the note\'s mark log holds exactly one record', SLOW, async ($, on) => {
  const w = world(on, { answers: ['', 'checked twice'] }) // fixture: an empty reason, then a reason
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v') // empty reason
  await key(ui, w, 'v') // with a reason
  expect(w.marksOf('9').length).toBe(1) // Q-72: the empty reason made no mark
})

// R-C15-65 · Q-72 "and says so on the hint line" · D-T14-mark-messages: "A dismissed reason dialog or an empty reason
// (Q-72): the hint line reads `no mark: a reason is needed`".
test('c36 after a dismissed dialog, the hint line reads no mark: a reason is needed', SLOW, async ($, on) => {
  const w = world(on, { answers: [undefined] }) // fixture: the dialog is dismissed
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'v')
  expect(await drawnText(ui)).toContain('no mark: a reason is needed') // D-T14-mark-messages
})

// ================================================================== the mark history in a note's view (Q-74)

// The history fixture: three records of note #9, oldest first in the store (T114A's `marks`: "oldest first").
const HISTORY = [
  rec('9', 'ok', 'prime', 'reason alpha from the prime', '2026-10-19T11:30:00Z'),
  rec('9', 'void', 'operator', 'reason bravo from the operator', '2026-10-19T11:40:00Z'),
  rec('9', 'ok', 'operator', 'reason charlie rechecked', '2026-10-19T11:50:00Z'),
] // fixture

// R-C15-82 · Q-74 "Every record stays in the log and the note's view lists them." · spec L479-480.
test('c37 a note\'s view lists every mark record of the note', SLOW, async ($, on) => {
  const w = world(on, { marks: HISTORY })
  const ui = await w.memory($)
  await openRow($, ui, w, '9')
  const t = await drawnText(ui)
  expect(HISTORY.map((h) => t.includes(h.reason))).toEqual([true, true, true]) // Q-74: every record listed (fixture reasons)
})

// R-C15-82 · D-T14-mark-history: "one line per record, newest first".
test('c38 a note\'s view lists its mark records newest first', SLOW, async ($, on) => {
  const w = world(on, { marks: HISTORY })
  const ui = await w.memory($)
  await openRow($, ui, w, '9')
  const t = await drawnText(ui)
  const at = [...HISTORY].reverse().map((h) => t.lastIndexOf(h.reason)) // newest, middle, oldest (fixture times 11:50, 11:40, 11:30)
  expect({ found: at.every((x) => x >= 0), ordered: at[0] < at[1] && at[1] < at[2] }).toEqual({ found: true, ordered: true }) // D-T14-mark-history: newest first
})

// R-C15-84 · Q-74 "A mark by the prime cannot replace one by the operator; the operator can replace any." · spec
// L480-481 "the operator can replace any mark."
test('c39 a mark from the pane on a note the prime marked becomes the note\'s current mark', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('9', 'void', 'prime', 'the prime voided it', '2026-10-19T11:30:00Z')] }) // fixture: #9 ❌ by the prime
  const ui = await w.memory($)
  await focusRow($, ui, w, '9')
  await key(ui, w, 'c')
  const last = w.marksOf('9').at(-1)
  const now = { current: last ? { mark: last.mark, who: last.who } : null, glyph: glyphOf(rowLine(await ui.drawn(), '9')) }
  expect(now).toEqual({ current: { mark: 'ok', who: 'operator' }, glyph: '✅' }) // Q-74: the newest record is the current mark; the operator can replace any
})

// R-C15-99, R-C15-100 · Q-75 "✅ on a summary marks only that summary. No note's mark changes." · spec L492.
test('c40 after a summary over unmarked notes is marked ✅, its range draws exactly one ✅, on the summary\'s own row', SLOW, async ($, on) => {
  const w = world(on) // fixture: notes #4 and #5 and the summary #4-5 are unmarked
  const ui = await w.memory($)
  await focusRow($, ui, w, '4-5')
  await key(ui, w, 'c')
  const wake = await ui.drawn()
  const wakeCount = Array.from(cells(wake)).filter((c) => c === '✅').length
  const onRow = glyphOf(rowLine(wake, '4-5'))
  await drill(ui, w, '4-5') // the summary's range opened: its notes #4 and #5
  const inner = await ui.drawn()
  const notes = [4, 5].map((i) => glyphOf(rowWith(inner, textOf(i))?.line))
  expect({ wakeCount, onRow, notes }).toEqual({ wakeCount: 1, onRow: '✅', notes: ['', ''] }) // Q-75: only the summary's own row; its notes stay unmarked
})

// ================================================================== guard (OQ7; work/guard-evidence.md G1)

// R-C15-93 · spec L485 "Note rows get no letters of their own." · Q-83 (via D-T14-mark-letters "Note rows get no
// letters (Q-83)"). OQ7: behaviour that already holds at da5910c is a preservation guard (work/probe-da5910c.md P-1).
test('guard: G1 in the Memory view, note rows draw no letter of their own', SLOW, async ($, on) => {
  const w = world(on, { marks: [rec('8', 'ok', 'operator', 'checked', '2026-10-19T11:30:00Z')] }) // fixture: a marked note and unmarked ones
  const ui = await w.memory($)
  const tree = await ui.drawn()
  const rows = ['8', '9', '10'].map((id) => rowWith(tree, ROWS[id]))
  expect(rows.every((r) => !!r), 'fixture: notes #8, #9 and #10 are drawn').toBe(true) // fixture WAKE
  const letters = rows.flatMap((r) => r!.buttons.map((b: any) => b.props?.hotkey).filter((k: any) => k !== undefined && k !== null && k !== ''))
  expect(letters).toEqual([]) // L485: no note row carries a hotkey of its own
})
