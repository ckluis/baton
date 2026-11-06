// claude plugin test — WT1 (run build-20261019T125436Z, phase P7; operator decision 2026-11-06): "waiting on you"
// shows only what is waiting on the operator now.
//
// Written from the handoff (_orch/nodes/WT1/handoff.md, done-criteria 1 and 2) BEFORE the change; nothing here is
// copied from the implementation. The operator saw the pane keep a "waiting on you" item for a request already
// replaced: a sub-orchestrator returned BLOCKED naming cmux surface:159 (a pre-typed round1-land.sh), the prime then
// sent that agent new instructions with SendMessage, and the pane still showed the old item. Required (operator):
//   - an item waiting on the operator (a BLOCKED return, or a pane to press) is cleared as soon as it is superseded:
//     the prime sends that agent new instructions (SendMessage to it), the agent resumes or reports again, or a
//     newer item replaces it;
//   - the pane shows only what waits now, each with its pane (surface id, and title when the item names one) and
//     one plain line of what pressing it does, cut to the row width.
//
// Where it is read: the band's `⚑ waiting for you` flag, the Work list (a `⚑` line naming the agent, its surface and
// its plain line; the agent's own row drawn as a finished, dim row once nothing waits), and the agent's blocked brief
// (`/baton show <agent>`: its `Blocked by:` line). Every test fails at the start commit ee20c79, where an agent's
// BLOCKED return is not in the band, has no `⚑` line in Work and keeps its brief after SendMessage.
//
// The drawing model (a row's Texts laid out as the terminal does) restates mod/tests/pw1-fit.test.ts's, so this file
// stands alone; widths are PW1's dock widths (_orch/phases/P7/brief.md: 49, 60, 75, 90; 120 wide).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session

// ---- fixtures: the operator's case -------------------------------------------------------------------------------

const LAND = 'round1 land' // fixture: the sub-orchestrator that returned BLOCKED naming a surface
const SURFACE = 'surface:159' // fixture: the cmux surface its return names
const TITLE = 'round1-land.sh' // fixture: the title its return gives that surface
const PLAIN = 'press Enter in surface:159 to merge PR #57 and tag v7.6' // fixture: its Blocked-by text, what pressing does
// Its final text: the one line (no surface in it, so a row showing only the line never shows the surface), the pane it
// left pre-typed, and its Blocked by line (rule 10's shape).
const LAND_ANSWER = [
  'R1 BLOCKED · the land script waits for the operator to press it · Q-90 open',
  'The pane: cmux ' + SURFACE + ' "' + TITLE + '", pre-typed, no Enter.',
  'Blocked by: _orch/inbox/Q-90.md:"' + PLAIN + '" (explicit)',
].join('\n')
// A newer BLOCKED from the same agent, naming another pane.
const SURFACE2 = 'surface:171' // fixture
const TITLE2 = 'round2-land.sh' // fixture
const PLAIN2 = 'press Enter in surface:171 to push the run branch for round 2' // fixture
const LAND_ANSWER2 = [
  'R1 BLOCKED · the round 2 script waits for the operator to press it · Q-91 open',
  'The pane: cmux ' + SURFACE2 + ' "' + TITLE2 + '", pre-typed, no Enter.',
  'Blocked by: _orch/inbox/Q-91.md:"' + PLAIN2 + '" (explicit)',
].join('\n')
// A BLOCKED with no surface: its plain line is its Blocked-by text.
const AUDIT = 'audit worker' // fixture
const AUDIT_PLAIN = 'every audit row cites its source' // fixture
const AUDIT_ANSWER = 'audit BLOCKED · two rows have no source · Q-82 open\nBlocked by: docs/audit.md:"' + AUDIT_PLAIN + '" (interpreted)' // fixture

const OTHERS = ['alpha worker', 'beta worker'] // fixture: two more agents, one still running
const WIDTHS = [49, 60, 75, 90, 120] // _orch/phases/P7/brief.md: the dock widths PW1 fits, and wide

// ---- the drawing model (pw1-fit.test.ts's) -----------------------------------------------------------------------

const wide = (c: string) => c === '✅' || c === '❌'
const cellW = (s: string) => [...s].reduce((n, c) => n + (wide(c) ? 2 : 1), 0)
const textOf = (x: any): string =>
  typeof x === 'string' || typeof x === 'number' ? String(x)
  : x == null || x === false ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : x.type === 'Link' ? String(x.props?.label ?? '') + textOf(x.children)
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
type Leaf = { kind: 'text' | 'button'; text: string; drawn: string; x: number; y: number; h: number; boxed: boolean; node?: any }
function wrapLines(t: string, w: number): number {
  if (w <= 0) return 1
  let lines = 1
  let used = 0
  for (const word of t.trim().split(/(\s+)/)) {
    if (!word) continue
    const n = cellW(word)
    if (used + n <= w) {
      used += n
      continue
    }
    if (/^\s+$/.test(word)) {
      used = w
      continue
    }
    if (used) lines++
    const more = Math.floor(Math.max(0, n - 1) / w)
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
function basisOf(c: any, avail: number): number {
  if (typeof c === 'string') return Math.min(cellW(c), avail)
  if (c.type === 'Button') return cellW(buttonText(c))
  if (c.type === 'Box') {
    const w = c.props?.width
    if (typeof w === 'number') return w
    const kids = kidsOf(c)
    return kids.reduce((n: number, k: any) => n + basisOf(k, avail), 0) + (c.props?.columnGap ?? 0) * Math.max(0, kids.length - 1)
  }
  return Math.min(cellW(textOf(c)), avail)
}
const shrinkOf = (c: any) => (typeof c === 'string' ? 1 : c.type === 'Button' ? 0 : c.type === 'Box' ? (c.props?.flexShrink ?? 1) : 1)
function layout(kids: any[], width: number, x0: number, y: number, out: Leaf[], gap: number, boxed: boolean) {
  const basis = kids.map((c) => basisOf(c, width))
  const shrink = kids.map(shrinkOf)
  const total = basis.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1)
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
      layout(kidsOf(c), w, x, y, inner, c.props?.columnGap ?? 0, boxed || typeof c.props?.width === 'number')
      if (c.props?.overflow === 'hidden') {
        for (const l of inner) {
          const room = Math.max(0, x + w - l.x)
          if (cellW(l.drawn) > room) l.drawn = [...l.drawn].slice(0, room).join('')
        }
      }
      out.push(...inner)
    } else if (typeof c !== 'string' && c.type === 'Button') out.push({ kind: 'button', text: buttonText(c), drawn: buttonText(c), x, y, h: 1, boxed, node: c })
    else {
      const t = typeof c === 'string' ? c : textOf(c)
      out.push({ kind: 'text', text: t, drawn: truncEnd(t, w), x, y, h: cellW(t) > w && wraps(c) ? wrapLines(t, w) : 1, boxed, node: c })
    }
    x += w + gap
  })
}
function drawRow(box: any, width: number): Leaf[] {
  const out: Leaf[] = []
  const kids = kidsOf(box)
  const gap = box.props?.columnGap ?? 0
  if (box.props?.flexWrap !== 'wrap') {
    layout(kids, width, 0, 0, out, gap, false)
    return out
  }
  const lines: any[][] = [[]]
  let used = 0
  for (const c of kids) {
    const b = basisOf(c, width)
    const cur = lines[lines.length - 1]!
    if (cur.length && used + gap + b > width) {
      lines.push([c])
      used = b
    } else {
      used += (cur.length ? gap : 0) + b
      cur.push(c)
    }
  }
  lines.forEach((l, y) => layout(l, width, 0, y, out, gap, false))
  return out
}
function drawnLines(ls: Leaf[]): string[] {
  const rows: string[] = []
  for (const l of ls) {
    let s = rows[l.y] ?? ''
    if (cellW(s) < l.x) s += ' '.repeat(l.x - cellW(s))
    rows[l.y] = s + l.drawn
  }
  const tall: number[] = []
  for (const l of ls) tall[l.y] = Math.max(tall[l.y] ?? 1, l.h)
  const out: string[] = []
  rows.forEach((r, y) => {
    if (r === undefined) return
    out.push(r)
    for (let k = 1; k < (tall[y] ?? 1); k++) out.push('')
  })
  return out.length ? out : ['']
}
type El = { node: any; text: string; lines: string[]; leaves: Leaf[] }
function elements(n: any, width: number, out: El[] = []): El[] {
  if (Array.isArray(n)) {
    for (const c of n) elements(c, width, out)
    return out
  }
  if (n == null || n === false) return out
  if (typeof n === 'string') {
    out.push({ node: n, text: n, lines: [truncEnd(n, width)], leaves: [{ kind: 'text', text: n, drawn: truncEnd(n, width), x: 0, y: 0, h: cellW(n) > width ? wrapLines(n, width) : 1, boxed: false }] })
    return out
  }
  if (n.type === 'Box' && n.props?.flexDirection === 'column') {
    for (const c of kidsOf(n)) elements(c, width, out)
    return out
  }
  if (n.type === 'Box') {
    const leaves = drawRow(n, width)
    out.push({ node: n, text: leaves.map((l) => l.text).join(''), lines: drawnLines(leaves), leaves })
    return out
  }
  if (n.type === 'Input') {
    const t = String(n.props?.label ?? '')
    out.push({ node: n, text: t, lines: [truncEnd(t, width)], leaves: [] })
    return out
  }
  const t = n.type === 'Button' ? buttonText(n) : textOf(n)
  const h = n.type === 'Text' && cellW(t) > width && wraps(n) ? wrapLines(t, width) : 1
  const leaf: Leaf = { kind: n.type === 'Button' ? 'button' : 'text', text: t, drawn: n.type === 'Button' ? t : truncEnd(t, width), x: 0, y: 0, h, boxed: false, node: n }
  out.push({ node: n, text: t, lines: [leaf.drawn, ...Array.from({ length: h - 1 }, () => '')], leaves: [leaf] })
  return out
}
const screen = (els: El[]) => els.flatMap((e) => e.lines)
const dump = (els: El[]) => '\n' + screen(els).map((l, i) => String(i).padStart(3) + ' |' + l + '|').join('\n')

// ---- the world (as mod/tests/t13-blocked.test.ts's: the engine beneath the mod answers from memory) ---------------

type Opts = { returns?: Record<string, string> } // agent description -> final text, returned before the pane opens

function world(on: any, opts: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', '- id: N1\n  phase: 1\n')
  dirs.set('_orch/phases', [{ name: 'P1', kind: 'dir' }])
  files.set('_orch/phases/P1/brief.md', '# P1 brief\n')
  dirs.set('_orch/nodes', [])
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
    if (p === '_orch/inbox') return { value: [] }
    const v = dirs.get(p)
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
  const sent: any[] = [] // what reached the engine's SendMessage
  on('tool.call', (_$: any, e: any) => {
    if (e.tool === 'SendMessage') sent.push(e)
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options = (q.options || []).map((o: any) => o.label)
    return { result: { questions: e.questions, answers: { [q.question]: options[0] ?? 'ok' } } }
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
  mock.env(on, {})
  mock.session(on)

  async function settle(ms = 100) {
    await clock.advance(ms)
    await clock.settle()
  }
  const idOf = (desc: string) => 'a-' + desc.replace(/\W+/g, '-')
  const props = (cols: number) => ({ title: 'baton', isFocused: true, bodyColumns: cols, placement: cols > 100 ? 'inline' : 'dock', scroll: { bodyRows: 400, offset: 0 } })
  /** Start the session, spawn the agents (the ones in `returns` return), and open the pane `cols` wide. */
  async function pane($: any, cols = 120) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    const returns = opts.returns ?? {}
    for (const d of [...OTHERS, ...Object.keys(returns)]) {
      await $.agent.spawn({ prompt: 'do the work', description: d, subagentType: d === LAND ? 'baton:sub-orchestrator' : 'baton:worker' } as any)
      await settle(10)
    }
    await $.turn.complete({ agentId: idOf(OTHERS[0]!), answer: 'alpha DONE · 3/3 green', durationMs: 1, isAborted: false, turnId: 't-alpha', reason: 'answer' } as any)
    for (const [d, answer] of Object.entries(returns)) await ret($, d, answer)
    await settle(61000) // past the mod's own re-read interval
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props(cols) as any })
  }
  /** An agent returns (its final text). */
  async function ret($: any, d: string, answer: string) {
    await $.turn.complete({ agentId: idOf(d), answer, durationMs: 1, isAborted: false, turnId: 't-' + d + '-' + Math.random(), reason: 'answer' } as any)
    await settle(10)
  }
  async function band($: any, cols = 120) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: cols, scroll: {} } as any })
  }
  return { settle, pane, band, ret, idOf, props, sent }
}
type World = ReturnType<typeof world>

// ---- what is read ------------------------------------------------------------------------------------------------

/** The Work view's screen lines, `cols` wide. */
async function work(ui: any, w: World, cols: number) {
  await ui.redraw(w.props(cols) as any)
  await w.settle(100)
  return elements(await ui.drawn(), cols)
}
/** The band's screen lines. */
async function bandLines(b: any, cols: number) {
  return screen(elements(await b.drawn(), cols))
}
/** The agent's own view (`/baton show <agent>`), as screen lines; back to Work after, by its `b` key. */
async function brief($: any, ui: any, w: World, label: string, cols: number) {
  await $.command.run({ command: 'baton', args: 'show ' + label } as any)
  await w.settle(100)
  await ui.redraw(w.props(cols) as any)
  await w.settle(100)
  const els = elements(await ui.drawn(), cols)
  const back = (await ui.findAll({ type: 'Button' })).find((x: any) => x.props?.hotkey === 'b')
  if (back) await ui.press({ key: back.key ?? back.props.key })
  await w.settle(100)
  return { lines: screen(els), els }
}
/** The `⚑` lines of Work that name an agent: what waits on the operator, as drawn. */
const flagLines = (els: El[], label: string) => screen(els).filter((l) => l.includes('⚑') && l.includes(label))
/** Whether the agent's own tree row is drawn as a finished row: every Text after its mark dim (Q-69). */
function rowDim(els: El[], label: string): boolean | string {
  const row = els.find((e) => e.leaves.length > 1 && !e.text.includes('⚑') && e.leaves.some((l) => l.kind === 'text' && l.text.includes(label)))
  if (!row) return 'no tree row of ' + label
  const cell = row.leaves.find((l) => l.kind === 'text' && l.text.includes(label))!
  return !!cell.node?.props?.dimColor
}
/** Everything that shows the agent waiting: its ⚑ lines in Work, its surface or plain line anywhere in Work, the band. */
async function waitingShown($: any, w: World, ui: any, b: any, label: string, marks: string[], cols = 120) {
  const els = await work(ui, w, cols)
  const lines = screen(els)
  const bl = await bandLines(b, cols)
  return {
    workFlag: flagLines(els, label).length > 0,
    workMarks: marks.filter((m) => lines.some((l) => l.includes(m))),
    bandNames: bl.some((l) => l.includes('⚑') && l.includes(label)),
    bandMarks: marks.filter((m) => bl.some((l) => l.includes(m))),
    rowDim: rowDim(els, label),
  }
}
const SHOWN = { workFlag: true, workMarks: [SURFACE, TITLE], bandNames: true, bandMarks: [SURFACE], rowDim: false }
const GONE = { workFlag: false, workMarks: [], bandNames: false, bandMarks: [], rowDim: true }

/** Premise: before it is superseded, the item waits in the band, in Work and in its brief. */
async function premise($: any, w: World, ui: any, b: any) {
  expect(await waitingShown($, w, ui, b, LAND, [SURFACE, TITLE]), 'premise: the BLOCKED return waits').toEqual(SHOWN)
  const br = await brief($, ui, w, LAND, 120)
  expect(br.lines.some((l) => l.includes('Blocked by:')), 'premise: its brief' + dump(br.els)).toBe(true)
  await $.command.run({ command: 'baton', args: '' } as any)
  await w.settle(100)
}
/** After: nothing of it waits; its brief no longer offers it. */
async function gone($: any, w: World, ui: any, b: any, why: string) {
  await $.command.run({ command: 'baton', args: '' } as any)
  await w.settle(100)
  expect(await waitingShown($, w, ui, b, LAND, [SURFACE, TITLE, PLAIN.slice(0, 24)]), why).toEqual(GONE)
  const br = await brief($, ui, w, LAND, 120)
  expect({ blockedBy: br.lines.some((l) => l.includes('Blocked by:')), plain: br.lines.some((l) => l.includes(PLAIN.slice(0, 24))) }, why + ': its brief' + dump(br.els)).toEqual({ blockedBy: false, plain: false })
}

// ---- (a) the stale case: SendMessage supersedes it -----------------------------------------------------------------

test('WT1 a: an agent returns BLOCKED naming a surface; the prime sends it new instructions with SendMessage; the item is gone from the band, Work and the brief', async ($, on) => {
  const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  await premise($, w, ui, b)
  await $.tool.call({ tool: 'SendMessage', to: w.idOf(LAND), message: 'Do not wait on surface:159: the land is replaced by round 2.' } as any) // the prime's call: no agentId
  await w.settle(100)
  expect(w.sent.length, 'premise: the message reached the engine').toBe(1)
  await gone($, w, ui, b, 'after SendMessage to its agent id')
})

test('WT1 a: SendMessage to the agent by its name supersedes it too', async ($, on) => {
  const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  await premise($, w, ui, b)
  await $.tool.call({ tool: 'SendMessage', to: LAND, message: 'New instructions: carry on with round 2.' } as any)
  await w.settle(100)
  await gone($, w, ui, b, 'after SendMessage to its name')
})

// ---- (b) resumed, reported again, replaced -------------------------------------------------------------------------

test('WT1 b: the agent resumes (a tool call of its own after its return); the item is gone', async ($, on) => {
  const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  await premise($, w, ui, b)
  await $.tool.call({ tool: 'Read', file_path: RUN + '/_orch/phases/P1/brief.md', agentId: w.idOf(LAND) } as any)
  await w.settle(100)
  await gone($, w, ui, b, 'after the agent resumed')
})

test('WT1 b: the agent reports again (a newer return); the item is gone', async ($, on) => {
  // PARTIAL, not DONE: a sub-orchestrator's DONE queues its phase for the operator's check, a new item of its own
  const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  await premise($, w, ui, b)
  await w.ret($, LAND, 'R1 PARTIAL · round 2 took over the land')
  await w.settle(100)
  await gone($, w, ui, b, 'after a newer DONE return')
})

test('WT1 b: a newer BLOCKED from the same agent replaces the older one: only the newer shows', async ($, on) => {
  const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  await premise($, w, ui, b)
  await w.ret($, LAND, LAND_ANSWER2)
  await w.settle(100)
  await $.command.run({ command: 'baton', args: '' } as any)
  await w.settle(100)
  const els = await work(ui, w, 120)
  const lines = screen(els)
  const bl = await bandLines(b, 120)
  const has = (ls: string[], s: string) => ls.some((l) => l.includes(s))
  expect(
    { old: [SURFACE, TITLE, PLAIN].filter((s) => has(lines, s) || has(bl, s)), newWork: [SURFACE2, TITLE2, PLAIN2].filter((s) => has(lines, s)), newBand: has(bl, SURFACE2), flags: flagLines(els, LAND).length },
    'only the newer item' + dump(els),
  ).toEqual({ old: [], newWork: [SURFACE2, TITLE2, PLAIN2], newBand: true, flags: 1 })
  const br = await brief($, ui, w, LAND, 120)
  expect({ old: has(br.lines, SURFACE) || has(br.lines, PLAIN), now: has(br.lines, SURFACE2) && has(br.lines, PLAIN2) }, 'its brief' + dump(br.els)).toEqual({ old: false, now: true })
})

test('WT1 b: a newer agent dispatched under the same name replaces the older item', async ($, on) => {
  const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  await premise($, w, ui, b)
  await $.agent.spawn({ prompt: 'land round 2', description: LAND + ' again', name: LAND, subagentType: 'baton:sub-orchestrator' } as any)
  await w.settle(100)
  await $.command.run({ command: 'baton', args: '' } as any)
  await w.settle(100)
  const els = await work(ui, w, 120)
  const bl = await bandLines(b, 120)
  expect({ work: [SURFACE, TITLE].filter((s) => screen(els).some((l) => l.includes(s))), flags: flagLines(els, LAND).length, band: bl.some((l) => l.includes(SURFACE) || (l.includes('⚑') && l.includes(LAND))) }, 'after a re-dispatch' + dump(els)).toEqual({ work: [], flags: 0, band: false })
})

// ---- (c) guard: what waits now stays, with its pane and one plain line ---------------------------------------------

for (const cols of WIDTHS) {
  test('WT1 c (guard): a current BLOCKED with no later message, resume or replacement stays, with its surface, title and plain line, at ' + cols + ' columns', async ($, on) => {
    const w = world(on, { returns: { [LAND]: LAND_ANSWER } })
    const ui: any = await w.pane($, cols)
    const b: any = await w.band($, cols)
    // things that are not about it: a message to another agent, another agent's call and return
    await $.tool.call({ tool: 'SendMessage', to: w.idOf(OTHERS[1]!), message: 'carry on' } as any)
    await $.tool.call({ tool: 'Read', file_path: RUN + '/x', agentId: w.idOf(OTHERS[1]!) } as any)
    await w.settle(100)
    const els = await work(ui, w, cols)
    const lines = screen(els)
    const flags = flagLines(els, LAND)
    // its ⚑ line names the agent and its pane; the next line is the plain line, cut to the row
    const at = lines.findIndex((l) => l.includes('⚑') && l.includes(LAND))
    const plainLine = at >= 0 ? (lines[at + 1] ?? '') : ''
    const plainHead = PLAIN.slice(0, Math.min(PLAIN.length, cols - 6)).replace(/\s+\S*$/, '').trim() // its start, whatever the cut
    expect(
      { flags: flags.length, surface: flags.some((l) => l.includes(SURFACE)), title: cols >= 60 ? flags.some((l) => l.includes(TITLE)) : true, plain: plainLine.includes(plainHead), fits: [lines[at] ?? '', plainLine].every((l) => cellW(l) <= cols), rowDim: rowDim(els, LAND) },
      'Work at ' + cols + dump(els),
    ).toEqual({ flags: 1, surface: true, title: true, plain: true, fits: true, rowDim: false })
    const bl = await bandLines(b, cols)
    expect({ named: bl.some((l) => l.includes('⚑') && (l.includes(LAND) || /\b1 blocked\b/.test(l))), fits: bl.every((l) => cellW(l) <= cols) }, 'band at ' + cols + '\n' + bl.join('\n')).toEqual({ named: true, fits: true })
    const br = await brief($, ui, w, LAND, cols)
    const flat = br.lines.join(' ').replace(/\s+/g, ' ')
    expect({ blockedBy: flat.includes('Blocked by:'), surface: flat.includes(SURFACE), plain: flat.includes(PLAIN) || flat.includes(PLAIN.slice(0, 30)) }, 'brief at ' + cols + dump(br.els)).toEqual({ blockedBy: true, surface: true, plain: true })
  })
}

test('WT1 c (guard): a BLOCKED that names no surface stays with its plain line (its Blocked-by text) and no surface', async ($, on) => {
  const w = world(on, { returns: { [AUDIT]: AUDIT_ANSWER } })
  const ui: any = await w.pane($, 75)
  const b: any = await w.band($, 75)
  const els = await work(ui, w, 75)
  const lines = screen(els)
  const at = lines.findIndex((l) => l.includes('⚑') && l.includes(AUDIT))
  expect({ flag: at >= 0, surface: at >= 0 && /surface:/.test(lines[at]!), plain: at >= 0 && (lines[at + 1] ?? '').includes(AUDIT_PLAIN) }, 'Work at 75' + dump(els)).toEqual({ flag: true, surface: false, plain: true })
  expect((await bandLines(b, 75)).some((l) => l.includes('⚑') && (l.includes(AUDIT) || /\b1 blocked\b/.test(l)))).toBe(true)
})

test('WT1 c (guard): two agents blocked at once both wait; superseding one leaves the other', async ($, on) => {
  const w = world(on, { returns: { [LAND]: LAND_ANSWER, [AUDIT]: AUDIT_ANSWER } })
  const ui: any = await w.pane($)
  const b: any = await w.band($)
  let els = await work(ui, w, 120)
  expect({ land: flagLines(els, LAND).length, audit: flagLines(els, AUDIT).length }, 'both wait' + dump(els)).toEqual({ land: 1, audit: 1 })
  await $.tool.call({ tool: 'SendMessage', to: w.idOf(LAND), message: 'replaced' } as any)
  await w.settle(100)
  els = await work(ui, w, 120)
  const bl = await bandLines(b, 120)
  expect({ land: flagLines(els, LAND).length, audit: flagLines(els, AUDIT).length, bandLand: bl.some((l) => l.includes(SURFACE)), bandAudit: bl.some((l) => l.includes('⚑')) }, 'after SendMessage to one' + dump(els)).toEqual({ land: 0, audit: 1, bandLand: false, bandAudit: true })
})
