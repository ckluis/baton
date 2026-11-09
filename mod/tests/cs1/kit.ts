// CS1 (run build-20261019T125436Z, phase P7): the kit the CS1 tests share, not a test file itself.
//
// The drawing model is PW1's (mod/tests/pw1-a3/kit.ts: cellW, elements, screen, dump), imported unchanged. The world
// is PW1's own (pw1-a3/kit.ts pw1World: two phases, fourteen agents, a sub-orchestrator that returned DONE so its
// phase waits for the operator's check, an asked question Q-7, a BLOCKED worker T203), copied here so that what the
// band is fed can be set per test: the plan usage `$.session.usage()` answers (`usage`), whether the phase waits
// (`approval`), whether the question is asked (`question`) and whether T203 is blocked (`blocked`). The figures the
// tests push through `session.measure` are the tests' own; nothing here makes one up.
import { mock } from 'claude-code/testing'
import { PW1_AGENTS, type Agent } from '../pw1-a3/kit'

const RUN = '/proj/run'
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a'
const OPUS = 'claude-opus-5-5'
export const T0 = Date.parse('2026-11-06T09:00:00Z')

export type Opts = { usage?: any; approval?: boolean; question?: boolean; blocked?: boolean }

export function stripWorld(on: any, o: Opts = {}) {
  const approval = o.approval ?? false
  const question = o.question ?? false
  const blocked = o.blocked ?? false
  const AG: Agent[] = PW1_AGENTS.map((a) => {
    if (a.id === 's1' && !approval) return { ...a, done: undefined }
    if (a.done && /^BLOCKED/.test(a.done) && !blocked) return { ...a, done: 'DONE · ' + a.node + ' green and blue, 41 tests pass' }
    return a
  })
  const ISSUE = { number: 57, title: 'Fit every tab and view of the baton pane to the width Claude Code docks it at', url: 'https://github.com/o/r/issues/57' }
  const PR = { number: 58, url: 'https://github.com/o/r/pull/58', title: 't', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'ci', conclusion: 'SUCCESS' }], comments: [], assignees: [], headRefName: 'run-branch', author: { login: 'me' }, closingIssuesReferences: [], files: [] }
  const Q7 = '# Q-7 — which streaming parser should the export use, the hand-written one or the library one the old path used?\n\nBlocked by: docs/designs/export.md:"the parser is chosen per release by the operator, never by a worker" (interpreted)\n'
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  files.set('_orch/plan/graph.yaml', [['T101', 1], ['T102', 1], ...Array.from({ length: 14 }, (_, i) => ['T2' + String(i + 1).padStart(2, '0'), 2]), ['T301', 3]].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join(''))
  for (const p of ['P1', 'P2', 'P3']) files.set('_orch/phases/' + p + '/brief.md', '# ' + p + ' brief\n\nNodes, in order.\n')
  if (question) {
    files.set('_orch/inbox/Q-7.md', Q7)
    files.set('_orch/inbox/Q-7.asked.md', 'asked_at: 2026-11-06T08:30:00Z\nasked_via: terminal\ngate: G2\n')
  }
  dirs.set('_orch/phases', ['P1', 'P2', 'P3'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/nodes', [])
  dirs.set('_orch/inbox', question ? [{ name: 'Q-7.md', kind: 'file' }, { name: 'Q-7.asked.md', kind: 'file' }] : [])
  const manifest = { run_id: 'build-20261106T090000Z', mode: 'BUILD', target: 'issue:#57', issue: ISSUE, prime: true, phase: 'P2', pr: { number: 58 }, memory: { run: '_orch/memory' } }
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>()
  files.set('_orch/manifest.json', JSON.stringify({ ...manifest, started_at: new Date(T0 - 3600000).toISOString(), prime_session: { id: SID, heartbeat_at: new Date(T0).toISOString() } }))
  const rel = (p: string) => { const x = String(p); if (x.startsWith('_orch/')) return x; const i = x.lastIndexOf('/_orch/'); return i >= 0 ? x.slice(i + 1) : x }
  on('fs.read', (_$: any, e: any) => { const v = files.get(rel(e.path)); return v === undefined ? { deny: 'no such file' } : { value: v } })
  on('fs.write', (_$: any, e: any) => { files.set(rel(e.path), e.text); return { value: undefined } })
  on('fs.exists', (_$: any, e: any) => { const p = rel(e.path); return { value: files.has(p) || dirs.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/')) } })
  on('fs.list', (_$: any, e: any) => { const v = dirs.get(rel(e.path)); return v ? { value: v } : { deny: 'no such directory' } })
  on('store.get', (_$: any, e: any) => ({ value: store.has(e.key) ? store.get(e.key) : undefined }))
  on('store.set', (_$: any, e: any) => (store.set(e.key, e.value), { value: undefined }))
  on('store.delete', (_$: any, e: any) => (store.delete(e.key), { value: undefined }))
  on('store.keys', () => ({ value: [...store.keys()] }))
  for (const k of ['ui.log', 'ui.notify', 'ui.toast', 'ui.status', 'ui.close']) on(k, () => ({ value: undefined }))
  const opens: any[] = []
  on('ui.open', (_$: any, e: any) => (opens.push({ ...e }), { value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  // the engine's own drawing: one empty Text keyed `engine`, which the tests leave out of the lines baton draws
  on('ui.render', ($: any, e: any) => { const { Text } = $.ui.resolve(e); return Text({ key: 'engine', children: [''] }) })
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: OPUS }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.319', base: '2.1.319' } }))
  on('session.usage', () => ({ value: o.usage ?? { rateLimits: [] } }))
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostToolUse', () => ({}))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'core' }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ran', text: 'ran' }))
  on('model.complete', () => ({ isAnswered: true, text: 'a remark', usage: null }))
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    let out: any = {}
    if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view') out = PR
    else if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'view') out = { ...ISSUE, labels: [] }
    else if (argv[0] === 'gh') out = []
    else if (argv[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    else if (argv.includes('stats')) out = { notes: 0, summaries: 0, treeCapacity: 7, levels: 0, pending: 0, ready: 0 }
    else if (argv.includes('recall')) out = { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = { header: 'h', tiles: [], lines: [] }
    else if (argv.includes('marks') || argv.includes('superseded')) out = []
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  const byPrompt = new Map(AG.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: byPrompt.get(e.prompt)?.id ?? 'x', model: byPrompt.get(e.prompt)?.model ?? OPUS }))
  on('turn.step', async function* (_$: any, e: any) {
    const a = AG.find((x) => x.id === e.agentId)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: a?.model ?? OPUS, input_tokens: 41000, output_tokens: 12000, cache_read_input_tokens: 380000, cache_creation_input_tokens: 16000 } }
  })
  mock.env(on, {})
  mock.session(on)
  async function settle(ms = 10) { await clock.advance(ms); await clock.settle() }
  async function begin($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(200000)
    for (const a of AG) {
      await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
      const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, effort: a.effort } as any)
      for (let x = await g.next(); !x.done; x = await g.next());
    }
    for (const a of [...AG].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: a.done, isAborted: false } as any)
    await settle(61000)
  }
  /** The band above the prompt, `width` cells wide. */
  async function band($: any, width: number) {
    return $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: width, scroll: {} } as any })
  }
  /** The agents still running once `begin` is done: every one the world never finishes. */
  const running = AG.filter((a) => !a.done).length
  return { settle, begin, band, opens, files, agents: AG, running }
}
