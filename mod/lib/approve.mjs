// baton v7 approvals: which calls wait for the operator, and how answers read. Pure, no I/O.
//
// Two gates. A command gate holds an irreversible shell command from any
// agent at any depth (push, PR, release, hard reset, recursive delete) until
// the operator answers. A phase gate holds the prime's next dispatch after a
// sub-orchestrator reports DONE, until the operator approves the phase or
// sends it back with a reason.

// `re` is the v7.7 text match. It no longer decides what a command runs (gateFor's tokenizer does);
// it is kept for mentions only: text the shell does not run (quoted strings, heredoc bodies,
// comments, and the words of a program the tokenizer does not judge, such as echo) is still read
// with it, exactly as v7.7 read the whole line (the file-text false alarm D-P3-6 b, left for v7.7).
export const GATES = [
  { id: 'push', label: 'git push', re: /\bgit\s+push\b/ },
  { id: 'pr', label: 'open, merge or close a PR', re: /\bgh\s+pr\s+(create|merge|close)\b/ },
  { id: 'release', label: 'publish a release or package', re: /\bgh\s+release\s+create\b|\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b/ },
  { id: 'reset', label: 'discard work (reset --hard, clean -f, checkout -- .)', re: /\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-zA-Z]*f|\bgit\s+checkout\s+--\s+\./ },
  { id: 'rm', label: 'delete recursively', re: /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/ },
  { id: 'api', label: 'write through the GitHub API', re: null },
]

const gate = (id) => GATES.find((g) => g.id === id) ?? null

/** The v7.7 reading of a text: the first gate whose text match it contains. */
const mentioned = (text) => GATES.find((g) => g.re && g.re.test(text)) ?? null

/**
 * The gate a shell command line must wait at, or null. The line is read as the shell reads it:
 * split into simple commands (at ; & | && || newlines and parentheses, and inside $( ), backticks,
 * <( ), sh -c strings and eval), each stripped of assignments, shell keywords, wrappers (env,
 * command, sudo, xargs, nohup, time, timeout, ...) and the program's global options (git -C/-c/
 * --git-dir..., gh -R/--repo/--hostname), then judged by subcommand and flag set, flags split,
 * combined, long or after the operand. What the shell does not run is read as v7.7 read it (see
 * GATES). A line the reader cannot take apart is read the v7.7 way whole.
 */
export function gateFor(command) {
  const c = String(command ?? '')
  try {
    const { cmds, texts } = lex(c, 0)
    for (const cmd of cmds) {
      const g = judge(cmd.argv, cmd.stdin, 0)
      if (g) return g
    }
    for (const cmd of cmds) if (!judges(cmd.argv)) texts.push(cmd.raw)
    for (const t of texts) {
      const g = mentioned(t)
      if (g) return g
    }
    return null
  } catch {
    // Too deep to take apart: read it the v7.7 way, then once more with every quote and
    // substitution mark taken out, so a nested command still asks.
    return mentioned(c) ?? flat(c.replace(/[$()`"'\\{}]/g, ' '))
  }
}

/** A line with no quotes or substitutions left, read by the tokenizer alone. */
function flat(c) {
  for (const cmd of lex(c, 0).cmds) {
    const g = judge(cmd.argv, [], 0)
    if (g) return g
  }
  return null
}

// ------------------------------------------------------------------ the shell reader

const MAX_DEPTH = 16
const REDIRECT = /&>>|&>|>>|>\||>&|<&|<>|>|</y

/** The index of the `)` closing a `(` just before `i`, past quotes and nesting; src.length if none. */
function closeParen(src, i) {
  let depth = 1
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\\') i++
    else if (ch === "'") i = until(src, i + 1, "'")
    else if (ch === '"') i = closeQuote(src, i + 1)
    else if (ch === '`') i = until(src, i + 1, '`')
    else if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return i
  }
  return src.length
}

/** The index of the next unescaped `ch` from `i` (for `'` no escape applies); src.length if none. */
function until(src, i, ch) {
  for (; i < src.length; i++) {
    if (src[i] === '\\' && ch !== "'") i++
    else if (src[i] === ch) return i
  }
  return src.length
}

/** The index of the `"` closing a double-quoted string that starts at `i`, past $( ) and backticks. */
function closeQuote(src, i) {
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '\\') i++
    else if (ch === '"') return i
    else if (ch === '`') i = until(src, i + 1, '`')
    else if (ch === '$' && src[i + 1] === '(') i = closeParen(src, i + 2)
  }
  return src.length
}

/**
 * Split a command line into simple commands: { argv (words, quotes removed), raw (its source
 * text), stdin (heredoc bodies fed to it) }, and the texts the shell does not run (quoted strings,
 * heredoc bodies, comments). Commands inside $( ), backticks and <( ) are lexed in turn.
 */
function lex(src, depth) {
  if (depth > MAX_DEPTH) throw new Error('too deep')
  const out = { cmds: [], texts: [] }
  let argv = []
  let stdin = []
  let word = null
  let start = -1
  let dropNext = false
  const heredocs = []
  const n = src.length
  const sub = (inner) => {
    const r = lex(inner, depth + 1)
    out.cmds.push(...r.cmds)
    out.texts.push(...r.texts)
  }
  /** Run what `$(`/backtick substitutions in an unquoted heredoc body would run. */
  const subsIn = (body) => {
    for (let j = 0; j < body.length; j++) {
      if (body[j] === '\\') j++
      else if (body[j] === '`') {
        const k = until(body, j + 1, '`')
        sub(body.slice(j + 1, k))
        j = k
      } else if (body[j] === '$' && body[j + 1] === '(') {
        const k = closeParen(body, j + 2)
        sub(body.slice(j + 2, k))
        j = k
      }
    }
  }
  const add = (s, at) => {
    if (start < 0) start = at
    word = (word ?? '') + s
  }
  const endWord = () => {
    if (word === null) return
    if (dropNext) dropNext = false
    else argv.push(word)
    word = null
  }
  const endCmd = (at) => {
    endWord()
    if (argv.length) out.cmds.push({ argv, raw: src.slice(start, at), stdin })
    argv = []
    stdin = []
    start = -1
    dropNext = false
  }
  let i = 0
  while (i < n) {
    const ch = src[i]
    const two = src.slice(i, i + 2)
    if (ch === '\\') {
      if (src[i + 1] === '\n') i += 2
      else {
        add(src[i + 1] ?? '', i)
        i += 2
      }
    } else if (ch === "'") {
      const j = until(src, i + 1, "'")
      const text = src.slice(i + 1, j)
      add(text, i)
      out.texts.push(text)
      i = j + 1
    } else if (ch === '"') {
      const j = closeQuote(src, i + 1)
      const raw = src.slice(i + 1, j)
      subsIn(raw)
      add(raw.replace(/\\([$`"\\\n])/g, '$1'), i)
      out.texts.push(raw)
      i = j + 1
    } else if (ch === '`') {
      const j = until(src, i + 1, '`')
      sub(src.slice(i + 1, j))
      add(src.slice(i, j + 1), i)
      i = j + 1
    } else if (two === '$(' || ((two === '<(' || two === '>(') && word === null)) {
      const j = closeParen(src, i + 2)
      sub(src.slice(i + 2, j))
      add(src.slice(i, j + 1), i)
      i = j + 1
    } else if (ch === '#' && word === null) {
      const j = src.indexOf('\n', i)
      const k = j < 0 ? n : j
      out.texts.push(src.slice(i, k))
      i = k
    } else if (ch === ' ' || ch === '\t') {
      endWord()
      i++
    } else if (ch === '\n') {
      endCmd(i)
      i++
      for (const h of heredocs.splice(0)) {
        const lines = []
        let found = false
        while (i < n) {
          const j = src.indexOf('\n', i)
          const k = j < 0 ? n : j
          const line = src.slice(i, k)
          i = k + 1
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) {
            found = true
            break
          }
          lines.push(line)
        }
        const body = lines.join('\n')
        out.texts.push(body)
        h.stdin.push(body)
        if (!h.quoted) subsIn(body)
        if (!found) break
      }
    } else if (ch === '<' || ch === '>' || two === '&>') {
      // A redirection: an fd number before it is not a word, and its target is not one either.
      if (word !== null && /^\d+$/.test(word)) word = null
      else endWord()
      if (start < 0) start = i
      if (src.startsWith('<<<', i)) {
        i += 3
        dropNext = true
      } else if (two === '<<') {
        i += 2
        const strip = src[i] === '-'
        if (strip) i++
        while (src[i] === ' ' || src[i] === '\t') i++
        let delim = ''
        let quoted = false
        while (i < n && !/[\s;&|<>()]/.test(src[i])) {
          if (src[i] === "'" || src[i] === '"') {
            const j = until(src, i + 1, src[i])
            delim += src.slice(i + 1, j)
            quoted = true
            i = j + 1
          } else if (src[i] === '\\') {
            delim += src[i + 1] ?? ''
            quoted = true
            i += 2
          } else delim += src[i++]
        }
        heredocs.push({ delim, strip, quoted, stdin })
      } else {
        REDIRECT.lastIndex = i
        const m = REDIRECT.exec(src)
        i += m ? m[0].length : 1
        dropNext = true
      }
    } else if (ch === ';' || ch === '&' || ch === '|' || ch === '(' || ch === ')') {
      endCmd(i)
      i += two === '&&' || two === '||' || two === '|&' || two === ';;' ? 2 : 1
    } else {
      add(ch, i)
      i++
    }
  }
  endCmd(n)
  return out
}

// ------------------------------------------------------------------ judging one simple command

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', 'select', 'case', 'esac', '!', '{', '}', '[[', 'coproc', 'noglob', 'nocorrect', 'builtin', 'nohup', 'chronic', 'unbuffer'])
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish'])
/** Programs the tokenizer judges; any other program's words are read as a mention. */
const JUDGED = new Set(['git', 'gh', 'rm', 'find', 'npm', 'pnpm', 'yarn', 'cargo'])

const base = (w) => w.replace(/^.*\//, '')

/** Drop leading options from `a`; `withValue` names the options that take the next word. Stops at `--` (dropped) or the first operand. */
function dropOptions(a, withValue) {
  while (a.length && /^-./.test(a[0] ?? '')) {
    const w = a.shift() ?? ''
    if (w === '--') break
    if (withValue.includes(w)) a.shift()
  }
  return a
}

/** Strip assignments, keywords and wrappers off the front of argv: what program actually runs, with its words. */
function unwrap(argv) {
  let a = argv.slice()
  for (;;) {
    const w = a[0]
    if (w === undefined) return a
    const p = base(w)
    if (KEYWORDS.has(w) || ASSIGN.test(w)) a.shift()
    else if (p === 'env') {
      a.shift()
      while (a.length && (/^-/.test(a[0] ?? '') || ASSIGN.test(a[0] ?? ''))) {
        const o = a.shift() ?? ''
        if (o === '--') break
        if (o === '-u' || o === '--unset' || o === '-C' || o === '--chdir') a.shift()
        else if (o === '-S' || o === '--split-string') return [...splitWords(a.shift() ?? ''), ...a]
      }
    } else if (p === 'command') {
      a.shift()
      if (a[0] === '-v' || a[0] === '-V') return []
      dropOptions(a, [])
    } else if (p === 'exec') a.shift(), dropOptions(a, ['-a'])
    else if (p === 'time') a.shift(), dropOptions(a, ['-f', '-o', '--format', '--output'])
    else if (p === 'nice') a.shift(), dropOptions(a, ['-n', '--adjustment'])
    else if (p === 'ionice') a.shift(), dropOptions(a, ['-c', '-n', '-p', '-t'])
    else if (p === 'stdbuf') a.shift(), dropOptions(a, ['-i', '-o', '-e'])
    else if (p === 'caffeinate') a.shift(), dropOptions(a, ['-w', '-t'])
    else if (p === 'sudo' || p === 'doas') a.shift(), dropOptions(a, ['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '-R', '--user', '--group', '--host', '--prompt', '--chdir'])
    else if (p === 'timeout' || p === 'gtimeout') {
      a.shift()
      dropOptions(a, ['-s', '-k', '--signal', '--kill-after'])
      a.shift() // the duration
    } else if (p === 'xargs') a.shift(), dropOptions(a, ['-I', '-n', '-P', '-L', '-d', '-E', '-e', '-s', '-a', '--arg-file', '--delimiter', '--max-args', '--max-procs', '--max-lines', '--replace', '--max-chars', '--eof', '-J', '-R', '-S'])
    else return a
  }
}

/** A string the shell will run (sh -c, eval, env -S), split as a command line of its own. */
function splitWords(s) {
  const { cmds } = lex(s, 1)
  return cmds[0]?.argv ?? []
}

/** Flags of a program's words: short letters from clusters, long names (no =value), operands, and what follows `--`. */
function flags(words) {
  const short = new Set()
  const long = new Set()
  const pos = []
  const after = []
  let dd = false
  for (const w of words) {
    if (dd) after.push(w)
    else if (w === '--') dd = true
    else if (w.startsWith('--')) long.add(w.slice(2).replace(/=.*$/, ''))
    else if (/^-[A-Za-z]/.test(w)) for (const ch of w.slice(1)) short.add(ch)
    else pos.push(w)
  }
  return { short, long, pos, after, dd }
}

/** Is argv's program one the tokenizer judges (after unwrapping)? */
function judges(argv) {
  try {
    const a = unwrap(argv)
    const p = base(a[0] ?? '')
    return JUDGED.has(p) || SHELLS.has(p) || p === 'eval' || !a.length
  } catch {
    return false
  }
}

/** The gate one simple command waits at, or null. `stdin` holds the heredoc bodies fed to it. */
function judge(argv, stdin = [], depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('too deep')
  const a = unwrap(argv)
  const p = base(a.shift() ?? '')
  const line = (s) => {
    for (const cmd of lex(s, depth + 1).cmds) {
      const g = judge(cmd.argv, cmd.stdin, depth + 1)
      if (g) return g
    }
    return null
  }
  if (p === 'eval') return line(a.join(' '))
  if (SHELLS.has(p)) {
    let c = false
    while (a.length && /^[-+]/.test(a[0] ?? '')) {
      const o = a.shift() ?? ''
      if (o === '--' || o === '-') break
      if (o === '-o' || o === '+o' || o === '-O' || o === '+O' || o === '--rcfile' || o === '--init-file') a.shift()
      else if (!o.startsWith('--') && o.includes('c')) c = true
    }
    if (c) return a.length ? line(a[0] ?? '') : null
    if (a.length) return null // a script file: its text is not on the line
    for (const body of stdin) {
      const g = line(body)
      if (g) return g
    }
    return null
  }
  if (p === 'git') return git(a)
  if (p === 'gh') return gh(a)
  if (p === 'rm') {
    const f = flags(a)
    return f.short.has('r') || f.short.has('R') || f.long.has('recursive') ? gate('rm') : null
  }
  if (p === 'find') return find(a, depth)
  if (p === 'npm' || p === 'pnpm' || p === 'yarn') {
    const rest = dropOptions(a, ['--prefix', '-C', '--dir', '-w', '--workspace', '--filter', '-F', '--registry', '--tag', '--otp', '--access', '--cwd'])
    return rest[0] === 'publish' || (rest[0] === 'npm' && rest[1] === 'publish') ? gate('release') : null
  }
  if (p === 'cargo') {
    const rest = dropOptions(a.filter((w, k) => !(k === 0 && w.startsWith('+'))), ['-Z', '--config', '-C', '--color'])
    return rest[0] === 'publish' ? gate('release') : null
  }
  return null
}

function git(a) {
  dropOptions(a, ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env'])
  const sub = a.shift()
  const f = flags(a)
  const has = (s, l) => f.short.has(s) || f.long.has(l)
  switch (sub) {
    case 'push':
      return gate('push')
    case 'reset':
      return f.long.has('hard') ? gate('reset') : null
    case 'clean':
      return has('f', 'force') ? gate('reset') : null
    case 'checkout':
      return has('f', 'force') || f.after.length > 0 || f.pos.includes('.') ? gate('reset') : null
    case 'restore': {
      const staged = has('S', 'staged')
      const worktree = has('W', 'worktree')
      return (!staged || worktree) && (f.pos.length > 0 || f.after.length > 0 || f.long.has('pathspec-from-file')) ? gate('reset') : null
    }
    case 'branch':
      return f.short.has('D') || (has('d', 'delete') && has('f', 'force')) ? gate('reset') : null
    default:
      return null
  }
}

function gh(a) {
  const VALUE = ['-R', '--repo', '--hostname']
  const pos = []
  for (let k = 0; k < a.length && pos.length < 2; k++) {
    const w = a[k] ?? ''
    if (VALUE.includes(w)) k++
    else if (!w.startsWith('-')) {
      pos.push(w)
      if (w === 'api') return api(a.slice(k + 1))
    }
  }
  const [top, sub] = pos
  if (top === 'pr' && (sub === 'create' || sub === 'merge' || sub === 'close')) return gate('pr')
  if (top === 'release' && sub === 'create') return gate('release')
  return null
}

/** gh api: a method other than GET or HEAD writes; with no method, fields or an input file make gh send POST. */
function api(a) {
  const VALUE = ['-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '-p', '--preview', '--hostname', '-R', '--repo']
  let method = null
  let input = false
  const fields = []
  let endpoint = null
  for (let k = 0; k < a.length; k++) {
    const w = a[k] ?? ''
    const eq = w.indexOf('=')
    if (w === '-X' || w === '--method') method = a[++k] ?? ''
    else if (w.startsWith('--method=')) method = w.slice(9)
    else if (w.startsWith('-X')) method = w.slice(2)
    else if (w === '-f' || w === '-F' || w === '--field' || w === '--raw-field') fields.push(a[++k] ?? '')
    else if (w.startsWith('--field=') || w.startsWith('--raw-field=')) fields.push(w.slice(eq + 1))
    else if (/^-[fF]./.test(w)) fields.push(w.slice(2))
    else if (w === '--input') (input = true), k++
    else if (w.startsWith('--input=')) input = true
    else if (VALUE.includes(w)) k++
    else if (!w.startsWith('-') && endpoint === null) endpoint = w
  }
  if (method !== null) return /^(GET|HEAD)$/i.test(method) ? null : gate('api')
  if (!fields.length && !input) return null
  if (endpoint === 'graphql' && !input && fields.every((v) => !v.includes('@') && !/\bmutation\b/.test(v))) return null
  return gate('api')
}

/** find: -delete deletes; -exec/-execdir/-ok/-okdir run a command, judged as one, and rm through it deletes. */
function find(a, depth) {
  if (a.includes('-delete')) return gate('rm')
  for (let k = 0; k < a.length; k++) {
    if (!['-exec', '-execdir', '-ok', '-okdir'].includes(a[k] ?? '')) continue
    const inner = []
    for (k++; k < a.length && a[k] !== ';' && a[k] !== '+'; k++) inner.push(a[k] ?? '')
    const g = judge(inner, [], depth + 1)
    if (g) return g
    const p = base(unwrap(inner)[0] ?? '')
    if (p === 'rm' || p === 'unlink') return gate('rm')
  }
  return null
}

export const APPROVE = 'Approve'
export const REFUSE = 'Refuse'
export const alwaysLabel = (gate) => 'Approve every "' + gate.label + '" for this run'

export function commandQuestion({ who, command, gate, rulings = [] }) {
  const lines = ['baton: ' + who + ' wants to ' + gate.label + ':', '  ' + String(command).slice(0, 400)]
  if (rulings.length) lines.push('', 'Your rulings:', ...rulings.slice(0, 5).map((r) => '  ' + r))
  lines.push('', 'Type a reason instead to refuse with it.')
  return lines.join('\n')
}

/** 'approve' | 'always' | { refuse: reason } */
export function readCommandAnswer(answer, gate) {
  const a = String(answer ?? '').trim()
  if (a === APPROVE) return 'approve'
  if (gate && a === alwaysLabel(gate)) return 'always'
  if (!a || a === REFUSE) return { refuse: null }
  return { refuse: a }
}

export const SEND_BACK = 'Send back'

export function phaseQuestion(item, rulings = []) {
  const lines = ['baton: ' + item.label + ' reports:', '  ' + item.line, '', 'Approve it before the prime dispatches anything else?']
  if (rulings.length) lines.push('', 'Your rulings:', ...rulings.slice(0, 5).map((r) => '  ' + r))
  lines.push('', 'Type what is wrong instead to send it back with that reason.')
  return lines.join('\n')
}

/** 'approve' | { sendBack: reason } */
export function readPhaseAnswer(answer) {
  const a = String(answer ?? '').trim()
  if (a === APPROVE) return 'approve'
  if (!a || a === SEND_BACK) return { sendBack: null }
  return { sendBack: a }
}

/** Does a sub-orchestrator's return claim a finished phase? Its first verdict word decides (DONE, DONE+CONFIRMED, DONE-WITH-CAVEATS). */
export function claimsDone(line) {
  const m = /\b(DONE(?:\+CONFIRMED|-WITH-CAVEATS)?|PARTIAL|BLOCKED|REFUTED|FAILED|IDLE|UNSETTLEABLE)\b/.exec(String(line ?? ''))
  return !!m && m[1].startsWith('DONE')
}

// ------------------------------------------------------------------ approving from a blocked row's brief (T13, Q-37)

/**
 * What approving grants for a blocked node, per kind and never wider (Q-37): a command gate approves
 * that exact command once (`y`) or every command of its gate for the run (`w`, as /approve <gate>);
 * an `interpreted` block is overruled (`y`); a pause, an `explicit` block, a forbidden file or an
 * enforced ruling get no approve key, and `says` what must be done instead. `text` is everything the
 * envelope (or the agent's answer) says; `blockedBy` is parseBlockedBy of its line.
 */
export function blockGrant({ text = '', blockedBy = null, who = 'it', fallback = null }) {
  const t = String(text ?? '')
  if (/\bpaused\b/i.test(t)) return { kind: 'pause', keys: [], says: 'held by the pause: no approve key here. /baton resume lifts it, and ' + who + ' is re-dispatched after it.' }
  const file = /([^\s"'`]+)\s+matches a forbidden-file pattern/i.exec(t)
  if (file || /forbidden[- ]file/i.test(t)) return { kind: 'forbidden', keys: [], file: file ? file[1] : null, says: 'a forbidden file: no approve key. To fix it, ' + (file ? file[1] + ' must stay out of the commit' : 'the forbidden file must stay out of the commit') + ' (secrets, keys and env files are never committed): change the work so it does not need it.' }
  const ruling = /\bruling #(\d+)\b(?:\s*\(enforced\))?:?\s*([^"\n]*)/i.exec(t)
  if (ruling) return { kind: 'ruling', keys: [], ruling: Number(ruling[1]), says: 'an enforced ruling: no approve key. To fix it, retract or narrow ruling #' + ruling[1] + (ruling[2].trim() ? ' (' + ruling[2].trim() + ')' : '') + ' in Memory (2), or change the work so it keeps the ruling.' }
  for (const m of t.matchAll(/`([^`\n]+)`/g)) {
    const gate = gateFor(m[1])
    if (gate) return { kind: 'command', keys: ['y', 'w'], command: m[1].trim(), gate, says: 'held at the "' + gate.label + '" gate: y approves `' + m[1].trim() + '` once and ' + who + ' is re-dispatched with it · w approves every "' + gate.label + '" for this run (as /approve ' + gate.id + ').' }
  }
  if (blockedBy && blockedBy.kind === 'explicit') return { kind: 'explicit', keys: [], says: 'explicit: no approve key. A person has to fix the cause: ' + blockedBy.where + '.' }
  if (blockedBy && blockedBy.kind === 'interpreted') return { kind: 'interpreted', keys: ['y'], default: fallback, says: 'interpreted: y overrules it, and ' + who + ' is re-dispatched to proceed on ' + (fallback ? 'the default its question states: ' + fallback : 'the default it recommended') + '.' }
  return { kind: 'none', keys: [], says: 'no Blocked by: line to act on, so nothing to approve here; its envelope says what it needs.' }
}

/** The asked record (Q-42): written once, when a question is put to the operator. */
export function askedRecord({ at, via, gate = null }) {
  return 'asked_at: ' + at + '\nasked_via: ' + via + '\n' + (gate != null ? 'gate: G' + gate + '\n' : '')
}

/** A pane-written answer file (Q-41): the heading, rule 10's provenance lines, then the answer verbatim. */
export function answerRecord({ id, answer, at, session }) {
  return ['# ' + id + ' answer (binding, operator, ' + String(at).slice(0, 10) + ')', '', 'answered_by: operator', 'answered_via: pane', 'answered_at: ' + at, 'session: ' + (session || 'unknown'), '', '**Answer:** ' + answer, ''].join('\n')
}
