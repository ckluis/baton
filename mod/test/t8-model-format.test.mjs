// node --test — T8: show the exact model on every agent (the formatter and the agent table).
//
// Written from the spec (docs/designs/v7.6-tuning.md L104-125) and the operator's answers BEFORE the
// implementation (node T18, the red step of F18). Requirement ids are the rows of
// _orch/plan/traceability.yaml (cluster C8). Expected values come from the spec, the inbox answers
// (Q-10, Q-11, Q-57), the decided defaults in _orch/plan/decisions.md (Q-21, D-T10-group-cells,
// D-T18-1m-variant) and T18's work/model-ids.txt; none is copied from the implementation.
//
// The formatter is `shortModel` in mod/lib/agents.mjs, the function the spec names (L107: "Today
// `shortModel()` in `mod/lib/agents.mjs` cuts `claude-opus-5-5` to `opus`"). The table is
// `agentTable` in mod/lib/table.mjs, which the pane and the /baton text both draw with.
import assert from 'node:assert/strict'
import test from 'node:test'
import { shortModel } from '../lib/agents.mjs'
import { agentTable, tableText } from '../lib/table.mjs'

// Every current model ID and what the model column must show for it: T18 work/model-ids.txt, built from
// the Q-21 decided default (decisions.md: "The union of: every key of PRICES ... and WINDOWS ...; FRONTIER,
// CHEAP and MECH ..., before and after T3; claude-sonnet-5-5 and claude-haiku-5-5 (P3 pricing.md:23, :49);
// the dated claude-haiku-4-5-20251001; and a [1m] variant").
const CURRENT = [
  ['claude-opus-5-5', 'opus 5.5'], // model-ids.txt: ledger.mjs:48, binding.mjs:9; spec L111 "`opus 5.5`"
  ['claude-opus-5', 'opus 5'], // model-ids.txt: ledger.mjs:49 (PRICES); spec L111 "family and version"
  ['claude-fable-5-1', 'fable 5.1'], // model-ids.txt: ledger.mjs:50 (PRICES); spec L111 "family and version"
  ['claude-sonnet-5', 'sonnet 5'], // model-ids.txt: ledger.mjs:51 (PRICES); spec L111 "family and version"
  ['claude-haiku-4-5', 'haiku 4.5'], // model-ids.txt: ledger.mjs:52 (PRICES); spec L112 "`haiku 4.5`"
  ['claude-sonnet-5-5', 'sonnet 5.5'], // model-ids.txt: binding.mjs:10, P3 pricing.md:23; spec L112 "`sonnet 5.5`"
  ['claude-haiku-5-5', 'haiku 5.5'], // model-ids.txt: P3 pricing.md:49; spec L111 "family and version"
  ['claude-haiku-4-5-20251001', 'haiku 4.5'], // model-ids.txt: binding.mjs:12; spec L121-122 and L112 "`haiku 4.5`"
  ['claude-opus-5-5[1m]', 'opus 5.5'], // model-ids.txt: Q-21 "a `[1m]` variant"; decisions/D-T18-1m-variant.md
]
// Q-21: "The unknown case is a made-up id such as `claude-nova-9-9-20990101`, which is shown in full."
const UNKNOWN = 'claude-nova-9-9-20990101'
const GAP = 2 // harness fact, not an expected value: the two spaces after each header title (how the header is measured)
const len = (s) => [...String(s)].length

/** One agent row as the pane hands it to the table (the row shape documented at table.mjs agentTable). */
const row = (model, extra = {}) => ({
  label: '● worker T18 model',
  tone: 'cyan',
  ctxPct: 40,
  ctxHist: [10, 40],
  ctxTone: 'green',
  threshold: 50,
  model: shortModel(model) || '',
  acc: { byModel: { [model || 'x']: { input: 1200, output: 300, cacheWrite: 100, cacheRead: 9000 } } },
  cost: '$0.12',
  steps: [{ text: '●─◉─○', tone: 'current' }],
  state: 'now Bash',
  stateTone: 'current',
  ...extra,
})

/** The model column's width as drawn: its header cell, less the gap after it. */
function modelWidth(t) {
  const seg = t.header.find((x) => x.text.trim() === 'model')
  assert.ok(seg, 'the table has a model column') // spec L111: "The model column"
  return len(seg.text) - GAP
}

// The pane's narrowest table (register.js agentsBody draws at Math.max(60, cols - 4)) up to a very wide one.
const WIDTHS = []
for (let w = 400; w >= 60; w--) WIDTHS.push(w)

// ------------------------------------------------------------------ the formatter

// R-C8-01, R-C8-02, R-C8-10 · spec L111-112: "The model column shows the family and version of the model that
// **served** each agent: `opus 5.5`, `sonnet 5.5`, `haiku 4.5`. Never a bare family." · spec L121: "Formatter
// tests over every current ID," · Q-21 (decisions.md L254-260) names the list; T18 work/model-ids.txt holds it.
test('the model formatter shows family and version for every current model ID', () => {
  const shown = CURRENT.map(([id]) => [id, shortModel(id)])
  assert.deepEqual(shown, CURRENT) // expected: the second column of work/model-ids.txt (spec L111-112, Q-21)
})

// R-C8-11 · spec L121-122: "including dated ones like `claude-haiku-4-5-20251001`," · spec L109: "the `haiku`
// alias served `claude-haiku-4-5-20251001` for 405 turns ... and the pane would have said `haiku`."
test('the dated ID claude-haiku-4-5-20251001 is shown as haiku 4.5', () => {
  assert.equal(shortModel('claude-haiku-4-5-20251001'), 'haiku 4.5') // spec L112 "`haiku 4.5`"; Q-21 "the dated claude-haiku-4-5-20251001"
})

// ------------------------------------------------------------------ the model column's width

// R-C8-03 · spec L112: "Widen the column so it is never cut," · T18 done-criterion 6: no formatted value in
// work/model-ids.txt is cut by the model column's width.
test('no formatted value of a current model ID is cut by the model column', () => {
  for (const width of [400, 160, 120, 60]) {
    for (const [id, want] of CURRENT) {
      const [, line] = tableText(agentTable([row(id)], width))
      assert.ok(line.includes(want), `${id} at width ${width}: the row shows "${want}" whole: ${JSON.stringify(line)}`) // want: work/model-ids.txt (spec L111-112)
    }
    const lines = tableText(agentTable(CURRENT.map(([id]) => row(id)), width)).slice(1)
    CURRENT.forEach(([id, want], i) => assert.ok(lines[i].includes(want), `${id} among all IDs at width ${width}: "${want}" whole: ${JSON.stringify(lines[i])}`)) // want: work/model-ids.txt
  }
})

// R-C8-03 · Q-10 (inbox/Q-10.answer.md): "A: the model column sizes to its widest value, minimum 10." · Q-10 option 1:
// "Size the column to the widest value among the shown rows (at least 10, for `sonnet 5.5`), so neither a known nor
// an unknown id is ever cut".
test('the model column is as wide as the widest formatted model among the shown rows', () => {
  const wide = agentTable([row('claude-opus-5-5'), row(UNKNOWN)], 400)
  assert.equal(modelWidth(wide), len(UNKNOWN)) // Q-10 "sizes to its widest value": the unknown id, shown in full (Q-21), is the widest
  const mid = agentTable([row('claude-opus-5-5'), row('claude-nova-9-9')], 400)
  assert.equal(modelWidth(mid), len('claude-nova-9-9')) // Q-10 "sizes to its widest value": a 15-character unknown id (fixture, Q-21 shape)
  const known = agentTable([row('claude-haiku-4-5-20251001'), row('claude-sonnet-5-5'), row('claude-opus-5')], 400)
  assert.equal(modelWidth(known), len('sonnet 5.5')) // Q-10 option 1: "at least 10, for `sonnet 5.5`" (10 characters, the widest here)
})

// R-C8-03 · Q-10 (inbox/Q-10.answer.md): "A: the model column sizes to its widest value, minimum 10."
test('the model column is never narrower than 10 characters', () => {
  for (const width of [400, 140, 60]) {
    assert.equal(modelWidth(agentTable([row('claude-opus-5')], width)), 10) // Q-10 "minimum 10": `opus 5` (6, work/model-ids.txt) is narrower
    assert.equal(modelWidth(agentTable([row('claude-opus-5-5')], width)), 10) // Q-10 "minimum 10": `opus 5.5` (8, spec L111) is narrower
    assert.equal(modelWidth(agentTable([row(null, { model: '' })], width)), 10) // Q-10 "minimum 10": no model at all
    assert.ok(modelWidth(agentTable([row(UNKNOWN)], width)) >= 10) // Q-10 "minimum 10"
  }
})

// ------------------------------------------------------------------ the narrow-pane drop order

/** The columns in the order they leave the table as it narrows from 400 to 60 columns. */
function dropSequence(rows) {
  const seq = []
  let prev = agentTable(rows, WIDTHS[0]).cols
  for (const w of WIDTHS.slice(1)) {
    const cols = agentTable(rows, w).cols
    for (const id of prev) if (!cols.includes(id)) seq.push(id)
    prev = cols
  }
  return seq
}
// The context column is `ctx` in the table; Q-11 calls it `context` (its title). Harness naming, not an expected value.
const named = (id) => (id === 'ctx' ? 'context' : id)

// R-C8-04 · spec L112: "and keep it out of the narrow-pane drop order." · Q-11 (inbox/Q-11.answer.md): "A: model, steps,
// agent and state never drop." · Q-57 (inbox/Q-57.answer.md): the this-agent and roll-up groups "Per Q-11 these columns
// never drop"; D-T10-group-cells (decisions.md): "The this-agent cost cell is the existing cost column, so `cost` leaves
// the Q-11 drop order".
test('the model column never leaves the table, at any width from 400 down to 60, and neither does cost', () => {
  for (const rows of [[row('claude-opus-5-5')], [row(UNKNOWN)], CURRENT.map(([id]) => row(id))]) {
    for (const w of WIDTHS) {
      const cols = agentTable(rows, w).cols
      assert.ok(cols.includes('model'), `model is drawn at width ${w}: ${cols.join(',')}`) // spec L112 "keep it out of the narrow-pane drop order"; Q-11
      assert.ok(cols.includes('cost'), `cost is drawn at width ${w}: ${cols.join(',')}`) // Q-57 "these columns never drop"; D-T10-group-cells
    }
    assert.ok(!dropSequence(rows).includes('model')) // spec L112: model is not in the drop order
  }
})

// R-C8-04 · Q-11 (inbox/Q-11.answer.md) option 1 as answered: "Drop order becomes cacheWrite, trend, input, budget, output,
// cacheRead, context, cost." · amended by Q-57 (inbox/Q-57.answer.md: "Per Q-11 these columns never drop") as D-T10-group-cells
// records it: "`cost` leaves the Q-11 drop order, which becomes cacheWrite, trend, input, budget, output, cacheRead, context."
test('the narrow-pane drop order is exactly cacheWrite, trend, input, budget, output, cacheRead, context; cost never drops', () => {
  const seq = dropSequence([row('claude-opus-5-5'), row('claude-haiku-4-5-20251001')]).map(named)
  assert.deepEqual(seq, ['cacheWrite', 'trend', 'input', 'budget', 'output', 'cacheRead', 'context']) // D-T10-group-cells, from Q-11 and Q-57
  assert.ok(!seq.includes('cost')) // Q-57 "these columns never drop" (the this-agent cost cell, D-T10-group-cells)
  for (const w of WIDTHS) assert.ok(agentTable([row('claude-opus-5-5')], w).cols.includes('cost'), `cost is drawn at width ${w}`) // Q-57, read with Q-11
})

// R-C8-04 · Q-11 option 1 as answered (inbox/Q-11.answer.md; the option text in inbox/Q-11.md): "Model, steps, agent and
// state never drop; when even those do not fit, the agent label is cut first, then state."
test('when even model, steps, agent and state do not fit, the agent label is cut before state', () => {
  const LABEL = '● worker T18 an agent label far too long to fit any narrow pane' // fixture
  const STATE = 'now Bash' // fixture: the state text of a running agent
  const r = row('claude-opus-5-5', { label: LABEL, state: STATE })
  for (const w of WIDTHS) {
    // Q-11 "model ... agent and state never drop": the narrow layout keeps them, so cutting is the only way left to fit.
    const cols = agentTable([r], w).cols
    for (const id of ['agent', 'model', 'state']) assert.ok(cols.includes(id), `${id} is drawn at width ${w}: ${cols.join(',')}`) // Q-11 "never drop"
  }
  for (const w of WIDTHS) {
    const [, line] = tableText(agentTable([r], w))
    const seen = [...line].slice(0, w).join('') // what a pane of w columns shows of the row
    const stateCut = !seen.includes(STATE)
    const labelShown = seen.includes(LABEL.slice(0, 8)) // the label is not yet cut away
    assert.ok(!(stateCut && labelShown), `width ${w}: state is cut while the agent label still shows: ${JSON.stringify(seen)}`) // Q-11 "the agent label is cut first, then state"
  }
})
