// The GitHub goal flow and the tracker end to end, without Claude Code or GitHub: the real
// register.js and memo CLI under a fake mods runtime, and a scripted `gh`. Checks: /baton start
// #12, the tracker's computed states and measured rows, PR polling, the reviewer's verdict,
// merge-ready, remote gate commands, a headless command gate asking on the PR, links in the
// Track tab, the band, /baton watch and /baton next. Run by test/github-smoke.test.mjs.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const MOD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { register } = await import(MOD + '/hooks/register.js')
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'baton-gh-'))
process.chdir(W)
const hooks = {}
register((ev, a, b) => { const [m, f] = typeof a === 'function' ? [null, a] : [a, b]; (hooks[ev] ??= []).push({ m, f }); return { catch() {} } })
const match = (m, e) => !m || Object.entries(m).every(([k, v]) => v instanceof RegExp ? v.test(e[k]) : e[k] === v)
const terminal = { 'tool.call': () => ({ result: 'ran' }), 'tool.check': () => ({ decision: 'allow' }), 'agent.spawn': (e) => ({ agentId: e._id, model: e.model }) }
async function fire(ev, e) {
  const hs = hooks[ev] ?? []
  const go = async (i, x) => { for (; i < hs.length; i++) if (match(hs[i].m, x)) return hs[i].f($, x, (y) => go(i + 1, y)); return terminal[ev] ? terminal[ev](x) : x }
  return go(0, e)
}
// ---- a scripted gh
const G = {
  issues: { 12: { number: 12, title: 'CSV export', body: '- export a CSV\n- an empty export has a header row', url: 'https://github.com/o/r/issues/12' }, 15: { number: 15, title: 'Retry backoff', body: 'b', url: 'https://github.com/o/r/issues/15' } },
  pr: { number: 47, url: 'https://github.com/o/r/pull/47', title: 'CSV export', state: 'OPEN', isDraft: true, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'baton/verify', conclusion: 'SUCCESS' }], comments: [], assignees: [], headRefName: 'b', author: { login: 'chris' }, closingIssuesReferences: [{ number: 12 }], files: [{ path: 'src/csv.ts' }] },
  labels: { 12: [] },
  patched: [],
  posted: [],
  calls: [],
}
function fakeGh(args, stdin) {
  G.calls.push(args.join(' '))
  if (args[0] === 'issue' && args[1] === 'view' && !args.includes('labels')) return JSON.stringify(G.issues[args[2]])
  if (args[0] === 'issue' && args[1] === 'list') return JSON.stringify(Object.values(G.issues).map(({ number, title, url }) => ({ number, title, url })))
  if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(G.pr)
  if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify([])
  if (args[0] === 'pr' && args[1] === 'comment') { G.posted.push(stdin); if (/baton:spend/.test(stdin)) G.pr.comments.push({ id: 'spend', author: { login: 'chris' }, url: 'https://github.com/o/r/pull/47#issuecomment-999', body: stdin }); return 'https://github.com/o/r/pull/47#c' + G.posted.length }
  if (args[0] === 'label' && args[1] === 'create') return ''
  if (args[0] === 'issue' && args[1] === 'edit') { const n = args[2]; for (let i = 3; i < args.length; i += 2) { if (args[i] === '--add-label') G.labels[n] = [...new Set([...(G.labels[n] || []), args[i + 1]])]; if (args[i] === '--remove-label') G.labels[n] = (G.labels[n] || []).filter((x) => x !== args[i + 1]) } return '' }
  if (args[0] === 'issue' && args[1] === 'view' && args.includes('labels')) return JSON.stringify({ labels: (G.labels[args[2]] || []).map((name) => ({ name })) })
  if (args[0] === 'api' && args[1] === '-X' && args[2] === 'PATCH') { G.patched.push(args[3]); return '{}' }
  throw new Error('fake gh: unexpected ' + args.join(' '))
}
let surfaces = [], answers = [], toasts = [], models = [], sentMsgs = []
const timers = [], every = []
const $ = {
  plugin: { root: MOD },
  env: { get: async () => undefined },
  fs: { read: async (p) => fs.readFileSync(path.resolve(W, p), 'utf8'), write: async (p, t) => { fs.mkdirSync(path.dirname(path.resolve(W, p)), { recursive: true }); fs.writeFileSync(path.resolve(W, p), t) }, exists: async (p) => fs.existsSync(path.resolve(W, p)),
        list: async (p) => fs.readdirSync(path.resolve(W, p), { withFileTypes: true }).map((d) => ({ name: d.name, kind: d.isDirectory() ? 'directory' : 'file' })) },
  session: { cwd: async () => W, root: async () => W, surfaces: async () => surfaces, version: async () => ({ base: '2.1.287' }), send: async (x) => (sentMsgs.push(x), { isDelivered: true }) },
  process: { run: async (argv, o) => {
    if (argv[0] === 'gh') { try { return { exitCode: 0, stdout: fakeGh(argv.slice(1), o?.stdin), stderr: '' } } catch (err) { return { exitCode: 1, stdout: '', stderr: err.message } } }
    try { return { exitCode: 0, stdout: execFileSync(argv[0], argv.slice(1), { input: o?.stdin ?? '', cwd: W, stdio: ['pipe', 'pipe', 'pipe'] }).toString(), stderr: '' } } catch (err) { return { exitCode: 1, stdout: '', stderr: String(err.stderr) } } } },
  model: { complete: async (r) => (models.push(r), r.model.includes('haiku') ? { isAnswered: true, text: 'chris asks to also handle unicode in names' } : { isAnswered: true, text: 'NONE' }) },
  clock: { after: (ms, f) => timers.push(f), every: (ms, f) => (every.push(f), { cancel() {} }) },
  ui: { log: () => {}, invalidate: () => {}, toast: (t) => toasts.push(t), open: async () => ({ isPlaced: true }),
        ask: async () => { const a = answers.shift(); if (a === undefined) throw new Error('dismissed'); return a },
        resolve: () => new Proxy({}, { get: (_, type) => (props) => ({ type, props }) }) },
  prompt: { submit: async () => ({}) },
  tool: { register: async () => ({}) },
  command: { register: async () => ({}) },
  store: (() => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) } })(),
}
const ok = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1 } else console.log('ok  ', msg) }
const put = (p, t) => { fs.mkdirSync(path.dirname(path.join(W, p)), { recursive: true }); fs.writeFileSync(path.join(W, p), t) }
const drain = async () => { while (timers.length) await timers.shift()() }
const poll = async () => { for (const f of every) await f() } // every clock job: plan usage, the PR poll, the ticker
const status = async () => (await fire('command.run', { command: 'baton', args: 'status' })).text
await fire('session.start', { cwd: W })

let r = await fire('command.run', { command: 'baton', args: 'start #12' })
const m = JSON.parse(fs.readFileSync(path.join(W, '_orch/manifest.json'), 'utf8'))
ok(m.mode === 'BUILD' && m.issue.number === 12 && m.team === 'github' && m.branch === 'baton/' + m.run_id, 'start #12: BUILD, issue, TEAM github, run branch')
ok(/Closes #12/.test(r.text) && /an empty export has a header row/.test(r.text) && /baton:pr-reviewer/.test(r.text), 'kickoff carries the issue verbatim and the review loop')
await drain()

// bootstrap and P1 under way: T1 all the way through, T2 at red
put('_orch/plan/graph.yaml', '- id: T1\n  phase: 1\n- id: T2\n  phase: 1\n- id: T3\n  phase: 2\n')
put('_orch/phases/P1/brief.md', 'P1')
for (const f of ['red', 'green', 'blue']) put('_orch/nodes/T1/work/' + f + '.txt', f)
put('_orch/verify/T1-verdict.json', JSON.stringify({ verdict: 'CONFIRMED' }))
put('_orch/nodes/T2/work/red.txt', 'red')
put('_orch/nodes/T3/handoff.md', 'rgb: exempt — prose only')
put('_orch/github/pr.json', JSON.stringify({ number: 47, url: G.pr.url }))
let s = await status()
ok(/● queued .*◉ building/.test(s), 'goal is building: ' + s.split('\n').find((l) => /building/.test(l))?.trim())

// headless command gate: asks on the PR, refuses with the PR named
await fire('agent.spawn', { _id: 'w2', subagentType: 'baton:worker', description: 'T2' })
r = await fire('tool.call', { agentId: 'w2', tool: 'Bash', command: 'git push origin baton/x' })
ok(/asked on PR #47 \(\/approve push\)/.test(r.deny) && /<!-- baton:gate -->/.test(G.posted[0] ?? ''), 'headless push: asked on PR #47, refused until approved')

// the PR thread: a review, a remote approval, a remark
G.pr.comments = [
  { id: 'c1', author: { login: 'chris' }, url: 'u1', body: '<!-- baton:pr-review round=1 -->\nVERDICT: CHANGES\n- [high] src/csv.ts:9 — empty export has no header row\n- [med] src/csv.ts:30 — quoting duplicated' },
  { id: 'c2', author: { login: 'chris' }, body: '/approve push' },
  { id: 'c3', author: { login: 'mallory' }, body: '/approve rm' },
  { id: 'c4', author: { login: 'chris' }, body: 'please also handle unicode in names' },
]
await poll()
await drain()
r = await fire('tool.call', { agentId: 'w2', tool: 'Bash', command: 'git push origin baton/x' })
ok(r.result === 'ran', 'after /approve push on the thread, push runs')
r = await fire('tool.call', { agentId: 'w2', tool: 'Bash', command: 'rm -rf build' })
ok(!!r.deny, '/approve from a non-answerer is ignored')
ok(models.some((x) => x.model === 'claude-haiku-4-5-20251001' && /unicode/.test(x.prompt)), 'a human remark is condensed by Haiku')
const wake = execFileSync('node', [MOD + '/bin/memo.mjs', '--dir', W + '/_orch/memory', 'wake'], { encoding: 'utf8' })
ok(/\[review\] PR #47 review round 1: CHANGES \(1 high, 1 med/.test(wake) && /\[github\] PR #47 chris: chris asks to also handle unicode/.test(wake) && /ignored \/approve rm from mallory/.test(wake), 'review, remark and ignored command are notes')
s = await status()
ok(/✗ reviewing \(changes\)/.test(s) || /reviewing.*changes/.test(s), 'goal flagged: reviewing (changes)')

// the fix round lands, P1 done, review READY, checks green, mergeable → ready
put('_orch/phases/P1/envelope.json', JSON.stringify({ verdict: 'DONE' }))
for (const f of ['green', 'blue']) put('_orch/nodes/T2/work/' + f + '.txt', f)
put('_orch/verify/T2-verdict.json', JSON.stringify({ verdict: 'CONFIRMED' }))
G.pr.comments.push({ id: 'c5', author: { login: 'chris' }, url: 'u5', body: '<!-- baton:pr-review round=2 -->\nVERDICT: READY\n' })
G.pr.statusCheckRollup.push({ name: 'ci', conclusion: 'SUCCESS' })
await poll()
s = await status()
ok(/◉ ready/.test(s) && toasts.some((t) => /PR #47 is ready for you to merge/.test(t)), 'merge-ready computed; toast says ready for you to merge')

// the pane: Workspace (links, steps, the merge line, the table), then Plan (every row)
surfaces = ['terminal']
await fire('command.run', { command: 'baton', args: '' })
const render = async () => fire('ui.render', { component: 'Pane', requestId: 'baton', surface: 'terminal', props: { bodyColumns: 140, scroll: { bodyRows: 40 } } })
const flat = (n, out = []) => { if (!n || typeof n !== 'object') return out; if (Array.isArray(n)) { n.forEach((c) => flat(c, out)); return out } out.push(n); flat(n.props?.children, out); return out }
let t = await render()
const links = flat(t).filter((n) => n.type === 'Link').map((n) => n.props.href)
ok(links.includes('https://github.com/o/r/issues/12') && links.includes('https://github.com/o/r/pull/47'), 'Workspace links the issue and the PR')
const wsTexts = flat(t).filter((n) => n.type === 'Text').map((n) => n.props.children.join(''))
ok(wsTexts.some((x) => /merge-ready (\d+)\/\1 · waiting for you to merge/.test(x)), 'Workspace: the merge rows as one line')
await flat(t).find((n) => n.props?.key === 'tab-plan').props.onPress()
t = await render()
const texts = flat(t).filter((n) => n.type === 'Text').map((n) => n.props.children.join(''))
ok(texts.some((x) => /✓ every check green/.test(x)) && texts.some((x) => x.trim() === 'T2'), 'Plan: merge-ready rows and node steppers drawn')
const band = await fire('ui.render', { component: 'AbovePrompt', surface: 'terminal', props: { bodyColumns: 140 } })
const bandLine = flat(band).filter((n) => n.type === 'Text').map((n) => n.props.children.join('')).join('')
ok(/#12 ready · PR #47 2\/2 ready to merge/.test(bandLine), 'band, one line: goal and PR state: ' + bandLine)

// measured rows on disk
const rows = fs.readdirSync(path.join(W, '_orch/track')).map((f) => JSON.parse(fs.readFileSync(path.join(W, '_orch/track', f), 'utf8')))
const goalRows = rows.filter((x) => x.level === 'goal').map((x) => x.state)
ok(goalRows.join(',') === 'building,reviewing,ready', 'goal transitions measured: ' + goalRows.join(' → '))
ok(rows.some((x) => x.level === 'node' && x.id === 'T2' && x.state === 'verified' && x.from === 'red'), 'node T2 red → verified recorded')

// ---- v7.2: talos's ideas as hooks
ok((G.labels[12] || []).join(',') === 'baton:ready', 'the issue carries the goal state as a label: ' + (G.labels[12] || []).join(','))
ok(G.posted.some((b) => /<!-- baton:spend -->/.test(b)) || G.patched.length > 0, 'a spend comment was posted on the PR')
// metering at turn.step: a worker's two requests and the prime's one
const step = async (agentId, usage) => { const gen = hooks['turn.step'][0].f($, { agentId }, async function* () { return { usage } }); let r = await gen.next(); while (!r.done) r = await gen.next(); return r.value }
await fire('agent.spawn', { _id: 'w9', subagentType: 'baton:worker', description: 'T9 export header' })
await step('w9', { input_tokens: 4000, output_tokens: 1000, cache_read_input_tokens: 50000, model: 'claude-opus-5-5' })
await step('w9', { input_tokens: 2000, output_tokens: 500, model: 'claude-opus-5-5' })
await step(undefined, { input_tokens: 300, output_tokens: 200, model: 'claude-opus-5-5' })
await fire('turn.complete', { agentId: 'w9', answer: 'T9 DONE', isAborted: false })
const sp = JSON.parse(fs.readFileSync(path.join(W, '_orch/spend.json'), 'utf8'))
ok(sp.total.fresh === 8000 && sp.byNode.T9.fresh === 7500 && sp.byRole.prime.fresh === 500 && sp.total.cacheRead === 50000, 'turn.step meters spend by agent, node and role')
// a running worker whose request fills 60% of Opus's 1M window crosses the 50% subagent threshold: one message, once
await fire('agent.spawn', { _id: 'w10', subagentType: 'baton:worker', description: 'T10 big parser' })
await step('w10', { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 600000, model: 'claude-opus-5-5' })
await step('w10', { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 610000, model: 'claude-opus-5-5' })
ok(sentMsgs.length === 1 && sentMsgs[0].to.agentId === 'w10' && /60% of its window.*SPLIT/.test(sentMsgs[0].text), 'a subagent past its threshold is told once to finish or split')
surfaces = []
const agentsTxt = (await fire('command.run', { command: 'baton', args: '' })).text.split('## Workspace')[1] || ''
const w9row = agentsTxt.split('\n').find((l) => /worker T10/.test(l)) || ''
ok(/worker T10 big parser\s+61%\s+50%\s+opus\s+2k\s+0\s+1\.21M\s+400\s+\$0\.26(?!\+)/.test(w9row), 'the worker row shows its own context against its threshold, tokens and cost: ' + w9row.trim())
const primeRow = agentsTxt.split('\n').find((l) => /^◆ prime/.test(l)) || ''
ok(/\/35%/.test(primeRow) || !/ctx/.test(primeRow), 'the prime row measures against the rotation threshold: ' + primeRow.trim())
// the budget refuses another round once spent
let deny = await fire('agent.spawn', { _id: 'rv', subagentType: 'baton:pr-reviewer', description: 'review round 3' })
ok(!deny.deny, 'no budget set: the reviewer may spawn')
// forbidden files: refused at git add, flagged on the PR
r = await fire('tool.call', { agentId: 'w9', tool: 'Bash', command: 'git add .env src/csv.ts' })
ok(/\.env matches a forbidden-file pattern/.test(r.deny || ''), 'git add .env is refused outright')
G.pr.files.push({ path: 'config/.env.production' })
await poll()
surfaces = []
const rowsNow = (await fire('command.run', { command: 'baton', args: '' })).text
ok(/✗ no forbidden file \(config\/\.env\.production\)/.test(rowsNow) && !/◉ ready/.test(rowsNow), 'a forbidden file on the PR fails merge-ready')
// a conflict refuses the reviewer
G.pr.mergeable = 'CONFLICTING'; G.pr.statusCheckRollup = []
await poll()
deny = await fire('agent.spawn', { _id: 'rv2', subagentType: 'baton:pr-reviewer', description: 'review round 3' })
ok(/conflicts with its base/.test(deny.deny || ''), 'a conflicting PR refuses the reviewer')
const wake2 = execFileSync('node', [MOD + '/bin/memo.mjs', '--dir', W + '/_orch/memory', 'wake'], { encoding: 'utf8' })
ok(/no CI ran because the branch conflicts/.test(wake2), 'the conflict is diagnosed in the memory')
G.pr.mergeable = 'MERGEABLE'; G.pr.statusCheckRollup = [{ name: 'baton/verify', conclusion: 'SUCCESS' }, { name: 'ci', conclusion: 'SUCCESS' }]; G.pr.files = G.pr.files.filter((f) => !/\.env/.test(f.path))
// a question with its Blocked-by line
put('_orch/inbox/Q-4.md', 'Which vendor key do we use?\nBlocked by: _orch/nodes/T9/handoff.md:"use the vendor API" (explicit)\n')
s = await status()
await poll()
surfaces = []
const tl = (await fire('command.run', { command: 'baton', args: '' })).text
ok(/worker T2\s.*●─●─●─●\s+verified/.test(tl), 'Agents rows carry their node’s steps: ' + ((tl.split('## Workspace')[1] || '').split('\n').find((l) => /T2/.test(l)) || '').trim())
ok(/\? Q-4 Which vendor key do we use\?  — blocked by _orch\/nodes\/T9\/handoff\.md:"use the vendor API" \(explicit: fix the cause\)/.test(tl), 'open question shown with what it rests on')
put('_orch/inbox/Q-4.answer.md', 'key B')

// merged → next goal
G.pr.state = 'MERGED'
await poll()
surfaces = []
r = await fire('command.run', { command: 'baton', args: 'watch' })
ok(/#12 CSV export/.test(r.text) && /#15 Retry backoff/.test(r.text), 'watch lists the queue')
r = await fire('command.run', { command: 'baton', args: 'next' })
const m2 = JSON.parse(fs.readFileSync(path.join(W, '_orch/manifest.json'), 'utf8'))
ok(/archived /.test(r.text) && m2.issue.number === 15 && fs.existsSync(path.join(W, '.baton/runs', m.run_id, 'manifest.json')), 'next: archived the run, started #15')
