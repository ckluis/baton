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
 *   reason  set when the line cannot be read for this (too deep, a pathspec file), when the
 *           directory, repository, subcommand or paths a staging command uses are not on the line,
 *           or when a line that may stage also does what this reader does not follow (unfollowed:
 *           an alias, a function, source, eval, a shell fed its commands, a shell-reading variable).
 * `cwd` is the directory the command runs in, `home` the user's home directory (absent: `~` and
 * $HOME are not known, and `needsHome` says the plan wanted them). Pure.
 *
 * What the line spells it works out: `~`, $HOME, $PWD, $OLDPWD and `cd -`, pushd/popd, a plain
 * VAR=value set earlier on the line, export/declare -x/env of GIT_DIR, GIT_WORK_TREE and
 * GIT_INDEX_FILE, env -C. Anything else in a word that matters (another variable, $( ), backticks,
 * a loop or read variable) makes that word unread; so does a git command fed by xargs or found in
 * another program's words (find -exec ...). A line with a subshell, a pipe or a background job, and
 * a child shell, may scope a cd or an assignment: what was in effect before it is kept as well.
 */
export function stagingPlan(command, cwd, { home } = {}) {
  const plan = { named: [], asks: [], reason: null, needsHome: false }
  const line = String(command ?? '')
  let cmds
  /** @type {string[]} */
  const notes = []
  try {
    cmds = commandsOf(line, notes)
  } catch {
    if (/\bgit\b/i.test(line) && /\b(add|stage|commit)\b/.test(line)) plan.reason = 'the line is too deep to read'
    return plan
  }
  // One rule (FF1 attempt 3, Q-FF1-1 = A): a line that stages or commits and also does something this
  // reader does not follow is refused, whatever it is, rather than read as if that part were not there.
  const stages = mayStage(line, cmds)
  const why = stages ? unfollowed(line, cmds, notes) : null
  if (why) plan.reason = 'the line ' + why + ', and the mod cannot follow that to see what it stages'
  const scoped = /[(`|&]/.test(line.replace(/&&|\|\|/g, ''))
  /** @type {Map<string, string[]>} shell variables set on the line: the values each may hold */
  const vars = new Map()
  /** @type {{ dir: string, old: string, stack: string[], env: Record<string, string> }[]} where the line may stand */
  let ctxs = [{ dir: String(cwd || '/'), old: UNREAD, stack: [], env: {} }]
  const word = (w, ctx) => expandWord(w, ctx, vars, home, plan)
  const set = (list) => {
    const seen = new Map()
    for (const c of list) seen.set(JSON.stringify(c), c)
    if (seen.size > MAX_PLACES) plan.reason = plan.reason ?? 'the line may run in too many places to check'
    return [...seen.values()].slice(0, MAX_PLACES)
  }
  const setVar = (name, vals, keep) => vars.set(name, [...new Set([...(keep ? vars.get(name) ?? [UNREAD] : []), ...vals])].slice(0, MAX_PLACES))
  const setEnv = (name, valsOf, keep) => {
    ctxs = set(ctxs.flatMap((c) => [...(keep ? [c] : []), ...valsOf(c).map((v) => ({ ...c, env: v === null ? omit(c.env, name) : { ...c.env, [name]: v } }))]))
  }
  for (const { argv, assigns, pre = [], shell = false, from = null } of cmds) {
    const keep = scoped || shell
    if (pre.includes('for') || pre.includes('select')) {
      if (argv[0] !== undefined) setVar(argv[0], [UNREAD], false)
      continue
    }
    if (!argv.length) {
      // VAR=value alone: a shell variable; GIT_* may already be exported, so git may see it or not.
      for (const s of assigns) {
        const [name, rhs] = splitAssign(s)
        setVar(name, ctxs.flatMap((c) => word(rhs, c)), keep)
        if (GIT_ENV.includes(name)) setEnv(name, (c) => word(rhs, c), true)
      }
      continue
    }
    let p = programOf(argv[0])
    let rest = argv.slice(1)
    if (/[$`~]/.test(argv[0] ?? '')) {
      const progs = new Set(ctxs.flatMap((c) => word(argv[0], c)).map((w) => programOf(w)))
      if ([...progs].some((w) => w.includes(UNREAD))) {
        if (stages || rest.some((w) => /^(add|stage|commit)$/.test(w))) plan.reason = plan.reason ?? 'the program it runs is not written on the line'
        continue
      }
      p = progs.has('git') ? 'git' : progs.size === 1 ? [...progs][0] ?? '' : ''
    }
    if (p === 'export' || p === 'declare' || p === 'typeset' || p === 'local' || p === 'readonly') {
      const exported = p === 'export' || rest.some((w) => /^-[a-z]*x/.test(w))
      for (const w of rest) {
        if (w.startsWith('-')) continue
        const [name, rhs] = splitAssign(w)
        if (rhs !== null) setVar(name, ctxs.flatMap((c) => word(rhs, c)), keep)
        if (!GIT_ENV.includes(name)) continue
        const vals = rhs !== null ? null : vars.get(name) ?? [UNREAD]
        setEnv(name, (c) => (vals ?? word(rhs ?? '', c)), keep || !exported)
      }
      continue
    }
    if (p === 'unset') {
      for (const w of rest) {
        if (w.startsWith('-')) continue
        if (keep) setVar(w, [''], true)
        else vars.set(w, [''])
        if (GIT_ENV.includes(w)) setEnv(w, () => [null], keep)
      }
      continue
    }
    if (p === 'read' || p === 'mapfile' || p === 'readarray' || p === 'getopts' || (p === 'printf' && rest[0] === '-v')) {
      for (const w of p === 'printf' ? rest.slice(1, 2) : rest.filter((x) => !x.startsWith('-'))) setVar(w, [UNREAD], false)
      continue
    }
    if (p === 'cd' || p === 'pushd' || p === 'popd') {
      const moved = ctxs.flatMap((c) => moveTo(p, rest, c, word))
      ctxs = set(keep ? [...ctxs, ...moved] : moved)
      continue
    }
    if (p !== 'git') continue
    const fed = from !== null ? 'the words of ' + from : pre.some((w) => programOf(w) === 'xargs') ? 'xargs' : null
    for (const c of ctxs) {
      const at = chdirOf(pre, c, word)
      const env = envOf(pre, assigns, c, word)
      const variants = expandArgs(rest, c, word)
      if (!variants) {
        plan.reason = plan.reason ?? 'the line may run in too many places to check'
        continue
      }
      for (const dir of at) for (const e of env) for (const v of variants) gitStaging(v, dir, e, plan, new Map(), fed)
    }
  }
  return plan
}

/**
 * Whether a line may stage or commit: it says git and add, stage or commit somewhere, in its text or
 * in its words as the shell reads them (quotes removed, $'...' decoded), so an alias or function body,
 * a here-string or a string another program runs counts too.
 */
function mayStage(line, cmds) {
  const text = [line, ...cmds.flatMap((c) => [...c.pre, ...c.argv])].join('\n')
  return /\bgit\b/i.test(text) && /\b(?:add|stage|commit)\b/i.test(text)
}

/**
 * Variables that change how the shell reads the words, paths or commands of the rest of a line, so a
 * line that sets one is not read as the shell reads it. From the bash manual (Shell Variables, Bash
 * Variables) and zshparam for zsh's own names:
 *   IFS                         how expansions are split into words (and how read splits)
 *   CDPATH, cdpath              where cd looks for a relative directory
 *   PATH, path, EXECIGNORE      which program a command name runs
 *   (HOME, what ~ and a bare cd mean, is not listed: a line that sets it already leaves ~ unread, and
 *   the mod never names that variable in a string, R-C3-13)
 *   PWD, OLDPWD, DIRSTACK, dirstack   what cd -, ~-, ~+, pushd and popd use
 *   GLOBIGNORE                  filename expansion (setting it also turns on dotglob)
 *   BASH_ENV, ENV               a file a child shell sources before it runs its commands
 *   SHELLOPTS, BASHOPTS, POSIXLY_CORRECT, BASH_COMPAT   shell options (posix mode expands aliases)
 *   BASH_ALIASES, BASH_CMDS, aliases, galiases, saliases, functions, commands, nameddirs, options,
 *   fpath                       aliases, functions, hashed commands, named directories and options
 *                               set through variables
 */
const SHELL_READS = ['IFS', 'CDPATH', 'cdpath', 'PATH', 'path', 'EXECIGNORE', 'PWD', 'OLDPWD', 'DIRSTACK', 'dirstack', 'GLOBIGNORE', 'BASH_ENV', 'ENV', 'SHELLOPTS', 'BASHOPTS', 'POSIXLY_CORRECT', 'BASH_COMPAT', 'BASH_ALIASES', 'BASH_CMDS', 'aliases', 'galiases', 'saliases', 'functions', 'commands', 'nameddirs', 'options', 'fpath']
/** Builtins that change how the shell reads what follows, and what each does. */
const SHELL_CHANGES = {
  alias: 'defines an alias',
  source: 'sources a file',
  '.': 'sources a file',
  shopt: 'changes shell options',
  setopt: 'changes shell options',
  unsetopt: 'changes shell options',
  emulate: 'changes shell options',
  enable: 'turns shell builtins on or off',
  hash: 'sets where a command name runs from',
  trap: 'sets a trap, which runs commands of its own',
  autoload: 'loads functions',
}
/** Programs that run code given as text on the line, with the options that give it (awk: any program calling out). */
const INLINE_CODE = /^(?:python[0-9.]*|pypy[0-9.]*|perl|ruby|node|nodejs|bun|deno|php|osascript|pwsh|powershell|lua|rscript|tclsh)$/
const INLINE_FLAG = /^(?:-[a-zA-Z]*[ceE]|-[pr]|--eval|--print|-command|eval)$/i
/** `set` options that only stop on errors or trace (o names one of SET_PLAIN_O): any other changes how the shell reads (-o posix, -k, -B ...). */
const SET_PLAIN = /^[-+][euxvEo]+$/
const SET_PLAIN_O = ['pipefail', 'errexit', 'nounset', 'xtrace', 'verbose', 'errtrace']

/**
 * What a line does that this reader does not follow, as a phrase for the reason ("defines an alias"),
 * or null: an alias or a function defined, text sourced or run through eval, a shell fed its commands
 * from its input or a file, a shell option, trap, hash or builtin changed, a variable of SHELL_READS
 * set (by assignment, export/declare/local/readonly/typeset, read, a for loop or ${NAME:=...}), a
 * name reference, a function imported through the environment, or code run by another program
 * (python -c, a shell named among another program's words).
 */
function unfollowed(line, cmds, notes) {
  if (notes.includes('function')) return 'defines a function'
  if (notes.includes('eval')) return 'runs text through eval'
  if (notes.includes('shell')) return 'runs a shell that reads its commands from its input or a file'
  if (notes.includes('shell-env')) return 'runs a shell with an environment, directory or options of its own'
  const reads = (name) => (SHELL_READS.includes(name) ? 'sets ' + name + ', which changes how the shell reads words, paths or commands' : null)
  const viaDefault = new RegExp('\\$\\{(' + SHELL_READS.join('|') + ')(?:\\[[^\\]]*\\])?:?=').exec(line)
  if (viaDefault) return reads(viaDefault[1] ?? '')
  for (const c of cmds) {
    if ([...c.pre, ...c.argv].some((w) => /^BASH_FUNC_/.test(w))) return 'imports a function through the environment'
    for (const s of c.assigns) {
      const r = reads(splitAssign(s)[0])
      if (r) return r
    }
    if (!c.argv.length) continue
    const p = programOf(c.argv[0])
    const rest = c.argv.slice(1)
    if (c.pre.includes('for') || c.pre.includes('select')) {
      const r = reads(c.argv[0] ?? '')
      if (r) return r
      continue
    }
    if (Object.hasOwn(SHELL_CHANGES, p)) return SHELL_CHANGES[/** @type {keyof typeof SHELL_CHANGES} */ (p)]
    if (p === 'export' || p === 'declare' || p === 'typeset' || p === 'local' || p === 'readonly') {
      if (rest.some((w) => /^-[a-zA-Z]*n/.test(w))) return 'makes a name reference (' + p + ' -n)'
      for (const w of rest) {
        const r = w.startsWith('-') ? null : reads(splitAssign(w)[0])
        if (r) return r
      }
      continue
    }
    if (p === 'read' || p === 'mapfile' || p === 'readarray' || p === 'getopts' || p === 'printf') {
      const names = p === 'printf' ? (rest[0] === '-v' ? rest.slice(1, 2) : []) : rest.filter((w) => !w.startsWith('-'))
      for (const w of names) {
        const r = reads(w)
        if (r) return r
      }
      continue
    }
    if (p === 'set') {
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i] ?? ''
        if (w === '--' || !/^[-+]/.test(w)) break
        if (!SET_PLAIN.test(w)) return 'changes shell options with set'
        if (w.includes('o') && !SET_PLAIN_O.includes(rest[++i] ?? '')) return 'changes shell options with set'
      }
      continue
    }
    if (INLINE_CODE.test(p) && rest.some((w) => INLINE_FLAG.test(w))) return 'runs code through ' + p
    if (/^[gmn]?awk$/.test(p) && rest.some((w) => /system|\|/.test(w))) return 'runs commands through ' + p
    if (p === 'git' || ['echo', 'printf', 'print', 'which', 'type', 'whence', 'where', 'man', 'help'].includes(p)) continue
    const inner = rest.find((w) => /^(?:sh|bash|zsh|dash|ksh|mksh|ash|fish)$/.test(programOf(w)) || INLINE_CODE.test(programOf(w)))
    if (inner !== undefined) return 'runs ' + programOf(inner) + ' through ' + p
  }
  return null
}

/** A word's unknown part: the value of a variable, substitution or `~user` the line does not show. */
const UNREAD = '\u0000'
const MAX_PLACES = 16
const GIT_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']
const omit = (o, k) => Object.fromEntries(Object.entries(o).filter(([n]) => n !== k))
/** NAME=value as [name, value]; a bare NAME as [name, null]. */
const splitAssign = (s) => {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\])?\+?=([\s\S]*)$/.exec(s)
  return m ? [m[1] ?? '', m[2] ?? ''] : [s, null]
}

/**
 * The values a word may take where the line stands (`ctx`): `~` and `~/`, $NAME and ${NAME} filled
 * from the variables set on the line ($HOME from `home`, $PWD and $OLDPWD from ctx); any other
 * expansion is the UNREAD mark in its place.
 */
function expandWord(w, ctx, vars, home, plan) {
  // $HOME or ${HOME} leading a word is the home directory as `~` names it (known only when the caller
  // gives it); a line that sets that variable itself leaves both unread.
  const homeSet = [...vars.keys()].some((k) => /^HOME$/.test(k))
  let s = String(w)
    .replace(/\$\((?:[^()]|\([^()]*\))*\)?|`[^`]*`?/g, UNREAD)
    .replace(/^(?:\$\{HOME\}|\$HOME(?![A-Za-z0-9_]))(?=\/|$)/, '~')
  let heads = ['']
  if (homeSet && s.startsWith('~')) {
    heads = [UNREAD]
    s = s.replace(/^~[^/]*/, '')
  } else if (s === '~' || s.startsWith('~/')) {
    if (home === undefined) plan.needsHome = true
    heads = [home ?? UNREAD]
    s = s.slice(1)
  } else if (s.startsWith('~')) {
    heads = [UNREAD]
    s = s.replace(/^~[^/]*/, '')
  }
  const lookup = (name) => {
    if (name === 'PWD') return [ctx.dir]
    if (name === 'OLDPWD') return [ctx.old]
    return vars.get(name) ?? [UNREAD]
  }
  const parts = []
  let last = 0
  for (const m of s.matchAll(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*)|(\{[^}]*\}?|[\s\S])?)/g)) {
    parts.push([s.slice(last, m.index)])
    last = (m.index ?? 0) + m[0].length
    const name = m[1] ?? m[2]
    if (name !== undefined) parts.push(lookup(name))
    else parts.push([m[3] === undefined ? '$' : UNREAD])
  }
  parts.push([s.slice(last)])
  let out = heads
  for (const p of parts) {
    out = [...new Set(out.flatMap((h) => p.map((x) => h + x)))]
    if (out.length > MAX_PLACES) return [UNREAD]
  }
  return out
}

/** A git command's words, each expanded; a value with blanks may be one word or several. Null when too many. */
function expandArgs(words, ctx, word) {
  let outs = [[]]
  for (const w of words) {
    const alts = []
    for (const v of /[$`~]/.test(w) ? word(w, ctx) : [w]) {
      alts.push([v])
      // Unquoted, a value with blanks is split; a word with blanks of its own was quoted, so it is not.
      if (v !== w && !/\s/.test(w) && (/\s/.test(v) || v === '')) alts.push(v.split(/\s+/).filter(Boolean))
    }
    outs = outs.flatMap((o) => alts.map((a) => [...o, ...a]))
    if (outs.length > MAX_PLACES) return null
  }
  return outs
}

/** Where cd, pushd or popd (words `rest`) leaves the line, from ctx: the places it may be. */
function moveTo(p, rest, ctx, word) {
  const ops = rest.filter((w) => !/^-[LPe@]+$/.test(w) && w !== '--')
  const t = ops[0]
  const to = (dirs, stack) => dirs.map((d) => ({ ...ctx, dir: d.includes(UNREAD) || ctx.dir.includes(UNREAD) ? UNREAD : resolvePath(ctx.dir, d), old: ctx.dir, stack }))
  if (p === 'popd') {
    if (t !== undefined || !ctx.stack.length) return [{ ...ctx, dir: UNREAD, old: ctx.dir }]
    return [{ ...ctx, dir: ctx.stack[ctx.stack.length - 1] ?? UNREAD, old: ctx.dir, stack: ctx.stack.slice(0, -1) }]
  }
  const stack = p === 'pushd' ? [...ctx.stack, ctx.dir] : ctx.stack
  if (t === undefined) {
    if (p === 'pushd') return [{ ...ctx, dir: ctx.stack[ctx.stack.length - 1] ?? UNREAD, old: ctx.dir, stack: [...ctx.stack.slice(0, -1), ctx.dir] }]
    return to(word('~', ctx), stack)
  }
  if (t === '-') return to([ctx.old], stack)
  if (/^[+-]\d/.test(t)) return to([UNREAD], stack)
  return to(word(t, ctx), stack)
}

/** The directories a git command starts in: the line's, or env -C / --chdir, sudo -D / --chdir in front of it. */
function chdirOf(pre, ctx, word) {
  let dirs = [ctx.dir]
  for (let i = 0; i < pre.length; i++) {
    const w = pre[i] ?? ''
    let v = null
    if (w === '-C' || w === '-D' || /^--chd?i?r?$/.test(w)) v = pre[++i] ?? UNREAD
    else if (/^--chd?i?r?=/.test(w)) v = w.slice(w.indexOf('=') + 1)
    else if (/^-[A-Za-z]*[CD].+/.test(w) && !w.startsWith('--')) v = w.slice(w.search(/[CD]/) + 1)
    if (v === null) continue
    const vals = word(v, ctx)
    dirs = dirs.flatMap((d) => vals.map((x) => (d.includes(UNREAD) || x.includes(UNREAD) ? UNREAD : resolvePath(d, x))))
  }
  return [...new Set(dirs)]
}

/** The GIT_* environment a git command sees: the line's exports, then env -i / -u and assignments in front of it. */
function envOf(pre, assigns, ctx, word) {
  let envs = [{ ...ctx.env }]
  for (let i = 0; i < pre.length; i++) {
    const w = pre[i] ?? ''
    if (w === '-i' || w === '-' || w === '--ignore-environment' || (/^-[A-Za-z]*i/.test(w) && !w.startsWith('--') && programOf(pre[i - 1]) === 'env')) envs = [{}]
    else if ((w === '-u' || w === '--unset') && GIT_ENV.includes(pre[i + 1] ?? '')) {
      const n = pre[++i] ?? ''
      envs = envs.map((e) => omit(e, n))
    } else if (/^--unset=/.test(w)) {
      const n = w.slice(8)
      envs = envs.map((e) => omit(e, n))
    } else if (assigns.includes(w)) {
      const [name, rhs] = splitAssign(w)
      if (!GIT_ENV.includes(name) || rhs === null) continue
      const vals = word(rhs, ctx)
      envs = envs.flatMap((e) => vals.map((v) => ({ ...e, [name]: v })))
    }
  }
  return envs.slice(0, MAX_PLACES)
}

/**
 * One git command's part of the plan (see stagingPlan): its words `a` (UNREAD marks what the line
 * does not show), started in `dir` with the GIT_* environment `env`. `aliases` are those set on the
 * line with -c alias.x=...; `fed` names what adds words to it (xargs, find -exec), else null.
 */
function gitStaging(a, dir, env, plan, aliases, fed, depth = 0) {
  if (depth > 8) {
    plan.reason = 'an alias refers to itself'
    return
  }
  const unread = (why) => {
    plan.reason = plan.reason ?? why
  }
  const cli = [] // --git-dir / --work-tree values and -c settings, in order
  let at = dir
  a = a.slice()
  while (a.length && /^-/.test(a[0] ?? '')) {
    const w = a.shift() ?? ''
    if (w === '--') break
    const eq = w.indexOf('=')
    const name = eq < 0 ? w : w.slice(0, eq)
    const value = () => (eq < 0 ? a.shift() ?? '' : w.slice(eq + 1))
    if (w === '-C') {
      const v = a.shift() ?? ''
      at = at.includes(UNREAD) || v.includes(UNREAD) ? UNREAD : resolvePath(at, v)
    } else if (name === '--git-dir' || name === '--work-tree') cli.push([name, value()])
    else if (w === '-c') {
      const v = a.shift() ?? ''
      cli.push(['-c', v])
      const m = /^alias\.([^=]+)=([\s\S]*)$/i.exec(v)
      if (m) aliases.set((m[1] ?? '').toLowerCase(), m[2] ?? '')
    } else if (GIT_VALUE.includes(w)) a.shift()
  }
  // GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE, then --git-dir/--work-tree, read relative to where git ends up (after -C).
  let place = !at.includes(UNREAD)
  const abs = (v) => {
    if (v.includes(UNREAD) || !place) {
      place = false
      return v
    }
    return resolvePath(at, v)
  }
  const globals = []
  if (env.GIT_DIR !== undefined) globals.push('--git-dir=' + abs(env.GIT_DIR))
  if (env.GIT_WORK_TREE !== undefined) globals.push('--work-tree=' + abs(env.GIT_WORK_TREE))
  for (const [k, v] of cli) {
    if (k === '-c') {
      if (v.includes(UNREAD)) place = false
      globals.push('-c', v)
    } else globals.push(k + '=' + abs(v))
  }
  const index = env.GIT_INDEX_FILE !== undefined ? abs(env.GIT_INDEX_FILE) : null
  const sub = a.shift()
  if (sub === undefined) return
  if (sub.includes(UNREAD)) return unread('the git subcommand is not written on the line')
  if (sub !== 'add' && sub !== 'stage' && sub !== 'commit' && aliases.has(sub.toLowerCase())) {
    const alias = aliases.get(sub.toLowerCase()) ?? ''
    // Re-read in the directory resolved so far; the globals already read stay on every ask.
    const before = plan.asks.length
    if (alias.startsWith('!')) {
      // A shell alias: its line, with the words after it, read as commands run in the same place
      // (a word with an expansion in it is not on the line).
      for (const c of commandsOf(alias.slice(1) + ' ' + a.join(' ')))
        if (programOf(c.argv[0]) === 'git') gitStaging(c.argv.slice(1).map((w) => (/[$`]/.test(w) ? UNREAD : w)), at, {}, plan, aliases, fed, depth + 1)
    } else gitStaging([...(commandsOf(alias)[0]?.argv ?? []), ...a], at, {}, plan, aliases, fed, depth + 1)
    for (const q of plan.asks.slice(before)) {
      q.argv.splice(1, 0, ...globals)
      if (index !== null) q.env = { GIT_INDEX_FILE: index }
    }
    if (!place && plan.asks.length > before) unread('the repository it uses is not written on the line')
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
  plan.named.push(...pathspecs.map((p) => p.split(UNREAD).join('?')))
  if (dryRun) return
  if (fromFile) {
    plan.reason = 'it reads its paths from a file'
    return
  }
  if (fed !== null) return unread('its paths come from ' + fed + ', not from the line')
  if (pathspecs.some((p) => p.includes(UNREAD))) return unread('a path it stages is not written on the line')
  if (!pathspecs.length && !broad) return
  if (!place) return unread('the directory or repository it uses is not written on the line')
  plan.asks.push({
    cwd: at,
    tracked,
    argv: ['git', ...globals, 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=' + (tracked ? 'no' : 'all'), ...(force && !tracked ? ['--ignored=traditional'] : []), '--', ...(pathspecs.length ? pathspecs : [':/'])],
    ...(index !== null ? { env: { GIT_INDEX_FILE: index } } : {}),
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
 * or the line does not show what is staged (fail closed: the caller refuses), else null. `home` is
 * the user's home directory, used for `~` and $HOME when given; the mod never reads it (R-C3-13,
 * Q-FX7-1: no mod source builds a path from the home directory), so there a line that stages from
 * `~` is refused with a reason.
 */
export async function stagedForbidden(command, { cwd, run, patterns = FORBIDDEN_DEFAULT, home }) {
  const plan = stagingPlan(command, cwd, { home })
  const hits = forbiddenHits(plan.named, patterns)
  if (hits.length) return { hits, reason: null }
  if (plan.reason) return { hits: [], reason: plan.needsHome ? plan.reason + ': it uses ~ or $HOME, and the mod does not read the home directory' : plan.reason }
  for (const q of plan.asks) {
    let r
    try {
      r = await run(q.argv, q.env ? { cwd: q.cwd, env: q.env } : { cwd: q.cwd })
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
