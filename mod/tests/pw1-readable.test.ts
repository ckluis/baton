// claude plugin test — PW1 attempt 2 (run build-20261019T125436Z, phase P7): what the verifier refuted in attempt 1
// (_orch/verify/PW1-verdict.json, criterion 3), pinned with its hostile fixture
// (_orch/nodes/PW1/verify-work/mod/tests/hostile.test.ts: 34 agents, 6 model ids, 8 effort forms, labels of about 150
// characters, 6 rulings, 3 or 6 open questions). The drawing model below is that file's (itself pw1-fit.test.ts's),
// unchanged, so this file stands alone.
//
// What is asserted:
//   - wider is never worse: for the same fixture at 60, 75, 90 and 120 columns, the label each agent row draws never
//     gets shorter as the pane gets wider, every row's label shows its role and node (`Z05 T204` whole, not one cell
//     and a `…`), and every row's state is drawn as it is at 120 (not `verif…` or `not s…`);
//   - a short pane with open questions: at 49x18, 60x18 and 75x18, with 3 and with 6 open questions and 6 rulings, the
//     Work view draws inside the pane height, with the key hint and at least one agent row, every key of the hint
//     whole, and the questions still told (their count and the first) — they fold before the list is given up.
import { expect, mock, test } from 'claude-code/testing'

const SLOW = { timeoutMs: 180000 }
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
type El = { node: any; text: string; lines: string[]; leaves: Leaf[] }
function elements(n: any, width: number, out: El[] = []): El[] {
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
const screen = (els: El[]) => els.flatMap((e) => e.lines)
const dump = (els: El[]) => '\n' + screen(els).map((l, i) => String(i).padStart(3) + ' |' + l + '|').join('\n')

// ---- the verifier's hostile world (hostile.test.ts), the number of open questions a parameter ------------------
const RUN = '/proj/run'
const SID = '7a1c0e52-4b1d-4c6e-9d0a-1f2e3d4c5b6a'
const OPUS = 'claude-opus-5-5'
const LONG = ' a deliberately enormous label that keeps going past any dock width the pane could ever be given by the engine, with more words after that, and still more'
const ISSUE = { number: 9999, title: 'An extremely long goal title that names everything: fit every tab, every view, every row and every hint of the baton pane to whatever width Claude Code docks it at, from forty columns to one hundred and twenty, with no line cut', url: 'https://github.com/someone-with-a-long-name/a-repository-with-a-long-name/issues/9999' }
const NW = 32 // workers: 34 agents with the two sub-orchestrators
const PN = Array.from({ length: NW }, (_, i) => 'T2' + String(i + 1).padStart(2, '0'))
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-sonnet-5-5-20261101', 'claude-opus-5-5[1m]', 'claude-fable-5']
const SHORT: Record<string, string> = { 'claude-opus-5-5': 'opus 5.5', 'claude-sonnet-5-5': 'sonnet 5.5', 'claude-haiku-4-5': 'haiku 4.5', 'claude-sonnet-5-5-20261101': 'sonnet 5.5', 'claude-opus-5-5[1m]': 'opus 5.5', 'claude-fable-5': 'fable 5' }
type Form = { cfg?: string; served?: string }
const FORMS: Form[] = [{ cfg: 'low' }, { cfg: 'xhigh' }, { cfg: 'max' }, { served: 'high' }, { cfg: 'high', served: 'low' }, {}, { cfg: 'medium' }, { served: 'xhigh' }]
type Agent = { id: string; description: string; subagentType: string; prompt: string; parent?: string; model: string; form: Form; done?: string; want: string }
const wantOf = (model: string, f: Form) => SHORT[model]! + (f.served ? ' · ' + f.served : f.cfg ? ' · ' + f.cfg + ' cfg' : '')
const AGENTS: Agent[] = [
  { id: 's1', description: 'Z00 P1' + LONG, subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P1 from _orch/phases/P1/brief.md', model: OPUS, form: { cfg: 'max' }, done: 'DONE · P1 done', want: 'opus 5.5 · max cfg' },
  { id: 's2', description: 'Z01 P2' + LONG, subagentType: 'baton:sub-orchestrator', prompt: 'Run phase P2 from _orch/phases/P2/brief.md', model: OPUS, form: { cfg: 'xhigh' }, want: 'opus 5.5 · xhigh cfg' },
  ...Array.from({ length: NW }, (_, i): Agent => {
    const model = MODELS[i % MODELS.length]!
    const form = FORMS[i % FORMS.length]!
    const done = i < NW - 6 ? (i === 2 ? 'BLOCKED · operator\nBlocked by: docs/x.md:"the operator chooses, always, in every release, no exceptions" (interpreted)' : 'DONE · ' + PN[i] + ' green' + LONG) : undefined
    return { id: 'w' + (i + 1), description: 'Z' + String(i + 2).padStart(2, '0') + ' ' + PN[i] + LONG, subagentType: i % 5 === 3 ? 'baton:verifier' : 'baton:worker', prompt: 'Do node ' + PN[i] + LONG, parent: 's2', model, form, ...(done ? { done } : {}), want: wantOf(model, form) }
  }),
]
const RULINGS = Array.from({ length: 6 }, (_, i) => ({ index: i, tag: 'ruling', ts: '2026-11-0' + (i + 1) + 'T10:00:00Z', text: 'ruling ' + i + ':' + LONG + LONG }))
const NOTES = Array.from({ length: 8 }, (_, i) => ({ i, ts: '2026-11-06T0' + (i + 1) + ':00:00Z', tag: 'sub', text: 'note ' + i + ':' + LONG + LONG + ' supercalifragilisticexpialidociousandthensomemoreunbrokencharacterswithoutanyspaceatall' }))

function world(on: any, nq: number) {
  const QS = Array.from({ length: nq }, (_, i) => 'Q-' + (20 + i))
  const t0 = Date.parse('2026-11-06T09:00:00Z')
  const clock = mock.clock(on, { now: t0 })
  const files = new Map<string, string>()
  const dirs = new Map<string, { name: string; kind: string }[]>()
  const store = new Map<string, unknown>()
  const m: any = { run_id: 'build-20261106T090000Z', mode: 'BUILD', target: 'issue:#9999', issue: ISSUE, prime: true, phase: 'P2', pr: { number: 10000 }, started_at: new Date(t0 - 3600000).toISOString(), memory: { run: '_orch/memory' }, prime_session: { id: SID, heartbeat_at: new Date(t0).toISOString() } }
  files.set('_orch/manifest.json', JSON.stringify(m))
  files.set('_orch/plan/graph.yaml', [['T101', 1], ...PN.map((id) => [id, 2]), ['T301', 3]].map(([id, n]) => '- id: ' + id + '\n  phase: ' + n + '\n').join(''))
  for (const p of ['P1', 'P2', 'P3']) files.set('_orch/phases/' + p + '/brief.md', '# ' + p + LONG + '\n\n' + LONG + '\n')
  files.set('_orch/phases/P1/envelope.json', JSON.stringify({ verdict: 'DONE', summary: 'P1' + LONG, risk: 'risk' + LONG }))
  files.set('_orch/nodes/T101/status.json', JSON.stringify({ verdict: 'DONE' }))
  files.set('_orch/nodes/T203/status.json', JSON.stringify({ verdict: 'BLOCKED', summary: 'blocked' + LONG, outputs: [], blocked_by: 'Blocked by: docs/x.md:"the operator chooses, always, in every release, no exceptions" (interpreted)' }))
  QS.forEach((q, i) => files.set('_orch/inbox/' + q + '.md', '# ' + q + ' — question number ' + i + LONG + '?\n\nBlocked by: CONTRACT.md:"' + LONG.slice(0, 80) + '" (explicit)\n'))
  files.set('_orch/inbox/Q-20.asked.md', 'asked_at: 2026-11-06T08:30:00Z\nasked_via: terminal\ngate: G2\n')
  dirs.set('_orch/phases', ['P1', 'P2', 'P3'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/nodes', ['T101', ...PN, 'T301'].map((name) => ({ name, kind: 'dir' })))
  dirs.set('_orch/inbox', [...QS.map((q) => ({ name: q + '.md', kind: 'file' })), { name: 'Q-20.asked.md', kind: 'file' }])
  const rel = (p: string) => { const s = String(p); if (s.startsWith('_orch/')) return s; const i = s.lastIndexOf('/_orch/'); return i >= 0 ? s.slice(i + 1) : s }
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
  const PR = { number: 10000, url: 'https://github.com/o/r/pull/10000', title: 't', state: 'OPEN', isDraft: false, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', statusCheckRollup: Array.from({ length: 9 }, (_, i) => ({ name: 'check-with-a-long-name-' + i, conclusion: i % 2 ? 'FAILURE' : 'SUCCESS' })), comments: [{ id: 'c1', body: '<!-- baton:pr-review round=3 -->\nVERDICT: CHANGES\n- [high] mod/hooks/register.js:2005 —' + LONG + '\n- [med] x.js:1 —' + LONG + '\n- [low] y.js:2 —' + LONG + '\n', author: { login: 'me' }, createdAt: '2026-11-06T08:00:00Z', url: 'https://github.com/o/r/pull/10000#c1' }], assignees: [], headRefName: 'run-branch', author: { login: 'me' }, closingIssuesReferences: [], files: [] }
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
      const lines = ['#0-3 (4 notes)' + LONG, '#4-5 (2 notes)' + LONG, ...NOTES.slice(6).map((n) => '#' + n.i + ' ' + n.ts + ' [' + n.tag + '] ' + n.text)]
      out = { header: 'h', tiles, lines }
    } else if (argv.includes('marks') || argv.includes('superseded')) out = []
    return { value: { exitCode: 0, stdout: JSON.stringify(out), stderr: '' } }
  })
  const byPrompt = new Map(AGENTS.map((a) => [a.prompt, a]))
  on('agent.spawn', (_$: any, e: any) => ({ agentId: byPrompt.get(e.prompt)?.id ?? 'x', model: byPrompt.get(e.prompt)?.model ?? OPUS }))
  on('turn.step', async function* (_$: any, e: any) {
    const a = AGENTS.find((x) => x.id === e.agentId)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: a?.model ?? OPUS, input_tokens: 941000, output_tokens: 312000, cache_read_input_tokens: 98380000, cache_creation_input_tokens: 916000 } }
  })
  mock.env(on, {})
  mock.session(on)
  async function settle(ms = 10) { await clock.advance(ms); await clock.settle() }
  async function begin($: any) {
    await $.session.start({ cwd: RUN, surface: 'terminal', isInteractive: true } as any)
    await $.classic.SessionStart({ source: 'startup', cwd: RUN } as any)
    await settle(200000)
    let n = 0
    for (const a of AGENTS) {
      await $.agent.spawn({ prompt: a.prompt, description: a.description, subagentType: a.subagentType, model: a.model, ...(a.parent ? { parentAgentId: a.parent } : {}) } as any)
      const g = $.turn.step({ agentId: a.id, turnId: 't-' + a.id, index: 0, model: a.model, messageCount: 1, ...(a.form.cfg ? { effort: a.form.cfg } : {}) } as any)
      for (let x = await g.next(); !x.done; x = await g.next());
      if (a.form.served) await $.classic.PostToolUse({ session_id: SID, transcript_path: RUN + '/t.jsonl', cwd: RUN, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: { stdout: '' }, tool_use_id: 'tu-' + n++, agent_id: a.id, effort: { level: a.form.served } } as any)
    }
    for (let i = 0; i < 5; i++) { await settle(7000); await $.tool.call({ tool: 'Bash', command: 'echo ' + LONG + LONG, agentId: 'w1' } as any) }
    for (const a of [...AGENTS].reverse()) if (a.done) await $.turn.complete({ agentId: a.id, answer: a.done, isAborted: false } as any)
    await settle(61000)
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
  return { settle, begin, pane, props }
}

// ---- what a drawn agent row says ---------------------------------------------------------------------------------
const STEP = /[●○◉✗]/
/** The agent's row (its whole label in its text, a › to open it), or undefined when it is not drawn. */
const rowOf = (els: El[], a: Agent) => els.find((x) => x.leaves.length > 1 && x.text.includes(a.description.slice(0, 7)) && /›/.test(x.text))
/** The label as drawn: the first line from past the row's › up to its model (the whole first line in a four-line row). */
function labelOf(e: El, a: Agent): string {
  const l = e.lines[0]!
  const from = l.indexOf('›') + 1
  const to = l.indexOf(SHORT[a.model]!, from)
  return (to > 0 ? l.slice(from, to) : l.slice(from)).trimEnd()
}
/** The state as drawn: what follows the row's last step mark, on the line that holds the steps, its ✉ left off. */
function stateOf(e: El): string {
  const l = [...e.lines].reverse().find((x) => STEP.test(x)) ?? ''
  const i = Math.max(...[...l].map((c, k) => (STEP.test(c) || c === '─' ? k : -1)))
  return [...l].slice(i + 1).join('').replace(/✉/g, '').trim()
}

test('PW1 attempt 2: a wider pane never draws less of an agent label, and every row reads by its label and state, at 60, 75, 90 and 120', SLOW, async ($, on) => {
  const w = world(on, 6)
  await w.begin($)
  const ui = await w.pane($, 120, 200)
  const at: Record<number, El[]> = {}
  for (const width of [60, 75, 90, 120]) {
    await ui.redraw(w.props(width, 200) as any)
    await w.settle(100)
    at[width] = elements(await ui.drawn(), width)
  }
  await ui.unmount()
  const bad: string[] = []
  let rows = 0
  for (const a of AGENTS) {
    const es = [60, 75, 90, 120].map((width) => rowOf(at[width]!, a))
    if (es.some((e) => !e)) continue // a row folded away at some width is not compared
    rows++
    const labels = es.map((e) => labelOf(e!, a))
    const states = es.map((e) => stateOf(e!))
    for (let i = 1; i < labels.length; i++) if (cellW(labels[i]!) < cellW(labels[i - 1]!)) bad.push(a.id + ' label shorter at ' + [60, 75, 90, 120][i] + ' than at ' + [60, 75, 90, 120][i - 1] + ': |' + labels[i] + '| < |' + labels[i - 1] + '|')
    labels.forEach((l, i) => { if (!l.includes(a.description.slice(0, 8))) bad.push(a.id + ' label at ' + [60, 75, 90, 120][i] + ' does not show ' + a.description.slice(0, 8) + ': |' + l + '|') })
    states.forEach((s, i) => { if (s !== states[3]) bad.push(a.id + ' state at ' + [60, 75, 90, 120][i] + ' is |' + s + '|, at 120 |' + states[3] + '|') })
  }
  if (bad.length) (globalThis as any).console.log([60, 75, 90, 120].map((width) => '@@RENDER work-' + width + dump(at[width]!)).join('\n'))
  expect(rows).toBeGreaterThan(20)
  expect(bad).toEqual([])
})

const HINT_KEYS = ['↑/↓ then', 'Enter on', '✉ messages', 'p shows', 'b goes back']
for (const nq of [3, 6]) {
  for (const width of [49, 60, 75]) {
    test('PW1 attempt 2: a short pane (' + width + 'x18) with ' + nq + ' open questions and 6 rulings keeps the key hint and the agent list inside its height; the questions fold first', SLOW, async ($, on) => {
      const rows = 18
      const w = world(on, nq)
      await w.begin($)
      const ui = await w.pane($, width, rows)
      await ui.redraw(w.props(width, rows) as any)
      await w.settle(100)
      const els = elements(await ui.drawn(), width)
      await ui.unmount()
      const all = screen(els)
      const bad: string[] = []
      if (all.length > rows) bad.push('drew ' + all.length + ' lines in ' + rows)
      all.forEach((l, i) => { if (cellW(l) > width) bad.push('line ' + i + ' is ' + cellW(l) + ' cells') })
      const miss = HINT_KEYS.filter((k) => !all.some((l) => l.includes(k)))
      if (miss.length) bad.push('hint keys missing ' + miss.join(','))
      // a row of the agent list: its letter and ›, its steps (the prime's, a phase's or an agent's)
      const listRows = els.filter((x) => /^[a-z]: ›/.test(x.lines[0] ?? '') && x.lines.some((l) => STEP.test(l))).length
      if (listRows < 1) bad.push('no row of the agent list drawn')
      if (!all.some((l) => l.includes('Q-20'))) bad.push('the questions are not told')
      if (!all.some((l) => l.includes('Q-2' + (nq - 1))) && !all.some((l) => l.includes(nq + ' open questions'))) bad.push('neither every question nor their count is drawn')
      if (bad.length) (globalThis as any).console.log('@@RENDER work-' + width + 'x' + rows + '-q' + nq + dump(els))
      expect(bad).toEqual([])
    })
  }
}
