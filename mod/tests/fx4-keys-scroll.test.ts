// claude plugin test — FX4: keys in an opened view, End and Home take the focus with them, and the T15 list's
// unpinned behaviours (C9, C16; P4 fix group 4).
//
// Written from the spec (docs/designs/v7.6-tuning.md L126-136 and L364-402, with its T15 amendment "blocked rows
// scroll", P3 gate D3 = A), T19's key scheme (_orch/nodes/T19/work/key-scheme.md section 3: "In an opened view, a
// row's letter still opens that row.") and the live refutations LV9 section 10 and LV15 section 11; none of the
// expected values is copied from the implementation. Requirement ids are the gap rows of
// _orch/nodes/T20/work/coverage-of-spec.md: R-C9-05, R-C16-21, R-C16-60 (the product misbehaves) and R-C16-24,
// R-C16-26, R-C16-44 (the behaviour holds; each test here is shown failing under a product mutant, decision P4-d1).
//
// The world is T115's (mod/tests/t15-scroll.test.ts), copied, with two changes:
//   - rulings: the project memory's recall answers with ruling notes, so the pane draws `ruling #n …` lines;
//   - the engine's focus ring is modelled as Claude Code 2.1.316 keeps it: as an INDEX into the pane's focusable
//     elements in document order, not as a key. Read from the 2.1.316 engine (the Pane site passes `focusables`,
//     `indexNow` and `land(index)` to its ring; a person's arrow moves the index by one; a landing on a key resolves
//     that key to its index in the drawing current at that moment; `$.ui.focus` on a key not drawn yet waits for the
//     drawing that brings it). So after a redraw the focus is on whatever element now stands at the held index. This
//     is what LV15 section 11 saw live: after End the inverse sat on a letter button of the `↑ 20 more` line.
//     The kit itself has no implementation of a plugin's `$.ui.focus` (it refuses it: "HooksError: no implementation
//     for ui.focus"); the world plays that missing core from the mod's log record of the refused move (see ui.log).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
// Q-12 (inbox/Q-12.answer.md) via key-scheme.md section 2 and spec L389: the 22-letter pool, in its order.
const POOL = 'a c d e f g h i j k l m n o q s t u v w y z'.split(' ')
// fixture: three standing rulings in the project memory (lib/rulings.mjs reads notes tagged `ruling`).
const RULINGS = [
  { index: 0, tag: 'ruling', ts: '2026-10-19T10:00:00Z', text: 'never merge to main without the operator' },
  { index: 1, tag: 'ruling', ts: '2026-10-20T10:00:00Z', text: 'stage files by name only' },
  { index: 2, tag: 'ruling', ts: '2026-10-21T10:00:00Z', text: 'no session links in commit messages' },
]

type Opts = { phases?: number[]; questions?: string[]; rulings?: boolean }

function world(on: any, o: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const store = new Map<string, unknown>()
  const m: any = { run_id: RUN_ID, mode: 'BUILD', target: './app', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  const ps = o.phases ?? []
  if (ps.length) files.set('_orch/plan/graph.yaml', ps.map((n) => '- id: N' + n + '\n  phase: ' + n + '\n').join(''))
  dirs.set('_orch/phases', ps.map((n) => ({ name: 'P' + n, kind: 'directory' })))
  for (const n of ps) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  const qs = o.questions ?? []
  for (const q of qs) files.set('_orch/inbox/' + q + '.md', '# ' + q + ' — which parser should the run use?\n')
  dirs.set('_orch/inbox', qs.map((q) => ({ name: q + '.md', kind: 'file' })))
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
  on('fs.exists', (_$: any, e: any) => {
    const p = rel(e.path)
    return { value: files.has(p) || dirs.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('fs.list', (_$: any, e: any) => {
    const p = rel(e.path)
    const v = dirs.get(p)
    if (v) return { value: v }
    const kids = new Map<string, string>()
    for (const k of files.keys()) if (k.startsWith(p + '/')) {
      const rest = k.slice(p.length + 1)
      kids.set(rest.split('/')[0]!, rest.includes('/') ? 'directory' : 'file')
    }
    return kids.size ? { value: [...kids].map(([name, kind]) => ({ name, kind })) } : { deny: 'no such directory' }
  })
  on('store.get', (_$: any, e: any) => ({ value: store.has(e.key) ? store.get(e.key) : undefined }))
  on('store.set', (_$: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_$: any, e: any) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('ui.log', (_$: any, e: any) => {
    // The kit has no core for a plugin's `$.ui.focus`: it refuses every one with "no implementation for ui.focus"
    // (seen from this file, FX4 work/result.md). Claude Code 2.1.316 does implement it (it lands the ring on the
    // key, resolved in the drawing current when the call is made). The mod records a refused focus move in its log
    // with the key it asked for; on that record, and only for the kit's own refusal, the world plays the missing
    // core: it lands the ring on that key, as the engine would have.
    const m = /the focus did not move onto (\S+): .*no implementation for ui\.focus/.exec(String(e.text ?? ''))
    if (m) land(m[1]!)
    return { value: undefined }
  })
  on('ui.notify', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
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
  on('session.version', () => ({ value: { version: '2.1.316', base: '2.1.316' } }))
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
    let out: any = {}
    if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view') out = {}
    else if (argv[0] === 'gh') out = []
    else if (argv[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: o.rulings ? RULINGS.length : 0, notes: o.rulings ? RULINGS : [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = { header: 'h', tiles: [], lines: [] }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ agentId: 'id-' + String(e.description), model: 'claude-opus-5-5' }))
  mock.env(on, {})
  mock.session(on)

  // ---- the engine's window and its focus ring (by index, see the header) over the pane ----
  const eng: { ui: any; rows: number; offset: number; moved: number | null; ring: string[]; index: number | null; want: string | null } = { ui: null, rows: 0, offset: 0, moved: null, ring: [], index: null, want: null }
  on('ui.scroll', (_$: any, e: any) => {
    eng.moved = e.offset
    return {}
  })
  /** A landing on a key: its index in the drawing current now; a key not drawn yet waits for the next drawing. */
  const land = (key: string) => {
    const i = eng.ring.indexOf(key)
    if (i >= 0) {
      eng.index = i
      eng.want = null
    } else eng.want = key
  }
  on('ui.focus', (_$: any, e: any) => {
    const key = e.element ?? e.key
    if (key !== undefined) land(String(key))
    return {}
  })

  async function settle(ms: number) {
    await clock.advance(ms)
    await clock.settle()
  }
  async function spawn($: any, label: string) {
    await $.agent.spawn({ prompt: 'do the work', description: label, subagentType: 'baton:worker' } as any)
    await settle(10)
  }
  async function finish($: any, label: string, verdict: 'DONE' | 'BLOCKED' = 'DONE') {
    const answer = verdict === 'DONE' ? 'DONE · ok' : 'BLOCKED · waits for Q-9\nBlocked by: docs/x.md:"a line" (interpreted)'
    await $.turn.complete({ agentId: 'id-' + label, answer, isAborted: false } as any)
    await settle(10)
  }
  async function start($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
  }
  const props = () => ({ title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: eng.rows, offset: eng.offset } })
  /** The ring after a drawing: the focusable keys in document order; a waiting landing resolves now if drawn. */
  async function snap() {
    eng.ring = lines(await eng.ui.drawn()).flatMap((l) => l.focusables)
    if (eng.want !== null) land(eng.want)
  }
  async function pane($: any, rows: number) {
    await settle(61000)
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    eng.rows = rows
    eng.offset = 0
    eng.index = null
    eng.ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props() as any })
    await snap()
    return eng.ui
  }
  async function redraw() {
    await settle(10)
    await eng.ui.redraw(props() as any)
    await snap()
  }
  return { clock, settle, spawn, finish, start, pane, redraw, files, eng }
}
type World = ReturnType<typeof world>

// ------------------------------------------------------------------ reading the drawn pane (as T115's)

type Line = { text: string; node: any; focusables: string[]; buttons: any[] }

const isFocusable = (n: any) => n && (n.type === 'Button' || n.type === 'Input' || n.type === 'Select')
const keyOfEl = (n: any) => String(n.key ?? (n.props && n.props.key) ?? (n.props && n.props.label) ?? '')
const textOf = (x: any): string =>
  typeof x === 'string' ? x
  : x == null ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : x.type === 'Button' || x.type === 'Link' ? String(x.props?.label ?? '') + textOf(x.children)
  : x.type === 'Box' && x.props?.columnGap ? (x.children ?? []).map(textOf).join(' ')
  : textOf(x.children)
function walk(n: any, f: (x: any) => void) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, f))
  if (!n || typeof n !== 'object') return
  f(n)
  for (const c of n.children ?? []) walk(c, f)
}
function lines(n: any, out: Line[] = []): Line[] {
  if (Array.isArray(n)) {
    for (const c of n) lines(c, out)
    return out
  }
  if (n && n.type === 'Box' && n.props?.flexDirection === 'column') {
    for (const c of n.children ?? []) lines(c, out)
    return out
  }
  const focusables: string[] = []
  const buttons: any[] = []
  walk(n, (x) => {
    if (isFocusable(x)) focusables.push(keyOfEl(x))
    if (x.type === 'Button') buttons.push(x)
  })
  out.push({ text: textOf(n), node: n, focusables, buttons })
  return out
}
const dump = (ls: Line[]) => '\n' + ls.map((l, i) => String(i).padStart(3) + '   ' + l.text).join('\n')

async function view(w: World) {
  const all = lines(await w.eng.ui.drawn())
  const off = Math.max(0, Math.min(w.eng.offset, Math.max(0, all.length - w.eng.rows)))
  return { all, shown: all.slice(off, off + w.eng.rows) }
}

const LABEL = /\b(wk\d+|P\d+)\b/
function rowLabel(l: Line): string | undefined {
  const opener = l.buttons.some((b: any) => !String(b.props?.label ?? '').includes('✉') && String(b.props?.label ?? '') !== '')
  if (!opener) return undefined
  const m = LABEL.exec(l.text)
  if (m) return m[1]
  return /\bprime\b/.test(l.text) ? 'prime' : undefined
}
const agentRows = (ls: Line[]) => ls.map((l, i) => ({ l, i, label: rowLabel(l) })).filter((x) => x.label !== undefined) as { l: Line; i: number; label: string }[]
const lineOf = (ls: Line[], label: string) => ls.find((l) => rowLabel(l) === label)
const letterOf = (l: Line | undefined): string | undefined => {
  if (!l) return undefined
  const b = l.buttons.find((x: any) => POOL.includes(String(x.props && x.props.hotkey)))
  return b ? String(b.props.hotkey) : undefined
}
const enterKey = (l: Line) => {
  const openers = l.buttons.filter((b: any) => !String(b.props?.label ?? '').includes('✉'))
  return keyOfEl(openers.find((b: any) => String(b.props?.label ?? '').includes('›')) ?? openers[0])
}
const UP_MORE = /↑\s*(\d+)\s+more\b/
const DOWN_MORE = /↓\s*(\d+)\s+more\b/

/** The open view's title line: the row holding its `‹ back` (hotkey `b`), as text; undefined when no view is open. */
async function viewTitle(ui: any): Promise<string | undefined> {
  let title: string | undefined
  walk(await ui.drawn(), (x) => {
    if (title === undefined && x.type === 'Box' && x.props?.flexDirection === 'row' && (x.children ?? []).some((c: any) => c && c.type === 'Button' && c.props?.hotkey === 'b')) {
      title = (x.children ?? []).filter((c: any) => c && c.type === 'Text').map(textOf).join(' ')
    }
  })
  return title
}

// ------------------------------------------------------------------ the keys

async function scrollKey($: any, w: World, by: (rows: number, content: number) => number) {
  const { all } = await view(w)
  const content = all.length
  const d = by(w.eng.rows, content)
  const offset = Math.max(0, Math.min(w.eng.offset + d, Math.max(0, content - w.eng.rows)))
  w.eng.moved = null
  await $.ui.scroll({ component: 'Pane', requestId: 'baton', offset, by: d, bodyRows: w.eng.rows, contentRows: content, origin: { kind: 'person' } } as any)
  if (w.eng.moved !== null) w.eng.offset = Math.max(0, Math.min(w.eng.moved, Math.max(0, content - w.eng.rows)))
  await w.redraw()
}
const pageDown = ($: any, w: World) => scrollKey($, w, (rows) => rows) // UiScrollInput.by: "a page key `bodyRows`"
// Home and End raise `ui.scroll` by `contentRows`; the person's next key (Enter) comes a moment later, here a second.
const home = async ($: any, w: World) => (await scrollKey($, w, (_r, content) => -content), await w.settle(1000), await w.redraw())
const end = async ($: any, w: World) => (await scrollKey($, w, (_r, content) => content), await w.settle(1000), await w.redraw())

/** The person clicks an element: the ring lands on it (through the mod's ui.focus hook). */
async function click($: any, w: World, key: string) {
  await $.ui.focus({ component: 'Pane', requestId: 'baton', plugin: 'baton', element: key, origin: { kind: 'person' } } as any)
  await w.redraw()
}
/** The element the ring is on now: the one at the held index of the current drawing. */
const focusedKey = (w: World) => (w.eng.index === null ? undefined : w.eng.ring[w.eng.index])
async function focusedLine(w: World) {
  const k = focusedKey(w)
  return k === undefined ? undefined : (await view(w)).all.find((l) => l.focusables.includes(k))
}
/** Enter: the engine presses the element the ring is on. */
async function enter(w: World) {
  const k = focusedKey(w)
  if (k !== undefined) await w.eng.ui.press({ key: k })
  await w.redraw()
}
/** A letter: the engine presses the drawn Button carrying it as `hotkey` (ButtonProps.hotkey); none, it is not ours. */
async function pressLetter(w: World, letter: string) {
  const b = (await w.eng.ui.findAll({ type: 'Button' })).find((x: any) => x.props.hotkey === letter)
  if (b) await w.eng.ui.press({ key: b.key })
  await w.redraw()
  return !!b
}

const wk = (i: number) => 'wk' + String(i).padStart(2, '0')
async function agents($: any, w: World, n: number, running: number[] = [], blocked: number[] = []) {
  for (let i = 1; i <= n; i++) await w.spawn($, wk(i))
  for (let i = 1; i <= n; i++) if (!running.includes(i)) await w.finish($, wk(i), blocked.includes(i) ? 'BLOCKED' : 'DONE')
}
const SLOW = { timeoutMs: 30000 } // fixture: these worlds draw 100 rows many times; other suites may load the machine
const TALL = 34 // fixture: a 34-line pane
const MANYN = 100 // fixture: prime + 100 finished agents, so the list scrolls in its own window

// ================================================================== R-C9-05: a row's letter in an opened view

test('R-C9-05: in an opened agent view, another row\'s letter opens that row, and the prime\'s letter opens the prime', SLOW, async ($, on) => {
  // Requirement R-C9-05 (coverage-of-spec.md): spec L131 "Every navigable row ... can be opened from the keyboard, by its
  // own key"; key-scheme.md section 3: "In an opened view, a row's letter still opens that row." LV9 section 10 saw
  // the letter typed into the prompt instead (screens/53-g-in-alpha-view.txt `❯ g`).
  const w = world(on)
  await w.start($)
  await agents($, w, 3, [1, 2, 3]) // fixture: wk01 … wk03 running; letters prime a, wk01 c, wk02 d, wk03 e (L387)
  await w.pane($, 40)
  const { all } = await view(w)
  const [la, l1, l2] = [letterOf(lineOf(all, 'prime')), letterOf(lineOf(all, 'wk01')), letterOf(lineOf(all, 'wk02'))]
  expect([la, l1, l2], 'fixture: the rows hold the letters L387 gives' + dump(all)).toEqual(['a', 'c', 'd'])
  expect(await pressLetter(w, l1!)).toBe(true) // from the Work list wk01's letter opens its view (holds today)
  expect(await viewTitle(w.eng.ui), 'no view opened for wk01').toContain('wk01')
  // in wk01's open view: wk02's letter opens wk02's view
  expect(await pressLetter(w, l2!), 'no Button carries wk02\'s letter ' + l2 + ' in the open view: the key goes to the prompt').toBe(true)
  expect(await viewTitle(w.eng.ui)).toContain('wk02') // key-scheme.md section 3: the letter opens that row
  // and in wk02's view, the prime's letter opens the prime's view
  expect(await pressLetter(w, la!), 'no Button carries the prime\'s letter ' + la + ' in the open view').toBe(true)
  const t = (await viewTitle(w.eng.ui)) ?? ''
  expect(/\bprime\b/.test(t) && !t.includes('wk02'), 'view title: ' + t).toBe(true)
})

test('R-C9-05: in an opened phase view, another phase row\'s letter and an agent row\'s letter each open that row', SLOW, async ($, on) => {
  // Requirement R-C9-05 (coverage-of-spec.md): key-scheme.md section 3 "In an opened view, a row's letter still opens
  // that row." LV9 section 10: in P1's view `g` left P1 open and was typed into the prompt (screens/47-g-from-P1-view.txt).
  const w = world(on, { phases: [1, 2] })
  await w.start($)
  await agents($, w, 1, [1]) // fixture: one running agent, unphased
  await w.pane($, 40)
  const { all } = await view(w)
  const [p1, p2, a1] = [letterOf(lineOf(all, 'P1')), letterOf(lineOf(all, 'P2')), letterOf(lineOf(all, 'wk01'))]
  expect([p1, p2, a1].every((x) => x !== undefined), 'fixture: P1, P2 and wk01 hold letters' + dump(all)).toBe(true)
  expect(await pressLetter(w, p1!)).toBe(true)
  expect(await viewTitle(w.eng.ui), 'no view opened for P1').toMatch(/\bP1\b/)
  expect(await pressLetter(w, p2!), 'no Button carries P2\'s letter ' + p2 + ' in P1\'s open view').toBe(true)
  expect(await viewTitle(w.eng.ui)).toMatch(/\bP2\b/) // the phase row's letter opens that phase's view
  expect(await pressLetter(w, a1!), 'no Button carries wk01\'s letter ' + a1 + ' in P2\'s open view').toBe(true)
  expect(await viewTitle(w.eng.ui)).toContain('wk01') // and an agent row's letter opens that agent's view
})

// ================================================================== R-C16-21, R-C16-60: End and Home take the focus

test('R-C16-21: End moves the focus to the list\'s last row, in view, and Enter then opens that row', SLOW, async ($, on) => {
  // Requirement R-C16-21 (coverage-of-spec.md, spec L297 acceptance; L369-370 "Home and End move to its first and last
  // row"). LV15 section 11: End moved the window, the focus stayed on the old row's letter on the `↑ 20 more` line and
  // Enter opened that old row (screens/29-end-from-row.txt, 30-enter-after-end.txt).
  const w = world(on)
  await w.start($)
  await agents($, w, MANYN)
  await w.pane($, TALL)
  const before = (await view(w)).shown
  await click($, w, enterKey(lineOf(before, 'wk02')!)) // the focus on a row near the list's top (LV15: A02)
  expect(rowLabel((await focusedLine(w))!), 'fixture: the click put the focus on wk02').toBe('wk02')
  await end($, w)
  const { shown } = await view(w)
  const on1 = await focusedLine(w)
  expect(on1 ? rowLabel(on1) : undefined, 'after End the focus is on ' + (on1 ? on1.text : 'nothing') + dump(shown)).toBe(wk(MANYN)) // L370: the last row
  expect(shown.includes(on1!)).toBe(true) // and that row is in view
  await enter(w)
  expect(await viewTitle(w.eng.ui), 'Enter after End opened another view').toContain(wk(MANYN))
})

test('R-C16-60: from the prime\'s row, End then Enter opens the last row, and Home then Enter opens the first row', SLOW, async ($, on) => {
  // Requirement R-C16-60 (coverage-of-spec.md, spec L402: "Plus a live check through cmux" of L364-401). LV15 section
  // 11, case 2: focus on the prime, End, Enter opened the prime (screens/33-end-from-prime.txt, 34-…). The CHANGELOG
  // at 41670d5: "once moved, Home took the window only part of the way to the top".
  const w = world(on)
  await w.start($)
  await agents($, w, MANYN)
  await w.pane($, TALL)
  await click($, w, enterKey(lineOf((await view(w)).shown, 'prime')!))
  await end($, w)
  expect(rowLabel((await focusedLine(w)) ?? ({ buttons: [], text: '' } as any)), 'End from the prime').toBe(wk(MANYN))
  await enter(w)
  expect(await viewTitle(w.eng.ui)).toContain(wk(MANYN)) // End then Enter opens the last row
  await pressLetter(w, 'b') // back to the list
  await home($, w)
  const { shown } = await view(w)
  const on1 = await focusedLine(w)
  expect(on1 ? rowLabel(on1) : undefined, 'after Home the focus is on ' + (on1 ? on1.text : 'nothing') + dump(shown)).toBe('prime') // L370: the first row
  expect(shown.includes(on1!)).toBe(true) // in view
  expect(shown.filter((l) => UP_MORE.test(l.text)).map((l) => l.text), 'Home left rows hidden above').toEqual([]) // the window is at the very top
  await enter(w)
  const t = (await viewTitle(w.eng.ui)) ?? ''
  expect(/\bprime\b/.test(t) && !t.includes(wk(MANYN)), 'Enter after Home opened: ' + t).toBe(true)
})

test('R-C16-21: Home moves the focus to the list\'s first row, in view, and Enter then opens that row', SLOW, async ($, on) => {
  // Requirement R-C16-21 (coverage-of-spec.md, spec L297; L369-370). LV15 section 11: "Home showed the mirror of it
  // (window to the top, the focus left on A02)".
  const w = world(on)
  await w.start($)
  await agents($, w, MANYN)
  await w.pane($, TALL)
  await pageDown($, w)
  await pageDown($, w) // the list scrolled down: rows hidden above
  const mid = agentRows((await view(w)).shown).filter((r) => r.label !== 'prime')
  const pick = mid[Math.floor(mid.length / 2)]!
  await click($, w, enterKey(pick.l)) // the focus on a row in the middle of the window
  expect(rowLabel((await focusedLine(w))!), 'fixture: the click put the focus on ' + pick.label).toBe(pick.label)
  await home($, w)
  const { shown } = await view(w)
  const on1 = await focusedLine(w)
  expect(on1 ? rowLabel(on1) : undefined, 'after Home the focus is on ' + (on1 ? on1.text : 'nothing') + dump(shown)).toBe('prime')
  expect(shown.includes(on1!)).toBe(true)
  await enter(w)
  const t = (await viewTitle(w.eng.ui)) ?? ''
  expect(/\bprime\b/.test(t) && !t.includes(pick.label), 'Enter after Home opened: ' + t).toBe(true)
})

// ================================================================== R-C16-24: the lines below the list stay drawn

test('R-C16-24: with more agents than fit, every ruling line below the list is drawn whole, before and after the list scrolls', SLOW, async ($, on) => {
  // Requirement R-C16-24 (coverage-of-spec.md): spec L366-367 "and below it (questions, blocked rows, rulings, the
  // message field and the hint line) stay drawn whole." Q-68 (inbox/Q-68.answer.md). The verdict's attack: "nothing
  // asserts rulings ... below a scrolling list".
  const w = world(on, { rulings: true })
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 20)
  const want = RULINGS.slice().reverse().map((r) => 'ruling #' + r.index + ' ' + r.ts.slice(0, 10) + ' ' + r.text) // lib/rulings.mjs rulingLine, newest first
  for (const step of ['first shown', 'after PageDown']) {
    const { shown } = await view(w)
    expect(shown.some((l) => DOWN_MORE.test(l.text) || UP_MORE.test(l.text)), 'fixture: the list scrolls' + dump(shown)).toBe(true)
    const missing = want.filter((x) => !shown.some((l) => l.text.trim() === x))
    expect(missing, step + ': ruling lines not drawn whole' + dump(shown)).toEqual([])
    await pageDown($, w)
  }
})

test('R-C16-24 (D3): a blocked agent row scrolls out of the window like any other row; it is not drawn pinned', SLOW, async ($, on) => {
  // Requirement R-C16-24, read under the P3 gate's D3 = A (inbox/P3-gate.answer.md: "blocked rows scroll like any other
  // row, as Q-38 said") and the spec's T15 amendment "blocked rows scroll". Q-38: "agent rows that returned BLOCKED are
  // blocked rows". Q-64: only a running row is pinned.
  const w = world(on, { questions: ['Q-9'] }) // fixture: Q-9 open, so wk02 still waits for the operator
  await w.start($)
  await agents($, w, 40, [], [2]) // fixture: wk02 returned BLOCKED, the 39 others DONE
  await w.pane($, 16)
  const first = (await view(w)).shown
  expect(lineOf(first, 'wk02'), 'fixture: wk02 is drawn at the list top' + dump(first)).not.toBe(undefined)
  await pageDown($, w)
  await pageDown($, w)
  const { shown } = await view(w)
  expect(shown.some((l) => UP_MORE.test(l.text)), 'fixture: rows are hidden above' + dump(shown)).toBe(true)
  expect(lineOf(shown, 'wk02'), 'the blocked row wk02 is still drawn after the list scrolled past it' + dump(shown)).toBe(undefined)
})

// ================================================================== R-C16-26: no new key scrolls the list

test('R-C16-26: no key the pane binds, other than the engine\'s PageUp, PageDown, Home, End and the focus moves, moves the list', SLOW, async ($, on) => {
  // Requirement R-C16-26 (coverage-of-spec.md): spec L369 "No new key scrolls the list (Q-63). The engine's PageUp and
  // PageDown scroll it by one window, and Home and End move to its first and last row." Every hotkey the Work list
  // draws is pressed in turn (an opened view is left by `b`, another tab by `1`); the list's window must not move.
  const w = world(on)
  await w.start($)
  await agents($, w, MANYN)
  await w.pane($, TALL)
  await pageDown($, w)
  await pageDown($, w) // the list in its middle, so a move either way would show
  const top = async () => agentRows((await view(w)).shown).filter((r) => r.label !== 'prime').map((r) => r.label).slice(0, 3).join(',')
  const at = await top()
  expect(at.length > 0, 'fixture: window rows are drawn').toBe(true)
  const keys = [...new Set((await w.eng.ui.findAll({ type: 'Button' })).map((b: any) => b.props.hotkey).filter((k: any) => typeof k === 'string'))] as string[]
  expect(keys.length, 'fixture: the Work list binds keys').toBeGreaterThan(3)
  const moved: string[] = []
  for (const k of keys) {
    if (k === '1') continue // the Work tab itself
    await pressLetter(w, k)
    if (await viewTitle(w.eng.ui)) await pressLetter(w, 'b')
    if (!agentRows((await view(w)).all).length) await pressLetter(w, '1') // another tab (Memory): back to Work
    const now = await top()
    if (now !== at) moved.push(k + ' moved the window from ' + at + ' to ' + now)
  }
  expect(moved).toEqual([]) // L369: no new key scrolls the list
})

// ================================================================== R-C16-44: node rows get no letter

test('R-C16-44: with p on, the node rows carry no letter while the phase rows do', SLOW, async ($, on) => {
  // Requirement R-C16-44 (coverage-of-spec.md): spec L388 "Node rows get no letter." (Q-12, Q-60); a blocked node row
  // is a blocked row (Q-38, Q-39) and is not one of these. The verdict's probe: "with p on, the node rows N1 and N2
  // carry no pool letter while P1 and P2 carry c and d".
  const w = world(on, { phases: [1, 2] }) // fixture: graph.yaml puts node N1 in P1 and N2 in P2, neither blocked
  await w.start($)
  await w.pane($, 40)
  expect(await pressLetter(w, 'p'), 'fixture: p (every node) is drawn').toBe(true)
  const { all } = await view(w)
  const nodes = all.filter((l) => /\bN[12]\b/.test(l.text) && l.buttons.length > 0)
  expect(nodes.length, 'fixture: the node rows N1 and N2 are drawn' + dump(all)).toBe(2)
  expect([letterOf(lineOf(all, 'P1')), letterOf(lineOf(all, 'P2'))].every((x) => x !== undefined), 'fixture: the phase rows hold letters').toBe(true)
  expect(nodes.map((l) => letterOf(l) ?? '-')).toEqual(['-', '-']) // L388: node rows get no letter
})
