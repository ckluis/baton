// PW1 attempt 3 (run build-20261019T125436Z, phase P7): the kit the attempt-3 tests share, not a test file itself.
//
// The drawing model is mod/tests/pw1-readable.test.ts's (itself mod/tests/pw1-fit.test.ts's), unchanged. The two
// worlds are the ones those files draw: PW1's own (pw1-fit.test.ts: two phases, fourteen agents with long labels, opus
// at high and sonnet at medium, a phase waiting for its check, two open questions, four rulings) and the verifier's
// hostile one (pw1-readable.test.ts, from _orch/nodes/PW1/verify-work/mod/tests/hostile.test.ts: 34 agents, six model
// ids, eight effort forms, labels of about 150 characters, six rulings, `nq` open questions). Copied, so the files
// they come from stay as they are.
import { mock } from 'claude-code/testing'

// ---- the drawing model ------------------------------------------------------------------------------------------
const wide = (c: string) => c === '✅' || c === '❌'
export const cellW = (s: string) => [...s].reduce((n, c) => n + (wide(c) ? 2 : 1), 0)
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
function wrapLines(t: string, w: number): number {
  if (w <= 0) return 1
  let lines = 1
  let used = 0
  for (const word of t.trim().split(/(\s+)/)) {
    if (!word) continue
    const n = cellW(word)
    if (used + n <= w) { used += n; continue }
    if (/^\s+$/.test(word)) { used = w; continue }
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
    widths = f.map((v) => { acc += v; const r = Math.round(acc); const w = Math.max(0, r - prev); prev = r; return w })
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
function drawRow(box: any, width: number): Leaf[] {
  const out: Leaf[] = []
  const kids = kidsOf(box)
  const gap = box.props?.columnGap ?? 0
  if (box.props?.flexWrap !== 'wrap') { layout(kids, width, 0, 0, out, gap, false); return out }
  const lines: any[][] = [[]]
  let used = 0
  for (const c of kids) {
    const b = basisOf(c, width)
    const cur = lines[lines.length - 1]!
    if (cur.length && used + gap + b > width) { lines.push([c]); used = b } else { used += (cur.length ? gap : 0) + b; cur.push(c) }
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
  rows.forEach((r, y) => { if (r === undefined) return; out.push(r); for (let k = 1; k < (tall[y] ?? 1); k++) out.push('') })
  return out.length ? out : ['']
}
export type El = { node: any; text: string; lines: string[]; leaves: Leaf[] }
export function elements(n: any, width: number, out: El[] = []): El[] {
  if (Array.isArray(n)) { for (const c of n) elements(c, width, out); return out }
  if (n == null || n === false) return out
  if (typeof n === 'string') {
    out.push({ node: n, text: n, lines: [truncEnd(n, width)], leaves: [{ kind: 'text', text: n, drawn: truncEnd(n, width), x: 0, y: 0, h: cellW(n) > width ? wrapLines(n, width) : 1, boxed: false }] })
    return out
  }
  if (n.type === 'Box' && n.props?.flexDirection === 'column') { for (const c of kidsOf(n)) elements(c, width, out); return out }
  if (n.type === 'Box') { const leaves = drawRow(n, width); out.push({ node: n, text: leaves.map((l) => l.text).join(''), lines: drawnLines(leaves), leaves }); return out }
  if (n.type === 'Input') { const t = String(n.props?.label ?? ''); out.push({ node: n, text: t, lines: [truncEnd(t, width)], leaves: [] }); return out }
  const t = n.type === 'Button' ? buttonText(n) : textOf(n)
  const h = n.type === 'Text' && cellW(t) > width && wraps(n) ? wrapLines(t, width) : 1
  const leaf: Leaf = { kind: n.type === 'Button' ? 'button' : 'text', text: t, drawn: n.type === 'Button' ? t : truncEnd(t, width), x: 0, y: 0, h, boxed: false }
  out.push({ node: n, text: t, lines: [leaf.drawn, ...Array.from({ length: h - 1 }, () => '')], leaves: [leaf] })
  return out
}
export const screen = (els: El[]) => els.flatMap((e) => e.lines)
export const dump = (els: El[]) => '\n' + screen(els).map((l, i) => String(i).padStart(3) + ' |' + l + '|').join('\n')

// ---- the agents of both worlds, as a row of the tree tells them -------------------------------------------------
/** `short`: the model as its row draws it; `node`: what follows the role in its label (the node, or the phase). */
export type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; model: string; short: string; node: string; effort?: string; form?: { cfg?: string; served?: string }; done?: string }
/** The role a row's label starts with (register.js: `sub-orch`, `worker`, `verifier`). */
export const roleOf = (a: Agent) => (a.subagentType === 'baton:sub-orchestrator' ? 'sub-orch' : a.subagentType === 'baton:verifier' ? 'verifier' : 'worker')
export const MODEL_SHORTS = ['opus 5.5', 'sonnet 5.5', 'haiku 4.5', 'fable 5']

const RUN = '/proj/run'
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a'
const OPUS = 'claude-opus-5-5'
const SONNET = 'claude-sonnet-5-5'

type Spec = { files: Map<string, string>; dirs: Map<string, { name: string; kind: string }[]>; manifest: any; pr: any; issue: any; rulings: any[]; notes: any[]; wake: () => any; agents: Agent[]; usage: (a?: Agent) => any }

function engine(on: any, s: Spec) {
  const t0 = Date.parse('2026-11-06T09:00:00Z')
  const clock = mock.clock(on, { now: t0 })
  const { files, dirs } = s
  const store = new Map<string, unknown>()
  files.set('_orch/manifest.json', JSON.stringify({ ...s.manifest, started_at: new Date(t0 - 3600000).toISOString(), prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }))
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
  on('ui.open', () => ({ value: { id: 'baton', isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.scroll', () => ({}))
  on('ui.focus', () => ({}))
  on('ui.render', ($: any, e: any) => { const { Text } = $.ui.resolve(e); return Text({ key: 'engine', children: [''] }) })
  on('session.cwd', () => ({ value: RUN }))
  on('session.root', () => ({ value: RUN }))
  on('session.id', () => ({ value: SID }))
  on('session.model', () => ({ value: OPUS }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.version', () => ({ value: { version: '2.1.319', base: '2.1.319' } }))
  on('session.usage', () => ({ value: { rateLimits: [] } }))
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
    if (argv[0] === 'gh' && argv[1] === 'pr' && argv[2] === 'view') out = s.pr
    else if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'view') out = { ...s.issue, labels: [] }
    else if (argv[0] === 'gh') out = []
    else if (argv[0] === 'git') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    else if (argv.includes('stats')) out = { notes: s.notes.length, summaries: 2, treeCapacity: 7, levels: 2, pending: 0, ready: 2 }
    else if (argv.includes('recall')) out = argv.includes('rulings') ? { pattern: '.', total: s.rulings.length, notes: s.rulings, blocks: [] } : { pattern: '.', total: 0, notes: [], blocks: [] }
    else if (argv.includes('wake') || argv.includes('zoom')) out = s.wake()
    else if (argv.includes('marks') || argv.includes('superseded')) out = []
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  const byPrompt = new Map(s.agents.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: byPrompt.get(e.prompt)?.id ?? 'x', model: byPrompt.get(e.prompt)?.model ?? OPUS }))
  on('turn.step', async function* (_$: any, e: any) {
    const a = s.agents.find((x) => x.id === e.agentId)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: s.usage(a) }
  })
  mock.env(on, {})
  mock.session(on)
  async function settle(ms = 10) { await clock.advance(ms); await clock.settle() }
  const props = (w: number, rows: number) => ({ title: 'baton', isFocused: true, bodyColumns: w, placement: w > 100 ? 'inline' : 'dock', scroll: { bodyRows: rows, offset: 0 } })
  async function pane($: any, w: number, rows: number) {
    await $.command.run({ command: 'baton', args: '' } as any)
    await settle(1000)
    const ui = await $.ui.mount({ plugin: 'baton', surface: 'terminal', component: 'Pane', requestId: 'baton', props: props(w, rows) as any })
    await settle()
    await ui.redraw(props(w, rows) as any)
    return ui
  }
  async function start($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(200000)
  }
  return { settle, pane, props, start }
}

// ---- the hostile world (pw1-readable.test.ts) ---------------------------------------------------------------------
const LONG = ' a deliberately enormous label that keeps going past any dock width the pane could ever be given by the engine, with more words after that, and still more'
const HNW = 32
const HPN = Array.from({ length: HNW }, (_, i) => 'T2' + String(i + 1).padStart(2, '0'))
const HMODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-sonnet-5-5-20261101', 'claude-opus-5-5[1m]', 'claude-fable-5']
const HSHORT: Record<string, string> = { 'claude-opus-5-5': 'opus 5.5', 'claude-sonnet-5-5': 'sonnet 5.5', 'claude-haiku-4-5': 'haiku 4.5', 'claude-sonnet-5-5-20261101': 'sonnet 5.5', 'claude-opus-5-5[1m]': 'opus 5.5', 'claude-fable-5': 'fable 5' }
const FORMS = [{ cfg: 'low' }, { cfg: 'xhigh' }, { cfg: 'max' }, { served: 'high' }, { cfg: 'high', served: 'low' }, {}, { cfg: 'medium' }, { served: 'xhigh' }]
export const HOSTILE: Agent[] = [
  { id: 's1', description: 'Z00 P1' + LONG, subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, short: 'opus 5.5', node: 'Z00 P1', form: { cfg: 'max' }, done: 'DONE · P1 done' },
  { id: 's2', description: 'Z01 P2' + LONG, subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 from _orch/phases/P2/brief.md', model: OPUS, short: 'opus 5.5', node: 'Z01 P2', form: { cfg: 'xhigh' } },
  ...Array.from({ length: HNW }, (_, i): Agent => {
    const model = HMODELS[i % HMODELS.length]!
    const form = FORMS[i % FORMS.length]!
    const done = i < HNW - 6 ? (i === 2 ? 'BLOCKED · operator\nBlocked by: docs/x.md:"the operator chooses, always, in every release, no exceptions" (interpreted)' : 'DONE · ' + HPN[i] + ' green' + LONG) : undefined
    const z = 'Z' + String(i + 2).padStart(2, '0')
    return { id: 'w' + (i + 1), description: z + ' ' + HPN[i] + LONG, subagentType: i % 5 === 3 ? 'baton:verifier' : 'baton:worker', prompt: 'Do node ' + HPN[i] + LONG, parent: 's2', model, short: HSHORT[model]!, node: z + ' ' + HPN[i], form, ...(done ? { done } : {}) }
  }),
]

export function hostileWorld(on: any, nq: number) {
  const QS = Array.from({ length: nq }, (_, i) => 'Q-' + (20 + i))
  const ISSUE = { number: 9999, title: 'An extremely long goal title that names everything: fit every tab, every view, every row and every hint of the baton pane to whatever width Claude Code docks it at, from forty columns to one hundred and twenty, with no line cut', url: 'https://github.com/someone-with-a-long-name/a-repository-with-a-long-name/issues/9999' }
  const RULINGS = Array.from({ length: 6 }, (_, i) => ({ index: i, tag: 'ruling', ts: '2026-11-0' + (i + 1) + 'T10:00:00Z', text: 'ruling ' + i + ':' + LONG + LONG }))
  const NOTES = Array.from({ length: 8 }, (_, i) => ({ i, ts: '2026-11-06T0' + (i + 1) + ':00:00Z', tag: 'sub', text: 'note ' + i + ':' + LONG + LONG + ' supercalifragilisticexpialidociousandthensomemoreunbrokencharacterswithoutanyspaceatall' }))
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  files.set('_orch/plan/graph.yaml', [['T101', 1], ...HPN.map((id) => [id, 2]), ['T301', 3]].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join(''))
  for (const p of ['P1', 'P2', 'P3']) files.set('_orch/phases/' + p + '/brief.md', '# ' + p + LONG + '\n\n' + LONG + '\n')
  files.set('_orch/phases/P1/envelope.json', JSON.stringify({ verdict: 'DONE', summary: 'P1' + LONG, risk: 'risk' + LONG }))
  files.set('_orch/nodes/T101/status.json', JSON.stringify({ verdict: 'DONE' }))
  files.set('_orch/nodes/T203/status.json', JSON.stringify({ verdict: 'BLOCKED', summary: 'blocked' + LONG, outputs: [], blocked_by: 'Blocked by: docs/x.md:"the operator chooses, always, in every release, no exceptions" (interpreted)' }))
  QS.forEach((q, i) => files.set('_orch/inbox/' + q + '.md', '# ' + q + ' — question number ' + i + LONG + '?\n\nBlocked by: CONTRACT.md:"' + LONG.slice(0, 80) + '" (explicit)\n'))
  files.set('_orch/inbox/Q-20.asked.md', 'asked_at: 2026-11-06T08:30:00Z\nasked_via: terminal\ngate: G2\n')
  dirs.set('_orch/phases', ['P1', 'P2', 'P3'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/nodes', ['T101', ...HPN, 'T301'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/inbox', [...QS.map((q) => ({ name: q + '.md', kind: 'file' })), { name: 'Q-20.asked.md', kind: 'file' }])
  const PR = { number: 10000, url: 'https://github.com/o/r/pull/10000', title: 't', state: 'OPEN', isDraft: false, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', statusCheckRollup: Array.from({ length: 9 }, (_, i) => ({ name: 'check-with-a-long-name-' + i, conclusion: i % 2 ? 'FAILURE' : 'SUCCESS' })), comments: [{ id: 'c1', body: '<!-- baton:pr-review round=3 -->\nVERDICT: CHANGES\n- [high] mod/hooks/register.js:2005 —' + LONG + '\n- [med] x.js:1 —' + LONG + '\n- [low] y.js:2 —' + LONG + '\n', author: { login: 'me' }, createdAt: '2026-11-06T08:00:00Z', url: 'https://github.com/o/r/pull/10000#c1' }], assignees: [], headRefName: 'run-branch', author: { login: 'me' }, closingIssuesReferences: [], files: [] }
  const wake = () => {
    const tiles = [{ level: 2, index: 0, lo: 0, hi: 4 }, { level: 1, index: 2, lo: 4, hi: 6 }, ...NOTES.slice(6).map((n) => ({ level: 0, index: n.i, lo: n.i, hi: n.i + 1 }))]
    const lines = ['#0-3 (4 notes)' + LONG, '#4-5 (2 notes)' + LONG, ...NOTES.slice(6).map((n) => '#' + n.i + ' ' + n.ts + ' [' + n.tag + '] ' + n.text)]
    return { header: 'h', tiles, lines }
  }
  const manifest = { run_id: 'build-20261106T090000Z', mode: 'BUILD', target: 'issue:#9999', issue: ISSUE, prime: true, phase: 'P2', pr: { number: 10000 }, memory: { run: '_orch/memory' } }
  const usage = (a?: Agent) => ({ model: a?.model ?? OPUS, input_tokens: 941000, output_tokens: 312000, cache_read_input_tokens: 98380000, cache_creation_input_tokens: 916000 })
  const w = engine(on, { files, dirs, manifest, pr: PR, issue: ISSUE, rulings: RULINGS, notes: NOTES, wake, agents: HOSTILE, usage })
  async function begin($: any) {
    await w.start($)
    let n = 0
    for (const a of HOSTILE) {
      await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
      const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, ...(a.form?.cfg ? { effort: a.form.cfg } : {}) } as any)
      for (let x = await g.next(); !x.done; x = await g.next());
      if (a.form?.served) await $.classic.PostToolUse({ session_id: SID, transcript_path: RUN + '/t.jsonl', cwd: RUN, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: { stdout: '' }, tool_use_id: 'tu-' + n++, agent_id: a.id, effort: { level: a.form.served } } as any)
    }
    for (let i = 0; i < 5; i++) { await w.settle(7000); await $.tool.call({ tool: 'Bash', command: 'echo ' + LONG + LONG, agentId: 'w1' } as any) }
    for (const a of [...HOSTILE].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: a.done, isAborted: false } as any)
    await w.settle(61000)
  }
  return { ...w, begin, agents: HOSTILE }
}

// ---- PW1's own world (pw1-fit.test.ts) ----------------------------------------------------------------------------
const P1N = ['T101', 'T102']
const P2N = Array.from({ length: 14 }, (_, i) => 'T2' + String(i + 1).padStart(2, '0'))
const P3N = ['T301']
const PW1_WORKERS = 12
export const PW1_AGENTS: Agent[] = [
  { id: 's1', description: 'P1 plan the parser', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, short: 'opus 5.5', node: 'P1', effort: 'high', done: 'DONE · P1 planned the parser and both nodes are verified' },
  { id: 's2', description: 'P2 build the streaming export pipeline', subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 from _orch/phases/P2/brief.md', model: OPUS, short: 'opus 5.5', node: 'P2', effort: 'high' },
  ...Array.from({ length: PW1_WORKERS }, (_, i): Agent => {
    const id = P2N[i]!
    const model = i % 2 ? OPUS : SONNET
    const done = i + 2 < PW1_WORKERS ? (i === 2 ? "BLOCKED · the parser is the operator's choice\nBlocked by: docs/designs/export.md:\"the parser is chosen per release by the operator, never by a worker\" (interpreted)" : 'DONE · ' + id + ' green and blue, 41 tests pass') : undefined
    return { id: 'w' + (i + 1), description: id + ' streaming export record flusher number ' + (i + 1), subagentType: i === 3 ? 'baton:verifier' : 'baton:worker', prompt: 'Do node ' + id, parent: 's2', model, short: i % 2 ? 'opus 5.5' : 'sonnet 5.5', node: id, effort: i % 2 ? 'high' : 'medium', ...(done ? { done } : {}) }
  }),
]

export function pw1World(on: any) {
  const ISSUE = { number: 57, title: 'Fit every tab and view of the baton pane to the width Claude Code docks it at', url: 'https://github.com/o/r/issues/57' }
  const RULINGS = [
    { index: 0, tag: 'ruling', ts: '2026-11-01T10:00:00Z', text: 'never merge to main without the operator; a green PR waits for the operator to press merge, whatever the reviewer says' },
    { index: 1, tag: 'ruling', ts: '2026-11-02T10:00:00Z', text: 'stage files by name only' },
    { index: 2, tag: 'ruling', ts: '2026-11-03T10:00:00Z', text: 'agents always show the exact model and effort, at every width the pane is drawn' },
    { index: 3, tag: 'ruling', ts: '2026-11-04T10:00:00Z', text: 'no session links in commit messages, PR bodies or code comments' },
  ]
  const REVIEW = '<!-- baton:pr-review round=1 -->\nVERDICT: CHANGES\n- [high] mod/hooks/register.js:2005 — the goal line is cut at a docked width and the legend runs past the edge of the pane\n- [med] mod/lib/detail.mjs:66 — the task text wraps at a fixed 104 columns whatever the pane is\n'
  const PR = { number: 58, url: 'https://github.com/o/r/pull/58', title: 't', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }, { name: 'lint', conclusion: 'SUCCESS' }], comments: [{ id: 'c1', body: REVIEW, author: { login: 'me' }, createdAt: '2026-11-06T08:00:00Z', url: 'https://github.com/o/r/pull/58#c1' }], assignees: [], headRefName: 'run-branch', author: { login: 'me' }, closingIssuesReferences: [], files: [] }
  const Q7 = '# Q-7 — which streaming parser should the export use, the hand-written one or the library one the old path used?\n\n**Nodes it blocks:** T203\n\n**Options**\n1. The hand-written parser (recommended)\n2. The library parser\n\n**If unanswered, the run assumes:** option 1.\n\nBlocked by: docs/designs/export.md:"the parser is chosen per release by the operator, never by a worker" (interpreted)\n'
  const Q8 = '# Q-8 — may the export drop the legacy CSV header row that no consumer reads any more?\n\nBlocked by: CONTRACT.md:"a format change needs the operator" (explicit)\n'
  const NOTES = Array.from({ length: 8 }, (_, i) => ({ i, ts: '2026-11-06T0' + (i + 1) + ':00:00Z', tag: i % 2 ? 'prime-reply' : 'sub', text: 'note ' + i + ': the export node T20' + i + ' returned DONE after its verifier confirmed every criterion with a re-run of the whole suite and a mutation probe' }))
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  files.set('_orch/plan/graph.yaml', [...P1N.map((id) => [id, 1]), ...P2N.map((id) => [id, 2]), ...P3N.map((id) => [id, 3])].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join(''))
  for (const p of ['P1', 'P2', 'P3']) files.set('_orch/phases/' + p + '/brief.md', '# ' + p + ' brief - build the streaming export, record by record, with the buffered path behind a flag for one release\n\nNodes, in order, each red then green then blue, each with a fresh verifier, all in the run worktree on the run branch.\n')
  files.set('_orch/phases/P1/envelope.json', JSON.stringify({ verdict: 'DONE', summary: 'P1 planned the parser: two nodes, both verified by a fresh verifier with a re-run of the suite', risk: "the parser choice is still the operator's, Q-7" }))
  for (const id of [...P1N, 'T201', 'T202']) files.set('_orch/nodes/' + id + '/status.json', JSON.stringify({ verdict: 'DONE' }))
  files.set('_orch/nodes/T203/status.json', JSON.stringify({ verdict: 'BLOCKED', summary: 'the export cannot pick its parser without the operator: two are in the tree and the design says the operator picks one per release', outputs: [], blocked_by: 'Blocked by: docs/designs/export.md:"the parser is chosen per release by the operator, never by a worker" (interpreted)' }))
  files.set('_orch/inbox/Q-7.md', Q7)
  files.set('_orch/inbox/Q-7.asked.md', 'asked_at: 2026-11-06T08:30:00Z\nasked_via: terminal\ngate: G2\n')
  files.set('_orch/inbox/Q-8.md', Q8)
  dirs.set('_orch/phases', ['P1', 'P2', 'P3'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/nodes', [...P1N, ...P2N, ...P3N].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/inbox', [{ name: 'Q-7.md', kind: 'file' }, { name: 'Q-7.asked.md', kind: 'file' }, { name: 'Q-8.md', kind: 'file' }])
  const wake = () => {
    const tiles = [{ level: 2, index: 0, lo: 0, hi: 4 }, { level: 1, index: 2, lo: 4, hi: 6 }, ...NOTES.slice(6).map((n) => ({ level: 0, index: n.i, lo: n.i, hi: n.i + 1 }))]
    const lines = ['#0-3 (4 notes) P1 planned the parser and its two nodes were verified', '#4-5 (2 notes) the export nodes T201 and T202 returned DONE', ...NOTES.slice(6).map((n) => '#' + n.i + ' ' + n.ts + ' [' + n.tag + '] ' + n.text)]
    return { header: 'h', tiles, lines }
  }
  const manifest = { run_id: 'build-20261106T090000Z', mode: 'BUILD', target: 'issue:#57', issue: ISSUE, prime: true, phase: 'P2', pr: { number: 58 }, memory: { run: '_orch/memory' } }
  const usage = (a?: Agent) => ({ model: a?.model ?? OPUS, input_tokens: 41000, output_tokens: 12000, cache_read_input_tokens: 380000, cache_creation_input_tokens: 16000 })
  const w = engine(on, { files, dirs, manifest, pr: PR, issue: ISSUE, rulings: RULINGS, notes: NOTES, wake, agents: PW1_AGENTS, usage })
  async function begin($: any) {
    await w.start($)
    for (const a of PW1_AGENTS) {
      await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
      const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, effort: a.effort } as any)
      for (let x = await g.next(); !x.done; x = await g.next());
    }
    for (const a of [...PW1_AGENTS].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: a.done, isAborted: false } as any)
    await w.settle(61000)
  }
  return { ...w, begin, agents: PW1_AGENTS }
}

// ---- what a drawn row says -----------------------------------------------------------------------------------------
const STEP = /[●○◉✗]/
/** An agent's row (its whole label in its text, a › to open it), or undefined when it is not drawn. */
export const rowOf = (els: El[], a: Agent) => els.find((x) => x.leaves.length > 1 && /›/.test(x.text) && x.text.includes(roleOf(a) + ' ' + a.node + ' '))
/** The label as drawn: the first line from past the row's › up to its model (the whole first line when the model is not on it). */
export function labelOf(e: El, a: Agent): string {
  const l = e.lines[0]!
  const from = l.indexOf('›') + 1
  const to = l.indexOf(a.short, from)
  return (to > 0 ? l.slice(from, to) : l.slice(from)).trimEnd()
}
/** The state as drawn: what follows the row's last step mark, on the line that holds the steps, its ✉ left off. */
export function stateOf(e: El): string {
  const l = [...e.lines].reverse().find((x) => STEP.test(x)) ?? ''
  const i = Math.max(...[...l].map((c, k) => (STEP.test(c) || c === '─' ? k : -1)))
  return [...l].slice(i + 1).join('').replace(/✉/g, '').trim()
}
/** The list's rows that are an agent's (the prime's or any other): its letter and ›, and a model on one of its lines. */
export const agentRows = (els: El[]) => els.filter((x) => /^[a-z]: ›/.test(x.lines[0] ?? '') && x.lines.some((l) => MODEL_SHORTS.some((m) => l.includes(m))))
