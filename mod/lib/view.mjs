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
