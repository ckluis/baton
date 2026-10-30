// claude plugin test — T13, part B: the question's brief and answering from it (C14).
//
// Written from the spec (docs/designs/v7.6-tuning.md L190-246) and the operator's answers BEFORE the implementation
// (node T113B, a split red step of F113). Requirement ids are the rows of _orch/plan/traceability.yaml, cluster C14:
// R-C14-04 the question's brief, R-C14-07 a key answers it, R-C14-12 the answer reaches the asking node, R-C14-13 the
// answer file, R-C14-14 the `?` row leaves the pane, R-C14-15 how an answer is entered, R-C14-16 how it reaches a node
// that has returned BLOCKED, R-C14-20 a test that answers from the brief, R-C14-24 what an open question is, R-C14-38
// answering a queued question. Expected values come from the spec, the inbox answers (Q-35, Q-36, Q-42, Q-45, Q-48,
// OQ7), the decided defaults plan/decisions/Q-40.md and Q-41.md, T113A's work/t13-answers.md and work/key-scheme.md
// (the brief's answer key `a`, `b` goes back), and this file's fixture; none is copied from the implementation.
//
// Every test whose name does not start `guard:` must fail at the run tip da5910c by its own assertion. A `guard:` test
// pins behaviour that already works at da5910c (inbox/OQ7.answer.md: "preservation guards"), and passes there.
//
// Ownership (hazard H28): these tests read the `?` row's presence and colour, the brief's text, the dialog `$.ui.ask`
// raises, the files the pane writes under _orch/inbox, the run notes it puts and the messages it sends; never a whole
// rendered row string of an agent row.
//
// The world (as T113A's mod/tests/t13-keys.test.ts): the engine beneath the mod answers from memory: a prime manifest
// naming this session, a plan with nodes N1, T5, T7, N3, the prime and agent rows, and in the inbox the questions below.
// Directory entries carry the engine's kind `'dir'` (types index.d.ts:5066, E1 §m).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session

// ------------------------------------------------------------------ the fixture's questions
// Each is in rule 10 step 1's shape (rules/rule-10-the-operator-lane.md: "the question, the node it blocks, and what
// the run will assume if it goes unanswered — ending with one line: `Blocked by: ...`").

// fixture: a line longer than the pane's 160 columns, so the brief has to wrap it (plan/decisions/Q-40.md "wrapped to
// the pane's width").
const LONG = '**Context.** The export is read by three teams downstream, by the archive job that runs every night, and by the auditors who compare each report with the ledger of the month it covers.'
const Q71 = [
  '# Q-71 · Which date format does the export use?',
  '',
  '**Question.** The export writes every date in a report. Which format should it use?',
  '',
  LONG,
  '',
  '1. **(recommended)** ISO 8601, 2026-10-19.',
  '2. US style, 10/19/2026.',
  '3. The locale of the reader.',
  '',
  '**Nodes it blocks:** N1.',
  '',
  '**If unanswered, the run assumes:** option 1.',
  '',
  'Blocked by: docs/export.md:"dates follow the house style" (interpreted)',
  '',
].join('\n')
const Q71_FIRST = 'Q-71 · Which date format does the export use?' // fixture: Q-71.md's first line, its `# ` heading mark aside
const Q71_BLOCKED_BY = 'Blocked by: docs/export.md:"dates follow the house style" (interpreted)' // fixture: Q-71.md's last line
// fixture: a phrase of each numbered option of Q-71.md, in the order listed; the first is the recommended one.
const Q71_OPTIONS = ['ISO 8601', 'US style', 'locale of the reader']

const Q72 = [
  '# Q-72 · May the export drop the legacy column?',
  '',
  '**Question.** The legacy column is unused since v6. May the export drop it?',
  '',
  '1. **(recommended)** Drop it.',
  '2. Keep it until v9.',
  '',
  '**Nodes it blocks:** T5.',
  '',
  '**If unanswered, the run assumes:** option 2.',
  '',
  'Blocked by: docs/export.md:"the legacy column stays until v9" (explicit)',
  '',
].join('\n')
const Q72_FIRST = 'Q-72 · May the export drop the legacy column?' // fixture: Q-72.md's first line, `# ` aside
const Q72_NODE = 'T5' // fixture: the node Q-72.md names ("**Nodes it blocks:** T5."), whose envelope reads BLOCKED

// A queued question: no asked record (Q-42: "a write-once Q-<id>.asked.md with asked_at and asked_via is the asked
// record"; spec L232-233 "Until that record names the question, it is queued").
const Q73 = [
  '# Q-73 · Should the export compress its files?',
  '',
  '**Question.** Reports reach 40 MB. Should the export gzip them?',
  '',
  '1. **(recommended)** Yes, gzip every file.',
  '2. No, leave them as they are.',
  '',
  '**Nodes it blocks:** N3.',
  '',
  '**If unanswered, the run assumes:** option 1.',
  '',
  'Blocked by: docs/export.md:"files stay small" (interpreted)',
  '',
].join('\n')
const Q73_OPTIONS = ['gzip every file', 'leave them as they are'] // fixture: Q-73.md's options

// A question with a numbered list before its `**Options**` list, five options, and the recommended one second.
const Q74 = [
  '# Q-74 · How often should the export run?',
  '',
  '**Question.** Today:',
  '',
  '1. The export runs at 02:00.',
  '2. It takes ten minutes.',
  '',
  'How often should it run?',
  '',
  '**Options**',
  '1. Keep the nightly export.',
  '2. **(recommended)** Move to an hourly export.',
  '3. Export on demand only.',
  '4. Export weekly.',
  '5. Stop exporting.',
  '',
  '**Nodes it blocks:** T7.',
  '',
  '**If unanswered, the run assumes:** option 2.',
  '',
  'Blocked by: docs/export.md:"reports are fresh" (interpreted)',
  '',
].join('\n')
// fixture: a phrase of each option of Q-74.md's `**Options**` list, in the order listed, and of its earlier list.
const Q74_OPTIONS = ['nightly', 'hourly', 'on demand', 'weekly', 'Stop exporting']
const Q74_RECOMMENDED = 'hourly' // fixture: Q-74.md marks option 2 `**(recommended)**`
const Q74_NOT_OPTIONS = ['runs at 02:00', 'ten minutes'] // fixture: Q-74.md's first numbered list, which is not its Options
const Q74_AGENT = 'T7 worker' // fixture: the live agent of node T7, the node Q-74.md names (labels name the node, as a dispatch does)

// A question with no numbered options at all.
const Q75 = [
  '# Q-75 · Is the export ready for review?',
  '',
  '**Question.** The export is done and its tests pass. Is it ready for review?',
  '',
  '**Nodes it blocks:** N3.',
  '',
  '**If unanswered, the run assumes:** yes, it goes to review.',
  '',
  'Blocked by: docs/export.md:"a reviewer signs off" (explicit)',
  '',
].join('\n')

// A question with an answer file: the guard of criterion 9 (register.js ~2253-2256 at da5910c, per the handoff).
const Q70 = '# Q-70 · Which archive keeps the reports?\n\n**Nodes it blocks:** N1.\n\nBlocked by: docs/export.md:"reports are kept" (interpreted)\n'
const Q70_ANSWER = '# Q-70 answer (binding, operator, 2026-10-19)\n\n**Answer:** the cold archive.\n'

// A question whose only answer file carries `unauthorized: true` (rule 10: such an answer "is **not** applied").
const Q76 = [
  '# Q-76 · May the export include the salary column?',
  '',
  '**Question.** The salary column is restricted. May the export include it?',
  '',
  '1. **(recommended)** No.',
  '2. Yes.',
  '',
  '**Nodes it blocks:** N1.',
  '',
  'Blocked by: docs/export.md:"restricted columns stay out" (explicit)',
  '',
].join('\n')
const Q76_UNAUTH_TEXT = 'Yes, include it for everyone.' // fixture: the unauthorized answer's text
const Q76_ANSWER = ['# Q-76 answer', '', 'answered_by: mallory', 'answered_via: github-thread', 'unauthorized: true', '', '**Answer:** ' + Q76_UNAUTH_TEXT, ''].join('\n')

// Q-42 (inbox/Q-42.answer.md) and Q-42.md option 1: the asked record holds asked_at, asked_via and gate.
const asked = (at: string) => 'asked_at: ' + at + '\nasked_via: terminal\ngate: G1\n'
// Rule 2's envelope with the verdict BLOCKED (Q-38: a blocked row); T5 has returned.
const T5_STATUS = { node: 'T5', rung: 1, model: 'claude-opus-5-5', effort: 'medium', attempt: 1, verdict: 'BLOCKED', outputs: [], summary: 'T5 is BLOCKED on Q-72: may the export drop the legacy column.', evidence: [], risk: 'none', caveats: [], escalation_reason: null, handback: null }

const AGENTS = ['alpha worker', Q74_AGENT] // fixture agent rows; `T7 worker` stays live (never ends)

type Ev = { kind: 'write'; path: string; text: string } | { kind: 'note'; tag: string; text: string } | { kind: 'send'; to: string; text: string } | { kind: 'ask'; q: string; options: string[] }

function world(on: any, opts: { answer?: (labels: string[]) => string } = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const events: Ev[] = []
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', '- id: N1\n  phase: 1\n- id: T5\n  phase: 2\n- id: T7\n  phase: 2\n- id: N3\n  phase: 3\n')
  dirs.set('_orch/phases', [1, 2, 3].map((n) => ({ name: 'P' + n, kind: 'dir' })))
  for (const n of [1, 2, 3]) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  dirs.set('_orch/nodes', [{ name: 'T5', kind: 'dir' }])
  dirs.set('_orch/nodes/T5', [{ name: 'handoff.md', kind: 'file' }, { name: 'status.json', kind: 'file' }])
  files.set('_orch/nodes/T5/handoff.md', '# HANDOFF — T5\n\nExport the report.\n')
  files.set('_orch/nodes/T5/status.json', JSON.stringify(T5_STATUS, null, 2) + '\n')
  const at = (ms: number) => new Date(t0 - ms).toISOString()
  files.set('_orch/inbox/Q-70.md', Q70)
  files.set('_orch/inbox/Q-70.answer.md', Q70_ANSWER)
  files.set('_orch/inbox/Q-71.md', Q71)
  files.set('_orch/inbox/Q-71.asked.md', asked(at(600000)))
  files.set('_orch/inbox/Q-72.md', Q72)
  files.set('_orch/inbox/Q-72.asked.md', asked(at(500000)))
  files.set('_orch/inbox/Q-73.md', Q73) // queued: no asked record
  files.set('_orch/inbox/Q-74.md', Q74)
  files.set('_orch/inbox/Q-74.asked.md', asked(at(400000)))
  files.set('_orch/inbox/Q-75.md', Q75)
  files.set('_orch/inbox/Q-75.asked.md', asked(at(300000)))
  files.set('_orch/inbox/Q-76.md', Q76)
  files.set('_orch/inbox/Q-76.asked.md', asked(at(200000)))
  files.set('_orch/inbox/Q-76.answer.md', Q76_ANSWER)
  const inboxList = () => [...files.keys()].filter((k) => k.startsWith('_orch/inbox/')).map((k) => ({ name: k.slice('_orch/inbox/'.length), kind: 'file' }))
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
    const p = rel(e.path)
    files.set(p, e.text)
    events.push({ kind: 'write', path: p, text: e.text })
    return { value: undefined }
  })
  on('fs.exists', (_$: any, e: any) => {
    const p = rel(e.path)
    return { value: files.has(p) || dirs.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) }
  })
  on('fs.list', (_$: any, e: any) => {
    const p = rel(e.path)
    if (p === '_orch/inbox') return { value: inboxList() }
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
  // A message to an agent (the pane's ✉ path, $.session.send): recorded, and delivered (types: SessionSendResult).
  on('session.send', (_$: any, e: any) => {
    events.push({ kind: 'send', to: typeof e.to === 'string' ? e.to : JSON.stringify(e.to), text: String(e.text) })
    return { isDelivered: true }
  })
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  // $.ui.ask is a tool.call of AskUserQuestion (types index.d.ts "A `tool.call` of `AskUserQuestion`"; as
  // mod/tests/approvals.test.ts answers it). Q-35: the answer is entered through $.ui.ask. The dialog returns the label
  // chosen, or the text typed under "Other" (types: "resolves to the label they chose, or the text typed under Other").
  const choose = opts.answer ?? ((labels: string[]) => labels[0])
  const chosen: string[] = []
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options = (q.options || []).map((o: any) => String(o.label))
    events.push({ kind: 'ask', q: String(q.question), options })
    const a = choose(options)
    chosen.push(a)
    return { result: { questions: e.questions, answers: { [q.question]: a } } }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv.includes('note')) {
      // A run note (the memo CLI's `note --tag <tag> -`, the text on stdin, as mod/tests/approvals.test.ts reads it).
      events.push({ kind: 'note', tag: String(argv[argv.indexOf('--tag') + 1]), text: String(e.init?.stdin ?? '') })
      out = { index: events.length, text: '', truncated: false, merges: [] }
    } else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = { header: 'h', tiles: [], lines: [] }
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
  /** Start the session, spawn the agents, and open the pane with a window taller than every row (no scrolling). */
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    for (const d of AGENTS) {
      await $.agent.spawn({ prompt: 'do the work', description: d, subagentType: 'baton:worker' } as any)
      await settle(10)
    }
    await settle(61000) // past the mod's own re-read interval, so the pane reads the record as it now stands
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 600 } } as any })
  }
  const writes = () => events.filter((x): x is Extract<Ev, { kind: 'write' }> => x.kind === 'write')
  const notes = () => events.filter((x): x is Extract<Ev, { kind: 'note' }> => x.kind === 'note')
  const sends = () => events.filter((x): x is Extract<Ev, { kind: 'send' }> => x.kind === 'send')
  const asks = () => events.filter((x): x is Extract<Ev, { kind: 'ask' }> => x.kind === 'ask')
  return { settle, pane, files, events, writes, notes, sends, asks, chosen }
}

// ------------------------------------------------------------------ reading the drawn tree (as T113A's t13-keys.test.ts)

type Row = { text: string; buttons: any[] }

const strings = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(strings).join('')
  if (n.type === 'Button') return '' // a Button's label is its control, not the row's text
  return (n.children || []).map(strings).join('')
}

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
      out.push({ text: strings(n), buttons })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}

const labelOf = (b: any) => String((b.props && b.props.label) ?? strings(b.children) ?? '')
const isMessage = (b: any) => labelOf(b).includes('✉')
const openers = (r: Row) => r.buttons.filter((b) => !isMessage(b))
const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? labelOf(b))

function rowOf(tree: any, re: RegExp): Row | undefined {
  const hits = rowBoxes(tree).filter((r) => re.test(r.text) && openers(r).length > 0)
  hits.sort((a, b) => a.buttons.length - b.buttons.length)
  return hits[0]
}
const enterButton = (r: Row) => openers(r).find((b) => labelOf(b).includes('›')) ?? openers(r)[0]

async function hotkeyButtons(ui: any) {
  return (await ui.findAll({ type: 'Button' })).filter((b: any) => typeof b.props.hotkey === 'string')
}
/** A view is open: its `‹ back` (hotkey `b`, E1 §k: "`b` | :1359 | ‹ back from an agent/phase/node view") is drawn. */
async function viewIsOpen(ui: any) {
  return (await hotkeyButtons(ui)).some((b: any) => b.props.hotkey === 'b')
}
async function shownText(ui: any) {
  return strings(await ui.drawn())
}
const qRe = (id: string) => new RegExp('(^|[^A-Za-z0-9-])' + id + '([^0-9]|$)')
const squash = (s: string) => s.replace(/\s+/g, '') // wrapping only moves whitespace (Q-40 "wrapped to the pane's width")

// c32-wrap-begin (verdict T113B r1: squash() alone lets a cut line pass, so the wrap itself is read from the tree)
const PANE_COLUMNS = 160 // the pane's width: the bodyColumns this file mounts the Pane with (world().pane)
/**
 * The places the tree draws `line` cut instead of wrapped. A paint unit is an outermost Text (or Code) node; its wrap
 * is its own `wrap`, else the default `'wrap'` (index.d.ts:1700 "`'wrap'` (the default) continues it on rows under";
 * Text's spellings at :13219). Every spelling other than `'wrap'` cuts a line wider than the room (:1703
 * "`'truncate-end'` cuts it at the edge"). A unit holding `line`, or a piece of it, that cuts and whose row (its
 * nearest flexDirection 'row' Box, else itself) is wider than the pane is a cut: the line is not wrapped to the pane's
 * width. Pieces of `line` drawn one per row, each fitting the pane, are a wrapping and are not cut.
 */
function cutsOf(tree: any, line: string, columns: number): { text: string; wrap: any; width: number }[] {
  const want = squash(line)
  const out: { text: string; wrap: any; width: number }[] = []
  const width = (t: string) => Math.max(0, ...t.split('\n').map((l) => [...l].length))
  const walk = (n: any, row: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach((c: any) => walk(c, row))
    if (n.type === 'Button') return
    if (n.type === 'Text' || n.type === 'Code') {
      const text = strings(n)
      const sq = squash(text)
      const holds = sq.length > 0 && (sq.includes(want) || (sq.length >= 12 && want.includes(sq)))
      const wrap = (n.props && n.props.wrap) ?? 'wrap'
      const w = width(row ? strings(row) : text)
      if (holds && wrap !== 'wrap' && w > columns) out.push({ text, wrap, width: w })
      return
    }
    const isRow = n.type === 'Box' && n.props && n.props.flexDirection === 'row'
    ;(n.children || []).forEach((c: any) => walk(c, isRow ? n : row))
  }
  walk(tree, undefined)
  return out
}
// c32-wrap-end

/**
 * The drawn nodes that are `?` rows of question `id`: text starting `?` that names the id (the `?` row of spec L197,
 * L201; plan/decisions/Q-49.md "`? Q-42 · queued for G1 · <first line>`"). Each with the colour it is drawn in.
 */
function qRows(tree: any, id: string): { text: string; color: any }[] {
  const out: { text: string; color: any }[] = []
  const re = qRe(id)
  const walk = (n: any, color: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach((c) => walk(c, color))
    if (n.type === 'Button') return
    const c = (n.props && n.props.color) ?? color
    const t = strings(n).trim()
    const kids = (n.children || []).filter((k: any) => k && typeof k === 'object')
    const inner = kids.some((k: any) => strings(k).trim().startsWith('?') && re.test(strings(k)))
    if (t.startsWith('?') && re.test(t) && !inner) out.push({ text: t, color: c ?? firstColor(n) })
    else kids.forEach((k: any) => walk(k, c))
  }
  walk(tree, undefined)
  return out
}
function firstColor(n: any): any {
  if (!n || typeof n !== 'object') return undefined
  if (Array.isArray(n)) {
    for (const c of n) {
      const v = firstColor(c)
      if (v !== undefined) return v
    }
    return undefined
  }
  if (n.props && n.props.color !== undefined) return n.props.color
  return firstColor(n.children || [])
}
/** The colour the innermost drawn node holding `phrase` is drawn in (its own, else its nearest ancestor's). */
function colorOf(tree: any, phrase: string): any {
  const want = squash(phrase)
  let hit: any = undefined
  const walk = (n: any, color: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach((c) => walk(c, color))
    if (n.type === 'Button') return
    const c = (n.props && n.props.color) ?? color
    if (!squash(strings(n)).includes(want)) return
    const kids = (n.children || []).filter((k: any) => k && typeof k === 'object')
    if (kids.some((k: any) => squash(strings(k)).includes(want))) return kids.forEach((k: any) => walk(k, c))
    if (hit === undefined) hit = c ?? firstColor(n) ?? null
  }
  walk(tree, undefined)
  return hit
}

/** Open the brief of question `id` by Enter on its `›` (OQ6 part 1, T113A key-scheme.md §1), without asserting. */
async function openBrief(w: any, ui: any, id: string) {
  const r = rowOf(await ui.drawn(), qRe(id))
  if (r && openers(r).length) await ui.press({ key: keyOf(enterButton(r)) })
  await w.settle(100)
}
/** Press the brief's answer key `a` (T113A key-scheme.md §4: "Question's brief: `a` answers"), if it is drawn. */
async function pressAnswer(w: any, ui: any) {
  const a = (await hotkeyButtons(ui)).find((b: any) => b.props.hotkey === 'a')
  if (a) await ui.press({ key: keyOf(a) })
  await w.settle(100)
  await w.settle(100)
}
/** Leave a view by `b` if one is open, then let the pane re-read the record. */
async function backToList(w: any, ui: any) {
  const b = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === 'b')
  if (b) await ui.press({ key: keyOf(b) })
  await w.settle(61000)
}
/** Open question `id`'s brief and answer it from there. */
async function answerFromBrief(w: any, ui: any, id: string) {
  await openBrief(w, ui, id)
  await pressAnswer(w, ui)
}
const answerFile = (w: any, id: string): string | undefined => w.files.get('_orch/inbox/' + id + '.answer.md')
const lines = (s: string | undefined) => String(s ?? '').split('\n')

// ================================================================== missing #1-#4: the question's brief

test('missing #1 (c32): a question\'s brief shows every line of its Q-<n>.md, unreworded, wrapped to the pane\'s width', async ($, on) => {
  // Requirement R-C14-04: "Opening a `?` row shows its brief: the question as written in its `_orch/inbox/Q-<n>.md`."
  // (spec L201). plan/decisions/Q-40.md: "The whole file as written, markdown shown as plain text, wrapped to the pane's
  // width ... Nothing is summarised or reworded."
  const w = world(on)
  const ui: any = await w.pane($)
  await openBrief(w, ui, 'Q-71')
  const tree = await ui.drawn()
  const shown = squash(strings(tree))
  const missing = Q71.split('\n').filter((l) => l.trim() && !shown.includes(squash(l))) // every line of fixture Q-71.md, markdown as written (Q-40)
  expect(missing).toEqual([]) // Q-40: the whole file, unreworded
  // Q-40 "wrapped to the pane's width": the 184-column LONG line is not drawn in a Text that cuts it at 160 columns
  // (wrap 'truncate-end' or any spelling but 'wrap'); drawn whole and wrapping, or in pieces that each fit, it passes.
  expect(cutsOf(tree, LONG, PANE_COLUMNS)).toEqual([])
})

test('missing #2 (c33): a question\'s brief shows the file\'s Blocked by: line first', async ($, on) => {
  // Requirement R-C14-04 (spec L201). plan/decisions/Q-40.md: "with the `Blocked by:` line first ... and the rest
  // scrolling under it".
  const w = world(on)
  const ui: any = await w.pane($)
  await openBrief(w, ui, 'Q-71')
  const shown = squash(await shownText(ui))
  const at = (s: string) => shown.indexOf(squash(s))
  const by = at(Q71_BLOCKED_BY) // fixture: Q-71.md's Blocked by line, as written
  const rest = ['# Q-71 · Which date format', '**Question.** The export writes every date', '1. **(recommended)** ISO 8601'].map(at) // fixture: Q-71.md's other lines, as written
  expect({ blockedByShown: by >= 0, first: by >= 0 && rest.every((i) => i < 0 || i > by) }).toEqual({ blockedByShown: true, first: true }) // Q-40: Blocked by first
})

test('missing #3 (c34): the brief\'s Blocked by: line is coloured as the ? row colours it', async ($, on) => {
  // Requirement R-C14-04 (spec L201). plan/decisions/Q-40.md: "the `Blocked by:` line first in the question's colour
  // (as the `?` row colours it, register.js:1190)". The expected colour is the one the `?` row of Q-71 is drawn in.
  const w = world(on)
  const ui: any = await w.pane($)
  const row = qRows(await ui.drawn(), 'Q-71')[0]
  expect(row ? row.color : 'no ? row').not.toBe(undefined) // the ? row of Q-71 is drawn with a colour (spec L197)
  await openBrief(w, ui, 'Q-71')
  expect(colorOf(await ui.drawn(), Q71_BLOCKED_BY)).toBe(row.color) // Q-40: the brief's Blocked by line in the ? row's colour
})

test('missing #4 (c35): b in a question\'s brief goes back to the list', async ($, on) => {
  // Requirement R-C14-04 (spec L201). plan/decisions/Q-40.md: "`b` goes back". T113A key-scheme.md §4: "`b` goes back
  // (Q-40)".
  const w = world(on)
  const ui: any = await w.pane($)
  await openBrief(w, ui, 'Q-71')
  const inBrief = (await shownText(ui)).includes('**Question.** The export writes every date') // fixture Q-71.md's question line, as written (Q-40)
  const back = (await hotkeyButtons(ui)).find((b: any) => b.props.hotkey === 'b')
  if (back) await ui.press({ key: keyOf(back) })
  await w.settle(100)
  const after = { viewOpen: await viewIsOpen(ui), qRowShown: qRows(await ui.drawn(), 'Q-71').length > 0 }
  expect({ inBrief, hasB: !!back, ...after }).toEqual({ inBrief: true, hasB: true, viewOpen: false, qRowShown: true }) // Q-40: b leaves the brief for the list, where Q-71's ? row is drawn
})

// ================================================================== missing #5: the answer key opens $.ui.ask (Q-35)

test('missing #5 (c23): from a question\'s brief, the answer key opens $.ui.ask with the question\'s first line as its question', async ($, on) => {
  // Requirement R-C14-07: "From a question's brief, a key answers the question right there." (spec L203); R-C14-15
  // (L210). inbox/Q-35.answer.md: "A: both, through $.ui.ask: the parsed options as labels plus Other for free text";
  // Q-35.md option 1: "one answer key in the brief opens `$.ui.ask` with the question's first line". T113A
  // key-scheme.md §4: the answer key is `a`. Q-71 has the asked record t13-answers.md names (Q-71.asked.md, Q-42).
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  const qs = w.asks().map((x) => x.q)
  expect(qs.length === 1 && qs[0].includes(Q71_FIRST) ? 'asked with Q-71\'s first line' : JSON.stringify(qs)).toBe('asked with Q-71\'s first line') // Q-35 option 1; fixture Q71_FIRST
})

test('missing #5 (c24): the labels $.ui.ask receives are the question\'s numbered options, from its **Options** list or its first numbered list, at most 4', async ($, on) => {
  // Requirements R-C14-07 (L203), R-C14-15 (L210). Q-35.md option 1 (inbox/Q-35.answer.md, binding): "its numbered
  // options as labels (at most 4, parsed from the `**Options**` list or the first numbered list ...), and "Other" takes
  // free text".
  const optionsOf = (labels: string[], phrases: string[]) => labels.filter((l) => l !== 'Other').map((l) => phrases.find((p) => l.includes(p)) ?? 'not an option: ' + l)
  {
    const w = world(on)
    const ui: any = await w.pane($)
    await answerFromBrief(w, ui, 'Q-71') // Q-71.md has no **Options** heading: its first numbered list is its options
    const labels = w.asks()[0]?.options ?? []
    expect({ options: optionsOf(labels, Q71_OPTIONS), atMost4: labels.length <= 4 }).toEqual({ options: Q71_OPTIONS, atMost4: true }) // fixture Q-71.md's three options, in order (recommended already first)
  }
})

test('missing #5 (c24, c25): from the **Options** list, not an earlier numbered list, at most 4 labels, the recommended option first', async ($, on) => {
  // Requirements R-C14-07 (L203), R-C14-15 (L210). Q-35.md option 1 (inbox/Q-35.answer.md): "at most 4, parsed from
  // the `**Options**` list or the first numbered list; the recommended one first".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-74')
  const labels = w.asks()[0]?.options ?? []
  const named = labels.filter((l) => l !== 'Other')
  expect({
    asked: labels.length > 0,
    atMost4: labels.length <= 4, // Q-35: at most 4
    fromOptions: named.every((l) => Q74_OPTIONS.some((p) => l.includes(p))), // fixture Q-74.md's **Options** list
    notEarlierList: named.every((l) => !Q74_NOT_OPTIONS.some((p) => l.includes(p))), // fixture: Q-74.md's first numbered list is not its Options
  }).toEqual({ asked: true, atMost4: true, fromOptions: true, notEarlierList: true })
})

test('missing #5 (c25): the recommended option is the first label $.ui.ask receives', async ($, on) => {
  // Requirements R-C14-07 (L203), R-C14-15 (L210). Q-35.md option 1 (inbox/Q-35.answer.md): "the recommended one first".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-74')
  const first = w.asks()[0]?.options[0] ?? 'no dialog'
  expect(first.includes(Q74_RECOMMENDED) ? 'the recommended option' : first).toBe('the recommended option') // fixture: Q-74.md option 2 is (recommended)
})

test('missing #5 (c26): for a question with fewer than 2 parsed options, $.ui.ask offers Accept the default and Other', async ($, on) => {
  // Requirements R-C14-07 (L203), R-C14-15 (L210). Q-35.md option 1 (inbox/Q-35.answer.md): "A question with fewer than
  // 2 parsed options offers "Accept the default" and "Other"."
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-75') // fixture Q-75.md: no numbered options
  const labels = w.asks()[0]?.options ?? []
  expect({ accept: labels.includes('Accept the default'), other: labels.includes('Other') }).toEqual({ accept: true, other: true }) // Q-35 option 1, verbatim
})

// ================================================================== missing #6: the answer file (Q-35, Q-41)

test('missing #6 (c4): answering from the brief with the answer key writes _orch/inbox/Q-<n>.answer.md holding that answer', async ($, on) => {
  // Requirements R-C14-13 "The answer is also written to `_orch/inbox/Q-<n>.answer.md`," (spec L208), R-C14-20 "one that
  // answers a question from its brief" (L214). Q-35 (inbox/Q-35.answer.md): entered through $.ui.ask. T113A
  // key-scheme.md §4: `a` answers. Q-71 holds the asked record Q-42 names.
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  const a = w.chosen[0] ?? 'no dialog'
  const f = answerFile(w, 'Q-71')
  expect(f !== undefined && f.includes(a) ? 'Q-71.answer.md holds the answer' : 'no answer file with "' + a + '"').toBe('Q-71.answer.md holds the answer') // L208; the answer is the label the dialog returned
})

test('missing #6 (c27): when a label is chosen, the answer file records that label verbatim', async ($, on) => {
  // Requirements R-C14-13 (L208), R-C14-15 (L210). Q-35.md option 1 (inbox/Q-35.answer.md): "The answer file records
  // the label or the text verbatim." plan/decisions/Q-41.md: "`**Answer:** <label or text, verbatim>`".
  const w = world(on, { answer: (labels) => labels[1] ?? labels[0] }) // fixture: the operator picks the second label
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  const label = w.chosen[0] ?? 'no dialog'
  expect(lines(answerFile(w, 'Q-71')).includes('**Answer:** ' + label)).toBe(true) // Q-41: `**Answer:** <label>`, verbatim
})

test('missing #6 (c28): when text is typed under Other, the answer file records that text verbatim', async ($, on) => {
  // Requirements R-C14-13 (L208), R-C14-15 (L210). Q-35 (inbox/Q-35.answer.md): "plus Other for free text"; Q-35.md
  // option 1: "The answer file records the label or the text verbatim."
  const TYPED = 'ISO 8601 in files, the reader\'s locale on screen' // fixture: text typed under Other (no label)
  const w = world(on, { answer: () => TYPED })
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  expect(lines(answerFile(w, 'Q-71')).includes('**Answer:** ' + TYPED)).toBe(true) // Q-41: `**Answer:** <text, verbatim>`
})

test('missing #6 (c36): a pane-written answer file\'s first line is # Q-<n> answer (binding, operator, <date>)', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "A heading `# Q-<n> answer (binding, operator, <date>)`". The
  // date as the inbox's operator answers write it (inbox/OQ7.answer.md: "# OQ7 answer (binding, operator, 2026-10-19)").
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  expect(lines(answerFile(w, 'Q-71'))[0]).toMatch(/^# Q-71 answer \(binding, operator, \d{4}-\d{2}-\d{2}\)$/) // Q-41 heading
})

test('missing #6 (c37): a pane-written answer file holds the line answered_by: operator', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "a provenance block in rule 10's shape (`answered_by: operator`".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  expect(lines(answerFile(w, 'Q-71')).includes('answered_by: operator')).toBe(true) // Q-41, verbatim
})

test('missing #6 (c38): a pane-written answer file holds the line answered_via: pane', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "`answered_via: pane`".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  expect(lines(answerFile(w, 'Q-71')).includes('answered_via: pane')).toBe(true) // Q-41, verbatim
})

test('missing #6 (c39): a pane-written answer file holds an answered_at: line', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "`answered_at:` measured at write".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  expect(lines(answerFile(w, 'Q-71')).some((l) => /^answered_at: \S+/.test(l))).toBe(true) // Q-41: an answered_at line with a value
})

test('missing #6 (c40): a pane-written answer file holds a session: line naming the pane\'s session id', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "`session:` the pane's session id". fixture SID: the session
  // the pane runs in (session.id).
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  expect(lines(answerFile(w, 'Q-71')).includes('session: ' + SID)).toBe(true) // Q-41; fixture SID
})

test('missing #6 (c41): a pane-written answer file holds **Answer:** <label or text, verbatim>', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "then `**Answer:** <label or text, verbatim>`".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-71')
  const label = w.chosen[0] ?? 'no dialog'
  expect(lines(answerFile(w, 'Q-71')).includes('**Answer:** ' + label)).toBe(true) // Q-41, the label the dialog returned
})

// ================================================================== missing #7 and a guard: an answer file already there

test('missing #7 (c43): when Q-<n>.answer.md already exists, the brief says it is already answered', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "an existing answer file is never overwritten (the brief says
  // it is already answered)". The fixture: Q-71's brief is open when an answer file arrives by hand (rule 10: "by
  // hand-edited file"), then the answer key is pressed.
  const w = world(on)
  const ui: any = await w.pane($)
  await openBrief(w, ui, 'Q-71')
  w.files.set('_orch/inbox/Q-71.answer.md', '# Q-71 answer (binding, operator, 2026-10-19)\n\n**Answer:** the house style.\n') // fixture: a hand-written answer
  await w.settle(61000)
  await pressAnswer(w, ui)
  expect(/already answered/i.test(await shownText(ui))).toBe(true) // Q-41: "the brief says it is already answered"
})

test('guard: c42 when Q-<n>.answer.md already exists, the answer key leaves it byte-identical', async ($, on) => {
  // Requirement R-C14-13 (L208). plan/decisions/Q-41.md: "Written once with `$.fs.write`; an existing answer file is
  // never overwritten". GUARD (work/guard-evidence.md, approval inbox/OQ7.answer.md): no path writes an inbox answer
  // file at da5910c, so this holds there; it must keep holding once the answer key exists. The fixture: Q-71's brief
  // is open (where the pane can open it) when a hand-written answer file arrives, then the answer key is pressed (where
  // it is drawn) and the dialog answered.
  const w = world(on)
  const ui: any = await w.pane($)
  await openBrief(w, ui, 'Q-71')
  const HAND = '# Q-71 answer (binding, operator, 2026-10-19)\n\nanswered_via: terminal\n\n**Answer:** the house style.\n' // fixture
  w.files.set('_orch/inbox/Q-71.answer.md', HAND)
  await w.settle(61000)
  expect((await hotkeyButtons(ui)).some((b: any) => b.props.hotkey === 'a'), "Q-71's brief is open and draws its answer key a").toBe(true) // amended by GV4: openBrief and pressAnswer do nothing when nothing is drawn, so without this the key was never pressed and the checks below held by default (P2 gate item 4: no guard passes with zero assertions)
  await pressAnswer(w, ui)
  await w.settle(61000)
  expect(/already answered/i.test(await shownText(ui)), 'verifier r2 (P3-d3): the pressed answer key acted on the existing file').toBe(true)
  expect(answerFile(w, 'Q-71')).toBe(HAND) // Q-41: never overwritten, byte for byte
  expect(w.writes().filter((x) => x.path === '_orch/inbox/Q-71.answer.md')).toEqual([]) // and never written over
})

// ================================================================== missing #8: the ? row leaves the pane

test('missing #8 (c5): after an answer is given from its brief, that question\'s ? row is no longer drawn', async ($, on) => {
  // Requirement R-C14-14: "and the question's `?` row then leaves the pane." (spec L209). Q-71 holds the asked record
  // (Q-42). The answer is given from the brief by `a` (T113A key-scheme.md §4) through $.ui.ask (Q-35).
  const w = world(on)
  const ui: any = await w.pane($)
  const before = qRows(await ui.drawn(), 'Q-71').length > 0
  await answerFromBrief(w, ui, 'Q-71')
  await backToList(w, ui)
  const after = qRows(await ui.drawn(), 'Q-71').length > 0
  expect({ before, after }).toEqual({ before: true, after: false }) // L209: drawn before, gone after the answer
})

// ================================================================== missing #9-#10: the answer reaches the asking node (Q-36)

const noteRe = (id: string, node: string) => new RegExp('^answered ' + id + ' from the pane: (.+)\\. Re-dispatch ' + node + ' with it$')

test('missing #9 (c6): an answer given from the brief is delivered to the asking node by a note for the prime to re-dispatch it', async ($, on) => {
  // Requirements R-C14-12 "An answer reaches the asking node, the same way an AskUserQuestion answer would." (spec
  // L207), R-C14-16 "how it reaches a node that has already returned BLOCKED;" (L211). inbox/Q-36.answer.md: "A: the
  // mod writes the answer file and puts a note to the prime, which re-dispatches the asking node at once." (T113A
  // t13-answers.md). The asking node is the node Q-72.md names, T5, whose envelope reads BLOCKED (it has returned).
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-72')
  const toPrime = w.notes().filter((n) => n.text.includes('Q-72') && new RegExp('Re-dispatch ' + Q72_NODE + '\\b').test(n.text)) // Q-36 option 1's note
  expect(toPrime.length >= 1 ? 'the prime is told to re-dispatch T5' : JSON.stringify(w.notes())).toBe('the prime is told to re-dispatch T5') // delivery itself: the note that re-dispatches T5 with the answer
})

test('missing #9 (c29): after the answer file is written, the mod notes for the prime, tag operator: answered Q-<n> from the pane: <first line>. Re-dispatch <node> with it', async ($, on) => {
  // Requirements R-C14-12 (L207), R-C14-16 (L211). Q-36.md option 1 (inbox/Q-36.answer.md, binding): "puts a note for
  // the prime (`noteQuietly`, tag `operator`: "answered Q-<n> from the pane: <first line>. Re-dispatch <node> with
  // it")". <node>: the node Q-72.md names (fixture Q72_NODE). <first line>: the question's first line (fixture
  // Q72_FIRST, with or without its `# `) or the answer's (the label chosen); Q-36 does not say which, so either holds.
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-72')
  const label = w.chosen[0] ?? 'no dialog'
  const hit = w.notes().find((n) => n.tag === 'operator' && noteRe('Q-72', Q72_NODE).test(n.text))
  const first = hit ? noteRe('Q-72', Q72_NODE).exec(hit.text)![1] : 'no such note: ' + JSON.stringify(w.notes())
  expect([Q72_FIRST, '# ' + Q72_FIRST, label].includes(first) ? 'the note names the first line' : first).toBe('the note names the first line') // Q-36 option 1, its words
})

test('missing #9 (c30): the note for the prime is put after the answer file is written, never before', async ($, on) => {
  // Requirements R-C14-12 (L207), R-C14-16 (L211). Q-36.md option 1 (inbox/Q-36.answer.md): "the mod writes
  // `Q-<n>.answer.md`, then puts a note for the prime".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-72')
  const order = w.events
    .map((e) => (e.kind === 'write' && e.path === '_orch/inbox/Q-72.answer.md' ? 'answer file' : e.kind === 'note' && e.text.includes('Q-72') && e.text.includes('Re-dispatch') ? 'note' : null))
    .filter(Boolean)
  expect(order).toEqual(['answer file', 'note']) // Q-36 option 1: the file, then the note
})

test('missing #10 (c31): when the asking agent is still live, the answer is also sent to it as a message', async ($, on) => {
  // Requirements R-C14-12 (L207), R-C14-16 (L211). Q-36.md option 1 (inbox/Q-36.answer.md): "If the asker is still live,
  // the answer is also sent to it as a message (the pane's ✉)". Fixture: Q-74.md names T7; the agent `T7 worker` (id
  // a-T7-worker, as the fixture's agent.spawn names it) is running.
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-74')
  const label = w.chosen[0] ?? 'no dialog'
  const sent = w.sends().filter((s) => s.to.includes('a-T7-worker') && s.text.includes(label))
  expect(sent.length >= 1 ? 'the live asker got the answer' : JSON.stringify(w.sends())).toBe('the live asker got the answer') // Q-36 option 1
})

// ================================================================== missing #11: answering a queued question (Q-45)

test('missing #11 (c44): the answer key works on a queued question\'s brief: it writes Q-<id>.answer.md', async ($, on) => {
  // Requirements R-C14-38 "whether a queued question can be answered from its brief before it is put;" (spec L239-240),
  // R-C14-07 (L203). inbox/Q-45.answer.md: "A: answering a queued question first writes the asked record (asked_via:
  // pane)." Q-73 is queued: no Q-73.asked.md (Q-42).
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-73')
  const f = answerFile(w, 'Q-73')
  const a = w.chosen[0] ?? 'no dialog'
  expect(f !== undefined && f.includes(a) && Q73_OPTIONS.some((p) => a.includes(p)) ? 'Q-73.answer.md written' : 'no answer file').toBe('Q-73.answer.md written') // Q-45 option 1; fixture Q-73.md's options
})

test('missing #11 (c45): answering a queued question writes Q-<id>.asked.md holding asked_via: pane', async ($, on) => {
  // Requirement R-C14-38 (L239-240). inbox/Q-45.answer.md: "first writes the asked record (asked_via: pane)".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-73')
  expect(lines(w.files.get('_orch/inbox/Q-73.asked.md')).includes('asked_via: pane')).toBe(true) // Q-45, verbatim
})

test('missing #11 (c46): the Q-<id>.asked.md written when a queued question is answered holds an asked_at: line', async ($, on) => {
  // Requirement R-C14-38 (L239-240). inbox/Q-42.answer.md: "a write-once Q-<id>.asked.md with asked_at and asked_via is
  // the asked record"; inbox/Q-45.answer.md: answering a queued question writes it.
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-73')
  expect(lines(w.files.get('_orch/inbox/Q-73.asked.md')).some((l) => /^asked_at: \S+/.test(l))).toBe(true) // Q-42: asked_at
})

test('missing #11 (c47): answering a queued question writes Q-<id>.asked.md before Q-<id>.answer.md', async ($, on) => {
  // Requirement R-C14-38 (L239-240). inbox/Q-45.answer.md: "first writes the asked record"; Q-45.md option 1: "Before
  // the answer file it writes the Q-42 record (`asked_via: pane`)".
  const w = world(on)
  const ui: any = await w.pane($)
  await answerFromBrief(w, ui, 'Q-73')
  const order = w.writes().map((x) => x.path).filter((p) => p === '_orch/inbox/Q-73.asked.md' || p === '_orch/inbox/Q-73.answer.md')
  expect(order).toEqual(['_orch/inbox/Q-73.asked.md', '_orch/inbox/Q-73.answer.md']) // Q-45: asked record first
})

test('missing #11 (c48): after a queued question is answered, its row is no longer drawn', async ($, on) => {
  // Requirements R-C14-38 (L239-240), R-C14-14 (L209). Q-45.md option 1 (inbox/Q-45.answer.md): "The row then leaves
  // the pane (L209)."
  const w = world(on)
  const ui: any = await w.pane($)
  const before = qRows(await ui.drawn(), 'Q-73').length > 0
  await answerFromBrief(w, ui, 'Q-73')
  await backToList(w, ui)
  const after = qRows(await ui.drawn(), 'Q-73').length > 0
  expect({ before, after }).toEqual({ before: true, after: false }) // L209, Q-45
})

// ================================================================== missing #12: an unauthorized answer (Q-48)

test('missing #12 (c49): a question whose answer file carries unauthorized: true stays drawn, in the state it had', async ($, on) => {
  // Requirement R-C14-24 "An open question (an `_orch/inbox/Q-<n>.md` with no `Q-<n>.answer.md`) is in one of two
  // states," (spec L225), R-C14-14 (L209). inbox/Q-48.answer.md: "an answer file marked unauthorized does not close
  // it"; Q-48.md option 1: "the row stays in its state". Q-76 has the asked record, so its state is the asked one:
  // "put to the operator: the row reads `waiting for you`" (spec L229).
  const w = world(on)
  const ui: any = await w.pane($)
  const rows = qRows(await ui.drawn(), 'Q-76')
  expect({ drawn: rows.length > 0, state: rows.some((r) => r.text.includes('waiting for you')) }).toEqual({ drawn: true, state: true }) // Q-48; L229
})

test('missing #12 (c50): that question\'s brief shows the unauthorized answer', async ($, on) => {
  // Requirement R-C14-24 (L225), R-C14-04 (L201). Q-48.md option 1 (inbox/Q-48.answer.md, binding): "its brief shows
  // the unauthorized answer". Fixture Q76_UNAUTH_TEXT is the answer Q-76.answer.md holds.
  const w = world(on)
  const ui: any = await w.pane($)
  await openBrief(w, ui, 'Q-76')
  expect(squash(await shownText(ui)).includes(squash(Q76_UNAUTH_TEXT))).toBe(true) // Q-48 option 1
})

// ================================================================== the guard of criterion 9

test('guard: c9 a question whose _orch/inbox/Q-<n>.answer.md exists is not drawn, as at da5910c', async ($, on) => {
  // Requirements R-C14-14 (L209), R-C14-24: "An open question (an `_orch/inbox/Q-<n>.md` with no `Q-<n>.answer.md`)"
  // (spec L225). GUARD (work/guard-evidence.md, approval inbox/OQ7.answer.md): this works at da5910c (register.js
  // ~2253-2256, per the handoff). Fixture: Q-70 has Q-70.answer.md (an authorized one); Q-72 has none.
  const w = world(on)
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  expect({ answered: qRows(tree, 'Q-70').length, open: qRows(tree, 'Q-72').length > 0 }).toEqual({ answered: 0, open: true }) // L225: Q-70 is not open, so no ? row; Q-72 is
})
