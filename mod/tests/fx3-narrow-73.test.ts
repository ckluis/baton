// claude plugin test — FX3 attempt 3 (run build-20261019T125436Z, phase P4): at 73 columns, the pane body docked in a
// 165-column terminal, nothing in the tree is cut, with the deepest tree and the widest effort-marked model cells.
//
// Written from the spec (docs/designs/v7.6-tuning.md L112 "Widen the column so it is never cut", L341-349 the T10
// amendment's cells and stepper, L620-640 T8E: every agent row's model cell carries its effort, `opus 5.5 · high cfg`)
// and from the FX3 verifier's refutations (_orch/verify/R-C8-03-verdict.json, R-C10-28-verdict.json,
// R-C10-90-verdict.json, probe _orch/verify/FX3-probe/output.txt) BEFORE the fix; nothing is copied from the
// implementation. Fixtures follow that probe: P1 > sub-orchestrator > worker with a configured high effort on each,
// and P1 > sub-orchestrator (opus 5.5 · high cfg) > worker (sonnet 5.5 · medium cfg) > verifier (sonnet 5.5 · medium cfg),
// each with its agents returned and still running (a running row carries its ` ✉`).
//
// The drawing is read through a model of the terminal's layout, as mod/tests/fx3-drawn-width.test.ts reads it (each
// Text a flex item that shrinks in proportion to its width when a row asks for more than the pane body, cut with `…`;
// a plain Button whole; a Box by its width, flexShrink and overflow), plus `flexWrap: 'wrap'` (the Box prop in
// claude-code/index.d.ts): a wrapping row puts each child on the current line while it fits and starts a new line for
// the one that does not, so its children are laid out line by line and shrink only when one alone is wider than the
// pane. The assertions read the drawn cells, never the table text.
import { expect, mock, test } from 'claude-code/testing'

const SLOW = { timeoutMs: 60000 }
const DOCKED_165 = 73 // fixture: the pane body docked in a 165-column terminal (LV8, LV10; FX3 screens/A1)

// ---- a model of the terminal's drawing ----------------------------------------------------------------------

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
type Leaf = { kind: 'text' | 'button'; text: string; drawn: string; x: number; y: number }
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
      out.push({ kind: 'text', text: t, drawn: truncEnd(t, w), x, y })
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
/** The drawn lines of a row (each leaf at its column, on its line). */
const drawnLines = (ls: Leaf[]) => {
  const rows: string[] = []
  for (const l of ls) {
    let s = rows[l.y] ?? ''
    if (cellW(s) < l.x) s += ' '.repeat(l.x - cellW(s))
    rows[l.y] = s + l.drawn
  }
  return rows.map((r) => r ?? '')
}
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

// ---- the agent table's columns, and a row's drawn cells -----------------------------------------------------

type Cell = { name: string; text: string; drawn: string; x: number; y: number }
function tableOf(tree: any) {
  const boxes = rowBoxes(tree)
  const head = boxes.find((b) => /\bagent\b/.test(undrawn(b)) && /\bmodel\b/.test(undrawn(b)) && /\bsteps\b/.test(undrawn(b)))
  if (!head) throw new Error('no header row: ' + JSON.stringify(boxes.map(undrawn)))
  const seen = new Map<string, number>()
  const cols: { name: string; w: number }[] = []
  for (const h of leavesOf(head).slice(1)) {
    const t = h.text.trim()
    if (!t && cols.length) {
      cols[cols.length - 1]!.w += cellW(h.text) // a blank leaf (a gap, a pad) belongs to the column before it
      continue
    }
    const k = (seen.get(t) ?? 0) + 1
    seen.set(t, k)
    cols.push({ name: k > 1 ? 'roll ' + t : t, w: cellW(h.text) })
  }
  return { boxes, cols, head }
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
    out.push({ name: c.name, text: parts.map((p) => p.text).join(''), drawn: parts.map((p) => p.drawn).join(''), x: parts[0] ? parts[0].x : -1, y: parts[0] ? parts[0].y : -1 })
  }
  return out
}
const cell = (cs: Cell[], name: string) => {
  const c = cs.find((x) => x.name === name)
  if (!c) throw new Error('no column ' + name + ' in ' + JSON.stringify(cs.map((x) => x.name)))
  return c
}
const MARKS = /[●◉○✓✗]/g

// ---- the world ------------------------------------------------------------------------------------------------

const OPUS = 'claude-opus-5-5' // fixture
const SONNET = 'claude-sonnet-5-5' // fixture
const MANIFEST = { run_id: 'build-20261102T090000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P1' } // fixture
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; model: string; effort: string; done: boolean }
// P1 > sub-orchestrator > worker, each opus 5.5 with a configured high effort (`opus 5.5 · high cfg`)
const highTree = (done: boolean): Agent[] => [
  { id: 's1', description: 'P1 sub-orch probe', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, effort: 'high', done },
  { id: 'w1', description: 'T1 worker probe', subagentType: 'baton:worker-cheap', prompt: 'Do node T1', parent: 's1', model: OPUS, effort: 'high', done },
]
// P1 > sub-orchestrator (opus 5.5 · high cfg) > worker (sonnet 5.5 · medium cfg) > verifier (sonnet 5.5 · medium cfg)
const deepTree = (done: boolean): Agent[] => [
  { id: 's1', description: 'P1 sub-orch probe', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, effort: 'high', done },
  { id: 'w1', description: 'T1 worker probe', subagentType: 'baton:worker', prompt: 'Do node T1', parent: 's1', model: SONNET, effort: 'medium', done },
  { id: 'v1', description: 'T1 verifier deep probe', subagentType: 'baton:verifier', prompt: 'Verify node T1', parent: 'w1', model: SONNET, effort: 'medium', done },
]
const SCENARIOS: [string, Agent[]][] = [
  ['high tree, agents returned', highTree(true)],
  ['high tree, agents running', highTree(false)],
  ['deep tree, agents returned', deepTree(true)],
  ['deep tree, agents running', deepTree(false)],
]

async function world($: any, on: any, agents: Agent[]) {
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
  const byPrompt = new Map(agents.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ model: byPrompt.get(e.prompt)?.model ?? OPUS, agentId: byPrompt.get(e.prompt)?.id ?? e.prompt }))
  const byId = new Map(agents.map((a) => [a.id, a]))
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
  for (const a of agents) {
    await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
    // the effort the step carries, with no classic input naming one: a configured effort, drawn `· <effort> cfg` (T8E)
    const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, effort: a.effort } as any)
    for (let x = await g.next(); !x.done; x = await g.next());
  }
  for (const a of [...agents].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: 'DONE · ok', isAborted: false } as any)
  await clock.advance(10)
  await clock.settle()
}

async function drawnAt($: any, width: number) {
  await $.command.run({ command: 'baton', args: '' } as any)
  const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: width, placement: 'dock', scroll: { bodyRows: 60 } } as any })
  const tree = await ui.drawn()
  await ui.unmount()
  const { boxes, cols, head } = tableOf(tree)
  const rows = boxes.slice(boxes.indexOf(head) + 1).filter((b) => /[◆●○✓✗◉]/.test(undrawn(b)) && leavesOf(b)[0]?.kind === 'button') // the tree's rows, each led by its `›`
  const row = (label: RegExp) => {
    const b = rows.find((x) => label.test(undrawn(x)))
    if (!b) throw new Error('no row ' + label + ': ' + JSON.stringify(rows.map(undrawn)))
    return { cells: cellsOf(b, cols, width), lines: drawnLines(drawRow(b, width)) }
  }
  return { rows: rows.map((b) => ({ cells: cellsOf(b, cols, width), lines: drawnLines(drawRow(b, width)), text: undrawn(b) })), row, head: drawnLines(drawRow(head, width)) }
}
const say = (w: number, r: { lines: string[] }) => 'width ' + w + ':\n' + r.lines.join('\n')
const AGENT_ROWS = /sub-orch P1|worker|verifier/

for (const [name, agents] of SCENARIOS) {
  // R-C8-03 · spec L112: "Widen the column so it is never cut," · L620 (T8E): the model cell carries the effort.
  test('R-C8-03: at 73 columns every agent row draws its model cell whole, effort mark included (' + name + ')', SLOW, async ($, on) => {
    await world($, on, agents)
    const d = await drawnAt($, DOCKED_165)
    const agentRows = d.rows.filter((r) => AGENT_ROWS.test(r.text))
    expect(agentRows.length, 'one row per agent').toBe(agents.length)
    for (const r of agentRows) {
      const m = cell(r.cells, 'model')
      expect(m.drawn.trim(), say(DOCKED_165, r)).toMatch(/^(opus|sonnet) 5\.5 · (high|medium) cfg$/) // the whole cell, effort and its mark
      expect(m.drawn, say(DOCKED_165, r)).not.toContain('…')
    }
    expect(cell(d.row(/◆ prime/).cells, 'model').drawn.trim()).toBe('opus 5.5') // the prime's, as before
  })

  // R-C10-28 · spec L312-313: "A phase row ... carries the phase's steps (briefed, dispatched, verified, approved)."
  // · L348-349: a pending phase row has "the stepper with no step reached".
  test("R-C10-28: at 73 columns every row's stepper is drawn whole, a phase row's with its four marks (" + name + ')', SLOW, async ($, on) => {
    await world($, on, agents)
    const d = await drawnAt($, DOCKED_165)
    for (const label of [/● P1\b/, /○ P2\b/]) {
      const r = d.row(label)
      const st = cell(r.cells, 'steps')
      expect((st.drawn.match(MARKS) ?? []).length, say(DOCKED_165, r)).toBe(4)
      expect(st.drawn.trim(), say(DOCKED_165, r)).toBe(st.text.trim())
    }
    for (const r of d.rows) expect(cell(r.cells, 'steps').drawn.trim(), say(DOCKED_165, r)).toBe(cell(r.cells, 'steps').text.trim())
  })

  // R-C10-90 · spec L341-345 (empty groups draw nothing) and L362 ("Plus a live check"): nothing in the tree is cut —
  // every cell but the agent label (cut first, after its indent and mark, Q-11) and state (cut second) is drawn whole,
  // an empty cell blank.
  test('R-C10-90: at 73 columns no cell of the tree is cut and no empty cell draws …, the label after its mark aside (' + name + ')', SLOW, async ($, on) => {
    await world($, on, agents)
    const d = await drawnAt($, DOCKED_165)
    for (const r of d.rows) {
      for (const c of r.cells) {
        if (c.name === 'agent') {
          const m = /^(\s*\S)/.exec(c.text)
          expect(c.drawn.startsWith(m ? m[1]! : ''), 'indent and mark whole: ' + say(DOCKED_165, r)).toBe(true)
          continue
        }
        if (/^sta/.test(c.name)) continue // Q-11: state may be cut, after the label
        expect(c.drawn.trimEnd(), c.name + ' ' + say(DOCKED_165, r)).toBe(c.text.trimEnd())
        if (!c.text.trim()) expect(c.drawn, c.name + ' ' + say(DOCKED_165, r)).not.toContain('…')
      }
    }
    for (const n of ['cost', 'tokens', 'roll cost', 'roll tokens', 'model']) expect(cell(d.row(/○ P2\b/).cells, n).drawn.trim()).toBe('') // a pending phase: empty
  })
}
