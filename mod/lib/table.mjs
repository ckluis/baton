// baton v7 agent table: the Agents tab as a table, one row per agent. Pure.
//
//   agent | context | trend | budget | model | input | cache write | cache read | output | cost tokens | cost tokens | steps | state
//                                                                                   this agent    roll-up
//
// Output tokens are never cached; caching is on the input side only, so the
// token columns are fresh input, cache writes (the prefix being cached), cache
// reads (served from cache at about a tenth of the price) and output.
// Columns are dropped in DROP_ORDER when the pane is narrow. Two column groups (T10 amendment, Q-57,
// D-T10-group-cells, D-T10R-group-columns): `this agent` (the existing cost column and the row's own
// tokens, the sum of its token kinds) and `roll-up` (the cost and tokens of the row's subtree, the row
// itself included); neither group drops, and an empty cell draws nothing.
// The pane lays the table out with `fit` (fitDrawn, FX3): what it draws fits the pane body, since the
// terminal shrinks every cell of a wider row to a `…`; the agent label alone is cut, in the drawing only.

import { shortTokens } from './ledger.mjs'

export const COLUMNS = [
  { id: 'agent', title: 'agent', w: 28 },
  { id: 'ctx', title: 'context', w: 7, right: true },
  { id: 'trend', title: 'trend', w: 8 },
  { id: 'budget', title: 'budget', w: 6, right: true },
  { id: 'model', title: 'model', w: 7 },
  { id: 'input', title: 'input', w: 6, right: true },
  { id: 'cacheWrite', title: 'c.write', w: 7, right: true },
  { id: 'cacheRead', title: 'c.read', w: 7, right: true },
  { id: 'output', title: 'output', w: 6, right: true },
  { id: 'cost', title: 'cost', w: 7, right: true, group: 'this agent', gap: 1 },
  { id: 'tokens', title: 'tokens', w: 6, right: true, group: 'this agent' },
  { id: 'rollCost', title: 'cost', w: 7, right: true, group: 'roll-up', gap: 1 },
  { id: 'rollTokens', title: 'tokens', w: 6, right: true, group: 'roll-up' },
  { id: 'steps', title: 'steps', w: 11 },
  { id: 'state', title: 'state', w: 18 },
]

// What goes first when the pane is too narrow for everything (Q-11, amended by Q-57 / D-T10-group-cells).
// Agent, model, both column groups, steps and state never drop; when even those do not fit, the agent
// label is cut first, then state (Q-11).
export const DROP_ORDER = ['cacheWrite', 'trend', 'input', 'budget', 'output', 'cacheRead', 'ctx']

const GAP = 2
// A group's two cells sit one space apart, so the groups read as pairs (and a 116-column pane keeps context).
const gapOf = (c) => c.gap ?? GAP
// The model column sizes to its widest value, never under 10 (Q-10: `sonnet 5.5`).
export const MODEL_MIN = 10
const CUT_MIN = { agent: 4, state: 4 }
// Given the widest label, the agent column sizes to it, from 16 to 40 (the tree's levels make some
// labels longer, and the two column groups need the room a short label leaves); 28 when not given.
const AGENT_MIN = 16
const AGENT_MAX = 40
const sized = (c, modelW, agentW) => (c.id === 'model' ? Math.max(MODEL_MIN, modelW) : c.id === 'agent' && agentW > 0 ? Math.min(AGENT_MAX, Math.max(AGENT_MIN, agentW)) : c.w)

/** The columns that fit `width`, the model column `modelW` wide (at least MODEL_MIN), the agent column `agentW` (16 to 40; 28 when 0). */
export function fitColumns(width, modelW = MODEL_MIN, agentW = 0) {
  let cols = COLUMNS.map((c) => ({ ...c, w: sized(c, modelW, agentW) }))
  const total = () => cols.reduce((n, c) => n + c.w + gapOf(c), 0)
  for (const id of DROP_ORDER) {
    if (total() <= width) break
    cols = cols.filter((c) => c.id !== id)
  }
  for (const id of ['agent', 'state']) {
    const over = total() - width
    if (over <= 0) break
    const c = cols.find((x) => x.id === id)
    c.w = Math.max(CUT_MIN[id], c.w - over)
  }
  return cols
}

/**
 * The columns a pane draws `width` cells wide (FX3, decision P4-FX3-d1): the terminal shrinks every cell of a
 * row wider than its pane, each to a `…`, so the table is fitted to the width itself. The droppable columns
 * drop in DROP_ORDER as fitColumns drops them; then the never-dropped columns of fixed width (both groups'
 * cells and the steps) narrow to their widest value (never under their title); then the agent label is cut in
 * the drawing (`dw`, its drawn width), never into its indent and mark (`need.agentMin`); then state (Q-11).
 * The label stays whole in the table's text (`w`, D-F110: a row is told by its whole label): only the drawn
 * cell is narrower. `need` holds the widest value of each column. Still too wide, a row takes two lines
 * (`breakAt`, below, P4-FX3-d2); a pane narrower than even that draws the rest past its edge, as D-F110 has it.
 * Widths count the gaps between columns only, as a row draws them.
 */
export function fitDrawn(width, modelW = MODEL_MIN, agentW = 0, need = {}) {
  let cols = COLUMNS.map((c) => ({ ...c, w: sized(c, modelW, agentW) }))
  for (const c of cols) c.dw = c.w
  const total = () => cols.reduce((n, c, i) => n + c.dw + (i < cols.length - 1 ? gapOf(c) : 0), 0)
  for (const id of DROP_ORDER) {
    if (total() <= width) break
    cols = cols.filter((c) => c.id !== id)
  }
  if (total() > width) {
    for (const c of cols) if (['cost', 'tokens', 'rollCost', 'rollTokens', 'steps', 'state'].includes(c.id)) c.w = c.dw = Math.min(c.w, Math.max(c.title.length, need[c.id] ?? 0))
  }
  const floor = { agent: Math.max(CUT_MIN.agent, need.agentMin ?? 0), state: CUT_MIN.state }
  for (const id of ['agent', 'state']) {
    const over = total() - width
    if (over <= 0) break
    const c = cols.find((x) => x.id === id)
    c.dw = Math.max(Math.min(c.dw, floor[id]), c.dw - over)
    if (id === 'state') c.w = c.dw
  }
  if (total() > width) {
    // Still too wide (a 73-column dock under a deep tree with effort-marked models, FX3 attempt 3, P4-FX3-d2): a row
    // takes two lines so no cell is cut. The first line holds the label, the model and both groups, the second the
    // steps and state, set under the model column (`breakAt` steps); narrower still, the first line holds the label
    // and the model and the second the groups, steps and state, set under the label (`breakAt` cost). The label gets
    // back what the first line leaves; state is whole again where the second line has room, else cut (Q-11).
    const agent = cols.find((c) => c.id === 'agent')
    const state = cols.find((c) => c.id === 'state')
    const stateW = Math.max(state.title.length, Math.min(COLUMNS.find((c) => c.id === 'state').w, need.state ?? 0))
    const span = (cs) => cs.reduce((n, c, i) => n + c.dw + (i < cs.length - 1 ? gapOf(c) : 0), 0)
    const keep = { agent: agent.dw, state: state.dw }
    for (const id of ['steps', 'cost']) {
      const at = cols.findIndex((c) => c.id === id)
      if (at <= 0) continue
      const first = cols.slice(0, at)
      agent.dw = keep.agent
      if (span(first) > width) continue
      agent.dw = Math.min(agent.w, agent.dw + (width - span(first)))
      const lead2 = id === 'steps' ? agent.dw + gapOf(agent) : 0 // where the second line starts, past the row's own lead
      const second = cols.slice(at)
      state.dw = stateW
      const over = lead2 + span(second) - width
      if (over > 0) state.dw = Math.max(CUT_MIN.state, state.dw - over)
      if (lead2 + span(second) > width) continue
      state.w = state.dw
      cols.breakAt = id
      cols.lead2 = lead2
      break
    }
    if (cols.breakAt) cols.breaks = new Map([[cols.breakAt, cols.lead2]])
    else {
      agent.dw = keep.agent
      state.dw = state.w = keep.state
      stackRows(cols, width, stateW, floor.agent, span)
    }
  }
  return cols
}

/**
 * Narrower than any two-line row (a dock under about 60 columns, PW1): a row takes three lines, the label and the
 * model, then both column groups, then the steps and state; narrower again, four, the model on a line of its own.
 * Every line after the first starts under the label (`breaks`: the column each line starts at, and its pad). Nothing
 * drops here (Q-11, D-T10-group-cells, the operator's ruling that an agent always shows its model and effort): the
 * label is cut first, then state; a pane narrower than even four lines draws past its edge, as D-F110 has it.
 */
function stackRows(cols, width, stateW, agentFloor, span) {
  const at = (id) => cols.findIndex((c) => c.id === id)
  const [agent, model, steps, state] = ['agent', 'model', 'steps', 'state'].map((id) => cols[at(id)])
  if (at('model') !== 1 || at('cost') !== 2 || !steps || !state) return // only the never-dropped columns are left
  if (span(cols.slice(at('cost'), at('steps'))) > width) return
  const lastW = Math.min(stateW, width - steps.dw - gapOf(steps))
  if (lastW < CUT_MIN.state) return
  for (const four of [false, true]) {
    const room = four ? width : width - gapOf(agent) - model.dw
    if (four && model.dw > width) return
    if (Math.min(agent.w, room) < agentFloor) continue
    agent.dw = Math.min(agent.w, room)
    state.dw = state.w = lastW
    cols.breakAt = 'cost'
    cols.lead2 = 0
    cols.breaks = new Map([...(four ? [['model', 0]] : []), ['cost', 0], ['steps', 0]])
    return
  }
}

/**
 * A cell whose drawn width is under its text width (the agent cell of a fitted table): one segment holding the
 * cell's whole text, with `drawn`, the cells it is drawn in (the pane draws what is past them zero cells wide,
 * lib's caller register.js segEl); then its gap, or (`head`, a header cell) the gap inside the segment.
 */
function drawnCell(text, tone, c, last, head = false) {
  const gap = last ? '' : ' '.repeat(gapOf(c))
  if (head) return [{ text: text + gap, tone, drawn: c.dw + gap.length, head: true }]
  return [{ text, tone, drawn: c.dw }, ...(gap ? [{ text: gap, tone: undefined }] : [])]
}


const pad = (s, w, right) => {
  const t = String(s ?? '')
  const len = [...t].length
  if (len > w) return [...t].slice(0, Math.max(0, w - 1)).join('') + '…'
  return right ? ' '.repeat(w - len) + t : t + ' '.repeat(w - len)
}

/** Token components summed over an account's models. */
export function components(acc) {
  const out = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }
  for (const k of Object.values((acc && acc.byModel) || {})) {
    out.input += k.input
    out.cacheWrite += k.cacheWrite
    out.cacheRead += k.cacheRead
    out.output += k.output
  }
  return out
}

/** The sum of a component set: every token kind. */
export const tokensIn = (k) => k.input + k.cacheWrite + k.cacheRead + k.output

/** Several accounts as one (byModel summed, stepped tokens too), for a roll-up's tokens and its price. */
export function sumAccounts(accs) {
  const out = { byModel: {} }
  const add = (into, k) => {
    for (const f of ['input', 'output', 'cacheWrite', 'cacheRead']) into[f] = (into[f] || 0) + (Number(k[f]) || 0)
  }
  for (const a of accs) {
    for (const [m, k] of Object.entries((a && a.byModel) || {})) {
      const into = (out.byModel[m] ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })
      add(into, k)
      if (k.stepped) add((into.stepped ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }), k.stepped)
    }
  }
  return out
}

/** The model cell's parts: a configured-only effort's closing mark (`cfg`) is drawn dim, apart from the rest (C8E). */
function modelParts(r) {
  const text = String(r.model || '')
  const mark = r.modelMark || ''
  if (!mark || !text.endsWith(mark)) return [{ text, tone: r.modelTone }]
  return [{ text: text.slice(0, -mark.length), tone: r.modelTone }, { text: mark, tone: 'rail' }]
}

/**
 * rows: [{ label, tone, ctxPct, ctxTone, threshold, model, modelTone, modelMark, acc, cost, roll, rollCost, steps: [{ text, tone }], state, stateTone, noContext }]
 * `acc` is the row's own account (its `this agent` cells), `roll` its subtree's (the `roll-up` cells,
 * left empty when absent); `noContext` leaves the context cell empty rather than `—` (a phase or node row).
 * Returns { header: [{ text, tone }], lines: [[{ text, tone }]] }; tones are the stepper's
 * (done | current | flagged | future | rail) or a color name, or undefined.
 */
export function agentTable(rows, width = 140, opts = {}) {
  const widest = (f) => Math.max(0, ...rows.map((r) => [...String(f(r) || '')].length))
  // opts.fit (the pane, FX3): the table is laid out to draw within `width` cells (fitDrawn); a segment with
  // `drawn` is drawn in that many cells (drawnCell), one with `hidden` in none (groupLine).
  const need = () => ({
    cost: widest((r) => r.cost),
    tokens: widest((r) => (r.acc ? shortTokens(tokensIn(components(r.acc))) : '')),
    rollCost: widest((r) => (r.roll ? r.rollCost : '')),
    rollTokens: widest((r) => (r.roll ? shortTokens(tokensIn(components(r.roll))) : '')),
    steps: widest((r) => (r.steps || []).map((p) => p.text).join('')),
    state: widest((r) => r.state),
    // a label is cut after its indent, its mark and two more cells; the first row's (the pane's: the main
    // session's `◆ prime` or `session`, T8 L114-115) is never cut
    agentMin: Math.max(widest((r) => (/^\s*\S\s?/.exec(String(r.label || '')) || [''])[0]) + 2, rows[0] ? [...String(rows[0].label || '').trimEnd()].length : 0),
  })
  const cols = opts.fit ? fitDrawn(width, widest((r) => r.model), widest((r) => r.label), need()) : fitColumns(width, widest((r) => r.model), widest((r) => r.label))
  const narrowed = (c) => c.dw != null && c.dw < c.w
  // A two-line table (fitDrawn's `wrap`): before the steps, a line break (`brk`, the row's full width, opts.rowWidth)
  // and a pad that sets the second line under the model column (opts.lead: the cells a row draws before its table).
  const wrap = !!cols.breakAt
  const breaks = (c) => wrap && !!cols.breaks && cols.breaks.has(c.id)
  const lastOf = (i) => i === cols.length - 1 || breaks(cols[i + 1])
  const breakSegs = (c) => [{ text: '', brk: opts.rowWidth ?? width }, { text: ' '.repeat((opts.lead ?? 0) + cols.breaks.get(c.id)), tone: undefined }]
  const header = []
  cols.forEach((c, i) => {
    if (breaks(c)) header.push(...breakSegs(c))
    if (narrowed(c)) header.push(...drawnCell(pad(c.title, c.w, c.right), 'rail', c, lastOf(i), true))
    else header.push({ text: pad(c.title, c.w, c.right) + (!lastOf(i) ? ' '.repeat(gapOf(c)) : ''), tone: 'rail' })
  })
  const lines = rows.map((r) => {
    const k = components(r.acc)
    const cells = {
      agent: [{ text: r.label, tone: r.tone }],
      ctx: [{ text: r.ctxPct == null ? (r.noContext ? '' : '—') : r.ctxPct + '%', tone: r.ctxTone }],
      trend: [{ text: sparkline(r.ctxHist || []), tone: r.ctxTone }],
      budget: [{ text: r.threshold == null ? '' : r.threshold + '%', tone: 'rail' }],
      model: modelParts(r),
      input: [{ text: r.acc ? shortTokens(k.input) : '', tone: undefined }],
      cacheWrite: [{ text: r.acc ? shortTokens(k.cacheWrite) : '', tone: 'rail' }],
      cacheRead: [{ text: r.acc ? shortTokens(k.cacheRead) : '', tone: 'rail' }],
      output: [{ text: r.acc ? shortTokens(k.output) : '', tone: undefined }],
      cost: [{ text: r.cost || '', tone: undefined }],
      tokens: [{ text: r.acc ? shortTokens(tokensIn(k)) : '', tone: undefined }],
      rollCost: [{ text: r.roll ? r.rollCost || '' : '', tone: undefined }],
      rollTokens: [{ text: r.roll ? shortTokens(tokensIn(components(r.roll))) : '', tone: undefined }],
      steps: r.steps || [],
      state: [{ text: r.state || '', tone: r.stateTone }],
    }
    const segs = []
    cols.forEach((c, i) => {
      if (breaks(c)) segs.push(...breakSegs(c))
      const parts = cells[c.id]
      const visible = parts.map((p) => p.text).join('')
      const padded = pad(visible, c.w, c.right)
      if (parts.length === 1 && narrowed(c)) return segs.push(...drawnCell(padded, parts[0].tone, c, lastOf(i)))
      if (parts.length === 1) segs.push({ text: padded, tone: parts[0].tone })
      else {
        // a multi-part cell (the steps): keep each part's tone, pad after the last
        let used = 0
        for (const p of parts) {
          const room = c.w - used
          if (room <= 0) break
          const t = [...p.text].slice(0, room).join('')
          segs.push({ text: t, tone: p.tone })
          used += [...t].length
        }
        if (used < c.w) segs.push({ text: ' '.repeat(c.w - used), tone: undefined })
      }
      if (!lastOf(i)) segs.push({ text: ' '.repeat(gapOf(c)), tone: undefined })
    })
    return segs
  })
  // rowLines: the lines a row takes (one, or two to four when it is stacked, P4-FX3-d2 and PW1)
  return { header, groups: groupLine(cols, opts.lead ?? 0), lines, cols: cols.map((c) => c.id), wrap, rowLines: wrap ? cols.breaks.size + 1 : 1 }
}

/** The group line above the column names: each group's label at the start of its first cell (D-T10R-group-columns). */
function groupLine(cols, lead = 0) {
  const segs = []
  let at = 0
  let used = 0
  let last = null
  // what a narrowed column (fitDrawn) leaves undrawn before a label: hidden, so the label is drawn over its cells
  let hide = 0
  for (const c of cols) {
    if (c.group && c.group !== last && cols.breakAt === 'cost' && !used) {
      // the groups start the second line, `lead` cells in (the group line itself is drawn two cells in, register.js)
      const drawnAt = Math.max(0, lead - 2)
      if (drawnAt) segs.push({ text: ' '.repeat(drawnAt), tone: undefined })
      if (at > drawnAt) segs.push({ text: ' '.repeat(at - drawnAt), tone: undefined, hidden: true })
      segs.push({ text: c.group, tone: 'rail' })
      used = at + c.group.length
      last = c.group
      at += c.w + gapOf(c)
      hide = 0
      continue
    }
    if (c.group && c.group !== last) {
      if (at - hide > used) segs.push({ text: ' '.repeat(at - hide - used), tone: undefined })
      if (hide) segs.push({ text: ' '.repeat(hide), tone: undefined, hidden: true })
      hide = 0
      segs.push({ text: c.group, tone: 'rail' })
      used = at + c.group.length
    }
    last = c.group || null
    at += c.w + gapOf(c)
    if (c.dw != null && c.dw < c.w) hide += c.w - c.dw
  }
  return segs
}

// ------------------------------------------------------------------ an agent's last tool calls (TC1)

// The agent view's `last tool calls` as a table: time, tool, target (what the call touched: a path, a command, a
// pattern) and result (ok, error or denied, with the size of what it answered). Each column is as wide as its widest
// value (the tool at most TOOL_MAX), two cells apart, as the agent and memory tables are; the target takes the room
// left and is cut at its end with `…` (`pad`). When the pane is too narrow for a target of TARGET_MIN cells, the
// lower-value cells give way in turn: the result's size, the time's seconds, the time itself; then the tool is cut.
// The tool and the target always show.
const CALL_LEAD = 2
const TOOL_MIN = 12 // the text form's tool column (-p, /baton show): at least this wide, as it was before the table
const TOOL_MAX = 16
const TARGET_MIN = 12

/** An answered call's result cell: its status, then its size where known (`ok 812`, `ok 14k`); `…` while in flight. */
const resultOf = (c, sized) => (c.status ? c.status + (sized && c.size != null && c.status === 'ok' ? ' ' + shortTokens(c.size) : '') : '…')

/**
 * calls: [{ tool, detail, at, status?, size? }] (agents.mjs addToolCall / noteOutcome), oldest first.
 * With `width`, the table is fitted to it and opens with a header row; without, it is the text form (-p, /baton show):
 * no header, nothing cut. Returns { header: [{ text, tone }] | null, lines: [[{ text, tone }]] }.
 */
export function callTable(calls, width = null) {
  const rows = (calls || []).map((c) => ({ c, time: new Date(c.at).toISOString().slice(11, 19), tool: String(c.tool ?? ''), target: String(c.detail ?? '') }))
  const widest = (f) => Math.max(0, ...rows.map((r) => [...f(r)].length))
  const answered = rows.some((r) => r.c.status)
  const toolW = widest((r) => r.tool)
  const lay = { time: 8, tool: Math.min(TOOL_MAX, Math.max(width != null ? 'tool'.length : TOOL_MIN, toolW)), sized: true }
  const resultW = () => (answered ? Math.max('result'.length, widest((r) => resultOf(r.c, lay.sized))) : 0)
  const fixed = () => CALL_LEAD + (lay.time ? lay.time + GAP : 0) + lay.tool + GAP + (answered ? GAP + resultW() : 0)
  if (width != null) {
    const steps = [() => (lay.sized = false), () => (lay.time = 5), () => (lay.time = 0)]
    for (const step of steps) {
      if (width - fixed() >= TARGET_MIN) break
      step()
    }
    const over = TARGET_MIN - (width - fixed())
    if (over > 0) lay.tool = Math.max('tool'.length, lay.tool - over)
  }
  const targetW = width != null ? Math.max(1, width - fixed()) : widest((r) => r.target)
  const resW = resultW()
  const cells = (time, tool, target, result) => [
    ...(lay.time ? [{ k: 'time', text: pad(time, lay.time) + ' '.repeat(GAP) }] : []),
    { k: 'tool', text: pad(tool, lay.tool) + ' '.repeat(GAP) },
    { k: 'target', text: answered ? pad(target, targetW) + ' '.repeat(GAP) : pad(target, targetW).trimEnd() },
    ...(answered ? [{ k: 'result', text: pad(result, resW) }] : []),
  ]
  const lead = (segs) => [{ text: ' '.repeat(CALL_LEAD) + segs[0].text, tone: segs[0].tone }, ...segs.slice(1)]
  const header = width != null ? lead(cells('time', 'tool', 'target', 'result').map((s) => ({ text: s.text, tone: 'rail' }))) : null
  const tones = { time: 'rail', tool: undefined, target: undefined }
  const lines = rows.map((r) => {
    const res = resultOf(r.c, lay.sized)
    const resTone = r.c.status === 'ok' ? 'green' : r.c.status ? 'red' : 'rail'
    return lead(cells(lay.time === 5 ? r.time.slice(0, 5) : r.time, r.tool, r.target, res).map((s) => ({ text: s.text, tone: s.k === 'result' ? resTone : tones[s.k] })))
  })
  return { header, lines }
}

const SPARK = '▁▂▃▄▅▆▇█'

/** A context-percent history as a sparkline, newest last (0–100 on a fixed scale). */
export function sparkline(values, width = 8) {
  const v = (values || []).slice(-width)
  return v.map((x) => SPARK[Math.max(0, Math.min(7, Math.floor((Number(x) || 0) / 12.5)))]).join('')
}

export const tableText = (t) => [t.header.map((x) => x.text).join('').trimEnd(), ...t.lines.map((l) => l.map((x) => x.text).join('').trimEnd())]
