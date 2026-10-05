// node --test — the model binding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindModel, isCheap, CHEAP, FRONTIER } from '../lib/binding.mjs'

test('prime-side roles bind to Opus 5.5 whatever the caller asked', () => {
  for (const t of ['baton:sub-orchestrator', 'baton:worker', 'baton:verifier', 'general-purpose', 'Explore'])
    assert.equal(bindModel({ subagentType: t, model: 'haiku' }), FRONTIER, t)
})

test('-cheap agent types and names bind to Sonnet 5.5', () => {
  assert.equal(bindModel({ subagentType: 'baton:worker-cheap' }), CHEAP)
  assert.equal(bindModel({ subagentType: 'general-purpose', name: 'lint-cheap' }), CHEAP)
  assert.equal(bindModel({ subagentType: 'baton:worker', model: 'sonnet' }), FRONTIER, 'a caller cannot make a role cheap by asking')
  assert.ok(!isCheap({ subagentType: 'baton:cheapskate' }))
})

test('a fork is left alone', () => {
  assert.equal(bindModel({ subagentType: 'fork', fork: true }), null)
})
