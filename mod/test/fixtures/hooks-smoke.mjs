// The hooks module end to end, without Claude Code: the real register.js and
// the real memo CLI under a fake mods runtime (a dispatcher with matchers and
// next-chaining, $.ui.ask answered from a script, elements as plain objects).
// It stands in for `claude plugin test` where that refuses to run, and checks
// the hierarchy, both approval gates, rulings with enforcement and every pane
// tab. Run by test/hooks-smoke.test.mjs; exits non-zero on any FAIL.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { register } = await import(MOD + '/hooks/register.js')
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-smoke-'))
fs.mkdirSync(W + '/_orch')
fs.writeFileSync(W + '/_orch/manifest.json', JSON.stringify({ prime: true, run_id: 'build-x', mode: 'BUILD', target: '.', phase: 'P3' }))
const hooks = {}
register((ev, a, b) => { const [m, f] = typeof a === 'function' ? [null, a] : [a, b]; (hooks[ev] ??= []).push({ m, f }); return { catch() {} } })
const match = (m, e) => !m || Object.entries(m).every(([k, v]) => v instanceof RegExp ? v.test(e[k]) : e[k] === v)
const spawnPrompts = []
const BIG = (n, mark) => Array.from({ length: n }, (_, i) => (i === Math.floor(n / 2) ? mark : 'line ' + i)).join('\n')
const terminal = { 'tool.call': (e) => (e.tool === 'Read' && /big\.ts$/.test(e.file_path) ? { result: BIG(700, 'x') } : e.tool === 'Bash' && e.command === 'make test' ? { result: BIG(1200, 'FAIL cart.test.ts > empty cart') } : { result: 'ran' }), 'tool.check': () => ({ decision: 'allow' }), 'agent.spawn': (e) => (spawnPrompts.push(e.prompt || ''), { agentId: e._id, model: e.model }) }
async function fire(ev, e) {
  const hs = hooks[ev] ?? []
  const go = async (i, x) => { for (; i < hs.length; i++) if (match(hs[i].m, x)) return hs[i].f($, x, (y) => go(i + 1, y)); return terminal[ev] ? terminal[ev](x) : x }
  return go(0, e)
}
let surfaces = ['terminal'], answers = [], asked = [], sent = [], submitted = [], toasts = [], opened = []
const timers = []
const $ = {
  plugin: { root: MOD },
  env: { get: async () => undefined },
  fs: { read: async (p) => fs.readFileSync(path.resolve(W, p), 'utf8'), write: async (p, t) => { fs.mkdirSync(path.dirname(path.resolve(W, p)), { recursive: true }); fs.writeFileSync(path.resolve(W, p), t) }, exists: async (p) => fs.existsSync(p),
        list: async (p) => fs.readdirSync(path.resolve(W, p), { withFileTypes: true }).map((d) => ({ name: d.name, kind: d.isDirectory() ? 'directory' : 'file' })) },
  session: { cwd: async () => W, root: async () => W, surfaces: async () => surfaces, version: async () => ({ base: '2.1.287' }), send: async (x) => (sent.push(x), { isDelivered: true }) },
  process: { run: async (argv, o) => { try { return { exitCode: 0, stdout: execFileSync(argv[0], argv.slice(1), { input: o?.stdin ?? '', cwd: W, stdio: ['pipe', 'pipe', 'pipe'] }).toString(), stderr: '' } } catch (err) { return { exitCode: 1, stdout: '', stderr: String(err.stderr) } } } },
  model: { complete: async () => ({ isAnswered: true, text: 'NONE' }) },
  clock: { after: (ms, f) => timers.push(f), every: () => ({ cancel() {} }) },
  ui: { log: () => {}, invalidate: () => {}, toast: (t) => toasts.push(t), open: async (x) => (opened.push(x), { isPlaced: true }),
        ask: async (q, opts) => { asked.push({ q, opts }); const a = answers.shift(); if (a === undefined) throw new Error('dismissed'); return typeof a === 'function' ? a(opts) : a },
        resolve: () => new Proxy({}, { get: (_, type) => (props) => ({ type, props }) }) },
  prompt: { submit: async (x) => (submitted.push(x), {}) },
  tool: { register: async () => ({}) },
  command: { register: async () => ({}) },
  store: { get: async () => null, set: async () => {} },
}
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1 } else console.log('ok  ', msg) }
await fire('session.start', { cwd: W })
for (const f of timers.splice(0)) await f()
ok(opened.some((x) => x.id === 'baton' && x.focus === false), 'the pane opened by itself at session start, unfocused (no /baton needed)')

// hierarchy
await fire('agent.spawn', { _id: 's1', subagentType: 'baton:sub-orchestrator', description: 'P3', model: 'claude-opus-5-5' })
await fire('agent.spawn', { _id: 'w1', parentAgentId: 's1', subagentType: 'baton:worker-cheap', description: 'T7', model: 'claude-sonnet-5-5' })
await fire('tool.call', { agentId: 'w1', tool: 'Read', file_path: 'x' })

// command gate
answers = ['Approve']
let r = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'git push origin v7' })
ok(r.result === 'ran', 'approved push runs')
ok(/prime › P3 › T7 wants to git push/.test(asked[0].q), 'question names the chain: ' + asked[0].q.split('\n')[0])
answers = ['not from a worker']
r = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'gh pr create --base main' })
ok(/refused "open, merge or close a PR": not from a worker/.test(r.deny), 'refusal carries the reason')
answers = [(opts) => opts[1]]
r = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'rm -rf build' })
r = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'rm -rf dist' })
ok(r.result === 'ran' && asked.length === 3, 'approve-for-run skips the second ask')
r = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'npm test' })
ok(r.result === 'ran' && asked.length === 3, 'ordinary command not gated')
surfaces = []
r = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'git push' })
ok(/nobody can be asked/.test(r.deny), 'headless: refused, fail closed')
surfaces = ['terminal']

// phase gate
await fire('turn.complete', { agentId: 'w1', answer: 'T7 DONE 3/3', isAborted: false })
await fire('turn.complete', { agentId: 's1', answer: '\nP3 DONE+CONFIRMED 4/4 nodes; _orch/phases/P3/envelope.json', isAborted: false })
answers = ['the tests are vacuous']
r = await fire('tool.call', { tool: 'Agent', prompt: 'P4', description: 'P4' })
ok(/sent back P3 — "the tests are vacuous"/.test(r.deny), 'send back denies the next dispatch with the reason')
r = await fire('tool.call', { tool: 'Agent', prompt: 'P3 again', description: 'P3' })
ok(r.result === 'ran', 'queue empty: dispatch goes')

// rulings + enforcement
r = await fire('command.run', { command: 'baton', args: 'rule never push to main' })
ok(/ruling noted #0/.test(r.text), 'rule recorded')
r = await fire('command.run', { command: 'baton', args: 'enforce 0 git push.*\\bmain\\b' })
ok(/is enforced/.test(r.text), 'enforced: ' + r.text)
r = await fire('tool.check', { tool: 'Bash', input: { command: 'git push origin main' } })
ok(r.decision === 'deny' && /ruling #0/.test(r.reason), 'tool.check refuses: ' + r.reason)
r = await fire('tool.check', { tool: 'Bash', input: { command: 'git push origin v7' } })
ok(r.decision === 'allow', 'other branch allowed')
r = await fire('command.run', { command: 'baton', args: 'rulings' })
ok(/#0 \S+ never push to main  \[enforced/.test(r.text), 'listing shows enforcement')

// pane
await fire('command.run', { command: 'baton', args: '' })
const render = async () => fire('ui.render', { component: 'Pane', requestId: 'baton', surface: 'terminal', props: { bodyColumns: 120, scroll: { bodyRows: 30 } } })
const flat = (n, out = []) => { if (!n || typeof n !== 'object') return out; if (Array.isArray(n)) { n.forEach((c) => flat(c, out)); return out } out.push(n); flat(n.props?.children, out); return out }
const text = (tree) => flat(tree).filter((n) => n.type === 'Text').map((n) => n.props.children.join('')).join('\n')
const byKey = (tree, k) => flat(tree).find((n) => n.props?.key === k)
let t = await render()
await byKey(t, 'tab-work').props.onPress()
t = await render()
const at = text(t)
ok(/agent\s+context\s+budget\s+model/.test(at) && /◆ prime/.test(at) && /✓ sub-orch P3\s+—\s+50%\s+opus/.test(at) && /✓ worker-cheap T7\s+—\s+50%\s+sonnet/.test(at), 'Agents tab draws the tree as a table')
// a live agent to message
await fire('agent.spawn', { _id: 's2', subagentType: 'baton:sub-orchestrator', description: 'P4' })
t = await render()
const msgBtn = flat(t).find((n) => n.type === 'Button' && /^msg-/.test(n.props.key))
msgBtn.props.onPress()
t = await render()
await byKey(t, 'agent-msg').props.onSubmit('use the new fixture')
ok(sent[0]?.to?.agentId === 's2' && sent[0].text === 'use the new fixture', 'message reaches the selected agent')
// memory browser
// memory browser: 200 more notes, merged with the deterministic fallback
for (let i = 0; i < 200; i++) execFileSync('node', [MOD + '/bin/memo.mjs', '--dir', W + '/_orch/memory', 'note', '--tag', 'sub', '-'], { input: 'P' + (i % 9) + ' node T' + i + ' DONE' })
for (let i = 0; i < 12; i++) execFileSync('node', [MOD + '/bin/memo.mjs', '--dir', W + '/_orch/memory', 'merge'])
await byKey(t, 'tab-memory').props.onPress()
t = await render()
const mt = text(t)
ok(/tree: \d+ notes/.test(mt) && /operator approved/.test(mt), 'Memory tab shows the wake view with approval notes')
const open = flat(t).find((n) => n.type === 'Button' && /^mem-open-/.test(n.props.key))
ok(!!open, 'a summary block can be opened')
if (open) { await open.props.onPress(); t = await render(); ok(/notes #\d+-\d+/.test(text(t)), 'zoomed: ' + text(t).split('\n')[1]); await byKey(t, 'mem-back').props.onPress() }
t = await render()
await byKey(t, 'mem-search').props.onSubmit('refused')
t = await render()
ok(/search \/refused\/i: [1-9]/.test(text(t)), 'search: ' + text(t).split('\n')[1])
// rulings tab
await byKey(t, 'tab-memory').props.onPress()
t = await render()
await byKey(t, 'ruling-add').props.onSubmit('PRs target main directly')
t = await render()
ok(/PRs target main directly/.test(text(t)), 'rulings tab adds')
await byKey(t, 'retract-0').props.onPress()
t = await render()
ok(!/never push to main/.test(text(t)), 'retract removes the ruling')
r = await fire('tool.check', { tool: 'Bash', input: { command: 'git push origin main' } })
ok(r.decision === 'allow', 'retracted ruling no longer enforced')
// band
await fire('turn.complete', { agentId: 's2', answer: 'P4 DONE 2/2', isAborted: false })
const band = await fire('ui.render', { component: 'AbovePrompt', surface: 'terminal', props: { bodyColumns: 120 } })
ok(/⚑ waiting for you: 1 phase to check \(P4\)/.test(text(band)), 'band flags the waiting phase')
const keyBtn = flat(band).find((n) => n.type === 'Button' && n.props.hotkey === '1')
ok(!!keyBtn && /approve P4/.test(keyBtn.props.label), 'the band offers 1 to approve P4 from an empty prompt')
r = await fire('command.run', { command: 'baton', args: 'status' })
ok(/approvals on · asked \d+ · approved \d+ · refused \d+ · approved for the run: rm · 1 phase\(s\) waiting/.test(r.text), 'status: ' + r.text.split('\n').find((l) => l.startsWith('approvals')))
surfaces = []
r = await fire('command.run', { command: 'baton', args: '' })
ok(/## Work\n[\s\S]*⚑ P4/.test(r.text) && /## Memory\nrulings:/.test(r.text) && !/## (Plan|Rulings|Ledger|Workspace)/.test(r.text), '-p prints two tabs: Work, and Memory with the rulings first')

// ---- the kit: code tools, the Read hint, quiet output, notifications
fs.mkdirSync(W + '/src', { recursive: true })
fs.writeFileSync(W + '/src/cart.ts', 'export function addItem(c, i) {\n  return [...c, i]\n}\n')
let k = await fire('tool.call', { agentId: 'w1', tool: 'mcp__baton__code_search', query: 'additem' })
ok(/src\/cart\.ts:1-3 {2}function addItem/.test(k.result || ''), 'code_search answers from the index, built on demand')
k = await fire('tool.call', { agentId: 'w1', tool: 'mcp__baton__code_fetch', target: 'addItem' })
ok(/return \[\.\.\.c, i\]/.test(k.result || ''), 'code_fetch returns just the symbol')
ok(fs.readFileSync(W + '/.baton/code/.gitignore', 'utf8') === '*\n', 'the index hides itself from git')
k = await fire('tool.call', { tool: 'mcp__baton__code_fetch', target: 'addItem' })
ok(/is not a prime tool/.test(k.deny || ''), 'the prime may not read code, even through the index')
k = await fire('tool.call', { agentId: 'w1', tool: 'Read', file_path: W + '/src/big.ts' })
ok((k.context || []).some((c) => /all 700 lines/.test(c) && /code_fetch/.test(c)), 'a large source Read runs, with a pointer to code_fetch')
k = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'make test' })
const kept = (k.result || '').split('\n').length
const logs = fs.readdirSync(W + '/_orch/out')
ok(kept < 120 && /601\| FAIL cart\.test\.ts > empty cart/.test(k.result) && logs.length === 1 && fs.readFileSync(W + '/_orch/out/' + logs[0], 'utf8').split('\n').length === 1200, 'quiet output: 1200 lines → ' + kept + ', the failure kept, the whole saved')
const st = (await fire('command.run', { command: 'baton', args: 'status' })).text
ok(/code tools 2 calls · large reads 1 \(700 lines\) · quieted 1 outputs \(1200 → \d+ lines\)/.test(st), 'status counts the kit: ' + st.split('\n').find((l) => /^code tools/.test(l)))
const stop = await fire('classic.Stop', {})
ok(typeof stop.terminalSequence === 'string' && stop.terminalSequence.length > 0, 'a waiting phase reaches the desktop as a terminal notification')
const stop2 = await fire('classic.Stop', {})
ok(!stop2 || !stop2.terminalSequence, 'and only once')

// ---- every session: the band carries plan usage
await fire('session.measure', { context: { tokens: 240000, window: 1000000, percent: 24 }, rateLimits: [{ kind: 'five_hour', percentUsed: 42.5, resetsAt: '2026-10-05T14:20:00Z' }, { kind: 'seven_day', percentUsed: 18 }, { kind: 'seven_day_fable', percentUsed: 3 }], changed: ['context', 'rateLimits'] })
const bandNow = await fire('ui.render', { component: 'AbovePrompt', surface: 'terminal', props: { bodyColumns: 160 } })
const bandText = flat(bandNow).filter((n) => n.type === 'Text').map((n) => n.props.children.join('')).join('')
ok(/5h ▕[█░]{5}▏4[23]% · wk ▕[█░]{5}▏18% · Fable ▕[█░]{5}▏3% · ctx ▕[█░┊]{5}▏24%\/35%/.test(bandText), 'the band is one line: 5h, week, Fable, context against its threshold: ' + bandText.split('\n')[0])

// ---- v7.4: doctor, pause, a new session resuming the run, lessons that stick
let d = await fire('command.run', { command: 'baton', args: 'doctor' })
ok(/^baton doctor:/.test(d.text) && /✓ node — v\d+/.test(d.text) && /(✓|✗) gh/.test(d.text), 'doctor checks what the mod leans on')
d = await fire('command.run', { command: 'baton', args: 'pause' })
let sp = await fire('agent.spawn', { _id: 'px', subagentType: 'baton:worker', description: 'T8', prompt: 'x' })
let gp = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'git push' })
ok(/paused/.test(sp.deny || '') && /paused/.test(gp.deny || ''), 'pause holds spawns and gated commands')
d = await fire('command.run', { command: 'baton', args: 'resume' })
sp = await fire('agent.spawn', { _id: 'py', subagentType: 'baton:worker', description: 'T8', prompt: 'x' })
ok(/resumed \(2 held/.test(d.text) && sp.agentId === 'py', 'resume lets it go on, and says what was held')
const ss = await fire('classic.SessionStart', { source: 'startup' })
ok((ss.additionalContext || []).some((c) => /prime of run build-x/.test(c) && /memory_wake before anything else/.test(c)), 'a new session in an active run is told to wake from the memory first')
fs.mkdirSync(W + '/_orch/nodes/T5', { recursive: true })
fs.writeFileSync(W + '/_orch/nodes/T5/handoff.md', 'Add removeItem to src/cart.ts')
fs.mkdirSync(W + '/_orch/verify', { recursive: true })
fs.writeFileSync(W + '/_orch/verify/T5-verdict.json', JSON.stringify({ verdict: 'REFUTED', criteria: [{ criterion: 'removing an absent item leaves the cart unchanged', verdict: 'REFUTED', probe: 'removeItem([a], b) threw in src/cart.ts', evidence: [] }] }))
await fire('command.run', { command: 'baton', args: 'status' })
await fire('agent.spawn', { _id: 'lz', subagentType: 'baton:worker', description: 'T9 cart totals', prompt: 'Add totals to src/cart.ts' })
ok(/lessons from earlier refutations[\s\S]*T5: "removing an absent item leaves the cart unchanged" was refuted — removeItem\(\[a\], b\) threw/.test(spawnPrompts.at(-1)), 'a worker on the same code gets the lesson in its prompt')
await fire('agent.spawn', { _id: 'lq', subagentType: 'baton:worker', description: 'T10 docs', prompt: 'Write docs/guide.md' })
ok(!/lessons from earlier/.test(spawnPrompts.at(-1)), 'and a worker elsewhere does not')

// ---- checkpoints before work is discarded, and a restore
execFileSync('git', ['init', '-q'], { cwd: W })
fs.writeFileSync(W + '/keep.txt', 'precious')
const cp = await fire('tool.call', { agentId: 'w1', tool: 'Bash', command: 'rm -rf build' })
const cpId = (/baton checkpoint (\d{8}T\d{9}Z) taken first/.exec(cp.result || '') || [])[1]
ok(!!cpId, 'a checkpoint is taken before rm -r runs: ' + cpId)
fs.writeFileSync(W + '/keep.txt', 'clobbered')
const lst = await fire('command.run', { command: 'baton', args: 'checkpoints' })
ok(new RegExp(cpId + '\\s+baton checkpoint: prime › w1|' + cpId).test(lst.text), 'checkpoints are listed')
const rs = await fire('command.run', { command: 'baton', args: 'restore ' + cpId })
ok(/files restored to checkpoint/.test(rs.text) && fs.readFileSync(W + '/keep.txt', 'utf8') === 'precious', 'restore puts the files back: ' + rs.text.slice(0, 160))
ok(execFileSync('git', ['status', '--short'], { cwd: W, encoding: 'utf8' }).split('\n').every((l) => !/refs\/baton/.test(l)), 'the branch and index never moved')

