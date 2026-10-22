// node --test — the agent tree and the approval helpers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addSpawn, addToolCall, chain, elapsed, finishAgent, newTree, PRIME, shortModel, treeRows } from '../lib/agents.mjs'
import { alwaysLabel, claimsDone, gateFor, readCommandAnswer, readPhaseAnswer } from '../lib/approve.mjs'

test('the tree nests by parent, counts tools, and closes with a verdict', () => {
  const t = newTree(0)
  addSpawn(t, { id: 's1', type: 'baton:sub-orchestrator', label: 'P3', model: 'claude-opus-5-5', at: 1000 })
  addSpawn(t, { id: 'w1', parent: 's1', type: 'baton:worker-cheap', label: 'T7', model: 'claude-sonnet-5-5', at: 2000 })
  addSpawn(t, { id: 'orphan', parent: 'nope', type: 'baton:verifier', at: 2000 })
  addToolCall(t, 'w1', 'Bash')
  addToolCall(t, 'w1', 'Read')
  addToolCall(t, null, 'Agent')
  assert.equal(chain(t, 'w1'), 'prime › P3 › T7')
  assert.equal(t.nodes.get('orphan').parent, PRIME)
  let rows = treeRows(t, 62000)
  assert.equal(rows[0].text, '◆ prime · 1m02s · 1 tool · now Agent')
  let iS = rows.findIndex((r) => /sub-orchestrator P3/.test(r.text)) // amended by verifier (XT110): the sub-orchestrator's row is found by its text, not by a fixed index: with no plan no phase row is drawn, and a non-agent line (a dim `no phases yet`, spec L333-334) may stand under the prime (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
  assert.ok(iS > 0 && rows.slice(1, iS).every((r) => !r.id), 'no agent or phase row stands between the prime and its sub-orchestrator when there is no plan: ' + rows.map((r) => r.text).join(' / ')) // amended by verifier (XT110): with no plan there is no P3 phase row, so the sub-orchestrator labelled P3 sits directly under the prime (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
  assert.equal(rows[iS].text, '  ● sub-orchestrator P3 · opus 5.5 · 1m01s · 0 tools') // amended by verifier (XT18): the model shows family and version, never a bare family (spec L111-112; R-C8-01, R-C8-02) · amended by verifier (XT110): indexed from the sub-orchestrator row found by its text (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
  assert.equal(rows[iS + 1].text, '    ● worker-cheap T7 · sonnet 5.5 · 1m00s · 2 tools · now Read') // amended by verifier (XT18): the model shows family and version, never a bare family (spec L111-112; R-C8-01, R-C8-02) · amended by verifier (XT110): indexed from the sub-orchestrator row found by its text (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
  finishAgent(t, 'w1', { line: 'T7 BLOCKED on Q-2', at: 5000 })
  rows = treeRows(t, 62000)
  iS = rows.findIndex((r) => /sub-orchestrator P3/.test(r.text)) // amended by verifier (XT110): the sub-orchestrator's row again, by its text (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
  assert.match(rows[iS + 1].text, /✗ worker-cheap T7 · sonnet 5\.5 · 3s · 2 tools · BLOCKED — T7 BLOCKED on Q-2/) // amended by verifier (XT18): the model shows family and version, never a bare family (spec L111-112; R-C8-01, R-C8-02) · amended by verifier (XT110): indexed from the sub-orchestrator row found by its text (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
  assert.equal(rows[iS + 1].color, 'red') // amended by verifier (XT110): the worker's row, one level under its sub-orchestrator (spec L309, L319-325; R-C10-29, R-C10-42, R-C10-44)
})

test('old finished agents are never folded: every agent stays listed', () => { // amended by verifier (XT115): finished agents no longer fold into a count; every agent stays listed (spec L286, L288; R-C16-03, R-C16-06)
  const t = newTree(0)
  for (let i = 0; i < 5; i++) {
    addSpawn(t, { id: 'a' + i, type: 'baton:worker', label: 'w' + i, at: i })
    finishAgent(t, 'a' + i, { line: 'DONE', at: 10 + i })
  }
  const rows = treeRows(t, 100, { keepDone: 2 })
  const ids = rows.map((r) => r.id).filter(Boolean) // amended by verifier (XT115): the agent rows by id, whatever non-agent line may stand under the prime (spec L286, L288; R-C16-03, R-C16-06)
  assert.deepEqual(['a0', 'a1', 'a2', 'a3', 'a4'].filter((id) => !ids.includes(id)), [], 'every finished agent has its own row: ' + rows.map((r) => r.text).join(' / ')) // amended by verifier (XT115): every agent stays listed, so none of the five finished agents is folded away, even past an old keepDone of 2 (spec L286; R-C16-03)
  assert.deepEqual(rows.filter((r) => /earlier finished agent/.test(r.text)).map((r) => r.text), []) // amended by verifier (XT115): the `… N earlier finished agents folded` line goes away (spec L288; R-C16-06)
})

test('helpers: shortModel, elapsed', () => {
  assert.equal(shortModel('claude-opus-5-5'), 'opus 5.5') // amended by verifier (XT18): the model shows family and version, never a bare family (spec L111-112; R-C8-01, R-C8-02)
  assert.equal(shortModel(undefined), null)
  assert.equal(elapsed(3_725_000), '1h02m')
})

test('gates catch irreversible commands and pass ordinary ones', () => {
  for (const c of ['git push origin v7', 'gh pr create --base main', 'gh pr merge 41', 'npm publish', 'git reset --hard HEAD~1', 'git clean -fd', 'rm -rf build', 'rm -r x'])
    assert.ok(gateFor(c), c)
  for (const c of ['git status', 'git commit -m push', 'gh pr view 41', 'rm file.txt', 'npm test', 'grep -r push .']) assert.equal(gateFor(c), null, c)
})

test('answers: approve, approve-for-run, refuse with or without a reason', () => {
  const g = gateFor('git push')
  assert.equal(readCommandAnswer('Approve', g), 'approve')
  assert.equal(readCommandAnswer(alwaysLabel(g), g), 'always')
  assert.deepEqual(readCommandAnswer('Refuse', g), { refuse: null })
  assert.deepEqual(readCommandAnswer('not to main, use a branch', g), { refuse: 'not to main, use a branch' })
  assert.equal(readPhaseAnswer('Approve'), 'approve')
  assert.deepEqual(readPhaseAnswer('the tests are vacuous'), { sendBack: 'the tests are vacuous' })
})

test('claimsDone: the first verdict word is a DONE', () => {
  assert.equal(claimsDone('P3 DONE+CONFIRMED 4/4'), true)
  assert.equal(claimsDone('P3 DONE-WITH-CAVEATS 7/8 CONFIRMED · T14 BLOCKED on Q-2'), true)
  assert.equal(claimsDone('P3 BLOCKED on Q-2 · T1 DONE'), false)
  assert.equal(claimsDone('P3 PARTIAL'), false)
  assert.equal(claimsDone('bootstrap returned the plan'), false)
})
