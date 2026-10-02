// node --test — the pure guard decision, including the subagent side a
// plugin test cannot fire (its tool.call drops agentId).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardDecision, isPrimeCall, manifestIsPrime, primeMayUse, PRIME_TOOLS } from '../lib/guard.mjs'

test('a subagent call passes whatever the tool', () => {
  for (const tool of ['Read', 'Bash', 'Edit', 'Write', 'Grep']) assert.equal(guardDecision({ tool, agentId: 'a27fa7ec1a0337b22' }, true), null)
})

test('a prime call is refused unless allowlisted, and only during a run', () => {
  assert.match(guardDecision({ tool: 'Read' }, true).deny, /dispatch a sub-orchestrator/)
  assert.equal(guardDecision({ tool: 'Read' }, false), null)
  assert.equal(guardDecision({ tool: 'Agent' }, true), null)
  assert.equal(guardDecision({ tool: 'mcp__baton__memory_recall' }, true), null)
  assert.match(guardDecision({ tool: 'mcp__batonx__evil' }, true).deny, /never runs/)
  assert.deepEqual([...PRIME_TOOLS].sort(), ['Agent', 'AskUserQuestion', 'SendMessage', 'Task', 'ToolSearch'])
})

test('agentId absent, null or empty all count as the prime (fail closed)', () => {
  assert.ok(isPrimeCall({ tool: 'Read' }))
  assert.ok(isPrimeCall({ tool: 'Read', agentId: null }))
  assert.ok(isPrimeCall({ tool: 'Read', agentId: '' }))
  assert.ok(!isPrimeCall({ tool: 'Read', agentId: 'x' }))
  assert.ok(primeMayUse('SendMessage'))
  assert.ok(!primeMayUse('Bash'))
})

test('manifest arming', () => {
  assert.equal(manifestIsPrime('{"prime":true}'), true)
  assert.equal(manifestIsPrime('{"prime":"yes"}'), false)
  assert.equal(manifestIsPrime('{"prime":true,"closed":true}'), false)
  assert.equal(manifestIsPrime(''), false)
  assert.equal(manifestIsPrime('nope'), false)
})
