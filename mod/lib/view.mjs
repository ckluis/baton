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

// ------------------------------------------------------------------ the two-line strip (CS1)

/** The plain way to open each view, on the strip's second line (P7-CS-d1 item 2): its long form, and its short one. */
export const STRIP_HINT = { long: 'open: ctrl+x tab, then w work · m memory', short: 'ctrl+x tab: w work · m memory' }

const SEP = ' · '
const widthOf = (segs) => segs.reduce((n, x) => n + cellWidth(x.text), 0)

/**
 * The strip's first line (CS1, P7-CS-d1 item 7): the 5-hour and the weekly window, any other window the API reports,
 * and the prime's context against its threshold, in the band's order (the hooks smoke fixes it), then when each window
 * resets; in the richest form that fits `width`: `5h resets 14:20Z` with every window, then without the other windows,
 * then `5h →14:20Z`, then without bars, then without resets. A figure not there reads `n/a` and why: `no reading yet`
 * before any response, `not on a subscription` when one came with no window at all (`measured`), `not reported` when
 * the others came without it; never a number the input did not hold. Narrow, the reasons of neighbouring gauges are
 * said once, then not at all.
 * Segments: [{ text, color }], a color left undefined drawn dim.
 */
export function stripGauges({ limits = [], ctx = null, threshold = null, rotations = null, measured = false, width = 200, now = Date.now() }) {
  const list = (Array.isArray(limits) ? limits : []).filter((l) => l && Number.isFinite(Number(l.percentUsed)))
  const byKind = new Map(list.map((l) => [String(l.kind), l]))
  const why = list.length ? 'not reported' : measured ? 'not on a subscription' : 'no reading yet'
  const order = (k) => (k === 'spend_limit' ? 9 : 5)
  // the band's order (bandSegs): each plan window, then the context; the reset times after them
  const gauges = [
    ...['five_hour', 'seven_day'].map((k) => (byKind.has(k) ? { kind: k, pct: Math.round(Number(byKind.get(k).percentUsed)), resetsAt: byKind.get(k).resetsAt } : { kind: k, na: why })),
    ...list.filter((l) => l.kind !== 'five_hour' && l.kind !== 'seven_day').sort((a, b) => order(a.kind) - order(b.kind)).map((l) => ({ kind: String(l.kind), pct: Math.round(Number(l.percentUsed)), resetsAt: l.resetsAt, other: true })),
    typeof ctx === 'number' ? { kind: 'ctx', pct: ctx } : { kind: 'ctx', na: 'no reading yet' },
  ]
  const FORMS = [
    { bar: 5, reset: ' resets ', other: true, why: 'each' },
    { bar: 5, reset: ' resets ', other: false, why: 'each' },
    { bar: 5, reset: ' →', other: true, why: 'each' },
    { bar: 5, reset: ' →', other: false, why: 'once' },
    { bar: 0, reset: ' →', other: false, why: 'once' },
    { bar: 0, reset: null, other: false, why: 'once' },
    { bar: 0, reset: null, other: false, why: 'none' },
  ]
  // `week` where the line says a missing figure's reason in full words, `wk` where every figure is there (or said short)
  const said = (f) => f.why === 'each' && gauges.some((g) => g.na && (f.other || !g.other))
  const label = (g, f) => (g.kind === 'ctx' ? 'ctx' : g.kind === 'seven_day' ? (said(f) ? 'week' : 'wk') : shortLimit(g.kind))
  const draw = (f) => {
    const shown = (f.only ?? gauges).filter((g) => f.other || !g.other)
    const out = []
    const sep = () => out.length && out.push({ text: SEP })
    shown.forEach((g, i) => {
      sep()
      if (g.na) {
        const next = shown[i + 1]
        const say = f.why === 'each' || (f.why === 'once' && !(next && next.na === g.na))
        out.push({ text: label(g, f) + ' n/a' + (say ? ' (' + g.na + ')' : '') })
        return
      }
      if (g.kind === 'ctx') {
        const t = threshold != null ? '/' + threshold + '%' : ''
        out.push({ text: 'ctx ' + (f.bar ? miniBar(g.pct, f.bar, threshold) : '') + g.pct + '%' + t, color: threshold != null ? gaugeColor(g.pct, threshold) : undefined })
        if (rotations && f.bar) out.push({ text: ' ↻' + rotations })
        return
      }
      out.push({ text: label(g, f) + ' ' + (f.bar ? miniBar(g.pct, f.bar) : '') + g.pct + '%', color: usageColor(g.pct) })
    })
    // when each window resets, where known: `5h resets 14:20Z`, narrower `5h →14:20Z`
    for (const g of shown) {
      const r = f.reset && !g.na && g.kind !== 'ctx' ? resetLabel(g.resetsAt, now) : ''
      if (!r) continue
      sep()
      out.push({ text: label(g, f) + f.reset + r })
    }
    return out
  }
  for (const f of FORMS) {
    const segs = draw(f)
    if (widthOf(segs) <= width) return segs
  }
  // Narrower still (beside the approval keys, CS1): the windows go, the weekly first, so the context stays
  const last = FORMS.at(-1)
  for (const drop of [['seven_day'], ['seven_day', 'five_hour']]) {
    const keep = gauges.filter((g) => !drop.includes(g.kind))
    const segs = draw({ ...last, only: keep })
    if (widthOf(segs) <= width) return segs
  }
  return cutSegs(draw({ ...last, only: gauges.filter((g) => g.kind === 'ctx') }), width)
}

/** Segments cut to `width` cells: those past it dropped, the last one kept ending in `…`. */
export function cutSegs(segs, width) {
  const out = []
  let used = 0
  for (const x of segs) {
    if (used >= width) break
    const t = cutCells(x.text, width - used)
    out.push({ ...x, text: t })
    used += cellWidth(t)
  }
  return out
}

/**
 * A strip line laid out from its items (CS1): each item `{ key, forms: [{ text, pri }], color, cut }`, its forms
 * richest first, drawn in the items' order with ` · ` between them, and taken by priority (a lower `pri` first): an
 * item gets the richest form whose line still fits `width`. A form of `pri` 0 is always taken (cut when even it does
 * not fit); an item with `cut` whose last form does not fit takes it cut into what is left, at that form's priority,
 * when that is 4 cells or more.
 * Segments: [{ key, text, color }], the separators without a key.
 */
export function fitStrip(items, width) {
  const pick = new Map()
  const text = (i, j) => items[i].forms[j].text
  const line = (m) => items.map((it, i) => (m.has(i) ? { key: it.key, text: m.get(i).text ?? text(i, m.get(i).j), color: it.color } : null)).filter(Boolean)
  const span = (m) => {
    const ls = line(m)
    return widthOf(ls) + cellWidth(SEP) * Math.max(0, ls.length - 1)
  }
  const room = () => width - span(pick) - (pick.size ? cellWidth(SEP) : 0)
  const steps = items.flatMap((it, i) => it.forms.map((f, j) => ({ i, j, pri: f.pri ?? 9 }))).sort((a, b) => a.pri - b.pri || a.i - b.i || a.j - b.j)
  for (const s of steps) {
    if (pick.has(s.i) && pick.get(s.i).j <= s.j) continue
    const m = new Map(pick).set(s.i, { j: s.j })
    if (span(m) <= width) pick.set(s.i, { j: s.j })
    else if (pick.has(s.i)) continue
    else if (s.pri === 0) pick.set(s.i, { j: s.j, text: cutCells(text(s.i, s.j), Math.max(1, room())) })
    else if (items[s.i].cut && s.j === items[s.i].forms.length - 1 && room() >= 4) pick.set(s.i, { j: s.j, text: cutCells(text(s.i, s.j), room()) })
  }
  const out = []
  for (const x of line(pick)) {
    if (out.length) out.push({ text: SEP })
    out.push(x)
  }
  return out
}

// ------------------------------------------------------------------ updates

/** Compare dotted versions (7.10.0 > 7.9.2; a -suffix sorts before the plain release). */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v ?? '').replace(/^v/, '').split('-')
    return { nums: core.split('.').map((x) => Number(x) || 0), pre: pre ?? null }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0)
    if (d) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (x.pre === null) return 1
  if (y.pre === null) return -1
  return x.pre < y.pre ? -1 : 1
}

/** Is the plugin running from an installed copy (a marketplace cache) rather than a checkout? */
export function installedCopy(pluginRoot) {
  return /\/\.claude\/plugins\/(cache|marketplaces)\//.test(String(pluginRoot ?? ''))
}

/** The row letters (Q-12), in order: the alphabet without b, p and r (the pane's own keys) and x (a ruling's retract). */
export const ROW_LETTERS = 'acdefghijklmnoqstuvwyz'.split('')

/** The accent the engine draws a plain Button's hotkey in (E1 §k); the focus keys ↑/↓, Enter, b and + are drawn in it too. */
export const KEY_ACCENT = '#99CCFF'

/**
 * Give each row a direct key of its own (T9). `held` maps a row's identity to its letter and is
 * updated in place: a row that left `ids` frees its letter, a row that is still there keeps it, and a
 * new row, in `ids` order, takes the lowest free letter. Past the pool a row has none.
 */
export function assignLetters(held, ids, pool = ROW_LETTERS) {
  const listed = new Set(ids)
  for (const id of [...held.keys()]) if (!listed.has(id)) held.delete(id)
  const taken = new Set(held.values())
  for (const id of ids) {
    if (held.has(id)) continue
    const free = pool.find((l) => !taken.has(l))
    if (!free) break
    held.set(id, free)
    taken.add(free)
  }
  return held
}

/**
 * The agent list's window (T15; Q-64, Q-66, Q-68): how `n` list rows are drawn in `area` lines with row
 * `top` the window's first. A running row (`pin(i)`) scrolled out is drawn in a strip at that edge, in
 * tree order; both strips together take at most a third of the area. When one side's running rows do not
 * all fit, its strip ends with `+<k> running`, which joins that side's more line when no strip row fits.
 * A `↑/↓ <k> more` line stands at an edge only while rows there are not drawn (k counts those,
 * D-T15-more-count). The window takes the lines left. A list that fits is drawn whole from its top.
 *
 * Everything is counted in screen lines (P4-FX3-d3): row `i` takes `cost(i)` lines (two for a row of a table
 * drawn two lines a row, P4-FX3-d2), a more line and a `+<k> running` line one each. When the window leaves
 * lines over and no strip row stands below it, it grows into them, the rows below joining the more line's
 * `+<k> running` (only with rows of more than one line). With every cost 1 this is the one-line arithmetic,
 * unchanged. `lines` is what the window takes.
 */
export function listWindow(n, top, area, pin = () => false, cost = () => 1) {
  const span = (a, b) => {
    let s = 0
    for (let i = a; i < b; i++) s += cost(i)
    return s
  }
  if (span(0, n) <= area) return { top: 0, size: n, above: [], below: [], plusAbove: 0, plusBelow: 0, stripAbove: 0, stripBelow: 0, hiddenAbove: 0, hiddenBelow: 0, fits: true, lines: span(0, n) }
  const t = Math.max(0, Math.min(Number(top) || 0, n - 1))
  const cap = Math.floor(area / 3)
  const running = (a, b) => {
    const out = []
    for (let i = a; i < b; i++) if (pin(i)) out.push(i)
    return out
  }
  const strip = (rs, room) => {
    const all = rs.reduce((s, i) => s + cost(i), 0)
    if (all <= room) return { rows: rs, plus: 0, lines: all }
    let k = 0
    let used = 0
    while (k < rs.length && used + cost(rs[k]) <= room - 1) used += cost(rs[k++])
    return k ? { rows: rs.slice(0, k), plus: rs.length - k, lines: used + 1 } : { rows: [], plus: rs.length, lines: 0 }
  }
  const sa = strip(running(0, t), cap)
  const take = (size, sb) => {
    const hiddenAbove = t - sa.rows.length
    const hiddenBelow = n - t - size - sb.rows.length
    const lines = (hiddenAbove > 0 ? 1 : 0) + sa.lines + span(t, t + size) + sb.lines + (hiddenBelow > 0 ? 1 : 0)
    return { top: t, size, above: sa.rows, below: sb.rows, plusAbove: sa.plus, plusBelow: sb.plus, stripAbove: sa.lines, stripBelow: sb.lines, hiddenAbove, hiddenBelow, fits: false, lines }
  }
  // the most rows the area could hold from `t`: no larger window is tried
  let most = 0
  for (let used = 0; t + most < n && used + cost(t + most) <= area; most++) used += cost(t + most)
  // rows of more than one line (a two-line table): a window may be left with lines a further row would use
  const tall = span(0, n) > n
  for (let size = Math.max(1, most); size >= 1; size--) {
    let w = take(size, strip(running(t + size, n), cap - sa.lines))
    if (w.lines > area) continue
    // lines over and no strip row below: the window grows into them, the running rows below counted on the more line
    while (tall && !w.below.length && w.lines < area && t + w.size < n) {
      const s = w.size + 1
      const g = take(s, { rows: [], plus: running(t + s, n).length, lines: 0 })
      if (g.lines > area) break
      w = g
    }
    return w
  }
  return { top: t, size: 1, above: [], below: [], plusAbove: 0, plusBelow: 0, stripAbove: 0, stripBelow: 0, hiddenAbove: t, hiddenBelow: n - t - 1, fits: false, lines: span(t, t + 1) + (t > 0 ? 1 : 0) + (n - t - 1 > 0 ? 1 : 0) }
}

/** The first top row at which the list's last row is in the window (End, Q-63). */
export function listEnd(n, area, pin = () => false, cost = () => 1) {
  for (let t = Math.max(0, n - area); t < n; t++) {
    const w = listWindow(n, t, area, pin, cost)
    if (w.top + w.size >= n) return w.top
  }
  return Math.max(0, n - 1)
}

/** The top row that brings row `i` into the window from `top`, moving it as little as it can (L289-290). */
export function listReveal(n, top, area, i, pin = () => false, cost = () => 1) {
  if (i < top) return Math.max(0, i)
  for (let t = top; t <= i; t++) {
    const w = listWindow(n, t, area, pin, cost)
    if (i < w.top + w.size) return w.top
  }
  return i
}

/** A memory line's time cell: HH:MM, with the date before it when it is not today (Q-23). */
export function memTime(ts, now = Date.now()) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts ?? '')
  const two = (n) => String(n).padStart(2, '0')
  const day = (x) => x.getFullYear() + '-' + two(x.getMonth() + 1) + '-' + two(x.getDate())
  const hm = two(d.getHours()) + ':' + two(d.getMinutes())
  return day(d) === day(new Date(now)) ? hm : day(d) + ' ' + hm
}

/** Terminal cells of a table cell: the mark glyphs ✅ and ❌ are two cells wide, as wide characters are. */
const cellsOf = (t) => [...t].reduce((n, c) => n + (c === '✅' || c === '❌' ? 2 : 1), 0)

/** The cells a string takes on the terminal (✅ and ❌ two each). */
export const cellWidth = (t) => cellsOf(String(t ?? ''))

/** A string cut to `w` cells, ending in `…` when cut (FX3: a memory row's text, so the row fits its pane). */
export function cutCells(t, w) {
  const s = String(t ?? '')
  if (cellsOf(s) <= w) return s
  if (w <= 0) return ''
  let out = ''
  for (const c of s) {
    if (cellsOf(out + c) > w - 1) break
    out += c
  }
  return out + '…'
}

/**
 * The memory explorer as a table (T12, Q-23): each line (`#n ts [tag] text`, or `#lo-hi text` for a
 * summary) split into id, time, source and text cells, each column as wide as its widest value shown,
 * two cells apart. Returns one string per line, in order; a line of another shape is all text.
 *
 * With `marks` (T14, one glyph per line: '✅', '❌' or ''), a mark column follows the id column
 * (D-T14-mark-column), and `memTableHeader` gives the header line over the same columns.
 */
export function memTable(lines, now = Date.now(), marks = null) {
  return memGrid(lines, now, marks).cells.map((c) => c.join(''))
}

/** memTable's rows as their three parts: the id cell, the mark cell (each with its gap), and the rest. */
export function memTableCells(lines, now = Date.now(), marks = null) {
  return memGrid(lines, now, marks).cells.map((c) => (marks ? [c[0], c[1], c.slice(2).join('')] : [c[0], '', c.slice(1).join('')]))
}

/** The header line of memTable's columns: `id  mark  time  source  text`. */
export function memTableHeader(lines, now = Date.now(), marks = null) {
  return memGrid(lines, now, marks).header
}

function memGrid(lines, now, marks) {
  const cols = marks ? ['id', 'mark', 'time', 'source'] : ['id', 'time', 'source']
  const rows = (lines ?? []).map((l, j) => {
    const s = String(l ?? '')
    const m = marks ? [String(marks[j] ?? '')] : []
    const n = /^(#\d+) (\S+) \[([^\]]*)\] ?(.*)$/.exec(s)
    if (n) return [n[1], ...m, memTime(n[2], now), n[3], n[4]]
    const b = /^(#\d+-\d+) ?(.*)$/.exec(s)
    return b ? [b[1], ...m, '', '', b[2]] : ['', ...m, '', '', s]
  })
  const last = cols.length
  const w = cols.map((h, c) => Math.max(0, ...rows.map((r) => cellsOf(r[c]))))
  if (marks) w[1] = Math.max(w[1], 2)
  const shown = cols.map((_, c) => c).filter((c) => w[c] > 0)
  const pad = (t, n) => t + ' '.repeat(Math.max(0, n - cellsOf(t)))
  const header = marks ? shown.map((c) => pad(cols[c], Math.max(w[c], cols[c].length)) + '  ').join('') + 'text' : ''
  if (marks) for (const c of shown) w[c] = Math.max(w[c], cols[c].length)
  // one string per shown column (its padding and gap included), then the text: they join to the row
  return { header, cells: rows.map((r) => [...cols.map((_, c) => (shown.includes(c) ? pad(r[c], w[c]) + '  ' : '')), r[last]]) }
}

/**
 * The direct keys of Work's rows, in the order they are handed out (T9, Q-39): every agent and phase
 * row in tree order, then the `?` rows in the order shown, then the blocked node rows.
 */
export function rowKeyIds({ tree = [], questions = [], blocked = [] }) {
  return [...tree, ...questions.map((id) => 'q:' + id), ...blocked.map((id) => 'blocked:' + id)]
}
