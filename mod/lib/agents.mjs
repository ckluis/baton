// baton v7 agent tree: who is running under whom, as rows for the pane. Pure, no I/O.
//
// The prime is the root ('prime'). agent.spawn adds a node under its parent
// (e.parentAgentId, or the prime), tool.call counts a node's calls and keeps
// its latest tool, turn.complete closes it with its first line and a verdict.

export const PRIME = 'prime'
const VERDICT = /\b(DONE\+CONFIRMED|CONFIRMED|DONE|PARTIAL|BLOCKED|REFUTED|FAILED|IDLE|UNSETTLEABLE)\b/

export function newTree(now = Date.now()) {
  const nodes = new Map()
  nodes.set(PRIME, { id: PRIME, parent: null, role: 'prime', label: 'prime', model: null, startedAt: now, endedAt: null, tools: 0, lastTool: null, line: null, verdict: null, children: [] })
  return { nodes }
}

/** A short model name: claude-opus-5-5 → opus, claude-sonnet-5-5 → sonnet. */
export function shortModel(m) {
  const s = String(m ?? '')
  const hit = /(opus|sonnet|haiku|fable)/i.exec(s)
  return hit ? hit[1].toLowerCase() : s || null
}

export function addSpawn(t, { id, parent, type, label, model, prompt = '', at = Date.now() }) {
  if (!id || t.nodes.has(id)) return
  const p = parent && t.nodes.has(parent) ? parent : PRIME
  const role = String(type ?? 'agent').replace(/^baton:/, '')
  t.nodes.set(id, { id, parent: p, role, label: String(label || role).slice(0, 48), model: shortModel(model), prompt: String(prompt || '').slice(0, 4000), startedAt: at, endedAt: null, tools: 0, lastTool: null, recent: [], line: null, verdict: null, children: [] })
  t.nodes.get(p).children.push(id)
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
  n.tools++
  n.lastTool = String(tool ?? '').replace(/^mcp__baton__/, '')
  n.recent = [...(n.recent || []), { tool: n.lastTool, detail, at }].slice(-10)
}

export function finishAgent(t, agentId, { line, aborted = false, at = Date.now() } = {}) {
  const n = t.nodes.get(agentId)
  if (!n || n.id === PRIME) return
  n.endedAt = at
  n.line = line ? String(line).slice(0, 200) : null
  const v = VERDICT.exec(n.line ?? '')
  n.verdict = aborted ? 'ABORTED' : v ? v[1] : 'returned'
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
 * Rows for the pane, depth first, newest children last. Finished subtrees
 * older than the newest `keepDone` finished agents are folded into a count.
 * Each row: { id, depth, live, text, color }.
 */
export function treeRows(t, now = Date.now(), { max = 40, keepDone = 12 } = {}) {
  const done = [...t.nodes.values()].filter((n) => n.endedAt != null).sort((a, b) => b.endedAt - a.endedAt)
  const shown = new Set(done.slice(0, keepDone).map((n) => n.id))
  const rows = []
  let folded = 0
  const walk = (id, depth) => {
    const n = t.nodes.get(id)
    const live = n.endedAt == null
    if (!live && !shown.has(id) && id !== PRIME) {
      folded++
      return
    }
    const bits = [n.id === PRIME ? 'prime' : n.role + ' ' + n.label]
    if (n.model) bits.push(n.model)
    bits.push(elapsed((n.endedAt ?? now) - n.startedAt))
    bits.push(n.tools + ' tool' + (n.tools === 1 ? '' : 's'))
    if (live && n.lastTool) bits.push('now ' + n.lastTool)
    const mark = n.id === PRIME ? '◆' : live ? '●' : n.verdict === 'ABORTED' || n.verdict === 'BLOCKED' || n.verdict === 'REFUTED' || n.verdict === 'FAILED' ? '✗' : '✓'
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
  if (folded) rows.push({ id: null, depth: 0, live: false, text: '  … ' + folded + ' earlier finished agent' + (folded === 1 ? '' : 's') + ' folded', color: undefined })
  return rows.slice(0, max)
}
