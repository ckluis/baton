// claude plugin test — T15: the agent list scrolls (cluster C16).
//
// Written from the spec (docs/designs/v7.6-tuning.md L276-298, the operator's answers on scrolling L364-402, and on
// letters surviving a reload L565-573) BEFORE the implementation (node T115, the red step of F115). Requirement ids are
// the rows of _orch/plan/traceability.yaml, cluster C16 (R-C16-01 … R-C16-69). Expected values come from the spec, the
// inbox answers (Q-12, Q-63 … Q-69, Q-82, OQ7), the planner's display details (D-T15-letters-pool, D-T15-more-count,
// D-T15-scroll-step) and T19's key scheme (_orch/nodes/T19/work/key-scheme.md); none is copied from the implementation.
//
// Tests named `guard: ...` are preservation guards (OQ7, inbox/OQ7.answer.md: "Behaviour that already works at da5910c
// ... gets guard tests, named guard:…, that pass now and at every later commit"), classed in T115's
// work/guard-evidence.md. Every other test must fail at the run tip da5910c, by its own assertion.
//
// Ownership (hazard H28: C8, C9, C10 and C11 all change agent rows): these tests never compare a whole rendered row
// string. They find an agent row by its label token (`wk07`, `kid1`, `prime`, `P2`) on a line that holds a Button, and
// read only what C16 owns: whether and where the row is drawn in the pane's height, the dim style of its label cell, the
// colour of its ✓/✗ mark cell, the `↑/↓ <k> more` and `+<k> running` lines, the scroll position, the focus, and the
// pool letter its Button carries as `hotkey` (read as T19's `letterOf` reads it). Phase rows are found by their `P<n>`
// label (spec L259), never by their place in a plan section (the T10 amendment, L248-275, removes that section).
//
// The world: the engine beneath the mod answers from memory (as mod/tests/interface.test.ts and T19's t9-keys.test.ts
// do). The test also plays the engine's window and focus ring (types index.d.ts, SiteScroll, UiScrollInput,
// UiFocusInput):
//   - the pane's body shows `bodyRows` lines of the drawn tree from the engine's offset (SiteScroll: "The first row of
//     the tree the window showed"); a line is "drawn" only when it is inside that window;
//   - PageUp/PageDown/Home/End raise `ui.scroll` with origin person, `by` = ∓bodyRows / ∓contentRows ("a page key
//     `bodyRows`, Home and End `contentRows`"); when the mod passes it on (`next(e)`), the engine's offset moves;
//   - ↑/↓ raise `ui.focus` with origin person onto the previous/next Button, Input or Select in document order, wrapping
//     (E1 k-claude-keys.md: "observed live: arrows moved the focus ring over buttons"; k-focus-walk.txt wraps from the
//     last `›` back to `1: Work`); the engine then keeps the focused element in view ("a held element kept in view");
//   - Enter presses the focused element; a letter presses the drawn Button carrying it as `hotkey` (ButtonProps.hotkey).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
// Q-12 (inbox/Q-12.answer.md) via key-scheme.md section 2 and spec L389: the 22-letter pool, in its order.
const POOL = 'a c d e f g h i j k l m n o q s t u v w y z'.split(' ')
// fixture: a PR (the gh CLI's `pr view` JSON, as in T110L's t10-lines.test.ts world), so the PR row and the
// merge-ready line are drawn above the agent list.
const PR = { number: 47, url: 'https://github.com/o/r/pull/47', title: 't', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }], comments: [], assignees: [], headRefName: 'b', author: { login: 'me' }, closingIssuesReferences: [], files: [] }

type Opts = { phases?: number[]; questions?: string[]; pr?: boolean; files?: Map<string, string>; store?: Map<string, unknown> }

/** Run state carried from one test to the next, as a restarted mod finds it (criterion 26). */
let carried: { files: Map<string, string>; store: Map<string, unknown>; letters: Record<string, string | undefined> } | null = null

function world(on: any, o: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = o.files ? new Map(o.files) : new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const store = o.store ? new Map(o.store) : new Map<string, unknown>()
  const m: any = { run_id: RUN_ID, mode: 'BUILD', target: './app', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  if (o.pr) m.pr = { number: 47 }
  if (!files.has('_orch/manifest.json')) files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  /** The plan: one node per phase in graph.yaml, a directory and a brief per phase (as T19's world). */
  const setPhases = (ps: number[]) => {
    if (ps.length) files.set('_orch/plan/graph.yaml', ps.map((n) => '- id: N' + n + '\n  phase: ' + n + '\n').join(''))
    dirs.set('_orch/phases', ps.map((n) => ({ name: 'P' + n, kind: 'directory' })))
    for (const n of ps) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  }
  setPhases(o.phases ?? [])
  const qs = o.questions ?? []
  for (const q of qs) files.set('_orch/inbox/' + q + '.md', '# ' + q + ' — which parser should the run use?\n')
  dirs.set('_orch/inbox', qs.map((q) => ({ name: q + '.md', kind: 'file' })))
  // The engine hands the mod absolute paths under the plugin's folder; the fixture is keyed from the last `_orch/` on.
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
      const name = rest.split('/')[0]
      kids.set(name, rest.includes('/') ? 'directory' : 'file')
    }
    return kids.size ? { value: [...kids].map(([name, kind]) => ({ name, kind })) } : { deny: 'no such directory' }
  })
  // The plugin's own store, kept here so that a restarted mod can be handed it back (criterion 26).
  on('store.get', (_$: any, e: any) => ({ value: store.has(e.key) ? store.get(e.key) : undefined }))
  on('store.set', (_$: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_$: any, e: any) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('ui.log', () => ({ value: undefined }))
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
    let out: any = {}
    if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view') out = o.pr ? PR : {}
    else if (argv[0] === 'gh') out = []
    else if (argv[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = { header: 'h', tiles: [], lines: [] }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ agentId: 'id-' + String(e.description), model: 'claude-opus-5-5' }))
  mock.env(on, {})
  mock.session(on)

  // ---- the engine's window and focus ring over the pane (see the header) ----
  const eng: { ui: any; rows: number; offset: number; focused: string | undefined; moved: number | null } = { ui: null, rows: 0, offset: 0, focused: undefined, moved: null }
  on('ui.scroll', (_$: any, e: any) => {
    eng.moved = e.offset // the mod passed the move on: the engine's window moves (UiScrollInput.offset)
    return {}
  })
  on('ui.focus', (_$: any, e: any) => {
    eng.focused = e.element // the ring lands where the hooks above left it (UiFocusInput.element)
    return {}
  })

  async function settle(ms: number) {
    await clock.advance(ms)
    await clock.settle()
  }
  /** An agent the prime spawns (under `parent` when given): its row's label is `label`. */
  async function spawn($: any, label: string, parent?: string) {
    await $.agent.spawn({ prompt: 'do the work', description: label, subagentType: 'baton:worker', ...(parent ? { parentAgentId: 'id-' + parent } : {}) } as any)
    await settle(10)
  }
  /** The agent returns: its first line carries the verdict (mod/lib/agents.mjs VERDICT words). */
  async function finish($: any, label: string, verdict: 'DONE' | 'FAILED' | 'BLOCKED' = 'DONE') {
    const answer = verdict === 'DONE' ? 'DONE · ok' : verdict === 'FAILED' ? 'FAILED · the build broke' : 'BLOCKED · waits for Q-9\nBlocked by: docs/x.md:"a line" (interpreted)'
    await $.turn.complete({ agentId: 'id-' + label, answer, isAborted: false } as any)
    await settle(10)
  }
  async function start($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(o.pr ? 200000 : 2000) // with a PR: past the PR poll, so the PR row and the merge-ready line exist
  }
  /** Open the pane (/baton) and mount it with a body of `rows` lines. */
  async function pane($: any, rows: number) {
    await settle(61000) // past the mod's own re-read interval, so the pane reads the plan and inbox as they now stand
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    eng.rows = rows
    eng.offset = 0
    eng.ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props() as any })
    return eng.ui
  }
  const props = () => ({ title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: eng.rows, offset: eng.offset } })
  async function redraw() {
    await settle(10)
    await eng.ui.redraw(props() as any)
  }
  /** Close the pane and open it again: a pane reload (spec L572: "the pane is closed and opened again"). */
  async function reload($: any) {
    await eng.ui.unmount() // the pane is closed (the test kit raises no ui.close; the drawing goes)
    await settle(1000)
    return pane($, eng.rows) // and opened again: /baton, then a new drawing
  }
  return { clock, settle, spawn, finish, start, pane, redraw, reload, setPhases, files, dirs, store, eng }
}
type World = ReturnType<typeof world>

// ------------------------------------------------------------------ reading the drawn pane

type Line = { text: string; node: any; dim: boolean; focusables: string[]; buttons: any[]; texts: any[] }

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
/** The drawn tree as lines, top to bottom: a column Box stacks its children; anything else is one line. */
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
  const texts: any[] = []
  walk(n, (x) => {
    if (isFocusable(x)) focusables.push(keyOfEl(x))
    if (x.type === 'Button') buttons.push(x)
    if (x.type === 'Text' && (x.children ?? []).some((c: any) => typeof c === 'string' && c.trim())) texts.push(x)
  })
  out.push({ text: textOf(n), node: n, dim: texts.length > 0 && texts.every((t: any) => t.props?.dimColor === true), focusables, buttons, texts })
  return out
}
const dump = (ls: Line[], from = 0) => '\n' + ls.map((l, i) => String(i + from).padStart(3) + (l.dim ? ' d ' : '   ') + l.text).join('\n')

/** Every line of the tree, and the lines inside the engine's window (the pane's height from its offset). */
async function view(w: World) {
  const all = lines(await w.eng.ui.drawn())
  const off = Math.max(0, Math.min(w.eng.offset, Math.max(0, all.length - w.eng.rows)))
  return { all, shown: all.slice(off, off + w.eng.rows), off }
}

// An agent row: a line holding a Button and an agent's label (spec L259 for `P<n>`). `prime` is the root's label.
const LABEL = /\b(wk\d+|kid\d+|run\d+|P\d+)\b/
function rowLabel(l: Line): string | undefined {
  const opener = l.buttons.some((b: any) => !String(b.props?.label ?? '').includes('✉'))
  if (!opener) return undefined
  const m = LABEL.exec(l.text)
  if (m) return m[1]
  return /\bprime\b/.test(l.text) ? 'prime' : undefined
}
const agentRows = (ls: Line[]) => ls.map((l, i) => ({ l, i, label: rowLabel(l) })).filter((x) => x.label !== undefined) as { l: Line; i: number; label: string }[]
const indexOf = (ls: Line[], label: string) => ls.findIndex((l) => rowLabel(l) === label)
/** A row's direct key: the pool letter a Button in it carries as `hotkey` (T19's letterOf; key-scheme.md section 4). */
const letterOf = (l: Line | undefined): string | undefined => {
  if (!l) return undefined
  const b = l.buttons.find((x: any) => POOL.includes(String(x.props && x.props.hotkey)))
  return b ? String(b.props.hotkey) : undefined
}
const lineOf = (ls: Line[], label: string) => ls.find((l) => rowLabel(l) === label)
// Q-66 (inbox/Q-66.answer.md): "dim "↑ <k> more" / "↓ <k> more" lines at the edges".
const UP_MORE = /↑\s*(\d+)\s+more\b/
const DOWN_MORE = /↓\s*(\d+)\s+more\b/
// Q-64's question, option 1 (inbox/Q-64.md, answered A): "the strip shows as many as fit and `+<k> running` for the rest".
const PLUS_RUNNING = /\+(\d+)\s+running\b/
// The hint line under the agent table ends with T9's `b goes back` (spec L265: "T9's keys stay"; as T110L's HINT).
const HINT = /\bb goes back\b/

/** A view is open: its `‹ back` (hotkey `b`, E1 §k k-05/k-08: "b goes back") is drawn. */
async function viewIsOpen(ui: any) {
  return (await ui.findAll({ type: 'Button' })).some((b: any) => b.props.hotkey === 'b')
}
async function shownText(ui: any) {
  return textOf(await ui.drawn())
}

// ------------------------------------------------------------------ the keys (see the header)

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
const pageUp = ($: any, w: World) => scrollKey($, w, (rows) => -rows)
const home = ($: any, w: World) => scrollKey($, w, (_r, content) => -content) // "Home and End `contentRows`"
const end = ($: any, w: World) => scrollKey($, w, (_r, content) => content)

/** The person moves the ring onto `key` (a click, or one arrow step), then the engine keeps it in view. */
async function focusOn($: any, w: World, key: string) {
  await $.ui.focus({ component: 'Pane', requestId: 'baton', plugin: 'baton', element: key, origin: { kind: 'person' } } as any)
  await w.settle(10)
  const { all } = await view(w)
  const at = all.findIndex((l) => w.eng.focused !== undefined && l.focusables.includes(w.eng.focused))
  if (at >= 0 && (at < w.eng.offset || at >= w.eng.offset + w.eng.rows)) {
    w.eng.offset = at < w.eng.offset ? at : at - w.eng.rows + 1 // "a held element kept in view" (SiteScroll.offset)
  }
  await w.redraw()
}
/** ↓ or ↑: the ring steps to the next or previous focusable element, wrapping, until it leaves the row it was on. */
async function arrow($: any, w: World, dir: 1 | -1) {
  const ident = (l: Line | undefined) => (l ? rowLabel(l) ?? 'line:' + l.text : undefined)
  const on = async () => (await view(w)).all.find((l) => w.eng.focused !== undefined && l.focusables.includes(w.eng.focused))
  const start = ident(await on())
  for (let step = 0; step < 6; step++) {
    const { all } = await view(w)
    const keys = all.flatMap((l) => l.focusables)
    const i = w.eng.focused === undefined ? -1 : keys.indexOf(w.eng.focused)
    const next = keys[(((i + dir) % keys.length) + keys.length) % keys.length]
    await focusOn($, w, next)
    if (ident(await on()) !== start) return // the ring has left the row it started on
  }
}
/** The label of the agent row the focus is on, if it is on one. */
async function focusedRow(w: World) {
  const { all } = await view(w)
  const l = all.find((x) => w.eng.focused !== undefined && x.focusables.includes(w.eng.focused))
  return l ? rowLabel(l) : undefined
}
/** The key focus-and-Enter acts on in a row: its `›` (OQ7 "Enter-to-open on rows that already open"), else its first. */
const enterKey = (l: Line) => {
  const openers = l.buttons.filter((b: any) => !String(b.props?.label ?? '').includes('✉'))
  return keyOfEl(openers.find((b: any) => String(b.props?.label ?? '').includes('›')) ?? openers[0])
}
/** A letter key: the engine presses the drawn Button carrying it as `hotkey` (ButtonProps.hotkey); none, nothing happens. */
async function pressLetter(w: World, letter: string) {
  const b = (await w.eng.ui.findAll({ type: 'Button' })).find((x: any) => x.props.hotkey === letter)
  if (b) await w.eng.ui.press({ key: b.key })
  await w.settle(10)
}

// ------------------------------------------------------------------ fixtures

const wk = (i: number) => 'wk' + String(i).padStart(2, '0') // fixture labels: wk01, wk02, … (tree order = spawn order)
/** The prime spawns `n` workers, directly under it (no P0 planned: D-P1-tree-unphased), and those not in `running` return. */
async function agents($: any, w: World, n: number, running: number[] = [], verdicts: Record<number, 'FAILED' | 'BLOCKED'> = {}, last: number[] = []) {
  for (let i = 1; i <= n; i++) await w.spawn($, wk(i))
  for (let i = 1; i <= n; i++) if (!running.includes(i) && !last.includes(i)) await w.finish($, wk(i), verdicts[i] ?? 'DONE')
  for (const i of last) await w.finish($, wk(i), verdicts[i] ?? 'DONE') // these return last
}
/** The rows in tree order: the prime, then wk01 … wkN (spawn order, depth first; L387 "top to bottom in tree order"). */
const treeOrder = (n: number) => ['prime', ...Array.from({ length: n }, (_, i) => wk(i + 1))]

// ================================================================== the list's window (Q-68)

// amended by verifier (XT115): Q-F115-1 A, D-P2-24 — while the list scrolls the pane keeps one empty bottom row (End/Home told from PageDown/PageUp), so c3 expects `rows - 1` lines while scrolling and exactly `rows` when the list fits the pane; renamed from `… fills its height exactly, at two heights`
test('t15-scroll: with more agents than fit, the drawn pane fills its height less one empty row, at two heights, and exactly when the list fits', async ($, on) => {
  // Requirement R-C16-01 (traceability.yaml): "The agent list uses the pane's full height." (spec L284)
  // R-C16-25: "The list takes the rows that are left." (spec L368). Q-68 (inbox/Q-68.answer.md): "the agent list is its
  // own scrolling window; the lines above and below it stay drawn". Done-criterion 3.
  const w = world(on)
  await w.start($)
  await agents($, w, 40) // fixture: 41 agent rows (prime + 40 finished), more than a 20- or 26-line pane holds
  for (const rows of [20, 26]) {
    await w.pane($, rows)
    const { all } = await view(w)
    // spec L368: the list takes the rows the other lines leave, so the pane's lines are exactly its height: no fixed
    // count of agent rows that leaves lines empty (fewer) or pushes the lines below it out of the pane (more).
    expect(all.length, 'pane of ' + rows + ' lines drew ' + all.length + ':' + dump(all)).toBe(rows - 1) // amended by verifier (XT115): Q-F115-1 A, D-P2-24 — the list scrolls, so the pane's height less its one empty bottom row
    // and those lines hold agent rows wherever the other parts leave room: the agent rows are one block in the pane
    const ar = agentRows(all)
    const block = all.slice(ar[0].i, ar[ar.length - 1].i + 1).filter((l) => !rowLabel(l) && !UP_MORE.test(l.text) && !DOWN_MORE.test(l.text) && !PLUS_RUNNING.test(l.text))
    expect(block.map((l) => l.text)).toEqual([]) // spec L368: no other line inside the list's window
    await w.eng.ui.unmount()
  }
  // amended by verifier (XT115): Q-F115-1 A, D-P2-24 — when the list does not scroll it fills the pane exactly: measure the
  // whole tree in a pane tall enough for it, then mount a pane of exactly that height
  await w.pane($, 120)
  const whole = (await view(w)).all.length
  expect(whole, 'the 41-row tree fits a 120-line pane' + dump((await view(w)).all)).toBeLessThan(120) // amended by verifier (XT115): Q-F115-1 A, D-P2-24 — the fixture's tree fits, so this pane does not scroll
  await w.eng.ui.unmount()
  await w.pane($, whole)
  const fit = (await view(w)).all
  expect(fit.length, 'pane of ' + whole + ' lines drew ' + fit.length + ':' + dump(fit)).toBe(whole) // amended by verifier (XT115): Q-F115-1 A, D-P2-24 — the list fits, so no empty row: exactly the pane's height
  expect(fit.filter((l) => UP_MORE.test(l.text) || DOWN_MORE.test(l.text)).map((l) => l.text)).toEqual([]) // amended by verifier (XT115): Q-F115-1 A, D-P2-24 — the list fits, so it does not scroll
  await w.eng.ui.unmount()
})

test('t15-scroll: scrolling the list from its top to its bottom draws every agent row', async ($, on) => {
  // Requirement R-C16-03 (traceability.yaml): "Every agent stays listed." (spec L286); R-C16-16 (L295): "a fixture with
  // more agents than fit lists every agent"; R-C16-02 (L285): "When the agents do not fit, the list scrolls."
  // Q-63 (inbox/Q-63.answer.md): "the engine's PageUp/PageDown scroll by a page". Done-criterion 4.
  const w = world(on)
  await w.start($)
  await agents($, w, 40) // fixture: prime + 40 finished agents, in a 20-line pane
  await w.pane($, 20)
  const seen = new Set<string>()
  for (let i = 0; i < 25; i++) {
    for (const r of agentRows((await view(w)).shown)) seen.add(r.label)
    await pageDown($, w)
  }
  const missing = treeOrder(40).filter((x) => !seen.has(x))
  expect(missing).toEqual([]) // spec L286: every agent stays listed, so each row is drawn at some scroll position
})

test('t15-scroll: scrolling the list from its top to its bottom draws no finished agent row on two pages', async ($, on) => {
  // Requirement R-C16-03 (traceability.yaml): "Every agent stays listed." (spec L286); R-C16-02 (L285): "When the agents
  // do not fit, the list scrolls."; spec L369: "The engine's PageUp and PageDown scroll it by one window". Q-63
  // (inbox/Q-63.answer.md): "the engine's PageUp/PageDown scroll by a page". Done-criterion 5 (an ordinary red test:
  // at da5910c successive pages repeat rows, probe-da5910c.md P-4, work/guard-evidence.md).
  const w = world(on)
  await w.start($)
  await agents($, w, 40) // fixture: the c3/c4 fixture, prime + 40 finished agents, in a 20-line pane
  await w.pane($, 20)
  const pages = new Map<string, number[]>()
  let prev: string | null = null
  for (let i = 0; i < 25; i++) {
    const { shown } = await view(w)
    const sig = shown.map((l) => l.text).join('\n')
    if (sig === prev) break // fixture: the drawing no longer changes, so the list is at its bottom
    prev = sig
    // Q-64 (inbox/Q-64.answer.md): only a running row is pinned and may be drawn again in a strip; the prime is the
    // run's live root, so it is left out and only finished rows (wk01 … wk40, never pinned) are counted.
    for (const r of agentRows(shown)) if (r.label !== 'prime') pages.set(r.label, [...(pages.get(r.label) ?? []), i])
    await pageDown($, w)
  }
  const twice = [...pages].filter(([, p]) => p.length > 1).map(([l, p]) => l + '@' + p.join('/'))
  expect(twice).toEqual([]) // spec L286 and L369: scrolling top to bottom by pages draws each agent row once
})

// ================================================================== finished rows are dimmed (Q-69)

/** The label cell of a row: the Text that carries its label token. */
const labelCell = (l: Line | undefined, label: string) => l?.texts.find((t: any) => new RegExp('\\b' + label + '\\b').test(textOf(t)))
/** The mark cell of a row: the Text that carries its ✓ or ✗. */
const markCell = (l: Line | undefined, mark: string) => l?.texts.find((t: any) => textOf(t).includes(mark))

test('t15-scroll: a finished agent row draws its text dim', async ($, on) => {
  // Requirement R-C16-04 (traceability.yaml): "Finished agents are dimmed." (spec L286); R-C16-48 (L391): "A finished
  // row's text is dimmed,"; R-C16-17, R-C16-58. Q-69 (inbox/Q-69.answer.md): "a finished row's text dims". Criterion 6.
  const w = world(on)
  await w.start($)
  await agents($, w, 3, [3]) // fixture: wk01 and wk02 finished (DONE), wk03 running
  await w.pane($, 40)
  const { shown } = await view(w)
  const cell = labelCell(lineOf(shown, 'wk02'), 'wk02')
  expect(!!cell, 'no label cell for wk02:' + dump(shown)).toBe(true) // fixture: the finished row is drawn
  expect(cell.props.dimColor).toBe(true) // Q-69: the finished row's text is drawn dim
})

test('guard: T15-G2 a finished agent row that returned DONE draws its ✓ green, not dim', async ($, on) => {
  // Requirement R-C16-49 (traceability.yaml): "and its ✓ or ✗ mark keeps its green or red (Q-69)." (spec L391); R-C16-58.
  // Q-69 (inbox/Q-69.answer.md): "its ✓/✗ mark keeps its colour". OQ7: a guard (done-criterion 7, false premise at
  // da5910c: the ✓ is green there and nothing is dimmed); work/guard-evidence.md.
  const w = world(on)
  await w.start($)
  await agents($, w, 2) // fixture: wk01 and wk02 finished, DONE
  await w.pane($, 40)
  const cell = markCell(lineOf((await view(w)).shown, 'wk01'), '✓')
  expect(!!cell).toBe(true) // fixture: the DONE row draws a ✓ (mod/lib/agents.mjs ~107-113, as at da5910c)
  expect(cell.props.color).toBe('green') // Q-69: the ✓ keeps its green
  expect(cell.props.dimColor === true).toBe(false) // Q-69: the mark is not dimmed with the row's text
})

test('guard: T15-G3 a finished agent row that FAILED draws its ✗ red, not dim', async ($, on) => {
  // Requirement R-C16-49 (traceability.yaml): "and its ✓ or ✗ mark keeps its green or red (Q-69)." (spec L391).
  // Q-69 (inbox/Q-69.answer.md): "its ✓/✗ mark keeps its colour". OQ7: a guard (done-criterion 8, false premise at
  // da5910c: the ✗ is red there and nothing is dimmed); work/guard-evidence.md.
  const w = world(on)
  await w.start($)
  await agents($, w, 2, [], { 2: 'FAILED' }) // fixture: wk01 DONE, wk02 FAILED
  await w.pane($, 40)
  const cell = markCell(lineOf((await view(w)).shown, 'wk02'), '✗')
  expect(!!cell).toBe(true) // fixture: the FAILED row draws a ✗ (mod/lib/agents.mjs ~107, as at da5910c)
  expect(cell.props.color).toBe('red') // Q-69: the ✗ keeps its red
  expect(cell.props.dimColor === true).toBe(false) // Q-69: the mark is not dimmed with the row's text
})

test('guard: T15-G4 an agent row that returned BLOCKED and still waits for the operator is not drawn dim', async ($, on) => {
  // Requirement R-C16-50 (traceability.yaml): "A blocked row that still waits for the operator is not dimmed." (spec
  // L391); R-C16-59. Q-69 (inbox/Q-69.answer.md): "blocked rows are not dimmed". Q-38 (inbox/Q-38.answer.md): "agent rows
  // that returned BLOCKED are blocked rows". OQ7: a guard (done-criterion 9, false premise at da5910c: nothing is dimmed).
  const w = world(on, { questions: ['Q-9'] }) // fixture: its question Q-9 is open (no Q-9.answer.md), so it still waits
  await w.start($)
  await agents($, w, 2, [], { 2: 'BLOCKED' }) // fixture: wk01 DONE, wk02 returned BLOCKED
  await w.pane($, 40)
  const cell = labelCell(lineOf((await view(w)).shown, 'wk02'), 'wk02')
  expect(!!cell).toBe(true) // fixture: the blocked row is drawn
  expect(cell.props.dimColor === true).toBe(false) // Q-69: its text is not dimmed while it waits
})

// ================================================================== the fold line goes (R-C16-06)

test('t15-scroll: with more finished agents than fit, no line reads `earlier finished agent`', async ($, on) => {
  // Requirement R-C16-06 (traceability.yaml): "The "… N earlier finished agents" line goes away." (spec L288); R-C16-19
  // (L296): "one that no "earlier finished agents" line is drawn". Done-criterion 10.
  const w = world(on)
  await w.start($)
  await agents($, w, 40) // fixture: 40 finished agents, more than a 20-line pane holds
  await w.pane($, 20)
  const { all } = await view(w)
  expect(all.filter((l) => /earlier finished agent/.test(l.text)).map((l) => l.text)).toEqual([]) // spec L288: the line goes away
})

// ================================================================== the lines around the list stay drawn (Q-68)

test('t15-scroll: with more agents than fit, the hint line and the message field under the list are drawn in the pane', async ($, on) => {
  // Requirement R-C16-24 (traceability.yaml): "and below it (questions, blocked rows, rulings, the message field and the
  // hint line) stay drawn whole." (spec L366-367); R-C16-22, R-C16-52. Q-68 (inbox/Q-68.answer.md): "the lines above and
  // below it stay drawn". Done-criterion 11.
  const w = world(on)
  await w.start($)
  await agents($, w, 42, [41, 42]) // fixture: 40 finished, wk41 and wk42 running (✉ targets a running one)
  await w.pane($, 16)
  const before = (await view(w)).shown
  expect(before.some((l) => HINT.test(l.text)), 'hint not in the pane:' + dump(before)).toBe(true) // Q-68: the hint line stays drawn
  const msg = (await w.eng.ui.findAll({ type: 'Button' })).find((b: any) => String(b.props.label ?? '').includes('✉'))
  expect(!!msg).toBe(true) // fixture: a running row has its ✉ (register.js messageField, as at da5910c)
  await w.eng.ui.press({ key: msg.key }) // ✉ targets that agent: the message field is drawn
  await w.redraw()
  const after = (await view(w)).shown
  expect(after.some((l) => l.node && l.node.type === 'Input'), 'no message field in the pane:' + dump(after)).toBe(true) // Q-68: the message field stays drawn
})

test('t15-scroll: with more agents than fit and an open question, its `?` row is drawn in the pane', async ($, on) => {
  // Requirement R-C16-24 (traceability.yaml): "and below it (questions, ...) stay drawn whole." (spec L366-367);
  // R-C16-52. Q-68 (inbox/Q-68.answer.md): "the lines above and below it stay drawn". Done-criterion 12.
  const w = world(on, { questions: ['Q-7'] }) // fixture: Q-7 is open (no answer file)
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 16)
  const { shown } = await view(w)
  expect(shown.some((l) => /\?/.test(l.text) && /\bQ-7\b/.test(l.text)), 'no ? Q-7 row in the pane:' + dump(shown)).toBe(true) // Q-68: the question's ? row stays drawn
})

test('guard: T15-G5 with more agents than fit, the goal row above the list is drawn in the pane', async ($, on) => {
  // Requirement R-C16-23 (traceability.yaml): "The lines above it (goal, PR and merge rows)" (spec L366); R-C16-52.
  // Q-68 (inbox/Q-68.answer.md): "the lines above and below it stay drawn". OQ7: a guard (done-criterion 47).
  const w = world(on)
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 16)
  const { shown } = await view(w)
  expect(shown.some((l) => /^\s*goal\b/.test(l.text)), dump(shown)).toBe(true) // Q-68: the goal row stays drawn
})

test('guard: T15-G6 with more agents than fit and an open PR, the PR row above the list is drawn in the pane', async ($, on) => {
  // Requirement R-C16-23 (traceability.yaml): "The lines above it (goal, PR and merge rows)" (spec L366); R-C16-52.
  // Q-68 (inbox/Q-68.answer.md): "the lines above and below it stay drawn". OQ7: a guard (done-criterion 48).
  const w = world(on, { pr: true }) // fixture: PR #47 is open
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 16)
  const { shown } = await view(w)
  expect(shown.some((l) => /^\s*PR\b/.test(l.text)), dump(shown)).toBe(true) // Q-68: the PR row stays drawn
})

test('guard: T15-G7 with more agents than fit and merge-ready rows, the merge line above the list is drawn in the pane', async ($, on) => {
  // Requirement R-C16-23 (traceability.yaml): "The lines above it (goal, PR and merge rows)" (spec L366); R-C16-52.
  // Q-68 (inbox/Q-68.answer.md): "the lines above and below it stay drawn". OQ7: a guard (done-criterion 49).
  const w = world(on, { pr: true }) // fixture: PR #47 with a failing check, so its merge-ready rows are computed
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 16)
  const { shown } = await view(w)
  expect(shown.some((l) => /merge-ready/.test(l.text)), dump(shown)).toBe(true) // Q-68: the merge rows stay drawn
})

// ================================================================== running agents stay in view (Q-64)

test('t15-scroll: with finished agents taller than the pane and one running, the running row is drawn when the list is first shown', async ($, on) => {
  // Requirement R-C16-05 (traceability.yaml): "Running agents stay in view." (spec L287); R-C16-18 (L296): "one that a
  // running agent stays in view". Q-64 (inbox/Q-64.answer.md). Done-criterion 13.
  const w = world(on)
  await w.start($)
  await agents($, w, 41, [41]) // fixture: 40 finished agents fill more than a 16-line pane; wk41, spawned last, runs
  await w.pane($, 16)
  const { shown } = await view(w)
  expect(indexOf(shown, 'wk41'), 'running wk41 not in the pane:' + dump(shown)).toBeGreaterThanOrEqual(0) // L287: running agents stay in view
})

test('guard: T15-G8 a running agent row is drawn', async ($, on) => {
  // Requirement R-C16-05 (traceability.yaml): "Running agents stay in view." (spec L287). OQ7: a guard (done-criterion 45:
  // live rows are never folded at da5910c, mod/lib/agents.mjs ~98).
  const w = world(on)
  await w.start($)
  await agents($, w, 3, [2]) // fixture: wk02 running, wk01 and wk03 finished
  await w.pane($, 40)
  expect(indexOf((await view(w)).shown, 'wk02')).toBeGreaterThanOrEqual(0) // L287: the running row is drawn
})

test('guard: T15-G9 a finished agent row shows its ✓ or ✗ mark and its verdict', async ($, on) => {
  // Requirement R-C16-03 (traceability.yaml): "Every agent stays listed." (spec L286); R-C16-49 (L391): "its ✓ or ✗
  // mark". OQ7: a guard (done-criterion 46: mod/lib/agents.mjs ~107-113 at da5910c).
  const w = world(on)
  await w.start($)
  await agents($, w, 2, [], { 2: 'FAILED' }) // fixture: wk01 DONE, wk02 FAILED
  await w.pane($, 40)
  const { shown } = await view(w)
  const one = lineOf(shown, 'wk01')
  const two = lineOf(shown, 'wk02')
  expect(!!one && one.text.includes('✓') && /\bdone\b/i.test(one.text)).toBe(true) // agents.mjs ~107-113: ✓ and its verdict DONE
  expect(!!two && two.text.includes('✗') && /\bfailed\b/i.test(two.text)).toBe(true) // agents.mjs ~107: ✗ and its verdict FAILED
})

// ================================================================== the keyboard: ↑/↓ past the window's edge (L289-290, L371)

// A pane taller than everything da5910c draws (prime, 12 finished rows and the fold line), shorter than 101 agent rows.
const TALL = 34 // fixture
const MANYN = 100 // fixture: prime + 100 finished agents
// fixture: wk45 … wk56 return last. da5910c keeps the 12 newest finished rows unfolded (mod/lib/agents.mjs ~88-90), so
// there it draws prime, wk45 … wk56 and the fold line: rows of the list lie above and below what it draws, and the whole
// pane fits in 34 lines, so the engine's own window never moves.
const MID = Array.from({ length: 12 }, (_, i) => i + 45)
const tall = ($: any, w: World) => agents($, w, MANYN, [], {}, MID)

/** The window's rows: the finished agent rows drawn (every worker is finished, so none is in a pinned strip). */
const windowRows = (ls: Line[]) => agentRows(ls).filter((r) => r.label !== 'prime')

test('t15-scroll: with the focus on the last agent row shown and more rows below, ↓ scrolls the list', async ($, on) => {
  // Requirement R-C16-08 (traceability.yaml): "moving the focus past the last or first row shown scrolls the list,"
  // (spec L289); R-C16-29 (L371): "so that the newly focused row is in view"; R-C16-07, R-C16-20. D-T15-scroll-step: the
  // step size is not pinned. Done-criterion 14.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  const before = (await view(w)).shown
  const last = windowRows(before).at(-1)!
  await focusOn($, w, enterKey(last.l)) // the person puts the focus on the last agent row shown
  await arrow($, w, 1) // ↓
  const after = (await view(w)).shown
  const drawnBefore = new Set(agentRows(before).map((r) => r.label))
  const fresh = agentRows(after).filter((r) => !drawnBefore.has(r.label)).map((r) => r.label)
  expect(fresh.length, 'no row came into view after ↓ from ' + last.label + ':' + dump(after)).toBeGreaterThan(0) // L289: ↓ past the last row scrolls the list
})

test('t15-scroll: after that ↓, the focus is on the agent row that came into view', async ($, on) => {
  // Requirement R-C16-29 (traceability.yaml): "so that the newly focused row is in view (L289-290 stand)." (spec L371);
  // R-C16-08. Done-criterion 15.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  const before = (await view(w)).shown
  const last = windowRows(before).at(-1)!
  await focusOn($, w, enterKey(last.l))
  await arrow($, w, 1) // ↓
  const order = treeOrder(MANYN)
  const drawnBefore = new Set(agentRows(before).map((r) => r.label))
  const now = await focusedRow(w)
  // L371: the focus is on an agent row that was not drawn before the ↓ and is drawn now
  expect(now !== undefined && !drawnBefore.has(now) && indexOf((await view(w)).shown, now) >= 0, 'the focus is on ' + (now ?? 'no agent row')).toBe(true) // spec L371: on the row that came into view
  expect(now).toBe(order[order.indexOf(last.label) + 1]) // L371: the row after the last one shown, in tree order
})

test('t15-scroll: with the focus on the first agent row shown and rows above it, ↑ scrolls the list back', async ($, on) => {
  // Requirement R-C16-08 (traceability.yaml): "moving the focus past the last or first row shown scrolls the list,"
  // (spec L289); R-C16-29 (L371). D-T15-scroll-step: the step size is not pinned. Done-criterion 16.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  await pageDown($, w)
  await pageDown($, w) // the list is scrolled down, so rows lie above its window
  const before = (await view(w)).shown
  const first = windowRows(before)[0]
  await focusOn($, w, enterKey(first.l)) // the person puts the focus on the first agent row shown in the window
  await arrow($, w, -1) // ↑
  const after = (await view(w)).shown
  const order = treeOrder(MANYN)
  const drawnBefore = new Set(agentRows(before).map((r) => r.label))
  const back = agentRows(after).filter((r) => !drawnBefore.has(r.label) && order.indexOf(r.label) < order.indexOf(first.label)).map((r) => r.label)
  expect(back.length, 'no row above ' + first.label + ' came into view after ↑:' + dump(after)).toBeGreaterThan(0) // L289: ↑ past the first row scrolls back
})

test('t15-scroll: an agent row scrolled into view by ↓ opens by focus and Enter', async ($, on) => {
  // Requirement R-C16-09 (traceability.yaml): "and a row scrolled into view opens like any other." (spec L290). OQ7
  // (inbox/OQ7.answer.md): Enter-to-open on rows that open. Done-criterion 17.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  const before = (await view(w)).shown
  const drawnBefore = new Set(agentRows(before).map((r) => r.label))
  await focusOn($, w, enterKey(windowRows(before).at(-1)!.l))
  await arrow($, w, 1) // ↓ past the last row shown
  const target = (await focusedRow(w)) ?? '(the focus is on no agent row)'
  await w.eng.ui.press({ key: w.eng.focused }) // Enter on the focused element
  await w.settle(10)
  expect(await viewIsOpen(w.eng.ui), 'Enter on ' + target + ' opened no view').toBe(true) // L290: it opens like any other
  expect(drawnBefore.has(target)).toBe(false) // it is a row that was scrolled into view
  expect(await shownText(w.eng.ui)).toContain(target) // the view is that agent's
})

// ================================================================== direct keys as the list scrolls (Q-12, Q-67, Q-82)

const LETTERED = 21 // fixture: prime + 21 agents = 22 lettered rows, every one holding a pool letter (Q-12)
const LOW = 14 // fixture: a 14-line pane, so the 22 rows scroll
// fixture: wk06 … wk15 run and the other 11 are finished (no more than the 12 finished rows da5910c keeps unfolded), so
// every row of the fixture is drawn somewhere at da5910c too, and wk01 … wk05 are finished rows at the list's top.
const LRUN = Array.from({ length: 10 }, (_, i) => i + 6)

test('t15-scroll: with at most 22 lettered rows, every agent row drawn after the list scrolls has a direct key from the pool', async ($, on) => {
  // Requirement R-C16-15 (traceability.yaml): "how the T9 direct keys are given to rows as the list scrolls." (spec L293);
  // R-C16-40 (L383): "A row's direct key stays with that row for as long as the row exists,". Q-12
  // (inbox/Q-12.answer.md), Q-67 (inbox/Q-67.answer.md): "rows out of view keep their letters". Done-criterion 18.
  const w = world(on)
  await w.start($)
  await agents($, w, LETTERED, LRUN)
  await w.pane($, LOW)
  await pageDown($, w)
  const rows = agentRows((await view(w)).shown)
  expect(rows.length).toBeGreaterThan(0) // fixture: agent rows are drawn after the scroll
  expect(rows.filter((r) => !POOL.includes(letterOf(r.l) ?? '')).map((r) => r.label)).toEqual([]) // Q-12/Q-67: each holds a pool letter
})

test('guard: T15-G10 after the list scrolls, no two agent rows drawn share a direct key', async ($, on) => {
  // Requirement R-C16-15 (traceability.yaml): "how the T9 direct keys are given to rows as the list scrolls." (spec L293).
  // Q-12 (inbox/Q-12.answer.md) via key-scheme.md section 2: "Rules 1-4 hold at most one row per letter". OQ7: a guard
  // (done-criterion 19, false premise at da5910c: no row has a key there); work/guard-evidence.md.
  const w = world(on)
  await w.start($)
  await agents($, w, LETTERED, LRUN)
  await w.pane($, LOW)
  for (let i = 0; i < 3; i++) {
    await pageDown($, w)
    const letters = agentRows((await view(w)).shown).map((r) => letterOf(r.l)).filter((x) => x !== undefined)
    expect(letters.length).toBe(new Set(letters).size) // Q-12: no two rows share a key
  }
})

test('guard: T15-G11 a row keeps its direct key when it is scrolled out of the window and back in at another place', async ($, on) => {
  // Requirement R-C16-40 (traceability.yaml): "A row's direct key stays with that row for as long as the row exists,"
  // (spec L383); R-C16-57 (L400): "a row keeps its key while scrolled out;". Q-67 (inbox/Q-67.answer.md): "hotkey letters
  // are fixed per row for as long as the row exists". OQ7: a guard (done-criterion 20, false premise at da5910c).
  // The row comes back by ↑ from the first row shown (spec L289-290), so it is drawn at another place in the window
  // than before: a key given by a row's place in the window would change there (verdict r1 c20, mutant "win").
  const w = world(on)
  await w.start($)
  await agents($, w, LETTERED, LRUN) // fixture: wk03 is finished (LRUN is wk06 … wk15), so it is never pinned (Q-64)
  await w.pane($, LOW)
  const place = (ls: Line[]) => agentRows(ls).findIndex((r) => r.label === 'wk03') // its place among the rows drawn
  const first = (await view(w)).shown
  const before = letterOf(lineOf(first, 'wk03'))
  const was = place(first)
  expect(was).toBeGreaterThanOrEqual(0) // fixture: wk03 is drawn when the list is first shown
  for (let i = 0; i < 3 && lineOf((await view(w)).shown, 'wk03'); i++) await pageDown($, w)
  expect(lineOf((await view(w)).shown, 'wk03')).toBe(undefined) // fixture: wk03 is scrolled out of the window
  const top = windowRows((await view(w)).shown)[0]
  await focusOn($, w, enterKey(top.l)) // the focus on the first row shown
  for (let i = 0; i < 40 && !lineOf((await view(w)).shown, 'wk03'); i++) await arrow($, w, -1) // ↑ until wk03 is back
  const back = (await view(w)).shown
  expect(place(back), 'wk03 not back:' + dump(back)).toBeGreaterThanOrEqual(0) // fixture: wk03 is drawn again
  expect(place(back)).not.toBe(was) // fixture: at another place in the window than before
  expect(letterOf(lineOf(back, 'wk03'))).toBe(before) // Q-67: the same key as before it was scrolled out
})

test('t15-scroll: pressing the direct key of a row scrolled out of the window opens that row', async ($, on) => {
  // Requirement R-C16-41 (traceability.yaml): "Pressing the key of a row scrolled out of view opens that row." (spec
  // L384). Q-67 (inbox/Q-67.answer.md): "rows out of view keep their letters". Done-criterion 21.
  const w = world(on)
  await w.start($)
  await agents($, w, LETTERED, LRUN)
  await w.pane($, LOW)
  await end($, w)
  await w.redraw()
  expect(indexOf((await view(w)).shown, 'wk03')).toBe(-1) // fixture: wk03 is scrolled out of the window
  // key-scheme.md rule 1 (Q-12, L387): at the first draw the rows take the pool top to bottom in tree order:
  // prime a, wk01 c, wk02 d, wk03 e.
  const letter = POOL[treeOrder(LETTERED).indexOf('wk03')]
  await pressLetter(w, letter)
  expect(await viewIsOpen(w.eng.ui), 'pressing ' + letter + ' opened no view').toBe(true) // L384: it opens that row
  expect(await shownText(w.eng.ui)).toContain('wk03') // the view is wk03's
})

test('t15-scroll: a row added after the pane first drew takes the lowest pool letter no other row holds', async ($, on) => {
  // Requirement R-C16-46 (traceability.yaml): "A row added later takes the lowest free letter of the 22-letter pool."
  // (spec L389). D-T15-letters-pool (display detail decided by the planner under the standing ruling): "A row added
  // later takes the lowest letter no other row holds." Done-criterion 22.
  const w = world(on)
  await w.start($)
  await agents($, w, 2, [1, 2]) // fixture: prime, wk01, wk02 at the first draw: a c d (key-scheme.md rule 1)
  await w.pane($, 40)
  await w.spawn($, 'kid1', 'wk01') // a row added under wk01, so above wk02 in tree order
  await w.redraw()
  // key-scheme.md rule 3: a, c and d are held, so the lowest free letter is e, not wk02's d (Q-67: d stays wk02's).
  expect(letterOf(lineOf((await view(w)).shown, 'kid1'))).toBe(POOL[3]) // D-T15-letters-pool / key-scheme.md rule 3: e
})

/** 22 lettered rows at the first draw (prime + 21 running agents, never folded), then a 23rd row is added. */
async function full($: any, w: World) {
  await agents($, w, LETTERED, Array.from({ length: LETTERED }, (_, i) => i + 1))
  await w.pane($, 60) // fixture: a pane taller than every row
  await w.spawn($, 'run23') // the 23rd lettered row, added after the first draw
  await w.redraw()
}

test('guard: T15-G12 with all 22 letters held, a row added later has no direct key', async ($, on) => {
  // Requirement R-C16-47 (traceability.yaml): "Once every letter is taken, a row has no direct key and opens by focus
  // and Enter (Q-12)." (spec L390). Q-12 (inbox/Q-12.answer.md) via its question: "Rows past the 22nd have no direct key".
  // D-T15-letters-pool. OQ7: a guard (done-criterion 23, false premise at da5910c: no row has a key).
  const w = world(on)
  await w.start($)
  await full($, w)
  const l = lineOf((await view(w)).shown, 'run23')
  expect(!!l).toBe(true) // fixture: the 23rd row is drawn
  expect(letterOf(l)).toBe(undefined) // L390: it has no direct key
})

test('guard: T15-G13 with all 22 letters held, the row added later opens by focus and Enter', async ($, on) => {
  // Requirement R-C16-47 (traceability.yaml): "... a row has no direct key and opens by focus and Enter (Q-12)." (spec
  // L390). Q-12 (inbox/Q-12.answer.md). OQ7: "Enter-to-open on rows that already open" (done-criterion 24).
  const w = world(on)
  await w.start($)
  await full($, w)
  const l = lineOf((await view(w)).shown, 'run23')
  expect(!!l).toBe(true) // fixture: the 23rd row is drawn
  await focusOn($, w, enterKey(l!))
  await w.eng.ui.press({ key: w.eng.focused }) // Enter on the focused element
  await w.settle(10)
  expect(await viewIsOpen(w.eng.ui)).toBe(true) // L390: it opens by focus and Enter
  expect(await shownText(w.eng.ui)).toContain('run23') // its own view
})

test('guard: T15-G14 after a pane reload, every row that still exists has the direct key it had before', async ($, on) => {
  // Requirement R-C16-61 (traceability.yaml): "A row's letter survives every pane reload" (spec L567); R-C16-66 (L569):
  // "A row that still exists gets its letter back."; R-C16-68 (L571). Q-82 (inbox/Q-82.answer.md): "Letters survive
  // every reload". OQ7: a guard (done-criterion 25, false premise at da5910c: no row has a key). The fixture is one in
  // which giving letters top to bottom again would move them: kid1 and P2 are added after the first draw, above rows
  // that hold lower letters. It also hands its run state to the restart test below (criterion 26).
  const w = world(on, { phases: [1, 3] }) // fixture: P1 and P3 planned at the first draw
  await w.start($)
  await agents($, w, 2, [1, 2]) // wk01 and wk02 running
  await w.pane($, 60)
  await w.spawn($, 'kid1', 'wk01') // added under wk01, above wk02
  w.setPhases([1, 2, 3]) // P2 planned after the first draw, above P3
  await w.settle(61000)
  await w.eng.ui.press({ key: 'refresh' }) // `r` re-reads the plan (T19 guard G3)
  await w.redraw()
  const rows = ['prime', 'P1', 'P2', 'P3', 'wk01', 'kid1', 'wk02']
  const before = (await view(w)).shown
  const was = Object.fromEntries(rows.map((r) => [r, letterOf(lineOf(before, r))]))
  await w.reload($)
  await w.redraw()
  const after = (await view(w)).shown
  expect(Object.fromEntries(rows.map((r) => [r, letterOf(lineOf(after, r))]))).toEqual(was) // Q-82: each row gets its letter back
  carried = { files: new Map(w.files), store: new Map(w.store), letters: was }
})

test('guard: T15-G15 after the mod restarts and reads the run state back, a phase row that still exists has its direct key', async ($, on) => {
  // Requirement R-C16-62 (traceability.yaml): "and restart (Q-82)." (spec L567); R-C16-63 (L567): "The row-to-letter map
  // is stored with the run's state,"; R-C16-65 (L568): "and read back on any reload or restart." Q-82
  // (inbox/Q-82.answer.md): "read back on any reload or restart. A row that still exists gets its letter back". OQ7: a
  // guard (done-criterion 26, false premise at da5910c). Each test runs a fresh load of the mod, so this one is the
  // restart: it starts from the files and the store the reload test above left (its agents are gone with the process;
  // the prime and the phase rows, read from _orch/, still exist).
  expect(carried !== null, 'the reload test above did not hand over its run state').toBe(true) // fixture: T15-G14 ran first in this file
  const w = world(on, { files: carried!.files, store: carried!.store })
  w.setPhases([1, 2, 3])
  await w.start($)
  await w.pane($, 60)
  const after = (await view(w)).shown
  const rows = ['prime', 'P1', 'P2', 'P3']
  expect(Object.fromEntries(rows.map((r) => [r, letterOf(lineOf(after, r))]))).toEqual(Object.fromEntries(rows.map((r) => [r, carried!.letters[r]]))) // Q-82: the same letters
})

test('t15-scroll: after a pane reload, a row that did not exist before takes the lowest free pool letter', async ($, on) => {
  // Requirement R-C16-67 (traceability.yaml): "A new row takes the lowest free letter." (spec L569); R-C16-61. Q-82
  // (inbox/Q-82.answer.md): "new rows take the lowest free letter". Done-criterion 27.
  const w = world(on)
  await w.start($)
  await agents($, w, 2, [1, 2]) // fixture: prime, wk01, wk02 at the first draw: a c d (key-scheme.md rule 1)
  await w.pane($, 40)
  await w.eng.ui.unmount() // the pane is closed
  await w.spawn($, 'kid1', 'wk01') // a row that did not exist before the reload, added above wk02 while the pane is closed
  await w.pane($, 40) // and opened again
  await w.redraw()
  // Q-82: a, c and d still belong to prime, wk01 and wk02, so the new row takes e (not wk02's d).
  expect(letterOf(lineOf((await view(w)).shown, 'kid1'))).toBe(POOL[3]) // Q-82 / key-scheme.md rule 5: e
})

// ================================================================== PageUp, PageDown, Home, End (Q-63)

test('t15-scroll: PageDown scrolls the list down by the window height in rows', async ($, on) => {
  // Requirement R-C16-27 (traceability.yaml): "The engine's PageUp and PageDown scroll it by one window," (spec L369);
  // R-C16-53. Q-63 (inbox/Q-63.answer.md): "the engine's PageUp/PageDown scroll by a page". Done-criterion 28.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  const before = agentRows((await view(w)).shown) // the window at the list's top: prime, wk01 … (nothing is pinned yet)
  await pageDown($, w)
  const order = treeOrder(MANYN)
  const top = windowRows((await view(w)).shown)[0]?.label ?? '-'
  // L369: one window down: the window's new top row lies the window's height in rows below its old top row (prime).
  expect(order.indexOf(top) - order.indexOf(before[0].label), 'new top ' + top).toBe(before.length) // spec L369: by one window
})

test('t15-scroll: PageUp scrolls the list up by the window height in rows', async ($, on) => {
  // Requirement R-C16-27 (traceability.yaml): "The engine's PageUp and PageDown scroll it by one window," (spec L369);
  // R-C16-53. Q-63 (inbox/Q-63.answer.md). Done-criterion 29.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  for (let i = 0; i < 3; i++) await pageDown($, w)
  const mid = windowRows((await view(w)).shown) // the window in the middle of the list: its finished rows
  await pageUp($, w)
  const order = treeOrder(MANYN)
  const top = windowRows((await view(w)).shown)[0]?.label ?? '-'
  // L369: one window up: the new top row lies the window's height in rows above the old top row.
  expect(order.indexOf(mid[0].label) - order.indexOf(top), 'new top ' + top + ', old top ' + mid[0].label).toBe(mid.length) // spec L369: by one window
})

test('t15-scroll: Home moves the focus to the list first row', async ($, on) => {
  // Requirement R-C16-28 (traceability.yaml): "and Home and End move to its first and last row." (spec L369-370);
  // R-C16-53. Q-63 (inbox/Q-63.answer.md): "Home/End go to the first/last row". Done-criterion 30.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  const some = windowRows((await view(w)).shown).at(-2)!
  await focusOn($, w, enterKey(some.l)) // the focus is on a row lower in the list
  await home($, w)
  expect(await focusedRow(w)).toBe('prime') // L387: the list's first row is the prime's
})

test('t15-scroll: End moves the focus to the list last row', async ($, on) => {
  // Requirement R-C16-28 (traceability.yaml): "and Home and End move to its first and last row." (spec L369-370);
  // R-C16-53. Q-63 (inbox/Q-63.answer.md). Done-criterion 31.
  const w = world(on)
  await w.start($)
  await tall($, w)
  await w.pane($, TALL)
  await focusOn($, w, enterKey(lineOf((await view(w)).shown, 'prime')!)) // the focus is on the list's first row
  await end($, w)
  expect(await focusedRow(w)).toBe(wk(MANYN)) // tree order: the last row is the last agent spawned, wk100
})

// ================================================================== pinned strips (Q-64)

const SHORT = 16 // fixture: a 16-line pane

test('t15-scroll: a running agent row scrolled above the window is drawn in a pinned strip at the top of the list', async ($, on) => {
  // Requirement R-C16-30 (traceability.yaml): "A running agent's row scrolled out of the window is drawn in a pinned
  // strip" (spec L374); R-C16-31 (L375): "above for rows above"; R-C16-12, R-C16-54. Q-64 (inbox/Q-64.answer.md).
  // Done-criterion 32.
  const w = world(on)
  await w.start($)
  await agents($, w, 40, [1]) // fixture: wk01 runs, wk02 … wk40 finished
  await w.pane($, SHORT)
  await pageDown($, w)
  const { shown } = await view(w)
  const order = treeOrder(40)
  const win = windowRows(shown).filter((r) => r.label !== 'wk01')
  const at = indexOf(shown, 'wk01')
  expect(at, 'wk01 not drawn after the scroll:' + dump(shown)).toBeGreaterThanOrEqual(0) // Q-64: it is still drawn
  expect(order.indexOf(win[0].label)).toBeGreaterThan(order.indexOf('wk01') + 1) // fixture: the window has scrolled past it
  expect(at).toBeLessThan(win[0].i) // Q-64: in a strip at the top, above the window's rows
})

test('t15-scroll: a running agent row scrolled below the window is drawn in a pinned strip at the bottom of the list', async ($, on) => {
  // Requirement R-C16-30 (traceability.yaml): "... is drawn in a pinned strip" (spec L374); R-C16-31 (L375): "below for
  // rows below."; R-C16-11, R-C16-54. Q-64 (inbox/Q-64.answer.md). Done-criterion 33.
  const w = world(on)
  await w.start($)
  await agents($, w, 41, [41]) // fixture: wk41, spawned last, runs below 40 finished rows
  await w.pane($, SHORT)
  const { shown } = await view(w)
  const order = treeOrder(41)
  const win = windowRows(shown).filter((r) => r.label !== 'wk41')
  const at = indexOf(shown, 'wk41')
  expect(at, 'wk41 not drawn:' + dump(shown)).toBeGreaterThanOrEqual(0) // Q-64: it is drawn
  expect(order.indexOf(win.at(-1)!.label)).toBeLessThan(order.indexOf('wk41') - 1) // fixture: the window stops above it
  expect(at).toBeGreaterThan(win.at(-1)!.i) // Q-64: in a strip at the bottom, below the window's rows
})

test('t15-scroll: a pinned strip of two running rows draws them in tree order', async ($, on) => {
  // Requirement R-C16-32 (traceability.yaml): "The strip keeps tree order," (spec L375). Q-64 (inbox/Q-64.answer.md):
  // "drawn in a pinned strip at that edge of the list". Done-criterion 34.
  const w = world(on)
  await w.start($)
  await agents($, w, 40, [1, 2]) // fixture: wk01 and wk02 run, wk03 … wk40 finished
  await w.pane($, SHORT)
  await pageDown($, w)
  const { shown } = await view(w)
  const win = windowRows(shown).filter((r) => r.label !== 'wk01' && r.label !== 'wk02')
  const one = indexOf(shown, 'wk01')
  const two = indexOf(shown, 'wk02')
  expect([one >= 0, two >= 0], 'pinned rows not drawn:' + dump(shown)).toEqual([true, true]) // Q-64: both are pinned
  expect(two).toBeLessThan(win[0].i) // both in the strip above the window
  expect(one).toBeLessThan(two) // L375: tree order, wk01 before wk02
})

test('guard: T15-G16 a running row drawn in a pinned strip shows the same direct key as in the list', async ($, on) => {
  // Requirement R-C16-33 (traceability.yaml): "and each row in it keeps its key and `›`." (spec L375-376). Q-64
  // (inbox/Q-64.answer.md); Q-67 (inbox/Q-67.answer.md): "rows out of view keep their letters". OQ7: a guard
  // (done-criterion 35, false premise at da5910c: no pinned strip and no keys there).
  const w = world(on)
  await w.start($)
  await agents($, w, 40, [1, 2])
  await w.pane($, SHORT)
  const top = (await view(w)).shown
  const was = { wk01: letterOf(lineOf(top, 'wk01')), wk02: letterOf(lineOf(top, 'wk02')) } // in the list, at its top
  await pageDown($, w)
  const { shown } = await view(w)
  for (const r of ['wk01', 'wk02'] as const) {
    const l = lineOf(shown, r)
    if (l) expect(letterOf(l)).toBe(was[r]) // Q-64/Q-67: the same key in the strip
  }
})

test('guard: T15-G17 a running row drawn in a pinned strip draws its ›', async ($, on) => {
  // Requirement R-C16-33 (traceability.yaml): "and each row in it keeps its key and `›`." (spec L375-376); plan verdict
  // r15 P3-3. Q-64 (inbox/Q-64.answer.md). OQ7: a guard (done-criterion 36, false premise at da5910c: no pinned strip).
  const w = world(on)
  await w.start($)
  await agents($, w, 40, [1, 2]) // fixture: wk01 and wk02 run, wk03 … wk40 finished
  await w.pane($, SHORT)
  await pageDown($, w)
  const { shown } = await view(w)
  expect(stripRowsWithoutChevron(shown)).toEqual([]) // L376: every strip row draws its ›
})

/** Lines outside the window's rows that name a running row (wk01, wk02), found by their text alone, never by a ›
 * Button (verdict r1 c36: a strip row drawn without its › must still be seen), and the labels of those lacking a ›. */
function stripRowsWithoutChevron(shown: Line[]): string[] {
  const win = windowRows(shown).filter((r) => r.label !== 'wk01' && r.label !== 'wk02')
  if (!win.length) return []
  const lo = win[0].i
  const hi = win[win.length - 1].i
  return shown
    .map((l, i) => ({ l, i, m: /\b(wk01|wk02)\b/.exec(l.text) }))
    .filter((x) => x.m && (x.i < lo || x.i > hi))
    .filter((x) => !x.l.buttons.some((b: any) => String(b.props?.label ?? '').includes('›')))
    .map((x) => x.m![1] + ':' + x.l.text)
}

test('t15-scroll: when the running rows do not all fit in the strip, its last line reads +<k> running', async ($, on) => {
  // Requirement R-C16-34 (traceability.yaml): "When the running rows do not all fit, the strip shows as many as fit and
  // then `+<k> running` (Q-64)." (spec L376). Q-64 (inbox/Q-64.answer.md). Done-criterion 37.
  const w = world(on)
  await w.start($)
  const running = Array.from({ length: 30 }, (_, i) => i + 31)
  await agents($, w, 60, running) // fixture: wk01 … wk30 finished, then 30 running rows, far more than a 16-line pane holds
  await w.pane($, SHORT)
  const { shown } = await view(w)
  const plus = shown.find((l) => PLUS_RUNNING.test(l.text))
  expect(!!plus, 'no +<k> running line:' + dump(shown)).toBe(true) // Q-64: the strip ends with +<k> running
  const k = Number(PLUS_RUNNING.exec(plus!.text)![1])
  const drawn = agentRows(shown).filter((r) => running.map(wk).includes(r.label)).length
  expect(drawn + k).toBe(30) // Q-64: k is the number of running rows not shown
  expect(shown.indexOf(plus!)).toBeGreaterThan(Math.max(...agentRows(shown).map((r) => r.i))) // its last line
})

// ================================================================== the scroll position holds (Q-65)

test('t15-scroll: when an agent row is added above the window top row, that row stays the window top row', async ($, on) => {
  // Requirement R-C16-35 (traceability.yaml): "When rows are added, the row at the top of the window stays at the top
  // (Q-65)." (spec L378); R-C16-13, R-C16-55. Q-65 (inbox/Q-65.answer.md): "the scroll position is anchored to the row
  // at the top of the window". Done-criterion 38.
  const w = world(on)
  await w.start($)
  await agents($, w, 40, [2]) // fixture: prime + 40 agents, wk02 running (so a row added under it is drawn at da5910c too)
  await w.pane($, SHORT)
  await pageDown($, w)
  const finished = (ls: Line[]) => windowRows(ls).filter((r) => r.label !== 'wk02' && r.label !== 'kid1') // the window's rows
  const top = finished((await view(w)).shown)[0].label
  await w.spawn($, 'kid1', 'wk02') // a running row added under wk02, above the window
  await w.redraw()
  expect(finished((await view(w)).shown)[0]?.label).toBe(top) // Q-65: the top row stays
})

// ================================================================== more lines (Q-66)

test('t15-scroll: with rows hidden below the window, a dim ↓ <k> more line is drawn at the list bottom', async ($, on) => {
  // Requirement R-C16-37 (traceability.yaml): "and `↓ <k> more` at the bottom show that k rows lie beyond that edge."
  // (spec L380); R-C16-14, R-C16-56. Q-66 (inbox/Q-66.answer.md). D-T15-more-count (display detail decided by the
  // planner under the standing ruling): "k ... is the number of rows beyond that edge that are not drawn. Rows drawn in a
  // pinned strip are not counted." Done-criterion 39.
  const w = world(on)
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 20)
  const { shown } = await view(w)
  const more = shown.find((l) => DOWN_MORE.test(l.text))
  expect(!!more, 'no ↓ more line:' + dump(shown)).toBe(true) // Q-66: rows lie below
  expect(more!.dim).toBe(true) // Q-66: a dim line
  const ar = agentRows(shown)
  expect(shown.indexOf(more!)).toBeGreaterThan(ar.at(-1)!.i) // at the list's bottom, after its rows
  const order = treeOrder(40)
  const drawn = new Set(ar.map((r) => r.label))
  const below = order.slice(order.indexOf(windowRows(shown).at(-1)!.label) + 1).filter((x) => !drawn.has(x)).length
  expect(Number(DOWN_MORE.exec(more!.text)![1])).toBe(below) // D-T15-more-count: the rows below not drawn
})

test('t15-scroll: with rows hidden above the window, a dim ↑ <k> more line is drawn at the list top', async ($, on) => {
  // Requirement R-C16-36 (traceability.yaml): "A dim `↑ <k> more` line at the top of the list" (spec L380); R-C16-14,
  // R-C16-56. Q-66 (inbox/Q-66.answer.md). D-T15-more-count: rows drawn in a pinned strip are not counted. Criterion 40.
  const w = world(on)
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 20)
  await pageDown($, w)
  const { shown } = await view(w)
  const more = shown.find((l) => UP_MORE.test(l.text))
  expect(!!more, 'no ↑ more line:' + dump(shown)).toBe(true) // Q-66: rows lie above
  expect(more!.dim).toBe(true) // Q-66: a dim line
  const ar = agentRows(shown)
  expect(shown.indexOf(more!)).toBeLessThan(ar[0].i) // at the list's top, before its rows
  const order = treeOrder(40)
  const drawn = new Set(ar.map((r) => r.label))
  const above = order.slice(0, order.indexOf(windowRows(shown)[0].label)).filter((x) => !drawn.has(x)).length
  expect(Number(UP_MORE.exec(more!.text)![1])).toBe(above) // D-T15-more-count: the rows above not drawn
})

test('guard: T15-G18 with no row hidden below the window, no ↓ more line is drawn', async ($, on) => {
  // Requirement R-C16-38 (traceability.yaml): "Each is drawn only when rows are hidden there." (spec L381). Q-66
  // (inbox/Q-66.answer.md). OQ7: a guard (done-criterion 41, false premise at da5910c: no more line is drawn at all).
  const w = world(on)
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 20)
  await end($, w) // the list at its bottom: the last row is drawn
  const { shown } = await view(w)
  expect(shown.filter((l) => DOWN_MORE.test(l.text)).map((l) => l.text)).toEqual([]) // L381: none below, no ↓ line
})

test('guard: T15-G19 with no row hidden above the window, no ↑ more line is drawn', async ($, on) => {
  // Requirement R-C16-38 (traceability.yaml): "Each is drawn only when rows are hidden there." (spec L381); plan verdict
  // r15 P3-3. Q-66 (inbox/Q-66.answer.md). OQ7: a guard (done-criterion 50: no more line is drawn at all at da5910c).
  const w = world(on)
  await w.start($)
  await agents($, w, 40)
  await w.pane($, 20) // the list at its top
  const { shown } = await view(w)
  expect(shown.filter((l) => UP_MORE.test(l.text)).map((l) => l.text)).toEqual([]) // L381: none above, no ↑ line
})

test('guard: T15-G20 with rows hidden above and a running row pinned above, the strip is drawn between the ↑ more line and the list rows', async ($, on) => {
  // Requirement R-C16-39 (traceability.yaml): "A pinned strip sits between it and the list (Q-66)." (spec L381-382).
  // Q-66 (inbox/Q-66.answer.md). OQ7: a guard (done-criterion 42, false premise at da5910c: neither the ↑ line nor a
  // strip is drawn there).
  const w = world(on)
  await w.start($)
  await agents($, w, 40, [1]) // fixture: wk01 runs, the rest finished
  await w.pane($, SHORT)
  await pageDown($, w)
  const { shown } = await view(w)
  const up = shown.findIndex((l) => UP_MORE.test(l.text))
  const pin = indexOf(shown, 'wk01')
  const win = windowRows(shown).filter((r) => r.label !== 'wk01')
  if (up >= 0 && pin >= 0) {
    expect(up).toBeLessThan(pin) // Q-66: the ↑ line, then
    expect(pin).toBeLessThan(win[0].i) // the pinned strip, then the list's rows
  }
})
