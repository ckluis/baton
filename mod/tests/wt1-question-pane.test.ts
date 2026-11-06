// claude plugin test — WT1 attempt 2 (run build-20261019T125436Z, phase P7): a BLOCKED return that names a cmux
// surface AND an open inbox question for the same node, rule 10's normal shape.
//
// Written BEFORE the change, from the verifier's V5b scenario (_orch/verify/WT1-verdict.json, criterion 2;
// _orch/nodes/WT1/verify-work/mod/tests/v.test.ts) and the sub-orchestrator's attempt-2 brief. At d69448d the agent is
// left out of Work and the band because "its ? row is that item": Work never shows the surface or its plain line,
// a queued question leaves no ⚑ flag at all, and after SendMessage to that agent the ?-row and "1 question" stay.
// Required:
//   (a) while the item waits, its one waiting row (under its ?-row) shows the pane: the surface id, its title when
//       the return gives one, and the plain line of what pressing it does; the band counts it as waiting on the
//       operator, once, whether the question is asked or only queued, since the return itself asks for a pane press;
//   (b) once the agent is superseded (SendMessage to it, it resumes, a newer return, a newer BLOCKED), the whole item
//       leaves the band and Work, its ?-row included; unless the question was put to the operator separately, after
//       the item was superseded (its asked record is newer than that), when it stays as a current question, without
//       the old pane. The files in _orch/inbox are never deleted or edited by the pane.
//
// The drawing model and the world restate mod/tests/wt1-waiting.test.ts's (itself pw1-fit's), with an inbox added.
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session

const QLAND = 'q land' // fixture: the worker whose BLOCKED return names a pane and an open question
const SURFACE = 'surface:188' // fixture
const TITLE = 'land.sh' // fixture: the title its return gives that pane
const PLAIN = 'press Enter in surface:188 to merge PR #57' // fixture: its Blocked-by text, what pressing does
const QLAND_ANSWER = [
  'QL BLOCKED · Q-90 open: may it merge PR #57',
  'The pane: cmux ' + SURFACE + ' "' + TITLE + '", pre-typed.',
  'Blocked by: _orch/inbox/Q-90.md:"' + PLAIN + '" (explicit)',
].join('\n')
const Q90 = '# Q-90 · May it merge PR #57?\n\n**Question.** May it merge?\n\n**Nodes it blocks:** QL.\n\nBlocked by: docs/x.md:"merge waits" (explicit)\n' // fixture
// A newer BLOCKED from the same agent, naming another pane and another question.
const SURFACE2 = 'surface:171' // fixture
const PLAIN2 = 'press Enter in surface:171 to push round 2' // fixture
const QLAND_ANSWER2 = ['QL BLOCKED · Q-91 open: may it push round 2', 'The pane: cmux ' + SURFACE2 + ' "round2.sh", pre-typed.', 'Blocked by: _orch/inbox/Q-91.md:"' + PLAIN2 + '" (explicit)'].join('\n')
const Q91 = '# Q-91 · May it push round 2?\n\n**Question.** May it push?\n\n**Nodes it blocks:** QL.\n\nBlocked by: docs/x.md:"push waits" (explicit)\n' // fixture
// A question no agent's return names: not part of any item.
const Q77 = '# Q-77 · Which audit list?\n\n**Question.** Which list?\n\n**Nodes it blocks:** N1.\n\nBlocked by: docs/y.md:"the list is chosen" (interpreted)\n' // fixture
const askedBefore = () => 'asked_at: ' + new Date(Date.now() - 3600000).toISOString() + '\nasked_via: terminal\n' // fixture: asked an hour before
const OTHERS = ['alpha worker', 'beta worker'] // fixture

// ---- the drawing model (wt1-waiting.test.ts's) --------------------------------------------------------------------

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

// ---- the world (wt1-waiting.test.ts's, with an inbox) --------------------------------------------------------------

type Opts = { returns?: Record<string, string>; inbox?: Record<string, string> }
function world(on: any, opts: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', '- id: N1\n  phase: 1\n- id: QL\n  phase: 1\n')
  dirs.set('_orch/phases', [{ name: 'P1', kind: 'dir' }])
  files.set('_orch/phases/P1/brief.md', '# P1 brief\n')
  dirs.set('_orch/nodes', [])
  for (const [f, text] of Object.entries(opts.inbox ?? {})) files.set('_orch/inbox/' + f, text)
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
    if (p === '_orch/inbox') return { value: [...files.keys()].filter((k) => k.startsWith('_orch/inbox/')).map((k) => ({ name: k.slice(12), kind: 'file' })) }
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
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    return { result: { questions: e.questions, answers: {} } }
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
  async function pane($: any, cols = 75) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    const returns = opts.returns ?? {}
    for (const d of [...OTHERS, ...Object.keys(returns)]) {
      await $.agent.spawn({ prompt: 'do the work', description: d, name: d, subagentType: 'baton:worker' } as any)
      await settle(10)
    }
    await $.turn.complete({ agentId: idOf(OTHERS[0]!), answer: 'alpha DONE · 3/3 green', durationMs: 1, isAborted: false, turnId: 't-alpha', reason: 'answer' } as any)
    for (const [d, answer] of Object.entries(returns)) await ret($, d, answer)
    await settle(61000)
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props(cols) as any })
  }
  async function ret($: any, d: string, answer: string) {
    await $.turn.complete({ agentId: idOf(d), answer, durationMs: 1, isAborted: false, turnId: 't-' + d + '-' + Math.random(), reason: 'answer' } as any)
    await settle(10)
  }
  async function band($: any, cols = 75) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: cols, scroll: {} } as any })
  }
  /** The inbox as it stands: every file under _orch/inbox and its text. */
  const inbox = () => JSON.stringify([...files.entries()].filter(([k]) => k.startsWith('_orch/inbox/')).sort())
  return { settle, pane, band, ret, idOf, props, files, inbox }
}
type World = ReturnType<typeof world>

// ---- what is read ------------------------------------------------------------------------------------------------

async function work($: any, ui: any, w: World, cols: number) {
  await $.command.run({ command: 'baton', args: '' } as any)
  await w.settle(100)
  await ui.redraw(w.props(cols) as any)
  await w.settle(100)
  return screen(elements(await ui.drawn(), cols))
}
async function bandL(b: any, cols: number) {
  return screen(elements(await b.drawn(), cols))
}
const has = (ls: string[], s: string) => ls.some((l) => l.includes(s))
const over = (ls: string[], cols: number) => ls.filter((l) => cellW(l) > cols)
const show = (ls: string[]) => '\n' + ls.map((l, i) => String(i).padStart(3) + ' |' + l + '|').join('\n')
/** The band's ⚑ line, or ''. */
const flagOf = (bl: string[]) => bl.find((l) => l.includes('⚑')) ?? ''

/** The item, as Work and the band draw it while it waits: its ?-row, its pane line, its plain line, the band's count. */
async function itemShown($: any, ui: any, b: any, w: World, cols: number, q = 'Q-90', surface = SURFACE, plain = PLAIN) {
  const l = await work($, ui, w, cols)
  const bl = await bandL(b, cols)
  const at = l.findIndex((x) => x.includes('⚑') && x.includes(surface))
  const flag = flagOf(bl)
  return {
    qrow: l.some((x) => x.includes('? ' + q)),
    pane: at >= 0,
    agent: at >= 0 && l[at]!.includes(QLAND),
    title: at >= 0 && (surface !== SURFACE || l[at]!.includes('"' + TITLE + '"')),
    plain: at >= 0 && (l[at + 1] ?? '').includes(plain.slice(0, Math.min(plain.length, cols - 8))),
    bandFlag: flag !== '',
    bandPane: flag.includes(surface),
    bandOnce: /\b1 blocked\b/.test(flag) && !/question/.test(flag),
    over: [...over(l, cols), ...over(bl, cols)],
    lines: l,
    band: bl,
  }
}
const WAITS = { qrow: true, pane: true, agent: true, title: true, plain: true, bandFlag: true, bandPane: true, bandOnce: true, over: [] }
const pick = (x: any) => {
  const { lines: _l, band: _b, ...rest } = x
  return rest
}
/** Nothing of the item is drawn: no ?-row, no pane line, no plain line, no ⚑ in the band. */
async function itemGone($: any, ui: any, b: any, w: World, cols: number, q = 'Q-90', surface = SURFACE) {
  const l = await work($, ui, w, cols)
  const bl = await bandL(b, cols)
  return { qrow: has(l, q), surface: has(l, surface) || has(bl, surface), plain: has(l, PLAIN.slice(0, 20)), agentFlag: l.some((x) => x.includes('⚑') && x.includes(QLAND)), bandFlag: flagOf(bl) !== '', lines: l, band: bl }
}
const GONE = { qrow: false, surface: false, plain: false, agentFlag: false, bandFlag: false }

// ---- (a) the item waits: its one row shows the pane; the band counts it ------------------------------------------

for (const cols of [60, 75]) {
  test('WT1 2a: a BLOCKED naming a pane and an ASKED question shows its pane, title and plain line with its ?-row, and the band counts it once, at ' + cols + ' columns', async ($, on) => {
    const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90, 'Q-90.asked.md': askedBefore() } })
    const ui: any = await w.pane($, cols)
    const b: any = await w.band($, cols)
    const s = await itemShown($, ui, b, w, cols)
    expect(pick(s), 'Work and band at ' + cols + show(s.lines) + show(s.band)).toEqual(WAITS)
  })

  test('WT1 2a: the same with the question only QUEUED (no asked record): the band still flags the pane, at ' + cols + ' columns', async ($, on) => {
    const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90 } })
    const ui: any = await w.pane($, cols)
    const b: any = await w.band($, cols)
    const s = await itemShown($, ui, b, w, cols)
    expect(pick(s), 'Work and band at ' + cols + show(s.lines) + show(s.band)).toEqual(WAITS)
  })
}

// ---- (b) superseded: the whole item leaves, its ?-row included; the inbox is untouched ----------------------------

test('WT1 2b: SendMessage to the agent removes the whole item, the asked question’s ?-row and the band’s count included; the inbox files stay as they were', async ($, on) => {
  const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90, 'Q-90.asked.md': askedBefore() } })
  const ui: any = await w.pane($, 75)
  const b: any = await w.band($, 75)
  expect(pick(await itemShown($, ui, b, w, 75)), 'premise').toEqual(WAITS)
  const before = w.inbox()
  await $.tool.call({ tool: 'SendMessage', to: QLAND, message: 'drop it, the merge is replaced' } as any)
  await w.settle(100)
  let g = await itemGone($, ui, b, w, 75)
  expect(pick(g), 'after SendMessage' + show(g.lines) + show(g.band)).toEqual(GONE)
  await w.settle(61000) // past the mod's own re-read of the inbox: it does not come back
  g = await itemGone($, ui, b, w, 75)
  expect(pick(g), 'after the re-read' + show(g.lines) + show(g.band)).toEqual(GONE)
  expect(w.inbox(), 'the inbox files').toBe(before)
})

test('WT1 2b: the agent resuming removes the item with a QUEUED question too', async ($, on) => {
  const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90 } })
  const ui: any = await w.pane($, 60)
  const b: any = await w.band($, 60)
  expect(pick(await itemShown($, ui, b, w, 60)), 'premise').toEqual(WAITS)
  const before = w.inbox()
  await $.tool.call({ tool: 'Read', file_path: RUN + '/_orch/phases/P1/brief.md', agentId: w.idOf(QLAND) } as any)
  await w.settle(61000)
  const g = await itemGone($, ui, b, w, 60)
  expect(pick(g), 'after it resumed' + show(g.lines) + show(g.band)).toEqual(GONE)
  expect(w.inbox(), 'the inbox files').toBe(before)
})

test('WT1 2b: a newer return (PARTIAL) removes the item and its asked question', async ($, on) => {
  const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90, 'Q-90.asked.md': askedBefore() } })
  const ui: any = await w.pane($, 75)
  const b: any = await w.band($, 75)
  expect(pick(await itemShown($, ui, b, w, 75)), 'premise').toEqual(WAITS)
  await w.ret($, QLAND, 'QL PARTIAL · round 2 took over the merge')
  await w.settle(61000)
  const g = await itemGone($, ui, b, w, 75)
  expect(pick(g), 'after a newer return' + show(g.lines) + show(g.band)).toEqual(GONE)
})

test('WT1 2b: a newer BLOCKED naming another pane and question replaces the older item: only the newer shows', async ($, on) => {
  const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90, 'Q-90.asked.md': askedBefore() } })
  const ui: any = await w.pane($, 75)
  const b: any = await w.band($, 75)
  expect(pick(await itemShown($, ui, b, w, 75)), 'premise').toEqual(WAITS)
  w.files.set('_orch/inbox/Q-91.md', Q91)
  await w.ret($, QLAND, QLAND_ANSWER2)
  await w.settle(61000)
  const g = await itemGone($, ui, b, w, 75)
  expect({ qrow: g.qrow, surface: g.surface, plain: g.plain }, 'the older item' + show(g.lines) + show(g.band)).toEqual({ qrow: false, surface: false, plain: false })
  const s = await itemShown($, ui, b, w, 75, 'Q-91', SURFACE2, PLAIN2)
  expect(pick(s), 'the newer item' + show(s.lines) + show(s.band)).toEqual(WAITS)
})

// ---- (b) the other side: put to the operator separately, after; and a question of no item -------------------------

test('WT1 2b (guard): a question put to the operator AFTER its item was superseded stays, as a current question, without the old pane', async ($, on) => {
  const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90 } })
  const ui: any = await w.pane($, 75)
  const b: any = await w.band($, 75)
  expect(pick(await itemShown($, ui, b, w, 75)), 'premise').toEqual(WAITS)
  await $.tool.call({ tool: 'SendMessage', to: w.idOf(QLAND), message: 'carry on with round 2' } as any)
  await w.settle(100)
  expect(pick(await itemGone($, ui, b, w, 75)), 'superseded').toEqual(GONE)
  // the prime then puts Q-90 to the operator on its own, at a gate: its asked record is newer than the supersede
  await w.settle(1000)
  w.files.set('_orch/inbox/Q-90.asked.md', 'asked_at: ' + new Date(Date.now() + 1000).toISOString() + '\nasked_via: terminal\ngate: G1\n')
  await w.settle(61000)
  const l = await work($, ui, w, 75)
  const bl = await bandL(b, 75)
  expect(
    { qrow: l.some((x) => x.includes('? Q-90 · waiting for you')), surface: has(l, SURFACE) || has(bl, SURFACE), agentFlag: l.some((x) => x.includes('⚑') && x.includes(QLAND)), band: /\b1 question\b/.test(flagOf(bl)) },
    'asked after' + show(l) + show(bl),
  ).toEqual({ qrow: true, surface: false, agentFlag: false, band: true })
})

test('WT1 2b (guard): a question no blocked return names stays when another agent is superseded', async ($, on) => {
  const w = world(on, { returns: { [QLAND]: QLAND_ANSWER }, inbox: { 'Q-90.md': Q90, 'Q-77.md': Q77, 'Q-77.asked.md': askedBefore() } })
  const ui: any = await w.pane($, 75)
  const b: any = await w.band($, 75)
  await $.tool.call({ tool: 'SendMessage', to: QLAND, message: 'replaced' } as any)
  await w.settle(61000)
  const l = await work($, ui, w, 75)
  const bl = await bandL(b, 75)
  expect({ q77: l.some((x) => x.includes('? Q-77 · waiting for you')), q90: has(l, 'Q-90'), band: /\b1 question\b/.test(flagOf(bl)), surface: has(bl, SURFACE) }, 'Q-77 stays' + show(l) + show(bl)).toEqual({ q77: true, q90: false, band: true, surface: false })
})
