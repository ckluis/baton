// claude plugin test — RV1 (PR #57 review round 1, finding [high]): R-C15-25.
//
// R-C15-25 (spec /Users/clank/Desktop/projects/baton/docs/designs/v7.6-tuning.md L434):
// "Whatever truncates the summarizer's input is fixed."
// Answers: /Users/clank/Desktop/projects/baton/_orch/inbox/Q-78.answer.md, Q-79.answer.md.
// Review: /Users/clank/Desktop/projects/baton/_orch/nodes/S3/work/pr57-review-r1.md (first bullet):
// the fix is text in the merge request's system prompt, and mutant M25 (removing it) left
// every test green. This file checks what the mod actually sends to the cheap model for a
// merge: the system prompt of that request tells the model the 280-byte cap on each entry is
// by design and that it must not comment on the entries. It reads the request the mod makes
// (at the model.complete seam, as mod/tests/t14-summarizer.test.ts does), not the constant.
//
// The memo CLI is stubbed at process.run; no real memory store is read or written (Q-85).
import { expect, mock, test } from 'claude-code/testing'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

// Fixture notes: short, plain run notes.
const ALPHA = 'RV1 fixture alpha: P6 parked on Q-7'
const BETA = 'RV1 fixture beta: RV2 waits on RV1'
// A reply the summarizer accepts (none of the Q-78 patterns).
const GOOD = 'P6 parked on Q-7; RV2 waits on RV1'

/** A run with one ready L1 merge over the two fixture notes; records each model request. */
function world(on: any) {
  const models: any[] = []
  const stored = new Map<string, string>()
  const item = { level: 1, index: 0, lo: 0, hi: 1, ready: true, texts: [ALPHA, BETA] }
  let notes = 0
  let pendingServed = false
  on('fs.read', (_$: any, e: any) => (e.path.endsWith('_orch/manifest.json') ? { value: ACTIVE } : { deny: 'ENOENT' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/work' }))
  on('session.root', () => ({ value: '/work' }))
  on('session.version', () => ({ value: { version: '2.1.287', base: '2.1.287' } }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__baton__' + e.name } }))
  on('model.complete', (_$: any, e: any) => {
    models.push(e)
    return { value: { isAnswered: true, text: GOOD, usage: {} } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    const stdin = e.init?.stdin
    const cmd = argv.find((a: string) => ['note', 'wake', 'zoom', 'recall', 'pending', 'merge', 'stats'].includes(a))
    let stdout = ''
    if (cmd === 'note') {
      const index = notes++
      const merges = index % 2 === 1 ? [{ level: 1, index: (index - 1) / 2 }] : []
      stdout = JSON.stringify({ index, text: stdin ?? '', truncated: false, merges })
    } else if (cmd === 'pending') {
      stdout = JSON.stringify(!stored.has('1:0') && !pendingServed ? [item] : [])
      pendingServed = true
    } else if (cmd === 'merge') {
      if (!stored.has('1:0')) stored.set('1:0', String(stdin ?? ''))
      stdout = JSON.stringify({ merged: 1, pending: 0 })
    } else stdout = cmd + ' output'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return { models }
}

// R-C15-25 (L434): "Whatever truncates the summarizer's input is fixed."
// Q-79: each entry is capped at 280 bytes by design; the model must merge it, not comment on it.
test('rv1 R-C15-25: the merge request the mod sends tells the model, in its system prompt, that the 280-byte cap is by design and the entries are not to be commented on', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: ALPHA } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: BETA } as any)
  for (let i = 0; i < 5; i++) {
    await clock.advance(50)
    await clock.settle()
  }
  // the merge requests: the model calls whose prompt carries both fixture entries
  const merges = w.models.filter((m) => String(m.prompt ?? '').includes(ALPHA) && String(m.prompt ?? '').includes(BETA))
  // expected: the summarizer was asked for the range at least once
  expect(merges.length).toBeGreaterThanOrEqual(1)
  for (const m of merges) {
    const system = String(m.system ?? '')
    // expected: the cap is named as 280 bytes per entry (Q-79 "The 280-byte note limit stays")
    expect(system).toMatch(/\bentry is capped at 280 bytes\b/i)
    // expected: the cap is said to be by design, so a cut entry is expected input (spec L434)
    expect(system).toMatch(/\bby design\b/i)
    // expected: the model is told not to comment on the entries, their length or their cuts (Q-78)
    expect(system).toMatch(/\bnever comment on the entries\b/i)
    // expected: those words are in the system prompt, not only in the user prompt
    expect(String(m.prompt ?? '')).not.toMatch(/by design/i)
  }
})
