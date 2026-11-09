// claude plugin test — FX5: the queued `?` row's label in the one-queued-one-asked fixture (R-C14-41).
//
// Written from the spec (node FX5, run build-20261019T125436Z, phase P4). R-C14-41, spec
// docs/designs/v7.6-tuning.md L240-242: "a plugin test with a fixture holding one queued and one asked question, in
// which the queued `?` row reads `queued for G<n>`, the asked one reads `waiting for you`, and the band's flag counts
// only the asked one". The behaviour holds at the run tip (verify/R-C14-41-verdict.json: "the acceptance test as
// written does not pin it"), so this test is shown able to fail under a recorded product mutant (decision P4-d1,
// FX5 work/mutants.txt).
//
// The gate: inbox/Q-43.answer.md "the next gate is the lowest phase with a node not DONE+CONFIRMED". The fixture's
// phase 1 holds N1 with no status.json, so the gate is G1. The asked record: inbox/Q-42.answer.md "a write-once
// Q-<id>.asked.md with asked_at and asked_via is the asked record".
//
// The world is the one of mod/tests/t13-queued.test.ts (copied, not imported), reduced to this one fixture.
import { expect, mock, test } from 'claude-code/testing'
// amended by verifier (XTFL1): the kit's default budget of 5000 ms per test is wall time. With four suites run at once
// (each runs all its files at once) the tests here ran 6-10x slower than alone and timed out under that load
// (_orch/nodes/XTFL1/work/repro.md, cause.md), so every test in this file gets an explicit budget. No step or assertion
// is changed by it.
const LOADED = { timeoutMs: 60000 }

const RUN = '/proj/run' // fixture: the run's directory
const RUN_ID = 'build-20261019T125436Z' // fixture run id
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a' // fixture: this session's id, the manifest's prime_session

const FIRST_A = 'Which date format does the export use?' // fixture: the asked question's first line
const FIRST_B = 'May the export drop the legacy column?' // fixture: the queued question's first line
const qText = (first: string, blockedBy: string) =>
  [first, '', '**Question.** ' + first + ' The export writes every date in a report.', '', '1. **(recommended)** Option one.', '2. Option two.', '', '**Nodes it blocks:** T5.', '', '**If unanswered, the run assumes:** option 1.', '', blockedBy, ''].join('\n')
const QA = qText(FIRST_A, 'Blocked by: docs/export.md:"dates follow the house style" (interpreted)')
const QB = qText(FIRST_B, 'Blocked by: docs/legacy.md:"the legacy column stays until v9" (explicit)')
const ASKED = 'asked_at: 2026-10-19T12:00:00Z\nasked_via: terminal\n'

// Phase 1 not done (N1 has no status.json, N2 is DONE+CONFIRMED), T5 (phase 2) BLOCKED: the gate is G1 (Q-43).
const PLAN = [
  { id: 'N1', phase: 1 },
  { id: 'N2', phase: 1, status: 'DONE', verify: 'CONFIRMED' },
  { id: 'T5', phase: 2, status: 'BLOCKED' },
  { id: 'N3', phase: 3 },
] as { id: string; phase: number; status?: string; verify?: string }[]

function world(on: any) {
  const t0 = Date.now()
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const m = { run_id: RUN_ID, mode: 'BUILD', target: 'docs/designs/v7.6-tuning.md', prime: true, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m, null, 2) + '\n')
  files.set('_orch/plan/graph.yaml', PLAN.map((n) => '- id: ' + n.id + '\n  phase: ' + n.phase + '\n').join(''))
  const ph = [...new Set(PLAN.map((n) => n.phase))].sort()
  dirs.set('_orch/phases', ph.map((n) => ({ name: 'P' + n, kind: 'dir' })))
  for (const n of ph) files.set('_orch/phases/P' + n + '/brief.md', '# P' + n + ' brief\n')
  dirs.set('_orch/nodes', PLAN.map((n) => ({ name: n.id, kind: 'dir' })))
  const verify: { name: string; kind: string }[] = []
  for (const n of PLAN) {
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
  // The fixture: Q-73 asked (its asked record is on disk), Q-75 queued (no asked record).
  files.set('_orch/inbox/Q-73.md', QA)
  files.set('_orch/inbox/Q-73.asked.md', ASKED)
  files.set('_orch/inbox/Q-75.md', QB)
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
  on('tool.call', () => ({ result: 'ran' }))
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
  async function pane($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(2000)
    await $.agent.spawn({ prompt: 'do the work', description: 'alpha worker', subagentType: 'baton:worker' } as any)
    await settle(61000)
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: { title: 'baton', isFocused: true, bodyColumns: 200, placement: 'dock', scroll: { bodyRows: 400 } } as any })
  }
  async function band($: any) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 200, scroll: {} } as any })
  }
  return { settle, pane, band, files }
}

const strings = (n: any): string => {
  if (typeof n === 'string') return n
  if (!n || typeof n !== 'object') return ''
  if (Array.isArray(n)) return n.map(strings).join('')
  if (n.type === 'Button') return ''
  return (n.children || []).map(strings).join('')
}
/** Every row Box and every Text, as text. */
function units(tree: any): { text: string; box: boolean }[] {
  const out: { text: string; box: boolean }[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if ((n.type === 'Box' && n.props && n.props.flexDirection === 'row') || n.type === 'Text') out.push({ text: strings(n), box: n.type === 'Box' })
    ;(n.children || []).forEach(walk)
  }
  walk(tree)
  return out
}
const idRe = (id: string) => new RegExp('(^|[^A-Za-z0-9-])' + id.replace(/[-]/g, '\\-') + '([^A-Za-z0-9.]|$)')
/** A question's `?` row: the innermost row Box naming its id and its first line, else the Text that does. */
function qRow(tree: any, id: string, first: string): string | undefined {
  const hits = units(tree).filter((u) => idRe(id).test(u.text) && u.text.includes(first))
  const boxes = hits.filter((u) => u.box).sort((a, b) => a.text.length - b.text.length)
  return (boxes[0] ?? hits.filter((u) => !u.box).sort((a, b) => a.text.length - b.text.length)[0])?.text
}
async function flagCount(ui: any): Promise<number> {
  const t = units(await ui.drawn()).filter((u) => !u.box && u.text.includes('⚑')).map((u) => u.text).join(' ')
  const mm = /(\d+)\s+questions?\b/.exec(t)
  return mm ? Number(mm[1]) : 0
}

// R-C14-41 (spec L241): in the one-queued-one-asked fixture, the queued `?` row reads `queued for G<n>`.
test('R-C14-41: one queued and one asked question in one fixture: the queued row reads queued for G1, the asked one waiting for you, the band counts one', LOADED, async ($, on) => {
  const w = world(on)
  const ui: any = await w.pane($)
  const tree = await ui.drawn()
  const queued = qRow(tree, 'Q-75', FIRST_B) ?? 'no ? row of Q-75'
  const asked = qRow(tree, 'Q-73', FIRST_A) ?? 'no ? row of Q-73'
  expect({ queuedFor: queued.includes('queued for G1'), queuedNotWaiting: !queued.includes('waiting for you') }).toEqual({ queuedFor: true, queuedNotWaiting: true }) // L241 "the queued `?` row reads `queued for G<n>`"; Q-43: G1
  expect({ askedWaiting: asked.includes('waiting for you'), askedNotQueued: !/queued/.test(asked) }).toEqual({ askedWaiting: true, askedNotQueued: true }) // L241-242 "the asked one reads `waiting for you`"
  const b: any = await w.band($)
  expect(await flagCount(b)).toBe(1) // L242 "the band's flag counts only the asked one"
})
