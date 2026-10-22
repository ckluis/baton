// claude plugin test — T13, part A: the keys of `?` rows and blocked rows, and of their briefs (C14).
//
// Written from the spec (docs/designs/v7.6-tuning.md L190-246) and the operator's answers BEFORE the implementation
// (node T113A, the split red step of F113). Requirement ids are the rows of _orch/plan/traceability.yaml, cluster C14:
// R-C14-01 selectable, R-C14-02 focus-and-Enter, R-C14-03 a direct key, R-C14-04 the question's brief, R-C14-09 shown
// as 1, 2 and r are, R-C14-10/R-C14-11 no collision, R-C14-19 a test per row kind. Expected values come from the spec,
// the inbox answers (OQ6, Q-12, Q-38, Q-39, Q-40, Q-42) and from T113A's work/key-scheme.md and work/missing.md, which
// take the row letters from T19's work/key-scheme.md; none is copied from the implementation.
//
// Every test here must fail at the run tip da5910c by its own assertion; none is a `guard:` (this child has none).
//
// Ownership (hazard H28): these tests read only the key cell of a row (the Button that opens it, its `hotkey`, its
// `plain`), whether a view opened, and a phrase of the question file in that view; never a whole rendered row string.
// A `?` row is found by its question id, a blocked row by its node id, a phase row by its `P<n>` label.
//
// The world: the engine beneath the mod answers from memory (as mod/tests/interface.test.ts and T19's
// mod/tests/t9-keys.test.ts do): a prime manifest naming this session, a plan with one node per phase (T5 in P2), the
// prime and three unphased agent rows (T19 key-scheme.md's fixture), and in the inbox two open questions Q-71 and Q-72,
// each with the asked record Q-42 names (Q-<id>.asked.md). Node T5's envelope reads BLOCKED (a blocked row, Q-38).
// Directory entries carry the engine's kind `'dir'` (types index.d.ts:5066, E1 §m).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
// Q-12 (inbox/Q-12.answer.md, T19 key-scheme.md §2): the 22-letter pool, in its order.
const POOL = 'a c d e f g h i j k l m n o q s t u v w y z'.split(' ')
// T113A work/reserved-keys.md §3 (E1 §k "The pane already uses `1 2 9 b p r`"; `x` the rulings' retract label, Q-12).
const RESERVED = ['1', '2', '9', 'b', 'p', 'r', 'x']

// The fixture's questions (rule 10 step 1 shape: the question, the node it blocks, the default, the Blocked by line).
const Q71 = [
  '# Q-71 · Which date format does the export use?',
  '',
  '**Question.** The export writes every date in a report. Which format should it use?',
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
const Q71_BODY = 'The export writes every date in a report.' // fixture: a phrase of Q-71.md that is not its first line
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
  'Blocked by: docs/export.md:"the legacy column stays until v9" (interpreted)',
  '',
].join('\n')
// Q-42 (inbox/Q-42.answer.md): "a write-once Q-<id>.asked.md with asked_at and asked_via is the asked record"; Q-42.md
// option 1 adds `gate: G<n>`.
const asked = (at: string) => 'asked_at: ' + at + '\nasked_via: terminal\ngate: G1\n'
// Rule 2's envelope (rules/rule-2-the-status-envelope.md) with the verdict BLOCKED: Q-38's "a node row whose envelope
// verdict is BLOCKED (or ESCALATE) ... is a blocked row".
const T5_STATUS = { node: 'T5', rung: 1, model: 'claude-opus-5-5', effort: 'medium', attempt: 1, verdict: 'BLOCKED', outputs: [], summary: 'T5 is BLOCKED on Q-72: may the export drop the legacy column.', evidence: [], risk: 'none', caveats: [], escalation_reason: null, handback: null }

// Q-38 option 1: a blocked row's brief shows "its envelope summary" (fixture T5_STATUS.summary) and "the `Blocked by:`
// line", here Q-72.md's, the inbox file that names T5 (fixture Q72 above; rule 10 step 1 shape).
const T5_SUMMARY = T5_STATUS.summary // fixture: T5's envelope summary
const T5_BLOCKED_BY = 'Blocked by: docs/export.md:"the legacy column stays until v9" (interpreted)' // fixture: Q72's last line

const AGENTS = ['alpha worker', 'beta worker', 'gamma worker'] // fixture, as T19 key-scheme.md "The letters of the fixture"

function world(on: any) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', '- id: N1\n  phase: 1\n- id: T5\n  phase: 2\n- id: N3\n  phase: 3\n')
  dirs.set('_orch/phases', [1, 2, 3].map((n) => ({ name: 'P' + n, kind: 'dir' })))
  for (const n of [1, 2, 3]) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  dirs.set('_orch/nodes', [{ name: 'T5', kind: 'dir' }])
  dirs.set('_orch/nodes/T5', [{ name: 'handoff.md', kind: 'file' }, { name: 'status.json', kind: 'file' }])
  files.set('_orch/nodes/T5/handoff.md', '# HANDOFF — T5\n\nExport the report.\n')
  files.set('_orch/nodes/T5/status.json', JSON.stringify(T5_STATUS, null, 2) + '\n')
  files.set('_orch/inbox/Q-71.md', Q71)
  files.set('_orch/inbox/Q-71.asked.md', asked(new Date(t0 - 600000).toISOString()))
  files.set('_orch/inbox/Q-72.md', Q72)
  files.set('_orch/inbox/Q-72.asked.md', asked(new Date(t0 - 300000).toISOString()))
  const inboxList = () => [...files.keys()].filter((k) => k.startsWith('_orch/inbox/')).map((k) => ({ name: k.slice('_orch/inbox/'.length), kind: 'file' }))
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
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  // $.ui.ask is a tool.call of AskUserQuestion (mod/tests/approvals.test.ts); Q-35: the answer is entered through $.ui.ask.
  const asks: { q: string; options: string[] }[] = []
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    const options = (q.options || []).map((o: any) => o.label)
    asks.push({ q: q.question, options })
    return { result: { questions: e.questions, answers: { [q.question]: options[0] ?? 'ok' } } }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
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
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } } as any })
  }
  return { settle, pane, files, asks }
}

// ------------------------------------------------------------------ reading the drawn tree (as T19's t9-keys.test.ts)

type Row = { text: string; buttons: any[] }

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
      out.push({ text: strings(n), buttons })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}

const labelOf = (b: any) => String((b.props && b.props.label) ?? strings(b.children) ?? '')
const isMessage = (b: any) => labelOf(b).includes('✉') // ✉ messages a running agent; it opens nothing
const openers = (r: Row) => r.buttons.filter((b) => !isMessage(b))
const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? labelOf(b))

/** The innermost row whose text matches `re` and that holds a Button opening it. */
function rowOf(tree: any, re: RegExp, not?: RegExp): Row | undefined {
  const hits = rowBoxes(tree).filter((r) => re.test(r.text) && !(not && not.test(r.text)) && openers(r).length > 0)
  hits.sort((a, b) => a.buttons.length - b.buttons.length)
  return hits[0]
}

/** The row's direct key: the pool letter a Button in it carries as `hotkey`, if any. */
const letterOf = (r: Row | undefined): string | undefined => {
  if (!r) return undefined
  const b = r.buttons.find((x) => POOL.includes(String(x.props && x.props.hotkey)))
  return b ? String(b.props.hotkey) : undefined
}
/** The Button carrying the row's direct key. */
const letterButton = (r: Row | undefined) => (r ? r.buttons.find((x) => POOL.includes(String(x.props && x.props.hotkey))) : undefined)

/** The Button focus-and-Enter acts on in that row: its `›` (E1 §k: "Enter on focus | :1241 phase ›, :1243 node ›, :1463 agent ›"). */
const enterButton = (r: Row) => openers(r).find((b) => labelOf(b).includes('›')) ?? openers(r)[0]

/** Every Button drawn with a `hotkey`, in document order. */
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

const phaseRe = (n: number) => new RegExp('(^|[^A-Za-z0-9])P' + n + '([^0-9]|$)') // spec L259: "That row is labelled P<n>"
const qRe = (id: string) => new RegExp('(^|[^A-Za-z0-9-])' + id + '([^0-9]|$)') // a `?` row names its question's id (Q-49 decided default: "`? Q-42 · queued for G1 · <first line>`")
const T5_RE = /(^|[^A-Za-z0-9])T5([^0-9]|$)/ // the blocked node's id
const NOT_BLOCKED = /Q-7\d|(^|[^A-Za-z0-9])P\d([^0-9]|$)/ // a `?` row or a phase row also may name T5 (a phase's stuck nodes); neither is T5's row

/** T5's blocked row. Spec L264: "`p` still shows or hides the node rows under a phase's row", so if it is not drawn, `p` is pressed once. */
async function blockedRow(ui: any): Promise<Row | undefined> {
  const r = rowOf(await ui.drawn(), T5_RE, NOT_BLOCKED)
  if (r) return r
  const p = (await hotkeyButtons(ui)).find((b: any) => b.props.hotkey === 'p')
  if (p) await ui.press({ key: keyOf(p) })
  return rowOf(await ui.drawn(), T5_RE, NOT_BLOCKED)
}

/** Open a row's brief by Enter on its `›`, without asserting (a test's own assertion comes after). */
async function tryEnter(ui: any, r: Row | undefined) {
  if (r && openers(r).length) await ui.press({ key: keyOf(enterButton(r)) })
}

/** The tab key `1`, the reference for "shown the way `1`, `2` and `r` are shown" (E1 §k line 01, register.js:2935). */
async function tabOne(ui: any) {
  return (await hotkeyButtons(ui)).find((b: any) => b.props.hotkey === '1')
}

// work/key-scheme.md, "The letters of the fixture": the prime a, P1-P3 c d e, the agent rows f g h (T19 key-scheme.md);
// then, Q-39 (inbox/Q-39.answer.md) "?/blocked rows take Q-12 letters after agent and phase rows", questions first, in
// the order shown, then blocked rows.
const Q71_KEY = 'i' // key-scheme.md: the first `?` row takes the pool letter after h (Q-39)
const Q72_KEY = 'j' // key-scheme.md: the second `?` row, the next letter (Q-39)
const T5_KEY = 'k' // key-scheme.md: the blocked row, after the `?` rows (Q-39)

// ================================================================== the `?` row

test('missing #1 (c15): focusing a ? row and pressing Enter opens its brief, which shows the question text of its Q-<n>.md', async ($, on) => {
  // Requirements R-C14-01 "A `?` (question) row and a blocked row can be selected in the pane" (L199), R-C14-02 "by
  // focus-and-Enter," (L200), R-C14-04 "Opening a `?` row shows its brief: the question as written in its
  // `_orch/inbox/Q-<n>.md`." (L201). OQ6 (inbox/OQ6.answer.md): "BOTH": focus-and-Enter and a direct key.
  // Q-40 (plan/decisions/Q-40.md): the brief is "The whole file as written".
  const w = world(on)
  const ui: any = await w.pane($)
  const row = rowOf(await ui.drawn(), qRe('Q-71'))
  expect(row ? 'a › to focus' : 'no Button in the ? row of Q-71').toBe('a › to focus') // L199-200: the `?` row can be selected, by focus
  await ui.press({ key: keyOf(enterButton(row!)) }) // Enter on the focused › (E1 §k: Enter presses the focused element)
  expect(await viewIsOpen(ui)).toBe(true) // the brief opened, with its ‹ back (Q-40: "`b` goes back")
  expect((await shownText(ui)).includes(Q71_BODY)).toBe(true) // L201: "the question as written in its _orch/inbox/Q-<n>.md" (fixture Q-71.md)
})

test('missing #2 (c16): a ? row opens its brief by its own direct key, the letter key-scheme.md gives it', async ($, on) => {
  // Requirement R-C14-03 "and by a direct key of its own, as in T9." (L200). OQ6 part 2 (inbox/OQ6.answer.md): "Also
  // give each row a direct hotkey of its own". Q-39 (inbox/Q-39.answer.md): "?/blocked rows take Q-12 letters after
  // agent and phase rows".
  const w = world(on)
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  expect({ 'Q-71': letterOf(rowOf(tree, qRe('Q-71'))), 'Q-72': letterOf(rowOf(tree, qRe('Q-72'))) }).toEqual({ 'Q-71': Q71_KEY, 'Q-72': Q72_KEY }) // key-scheme.md: i, then j
  const b = (await hotkeyButtons(ui)).find((x: any) => x.props.hotkey === Q71_KEY)
  await ui.press({ key: keyOf(b) }) // the press a hotkey raises (types: ButtonProps.hotkey "presses it")
  expect(await viewIsOpen(ui)).toBe(true) // the key opens the row's brief (L200-201)
  expect((await shownText(ui)).includes(Q71_BODY)).toBe(true) // and it is Q-71's brief (L201, fixture Q-71.md)
})

// ================================================================== the blocked row

test('missing #3: a blocked row (a node row whose envelope reads BLOCKED) opens its brief by focus and Enter', async ($, on) => {
  // Requirements R-C14-01 "A `?` (question) row and a blocked row can be selected in the pane" (L199), R-C14-02 "by
  // focus-and-Enter," (L200), R-C14-19 "a plugin test per row kind (question, blocked)" (L213). Q-38
  // (inbox/Q-38.answer.md): "node rows whose envelope is BLOCKED/ESCALATE and agent rows that returned BLOCKED are
  // blocked rows"; Q-38.md option 1: "Each gets a `›` and a key (Q-39) and opens a brief: the node id, ...".
  const w = world(on)
  const ui: any = await w.pane($)
  const row = await blockedRow(ui)
  expect(row ? 'a › to focus' : 'no Button in a blocked row of T5').toBe('a › to focus') // L199-200: the blocked row can be selected, by focus
  await ui.press({ key: keyOf(enterButton(row!)) })
  expect(await viewIsOpen(ui)).toBe(true) // its brief opened (Q-38.md option 1)
  const t = await shownText(ui)
  expect(T5_RE.test(t) && !t.includes(Q71_BODY)).toBe(true) // Q-38.md option 1: the brief names the node id; it is not Q-71's brief
  // What item 3 adds over the node view da5910c already opens (work/probe-da5910c.md, probe P-6): the blocked row's brief.
  // Spec L202: "Opening a blocked row shows its brief: what the node is blocked on and its `Blocked by:` line." Q-38
  // (inbox/Q-38.answer.md, option 1 of Q-38.md): "the node id, its envelope summary or the agent's last line, and the
  // `Blocked by:` line, read from `_orch/nodes/<id>/status.json` ..., falling back to the inbox `Q-<n>.md` that names
  // the node." The fixture's envelope carries no Blocked by line, so the line is Q-72.md's (Q-72 names T5).
  const flat = (x: string) => x.replace(/\s+/g, ' ')
  expect({ summary: flat(t).includes(flat(T5_SUMMARY)), blockedBy: flat(t).includes(flat(T5_BLOCKED_BY)) }).toEqual({ summary: true, blockedBy: true }) // Q-38 option 1: the envelope summary (fixture T5_STATUS) and the Blocked by line (fixture Q-72.md, rule 10 step 1)
})

test('missing #4 (c17): the blocked row opens its brief by its own direct key, the letter key-scheme.md gives it', async ($, on) => {
  // Requirement R-C14-03 "and by a direct key of its own, as in T9." (L200). Q-38 (inbox/Q-38.answer.md): a node row
  // whose envelope is BLOCKED is a blocked row. Q-39 (inbox/Q-39.answer.md): it takes a Q-12 letter after the `?` rows.
  const w = world(on)
  const ui: any = await w.pane($)
  const row = await blockedRow(ui)
  expect(letterOf(row)).toBe(T5_KEY) // key-scheme.md: k, after the `?` rows i and j (Q-39)
  await ui.press({ key: keyOf(letterButton(row)) })
  expect(await viewIsOpen(ui)).toBe(true) // the key opens the blocked row's brief (L200, L202)
  expect(T5_RE.test(await shownText(ui))).toBe(true) // Q-38.md option 1: the brief names the node id
})

// ================================================================== shown the way 1, 2 and r are

test('missing #5 (c18): the ? row\'s and the blocked row\'s keys are shown the way 1, 2 and r are shown', async ($, on) => {
  // Requirement R-C14-09 "These keys are shown the way `1`, `2` and `r` are shown." (L205). OQ6 part 2
  // (inbox/OQ6.answer.md): "a direct hotkey of its own ..., shown the same way". E1 §k line 01: `1`, `2`, `r` are plain
  // hotkey Buttons drawn in the accent; types ButtonProps.plain: "the hotkey in the accent color, a colon, the label".
  const w = world(on)
  const ui: any = await w.pane($)
  const one = await tabOne(ui)
  const shape = (b: any) => (b ? { hotkey: typeof b.props.hotkey === 'string', plain: b.props.plain } : 'no key Button')
  const q = letterButton(rowOf(await ui.drawn(), qRe('Q-71')))
  const blk = letterButton(await blockedRow(ui))
  expect({ q: shape(q), blocked: shape(blk) }).toEqual({ q: { hotkey: true, plain: one.props.plain }, blocked: { hotkey: true, plain: one.props.plain } }) // drawn as `1` is (E1 §k line 01)
})

test('missing #6 (c18): the briefs\' keys, a on a question\'s brief and y on a blocked row\'s brief, are shown the way 1, 2 and r are', async ($, on) => {
  // Requirement R-C14-09 "These keys are shown the way `1`, `2` and `r` are shown." (L205). Q-39 (inbox/Q-39.answer.md):
  // "in a brief, a = answer, y = approve once, w = approve for the run". Q-37 (inbox/Q-37.answer.md): "per kind, the
  // narrowest grant": T5's block is `interpreted` (fixture Q-72.md), so its brief has `y` and `w` only where kept.
  const w = world(on)
  const ui: any = await w.pane($)
  const onePlain = (await tabOne(ui)).props.plain
  const briefKeys = async () => (await hotkeyButtons(ui)).filter((b: any) => !['1', '2', 'r', 'b'].includes(b.props.hotkey))
  const shown = (bs: any[]) => bs.map((b: any) => b.props.hotkey + ':' + (b.props.plain === onePlain ? 'as 1' : 'not as 1')).sort()
  await tryEnter(ui, rowOf(await ui.drawn(), qRe('Q-71')))
  const qb = shown(await briefKeys())
  expect(qb.includes('a:as 1') && qb.every((k) => k.endsWith(':as 1'))).toBe(true) // Q-39: `a` answers, drawn as `1` is (E1 §k line 01)
  const back = (await hotkeyButtons(ui)).find((b: any) => b.props.hotkey === 'b')
  if (back) await ui.press({ key: keyOf(back) })
  await tryEnter(ui, await blockedRow(ui))
  const bb = shown(await briefKeys())
  expect(bb.includes('y:as 1') && bb.every((k) => k.endsWith(':as 1'))).toBe(true) // Q-39: `y` approves once (and `w`, where drawn), drawn as `1` is
})

// ================================================================== distinct keys, from the Q-12 pool (Q-39)

test('missing #7 (c19): with agent and phase rows, two ? rows and a blocked row shown at once, no two shown rows share a direct key', async ($, on) => {
  // Requirements R-C14-10 "None of them collides with a key the pane already binds" (L205), R-C14-11 "or with a key
  // Claude Code binds." (L206). OQ6 (inbox/OQ6.answer.md) part 2: "a direct hotkey of its own". The T10 amendment
  // (L257-258) removes the plan row, so the rows here are agent, phase, `?` and blocked rows.
  const w = world(on)
  const ui: any = await w.pane($)
  await blockedRow(ui) // draws the node rows if `p` hides them (L264)
  const tree = await ui.drawn()
  const mine = { 'Q-71': letterOf(rowOf(tree, qRe('Q-71'))), 'Q-72': letterOf(rowOf(tree, qRe('Q-72'))), T5: letterOf(rowOf(tree, T5_RE, NOT_BLOCKED)) }
  expect(Object.values(mine).every((k) => typeof k === 'string' && /^[a-z0-9]$/.test(k))).toBe(true) // each has a key, one digit or lowercase letter (types index.d.ts:1114-1121, E1 §k)
  const all = (await hotkeyButtons(ui)).map((b: any) => String(b.props.hotkey)).filter((k: string) => POOL.includes(k)) // each drawn Button once
  expect(all.filter((k: string, i: number) => all.indexOf(k) !== i)).toEqual([]) // no letter held by two shown rows (key-scheme.md §2)
  expect(Object.values(mine).filter((k) => RESERVED.includes(String(k)))).toEqual([]) // none is a key the pane binds (reserved-keys.md §3); Claude Code binds no bare letter (reserved-keys.md §2)
})

test('missing #8 (c38): the first ? row\'s key is the first pool letter after the last agent or phase row\'s letter', async ($, on) => {
  // Requirement R-C14-03 "and by a direct key of its own, as in T9." (L200). Q-39 (inbox/Q-39.answer.md): "?/blocked
  // rows take Q-12 letters after agent and phase rows". Q-12 (inbox/Q-12.answer.md): the pool, in order.
  const w = world(on)
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const before = [letterOf(rowOf(tree, /prime/, /Q-7\d/)), ...[1, 2, 3].map((n) => letterOf(rowOf(tree, phaseRe(n), /Q-7\d/))), ...AGENTS.map((a) => letterOf(rowOf(tree, new RegExp(a))))]
  const last = Math.max(-1, ...before.map((k) => POOL.indexOf(String(k))))
  expect(letterOf(rowOf(tree, qRe('Q-71')))).toBe(POOL[last + 1]) // Q-39: the next pool letter after every agent and phase row's
})

test('missing #9 (c39): the blocked row\'s letter comes after the ? rows\' letters in the pool', async ($, on) => {
  // Requirement R-C14-03 "and by a direct key of its own, as in T9." (L200). Q-39 (inbox/Q-39.answer.md) and Q-39.md
  // option 1: "in the order shown (questions, then blocked rows)".
  const w = world(on)
  const ui: any = await w.pane($)
  const blk = letterOf(await blockedRow(ui))
  const tree = await ui.drawn()
  const qs = [letterOf(rowOf(tree, qRe('Q-71'))), letterOf(rowOf(tree, qRe('Q-72')))].map((k) => POOL.indexOf(String(k)))
  expect(typeof blk).toBe('string') // the blocked row has a pool letter (Q-39)
  expect(Math.min(...qs) >= 0 && POOL.indexOf(String(blk)) > Math.max(...qs)).toBe(true) // Q-39: questions first, then blocked rows
})

// ================================================================== `a` acts on the brief, not on a row

test('missing #10 (c40): while a question\'s brief is open, a answers and opens no agent row', async ($, on) => {
  // Requirements R-C14-10 "None of them collides with a key the pane already binds" (L205), R-C14-11 (L206). Q-39
  // (inbox/Q-39.answer.md): "in a brief, a = answer". T19 key-scheme.md §2 gives the prime row `a`; the engine: "two
  // clash, later wins" (types index.d.ts:1114-1121, E1 §k), so only one Button may carry `a` while a brief is open.
  // Q-35 (inbox/Q-35.answer.md): the answer is entered "through $.ui.ask".
  const w = world(on)
  const ui: any = await w.pane($)
  await tryEnter(ui, rowOf(await ui.drawn(), qRe('Q-71')))
  const as = (await hotkeyButtons(ui)).filter((b: any) => b.props.hotkey === 'a')
  expect(as.length).toBe(1) // one Button holds `a` while the brief is open: the brief's answer key (Q-39)
  await ui.press({ key: keyOf(as[0]) })
  await w.settle(100)
  expect(w.asks.length).toBe(1) // `a` answers: the answer is asked through $.ui.ask (Q-35)
  expect((await shownText(ui)).includes('in the tree')).toBe(false) // no agent view opened (an agent view reads "in the tree", E1 §k k-07-enter-F17.txt)
})
