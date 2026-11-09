// baton v7 spend, gates and GitHub mirrors: pure, no I/O.
//
// The ideas come from talos (github.com/benmarte/talos, no license, no code
// used): per-stage cost and a budget on fix rounds, forbidden files, a PR that
// must close its issue, the goal's state visible on GitHub, and a block that
// says whether it rests on a rule or on a judgment. What changes here is who
// does it. In talos the orchestrator has to remember to run a script; in the
// mod each one is a hook, so it happens whether or not anyone remembers.
// (stagedForbidden asks git only through the `run` its caller passes.)

import { commandsOf, GIT_VALUE, programOf } from './approve.mjs'

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
  // Per model, the four components a price needs.
  if (u) {
    const m = String(u.model || 'unknown')
    const k = ((acc.byModel ??= {})[m] ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })
    const n = (x) => (Number.isFinite(Number(u[x])) ? Number(u[x]) : 0)
    // The part of the cache writes that is 1-hour (the API's cache_creation split, R-C3-13); the rest is 5-minute.
    const w1h = Math.min(n('cache_creation_input_tokens'), Number(u.cache_creation?.ephemeral_1h_input_tokens) || 0)
    const into = (t) => {
      t.input += n('input_tokens')
      t.output += n('output_tokens')
      t.cacheWrite += n('cache_creation_input_tokens')
      t.cacheRead += n('cache_read_input_tokens')
      if (w1h > 0) t.cacheWrite1h = (t.cacheWrite1h || 0) + w1h
    }
    into(k)
    // A request whose prompt is over its model's price step is priced at the step row:
    // its tokens are also counted in `stepped` (they stay in the totals above).
    const step = priceFor(m)?.step
    if (step && contextOf(u) > step.above_tokens) into((k.stepped ??= { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }))
  }
  return acc
}

// ------------------------------------------------------------------ cost and context

/**
 * $ per million tokens: input, output, cache read. A 5-minute cache write is 1.25 x input,
 * a 1-hour one 2 x input (CACHE_WRITE_5M, CACHE_WRITE_1H).
 * Verified against Anthropic's pricing page on 2026-09-23 (Sonnet 5.5 and Haiku 5.5
 * on 2026-10-19; every 5.5 row and both cache-write multipliers again on 2026-11-02,
 * https://platform.claude.com/docs/en/about-claude/pricing). A `step` is the price row for a request whose prompt (`contextOf`)
 * is strictly over `above_tokens`. A model not listed has no price: its cost shows
 * as unknown, never a guess. The `prices` setting adds or overrides entries.
 */
export const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, step: { above_tokens: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
}

/** The price entry for a model id, ignoring a date suffix and a [1m] tag. */
export function priceFor(model, extra = {}) {
  const id = String(model || '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')
  return extra[id] || extra[model] || PRICES[id] || null
}

/** API-equivalent cost of an account in $, and the models that had no price. */
export function costOf(acc, extra = {}) {
  let usd = 0
  const unpriced = []
  for (const [m, k] of Object.entries((acc && acc.byModel) || {})) {
    const p = priceFor(m, extra)
    if (!p) {
      if (k.input + k.output + k.cacheWrite + k.cacheRead > 0) unpriced.push(m)
      continue
    }
    usd += modelCost(p, k)
  }
  return { usd, unpriced }
}

export const CACHE_WRITE_5M = 1.25
export const CACHE_WRITE_1H = 2

/** $ of one model's four token components at price entry p (its step row included). */
function modelCost(p, k) {
  const at = (q, t) => {
    const w1h = Math.min(t.cacheWrite || 0, t.cacheWrite1h || 0)
    return (t.input * q.input + t.output * q.output + ((t.cacheWrite || 0) - w1h) * q.input * CACHE_WRITE_5M + w1h * q.input * CACHE_WRITE_1H + t.cacheRead * q.cacheRead) / 1e6
  }
  // Stepped tokens are in the totals at the base row; move them to the step row.
  return at(p, k) + (p.step && k.stepped ? at(p.step, k.stepped) - at(p, k.stepped) : 0)
}

/**
 * An account as _orch/spend.json holds it (R-C3-13): a copy with each model's `usd` beside its tokens and
 * the total's `usd`. A model with no price gets `usd: null`, never a guess.
 */
export function withCosts(acc, extra = {}) {
  const out = JSON.parse(JSON.stringify(acc || {}))
  let total = 0
  for (const [m, k] of Object.entries((out.byModel ??= {}))) {
    const p = priceFor(m, extra)
    k.usd = p ? modelCost(p, k) : null
    if (k.usd != null) total += k.usd
  }
  out.usd = total
  return out
}

export function shortUsd(c) {
  if (!c) return ''
  const v = c.usd
  const s = v < 0.01 && v > 0 ? '<$0.01' : '$' + (v < 10 ? v.toFixed(2) : v.toFixed(1))
  return c.unpriced.length ? (v > 0 ? s + '+?' : '$?') : s
}

/** Context windows by model; anything else falls back to the session's measured window or 200K. */
export const WINDOWS = { 'claude-opus-5-5': 1_000_000, 'claude-sonnet-5-5': 1_000_000, 'claude-haiku-5-5': 1_000_000 }

export function windowFor(model, fallback = 200_000) {
  const id = String(model || '')
  if (/\[1m\]/.test(id)) return 1_000_000
  return WINDOWS[id.replace(/-\d{8}$/, '')] || fallback
}

/** How full one request's prompt was: input + cache reads + cache writes. */
export function contextOf(u) {
  const n = (x) => (u && Number.isFinite(Number(u[x])) ? Number(u[x]) : 0)
  return n('input_tokens') + n('cache_read_input_tokens') + n('cache_creation_input_tokens')
}

/** green under 70% of the threshold, yellow up to it, red past it. */
export function ctxTone(pct, threshold) {
  if (pct == null) return undefined
  return pct >= threshold ? 'red' : pct >= threshold * 0.7 ? 'yellow' : 'green'
}

/** The message the mod sends a subagent that crossed its context threshold. */
export function contextNudge(pct) {
  return 'baton: your context is at ' + pct + '% of its window. Finish the node you have now: write your envelope and return your one line. If the work is bigger than one node, return SPLIT with the seams you found instead of pushing on.'
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

/**
 * Which node or phase an agent works for, from its name/description ("F17 impl", "verify XT17", "P3 phase").
 * With the run's own ids (`ids.nodes`, `ids.phases`: _orch/nodes/*, graph.yaml and the phase ids, Q-15) a
 * label's token names a node or phase only when the run has that id, whatever its shape; without them, by
 * shape alone (`T<n>` a node, `P<n>` a phase).
 */
export function workOf(label, ids) {
  const s = String(label ?? '')
  if (!ids) {
    const node = /\b(T\d+[a-z]?)\b/.exec(s)
    const phase = /\b(P\d+)\b/.exec(s)
    return { node: node ? node[1] : null, phase: phase ? phase[1] : null }
  }
  const tokens = s.split(/[\s,;:()[\]{}<>"'`|/]+/).flatMap((t) => [t, t.replace(/\.+$/, '')]).filter(Boolean)
  const pick = (list) => {
    const known = new Set(list ?? [])
    return tokens.find((t) => known.has(t)) ?? null
  }
  return { node: pick(ids.nodes), phase: pick(ids.phases) }
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

/** The paths a `git add`, `git stage` or `git commit` names on the line (flags dropped); [] for anything else. */
export function gitAddPaths(command) {
  return stagingPlan(command, '/').named
}

/** A path joined onto a directory, `.` and `..` resolved (POSIX); an absolute path stands alone. */
function resolvePath(dir, p) {
  const parts = []
  for (const seg of (String(p).startsWith('/') ? String(p) : String(dir) + '/' + String(p)).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return '/' + parts.join('/')
}

/** A long option `w` (`--name` or `--name=v`) is `name` or a prefix of it at least `min` long, as git's parse-options accepts. */
const longIs = (w, name, min = 1) => {
  const n = w.slice(2).replace(/=.*$/, '')
  return n.length >= min && name.startsWith(n)
}

// git add / git stage: flags that change what is staged. Their options take no separate value.
// git commit: short letters and long names that take a value (the next word when not attached).
const COMMIT_VALUED_SHORT = 'mFCct'
const COMMIT_VALUED_LONG = ['message', 'file', 'reuse-message', 'reedit-message', 'template', 'author', 'date', 'cleanup', 'fixup', 'squash', 'trailer']

/**
 * What a command line would stage or commit, read with gateFor's shell reader (approve.mjs
 * commandsOf), as far as the line alone can tell:
 *   named   the paths written on the line after add/stage/commit (checked as names, always);
 *   asks    one read-only `git status` per broad form, in the directory the command resolves to
 *           (`cd`, `-C`, --git-dir, --work-tree, GIT_DIR=, GIT_WORK_TREE=), over its pathspecs:
 *           `.`, a directory, a glob, -A/--all, -u/--update, -p, commit -a/--all or a pathspec;
 *           -f/--force also lists ignored files;
 *   reason  set when the line cannot be read for this (too deep, a pathspec file, a shell alias).
 * `cwd` is the directory the command runs in. Pure.
 */
export function stagingPlan(command, cwd) {
  const plan = { named: [], asks: [], reason: null }
  let cmds
  try {
    cmds = commandsOf(command)
  } catch {
    if (/\bgit\b/.test(String(command)) && /\b(add|stage|commit)\b/.test(String(command))) plan.reason = 'the line is too deep to read'
    return plan
  }
  let dir = String(cwd || '/')
  for (const { argv, assigns } of cmds) {
    const p = programOf(argv[0])
    if (p === 'cd' || p === 'pushd') {
      const t = argv.slice(1).find((w) => !w.startsWith('-'))
      if (t !== undefined && !/^[~$]/.test(t)) dir = resolvePath(dir, t)
      continue
    }
    if (p === 'git') gitStaging(argv.slice(1), dir, assigns, plan, new Map())
  }
  return plan
}

/** One git command's part of the plan (see stagingPlan). `aliases` are those set on the line with -c alias.x=... */
function gitStaging(a, dir, assigns, plan, aliases, depth = 0) {
  if (depth > 8) {
    plan.reason = 'an alias refers to itself'
    return
  }
  const globals = []
  let at = dir
  for (const s of assigns) {
    const m = /^GIT_(DIR|WORK_TREE)=([\s\S]*)$/.exec(s)
    if (m) globals.push((m[1] === 'DIR' ? '--git-dir=' : '--work-tree=') + resolvePath(dir, m[2]))
  }
  a = a.slice()
  while (a.length && /^-/.test(a[0] ?? '')) {
    const w = a.shift() ?? ''
    if (w === '--') break
    const eq = w.indexOf('=')
    const name = eq < 0 ? w : w.slice(0, eq)
    const value = () => (eq < 0 ? a.shift() ?? '' : w.slice(eq + 1))
    if (w === '-C') at = resolvePath(at, a.shift() ?? '')
    else if (name === '--git-dir' || name === '--work-tree') globals.push(name + '=' + resolvePath(at, value()))
    else if (w === '-c') {
      const v = a.shift() ?? ''
      globals.push('-c', v)
      const m = /^alias\.([^=]+)=([\s\S]*)$/i.exec(v)
      if (m) aliases.set((m[1] ?? '').toLowerCase(), m[2] ?? '')
    } else if (GIT_VALUE.includes(w)) a.shift()
  }
  const sub = a.shift()
  if (sub === undefined) return
  if (sub !== 'add' && sub !== 'stage' && sub !== 'commit' && aliases.has(sub.toLowerCase())) {
    const alias = aliases.get(sub.toLowerCase()) ?? ''
    // Re-read in the directory resolved so far; the globals already read stay on every ask.
    const before = plan.asks.length
    if (alias.startsWith('!')) {
      // A shell alias: its line, with the words after it, read as commands run in the same place.
      for (const c of commandsOf(alias.slice(1) + ' ' + a.join(' '))) if (programOf(c.argv[0]) === 'git') gitStaging(c.argv.slice(1), at, c.assigns, plan, aliases, depth + 1)
    } else gitStaging([...(commandsOf(alias)[0]?.argv ?? []), ...a], at, [], plan, aliases, depth + 1)
    for (const q of plan.asks.slice(before)) q.argv.splice(1, 0, ...globals)
    return
  }
  const pathspecs = []
  let broad = false // the whole tree when no pathspec is given
  let force = false
  let dryRun = false
  let fromFile = false
  let valueNext = false
  let dd = false
  const isCommit = sub === 'commit'
  if (sub !== 'add' && sub !== 'stage' && !isCommit) return
  let tracked = isCommit // only tracked files: commit, add -u/-p/-i/-e
  for (const w of a) {
    if (valueNext) valueNext = false
    else if (dd || !w.startsWith('-') || w === '-') pathspecs.push(w)
    else if (w === '--') dd = true
    else if (w.startsWith('--')) {
      if (longIs(w, 'pathspec-from-file', 10)) fromFile = true
      else if (longIs(w, 'dry-run', 2)) dryRun = true
      else if (isCommit) {
        if (w === '--all' || longIs(w, 'interactive', 3) || longIs(w, 'patch', 3)) broad = true
        else if (!w.includes('=') && COMMIT_VALUED_LONG.some((n) => longIs(w, n, 3))) valueNext = true
      } else if (longIs(w, 'all') || longIs(w, 'no-ignore-removal', 4)) broad = true
      else if (longIs(w, 'update') || longIs(w, 'patch', 3) || longIs(w, 'interactive', 3) || longIs(w, 'edit', 2)) broad = tracked = true
      else if (longIs(w, 'force')) force = true
    } else {
      for (let k = 1; k < w.length; k++) {
        const ch = w[k] ?? ''
        if (isCommit) {
          if (ch === 'a' || ch === 'p') broad = true
          if (ch === 'S' || ch === 'u') break // an optional value, attached
          if (COMMIT_VALUED_SHORT.includes(ch)) {
            valueNext = k === w.length - 1
            break
          }
        } else if (ch === 'A') broad = true
        else if ('upie'.includes(ch)) broad = tracked = true
        else if (ch === 'f') force = true
        else if (ch === 'n') dryRun = true
      }
    }
  }
  plan.named.push(...pathspecs)
  if (dryRun) return
  if (fromFile) {
    plan.reason = 'it reads its paths from a file'
    return
  }
  if (!pathspecs.length && !broad) return
  plan.asks.push({
    cwd: at,
    tracked,
    argv: ['git', ...globals, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=' + (tracked ? 'no' : 'all'), ...(force && !tracked ? ['--ignored=traditional'] : []), '--', ...(pathspecs.length ? pathspecs : [':/'])],
  })
}

/**
 * The paths a `git status --porcelain=v1 -z` answer shows would be staged or committed: every
 * entry except one that only deletes (a deleted secret leaving the tree is not a secret committed),
 * and, when only tracked files are taken (`tracked`), an untracked (`??`) or ignored (`!!`) one.
 */
export function stagedPaths(stdout, { tracked = false } = {}) {
  const out = []
  for (const e of String(stdout ?? '').split('\0')) {
    if (e.length < 4) continue
    const xy = e.slice(0, 2)
    if (/^[ D][ D]$/.test(xy)) continue
    if (tracked && (xy === '??' || xy === '!!')) continue
    out.push(e.slice(3))
  }
  return out
}

/**
 * The forbidden paths a command line would stage or commit: the names on the line, then for each
 * broad form what git says it would include, asked through `run(argv, { cwd })` (register.js passes
 * $.process.run). Resolves to { hits, reason }: reason is a plain sentence when git could not say
 * (fail closed: the caller refuses), else null.
 */
export async function stagedForbidden(command, { cwd, run, patterns = FORBIDDEN_DEFAULT }) {
  const plan = stagingPlan(command, cwd)
  const hits = forbiddenHits(plan.named, patterns)
  if (hits.length) return { hits, reason: null }
  if (plan.reason) return { hits: [], reason: plan.reason }
  for (const q of plan.asks) {
    let r
    try {
      r = await run(q.argv, { cwd: q.cwd })
    } catch (err) {
      return { hits: [], reason: 'git status could not run in ' + q.cwd + ' (' + String((err && err.message) || err) + ')' }
    }
    if (!r || r.exitCode !== 0) return { hits: [], reason: 'git status failed in ' + q.cwd + ': ' + String((r && r.stderr) || 'exit ' + (r && r.exitCode)).trim().slice(0, 200) }
    if (r.isStdoutTruncated) return { hits: [], reason: 'git status listed more than the mod can read in ' + q.cwd }
    const found = forbiddenHits(stagedPaths(r.stdout, q), patterns)
    if (found.length) return { hits: found, reason: null }
  }
  return { hits: [], reason: null }
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
