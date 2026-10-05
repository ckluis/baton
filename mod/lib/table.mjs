// baton v7 agent table: the Agents tab as a table, one row per agent. Pure.
//
//   agent | context | budget | model | input | cache write | cache read | output | cost | steps | state
//
// Output tokens are never cached; caching is on the input side only, so the
// token columns are fresh input, cache writes (the prefix being cached), cache
// reads (served from cache at about a tenth of the price) and output.
// Columns are dropped from the right of DROP_ORDER when the pane is narrow.

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
  { id: 'cost', title: 'cost', w: 7, right: true },
  { id: 'steps', title: 'steps', w: 11 },
  { id: 'state', title: 'state', w: 18 },
]

// What goes first when the pane is too narrow for everything.
export const DROP_ORDER = ['cacheWrite', 'trend', 'input', 'budget', 'output', 'model', 'cacheRead', 'steps']

const GAP = 2

export function fitColumns(width) {
  let cols = COLUMNS.slice()
  const total = () => cols.reduce((n, c) => n + c.w + GAP, 0)
  for (const id of DROP_ORDER) {
    if (total() <= width) break
    cols = cols.filter((c) => c.id !== id)
  }
  return cols
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

/**
 * rows: [{ label, tone, ctxPct, ctxTone, threshold, model, acc, cost, steps: [{ text, tone }], state, stateTone }]
 * Returns { header: [{ text, tone }], lines: [[{ text, tone }]] }; tones are the stepper's
 * (done | current | flagged | future | rail) or a color name, or undefined.
 */
export function agentTable(rows, width = 140) {
  const cols = fitColumns(width)
  const header = []
  cols.forEach((c, i) => header.push({ text: pad(c.title, c.w, c.right) + (i < cols.length - 1 ? ' '.repeat(GAP) : ''), tone: 'rail' }))
  const lines = rows.map((r) => {
    const k = components(r.acc)
    const cells = {
      agent: [{ text: r.label, tone: r.tone }],
      ctx: [{ text: r.ctxPct == null ? '—' : r.ctxPct + '%', tone: r.ctxTone }],
      trend: [{ text: sparkline(r.ctxHist || []), tone: r.ctxTone }],
      budget: [{ text: r.threshold == null ? '' : r.threshold + '%', tone: 'rail' }],
      model: [{ text: r.model || '', tone: undefined }],
      input: [{ text: r.acc ? shortTokens(k.input) : '', tone: undefined }],
      cacheWrite: [{ text: r.acc ? shortTokens(k.cacheWrite) : '', tone: 'rail' }],
      cacheRead: [{ text: r.acc ? shortTokens(k.cacheRead) : '', tone: 'rail' }],
      output: [{ text: r.acc ? shortTokens(k.output) : '', tone: undefined }],
      cost: [{ text: r.cost || '', tone: undefined }],
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
      if (i < cols.length - 1) segs.push({ text: ' '.repeat(GAP), tone: undefined })
    })
    return segs
  })
  return { header, lines, cols: cols.map((c) => c.id) }
}

const SPARK = '▁▂▃▄▅▆▇█'

/** A context-percent history as a sparkline, newest last (0–100 on a fixed scale). */
export function sparkline(values, width = 8) {
  const v = (values || []).slice(-width)
  return v.map((x) => SPARK[Math.max(0, Math.min(7, Math.floor((Number(x) || 0) / 12.5)))]).join('')
}

export const tableText = (t) => [t.header.map((x) => x.text).join('').trimEnd(), ...t.lines.map((l) => l.map((x) => x.text).join('').trimEnd())]
