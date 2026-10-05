// node --test — the detail views Enter opens, and the tool-call summaries they show.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addSpawn, addToolCall, newTree, toolDetail } from '../lib/agents.mjs'
import { agentDetail, criteriaOf, detailText, nodeDetail, phaseDetail, resolveTarget, wrap } from '../lib/detail.mjs'

test('tool calls are summarized by what they touched', () => {
  assert.equal(toolDetail({ tool: 'Bash', command: 'npm test --  export' }), 'npm test -- export')
  assert.equal(toolDetail({ tool: 'Edit', file_path: 'src/csv.ts' }), 'src/csv.ts')
  assert.equal(toolDetail({ tool: 'Grep', pattern: 'addItem', path: 'src' }), 'addItem in src')
  assert.equal(toolDetail({ tool: 'mcp__baton__code_fetch', target: 'addItem' }), 'addItem')
  const t = newTree(0)
  addSpawn(t, { id: 'w', type: 'baton:worker', label: 'T29 import', model: 'claude-opus-5-5', prompt: 'Do T29.\n\nbaton — lessons from earlier refutations in this part of the code (verifiers found these; do not repeat them):\n- T23: "empty" was refuted — passed pre-change', at: 0 })
  for (let i = 0; i < 12; i++) addToolCall(t, 'w', 'Bash', 'cmd ' + i, i * 1000)
  assert.equal(t.nodes.get('w').recent.length, 10)
  assert.equal(t.nodes.get('w').recent[0].detail, 'cmd 2')
  const v = agentDetail(t.nodes.get('w'), { now: 240000, chain: 'prime › P6 › T29 import', ctxPct: 57, threshold: 50, hist: [12, 33, 57], ctxTone: 'red', comps: { input: 61000, cacheWrite: 160000, cacheRead: 3800000, output: 52000 }, cost: '$3.05', steps: { ladder: 'node', state: 'blue', flag: null } })
  const txt = detailText(v)
  assert.match(v.title, /^● worker T29 import$/)
  assert.match(txt, /in the tree {2}prime › P6 › T29 import/)
  assert.match(txt, /running 4m00s {2}· {2}12 tool calls/)
  assert.match(txt, /context {6}57% of its window {2}· {2}budget 50% {2}· {2}trend ▁▃▅/)
  assert.match(txt, /the task it was given\n {2}Do T29\./)
  assert.match(txt, /lessons the mod added to it[^\n]*\n {2}- T23: "empty" was refuted/)
  assert.match(txt, /last tool calls\n {2}00:00:02 {2}Bash {10}cmd 2/)
  const t2 = newTree(0)
  addSpawn(t2, { id: 'v', type: 'baton:worker', label: 'x', at: 0 })
  addToolCall(t2, 'v', 'mcp__baton__code_search', 'parseCsv', 0)
  assert.match(detailText(agentDetail(t2.nodes.get('v'), { now: 1 })), /code_search {3}parseCsv/)
})

test('a phase and a node, from what the record holds', () => {
  const p = { id: 'P6', state: 'dispatched', flag: null, ladder: 'phase', tl: [], nodes: [{ id: 'T29', ladder: 'node', state: 'blue', flag: null, tl: [] }, { id: 'T31', ladder: 'node', state: 'red', flag: 'blocked', tl: [] }] }
  const pv = detailText(phaseDetail(p, { brief: 'Import orders from CSV.', envelope: null, spend: '410k · $4.65' }))
  assert.match(pv, /^P6 · dispatched/)
  assert.match(pv, /0 of 2 verified {2}· {2}410k · \$4\.65/)
  assert.match(pv, /its nodes[^\n]*\n {2}T29 {3}● red ─ ● green ─ ◉ blue ─ ○ verified/)
  const handoff = '# T31\n\n## Done-criteria\n- an import with a bad row reports its line number\n- 1. nothing is written on a failed import\n\n## Notes\nfoo'
  assert.deepEqual(criteriaOf(handoff), ['an import with a bad row reports its line number', '1. nothing is written on a failed import'])
  const nv = detailText(nodeDetail({ id: 'T31', ladder: 'node', state: 'green', flag: 'refuted', tl: [] }, { handoff, red: 'npm test -- import\n2 failing', green: 'npm test\n41 passing', verdict: { verdict: 'REFUTED', criteria: [{ criterion: 'an import with a bad row reports its line number', verdict: 'REFUTED', probe: 'row 7 reported as row 0' }, { criterion: 'nothing is written on a failed import', verdict: 'CONFIRMED', probe: 'db row count unchanged' }] }, lessons: ['T31: "bad row line" was refuted — row 7 reported as row 0'] }))
  assert.match(nv, /^T31 · green \(refuted\)/)
  assert.match(nv, /done-criteria\n {2}1\. an import with a bad row/)
  assert.match(nv, /red {3}npm test -- import\n {8}2 failing/)
  assert.match(nv, /blue {2}not yet/)
  assert.match(nv, /✗ an import with a bad row reports its line number\n {6}row 7 reported as row 0/)
  assert.match(nv, /lessons it left/)
})

test('resolve and wrap', () => {
  const ctx = { phases: [{ id: 'P6' }], nodes: [{ id: 'T29' }], agents: [{ id: 'a1', label: 'T29 import' }] }
  assert.deepEqual(resolveTarget('p6', ctx), { kind: 'phase', id: 'P6' })
  assert.deepEqual(resolveTarget('T29', ctx), { kind: 'node', id: 'T29' })
  assert.deepEqual(resolveTarget('import', ctx), { kind: 'agent', id: 'a1' })
  assert.equal(resolveTarget('nope', ctx), null)
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four'])
})

test('a ruling: what it says, the message it came from, its enforcement', async () => {
  const { rulingDetail } = await import('../lib/detail.mjs')
  const v = detailText(rulingDetail({ n: 3, ts: '2026-10-05', text: 'Hold the migration until released.', hand: false, enforce: null }, { text: 'ship P6, but hold the migration until I say', at: '10:31:40Z' }))
  assert.match(v, /^ruling #3/)
  assert.match(v, /from {9}your message at 10:31:40Z: "ship P6, but hold the migration until I say"/)
  assert.match(v, /enforced {5}no/)
  const e = detailText(rulingDetail({ n: 1, ts: '2026-10-02', text: 'PRs target main.', hand: true, enforce: { source: 'git push.*main' } }))
  assert.match(e, /from {9}\/baton rule, by hand/)
  assert.match(e, /enforced {5}\/git push\.\*main\//)
})
