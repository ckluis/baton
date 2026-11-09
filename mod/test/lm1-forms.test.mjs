// node --test — LM1 criterion 1, red 2 (run build-20261019T125436Z, phase P7): the layout's forms, in their
// documented order. The strip says the layout and the command that switches it in the richest of these forms that its
// two lines hold; narrower, the next; never none (from 45 columns; below that, _orch/nodes/LM1/work/conflicts.md):
//   1. `strip layout · /baton layout panel switches`
//   2. `strip · /baton layout panel`
//   3. `layout: /baton layout`
//   4. `/baton layout` (what it prints says the layout and how to switch)
// and the same for the panel, with `strip` and `panel` the other way round.
import assert from 'node:assert/strict'
import test from 'node:test'
import { cellWidth, layoutForms } from '../lib/view.mjs'

test('LM1 red 2: the strip layout\'s forms, richest first, each shorter than the one before', () => {
  const f = layoutForms('strip')
  assert.deepEqual(f, ['strip layout · /baton layout panel switches', 'strip · /baton layout panel', 'layout: /baton layout', '/baton layout'])
  for (let i = 1; i < f.length; i++) assert.ok(cellWidth(f[i]) < cellWidth(f[i - 1]), f[i])
})

test('LM1 red 2: the panel layout\'s forms, richest first', () => {
  assert.deepEqual(layoutForms('panel'), ['panel layout · /baton layout strip switches', 'panel · /baton layout strip', 'layout: /baton layout', '/baton layout'])
})

test('LM1 red 2: a value that is no layout gets the default layout\'s forms', () => {
  assert.deepEqual(layoutForms('sideways'), layoutForms('strip'))
})
