// claude plugin test — T9: every pane row has a key (C9).
//
// Written from the spec (docs/designs/v7.6-tuning.md L126-136) and the operator's answers BEFORE the
// implementation (node T19, the red step of F19). Requirement ids are the rows of
// _orch/plan/traceability.yaml (cluster C9: R-C9-01 own key, R-C9-02 focus-and-Enter, R-C9-03 shown the
// same way, R-C9-04 a plugin test per row kind). Expected values come from the spec, the inbox answers
// (OQ6, OQ7, Q-12, Q-32's decided default, Q-39, Q-54, Q-60 as settled, Q-67) and from T19's
// work/key-scheme.md and work/missing.md; none is copied from the implementation.
//
// Tests named `guard: ...` (G1-G9) are preservation guards (OQ7: "Enter-to-open on rows that already open ...
// gets guard tests, named guard:..., that pass now and at every later commit"), classed in T19's
// work/guard-evidence.md. Every other test must fail at the run tip da5910c, by its own assertion.
//
// Ownership (hazard H28): these tests read only the key cell of a row (the Button that opens it, its
// `hotkey`, its `plain`) and the accent of the key glyphs; never a whole rendered row string. A phase
// row is found by its `P<n>` label, never by its place in a plan section (the T10 amendment, L248-275,
// removes that section and its plan row); a test that opens a phase row checks that a view opened, not
// which one (Q-54 settles that, C10 pins it).
//
// The world: the engine beneath the mod answers from memory (as mod/tests/interface.test.ts does): a
// prime manifest naming this session in `prime_session`, a plan whose graph.yaml puts one node in each
// phase, a brief per phase, and agents spawned by the prime with descriptions that name no phase (so
// they are unphased rows, directly under the prime after the phase rows: D-P1-tree-unphased).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
// Q-12 (inbox/Q-12.answer.md, OQ6 part 2) and spec L387-390: the 22-letter pool, in its order.
const POOL = 'a c d e f g h i j k l m n o q s t u v w y z'.split(' ')
// Q-32's decided default (_orch/plan/decisions.md § Q-32): ↑/↓, Enter and `+` are drawn "in the same accent
// style as `1`, `2` and `r` (`#99CCFF`, E1 §k)".
const ACCENT = '#99CCFF'

type Opts = { phases?: number[]; agents?: string[]; memory?: boolean }

function world(on: any, o: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  /** The plan: one node per phase in graph.yaml, a directory and a brief per phase. */
  const setPhases = (ps: number[]) => {
    files.set('_orch/plan/graph.yaml', ps.map((n) => '- id: N' + n + '\n  phase: ' + n + '\n').join(''))
    dirs.set('_orch/phases', ps.map((n) => ({ name: 'P' + n, kind: 'dir' })))
    for (const n of ps) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  }
  setPhases(o.phases ?? [1, 2, 3])
  // The engine hands the mod absolute paths under the plugin's folder; the fixture is keyed from the last `_orch/` on
  // (the folder itself may sit under another `_orch/`, as a baton worktree does).
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
    const v = dirs.get(rel(e.path))
    return v ? { value: v } : { deny: 'no such directory' }
  })
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
  // The memory CLI: with `memory`, the wake view holds one summary block (level 1, so it has a `+`) and one note.
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv.includes('stats')) out = o.memory ? { notes: 9, summaries: 1, treeCapacity: 1, levels: 2, pending: 0, ready: 0 } : { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom'))
      out = o.memory ? { header: 'h', tiles: [{ level: 1, lo: 0, hi: 8 }, { level: 0, lo: 8, hi: 9 }], lines: ['#0-7 (8 notes) bootstrap, cast, plan', '#8 2026-10-19T13:00:00Z [prime] P1 dispatched'] } : { header: 'h', tiles: [], lines: [] }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  on('agent.spawn', (_$: any, e: any) => ({ agentId: 'a-' + String(e.description).replace(/\W+/g, '-'), model: 'claude-opus-5-5' }))
  mock.store(on)
  mock.env(on, {})
  mock.session(on)

  async function settle(ms: number) {
    await clock.advance(ms)
    await clock.settle()
  }
  async function spawn($: any, description: string) {
    await $.agent.spawn({ prompt: 'do the work', description, subagentType: 'baton:worker' } as any)
    await settle(10)
  }
  /** Start the session, spawn the agents, and open the pane with a window taller than every row (no scrolling). */
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    for (const d of o.agents ?? []) await spawn($, d)
    await settle(61000) // past the mod's own re-read interval, so the pane reads the plan as it now stands
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } } as any })
  }
  return { clock, settle, spawn, pane, setPhases, files, dirs }
}

// ------------------------------------------------------------------ reading the drawn tree

type Row = { texts: string[]; text: string; buttons: any[] }

const strings = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(strings).join('')
  if (n.type === 'Button') return '' // a Button's label is its control, not the row's text
  return (n.children || []).map(strings).join('')
}

/** Every Box laid out as a row: the text its Text nodes show, and the Buttons inside it. */
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
      const text = strings(n)
      out.push({ texts: [text], text, buttons })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}

const labelOf = (b: any) => String((b.props && b.props.label) ?? strings(b.children) ?? '')
const isMessage = (b: any) => labelOf(b).includes('✉') // ✉ messages a running agent; it opens nothing
const openers = (r: Row) => r.buttons.filter((b) => !isMessage(b))

/** The innermost row whose text matches `re` and that holds a Button opening it. */
function rowOf(tree: any, re: RegExp): Row | undefined {
  const hits = rowBoxes(tree).filter((r) => re.test(r.text) && openers(r).length > 0)
  hits.sort((a, b) => a.buttons.length - b.buttons.length)
  return hits[0]
}

/** The row's direct key: the pool letter a Button in it carries as `hotkey`, if any. */
const letterOf = (r: Row | undefined): string | undefined => {
  if (!r) return undefined
  const b = r.buttons.find((x) => POOL.includes(String(x.props && x.props.hotkey)))
  return b ? String(b.props.hotkey) : undefined
}

/** The Button focus-and-Enter acts on in that row: its `›` (OQ7: "Enter-to-open on rows that already open"). */
const enterButton = (r: Row) => openers(r).find((b) => labelOf(b).includes('›')) ?? openers(r)[0]

const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? labelOf(b))

/** Every Button drawn with a `hotkey`, in document order. */
async function hotkeyButtons(ui: any) {
  return (await ui.findAll({ type: 'Button' })).filter((b: any) => typeof b.props.hotkey === 'string')
}

/** A view is open: its `‹ back` (hotkey `b`, "b goes back", E1 §k k-05/k-08) is drawn. */
async function viewIsOpen(ui: any) {
  return (await hotkeyButtons(ui)).some((b: any) => b.props.hotkey === 'b')
}

async function shownText(ui: any) {
  return strings(await ui.drawn())
}

/** Agent labels, unphased (their descriptions name no P<n>). */
const AGENTS = ['alpha worker', 'beta worker', 'gamma worker'] // fixture
const phaseRe = (n: number) => new RegExp('(^|[^A-Za-z0-9])P' + n + '([^0-9]|$)') // spec L259: "That row is labelled P<n>"

// ================================================================== guards (OQ7)

test('guard: G1 an agent row that opens by focus and Enter on its › still opens that way', async ($, on) => {
  // Requirement R-C9-02 (traceability.yaml): "or by a focus-and-Enter scheme." (spec L131)
  // OQ7 (inbox/OQ7.answer.md): "Enter-to-open on rows that already open ... gets guard tests, named guard:…".
  // E1 §k: "agent: prime, sub-orch, worker, verifier, nested | yes | yes, F17 worker view" (register.js ~1462-1463).
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const row = rowOf(await ui.drawn(), /beta worker/)
  expect(!!row).toBe(true) // fixture: the beta worker row is drawn with a Button that opens it
  await ui.press({ key: keyOf(enterButton(row!)) })
  expect(await viewIsOpen(ui)).toBe(true) // E1 §k: Enter "opens it" (k-07-enter-F17.txt)
  const t = await shownText(ui)
  expect(t).toContain('beta worker') // E1 §k k-07: the agent's view names it ("in the tree prime › F17 worker probe")
  expect(t.includes('alpha worker') || t.includes('gamma worker')).toBe(false) // it is that row's view, not another agent's
})

test('guard: G2 a phase row, found by its P<n> label, still opens a view by focus and Enter', async ($, on) => {
  // Requirement R-C9-02 (traceability.yaml): "or by a focus-and-Enter scheme." (spec L131)
  // OQ7 (inbox/OQ7.answer.md): "Enter-to-open on rows that already open". E1 §k: "phase (P1, P2) | yes | yes:
  // "P1 · verified · steps … the brief · its envelope"" (register.js ~1241, k-04-enter-P1.txt).
  // Which view opens is Q-54's (C10's, T110); this guard checks only that one opens.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const row = rowOf(await ui.drawn(), phaseRe(2))
  expect(!!row).toBe(true) // fixture: phases P1-P3 are planned, so a row labelled P2 is drawn
  expect(await viewIsOpen(ui)).toBe(false) // the Work list, no view open yet
  await ui.press({ key: keyOf(enterButton(row!)) })
  expect(await viewIsOpen(ui)).toBe(true) // E1 §k k-04: Enter on P1's › opened a view
  expect(phaseRe(2).test(await shownText(ui))).toBe(true) // the view opened from the P2 row is about P2
})

test('guard: G3 1, 2 and r keep the actions they have at da5910c', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ7 (inbox/OQ7.answer.md): behaviour that already works gets guard tests. E1 §k reserved table:
  // "`1` | :111 (TABS) via :2935 | Work tab", "`2` | :112 via :2935 | Memory tab", "`r` | :2946 | refresh pane".
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const press = async (k: string) => {
    const b = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === k)
    expect(b ? b.props.hotkey : 'no Button with hotkey ' + k).toBe(k) // E1 §k: the pane binds 1, 2 and r
    await ui.press({ key: keyOf(b) })
  }
  await press('2')
  expect(/rulings/.test(await shownText(ui))).toBe(true) // E1 §k: `2` is the Memory tab, which lists the rulings (interface.test.ts draws /rulings/ there)
  await press('1')
  expect(!!rowOf(await ui.drawn(), /alpha worker/)).toBe(true) // E1 §k: `1` is the Work tab, where the agent rows are
  // `r` re-reads: a phase planned after the pane drew shows once r is pressed.
  expect(phaseRe(4).test(await shownText(ui))).toBe(false) // fixture: P4 is not planned yet
  w.setPhases([1, 2, 3, 4])
  await w.settle(61000)
  await press('r')
  await w.settle(1000)
  expect(!!rowOf(await ui.drawn(), phaseRe(4))).toBe(true) // E1 §k: `r` refreshes the pane
})

test('guard: G4 b is shown on an opened view as 1, 2 and r are, and leaves it', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ7 (inbox/OQ7.answer.md): "`b` drill-out" works today. E1 §k: "03 [s3:│b][s4:: ‹ back  ]... ← in a detail view b
  // and r are highlighted"; "`b` leaves a phase view (k-05-after-b.txt) and an agent view (k-08-agent-after-b.txt)".
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const one = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === '1')
  await ui.press({ key: keyOf(enterButton(rowOf(await ui.drawn(), /alpha worker/)!)) })
  const back = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === 'b')
  expect(back ? { hotkey: back.props.hotkey, plain: back.props.plain } : null).toEqual({ hotkey: 'b', plain: one.props.plain }) // E1 §k line 03: b drawn as 1 is (plain, accent hotkey)
  await ui.press({ key: keyOf(back) })
  expect(await viewIsOpen(ui)).toBe(false) // E1 §k k-08: b went back to the Work list
  expect(!!rowOf(await ui.drawn(), /alpha worker/)).toBe(true) // the agent rows are drawn again
})

// ================================================================== OQ6 part 1: the focus keys are shown (work/missing.md)

/** Every Text drawn in the accent, not dim, whose own text (trimmed) is `glyph`. */
async function accentGlyphs(ui: any, glyph: string) {
  return (await ui.findAll({ type: 'Text' })).filter((t: any) => String(t.text).trim() === glyph && t.props.color === ACCENT && !t.props.dimColor)
}

test('missing #1: the Work tab shows ↑/↓ the way 1, 2 and r are shown (the accent)', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ6 part 1 (inbox/OQ6.answer.md): "show the keys (↑/↓, Enter, `b`, `+`) the way `1`, `2` and `r` are shown".
  // E1 §k line 19: "↑/↓, Enter, b only in dim (#999999) hint text". Q-32's default: the accent `#99CCFF`, in the hint line.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const both = (await accentGlyphs(ui, '↑/↓')).length + Math.min((await accentGlyphs(ui, '↑')).length, (await accentGlyphs(ui, '↓')).length)
  expect(both > 0, 'item 1: ↑/↓ in the accent #99CCFF').toBe(true) // Q-32: ↑/↓ drawn in the accent #99CCFF, not dim
})

test('missing #2: the Work tab shows Enter the way 1, 2 and r are shown (the accent)', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ6 part 1 (inbox/OQ6.answer.md): "show the keys (↑/↓, Enter, `b`, `+`) the way `1`, `2` and `r` are shown".
  // E1 §k line 19: "↑/↓, Enter, b only in dim (#999999) hint text". Q-32's default: the accent `#99CCFF`.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  expect((await accentGlyphs(ui, 'Enter')).length > 0, 'item 2: Enter in the accent #99CCFF').toBe(true) // Q-32: Enter drawn in the accent #99CCFF, not dim
})

test('missing #3: the Work tab hint shows b the way 1, 2 and r are shown (the accent)', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ6 part 1 (inbox/OQ6.answer.md): "show the keys (↑/↓, Enter, `b`, `+`) the way `1`, `2` and `r` are shown".
  // E1 §k line 19: the Work hint "b goes back" is "only in dim (#999999) hint text"; on an opened view b is already
  // shown (guard G4), so this pins the Work tab's mention of it, in the hint line Q-32 keeps.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  expect((await accentGlyphs(ui, 'b')).length > 0, 'item 3: b in the accent #99CCFF').toBe(true) // OQ6 part 1 with Q-32's accent #99CCFF: b in the accent, not dim
})

test('missing #4: the Memory tab shows + the way 1, 2 and r are shown (the accent)', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ6 part 1 (inbox/OQ6.answer.md): "show the keys (↑/↓, Enter, `b`, `+`) the way `1`, `2` and `r` are shown".
  // E1 §k line 12: "Memory: + drawn plain, not highlighted". Q-32's default: "next to the › and + they act on", in the accent.
  const w = world(on, { agents: AGENTS, memory: true })
  const ui: any = await w.pane($)
  await ui.press({ key: 'tab-memory' })
  await w.settle(1000)
  expect(/#0-7/.test(await shownText(ui)), 'fixture: the summary block #0-7 is drawn').toBe(true) // fixture: the summary block #0-7 (level 1, so it drills with +) is drawn
  expect((await accentGlyphs(ui, '+')).length > 0, 'item 4: + in the accent #99CCFF').toBe(true) // Q-32: + drawn in the accent #99CCFF, not plain
})

// ================================================================== OQ6 part 2: a direct key per row (work/key-scheme.md)

// work/key-scheme.md, "The letters of the fixture": tree order prime, P1, P2, P3, then the agent rows (Q-12, Q-60 as
// settled, spec L387), letters from the pool in order.
const PRIME_KEY = 'a' // key-scheme.md: the prime is first in tree order, so the pool's first letter (Q-12, L387)
const PHASE_KEYS: Record<number, string> = { 1: 'c', 2: 'd', 3: 'e' } // key-scheme.md: P1-P3 follow the prime (Q-60, L387)
const AGENT_KEYS: Record<string, string> = { 'alpha worker': 'f', 'beta worker': 'g', 'gamma worker': 'h' } // key-scheme.md: the agent rows follow the phase rows (L387, D-P1-tree-unphased)

test('direct keys: the prime row and each of three agent rows open by the letter key-scheme.md gives them', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "Every navigable row (agent, plan, phase) can be opened from the keyboard, by its own key" (spec L131)
  // OQ6 part 2 (inbox/OQ6.answer.md): "Also give each row a direct hotkey of its own (agent, plan and phase rows), shown the same way."
  // Q-12 (inbox/Q-12.answer.md): "A: positional letters, top-down." Spec L387: "Letters are first given top to bottom in tree order".
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const got: Record<string, string | undefined> = { prime: letterOf(rowOf(tree, /prime/)) }
  for (const a of AGENTS) got[a] = letterOf(rowOf(tree, new RegExp(a)))
  expect(got).toEqual({ prime: PRIME_KEY, ...AGENT_KEYS }) // key-scheme.md: prime a, then f, g, h
  for (const a of AGENTS) {
    const b = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === AGENT_KEYS[a])
    await ui.press({ key: keyOf(b) }) // the press a hotkey raises (types: ButtonProps.hotkey "presses it")
    expect(await viewIsOpen(ui)).toBe(true) // the key opens the row's view (spec L131)
    const t = await shownText(ui)
    expect(AGENTS.filter((x) => t.includes(x))).toEqual([a]) // the view of that row and of no other agent
    await ui.press({ key: keyOf((await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === 'b')) })
  }
})

test('direct keys: each of the phase rows P1-P3, found by its label, opens a view by the letter key-scheme.md gives it', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "Every navigable row (agent, plan, phase) can be opened from the keyboard, by its own key" (spec L131)
  // OQ6 part 2 (inbox/OQ6.answer.md): "Also give each row a direct hotkey of its own (agent, plan and phase rows), shown the same way."
  // Spec L387: "the prime, the phase rows (pending ones included), then sub-orchestrator and agent rows". Which view
  // opens is Q-54's (C10, T110): only that a view opens, from that phase's row, is checked.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const got: Record<number, string | undefined> = {}
  for (const n of [1, 2, 3]) got[n] = letterOf(rowOf(tree, phaseRe(n)))
  expect(got).toEqual(PHASE_KEYS) // key-scheme.md: P1 c, P2 d, P3 e
  for (const n of [1, 2, 3]) {
    const b = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === PHASE_KEYS[n])
    await ui.press({ key: keyOf(b) })
    expect(await viewIsOpen(ui)).toBe(true) // the key opens a view (spec L131)
    const t = await shownText(ui)
    expect(phaseRe(n).test(t)).toBe(true) // opened from that phase's row: its view is about P<n>
    await ui.press({ key: keyOf((await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === 'b')) })
  }
})

// The behaviours of done-criteria 18, 19, 46 (keeping a letter), 47 (the 23rd has none) and 48 already hold at
// da5910c, vacuously or in fact: no row has a letter there (work/probe-da5910c.md P-3), so no two rows share one, none is
// drawn unlike `1`, none can change, the 23rd has none, and every row opens by focus and Enter. A red test for them could
// fail only through another criterion's precondition (P2 directive-common.md, "Red-test nodes": "never only through
// another criterion's precondition"), so they are preservation guards (OQ7), classed in work/guard-evidence.md
// (G5-G9) and reported as false-premise in T19's envelope. The parts that do fail at da5910c by their own assertion
// (a later row's lowest free letter; the first 22 rows' letters) are ordinary red tests after them.

test('guard: G5 with the prime, three phase rows and three agent rows shown, no two rows share a direct key', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "can be opened from the keyboard, by its own key" (spec L131)
  // OQ6 part 2 (inbox/OQ6.answer.md): "give each row a direct hotkey of its own". Engine (types ButtonProps.hotkey,
  // E1 §k): "two clash, later wins", so a shared key would open only one row. Done-criterion 18.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const labels = [/prime/, phaseRe(1), phaseRe(2), phaseRe(3), ...AGENTS.map((a) => new RegExp(a))]
  expect(labels.map((re) => !!rowOf(tree, re))).toEqual([true, true, true, true, true, true, true]) // fixture: all 7 rows are shown at once
  const letters = labels.map((re) => letterOf(rowOf(tree, re))).filter((x) => x !== undefined)
  expect(letters.length).toBe(new Set(letters).size) // OQ6 part 2: a key of its own, so no two rows share one
  const all = (await hotkeyButtons(ui)).map((b: any) => String(b.props.hotkey))
  expect(all.length).toBe(new Set(all).size) // and no row key is also another Button's key in the pane ("two clash, later wins")
})

test('guard: G6 every direct row key is shown the way 1, 2 and r are shown', async ($, on) => {
  // Requirement R-C9-03 (traceability.yaml): "Those keys are shown the same way the existing `1`, `2` and `r` are shown." (spec L133)
  // OQ6 part 2 (inbox/OQ6.answer.md): "a direct hotkey of its own ..., shown the same way". E1 §k: 1, 2 and r are
  // plain Buttons whose `hotkey` the engine draws in the accent (style #99CCFF); types ButtonProps.plain: "the hotkey in
  // the accent color, a colon, the label". Done-criterion 19.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const hk = await hotkeyButtons(ui)
  const one = hk.find((b: any) => b.props.hotkey === '1')
  expect(one ? one.props.plain : 'no `1`').toBe(true) // E1 §k / P-3: `1` is a plain hotkey Button (tab-work=1:plain)
  const rows = hk.filter((b: any) => POOL.includes(String(b.props.hotkey)))
  expect(rows.filter((b: any) => b.props.plain !== one.props.plain).map((b: any) => b.props.hotkey)).toEqual([]) // each drawn as `1` is: plain, the hotkey in the accent
})

test('guard: G7 a row keeps its letter when a row above it is added', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "can be opened from the keyboard, by its own key" (spec L131)
  // Q-67 (inbox/Q-67.answer.md): "hotkey letters are fixed per row for as long as the row exists". Q-12
  // (inbox/Q-12.answer.md): positional letters, top-down. Spec L263/L387: phase rows (pending ones included) come
  // before the agent rows, so a phase planned later is a row added above the agent rows. Done-criterion 46.
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  const first = await ui.drawn()
  const before = AGENTS.map((a) => letterOf(rowOf(first, new RegExp(a))))
  w.setPhases([1, 2, 3, 4]) // P4 is planned: its row is drawn among the phase rows, above the agent rows
  await w.settle(61000)
  await ui.press({ key: 'refresh' })
  await w.settle(1000)
  const tree = await ui.drawn()
  expect(!!rowOf(tree, phaseRe(4))).toBe(true) // fixture: the added P4 row is drawn
  expect(AGENTS.map((a) => letterOf(rowOf(tree, new RegExp(a))))).toEqual(before) // Q-67: each agent row keeps the letter it had
})

test('direct keys: a row added after the pane first drew takes the lowest free letter', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "can be opened from the keyboard, by its own key" (spec L131)
  // D-T15-letters-pool (display detail decided by the planner under the standing ruling): "A row added later takes the
  // lowest letter no other row holds." Spec L389: "A row added later takes the lowest free letter of the 22-letter pool."
  // Q-67 (inbox/Q-67.answer.md): the rows already shown keep theirs (a c d e f g h, key-scheme.md).
  const w = world(on, { agents: AGENTS })
  const ui: any = await w.pane($)
  w.setPhases([1, 2, 3, 4]) // P4 is planned after the first draw
  await w.settle(61000)
  await ui.press({ key: 'refresh' })
  await w.settle(1000)
  expect(letterOf(rowOf(await ui.drawn(), phaseRe(4)))).toBe('i') // key-scheme.md rule 3: a c d e f g h are held, so i
})

// 22 lettered rows and one more: the prime, P1-P3 and 19 agents, in tree order (L387).
const MANY = Array.from({ length: 19 }, (_, i) => 'w' + String(i + 1).padStart(2, '0') + ' worker') // fixture
const ORDER = [/prime/, phaseRe(1), phaseRe(2), phaseRe(3), ...MANY.map((a) => new RegExp(a))] // tree order (L387, D-P1-tree-unphased)

test('direct keys: in a pane showing 23 lettered rows when it first draws, the first 22 in tree order hold the pool letters in order', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "can be opened from the keyboard, by its own key" (spec L131)
  // Q-12 (inbox/Q-12.answer.md): "A: positional letters, top-down", from `a c d e f g h i j k l m n o q s t u v w y z`.
  // Spec L387: "Letters are first given top to bottom in tree order". D-T15-letters-pool: when the pane first draws.
  const w = world(on, { agents: MANY })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  expect(ORDER.slice(0, 22).map((re) => letterOf(rowOf(tree, re)))).toEqual(POOL) // key-scheme.md rule 1: rows 1-22 hold the pool, in order
})

test('guard: G8 in a pane showing 23 lettered rows when it first draws, the 23rd in tree order has no direct key', async ($, on) => {
  // Requirement R-C9-01 (traceability.yaml): "can be opened from the keyboard, by its own key" (spec L131)
  // Q-12 (inbox/Q-12.answer.md) via its question: "rows past the 22nd have no direct key and open by focus and Enter";
  // spec L389-390: "Once every letter is taken, a row has no direct key and opens by focus and Enter (Q-12)."
  // D-T15-letters-pool: letters go top to bottom in tree order when the pane first draws. Done-criterion 47.
  const w = world(on, { agents: MANY })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  expect(!!rowOf(tree, ORDER[22]!)).toBe(true) // fixture: the 23rd row (w19 worker) is drawn
  expect(letterOf(rowOf(tree, ORDER[22]!))).toBe(undefined) // the 23rd has no direct key (Q-12, L389)
})

test('guard: G9 in that pane, the 23rd lettered row opens by focus and Enter', async ($, on) => {
  // Requirement R-C9-02 (traceability.yaml): "or by a focus-and-Enter scheme." (spec L131)
  // Q-12 (inbox/Q-12.answer.md) via its question: "rows past the 22nd have no direct key and open by focus and Enter";
  // spec L389-390: "Once every letter is taken, a row has no direct key and opens by focus and Enter (Q-12)."
  // Done-criterion 48.
  const w = world(on, { agents: MANY })
  const ui: any = await w.pane($)
  const last = rowOf(await ui.drawn(), /w19 worker/)
  expect(!!last).toBe(true) // fixture: the 23rd row is drawn (the window is taller than the list)
  await ui.press({ key: keyOf(enterButton(last!)) })
  expect(await viewIsOpen(ui)).toBe(true) // focus and Enter opens it (Q-12, L390)
  expect(await shownText(ui)).toContain('w19 worker') // its own view
})
