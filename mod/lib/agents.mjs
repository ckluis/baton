// baton v7 agent tree: who is running under whom, as rows for the pane. Pure, no I/O.
//
// The prime is the root ('prime'). agent.spawn adds a node under its parent
// (e.parentAgentId, or the prime), tool.call counts a node's calls and keeps
// its latest tool, turn.complete closes it with its first line and a verdict.

export const PRIME = 'prime'
/** The verdicts a finished row is marked ✗ for. */
const FLAGGED = new Set(['ABORTED', 'BLOCKED', 'REFUTED', 'FAILED'])
const VERDICT = /\b(DONE\+CONFIRMED|CONFIRMED|DONE|PARTIAL|BLOCKED|REFUTED|FAILED|IDLE|UNSETTLEABLE)\b/

export function newTree(now = Date.now()) {
  const nodes = new Map()
  nodes.set(PRIME, { id: PRIME, parent: null, role: 'prime', label: 'prime', model: null, startedAt: now, endedAt: null, tools: 0, lastTool: null, line: null, verdict: null, children: [] })
  return { nodes }
}

/**
 * The model column's name for a model id: its family and version, never a bare family (spec T8).
 * claude-opus-5-5 → opus 5.5, claude-haiku-4-5-20251001 → haiku 4.5, claude-opus-5-5[1m] → opus 5.5
 * (D-T18-1m-variant). Anything else (an alias, an unknown id) is shown in full (Q-21).
 */
const FAMILY_ID = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[1m\])?$/i
export function shortModel(m) {
  const s = String(m ?? '').trim()
  if (!s) return null
  const hit = FAMILY_ID.exec(s)
  return hit ? hit[1].toLowerCase() + ' ' + hit[2] + (hit[3] ? '.' + hit[3] : '') : s
}

/** A model id without its date suffix and [1m] tag, lowercased: what two ids are compared by. */
export const baseModel = (m) => String(m ?? '').trim().toLowerCase().replace(/\[1m\]$/, '').replace(/-\d{8}$/, '')

const ALIAS = /^(opus|sonnet|haiku|fable)$/i
const NO_MODEL = /^(|inherit|inherited|default)$/i

/** The newest id of a family among `known` (claude-<family>-<major>[-<minor>]), or null. */
export function newestOf(family, known) {
  let best = null
  let bv = -1
  for (const id of known) {
    const hit = FAMILY_ID.exec(String(id))
    if (!hit || hit[1].toLowerCase() !== family.toLowerCase()) continue
    const v = Number(hit[2]) * 100 + Number(hit[3] || 0)
    if (v > bv) {
      best = baseModel(id)
      bv = v
    }
  }
  return best
}

/**
 * Whether the model that served an agent differs from the one it should have run on (Q-22): a full id is
 * compared ignoring a date suffix; an alias is compared to the newest id of its family in `known`.
 * Nothing expected (or nothing served yet) is never a mismatch.
 */
export function modelMismatch(expected, served, known = []) {
  const e = String(expected ?? '').trim()
  if (NO_MODEL.test(e) || !served) return false
  const want = ALIAS.test(e) ? newestOf(e, known) : baseModel(e)
  return !!want && want !== baseModel(served)
}

/**
 * The effort an agent's model cell shows after its model (T8 amendment, C8E): the served effort (the
 * latest classic hook input's `effort.level`) when one has been seen, else the configured one (the
 * latest `turn.step` `effort`) marked `cfg`; nothing when neither is known. An integer budget shows as
 * its digits. Served and configured both known and different is a mismatch.
 */
export function effortOf(n) {
  const has = (v) => v !== undefined && v !== null && v !== ''
  const served = n && has(n.effortServed) ? String(n.effortServed) : null
  const configured = n && has(n.effortConfigured) ? String(n.effortConfigured) : null
  if (served) return { text: served, cfg: false, mismatch: !!configured && configured !== served }
  if (configured) return { text: configured, cfg: true, mismatch: false }
  return { text: '', cfg: false, mismatch: false }
}

export function addSpawn(t, { id, parent, type, label, description = '', model, requested = null, prompt = '', at = Date.now() }) {
  if (!id || t.nodes.has(id)) return
  const p = parent && t.nodes.has(parent) ? parent : PRIME
  const role = String(type ?? 'agent').replace(/^baton:/, '')
  const name = String(label || role).slice(0, 48)
  // a newer dispatch under the same name replaces what the older one left waiting (WT1)
  for (const o of t.nodes.values()) if (o.label === name) supersede(t, o.id, 'a newer agent was dispatched under its name', at)
  t.nodes.set(id, { id, parent: p, role, label: name, description: String(description || '').slice(0, 200), model: shortModel(model), requested: requested || null, prompt: String(prompt || '').slice(0, 4000), startedAt: at, endedAt: null, tools: 0, lastTool: null, recent: [], line: null, verdict: null, children: [] })
  t.nodes.get(p).children.push(id)
}

/**
 * The phase a sub-orchestrator ran, among the plan's phase ids (spec T10 amendment, Q-58, the Q-14
 * rule): its role is sub-orchestrator and its label or description has the token `P<n>`, or its spawn
 * prompt names `_orch/phases/P<n>/`. Any other agent, or a phase not in the plan: null.
 */
export function phaseOfAgent(n, phaseIds) {
  if (!n || n.role !== 'sub-orchestrator') return null
  const known = new Set(phaseIds)
  for (const text of [n.label, n.description]) {
    for (const m of String(text ?? '').matchAll(/\bP(\d+)\b/g)) if (known.has('P' + Number(m[1]))) return 'P' + Number(m[1])
  }
  for (const m of String(n.prompt ?? '').matchAll(/_orch\/phases\/P(\d+)\//g)) if (known.has('P' + Number(m[1]))) return 'P' + Number(m[1])
  return null
}

/** Every agent of a subtree, the root included, depth first. */
export function subtree(t, id) {
  const out = []
  const walk = (x) => {
    const n = t.nodes.get(x)
    if (!n) return
    out.push(n)
    for (const c of n.children) walk(c)
  }
  walk(id)
  return out
}

/** One line for a tool call: what it touched, not its whole input. */
export function toolDetail(e) {
  const t = String(e?.tool ?? '')
  const pick = (...ks) => {
    for (const k of ks) if (e && e[k] != null && e[k] !== '') return String(e[k])
    return ''
  }
  let d = ''
  if (t === 'Bash') d = pick('command')
  else if (/^(Read|Write|Edit|MultiEdit|NotebookEdit)$/.test(t)) d = pick('file_path', 'notebook_path')
  else if (t === 'Grep') d = pick('pattern') + (e && e.path ? ' in ' + e.path : '')
  else if (t === 'Glob') d = pick('pattern')
  else if (t === 'Agent' || t === 'Task') d = pick('description', 'subagent_type')
  else if (/^mcp__baton__code_/.test(t)) d = pick('query', 'target', 'name', 'dir')
  else if (/^mcp__baton__/.test(t)) d = pick('text', 'range', 'pattern', 'namespace')
  else if (t === 'WebFetch' || t === 'WebSearch') d = pick('url', 'query')
  return d.replace(/\s+/g, ' ').trim().slice(0, 140)
}

export function addToolCall(t, agentId, tool, detail = '', at = Date.now()) {
  const n = t.nodes.get(agentId || PRIME)
  if (!n) return
  // a call of its own after its return: it resumed, so what it returned no longer waits (WT1)
  supersede(t, n.id, 'it resumed', at)
  n.tools++
  n.lastTool = String(tool ?? '').replace(/^mcp__baton__/, '')
  const call = { tool: n.lastTool, detail, at }
  n.recent = [...(n.recent || []), call].slice(-10)
  return call
}

/**
 * What a recorded call came to (TC1), from what `tool.call` resolved to: `status` ok, error or denied, and
 * `size`, the characters of the result as the model read it (`text`, else a string `result`), when known.
 * Returns `r`, so a hook can pass its result through it.
 */
export function noteOutcome(call, r) {
  if (!call || !r) return r
  call.status = r.deny ? 'denied' : r.isError ? 'error' : 'ok'
  const text = typeof r.text === 'string' ? r.text : typeof r.result === 'string' ? r.result : null
  if (text != null && !r.deny) call.size = text.length
  return r
}

export function finishAgent(t, agentId, { line, text = null, aborted = false, at = Date.now() } = {}) {
  const n = t.nodes.get(agentId)
  if (!n || n.id === PRIME) return
  n.endedAt = at
  n.line = line ? String(line).slice(0, 200) : null
  const v = VERDICT.exec(n.line ?? '')
  n.verdict = aborted ? 'ABORTED' : v ? v[1] : 'returned'
  // its newest return is what waits now (WT1): an older one it replaces is gone with it
  n.answer = text == null ? null : String(text).slice(0, 4000)
  n.superseded = null
}

// ------------------------------------------------------------------ what waits on the operator (WT1)
//
// An agent that returned BLOCKED waits on the operator until that is superseded: the agent is sent new
// instructions (SendMessage to it), it resumes (a call of its own after its return) or reports again, or a
// newer agent is dispatched under its name. Only what waits now is shown (operator decision 2026-11-06).

/** Does this agent's BLOCKED return still wait on the operator? */
export const isWaiting = (n) => !!n && n.id !== PRIME && n.endedAt != null && n.verdict === 'BLOCKED' && !n.superseded

/** Mark an agent's waiting return superseded (`why`, plain words); true when something stopped waiting. */
export function supersede(t, agentId, why, at = Date.now()) {
  const n = t.nodes.get(agentId)
  if (!isWaiting(n)) return false
  n.superseded = { why, at }
  return true
}

/** The agent a SendMessage `to` names: an agent id, else the newest agent of that label. */
export function agentNamed(t, to) {
  const s = String(to ?? '').trim()
  if (!s) return null
  if (t.nodes.has(s)) return t.nodes.get(s)
  let hit = null
  for (const n of t.nodes.values()) if (n.id !== PRIME && n.label === s) hit = n
  return hit
}

/**
 * What a waiting return asks of the operator, from its own text: the pane it names (its last `surface:<n>`, with
 * the title the text gives it in quotes or brackets right after one of its mentions) and one plain line of what
 * pressing it does (its `Blocked by:` quote, else its first line that asks a question, else its one line). baton
 * reads nothing from cmux, so a pane the text gives no title is shown by its id.
 */
export function waitItem(n) {
  const text = String((n && (n.answer || n.line)) ?? '')
  const mentions = [...text.matchAll(/\bsurface:(\d+)\b(?:\s*(?:"([^"\n]+)"|“([^”\n]+)”|\(([^)\n]+)\)))?/g)]
  const id = mentions.length ? mentions.at(-1)[1] : null
  const titled = mentions.find((x) => x[1] === id && (x[2] || x[3] || x[4]))
  const bb = /Blocked by:[^\n]*?"([^\n]+)"\s*\((?:explicit|interpreted)\)\s*$/im.exec(text)
  const asks = text.split('\n').map((l) => l.trim()).find((l) => /\?$/.test(l))
  const one = String(n && n.line ? n.line : '').replace(/^.*?\bBLOCKED\b\s*[·:—-]?\s*/, '')
  return {
    surface: id ? 'surface:' + id : null,
    title: titled ? (titled[2] || titled[3] || titled[4]).trim() : null,
    plain: ((bb && bb[1]) || asks || one || '').trim() || null,
  }
}

/**
 * An agent's own lifecycle, spawned → working → returned → verdict (Q-15), for a row whose label names
 * no node or phase of the run: working while it runs, returned once it has, at its verdict when its
 * line carried one (flagged for a failing one).
 */
export function lifecycle(n) {
  const state = !n || n.endedAt == null ? 'working' : !n.verdict || n.verdict === 'returned' ? 'returned' : 'verdict'
  return { ladder: 'agent', state, flag: state === 'verdict' && FLAGGED.has(n.verdict) ? n.verdict.toLowerCase() : null }
}

/** The label chain from the prime down to an agent: "prime › P3 › worker". */
export function chain(t, agentId) {
  const out = []
  let n = t.nodes.get(agentId || PRIME)
  while (n) {
    out.unshift(n.label)
    n = n.parent ? t.nodes.get(n.parent) : null
  }
  return out.join(' › ') || 'prime'
}

export function elapsed(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  return m < 60 ? m + 'm' + String(s % 60).padStart(2, '0') + 's' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') + 'm'
}

/**
 * Rows for the pane, depth first, newest children last: every agent, finished ones too (T15, spec
 * L286, L288: nothing is folded; the pane's list scrolls instead).
 * Each row: { id, depth, live, text, color }.
 */
export function treeRows(t, now = Date.now()) {
  const rows = []
  const walk = (id, depth) => {
    const n = t.nodes.get(id)
    const live = n.endedAt == null
    const bits = [n.id === PRIME ? 'prime' : n.role + ' ' + n.label]
    if (n.model) bits.push(n.model)
    bits.push(elapsed((n.endedAt ?? now) - n.startedAt))
    bits.push(n.tools + ' tool' + (n.tools === 1 ? '' : 's'))
    if (live && n.lastTool) bits.push('now ' + n.lastTool)
    const mark = n.id === PRIME ? '◆' : live ? '●' : FLAGGED.has(n.verdict) ? '✗' : '✓'
    const tail = !live && n.line ? ' — ' + n.line : ''
    rows.push({
      id: n.id,
      depth,
      live,
      text: '  '.repeat(depth) + mark + ' ' + bits.join(' · ') + (live || n.id === PRIME ? '' : ' · ' + n.verdict) + tail,
      color: n.id === PRIME ? undefined : live ? 'cyan' : mark === '✗' ? 'red' : 'green',
    })
    for (const c of n.children) walk(c, depth + 1)
  }
  walk(PRIME, 0)
  return rows
}
