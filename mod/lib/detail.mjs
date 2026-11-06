// baton v7 detail views: what Enter opens on an agent, a phase or a node in Work. Pure, no I/O.
//
// Each view is { title, lines }, a line being [{ text, tone }] with the stepper's tones
// (done | current | flagged | future | rail) or a color name. The mod draws them in the pane, the
// -p text and /baton show print them, and the page's demo renders the same views.

import { questionState, stepper } from './track.mjs'
import { shortTokens } from './ledger.mjs'
import { elapsed } from './agents.mjs'
import { callTable, sparkline } from './table.mjs'

const L = (...segs) => segs.filter((s) => s != null).map((s) => (typeof s === 'string' ? { text: s } : s))
const dim = (text) => ({ text, tone: 'rail' })
const head = (text) => ({ text, tone: 'head' })

/** Wrap prose to a width, keeping words whole. */
export function wrap(text, width = 100) {
  const out = []
  for (const para of String(text ?? '').split('\n')) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    let line = ''
    for (const w of para.split(/\s+/)) {
      if ((line + ' ' + w).trim().length > width) {
        out.push(line)
        line = w
      } else line = (line + ' ' + w).trim()
    }
    out.push(line)
  }
  return out
}

/** Which view an id opens: T12 → node, P3 → phase, anything else → an agent by id or label. */
export function resolveTarget(id, { nodes = [], phases = [], agents = [] } = {}) {
  const s = String(id ?? '').trim()
  if (!s) return null
  if (phases.some((p) => p.id === s.toUpperCase())) return { kind: 'phase', id: s.toUpperCase() }
  if (nodes.some((n) => n.id === s)) return { kind: 'node', id: s }
  const a = agents.find((x) => x.id === s) || agents.find((x) => x.label && x.label.toLowerCase().includes(s.toLowerCase()))
  return a ? { kind: 'agent', id: a.id } : null
}

/**
 * An agent: who, where in the tree, its own meter, the steps of its work, the task it was given
 * (lessons the mod added shown apart), its last tool calls, and what it returned.
 */
export function agentDetail(n, x = {}) {
  const now = x.now ?? Date.now()
  const live = n.endedAt == null
  const lines = []
  lines.push(L(dim('in the tree  '), x.chain || n.label))
  lines.push(L(dim('model        '), (x.model || n.model || '?') + '  ·  ' + (live ? 'running ' : 'finished in ') + elapsed((n.endedAt ?? now) - n.startedAt) + '  ·  ' + n.tools + ' tool call' + (n.tools === 1 ? '' : 's') + (live ? '' : '  ·  ' + (n.verdict || 'returned'))))
  if (x.mismatch) lines.push(L(dim('             '), { text: 'requested ' + x.mismatch.requested + '  ·  served ' + x.mismatch.served, tone: 'red' }))
  if (x.ctxPct != null) lines.push(L(dim('context      '), { text: x.ctxPct + '% of its window', tone: x.ctxTone }, dim('  ·  budget ' + x.threshold + '%  ·  trend '), { text: sparkline(x.hist || []), tone: x.ctxTone }))
  if (x.comps) lines.push(L(dim('tokens       '), 'input ' + shortTokens(x.comps.input) + '  ·  cache write ' + shortTokens(x.comps.cacheWrite) + '  ·  cache read ' + shortTokens(x.comps.cacheRead) + '  ·  output ' + shortTokens(x.comps.output) + (x.cost ? '  ·  ' + x.cost : '')))
  if (x.steps) lines.push(L(dim('its work     '), ...stepper(x.steps, x.stepsTl || [])))
  const prompt = String(n.prompt || '')
  const cut = prompt.indexOf('\n\nbaton — lessons from earlier refutations')
  const task = cut >= 0 ? prompt.slice(0, cut) : prompt
  if (task.trim()) {
    lines.push([], L(head('the task it was given')))
    for (const l of wrap(task, 104).slice(0, 14)) lines.push(L('  ' + l))
    if (wrap(task, 104).length > 14) lines.push(L(dim('  … ' + (wrap(task, 104).length - 14) + ' more lines')))
  }
  if (cut >= 0) {
    lines.push([], L(head('lessons the mod added to it'), dim('  (from earlier refutations in this code)')))
    for (const l of prompt.slice(cut).split('\n').filter((t) => t.startsWith('- '))) lines.push(L({ text: '  ' + l, tone: 'magenta' }))
  }
  if ((n.recent || []).length) {
    // a table fitted to the width it is drawn at (TC1): `viewLines` lays it out there
    lines.push([], L(head('last tool calls')), [{ text: '', calls: n.recent.slice(-10) }])
  }
  if (!live && n.line) lines.push([], L(head('returned')), L('  ' + n.line))
  return { title: (live ? '● ' : n.verdict && /BLOCKED|REFUTED|FAILED|ABORTED/.test(n.verdict) ? '✗ ' : '✓ ') + (n.role === 'sub-orchestrator' ? 'sub-orch' : n.role) + ' ' + n.label, lines }
}

/** A phase: its steps, its brief, every node with its steps, and what its envelope said. */
export function phaseDetail(p, x = {}) {
  const lines = []
  const ver = (p.nodes || []).filter((n) => n.state === 'verified').length
  lines.push(L(dim('steps        '), ...stepper(p, p.tl || [])))
  lines.push(L(dim('nodes        '), ver + ' of ' + (p.nodes || []).length + ' verified' + (x.spend ? '  ·  ' + x.spend : '')))
  if (x.brief) {
    lines.push([], L(head('the brief')))
    for (const l of String(x.brief).split('\n').slice(0, 12)) lines.push(L('  ' + l))
  }
  if ((p.nodes || []).length) {
    lines.push([], L(head('its nodes'), dim('  (Enter on one in Work opens it)')))
    for (const n of p.nodes) lines.push(L('  ' + (n.id + '      ').slice(0, 6), ...stepper(n, n.tl || []), dim(n.spendText ? '  ·  ' + n.spendText : '')))
  }
  const env = x.envelope
  if (env) {
    lines.push([], L(head('its envelope')), L('  ' + (env.verdict || '?') + (env.summary ? ' — ' + env.summary : '')))
    if (env.risk) lines.push(L(dim('  risk: '), env.risk))
  }
  return { title: p.id + ' · ' + p.state + (p.flag && p.flag !== 'pending' ? ' (' + p.flag + ')' : ''), lines }
}

/** Done-criteria out of a handoff: list items under a criteria heading, else every list item. */
export function criteriaOf(handoff) {
  const lines = String(handoff ?? '').split('\n')
  const start = lines.findIndex((l) => /done[- ]criteri/i.test(l))
  const scope = start >= 0 ? lines.slice(start + 1) : lines
  const out = []
  for (const l of scope) {
    if (start >= 0 && /^#{1,6}\s/.test(l) && out.length) break
    const m = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(l)
    if (m) out.push(m[1].trim())
  }
  return out
}

/** A node: its steps, its done-criteria, its red/green/blue records, the verifier's rows, and its lessons. */
export function nodeDetail(nd, x = {}) {
  const lines = []
  lines.push(L(dim('steps        '), ...stepper(nd, nd.tl || []), dim(x.spend ? '  ·  ' + x.spend : '')))
  const crit = criteriaOf(x.handoff)
  if (crit.length) {
    lines.push([], L(head('done-criteria')))
    crit.slice(0, 10).forEach((c, i) => lines.push(L(dim('  ' + (i + 1) + '. '), c)))
  } else if (x.handoff) {
    lines.push([], L(head('the handoff')))
    for (const l of String(x.handoff).split('\n').slice(0, 10)) lines.push(L('  ' + l))
  }
  if (x.exempt) lines.push([], L(head('red · green · blue'), dim('  exempt: ' + x.exempt)))
  else if (x.red || x.green || x.blue) {
    lines.push([], L(head('red · green · blue')))
    for (const [k, tone] of [['red', 'red'], ['green', 'green'], ['blue', 'cyan']]) {
      const t = x[k]
      if (t == null) lines.push(L({ text: '  ' + k.padEnd(6), tone: 'rail' }, dim('not yet')))
      else for (const [i, l] of String(t).split('\n').filter(Boolean).slice(0, 3).entries()) lines.push(L({ text: i ? '        ' : '  ' + k.padEnd(6), tone }, l.slice(0, 120)))
    }
  }
  const rows = (x.verdict && x.verdict.criteria) || []
  if (rows.length) {
    lines.push([], L(head('the verifier'), dim('  ' + (x.verdict.verdict || '') + (x.verdict.probe ? ' — ' + String(x.verdict.probe).slice(0, 90) : ''))))
    for (const r of rows) {
      const v = String(r.verdict).toUpperCase()
      const mark = v === 'CONFIRMED' ? { text: '  ✓ ', tone: 'green' } : v === 'REFUTED' ? { text: '  ✗ ', tone: 'red' } : { text: '  ? ', tone: 'yellow' }
      lines.push(L(mark, r.criterion ?? crit[Number(r.n) - 1] ?? (r.n != null ? 'criterion ' + r.n : null))) // a row may name its criterion by number
      if (r.probe) lines.push(L(dim('      ' + String(r.probe).slice(0, 140))))
    }
  }
  if ((x.lessons || []).length) {
    lines.push([], L(head('lessons it left'), dim('  (carried to later agents working here)')))
    for (const l of x.lessons) lines.push(L({ text: '  - ' + l, tone: 'magenta' }))
  }
  return { title: nd.id + ' · ' + (nd.flag === 'pending' ? 'not started' : nd.state) + (nd.flag && nd.flag !== 'pending' ? ' (' + nd.flag + ')' : ''), lines }
}

/**
 * A view's lines as drawn `width` cells wide: a line holding a tool-call table (agentDetail's `calls`) becomes the
 * table's rows, fitted to `width` under a header row (TC1); without a width, its text form. Other lines as they are.
 */
export function viewLines(lines, width = null) {
  return lines.flatMap((l) => {
    const calls = l.length === 1 && l[0].calls
    if (!calls) return [l]
    const t = callTable(calls, width)
    return t.header ? [t.header, ...t.lines] : t.lines
  })
}

/** Plain text of a view, for -p and /baton show. */
export function detailText(v) {
  return [v.title, ...viewLines(v.lines).map((l) => l.map((s) => s.text).join(''))].join('\n')
}

/** A ruling: what it says, where it came from, whether it is enforced, what you can do with it. */
export function rulingDetail(r, source = null) {
  const lines = []
  lines.push(L(dim('ruling       '), { text: r.text, tone: 'magenta' }))
  lines.push(L(dim('recorded     '), r.ts || '?'))
  if (source) lines.push(L(dim('from         '), 'your message' + (source.at ? ' at ' + source.at : '') + ': ', { text: '"' + String(source.text).slice(0, 240) + '"', tone: 'yellow' }))
  else lines.push(L(dim('from         '), r.hand ? '/baton rule, by hand' : 'an earlier message (its source was not recorded)'))
  lines.push(L(dim('enforced     '), r.enforce ? { text: '/' + r.enforce.source + '/', tone: 'cyan' } : 'no', dim(r.enforce ? '  — a shell command matching it is refused at the permission check' : '  — it leads every wake and every kickoff')))
  lines.push([], L(head('what you can do')), L('  ', dim('x'), ' retracts it (the log keeps it)', dim('  ·  '), dim('/baton enforce ' + r.n + ' <regex>'), ' makes it refuse matching commands'))
  return { title: 'ruling #' + r.n, lines }
}

// ------------------------------------------------------------------ questions and blocked rows (T13)

/** The last `Blocked by: …` line of a text (rule 10 step 1), trimmed; null when it has none. */
export function blockedByLine(text) {
  const all = String(text ?? '').match(/^[ \t]*Blocked by:.*$/gim)
  return all ? all[all.length - 1].trim() : null
}

/** The node ids a question names on its `**Nodes it blocks:**` line (rule 10 step 1). */
export function nodesBlocked(text) {
  const m = /^\s*\**Nodes it blocks:?\**:?\s*(.+)$/im.exec(String(text ?? ''))
  return m ? [...new Set(m[1].match(/\b[A-Z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*\b/g) || [])] : []
}

/**
 * A question's numbered options (Q-35): its `**Options**` list, else its first numbered list. Each is
 * { n, label, recommended }, the label its text with the markdown marks and `(recommended)` taken out.
 * `labels` are what the dialog offers: at most `max`, the recommended one first.
 */
export function questionOptions(text, max = 4) {
  const lines = String(text ?? '').split('\n')
  const head = lines.findIndex((l) => /^\s*(\*\*Options\*\*|#{1,6}\s*Options\b)/i.test(l))
  const options = []
  for (const l of lines.slice(head >= 0 ? head + 1 : 0)) {
    const m = /^\s*(\d+)[.)]\s+(.+)$/.exec(l)
    if (m) {
      const recommended = /\(recommended\)/i.test(m[2])
      const label = m[2].replace(/\*{0,2}\(recommended\)\*{0,2}/gi, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
      if (label) options.push({ n: Number(m[1]), label, recommended })
    } else if (options.length && !/^\s{2,}\S/.test(l)) break // the list ends at its first line that is neither an item nor an item's continuation
  }
  const ordered = [...options.filter((o) => o.recommended), ...options.filter((o) => !o.recommended)]
  return { options, labels: ordered.slice(0, max).map((o) => o.label + (o.recommended ? ' (recommended)' : '')) }
}

/** What the run assumes if a question goes unanswered (rule 10 step 1), with the option it names spelled out. */
export function questionDefault(text) {
  const m = /^\s*\**If unanswered, the run assumes:?\**:?\s*(.+)$/im.exec(String(text ?? ''))
  if (!m) return null
  const said = m[1].replace(/\*\*/g, '').trim()
  const n = /\boption\s+(\d+)/i.exec(said)
  const o = n ? questionOptions(text, 99).options.find((x) => x.n === Number(n[1])) : null
  return o ? said.replace(/\.$/, '') + ' (' + o.label + ')' : said
}

/**
 * A question's brief (Q-40): its `Blocked by:` line first, in the `?` row's colour, then the whole
 * file as written, markdown as plain text, each line wrapping to the pane's width; an unauthorized
 * answer on file is shown under it (Q-48). Opened from its `?` row; `a` answers it, `b` goes back.
 */
export function questionDetail(q, x = {}) {
  const lines = []
  const tone = q.asked ? q.color : 'rail'
  const text = String(x.text ?? '')
  const by = blockedByLine(text)
  if (by) lines.push(L({ text: by, tone, wrap: true }))
  const state = q.asked
    ? 'waiting for you: put to the operator' + (x.asked ? ' (' + x.asked.replace(/\s*\n\s*/g, ' · ').trim() + ')' : '')
    : q.gate != null
      ? 'queued for G' + q.gate + ': not yet put to the operator; answering it here puts it (asked_via: pane)'
      : 'queued: no gate found in _orch/plan/graph.yaml; answering it here puts it (asked_via: pane)'
  lines.push(L(dim(state)), [])
  let skipped = false
  for (const l of text.replace(/\n+$/, '').split('\n')) {
    if (by && !skipped && l.trim() === by) {
      skipped = true
      continue
    }
    lines.push(l.trim() ? L({ text: l, wrap: true }) : [])
  }
  if (x.unauthorized) {
    lines.push([], L(head('an unauthorized answer is on file'), dim('  (not applied: rule 10; the question stays open)')))
    for (const l of String(x.unauthorized).replace(/\n+$/, '').split('\n')) lines.push(l.trim() ? L({ text: '  ' + l, tone: 'yellow', wrap: true }) : [])
  }
  if (x.note) lines.push([], L({ text: x.note, tone: x.noteTone || 'green', wrap: true }))
  lines.push([], L(dim('a answers it here (its options, or Other for your own words) · b goes back')))
  return { title: q.id + ' · ' + questionState(q), lines, keys: [{ hotkey: 'a', label: 'answer', act: 'answer' }] }
}

/**
 * The brief a blocked row's view opens with (Q-38): the node id and verdict, what it is blocked on
 * (its envelope summary, or an agent's last line), its `Blocked by:` line, and what approving grants
 * here (Q-37) or what must be fixed instead. Keys: `y` (and `w`) only where the grant allows.
 */
export function blockedBrief(b) {
  const lines = []
  lines.push(L(head('blocked'), dim('  ' + b.id + ' · ' + (b.verdict || 'BLOCKED'))))
  if (b.summary) lines.push(L(dim('  blocked on  '), { text: b.summary, wrap: true }))
  if (b.line) lines.push(L(dim('  returned    '), { text: b.line, wrap: true }))
  if (b.blockedBy) lines.push(L({ text: '  ' + b.blockedBy, tone: b.kind === 'interpreted' ? 'yellow' : 'red', wrap: true }))
  else lines.push(L(dim('  no Blocked by: line in its envelope or in an inbox question that names it')))
  if (b.grant && b.grant.says) lines.push(L({ text: '  ' + b.grant.says, wrap: true }))
  if (b.note) lines.push(L({ text: '  ' + b.note, tone: 'green', wrap: true }))
  lines.push([])
  return lines
}

const MARK_LINE = { ok: '✅ confirmed', void: '❌ void', clear: 'cleared' }
const MARK_TONE = { ok: 'green', void: 'red', clear: 'rail' }

/** A mark record's time cell: hh:mm (Q-90). */
function markTime(ts) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts ?? '?')
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

const markRecordLine = (r) => MARK_LINE[r.mark] + ' · ' + (r.reason || '') + ' · ' + (r.who || '?') + ' · ' + markTime(r.ts)

/**
 * A note's or a summary's view in the memory explorer (T14): its text, its current mark (Q-90's
 * `mark:` line) and every mark record, newest first (Q-74, D-T14-mark-history).
 * row: { id, lo, hi, ns, store, text }; records: the id's mark records, oldest first.
 */
export function memDetail(row, records = []) {
  const lines = []
  for (const l of wrap(row.text || '', 100)) lines.push(L(l))
  const last = records.length ? records[records.length - 1] : null
  const current = last && last.mark !== 'clear' ? last : null
  lines.push([], L(dim('mark: '), current ? { text: markRecordLine(current), tone: MARK_TONE[current.mark] } : dim('unmarked')))
  if (records.length) {
    lines.push([], L(dim('marks')))
    for (const r of [...records].reverse()) lines.push(L({ text: markRecordLine(r), tone: MARK_TONE[r.mark] }))
  }
  lines.push([], L(dim('c confirms ✅ · v voids ❌ · u clears · each asks for a reason · b goes back')))
  const kind = row.lo === row.hi ? 'note' : 'summary'
  return { title: kind + ' #' + row.id + (row.ns ? ' [' + row.ns + ']' : '') + (row.store ? ' · ' + row.store : ''), lines }
}
