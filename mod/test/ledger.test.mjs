// node --test — spend, budget, forbidden files, the goal on GitHub, Blocked by; and the new merge rows.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addUsage, boardColumn, budgetCheck, forbiddenHits, gitAddPaths, globMatch, goalLabel, isRoundSpawn, parseBlockedBy, shortTokens, spendMarkdown, usageTokens, workOf } from '../lib/ledger.mjs'
import { mergeReady } from '../lib/track.mjs'

test('usage: fresh tokens and cache reads apart; accounts add up', () => {
  const u = { input_tokens: 1200, output_tokens: 800, cache_creation_input_tokens: 3000, cache_read_input_tokens: 90000, model: 'claude-opus-5-5' }
  assert.deepEqual(usageTokens(u), { fresh: 5000, cacheRead: 90000 })
  const acc = {}
  addUsage(acc, u)
  addUsage(acc, { ...u, model: 'claude-sonnet-5-5' })
  const { byModel, ...rest } = acc
  assert.deepEqual(rest, { fresh: 10000, cacheRead: 180000, requests: 2, models: ['claude-opus-5-5', 'claude-sonnet-5-5'] })
  assert.deepEqual(byModel['claude-opus-5-5'], { input: 1200, output: 800, cacheWrite: 3000, cacheRead: 90000 })
  assert.deepEqual(usageTokens(null), { fresh: 0, cacheRead: 0 })
  assert.equal(shortTokens(950), '950')
  assert.equal(shortTokens(41234), '41k')
  assert.equal(shortTokens(1250000), '1.25M')
})

test('budget: off, ok, warn at 80%, exceeded at 100%', () => {
  assert.equal(budgetCheck(5, 0).status, 'off')
  assert.equal(budgetCheck(500, 1000).status, 'ok')
  assert.equal(budgetCheck(800, 1000).status, 'warn')
  assert.deepEqual(budgetCheck(1200, 1000), { status: 'exceeded', used: 1200, limit: 1000, pct: 120 })
})

test('round spawns and what an agent works on', () => {
  assert.equal(isRoundSpawn({ subagentType: 'baton:pr-reviewer' }), true)
  assert.equal(isRoundSpawn({ subagentType: 'baton:sub-orchestrator', description: 'PR steward round 2' }), true)
  assert.equal(isRoundSpawn({ subagentType: 'baton:sub-orchestrator', description: 'P3 phase' }), false)
  assert.deepEqual(workOf('T14 parser fix'), { node: 'T14', phase: null })
  assert.deepEqual(workOf('P3 phase'), { node: null, phase: 'P3' })
})

test('forbidden files: globs on the basename, examples allowed, git add paths', () => {
  assert.equal(globMatch('.env.*', 'app/.env.local'), true)
  assert.equal(globMatch('*.pem', 'certs/server.pem'), true)
  assert.deepEqual(forbiddenHits(['src/a.ts', '.env', '.env.example', 'deploy/id_rsa', 'k.PEM']), ['.env', 'deploy/id_rsa', 'k.PEM'])
  assert.deepEqual(gitAddPaths('cd /w && git add -f .env src/a.ts && git commit -m x'), ['.env', 'src/a.ts'])
  assert.deepEqual(gitAddPaths('git status'), [])
})

test('the goal on GitHub: a label and a board column', () => {
  assert.equal(goalLabel('building', null), 'baton:building')
  assert.equal(goalLabel('building', 'blocked'), 'baton:blocked')
  assert.equal(boardColumn('reviewing', null), 'In review')
  assert.equal(boardColumn('merged', null), 'Done')
  assert.equal(boardColumn('building', 'blocked', { blocked: 'Needs attention' }), 'Needs attention')
})

test('Blocked by: where, and explicit or interpreted', () => {
  assert.deepEqual(parseBlockedBy('Q-4: which key?\nBlocked by: _orch/nodes/T14/handoff.md:"use the vendor API" (explicit)'), { where: '_orch/nodes/T14/handoff.md:"use the vendor API"', kind: 'explicit' })
  assert.equal(parseBlockedBy('Blocked by: src/a.ts:"looks risky" (interpreted)').kind, 'interpreted')
  assert.equal(parseBlockedBy('blocked on Q-4'), null)
})

test('spend comment carries its marker and the budget line', () => {
  const md = spendMarkdown({ total: { fresh: 1.2e6, cacheRead: 9e6, requests: 400 }, budget: budgetCheck(1.2e6, 2e6), byRole: { worker: { fresh: 8e5, cacheRead: 1, requests: 300 } } })
  assert.match(md, /^<!-- baton:spend -->/)
  assert.match(md, /Budget: 1\.2M of 2M \(60%, ok\)/)
})

test('merge-ready: the issue, other PRs, forbidden files, a clean checkout; a conflict is diagnosed', () => {
  const pr = { mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ conclusion: 'SUCCESS' }], closingIssuesReferences: [{ number: 12 }] }
  const ready = { verdict: 'READY', high: 0 }
  assert.equal(mergeReady(pr, ready, { issue: 12, otherPRs: 0, forbidden: [], clean: true }).ok, true)
  assert.equal(mergeReady({ ...pr, closingIssuesReferences: [] }, ready, { issue: 12 }).ok, false)
  assert.equal(mergeReady(pr, ready, { forbidden: ['.env'] }).rows.at(-1).row, 'no forbidden file (.env)')
  assert.equal(mergeReady(pr, ready, { clean: false }).ok, false)
  assert.equal(mergeReady(pr, ready).rows.length, 6)
  assert.match(mergeReady({ mergeable: 'CONFLICTING', statusCheckRollup: [] }, ready).diagnosis, /merge the base into it/)
})

test('cost per model from the verified prices; an unpriced model is unknown, never guessed', async () => {
  const { addUsage: add, costOf, shortUsd, priceFor, windowFor, contextOf, ctxTone, contextNudge } = await import('../lib/ledger.mjs')
  const acc = {}
  add(acc, { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 1e5, cache_creation_input_tokens: 1e5, cache_read_input_tokens: 1e6 })
  // 4 + 2 + 0.5 + 0.2
  assert.equal(costOf(acc).usd.toFixed(2), '6.70')
  assert.equal(shortUsd(costOf(acc)), '$6.70')
  add(acc, { model: 'claude-sonnet-5-5', input_tokens: 1000, output_tokens: 10 })
  assert.deepEqual(costOf(acc).unpriced, ['claude-sonnet-5-5'])
  assert.equal(shortUsd(costOf(acc)), '$6.70+?')
  assert.equal(shortUsd(costOf(acc, { 'claude-sonnet-5-5': { input: 3, output: 15, cacheRead: 0.3 } })), '$6.70')
  assert.ok(priceFor('claude-haiku-4-5-20251001'))
  assert.equal(windowFor('claude-opus-5-5'), 1e6)
  assert.equal(windowFor('claude-sonnet-5-5', 400000), 400000)
  assert.equal(windowFor('claude-sonnet-5-5[1m]'), 1e6)
  assert.equal(contextOf({ input_tokens: 10, cache_read_input_tokens: 300000, cache_creation_input_tokens: 2000 }), 302010)
  assert.deepEqual([ctxTone(10, 50), ctxTone(40, 50), ctxTone(55, 50), ctxTone(null, 50)], ['green', 'yellow', 'red', undefined])
  assert.match(contextNudge(57), /57% of its window.*SPLIT/)
})
