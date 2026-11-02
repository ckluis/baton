// claude plugin test — FX5: a pane answer reaches a node that has already returned BLOCKED (R-C14-12, R-C14-23).
//
// Written from the spec and the operator's answers BEFORE the fix (node FX5, run build-20261019T125436Z, phase P4):
// - R-C14-12, spec docs/designs/v7.6-tuning.md L207: "An answer reaches the asking node, the same way an
//   AskUserQuestion answer would."
// - R-C14-23, spec L215-216: "plus a live check through cmux that an answer given in the pane reaches the asking node."
//   The live check itself is FX5's work/screens; the test below pins the wake that the live check needs (LV13 section
//   11: "Nothing woke it: the note goes only into run memory").
// - inbox/Q-36.answer.md (T02's question on how an answer reaches a node that has already returned BLOCKED, binding):
//   "A: the mod writes the answer file and puts a note to the prime, which re-dispatches the asking node at once."
//   The prime cannot read the answer file (the prime guard), so what it is handed must carry the answer itself; and "at
//   once" means the prime is woken, not left to find a note at its next turn.
//
// The world is the one of mod/tests/t13-answer.test.ts (copied, not imported: the engine beneath the mod answers from
// memory), reduced to what these tests read: a prime manifest naming this session, node T5 whose envelope reads
// BLOCKED (it has returned, so no agent of it is live), and Q-72.md naming T5 on its `Nodes it blocks:` line. It also
// records each prompt the mod submits ($.prompt.submit: "a turn of its own, once the session is idle", types
// index.d.ts, the call the pane's send-back already makes to the prime).
import { expect, mock, test } from 'claude-code/testing'

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session

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
const Q72_NODE = 'T5' // fixture: the node Q-72.md names, whose envelope reads BLOCKED
// fixture: what the operator types under Other; none of its words is in Q-72.md, so it can only come from the answer.
const TYPED = 'keep a frozen copy in the archive, then drop it'
const T5_STATUS = { node: 'T5', rung: 1, model: 'claude-opus-5-5', effort: 'medium', attempt: 1, verdict: 'BLOCKED', outputs: [], summary: 'T5 is BLOCKED on Q-72: may the export drop the legacy column.', evidence: [], risk: 'none', caveats: [], escalation_reason: null, handback: null }

type Ev = { kind: 'write'; path: string; text: string } | { kind: 'note'; tag: string; text: string } | { kind: 'send'; to: string; text: string } | { kind: 'submit'; text: string }

function world(on: any) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const events: Ev[] = []
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', '- id: N1\n  phase: 1\n- id: T5\n  phase: 2\n')
  dirs.set('_orch/phases', [1, 2].map((n) => ({ name: 'P' + n, kind: 'dir' })))
  for (const n of [1, 2]) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  dirs.set('_orch/nodes', [{ name: 'T5', kind: 'dir' }])
  dirs.set('_orch/nodes/T5', [{ name: 'handoff.md', kind: 'file' }, { name: 'status.json', kind: 'file' }])
  files.set('_orch/nodes/T5/handoff.md', '# HANDOFF — T5\n\nExport the report.\n')
  files.set('_orch/nodes/T5/status.json', JSON.stringify(T5_STATUS, null, 2) + '\n')
  files.set('_orch/inbox/Q-72.md', Q72)
  files.set('_orch/inbox/Q-72.asked.md', 'asked_at: ' + new Date(t0 - 500000).toISOString() + '\nasked_via: terminal\ngate: G1\n')
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
  on('session.send', (_$: any, e: any) => {
    events.push({ kind: 'send', to: typeof e.to === 'string' ? e.to : JSON.stringify(e.to), text: String(e.text) })
    return { isDelivered: true }
  })
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  // A prompt the mod submits reaches the session's model as a turn of its own: the wake.
  on('prompt.submit', (_$: any, e: any) => {
    events.push({ kind: 'submit', text: String(e.text) })
    return { text: e.text }
  })
  on('turn.complete', () => ({ text: '' }))
  // $.ui.ask is a tool.call of AskUserQuestion; the operator types TYPED under Other (Q-35: "plus Other for free text").
  on('tool.call', (_$: any, e: any) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    return { result: { questions: e.questions, answers: { [q.question]: TYPED } } }
  })
  on('tool.check', () => ({ decision: 'allow' }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv.includes('note')) {
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
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    await $.agent.spawn({ prompt: 'do the work', description: 'alpha worker', subagentType: 'baton:worker' } as any)
    await settle(61000)
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { bodyRows: 600 } } as any })
  }
  return { settle, pane, files, events }
}

// ------------------------------------------------------------------ reading the drawn tree (as t13-answer.test.ts)

const strings = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(strings).join('')
  if (n.type === 'Button') return ''
  return (n.children || []).map(strings).join('')
}
type Row = { text: string; buttons: any[] }
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
const openers = (r: Row) => r.buttons.filter((b) => !labelOf(b).includes('✉'))
const keyOf = (b: any) => String(b.key ?? (b.props && b.props.key) ?? labelOf(b))
const qRe = (id: string) => new RegExp('(^|[^A-Za-z0-9-])' + id + '([^0-9]|$)')

/** Open Q-72's brief by Enter on its `›`, then press the brief's answer key `a` (Q-39). */
async function answerQ72(w: any, ui: any) {
  const hits = rowBoxes(await ui.drawn()).filter((r) => qRe('Q-72').test(r.text) && openers(r).length > 0)
  hits.sort((a, b) => a.buttons.length - b.buttons.length)
  const r = hits[0]
  const enter = r ? openers(r).find((b) => labelOf(b).includes('›')) ?? openers(r)[0] : undefined
  if (enter) await ui.press({ key: keyOf(enter) })
  await w.settle(100)
  const a = (await ui.findAll({ type: 'Button' })).find((b: any) => b.props.hotkey === 'a')
  if (a) await ui.press({ key: keyOf(a) })
  await w.settle(100)
  await w.settle(100)
  return { opened: !!enter, answered: !!a }
}

// ================================================================== R-C14-12: the prime is handed the answer itself

// R-C14-12 (spec L207) and criterion 18 of FX5: answered from the pane, a question whose node has returned BLOCKED.
test('R-C14-12: the note that tells the prime to re-dispatch a BLOCKED node carries the answer text, not only the question', async ($, on) => {
  // inbox/Q-36.answer.md: "the mod writes the answer file and puts a note to the prime, which re-dispatches the asking
  // node at once". The prime cannot read _orch/inbox/Q-72.answer.md, so the note it re-dispatches T5 from must hold
  // the answer (TYPED), or T5 is re-dispatched without it (LV13 section 11, item 1).
  const w = world(on)
  const ui: any = await w.pane($)
  expect(await answerQ72(w, ui)).toEqual({ opened: true, answered: true })
  expect(w.files.get('_orch/inbox/Q-72.answer.md') ?? '').toContain(TYPED) // premise: the answer file holds the answer
  const toPrime = w.events.filter((e): e is Extract<Ev, { kind: 'note' }> => e.kind === 'note' && e.tag === 'operator' && new RegExp('Re-dispatch ' + Q72_NODE + '\\b').test(e.text))
  expect(toPrime.length >= 1 ? 'a note re-dispatches T5' : JSON.stringify(w.events)).toBe('a note re-dispatches T5')
  expect(toPrime.some((n) => n.text.includes(TYPED)) ? 'the note carries the answer' : 'note text: ' + toPrime.map((n) => n.text).join(' | ')).toBe('the note carries the answer')
})

// ================================================================== R-C14-23: the prime is woken with the answer

// R-C14-23 (spec L215-216, the live check LV13 refuted) and criterion 19 of FX5: the pane answer wakes the prime.
test('R-C14-23: a pane answer to a BLOCKED node\'s question wakes the prime with a prompt naming the node, the answer and its file', async ($, on) => {
  // Q-36: the prime "re-dispatches the asking node at once"; LV13 section 11 item 2: "Nothing woke it: the note goes
  // only into run memory". The wake is a prompt submitted to the prime's session (as the pane's send-back does), after
  // the answer file is written, holding what the prime needs to re-dispatch T5: the node, the question id, the answer
  // text and the answer file's path.
  const w = world(on)
  const ui: any = await w.pane($)
  expect(await answerQ72(w, ui)).toEqual({ opened: true, answered: true })
  const submits = w.events.filter((e): e is Extract<Ev, { kind: 'submit' }> => e.kind === 'submit' && e.text.includes('Q-72'))
  expect(submits.length === 1 ? 'the prime is woken once' : 'prompts submitted: ' + JSON.stringify(submits)).toBe('the prime is woken once')
  const t = submits[0]!.text
  expect({ node: new RegExp('\\b' + Q72_NODE + '\\b').test(t), answer: t.includes(TYPED), file: t.includes('_orch/inbox/Q-72.answer.md'), redispatch: /re-dispatch/i.test(t) }).toEqual({ node: true, answer: true, file: true, redispatch: true })
  const order = w.events.map((e) => (e.kind === 'write' && e.path === '_orch/inbox/Q-72.answer.md' ? 'answer file' : e.kind === 'submit' && e.text.includes('Q-72') ? 'wake' : null)).filter(Boolean)
  expect(order).toEqual(['answer file', 'wake']) // Q-36: the file first, then the prime acts on it
})

// R-C14-12 and R-C14-23: one answer wakes the prime once; pressing the answer key again does not wake it again.
test('R-C14-12, R-C14-23: no prompt is submitted when the answer file already exists (the brief only says so)', async ($, on) => {
  // plan/decisions.md Q-41: "an existing answer file is never overwritten (the brief says it is already answered)".
  // An answer already on file was not given here, so the pane does not wake the prime for it a second time. This test
  // also needs the wake to exist: it asserts the first answer woke the prime exactly once and a second press did not.
  const w = world(on)
  const ui: any = await w.pane($)
  await answerQ72(w, ui)
  const a = (await ui.findAll({ type: 'Button' })).find((b: any) => b.props.hotkey === 'a')
  if (a) await ui.press({ key: keyOf(a) })
  await w.settle(100)
  const wakes = w.events.filter((e) => e.kind === 'submit' && e.text.includes('Q-72')).length
  expect(wakes).toBe(1)
})
