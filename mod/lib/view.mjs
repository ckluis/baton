// baton v7 interface helpers: pure text for the pane, the band and -p. No I/O.

/** A gauge bar: `▕████░░░░▏` with a tick where rotation fires. */
export function gaugeBar(percent, threshold, width = 24) {
  const w = Math.max(6, Math.floor(width))
  const p = Math.max(0, Math.min(100, Number(percent) || 0))
  const fill = Math.round((p / 100) * w)
  const tick = Math.min(w - 1, Math.max(0, Math.round((threshold / 100) * w)))
  let s = ''
  for (let i = 0; i < w; i++) s += i === tick && i >= fill ? '┊' : i < fill ? '█' : '░'
  return '▕' + s + '▏'
}

/** green, then yellow from 70% of the threshold, red at it. */
export function gaugeColor(percent, threshold) {
  if (typeof percent !== 'number') return undefined
  if (percent >= threshold) return 'red'
  if (percent >= threshold * 0.7) return 'yellow'
  return 'green'
}

/** The one-line band above the prompt. */
export function gaugeLine({ percent, threshold, rotations, notes, phase, width }) {
  const pct = typeof percent === 'number' ? percent + '%' : '—'
  const bar = gaugeBar(typeof percent === 'number' ? percent : 0, threshold, Math.min(24, Math.max(6, (width ?? 80) - 60)))
  return (
    'baton ' + bar + ' ' + pct + ' · rotate at ' + threshold + '% · rotations ' + rotations +
    (notes != null ? ' · ' + notes + ' notes' : '') + (phase ? ' · ' + phase : '')
  )
}

/** Parse ledger CSV text (header + rows) into objects; tolerant of quoted notes. */
export function parseLedger(text) {
  const lines = String(text ?? '').split('\n').filter((l) => l.trim())
  if (!lines.length) return []
  const head = splitCsv(lines[0])
  if (!head.includes('node')) return []
  return lines.slice(1).map((l) => {
    const cells = splitCsv(l)
    const row = {}
    head.forEach((h, i) => (row[h] = cells[i] ?? ''))
    return row
  })
}

function splitCsv(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export function ledgerLine(r) {
  return [r.ts, r.node, r.model, r.verdict, r.seconds ? r.seconds + 's' : '', r.note].filter((x) => x !== undefined && x !== '').join(' · ')
}

/** Count node verdicts and list the ones still open. */
export function summarizeNodes(nodes) {
  const counts = {}
  for (const n of nodes) counts[n.verdict] = (counts[n.verdict] ?? 0) + 1
  const order = ['DONE', 'DONE-WITH-CAVEATS', 'BLOCKED', 'ESCALATE', 'FAILED', 'SPLIT', 'pending']
  const keys = [...order.filter((k) => counts[k]), ...Object.keys(counts).filter((k) => !order.includes(k))]
  const line = nodes.length ? nodes.length + ' nodes: ' + keys.map((k) => counts[k] + ' ' + k).join(', ') : 'no nodes yet'
  const open = nodes.filter((n) => n.verdict !== 'DONE' && n.verdict !== 'DONE-WITH-CAVEATS')
  return { counts, line, open }
}

/** The spinner's suffix with the run in it: `Thinking · baton P3 · T14…`. */
export function spinnerSuffix(base, phase, node) {
  const bits = ['baton', phase, node].filter(Boolean)
  return ' · ' + bits.join(' · ') + (base ?? '…')
}

/** Natural sort for ids like P2, P10, T3.1. */
export function byId(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

// ------------------------------------------------------------------ plan usage

/** A short name for a rate-limit window: five_hour → 5h, seven_day → week, seven_day_fable → Fable week. */
export function limitLabel(kind) {
  const k = String(kind ?? '')
  if (k === 'five_hour') return '5h'
  if (k === 'seven_day') return 'week'
  if (k === 'spend_limit') return 'spend'
  const model = /(fable|opus|sonnet|haiku)/i.exec(k)
  const win = /five_hour/.test(k) ? '5h' : /seven_day/.test(k) ? 'week' : ''
  if (model) return model[1][0].toUpperCase() + model[1].slice(1).toLowerCase() + (win ? ' ' + win : '')
  return k.replace(/_/g, ' ')
}

/** When a window resets, short: "14:20" today, "Thu 09:00" this week, else the date. */
export function resetLabel(iso, now = Date.now()) {
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const hm = t.toISOString().slice(11, 16)
  const days = (t.getTime() - now) / 86400000
  if (days < 1 && t.getUTCDate() === new Date(now).getUTCDate()) return hm + 'Z'
  if (days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.getUTCDay()] + ' ' + hm + 'Z'
  return t.toISOString().slice(0, 10)
}

/** green, yellow from 60%, red from 85%. */
export function usageColor(pct) {
  if (typeof pct !== 'number') return undefined
  return pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green'
}

/**
 * The plan-usage line: 5h, week, then any model window, then spend; and the session's cost.
 * Segments: [{ text, color }].
 */
export function usageSegs(limits, cost, now = Date.now()) {
  const order = (k) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : k === 'spend_limit' ? 9 : 5)
  const out = []
  for (const l of [...(limits || [])].sort((a, b) => order(a.kind) - order(b.kind))) {
    if (out.length) out.push({ text: '  ·  ', color: undefined })
    const pct = Math.round(Number(l.percentUsed) * 10) / 10
    const fill = Math.max(0, Math.min(8, Math.round((pct / 100) * 8)))
    out.push({ text: limitLabel(l.kind) + ' ▕' + '█'.repeat(fill) + '░'.repeat(8 - fill) + '▏ ' + pct + '%', color: usageColor(pct) })
    const r = resetLabel(l.resetsAt, now)
    if (r) out.push({ text: ' resets ' + r, color: undefined })
  }
  if (cost && typeof cost.usd === 'number') {
    if (out.length) out.push({ text: '  ·  ', color: undefined })
    out.push({ text: 'session $' + cost.usd.toFixed(2), color: undefined })
  }
  if (!out.length) out.push({ text: 'plan usage: no reading yet (it arrives with the first response on a subscription)', color: undefined })
  return out
}

// ------------------------------------------------------------------ the one-line band

const miniBar = (pct, w = 5, tick = null) => {
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  const fill = Math.round((p / 100) * w)
  const t = tick == null ? -1 : Math.min(w - 1, Math.max(0, Math.round((tick / 100) * w)))
  let s = ''
  for (let i = 0; i < w; i++) s += i === t && i >= fill ? '┊' : i < fill ? '█' : '░'
  return '▕' + s + '▏'
}

/** A short window name for the band: 5h, wk, Fable, spend. */
export function shortLimit(kind) {
  const k = String(kind ?? '')
  if (k === 'five_hour') return '5h'
  if (k === 'seven_day') return 'wk'
  if (k === 'spend_limit') return 'spend'
  const model = /(fable|opus|sonnet|haiku)/i.exec(k)
  return model ? model[1][0].toUpperCase() + model[1].slice(1).toLowerCase() : k.replace(/_/g, ' ')
}

/**
 * Everything on one line: each plan window, the context against its threshold, the session's
 * cost, and (in a run) rotations, the goal and the PR. Segments: [{ text, color }].
 */
export function bandSegs({ limits = [], cost = null, ctx = null, threshold = null, rotations = null, goal = null, pr = null }) {
  const order = (k) => (k === 'five_hour' ? 0 : k === 'seven_day' ? 1 : k === 'spend_limit' ? 9 : 5)
  const out = []
  const sep = () => out.length && out.push({ text: ' · ', color: undefined })
  for (const l of [...limits].sort((a, b) => order(a.kind) - order(b.kind))) {
    sep()
    const pct = Math.round(Number(l.percentUsed))
    out.push({ text: shortLimit(l.kind) + ' ' + miniBar(pct) + pct + '%', color: usageColor(pct) })
  }
  if (typeof ctx === 'number') {
    sep()
    out.push({ text: 'ctx ' + miniBar(ctx, 5, threshold) + ctx + '%' + (threshold != null ? '/' + threshold + '%' : ''), color: threshold != null ? gaugeColor(ctx, threshold) : undefined })
  }
  if (rotations) {
    sep()
    out.push({ text: '↻' + rotations, color: undefined })
  }
  if (cost && typeof cost.usd === 'number') {
    sep()
    out.push({ text: '$' + cost.usd.toFixed(2), color: undefined })
  }
  if (goal) {
    sep()
    out.push({ text: goal.text, color: goal.color })
  }
  if (pr) {
    sep()
    out.push({ text: pr.text, color: pr.color })
  }
  if (!out.length) out.push({ text: 'baton · plan usage arrives with the first response', color: undefined })
  return out
}
