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
  assert.deepEqual(fitColumns(200).map((c) => c.id), ['agent', 'ctx', 'budget', 'model', 'input', 'cacheWrite', 'cacheRead', 'output', 'cost', 'steps', 'state'])
  assert.deepEqual(fitColumns(90).map((c) => c.id), ['agent', 'ctx', 'cacheRead', 'cost', 'steps', 'state'])
  const acc = { byModel: { 'claude-opus-5-5': { input: 2000, output: 400, cacheWrite: 0, cacheRead: 1210000 } } }
  const t = agentTable([{ label: '● worker T10', ctxPct: 61, ctxTone: 'red', threshold: 50, model: 'opus', acc, cost: '$0.26', steps: [{ text: '●─●─◉─○', tone: 'current' }], state: 'blue' }], 200)
  const [head, row] = tableText(t)
  assert.match(head, /^agent\s+context\s+budget\s+model\s+input\s+c\.write\s+c\.read\s+output\s+cost\s+steps\s+state$/)
  assert.match(row, /^● worker T10\s+61%\s+50%\s+opus\s+2k\s+0\s+1\.21M\s+400\s+\$0\.26\s+●─●─◉─○\s+blue$/)
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
