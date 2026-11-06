// claude plugin test — FX3 (run build-20261019T125436Z, phase P4): the pane's tables fit the width the pane is
// drawn at, and nothing a person reads is cut there.
//
// Written from the spec (docs/designs/v7.6-tuning.md L104-125 T8, L137-147 T10, L300-362 the T10 amendment,
// L157-167 T12) and the gap table of _orch/nodes/T20/work/coverage-of-spec.md (R-C8-03, R-C8-15, R-C10-04,
// R-C10-28, R-C10-90, R-C10-76, R-C12-01, R-C12-08) BEFORE the fix; nothing here is copied from the implementation.
//
// Why a model of the drawing: the testing kit hands back the element tree, "never a surface's paint (Ink's)"
// (claude-code/index.d.ts header). The live checks (LV8, LV10, LV12) saw the terminal cut every cell of a row with
// `…` when the row is wider than the pane body: each Text of a row Box is a flex item that shrinks in proportion to
// its width (Yoga flex-shrink 1, its basis its text width capped at the row's width), and a Text with
// `wrap: 'truncate-end'` drawn narrower than its text ends in `…`. A plain Button is drawn whole
// (`k: label`, or the label). A Box is a flex item too: its `width` (when given) is what it asks for, its
// `flexShrink` (1 when not given) whether it gives up room, and with `overflow: 'hidden'` nothing of its children
// is drawn past its width (the element props in claude-code/index.d.ts, Box). `drawRow` below lays a row out that
// way; the assertions read the cells it draws, never the table text. Checked against the live screens: before the fix, at a 106-column body this model draws a
// long summary row as `+ › #0-3…    …`, the shape LV12 saw (`+ › #16-19…    …`, LV12 screens/05-memory.txt), and at
// 90 a phase stepper as `◉─○○─○  ……`, the shape LV10 saw at 106 (`◉─○○─○  …`, LV10 screens/a3-08-settled.txt), and
// at 73 a returned sub-orchestrator's row as `d: ›  … sub-orch P1 sub-o……` (LV10 13-settled: `e: ›  … sub-orch P1 sub-……`).
//
// The widths the engine draws the pane body at (Claude Code 2.1.316, `bodyColumns`):
//   73  docked beside the transcript in a 165-column terminal (LV8 result.md §1, LV10 result.md header);
//   90  the widest docked body (verifier r2's probe of the 2.1.316 binary, _orch/verify/LV10-verdict.r2.json);
//   106 inline above the prompt in a 108-column terminal (LV10 attempt 3, LV12).
import { expect, mock, test } from 'claude-code/testing'

const SLOW = { timeoutMs: 30000 }
const DOCKED_165 = 73 // fixture: LV8/LV10, a 165-column terminal
const DOCKED_MAX = 90 // fixture: the widest docked pane body
const INLINE_108 = 106 // fixture: LV10 attempt 3 / LV12, a 108-column terminal
const WIDTHS = [DOCKED_165, DOCKED_MAX, INLINE_108]

// ---- a model of the terminal's drawing of one row ------------------------------------------------------------

const wide = (c: string) => c === '✅' || c === '❌' // the two glyphs the pane draws two cells wide
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
type Leaf = { kind: 'text' | 'button'; text: string; drawn: string; x: number; y?: number } // y: the line of a wrapping row (XTPW2)
const buttonText = (c: any) => {
  const p = c.props || {}
  const label = (c.children ?? []).length ? textOf(c.children) : String(p.label ?? '')
  return p.plain ? (p.hotkey ? p.hotkey + ': ' : '') + label : '[ ' + label + ' ]'
}
const kidsOf = (n: any): any[] => (n.children ?? []).filter((c: any) => c != null && c !== false)
/** Every Text and Button under a row, in order, with its text (a nested Box's leaves in place). */
function leavesOf(box: any): Leaf[] {
  const out: Leaf[] = []
  for (const c of kidsOf(box)) {
    if (typeof c === 'string') out.push({ kind: 'text', text: c, drawn: c, x: 0 })
    else if (c.type === 'Button') out.push({ kind: 'button', text: buttonText(c), drawn: buttonText(c), x: 0 })
    else if (c.type === 'Box') out.push(...leavesOf(c))
    else out.push({ kind: 'text', text: textOf(c), drawn: textOf(c), x: 0 })
  }
  return out
}
/** What an element asks for along a row, `avail` cells left: a Text its text (at most `avail`), a Button its text, a Box its `width` or its children's. */
function basisOf(c: any, avail: number): number {
  if (typeof c === 'string') return Math.min(cellW(c), avail)
  if (c.type === 'Button') return cellW(buttonText(c))
  if (c.type === 'Box') return typeof c.props?.width === 'number' ? c.props.width : kidsOf(c).reduce((n: number, k: any) => n + basisOf(k, avail), 0)
  return Math.min(cellW(textOf(c)), avail)
}
const shrinkOf = (c: any) => (typeof c === 'string' ? 1 : c.type === 'Button' ? 0 : c.type === 'Box' ? (c.props?.flexShrink ?? 1) : 1)
/**
 * A row of elements laid out `width` cells wide, from column `x0`: when they ask for more than `width`, each
 * shrinkable one gives up room in proportion to what it asks for (flex-shrink scaled by its basis), the edges
 * rounded to whole cells; a Text drawn narrower than its text is cut with `…` (truncate-end); a Box lays its own
 * children out in its width, and with `overflow: 'hidden'` draws nothing past it.
 */
function layout(kids: any[], width: number, x0: number, out: Leaf[]) {
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
      layout(kidsOf(c), w, x, inner)
      if (c.props?.overflow === 'hidden') {
        for (const l of inner) {
          const room = Math.max(0, x + w - l.x)
          if (cellW(l.drawn) > room) l.drawn = [...l.drawn].slice(0, room).join('')
        }
      }
      out.push(...inner)
    } else if (typeof c !== 'string' && c.type === 'Button') out.push({ kind: 'button', text: buttonText(c), drawn: buttonText(c), x })
    else {
      const t = typeof c === 'string' ? c : textOf(c)
      out.push({ kind: 'text', text: t, drawn: truncEnd(t, w), x })
    }
    x += w
  })
}
/**
 * One row Box as the terminal draws it `width` cells wide: each leaf's text, what is drawn of it, its column, and
 * its line. A row with `flexWrap: 'wrap'` is packed into lines first: an element starts a new line when what it asks
 * for does not fit what is left of the current one, and each line is laid out on its own. So the break Box, a Box
 * with a numeric `width` as wide as the row and `height: 0` (register.js segEl `Box({ width: y.brk, height: 0 })`),
 * takes a line of its own that has nothing on it and no screen rows, and the cells after it start the next line.
 * Amended in PW1 attempt 2 (Q-PW1-2, answered D-P7-3, node XTPW2): this model drew every row as one line, so a
 * two-line row's break was laid out as a cell the whole row wide and every cell after it shrunk to `…`, which is not
 * what the engine draws; the packing is pw1-fit.test.ts's drawRow. The assertions, fixtures and widths are unchanged.
 */
function drawRow(box: any, width: number): Leaf[] {
  const out: Leaf[] = []
  const kids = kidsOf(box)
  if (box.props?.flexWrap !== 'wrap') {
    layout(kids, width, 0, out)
    return out
  }
  const lines: any[][] = [[]]
  let used = 0
  for (const c of kids) {
    const b = basisOf(c, width)
    const cur = lines[lines.length - 1]!
    if (cur.length && used + b > width) {
      lines.push([c])
      used = b
    } else {
      used += b
      cur.push(c)
    }
  }
  lines.forEach((l, y) => {
    const ls: Leaf[] = []
    layout(l, width, 0, ls)
    for (const x of ls) out.push({ ...x, y })
  })
  return out
}
/** The drawn row: each leaf's drawn text at its column (a cell a leaf leaves blank is a space), its lines joined with ` ⏎ `; a line with nothing on it (a break's) is left out. */
const drawnLine = (ls: Leaf[]) => {
  const rows: string[] = []
  for (const l of ls) {
    let s = rows[l.y ?? 0] ?? ''
    if (cellW(s) < l.x) s += ' '.repeat(l.x - cellW(s))
    rows[l.y ?? 0] = s + l.drawn
  }
  return rows.filter((r) => r !== undefined).join(' ⏎ ')
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
const undrawn = (box: any) => leavesOf(box).map((l) => l.text).join('')

// ---- the agent table: its columns and a row's drawn cells ---------------------------------------------------

type Cell = { name: string; text: string; drawn: string; x: number }
/**
 * The table's columns from its header row (the row naming `agent`, `model` and `state`: one Text per column, its
 * title padded to the column and followed by the column's gap), and a body row's cells over those spans: each cell
 * the leaves after the row's leading `›` (or its pad) that cover the column's span of the table text, with what the
 * terminal draws for them at `width`.
 */
function tableOf(tree: any) {
  const boxes = rowBoxes(tree)
  // (state may be cut first, after the label, Q-11: the header is told by `agent`, `model` and `steps`)
  const head = boxes.find((b) => /\bagent\b/.test(undrawn(b)) && /\bmodel\b/.test(undrawn(b)) && /\bsteps\b/.test(undrawn(b)))
  if (!head) throw new Error('no header row: ' + JSON.stringify(boxes.map(undrawn)))
  const hs = leavesOf(head).slice(1) // the leading pad
  const seen = new Map<string, number>()
  const cols: { name: string; w: number }[] = []
  for (const h of hs) {
    const t = h.text.trim()
    // a blank leaf (a gap, or pad the drawing leaves out) belongs to the column before it
    if (!t && cols.length) {
      cols[cols.length - 1]!.w += cellW(h.text)
      continue
    }
    const k = (seen.get(t) ?? 0) + 1
    seen.set(t, k)
    cols.push({ name: k > 1 ? 'roll ' + t : t, w: cellW(h.text) })
  }
  return { boxes, cols }
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
    out.push({ name: c.name, text: parts.map((p) => p.text).join(''), drawn: parts.map((p) => p.drawn).join(''), x: parts[0] ? parts[0].x : -1 })
  }
  return out
}
const cell = (cs: Cell[], name: string) => {
  const c = cs.find((x) => x.name === name)
  if (!c) throw new Error('no column ' + name + ' in ' + JSON.stringify(cs.map((x) => x.name)))
  return c
}
const MARKS = /[●◉○✓✗]/g

// ---- the Work world: a prime before its first turn, P1 run by a sub-orchestrator with a worker, P2 not started ----

const MODEL = 'claude-opus-5-5' // fixture: the session's model, and every agent's
const MANIFEST = { run_id: 'build-20261102T090000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P1' } // fixture
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string }
// The sub-orchestrator of P1, matched to P1 by its spawn prompt (spec L320-321), and a worker it spawned.
const S1: Agent = { id: 's1', description: 'P1 sub-orch probe', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md' } // fixture
const W1: Agent = { id: 'w1', description: 'T1 worker probe', subagentType: 'baton:worker-cheap', prompt: 'Do node T1', parent: 's1' } // fixture

async function workWorld($: any, on: any) {
  const files: Record<string, string> = {
    '_orch/manifest.json': JSON.stringify(MANIFEST),
    '_orch/plan/graph.yaml': '- id: T1\n  phase: 1\n- id: T2\n  phase: 2\n',
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
  const clock = mock.clock(on)
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
  const byPrompt = new Map([S1, W1].map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ model: MODEL, agentId: byPrompt.get(e.prompt)?.id ?? e.prompt }))
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: MODEL, input_tokens: 4000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/work', surface: null } as any)
  await clock.advance(2000)
  await clock.settle()
  // The prime has had no turn of its own yet (LV8: the cut showed "until its first turn").
  for (const a of [S1, W1]) {
    await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
    const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: MODEL, messageCount: 1 } as any)
    for (let x = await g.next(); !x.done; x = await g.next());
  }
  // Both return, as in LV10's settled screens (13-settled, a3-08): a returned row's mark is drawn apart from its label.
  for (const a of [W1, S1]) await $.turn.complete({ agentId: a.id, answer: 'DONE · ok', isAborted: false } as any)
  await clock.advance(10)
  await clock.settle()
  return { clock }
}

async function workAt($: any, width: number) {
  await $.command.run({ command: 'baton', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: width, placement: width > 100 ? 'inline' : 'dock', scroll: { bodyRows: 60 } } as any })
  const tree = await ui.drawn()
  await ui.unmount() // the drawing is read from `tree`; the next width mounts afresh
  const { boxes, cols } = tableOf(tree)
  const row = (label: RegExp) => {
    const b = boxes.find((x) => label.test(undrawn(x)))
    if (!b) throw new Error('no row ' + label + ': ' + JSON.stringify(boxes.map(undrawn)))
    return { box: b, cells: cellsOf(b, cols, width), line: drawnLine(drawRow(b, width)) }
  }
  return { row }
}

// R-C8-03 · spec L112: "Widen the column so it is never cut," · R-C8-15 · spec L124: "A live check that the pane reads
// `opus 5.5` for the prime." (LV8: before the prime's first turn the drawn cell read `opus 5.…`.)
test('R-C8-03 R-C8-15: the prime row draws its model cell whole, opus 5.5, before its first turn, at every width the pane is drawn', SLOW, async ($, on) => {
  await workWorld($, on)
  for (const w of WIDTHS) {
    const { row } = await workAt($, w)
    const prime = row(/◆ prime/)
    const m = cell(prime.cells, 'model')
    expect(m.drawn.trim(), 'width ' + w + ': ' + prime.line).toBe('opus 5.5') // spec L111 "`opus 5.5`"; $.session.model() is claude-opus-5-5 (fixture)
    expect(m.drawn, 'width ' + w + ': ' + prime.line).not.toContain('…') // spec L112 "never cut"
  }
})

// R-C10-04 · spec L321-322: "The tree's nesting is the link between a phase and its sub-orchestrator." · L310: "then
// under each phase row the sub-orchestrator(s) that ran it" (LV10 §4: the indent was cut to `…`, the mark drawn at the
// phase's column).
test("R-C10-04: a sub-orchestrator's row is drawn one level under its phase's row, its indent whole, at every width the pane is drawn", SLOW, async ($, on) => {
  await workWorld($, on)
  for (const w of WIDTHS) {
    const { row } = await workAt($, w)
    const p1 = cell(row(/● P1\b/).cells, 'agent')
    const sub = row(/sub-orch P1 sub-orch probe|sub-orch P1/)
    const s = cell(sub.cells, 'agent')
    const markAt = (c: Cell) => c.x + [...c.drawn].findIndex((ch) => ch !== ' ')
    expect(s.drawn, 'width ' + w + ': ' + sub.line).toMatch(/^ {4}[●✓]/) // the indent of its level, then its mark (returned: ✓), nothing cut
    expect(markAt(s), 'width ' + w + ': ' + sub.line).toBe(markAt(p1) + 2) // one level (two cells) under P1's mark
    expect(s.drawn.slice(0, 6)).not.toContain('…')
  }
})

// R-C10-28 · spec L312-313: "A phase row is labelled `P<n>` and carries the phase's steps (briefed, dispatched,
// verified, approved)." (LV10 §6: at 106-108 columns the stepper drew three marks.)
test("R-C10-28: a phase row's stepper draws all four step marks at the widest docked width and at 106 columns", SLOW, async ($, on) => {
  await workWorld($, on)
  for (const w of [DOCKED_MAX, INLINE_108]) {
    const { row } = await workAt($, w)
    for (const label of [/● P1\b/, /○ P2\b/]) {
      const r = row(label)
      const st = cell(r.cells, 'steps')
      expect((st.drawn.match(MARKS) ?? []).length, 'width ' + w + ': ' + r.line).toBe(4) // briefed, dispatched, verified, approved
      expect(st.drawn.trim(), 'width ' + w + ': ' + r.line).toBe(st.text.trim()) // the stepper as the mod wrote it, nothing cut
    }
  }
})

// R-C10-90 · spec L341-345: "A row with no children leaves its roll-up group empty. A phase row is not an agent, so its
// this-agent group is empty ... A pending phase row has no children, so both of its groups are empty." · L362: "Plus a
// live check through cmux." (LV10 §10, §11: the empty cells were drawn as `…`.)
test('R-C10-90: empty this-agent and roll-up cells are drawn empty, never as …, at every width the pane is drawn', SLOW, async ($, on) => {
  await workWorld($, on)
  for (const w of WIDTHS) {
    const { row } = await workAt($, w)
    const blank = (r: { cells: Cell[]; line: string }, names: string[]) => {
      for (const n of names) {
        const c = cell(r.cells, n)
        expect(c.drawn, 'width ' + w + ' ' + n + ': ' + r.line).not.toContain('…')
        expect(c.drawn.trim(), 'width ' + w + ' ' + n + ': ' + r.line).toBe('')
      }
    }
    blank(row(/● P1\b/), ['cost', 'tokens']) // a phase row's this-agent group
    blank(row(/○ P2\b/), ['cost', 'tokens', 'roll cost', 'roll tokens']) // a pending phase: both groups
    blank(row(/T1 worker probe|worker-cheap/), ['roll cost', 'roll tokens']) // a row with no children: its roll-up
  }
})

// R-C10-76 · spec L348-349: "A pending phase row is dim, marked `○`, with `pending` in its state cell and the stepper
// with no step reached."
test('R-C10-76: a phase that has not started draws its stepper with no step reached, four empty marks', SLOW, async ($, on) => {
  await workWorld($, on)
  const { row } = await workAt($, 200)
  const p2 = row(/○ P2\b/)
  const st = cell(p2.cells, 'steps')
  const marks = st.drawn.match(MARKS) ?? []
  expect(marks.length, p2.line).toBe(4) // the phase ladder's four steps
  expect(marks.every((m) => m === '○'), p2.line).toBe(true) // no step reached
  expect(cell(p2.cells, 'state').drawn.trim()).toBe('pending')
})

// ---- the Memory world: summaries whose text is longer than the pane, and notes -----------------------------

const RUN = '/proj/run' // fixture
const SID = '5b2d9e10-7c4a-4f1e-8a3b-2c1d0e9f8a7b' // fixture
const NOW = Date.parse('2026-11-02T12:00:00Z') // fixture
const TAGS = ['build', 'verify', 'plan', 'probe', 'handoff', 'build', 'verify', 'plan'] // fixture
// amended by verifier (XTFX3D; R-C12-01, R-C12-08): the notes were stamped 2026-11-02T11:1x:00Z, but the pane's memory
// table takes its "now" from the real clock (register.js memTableCells/memTableHeader(shown, Date.now(), marks)) and
// memTime (lib/view.mjs) prints HH:MM for a note of today and `YYYY-MM-DD HH:MM` otherwise. From 2026-11-03 on the time
// column was 11 cells wider, the 73-column note rows lost "FX3 memory probe" and the row filter found no note row: the
// test depended on the day it ran. The notes are now stamped at 11:1x local time on the real clock's day at run time,
// so the time cell is HH:MM on any day, as on the day the test was written. NOW (the mock clock) stays as it was: the
// memory table never compares a note with it. No assertion changed.
const NOTE_DAY = new Date(Date.now()) // fixture: the real clock's day when the test runs
const ts = (i: number) => new Date(NOTE_DAY.getFullYear(), NOTE_DAY.getMonth(), NOTE_DAY.getDate(), 11, 10 + i).toISOString().replace(/\.\d{3}Z$/, 'Z')
const noteText = (i: number) => 'fixture note ' + i + ': FX3 memory probe' // fixture
const noteLine = (i: number) => '#' + i + ' ' + ts(i) + ' [' + TAGS[i] + '] ' + noteText(i)
// A summary's text is its children's text joined (LV12): longer than any pane.
const long = (lo: number, hi: number) => Array.from({ length: 12 }, (_, k) => 'fixture note ' + (lo + (k % (hi - lo + 1))) + ': FX3 memory probe, part ' + k).join(' | ')
type Tile = { level: number; index: number; lo: number; hi: number }
const WAKE: Tile[] = [{ level: 1, index: 0, lo: 0, hi: 4 }, { level: 1, index: 1, lo: 4, hi: 6 }, { level: 0, index: 6, lo: 6, hi: 7 }, { level: 0, index: 7, lo: 7, hi: 8 }]
const lineOf = (t: Tile) => (t.level === 0 ? noteLine(t.lo) : '#' + t.lo + '-' + (t.hi - 1) + ' (' + (t.hi - t.lo) + ' notes) ' + long(t.lo, t.hi - 1))

function memWorld(on: any) {
  const clock = mock.clock(on, { now: NOW })
  const files = new Map<string, string>()
  const m = { run_id: 'build-20261102T090000Z', mode: 'BUILD', target: 'x', prime: true, started_at: new Date(NOW - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(NOW).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m))
  const rel = (p: string) => {
    const s = String(p)
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
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: MODEL }))
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
    const argv = [...e.argv].map(String)
    let out: any = {}
    if (argv.includes('stats')) out = { notes: 8, summaries: 2, treeCapacity: 7, levels: 2, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake')) out = { header: 'memory: 8 notes', tiles: WAKE, lines: WAKE.map(lineOf) }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  mock.store(on)
  mock.env(on, {})
  mock.session(on)
  async function memoryAt($: any, width: number) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await clock.advance(2000)
    await clock.settle()
    await $.command.run({ command: 'baton', args: '' } as any)
    await clock.advance(1000)
    await clock.settle()
    const ui: any = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: width, placement: width > 100 ? 'inline' : 'dock', scroll: { bodyRows: 200 } } as any })
    await ui.press({ key: 'tab-memory' })
    await clock.advance(1000)
    await clock.settle()
    return ui
  }
  return { memoryAt }
}

// R-C12-01 · spec L161-162: "The memory explorer shows notes as a table with aligned columns: id, time, source, text,
// and the rest it already shows." · R-C12-08 · spec L166-167: "plus a live check through cmux." (LV12 §1: a summary
// row's id was drawn `#16-19…` and its text two columns left of the note rows' text.)
for (const w of WIDTHS) {
  test('R-C12-01 R-C12-08: summary rows start their text where note rows do, their id whole, at ' + w + ' columns', SLOW, async ($, on) => {
    const mw = memWorld(on)
    const ui = await mw.memoryAt($, w)
    const boxes = rowBoxes(await ui.drawn())
    const drawnOf = (b: any) => drawRow(b, w)
    const startOf = (ls: Leaf[], re: RegExp) => {
      const line = drawnLine(ls)
      const m = re.exec(line)
      return m ? m.index + (m[0].length - m[0].trimStart().length) : -1
    }
    const head = boxes.find((b) => /\bid\b/.test(undrawn(b)) && /\bsource\b/.test(undrawn(b)) && /\btext\b/.test(undrawn(b)))
    expect(head, 'the memory table header').toBeTruthy()
    const textCol = startOf(drawnOf(head), /\btext\b/)
    const notes = boxes.filter((b) => /#[67] /.test(undrawn(b)) && undrawn(b).includes('FX3 memory probe'))
    const sums = boxes.filter((b) => /#\d+-\d+/.test(undrawn(b)))
    expect(notes.length, 'note rows #6 and #7').toBe(2)
    expect(sums.length, 'summary rows #0-3 and #4-5').toBe(2)
    for (const b of notes) expect(startOf(drawnOf(b), /fixture note/), drawnLine(drawnOf(b))).toBe(textCol)
    for (const b of sums) {
      const ls = drawnOf(b)
      const line = drawnLine(ls)
      expect(startOf(ls, /\(\d+ notes\)/), line).toBe(textCol) // the text column is one column, summaries too
      const id = /#\d+-\d+/.exec(undrawn(b))![0]
      const idLeaf = ls.find((l) => l.text.trim() === id)
      expect(idLeaf, 'the id cell of ' + id + ': ' + line).toBeTruthy()
      expect(idLeaf!.drawn.trim(), line).toBe(id) // the summary's id whole (D-F112: the id is shown whole)
      expect(idLeaf!.drawn, line).not.toContain('…')
      const at = ls.indexOf(idLeaf!)
      expect(ls[at + 1]!.drawn, 'the mark cell: ' + line).not.toContain('…') // a summary has no mark: an empty cell
    }
  })
}
