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
  assert.equal(rows[1].text, '  ● sub-orchestrator P3 · opus · 1m01s · 0 tools')
  assert.equal(rows[2].text, '    ● worker-cheap T7 · sonnet · 1m00s · 2 tools · now Read')
  finishAgent(t, 'w1', { line: 'T7 BLOCKED on Q-2', at: 5000 })
  rows = treeRows(t, 62000)
  assert.match(rows[2].text, /✗ worker-cheap T7 · sonnet · 3s · 2 tools · BLOCKED — T7 BLOCKED on Q-2/)
  assert.equal(rows[2].color, 'red')
})

test('old finished agents fold into a count', () => {
  const t = newTree(0)
  for (let i = 0; i < 5; i++) {
    addSpawn(t, { id: 'a' + i, type: 'baton:worker', label: 'w' + i, at: i })
    finishAgent(t, 'a' + i, { line: 'DONE', at: 10 + i })
  }
  const rows = treeRows(t, 100, { keepDone: 2 })
  assert.equal(rows.length, 4)
  assert.equal(rows.at(-1).text, '  … 3 earlier finished agents folded')
})

test('helpers: shortModel, elapsed', () => {
  assert.equal(shortModel('claude-opus-5-5'), 'opus')
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
