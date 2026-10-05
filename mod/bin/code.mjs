#!/usr/bin/env node
// baton code index CLI — the mod's code_* tools run this (node, no dependencies).
//
//   code.mjs [--root DIR] [--json] search <query> [--kind function|class|type|method|module|impl] [--limit N]
//   code.mjs [--root DIR] [--json] fetch <symbol | path | path:A-B> [--max N]
//   code.mjs [--root DIR] [--json] refs <symbol> [--limit N]
//   code.mjs [--root DIR] [--json] explore [dir]
//   code.mjs [--root DIR] [--json] index            refresh now (every query refreshes first anyway)
//   code.mjs [--root DIR] [--json] stats
//
// The index lives in <root>/.baton/code/index.json. Every command first
// re-stats the tracked files and re-parses only the ones whose mtime or size
// changed, so the index is never stale and never needs a manual update. Writes
// are atomic (temp file + rename), so concurrent agents never see a torn file.

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { extractSymbols, INDEX_VERSION, langOf, rank, SKIP_DIRS } from '../lib/codeidx.mjs'

const MAX_FILES = 25000
const MAX_BYTES = 1_000_000

function parseArgs(argv) {
  const flags = {}
  const rest = []
  const takes = new Set(['root', 'kind', 'limit', 'max'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      rest.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const k = a.slice(2)
      if (takes.has(k)) flags[k] = argv[++i]
      else flags[k] = true
    } else rest.push(a)
  }
  return { flags, cmd: rest[0], args: rest.slice(1) }
}

/** Tracked source files, relative to root: git when the root is a repo, else a walk. */
function listFiles(root) {
  const git = spawnSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  let files
  if (git.status === 0 && git.stdout.trim()) files = git.stdout.split('\n').filter(Boolean)
  else {
    files = []
    const walk = (dir) => {
      let ents = []
      try {
        ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true })
      } catch {
        return
      }
      for (const e of ents) {
        if (files.length >= MAX_FILES) return
        const rel = dir ? dir + '/' + e.name : e.name
        if (e.isDirectory()) {
          if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(rel)
        } else files.push(rel)
      }
    }
    walk('')
  }
  return files.filter((f) => langOf(f) && !f.split('/').some((p) => SKIP_DIRS.has(p))).slice(0, MAX_FILES)
}

function indexPath(root) {
  return path.join(root, '.baton', 'code', 'index.json')
}

function load(root) {
  try {
    const idx = JSON.parse(fs.readFileSync(indexPath(root), 'utf8'))
    if (idx.version === INDEX_VERSION) return idx
  } catch {}
  return { version: INDEX_VERSION, files: {} }
}

function save(root, idx) {
  const p = indexPath(root)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  // The index is a cache: keep it out of every git status without touching the repo's .gitignore.
  const gi = path.join(path.dirname(p), '.gitignore')
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, '*\n')
  const tmp = p + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(idx))
  fs.renameSync(tmp, p)
}

/** Re-stat every tracked file; re-parse the changed ones; drop the gone ones. */
function refresh(root) {
  const idx = load(root)
  const files = listFiles(root)
  const seen = new Set()
  let parsed = 0
  for (const f of files) {
    seen.add(f)
    let st
    try {
      st = fs.statSync(path.join(root, f))
    } catch {
      continue
    }
    if (!st.isFile() || st.size > MAX_BYTES) continue
    const cur = idx.files[f]
    if (cur && cur.mtime === st.mtimeMs && cur.size === st.size) continue
    let text = ''
    try {
      text = fs.readFileSync(path.join(root, f), 'utf8')
    } catch {
      continue
    }
    idx.files[f] = { mtime: st.mtimeMs, size: st.size, lines: text.split('\n').length, lang: langOf(f), symbols: extractSymbols(text, langOf(f)) }
    parsed++
  }
  let dropped = 0
  for (const f of Object.keys(idx.files)) if (!seen.has(f)) (delete idx.files[f], dropped++)
  if (parsed || dropped || !idx.builtAt) {
    idx.builtAt = new Date().toISOString()
    save(root, idx)
  }
  return { idx, parsed, dropped }
}

function entries(idx) {
  const out = []
  for (const [file, rec] of Object.entries(idx.files)) for (const s of rec.symbols) out.push({ ...s, file })
  return out
}

function readLines(root, file, a, b) {
  const text = fs.readFileSync(path.join(root, file), 'utf8').split('\n')
  return text.slice(a - 1, b).map((l, i) => String(a + i).padStart(5) + '  ' + l)
}

function hasRg() {
  return spawnSync('rg', ['--version'], { encoding: 'utf8' }).status === 0
}

function main() {
  const { flags, cmd, args } = parseArgs(process.argv.slice(2))
  const root = path.resolve(flags.root || process.cwd())
  const out = (obj, text) => process.stdout.write((flags.json ? JSON.stringify(obj) : text) + '\n')
  const { idx, parsed } = refresh(root)
  const all = entries(idx)
  switch (cmd) {
    case 'index':
    case 'stats': {
      const langs = {}
      for (const r of Object.values(idx.files)) langs[r.lang] = (langs[r.lang] || 0) + 1
      const s = { root, files: Object.keys(idx.files).length, symbols: all.length, parsed, builtAt: idx.builtAt, langs }
      return out(s, `code index ${root}: ${s.files} files, ${s.symbols} symbols (${parsed} re-parsed) · ` + Object.entries(langs).map(([k, v]) => k + ' ' + v).join(', '))
    }
    case 'search': {
      const q = args.join(' ')
      const hits = rank(all, q, { kind: flags.kind || null, limit: Number(flags.limit) || 20 })
      return out(hits, hits.length ? hits.map((h) => `${h.file}:${h.line}-${h.end}  ${h.kind} ${h.name}`).join('\n') + `\n(${hits.length} of ${all.length} symbols; code_fetch <name> or <file:A-B> for the source)` : `no symbol matches "${q}" (${all.length} indexed); try code_refs for text, or a shorter query`)
    }
    case 'fetch': {
      const target = args.join(' ').trim()
      const max = Number(flags.max) || 400
      const range = /^(.+?):(\d+)(?:-(\d+))?$/.exec(target)
      if (range && idx.files[range[1]]) {
        const a = Number(range[2])
        const b = Math.min(Number(range[3] || range[2]), a + max - 1)
        return out({ file: range[1], a, b, lines: readLines(root, range[1], a, b) }, `${range[1]}:${a}-${b}\n` + readLines(root, range[1], a, b).join('\n'))
      }
      if (idx.files[target]) {
        const rec = idx.files[target]
        const outline = rec.symbols.map((s) => `  ${s.line}-${s.end}  ${s.kind} ${s.name}`)
        return out({ file: target, lines: rec.lines, symbols: rec.symbols }, `${target}: ${rec.lines} lines, ${rec.symbols.length} symbols — fetch one by name or by ${target}:A-B\n` + outline.join('\n'))
      }
      const exact = all.filter((e) => e.name.toLowerCase() === target.toLowerCase())
      const hits = exact.length ? exact : rank(all, target, { limit: 5 })
      if (!hits.length) return out([], `no symbol "${target}"; code_search finds near names, code_refs finds text`)
      const shown = []
      let budget = max
      for (const h of hits.slice(0, 5)) {
        if (budget <= 0) break
        const b = Math.min(h.end, h.line + budget - 1)
        shown.push(`${h.file}:${h.line}-${h.end}  ${h.kind} ${h.name}` + (b < h.end ? ` (first ${b - h.line + 1} lines)` : '') + '\n' + readLines(root, h.file, h.line, b).join('\n'))
        budget -= b - h.line + 1
      }
      const more = hits.length > shown.length ? `\n(${hits.length - shown.length} more match${hits.length - shown.length === 1 ? '' : 'es'}; name the file: code_fetch <file:A-B>)` : ''
      return out(hits, shown.join('\n\n') + more)
    }
    case 'refs': {
      const name = args.join(' ').trim()
      const limit = Number(flags.limit) || 200
      const defs = new Set(all.filter((e) => e.name === name).map((e) => e.file + ':' + e.line))
      let rows = []
      if (hasRg()) {
        const r = spawnSync('rg', ['-n', '-w', '--no-heading', '--color', 'never', '-F', '--', name, '.'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        rows = r.stdout.split('\n').filter(Boolean).map((l) => l.replace(/^\.\//, ''))
      } else {
        const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')
        for (const f of Object.keys(idx.files)) {
          const text = fs.readFileSync(path.join(root, f), 'utf8').split('\n')
          text.forEach((l, i) => re.test(l) && rows.push(`${f}:${i + 1}:${l}`))
        }
      }
      const total = rows.length
      rows = rows.slice(0, limit).map((r) => {
        const m = /^([^:]+):(\d+):(.*)$/.exec(r)
        return m ? (defs.has(m[1] + ':' + m[2]) ? '* ' : '  ') + m[1] + ':' + m[2] + '  ' + m[3].trim().slice(0, 200) : r
      })
      return out({ total, rows }, total ? rows.join('\n') + `\n(${total} reference${total === 1 ? '' : 's'}${total > limit ? ', first ' + limit + ' shown' : ''}; * marks a definition)` : `no reference to "${name}"`)
    }
    case 'explore': {
      const dir = (args[0] || '').replace(/^\.\/?/, '').replace(/\/$/, '')
      const under = Object.entries(idx.files).filter(([f]) => !dir || f === dir || f.startsWith(dir + '/'))
      const depth = dir ? dir.split('/').length : 0
      const subdirs = {}
      const here = []
      for (const [f, rec] of under) {
        const parts = f.split('/')
        if (parts.length > depth + 1) {
          const d = parts.slice(0, depth + 1).join('/')
          const s = (subdirs[d] ??= { files: 0, symbols: 0, lines: 0 })
          s.files++
          s.symbols += rec.symbols.length
          s.lines += rec.lines
        } else here.push([f, rec])
      }
      const lines = [`${dir || '.'}: ${under.length} source files`]
      for (const [d, s] of Object.entries(subdirs).sort()) lines.push(`  ${d}/  ${s.files} files · ${s.symbols} symbols · ${s.lines} lines`)
      for (const [f, rec] of here.sort()) lines.push(`  ${f}  ${rec.lines} lines · ` + rec.symbols.slice(0, 8).map((s) => s.name).join(', ') + (rec.symbols.length > 8 ? ', …' : ''))
      return out({ dir, subdirs, files: here.map(([f, r]) => ({ file: f, lines: r.lines, symbols: r.symbols.map((s) => s.name) })) }, lines.slice(0, 160).join('\n'))
    }
    default:
      process.stderr.write('code: unknown command "' + cmd + '" (search, fetch, refs, explore, index, stats)\n')
      process.exitCode = 2
  }
}

main()
