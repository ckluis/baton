// claude plugin test — T14 (cluster C15), the summarizer defect: Q-78 and Q-79.
// Red tests for F114, written before the fix (node T114D). F114 may not edit them.
//
// Spec: /Users/clank/Desktop/projects/baton/docs/designs/v7.6-tuning.md L431-434 and L518-527.
// Answers: /Users/clank/Desktop/projects/baton/_orch/inbox/Q-78.answer.md, Q-79.answer.md.
// Guards (tests named `guard: ...`) follow /Users/clank/Desktop/projects/baton/_orch/inbox/OQ7.answer.md.
//
// Every memory here is a fixture this file builds: the memo CLI is stubbed at
// process.run (a plugin test has no processes), and no test reads or writes a
// real memory store (Q-85: the operator marks the old records himself).
import { expect, mock, test } from 'claude-code/testing'
import { decodeRecord, encodeRecord, fallbackMerge } from '../lib/memcore.mjs'

const ACTIVE = JSON.stringify({ run_id: 't', mode: 'BUILD', prime: true })

// Fixture notes: two short, plain run notes (no pattern of Q-78 in them).
const ALPHA = 'T114D fixture alpha: P2 parked on Q-3'
const BETA = 'T114D fixture beta: F114 waits on T114D'

// Fixture replies. Each bad one holds one pattern of the Q-78 list.
// Spec L432: 'A summary such as "The entries you pasted are truncated…" ... is rejected and redone.'
const BAD_PASTED = 'The entries you pasted are truncated, so only part can be merged: alpha parked'
// Q-78 pattern /\b(entries|input|text) (you|I) (pasted|provided|gave|received)\b/i
const BAD_PROVIDED = 'Here is a summary of the text you provided: alpha parked, beta waits'
// Q-78 pattern /\btruncat|cut off|incomplete\b/i, said of the entries
const BAD_CUT = 'Entries #0-1 were cut off mid-line; alpha parked, beta waits'
// Q-78 pattern /\bI (cannot|can't|am unable)\b/i
const BAD_CANNOT = 'I cannot merge these two lines into one line'
// A reply that holds none of the Q-78 patterns.
const GOOD = 'P2 parked on Q-3; F114 waits on T114D'

type Call = { argv: string[]; stdin?: string }

/**
 * A run with one ready L1 merge over two fixture notes. The model answers the
 * replies in order (the last one repeats). `stored` is what the stubbed memo
 * CLI keeps as summaries, keyed `level:index`: a `merge --summarize` stores the
 * summaries on stdin; a bare `merge` stores memo's own deterministic fallback.
 */
function world(on: any, replies: string[], texts: string[] = [ALPHA, BETA]) {
  const calls: Call[] = []
  const models: any[] = []
  const stored = new Map<string, string>()
  const item = { level: 1, index: 0, lo: 0, hi: 1, ready: true, texts }
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
    const text = replies[Math.min(models.length, replies.length - 1)]
    models.push(e)
    return { value: { isAnswered: true, text, usage: {} } }
  })
  on('process.run', (_$: any, e: any) => {
    const argv = [...e.argv]
    const stdin = e.init?.stdin
    calls.push({ argv, stdin })
    const cmd = argv.find((a: string) => ['note', 'wake', 'zoom', 'recall', 'pending', 'merge', 'stats'].includes(a))
    let stdout = ''
    if (cmd === 'note') {
      const index = notes++
      const merges = index % 2 === 1 ? [{ level: 1, index: (index - 1) / 2 }] : []
      stdout = JSON.stringify({ index, text: stdin ?? '', truncated: false, merges })
    } else if (cmd === 'pending') {
      const open = !stored.has('1:0')
      stdout = JSON.stringify(open && !pendingServed ? [item] : [])
      pendingServed = true
    } else if (cmd === 'merge') {
      let merged = 0
      if (argv.includes('--summarize')) {
        for (const line of String(stdin ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
          try {
            const j = JSON.parse(line)
            if (j && Number.isInteger(j.level) && Number.isInteger(j.index) && String(j.summary ?? '')) {
              stored.set(`${j.level}:${j.index}`, String(j.summary))
              merged++
            }
          } catch {
            if (!stored.has('1:0')) {
              stored.set('1:0', line)
              merged++
            }
          }
        }
      } else if (!stored.has('1:0')) {
        stored.set('1:0', fallbackMerge(texts))
        merged++
      }
      stdout = JSON.stringify({ merged, pending: stored.has('1:0') ? 0 : 1 })
    } else stdout = cmd + ' output'
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('tool.call', () => ({ result: 'ran' }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return { calls, models, stored }
}

/** Write the two fixture notes (the second completes block L1#0) and let the background merge run. */
async function noteTwoAndMerge($: any, clock: any) {
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: ALPHA } as any)
  await $.tool.call({ tool: 'mcp__baton__memory_note', text: BETA } as any)
  for (let i = 0; i < 5; i++) {
    await clock.advance(50)
    await clock.settle()
  }
}

/** The full text a model call was given: its system prompt and its prompt. */
const asked = (m: any) => String(m.system ?? '') + '\n' + String(m.prompt ?? '')

/** The model calls that ask for the summary of the fixture range (they carry both entries). */
const askedForRange = (models: any[]) => models.filter((m) => asked(m).includes(ALPHA) && asked(m).includes(BETA))

// ---------------------------------------------------------------- Q-78: rejected replies

// R-C15-23 (L431): "The summarizer does not store commentary about its own input."
// Spec L431-433: 'A summary such as "The entries you pasted are truncated…" ... is rejected and redone.'
test('a reply that comments on its own input ("The entries you pasted are truncated…") is not stored as a summary', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_PASTED, GOOD])
  await noteTwoAndMerge($, clock)
  // expected: a summary of L1#0 is stored (Q-78.answer.md: a rejection is redone or falls back, never left empty)
  expect(w.stored.has('1:0')).toBe(true)
  // expected: the rejected reply is not the summary of L1#0 (spec L432 "is rejected")
  expect(w.stored.get('1:0') ?? '').not.toContain('The entries you pasted are truncated')
})

// R-C15-24 (L432): "and redone."
// Spec L431-433: '... is rejected and redone.'
test('after a rejected reply the summary of the same range is asked for again', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_PASTED, GOOD])
  await noteTwoAndMerge($, clock)
  // expected: at least two asks for the range of notes #0-1 (spec L432 "redone"; Q-78 "retried once")
  expect(askedForRange(w.models).length).toBeGreaterThanOrEqual(2)
})

// R-C15-127, R-C15-128 (L518): "The fixed pattern list holds at least
// `/\b(entries|input|text) (you|I) (pasted|provided|gave|received)\b/i`"
test('a reply containing "the text you provided" is not stored as a summary', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_PROVIDED, GOOD])
  await noteTwoAndMerge($, clock)
  // expected: a summary of L1#0 is stored (Q-78.answer.md: a rejection is redone or falls back, never left empty)
  expect(w.stored.has('1:0')).toBe(true)
  // expected: no stored summary holds the phrase (Q-78.answer.md, first pattern; spec L518-519)
  expect(w.stored.get('1:0') ?? '').not.toMatch(/the text you provided/i)
})

// R-C15-129 (L520): "`/\btruncat|cut off|incomplete\b/i` (said of the entries)"
test('a reply saying the entries were "cut off" is not stored as a summary', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_CUT, GOOD])
  await noteTwoAndMerge($, clock)
  // expected: a summary of L1#0 is stored (Q-78.answer.md: a rejection is redone or falls back, never left empty)
  expect(w.stored.has('1:0')).toBe(true)
  // expected: no stored summary holds "cut off" (Q-78.answer.md, second pattern; spec L520)
  expect(w.stored.get('1:0') ?? '').not.toMatch(/cut off/i)
})

// R-C15-130 (L520): "and `/\bI (cannot|can't|am unable)\b/i`."
test('a reply containing "I cannot" is not stored as a summary', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_CANNOT, GOOD])
  await noteTwoAndMerge($, clock)
  // expected: a summary of L1#0 is stored (Q-78.answer.md: a rejection is redone or falls back, never left empty)
  expect(w.stored.has('1:0')).toBe(true)
  // expected: no stored summary holds "I cannot" (Q-78.answer.md, third pattern; spec L520)
  expect(w.stored.get('1:0') ?? '').not.toMatch(/\bI cannot\b/)
})

// R-C15-131, R-C15-132 (L521): "A rejected reply is retried once" "with a stricter prompt."
test('the retry after a rejected reply is asked with a prompt that differs from the first', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_PASTED, GOOD])
  await noteTwoAndMerge($, clock)
  // expected: two different prompts (system + prompt) were sent for the range —
  // the first and the stricter retry (spec L521 "with a stricter prompt"; Q-78.answer.md)
  expect(new Set(askedForRange(w.models).map(asked)).size).toBe(2)
})

// R-C15-133 (L521): "A second rejection stores `fallbackMerge` of the inputs."
test('when the retry is rejected too, the stored summary is fallbackMerge of the inputs', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_PASTED, BAD_CANNOT])
  await noteTwoAndMerge($, clock)
  // expected: fallbackMerge of the two fixture inputs, the function Q-78.answer.md names
  // ("a second rejection stores `fallbackMerge` of the inputs"; spec L521-522)
  expect(w.stored.get('1:0')).toBe(fallbackMerge([ALPHA, BETA]))
})

// R-C15-131 (L521): "A rejected reply is retried once"
test('when the retry is rejected too, the summarizer is asked exactly twice for the range', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on, [BAD_PASTED, BAD_CANNOT])
  await noteTwoAndMerge($, clock)
  // expected: 2 = the first ask plus one retry (Q-78.answer.md "retried once")
  expect(askedForRange(w.models).length).toBe(2)
})

// ---------------------------------------------------------------- Q-79: the cut (guards)

// A note of exactly n ASCII bytes, distinct at both ends, with no Q-78 pattern in it.
function noteOf(n: number, head: string, tail: string): string {
  const fill = n - head.length - tail.length
  return head + 'x'.repeat(fill) + tail
}

// R-C15-25 (L434): "Whatever truncates the summarizer's input is fixed."
// R-C15-139 (L526): "Any cut in the merge path itself is removed."
// Q-79.answer.md: "any cut in the merge path itself is removed"; guard per OQ7.answer.md
// (the merge prompt joins both children whole at da5910c: work/guard-evidence.md).
test('guard: the summarizer input for an L1 summary over two notes of at most 280 bytes holds both notes whole', async ($, on) => {
  const clock = mock.clock(on)
  // 280 = the note limit (Q-79.answer.md "The 280-byte note limit stays"; spec L524)
  const a = noteOf(280, 'GUARD-A-START ', ' GUARD-A-END')
  const b = noteOf(280, 'GUARD-B-START ', ' GUARD-B-END')
  // the inputs as the store keeps them: each note through its record and back
  const stored = [a, b].map((t) => decodeRecord(encodeRecord({ text: t, tag: 'prime', ts: 0 }))!.text)
  const w = world(on, [GOOD], stored)
  await noteTwoAndMerge($, clock)
  // expected: the summarizer was asked at least once (spec L431 "The summarizer", the model merge of Q-79's merge path)
  expect(w.models.length).toBeGreaterThanOrEqual(1)
  // expected: each fixture note appears whole in the first ask (Q-79.answer.md; spec L526-527)
  expect(asked(w.models[0])).toContain(a)
  expect(asked(w.models[0])).toContain(b)
})

// R-C15-136 (L524): "The 280-byte note limit stays."
// Q-79.answer.md: "The 280-byte note limit stays."; guard per OQ7.answer.md.
test('guard: a note longer than 280 bytes is stored cut to 280 bytes', () => {
  const long = noteOf(400, 'LONG-NOTE-START ', ' LONG-NOTE-END')
  const kept = decodeRecord(encodeRecord({ text: long, tag: 'prime', ts: 0 }))!.text
  const bytes = new TextEncoder().encode(kept).length
  // expected: at most 280 bytes (Q-79.answer.md "The 280-byte note limit stays")
  expect(bytes).toBeLessThanOrEqual(280)
  // expected: cut, not dropped — more than half the limit kept, and it begins as the note began
  // (spec L524 "The 280-byte note limit stays": the note is cut to the limit, not refused)
  expect(bytes).toBeGreaterThan(140)
  expect(kept.startsWith('LONG-NOTE-START xxxx')).toBe(true)
})
