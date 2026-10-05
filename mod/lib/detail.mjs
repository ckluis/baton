// baton v7 detail views: what Enter opens on an agent, a phase or a node in Work. Pure, no I/O.
//
// Each view is { title, lines }, a line being [{ text, tone }] with the stepper's tones
// (done | current | flagged | future | rail) or a color name. The mod draws them in the pane, the
// -p text and /baton show print them, and the page's demo renders the same views.

import { stepper } from './track.mjs'
import { shortTokens } from './ledger.mjs'
import { elapsed } from './agents.mjs'
import { sparkline } from './table.mjs'

const L = (...segs) => segs.map((s) => (typeof s === 'string' ? { text: s } : s))
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
  lines.push(L(dim('model        '), (n.model || '?') + '  ·  ' + (live ? 'running ' : 'finished in ') + elapsed((n.endedAt ?? now) - n.startedAt) + '  ·  ' + n.tools + ' tool call' + (n.tools === 1 ? '' : 's') + (live ? '' : '  ·  ' + (n.verdict || 'returned'))))
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
    lines.push([], L(head('last tool calls')))
    for (const r of n.recent.slice(-10)) lines.push(L(dim('  ' + new Date(r.at).toISOString().slice(11, 19) + '  '), (r.tool.length > 13 ? r.tool.slice(0, 12) + '…' : r.tool.padEnd(13)) + ' ', r.detail || ''))
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
      lines.push(L(mark, r.criterion))
      if (r.probe) lines.push(L(dim('      ' + String(r.probe).slice(0, 140))))
    }
  }
  if ((x.lessons || []).length) {
    lines.push([], L(head('lessons it left'), dim('  (carried to later agents working here)')))
    for (const l of x.lessons) lines.push(L({ text: '  - ' + l, tone: 'magenta' }))
  }
  return { title: nd.id + ' · ' + (nd.flag === 'pending' ? 'not started' : nd.state) + (nd.flag && nd.flag !== 'pending' ? ' (' + nd.flag + ')' : ''), lines }
}

/** Plain text of a view, for -p and /baton show. */
export function detailText(v) {
  return [v.title, ...v.lines.map((l) => l.map((s) => s.text).join(''))].join('\n')
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
