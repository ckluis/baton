// node --test — lessons: from refuted verdict rows to the next agent's prompt.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areasOf, lessonBlock, lessonNote, lessonsFromVerdict, parseLessonNote, relevantLessons } from '../lib/lessons.mjs'

test('areas: the directories of path-like tokens, two segments deep, baton state ignored', () => {
  assert.deepEqual(areasOf('see src/export/csv.ts and src/export/header.ts; _orch/nodes/T5/work/red.txt; lib/util'), ['src/export', 'lib/util'])
  assert.deepEqual(areasOf('no paths here'), [])
})

test('a refuted row becomes a lesson with its areas; a confirmed one does not', () => {
  const v = { criteria: [
    { criterion: 'an empty export has a header row', verdict: 'REFUTED', probe: 'the red test in test/export/csv.test.ts passed against the unchanged code', evidence: ['src/export/csv.ts'] },
    { criterion: 'rows are quoted', verdict: 'CONFIRMED', probe: 'ran it' },
  ] }
  const ls = lessonsFromVerdict('T23', v, '')
  assert.equal(ls.length, 1)
  assert.deepEqual(ls[0].areas, ['test/export', 'src/export'])
  assert.match(ls[0].text, /^T23: "an empty export has a header row" was refuted — the red test/)
  const note = lessonNote(ls[0])
  assert.match(note, /^\[test\/export src\/export\] T23:/)
  assert.deepEqual(parseLessonNote(note).areas, ['test/export', 'src/export'])
})

test('relevance: an overlapping area or a named node; newest first; a block for the prompt', () => {
  const notes = [
    { text: '[src/export] T23: "empty export header" was refuted — passed pre-change' },
    { text: '[src/billing] T40: "rounding" was refuted — 0.005 rounds down' },
    { text: '[src/export/csv] T31: "quoting" was refuted — commas in names' },
  ]
  assert.deepEqual(relevantLessons(notes, 'Fix src/export/csv.ts so that …'), ['T31: "quoting" was refuted — commas in names', 'T23: "empty export header" was refuted — passed pre-change'])
  assert.deepEqual(relevantLessons(notes, 'Retry T40 with the packet'), ['T40: "rounding" was refuted — 0.005 rounds down'])
  assert.deepEqual(relevantLessons(notes, 'Write the README'), [])
  assert.match(lessonBlock(['a', 'b']), /lessons from earlier refutations[\s\S]*- a\n- b$/)
  assert.equal(lessonBlock([]), '')
})
