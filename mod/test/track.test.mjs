// node --test — the tracker: states computed from the record, measured transitions, steppers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { goalState, graphPhases, latestReview, mergeReady, nodeState, parseCommands, parseReview, phaseState, prState, stepper, stepperText, timeline, transitions } from '../lib/track.mjs'

test('a node walks red → green → blue → verified from its files and verdict', () => {
  assert.deepEqual(nodeState({}), { ladder: 'node', state: 'red', flag: 'pending' })
  assert.equal(nodeState({ started: true }).state, 'red')
  assert.equal(nodeState({ red: true }).flag, null)
  assert.equal(nodeState({ red: true, green: true }).state, 'green')
  assert.equal(nodeState({ red: true, green: true, blue: true }).state, 'blue')
  assert.equal(nodeState({ red: true, green: true, blue: true, verdict: 'CONFIRMED' }).state, 'verified')
  assert.deepEqual(nodeState({ red: true, green: true, blue: true, verdict: 'REFUTED' }), { ladder: 'node', state: 'blue', flag: 'refuted' })
  assert.deepEqual(nodeState({ exempt: true, started: true }), { ladder: 'node-exempt', state: 'working', flag: null })
})

test('a phase: briefed → dispatched → verified → approved; a non-DONE envelope flags it', () => {
  assert.equal(phaseState({ brief: true }).state, 'briefed')
  assert.equal(phaseState({ brief: true, dispatched: true }).state, 'dispatched')
  assert.equal(phaseState({ brief: true, dispatched: true, envelopeVerdict: 'DONE-WITH-CAVEATS' }).state, 'verified')
  assert.equal(phaseState({ brief: true, envelopeVerdict: 'DONE', approved: true }).state, 'approved')
  assert.deepEqual(phaseState({ brief: true, dispatched: true, envelopeVerdict: 'BLOCKED' }), { ladder: 'phase', state: 'dispatched', flag: 'blocked' })
  assert.equal(phaseState({ brief: true, envelopeVerdict: 'DONE', sentBack: true }).flag, 'sent back')
})

const PR = (o = {}) => ({ number: 47, state: 'OPEN', isDraft: true, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [{ name: 'baton/verify', conclusion: 'SUCCESS' }, { name: 'ci', conclusion: 'SUCCESS' }], ...o })

test('the PR and merge-ready are computed; every row must hold', () => {
  assert.equal(prState(PR({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }), null, null).flag, 'checks failing')
  assert.equal(prState(PR(), null, null).state, 'checks')
  const changes = { verdict: 'CHANGES', high: 1 }
  assert.deepEqual(prState(PR(), changes, mergeReady(PR(), changes)), { ladder: 'pr', state: 'reviewed', flag: 'changes' })
  const ready = { verdict: 'READY', high: 0 }
  const mr = mergeReady(PR(), ready)
  assert.equal(mr.ok, true)
  assert.equal(prState(PR(), ready, mr).state, 'ready')
  assert.equal(mergeReady(PR({ mergeStateStatus: 'BEHIND' }), ready).ok, false)
  assert.equal(mergeReady(PR(), ready, { threads: 2 }).rows.find((r) => /thread/.test(r.row)).ok, false)
  assert.equal(prState(PR({ state: 'MERGED' }), ready, mr).state, 'merged')
})

test('the goal follows the plan, the phases, the review and the PR', () => {
  assert.equal(goalState({}).state, 'queued')
  assert.equal(goalState({ planned: true }).state, 'planned')
  assert.equal(goalState({ planned: true, anyPhase: true }).state, 'building')
  assert.equal(goalState({ anyPhase: true, allPhasesDone: true }).state, 'reviewing')
  assert.deepEqual(goalState({ anyPhase: true, review: 'CHANGES' }), { ladder: 'goal', state: 'reviewing', flag: 'changes' })
  assert.equal(goalState({ review: 'READY', ready: true }).state, 'ready')
  assert.equal(goalState({ prState: 'merged' }).state, 'merged')
})

test('the reviewer comment parses; other comments do not', () => {
  const body = '<!-- baton:pr-review round=2 -->\n## baton PR review\nVERDICT: CHANGES\n\n- [high] src/export.ts:41 — no test covers an empty export\n- [med] src/csv.ts:12 – quoting duplicated from util\n- [low] README.md:3 - typo'
  const r = parseReview(body)
  assert.equal(r.verdict, 'CHANGES')
  assert.equal(r.round, 2)
  assert.deepEqual([r.high, r.med, r.low], [1, 1, 1])
  assert.equal(r.findings[0].at, 'src/export.ts:41')
  assert.equal(parseReview('VERDICT: READY'), null)
  const latest = latestReview([{ body }, { body: 'lgtm' }, { body: '<!-- baton:pr-review round=3 -->\nVERDICT: READY', url: 'u3' }])
  assert.equal(latest.verdict, 'READY')
  assert.equal(latest.url, 'u3')
})

test('gate commands in comments', () => {
  assert.deepEqual(parseCommands('ok\n/approve P3\n/send-back P4 the criteria are vacuous\n/approve push'), [
    { cmd: 'approve', target: 'P3', reason: null },
    { cmd: 'send-back', target: 'P4', reason: 'the criteria are vacuous' },
    { cmd: 'approve', target: 'push', reason: null },
  ])
  assert.deepEqual(parseCommands('please /approve P3'), [])
})

test('graph phases, list and mapping forms', () => {
  const list = '- id: T01\n  kind: task\n  phase: 1\n- id: T02\n  phase: P2\n'
  assert.deepEqual([...graphPhases(list)], [['T01', 1], ['T02', 2]])
  const map = 'nodes:\n  T07:\n    kind: task\n    phase: 3\n  T08:\n    phase: 3\n'
  assert.deepEqual([...graphPhases(map)], [['T07', 3], ['T08', 3]])
})

test('transitions are rows; the timeline measures each state from them', () => {
  const t0 = '2026-10-05T10:00:00Z'
  let rows = transitions({}, { 'node:T1': { level: 'node', id: 'T1', state: 'red' } }, t0)
  assert.deepEqual(rows, [{ ts: t0, level: 'node', id: 'T1', state: 'red', from: null }])
  assert.deepEqual(transitions({ 'node:T1': { state: 'red' } }, { 'node:T1': { level: 'node', id: 'T1', state: 'red' } }, t0), [])
  rows = [...rows, { ts: '2026-10-05T10:04:00Z', state: 'green' }, { ts: '2026-10-05T10:05:30Z', state: 'blue' }]
  const tl = timeline(rows, ['red', 'green', 'blue', 'verified'], Date.parse('2026-10-05T10:07:30Z'))
  assert.deepEqual(tl.map((x) => x.ms), [240000, 90000, 120000, null])
  assert.equal(stepperText({ ladder: 'node', state: 'blue', flag: null }, tl), '● red 4m ─ ● green 2m ─ ◉ blue 2m ─ ○ verified')
})

test('steppers: a flagged current step, a finished ladder, a pending entity', () => {
  assert.equal(stepperText({ ladder: 'pr', state: 'reviewed', flag: 'changes' }), '● draft ─ ● checks ─ ✗ reviewed (changes) ─ ○ ready ─ ○ merged')
  assert.equal(stepperText({ ladder: 'goal', state: 'merged', flag: null }), '● queued ─ ● planned ─ ● building ─ ● reviewing ─ ● ready ─ ● merged')
  assert.equal(stepperText({ ladder: 'phase', state: 'briefed', flag: 'pending' }), '○ briefed ─ ○ dispatched ─ ○ verified ─ ○ approved')
  const tones = stepper({ ladder: 'pr', state: 'reviewed', flag: 'changes' }).filter((x) => x.tone !== 'rail' && x.tone !== 'done').map((x) => x.tone)
  assert.deepEqual(tones, ['flagged', 'future', 'future'])
})
