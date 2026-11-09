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
 * <( ), sh -c strings, eval, and heredocs or here-strings fed to a shell), with ANSI-C quoting
 * decoded and braces expanded; each is stripped of assignments, shell keywords, the wrappers in
 * WRAPPERS (plus env and command) with their option tables, and the program's global options
 * (git's own list, -c aliases followed; gh -R/--repo/--hostname), then judged by subcommand and
 * flag set: flags split, combined, long, abbreviated to a unique prefix, or after the operand
 * (gh's read as pflag reads clusters, before `api` too); program names in any case, and git's
 * own subcommand programs (git-push ...) as git. A program it does not know is read as a possible wrapper of a
 * judged one named later in its words. What the shell does not run is read as v7.7 read it (see
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
  let hereString = false // the next word is a here-string: the command's stdin, like a heredoc body
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
    if (hereString) {
      hereString = false
      stdin.push(braces(word).join(' '))
    } else if (dropNext) dropNext = false
    else argv.push(...braces(word))
    word = null
  }
  const endCmd = (at) => {
    endWord()
    if (argv.length) out.cmds.push({ argv, raw: src.slice(start, at), stdin })
    argv = []
    stdin = []
    start = -1
    dropNext = false
    hereString = false
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
    } else if (ch === '$' && src[i + 1] === "'") {
      // ANSI-C quoting: $'\x67it' is the word git.
      const j = ansiEnd(src, i + 2)
      const text = src.slice(i + 2, j)
      add(ansiC(text), i)
      out.texts.push(text)
      i = j + 1
    } else if (ch === '$' && src[i + 1] === '"') {
      // Locale quoting: $"git" is "git".
      if (start < 0) start = i
      i++
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
        hereString = true
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
      // Unquoted braces and commas are marked for brace expansion (not `${`).
      const mark = ch === '{' ? (word !== null && word.endsWith('$') ? ch : BRACE_OPEN) : ch === ',' ? BRACE_COMMA : ch === '}' ? BRACE_CLOSE : ch
      add(mark, i)
      i++
    }
  }
  endCmd(n)
  return out
}

const BRACE_OPEN = '\u0001'
const BRACE_COMMA = '\u0002'
const BRACE_CLOSE = '\u0003'
const MAX_BRACE_WORDS = 256
const MAX_BRACE_WORD = 4096

/** Brace expansion of one word with marked braces: {git,-C,r,push} is four words. Marks left over are the literal characters. */
function braces(w) {
  const unmark = (s) => s.replace(/\u0001/g, '{').replace(/\u0002/g, ',').replace(/\u0003/g, '}')
  if (!w.includes(BRACE_OPEN) || w.length > MAX_BRACE_WORD) return [unmark(w)]
  const out = []
  const go = (s) => {
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== BRACE_OPEN) continue
      let d = 0
      let j = i
      const commas = []
      for (; j < s.length; j++) {
        if (s[j] === BRACE_OPEN) d++
        else if (s[j] === BRACE_CLOSE && --d === 0) break
        else if (s[j] === BRACE_COMMA && d === 1) commas.push(j)
      }
      if (j >= s.length || !commas.length) continue
      let from = i + 1
      for (const c of [...commas, j]) {
        if (out.length >= MAX_BRACE_WORDS) return
        go(s.slice(0, i) + s.slice(from, c) + s.slice(j + 1))
        from = c + 1
      }
      return
    }
    out.push(unmark(s))
  }
  go(w)
  return out
}

/** The index of the `'` closing an ANSI-C string that starts at `i` (backslash escapes apply); src.length if none. */
function ansiEnd(src, i) {
  for (; i < src.length; i++) {
    if (src[i] === '\\') i++
    else if (src[i] === "'") return i
  }
  return src.length
}

/** The text of an ANSI-C quoted string, escapes decoded as bash decodes them. */
function ansiC(s) {
  const SIMPLE = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' }
  return s.replace(/\\(?:([0-7]{1,3})|x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8})|c(.)|(.))/gs, (m, oct, hex, u4, u8, ctl, one) => {
    if (oct) return String.fromCharCode(parseInt(oct, 8) & 0xff)
    if (hex) return String.fromCharCode(parseInt(hex, 16))
    if (u4 || u8) {
      const cp = parseInt(u4 || u8, 16)
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
    }
    if (ctl) return String.fromCharCode(ctl.charCodeAt(0) & 0x1f)
    return SIMPLE[one] ?? m
  })
}

// ------------------------------------------------------------------ judging one simple command

/** Shell words that may lead a command, as written. */
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', 'select', 'case', 'esac', '!', '{', '}', '[[', 'coproc', 'noglob', 'nocorrect'])
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish'])
/** Programs the tokenizer judges; any other program's words are read as a mention. */
const JUDGED = new Set(['git', 'gh', 'rm', 'find', 'npm', 'pnpm', 'yarn', 'cargo'])
/** Programs that print or look up their words rather than run them: their words stay mentions (v7.7). */
const PRINTERS = new Set(['echo', 'printf', 'print', 'man', 'tldr', 'help', 'info', 'whatis', 'apropos', 'which', 'type', 'whence', 'where', 'alias'])

/**
 * Wrappers: programs that run the rest of their words as a command, by name (a full path and
 * any case count). `short` holds the option letters that take a value (attached, or the next word
 * when the letter ends its cluster, as getopt reads `-iu bob`); `long` the long options that take
 * the next word when written without `=` (any unique prefix counts, as getopt_long accepts);
 * `words` single-dash option words that take the next word (arch, xcrun read whole words);
 * `then` the operands before the command (timeout's duration). env and command are read apart.
 */
const WRAPPERS = {
  builtin: {},
  nohup: {},
  chronic: {},
  unbuffer: {},
  setsid: {},
  exec: { short: 'a' },
  time: { short: 'fo', long: ['format', 'output'] },
  nice: { short: 'n', long: ['adjustment'] },
  ionice: { short: 'cnpPu', long: ['class', 'classdata', 'pid', 'pgid', 'uid'] },
  stdbuf: { short: 'ioe', long: ['input', 'output', 'error'] },
  caffeinate: { short: 'wt' },
  sudo: { short: 'aCcDgpRrTtUu', long: ['user', 'group', 'host', 'prompt', 'chdir', 'close-from', 'role', 'type', 'command-timeout', 'other-user', 'login-class', 'chroot', 'auth-type'] },
  doas: { short: 'aCu' },
  timeout: { short: 'sk', long: ['signal', 'kill-after'], then: 1 },
  gtimeout: { short: 'sk', long: ['signal', 'kill-after'], then: 1 },
  xargs: { short: 'adEIJLnPRSs', long: ['arg-file', 'delimiter', 'max-args', 'max-procs', 'max-chars', 'process-slot-var'] },
  xcrun: { words: ['-sdk', '--sdk', '-toolchain', '--toolchain'] },
  arch: { words: ['-arch', '-d', '-e'] },
}

/** A program word's name: no directory, lower case (a case-insensitive filesystem runs GIT as git). */
const base = (w) => w.replace(/^.*\//, '').toLowerCase()

/** Drop leading options from `a` as `spec` (a WRAPPERS entry) reads them. Stops at `--` (dropped) or the first operand. */
function dropOpts(a, spec = {}) {
  const short = spec.short ?? ''
  const long = spec.long ?? []
  let i = 0
  while (i < a.length && /^-./.test(a[i] ?? '')) {
    const w = a[i++] ?? ''
    if (w === '--') break
    if (spec.words) {
      if (spec.words.includes(w)) i++
    } else if (w.startsWith('--')) {
      const name = w.slice(2)
      if (!name.includes('=') && long.some((l) => l.startsWith(name))) i++
    } else {
      for (let k = 1; k < w.length; k++) {
        if (!short.includes(w[k] ?? '')) continue
        if (k === w.length - 1) i++
        break
      }
    }
  }
  a.splice(0, i)
  return a
}

/** Strip assignments, keywords and wrappers off the front of argv: what program actually runs, with its words. */
function unwrap(argv) {
  const a = argv.slice()
  for (;;) {
    const w = a[0]
    if (w === undefined) return a
    const p = base(w)
    if (KEYWORDS.has(w) || ASSIGN.test(w)) a.shift()
    else if (p === 'env') {
      a.shift()
      const split = env(a)
      if (split) return split
    } else if (p === 'command') {
      a.shift()
      if (a[0] === '-v' || a[0] === '-V') return []
      dropOpts(a)
    } else if (Object.hasOwn(WRAPPERS, p)) {
      a.shift()
      const spec = WRAPPERS[/** @type {keyof typeof WRAPPERS} */ (p)]
      dropOpts(a, spec)
      for (let k = 0; k < ('then' in spec ? spec.then : 0); k++) a.shift()
    } else return a
  }
}

/** env's options and assignments, dropped from `a`; with -S/--split-string, the command that string runs. */
function env(a) {
  while (a.length && (/^-/.test(a[0] ?? '') || ASSIGN.test(a[0] ?? ''))) {
    const o = a.shift() ?? ''
    if (o === '--') break
    if (ASSIGN.test(o) || o === '-') continue
    if (o.startsWith('--')) {
      const eq = o.indexOf('=')
      const name = o.slice(2, eq < 0 ? undefined : eq)
      if ('split-string'.startsWith(name)) return [...splitWords(eq < 0 ? a.shift() ?? '' : o.slice(eq + 1)), ...a]
      if (eq < 0 && ['unset', 'chdir'].some((l) => l.startsWith(name))) a.shift()
      continue
    }
    for (let k = 1; k < o.length; k++) {
      const ch = o[k] ?? ''
      if (ch === 'S') return [...splitWords(o.slice(k + 1) || (a.shift() ?? '')), ...a]
      if (!'uCP'.includes(ch)) continue
      if (k === o.length - 1) a.shift()
      break
    }
  }
  return null
}

/** A string the shell will run (sh -c, eval, env -S), split as a command line of its own. */
function splitWords(s) {
  const { cmds } = lex(s, 1)
  return cmds[0]?.argv ?? []
}

/**
 * Flags of a program's words: short letters from clusters, long names (no =value), operands, and
 * what follows `--`. `valued` names the short letters that take a value: the rest of the cluster,
 * or the next word when the letter ends it (`-bfix` is -b fix, not -f). `long(name)` is true when a
 * long flag is `name` or a prefix of it, as git and getopt_long accept `--har` for `--hard`.
 */
function flags(words, valued = '') {
  const short = new Set()
  const longs = new Set()
  const pos = []
  const after = []
  let dd = false
  let skip = false
  for (const w of words) {
    if (skip) skip = false
    else if (dd) after.push(w)
    else if (w === '--') dd = true
    else if (w.startsWith('--')) longs.add(w.slice(2).replace(/=.*$/, ''))
    else if (/^-[A-Za-z]/.test(w)) {
      for (let k = 1; k < w.length; k++) {
        const ch = w[k] ?? ''
        short.add(ch)
        if (!valued.includes(ch)) continue
        skip = k === w.length - 1
        break
      }
    } else pos.push(w)
  }
  const long = (name, min = 1) => [...longs].some((l) => l.length >= min && name.startsWith(l))
  const has = (s, name, min = 1) => short.has(s) || long(name, min)
  return { short, long, has, pos, after, dd }
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
  // A string the shell runs (eval, sh -c, a ! alias) is read as gateFor reads a line: its
  // commands judged, and the words of a program not judged read as mentions (v7.7).
  const line = (s) => {
    const { cmds } = lex(s, depth + 1)
    for (const cmd of cmds) {
      const g = judge(cmd.argv, cmd.stdin, depth + 1)
      if (g) return g
    }
    for (const cmd of cmds) {
      const g = judges(cmd.argv) ? null : mentioned(cmd.raw)
      if (g) return g
    }
    return null
  }
  if (p === 'eval') return line(a.join(' '))
  if (SHELLS.has(p)) {
    for (const body of shellRuns(a, stdin)) {
      const g = line(body)
      if (g) return g
    }
    return null
  }
  if (p === 'git') return git(a, depth, line)
  // git runs its subcommands as programs in its exec path (libexec/git-core): git-push is git push.
  if (p.startsWith('git-') && GIT_JUDGED.has(p.slice(4))) return git([p.slice(4), ...a], depth, line)
  if (p === 'gh') return gh(a)
  if (p === 'rm') {
    const f = flags(a)
    return f.has('r', 'recursive') || f.short.has('R') ? gate('rm') : null
  }
  if (p === 'find') return find(a, depth)
  if (p === 'npm' || p === 'pnpm' || p === 'yarn') return pkg(p, a)
  if (p === 'cargo') {
    const rest = dropOpts(
      a.filter((w, k) => !(k === 0 && w.startsWith('+'))),
      { short: 'ZC', long: ['config', 'color'] },
    )
    return rest[0] === 'publish' ? gate('release') : null
  }
  if (!p || PRINTERS.has(p)) return null
  return unlisted(argv, depth)
}

/**
 * The command lines a shell runs, given its words after the program name (`a`, options consumed)
 * and the heredoc bodies fed to it. Options in any clusters: each o/O takes the next word
 * (`-euo pipefail`), c anywhere means the first operand is the command string, s means the
 * commands come on stdin. A script file's text is not on the line: none.
 */
function shellRuns(a, stdin) {
  let c = false
  let s = false
  while (a.length && /^[-+]/.test(a[0] ?? '')) {
    const o = a.shift() ?? ''
    if (o === '--' || o === '-') break
    if (o.startsWith('--')) {
      if (o === '--rcfile' || o === '--init-file') a.shift()
      continue
    }
    for (const ch of o.slice(1)) {
      if (ch === 'o' || ch === 'O') a.shift()
      else if (ch === 'c') c = true
      else if (ch === 's') s = true
    }
  }
  if (c) return a.length ? [a[0] ?? ''] : []
  if (a.length && !s) return []
  return stdin
}

/**
 * The simple commands a line runs, read by the same shell reader as gateFor: each is the words of
 * the program that actually runs (assignments, keywords and wrappers stripped), with `pre` the words
 * stripped off its front (keywords, assignments, wrappers and their options: `env -C d`, `xargs`),
 * `assigns` the assignments among them, `shell` true when a child shell runs it, and `from` the
 * program whose words it was found in. A string a shell runs (sh -c, eval, a shell fed a heredoc or
 * here-string) is read as a line in turn; a program not known whose words name git (flock, ssh,
 * find -exec ...) also yields the command from that word on. A command of assignments alone is
 * listed with empty argv. Throws on a line too deep to take apart.
 */
export function commandsOf(command) {
  const out = []
  const one = (argv, stdin, depth, shell, from, carry = []) => {
    if (depth > MAX_DEPTH) throw new Error('too deep')
    const a = unwrap(argv)
    const k0 = argv.length - a.length
    // env -S splits a string into new words: read them again, with what was stripped so far.
    if (k0 < 0 || a.some((w, k) => w !== argv[k0 + k])) return one(a, stdin, depth + 1, shell, from, [...carry, ...argv])
    const pre = [...carry, ...argv.slice(0, k0)]
    const assigns = pre.filter((w) => ASSIGN.test(w))
    const p = base(a[0] ?? '')
    if (!p) {
      if (assigns.length) out.push({ argv: [], assigns, pre, shell, from })
      return
    }
    if (p === 'eval') return lines(a.slice(1).join(' '), depth + 1, shell, from)
    if (SHELLS.has(p)) {
      for (const body of shellRuns(a.slice(1), stdin)) lines(body, depth + 1, true, from)
      return
    }
    out.push({ argv: a, assigns, pre, shell, from })
    if (p === 'git' || PRINTERS.has(p)) return
    let tries = 0
    for (let k = 1; k < a.length && tries < 8; k++) {
      if (base(a[k] ?? '') !== 'git') continue
      tries++
      one(a.slice(k), [], depth + 1, shell, p)
    }
  }
  const lines = (s, depth, shell = false, from = null) => {
    for (const cmd of lex(s, depth).cmds) one(cmd.argv, cmd.stdin, depth, shell, from)
  }
  lines(String(command ?? ''), 0)
  return out
}

/** The base name of a program word, as the tokenizer reads it (no directory, lower case). */
export const programOf = (w) => base(String(w ?? ''))

/**
 * A program the tokenizer does not know: if one of its words names a judged program (or a
 * shell, or eval), it may be a wrapper (flock, taskset, chrt, ssh ...), so the command from that
 * word on is judged too. The first few such words are tried.
 */
function unlisted(argv, depth) {
  let tries = 0
  for (let k = 1; k < argv.length && tries < 8; k++) {
    const q = base(argv[k] ?? '')
    if (!JUDGED.has(q) && !SHELLS.has(q) && q !== 'eval') continue
    tries++
    const g = judge(argv.slice(k), [], depth + 1)
    if (g) return g
  }
  return null
}

/** npm, pnpm, yarn: publish, after options in any order; npm also takes any unique prefix of a command (`npm pu`). */
function pkg(p, a) {
  const VALUE = ['--prefix', '-C', '--dir', '-w', '--workspace', '--filter', '-F', '--registry', '--tag', '--otp', '--access', '--cwd']
  const skip = (k) => {
    for (; k < a.length && /^-/.test(a[k] ?? ''); k++) {
      if (a[k] === '--') return k + 1
      if (VALUE.includes(a[k] ?? '')) k++
    }
    return k
  }
  const isPublish = (k) => {
    const w = a[k] ?? ''
    if (w === 'publish' || (p === 'npm' && w.length >= 2 && 'publish'.startsWith(w))) return true
    return p === 'yarn' && w === 'npm' && a[k + 1] === 'publish'
  }
  // The subcommand is the first operand, unless that operand is the value of the option before
  // it (`--loglevel silly publish`): an option whose value is not known to be absent may take it.
  const k = skip(0)
  if (isPublish(k)) return gate('release')
  const prev = a[k - 1] ?? ''
  if (k > 0 && /^-./.test(prev) && prev !== '--' && !prev.includes('=') && !VALUE.includes(a[k - 2] ?? '') && isPublish(skip(k + 1))) return gate('release')
  return null
}

/** git's global options that take the next word (git.c handle_options); the others take none or only `=value`. */
export const GIT_VALUE = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--attr-source', '--shallow-file']
/** The git subcommands judged here; git runs these itself, so an alias of one of their names is ignored, as git ignores it. */
const GIT_JUDGED = new Set(['push', 'reset', 'clean', 'checkout', 'restore', 'branch', 'switch'])
/** Short options of a git subcommand that take a value (the rest of the cluster or the next word). */
const GIT_VALUED = { checkout: 'bB', switch: 'cC', clean: 'e', restore: 's', reset: '', branch: 'u' }

/** git: global options, then an alias defined on the line with `-c alias.x=...`, then the subcommand and its flags in any spelling. */
function git(a, depth, line, aliases = new Map()) {
  if (depth > MAX_DEPTH) return null
  while (a.length && /^-/.test(a[0] ?? '')) {
    const w = a.shift() ?? ''
    if (w === '--') break
    if (!GIT_VALUE.includes(w)) continue
    const v = a.shift() ?? ''
    const m = w === '-c' ? /^alias\.([^=]+)=([\s\S]*)$/i.exec(v) : null
    if (m) aliases.set((m[1] ?? '').toLowerCase(), m[2] ?? '')
  }
  const sub = a.shift()
  if (sub === undefined) return null
  const alias = GIT_JUDGED.has(sub) ? undefined : aliases.get(sub.toLowerCase())
  if (alias !== undefined) {
    if (alias.startsWith('!')) return line(alias.slice(1) + ' ' + a.join(' '))
    return git([...splitWords(alias), ...a], depth + 1, line, aliases)
  }
  const f = flags(a, GIT_VALUED[/** @type {keyof typeof GIT_VALUED} */ (sub)] ?? '')
  switch (sub) {
    case 'push':
      return gate('push')
    case 'reset':
      return f.long('hard') ? gate('reset') : null
    case 'clean':
      return f.has('f', 'force') ? gate('reset') : null
    case 'checkout':
      return f.has('f', 'force') || f.after.length > 0 || f.pos.includes('.') ? gate('reset') : null
    case 'switch':
      return f.has('f', 'force') || f.long('discard-changes') ? gate('reset') : null
    case 'restore': {
      const staged = f.has('S', 'staged', 2)
      const worktree = f.has('W', 'worktree')
      return (!staged || worktree) && (f.pos.length > 0 || f.after.length > 0 || f.long('pathspec-from-file', 10)) ? gate('reset') : null
    }
    case 'branch':
      return f.short.has('D') || (f.has('d', 'delete') && f.has('f', 'force')) ? gate('reset') : null
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
      // cobra hands the api command every flag on the line, those before `api` too (`gh -XPOST api ...`).
      if (w === 'api') return api([...a.slice(0, k), ...a.slice(k + 1)])
    }
  }
  const [top, sub] = pos
  // gh's aliases: `gh pr new` is gh pr create, `gh release new` is gh release create.
  if (top === 'pr' && (sub === 'create' || sub === 'new' || sub === 'merge' || sub === 'close')) return gate('pr')
  if (top === 'release' && (sub === 'create' || sub === 'new')) return gate('release')
  return null
}

/** gh api's short flags that take a value (-X/--method, -f/--raw-field, -F/--field, -H, -q, -t, -p). */
const API_VALUED = 'XfFHqtp'

/**
 * gh api: a method other than GET or HEAD writes; with no method, fields or an input file make gh
 * send POST. Short flags are read as gh's pflag reads them: in a cluster each letter is a flag
 * until one that takes a value, which takes the rest of the cluster (a leading `=` dropped:
 * `-X=POST`) or, when it ends the cluster, the next word (`-iXPOST`, `-iX POST`); `-i=...` gives -i
 * the rest. `-R` (not a gh api flag) is read as taking the next word, as before.
 */
function api(a) {
  const VALUE = ['-H', '--header', '-q', '--jq', '-t', '--template', '--cache', '-p', '--preview', '--hostname', '-R', '--repo']
  let method = null
  let input = false
  const fields = []
  let endpoint = null
  for (let k = 0; k < a.length; k++) {
    const w = a[k] ?? ''
    const eq = w.indexOf('=')
    if (w === '--method') method = a[++k] ?? ''
    else if (w.startsWith('--method=')) method = w.slice(9)
    else if (w === '--field' || w === '--raw-field') fields.push(a[++k] ?? '')
    else if (w.startsWith('--field=') || w.startsWith('--raw-field=')) fields.push(w.slice(eq + 1))
    else if (/^-[A-Za-z]/.test(w) && w !== '-R') {
      for (let j = 1; j < w.length; j++) {
        const ch = w[j] ?? ''
        if (!API_VALUED.includes(ch)) {
          if (w[j + 1] === '=') break
          continue
        }
        let v = w.slice(j + 1)
        if (v.length > 1 && v.startsWith('=')) v = v.slice(1)
        if (!v) v = a[++k] ?? ''
        if (ch === 'X') method = v
        else if (ch === 'f' || ch === 'F') fields.push(v)
        break
      }
    } else if (w === '--input') {
      input = true
      k++
    } else if (w.startsWith('--input=')) input = true
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
