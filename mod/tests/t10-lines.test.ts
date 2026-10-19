// claude plugin test — T10 and its amendment, part L (node T110L, cluster C10): the lines the old
// plan section drew, the legend line above the agent table, the `p` key, and the pane's text form.
// Spec: docs/designs/v7.6-tuning.md L137-147, L248-275, L300-362 (L300-362 wins where they conflict).
// Hazard H28: C8, C9, C10 and C11 all change agent rows, so these tests never compare a whole row
// string; they look for one token, one line's place, or one line's own text.
import { expect, mock, test } from 'claude-code/testing'

// ---- fixture -------------------------------------------------------------------------------------
// A plan of three phases (spec L309: "the phases P1..P5 in plan order"): P1 done with 2 nodes,
// P2 running with 14 nodes (more than the 12 of Q-59), P3 not started with 2 nodes.
const P1N = ['T101', 'T102']
const P2N = Array.from({ length: 14 }, (_, i) => 'T2' + String(i + 1).padStart(2, '0'))
const P3N = ['T301', 'T302']
const GRAPH = [...P1N.map((id) => [id, 1]), ...P2N.map((id) => [id, 2]), ...P3N.map((id) => [id, 3])].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join('')
const MANIFEST = { run_id: 'build-20261002T120000Z', mode: 'BUILD', target: './app', prime: true, phase: 'P2', pr: { number: 47 } }
// Agent labels hold no node id and no P<n> token, so a token found on a line is the row it names.
const SUB_P1 = 'plan the parser' // sub-orchestrator of P1 (its spawn prompt names _orch/phases/P1/, spec L320)
const SUB_P2 = 'build export' // sub-orchestrator of P2 (its spawn prompt names _orch/phases/P2/, spec L320)
const WORKER = 'parser worker' // a worker under the P2 sub-orchestrator

const PR = { number: 47, url: 'https://github.com/o/r/pull/47', title: 't', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }], comments: [], assignees: [], headRefName: 'b', author: { login: 'me' }, closingIssuesReferences: [], files: [] }

async function world($: any, on: any, opts: { plan?: boolean; surfaces?: string[]; agents?: boolean } = {}) {
  const plan = opts.plan ?? true
  const files: Record<string, string> = { '_orch/manifest.json': JSON.stringify(MANIFEST) }
  const dirs: Record<string, any[]> = {}
  if (plan) {
    files['_orch/plan/graph.yaml'] = GRAPH
    files['_orch/phases/P1/envelope.json'] = JSON.stringify({ verdict: 'DONE', summary: 'plan' })
    files['_orch/phases/P1/brief.md'] = 'brief'
    files['_orch/phases/P2/brief.md'] = 'brief'
    for (const id of P1N) files['_orch/nodes/' + id + '/status.json'] = JSON.stringify({ verdict: 'DONE' })
    dirs['_orch/phases'] = [{ name: 'P1', kind: 'directory' }, { name: 'P2', kind: 'directory' }]
    dirs['_orch/nodes'] = [...P1N, ...P2N].map((name) => ({ name, kind: 'directory' }))
  }
  const find = (t: Record<string, any>, p: string) => Object.keys(t).find((k) => p === k || p.endsWith('/' + k))
  on('fs.read', (_$: any, e: any) => {
    const k = find(files, e.path)
    return k ? { value: files[k] } : { deny: 'ENOENT' }
  })
  on('fs.list', (_$: any, e: any) => {
    const k = find(dirs, e.path)
    return k ? { value: dirs[k] } : { deny: 'ENOENT' }
  })
  on('fs.exists', (_$: any, e: any) => ({ value: !!find(files, e.path) || (plan && /_orch\/nodes\/T2\d\d\/work$/.test(e.path)) }))
  const clock = mock.clock(on)
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'baton', title: 'baton', isShown: false, isFocused: false, isPlaced: true }] }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.surfaces', () => ({ value: opts.surfaces ?? ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.303', base: '2.1.303' } }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('classic.SessionStart', () => ({}))
  mock.env(on, {})
  on('process.run', (_$: any, e: any) => {
    const a = [...e.argv]
    let out: any = {}
    if (a[0] === 'gh' && a[1] === 'pr' && a[2] === 'view') out = PR
    else if (a[0] === 'gh' && a[1] === 'issue') out = [{ number: 12, title: 'the next goal', url: 'https://github.com/o/r/issues/12' }]
    else if (a[0] === 'gh') out = []
    else if (a[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  const ids: Record<string, string> = { 'Run phase P1 from _orch/phases/P1/brief.md': 's1', 'Run phase P2 from _orch/phases/P2/brief.md': 's2', 'Do the parser node': 'w1' }
  on('agent.spawn', (_$: any, e: any) => ({ model: 'claude-opus-5-5', agentId: ids[e.prompt] ?? e.prompt }))
  on('command.run', () => ({ text: 'core' }))
  on('tool.call', () => ({ result: 'ran' }))
  await $.session.start({ cwd: '/work', surface: null } as any)
  await clock.advance(200000) // past the PR poll (prPollSeconds), so the PR row and merge-ready line exist
  await clock.settle()
  if (opts.agents ?? true) {
    await $.agent.spawn({ prompt: 'Run phase P1 from _orch/phases/P1/brief.md', description: SUB_P1, subagentType: 'baton:sub-orchestrator' } as any)
    await $.agent.spawn({ prompt: 'Run phase P2 from _orch/phases/P2/brief.md', description: SUB_P2, subagentType: 'baton:sub-orchestrator' } as any)
    await $.agent.spawn({ prompt: 'Do the parser node', description: WORKER, subagentType: 'baton:worker', parentAgentId: 's2' } as any)
  }
  return { clock }
}

async function mount($: any) {
  await $.command.run({ command: 'baton', args: '' } as any)
  return await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { bodyRows: 80 } } as any })
}

// ---- reading what is drawn -----------------------------------------------------------------------
type Line = { text: string; dim: boolean }
// A row Box with a column gap draws a space between its children; a Button or Link draws its label.
const textOf = (x: any): string =>
  typeof x === 'string' ? x
  : x == null ? ''
  : Array.isArray(x) ? x.map(textOf).join('')
  : x.type === 'Button' || x.type === 'Link' ? String(x.props?.label ?? '') + textOf(x.children)
  : x.type === 'Box' && x.props?.columnGap ? (x.children ?? []).map(textOf).join(' ')
  : textOf(x.children)
function texts(x: any, out: any[] = []): any[] {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    if (x.type === 'Text' && (x.children ?? []).some((c: any) => typeof c === 'string' && c.trim())) out.push(x)
    for (const c of x.children ?? []) texts(c, out)
  } else if (Array.isArray(x)) for (const c of x) texts(c, out)
  return out
}
/** The drawn tree as lines, top to bottom: a column Box stacks its children; anything else is one line. */
function lines(n: any, out: Line[] = []): Line[] {
  if (n && n.type === 'Box' && n.props?.flexDirection === 'column') {
    for (const c of n.children ?? []) lines(c, out)
    return out
  }
  const ts = texts(n)
  out.push({ text: textOf(n), dim: ts.length > 0 && ts.every((t: any) => t.props?.dimColor === true) })
  return out
}
function walk(n: any, f: (x: any) => void) {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, f))
  if (!n || typeof n !== 'object') return
  f(n)
  for (const c of n.children ?? []) walk(c, f)
}
const dump = (ls: Line[]) => '\n' + ls.map((l, i) => String(i).padStart(3) + (l.dim ? ' d ' : '   ') + l.text).join('\n')

// The agent table's header: the column-name line (as tests/interface.test.ts matches it), or the
// group line `this agent` / `roll-up` (spec L341) when one is drawn above it.
const HEADER = /\bagent\s+context\b|this agent.*roll-up/
// The hint line under the agent table ends with T9's `b goes back` (spec L265: "T9's keys stay").
const HINT = /\bb goes back\b/
// A phase row's label reads `P<n>` (spec L348); marks and the `›` may come before it.
const phaseRow = (n: number) => new RegExp('^[\\s›○●◉✓✗◆│├└─]*P' + n + '\\b')
const ANY_PHASE_ROW = /^[\s›○●◉✓✗◆│├└─]*P\d+\b/
const nodeIn = (id: string) => new RegExp('\\b' + id + '\\b')

function regions(ls: Line[]) {
  const h = ls.findIndex((l) => HEADER.test(l.text))
  const hint = ls.findIndex((l, i) => i > h && HINT.test(l.text))
  if (h < 0) throw new Error('no agent table header drawn' + dump(ls))
  if (hint < 0) throw new Error('no hint line under the agent table' + dump(ls))
  let first = h
  while (first + 1 < hint && HEADER.test(ls[first + 1].text)) first++
  return { header: h, treeFrom: first + 1, hint }
}

async function pressP(ui: any) {
  let key: string | null = null
  walk(await ui.drawn(), (x) => {
    if (!key && x.props && x.props.hotkey === 'p') key = x.props.key
  })
  if (!key) throw new Error('no element with hotkey p is drawn')
  await ui.press({ key })
}

/** The rows of phase P<n>'s block inside the tree: from its row to the next phase row (or the hint). */
function phaseBlock(ls: Line[], n: number) {
  const { treeFrom, hint } = regions(ls)
  const at = ls.findIndex((l, i) => i >= treeFrom && i < hint && phaseRow(n).test(l.text))
  if (at < 0) throw new Error('no P' + n + ' row inside the agent tree' + dump(ls))
  let end = at + 1
  while (end < hint && !ANY_PHASE_ROW.test(ls[end].text)) end++
  return { at, end }
}

// ---- the legend ----------------------------------------------------------------------------------

// R-C10-50 · R-C10-22
// Spec L330: "A dim legend line above the agent table names the levels (prime, phase, sub-orchestrator, agent)"
// _orch/inbox/Q-55.answer.md: "A, adapted to the tree: the legend explains the levels (prime, phase, sub-orchestrator, agent)."
// Q-55 option A: "A dim legend line directly above the agent table header".
test('t10-lines: a dim legend line directly above the agent table header names prime, phase, sub-orchestrator and agent', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const ls = lines(await ui.drawn())
  const { header } = regions(ls)
  const legend = ls[header - 1] // origin: Q-55 option A, "directly above the agent table header"
  expect(legend).toBeDefined() // origin: Q-55 option A, a line is drawn there
  expect(legend.dim).toBe(true) // origin: spec L330, "A dim legend line"
  // origin: spec L330 and Q-55.answer.md, the four levels named in "(prime, phase, sub-orchestrator, agent)"
  for (const level of [/\bprime\b/i, /\bphase\b/i, /\bsub-orchestrator\b/i, /\bagent\b/i]) expect(legend.text).toMatch(level)
})

// R-C10-51 · R-C10-01
// Spec L331: "and says a phase is a unit of the plan (Q-55)." Spec L142: "The pane says what a phase is: a unit of the plan."
// The H25 wording (Q-33 decision) is superseded by Q-55 for where the line goes; Q-55 leaves the
// exact wording to F110, so the criterion's fallback holds: text containing `unit of the plan`.
test('t10-lines: the legend line says a phase is a unit of the plan', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const ls = lines(await ui.drawn())
  const { header } = regions(ls)
  expect(ls[header - 1]?.text ?? '').toMatch(/unit of the plan/i) // origin: spec L142 and L331, "a unit of the plan"
})

// ---- no plan section -----------------------------------------------------------------------------

// R-C10-07 · R-C10-89 · R-C10-27
// Spec L257: "The separate plan and phases section goes away, and the plan row goes with it."
// Spec L361: "no separate plan or phases section is drawn."
test('t10-lines: the pane draws no `plan` heading row, with p off or on', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  for (const state of ['p off', 'p on']) {
    if (state === 'p on') await pressP(ui)
    const ls = lines(await ui.drawn())
    // origin: spec L257, "the plan row goes with it": no line whose text begins with the word plan
    const heading = ls.filter((l) => /^\s*plan\b/i.test(l.text))
    if (heading.length) throw new Error(state + ': a plan heading row is drawn: ' + JSON.stringify(heading) + dump(ls))
  }
})

// R-C10-06 · R-C10-05 · R-C10-89
// Spec L257: "Phases merge into the agent tree. The separate plan and phases section goes away"
// Spec L309: "The pane draws one tree: the prime, then the phases P1..P5 in plan order as rows of their own"
test('t10-lines: the pane draws no phase row outside the agent tree, with p off or on', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  for (const state of ['p off', 'p on']) {
    if (state === 'p on') await pressP(ui)
    const ls = lines(await ui.drawn())
    const { treeFrom, hint } = regions(ls)
    // origin: spec L257, phases are drawn only inside the agent tree (between its header and its hint line)
    const outside = ls.filter((l, i) => (i < treeFrom || i >= hint) && ANY_PHASE_ROW.test(l.text))
    if (outside.length) throw new Error(state + ': phase rows outside the agent tree: ' + JSON.stringify(outside.map((l) => l.text)) + dump(ls))
    // and the tree does draw them (spec L309), so the check above is not met by drawing no phase at all
    for (const n of [1, 2, 3]) expect(ls.some((l, i) => i >= treeFrom && i < hint && phaseRow(n).test(l.text))).toBe(true) // origin: spec L309, P1..P3 of the fixture's plan
  }
})

// ---- `p`: node rows under every phase row --------------------------------------------------------

// R-C10-60 · R-C10-15
// Spec L338: "`p` shows or hides the node rows under every phase row at once (Q-59; L264 stands, read as every phase)."
// _orch/inbox/Q-59.answer.md: "A, adapted to the tree: p expands every phase's node rows."
test('t10-lines: with p on, every phase row that has nodes has its node rows drawn under it', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  await pressP(ui)
  const ls = lines(await ui.drawn())
  // origin: the fixture's graph (P1: T101 T102; P2: T201..T214; P3: T301 T302) and spec L338, "every phase row"
  for (const [n, ids] of [[1, P1N], [2, P2N.slice(0, 12)], [3, P3N]] as const) {
    const { at, end } = phaseBlock(ls, n)
    for (const id of ids) {
      const i = ls.findIndex((l) => nodeIn(id).test(l.text))
      if (!(i > at && i < end)) throw new Error('node row ' + id + ' is not under the P' + n + ' row' + dump(ls))
    }
  }
})

// R-C10-61
// Spec L339: "They are drawn directly under the phase row, before its sub-orchestrator rows,"
// Q-59 option A: "drawn directly under the phase row, indented one level, before its child agent rows".
test('t10-lines: with p on, a phase row\'s node rows are drawn before its sub-orchestrator rows', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  await pressP(ui)
  const ls = lines(await ui.drawn())
  const { at, end } = phaseBlock(ls, 2)
  const sub = ls.findIndex((l, i) => i > at && i < end && l.text.includes(SUB_P2)) // origin: the fixture's P2 dispatch label (spec L348: it keeps its own label)
  if (sub < 0) throw new Error('the P2 sub-orchestrator row is not under the P2 row' + dump(ls))
  expect(at + 1).toBeLessThan(sub) // origin: spec L339, "directly under the phase row"
  expect(nodeIn(P2N[0]).test(ls[at + 1].text)).toBe(true) // origin: spec L339, the first row under P2 is a node row
  for (const id of P2N.slice(0, 12)) {
    const i = ls.findIndex((l) => nodeIn(id).test(l.text))
    if (!(i > at && i < sub)) throw new Error(id + ' is not between the P2 row and its sub-orchestrator row' + dump(ls))
  }
})

// R-C10-62
// Spec L339-340: "at most 12 per phase, followed by `… N more nodes`." Q-59 option A: "The 12-row cap and `… N more nodes` stay."
test('t10-lines: with p on, a phase of more than 12 nodes shows exactly 12 node rows', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  await pressP(ui)
  const ls = lines(await ui.drawn())
  const { at, end } = phaseBlock(ls, 2)
  const shown = ls.filter((l, i) => i > at && i < end && P2N.some((id) => nodeIn(id).test(l.text)))
  expect(shown.length).toBe(12) // origin: spec L339 and Q-59, "at most 12 per phase"; the fixture's P2 has 14
})

// R-C10-63 · R-C10-59
// Spec L340: "followed by `… N more nodes`." Spec L336: "`… N more nodes` stays under its phase row."
test('t10-lines: with p on, the 12 node rows are followed by `… N more nodes`, N the number not shown', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  await pressP(ui)
  const ls = lines(await ui.drawn())
  const { at, end } = phaseBlock(ls, 2)
  let last = -1
  for (let i = at + 1; i < end; i++) if (P2N.some((id) => nodeIn(id).test(ls[i].text))) last = i
  if (last < 0) throw new Error('no P2 node row inside the tree' + dump(ls))
  // origin: spec L340, "followed by `… N more nodes`"; N = 14 - 12 = 2 from the fixture
  expect(ls[last + 1]?.text ?? '').toMatch(/…\s*2 more nodes\b/)
})

// ---- the plan section's other lines move to what they are about (Q-56) ---------------------------

// R-C10-53 · R-C10-54 · R-C10-23
// Spec L333-334: "The PR's merge-ready rows go under the PR row at the top of Work, after the `merge-ready` line, while `p` is on."
// _orch/inbox/Q-56.answer.md: "A, adapted to the tree: the plan section's other lines move to what they are about."
test('t10-lines: with p on, the PR\'s merge-ready rows are drawn under the PR row, after the merge-ready line', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  await pressP(ui)
  const ls = lines(await ui.drawn())
  const { header } = regions(ls)
  const pr = ls.findIndex((l) => /^\s*PR\b/.test(l.text)) // the PR row at the top of Work
  const ml = ls.findIndex((l) => /\bmerge-ready (\d+)\/(\d+)/.test(l.text))
  if (pr < 0 || ml < 0) throw new Error('no PR row or merge-ready line' + dump(ls))
  expect(ml).toBeGreaterThan(pr) // origin: spec L333, the `merge-ready` line sits under the PR row
  const total = Number(/\bmerge-ready (\d+)\/(\d+)/.exec(ls[ml].text)![2]) // origin: the merge-ready line's own `k/n`: n rows
  // origin: spec L333, the rows follow the `merge-ready` line, under the PR row and above the agent table
  const rows = ls.slice(ml + 1, header).filter((l) => /^\s*[✓✗] \S/.test(l.text))
  expect(rows.length).toBe(total) // origin: spec L333, every merge-ready row, between the merge-ready line and the agent table
  // and nowhere after the agent table header (the old plan section drew them below the table)
  expect(ls.slice(header).filter((l) => /^\s*[✓✗] \S/.test(l.text) && !ANY_PHASE_ROW.test(l.text) && rows.some((r) => r.text.trim() === l.text.trim())).length).toBe(0) // origin: spec L257, the plan section that drew them is gone
})

// R-C10-55
// Spec L334: "The queue line goes under the goal and PR rows." Q-56 option A: "The queue line goes under the goal and PR rows."
test('t10-lines: the queue line `queue: #… — /baton next` is drawn under the goal and PR rows', async ($, on) => {
  await world($, on)
  await $.command.run({ command: 'baton', args: 'watch' } as any) // fills the issue queue (#12)
  const ui = await mount($)
  const ls = lines(await ui.drawn())
  const { header } = regions(ls)
  const goal = ls.findIndex((l) => /^\s*goal\s/.test(l.text))
  const pr = ls.findIndex((l) => /^\s*PR\b/.test(l.text))
  const q = ls.findIndex((l) => /^\s*queue: #12\b.*— \/baton next/.test(l.text)) // origin: Q-56, the line `queue: #… — /baton next`; #12 from the fixture
  if (goal < 0 || pr < 0 || q < 0) throw new Error('goal, PR or queue line missing' + dump(ls))
  expect(q).toBeGreaterThan(goal) // origin: spec L334, "under the goal"
  expect(q).toBeGreaterThan(pr) // origin: spec L334, "and PR rows"
  expect(q).toBeLessThan(header) // origin: spec L333-334, at the top of Work with them, not below the agent table
})

// R-C10-56 · R-C10-57
// Spec L335: "The footer joins the hint line under the agent table, while `p` is on."
test('t10-lines: with p on, the footer `states are computed from _orch/ and the PR` is in the hint line under the agent table', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  await pressP(ui)
  const ls = lines(await ui.drawn())
  const { hint } = regions(ls)
  // origin: Q-56 option A, the footer's text `states are computed from _orch/ and the PR`; spec L335, "joins the hint line"
  expect(ls[hint].text).toContain('states are computed from _orch/ and the PR')
})

// R-C10-58
// Spec L336: "`no phases yet` is a dim row under the prime until the plan exists."
test('t10-lines: with no _orch/plan/graph.yaml, a dim row `no phases yet` is drawn under the prime\'s row', async ($, on) => {
  await world($, on, { plan: false, agents: false })
  const ui = await mount($)
  const ls = lines(await ui.drawn())
  const { treeFrom, hint } = regions(ls)
  const prime = ls.findIndex((l, i) => i >= treeFrom && i < hint && /◆ prime\b/.test(l.text))
  if (prime < 0) throw new Error('no prime row' + dump(ls))
  const under = ls[prime + 1] // origin: spec L336, "a dim row under the prime"
  expect(under.text).toMatch(/no phases yet/) // origin: spec L336, `no phases yet`
  expect(under.dim).toBe(true) // origin: spec L336, "a dim row"
})

// ---- the text form (Q-70, adapted to the tree) ---------------------------------------------------

// R-C10-78 · R-C10-06
// _orch/plan/decisions/Q-70.md: "The text form follows the drawn tree: no `plan:` block, phase rows in the tree"
// Spec L350: "The pane's text form follows the drawn tree (Q-61, Q-62 and Q-70, adapted to the tree)."
test('t10-lines: the pane\'s text form holds no `plan:` block', async ($, on) => {
  await world($, on, { surfaces: [] })
  const r: any = await $.command.run({ command: 'baton', args: '' } as any)
  expect(r.text).toContain('## Work') // origin: tests/interface.test.ts, the text form prints the Work tab
  expect(r.text).not.toMatch(/^\s*plan:\s*$/m) // origin: Q-70, "no `plan:` block"
})

// R-C10-78 · R-C10-30
// _orch/plan/decisions/Q-70.md: "phase rows in the tree as Q-52, Q-53 and Q-61 draw them".
// Spec L309-310: "the prime, then the phases P1..P5 in plan order as rows of their own, then under each phase row the sub-orchestrator(s)"
test('t10-lines: the pane\'s text form lists each phase row one level under the prime', async ($, on) => {
  await world($, on, { surfaces: [] })
  const r: any = await $.command.run({ command: 'baton', args: '' } as any)
  const tl: string[] = r.text.split('\n')
  const indent = (s: string) => s.search(/\S/)
  const prime = tl.findIndex((l) => /◆ prime\b/.test(l))
  if (prime < 0) throw new Error('no prime row in the text form:\n' + r.text)
  const sub = tl.findIndex((l, i) => i > prime && l.includes(SUB_P2))
  if (sub < 0) throw new Error('no P2 sub-orchestrator row in the text form:\n' + r.text)
  const at: number[] = []
  for (const n of [1, 2, 3]) {
    const i = tl.findIndex((l, j) => j > prime && phaseRow(n).test(l))
    if (i < 0) throw new Error('no P' + n + ' row after the prime in the text form:\n' + r.text)
    at.push(i)
  }
  // origin: spec L309, "the prime, then the phases P1..P5 in plan order": P1 < P2 < P3 after the prime
  expect(at[0] < at[1] && at[1] < at[2]).toBe(true) // origin: spec L309, plan order
  // origin: Q-70 with spec L309-310: each phase row is one level under the prime, and the P2
  // sub-orchestrator one level under P2, so phases sit deeper than the prime and shallower than it
  const lp = indent(tl[prime])
  const lv = at.map((i) => indent(tl[i]))
  expect(new Set(lv).size).toBe(1) // origin: Q-70 with spec L309, every phase row at the same level
  expect(lv[0]).toBeGreaterThan(lp) // origin: Q-70 with spec L309, phase rows under the prime
  expect(indent(tl[sub])).toBeGreaterThan(lv[0]) // origin: spec L310, the sub-orchestrator under its phase row
  expect(sub).toBeGreaterThan(at[1]) // origin: spec L310, under P2's row
  expect(sub).toBeLessThan(at[2]) // origin: spec L310, before the next phase row
})

// ---- the `p` key ---------------------------------------------------------------------------------

// R-C10-18 · R-C10-15
// Spec L265: "T11's steps on every row and T9's keys stay." Spec L264/L338: `p` still shows or hides the node rows.
// _orch/plan/decisions/Q-32.md: keys are drawn "in the same accent style as `1`, `2` and `r`".
// Handoff criterion 15: "the key `p` is shown the way `1`, `2` and `r` are shown, in a pane that draws no plan section."
test('t10-lines: the key p is shown the way 1, 2 and r are, in a pane that draws no plan section', async ($, on) => {
  await world($, on)
  const ui = await mount($)
  const d = await ui.drawn()
  const ls = lines(d)
  const heading = ls.filter((l) => /^\s*plan\b/i.test(l.text)) // origin: spec L257, no plan row
  if (heading.length) throw new Error('a plan section is drawn: ' + JSON.stringify(heading) + dump(ls))
  const byKey: Record<string, any> = {}
  walk(d, (x) => {
    const k = x.props && x.props.hotkey
    if (k && !byKey[k]) byKey[k] = x
  })
  // origin: the tab row's keys `1`, `2` and `r` (handoff criterion 15)
  for (const k of ['1', '2', 'r', 'p']) if (!byKey[k]) throw new Error('no key ' + k + ' drawn')
  for (const k of ['1', '2']) expect(byKey[k].type).toBe(byKey.r.type) // origin: criterion 15, `1`, `2` and `r` are one way of showing a key
  expect(byKey.p.type).toBe(byKey.r.type) // origin: criterion 15, "shown the way `1`, `2` and `r` are shown"
  expect(byKey.p.props.plain).toBe(byKey.r.props.plain) // origin: criterion 15, drawn as `r` is
  expect(byKey.p.props.color).toBe(byKey.r.props.color) // origin: Q-32, the same accent style as `r`
})
