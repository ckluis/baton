// baton v7 code index: symbols out of source text. Pure, no I/O.
//
// The idea is codemunch's (github.com/benmarte/codemunch, MIT): index the code
// once, then fetch the twenty lines of one symbol instead of reading an
// 800-line file. The code here is baton's own, and the mod makes it zero-config:
// the index is built in the background when a session starts, refreshed before
// every query and after every edit, and served as tools — no init, no update.
//
// Extraction is regular expressions per language plus an end-line rule (braces,
// indentation, or `end`). It is approximate by design: a missed symbol costs one
// Read, a wrong end line costs a few lines. Nothing here executes the code.

export const INDEX_VERSION = 1

const LANGS = {
  ts: 'js', tsx: 'js', js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', vue: 'js', svelte: 'js',
  py: 'py', go: 'go', rs: 'rs', rb: 'rb', ex: 'ex', exs: 'ex',
  java: 'c', kt: 'c', kts: 'c', cs: 'c', swift: 'c', scala: 'c', c: 'c', h: 'c', cc: 'c', cpp: 'c', hpp: 'c', php: 'c', dart: 'c', zig: 'c',
  sh: 'sh', bash: 'sh', lua: 'lua',
}

export function langOf(path) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(path ?? ''))
  return m ? LANGS[m[1].toLowerCase()] || null : null
}

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'else', 'do', 'try', 'with', 'new', 'typeof', 'await', 'yield', 'super', 'constructor'])

// [regex, kind, name group]
const RULES = {
  js: [
    [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'function', 1],
    [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, 'class', 1],
    [/^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, 'type', 1],
    [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/, 'function', 1],
    [/^\s+(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|override\s+|async\s+|get\s+|set\s+)*\*?([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]+)?\{\s*$/, 'method', 1],
  ],
  py: [
    [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, 'function', 1],
    [/^\s*class\s+([A-Za-z_]\w*)/, 'class', 1],
  ],
  go: [
    [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, 'function', 1],
    [/^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/, 'type', 1],
  ],
  rs: [
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)/, 'function', 1],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\s+([A-Za-z_]\w*)/, 'type', 1],
    [/^\s*impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?([A-Za-z_]\w*)/, 'impl', 1],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*\{/, 'module', 1],
  ],
  rb: [
    [/^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/, 'function', 1],
    [/^\s*class\s+([A-Z]\w*(?:::\w+)*)/, 'class', 1],
    [/^\s*module\s+([A-Z]\w*(?:::\w+)*)/, 'module', 1],
  ],
  ex: [
    [/^\s*defmodule\s+([A-Z][\w.]*)/, 'module', 1],
    [/^\s*(?:def|defp|defmacro|defmacrop|defguard|defdelegate)\s+([a-z_]\w*[?!]?)/, 'function', 1],
  ],
  c: [
    [/^\s*(?:(?:public|private|protected|internal|static|final|abstract|sealed|open|data|export|inline|virtual|override|async|suspend)\s+)*(?:class|interface|struct|enum|record|object|protocol|trait)\s+([A-Za-z_]\w*)/, 'type', 1],
    [/^\s*(?:(?:public|private|protected|internal|static|final|abstract|override|open|virtual|inline|async|suspend|func|fun|fn|def)\s+)+(?:[\w<>\[\],.?*&\s]+\s+)?([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(/, 'function', 1],
    [/^(?:[A-Za-z_][\w<>:*&\s]*\s+)+\**([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$/, 'function', 1],
  ],
  sh: [
    [/^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/, 'function', 1],
    [/^\s*function\s+([A-Za-z_][\w-]*)/, 'function', 1],
  ],
  lua: [[/^\s*(?:local\s+)?function\s+([\w.:]+)/, 'function', 1]],
}

/** Strip string and comment contents from one line so braces inside them do not count. */
function codeOnly(line, lang) {
  let s = line.replace(/\\./g, '__')
  s = s.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
  if (lang === 'py' || lang === 'rb' || lang === 'ex' || lang === 'sh') s = s.replace(/#.*$/, '')
  else s = s.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
  return s
}

const indentOf = (l) => /^\s*/.exec(l)[0].replace(/\t/g, '    ').length

/** The last line (0-based) of the block that starts at `start`. */
export function endLine(lines, start, lang) {
  const n = lines.length
  if (lang === 'py') {
    const base = indentOf(lines[start])
    let last = start
    for (let i = start + 1; i < n; i++) {
      const t = lines[i]
      if (!t.trim()) continue
      if (indentOf(t) <= base && !/^\s*[)\]}]/.test(t)) break
      last = i
    }
    return last
  }
  if (lang === 'rb' || lang === 'ex' || lang === 'lua') {
    const base = indentOf(lines[start])
    if (lang === 'ex' && /,\s*do:/.test(lines[start])) return start
    for (let i = start + 1; i < n; i++) {
      const t = lines[i]
      if (/^\s*end\b/.test(t) && indentOf(t) <= base) return i
    }
    return Math.min(n - 1, start + 40)
  }
  // Brace languages: from the first `{` at or after the start, until it balances.
  let depth = 0
  let opened = false
  for (let i = start; i < n && i < start + 3000; i++) {
    const c = codeOnly(lines[i], lang)
    for (const ch of c) {
      if (ch === '{') {
        depth++
        opened = true
      } else if (ch === '}') depth--
    }
    if (opened && depth <= 0) return i
    // A one-line declaration with no block (an arrow with an expression body, a type alias):
    // it ends here unless the line plainly continues.
    if (!opened && i === start && !/[{(\[=,>:]\s*$/.test(c.trimEnd())) return start
    if (!opened && i > start + 4) break // a declaration with no body (a type alias, a prototype)
    if (!opened && /;\s*$/.test(c)) return i
  }
  return opened ? Math.min(n - 1, start + 3000) : start
}

/** Symbols in one file: [{ name, kind, line, end }] with 1-based inclusive lines. */
export function extractSymbols(text, lang) {
  const rules = RULES[lang]
  if (!rules) return []
  const lines = String(text ?? '').split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.length > 400) continue
    for (const [re, kind, g] of rules) {
      const m = re.exec(l)
      if (!m) continue
      const name = m[g]
      if (!name || KEYWORDS.has(name)) continue
      out.push({ name, kind, line: i + 1, end: endLine(lines, i, lang) + 1 })
      break
    }
  }
  return out
}

/**
 * Rank symbols for a query: exact name, then prefix, then substring, then a
 * subsequence match; a path segment match adds a little. Case-insensitive.
 * `entries` are { name, kind, line, end, file }.
 */
export function rank(entries, query, { kind = null, limit = 20 } = {}) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return []
  const sub = (a, b) => {
    let j = 0
    for (const ch of a) if (ch === b[j]) j++
    return j === b.length
  }
  const scored = []
  for (const e of entries) {
    if (kind && e.kind !== kind) continue
    const n = e.name.toLowerCase()
    let s = n === q ? 100 : n.startsWith(q) ? 70 : n.includes(q) ? 50 : sub(n, q) && q.length >= 3 ? 20 : 0
    if (!s && String(e.file).toLowerCase().includes(q)) s = 10
    if (!s) continue
    if (String(e.file).toLowerCase().includes(q)) s += 5
    s -= Math.min(10, (e.end - e.line) / 200) // a little preference for smaller blocks at equal match
    scored.push([s, e])
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].file.localeCompare(b[1].file) || a[1].line - b[1].line).slice(0, limit).map((x) => x[1])
}

/** Paths an index never descends into. */
export const SKIP_DIRS = new Set(['.git', 'node_modules', '_orch', '.baton', 'dist', 'build', 'target', 'vendor', '.next', '.venv', 'venv', '__pycache__', 'deps', '_build', '.elixir_ls', 'coverage', '.cache'])

/** Rough token cost of n lines of code (for the "a fetch would have cost" note). */
export const tokensForLines = (n) => Math.round(n * 10)
