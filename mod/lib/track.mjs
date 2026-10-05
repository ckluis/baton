// baton v7 tracker: every level of a run as a row of states, like a parcel's
// ordered → packed → in transit → delivered. Pure, no I/O.
//
// A state is COMPUTED from the record (files under _orch/, the PR as `gh`
// reports it), never asserted by an agent. The mod observes the record, and
// when an entity's computed state changes it appends one row (ts, level, id,
// state): the time each state was entered is measured, never remembered
// (rule 7.1), and how long each state lasted falls out of consecutive rows.

export const LADDERS = {
  goal: ['queued', 'planned', 'building', 'reviewing', 'ready', 'merged'],
  pr: ['draft', 'checks', 'reviewed', 'ready', 'merged'],
  phase: ['briefed', 'dispatched', 'verified', 'approved'],
  node: ['red', 'green', 'blue', 'verified'],
  'node-exempt': ['working', 'verified'],
}

// ------------------------------------------------------------------ derive

/** A node: red → green → blue → verified from work/*.txt and its verdict. */
export function nodeState(n) {
  const ladder = n.exempt ? 'node-exempt' : 'node'
  let state
  if (n.verdict === 'CONFIRMED') state = 'verified'
  else if (n.exempt) state = 'working'
  else if (n.blue) state = 'blue'
  else if (n.green) state = 'green'
  else state = 'red'
  const flag =
    n.verdict === 'REFUTED' ? 'refuted' : n.status === 'BLOCKED' ? 'blocked' : n.status === 'ESCALATE' ? 'escalated' : !n.exempt && !n.red && !n.started ? 'pending' : null
  return { ladder, state, flag }
}

/** A phase: briefed → dispatched → verified → approved. */
export function phaseState(p) {
  let state = 'briefed'
  if (p.approved) state = 'approved'
  else if (p.envelopeVerdict && /^DONE/.test(p.envelopeVerdict)) state = 'verified'
  else if (p.dispatched) state = 'dispatched'
  const flag = p.sentBack ? 'sent back' : p.envelopeVerdict && !/^DONE/.test(p.envelopeVerdict) ? p.envelopeVerdict.toLowerCase() : !p.brief ? 'pending' : null
  return { ladder: 'phase', state, flag }
}

/** The PR: draft → checks → reviewed → ready → merged, from `gh pr view --json` and the reviewer's verdict. */
export function prState(pr, review, ready) {
  if (!pr) return null
  let state = 'draft'
  if (pr.state === 'MERGED') state = 'merged'
  else if (ready && ready.ok) state = 'ready'
  else if (review && review.verdict) state = 'reviewed'
  else if (checksGreen(pr)) state = 'checks'
  const flag = pr.state === 'CLOSED' ? 'closed' : review && review.verdict === 'CHANGES' && state !== 'merged' ? 'changes' : checksFailing(pr) ? 'checks failing' : null
  return { ladder: 'pr', state, flag }
}

/** The goal (an issue, or the run's target): queued → planned → building → reviewing → ready → merged. */
export function goalState(g) {
  let state = 'queued'
  if (g.prState === 'merged') state = 'merged'
  else if (g.ready) state = 'ready'
  else if (g.review || g.allPhasesDone) state = 'reviewing'
  else if (g.anyPhase) state = 'building'
  else if (g.planned) state = 'planned'
  const flag = g.blocked ? 'blocked' : g.review === 'CHANGES' ? 'changes' : null
  return { ladder: 'goal', state, flag }
}

// ------------------------------------------------------------------ the PR's facts

const OK = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

function checkConclusion(c) {
  return String(c.conclusion || c.state || '').toUpperCase()
}

export function checksGreen(pr) {
  const cs = (pr && pr.statusCheckRollup) || []
  return cs.length > 0 && cs.every((c) => OK.has(checkConclusion(c)))
}

export function checksFailing(pr) {
  return ((pr && pr.statusCheckRollup) || []).some((c) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(checkConclusion(c)))
}

export function checksLine(pr) {
  const cs = (pr && pr.statusCheckRollup) || []
  const ok = cs.filter((c) => OK.has(checkConclusion(c))).length
  return 'checks ' + ok + '/' + cs.length
}

/**
 * Merge-ready, computed like a node verdict: every row must hold.
 * `review` is the reviewer's latest parsed verdict; `threads` the unresolved review thread count when known.
 */
export function mergeReady(pr, review, { threads = 0 } = {}) {
  const rows = [
    { row: 'every check green (node verdicts and CI)', ok: !!pr && checksGreen(pr) },
    { row: 'the reviewer’s latest verdict is READY', ok: !!review && review.verdict === 'READY' },
    { row: 'no high finding open', ok: !!review && (review.high ?? 0) === 0 },
    { row: 'no unresolved review thread', ok: threads === 0 },
    { row: 'mergeable', ok: !!pr && pr.mergeable === 'MERGEABLE' },
    { row: 'up to date with the base', ok: !!pr && pr.mergeStateStatus !== 'BEHIND' },
  ]
  return { ok: rows.every((r) => r.ok), rows }
}

// ------------------------------------------------------------------ the reviewer's comment

/**
 * Parse the PR reviewer's comment. It opens with a marker line, then `VERDICT: READY|CHANGES`,
 * then findings `- [high|med|low] path:line — text`. Returns null for any other comment.
 */
export function parseReview(body) {
  const s = String(body ?? '')
  if (!/<!--\s*baton:pr-review\b/.test(s)) return null
  const v = /^\s*VERDICT:\s*(READY|CHANGES)\b/im.exec(s)
  const round = /<!--\s*baton:pr-review\s+round=(\d+)/.exec(s)
  const findings = [...s.matchAll(/^\s*[-*]\s*\[(high|med|medium|low)\]\s*(\S+:\d+)\s*[—–-]\s*(.+)$/gim)].map((m) => ({
    severity: m[1].toLowerCase() === 'medium' ? 'med' : m[1].toLowerCase(),
    at: m[2],
    text: m[3].trim(),
  }))
  const count = (sev) => findings.filter((f) => f.severity === sev).length
  return { verdict: v ? v[1].toUpperCase() : null, round: round ? Number(round[1]) : null, findings, high: count('high'), med: count('med'), low: count('low') }
}

/** The newest reviewer comment's verdict among a PR's comments (oldest first), or null. */
export function latestReview(comments) {
  for (let i = (comments ?? []).length - 1; i >= 0; i--) {
    const r = parseReview(comments[i].body)
    if (r && r.verdict) return { ...r, url: comments[i].url ?? null, at: comments[i].createdAt ?? null }
  }
  return null
}

// ------------------------------------------------------------------ remote gate commands

/**
 * A comment line that is a gate command: /approve P3, /approve push, /approve merge,
 * /send-back P3 <reason>. Returns [{ cmd, target, reason }].
 */
export function parseCommands(body) {
  const out = []
  for (const line of String(body ?? '').split('\n')) {
    const m = /^\s*\/(approve|send-back)\s+(\S+)\s*(.*)$/i.exec(line)
    if (m) out.push({ cmd: m[1].toLowerCase(), target: m[2], reason: m[3].trim() || null })
  }
  return out
}

// ------------------------------------------------------------------ the graph

/** Node id → phase from plan/graph.yaml, without a YAML parser: list form (`- id:`) or mapping form (`nodes:` → `  T07:`). */
export function graphPhases(text) {
  const out = new Map()
  let cur = null
  for (const line of String(text ?? '').split('\n')) {
    let m = /^\s*-\s+id:\s*["']?([A-Za-z0-9._-]+)/.exec(line)
    if (m) {
      cur = m[1]
      continue
    }
    m = /^ {2}([A-Za-z][A-Za-z0-9._-]*):\s*$/.exec(line)
    if (m) {
      cur = m[1]
      continue
    }
    m = /^\s+phase:\s*["']?P?(\d+)/.exec(line)
    if (m && cur) out.set(cur, Number(m[1]))
  }
  return out
}

// ------------------------------------------------------------------ measuring

/** Transitions between two snapshots ({ key → { level, id, state } }): rows to append. */
export function transitions(prev, next, ts) {
  const rows = []
  for (const [key, cur] of Object.entries(next)) {
    const was = prev[key]
    if (!was || was.state !== cur.state) rows.push({ ts, level: cur.level, id: cur.id, state: cur.state, from: was ? was.state : null })
  }
  return rows
}

/** From an entity's rows (any order): when each state was entered (the first time), and how long it lasted. */
export function timeline(rows, ladderStates, now) {
  const entered = new Map()
  for (const r of [...rows].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))) if (!entered.has(r.state)) entered.set(r.state, Date.parse(r.ts))
  const reached = ladderStates.filter((s) => entered.has(s))
  return ladderStates.map((s) => {
    if (!entered.has(s)) return { state: s, at: null, ms: null }
    const after = reached.filter((x) => entered.get(x) > entered.get(s)).map((x) => entered.get(x))
    const end = after.length ? Math.min(...after) : now
    return { state: s, at: entered.get(s), ms: Math.max(0, end - entered.get(s)) }
  })
}

export function shortDur(ms) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  const m = Math.round(s / 60)
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  return h < 48 ? h + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') : Math.round(h / 24) + 'd'
}

/**
 * One stepper as segments: [{ text, tone }], tone ∈ done | current | flagged | future | rail.
 * `● queued 2m ─ ● planned 6m ─ ◉ building 41m ─ ○ reviewing ─ ○ ready ─ ○ merged`
 */
export function stepper({ ladder, state, flag }, tl = []) {
  const states = LADDERS[ladder]
  // Not started (a node no one has dispatched, a phase with no brief): every step is ahead of it.
  const at = flag === 'pending' ? -1 : states.indexOf(state)
  const dur = new Map(tl.map((t) => [t.state, t.ms]))
  const segs = []
  states.forEach((s, i) => {
    if (i) segs.push({ text: ' ─ ', tone: i <= at ? 'done' : 'rail' })
    const tone = i < at ? 'done' : i === at ? (flag ? 'flagged' : state === states.at(-1) ? 'done' : 'current') : 'future'
    const glyph = i < at || (i === at && state === states.at(-1)) ? '●' : i === at ? (flag ? '✗' : '◉') : '○'
    const d = i <= at ? shortDur(dur.get(s)) : ''
    segs.push({ text: glyph + ' ' + s + (d ? ' ' + d : '') + (i === at && flag ? ' (' + flag + ')' : ''), tone })
  })
  return segs
}

export const stepperText = (st, tl) => stepper(st, tl).map((x) => x.text).join('')
