// node --test — the rulings helpers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fallbackRuling, isOperatorPrompt, parseRuling, rulingPrompt } from '../lib/rulings.mjs'

test('parseRuling takes the RULING line and rejects NONE', () => {
  assert.equal(parseRuling('RULING: Never push to main; open a PR.'), 'Never push to main; open a PR.')
  assert.equal(parseRuling('Thinking…\nRULING: "Use sonnet for sweeps"'), 'Use sonnet for sweeps')
  assert.equal(parseRuling('NONE'), null)
  assert.equal(parseRuling(''), null)
  assert.equal(parseRuling('RULING: ok'), null) // too short to be a rule
})

test('parseRuling caps a rule at 240 bytes', () => {
  const r = parseRuling('RULING: ' + 'x'.repeat(500))
  assert.ok(Buffer.byteLength(r) <= 240)
  assert.ok(r.endsWith('…'))
})

test('fallbackRuling keeps only short messages with a standing-rule marker', () => {
  assert.equal(fallbackRuling('From now on, run the gate in the foreground.'), 'From now on, run the gate in the foreground.')
  assert.equal(fallbackRuling('never merge my PRs'), 'never merge my PRs')
  assert.equal(fallbackRuling('fix the login bug'), null)
  assert.equal(fallbackRuling('always ' + 'x'.repeat(700)), null)
})

test('isOperatorPrompt skips slash commands, the kickoff and empty text', () => {
  assert.equal(isOperatorPrompt('use opus for the verifier', null), true)
  assert.equal(isOperatorPrompt('/baton status', null), false)
  assert.equal(isOperatorPrompt('   ', null), false)
  assert.equal(isOperatorPrompt('KICK', 'KICK'), false)
  assert.equal(isOperatorPrompt('baton v7 run build-20261004T1200Z started — MODE BUILD', null), false)
})

test('rulingPrompt fences the message and bounds it', () => {
  const p = rulingPrompt('y'.repeat(10000))
  assert.ok(p.startsWith('Operator message:\n<<<\n'))
  assert.ok(p.length < 6100)
})
