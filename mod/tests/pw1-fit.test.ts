// claude plugin test — PW1 (run build-20261019T125436Z, phase P7): every tab and view of the pane reads well at the
// widths Claude Code's dock gives it.
//
// Written from the handoff (_orch/nodes/PW1/handoff.md done-criteria 2 and 3), the phase brief (_orch/phases/P7/brief.md:
// the dock widths 49, 60, 75 and 90, plus 40 and 120) and the width limit (_orch/inbox/pane-width.md: Claude Code
// 2.1.319 docks a pane at min(floor(cols x 0.45), cols - 60), no setting; a 110-column terminal docks at 49, 165 at 74,
// 200 at 90) BEFORE the change; nothing here is copied from the implementation. The inventory of what is drawn, and
// by which code, is _orch/nodes/PW1/work/inventory.md.
//
// What is asserted, for every view at every width (49, 60, 75, 90, 40 and 120):
//   - no drawn line is wider than the pane body;
//   - the terminal has nothing to cut, shrink or wrap: every Text is given its whole width (a row's cells all fit, a
//     line wider than the pane is fitted by the mod, never by the terminal), so no table row wraps; only a cell the
//     mod itself draws in a box of a set width (an agent label it cuts, a hidden pad) is left to that box;
//   - at 49 and wider every agent row draws its exact model and effort whole (`opus 5.5 · high cfg`, `sonnet 5.5 ·
//     medium cfg`; the operator's standing ruling), and so does an agent's own view;
//   - every key of a key hint is drawn with its word (the hint may take two lines, a key may not be cut);
//   - prose the views used to wrap at a fixed width (an agent's task at 104, a note at 100) wraps at the drawn width;
//   - in a short pane (18 rows) the Work view fits the pane: the agent list scrolls inside it and the key hint stays;
//   - every `$.ui.open` of the pane asks for its width (`columns`), a large request the engine clamps to its ceiling.
//
// The drawing model (a row's Texts laid out as the terminal does, each shrinking in proportion when the row asks for
// more than the pane, a default-wrap Text wider than its room taking more lines, a Box of a set width clipping what
// is in it, a `flexWrap` row laid out line by line, a column gap counted) restates mod/tests/fx3-short-narrow.test.ts's
// with the gap and the set-width box added, so this file stands alone.
import { expect, mock, test } from 'claude-code/testing'

const SLOW = { timeoutMs: 120000 }
const WIDTHS = [49, 60, 75, 90, 40, 120] // _orch/phases/P7/brief.md: docked 49 60 75 90, plus 40 and 120
const DOCKED_MIN = 49 // the narrowest dock of the matrix: from here up the model and effort are whole
const SHORT = 18 // fixture: a short pane (_orch/phases/P4/deviations.md D-P4-10 a: about 19 lines or fewer)

// ---- the drawing model --------------------------------------------------------------------------------------

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
type Leaf = { kind: 'text' | 'button'; text: string; drawn: string; x: number; y: number; h: number; boxed: boolean }
/** The lines a default-wrap Text takes `w` cells wide (Ink's `wrap`: by words, a longer word broken). */
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
    } else if (typeof c !== 'string' && c.type === 'Button') out.push({ kind: 'button', text: buttonText(c), drawn: buttonText(c), x, y, h: 1, boxed })
    else {
      const t = typeof c === 'string' ? c : textOf(c)
      out.push({ kind: 'text', text: t, drawn: truncEnd(t, w), x, y, h: cellW(t) > w && wraps(c) ? wrapLines(t, w) : 1, boxed })
    }
    x += w + gap
  })
}
/** One row Box as the terminal draws it `width` cells wide; a wrapping row line by line. */
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
  // a line no leaf is drawn on (a two-line row's break) takes no screen line; a wrapped Text makes its line taller
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
/** An element of the pane's column: its screen lines, its whole text (cut cells included), its leaves. */
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
    // an Input is drawn by the engine (its label, its field): one line, checked for width only
    const t = String(n.props?.label ?? '')
    out.push({ node: n, text: t, lines: [truncEnd(t, width)], leaves: [] })
    return out
  }
  const t = n.type === 'Button' ? buttonText(n) : textOf(n)
  const h = n.type === 'Text' && cellW(t) > width && wraps(n) ? wrapLines(t, width) : 1
  const leaf: Leaf = { kind: n.type === 'Button' ? 'button' : 'text', text: t, drawn: n.type === 'Button' ? t : truncEnd(t, width), x: 0, y: 0, h, boxed: false }
  out.push({ node: n, text: t, lines: [leaf.drawn, ...Array.from({ length: h - 1 }, () => '')], leaves: [leaf] })
  return out
}
const screen = (els: El[]) => els.flatMap((e) => e.lines)
const dump = (els: El[]) => '\n' + screen(els).map((l, i) => String(i).padStart(3) + ' |' + l + '|').join('\n')

// ---- the world: a run deep in its second phase, with everything a view can draw ----------------------------------

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261106T090000Z' // fixture
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
const OPUS = 'claude-opus-5-5' // fixture
const SONNET = 'claude-sonnet-5-5' // fixture
const ISSUE = { number: 57, title: 'Fit every tab and view of the baton pane to the width Claude Code docks it at', url: 'https://github.com/o/r/issues/57' } // fixture: a long goal title
const P1N = ['T101', 'T102']
const P2N = Array.from({ length: 14 }, (_, i) => 'T2' + String(i + 1).padStart(2, '0')) // more than the 12 node rows a phase shows
const P3N = ['T301']
const GRAPH = [...P1N.map((id) => [id, 1]), ...P2N.map((id) => [id, 2]), ...P3N.map((id) => [id, 3])].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join('')
// fixture: a long task of two paragraphs, longer than the 14 lines an agent's view shows at the narrow widths
const LONG_TASK =
  'Do node T201 of phase P2: rewrite the streaming JSON export so that every record is flushed as soon as it is complete, ' +
  'keep the old buffered path behind a flag for one release, and prove with a red test first that a ten-megabyte export never holds more than one record in memory at a time.\n' +
  'Work only under src/export/ and test/export/. Record red, green and blue in work/red.txt, work/green.txt and work/blue.txt, and write the envelope to _orch/nodes/T201/status.json as your last act.'
const RULINGS = [
  { index: 0, tag: 'ruling', ts: '2026-11-01T10:00:00Z', text: 'never merge to main without the operator; a green PR waits for the operator to press merge, whatever the reviewer says' },
  { index: 1, tag: 'ruling', ts: '2026-11-02T10:00:00Z', text: 'stage files by name only' },
  { index: 2, tag: 'ruling', ts: '2026-11-03T10:00:00Z', text: 'agents always show the exact model and effort, at every width the pane is drawn' },
  { index: 3, tag: 'ruling', ts: '2026-11-04T10:00:00Z', text: 'no session links in commit messages, PR bodies or code comments' },
] // fixture: four rulings, so the Work view shows three and a `… 1 more` line
// fixture: the reviewer's comment on the PR (the shape lib/track.mjs parseReview reads), two findings with long text
const REVIEW = '<!-- baton:pr-review round=1 -->\nVERDICT: CHANGES\n- [high] mod/hooks/register.js:2005 — the goal line is cut at a docked width and the legend runs past the edge of the pane\n- [med] mod/lib/detail.mjs:66 — the task text wraps at a fixed 104 columns whatever the pane is\n'
const PR = { number: 58, url: 'https://github.com/o/r/pull/58', title: 't', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }, { name: 'lint', conclusion: 'SUCCESS' }], comments: [{ id: 'c1', body: REVIEW, author: { login: 'me' }, createdAt: '2026-11-06T08:00:00Z', url: 'https://github.com/o/r/pull/58#c1' }], assignees: [], headRefName: 'run-branch', author: { login: 'me' }, closingIssuesReferences: [], files: [] }
const Q7 = '# Q-7 — which streaming parser should the export use, the hand-written one or the library one the old path used?\n\n**Nodes it blocks:** T203\n\n**Options**\n1. The hand-written parser (recommended)\n2. The library parser\n\n**If unanswered, the run assumes:** option 1.\n\nBlocked by: docs/designs/export.md:"the parser is chosen per release by the operator, never by a worker" (interpreted)\n' // fixture: put to the operator
const Q8 = '# Q-8 — may the export drop the legacy CSV header row that no consumer reads any more?\n\nBlocked by: CONTRACT.md:"a format change needs the operator" (explicit)\n' // fixture: queued
const T203_STATUS = { verdict: 'BLOCKED', summary: 'the export cannot pick its parser without the operator: two are in the tree and the design says the operator picks one per release', outputs: [], blocked_by: 'Blocked by: docs/designs/export.md:"the parser is chosen per release by the operator, never by a worker" (interpreted)' }
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; model: string; effort: string; done?: string; want: string }
const WORKERS = 12
const cell = (model: string, effort: string) => (model === OPUS ? 'opus 5.5' : 'sonnet 5.5') + ' · ' + effort + ' cfg' // the model cell a configured effort draws (T8E)
// fixture: P1's sub-orchestrator (returned DONE, so its phase waits for the operator's check), P2's (running) and twelve
// agents under it with long labels, opus at high and sonnet at medium in turn; one returned BLOCKED, the last two run
const AGENTS: Agent[] = [
  { id: 's1', description: 'P1 plan the parser', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, effort: 'high', done: 'DONE · P1 planned the parser and both nodes are verified', want: cell(OPUS, 'high') },
  { id: 's2', description: 'P2 build the streaming export pipeline', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 from _orch/phases/P2/brief.md', model: OPUS, effort: 'high', want: cell(OPUS, 'high') },
  ...Array.from({ length: WORKERS }, (_, i): Agent => {
    const id = P2N[i]!
    const model = i % 2 ? OPUS : SONNET
    const effort = i % 2 ? 'high' : 'medium'
    const done = i + 2 < WORKERS ? (i === 2 ? "BLOCKED · the parser is the operator's choice\nBlocked by: docs/designs/export.md:\"the parser is chosen per release by the operator, never by a worker\" (interpreted)" : 'DONE · ' + id + ' green and blue, 41 tests pass') : undefined
    return { id: 'w' + (i + 1), description: id + ' streaming export record flusher number ' + (i + 1), subagentType: i === 3 ? 'baton:verifier' : 'baton:worker', prompt: i === 0 ? LONG_TASK : 'Do node ' + id, parent: 's2', model, effort, ...(done ? { done } : {}), want: cell(model, effort) }
  }),
]
const CALLS = [
  { tool: 'Read', file_path: '/work/src/export/stream.ts' },
  { tool: 'Bash', command: 'node --test test/export/stream.test.mjs test/export/buffer.test.mjs && echo every export suite passed' },
  { tool: 'Edit', file_path: '/work/src/export/writers/streaming/json/RecordFlusher.ts' },
  { tool: 'Grep', pattern: 'flushRecord', path: 'src' },
] // fixture: w1's tool calls (TC1's table, under the rows above it)
const NOTES = Array.from({ length: 8 }, (_, i) => ({ i, ts: '2026-11-06T0' + (i + 1) + ':00:00Z', tag: i % 2 ? 'prime-reply' : 'sub', text: 'note ' + i + ': the export node T20' + i + ' returned DONE after its verifier confirmed every criterion with a re-run of the whole suite and a mutation probe' })) // fixture: long note text
const NOTE_6 = NOTES[6]!.text

function world(on: any) {
  const t0 = Date.parse('2026-11-06T09:00:00Z')
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const store = new Map<string, unknown>()
  const m: any = { run_id: RUN_ID, mode: 'BUILD', target: 'issue:#57', issue: ISSUE, prime: true, phase: 'P2', pr: { number: 58 }, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', GRAPH)
  for (const p of ['P1', 'P2', 'P3']) files.set('_orch/phases/' + p + '/brief.md', '# ' + p + ' brief - build the streaming export, record by record, with the buffered path behind a flag for one release\n\nNodes, in order, each red then green then blue, each with a fresh verifier, all in the run worktree on the run branch.\n')
  files.set('_orch/phases/P1/envelope.json', JSON.stringify({ verdict: 'DONE', summary: 'P1 planned the parser: two nodes, both verified by a fresh verifier with a re-run of the suite', risk: "the parser choice is still the operator's, Q-7" }))
  for (const id of [...P1N, 'T201', 'T202']) files.set('_orch/nodes/' + id + '/status.json', JSON.stringify({ verdict: 'DONE' }))
  files.set('_orch/nodes/T201/handoff.md', '# T201\n\n## Done-criteria\n1. Red first: a new test that exports ten megabytes and asserts that no more than one record is held in memory at any time, failing at the base.\n2. Green: the streaming path flushes every record as soon as it is complete; the buffered path stays behind a flag.\n')
  files.set('_orch/nodes/T201/work/red.txt', 'red: 3 new tests fail at the base (the buffered path holds every record until the end of the export)\n')
  files.set('_orch/nodes/T201/work/green.txt', 'green: 582 pass, 0 fail\n')
  files.set('_orch/verify/T201-verdict.json', JSON.stringify({ verdict: 'CONFIRMED', probe: 'reverted the product to the base and re-ran the new tests: all three fail; restored, all pass', criteria: [{ criterion: 'Red first: a new test that exports ten megabytes and asserts that no more than one record is held in memory at any time', verdict: 'CONFIRMED', probe: 'node --test test/export/stream.test.mjs at the base: 3 fail; at the tip: 3 pass; the memory probe peaks at one record' }] }))
  files.set('_orch/nodes/T203/status.json', JSON.stringify(T203_STATUS))
  files.set('_orch/inbox/Q-7.md', Q7)
  files.set('_orch/inbox/Q-7.asked.md', 'asked_at: 2026-11-06T08:30:00Z\nasked_via: terminal\ngate: G2\n')
  files.set('_orch/inbox/Q-8.md', Q8)
  dirs.set('_orch/phases', ['P1', 'P2', 'P3'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/nodes', [...P1N, ...P2N, ...P3N].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/inbox', [{ name: 'Q-7.md', kind: 'file' }, { name: 'Q-7.asked.md', kind: 'file' }, { name: 'Q-8.md', kind: 'file' }])
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
  on('fs.exists', (_$: any, e: any) => {
    const p = rel(e.path)
    return { value: files.has(p) || dirs.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('fs.list', (_$: any, e: any) => {
    const v = dirs.get(rel(e.path))
    return v ? { value: v } : { deny: 'no such directory' }
  })
  on('store.get', (_$: any, e: any) => ({ value: store.has(e.key) ? store.get(e.key) : undefined }))
  on('store.set', (_$: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_$: any, e: any) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  // every open of the pane, as the engine is asked it
  const opens: any[] = []
  on('ui.open', (_$: any, e: any) => (opens.push({ ...e }), { value: { id: 'baton', isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: [''] })
  })
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: OPUS }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.319', base: '2.1.319' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  on('model.complete', () => ({ isAnswered: true, text: 'a remark', usage: null }))
  // the gh CLI (the PR and its review), git, and the memo CLI the mod drives (bin/memo.mjs --json shapes, as
  // mod/tests/t12-memtable.test.ts and fx4-keys-scroll.test.ts answer it)
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view') out = PR
    else if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'view') out = { ...ISSUE, labels: [] }
    else if (argv[0] === 'gh') out = []
    else if (argv[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    else if (argv.includes('stats')) out = { notes: NOTES.length, summaries: 2, treeCapacity: 7, levels: 2, pending: 0, ready: 2 }
    else if (argv.includes('recall')) out = argv.includes('rulings') ? { pattern: '.', total: RULINGS.length, notes: RULINGS, blocks: [] } : { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) {
      const tiles = [{ level: 2, index: 0, lo: 0, hi: 4 }, { level: 1, index: 2, lo: 4, hi: 6 }, ...NOTES.slice(6).map((n) => ({ level: 0, index: n.i, lo: n.i, hi: n.i + 1 }))]
      const lines = ['#0-3 (4 notes) P1 planned the parser and its two nodes were verified; the prime opened P2 and dispatched its sub-orchestrator with the brief', '#4-5 (2 notes) the export nodes T201 and T202 returned DONE and their verifiers confirmed them', ...NOTES.slice(6).map((n) => '#' + n.i + ' ' + n.ts + ' [' + n.tag + '] ' + n.text)]
      out = { header: 'h', tiles, lines }
    } else if (argv.includes('marks') || argv.includes('superseded')) out = []
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  const byPrompt = new Map(AGENTS.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: byPrompt.get(e.prompt)?.id ?? 'x-' + e.description, model: byPrompt.get(e.prompt)?.model ?? OPUS }))
  on('turn.step', async function* (_$: any, e: any) {
    const a = AGENTS.find((x) => x.id === e.agentId)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: a?.model ?? OPUS, input_tokens: 41000, output_tokens: 12000, cache_read_input_tokens: 380000, cache_creation_input_tokens: 16000 } }
  })
  mock.env(on, {})
  mock.session(on)

  async function settle(ms = 10) {
    await clock.advance(ms)
    await clock.settle()
  }
  async function begin($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(200000) // past the PR poll, so the PR row, its review and the merge-ready rows exist
    for (const a of AGENTS) {
      await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
      // the effort the step carries, with no classic input naming one: a configured effort, drawn `· <effort> cfg` (T8E)
      const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, effort: a.effort } as any)
      for (let x = await g.next(); !x.done; x = await g.next());
    }
    for (const c of CALLS) {
      await settle(7000)
      await $.tool.call({ ...c, agentId: 'w1' } as any)
    }
    for (const a of [...AGENTS].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: a.done, isAborted: false } as any)
    await settle(61000) // past the mod's own re-read interval, so the pane reads the run as it stands
  }
  const props = (w: number, rows: number) => ({ title: 'baton', isFocused: true, bodyColumns: w, placement: w > 100 ? 'inline' : 'dock', scroll: { bodyRows: rows, offset: 0 } })
  async function pane($: any, w: number, rows: number) {
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props(w, rows) as any })
    await settle()
    await ui.redraw(props(w, rows) as any)
    return ui
  }
  return { clock, settle, begin, pane, props, opens }
}
type World = ReturnType<typeof world>

// ---- the views (the inventory, _orch/nodes/PW1/work/inventory.md) --------------------------------------------

type View = { name: string; go: ($: any, w: World, ui: any) => Promise<void>; band?: boolean }
async function press(w: World, ui: any, key: string) {
  const all = await ui.findAll({ type: 'Button' })
  if (!all.some((b: any) => b.key === key || b.props?.key === key)) throw new Error('no Button ' + key + ' drawn: ' + all.map((b: any) => b.key ?? b.props?.key).join(' '))
  await ui.press({ key })
  await w.settle(100)
}
const show = (what: string) => async ($: any, w: World) => {
  await $.command.run({ command: 'baton', args: 'show ' + what } as any)
  await w.settle(100)
}
const memory = (then?: string) => async (_$: any, w: World, ui: any) => {
  await press(w, ui, 'tab-memory')
  await ui.redraw()
  if (then) await press(w, ui, then)
}
const VIEWS: View[] = [
  { name: 'work', go: async () => {} }, // band rows, goal line, PR and merge rows, findings, approval, legend, the tree, hint, questions, rulings
  { name: 'work-nodes', go: async (_$, w, ui) => press(w, ui, 'nodes-toggle') }, // p: every node row, every merge-ready row
  { name: 'agent', go: show('T201 streaming') }, // a finished agent's view: its rows, its task, TC1's tool-call table
  { name: 'agent-live', go: show('T212 streaming') }, // a running agent's view and its message field
  { name: 'agent-blocked', go: show('T203 streaming') }, // a blocked agent row's brief
  { name: 'phase', go: show('P2') }, // a phase's view: its steps, brief, nodes
  { name: 'phase-waiting', go: show('P1') }, // a phase that waits for the operator's check
  { name: 'node', go: show('T201') }, // a node's view: criteria, red/green/blue, the verifier
  { name: 'node-blocked', go: show('T203') }, // a blocked node row's brief
  { name: 'question', go: async (_$, w, ui) => press(w, ui, 'open-q-Q-7') }, // a question's brief, put to the operator
  { name: 'question-queued', go: async (_$, w, ui) => press(w, ui, 'open-q-Q-8') }, // a queued question's brief
  { name: 'memory', go: memory() }, // Memory: its keys, rulings, the table
  { name: 'memory-drill', go: memory('mem-open-0') }, // a summary drilled into
  { name: 'memory-note', go: memory('mem-row-2') }, // a note's view: its text and marks
  { name: 'memory-ruling', go: memory('open-r-1') }, // a ruling's view
  { name: 'memory-project', go: memory('mem-store') }, // the project memory
  { name: 'memory-filter', go: memory('mem-filter-ok') }, // a filter (confirmed only)
  { name: 'memory-hint', go: memory('mem-key-c') }, // a mark key's hint line (the marks dialog itself is the engine's)
  { name: 'band', go: async () => {}, band: true }, // the band above the prompt
]

/** A view as drawn `width` cells wide and `rows` lines tall. */
async function render($: any, on: any, view: View, width: number, rows = 200) {
  const w = world(on)
  await w.begin($)
  if (view.band) {
    const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: width, scroll: {} } as any })
    const els = elements(await ui.drawn(), width)
    await ui.unmount()
    return { els, w }
  }
  const ui = await w.pane($, width, rows)
  await view.go($, w, ui)
  await ui.redraw(w.props(width, rows) as any)
  await w.settle(100)
  const els = elements(await ui.drawn(), width)
  await ui.unmount()
  return { els, w }
}

// ---- what is checked --------------------------------------------------------------------------------------

/** No drawn line wider than the pane, and nothing the terminal has to cut, shrink or wrap. */
function fits(els: El[], width: number, where: string) {
  const bad: string[] = []
  screen(els).forEach((l, i) => {
    if (cellW(l) > width) bad.push('line ' + i + ' is ' + cellW(l) + ' cells: |' + l + '|')
  })
  for (const e of els) {
    for (const l of e.leaves) {
      if (l.boxed || l.kind === 'button') continue // a cell the mod draws in a box of a set width; a Button is never shrunk
      if (l.drawn !== l.text) bad.push('the terminal cut ' + JSON.stringify(l.text) + ' to ' + JSON.stringify(l.drawn) + ' in |' + e.lines.join('/') + '|')
      else if (l.h > 1) bad.push('the terminal wrapped ' + JSON.stringify(l.text) + ' onto ' + l.h + ' lines')
    }
  }
  expect(bad.slice(0, 6), where + ': ' + bad.length + ' faults' + dump(els)).toEqual([])
}

const AGENT_ROW = /(?:◆ prime|(?:sub-orch|worker|verifier) (?:P[12] |T2\d\d ))/
/** Every agent row of the tree: its exact model and effort drawn whole on one of its lines. */
function modelsWhole(els: El[], width: number, where: string) {
  const rows = els.filter((e) => e.leaves.length > 1 && AGENT_ROW.test(e.text) && /›/.test(e.text))
  expect(rows.length, where + ': no agent row drawn' + dump(els)).toBeGreaterThan(0)
  const bad: string[] = []
  for (const e of rows) {
    const a = AGENTS.find((x) => e.text.includes(x.description))
    const want = a ? a.want : /◆ prime/.test(e.text) ? 'opus 5.5' : null
    if (!want) continue
    if (!e.lines.some((l) => new RegExp('(^|\\s)' + want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(l))) bad.push(want + ' not whole in |' + e.lines.join('/') + '|')
  }
  expect(bad, where + ' at ' + width + dump(els)).toEqual([])
}

/** Each key with its word, whole on one drawn line. */
function keysShown(els: El[], keys: string[], where: string) {
  const lines = screen(els)
  const missing = keys.filter((k) => !lines.some((l) => l.includes(k)))
  expect(missing, where + ': keys not drawn whole' + dump(els)).toEqual([])
}
const HINT_KEYS = ['↑/↓ then', 'Enter on', '✉ messages', 'p shows', 'b goes back'] // Work's key hint (register.js messageField)
const TAB_KEYS = ['1: Work', '2: Memory', 'r: refresh']
const MEMORY_KEYS = ['s: ', '3: confirmed', '4: void', 'c: ✅', 'v: ❌', 'u: clear'] // Memory's own keys (memoryKeys)

/** Prose wrapped at the drawn width: no line cut, and no line that the next one's first word would still have fitted on. */
function wrapsAtWidth(els: El[], width: number, head: RegExp, prose: string, where: string) {
  const at = els.findIndex((e) => head.test(e.text))
  expect(at, where + ': no ' + head + dump(els)).toBeGreaterThanOrEqual(0)
  const block: string[] = []
  for (const e of els.slice(at + 1)) {
    const t = e.lines.join('\n')
    if (!t.trim() || /^\s*… \d+ more lines/.test(t)) break
    block.push(...e.lines)
  }
  expect(block.length, where + ': no prose under ' + head + dump(els)).toBeGreaterThan(0)
  const words = prose.split(/\s+/)
  const drawn = block.join(' ').trim().split(/\s+/)
  expect(drawn, where + ': the prose is not drawn whole, in order' + dump(els)).toEqual(words.slice(0, drawn.length))
  // where each paragraph starts, as a word index: a line may end early there
  const starts = new Set<number>()
  let n = 0
  for (const p of prose.split('\n')) {
    starts.add(n)
    n += p.split(/\s+/).length
  }
  let at2 = 0
  for (let i = 0; i + 1 < block.length; i++) {
    at2 += block[i]!.trim().split(/\s+/).length
    if (starts.has(at2)) continue
    const next = block[i + 1]!.trim().split(/\s+/)[0]!
    expect(cellW(block[i]!) + 1 + cellW(next), where + ': line ' + i + ' broke early, |' + block[i] + '| then ' + next + dump(els)).toBeGreaterThan(width)
  }
}

for (const width of WIDTHS) {
  for (const v of VIEWS) {
    test('PW1: the ' + v.name + ' view at ' + width + ' columns: every line fits the pane and the terminal cuts, shrinks or wraps nothing', SLOW, async ($, on) => {
      const { els } = await render($, on, v, width)
      fits(els, width, v.name + ' at ' + width)
      // the keys every view of the pane draws
      if (!v.band) keysShown(els, ['1: Work', '2: Memory'], v.name + ' at ' + width)
      if (v.name === 'work' || v.name === 'work-nodes') keysShown(els, [...TAB_KEYS, ...HINT_KEYS, v.name === 'work' ? 'p: every node' : 'p: hide the nodes'], v.name + ' at ' + width)
      if (/^(agent|phase|node|question)/.test(v.name)) keysShown(els, ['b: ‹ back', 'r: refresh'], v.name + ' at ' + width)
      if (/^question/.test(v.name)) keysShown(els, ['a: answer'], v.name + ' at ' + width)
      if (/blocked$/.test(v.name)) keysShown(els, ['y: overrule'], v.name + ' at ' + width)
      if (v.name === 'phase-waiting') keysShown(els, ['y: approve'], v.name + ' at ' + width)
      if (/^memory/.test(v.name)) keysShown(els, MEMORY_KEYS, v.name + ' at ' + width)
      if (v.name === 'memory') keysShown(els, ['x retracts', '+ then', 'Enter opens', 'b goes back'], v.name + ' at ' + width)
      if (v.band) keysShown(els, ['1: approve', '2: send back'], v.name + ' at ' + width)
    })
  }

  test('PW1: at ' + width + ' columns every agent row of the tree draws its exact model and effort whole', SLOW, async ($, on) => {
    if (width < DOCKED_MIN) return // 40 columns: under the narrowest dock, it degrades (checked above: it still fits)
    const { els } = await render($, on, VIEWS[0]!, width)
    modelsWhole(els, width, 'work')
  })

  // the agent's own view: T201 (sonnet at medium), T212 (opus at high, running), T203 (sonnet at medium, blocked)
  for (const [name, a] of [['agent', AGENTS[2]!], ['agent-live', AGENTS[13]!], ['agent-blocked', AGENTS[4]!]] as const) {
    test('PW1: at ' + width + ' columns the ' + name + ' view draws its exact model and effort whole on its model line', SLOW, async ($, on) => {
      if (width < DOCKED_MIN) return
      const { els } = await render($, on, VIEWS.find((x) => x.name === name)!, width)
      const lines = screen(els)
      const at = lines.findIndex((l) => /^model\s/.test(l))
      expect(at, name + ' at ' + width + ': no model line' + dump(els)).toBeGreaterThanOrEqual(0)
      expect(lines[at]!.includes(a.want), name + ' at ' + width + ': ' + a.want + ' not whole on the model line' + dump(els)).toBe(true)
    })
  }

  test("PW1: at " + width + " columns an agent's task wraps at the drawn width, whole", SLOW, async ($, on) => {
    const { els } = await render($, on, VIEWS[2]!, width)
    wrapsAtWidth(els, width, /^\s*the task it was given\s*$/, LONG_TASK, 'agent at ' + width)
  })

  test('PW1: at ' + width + " columns a note's text wraps at the drawn width, whole", SLOW, async ($, on) => {
    const { els } = await render($, on, VIEWS.find((x) => x.name === 'memory-note')!, width)
    const at = els.findIndex((e) => /note #6/.test(e.text))
    expect(at, 'memory-note at ' + width + ': no title' + dump(els)).toBeGreaterThanOrEqual(0)
    const block: string[] = []
    for (const e of els.slice(at + 1)) {
      const t = e.lines.join('\n')
      if (!t.trim()) break
      block.push(...e.lines)
    }
    const words = NOTE_6.split(/\s+/)
    expect(block.join(' ').trim().split(/\s+/), 'memory-note at ' + width + dump(els)).toEqual(words)
    for (let i = 0; i + 1 < block.length; i++) {
      const next = block[i + 1]!.trim().split(/\s+/)[0]!
      expect(cellW(block[i]!) + 1 + cellW(next), 'memory-note at ' + width + ': line ' + i + ' broke early' + dump(els)).toBeGreaterThan(width)
    }
  })

  test('PW1: in a ' + SHORT + '-line pane at ' + width + ' columns the Work view fits the pane: the list scrolls in it and the key hint stays', SLOW, async ($, on) => {
    const { els } = await render($, on, VIEWS[0]!, width, SHORT)
    fits(els, width, 'short work at ' + width)
    if (width < DOCKED_MIN) return
    const all = screen(els)
    expect(all.length, SHORT + '-line pane at ' + width + ' drew ' + all.length + ' lines' + dump(els)).toBeLessThanOrEqual(SHORT)
    expect(all.some((l) => /↓\s*\d+\s+more/.test(l)), 'the list scrolls: a ↓ more line' + dump(els)).toBe(true)
    keysShown(els, HINT_KEYS, 'short work at ' + width)
    modelsWhole(els, width, 'short work')
  })
}

test('PW1: every open of the pane asks Claude Code for its ceiling width (columns), at the spawn, at /baton and from the band', SLOW, async ($, on) => {
  const w = world(on)
  await w.begin($) // the first spawn opens the pane by itself (autoOpenPane)
  await $.command.run({ command: 'baton', args: '' } as any) // /baton
  await w.settle(100)
  const band = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 120, scroll: {} } as any })
  await band.press({ key: 'band-sendback' }) // 2 on the band: send a waiting phase back, from the pane
  await w.settle(100)
  await band.unmount()
  expect(w.opens.length, 'the pane was opened three ways: ' + JSON.stringify(w.opens)).toBeGreaterThanOrEqual(3)
  for (const o of w.opens) {
    expect(o.id, JSON.stringify(o)).toBe('baton')
    // types PaneOpenArgs.columns: a request the engine clamps to at most 45% of the terminal (2.1.319: and to
    // cols - 60); a request past any terminal's ceiling opens the dock at its ceiling
    expect(typeof o.columns === 'number' && Number.isInteger(o.columns) && o.columns >= 255, 'columns on ' + JSON.stringify(o)).toBe(true)
  }
})
