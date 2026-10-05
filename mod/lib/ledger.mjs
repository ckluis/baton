// baton v7 spend, gates and GitHub mirrors: pure, no I/O.
//
// The ideas come from talos (github.com/benmarte/talos, no license, no code
// used): per-stage cost and a budget on fix rounds, forbidden files, a PR that
// must close its issue, the goal's state visible on GitHub, and a block that
// says whether it rests on a rule or on a judgment. What changes here is who
// does it. In talos the orchestrator has to remember to run a script; in the
// mod each one is a hook, so it happens whether or not anyone remembers.

// ------------------------------------------------------------------ spend

/** Tokens in one request's usage (input + output + cache writes; cache reads are reported apart). */
export function usageTokens(u) {
  if (!u) return { fresh: 0, cacheRead: 0 }
  const n = (k) => (Number.isFinite(Number(u[k])) ? Number(u[k]) : 0)
  return { fresh: n('input_tokens') + n('output_tokens') + n('cache_creation_input_tokens'), cacheRead: n('cache_read_input_tokens') }
}

/** Add one request's usage to an account { fresh, cacheRead, requests, models }. */
export function addUsage(acc, u) {
  const t = usageTokens(u)
  acc.fresh = (acc.fresh || 0) + t.fresh
  acc.cacheRead = (acc.cacheRead || 0) + t.cacheRead
  acc.requests = (acc.requests || 0) + 1
  if (u && u.model) acc.models = Array.from(new Set([...(acc.models || []), String(u.model)]))
  return acc
}

export function shortTokens(n) {
  const v = Number(n) || 0
  if (v < 1000) return String(v)
  if (v < 1e6) return String(Number((v / 1000).toFixed(v < 1e4 ? 1 : 0))) + 'k'
  return String(Number((v / 1e6).toFixed(2))) + 'M'
}

/**
 * The budget on a goal: ok below 80%, warn from 80%, exceeded at 100%; off when the limit is 0.
 * Counts fresh tokens only: cache reads are cheap and would swamp the number.
 */
export function budgetCheck(used, limit) {
  const l = Number(limit) || 0
  if (l <= 0) return { status: 'off', used, limit: 0, pct: null }
  const pct = Math.round((used / l) * 100)
  return { status: pct >= 100 ? 'exceeded' : pct >= 80 ? 'warn' : 'ok', used, limit: l, pct }
}

/** Is this spawn one more round of fixing or reviewing — what the budget guards? */
export function isRoundSpawn(e) {
  const type = String(e?.subagentType ?? '').replace(/^.*:/, '')
  const label = String(e?.name ?? '') + ' ' + String(e?.description ?? '')
  return type === 'pr-reviewer' || /\b(steward|fix[- ]round|review round)\b/i.test(label)
}

/** Which node or phase an agent works for, from its name/description ("T14 …", "P3 phase"). */
export function workOf(label) {
  const s = String(label ?? '')
  const node = /\b(T\d+[a-z]?)\b/.exec(s)
  const phase = /\b(P\d+)\b/.exec(s)
  return { node: node ? node[1] : null, phase: phase ? phase[1] : null }
}

/** The PR's spend comment (marker first, so the mod can find and edit it). */
export function spendMarkdown({ total, budget, byRole, byPhase }) {
  const lines = ['<!-- baton:spend -->', '### baton spend', '', '| | fresh tokens | cache reads | requests |', '|---|---:|---:|---:|']
  const row = (k, a) => '| ' + k + ' | ' + shortTokens(a.fresh) + ' | ' + shortTokens(a.cacheRead) + ' | ' + (a.requests || 0) + ' |'
  lines.push(row('**total**', total))
  for (const [k, a] of Object.entries(byRole || {}).sort((x, y) => y[1].fresh - x[1].fresh)) lines.push(row(k, a))
  if (byPhase && Object.keys(byPhase).length) for (const [k, a] of Object.entries(byPhase).sort()) lines.push(row(k, a))
  if (budget && budget.status !== 'off') lines.push('', 'Budget: ' + shortTokens(budget.used) + ' of ' + shortTokens(budget.limit) + ' (' + budget.pct + '%, ' + budget.status + ').')
  lines.push('', 'Measured by the mod from every model request (`turn.step`), not reported by the agents.')
  return lines.join('\n')
}

// ------------------------------------------------------------------ forbidden files

export const FORBIDDEN_DEFAULT = ['.env', '.env.*', '*.pem', '*.key', '*.p12', 'id_rsa', 'id_ed25519', '*.keystore', 'credentials.json', '.npmrc', '.pypirc', 'secrets.*']

/** A glob over a path's basename (and the whole path when the pattern has a slash): * and ? only. */
export function globMatch(pattern, filePath) {
  const p = String(pattern)
  const target = p.includes('/') ? String(filePath) : String(filePath).split('/').pop()
  const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
  return re.test(target)
}

export function forbiddenHits(paths, patterns = FORBIDDEN_DEFAULT) {
  return (paths ?? []).filter((f) => patterns.some((p) => globMatch(p, f)) && !/\.(example|sample|template)$/i.test(f))
}

/** The explicit paths a `git add …` names (flags dropped); [] for anything else. */
export function gitAddPaths(command) {
  const out = []
  for (const part of String(command ?? '').split(/&&|\|\||;/)) {
    const m = /\bgit\s+add\s+(.+)$/.exec(part.trim())
    if (!m) continue
    for (const tok of m[1].split(/\s+/)) if (tok && !tok.startsWith('-')) out.push(tok.replace(/^["']|["']$/g, ''))
  }
  return out
}

// ------------------------------------------------------------------ the goal on GitHub

/** The goal's state as an issue label, and as a GitHub Projects Status column (talos's four, plus Todo). */
export const LABEL_PREFIX = 'baton:'
export function goalLabel(state, flag) {
  return LABEL_PREFIX + (flag === 'blocked' ? 'blocked' : state)
}
export const LABEL_COLORS = { queued: 'cfd3d7', planned: 'bfd4f2', building: '1d76db', reviewing: 'fbca04', ready: '0e8a16', merged: '5319e7', blocked: 'b60205' }
export const BOARD_DEFAULT = { queued: 'Todo', planned: 'Todo', building: 'In progress', reviewing: 'In review', ready: 'In review', merged: 'Done', blocked: 'Blocked' }
export function boardColumn(state, flag, map = {}) {
  const key = flag === 'blocked' ? 'blocked' : state
  return map[key] || BOARD_DEFAULT[key] || null
}

// ------------------------------------------------------------------ why it is blocked

/**
 * `Blocked by: <file>:"<quoted line>" (explicit|interpreted)` — the line every BLOCKED outcome
 * carries. explicit: a rule, a criterion, a hard failure; a person has to fix the cause.
 * interpreted: the agent's own judgment; a person may simply overrule it.
 */
export function parseBlockedBy(text) {
  const m = /Blocked by:\s*(.+?)\s*\((explicit|interpreted)\)\s*$/im.exec(String(text ?? ''))
  return m ? { where: m[1].trim(), kind: m[2].toLowerCase() } : null
}
