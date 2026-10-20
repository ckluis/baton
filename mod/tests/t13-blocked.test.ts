// claude plugin test — T13, part C: blocked rows, their brief, and approving from it (C14).
//
// Written from the spec (docs/designs/v7.6-tuning.md L190-216) and the operator's answers BEFORE the implementation
// (node T113C, a split red step of F113). Requirement ids are rows of _orch/plan/traceability.yaml, cluster C14:
// R-C14-05 "Opening a blocked row shows its brief: what the node is blocked on" (L202), R-C14-06 "and its `Blocked by:`
// line." (L202), R-C14-08 "From a blocked row's brief, a key approves what the node is blocked on right there." (L204),
// read through R-C14-17 (what approve grants per kind, L211: inbox/Q-37.answer.md), R-C14-18 (which rows are blocked
// rows, L211: inbox/Q-38.answer.md), R-C14-19 / R-C14-21 (the acceptance tests, L213-214).
// The keys are T113A's (_orch/nodes/T113A/work/key-scheme.md §4): in a blocked row's brief `y` approves once, `w`
// approves for the run (only where Q-37 keeps that grant), `b` goes back. The G1 answers are quoted in
// _orch/nodes/T113A/work/t13-answers.md. No expected value is copied from the implementation.
//
// Every test whose name does not start `guard:` must fail at the run tip da5910c by its own assertion. A `guard:` test
// pins behaviour that already works at da5910c (inbox/OQ7.answer.md, "preservation guards"; work/guard-evidence.md).
//
// Ownership (hazard H28): assertions read the brief's text, the key cell (a Button's `hotkey`), the open view, the
// notes and asks the mod raises; never a whole rendered row string. A node's row is found by its id, an agent's row by
// its label.
//
// The world: the engine beneath the mod answers from memory (as mod/tests/interface.test.ts and T113A's
// mod/tests/t13-keys.test.ts do). Directory entries carry the engine's kind `'dir'` (types index.d.ts:5066, E1 §m).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session
// Q-12 (inbox/Q-12.answer.md, T113A key-scheme.md §2): the 22-letter pool, in its order.
const POOL = 'a c d e f g h i j k l m n o q s t u v w y z'.split(' ')
const APPROVE_ONCE = 'y' // T113A key-scheme.md §4 (Q-39: "y = approve once")
const APPROVE_RUN = 'w' // T113A key-scheme.md §4 (Q-39: "w = approve for the run")

// Rule 2's envelope (rules/rule-2-the-status-envelope.md). A `Blocked by:` line inside an envelope is a line of one
// of its string fields, as in the run's own record _orch/nodes/G1/status.a1.json (`risk`: "...\nBlocked by: ...").
// No summary below names its node id or says "fix" or "/baton resume", so a brief that shows them says so itself.
const env = (node: string, verdict: string, summary: string, blockedBy?: string, extra: any = {}) => ({ node, rung: 1, model: 'claude-opus-5-5', effort: 'medium', attempt: 1, verdict, outputs: [], summary, evidence: [], risk: blockedBy ? 'none.\n' + blockedBy : 'none', caveats: [], escalation_reason: null, handback: null, ...extra })

// --- T5: BLOCKED, no Blocked by line in its envelope; inbox Q-72 names it (`interpreted`). T113A's fixture node.
const T5_SUMMARY = 'Blocked on Q-72: may the export drop the legacy column.' // fixture: T5's envelope summary
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
].join('\n') // fixture: rule 10 step 1's shape (the question, the node it blocks, the default, the Blocked by line)
const T5_BLOCKED_BY = 'Blocked by: docs/export.md:"the legacy column stays until v9" (interpreted)' // fixture: Q72's last line
const T5_DEFAULT = /option 2|Keep it until v9/ // fixture: "the default its question states" (Q72: "assumes: option 2", option 2 "Keep it until v9.")
const T5 = env('T5', 'BLOCKED', T5_SUMMARY)

// --- T6: BLOCKED at a command gate (Q-37.md: "a command gate it could not have approved ... refused with 'return
// BLOCKED with the exact command, and it is re-dispatched once approved'"). Its envelope names the exact command.
const T6_CMD = 'git push origin baton/build-export' // fixture: the exact command the gate held
const T6_SUMMARY = 'The command gate held `' + T6_CMD + '`: nobody could approve it in the session.' // fixture
const T6_BLOCKED_BY = 'Blocked by: mod/hooks/register.js:"Do not retry it another way: return BLOCKED with the exact command, and it is re-dispatched once approved." (explicit)' // fixture: the refusal it passes up (Q-37.md quotes it)
const T6 = env('T6', 'BLOCKED', T6_SUMMARY, T6_BLOCKED_BY)

// --- T7: BLOCKED by pause (Q-37.md: "pause (register.js:2502, :3125), lifted only by `/baton resume`").
const T7_SUMMARY = 'The run is paused by the operator, so its dispatch of the verifier is held.' // fixture
const T7_BLOCKED_BY = 'Blocked by: mod/hooks/register.js:"baton is paused by the operator" (explicit)' // fixture
const T7 = env('T7', 'BLOCKED', T7_SUMMARY, T7_BLOCKED_BY)

// --- T8: BLOCKED by a forbidden file (Q-37.md: "a forbidden-file pattern (register.js:2495) ... which today no approval lifts").
const T8_FILE = 'config/.env.production' // fixture: the file the work needs and the pattern forbids
const T8_SUMMARY = 'Its `git add ' + T8_FILE + '` was refused; the export needs that file committed.' // fixture
const T8_BLOCKED_BY = 'Blocked by: mod/hooks/register.js:"' + T8_FILE + ' matches a forbidden-file pattern (secrets, keys, env files) and is never committed." (explicit)' // fixture
const T8 = env('T8', 'BLOCKED', T8_SUMMARY, T8_BLOCKED_BY)

// --- T10: BLOCKED by an enforced ruling (Q-37.md: "an enforced ruling (`tool.check{Bash}` :2650), which today no approval lifts").
const RULING_TEXT = 'never edit the vendored library' // fixture: ruling #0
const RULINGS = [
  { index: 0, ts: '2026-10-19T00:00:00Z', tag: 'ruling', text: RULING_TEXT },
  { index: 1, ts: '2026-10-19T00:00:00Z', tag: 'enforce', text: 'enforce #0 /sed -i .*vendor\\//' },
] // fixture: the rulings' notes, as mod/tests/approvals.test.ts gives them
const T10_SUMMARY = 'Its `sed -i s/v1/v2/ vendor/lib.js` was denied at the permission check.' // fixture
const T10_BLOCKED_BY = 'Blocked by: .baton/memory:"baton ruling #0 (enforced): ' + RULING_TEXT + '" (explicit)' // fixture
const T10 = env('T10', 'BLOCKED', T10_SUMMARY, T10_BLOCKED_BY)

// --- T11: BLOCKED, `explicit` (rule 10 step 1: "a rule, a criterion or a hard failure, and a person has to fix the cause").
const T11_FILE = '_orch/nodes/T11/handoff.md' // fixture: the file whose line must change
const T11_SUMMARY = 'Criterion 4 names a data file that does not exist in the repository.' // fixture
const T11_BLOCKED_BY = 'Blocked by: ' + T11_FILE + ':"4. The test reads data/report.csv." (explicit)' // fixture
const T11 = env('T11', 'BLOCKED', T11_SUMMARY, T11_BLOCKED_BY)

// --- T12: ESCALATE (Q-38: "node rows whose envelope is BLOCKED/ESCALATE ... are blocked rows").
const T12_SUMMARY = 'The parser rewrite exceeds the cheap rung; it needs judgment.' // fixture
const T12 = env('T12', 'ESCALATE', T12_SUMMARY, undefined, { escalation_reason: 'the parser rewrite needs a frontier tier' })

// --- Agents that returned BLOCKED (Q-38: "agent rows that returned BLOCKED are blocked rows").
const EXPORT_AGENT = 'export worker' // fixture: an agent whose final text is one line
const EXPORT_LINE = 'export BLOCKED · the legacy column waits on the operator · Q-81 open' // fixture: its last (only) line
const AUDIT_AGENT = 'audit worker' // fixture: an agent whose final text ends with its Blocked by line
const AUDIT_BLOCKED_BY = 'Blocked by: docs/audit.md:"every audit row cites its source" (interpreted)' // fixture
const AUDIT_ANSWER = 'audit BLOCKED · two rows have no source · Q-82 open\n' + AUDIT_BLOCKED_BY // fixture: its final text

const AGENTS = ['alpha worker', 'beta worker', 'gamma worker'] // fixture, as T113A's and T19's

type Opts = {
  nodes?: Record<string, any> // node id -> envelope (status.json)
  graph?: string // graph.yaml
  inbox?: Record<string, string> // inbox file -> text
  returns?: Record<string, string> // agent description -> final text (it returns before the pane opens)
  rulings?: any[]
  subOrchs?: Record<string, string> // phase label -> the line its sub-orchestrator returns before the pane opens (a queued phase)
  handoffs?: Record<string, string> // node id -> handoff.md text (default: '# HANDOFF — <id>' and one line)
}

function world(on: any, opts: Opts = {}) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const nodes = opts.nodes ?? {}
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', opts.graph ?? '- id: N1\n  phase: 1\n' + Object.keys(nodes).map((id) => '- id: ' + id + '\n  phase: 2\n').join('') + '- id: N3\n  phase: 3\n')
  dirs.set('_orch/phases', [1, 2, 3].map((n) => ({ name: 'P' + n, kind: 'dir' })))
  for (const n of [1, 2, 3]) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  dirs.set('_orch/nodes', Object.keys(nodes).map((id) => ({ name: id, kind: 'dir' })))
  for (const [id, st] of Object.entries(nodes)) {
    dirs.set('_orch/nodes/' + id, [{ name: 'handoff.md', kind: 'file' }, { name: 'status.json', kind: 'file' }])
    files.set('_orch/nodes/' + id + '/handoff.md', opts.handoffs?.[id] ?? '# HANDOFF — ' + id + '\n\nExport the report.\n')
    files.set('_orch/nodes/' + id + '/status.json', JSON.stringify(st, null, 2) + '\n')
  }
  for (const [f, text] of Object.entries(opts.inbox ?? {})) files.set('_orch/inbox/' + f, text)
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
  // What reaches the prime: a run note (process.run `note`, as mod/tests/approvals.test.ts reads it) or a prompt the
  // mod submits to it (as the pane's send-back does). Q-36/Q-37 call either "a note for the prime".
  const toPrime: { via: string; tag?: string; text: string }[] = []
  on('prompt.submit', (_$: any, e: any) => {
    toPrime.push({ via: 'prompt', text: String(e.text) })
    return { text: e.text }
  })
  on('turn.complete', () => ({ text: '' }))
  // $.ui.ask is a tool.call of AskUserQuestion (mod/tests/approvals.test.ts); it answers with its first option.
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
    if (argv.includes('note')) {
      toPrime.push({ via: 'note', tag: argv[argv.indexOf('--tag') + 1], text: String(e.init?.stdin ?? '') })
      out = { index: toPrime.length - 1, text: '', truncated: false, merges: [] }
    } else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 0, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: (opts.rulings ?? []).length, notes: opts.rulings ?? [], blocks: [] }
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
  const idOf = (desc: string) => 'a-' + desc.replace(/\W+/g, '-')
  /** Start the session, spawn the agents (and let the ones in `returns` return), and open the pane. */
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    const returns = opts.returns ?? {}
    for (const d of [...AGENTS, ...Object.keys(returns)]) {
      await $.agent.spawn({ prompt: 'do the work', description: d, subagentType: 'baton:worker' } as any)
      await settle(10)
    }
    for (const [d, answer] of Object.entries(returns)) {
      await $.turn.complete({ agentId: idOf(d), answer, durationMs: 1, isAborted: false, turnId: 't-' + d, reason: 'answer' } as any)
      await settle(10)
    }
    for (const [label, answer] of Object.entries(opts.subOrchs ?? {})) {
      // A sub-orchestrator reporting DONE queues its phase for the operator's check (mod/tests/approvals.test.ts).
      await $.agent.spawn({ prompt: 'run phase ' + label, description: label, subagentType: 'baton:sub-orchestrator' } as any)
      await settle(10)
      await $.turn.complete({ agentId: idOf(label), answer, durationMs: 1, isAborted: false, turnId: 't-' + label, reason: 'answer' } as any)
      await settle(10)
    }
    await settle(61000) // past the mod's own re-read interval, so the pane reads the record as it now stands
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 400 } } as any })
  }
  async function band($: any) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 160, scroll: {} } as any })
  }
  return { settle, pane, band, files, asks, toPrime, idOf }
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
const flat = (x: string) => x.replace(/\s+/g, ' ')

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

/** Every line the tree shows: each row Box's text and each Text's text (a brief's line is one or the other). */
function shownLines(tree: any): string[] {
  const out: string[] = rowBoxes(tree).map((r) => r.text)
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Text') out.push(strings(n))
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out.map(flat)
}

const labelOf = (b: any) => String((b.props && b.props.label) ?? strings(b.children) ?? '')
const isMessage = (b: any) => labelOf(b).includes('✉')
const openers = (r: Row) => r.buttons.filter((b) => !isMessage(b))
const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? labelOf(b))

function rowOf(tree: any, re: RegExp, not?: RegExp): Row | undefined {
  const hits = rowBoxes(tree).filter((r) => re.test(r.text) && !(not && not.test(r.text)) && openers(r).length > 0)
  hits.sort((a, b) => a.buttons.length - b.buttons.length)
  return hits[0]
}
const letterOf = (r: Row | undefined): string | undefined => {
  if (!r) return undefined
  const b = r.buttons.find((x) => POOL.includes(String(x.props && x.props.hotkey)))
  return b ? String(b.props.hotkey) : undefined
}
/** The Button focus-and-Enter acts on in that row: its `›` (E1 §k: "Enter on focus | :1241 phase ›, :1243 node ›, :1463 agent ›"). */
const enterButton = (r: Row) => openers(r).find((b) => labelOf(b).includes('›')) ?? openers(r)[0]

async function hotkeyButtons(ui: any) {
  return (await ui.findAll({ type: 'Button' })).filter((b: any) => typeof b.props.hotkey === 'string')
}
async function keyButton(ui: any, k: string) {
  return (await hotkeyButtons(ui)).find((b: any) => b.props.hotkey === k)
}
/** The approve keys drawn now (T113A key-scheme.md §4: `y`, and `w` where Q-37 keeps it). */
async function approveKeys(ui: any) {
  return (await hotkeyButtons(ui)).map((b: any) => String(b.props.hotkey)).filter((k: string) => k === APPROVE_ONCE || k === APPROVE_RUN).sort()
}
async function shownText(ui: any) {
  return flat(strings(await ui.drawn()))
}
async function back(ui: any) {
  const b = await keyButton(ui, 'b')
  if (b) await ui.press({ key: keyOf(b) })
}

const idRe = (id: string) => new RegExp('(^|[^A-Za-z0-9])' + id + '([^0-9]|$)')
const NOT_NODE = /Q-\d|(^|[^A-Za-z0-9])P\d([^0-9]|$)/ // a `?` row or a phase row (its stuck nodes' tail) may name a node; neither is the node's row

/** A node's row. Spec L264: "`p` still shows or hides the node rows under a phase's row", so `p` is pressed once if it is not drawn. */
async function nodeRow(ui: any, id: string): Promise<Row | undefined> {
  const r = rowOf(await ui.drawn(), idRe(id), NOT_NODE)
  if (r) return r
  const p = await keyButton(ui, 'p')
  if (p) await ui.press({ key: keyOf(p) })
  return rowOf(await ui.drawn(), idRe(id), NOT_NODE)
}
/** Focus a row's `›` and press Enter (E1 §k: Enter presses the focused element), if the row has one. */
async function enter(ui: any, r: Row | undefined) {
  if (r && openers(r).length) await ui.press({ key: keyOf(enterButton(r)) })
}
/** Open a node row's brief by focus and Enter; true when the brief opened (it shows the envelope's summary, Q-38.md option 1). */
async function openNodeBrief(ui: any, id: string, summary: string) {
  await enter(ui, await nodeRow(ui, id))
  return (await shownText(ui)).includes(flat(summary))
}
/** Press the key `k` if a Button carries it; true when it did. */
async function pressKey(ui: any, k: string) {
  const b = await keyButton(ui, k)
  if (!b) return false
  await ui.press({ key: keyOf(b) })
  return true
}
const messagesSince = (w: any, n: number) => w.toPrime.slice(n).map((x: any) => flat(x.text))

// ================================================================== 1 · a blocked node row opens its brief (focus and Enter)

test('missing #1 (c4): focusing a BLOCKED node row and pressing Enter opens its brief, which shows what the node is blocked on', async ($, on) => {
  // R-C14-05 "Opening a blocked row shows its brief: what the node is blocked on" (L202); R-C14-02 "by focus-and-Enter,"
  // (L200); R-C14-19 "a plugin test per row kind (question, blocked) that opens its brief from the keyboard" (L213).
  // OQ6 (inbox/OQ6.answer.md): "BOTH" (focus-and-Enter and a direct key). Q-38 (inbox/Q-38.answer.md): "node rows whose
  // envelope is BLOCKED/ESCALATE ... are blocked rows" — the row kind T113A's t13-answers.md records for the tests.
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-72.md': Q72 } })
  const ui: any = await w.pane($)
  const row = await nodeRow(ui, 'T5')
  expect(row ? 'a › to focus' : 'no › in T5\'s row').toBe('a › to focus') // L199-200: the blocked row can be selected, by focus
  await enter(ui, row)
  const t = await shownText(ui)
  expect({ briefOpen: !!(await keyButton(ui, 'b')), blockedOn: t.includes(flat(T5_SUMMARY)) }).toEqual({ briefOpen: true, blockedOn: true }) // L202 "what the node is blocked on": its envelope summary (fixture T5; Q-38.md option 1)
})

// ================================================================== 2 · the brief shows the Blocked by line from the envelope

test('missing #2 (c5): a blocked row\'s brief shows the Blocked by line its status.json holds', async ($, on) => {
  // R-C14-06 "and its `Blocked by:` line." (L202). Q-38.md option 1: "the `Blocked by:` line, read from
  // `_orch/nodes/<id>/status.json`". Fixture T11 holds it in a string field of its envelope (as G1's status.a1.json does).
  const w = world(on, { nodes: { T11 } })
  const ui: any = await w.pane($)
  await enter(ui, await nodeRow(ui, 'T11'))
  const t = await shownText(ui)
  expect({ brief: t.includes(flat(T11_SUMMARY)), blockedBy: t.includes(flat(T11_BLOCKED_BY)) }).toEqual({ brief: true, blockedBy: true }) // L202; fixture T11_BLOCKED_BY verbatim
})

// ================================================================== 3 · the brief shows the node id and its envelope summary

test('missing #3 (c40): a node row\'s blocked brief shows the node id', async ($, on) => {
  // R-C14-05 (L202). Q-38.md option 1: the brief shows "the node id, its envelope summary ...". No other text the view
  // could show names T5 on a line of its own: the fixture's summary does not, Q-72's one line naming T5 ('**Nodes it blocks:** T5.')
  // is excluded below, as is any line naming Q-72, and T5's handoff here is T5_HANDOFF, which does not either (attempt 2, verdict r2 c40: the default
  // handoff's '# HANDOFF — T5' let a brief without the id pass). So a line naming T5 is the brief's own.
  const T5_HANDOFF = '# HANDOFF\n\nExport the report without the legacy column.\n' // fixture: a handoff that does not name its node
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-72.md': Q72 }, handoffs: { T5: T5_HANDOFF } })
  const ui: any = await w.pane($)
  await enter(ui, await nodeRow(ui, 'T5'))
  const lines = shownLines(await ui.drawn())
  const briefShown = lines.some((l) => l.includes(flat(T5_SUMMARY)))
  expect({ briefShown, id: lines.some((l) => idRe('T5').test(l) && !l.includes('Q-72') && !l.includes('Nodes it blocks')) }).toEqual({ briefShown: true, id: true }) // Q-38.md option 1: "the node id"
})

test('missing #3 (c41): a node row\'s blocked brief shows its envelope summary', async ($, on) => {
  // R-C14-05 "what the node is blocked on" (L202). Q-38.md option 1: "its envelope summary", read from status.json.
  // A second node in the fixture (T11) proves the brief is T5's own, not every envelope's.
  const w = world(on, { nodes: { T5, T11 }, inbox: { 'Q-72.md': Q72 } })
  const ui: any = await w.pane($)
  await enter(ui, await nodeRow(ui, 'T5'))
  const t = await shownText(ui)
  expect({ mine: t.includes(flat(T5_SUMMARY)), others: t.includes(flat(T11_SUMMARY)) }).toEqual({ mine: true, others: false }) // fixture T5.summary, and not T11's
})

// ================================================================== 4 · no Blocked by line in the envelope: the inbox Q-<n>.md that names the node

test('missing #4 (c43): when status.json holds no Blocked by line, the brief shows the Blocked by line of the inbox Q-<n>.md that names the node', async ($, on) => {
  // R-C14-06 "and its `Blocked by:` line." (L202). Q-38.md option 1: "read from `_orch/nodes/<id>/status.json` ...,
  // falling back to the inbox `Q-<n>.md` that names the node." Fixture: T5's envelope has none; Q-72.md names T5
  // ("**Nodes it blocks:** T5."). Q-73.md names another node, and its line must not be shown.
  const Q73 = Q72.replace(/Q-72/g, 'Q-73').replace('T5.', 'N3.').replace('the legacy column stays until v9', 'the totals row comes last') // fixture: a question naming N3
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-72.md': Q72, 'Q-73.md': Q73 } })
  const ui: any = await w.pane($)
  await enter(ui, await nodeRow(ui, 'T5'))
  const lines = shownLines(await ui.drawn())
  // The `?` rows also show a question's Blocked by text (the `? Q-72 ...` line, register.js draws it today); the brief's
  // line is the one shown without the `? ` row's prefix.
  const inBrief = (s: string) => lines.some((l) => l.includes(flat(s)) && !/^\s*\?\s/.test(l))
  expect({ brief: lines.some((l) => l.includes(flat(T5_SUMMARY))), mine: inBrief(T5_BLOCKED_BY), other: inBrief('the totals row comes last') }).toEqual({ brief: true, mine: true, other: false }) // fixture Q-72.md's last line
})

// ================================================================== 5 · an ESCALATE node row is a blocked row

test('missing #5 (c37): a node row whose status.json verdict is ESCALATE is a blocked row: focus and Enter open its brief', async ($, on) => {
  // R-C14-05 (L202), R-C14-02 (L200). Q-38 (inbox/Q-38.answer.md): "node rows whose envelope is BLOCKED/ESCALATE ... are
  // blocked rows".
  const w = world(on, { nodes: { T12 } })
  const ui: any = await w.pane($)
  const opened = await openNodeBrief(ui, 'T12', T12_SUMMARY)
  expect(opened).toBe(true) // the brief shows T12's envelope summary (fixture T12; Q-38.md option 1)
})

// ================================================================== 6 · a BLOCKED agent row has a direct key

test('missing #6 (c39): an agent row whose returned verdict is BLOCKED shows a direct key', async ($, on) => {
  // R-C14-03 "and by a direct key of its own, as in T9." (L200). Q-38 (inbox/Q-38.answer.md): "agent rows that returned
  // BLOCKED are blocked rows"; T113A key-scheme.md §1: "An agent row already holds its agent-row letter ...; it keeps
  // that one letter". OQ6 part 2: "a direct hotkey of its own ..., shown the same way".
  const w = world(on, { returns: { [EXPORT_AGENT]: EXPORT_LINE } })
  const ui: any = await w.pane($)
  const row = rowOf(await ui.drawn(), new RegExp(EXPORT_AGENT))
  const k = letterOf(row)
  expect(typeof k === 'string' && POOL.includes(k)).toBe(true) // a Q-12 pool letter, as a Button's hotkey (key-scheme.md §1, §5)
  await ui.press({ key: keyOf(row!.buttons.find((b: any) => b.props.hotkey === k)) })
  expect((await shownText(ui)).includes('in the tree')).toBe(true) // the key opens the agent's view (an agent view reads "in the tree", E1 §k k-07-enter-F17.txt)
})

// ================================================================== 7 · a BLOCKED agent row: its agent view gains the brief at its top

test('missing #7 (c42): a BLOCKED agent row\'s brief, at the top of its agent view, shows the agent\'s last line', async ($, on) => {
  // R-C14-05 "what the node is blocked on" (L202). Q-38.md option 1: "the agent's last line"; "On a BLOCKED agent row,
  // Enter still opens the agent view ..., and that view gains the brief at its top." The agent view's own first line
  // reads "in the tree" (E1 §k k-07-enter-F17.txt); the brief comes before it.
  const w = world(on, { returns: { [EXPORT_AGENT]: EXPORT_LINE } })
  const ui: any = await w.pane($)
  await enter(ui, rowOf(await ui.drawn(), new RegExp(EXPORT_AGENT)))
  const t = await shownText(ui)
  const tree = t.indexOf('in the tree')
  const at = t.indexOf(flat(EXPORT_LINE))
  expect({ view: tree >= 0, lineInBrief: at >= 0 && at < tree }).toEqual({ view: true, lineInBrief: true }) // fixture EXPORT_LINE, above the view (Q-38.md option 1)
})

test('missing #7 (c44): Enter on a BLOCKED agent row opens the agent view with the brief, and its Blocked by line, at its top', async ($, on) => {
  // R-C14-06 "and its `Blocked by:` line." (L202), R-C14-02 (L200). Q-38.md option 1: the Blocked by line is "read from
  // ... the agent's final text"; "that view gains the brief at its top". Fixture: the audit agent's final text ends
  // with its Blocked by line.
  const w = world(on, { returns: { [AUDIT_AGENT]: AUDIT_ANSWER } })
  const ui: any = await w.pane($)
  await enter(ui, rowOf(await ui.drawn(), new RegExp(AUDIT_AGENT)))
  const t = await shownText(ui)
  const tree = t.indexOf('in the tree')
  const at = t.indexOf(flat(AUDIT_BLOCKED_BY))
  expect({ view: tree >= 0, blockedByAtTop: at >= 0 && at < tree }).toEqual({ view: true, blockedByAtTop: true }) // fixture AUDIT_BLOCKED_BY, above the view
})

// ================================================================== 8 · approving from the brief: the grant per kind (Q-37)

test('missing #8 (c6, c23): from the brief of a node blocked at a command gate, y approves that exact command once: a note for the prime to re-dispatch the node with it', async ($, on) => {
  // R-C14-08 "From a blocked row's brief, a key approves what the node is blocked on right there." (L204); R-C14-21 (L214).
  // Q-37 (inbox/Q-37.answer.md): "per kind, the narrowest grant"; Q-37.md option 1: "a command gate → approve that exact
  // command once (a note for the prime to re-dispatch the node with it)". Key `y`: T113A key-scheme.md §4.
  const w = world(on, { nodes: { T6 } })
  const ui: any = await w.pane($)
  await openNodeBrief(ui, 'T6', T6_SUMMARY)
  const n = w.toPrime.length
  const pressed = await pressKey(ui, APPROVE_ONCE)
  await w.settle(100)
  const said = messagesSince(w, n)
  const ok = said.some((s: string) => s.includes(T6_CMD) && idRe('T6').test(s) && /re-?dispatch/i.test(s))
  expect({ pressed, note: ok }).toEqual({ pressed: true, note: true }) // Q-37.md option 1: the note names the node, the exact command (fixture T6_CMD) and the re-dispatch
})

test('missing #8 (c24): from the brief of a node blocked at a command gate, y writes no approvals.always entry: the next command of that gate is still asked', async ($, on) => {
  // R-C14-17 (L211) via Q-37.md option 1: `y` approves "that exact command once"; the run-wide grant is the second key's.
  // Q-37: "it never widens". approvals.always is what lets a gate's later commands run unasked (mod/tests/approvals.test.ts:
  // "approve-for-run skips later asks of the same gate").
  const w = world(on, { nodes: { T6 } })
  const ui: any = await w.pane($)
  await openNodeBrief(ui, 'T6', T6_SUMMARY)
  const pressed = await pressKey(ui, APPROVE_ONCE)
  await w.settle(100)
  const before = w.asks.filter((a) => /git push/.test(a.q)).length
  await $.tool.call({ tool: 'Bash', command: 'git push origin baton/build-other', agentId: w.idOf('alpha worker') } as any) // fixture: a later push of the same gate
  const askedAgain = w.asks.filter((a) => /git push/.test(a.q)).length === before + 1
  expect({ pressed, askedAgain }).toEqual({ pressed: true, askedAgain: true }) // Q-37: once, never for the run
})

test('missing #8 (c25): from the brief of a node blocked at a command gate, w adds that gate to approvals.always for the run, as /approve <gate> does', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "with a second key for 'every <gate> for this run' (`approvals.always`, as
  // `/approve <gate>` does)". Key `w`: T113A key-scheme.md §4 ("drawn only where Q-37 keeps that grant (a command gate)").
  const w = world(on, { nodes: { T6 } })
  const ui: any = await w.pane($)
  await openNodeBrief(ui, 'T6', T6_SUMMARY)
  const pressed = await pressKey(ui, APPROVE_RUN)
  await w.settle(100)
  const before = w.asks.length
  const r: any = await $.tool.call({ tool: 'Bash', command: 'git push origin baton/build-other', agentId: w.idOf('alpha worker') } as any) // fixture: a later push of the same gate
  expect({ pressed, asked: w.asks.length - before, ran: r && r.result }).toEqual({ pressed: true, asked: 0, ran: 'ran' }) // approved for the run: the gate's next command runs unasked
})

test('missing #8 (c6, c26): from the brief of a queued phase, the approve key has the same effect as band 1', async ($, on) => {
  // R-C14-08 (L204). Q-37.md option 1: "a queued phase → the same as band `1`". The effect of band `1` is measured in
  // this same world, never written down here: two phases wait (P2 first, so band `1` acts on P2, register.js's band
  // offers the first queued phase); P3 is approved from its brief, P2 by band `1`, and the two effects must match with
  // the phase's own label and line put aside: the notes put for the prime, the phase leaving the band's "to check" list,
  // and, once both are approved, the prime's next dispatch no longer held for the check (mod/tests/approvals.test.ts).
  const lines: Record<string, string> = { P2: 'P2 DONE+CONFIRMED 3/3 · data loaded', P3: 'P3 DONE+CONFIRMED 4/4 · export written' } // fixture: the sub-orchestrators' returns
  const w = world(on, { subOrchs: lines })
  const ui: any = await w.pane($)
  const bandUi: any = await w.band($)
  const norm = (s: string, p: string) => s.replace(lines[p], '<line>').split(p).join('<P>').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z|\d\d:\d\d:\d\dZ?/g, '<t>')
  const toCheck = async () => {
    const m = /to check \(([^)]*)\)/.exec(flat(strings(await bandUi.drawn())))
    return m ? m[1].split(/,\s*/) : []
  }
  async function effect(p: string, n: number) {
    await w.settle(100)
    return { notes: w.toPrime.slice(n).map((x: any) => (x.tag ?? x.via) + ': ' + norm(flat(x.text), p)), stillToCheck: (await toCheck()).includes(p) }
  }
  // P3 from its brief: opened from a row naming P3 (its phase row or its sub-orchestrator's row) by focus and Enter.
  let pressed = false
  let n = w.toPrime.length
  for (const r of rowBoxes(await ui.drawn()).filter((x) => idRe('P3').test(x.text) && !x.text.includes('⚑') && openers(x).some((b) => labelOf(b).includes('›')))) {
    await enter(ui, r)
    if ((pressed = await pressKey(ui, APPROVE_ONCE))) break
    await back(ui)
  }
  const viaBrief = await effect('P3', n)
  // P2 by band `1`.
  n = w.toPrime.length
  const one = await keyButton(bandUi, '1')
  if (one) await bandUi.press({ key: keyOf(one) })
  const viaBand = await effect('P2', n)
  const dispatch: any = await $.tool.call({ tool: 'Agent', prompt: 'P4', description: 'P4' } as any)
  const held = !!(dispatch && dispatch.deny) || w.asks.some((a) => /reports:/.test(a.q))
  expect({ pressed, effect: viaBrief, held }).toEqual({ pressed: true, effect: viaBand, held: false }) // the same as band `1` (Q-37.md option 1)
})

// ================================================================== 9 · kinds with no approve key (Q-37)

test('missing #9 (c27): the brief of a node blocked by pause shows no approve key', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "pause → no approve key". The run is paused (`/baton pause`) and T7's envelope
  // says it is held by the pause.
  const w = world(on, { nodes: { T7 } })
  const ui: any = await w.pane($)
  await $.command.run({ command: 'baton', args: 'pause' } as any)
  await w.settle(100)
  const brief = await openNodeBrief(ui, 'T7', T7_SUMMARY)
  expect({ brief, approveKeys: await approveKeys(ui) }).toEqual({ brief: true, approveKeys: [] }) // T7's brief is open (fixture T7_SUMMARY) and offers neither y nor w
})

test('missing #9 (c28): the brief of a node blocked by pause says /baton resume', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "pause → no approve key (the brief says `/baton resume`)". No fixture text holds
  // "/baton resume"; the band (another component) is not read here.
  const w = world(on, { nodes: { T7 } })
  const ui: any = await w.pane($)
  await $.command.run({ command: 'baton', args: 'pause' } as any)
  await w.settle(100)
  const brief = await openNodeBrief(ui, 'T7', T7_SUMMARY)
  expect({ brief, says: (await shownText(ui)).includes('/baton resume') }).toEqual({ brief: true, says: true }) // Q-37.md option 1
})

/** A line of the brief that says what must be fixed: it says "fix" and names `what` (Q-37.md option 1). */
const saysFix = (lines: string[], what: RegExp) => lines.some((l) => /\bfix/i.test(l) && what.test(l))

test('missing #9 (c30): the brief of a node whose Blocked by line ends (explicit) shows no approve key', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "`explicit`, a forbidden file or an enforced ruling → no approve key". Rule 10
  // step 1: "`explicit` is a rule, a criterion or a hard failure, and a person has to fix the cause".
  const w = world(on, { nodes: { T11 } })
  const ui: any = await w.pane($)
  const brief = await openNodeBrief(ui, 'T11', T11_SUMMARY)
  expect({ brief, approveKeys: await approveKeys(ui) }).toEqual({ brief: true, approveKeys: [] }) // T11's brief is open (fixture T11_SUMMARY) with neither y nor w (Q-37.md option 1: explicit → no approve key)
})

test('missing #9 (c31): the brief of a node whose Blocked by line ends (explicit) says what must be fixed', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "... → no approve key, and the brief says what must be fixed". What must be fixed
  // for an `explicit` line is the line it quotes (fixture: T11's handoff criterion 4). No fixture text says "fix".
  const w = world(on, { nodes: { T11 } })
  const ui: any = await w.pane($)
  const brief = await openNodeBrief(ui, 'T11', T11_SUMMARY)
  expect({ brief, says: saysFix(shownLines(await ui.drawn()), /_orch\/nodes\/T11\/handoff\.md|data\/report\.csv/) }).toEqual({ brief: true, says: true }) // a line says "fix" and names T11's quoted file or line (fixture T11_BLOCKED_BY; Q-37.md option 1)
})

test('missing #9 (c32): the brief of a node blocked by a forbidden file shows no approve key', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "a forbidden file ... → no approve key".
  const w = world(on, { nodes: { T8 } })
  const ui: any = await w.pane($)
  const brief = await openNodeBrief(ui, 'T8', T8_SUMMARY)
  expect({ brief, approveKeys: await approveKeys(ui) }).toEqual({ brief: true, approveKeys: [] }) // T8's brief is open (fixture T8_SUMMARY) with neither y nor w (Q-37.md option 1: a forbidden file → no approve key)
})

test('missing #9 (c33): the brief of a node blocked by a forbidden file says what must be fixed', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "the brief says what must be fixed": here the forbidden file (fixture T8_FILE).
  const w = world(on, { nodes: { T8 } })
  const ui: any = await w.pane($)
  const brief = await openNodeBrief(ui, 'T8', T8_SUMMARY)
  expect({ brief, says: saysFix(shownLines(await ui.drawn()), /config\/\.env\.production/) }).toEqual({ brief: true, says: true }) // a line says "fix" and names the forbidden file (fixture T8_FILE; Q-37.md option 1)
})

test('missing #9 (c34): the brief of a node blocked by an enforced ruling shows no approve key', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "an enforced ruling → no approve key". The run holds ruling #0, enforced (fixture RULINGS).
  const w = world(on, { nodes: { T10 }, rulings: RULINGS })
  const ui: any = await w.pane($)
  const brief = await openNodeBrief(ui, 'T10', T10_SUMMARY)
  expect({ brief, approveKeys: await approveKeys(ui) }).toEqual({ brief: true, approveKeys: [] }) // T10's brief is open (fixture T10_SUMMARY) with neither y nor w (Q-37.md option 1: an enforced ruling → no approve key)
})

test('missing #9 (c35): the brief of a node blocked by an enforced ruling says what must be fixed', async ($, on) => {
  // R-C14-17 (L211). Q-37.md option 1: "the brief says what must be fixed": here the ruling (fixture ruling #0).
  const w = world(on, { nodes: { T10 }, rulings: RULINGS })
  const ui: any = await w.pane($)
  const brief = await openNodeBrief(ui, 'T10', T10_SUMMARY)
  expect({ brief, says: saysFix(shownLines(await ui.drawn()), /#0|never edit the vendored library/) }).toEqual({ brief: true, says: true }) // a line says "fix" and names ruling #0 (fixture RULINGS; Q-37.md option 1)
})

// ================================================================== 8 (cont.) · interpreted: overrule

test('missing #8 (c6, c29): from the brief of a node whose Blocked by line ends (interpreted), y puts a note for the prime to re-dispatch the node on the default its question states', async ($, on) => {
  // R-C14-08 (L204). Q-37.md option 1: "`interpreted` → overrule: the node is re-dispatched to proceed on the default its
  // question states". Rule 10 step 1: `interpreted` is "the agent's own judgment, and a person may simply overrule it".
  // Fixture: T5's line (from Q-72.md) is interpreted; Q-72 "assumes: option 2" ("Keep it until v9.").
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-72.md': Q72 } })
  const ui: any = await w.pane($)
  await openNodeBrief(ui, 'T5', T5_SUMMARY)
  const n = w.toPrime.length
  const pressed = await pressKey(ui, APPROVE_ONCE)
  await w.settle(100)
  const ok = messagesSince(w, n).some((s: string) => idRe('T5').test(s) && /re-?dispatch/i.test(s) && T5_DEFAULT.test(s))
  expect({ pressed, note: ok }).toEqual({ pressed: true, note: true }) // the note names T5, the re-dispatch and the default (fixture Q72)
})

// ================================================================== 10 · the row stays until the verdict changes

test('missing #10 (c36): after an approval from a blocked row\'s brief, the row stays drawn until the node\'s status.json verdict changes', async ($, on) => {
  // R-C14-08 (L204). Q-37.md option 1: "The row stays until the node's status changes." (Unlike a `?` row, which leaves
  // once answered, L209.) A blocked node row holds a direct key as a blocked row (T113A key-scheme.md §1); a node row
  // that is not blocked has none (T19 key-scheme.md, as T113A key-scheme.md §1 reads it).
  const w = world(on, { nodes: { T5 }, inbox: { 'Q-72.md': Q72 } })
  const ui: any = await w.pane($)
  await openNodeBrief(ui, 'T5', T5_SUMMARY)
  const pressed = await pressKey(ui, APPROVE_ONCE)
  await w.settle(100)
  await back(ui)
  const after = letterOf(await nodeRow(ui, 'T5'))
  w.files.set('_orch/nodes/T5/status.json', JSON.stringify({ ...T5, verdict: 'DONE', summary: 'Kept the legacy column.' }, null, 2) + '\n') // fixture: the re-dispatched node's new envelope
  await w.settle(61000)
  const r = await keyButton(ui, 'r')
  if (r) await ui.press({ key: keyOf(r) })
  await w.settle(1000)
  const changed = letterOf(await nodeRow(ui, 'T5'))
  expect({ pressed, stays: typeof after === 'string', goneAfterChange: changed === undefined }).toEqual({ pressed: true, stays: true, goneAfterChange: true }) // Q-37.md option 1: "The row stays until the node's status changes."
})

// ================================================================== guards (inbox/OQ7.answer.md; work/guard-evidence.md)

test('guard: c9 a queued phase is approved by 1 on the band, as at da5910c', async ($, on) => {
  // R-C14-08 "From a blocked row's brief, a key approves what the node is blocked on right there." (L204), whose queued
  // phase kind is band `1`'s twin (Q-37.md option 1). OQ7 (inbox/OQ7.answer.md): a preservation guard. The criterion: "a queued phase is approved by `1` on the band and by
  // Enter on its `approve` button, as at da5910c (register.js ~1436, 3006)". Q-37.md option 1 reads approving a queued
  // phase from its brief as "the same as band `1`" (missing #8, c26), so band `1` must keep working.
  const line = 'P3 DONE+CONFIRMED 4/4 · export written' // fixture: the sub-orchestrator's return
  // band `1`
  const w = world(on, { subOrchs: { P3: line } })
  const ui: any = await w.pane($)
  const bandUi: any = await w.band($)
  const one = await keyButton(bandUi, '1')
  expect(!!one).toBe(true) // the band offers `1` for the queued phase (E1 §k: "`1` | :3006 | band: approve the queued phase")
  await bandUi.press({ key: keyOf(one) })
  await w.settle(100)
  expect(w.toPrime.some((x) => x.tag === 'approval' && /approved P3/.test(x.text))).toBe(true) // the approval is noted (mod/tests/approvals.test.ts: tag `approval`)
  expect(!!(await keyButton(bandUi, '1'))).toBe(false) // nothing waits any more
  const dispatch: any = await $.tool.call({ tool: 'Agent', prompt: 'P4', description: 'P4' } as any)
  expect(dispatch && dispatch.deny).toBeFalsy() // the prime's next dispatch is not held for the check
  expect(w.asks.some((a) => /reports:/.test(a.q))).toBe(false) // and the phase gate asks nothing (its question reads "<label> reports:", mod/tests/approvals.test.ts)
  void ui
})

test('guard: c9 a queued phase is approved by Enter on its approve button in Work, as at da5910c', async ($, on) => {
  // R-C14-08 (L204), read through Q-37.md option 1 ("a queued phase → the same as band `1`"). OQ7 (inbox/OQ7.answer.md):
  // a preservation guard. E1 §k: "Enter on focus | ... :1436 approve". The approve Button sits in the `⚑ P3` row.
  const line = 'P3 DONE+CONFIRMED 4/4 · export written' // fixture
  const w = world(on, { subOrchs: { P3: line } })
  const ui: any = await w.pane($)
  const bandUi: any = await w.band($)
  const row = rowBoxes(await ui.drawn()).find((r) => r.text.includes('⚑') && idRe('P3').test(r.text) && r.buttons.some((b: any) => labelOf(b) === 'approve'))
  expect(!!row).toBe(true) // the queued phase's row with its `approve` Button (register.js ~1436)
  await ui.press({ key: keyOf(row!.buttons.find((b: any) => labelOf(b) === 'approve')) }) // Enter on the focused `approve`
  await w.settle(100)
  expect(w.toPrime.some((x) => x.tag === 'approval' && /approved P3/.test(x.text))).toBe(true) // the approval is noted (mod/tests/approvals.test.ts: tag `approval`)
  expect(!!(await keyButton(bandUi, '1'))).toBe(false) // nothing waits any more (E1 §k: band `1` only with a queued phase)
  const dispatch: any = await $.tool.call({ tool: 'Agent', prompt: 'P4', description: 'P4' } as any)
  expect(dispatch && dispatch.deny).toBeFalsy() // the prime's next dispatch is not held (mod/tests/approvals.test.ts)
})

test('guard: c38 an agent row whose returned verdict is BLOCKED shows a ›, as at da5910c', async ($, on) => {
  // R-C14-01 "A `?` (question) row and a blocked row can be selected in the pane" (L199), R-C14-02 "by focus-and-Enter,"
  // (L200). Q-38 (inbox/Q-38.answer.md) option 1: "Each gets a `›`". E1 §k: agent rows' `›` (register.js:1463) are reached by
  // ↑/↓; finished agents keep their row. A false premise for a red test (work/guard-evidence.md), so a guard (OQ7).
  const w = world(on, { returns: { [EXPORT_AGENT]: EXPORT_LINE } })
  const ui: any = await w.pane($)
  const row = rowOf(await ui.drawn(), new RegExp(EXPORT_AGENT))
  expect(!!row && openers(row).some((b) => labelOf(b).includes('›'))).toBe(true) // a `›` in the row (Q-38.md option 1; E1 §k register.js:1463)
})

test('guard: c45 Enter on a BLOCKED agent row opens the agent view, as at da5910c', async ($, on) => {
  // R-C14-02 "by focus-and-Enter," (L200). OQ7 (inbox/OQ7.answer.md): "Enter-to-open on rows that already open". Q-38.md option 1: "On a BLOCKED agent row,
  // Enter still opens the agent view (the OQ7 guard on rows that already open holds)". E1 §k: Enter on an agent's `›`
  // opens "in the tree prime › F17 worker ...".
  const w = world(on, { returns: { [EXPORT_AGENT]: EXPORT_LINE } })
  const ui: any = await w.pane($)
  await enter(ui, rowOf(await ui.drawn(), new RegExp(EXPORT_AGENT)))
  const t = await shownText(ui)
  expect({ back: !!(await keyButton(ui, 'b')), view: t.includes('in the tree'), chain: t.includes(EXPORT_AGENT) }).toEqual({ back: true, view: true, chain: true }) // E1 §k k-07-enter-F17.txt
})
