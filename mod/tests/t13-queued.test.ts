// claude plugin test — T13, part D: asked and queued state of a `?` row, the gate it waits for, and the band (C14).
//
// Written from the spec (docs/designs/v7.6-tuning.md L218-246, the T13 addendum) and the operator's answers BEFORE the
// implementation (node T113D, the split red step of F113). Requirement ids are the rows of
// _orch/plan/traceability.yaml, cluster C14: R-C14-24 an open question is in one of two states, R-C14-25 its `?` row
// says which, R-C14-26 `queued for G<n>`, R-C14-27 naming the gate, R-C14-28 the band does not count it, R-C14-29
// `waiting for you`, R-C14-30 the band counts it, R-C14-31 the record on disk decides, R-C14-32 until it names the
// question it is queued, R-C14-33 the pane decides from that record alone. Expected values come from the spec, the
// inbox answers (Q-42, Q-43, Q-44, Q-48, OQ7) and the decided defaults (plan/decisions/Q-49.md, Q-50.md), as T113A's
// work/t13-answers.md quotes them; none is copied from the implementation.
//
// Tests named `guard: ...` pin behaviour that already holds at da5910c (OQ7, inbox/OQ7.answer.md: "preservation
// guards"); work/guard-evidence.md classes each. Every other test must fail at da5910c by its own assertion.
//
// Ownership (hazard H28): these tests read only the `?` rows (a row naming a question id, drawn by this cluster), their
// colour, and the band's `⚑ waiting for you` flag; never a whole agent or node row.
//
// The world: the engine beneath the mod answers from memory (as mod/tests/interface.test.ts and T113A's
// mod/tests/t13-keys.test.ts do). Each test builds its own `_orch`: a prime manifest naming this session, a plan
// (`_orch/plan/graph.yaml`) or none, node envelopes and verifier verdicts, and questions in `_orch/inbox`. Directory
// entries carry the engine's kind `'dir'` (types index.d.ts:5066, E1 §m).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session

// ------------------------------------------------------------------ fixture questions (rule 10 step 1 shape)
// The first line is plain text (no heading marks), so the `<first line>` of Q-49's row shape is unambiguous.
const FIRST_A = 'Which date format does the export use?' // fixture: the first line of question A
const FIRST_B = 'May the export drop the legacy column?' // fixture: the first line of question B
const qText = (first: string, blockedBy: string) =>
  [first, '', '**Question.** ' + first + ' The export writes every date in a report.', '', '1. **(recommended)** Option one.', '2. Option two.', '', '**Nodes it blocks:** T5.', '', '**If unanswered, the run assumes:** option 1.', '', blockedBy, ''].join('\n')
const BY_INTERP = 'Blocked by: docs/export.md:"dates follow the house style" (interpreted)' // fixture: rule 10's Blocked by line, interpreted
const BY_EXPL = 'Blocked by: docs/legacy.md:"the legacy column stays until v9" (explicit)' // fixture: rule 10's Blocked by line, explicit
const QA = qText(FIRST_A, BY_INTERP) // fixture question A (interpreted)
const QB = qText(FIRST_B, BY_EXPL) // fixture question B (explicit)
// Q-42 (inbox/Q-42.answer.md): "a write-once Q-<id>.asked.md with asked_at and asked_via is the asked record".
const ASKED = 'asked_at: 2026-10-19T12:00:00Z\nasked_via: terminal\n' // fixture asked record, Q-42's two fields

// ------------------------------------------------------------------ fixture plans (Q-43)
// Q-43 (inbox/Q-43.answer.md): "the next gate is the lowest phase with a node not DONE+CONFIRMED"; Q-43.md option 1:
// "a node whose `_orch/nodes/<id>/status.json` is missing or not DONE with CONFIRMED".
type NodeFix = { id: string; phase: number; status?: string; verify?: string }
const done = (id: string, phase: number): NodeFix => ({ id, phase, status: 'DONE', verify: 'CONFIRMED' }) // fixture: DONE with CONFIRMED
// Phase 1 not done: N1 has no status.json, N2 is DONE+CONFIRMED, T5 (phase 2) is BLOCKED. Q-43: the gate is G1.
const PLAN_G1: NodeFix[] = [{ id: 'N1', phase: 1 }, done('N2', 1), { id: 'T5', phase: 2, status: 'BLOCKED' }, { id: 'N3', phase: 3 }]
// Phase 1 all DONE+CONFIRMED, phase 2 holds T5 (BLOCKED). Q-43: the gate is G2.
const PLAN_G2: NodeFix[] = [done('N1', 1), done('N2', 1), { id: 'T5', phase: 2, status: 'BLOCKED' }, { id: 'N3', phase: 3 }]
// Phases 1 and 2 all DONE+CONFIRMED; N3 (phase 3) is DONE but its verifier has not CONFIRMED it. Q-43: the gate is G3.
const PLAN_G3: NodeFix[] = [done('N1', 1), done('N2', 2), { id: 'N3', phase: 3, status: 'DONE' }]

type Fix = { plan: NodeFix[] | null; questions: { id: string; text: string; asked?: boolean }[]; extra?: Record<string, string> }

function world(on: any, fx: Fix) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  if (fx.plan) {
    files.set('_orch/plan/graph.yaml', fx.plan.map((n) => '- id: ' + n.id + '\n  phase: ' + n.phase + '\n').join(''))
    const ph = [...new Set(fx.plan.map((n) => n.phase))].sort()
    dirs.set('_orch/phases', ph.map((n) => ({ name: 'P' + n, kind: 'dir' })))
    for (const n of ph) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
    dirs.set('_orch/nodes', fx.plan.map((n) => ({ name: n.id, kind: 'dir' })))
    const verify: { name: string; kind: string }[] = []
    for (const n of fx.plan) {
      const entries = [{ name: 'handoff.md', kind: 'file' }]
      files.set('_orch/nodes/' + n.id + '/handoff.md', '# HANDOFF — ' + n.id + '\n')
      if (n.status) {
        entries.push({ name: 'status.json', kind: 'file' })
        files.set('_orch/nodes/' + n.id + '/status.json', JSON.stringify({ node: n.id, rung: 1, model: 'claude-opus-5-5', effort: 'medium', attempt: 1, verdict: n.status, outputs: [], summary: n.id + ' ' + n.status, evidence: [], risk: 'none', caveats: [], escalation_reason: null, handback: null }, null, 2) + '\n')
      }
      if (n.verify) {
        verify.push({ name: n.id + '-verdict.json', kind: 'file' })
        files.set('_orch/verify/' + n.id + '-verdict.json', JSON.stringify({ node: n.id, attempt: 1, criteria: [], verdict: n.verify }) + '\n')
      }
      dirs.set('_orch/nodes/' + n.id, entries)
    }
    dirs.set('_orch/verify', verify)
  }
  for (const q of fx.questions) {
    files.set('_orch/inbox/' + q.id + '.md', q.text)
    if (q.asked) files.set('_orch/inbox/' + q.id + '.asked.md', ASKED)
  }
  for (const [k, v] of Object.entries(fx.extra || {})) files.set(k, v)
  const listOf = (p: string) => {
    const seen = new Map<string, string>()
    for (const k of files.keys()) {
      if (!k.startsWith(p + '/')) continue
      const rest = k.slice(p.length + 1)
      const i = rest.indexOf('/')
      seen.set(i < 0 ? rest : rest.slice(0, i), i < 0 ? 'file' : 'dir')
    }
    return [...seen].map(([name, kind]) => ({ name, kind }))
  }
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
    if (p === '_orch/inbox') return { value: listOf('_orch/inbox') }
    const v = dirs.get(p)
    if (v) return { value: v }
    const l = listOf(p)
    return l.length ? { value: l } : { deny: 'no such directory' }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'baton', isPlaced: true }] }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return Text({ key: 'engine', children: ['engine'] })
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
    const q = e.questions[0]
    const options = (q.options || []).map((o: any) => o.label)
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
  /** Start the session and open the pane with a window taller than every row (no scrolling). */
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    await $.agent.spawn({ prompt: 'do the work', description: 'alpha worker', subagentType: 'baton:worker' } as any)
    await settle(61000) // past the mod's own re-read interval, so the pane reads the record as it now stands
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { bodyRows: 400 } } as any })
  }
  /** The band above the prompt, mounted after the pane has read the record. */
  async function band($: any) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 200, scroll: {} } as any })
  }
  return { settle, pane, band, files }
}

// ------------------------------------------------------------------ reading the drawn tree

const strings = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(strings).join('')
  if (n.type === 'Button') return '' // a Button's label is its control, not the row's text
  return (n.children || []).map(strings).join('')
}
const withLabels = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(withLabels).join('')
  return String(n.type === 'Button' && n.props && n.props.label ? n.props.label : '') + (n.children || []).map(withLabels).join('')
}

type Unit = { text: string; texts: any[]; buttons: any[]; box: boolean }
/** Every row Box and every Text, with the Text nodes and Buttons inside it. */
function units(tree: any): Unit[] {
  const out: Unit[] = []
  const inner = (c: any, texts: any[], buttons: any[]) => {
    if (!c || typeof c !== 'object') return
    if (Array.isArray(c)) return c.forEach((x) => inner(x, texts, buttons))
    if (c.type === 'Text') texts.push(c)
    if (c.type === 'Button') buttons.push(c)
    ;(c.children || []).forEach((x: any) => inner(x, texts, buttons))
  }
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if ((n.type === 'Box' && n.props && n.props.flexDirection === 'row') || n.type === 'Text') {
      const texts: any[] = []
      const buttons: any[] = []
      inner(n, texts, buttons)
      out.push({ text: strings(n), texts, buttons, box: n.type === 'Box' })
    }
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}

const idRe = (id: string) => new RegExp('(^|[^A-Za-z0-9-])' + id.replace(/[-]/g, '\\-') + '([^A-Za-z0-9.]|$)') // a `?` row names its question's id (Q-49: "`? Q-42 · queued for G1 · <first line>`")
/** A question's `?` row: the innermost row Box naming its id and its first line, or else the Text that does. */
function qRow(tree: any, id: string, first: string): Unit | undefined {
  const hits = units(tree).filter((u) => idRe(id).test(u.text) && u.text.includes(first))
  const boxes = hits.filter((u) => u.box).sort((a, b) => a.text.length - b.text.length)
  return boxes[0] ?? hits.filter((u) => !u.box).sort((a, b) => a.text.length - b.text.length)[0]
}
/** Every `?` row drawn (a row whose text starts with `?`, Q-49's shape), as text. */
const qRowTexts = (tree: any) => [...new Set(units(tree).filter((u) => /^\s*\?\s/.test(u.text)).map((u) => u.text))]
/** The Text nodes of a row that carry the question's first line: the cell whose colour the row is drawn in. */
const firstCells = (u: Unit | undefined, first: string) => (u ? u.texts.filter((t) => strings(t).includes(first)) : [])

/** The band's `⚑ waiting for you` flag text, if drawn. */
async function flagText(ui: any): Promise<string | undefined> {
  const t = units(await ui.drawn()).filter((u) => !u.box && u.text.includes('⚑'))
  return t.length ? t.map((u) => u.text).join(' ') : undefined
}
/** How many questions the band's flag counts: the number before "question" in the flag, 0 when none is named. */
async function flagCount(ui: any): Promise<number> {
  const f = await flagText(ui)
  const mm = f ? /(\d+)\s+questions?\b/.exec(f) : null
  return mm ? Number(mm[1]) : 0
}

const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? b.props.label)
/** Open a row's brief by Enter on its `›` (or its only Button), without asserting (the test's assertion comes after). */
async function tryOpen(ui: any, u: Unit | undefined) {
  if (!u) return
  const bs = u.buttons.filter((b) => !String(b.props && b.props.label).includes('✉'))
  const b = bs.find((x) => String(x.props && x.props.label).includes('›')) ?? bs[0]
  if (b) await ui.press({ key: keyOf(b) })
}

// ================================================================== guards: the `?` row as at da5910c (OQ7)

test('guard: c3 a ? row shows its id, its first line and its Blocked by reading, red for explicit and yellow for interpreted', async ($, on) => {
  // Requirement R-C14-25 "and its `?` row says which:" (L226), R-C14-29 "put to the operator: the row reads `waiting
  // for you`," (L229). Handoff c3: "a `?` row shows the question id, its first line and its `Blocked by:` reading,
  // coloured red for explicit and yellow for interpreted, as at da5910c". Both questions carry Q-42's asked record, so
  // after the fix they are `waiting for you` rows, which Q-49 (plan/decisions/Q-49.md) keeps: "an asked row keeps
  // today's red or yellow".
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }, { id: 'Q-74', text: QB, asked: true }] })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const a = qRow(tree, 'Q-73', FIRST_A)
  const b = qRow(tree, 'Q-74', FIRST_B)
  expect({ a: !!a, b: !!b }).toEqual({ a: true, b: true }) // each row names its id (fixture Q-73, Q-74) and its first line (fixture FIRST_A, FIRST_B)
  expect({ a: a!.text.includes('docs/export.md') && /interpreted/.test(a!.text), b: b!.text.includes('docs/legacy.md') && /explicit/.test(b!.text) }).toEqual({ a: true, b: true }) // its Blocked by reading: the file and the kind (fixture BY_INTERP, BY_EXPL; rule 10 step 1)
  const colours = (u: Unit | undefined, first: string) => [...new Set(firstCells(u, first).map((t) => t.props.color))]
  expect({ a: colours(a, FIRST_A), b: colours(b, FIRST_B) }).toEqual({ a: ['yellow'], b: ['red'] }) // c3: interpreted is yellow, explicit is red (Q-49: kept)
})

test('guard: c37 a waiting-for-you ? row whose Blocked by line ends (explicit) is coloured red', async ($, on) => {
  // Requirement R-C14-29 "put to the operator: the row reads `waiting for you`," (L229). Q-49
  // (plan/decisions/Q-49.md): "an asked row keeps today's red or yellow". The question has Q-42's asked record, so it is
  // put to the operator (R-C14-31). At da5910c the row is red already (work/guard-evidence.md, c37).
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-74', text: QB, asked: true }] })
  const ui: any = await w.pane($)
  const cells = firstCells(qRow(await ui.drawn(), 'Q-74', FIRST_B), FIRST_B)
  expect(cells.length > 0 && cells.every((t) => t.props.color === 'red' && !t.props.dimColor)).toBe(true) // Q-49: red, and not dim (fixture BY_EXPL ends "(explicit)")
})

test('guard: c38 a waiting-for-you ? row whose Blocked by line ends (interpreted) is coloured yellow', async ($, on) => {
  // Requirement R-C14-29 (L229). Q-49 (plan/decisions/Q-49.md): "an asked row keeps today's red or yellow".
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }] })
  const ui: any = await w.pane($)
  const cells = firstCells(qRow(await ui.drawn(), 'Q-73', FIRST_A), FIRST_A)
  expect(cells.length > 0 && cells.every((t) => t.props.color === 'yellow' && !t.props.dimColor)).toBe(true) // Q-49: yellow, and not dim (fixture BY_INTERP ends "(interpreted)")
})

test('guard: c33 an open Q-T14.md, a non-numeric id, is drawn as a ? row', async ($, on) => {
  // Requirement R-C14-24 "An open question (an `_orch/inbox/Q-<n>.md` with no `Q-<n>.answer.md`) is in one of two
  // states," (L225). Q-48 (inbox/Q-48.answer.md): "any Q-<id>.md, non-numeric ids too, is a question".
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-T14', text: QA, asked: true }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-T14', FIRST_A)
  expect(r ? /^\s*\?\s/.test(r.text) : 'no ? row names Q-T14').toBe(true) // Q-48: drawn as a `?` row (fixture Q-T14.md)
})

test('guard: c34 a batch answer file Q-T02.answer.md with no Q-T02.md draws no row', async ($, on) => {
  // Requirement R-C14-24 (L225): a question is "an `_orch/inbox/Q-<n>.md`". Q-48 (inbox/Q-48.answer.md): "any
  // Q-<id>.md ... is a question"; an answer file with no question file is none.
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }], extra: { '_orch/inbox/Q-T02.answer.md': '# Q-T02 — answer\n\nA: all option A.\n' } })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  expect(qRow(tree, 'Q-73', FIRST_A) ? 'Q-73 drawn' : 'no row').toBe('Q-73 drawn') // the fixture's question is drawn, so the pane read the inbox
  expect(units(tree).filter((u) => u.text.includes('Q-T02'))).toEqual([]) // Q-48: no row names Q-T02, nor Q-T02.answer (fixture Q-T02.answer.md alone)
})

test('guard: c24 a Q-<id>.asked.md file is never drawn as a question row of its own', async ($, on) => {
  // Requirement R-C14-31 "a question is put to the operator once the run's record on disk under `_orch/` shows that it
  // was asked" (L231). Q-42 (inbox/Q-42.answer.md): the record is "Q-<id>.asked.md"; it is a record, not a question.
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }, { id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const rows = qRowTexts(await ui.drawn())
  expect(rows.filter((t) => /asked/.test(t.replace(/waiting for you/g, '')))).toEqual([]) // no `?` row names an asked file (fixture Q-73.asked.md)
  expect(rows.filter((t) => idRe('Q-73').test(t)).length).toBe(1) // Q-73 is drawn once, by its Q-73.md (fixture)
  expect(rows.length).toBe(2) // two question files, two `?` rows (fixture Q-73.md, Q-75.md)
})

// ================================================================== asked: `waiting for you`

test('missing #1 (c20): a question an asked record names reads `waiting for you` in its ? row', async ($, on) => {
  // Requirements R-C14-25 "and its `?` row says which:" (L226), R-C14-29 "put to the operator: the row reads `waiting
  // for you`," (L229), R-C14-31 (L231). Q-42 (inbox/Q-42.answer.md): "a write-once Q-<id>.asked.md with asked_at and
  // asked_via is the asked record".
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-73', FIRST_A)
  expect(r ? r.text.includes('waiting for you') : 'no ? row of Q-73').toBe(true) // L229: "the row reads `waiting for you`"
})

test('missing #2 (c23): the asked record the pane reads is _orch/inbox/Q-<id>.asked.md, and no other record', async ($, on) => {
  // Requirements R-C14-31 (L231), R-C14-32 "Until that record names the question, it is queued." (L232), R-C14-33 "The
  // pane decides from that record alone." (L233). Q-42 (inbox/Q-42.answer.md): the asked record is "Q-<id>.asked.md".
  // L236 names other records Q-42 did not choose: "a gate's questions page such as `_orch/inbox/G1-questions.html`, the
  // rule 8.1 brief"; the fixture puts Q-75 in both, and gives it no Q-75.asked.md.
  const w = world(on, {
    plan: PLAN_G1,
    questions: [{ id: 'Q-73', text: QA, asked: true }, { id: 'Q-75', text: QB }],
    extra: { '_orch/inbox/G1-questions.html': '<h1>G1 questions</h1><p>Q-75 May the export drop the legacy column?</p>\n', '_orch/brief/G1.md': '# G1 brief\n\nQ-75 is put to the operator.\n' },
  })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const s = (u: Unit | undefined) => (u ? (u.text.includes('waiting for you') ? 'waiting for you' : 'not waiting') : 'no row')
  expect({ 'Q-73': s(qRow(tree, 'Q-73', FIRST_A)), 'Q-75': s(qRow(tree, 'Q-75', FIRST_B)) }).toEqual({ 'Q-73': 'waiting for you', 'Q-75': 'not waiting' }) // Q-42: Q-73.asked.md makes it asked; a questions page or brief does not
})

// ================================================================== queued: `queued for G<n>`

test('missing #3 (c18): a question no asked record names reads `queued for G<n>`, the gate Q-43\'s rule finds (G3)', async ($, on) => {
  // Requirements R-C14-26 "The row reads `queued for G<n>`," (L227), R-C14-27 "naming the gate that will put it," (L227),
  // R-C14-32 (L232). Q-43 (inbox/Q-43.answer.md): "the next gate is the lowest phase with a node not DONE+CONFIRMED".
  // Fixture PLAN_G3: phases 1 and 2 DONE+CONFIRMED, N3 (phase 3) DONE but not CONFIRMED, so the gate is G3.
  const w = world(on, { plan: PLAN_G3, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-75', FIRST_B)
  expect(r ? (/queued for G\d+/.exec(r.text) ?? ['no queued for G<n>'])[0] : 'no ? row of Q-75').toBe('queued for G3') // Q-43: lowest phase with a node not DONE+CONFIRMED is 3
})

test('missing #4 (c28): phase 1 all DONE with CONFIRMED and phase 2 not: a queued row reads `queued for G2`', async ($, on) => {
  // Requirements R-C14-26 (L227), R-C14-27 (L227). Q-43 (inbox/Q-43.answer.md): "the next gate is the lowest phase with
  // a node not DONE+CONFIRMED". Fixture PLAN_G2.
  const w = world(on, { plan: PLAN_G2, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-75', FIRST_B)
  expect(r ? (/queued for G\d+/.exec(r.text) ?? ['no queued for G<n>'])[0] : 'no ? row of Q-75').toBe('queued for G2') // Q-43: phase 2 is the lowest not done
})

test('missing #5 (c29): a phase-1 node with no status.json: a queued row reads `queued for G1`', async ($, on) => {
  // Requirements R-C14-26 (L227), R-C14-27 (L227). Q-43 (inbox/Q-43.answer.md); Q-43.md option 1: a node "whose
  // `_orch/nodes/<id>/status.json` is missing or not DONE with CONFIRMED". Fixture PLAN_G1: N1 (phase 1) has none.
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-75', FIRST_B)
  expect(r ? (/queued for G\d+/.exec(r.text) ?? ['no queued for G<n>'])[0] : 'no ? row of Q-75').toBe('queued for G1') // Q-43: phase 1 is not done
})

test('missing #6 (c35): a queued ? row reads `? Q-<id> · queued for G<n> · <first line>`, the state right after the id', async ($, on) => {
  // Requirements R-C14-25 (L226), R-C14-26 (L227). Q-49 (plan/decisions/Q-49.md): "The state goes right after the id,
  // so a cut never hides it: `? Q-42 · queued for G1 · <first line> — blocked by …`". Fixture PLAN_G1 (Q-43: G1).
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-75', FIRST_B)
  expect(r ? /\? Q-75 · queued for G1 · May the export drop the legacy column\?/.test(r.text) : 'no ? row of Q-75').toBe(true) // Q-49's shape, with the fixture's id, gate and first line (FIRST_B)
})

test('missing #7 (c36): a queued ? row is drawn dim', async ($, on) => {
  // Requirements R-C14-25 (L226), R-C14-26 (L227). Q-49 (plan/decisions/Q-49.md): "A queued row is dim".
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const cells = firstCells(qRow(await ui.drawn(), 'Q-75', FIRST_B), FIRST_B)
  expect(cells.length > 0 && cells.every((t) => t.props.dimColor === true)).toBe(true) // Q-49: dim (fixture Q-75 has no asked record)
})

// ================================================================== no gate found (Q-44)

test('missing #8 (c30): with no _orch/plan/graph.yaml, a queued row reads `queued` and names no gate', async ($, on) => {
  // Requirements R-C14-26 (L227), R-C14-27 (L227). Q-44 (inbox/Q-44.answer.md): "the row reads "queued", the band does
  // not count it, and the brief notes no gate found." Fixture: no plan.
  const w = world(on, { plan: null, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const r = qRow(await ui.drawn(), 'Q-75', FIRST_B)
  expect(r ? { queued: /\bqueued\b/.test(r.text), gate: /\bG\d+\b/.test(r.text), waiting: r.text.includes('waiting for you') } : 'no ? row of Q-75').toEqual({ queued: true, gate: false, waiting: false }) // Q-44: "queued", no G<n>
})

test('missing #9 (c31): with no _orch/plan/graph.yaml, the band\'s flag does not count the queued question', async ($, on) => {
  // Requirement R-C14-28 "and the band's `⚑ waiting for you` does not count it." (L228). Q-44 (inbox/Q-44.answer.md):
  // "the band does not count it".
  const w = world(on, { plan: null, questions: [{ id: 'Q-75', text: QB }] })
  await w.pane($)
  const b: any = await w.band($)
  expect(await flagCount(b)).toBe(0) // Q-44: the queued question is not counted
})

test('missing #10 (c32): with no _orch/plan/graph.yaml, the queued question\'s brief notes no gate found', async ($, on) => {
  // Requirement R-C14-27 (L227). Q-44 (inbox/Q-44.answer.md): "the brief notes no gate found"; the line, handoff c32:
  // `no gate found in _orch/plan/graph.yaml`.
  const w = world(on, { plan: null, questions: [{ id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  await tryOpen(ui, qRow(await ui.drawn(), 'Q-75', FIRST_B)) // opening the brief is T113B's to pin; here only what it holds
  const lines = withLabels(await ui.drawn()).split(/\n/)
  expect(lines.some((l) => l.includes('no gate found in _orch/plan/graph.yaml'))).toBe(true) // Q-44, handoff c32
})

// ================================================================== the band

test('guard: c4 every open question asked: the band\'s ⚑ waiting for you flag counts them and points to Work (1)', async ($, on) => {
  // Requirement R-C14-30 "and the band's `⚑ waiting for you` counts it." (L229). Handoff c4: "the band's `⚑ waiting
  // for you` flag counts them and points to Work (1), as at da5910c". Both questions carry Q-42's asked record.
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }, { id: 'Q-74', text: QB, asked: true }] })
  await w.pane($)
  const b: any = await w.band($)
  const f = (await flagText(b)) ?? 'no flag'
  expect({ waiting: f.includes('⚑ waiting for you'), count: await flagCount(b), work: f.includes('Work (1)') }).toEqual({ waiting: true, count: 2, work: true }) // L229: counts both (fixture: two asked); c4: "points to Work (1)"
})

test('guard: c21 a question an asked record names is counted by the band\'s flag', async ($, on) => {
  // Requirement R-C14-30 "and the band's `⚑ waiting for you` counts it." (L229). Q-42 (inbox/Q-42.answer.md): the
  // asked record. The fixture of missing #1 (c20).
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }] })
  await w.pane($)
  const b: any = await w.band($)
  expect(await flagCount(b)).toBe(1) // L229: the one asked question is counted
})

test('missing #11 (c19): a queued question is not counted by the band\'s flag', async ($, on) => {
  // Requirement R-C14-28 "and the band's `⚑ waiting for you` does not count it." (L228). The fixture of missing #3
  // (c18): one question, no asked record.
  const w = world(on, { plan: PLAN_G3, questions: [{ id: 'Q-75', text: QB }] })
  await w.pane($)
  const b: any = await w.band($)
  expect(await flagCount(b)).toBe(0) // L228: not counted
})

test('missing #12 (c22): one queued and one asked question at once: the band\'s flag counts exactly one', async ($, on) => {
  // Requirements R-C14-28 (L228), R-C14-30 (L229), R-C14-43 "and the band's flag counts only the asked one," (L242).
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }, { id: 'Q-75', text: QB }] })
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  expect({ asked: !!qRow(tree, 'Q-73', FIRST_A), queued: !!qRow(tree, 'Q-75', FIRST_B) }).toEqual({ asked: true, queued: true }) // both are drawn
  const b: any = await w.band($)
  expect(await flagCount(b)).toBe(1) // L242: only the asked one (fixture Q-73)
})

test('missing #13 (c39): with only queued questions open and no phase to check, the band draws no ⚑ flag', async ($, on) => {
  // Requirement R-C14-28 (L228). Q-50 (plan/decisions/Q-50.md): "With only queued questions, no flag is drawn, and
  // queued questions are seen in Work." No sub-orchestrator has reported, so no phase waits to be checked.
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-75', text: QB }, { id: 'Q-76', text: QA }] })
  await w.pane($)
  const b: any = await w.band($)
  expect(strings(await b.drawn()).includes('⚑')).toBe(false) // Q-50: no flag
})

test('guard: c40 with a queued question open, the band\'s text contains no `queued`', async ($, on) => {
  // Requirement R-C14-28 (L228). Q-50 (plan/decisions/Q-50.md): "the flag counts only questions put to the operator and
  // phases to check"; alternatives not taken: "A dim `· <k> queued` after the flag" and "A separate dim band line `<k>
  // queued for G<n>`". The fixture also holds an asked question, so the flag is drawn.
  const w = world(on, { plan: PLAN_G1, questions: [{ id: 'Q-73', text: QA, asked: true }, { id: 'Q-75', text: QB }] })
  await w.pane($)
  const b: any = await w.band($)
  const t = withLabels(await b.drawn())
  expect({ flag: t.includes('⚑'), queued: /queued/i.test(t) }).toEqual({ flag: true, queued: false }) // Q-50: the band says nothing of queued questions
})
