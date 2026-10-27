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
 * The narrowest width at which every column that never drops fits whole, the agent label uncut: the
 * pane draws its table at least this wide (T10 amendment: neither group drops at a narrow width, and
 * a row stays readable by its label).
 */
export function tableFloor(modelW = MODEL_MIN, agentW = 0) {
  return COLUMNS.filter((c) => !DROP_ORDER.includes(c.id)).reduce((n, c) => n + sized(c, modelW, agentW) + gapOf(c), 0)
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
export function agentTable(rows, width = 140) {
  const widest = (f) => Math.max(0, ...rows.map((r) => [...String(f(r) || '')].length))
  const cols = fitColumns(width, widest((r) => r.model), widest((r) => r.label))
  const header = []
  cols.forEach((c, i) => header.push({ text: pad(c.title, c.w, c.right) + (i < cols.length - 1 ? ' '.repeat(gapOf(c)) : ''), tone: 'rail' }))
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
      const parts = cells[c.id]
      const visible = parts.map((p) => p.text).join('')
      const padded = pad(visible, c.w, c.right)
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
      if (i < cols.length - 1) segs.push({ text: ' '.repeat(gapOf(c)), tone: undefined })
    })
    return segs
  })
  return { header, groups: groupLine(cols), lines, cols: cols.map((c) => c.id) }
}

/** The group line above the column names: each group's label at the start of its first cell (D-T10R-group-columns). */
function groupLine(cols) {
  const segs = []
  let at = 0
  let used = 0
  let last = null
  for (const c of cols) {
    if (c.group && c.group !== last) {
      if (at > used) segs.push({ text: ' '.repeat(at - used), tone: undefined })
      segs.push({ text: c.group, tone: 'rail' })
      used = at + c.group.length
    }
    last = c.group || null
    at += c.w + gapOf(c)
  }
  return segs
}

const SPARK = '▁▂▃▄▅▆▇█'

/** A context-percent history as a sparkline, newest last (0–100 on a fixed scale). */
export function sparkline(values, width = 8) {
  const v = (values || []).slice(-width)
  return v.map((x) => SPARK[Math.max(0, Math.min(7, Math.floor((Number(x) || 0) / 12.5)))]).join('')
}

export const tableText = (t) => [t.header.map((x) => x.text).join('').trimEnd(), ...t.lines.map((l) => l.map((x) => x.text).join('').trimEnd())]
