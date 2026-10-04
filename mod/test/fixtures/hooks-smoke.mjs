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
const terminal = { 'tool.call': () => ({ result: 'ran' }), 'tool.check': () => ({ decision: 'allow' }), 'agent.spawn': (e) => ({ agentId: e._id, model: e.model }) }
async function fire(ev, e) {
  const hs = hooks[ev] ?? []
  const go = async (i, x) => { for (; i < hs.length; i++) if (match(hs[i].m, x)) return hs[i].f($, x, (y) => go(i + 1, y)); return terminal[ev] ? terminal[ev](x) : x }
  return go(0, e)
}
let surfaces = ['terminal'], answers = [], asked = [], sent = [], submitted = [], toasts = []
const timers = []
const $ = {
  plugin: { root: MOD },
  env: { get: async () => undefined },
  fs: { read: async (p) => fs.readFileSync(path.resolve(W, p), 'utf8'), write: async (p, t) => fs.writeFileSync(path.resolve(W, p), t), exists: async (p) => fs.existsSync(p),
        list: async (p) => fs.readdirSync(path.resolve(W, p), { withFileTypes: true }).map((d) => ({ name: d.name, kind: d.isDirectory() ? 'directory' : 'file' })) },
  session: { cwd: async () => W, root: async () => W, surfaces: async () => surfaces, version: async () => ({ base: '2.1.287' }), send: async (x) => (sent.push(x), { isDelivered: true }) },
  process: { run: async (argv, o) => { try { return { exitCode: 0, stdout: execFileSync(argv[0], argv.slice(1), { input: o?.stdin ?? '' }).toString(), stderr: '' } } catch (err) { return { exitCode: 1, stdout: '', stderr: String(err.stderr) } } } },
  model: { complete: async () => ({ isAnswered: true, text: 'NONE' }) },
  clock: { after: (ms, f) => timers.push(f), every: () => ({ cancel() {} }) },
  ui: { log: () => {}, invalidate: () => {}, toast: (t) => toasts.push(t), open: async () => ({ isPlaced: true }),
        ask: async (q, opts) => { asked.push({ q, opts }); const a = answers.shift(); if (a === undefined) throw new Error('dismissed'); return typeof a === 'function' ? a(opts) : a },
        resolve: () => new Proxy({}, { get: (_, type) => (props) => ({ type, props }) }) },
  prompt: { submit: async (x) => (submitted.push(x), {}) },
  tool: { register: async () => ({}) },
  command: { register: async () => ({}) },
  store: { get: async () => null, set: async () => {} },
}
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1 } else console.log('ok  ', msg) }
await fire('session.start', { cwd: W })

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
await byKey(t, 'tab-agents').props.onPress()
t = await render()
const at = text(t)
ok(/◆ prime/.test(at) && /✓ sub-orchestrator P3 · opus/.test(at) && /worker-cheap T7 · sonnet .* DONE — T7 DONE 3\/3/.test(at), 'Agents tab draws the tree')
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
await byKey(t, 'tab-rulings').props.onPress()
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
ok(/⚑ 1 phase waiting for your check \(P4\)/.test(text(band)), 'band flags the waiting phase')
r = await fire('command.run', { command: 'baton', args: 'status' })
ok(/approvals on · asked \d+ · approved \d+ · refused \d+ · approved for the run: rm · 1 phase\(s\) waiting/.test(r.text), 'status: ' + r.text.split('\n').find((l) => l.startsWith('approvals')))
surfaces = []
r = await fire('command.run', { command: 'baton', args: '' })
ok(/## Agents[\s\S]*⚑ P4/.test(r.text) && /## Rulings/.test(r.text), '-p prints Agents and Rulings')
