// node --test — the code index (extraction, end lines, ranking, the CLI) and quiet output.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { endLine, extractSymbols, langOf, rank } from '../lib/codeidx.mjs'
import { quietText } from '../lib/quiet.mjs'

const CLI = fileURLToPath(new URL('../bin/code.mjs', import.meta.url))

test('symbols and their extent, across languages', () => {
  const ts = 'import x from "y"\nexport async function load(a: string): Promise<void> {\n  if (a) {\n    return\n  }\n}\nexport class Store {\n  get(k) {\n    return this.m[k] // "}"\n  }\n}\nexport const add = (a, b) => a + b\nexport interface Row { id: number }\n'
  const s = extractSymbols(ts, 'js')
  assert.deepEqual(s.map((x) => [x.name, x.kind, x.line, x.end]), [['load', 'function', 2, 6], ['Store', 'class', 7, 11], ['get', 'method', 8, 10], ['add', 'function', 12, 12], ['Row', 'type', 13, 13]])
  const py = 'class A:\n    def f(self):\n        return 1\n\n    def g(self):\n        pass\n\ndef top():\n    return 2\n'
  assert.deepEqual(extractSymbols(py, 'py').map((x) => [x.name, x.line, x.end]), [['A', 1, 6], ['f', 2, 3], ['g', 5, 6], ['top', 8, 9]])
  const ex = 'defmodule Shop.Cart do\n  def add(cart, item) do\n    [item | cart]\n  end\n  defp total(c), do: Enum.sum(c)\nend\n'
  assert.deepEqual(extractSymbols(ex, 'ex').map((x) => [x.name, x.line, x.end]), [['Shop.Cart', 1, 6], ['add', 2, 4], ['total', 5, 5]])
  const go = 'package main\nfunc (s *Srv) Handle(w http.ResponseWriter) {\n  ok()\n}\ntype Srv struct {\n  n int\n}\n'
  assert.deepEqual(extractSymbols(go, 'go').map((x) => [x.name, x.line, x.end]), [['Handle', 2, 4], ['Srv', 5, 7]])
  const rs = 'pub struct P { x: i32 }\nimpl Display for P {\n    fn fmt(&self) -> String {\n        "p".into()\n    }\n}\n'
  assert.deepEqual(extractSymbols(rs, 'rs').map((x) => x.name), ['P', 'P', 'fmt'])
  assert.equal(langOf('a/b.tsx'), 'js')
  assert.equal(langOf('README.md'), null)
  assert.equal(endLine(['type A = {', '  a: 1', '}'], 0, 'js'), 2)
})

test('ranking: exact, then prefix, then substring, then fuzzy', () => {
  const e = [
    { name: 'parseReview', kind: 'function', line: 1, end: 9, file: 'a.js' },
    { name: 'parse', kind: 'function', line: 1, end: 3, file: 'b.js' },
    { name: 'reviewParse', kind: 'function', line: 1, end: 3, file: 'c.js' },
    { name: 'prsRvw', kind: 'function', line: 1, end: 3, file: 'd.js' },
  ]
  assert.deepEqual(rank(e, 'parse').map((x) => x.name), ['parse', 'parseReview', 'reviewParse'])
  // equal fuzzy matches: the smaller block first
  assert.deepEqual(rank(e, 'PRSR').map((x) => x.name), ['prsRvw', 'parseReview'])
  assert.deepEqual(rank(e, 'parse', { kind: 'class' }), [])
})

test('the CLI: builds itself, stays fresh after an edit, hides itself from git', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codeidx-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  fs.mkdirSync(path.join(root, 'src'))
  fs.writeFileSync(path.join(root, 'src/cart.ts'), 'export function addItem(c, i) {\n  return [...c, i]\n}\n')
  const run = (...a) => execFileSync(process.execPath, [CLI, '--root', root, ...a], { encoding: 'utf8' })
  assert.match(run('search', 'additem'), /src\/cart\.ts:1-3 {2}function addItem/)
  assert.match(run('fetch', 'addItem'), /2 {2}  return \[\.\.\.c, i\]/)
  fs.writeFileSync(path.join(root, 'src/cart.ts'), 'export function addItem(c, i) {\n  return [...c, i]\n}\nexport function removeItem(c, i) {\n  return c.filter((x) => x !== i)\n}\nconst x = removeItem([], 1)\n')
  assert.match(run('search', 'remove'), /src\/cart\.ts:4-6 {2}function removeItem/)
  assert.match(run('refs', 'removeItem'), /\* src\/cart\.ts:4[\s\S]*src\/cart\.ts:7/)
  assert.match(run('fetch', 'src/cart.ts'), /2 symbols/)
  assert.match(run('explore'), /src\/ {2}1 files · 2 symbols/)
  assert.equal(execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(), '?? src/')
})

test('quiet output keeps head, failures and tail, and says where the rest is', () => {
  const t = Array.from({ length: 900 }, (_, i) => (i === 300 ? 'FAIL tests/cart.test.ts > empty cart' : 'ok ' + i)).join('\n')
  const q = quietText(t, 400, '_orch/out/x.log')
  assert.ok(q.split('\n').length < 100)
  assert.match(q, /301\| FAIL tests\/cart\.test\.ts > empty cart/)
  assert.match(q, /the whole output: _orch\/out\/x\.log/)
  assert.equal(quietText('short', 400, 'x'), null)
  assert.equal(quietText(t, 0, 'x'), null)
})

test('the agent table: every column when wide, the least useful dropped when narrow', async () => {
  const { agentTable, fitColumns, tableText } = await import('../lib/table.mjs')
  const OLD = ['agent', 'ctx', 'trend', 'budget', 'model', 'input', 'cacheWrite', 'cacheRead', 'output', 'cost', 'steps', 'state'] // amended by verifier (XT110): today's twelve columns, kept in this order; the existing cost column is the `this agent` cost cell (spec L341, D-T10-group-cells, D-T10R-group-columns; R-C10-64, R-C10-65)
  const wide = fitColumns(210) // amended by verifier (XT110): every column at 210 (spec L341-347; R-C10-64, R-C10-85)
  assert.deepEqual(wide.map((c) => c.id).filter((id) => OLD.includes(id)), OLD) // amended by verifier (XT110): the twelve columns stay, in order, around the two groups' cells (spec L341, D-T10R-group-columns; R-C10-64)
  const groupsOk = (titles) => { const tk = titles.flatMap((x, i) => (x === 'tokens' ? [i] : [])); const cs = titles.flatMap((x, i) => (x === 'cost' ? [i] : [])); return tk.length === 2 && cs.length === 2 && Math.max(tk[0], cs[0]) < Math.min(tk[1], cs[1]) } // amended by verifier (XT110): two cells titled tokens and cost per group, the `this agent` pair before the `roll-up` pair (D-T10-group-cells, D-T10R-group-columns; R-C10-64, R-C10-65, R-C10-66, R-C10-85)
  assert.ok(groupsOk(wide.map((c) => c.title)), 'both column groups at 210: ' + wide.map((c) => c.title).join(',')) // amended by verifier (XT110): every row shows two column groups, `this agent` and `roll-up` (spec L341-342, Q-57; R-C10-64, R-C10-85)
  const narrow = fitColumns(90).map((c) => c.id) // amended by verifier (XT18): the narrow table is pinned by the spec's rules, not by today's widths (spec L112, Q-10, Q-11, Q-57; R-C8-03, R-C8-04)
  assert.ok(narrow.includes('model'), 'model is kept at 90: ' + narrow.join(',')) // amended by verifier (XT18): model stays out of the narrow-pane drop order (spec L112, Q-11; R-C8-04)
  assert.ok(groupsOk(fitColumns(90).map((c) => c.title)), 'both column groups kept at 90: ' + narrow.join(',')) // amended by verifier (XT110): neither column group is ever dropped at a narrow width (spec L347, Q-57 read with Q-11; R-C10-71, R-C10-88)
  for (const id of ['agent', 'cost', 'steps', 'state']) assert.ok(narrow.includes(id), id + ' is kept at 90') // amended by verifier (XT18): agent, steps and state never drop (Q-11) and cost leaves the drop order (Q-57, D-T10-group-cells; R-C8-04)
  const ORDER = ['cacheWrite', 'trend', 'input', 'budget', 'output', 'cacheRead', 'ctx'] // amended by verifier (XT18): the drop order cacheWrite, trend, input, budget, output, cacheRead, context (Q-11, Q-57, D-T10-group-cells; R-C8-04)
  const dropped = ORDER.filter((id) => !narrow.includes(id)) // amended by verifier (XT18): what 90 columns dropped, in drop order (Q-11; R-C8-04)
  assert.deepEqual(dropped, ORDER.slice(0, dropped.length), 'dropped from the front of the drop order: ' + narrow.join(',')) // amended by verifier (XT18): columns leave in the Q-11/Q-57 order only (R-C8-04)
  const acc = { byModel: { 'claude-opus-5-5': { input: 2000, output: 400, cacheWrite: 0, cacheRead: 1210000 } } }
  const t = agentTable([{ label: '● worker T10', ctxHist: [10, 30, 61], ctxPct: 61, ctxTone: 'red', threshold: 50, model: 'opus 5.5', acc, cost: '$0.26', steps: [{ text: '●─●─◉─○', tone: 'current' }], state: 'blue' }], 210) // amended by verifier (XT18): the formatted model is `opus 5.5`, family and version (spec L111-112; R-C8-01, R-C8-02)
  const [head, row] = tableText(t)
  const spans = [] // amended by verifier (XT110): each column's title and its span on the line, from the header's one text per column (D-T10R-group-columns; R-C10-64)
  t.header.reduce((at, h) => (spans.push({ title: h.text.trim(), start: at, end: at + h.text.length }), at + h.text.length), 0) // amended by verifier (XT110): the header segments are padded to their column's width (R-C10-64)
  const titles = spans.map((x) => x.title) // amended by verifier (XT110): the column-name line's titles in order (R-C10-64)
  const firstCost = titles.indexOf('cost') // amended by verifier (XT110): the `this agent` cost cell is the existing cost column (D-T10-group-cells; R-C10-65)
  assert.deepEqual(titles.filter((x, i) => x !== 'tokens' && !(x === 'cost' && i !== firstCost)), ['agent', 'context', 'trend', 'budget', 'model', 'input', 'c.write', 'c.read', 'output', 'cost', 'steps', 'state']) // amended by verifier (XT110): today's titles stay, in order, around the groups' cells (spec L341, D-T10R-group-columns; R-C10-64)
  assert.ok(groupsOk(titles), 'both groups titled on the header: ' + head) // amended by verifier (XT110): the header names each group's tokens and cost (D-T10R-group-columns; R-C10-64, R-C10-85)
  const cells = spans.map((x) => row.slice(x.start, x.end).trim()) // amended by verifier (XT110): the row's cells, each under its column's title (D-T10R-group-columns: the row's cells line up under the header; R-C10-64)
  const tk = titles.flatMap((x, i) => (x === 'tokens' ? [i] : [])) // amended by verifier (XT110): the two tokens cells, `this agent` first (D-T10-group-cells; R-C10-65, R-C10-66)
  const cs = titles.flatMap((x, i) => (x === 'cost' ? [i] : [])) // amended by verifier (XT110): the two cost cells, `this agent` first (D-T10-group-cells; R-C10-65, R-C10-66)
  const num = (x) => { const m = /^(\d[\d,]*(?:\.\d+)?)\s*([kKmM]?)$/.exec(x || ''); return m ? Number(m[1].replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1) : NaN } // amended by verifier (XT110): a token figure as drawn: 1.21M, 1,212,400 (D-T10-group-cells; R-C10-65)
  assert.ok(Math.abs(num(cells[tk[0]]) - 1212400) <= 1212400 * 0.005, 'this agent tokens is the sum of the token kinds (2k + 0 + 1.21M + 400): ' + JSON.stringify(cells[tk[0]]) + ' in ' + row) // amended by verifier (XT110): the `this agent` tokens cell is the row's own tokens, the sum of its token kinds (spec L341, D-T10-group-cells; R-C10-65)
  assert.equal(cells[cs[0]], '$0.26') // amended by verifier (XT110): the `this agent` cost cell is the row's own cost (spec L341; R-C10-65)
  assert.deepEqual([cells[tk[1]], cells[cs[1]]], ['', '']) // amended by verifier (XT110): a row with no children leaves its roll-up group empty, drawing nothing (spec L343, D-T10R-group-columns; R-C10-67, R-C10-86)
  assert.match(cells.filter((_, i) => !tk.includes(i) && i !== cs[1]).join(' | '), /^● worker T10 \| 61% \| ▁▃▅ \| 50% \| opus 5\.5 \| 2k \| 0 \| 1\.21M \| 400 \| \$0\.26 \| ●─●─◉─○ \| blue$/) // amended by verifier (XT110): today's cells keep their values under their own titles, the model `opus 5.5` whole (spec L111-112, L341; R-C8-01, R-C10-64) // amended by verifier (XT18): the model column shows `opus 5.5` whole, never cut (spec L111-112, Q-10; R-C8-01, R-C8-03)
})

test('plan usage: labels, resets, colors, the line', async () => {
  const { limitLabel, resetLabel, usageColor, usageSegs } = await import('../lib/view.mjs')
  assert.deepEqual(['five_hour', 'seven_day', 'seven_day_fable', 'spend_limit'].map(limitLabel), ['5h', 'week', 'Fable week', 'spend'])
  const now = Date.parse('2026-10-05T10:00:00Z')
  assert.equal(resetLabel('2026-10-05T14:20:00Z', now), '14:20Z')
  assert.equal(resetLabel('2026-10-08T09:00:00Z', now), 'Thu 09:00Z')
  assert.deepEqual([usageColor(10), usageColor(70), usageColor(90)], ['green', 'yellow', 'red'])
  const line = usageSegs([{ kind: 'seven_day', percentUsed: 18 }, { kind: 'five_hour', percentUsed: 42.5, resetsAt: '2026-10-05T14:20:00Z' }, { kind: 'seven_day_fable', percentUsed: 3 }], { usd: 4.2 }, now).map((x) => x.text).join('')
  assert.match(line, /^5h ▕.*▏ 42\.5% resets 14:20Z {2}· {2}week ▕.*▏ 18% {2}· {2}Fable week ▕.*▏ 3% {2}· {2}session \$4\.20$/)
  assert.match(usageSegs([], null).map((x) => x.text).join(''), /no reading yet/)
})

test('the band is one line: plan windows, context against its threshold, cost, goal, PR', async () => {
  const { bandSegs } = await import('../lib/view.mjs')
  const line = bandSegs({
    limits: [{ kind: 'seven_day', percentUsed: 18 }, { kind: 'five_hour', percentUsed: 42.4 }, { kind: 'seven_day_fable', percentUsed: 3 }],
    cost: { usd: 17.41 }, ctx: 24, threshold: 35, rotations: 3,
    goal: { text: '#12 building' }, pr: { text: 'PR #47 5/6' },
  }).map((x) => x.text).join('')
  assert.equal(line, '5h ▕██░░░▏42% · wk ▕█░░░░▏18% · Fable ▕░░░░░▏3% · ctx ▕█░┊░░▏24%/35% · ↻3 · $17.41 · #12 building · PR #47 5/6')
  assert.equal(bandSegs({ ctx: 12 }).map((x) => x.text).join(''), 'ctx ▕█░░░░▏12%')
})

test('an index written before it ignored itself gets its .gitignore on the next run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codeidx-old-'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  fs.writeFileSync(path.join(root, 'a.ts'), 'export function a() {\n}\n')
  execFileSync(process.execPath, [CLI, '--root', root, 'stats'])
  fs.rmSync(path.join(root, '.baton/code/.gitignore'))
  execFileSync(process.execPath, [CLI, '--root', root, 'stats'])
  assert.equal(execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim(), '?? a.ts')
})

test('sparkline: a fixed 0–100 scale, newest last', async () => {
  const { sparkline } = await import('../lib/table.mjs')
  assert.equal(sparkline([0, 12, 25, 50, 75, 99, 100]), '▁▁▃▅▇██')
  assert.equal(sparkline(Array.from({ length: 20 }, (_, i) => i * 5)).length, 8)
})

test('versions compare numerically; an installed copy is told from a checkout', async () => {
  const { compareVersions, installedCopy } = await import('../lib/view.mjs')
  assert.equal(compareVersions('7.10.0', '7.9.2'), 1)
  assert.equal(compareVersions('7.5.0', '7.5.0'), 0)
  assert.equal(compareVersions('7.5.0-dev', '7.5.0'), -1)
  assert.equal(compareVersions('v7.6', '7.5.9'), 1)
  assert.equal(installedCopy('/Users/x/.claude/plugins/cache/baton/baton/7.5.0'), true)
  assert.equal(installedCopy('/Users/x/Desktop/projects/baton/mod'), false)
})
